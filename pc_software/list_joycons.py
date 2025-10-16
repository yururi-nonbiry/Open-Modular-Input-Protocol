
import hid

# Nintendo's Vendor ID
NINTENDO_VID = 0x057e

# Joy-Con Product IDs
JOYCON_L_PID = 0x2006
JOYCON_R_PID = 0x2007

def main():
    """
    Lists all connected Nintendo Joy-Con devices.
    """
    print("Searching for connected Joy-Con controllers...")

    found_devices = []
    for device_dict in hid.enumerate():
        if device_dict['vendor_id'] == NINTENDO_VID:
            pid = device_dict['product_id']
            if pid == JOYCON_L_PID or pid == JOYCON_R_PID:
                device_type = "Joy-Con (L)" if pid == JOYCON_L_PID else "Joy-Con (R)"
                
                print(f"\nFound: {device_type}")
                print(f"  - Path: {device_dict['path'].decode()}")
                print(f"  - Vendor ID: {hex(device_dict['vendor_id'])}")
                print(f"  - Product ID: {hex(device_dict['product_id'])}")
                print(f"  - Product String: {device_dict['product_string']}")
                
                found_devices.append(device_dict)

    if not found_devices:
        print("\nNo Joy-Con controllers found.")
        print("Please make sure they are paired with your PC via Bluetooth.")

if __name__ == '__main__':
    main()
