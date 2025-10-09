#include <M5Unified.h>
#include "omip.pb.h"
#include "pb_decode.h"
#include "pb_encode.h"

// --- OMIP Configuration ---
#define DEVICE_ID 1

// ポート定義
omip_DeviceCapabilityResponse_PortDescription ports[] = {
    // 3x6 Grid (Digital Inputs)
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 0},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 1},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 2},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 3},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 4},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 5},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 6},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 7},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 8},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 9},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 10},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 11},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 12},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 13},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 14},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 15},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 16},
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 17},

    // Sidebar (Analog Input)
    {omip_DeviceCapabilityResponse_PortDescription_PortType_ANALOG_INPUT, 18},

    // Swipe Gestures (Digital Inputs)
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 19}, // Swipe Left
    {omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT, 20}, // Swipe Right

    // Screen (Image Output)
    {omip_DeviceCapabilityResponse_PortDescription_PortType_IMAGE_OUTPUT, 0}
};

// Nanopb: repeated PortDescriptionをエンコードするためのコールバック
bool encode_ports_callback(pb_ostream_t *stream, const pb_field_t *field, void * const *arg) {
    for (int i = 0; i < (sizeof(ports) / sizeof(ports[0])); i++) {
        if (!pb_encode_tag_for_field(stream, field))
            return false;
        if (!pb_encode_submessage(stream, omip_DeviceCapabilityResponse_PortDescription_fields, &ports[i]))
            return false;
    }
    return true;
}

void send_capability_response() {
    omip_WrapperMessage response_wrapper = omip_WrapperMessage_init_zero;
    response_wrapper.which_message_type = omip_WrapperMessage_capability_response_tag;
    
    omip_DeviceCapabilityResponse *cap_response = &response_wrapper.message_type.capability_response;
    cap_response->device_id = DEVICE_ID;
    
    // コールバックを設定
    cap_response->ports.funcs.encode = &encode_ports_callback;
    cap_response->ports.arg = nullptr; // argは使用しない

    uint8_t buffer[256];
    pb_ostream_t stream = pb_ostream_from_buffer(buffer, sizeof(buffer));

    if (pb_encode(&stream, omip_WrapperMessage_fields, &response_wrapper)) {
        uint8_t size = stream.bytes_written;
        Serial.write(size);
        Serial.write(buffer, stream.bytes_written);
        M5.Display.println("Sent Caps!");
    } else {
        Serial.println("Encoding failed");
        M5.Display.println("Encode Fail!");
    }
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);

  M5.Display.setTextSize(2);
  M5.Display.setCursor(10, 10);
  M5.Display.println("OMIP Device Ready");
  M5.Display.println("Waiting for request...");

  Serial.begin(115200);
  Serial.println("M5Tab OMIP Initialized.");
}

void loop() {
  M5.update();

  if (Serial.available() > 0) {
    uint8_t buffer[128];
    size_t len = Serial.readBytes(buffer, sizeof(buffer));

    if (len > 0) {
        omip_WrapperMessage received_message = omip_WrapperMessage_init_zero;
        pb_istream_t stream = pb_istream_from_buffer(buffer, len);

        if (pb_decode(&stream, omip_WrapperMessage_fields, &received_message)) {
            if (received_message.which_message_type == omip_WrapperMessage_capability_request_tag) {
                M5.Display.println("Caps Req Received!");
                send_capability_response();
            }
        }
    }
  }
}