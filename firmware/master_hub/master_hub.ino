#include <pb_encode.h>
#include "omip.pb.h"

// --- ハードウェア定義 ---
// ボタンのピン (4つ)
const int BUTTON_PINS[] = {13, 14, 27, 26};
const int NUM_BUTTONS = sizeof(BUTTON_PINS) / sizeof(BUTTON_PINS[0]);

// アナログ入力のピン (1つ)
const int ANALOG_PIN = 34; 

// デバイスID (マスターハブは0とする)
const uint32_t DEVICE_ID = 0;

// --- 状態管理 ---
// 各ボタンの最後の状態を保存
bool last_button_states[NUM_BUTTONS] = {false};
// アナログ値の最後の状態を保存 (ノイズによる頻繁な送信を防ぐため)
int last_analog_value = 0;

// --- プロトコル定義 ---
const byte START_BYTE = 0x7E;

// ===================================
//   セットアップ
// ===================================
void setup() {
  // シリアル通信を開始
  Serial.begin(115200);

  // ボタンのピンを入力モードに設定 (プルアップ)
  for (int i = 0; i < NUM_BUTTONS; i++) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    last_button_states[i] = digitalRead(BUTTON_PINS[i]);
  }

  // アナログピンの初期値を読み込み
  last_analog_value = analogRead(ANALOG_PIN);
  
  Serial.println("Master Hub Initialized.");
}

// ===================================
//   メインループ
// ===================================
void loop() {
  // デジタル入力（ボタン）をチェック
  check_digital_inputs();

  // アナログ入力をチェック
  check_analog_inputs();

  // 処理が早すぎないように少し待つ
  delay(10);
}

// ===================================
//   入力チェック関数
// ===================================

/**
 * @brief デジタル入力ピンを監視し、状態変化があればPCに送信する
 */
void check_digital_inputs() {
  for (int i = 0; i < NUM_BUTTONS; i++) {
    bool current_state = digitalRead(BUTTON_PINS[i]);
    if (current_state != last_button_states[i]) {
      // 状態が変化した
      last_button_states[i] = current_state;
      
      // Protobufメッセージを作成して送信
      // INPUT_PULLUPなので、LOWが押された状態 (true)
      send_digital_input(DEVICE_ID, i, !current_state);
      
      delay(20); // チャタリング防止
    }
  }
}

/**
 * @brief アナログ入力ピンを監視し、値の変化が閾値を超えたらPCに送信する
 */
void check_analog_inputs() {
  int current_value = analogRead(ANALOG_PIN);

  // 閾値（例: 10）を超えたら変化したとみなす
  if (abs(current_value - last_analog_value) > 10) {
    last_analog_value = current_value;

    // 0-4095の値を0.0-1.0に正規化
    float normalized_value = current_value / 4095.0f;

    // Protobufメッセージを作成して送信
    send_analog_input(DEVICE_ID, 0, normalized_value);
  }
}

// ===================================
//   Protobuf送信用ヘルパー関数
// ===================================

/**
 * @brief デジタル入力メッセージをエンコードしてシリアル送信する
 * @param device_id デバイスID
 * @param port_id ポートID
 * @param state ON(true) / OFF(false)
 */
void send_digital_input(uint32_t device_id, uint32_t port_id, bool state) {
  omip_WrapperMessage wrapper = omip_WrapperMessage_init_zero;
  wrapper.which_message_type = omip_WrapperMessage_input_digital_tag;
  wrapper.message_type.input_digital.device_id = device_id;
  wrapper.message_type.input_digital.port_id = port_id;
  wrapper.message_type.input_digital.state = state;

  encode_and_send_message(wrapper);
}

/**
 * @brief アナログ入力メッセージをエンコードしてシリアル送信する
 * @param device_id デバイスID
 * @param port_id ポートID
 * @param value 0.0-1.0の正規化された値
 */
void send_analog_input(uint32_t device_id, uint32_t port_id, float value) {
  omip_WrapperMessage wrapper = omip_WrapperMessage_init_zero;
  wrapper.which_message_type = omip_WrapperMessage_input_analog_tag;
  wrapper.message_type.input_analog.device_id = device_id;
  wrapper.message_type.input_analog.port_id = port_id;
  wrapper.message_type.input_analog.value = value;

  encode_and_send_message(wrapper);
}

/**
 * @brief WrapperMessageをエンコードし、フレームを付けてシリアル送信する
 * @param wrapper 送信するWrapperMessage
 */
void encode_and_send_message(const omip_WrapperMessage& wrapper) {
  uint8_t buffer[128];
  pb_ostream_t stream = pb_ostream_from_buffer(buffer, sizeof(buffer));

  // メッセージをエンコード
  if (!pb_encode(&stream, omip_WrapperMessage_fields, &wrapper)) {
    Serial.println("Encoding failed!");
    return;
  }

  // --- フレームを付けて送信 ---
  // 1. 開始バイト
  Serial.write(START_BYTE);
  
  // 2. ペイロード長 (1バイト)
  byte payload_length = stream.bytes_written;
  Serial.write(payload_length);

  // 3. ペイロード本体
  Serial.write(buffer, payload_length);

  // 4. チェックサム (MVPでは省略)
}
