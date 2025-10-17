import hid
import time
import math
import threading

# Nintendo's Vendor ID
NINTENDO_VID = 0x057e

# Joy-Con Product IDs
JOYCON_L_PID = 0x2006
JOYCON_R_PID = 0x2007

# --- Button Mapping Definitions ---
LEFT_MAPPING = {
    0x01: "下 (Down)", 0x02: "上 (Up)", 0x04: "右 (Right)", 0x08: "左 (Left)",
    0x10: "SR", 0x20: "SL", 0x40: "L", 0x80: "ZL",
}
RIGHT_MAPPING = {
    0x01: "Y", 0x02: "X", 0x04: "B", 0x08: "A",
    0x10: "SR", 0x20: "SL", 0x40: "R", 0x80: "ZR",
}
SHARED_MAPPING = {
    0x01: "マイナス (-)", 0x02: "プラス (+)", 0x04: "スティック押し込み (R)",
    0x08: "スティック押し込み (L)", 0x10: "ホーム (Home)", 0x20: "キャプチャ (Capture)",
}
BATTERY_MAPPING = {
    8: "満タン (Full)", 6: "中 (Medium)", 4: "低 (Low)",
    2: "要充電 (Critical)", 0: "空 (Empty)",
}

# --- Rumble Related Definitions ---
# 振動を発生させないための中立的な（無振動の）データ
NEUTRAL_RUMBLE_DATA = bytearray([0x00, 0x01, 0x40, 0x40,  # 左用4バイト
                                 0x00, 0x01, 0x40, 0x40])  # 右用4バイト

def find_joycons():
    """Finds all connected Joy-Cons (L and R)."""
    devices = []
    for device_dict in hid.enumerate():
        if device_dict['vendor_id'] == NINTENDO_VID:
            pid = device_dict['product_id']
            if pid == JOYCON_L_PID:
                devices.append({'type': 'L', 'path': device_dict['path']})
            elif pid == JOYCON_R_PID:
                devices.append({'type': 'R', 'path': device_dict['path']})
    return devices

def encode_rumble_data(frequency, amplitude):
    """
    周波数(Hz)と振幅(0.0-1.0)からJoy-Con用の4バイト振動データを生成する。
    """
    if amplitude == 0:
        # 振幅0の場合は無振動データを返す
        return bytearray([0x00, 0x01, 0x40, 0x40])
    # 周波数をJoy-Conの範囲内にクランプ（40.87～1252.55 Hz）
    freq_hz = max(40.87, min(frequency, 1252.55))
    # 周波数エンコード（Joy-Con仕様に基づき対数スケールで量子化）
    encoded_hex_freq = round(math.log2(freq_hz / 10.0) * 32.0)
    hf_data = (encoded_hex_freq - 0x60) * 4
    lf_data = encoded_hex_freq - 0x40
    # 振幅エンコード（振幅も低・中・高域で異なるスケールで量子化）
    amp = max(0.0, min(amplitude, 1.0))
    if amp > 0.23:
        encoded_hex_amp = round(math.log2(amp * 8.7) * 32.0)
    elif amp > 0.12:
        encoded_hex_amp = round(math.log2(amp * 17.0) * 16.0)
    else:
        encoded_hex_amp = round((amp * 158.8) + 16.0) if amp > 0.0 else 0
    hf_amp = encoded_hex_amp * 2
    lf_amp = int(encoded_hex_amp / 2) + 0x40
    # 4バイトの振動パケットを構築
    packet = bytearray(4)
    packet[0] = hf_data & 0xFF
    packet[1] = (((hf_data >> 8) & 0xFF) + hf_amp) & 0xFF
    packet[2] = (lf_data + ((lf_amp >> 8) & 0xFF)) & 0xFF
    packet[3] = lf_amp & 0xFF
    return packet

def send_rumble(device, packet_counter, rumble_data):
    """
    レポートID 0x10 を使用して8バイトの振動データを送信する。
    """
    payload = bytearray([0x10, packet_counter & 0xF])
    payload.extend(rumble_data)  # 振動ペイロード（8バイト）を追加
    device.write(payload)

