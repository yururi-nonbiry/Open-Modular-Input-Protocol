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
from pynput.keyboard import Controller as KeyboardController, Key
from pynput.mouse import Controller as MouseController

import omip_pb2

# --- 定数 ---
BAUDRATE = 115200
MAPPING_FILE = "joycon_mapping.json"
JOYCON_SCAN_INTERVAL = 2  # Joy-Conをスキャンする間隔（秒）
STICK_DEADZONE = 0.15  # スティックのデッドゾーン (15%)
MOUSE_SENSITIVITY = 25   # マウスの感度

# --- pynput ---
keyboard = KeyboardController()
mouse = MouseController()

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
    await send_joycon_devices_update()

@sio.on('load_joycon_mapping')
async def load_joycon_mapping(sid, data):
    device_id = data.get('deviceId')
    await sio.emit('joycon_mapping_loaded', {'deviceId': device_id, 'mapping': state.joycon_mapping.get(device_id, {})}, to=sid)

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
    try:
        payload = bytearray([0x01, state.global_packet_counter & 0xF])
        payload.extend(NEUTRAL_RUMBLE_DATA)
        payload.append(command)
        payload.extend(data)
        device['hid'].write(payload)
        state.global_packet_counter = (state.global_packet_counter + 1) % 16
    except OSError as e:
        print(f"Error sending subcommand to {device['path']}: {e}")
        asyncio.create_task(handle_joycon_disconnection(device['path']))


async def send_joycon_devices_update():
    devices_info = [
        {"id": d['path'], "type": d['type'], "battery": d.get('last_battery_level', 0)}
        for d in state.joycon_devices
    ]
    await sio.emit('joycon_devices', {'devices': devices_info})

async def handle_joycon_disconnection(device_path):
    device_to_remove = next((d for d in state.joycon_devices if d['path'] == device_path), None)
    if device_to_remove:
        print(f"Joy-Con disconnected: {device_path}")
        try:
            device_to_remove['hid'].close()
        except Exception as e:
            print(f"Error closing HID device for {device_path}: {e}")
        state.joycon_devices.remove(device_to_remove)
        await send_joycon_devices_update()

def process_stick_input(x_raw, y_raw):
    """スティックの生データを-1.0から1.0の範囲に正規化し、デッドゾーンを適用する"""
    x = (x_raw - 2048) / 2048.0
    y = (y_raw - 2048) / 2048.0

    magnitude = math.sqrt(x*x + y*y)
    if magnitude < STICK_DEADZONE:
        return 0.0, 0.0

    # デッドゾーンの外側の値を0.0から1.0に再マッピング
    magnitude = (magnitude - STICK_DEADZONE) / (1.0 - STICK_DEADZONE)
    return x / math.sqrt(x*x + y*y) * magnitude, y / math.sqrt(x*x + y*y) * magnitude

