#include <M5Unified.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include "omip.pb.h"
#include "pb_decode.h"
#include "pb_encode.h"

#ifndef OMIP_HAS_BLE
#define OMIP_HAS_BLE 1
#endif

#if OMIP_HAS_BLE
#include <NimBLEDevice.h>
#endif

// --- BLE Configuration ---
#define OMIP_SERVICE_UUID        "ab0828b1-198e-4351-b779-901fa0e0371e"
#define DATA_CHAR_UUID         "c30528b1-198e-4351-b779-901fa0e0371e"
#define FEEDBACK_CHAR_UUID     "540528b1-198e-4351-b779-901fa0e0371e"

bool g_ble_connected = false;

#if OMIP_HAS_BLE
NimBLEServer* pServer = nullptr;
NimBLECharacteristic* pDataCharacteristic = nullptr;
NimBLECharacteristic* pFeedbackCharacteristic = nullptr;
#endif

// --- UI & OMIP Configuration ---
constexpr int32_t GRID_ROWS = 3;
constexpr int32_t GRID_COLS = 6;
constexpr int32_t MIN_HEADER_HEIGHT = 40;
constexpr float SIDEBAR_WIDTH_RATIO = 0.0f;
int32_t g_headerHeight = MIN_HEADER_HEIGHT;
float g_current_volume = 0.5f;
#define DEVICE_ID 1
#define SCREEN_ID_FULL 0
#define SCREEN_ID_PRIMARY_PORT 100
#define SCREEN_ID_CELL_BASE 1000
#define PORT_ANALOG_VOLUME 18
#define PORT_SWIPE_LEFT 19
#define PORT_SWIPE_RIGHT 20
constexpr uint16_t COLOR_HEADER_BG = 0x39E7;   // subtle blueish grey
constexpr uint16_t COLOR_GRID_LINE = 0x739C;   // light grey
constexpr uint16_t COLOR_SIDEBAR_BG = 0x18C3;  // muted grey

// --- Image Reconstruction State ---
struct ImageReconstruction {
    uint8_t* buffer = nullptr;
    size_t total_size = 0;
    size_t received_size = 0;
    uint32_t screen_id = 0;
    omip_FeedbackImage_ImageFormat format = omip_FeedbackImage_ImageFormat_JPEG;
};
ImageReconstruction g_image_recon;

constexpr uint8_t kAckReady = 0x06;  // ASCII ACK
constexpr uint8_t kAckError = 0x15;  // ASCII NAK

void reset_image_reconstruction() {
    if (g_image_recon.buffer != nullptr) {
        free(g_image_recon.buffer);
        g_image_recon.buffer = nullptr;
    }
    g_image_recon.total_size = 0;
    g_image_recon.received_size = 0;
    g_image_recon.screen_id = 0;
    g_image_recon.format = omip_FeedbackImage_ImageFormat_JPEG;
}

void send_image_ack(bool success) {
    Serial.write(success ? kAckReady : kAckError);
    Serial.flush();
}


struct LayoutInfo {
    int32_t screen_width = 0;
    int32_t screen_height = 0;
    int32_t sidebar_x = 0;
    int32_t sidebar_width = 0;
    int32_t grid_origin_x = 0;
    int32_t grid_origin_y = 0;
    int32_t grid_width = 0;
    int32_t grid_height = 0;
    int32_t cell_width = 0;
    int32_t cell_height = 0;
};

LayoutInfo g_layout;

struct TouchContext {
    bool grid_active = false;
    int32_t active_port = -1;
    bool sidebar_active = false;
    float last_volume_sent = 0.5f;
};

TouchContext g_touch_context;

struct SwipeState {
    bool active = false;
    int32_t start_x = 0;
    int32_t start_y = 0;
};

SwipeState g_swipe_state;

namespace {
constexpr int32_t kCellMargin = 4;
constexpr size_t kMaxCapabilityPorts = 22; // 18 grid + 1 analog + 2 swipe + 1 screen

struct CapabilityPortsPayload {
    omip_DeviceCapabilityResponse_PortDescription ports[kMaxCapabilityPorts];
    size_t count = 0;
};
} // namespace