def main():
    joycon_infos = find_joycons()
    if not joycon_infos:
        print("No Joy-Cons found.")
        return

    devices = []
    device_states = {}
    global_packet_counter = 0  # パケットカウンタ（0x0～0xFを循環）

    # サブコマンド送信関数（振動データ込み）
    def send_subcommand(device, command, data, rumble_data=NEUTRAL_RUMBLE_DATA):
        nonlocal global_packet_counter
        # レポートID 0x01 のペイロード作成
        payload = bytearray([0x01, global_packet_counter & 0xF])
        payload.extend(rumble_data)      # 8バイトの振動データ（デフォルトは無振動）
        payload.append(command)          # サブコマンドコード
        payload.extend(data)             # サブコマンド引数データ
        device.write(payload)
        # パケットカウンタを更新
        global_packet_counter = (global_packet_counter + 1) % 16

    try:
        # Joy-Conの接続と初期化
        for i, info in enumerate(joycon_infos):
            path = info['path']
            dev_type = info['type']
            dev = hid.device()
            dev.open_path(path)
            dev.set_nonblocking(1)
            print(f"Opened Joy-Con ({dev_type}). Initializing...")

            # --- 初期化シーケンス ---
            send_subcommand(dev, 0x40, b'\x01')  # IMU（ジャイロ）を有効化
            time.sleep(0.05)
            send_subcommand(dev, 0x48, b'\x01')  # 振動を有効化【振動ON】:contentReference[oaicite:6]{index=6}
            time.sleep(0.05)
            send_subcommand(dev, 0x03, b'\x30')  # 入力レポートを標準モード(0x30)に設定
            time.sleep(0.05)
            # プレイヤーLED初期設定（Joy-Conごとに1～4番目のLEDを点灯）
            led_patterns = [0x01, 0x02, 0x04, 0x08]
            initial_led_index = i % 4
            send_subcommand(dev, 0x30, bytes([led_patterns[initial_led_index]]))
            print(f"Initialized Joy-Con ({dev_type}) with LED {initial_led_index + 1}.")

            devices.append({'type': dev_type, 'hid': dev, 'path': path})
            device_states[path] = {
                'last_button_state': {},
                'last_stick_h': 2048,
                'last_stick_v': 2048,
                'led_index': initial_led_index,
                'last_battery_level': -1,
            }

        print("Reading input reports... Press A button to rumble. Press Ctrl+C to exit.")

        # メインループ：入力レポートの読み取りと処理
        while True:
            for dev_info in devices:
                device = dev_info['hid']
                dev_type = dev_info['type']
                dev_path = dev_info['path']

                report = device.read(64)
                if report and report[0] == 0x30:  # 標準入力レポート(0x30)の場合【要修正ポイント】
                    # --- Battery Level (電池残量) ---
                    battery_info = report[2]
                    battery_level = battery_info >> 4
                    last_batt = device_states[dev_path]['last_battery_level']
                    if battery_level != last_batt:
                        status = BATTERY_MAPPING.get(battery_level, f"不明 ({battery_level})")
                        charging = " (充電中)" if (battery_info & 0x10) else ""
                        print(f"電池残量 ({dev_type}): {status}{charging}")
                        device_states[dev_path]['last_battery_level'] = battery_level

                    # --- Button Parsing (ボタン解析) ---
                    byte3 = report[3]  # R側ボタン
                    byte4 = report[4]  # 共通ボタン
                    byte5 = report[5]  # L側ボタン
                    current_buttons = {}
                    if dev_type == 'L':
                        # 左Joy-Conの場合
                        for mask, name in LEFT_MAPPING.items():
                            if byte5 & mask:
                                current_buttons[name] = True
                        for mask, name in SHARED_MAPPING.items():
                            if byte4 & mask:
                                current_buttons[name] = True
                    else:  # 右Joy-Conの場合
                        for mask, name in RIGHT_MAPPING.items():
                            if byte3 & mask:
                                current_buttons[name] = True
                        for mask, name in SHARED_MAPPING.items():
                            if byte4 & mask:
                                current_buttons[name] = True

                    last_state = device_states[dev_path]['last_button_state']
                    pressed = {name for name in current_buttons if name not in last_state}
                    released = {name for name in last_state if name not in current_buttons}

                    if pressed:
                        print(f"Pressed ({dev_type}): {', '.join(sorted(pressed))}")
                        # --- プレイヤーLED切替（+-ボタン） ---
                        change_led = False
                        if dev_type == 'L' and 'マイナス (-)' in pressed:
                            change_led = True
                        elif dev_type == 'R' and 'プラス (+)' in pressed:
                            change_led = True
                        if change_led:
                            state = device_states[dev_path]
                            state['led_index'] = (state['led_index'] + 1) % 4
                            new_led = [0x01, 0x02, 0x04, 0x08][state['led_index']]
                            send_subcommand(device, 0x30, bytes([new_led]))
                            print(f"--> LED ({dev_type}) set to position {state['led_index'] + 1}")

                        # --- 振動トリガー（例：右Joy-ConのAボタン） ---
                        if dev_type == 'R' and 'A' in pressed:
                            print("--> Triggering Rumble on Joy-Con (R)")
                            # 高めの周波数・中程度の振幅で短く振動
                            rumble_pulse = encode_rumble_data(320.0, 0.5)
                            # 右Joy-Con用8バイトデータ：左側(前半)は無振動、右側(後半)に振動パターン
                            rumble_data = bytearray(8)
                            rumble_data[0:4] = NEUTRAL_RUMBLE_DATA[0:4]  # 左用は無振動
                            rumble_data[4:8] = rumble_pulse              # 右用に振動データ
                            # 振動コマンド送信（開始）
                            send_rumble(device, global_packet_counter, rumble_data)
                            global_packet_counter = (global_packet_counter + 1) % 16
                            # 100ms後に振動停止コマンドを送信するスレッドを起動
                            def stop_rumble():
                                time.sleep(0.1)
                                nonlocal global_packet_counter
                                send_rumble(device, global_packet_counter, NEUTRAL_RUMBLE_DATA)
                                global_packet_counter = (global_packet_counter + 1) % 16
                                print("--> Rumble stopped.")
                            threading.Thread(target=stop_rumble).start()

                    if released:
                        print(f"Released ({dev_type}): {', '.join(sorted(released))}")
                    # ボタン状態を更新
                    device_states[dev_path]['last_button_state'] = current_buttons

                    # --- Analog Stick Parsing (スティック値解析) ---
                    if dev_type == 'L':
                        stick_h = report[6] | ((report[7] & 0x0F) << 8)
                        stick_v = (report[7] >> 4) | (report[8] << 4)
                    else:  # dev_type == 'R'
                        stick_h = report[9] | ((report[10] & 0x0F) << 8)
                        stick_v = (report[10] >> 4) | (report[11] << 4)
                    last_h = device_states[dev_path]['last_stick_h']
                    last_v = device_states[dev_path]['last_stick_v']
                    # しきい値以上にスティックが動いたときのみ出力
                    THRESHOLD = 100
                    if abs(stick_h - last_h) > THRESHOLD or abs(stick_v - last_v) > THRESHOLD:
                        print(f"Stick ({dev_type}): (X: {stick_h}, Y: {stick_v})")
                        device_states[dev_path]['last_stick_h'] = stick_h
                        device_states[dev_path]['last_stick_v'] = stick_v

            # ポーリング間隔を数ミリ秒あける
            time.sleep(0.008)

    except IOError as e:
        print(f"Error: {e}")
    except KeyboardInterrupt:
        print("\nExiting.")
    finally:
        print("Closing devices...")
        # 終了時に全デバイスの振動を停止し、クローズする
        for dev_info in devices:
            send_rumble(dev_info['hid'], global_packet_counter, NEUTRAL_RUMBLE_DATA)
            dev_info['hid'].close()

if __name__ == '__main__':
    main()
