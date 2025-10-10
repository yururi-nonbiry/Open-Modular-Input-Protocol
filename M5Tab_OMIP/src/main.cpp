#include <M5Unified.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include "omip.pb.h"
#include "pb_decode.h"
#include "pb_encode.h"
#include <NimBLEDevice.h>

// --- BLE Configuration ---
#define OMIP_SERVICE_UUID        "ab0828b1-198e-4351-b779-901fa0e0371e"
#define DATA_CHAR_UUID         "c30528b1-198e-4351-b779-901fa0e0371e"
#define FEEDBACK_CHAR_UUID     "540528b1-198e-4351-b779-901fa0e0371e"

NimBLEServer* pServer = nullptr;
NimBLECharacteristic* pDataCharacteristic = nullptr;
NimBLECharacteristic* pFeedbackCharacteristic = nullptr;
bool g_ble_connected = false;

// --- UI & OMIP Configuration ---
constexpr int32_t GRID_ROWS = 3;
constexpr int32_t GRID_COLS = 6;
constexpr int32_t MIN_HEADER_HEIGHT = 40;
constexpr float SIDEBAR_WIDTH_RATIO = 0.2f;
int32_t g_headerHeight = MIN_HEADER_HEIGHT;
float g_current_volume = 0.5f;
#define DEVICE_ID 1
#define PORT_ANALOG_VOLUME 18
#define PORT_SWIPE_LEFT 19
#define PORT_SWIPE_RIGHT 20

// --- Function Prototypes ---
void handle_feedback_data(const uint8_t* buffer, size_t len);
void draw_ui();
void draw_header();

// --- BLE Callbacks ---
class ServerCallbacks: public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer) {
        g_ble_connected = true;
        M5.Display.fillRect(0, 0, M5.Display.width(), 20, BLACK);
        M5.Display.drawString("BLE Connected", 10, 10);
    };
    void onDisconnect(NimBLEServer* pServer) {
        g_ble_connected = false;
        M5.Display.fillRect(0, 0, M5.Display.width(), 20, BLACK);
        M5.Display.drawString("BLE Disconnected", 10, 10);
        // Restart advertising
        NimBLEDevice::getAdvertising()->start();
    }
};

class FeedbackCallbacks: public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pCharacteristic) {
        std::string value = pCharacteristic->getValue();
        if (value.length() > 0) {
            // BLE can send data in chunks, needs reassembly. For now, assume single packet.
            handle_feedback_data((const uint8_t*)value.data(), value.length());
        }
    }
};

// --- Data Sending ---
void send_data(const uint8_t* data, size_t len) {
    if (g_ble_connected && pDataCharacteristic) {
        pDataCharacteristic->setValue(data, len);
        pDataCharacteristic->notify();
    } else {
        Serial.write('~');
        Serial.write((uint8_t)len);
        Serial.write(data, len);
    }
}

void send_omip_message(omip_WrapperMessage& wrapper) {
    uint8_t buffer[256]; // Increased buffer for potentially larger messages
    pb_ostream_t stream = pb_ostream_from_buffer(buffer, sizeof(buffer));
    if (pb_encode(&stream, omip_WrapperMessage_fields, &wrapper)) {
        send_data(buffer, stream.bytes_written);
    }
}

void send_digital_input(uint32_t port_id, bool state) {
    omip_WrapperMessage wrapper = omip_WrapperMessage_init_zero;
    wrapper.which_message_type = omip_WrapperMessage_input_digital_tag;
    wrapper.message_type.input_digital.device_id = DEVICE_ID;
    wrapper.message_type.input_digital.port_id = port_id;
    wrapper.message_type.input_digital.state = state;
    send_omip_message(wrapper);
}

void send_analog_input(uint32_t port_id, float value) {
    omip_WrapperMessage wrapper = omip_WrapperMessage_init_zero;
    wrapper.which_message_type = omip_WrapperMessage_input_analog_tag;
    wrapper.message_type.input_analog.device_id = DEVICE_ID;
    wrapper.message_type.input_analog.port_id = port_id;
    wrapper.message_type.input_analog.value = value;
    send_omip_message(wrapper);
}

// --- Data Handling & UI ---
void handle_feedback_data(const uint8_t* buffer, size_t len) {
    omip_WrapperMessage received_message = omip_WrapperMessage_init_zero;
    pb_istream_t stream = pb_istream_from_buffer(buffer, len);
    if (pb_decode(&stream, omip_WrapperMessage_fields, &received_message)) {
        if (received_message.which_message_type == omip_WrapperMessage_feedback_image_tag) {
            // ... (Icon caching and drawing logic is omitted for this step)
        }
    }
}

// ... (draw_ui, draw_header, handle_touch, handle_gesture etc. are here)

// --- Setup & Loop ---
void setup_ble() {
    NimBLEDevice::init("M5Tab-OMIP");
    pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());
    NimBLEService* pService = pServer->createService(OMIP_SERVICE_UUID);
    pDataCharacteristic = pService->createCharacteristic(DATA_CHAR_UUID, NIMBLE_PROPERTY::NOTIFY);
    pFeedbackCharacteristic = pService->createCharacteristic(FEEDBACK_CHAR_UUID, NIMBLE_PROPERTY::WRITE);
    pFeedbackCharacteristic->setCallbacks(new FeedbackCallbacks());
    pService->start();
    NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(OMIP_SERVICE_UUID);
    pAdvertising->start();
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(3);
  draw_ui();
  Serial.begin(115200);
  setup_ble();
}

void loop() {
  M5.update();
  handle_touch();
  handle_gesture();

  if (!g_ble_connected && Serial.available() > 0) {
    if (Serial.read() == '~') {
        size_t len = Serial.read();
        if (len > 0) {
            uint8_t buffer[4096];
            Serial.readBytes(buffer, len);
            handle_feedback_data(buffer, len);
        }
    }
  }
}
