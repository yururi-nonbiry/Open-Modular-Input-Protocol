import asyncio
import serial
import serial.tools.list_ports
import socketio
import uvicorn
import base64
import hid
import math
import time
import json
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from starlette.templating import Jinja2Templates
from bleak import BleakScanner, BleakClient
from pynput.keyboard import Controller, Key

import omip_pb2

# --- 定数 ---
BAUDRATE = 115200
MAPPING_FILE = "joycon_mapping.json"

# --- pynput --- 
keyboard = Controller()

# 文字列をpynputのKeyオブジェクトに変換するためのマップ
KEY_MAP = {
    'alt': Key.alt, 'alt_l': Key.alt_l, 'alt_r': Key.alt_r,
    'alt_gr': Key.alt_gr,
    'backspace': Key.backspace,
    'caps_lock': Key.caps_lock,
    'cmd': Key.cmd, 'cmd_l': Key.cmd_l, 'cmd_r': Key.cmd_r,
    'ctrl': Key.ctrl, 'ctrl_l': Key.ctrl_l, 'ctrl_r': Key.ctrl_r,
    'delete': Key.delete,
    'down': Key.down,
    'end': Key.end,
    'enter': Key.enter,
    'esc': Key.esc,
    'f1': Key.f1, 'f2': Key.f2, 'f3': Key.f3, 'f4': Key.f4,
    'f5': Key.f5, 'f6': Key.f6, 'f7': Key.f7, 'f8': Key.f8,
    'f9': Key.f9, 'f10': Key.f10, 'f11': Key.f11, 'f12': Key.f12,
    'home': Key.home,
    'left': Key.left,
    'page_down': Key.page_down,
    'page_up': Key.page_up,
    'right': Key.right,
    'shift': Key.shift, 'shift_l': Key.shift_l, 'shift_r': Key.shift_r,
    'space': Key.space,
    'tab': Key.tab,
    'up': Key.up,
    'insert': Key.insert,
    'menu': Key.menu,
    'num_lock': Key.num_lock,
    'pause': Key.pause,
    'print_screen': Key.print_screen,
    'scroll_lock': Key.scroll_lock,
}

def get_key(key_string):
    """文字列をpynputのキーオブジェクトまたは文字に変換する"""
    return KEY_MAP.get(key_string.lower(), key_string)

# --- Joy-Con 関連の定数 ---
NINTENDO_VID = 0x057e
JOYCON_L_PID = 0x2006
JOYCON_R_PID = 0x2007

LEFT_MAPPING = {
    0x01: "arrow_down", 0x02: "arrow_up", 0x04: "arrow_right", 0x08: "arrow_left",
    0x10: "sr", 0x20: "sl", 0x40: "l", 0x80: "zl",
}
RIGHT_MAPPING = {
    0x01: "y", 0x02: "x", 0x04: "b", 0x08: "a",
    0x10: "sr", 0x20: "sl", 0x40: "r", 0x80: "zr",
}
SHARED_MAPPING = {
    0x01: "minus", 0x02: "plus", 0x04: "stick_press_r",
    0x08: "stick_press_l", 0x10: "home", 0x20: "capture",
}
BATTERY_MAPPING = {
    8: "満タン (Full)", 6: "中 (Medium)", 4: "低 (Low)",
    2: "要充電 (Critical)", 0: "空 (Empty)",
}
NEUTRAL_RUMBLE_DATA = bytearray([0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40])

# --- アプリケーションの状態管理 ---
class AppState:
    def __init__(self):
        self.joycon_reader_task = None
        self.joycon_devices = []
        self.global_packet_counter = 0
        self.joycon_mapping = {}

state = AppState()

# --- FastAPI, Socket.IO --- 
app = FastAPI()
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# --- 設定ファイルの読み書き ---
def load_mapping():
    try:
        with open(MAPPING_FILE, 'r') as f:
            state.joycon_mapping = json.load(f)
            print(f"Loaded mapping from {MAPPING_FILE}")
    except (FileNotFoundError, json.JSONDecodeError):
        state.joycon_mapping = {}

def save_mapping():
    with open(MAPPING_FILE, 'w') as f:
        json.dump(state.joycon_mapping, f, indent=2)
    print(f"Saved mapping to {MAPPING_FILE}")

# --- Socket.IO イベントハンドラ ---
@sio.event
async def connect(sid, environ):
    print(f"Socket.IO client connected: {sid}")
    devices_info = [
        {"id": d['path'], "type": d['type'], "battery": d.get('last_battery_level', 0)}
        for d in state.joycon_devices
    ]
    await sio.emit('joycon_devices', {'devices': devices_info}, to=sid)