async def scan_and_manage_joycons():
    print("Starting Joy-Con detection...")
    last_scan_time = 0

    while True:
        try:
            # --- 定期スキャン ---
            if time.time() - last_scan_time > JOYCON_SCAN_INTERVAL:
                last_scan_time = time.time()
                connected_paths = [d['path'] for d in state.joycon_devices]
                try:
                    all_joycon_infos = [
                        dev for dev in hid.enumerate()
                        if dev['vendor_id'] == NINTENDO_VID and dev['product_id'] in [JOYCON_L_PID, JOYCON_R_PID]
                    ]
                    found_paths = [info['path'].decode('utf-8') if isinstance(info['path'], bytes) else info['path'] for info in all_joycon_infos]
                except hid.HIDException as e:
                    print(f"HID enumeration failed: {e}")
                    all_joycon_infos = []
                    found_paths = []

                for info in all_joycon_infos:
                    device_path = info['path'].decode('utf-8') if isinstance(info['path'], bytes) else info['path']
                    if device_path not in connected_paths:
                        print(f"New Joy-Con detected: {device_path}")
                        try:
                            dev = hid.device()
                            dev.open_path(info['path'])
                            dev.set_nonblocking(1)
                            dev_type = 'L' if info['product_id'] == JOYCON_L_PID else 'R'
                            device_obj = {
                                'type': dev_type,
                                'hid': dev,
                                'path': device_path,
                                'last_battery_level': 10, # 初回更新を強制するため範囲外の値に設定
                                'last_button_state': {},
                                'last_stick_direction': None,
                                'last_stick_angle': 0,
                                'last_stick_sector': None
                            }
                            state.joycon_devices.append(device_obj)
                            send_joycon_subcommand(device_obj, 0x03, b'\x30')
                            await send_joycon_devices_update()
                        except (OSError, hid.HIDException) as e:
                            print(f"Failed to open new Joy-Con {device_path}: {e}")

                disconnected_paths = [path for path in connected_paths if path not in found_paths]
                for path in disconnected_paths:
                    await handle_joycon_disconnection(path)


            if not state.joycon_devices:
                await asyncio.sleep(JOYCON_SCAN_INTERVAL)
                continue

            for dev_info in list(state.joycon_devices):
                try:
                    report = dev_info['hid'].read(64)
                    if not (report and report[0] == 0x30): continue

                    # --- バッテリー残量解析 ---
                    battery_info = report[2]
                    battery_level = battery_info >> 4
                    last_batt = dev_info.get('last_battery_level', -1)
                    if battery_level != last_batt:
                        dev_info['last_battery_level'] = battery_level
                        await sio.emit('joycon_update', {
                            'id': dev_info['path'], 
                            'type': 'battery', 
                            'level': battery_level, 
                            'charging': (battery_info & 0x10) > 0
                        })
                        await send_joycon_devices_update() # デバイスリストも更新

                    # --- ボタン解析 ---
                    current_buttons = {}
                    byte3, byte4, byte5 = report[3], report[4], report[5]
                    MAPPING = LEFT_MAPPING if dev_info['type'] == 'L' else RIGHT_MAPPING
                    for mask, name in MAPPING.items():
                        if (byte5 if dev_info['type'] == 'L' else byte3) & mask: current_buttons[name] = True
                    for mask, name in SHARED_MAPPING.items():
                        if byte4 & mask: current_buttons[name] = True
                    
                    last_state = dev_info.get('last_button_state', {})
                    pressed = {name for name in current_buttons if name not in last_state}
                    released = {name for name in last_state if name not in current_buttons}
                    dev_info['last_button_state'] = current_buttons

                    device_mapping = state.joycon_mapping.get(dev_info['path'], {})
                    
                    # --- キーマッピング実行 ---
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

                    # --- アナログスティック処理 ---
                    stick_config = device_mapping.get('stick_l' if dev_info['type'] == 'L' else 'stick_r')
                    
                    # 設定の形式をチェック（古い形式は文字列、新しい形式は辞書）
                    if isinstance(stick_config, dict):
                        stick_mode = stick_config.get('mode', 'none')
                        sensitivity = stick_config.get('sensitivity', MOUSE_SENSITIVITY)
                    elif isinstance(stick_config, str):
                        stick_mode = stick_config
                        sensitivity = MOUSE_SENSITIVITY # 古い形式の場合のデフォルト値
                    else:
                        stick_mode = 'none'
                        sensitivity = MOUSE_SENSITIVITY

                    if stick_mode == 'mouse':
                        if dev_info['type'] == 'L':
                            x_raw = report[6] | ((report[7] & 0x0F) << 8)
                            y_raw = (report[7] >> 4) | (report[8] << 4)
                        else: # 'R'
                            x_raw = report[9] | ((report[10] & 0x0F) << 8)
                            y_raw = (report[10] >> 4) | (report[11] << 4)
                        
                        dx, dy = process_stick_input(x_raw, y_raw)
                        
                        # Y軸の値を反転させる（Joy-Conの上方向は値が小さい）
                        mouse.move(dx * sensitivity, -dy * sensitivity)
                    
                    elif stick_mode == '8way':
                        if dev_info['type'] == 'L':
                            x_raw = report[6] | ((report[7] & 0x0F) << 8)
                            y_raw = (report[7] >> 4) | (report[8] << 4)
                        else: # 'R'
                            x_raw = report[9] | ((report[10] & 0x0F) << 8)
                            y_raw = (report[10] >> 4) | (report[11] << 4)

                        dx, dy = process_stick_input(x_raw, y_raw)
                        
                        # Y軸を反転
                        dy = -dy

                        direction = None
                        threshold = 0.5
                        if dy > threshold:
                            if dx > threshold: direction = 'up_right'
                            elif dx < -threshold: direction = 'up_left'
                            else: direction = 'up'
                        elif dy < -threshold:
                            if dx > threshold: direction = 'down_right'
                            elif dx < -threshold: direction = 'down_left'
                            else: direction = 'down'
                        elif dx > threshold: direction = 'right'
                        elif dx < -threshold: direction = 'left'

                        last_direction = dev_info.get('last_stick_direction')
                        if direction != last_direction:
                            mappings = stick_config.get('mappings', {})
                            
                            # Release previous key
                            if last_direction and last_direction in mappings:
                                key_to_release = get_key(mappings[last_direction])
                                keyboard.release(key_to_release)
                            
                            # Press new key
                            if direction and direction in mappings:
                                key_to_press = get_key(mappings[direction])
                                keyboard.press(key_to_press)
                            
                            dev_info['last_stick_direction'] = direction

                    elif stick_mode == 'dial':
                        if dev_info['type'] == 'L':
                            x_raw = report[6] | ((report[7] & 0x0F) << 8)
                            y_raw = (report[7] >> 4) | (report[8] << 4)
                        else: # 'R'
                            x_raw = report[9] | ((report[10] & 0x0F) << 8)
                            y_raw = (report[10] >> 4) | (report[11] << 4)

                        dx, dy = process_stick_input(x_raw, y_raw)
                        
                        magnitude = math.sqrt(dx*dx + dy*dy)
                        
                        if magnitude < 0.1: # Deadzone
                            dev_info['last_stick_sector'] = None
                            continue

                        angle = math.atan2(-dy, dx) # Y is inverted

                        sector = None
                        if math.pi / 4 <= angle < 3 * math.pi / 4:
                            sector = 'up'
                        elif -3 * math.pi / 4 <= angle < -math.pi / 4:
                            sector = 'down'
                        elif -math.pi / 4 <= angle < math.pi / 4:
                            sector = 'right'
                        else:
                            sector = 'left'

                        last_sector = dev_info.get('last_stick_sector')
                        last_angle = dev_info.get('last_stick_angle', 0)

                        if sector != last_sector:
                            dev_info['last_stick_sector'] = sector
                            dev_info['last_stick_angle'] = angle
                        else:
                            delta_angle = angle - last_angle
                            # Handle angle wrapping
                            if delta_angle > math.pi: delta_angle -= 2 * math.pi
                            if delta_angle < -math.pi: delta_angle += 2 * math.pi

                            rotation_threshold = 0.2 # Radians

                            dials = stick_config.get('dials', {})
                            dial_mapping = dials.get(sector)

                            if dial_mapping:
                                if delta_angle > rotation_threshold:
                                    key_to_press = get_key(dial_mapping['increase'])
                                    keyboard.press(key_to_press)
                                    keyboard.release(key_to_press)
                                    dev_info['last_stick_angle'] = angle
                                elif delta_angle < -rotation_threshold:
                                    key_to_press = get_key(dial_mapping['decrease'])
                                    keyboard.press(key_to_press)
                                    keyboard.release(key_to_press)
                                    dev_info['last_stick_angle'] = angle


                    # --- UIへ更新通知 (ボタン) ---
                    if pressed or released:
                        await sio.emit('joycon_update', {'id': dev_info['path'], 'type': 'input', 'buttons': current_buttons})

                except (OSError, hid.HIDException) as e:
                    print(f"Error reading from Joy-Con {dev_info['path']}: {e}")
                    await handle_joycon_disconnection(dev_info['path'])
                except Exception as e:
                    print(f"An unexpected error occurred with {dev_info['path']}: {e}")
                    await handle_joycon_disconnection(dev_info['path'])

            await asyncio.sleep(0.008)

        except asyncio.CancelledError:
            print("Joy-Con task cancelled.")
            break
        except Exception as e:
            print(f"An error occurred in the Joy-Con management loop: {e}")
            await asyncio.sleep(1)

    print("Joy-Con task stopped.")
    for dev in state.joycon_devices:
        try:
            dev['hid'].close()
        except Exception as e:
            print(f"Error closing HID device on stop: {e}")


# --- サーバー起動・メイン処理 ---
@app.on_event("startup")
async def startup_event():
    load_mapping()
    state.joycon_reader_task = asyncio.create_task(scan_and_manage_joycons())

@app.on_event("shutdown")
async def shutdown_event():
    if state.joycon_reader_task:
        state.joycon_reader_task.cancel()
        await state.joycon_reader_task

if __name__ == "__main__":
    uvicorn.run(socket_app, host="127.0.0.1", port=8000)