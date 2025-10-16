import hid
import time

# Nintendo's Vendor ID
NINTENDO_VID = 0x057e

# Joy-Con Product IDs
JOYCON_L_PID = 0x2006

# --- Button Mapping Definitions ---
# Based on HID report 0x3f

# Byte 2 (index 1) contains D-Pad, SL, SR
BYTE1_MAPPING = {
    0x01: "左 (Left)",
    0x02: "下 (Down)",
    0x04: "上 (Up)",
    0x08: "右 (Right)",
    0x10: "SL",
    0x20: "SR",
}

# Byte 3 (index 2) contains other buttons
BYTE2_MAPPING = {
    0x01: "マイナス (-)",
    0x04: "スティック押し込み (L)",
    0x20: "キャプチャ (Capture)",
    0x40: "L",
    0x80: "ZL",
}
# --- End of Definitions ---


def find_joycon_path():
    """Finds the path of the first connected Joy-Con (L)."""
    for device_dict in hid.enumerate():
        if device_dict['vendor_id'] == NINTENDO_VID and device_dict['product_id'] == JOYCON_L_PID:
            return device_dict['path']
    return None


def main():
    """
    Connects to a Joy-Con (L) and parses its input reports to show button presses.
    """
    joycon_path = find_joycon_path()

    if not joycon_path:
        print("Joy-Con (L) not found.")
        print("Please make sure it is paired with your PC.")
        return

    try:
        print(f"Found Joy-Con (L) at path: {joycon_path.decode()}")
        device = hid.device()
        device.open_path(joycon_path)
        device.set_nonblocking(1)
        print("Successfully opened Joy-Con (L).")
        print("Reading input reports... Press Ctrl+C to exit.")
        print("Try pressing some buttons on the Joy-Con.")

        last_button_state = {}

        while True:
            report = device.read(64)
            
            # Process only if we get a simple HID report (ID 0x3f)
            if report and report[0] == 0x3f:
                
                byte_1 = report[1]
                byte_2 = report[2]

                current_button_state = {}

                # Check buttons from Byte 1
                for mask, name in BYTE1_MAPPING.items():
                    if byte_1 & mask:
                        current_button_state[name] = True
                
                # Check buttons from Byte 2
                for mask, name in BYTE2_MAPPING.items():
                    if byte_2 & mask:
                        current_button_state[name] = True

                # Compare with the last state to find changes
                pressed = {name for name in current_button_state if name not in last_button_state}
                released = {name for name in last_button_state if name not in current_button_state}

                if pressed:
                    print(f"Pressed: {', '.join(sorted(pressed))}")
                if released:
                    print(f"Released: {', '.join(sorted(released))}")

                last_button_state = current_button_state

            time.sleep(0.016) # Sleep for ~60Hz

    except IOError as e:
        print(f"Error opening device: {e}")
    except KeyboardInterrupt:
        print("\nExiting.")
    finally:
        if 'device' in locals() and device:
            device.close()
            print("Device closed.")


if __name__ == '__main__':
    main()
