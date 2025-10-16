import hid
import time

# Nintendo's Vendor ID
NINTENDO_VID = 0x057e

# Joy-Con Product IDs
JOYCON_L_PID = 0x2006
JOYCON_R_PID = 0x2007

BYTE2_MAPPING = {
    0x01: "マイナス (-)",
    0x04: "スティック押し込み (L)",
    0x20: "キャプチャ (Capture)",
    0x40: "L",
    0x80: "ZL",
}

# For Joy-Con (R)
# Byte 2 (index 1)
BYTE1_MAPPING_R = {
    0x01: "A",
    0x02: "X",
    0x04: "B",
    0x08: "Y",
    0x10: "SL",
    0x20: "SR",
}

# Byte 3 (index 2)
BYTE2_MAPPING_R = {
    0x02: "プラス (+)",
    0x08: "スティック押し込み (R)",
    0x10: "ホーム (Home)",
    0x40: "R",
    0x80: "ZR",
}

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
    Connects to all found Joy-Cons and parses their input reports.
    """
    joycon_infos = find_joycons()

    if not joycon_infos:
        print("No Joy-Cons found.")
        print("Please make sure they are paired with your PC.")
        return

    devices = []
    device_states = {}

    try:
        for info in joycon_infos:
            path = info['path']
            dev_type = info['type']
            dev = hid.device()
            dev.open_path(path)
            dev.set_nonblocking(1)
            devices.append({'type': dev_type, 'hid': dev, 'path': path})
            device_states[path] = {
                'last_button_state': {},
                'last_stick_direction': "不明",
            }
            print(f"Successfully opened Joy-Con ({dev_type}) at {path.decode()}")

        print("Reading input reports... Press Ctrl+C to exit.")

        while True:
            for dev_info in devices:
                device = dev_info['hid']
                dev_type = dev_info['type']
                dev_path = dev_info['path']

                report = device.read(64)
                
                if report and report[0] == 0x3f:
                    byte_1 = report[1]
                    byte_2 = report[2]
                    byte_3 = report[3]

                    current_button_state = {}

                    # Select mappings based on Joy-Con type
                    b1_mapping = BYTE1_MAPPING if dev_type == 'L' else BYTE1_MAPPING_R
                    b2_mapping = BYTE2_MAPPING if dev_type == 'L' else BYTE2_MAPPING_R

                    # Check buttons from Byte 1
                    for mask, name in b1_mapping.items():
                        if byte_1 & mask:
                            current_button_state[name] = True
                    
                    # Check buttons from Byte 2
                    for mask, name in b2_mapping.items():
                        if byte_2 & mask:
                            current_button_state[name] = True

                    # --- Button State Change Detection ---
                    last_button_state = device_states[dev_path]['last_button_state']
                    pressed = {name for name in current_button_state if name not in last_button_state}
                    released = {name for name in last_button_state if name not in current_button_state}

                    if pressed:
                        print(f"Pressed ({dev_type}): {', '.join(sorted(pressed))}")
                    if released:
                        print(f"Released ({dev_type}): {', '.join(sorted(released))}")

                    device_states[dev_path]['last_button_state'] = current_button_state

                    # --- Analog Stick Direction (L-Con only for now) ---
                    if dev_type == 'L':
                        stick_byte = byte_3
                        direction_name = STICK_DIRECTION_MAPPING.get(stick_byte, "ニュートラル")
                        last_stick_direction = device_states[dev_path]['last_stick_direction']

                        if last_stick_direction != direction_name:
                            print(f"スティック ({dev_type}): {direction_name}")
                            device_states[dev_path]['last_stick_direction'] = direction_name

            time.sleep(0.008) # Sleep a bit shorter for multiple devices

    except IOError as e:
        print(f"Error opening device: {e}")
    except KeyboardInterrupt:
        print("\nExiting.")
    finally:
        print("Closing devices...")
        for dev_info in devices:
            dev_info['hid'].close()


if __name__ == '__main__':
    main()