static bool encode_capability_ports(pb_ostream_t* stream, const pb_field_t* field, void* const* arg) {
    const CapabilityPortsPayload* payload = static_cast<const CapabilityPortsPayload*>(*arg);
    for (size_t i = 0; i < payload->count; ++i) {
        if (!pb_encode_tag_for_field(stream, field)) {
            return false;
        }
        if (!pb_encode_submessage(stream, omip_DeviceCapabilityResponse_PortDescription_fields, &payload->ports[i])) {
            return false;
        }
    }
    return true;
}

// --- Function Prototypes ---
struct ScreenRegion {
    int32_t x = 0;
    int32_t y = 0;
    int32_t w = 0;
    int32_t h = 0;
};

void handle_feedback_data(const uint8_t* buffer, size_t len);
void draw_ui();
void draw_header();
void draw_sidebar(float volume);
void handle_touch();
void handle_gesture();

#if OMIP_HAS_BLE
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
#endif

// --- Data Sending ---
void send_data(const uint8_t* data, size_t len) {
#if OMIP_HAS_BLE
    if (g_ble_connected && pDataCharacteristic) {
        pDataCharacteristic->setValue(data, len);
        pDataCharacteristic->notify();
        return;
    }
#endif
    Serial.write('~');
    Serial.write((uint8_t)len);
    Serial.write(data, len);
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
void send_capability_response() {
    static_assert(kCellMargin >= 0, "cell margin must be non-negative");
    omip_WrapperMessage wrapper = omip_WrapperMessage_init_zero;
    wrapper.which_message_type = omip_WrapperMessage_capability_response_tag;
    omip_DeviceCapabilityResponse *cap_response = &wrapper.message_type.capability_response;

    cap_response->device_id = DEVICE_ID;

    CapabilityPortsPayload payload;

    auto add_port = [&payload](uint32_t port_id, omip_DeviceCapabilityResponse_PortDescription_PortType type) {
        if (payload.count >= kMaxCapabilityPorts) {
            return;
        }
        payload.ports[payload.count].port_id = port_id;
        payload.ports[payload.count].type = type;
        payload.count++;
    };

    // Grid: 18 digital inputs (0-17)
    for (uint32_t i = 0; i < 18; ++i) {
        add_port(i, omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT);
    }

    // Sidebar: 1 analog input (18)
    add_port(PORT_ANALOG_VOLUME, omip_DeviceCapabilityResponse_PortDescription_PortType_ANALOG_INPUT);

    // Swipe: 2 digital inputs (19, 20)
    add_port(PORT_SWIPE_LEFT, omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT);
    add_port(PORT_SWIPE_RIGHT, omip_DeviceCapabilityResponse_PortDescription_PortType_DIGITAL_INPUT);

    // Screen: 1 image output (port 100)
    add_port(100, omip_DeviceCapabilityResponse_PortDescription_PortType_IMAGE_OUTPUT);

    cap_response->ports.funcs.encode = encode_capability_ports;
    cap_response->ports.arg = &payload;

    send_omip_message(wrapper);
}

bool resolve_image_region(uint32_t screen_id, ScreenRegion& region) {
    uint32_t cell_index = std::numeric_limits<uint32_t>::max();
    if (screen_id >= SCREEN_ID_CELL_BASE) {
        cell_index = screen_id - SCREEN_ID_CELL_BASE;
    } else if (screen_id != SCREEN_ID_FULL && screen_id != SCREEN_ID_PRIMARY_PORT && screen_id < GRID_ROWS * GRID_COLS) {
        cell_index = screen_id;
    }

    if (cell_index < GRID_ROWS * GRID_COLS) {
        int32_t row = static_cast<int32_t>(cell_index / GRID_COLS);
        int32_t col = static_cast<int32_t>(cell_index % GRID_COLS);
        int32_t cell_x = g_layout.grid_origin_x + col * g_layout.cell_width;
        int32_t cell_y = g_layout.grid_origin_y + row * g_layout.cell_height;
        int32_t cell_w = g_layout.cell_width;
        int32_t cell_h = g_layout.cell_height;

        if (cell_w <= 0 || cell_h <= 0) {
            return false;
        }

        int32_t offset_x = kCellMargin / 2;
        int32_t offset_y = kCellMargin / 2;
        int32_t usable_w = cell_w - kCellMargin;
        int32_t usable_h = cell_h - kCellMargin;

        if (usable_w <= 0) {
            offset_x = 0;
            usable_w = cell_w;
        }
        if (usable_h <= 0) {
            offset_y = 0;
            usable_h = cell_h;
        }

        region.x = cell_x + offset_x;
        region.y = cell_y + offset_y;
        region.w = usable_w;
        region.h = usable_h;
        return true;
    }

    // Treat special screen id as full screen drawing area.
    if (screen_id == SCREEN_ID_FULL || screen_id == SCREEN_ID_PRIMARY_PORT) {
        region.x = 0;
        region.y = 0;
        region.w = g_layout.screen_width;
        region.h = g_layout.screen_height;
        return true;
    }

    // Fallback: draw across the full display for unexpected screen IDs.
    region.x = 0;
    region.y = 0;
    region.w = g_layout.screen_width;
    region.h = g_layout.screen_height;
    return false;
}

void draw_jpeg_in_region(const uint8_t* data, size_t len, const ScreenRegion& region, bool clip_to_region) {
    if (data == nullptr || len == 0 || region.w <= 0 || region.h <= 0) {
        return;
    }

    if (clip_to_region) {
        M5.Display.startWrite();
        M5.Display.setClipRect(region.x, region.y, region.w, region.h);
    }

    M5.Display.drawJpg(data, len, region.x, region.y, region.w, region.h);

    if (clip_to_region) {
        M5.Display.clearClipRect();
        M5.Display.endWrite();
    }
}

void handle_feedback_image(const omip_FeedbackImage& img) {
    bool success = true;

    do {
        if (img.chunk_offset == 0) {
            reset_image_reconstruction();
            if (img.total_size == 0) {
                success = false;
                break;
            }
            g_image_recon.buffer = static_cast<uint8_t*>(ps_malloc(img.total_size));
            if (g_image_recon.buffer == nullptr) {
                success = false;
                break;
            }
            g_image_recon.total_size = img.total_size;
            g_image_recon.screen_id = img.screen_id;
            g_image_recon.format = img.format;
            g_image_recon.received_size = 0;
        }

        if (g_image_recon.buffer == nullptr || img.total_size != g_image_recon.total_size) {
            success = false;
            break;
        }

        if (img.chunk_offset + img.chunk_data.size > g_image_recon.total_size) {
            success = false;
            break;
        }

        if (img.chunk_data.size > 0) {
            memcpy(g_image_recon.buffer + img.chunk_offset, img.chunk_data.bytes, img.chunk_data.size);
            size_t chunk_end = img.chunk_offset + img.chunk_data.size;
            if (chunk_end > g_image_recon.received_size) {
                g_image_recon.received_size = chunk_end;
            }
        }

        if (img.is_last_chunk) {
            bool bytes_complete = (g_image_recon.received_size == g_image_recon.total_size);
            if (bytes_complete && g_image_recon.format == omip_FeedbackImage_ImageFormat_JPEG) {
                ScreenRegion region;
                bool clip = resolve_image_region(g_image_recon.screen_id, region);
                draw_jpeg_in_region(g_image_recon.buffer, g_image_recon.total_size, region, clip);
            } else if (!bytes_complete) {
                success = false;
            }
            reset_image_reconstruction();
        }
    } while (false);

    if (!success) {
        reset_image_reconstruction();
    }

    send_image_ack(success);
}

void handle_incoming_message(omip_WrapperMessage& msg) {
    switch (msg.which_message_type) {
        case omip_WrapperMessage_capability_request_tag: {
            send_capability_response();
            break;
        }
        case omip_WrapperMessage_feedback_image_tag: {
            handle_feedback_image(msg.message_type.feedback_image);
            break;
        }
        default: {
            // Unsupported message type
            break;
        }
    }
}

static int32_t point_to_grid_port(int32_t x, int32_t y) {
    if (g_layout.cell_width <= 0 || g_layout.cell_height <= 0) {
        return -1;
    }
    if (y < g_layout.grid_origin_y || y >= g_layout.grid_origin_y + g_layout.grid_height) {
        return -1;
    }
    if (x < g_layout.grid_origin_x || x >= g_layout.grid_origin_x + g_layout.grid_width) {
        return -1;
    }
    int32_t col = (x - g_layout.grid_origin_x) / g_layout.cell_width;
    int32_t row = (y - g_layout.grid_origin_y) / g_layout.cell_height;
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
        return -1;
    }
    return row * GRID_COLS + col;
}

