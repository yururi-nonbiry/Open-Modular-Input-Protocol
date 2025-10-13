import sys
import json
import threading
import time
import serial
import serial.tools.list_ports
import io
import os
import base64
import queue
from typing import Optional
from pynput import keyboard
from PIL import Image
import binascii

import omip_pb2

CONFIG_FILE = "gui_config.json"
CHUNK_SIZE = 190
ACK_READY = b"\x06"
ACK_ERROR = b"\x15"
ACK_TIMEOUT_SEC = 2.0

class BackendService:
    def __init__(self):
        self.serial_connection = None
        self.stop_thread = False
        self.reader_thread = None
        self.serial_lock = threading.Lock()
        self.ack_queue: "queue.Queue[bytes]" = queue.Queue()
        self.keyboard = keyboard.Controller()
        self.page_configs = {str(p): [{'icon': None, 'action': ''} for _ in range(18)] for p in range(1, 6)}
        self.current_page = 1
        self.load_config()

    def send_response(self, data):
        try:
            message = json.dumps(data)
            print(message, flush=True)
        except TypeError as e:
            print(json.dumps({'error': f'Failed to serialize response: {e}'}), flush=True)

    def load_config(self):
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r') as f:
                    loaded_data = json.load(f)
                    self.page_configs = {k: v for k, v in loaded_data.items()}
        except Exception as e:
            self.send_response({'type': 'error', 'message': f'Error loading config: {e}'})

    def save_config(self):
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(self.page_configs, f, indent=4)
        except Exception as e:
            self.send_response({'type': 'error', 'message': f'Error saving config: {e}'})

    def _execute_action(self, action_string):
        if not action_string:
            return
        keys = action_string.lower().split('+')
        try:
            for key in keys:
                special_key = getattr(keyboard.Key, key, None)
                if special_key:
                    self.keyboard.press(special_key)
                else:
                    self.keyboard.press(key)
            for key in reversed(keys):
                special_key = getattr(keyboard.Key, key, None)
                if special_key:
                    self.keyboard.release(special_key)
                else:
                    self.keyboard.release(key)
        except Exception as e:
            self.send_response({'type': 'error', 'message': f'Failed to execute key combo: {e}'})

    def _serial_reader(self):
        while not self.stop_thread:
            try:
                if self.serial_connection and self.serial_connection.is_open:
                    first_byte = self.serial_connection.read(1)
                    if not first_byte:
                        continue
                    if first_byte in (ACK_READY, ACK_ERROR):
                        self.ack_queue.put(first_byte)
                        continue
                    if first_byte != b'~':
                        continue

                    length_byte = self.serial_connection.read(1)
                    if not length_byte:
                        continue
                    length = length_byte[0]
                    data = self.serial_connection.read(length)
                    if len(data) == length:
                        wrapper_msg = omip_pb2.WrapperMessage()
                        wrapper_msg.ParseFromString(data)
                        
                        if wrapper_msg.HasField("input_digital"):
                            port_id = wrapper_msg.input_digital.port_id
                            state = wrapper_msg.input_digital.state
                            self.send_response({
                                'type': 'device_event', 'event': 'input_digital',
                                'port_id': port_id, 'state': state
                            })
                            if state and 0 <= port_id < 18:
                                action = self.page_configs.get(str(self.current_page), [])[port_id].get('action')
                                self._execute_action(action)

                        elif wrapper_msg.HasField("input_analog"):
                            self.send_response({
                                'type': 'device_event', 'event': 'input_analog',
                                'port_id': wrapper_msg.input_analog.port_id,
                                'value': wrapper_msg.input_analog.value
                            })
                else:
                    time.sleep(0.1)
            except (serial.SerialException, OSError) as e:
                self.send_response({'type': 'error', 'message': f'Serial error: {e}'})
                self.stop_thread = True
                break
            except Exception as e:
                self.send_response({'type': 'error', 'message': f'Unexpected error: {e}'})

    def _send_serial_data(self, data: bytes) -> None:
        if not self.serial_connection or not self.serial_connection.is_open:
            raise serial.SerialException("Device not connected.")
        if len(data) > 255:
            raise ValueError(f"Payload size {len(data)} exceeds maximum frame length.")
        self.serial_connection.write(b'~')
        self.serial_connection.write(bytes([len(data)]))
        self.serial_connection.write(data)

    def _clear_ack_queue(self) -> None:
        while not self.ack_queue.empty():
            try:
                self.ack_queue.get_nowait()
            except queue.Empty:
                break

    def _wait_for_ack(self) -> None:
        if not self.serial_connection or not self.serial_connection.is_open:
            raise serial.SerialException("Device not connected.")
        deadline = time.monotonic() + ACK_TIMEOUT_SEC
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Timed out waiting for ACK from device.")
            try:
                byte = self.ack_queue.get(timeout=min(remaining, 0.1))
            except queue.Empty:
                continue
            if byte == ACK_READY:
                return
            if byte == ACK_ERROR:
                raise RuntimeError("Device reported an error while receiving image data.")

    def _image_to_jpeg_bytes(self, image: Image.Image) -> bytes:
        if image.mode != 'RGB':
            image = image.convert('RGB')
        jpeg_buffer = io.BytesIO()
        image.save(jpeg_buffer, format='JPEG', quality=85)
        return jpeg_buffer.getvalue()

    def send_image_to_device(self, screen_id: int, *, file_path: Optional[str] = None, data_url: Optional[str] = None, clear: bool = False) -> None:
        if screen_id is None:
            raise ValueError("screen_id is required.")
        if not self.serial_connection or not self.serial_connection.is_open:
            raise serial.SerialException("Device not connected.")

        if clear:
            self._clear_ack_queue()
            feedback_msg = omip_pb2.FeedbackImage(
                screen_id=screen_id,
                format=omip_pb2.FeedbackImage.ImageFormat.JPEG,
                total_size=0,
                chunk_offset=0,
                chunk_data=b'',
                is_last_chunk=True
            )
            wrapper_msg = omip_pb2.WrapperMessage(feedback_image=feedback_msg)
            serialized_msg = wrapper_msg.SerializeToString()

            with self.serial_lock:
                self._send_serial_data(serialized_msg)
                self._wait_for_ack()
            return

        image_data: bytes
        try:
            if file_path:
                if not os.path.exists(file_path):
                    raise FileNotFoundError(f"Image file not found: {file_path}")
                with Image.open(file_path) as img:
                    image_data = self._image_to_jpeg_bytes(img)
            elif data_url:
                if ',' in data_url:
                    _, encoded = data_url.split(',', 1)
                else:
                    encoded = data_url
                image_bytes = base64.b64decode(encoded)
                with Image.open(io.BytesIO(image_bytes)) as img:
                    image_data = self._image_to_jpeg_bytes(img)
            else:
                raise ValueError("No image data provided.")
        except FileNotFoundError:
            raise
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Invalid image data.") from exc
        except Exception as exc:
            raise RuntimeError(f"Failed to load image: {exc}") from exc

        total_size = len(image_data)
        self._clear_ack_queue()

        offset = 0
        while offset < total_size:
            chunk = image_data[offset:offset + CHUNK_SIZE]
            is_last = (offset + len(chunk)) == total_size

            feedback_msg = omip_pb2.FeedbackImage(
                screen_id=screen_id,
                format=omip_pb2.FeedbackImage.ImageFormat.JPEG,
                total_size=total_size,
                chunk_offset=offset,
                chunk_data=chunk,
                is_last_chunk=is_last
            )
            wrapper_msg = omip_pb2.WrapperMessage(feedback_image=feedback_msg)
            serialized_msg = wrapper_msg.SerializeToString()

            with self.serial_lock:
                self._send_serial_data(serialized_msg)
                self._wait_for_ack()

            offset += len(chunk)

    def run_command(self, command):
        cmd_type = command.get('type')

        if cmd_type == 'get_ports':
            ports = [port.device for port in serial.tools.list_ports.comports()]
            self.send_response({'command': 'get_ports', 'status': 'success', 'ports': ports})
        
        elif cmd_type == 'connect':
            port = command.get('port')
            if not port:
                self.send_response({'command': 'connect', 'status': 'error', 'message': 'Port not specified'})
                return
            try:
                self.serial_connection = serial.Serial(port, 115200, timeout=1)
                self.stop_thread = False
                self.reader_thread = threading.Thread(target=self._serial_reader)
                self.reader_thread.daemon = True
                self.reader_thread.start()
                self.send_response({'command': 'connect', 'status': 'success', 'port': port})
            except serial.SerialException as e:
                self.send_response({'command': 'connect', 'status': 'error', 'message': str(e)})

        elif cmd_type == 'disconnect':
            if self.reader_thread:
                self.stop_thread = True
                self.reader_thread.join(timeout=1)
                self.reader_thread = None
            if self.serial_connection and self.serial_connection.is_open:
                self.serial_connection.close()
            self.serial_connection = None
            self.send_response({'command': 'disconnect', 'status': 'success'})

        elif cmd_type == 'set_page':
            self.current_page = command.get('page', 1)
            self.send_response({'command': 'set_page', 'status': 'success', 'page': self.current_page})

        elif cmd_type == 'get_config':
            self.send_response({'command': 'get_config', 'status': 'success', 'config': self.page_configs})

        elif cmd_type == 'save_config':
            self.page_configs = command.get('config', self.page_configs)
            self.save_config()
            self.send_response({'command': 'save_config', 'status': 'success'})

        elif cmd_type == 'send_image':
            screen_id = command.get('screen_id')
            file_path = command.get('file_path')
            data_url = command.get('data_url')
            clear_flag = command.get('clear')
            if screen_id is None:
                self.send_response({'command': 'send_image', 'status': 'error', 'message': 'screen_id is required'})
                return
            try:
                self.send_image_to_device(
                    int(screen_id),
                    file_path=file_path,
                    data_url=data_url,
                    clear=bool(clear_flag)
                )
                self.send_response({'command': 'send_image', 'status': 'success', 'screen_id': int(screen_id)})
            except Exception as e:
                self.send_response({'command': 'send_image', 'status': 'error', 'message': str(e)})

        else:
            self.send_response({'command': cmd_type, 'status': 'error', 'message': f'Unknown command: {cmd_type}'})

    def start(self):
        for line in sys.stdin:
            try:
                command = json.loads(line)
                self.run_command(command)
            except json.JSONDecodeError:
                self.send_response({'error': 'Invalid JSON'})
            except Exception as e:
                self.send_response({'error': str(e)})

if __name__ == "__main__":
    service = BackendService()
    service.start()
