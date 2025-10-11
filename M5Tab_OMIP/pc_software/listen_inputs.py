# OMIP Device Input Listener
#
# このスクリプトは、OMIP互換デバイスから送信される入力イベント
# (InputDigital, InputAnalogなど)を継続的に待ち受け、受信した内容を
# コンソールに表示するためのテストツールです。

import serial
import sys
import time

try:
    import omip_pb2
except ImportError:
    print("エラー: omip_pb2.pyが見つかりません。")
    print("protoc -I=proto --python_out=pc_software proto/omip.proto を実行してファイルを生成してください。")
    exit()

def main():
    if len(sys.argv) < 2:
        print("使用法: python listen_inputs.py <シリアルポート名>")
        print("例: python listen_inputs.py COM3")
        return
    port = sys.argv[1]

    try:
        ser = serial.Serial(port, 115200, timeout=0.1) # タイムアウトを短くしてCtrl+Cに反応しやすくする
        print(f"{port}に接続し、入力の待機を開始しました。")
        print("M5Tabの画面をタッチしてみてください。(終了するには Ctrl+C を押してください)")

        while True:
            # フレームの開始を待つ
            start_byte = ser.read(1)
            if not start_byte:
                continue # タイムアウト、次のループへ

            if start_byte == b'~':
                # データ長を取得
                size_byte = ser.read(1)
                if not size_byte:
                    print("警告: 開始バイト'~'の後にデータ長が続きませんでした。")
                    continue
                
                data_size = int.from_bytes(size_byte, 'big')
                
                # データ本体を受信
                response_data = ser.read(data_size)
                if len(response_data) != data_size:
                    print(f"警告: データ長が{data_size}バイトであるべきところ、{len(response_data)}バイトしか受信できませんでした。")
                    continue

                # 受信データをデコード
                wrapper = omip_pb2.WrapperMessage()
                try:
                    wrapper.ParseFromString(response_data)
                    msg_type = wrapper.WhichOneof("message_type")

                    if msg_type == "input_digital":
                        msg = wrapper.input_digital
                        state_str = 'ON' if msg.state else 'OFF'
                        print(f"[InputDigital] Port: {msg.port_id}, State: {state_str}")
                    elif msg_type == "input_analog":
                        msg = wrapper.input_analog
                        print(f"[InputAnalog]  Port: {msg.port_id}, Value: {msg.value:.4f}")
                    else:
                        print(f"[受信] 未対応のメッセージタイプ: {msg_type}")

                except Exception as e:
                    print(f"エラー: メッセージの解析に失敗しました - {e}")
            
            # '~'以外のデータは無視（デバッグ用に表示しても良い）
            # else:
            #     print(f"ノイズを検出: {start_byte.hex()}")

    except serial.SerialException as e:
        print(f"シリアルポートエラー: {e}")
    except KeyboardInterrupt:
        print("\nスクリプトを終了します。")
    except Exception as e:
        print(f"予期せぬエラーが発生しました: {e}")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()
            print(f"{port}をクローズしました。")

if __name__ == "__main__":
    main()