static bool point_in_sidebar(int32_t x, int32_t y) {
    if (g_layout.sidebar_width <= 0) {
        return false;
    }
    return (x >= g_layout.sidebar_x) && (y >= g_layout.grid_origin_y) && (y < g_layout.grid_origin_y + g_layout.grid_height);
}

static float compute_volume_from_y(int32_t y) {
    if (g_layout.grid_height <= 0) {
        return g_current_volume;
    }
    float relative = static_cast<float>(g_layout.grid_origin_y + g_layout.grid_height - y) /
                     static_cast<float>(g_layout.grid_height);
    return std::clamp(relative, 0.0f, 1.0f);
}

void draw_header() {
    M5.Display.fillRect(0, 0, M5.Display.width(), g_headerHeight, COLOR_HEADER_BG);
    M5.Display.setTextColor(WHITE, COLOR_HEADER_BG);
    M5.Display.setTextSize(2);
    M5.Display.setCursor(12, g_headerHeight / 2 - 8);
    M5.Display.print("M5Tab OMIP");
}

void draw_sidebar(float volume) {
    if (g_layout.sidebar_width <= 0) {
        return;
    }
    int32_t sidebar_y = g_layout.grid_origin_y;
    int32_t sidebar_height = g_layout.grid_height;
    M5.Display.fillRect(g_layout.sidebar_x, sidebar_y, g_layout.sidebar_width, sidebar_height, COLOR_SIDEBAR_BG);
    M5.Display.drawRect(g_layout.sidebar_x, sidebar_y, g_layout.sidebar_width, sidebar_height, WHITE);

    int32_t indicator_height = std::max<int32_t>(6, g_layout.cell_height / 3);
    int32_t indicator_y = sidebar_y + sidebar_height - static_cast<int32_t>(volume * sidebar_height) - indicator_height / 2;
    indicator_y = std::max(sidebar_y + 2, std::min(sidebar_y + sidebar_height - indicator_height - 2, indicator_y));
    M5.Display.fillRect(g_layout.sidebar_x + 4, indicator_y, g_layout.sidebar_width - 8, indicator_height, WHITE);
}

