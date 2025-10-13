import sys
import json
import threading
import time
import serial
import serial.tools.list_ports
import io
import os
from pynput import keyboard

import omip_pb2

CONFIG_FILE = "gui_config.json"

class BackendService:
    def __init__(self):
        self.serial_connection = None
        self.stop_thread = False
        self.reader_thread = None
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
                    if self.serial_connection.read(1) == b'~':
                        length_byte = self.serial_connection.read(1)
                        if not length_byte: continue
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