#include <M5Unified.h>
#include "omip.pb.h"
#include "pb_decode.h"
#include "pb_encode.h"

// --- UI Configuration ---
#define HEADER_HEIGHT 30
#define GRID_ROWS 3
#define GRID_COLS 6

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

void draw_ui() {
    M5.Display.clear();
    M5.Display.setTextSize(2);

    // --- Draw Layout ---
    int32_t screen_width = M5.Display.width();
    int32_t screen_height = M5.Display.height();

    // Header
    M5.Display.drawLine(0, HEADER_HEIGHT, screen_width, HEADER_HEIGHT, WHITE);
    M5.Display.setCursor(10, 10);
    M5.Display.print("Waiting for request...");

    // Grid Area Calculation (to make cells square)
    int32_t grid_area_width = screen_width; // Use full width
    int32_t available_height = screen_height - HEADER_HEIGHT;
    
    // To make cells square, cell_width should equal cell_height.
    // cell_width = grid_area_width / GRID_COLS
    // cell_height = grid_height / GRID_ROWS
    // Let cell_width = cell_height, so grid_height = (grid_area_width / GRID_COLS) * GRID_ROWS
    int32_t grid_height = (grid_area_width * GRID_ROWS) / GRID_COLS;
    int32_t y_offset = HEADER_HEIGHT + (available_height - grid_height) / 2;

    // Vertical lines
    for (int i = 1; i < GRID_COLS; i++) {
        int32_t x = (grid_area_width * i) / GRID_COLS;
        M5.Display.drawLine(x, y_offset, x, y_offset + grid_height, WHITE);
    }
    // Horizontal lines
    for (int i = 1; i < GRID_ROWS; i++) {
        int32_t y = y_offset + (grid_height * i) / GRID_ROWS;
        M5.Display.drawLine(0, y, grid_area_width, y, WHITE);
    }
    // Draw outer box for the grid to make it a complete wireframe
    M5.Display.drawRect(0, y_offset, grid_area_width, grid_height, WHITE);
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);

  draw_ui();

  Serial.begin(115200);
  Serial.println("M5Tab OMIP Initialized.");
}

void loop() {
  M5.update();

  if (Serial.available() > 0) {
    uint8_t buffer[128];
    // Read size byte first
    size_t size_byte = Serial.read();
    if (size_byte > 0) {
        size_t len = Serial.readBytes(buffer, size_byte);

        if (len == size_byte) {
            omip_WrapperMessage received_message = omip_WrapperMessage_init_zero;
            pb_istream_t stream = pb_istream_from_buffer(buffer, len);

            if (pb_decode(&stream, omip_WrapperMessage_fields, &received_message)) {
                if (received_message.which_message_type == omip_WrapperMessage_capability_request_tag) {
                    M5.Display.fillRect(0, 0, M5.Display.width(), HEADER_HEIGHT, BLACK);
                    M5.Display.setCursor(10, 10);
                    M5.Display.print("Caps Req Received!");
                    send_capability_response();
                }
            }
        }
    }
  }
}