void draw_ui() {
    g_layout.screen_width = M5.Display.width();
    g_layout.screen_height = M5.Display.height();
    g_headerHeight = std::max(MIN_HEADER_HEIGHT, g_layout.screen_height / 8);
    g_layout.sidebar_width = static_cast<int32_t>(g_layout.screen_width * SIDEBAR_WIDTH_RATIO);
    g_layout.sidebar_x = g_layout.screen_width - g_layout.sidebar_width;
    g_layout.grid_origin_x = 0;
    g_layout.grid_origin_y = g_headerHeight;
    g_layout.grid_width = g_layout.screen_width - g_layout.sidebar_width;
    g_layout.grid_height = g_layout.screen_height - g_layout.grid_origin_y;
    g_layout.cell_width = GRID_COLS > 0 ? g_layout.grid_width / GRID_COLS : 0;
    g_layout.cell_height = GRID_ROWS > 0 ? g_layout.grid_height / GRID_ROWS : 0;

    M5.Display.fillScreen(BLACK);
    draw_header();

    for (int32_t r = 0; r <= GRID_ROWS; ++r) {
        int32_t y = g_layout.grid_origin_y + r * g_layout.cell_height;
        M5.Display.drawFastHLine(g_layout.grid_origin_x, y, g_layout.grid_width, COLOR_GRID_LINE);
    }

    for (int32_t c = 0; c <= GRID_COLS; ++c) {
        int32_t x = g_layout.grid_origin_x + c * g_layout.cell_width;
        M5.Display.drawFastVLine(x, g_layout.grid_origin_y, g_layout.grid_height, COLOR_GRID_LINE);
    }

    if (g_layout.sidebar_width > 0) {
        M5.Display.drawFastVLine(g_layout.sidebar_x, g_layout.grid_origin_y, g_layout.grid_height, COLOR_GRID_LINE);
    }

    draw_sidebar(g_current_volume);
}

