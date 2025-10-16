
import hid
import time

# Nintendo's Vendor ID
NINTENDO_VID = 0x057e

# Joy-Con Product IDs
JOYCON_L_PID = 0x2006
JOYCON_R_PID = 0x2007

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
    Connects to all found Joy-Cons and reads their input reports.
    """
    joycon_infos = find_joycons()

    if not joycon_infos:
        print("No Joy-Cons found.")
        print("Please make sure they are paired with your PC.")
        return

    devices = []
    try:
        for info in joycon_infos:
            path = info['path']
            dev_type = info['type']
            dev = hid.device()
            dev.open_path(path)
            dev.set_nonblocking(1)
            devices.append({'type': dev_type, 'hid': dev})
            print(f"Successfully opened Joy-Con ({dev_type}) at {path.decode()}")

        print("Reading input reports... Press Ctrl+C to exit.")

        while True:
            for dev_info in devices:
                device = dev_info['hid']
                dev_type = dev_info['type']
                report = device.read(64)
                if report:
                    hex_report = ''.join(f'{b:02x}' for b in report)
                    print(f"Report ({dev_type}): {hex_report}")
            time.sleep(0.01)

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
