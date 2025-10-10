#!/usr/bin/env python3
"""OMIP Device Capability tester."""

from __future__ import annotations

import sys
import time
from typing import Dict

try:
    import serial  # type: ignore
except ImportError:
    print("エラー: pyserial が見つかりません。`pip install pyserial` を実行してください。")
    sys.exit(1)

try:
    import omip_pb2  # type: ignore
except ImportError:
    print("エラー: omip_pb2.py が見つかりません。")
    print("プロジェクトルートで `protoc -I=proto --python_out=pc_software proto/omip.proto` を実行して生成してください。")
    sys.exit(1)


FRAME_START = b"~"
SERIAL_BAUDRATE = 115200
SERIAL_TIMEOUT = 0.1  # 秒
BOOT_WAIT_SECONDS = 2.5
RESPONSE_TIMEOUT_SECONDS = 5.0

PORT_TYPE_LABELS: Dict[int, str] = {
    omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.DIGITAL_INPUT: "DIGITAL_INPUT",
    omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.ANALOG_INPUT: "ANALOG_INPUT",
    omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.ENCODER_INPUT: "ENCODER_INPUT",
    omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.IMAGE_OUTPUT: "IMAGE_OUTPUT",
    omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.LED_OUTPUT: "LED_OUTPUT",
}


def usage() -> None:
    print("使用方法: python test_capability.py <シリアルポート名>")
    print("  例: python test_capability.py COM5")


def wait_for_device_boot(ser: serial.Serial) -> None:
    """Give the ESP32 a moment to reboot after the port is opened."""
    print("デバイスの起動を待機します...")
    time.sleep(BOOT_WAIT_SECONDS)
    ser.reset_input_buffer()
    ser.reset_output_buffer()


def build_capability_request() -> bytes:
    wrapper = omip_pb2.WrapperMessage()
    wrapper.capability_request.SetInParent()
    payload = wrapper.SerializeToString()
    if len(payload) > 0xFF:
        raise ValueError("エラー: DeviceCapabilityRequest が 255 バイトを超えました。")
    return FRAME_START + len(payload).to_bytes(1, "big") + payload


def read_exact(ser: serial.Serial, size: int, deadline: float) -> bytes:
    """Read exactly `size` bytes or raise TimeoutError."""
    buffer = bytearray()
    while len(buffer) < size:
        if time.time() > deadline:
            raise TimeoutError
        chunk = ser.read(size - len(buffer))
        if chunk:
            buffer.extend(chunk)
    return bytes(buffer)


def read_frame(ser: serial.Serial, timeout: float) -> bytes:
    """Read one framed OMIP message (`~` + size + payload`)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        byte = ser.read(1)
        if not byte:
            continue
        if byte != FRAME_START:
            # Ignore stray bytes (e.g. boot logs) and keep waiting.
            continue
        size_bytes = read_exact(ser, 1, deadline)
        payload_size = size_bytes[0]
        if payload_size == 0:
            return b""
        return read_exact(ser, payload_size, deadline)
    raise TimeoutError


def print_capabilities(response: omip_pb2.DeviceCapabilityResponse) -> None:
    print("\n--- DeviceCapabilityResponse 受信成功 ---")
    print(f"  Device ID: {response.device_id}")
    print(f"  ポート数: {len(response.ports)}")
    for port in response.ports:
        label = PORT_TYPE_LABELS.get(port.type, "UNKNOWN")
        print(f"    - Port ID: {port.port_id}, Type: {label}")
    print("-----------------------------------------")


def main() -> int:
    if len(sys.argv) < 2:
        usage()
        return 1

    port = sys.argv[1]

    try:
        ser = serial.Serial(
            port=port,
            baudrate=SERIAL_BAUDRATE,
            timeout=SERIAL_TIMEOUT,
            write_timeout=1.0,
            rtscts=False,
            dsrdtr=False,
        )
        ser.dtr = False
        ser.rts = False
    except serial.SerialException as exc:
        print(f"シリアルポートエラー: {exc}")
        return 1

    try:
        print(f"{port}に接続しました。")
        wait_for_device_boot(ser)

        frame = build_capability_request()
        print("\nDeviceCapabilityRequestを送信します...")
        ser.write(frame)
        ser.flush()

        print("デバイスからの応答を待っています...")
        payload = read_frame(ser, RESPONSE_TIMEOUT_SECONDS)

        wrapper = omip_pb2.WrapperMessage()
        wrapper.ParseFromString(payload)

        if wrapper.WhichOneof("message_type") == "capability_response":
            print_capabilities(wrapper.capability_response)
        else:
            msg_type = wrapper.WhichOneof("message_type")
            print(f"エラー: 予期しない応答を受信しました ({msg_type})。")
            return 1

    except TimeoutError:
        print("エラー: デバイスから応答がありませんでした。タイムアウトしました。")
        return 1
    except serial.SerialException as exc:
        print(f"シリアルポートエラー: {exc}")
        return 1
    except Exception as exc:  # pylint: disable=broad-except
        print(f"予期せぬエラーが発生しました: {exc}")
        return 1
    finally:
        if ser.is_open:
            ser.close()
            print(f"\n{port}をクローズしました。")

    return 0


if __name__ == "__main__":
    sys.exit(main())