void handle_touch() {
    if (!M5.Touch.isEnabled()) {
        return;
    }

    const auto& detail = M5.Touch.getDetail();
    bool pressed_now = detail.isPressed();
    bool pressed_begin = detail.wasPressed();
    bool released_now = detail.wasReleased();

    if (!(pressed_now || pressed_begin || released_now)) {
        return;
    }

    int32_t x = detail.x;
    int32_t y = detail.y;

    if (pressed_begin) {
        g_touch_context.grid_active = false;
        g_touch_context.sidebar_active = false;
        g_touch_context.active_port = -1;

        int32_t port = point_to_grid_port(x, y);
        if (port >= 0) {
            g_touch_context.grid_active = true;
            g_touch_context.active_port = port;
            send_digital_input(port, true);
        } else if (point_in_sidebar(x, y)) {
            g_touch_context.sidebar_active = true;
            g_current_volume = compute_volume_from_y(y);
            g_touch_context.last_volume_sent = g_current_volume;
            send_analog_input(PORT_ANALOG_VOLUME, g_current_volume);
            draw_sidebar(g_current_volume);
        }
    } else if (g_touch_context.sidebar_active && pressed_now) {
        float new_volume = compute_volume_from_y(y);
        if (std::fabs(new_volume - g_touch_context.last_volume_sent) > 0.01f) {
            g_touch_context.last_volume_sent = new_volume;
            g_current_volume = new_volume;
            send_analog_input(PORT_ANALOG_VOLUME, g_current_volume);
            draw_sidebar(g_current_volume);
        }
    }

    if (released_now) {
        if (g_touch_context.grid_active && g_touch_context.active_port >= 0) {
            send_digital_input(g_touch_context.active_port, false);
        }
        g_touch_context.grid_active = false;
        g_touch_context.sidebar_active = false;
        g_touch_context.active_port = -1;
    }
}

void handle_gesture() {
    if (!M5.Touch.isEnabled()) {
        return;
    }

    const auto& detail = M5.Touch.getDetail();
    if (detail.wasPressed()) {
        if (detail.y >= g_layout.grid_origin_y && detail.x < g_layout.sidebar_x) {
            g_swipe_state.active = true;
            g_swipe_state.start_x = detail.x;
            g_swipe_state.start_y = detail.y;
        } else {
            g_swipe_state.active = false;
        }
    } else if (detail.wasReleased() && g_swipe_state.active) {
        int32_t dx = detail.x - g_swipe_state.start_x;
        int32_t dy = detail.y - g_swipe_state.start_y;
        int32_t abs_dx = dx >= 0 ? dx : -dx;
        int32_t abs_dy = dy >= 0 ? dy : -dy;
        if (abs_dx > 40 && abs_dx > abs_dy) {
            if (dx < 0) {
                send_digital_input(PORT_SWIPE_LEFT, true);
                send_digital_input(PORT_SWIPE_LEFT, false);
            } else {
                send_digital_input(PORT_SWIPE_RIGHT, true);
                send_digital_input(PORT_SWIPE_RIGHT, false);
            }
        }
        g_swipe_state.active = false;
    }
}

// --- Setup & Loop ---
#if OMIP_HAS_BLE
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
#else
void setup_ble() {
    g_ble_connected = false;
}
#endif

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

  // Handle incoming serial data
  if (Serial.available() > 0) {
    if (Serial.read() == '~') { // Start of frame
        // Wait for the length byte with a timeout
        unsigned long startTime = millis();
        while (Serial.available() < 1) {
            if (millis() - startTime > 100) { // 100ms timeout
                return; // Timeout waiting for length
            }
        }
        size_t len = Serial.read();

        if (len > 0) {
            uint8_t buffer[256]; // Max message size
            // Wait for the full message with a timeout
            startTime = millis();
            while (Serial.available() < len) {
                if (millis() - startTime > 500) { // 500ms timeout
                    return; // Timeout waiting for data
                }
            }
            Serial.readBytes(buffer, len);

            omip_WrapperMessage received_message = omip_WrapperMessage_init_zero;
            pb_istream_t stream = pb_istream_from_buffer(buffer, len);
            if (pb_decode(&stream, omip_WrapperMessage_fields, &received_message)) {
                handle_incoming_message(received_message);
            }
        }
    }
  }
}
