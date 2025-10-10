import asyncio
import serial
import serial.tools.list_ports
import socketio
import uvicorn
import base64
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from starlette.templating import Jinja2Templates
from bleak import BleakScanner, BleakClient

import omip_pb2

# --- 定数 ---
BAUDRATE = 115200
OMIP_SERVICE_UUID = "0000180a-0000-1000-8000-00805f9b34fb"  # 仮のUUID
OMIP_DATA_CHAR_UUID = "00002a58-0000-1000-8000-00805f9b34fb" # 仮のUUID
OMIP_FEEDBACK_CHAR_UUID = "00002a59-0000-1000-8000-00805f9b34fb" # 仮のUUID

# --- アプリケーションの状態管理 ---
class AppState:
    def __init__(self):
        self.serial_task = None
        self.ble_reader_task: asyncio.Task | None = None
        self.ble_scan_task = None
        self.serial_connection: serial.Serial | None = None
        self.ble_client: BleakClient | None = None

state = AppState()

# --- FastAPI, Socket.IO, Templates のセットアップ ---
app = FastAPI()
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
templates = Jinja2Templates(directory="pc_software/templates")


# --- Webサーバーのエンドポイント ---
@app.get("/", response_class=HTMLResponse)
async def read_root():
    return templates.TemplateResponse("index.html", {"request": {}})

# --- 共通の接続解除処理 ---
async def disconnect_all():
    """すべてのデバイス接続タスクをキャンセルし、リソースを解放する"""
    if state.serial_task:
        state.serial_task.cancel()
        try: await state.serial_task
        except asyncio.CancelledError: pass
        state.serial_task = None
        print("Serial task cancelled.")

    if state.ble_reader_task:
        state.ble_reader_task.cancel()
        try: await state.ble_reader_task
        except asyncio.CancelledError: pass
        state.ble_reader_task = None
        print("BLE reader task cancelled.")

# --- Socket.IO イベントハンドラ ---
@sio.event
async def connect(sid, environ):
    print(f"Socket.IO client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Socket.IO client disconnected: {sid}")

@sio.on('get_serial_ports')
async def get_serial_ports(sid):
    ports = serial.tools.list_ports.comports()
    port_list = [{'device': p.device, 'description': p.description} for p in ports]
    await sio.emit('serial_ports', port_list, to=sid)

@sio.on('select_serial_port')
async def select_serial_port(sid, port_name):
    print(f"Client {sid} selected serial port: {port_name}")
    await disconnect_all()
    state.serial_task = asyncio.create_task(serial_reader_task(port_name))

@sio.on('select_ble_device')
async def select_ble_device(sid, address):
    print(f"Client {sid} selected BLE device: {address}")
    await disconnect_all()
    state.ble_reader_task = asyncio.create_task(ble_reader_task(address))

@sio.on('set_feedback_image')
async def set_feedback_image(sid, data):
    wrapper_msg = omip_pb2.WrapperMessage()
    wrapper_msg.feedback_image.device_id = data['device_id']
    wrapper_msg.feedback_image.port_id = data['port_id']
    wrapper_msg.feedback_image.image_data = base64.b64decode(data['image_data'])
    payload = wrapper_msg.SerializeToString()

    if state.serial_connection and state.serial_connection.is_open:
        frame = b'~' + len(payload).to_bytes(1, 'big') + payload
        state.serial_connection.write(frame)
    elif state.ble_client and state.ble_client.is_connected:
        # TODO: BLEの書き込み処理を実装
        print("BLE write not implemented yet.")
    else:
        print("Cannot send image data: No active connection.")

# --- データ処理 ---
def handle_received_data(payload: bytes):
    """受信したProtobufペイロードをデコードしてUIに送信する"""
    try:
        wrapper_msg = omip_pb2.WrapperMessage()
        wrapper_msg.ParseFromString(payload)
        msg_type = wrapper_msg.which_oneof('message_type')
        if not msg_type: return

        msg_dict = {}
        if msg_type == 'input_digital':
            msg = wrapper_msg.input_digital
            msg_dict = {'type': 'digital', 'device_id': msg.device_id, 'port_id': msg.port_id, 'state': msg.state}
        elif msg_type == 'input_analog':
            msg = wrapper_msg.input_analog
            msg_dict = {'type': 'analog', 'device_id': msg.device_id, 'port_id': msg.port_id, 'value': msg.value}
        
        if msg_dict:
            asyncio.create_task(sio.emit('device_data', msg_dict))

    except Exception as e:
        print(f"Decoding error: {e}")

# --- バックグラウンドタスク ---
async def serial_reader_task(port_name: str):
    try:
        print(f"Opening serial port '{port_name}'...")
        state.serial_connection = serial.Serial(port_name, BAUDRATE, timeout=0.1)
        await sio.emit('connection_status', {'status': 'connected', 'port': port_name})
        while True:
            if state.serial_connection.read(1) != b'~': continue
            length_byte = state.serial_connection.read(1)
            if not length_byte: continue
            payload_length = int.from_bytes(length_byte, 'big')
            payload = state.serial_connection.read(payload_length)
            if len(payload) == payload_length:
                handle_received_data(payload)
            await asyncio.sleep(0.001)
    except serial.SerialException as e:
        await sio.emit('connection_status', {'status': 'error', 'message': str(e)})
    except asyncio.CancelledError:
        print("Serial reader task shutting down.")
    finally:
        if state.serial_connection and state.serial_connection.is_open:
            state.serial_connection.close()
            state.serial_connection = None
            await sio.emit('connection_status', {'status': 'disconnected'})

async def ble_reader_task(address: str):
    def notification_handler(sender, data):
        # TODO: BLEではデータが分割して送られてくる可能性への対応
        handle_received_data(data)

    try:
        print(f"Connecting to BLE device {address}...")
        async with BleakClient(address) as client:
            state.ble_client = client
            await sio.emit('connection_status', {'status': 'connected', 'port': address})
            print(f"Connected to {address}. Subscribing to notifications...")
            await client.start_notify(OMIP_DATA_CHAR_UUID, notification_handler)
            while client.is_connected:
                await asyncio.sleep(1)
    except Exception as e:
        await sio.emit('connection_status', {'status': 'error', 'message': str(e)})
    finally:
        state.ble_client = None
        await sio.emit('connection_status', {'status': 'disconnected'})

async def scan_ble_devices_task():
    while True:
        try:
            devices = await BleakScanner.discover(timeout=5.0) or []
            device_list = [{'name': d.name, 'address': d.address} for d in devices if d.name]
            if device_list:
                await sio.emit('ble_devices', device_list)
        except Exception as e:
            print(f"Error during BLE scan: {e}")
        await asyncio.sleep(10)

# --- サーバー起動・メイン処理 ---
@app.on_event("startup")
async def startup_event():
    state.ble_scan_task = asyncio.create_task(scan_ble_devices_task())

@app.on_event("shutdown")
async def shutdown_event():
    await disconnect_all()
    if state.ble_scan_task:
        state.ble_scan_task.cancel()

if __name__ == "__main__":
    uvicorn.run(socket_app, host="127.0.0.1", port=8000)
