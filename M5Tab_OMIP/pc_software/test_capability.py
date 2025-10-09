# OMIP Device Capability Tester
#
# このスクリプトは、OMIP互換デバイスにDeviceCapabilityRequestを送信し、
# 返ってきた応答を表示するためのテストツールです。

# --- 準備 ---
# 1. 必要なライブラリをインストールします:
#    pip install pyserial protobuf
#
# 2. Protocol Buffersコンパイラ(protoc)を使って、omip.protoからPythonコードを生成します。
#    protocがインストールされていない場合は、公式サイトからダウンロードしてください。
#    https://grpc.io/docs/protoc-installation/
#
#    プロジェクトのルートディレクトリで、以下のコマンドを実行してください:
#    protoc -I=proto --python_out=pc_software proto/omip.proto
#
#    これにより、`pc_software`ディレクトリ内に`omip_pb2.py`が生成されます。
# ------------------------------------------------------------------------------

import serial
import time
import sys

try:
    import omip_pb2
except ImportError:
    print("エラー: omip_pb2.pyが見つかりません。")
    print("このスクリプトの冒頭にある準備手順に従って、ファイルを生成してください。")
    exit()

def main():
    # ポート名のマッピング
    port_type_map = {
        omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.DIGITAL_INPUT: "DIGITAL_INPUT",
        omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.ANALOG_INPUT: "ANALOG_INPUT",
        omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.ENCODER_INPUT: "ENCODER_INPUT",
        omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.IMAGE_OUTPUT: "IMAGE_OUTPUT",
        omip_pb2.DeviceCapabilityResponse.PortDescription.PortType.LED_OUTPUT: "LED_OUTPUT",
    }

    try:
        # シリアルポートの選択
        if len(sys.argv) < 2:
            print("使用法: python test_capability.py <シリアルポート名>")
            print("例: python test_capability.py COM3")
            return
        port = sys.argv[1]
        
        ser = serial.Serial(port, 115200, timeout=2)
        print(f"{port}に接続しました。")

        # DeviceCapabilityRequestメッセージの作成
        wrapper_msg = omip_pb2.WrapperMessage()
        wrapper_msg.capability_request.SetInParent() # 空のメッセージを設定

        # メッセージのシリアライズ
        serialized_msg = wrapper_msg.SerializeToString()

        # リクエストの送信
        print("\nDeviceCapabilityRequestを送信します...")
        ser.write(serialized_msg)

        # 応答の受信
        print("デバイスからの応答を待っています...")
        size_byte = ser.read(1)
        if not size_byte:
            print("エラー: デバイスから応答がありませんでした。タイムアウトしました。")
            return
        
        data_size = int.from_bytes(size_byte, 'big')
        print(f"受信するデータ長: {data_size} bytes")

        response_data = ser.read(data_size)
        if len(response_data) != data_size:
            print(f"エラー: {data_size}バイト受信する予定でしたが、{len(response_data)}バイトしか受信できませんでした。")
            return

        # 応答のデシリアライズ
        response_wrapper = omip_pb2.WrapperMessage()
        response_wrapper.ParseFromString(response_data)

        # 応答の表示
        if response_wrapper.WhichOneof("message_type") == "capability_response":
            print("\n--- DeviceCapabilityResponse 受信成功 ---")
            cap_response = response_wrapper.capability_response
            print(f"  Device ID: {cap_response.device_id}")
            print(f"  ポート数: {len(cap_response.ports)}")
            for p in cap_response.ports:
                port_type_name = port_type_map.get(p.type, "UNKNOWN")
                print(f"    - Port ID: {p.port_id}, Type: {port_type_name}")
            print("-----------------------------------------")
        else:
            print(f"エラー: 予期しない応答を受信しました。 Type: {response_wrapper.WhichOneof('message_type')}")

    except serial.SerialException as e:
        print(f"シリアルポートエラー: {e}")
    except Exception as e:
        print(f"予期せぬエラーが発生しました: {e}")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()
            print(f"\n{port}をクローズしました。")

if __name__ == "__main__":
    main()