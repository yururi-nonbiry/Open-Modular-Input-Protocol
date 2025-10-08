import asyncio
import serial
import serial.tools.list_ports
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from starlette.templating import Jinja2Templates
from bleak import BleakScanner

import omip_pb2

# --- 定数 ---
BAUDRATE = 115200

# --- アプリケーションの状態管理 ---
class AppState:
    def __init__(self):
        self.serial_task = None
        self.selected_port = None
        self.ble_scan_task = None

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

# --- Socket.IO イベントハンドラ ---
@sio.event
async def connect(sid, environ):
    print(f"Socket.IO client connected: {sid}")
    await sio.emit('server_message', {'data': 'Welcome! You are connected.'}, to=sid)

@sio.event
async def disconnect(sid):
    print(f"Socket.IO client disconnected: {sid}")

@sio.on('get_serial_ports')
async def get_serial_ports(sid):
    """利用可能なシリアルポートの一覧を要求元のクライアントに送信する"""
    ports = serial.tools.list_ports.comports()
    port_list = [{'device': p.device, 'description': p.description} for p in ports]
    print(f"Sending serial port list to {sid}: {port_list}")
    await sio.emit('serial_ports', port_list, to=sid)

@sio.on('select_serial_port')
async def select_serial_port(sid, port_name):
    """クライアントから指定されたシリアルポートで通信タスクを開始する"""
    print(f"Client {sid} selected port: {port_name}")
    state.selected_port = port_name

    # 既存のタスクがあればキャンセル
    if state.serial_task:
        state.serial_task.cancel()
        try:
            await state.serial_task
        except asyncio.CancelledError:
            print("Serial reader task cancelled.")

    # 新しいポートでタスクを開始
    state.serial_task = asyncio.create_task(serial_reader_task(port_name))
    await sio.emit('port_changed', {'port': port_name}, to=sid)


# --- バックグラウンドタスク ---
async def serial_reader_task(port_name: str):
    """指定されたシリアルポートから継続的にデータを読み取り、WebSocketで送信する"""
    ser = None
    try:
        print(f"Attempting to open serial port '{port_name}'...")
        ser = serial.Serial(port_name, BAUDRATE, timeout=0.1)
        print(f"Serial port '{port_name}' opened successfully.")
        await sio.emit('connection_status', {'status': 'connected', 'port': port_name})

        while True:
            # --- メッセージの受信とフレーミング ---
            start_byte = ser.read(1)
            if not start_byte:
                await asyncio.sleep(0.01)
                continue

            if start_byte != b'~': continue

            length_byte = ser.read(1)
            if not length_byte: continue
            payload_length = int.from_bytes(length_byte, 'big')

            payload = ser.read(payload_length)
            if len(payload) != payload_length: continue

            # --- デコードとWebSocket送信 ---
            wrapper_msg = omip_pb2.WrapperMessage()
            try:
                wrapper_msg.ParseFromString(payload)
                msg_type = wrapper_msg.which_oneof('message_type')
                if not msg_type: continue

                msg_dict = {}
                if msg_type == 'input_digital':
                    msg = wrapper_msg.input_digital
                    msg_dict = {'type': 'digital', 'device_id': msg.device_id, 'port_id': msg.port_id, 'state': msg.state}
                elif msg_type == 'input_analog':
                    msg = wrapper_msg.input_analog
                    msg_dict = {'type': 'analog', 'device_id': msg.device_id, 'port_id': msg.port_id, 'value': msg.value}
                elif msg_type == 'input_encoder':
                    msg = wrapper_msg.input_encoder
                    msg_dict = {'type': 'encoder', 'device_id': msg.device_id, 'port_id': msg.port_id, 'steps': msg.steps}
                
                if msg_dict:
                    await sio.emit('device_data', msg_dict)

            except Exception as e:
                print(f"Decoding error: {e}")

    except serial.SerialException as e:
        print(f"Error opening serial port '{port_name}': {e}")
        await sio.emit('connection_status', {'status': 'error', 'message': str(e)})
    except asyncio.CancelledError:
        print("Serial reader task is shutting down.")
    finally:
        if ser and ser.is_open:
            ser.close()
            print(f"Serial port '{port_name}' closed.")
            await sio.emit('connection_status', {'status': 'disconnected'})

async def scan_ble_devices_task():
    """近くのBluetooth LEデバイスを継続的にスキャンし、UIに結果を送信する"""
    while True:
        try:
            print("Scanning for BLE devices...")
            # discover()はNoneを返すことがあるため、空リストでフォールバック
            devices = await BleakScanner.discover(timeout=5.0) or []
            device_list = [{'name': d.name, 'address': d.address} for d in devices if d.name]
            if device_list:
                print(f"Found {len(device_list)} BLE devices with names.")
                await sio.emit('ble_devices', device_list)
        except Exception as e:
            print(f"Error during BLE scan: {e}")
        
        # 10秒待ってから再スキャン
        await asyncio.sleep(10)

# --- サーバー起動・メイン処理 ---
@app.on_event("startup")
async def startup_event():
    print("Server started.")
    # BLEスキャンタスクを開始
    state.ble_scan_task = asyncio.create_task(scan_ble_devices_task())
    print("Started BLE scanning task.")

@app.on_event("shutdown")
async def shutdown_event():
    print("Server is shutting down.")
    if state.serial_task:
        state.serial_task.cancel()
    if state.ble_scan_task:
        state.ble_scan_task.cancel()
    
    # タスクのクリーンアップを待機
    await asyncio.sleep(1)
    print("Background tasks cancelled.")

if __name__ == "__main__":
    print("Starting web server at http://127.0.0.1:8000")
    uvicorn.run(socket_app, host="127.0.0.1", port=8000)
