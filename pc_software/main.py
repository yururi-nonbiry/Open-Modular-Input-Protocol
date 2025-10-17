import asyncio
import serial
import serial.tools.list_ports
import socketio
import uvicorn
import base64
import hid
import math
import time
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from starlette.templating import Jinja2Templates
from bleak import BleakScanner, BleakClient

import omip_pb2

# --- 定数 ---
BAUDRATE = 115200
# (OMIP関連の定数は省略)

# --- Joy-Con 関連の定数 ---
NINTENDO_VID = 0x057e
JOYCON_L_PID = 0x2006
JOYCON_R_PID = 0x2007

BATTERY_MAPPING = {
    8: "満タン (Full)", 6: "中 (Medium)", 4: "低 (Low)",
    2: "要充電 (Critical)", 0: "空 (Empty)",
}
NEUTRAL_RUMBLE_DATA = bytearray([0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40])

# --- アプリケーションの状態管理 ---
class AppState:
    def __init__(self):
        self.serial_task = None
        self.ble_reader_task: asyncio.Task | None = None
        self.ble_scan_task = None
        self.joycon_reader_task = None
        self.serial_connection: serial.Serial | None = None
        self.ble_client: BleakClient | None = None
        self.joycon_devices = []
        self.global_packet_counter = 0

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
    # 接続時に現在のJoy-Conの状態を送信
    devices_info = [
        {"id": d['path'], "type": d['type'], "battery": d.get('battery_level', 0)}
        for d in state.joycon_devices
    ]
    await sio.emit('joycon_devices', {'devices': devices_info}, to=sid)


@sio.event
async def disconnect(sid):
    print(f"Socket.IO client disconnected: {sid}")

# --- Joy-Con 関連のヘルパー関数 ---
def send_joycon_subcommand(device, command, data, rumble_data=NEUTRAL_RUMBLE_DATA):
    payload = bytearray([0x01, state.global_packet_counter & 0xF])
    payload.extend(rumble_data)
    payload.append(command)
    payload.extend(data)
    device['hid'].write(payload)
    state.global_packet_counter = (state.global_packet_counter + 1) % 16

# --- バックグラウンドタスク ---
async def joycon_reader_task():
    print("Starting Joy-Con detection...")
    try:
        joycon_infos = [dev for dev in hid.enumerate() if dev['vendor_id'] == NINTENDO_VID and dev['product_id'] in [JOYCON_L_PID, JOYCON_R_PID]]
        if not joycon_infos:
            print("No Joy-Cons found.")
            await sio.emit('joycon_devices', {'devices': []})
            return

        for info in joycon_infos:
            dev_type = 'L' if info['product_id'] == JOYCON_L_PID else 'R'
            try:
                dev = hid.device()
                dev.open_path(info['path'])
                dev.set_nonblocking(1)
                device_obj = {'type': dev_type, 'hid': dev, 'path': info['path'], 'last_battery_level': -1}
                state.joycon_devices.append(device_obj)
                print(f"Opened Joy-Con ({dev_type}). Initializing...")

                # 初期化シーケンス
                send_joycon_subcommand(device_obj, 0x03, b'\x30') # 標準モード
                await asyncio.sleep(0.05)
                send_joycon_subcommand(device_obj, 0x40, b'\x01') # IMU有効化
                await asyncio.sleep(0.05)
                send_joycon_subcommand(device_obj, 0x48, b'\x01') # 振動有効化
                await asyncio.sleep(0.05)

            except Exception as e:
                print(f"Failed to open or initialize Joy-Con {info['path']}: {e}")

        # UIにデバイスリストを通知
        devices_info = [
            {"id": d['path'], "type": d['type'], "battery": 0}
            for d in state.joycon_devices
        ]
        await sio.emit('joycon_devices', {'devices': devices_info})

        print("Reading Joy-Con input reports...")
        while True:
            for dev_info in state.joycon_devices:
                report = dev_info['hid'].read(64)
                if report and report[0] == 0x30:
                    # バッテリー情報
                    battery_info = report[2]
                    battery_level = battery_info >> 4
                    if battery_level != dev_info['last_battery_level']:
                        dev_info['last_battery_level'] = battery_level
                        status = BATTERY_MAPPING.get(battery_level, f"不明 ({battery_level})")
                        charging = " (充電中)" if (battery_info & 0x10) else ""
                        await sio.emit('joycon_update', {
                            'id': dev_info['path'],
                            'type': 'battery',
                            'level': battery_level,
                            'status': status,
                            'charging': bool(battery_info & 0x10)
                        })

                    # ボタン・スティック情報 (簡略化)
                    # ここでレポートを解析し、ボタンやスティックのデータを抽出
                    # ... 解析ロジック ...
                    # 例：
                    button_data = report[3:6]
                    stick_data_l = report[6:9]
                    stick_data_r = report[9:12]

                    await sio.emit('joycon_update', {
                        'id': dev_info['path'],
                        'type': 'input',
                        'buttons': list(button_data),
                        'stick_l': list(stick_data_l),
                        'stick_r': list(stick_data_r),
                    })

            await asyncio.sleep(0.016) # 約60Hzでポーリング

    except hid.HIDException as e:
        print(f"HID Error: {e}")
    except asyncio.CancelledError:
        print("Joy-Con reader task shutting down.")
    finally:
        for dev in state.joycon_devices:
            dev['hid'].close()
        state.joycon_devices = []
        print("All Joy-Cons closed.")

# --- サーバー起動・メイン処理 ---
@app.on_event("startup")
async def startup_event():
    # state.ble_scan_task = asyncio.create_task(scan_ble_devices_task())
    state.joycon_reader_task = asyncio.create_task(joycon_reader_task())

@app.on_event("shutdown")
async def shutdown_event():
    # await disconnect_all()
    if state.joycon_reader_task:
        state.joycon_reader_task.cancel()

if __name__ == "__main__":
    uvicorn.run(socket_app, host="127.0.0.1", port=8000)