@sio.on('load_joycon_mapping')
async def load_joycon_mapping(sid, data):
    device_id = data.get('deviceId')
    await sio.emit('joycon_mapping_loaded', {'mapping': state.joycon_mapping.get(device_id, {})}, to=sid)

@sio.on('save_joycon_mapping')
async def save_joycon_mapping(sid, data):
    device_id = data.get('deviceId')
    mapping = data.get('mapping')
    if device_id and mapping is not None:
        state.joycon_mapping[device_id] = mapping
        save_mapping()
        await sio.emit('joycon_mapping_saved', {'status': 'success'}, to=sid)

# --- Joy-Con 関連 --- 
def send_joycon_subcommand(device, command, data):
    payload = bytearray([0x01, state.global_packet_counter & 0xF])
    payload.extend(NEUTRAL_RUMBLE_DATA)
    payload.append(command)
    payload.extend(data)
    device['hid'].write(payload)
    state.global_packet_counter = (state.global_packet_counter + 1) % 16

async def joycon_reader_task():
    print("Starting Joy-Con detection...")
    try:
        joycon_infos = [dev for dev in hid.enumerate() if dev['vendor_id'] == NINTENDO_VID and dev['product_id'] in [JOYCON_L_PID, JOYCON_R_PID]]
        if not joycon_infos:
            await sio.emit('joycon_devices', {'devices': []})
            return

        for info in joycon_infos:
            try:
                dev = hid.device()
                dev.open_path(info['path'])
                dev.set_nonblocking(1)
                dev_type = 'L' if info['product_id'] == JOYCON_L_PID else 'R'
                device_path = info['path']
                # hid.enumerate()が返すpathはbytesの場合があるので、strに変換する
                if isinstance(device_path, bytes):
                    device_path = device_path.decode('utf-8')
                device_obj = {'type': dev_type, 'hid': dev, 'path': device_path, 'last_battery_level': -1, 'last_button_state': {}}
                state.joycon_devices.append(device_obj)
                send_joycon_subcommand(device_obj, 0x03, b'\x30')
            except Exception as e:
                print(f"Failed to open Joy-Con {info['path']}: {e}")

        devices_info = [{"id": d['path'], "type": d['type'], "battery": 0} for d in state.joycon_devices]
        await sio.emit('joycon_devices', {'devices': devices_info})

        while True:
            for dev_info in state.joycon_devices:
                report = dev_info['hid'].read(64)
                if not (report and report[0] == 0x30): continue

                # --- ボタン解析 ---
                current_buttons = {}
                byte3, byte4, byte5 = report[3], report[4], report[5]
                MAPPING = LEFT_MAPPING if dev_info['type'] == 'L' else RIGHT_MAPPING
                for mask, name in MAPPING.items():
                    if (byte5 if dev_info['type'] == 'L' else byte3) & mask: current_buttons[name] = True
                for mask, name in SHARED_MAPPING.items():
                    if byte4 & mask: current_buttons[name] = True
                
                last_state = dev_info['last_button_state']
                pressed = {name for name in current_buttons if name not in last_state}
                released = {name for name in last_state if name not in current_buttons}
                dev_info['last_button_state'] = current_buttons

                # --- キーマッピング実行 ---
                device_mapping = state.joycon_mapping.get(dev_info['path'], {})
                for button in pressed:
                    key_string = device_mapping.get(button)
                    if key_string:
                        key_to_press = get_key(key_string)
                        keyboard.press(key_to_press)
                for button in released:
                    key_string = device_mapping.get(button)
                    if key_string:
                        key_to_release = get_key(key_string)
                        keyboard.release(key_to_release)

                # --- UIへ更新通知 (ボタン) ---
                if pressed or released:
                    await sio.emit('joycon_update', {'id': dev_info['path'], 'type': 'input', 'buttons': current_buttons})

            await asyncio.sleep(0.016)

    except (Exception, asyncio.CancelledError) as e:
        print(f"Joy-Con task stopped: {e}")
    finally:
        for dev in state.joycon_devices:
            dev['hid'].close()

# --- サーバー起動・メイン処理 ---
@app.on_event("startup")
async def startup_event():
    load_mapping()
    state.joycon_reader_task = asyncio.create_task(joycon_reader_task())

@app.on_event("shutdown")
async def shutdown_event():
    if state.joycon_reader_task: state.joycon_reader_task.cancel()

if __name__ == "__main__":
    uvicorn.run(socket_app, host="127.0.0.1", port=8000)
