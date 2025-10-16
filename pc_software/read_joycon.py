
import hid
import time

# Nintendo's Vendor ID
NINTENDO_VID = 0x057e

# Joy-Con Product IDs
JOYCON_L_PID = 0x2006

def find_joycon_path():
    """Finds the path of the first connected Joy-Con (L)."""
    for device_dict in hid.enumerate():
        if device_dict['vendor_id'] == NINTENDO_VID and device_dict['product_id'] == JOYCON_L_PID:
            return device_dict['path']
    return None

def main():
    """
    Connects to a Joy-Con (L) and reads input reports.
    """
    joycon_path = find_joycon_path()

    if not joycon_path:
        print("Joy-Con (L) not found.")
        print("Please make sure it is paired with your PC.")
        return

    try:
        print(f"Found Joy-Con (L) at path: {joycon_path.decode()}")
        # hid.device is used here, and then we open the path.
        device = hid.device()
        device.open_path(joycon_path)
        # Set the device to non-blocking mode
        device.set_nonblocking(1)
        print("Successfully opened Joy-Con (L).")
        print("Reading input reports... Press Ctrl+C to exit.")
        print("Try pressing some buttons on the Joy-Con.")

        while True:
            # Read 64 bytes
            report = device.read(64)
            if report:
                # Convert the list of integers to a hex string for display
                hex_report = ''.join(f'{b:02x}' for b in report)
                print(f"Report: {hex_report}")
            time.sleep(0.01)

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
