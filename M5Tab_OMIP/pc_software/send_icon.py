
import serial
import time
import argparse
from PIL import Image
import io
import os

# Import the generated protobuf modules
import omip_pb2

# Constants
CHUNK_SIZE = 190  # Nanopb max_size is 200, leave some buffer

def send_data(ser, data):
    """Wraps data in the simple serial protocol (~ + length + data) and sends it."""
    if len(data) > 255:
        print(f"Error: Message size {len(data)} exceeds maximum of 255 bytes.")
        return
    ser.write(b'~')
    ser.write(bytes([len(data)]))
    ser.write(data)

def main(args):
    """Main function to load, process, and send the image."""
    try:
        # --- Image Processing ---
        print(f"Opening image: {args.image_path}")
        if not os.path.exists(args.image_path):
            print(f"Error: Image file not found at {args.image_path}")
            return

        img = Image.open(args.image_path)

        # Optional: Resize the image if dimensions are provided
        if args.width and args.height:
            print(f"Resizing image to {args.width}x{args.height}")
            img = img.resize((args.width, args.height))

        # Convert to JPEG format in memory
        jpeg_buffer = io.BytesIO()
        img.save(jpeg_buffer, format='JPEG', quality=args.quality)
        image_data = jpeg_buffer.getvalue()
        total_size = len(image_data)
        print(f"Image converted to JPEG, total size: {total_size} bytes")

        # --- Serial Port Initialization ---
        print(f"Opening serial port {args.port} at {args.baudrate} bps")
        with serial.Serial(args.port, args.baudrate, timeout=1) as ser:
            time.sleep(2) # Wait for serial port to initialize

            # --- Chunking and Sending ---
            offset = 0
            while offset < total_size:
                chunk = image_data[offset:offset + CHUNK_SIZE]
                chunk_len = len(chunk)
                is_last = (offset + chunk_len) == total_size

                print(f"Sending chunk: offset={offset}, size={chunk_len}, last={is_last}")

                # Create FeedbackImage message
                feedback_msg = omip_pb2.FeedbackImage()
                feedback_msg.device_id = 0 # Broadcast or specific device
                feedback_msg.screen_id = args.screen_id
                feedback_msg.format = omip_pb2.FeedbackImage.ImageFormat.JPEG
                feedback_msg.total_size = total_size
                feedback_msg.chunk_offset = offset
                feedback_msg.chunk_data = chunk
                feedback_msg.is_last_chunk = is_last

                # Wrap it in the main message
                wrapper_msg = omip_pb2.WrapperMessage()
                wrapper_msg.feedback_image.CopyFrom(feedback_msg)

                # Serialize and send
                serialized_msg = wrapper_msg.SerializeToString()
                send_data(ser, serialized_msg)

                offset += chunk_len
                time.sleep(0.02) # Small delay between chunks

            print("Image sent successfully.")

            # --- Listen for Response ---
            print("\n--- Listening for response from device ---")
            time.sleep(0.5) # Give the device a moment to respond
            try:
                while True:
                    if ser.in_waiting > 0:
                        response = ser.read(ser.in_waiting)
                        print(response.decode('utf-8', errors='ignore'), end='')
                    else:
                        # If no data for a short period, assume no more is coming
                        time.sleep(0.2)
                        if ser.in_waiting == 0:
                            break
            except Exception as e:
                print(f"Error while reading response: {e}")
            print("\n--- End of response ---")

    except serial.SerialException as e:
        print(f"Error with serial port: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Send an icon to an OMIP device.")
    parser.add_argument("port", help="Serial port name (e.g., COM3 or /dev/ttyUSB0)")
    parser.add_argument("image_path", help="Path to the image file")
    parser.add_argument("--baudrate", type=int, default=115200, help="Serial port baud rate")
    parser.add_argument(
        "--screen-id",
        type=int,
        default=0,
        help="Target screen ID (0/100: full screen, 1000+N: grid cell N, legacy 1-17 also supported)",
    )
    parser.add_argument("--width", type=int, help="Width to resize the image to")
    parser.add_argument("--height", type=int, help="Height to resize the image to")
    parser.add_argument("--quality", type=int, default=85, help="JPEG quality (1-100)")

    args = parser.parse_args()
    main(args)
