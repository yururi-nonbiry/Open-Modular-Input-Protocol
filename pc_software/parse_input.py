import hid
import time

# Nintendo's Vendor ID
NINTENDO_VID = 0x057e

# Joy-Con Product IDs
JOYCON_L_PID = 0x2006
JOYCON_R_PID = 0x2007

# --- Button Mapping Definitions ---
# Based on HID report 0x30 (standard full mode)

# For Joy-Con (L), from report[5]
LEFT_MAPPING = {
    0x01: "下 (Down)",
    0x02: "上 (Up)",
    0x04: "右 (Right)",
    0x08: "左 (Left)",
    0x10: "SR",
    0x20: "SL",
    0x40: "L",
    0x80: "ZL",
}

# For Joy-Con (R), from report[3]
RIGHT_MAPPING = {
    0x01: "Y",
    0x02: "X",
    0x04: "B",
    0x08: "A",
    0x10: "SR",
    0x20: "SL",
    0x40: "R",
    0x80: "ZR",
}

# For both Joy-Cons, from report[4]
SHARED_MAPPING = {
    0x01: "マイナス (-)",
    0x02: "プラス (+)",
    0x04: "スティック押し込み (R)",
    0x08: "スティック押し込み (L)",
    0x10: "ホーム (Home)",
    0x20: "キャプチャ (Capture)",
}

# バッテリー残量
BATTERY_MAPPING = {
    8: "満タン (Full)",
    6: "中 (Medium)",
    4: "低 (Low)",
    2: "要充電 (Critical)",
    0: "空 (Empty)",
}

# For both Joy-Cons, Analog Stick Direction
# This is now calculated from analog values, not read directly
STICK_DIRECTION_MAPPING = {
    0: "右",
    1: "右下",
    2: "下",
    3: "左下",
    4: "左",
    5: "左上",
    6: "上",
    7: "右上",
    8: "ニュートラル",
}

# For Right Joy-Con Stick (180 degrees rotated)
STICK_DIRECTION_MAPPING_R = {
    0: "左",
    1: "左上",
    2: "上",
    3: "右上",
    4: "右",
    5: "右下",
    6: "下",
    7: "左下",
    8: "ニュートラル",
}
# --- End of Definitions ---

def find_joycons():
    """Finds all connected Joy-Cons (L and R)."""
    devices = []
    for device_dict in hid.enumerate():
        pid = device_dict['product_id']
        if device_dict['vendor_id'] == NINTENDO_VID:
            if pid == JOYCON_L_PID:
                devices.append({'type': 'L', 'path': device_dict['path']})
            elif pid == JOYCON_R_PID:
                devices.append({'type': 'R', 'path': device_dict['path']})
    return devices


def main():
    """
    Connects to all found Joy-Cons, initializes them to standard full mode,
    and parses their input reports.
    """
    joycon_infos = find_joycons()

    if not joycon_infos:
        print("No Joy-Cons found.")
        return

    devices = []
    device_states = {}
    packet_counter = 0

    # Helper to send subcommands
    def send_subcommand(device, command, data):
        nonlocal packet_counter
        payload = bytearray([0x01, packet_counter & 0xF, 0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40])
        payload.append(command)
        payload.extend(data)
        device.write(payload)
        packet_counter += 1

    try:
        for i, info in enumerate(joycon_infos):
            path = info['path']
            dev_type = info['type']
            dev = hid.device()
            dev.open_path(path)
            dev.set_nonblocking(1)
            
            print(f"Opened Joy-Con ({dev_type}). Initializing...")
            # Initialize to standard full mode
            send_subcommand(dev, 0x40, b'\x01') # Enable IMU
            time.sleep(0.05)
            send_subcommand(dev, 0x03, b'\x30') # Set report mode 0x30
            time.sleep(0.05)

            # Set initial player LED
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

        print("Reading input reports... Press Ctrl+C to exit.")

        while True:
            for dev_info in devices:
                device = dev_info['hid']
                dev_type = dev_info['type']
                dev_path = dev_info['path']

                report = device.read(64)
                
                if report and report[0] == 0x30:
                    # --- Battery Level ---
                    battery_info = report[2]
                    battery_level = battery_info >> 4
                    
                    last_battery_level = device_states[dev_path].get('last_battery_level')
                    if battery_level != last_battery_level:
                        battery_status = BATTERY_MAPPING.get(battery_level, f"不明 ({battery_level})")
                        is_charging = " (充電中)" if (battery_info & 0x10) else ""
                        print(f"電池残量 ({dev_type}): {battery_status}{is_charging}")
                        device_states[dev_path]['last_battery_level'] = battery_level

                    # --- Button Parsing ---
                    byte_3_right = report[3]
                    byte_4_shared = report[4]
                    byte_5_left = report[5]
                    current_button_state = {}

                    if dev_type == 'L':
                        for mask, name in LEFT_MAPPING.items():
                            if byte_5_left & mask: current_button_state[name] = True
                        for mask, name in SHARED_MAPPING.items():
                            if byte_4_shared & mask: current_button_state[name] = True
                    else: # dev_type == 'R'
                        for mask, name in RIGHT_MAPPING.items():
                            if byte_3_right & mask: current_button_state[name] = True
                        for mask, name in SHARED_MAPPING.items():
                            if byte_4_shared & mask: current_button_state[name] = True

                    last_button_state = device_states[dev_path]['last_button_state']
                    pressed = {name for name in current_button_state if name not in last_button_state}
                    released = {name for name in last_button_state if name not in current_button_state}

                    if pressed:
                        print(f"Pressed ({dev_type}): {', '.join(sorted(pressed))}")

                        # --- LED Control ---
                        change_led = False
                        if dev_type == 'L' and 'マイナス (-)' in pressed:
                            change_led = True
                        elif dev_type == 'R' and 'プラス (+)' in pressed:
                            change_led = True
                        
                        if change_led:
                            state = device_states[dev_path]
                            state['led_index'] = (state['led_index'] + 1) % 4
                            led_patterns = [0x01, 0x02, 0x04, 0x08]
                            new_led_pattern = led_patterns[state['led_index']]
                            send_subcommand(device, 0x30, bytes([new_led_pattern]))
                            print(f"--> LED ({dev_type}) set to position {state['led_index'] + 1}")
                        # --- End LED Control ---

                    if released: print(f"Released ({dev_type}): {', '.join(sorted(released))}")
                    device_states[dev_path]['last_button_state'] = current_button_state

                    # --- Analog Stick Parsing ---
                    if dev_type == 'L':
                        h = report[6] | ((report[7] & 0x0F) << 8)
                        v = (report[7] >> 4) | (report[8] << 4)
                    else: # dev_type == 'R'
                        h = report[9] | ((report[10] & 0x0F) << 8)
                        v = (report[10] >> 4) | (report[11] << 4)

                    last_state = device_states[dev_path]
                    last_h, last_v = last_state['last_stick_h'], last_state['last_stick_v']
                    
                    THRESHOLD = 100
                    if abs(h - last_h) > THRESHOLD or abs(v - last_v) > THRESHOLD:
                        print(f"Stick ({dev_type}): (X: {h}, Y: {v})")
                        last_state['last_stick_h'], last_state['last_stick_v'] = h, v

            time.sleep(0.008)

    except IOError as e:
        print(f"Error: {e}")
    except KeyboardInterrupt:
        print("\nExiting.")
    finally:
        print("Closing devices...")
        for dev_info in devices:
            dev_info['hid'].close()

if __name__ == '__main__':
    main()
