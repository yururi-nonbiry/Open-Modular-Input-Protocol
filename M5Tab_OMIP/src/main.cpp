#include <M5Unified.h>
#include <cstddef>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <vector>
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
uint8_t g_brightness = 128; // Brightness level (0-255)
uint8_t g_beepVolume = 128;   // Beep volume level (0-255)

#define DEVICE_ID 1
#define SCREEN_ID_FULL 0
#define SCREEN_ID_PRIMARY_PORT 100
#define SCREEN_ID_CELL_BASE 1000
#define PORT_ANALOG_VOLUME 18
#define PORT_SWIPE_LEFT 19
#define PORT_SWIPE_RIGHT 20
constexpr uint16_t COLOR_HEADER_BG = 0x39E7;   // subtle blueish grey
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

struct CellImageCache {
    std::vector<uint8_t> data;
    omip_FeedbackImage_ImageFormat format = omip_FeedbackImage_ImageFormat_JPEG;
    bool has_data = false;
};

static CellImageCache g_cell_cache[GRID_ROWS * GRID_COLS];
static int32_t g_pressed_visual_cell = -1;

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

struct ButtonRegion {
    int32_t x, y, w, h;
};

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
    ButtonRegion brightness_up_btn;
    ButtonRegion brightness_down_btn;
    ButtonRegion beep_vol_up_btn;
    ButtonRegion beep_vol_down_btn;
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
    bool gesture_consumed = false;
};

SwipeState g_swipe_state;

struct ScreenRegion;

static bool screen_id_to_cell_index(uint32_t screen_id, int32_t& cell_index);
static void redraw_cell_from_cache(int32_t cell_index, bool pressed);
static void set_cell_press_visual(int32_t cell_index, bool pressed);
static bool draw_cached_jpeg_scaled(const CellImageCache& cache, const ScreenRegion& target_region);
static bool draw_jpeg_scaled(const uint8_t* data, size_t len, const ScreenRegion& target_region);

namespace {
constexpr int32_t kCellMargin = 4;
constexpr float kGridCellScale = 0.80f;
constexpr int32_t kGridBorderThickness = 5; // number of border strokes (drawn inward)
constexpr int32_t kGridBorderCornerRadius = 12;
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
    bool is_grid_cell = false;
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
    region.is_grid_cell = false;
    uint32_t cell_index = std::numeric_limits<uint32_t>::max();

    // Prioritize grid cell range (0-17) for IDs sent from PC
    if (screen_id < GRID_ROWS * GRID_COLS) {
        cell_index = screen_id;
    } else if (screen_id >= SCREEN_ID_CELL_BASE) {
        cell_index = screen_id - SCREEN_ID_CELL_BASE;
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

        int32_t scaled_w = std::max<int32_t>(static_cast<int32_t>(std::round(static_cast<float>(usable_w) * kGridCellScale)), 1);
        int32_t scaled_h = std::max<int32_t>(static_cast<int32_t>(std::round(static_cast<float>(usable_h) * kGridCellScale)), 1);
        offset_x += (usable_w - scaled_w) / 2;
        offset_y += (usable_h - scaled_h) / 2;
        usable_w = scaled_w;
        usable_h = scaled_h;

        region.x = cell_x + offset_x;
        region.y = cell_y + offset_y;
        region.w = usable_w;
        region.h = usable_h;
        region.is_grid_cell = true;
        return true;
    }

    // Treat special screen id as full screen drawing area.
    if (screen_id == SCREEN_ID_FULL || screen_id == SCREEN_ID_PRIMARY_PORT) {
        region.x = 0;
        region.y = 0;
        region.w = g_layout.screen_width;
        region.h = g_layout.screen_height;
        region.is_grid_cell = false;
        return true;
    }

    // Fallback: draw across the full display for unexpected screen IDs.
    region.x = 0;
    region.y = 0;
    region.w = g_layout.screen_width;
    region.h = g_layout.screen_height;
    region.is_grid_cell = false;
    return false;
}

static bool screen_id_to_cell_index(uint32_t screen_id, int32_t& cell_index) {
    if (screen_id < GRID_ROWS * GRID_COLS) {
        cell_index = static_cast<int32_t>(screen_id);
        return true;
    }
    if (screen_id >= SCREEN_ID_CELL_BASE) {
        int32_t candidate = static_cast<int32_t>(screen_id - SCREEN_ID_CELL_BASE);
        if (candidate >= 0 && candidate < GRID_ROWS * GRID_COLS) {
            cell_index = candidate;
            return true;
        }
    }
    return false;
}

static bool draw_cached_jpeg_scaled(const CellImageCache& cache, const ScreenRegion& target_region) {
    if (!cache.has_data || cache.data.empty() || cache.format != omip_FeedbackImage_ImageFormat_JPEG) {
        return false;
    }
    if (target_region.w <= 0 || target_region.h <= 0) {
        return false;
    }

    return draw_jpeg_scaled(cache.data.data(), cache.data.size(), target_region);
}

static bool draw_jpeg_scaled(const uint8_t* data, size_t len, const ScreenRegion& target_region) {
    if (data == nullptr || len == 0) {
        return false;
    }
    if (target_region.w <= 0 || target_region.h <= 0) {
        return false;
    }

    bool ok;
    M5.Display.startWrite();
    M5.Display.setClipRect(target_region.x, target_region.y, target_region.w, target_region.h);
    ok = M5.Display.drawJpg(
        data,
        len,
        target_region.x,
        target_region.y,
        target_region.w,
        target_region.h,
        0,
        0,
        -1.0f,
        -1.0f);
    M5.Display.clearClipRect();
    M5.Display.endWrite();
    return ok;
}

static ScreenRegion compute_inner_grid_region(const ScreenRegion& region) {
    ScreenRegion inner = region;
    inner.is_grid_cell = false;
    if (!region.is_grid_cell) {
        return inner;
    }

    int32_t inset = kGridBorderThickness;
    if (inner.w <= inset * 2 || inner.h <= inset * 2) {
        inner.w = 0;
        inner.h = 0;
        return inner;
    }

    inner.x += inset;
    inner.y += inset;
    inner.w -= inset * 2;
    inner.h -= inset * 2;
    return inner;
}

static void draw_grid_cell_border(const ScreenRegion& region) {
    if (!region.is_grid_cell || region.w <= 0 || region.h <= 0) {
        return;
    }

    int32_t base_radius = std::min<int32_t>(kGridBorderCornerRadius, std::min(region.w, region.h) / 2);
    for (int32_t i = 0; i < kGridBorderThickness; ++i) {
        int32_t w = region.w - i * 2;
        int32_t h = region.h - i * 2;
        if (w <= 0 || h <= 0) {
            break;
        }
        int32_t radius = std::max<int32_t>(base_radius - i, 0);
        M5.Display.drawRoundRect(region.x + i, region.y + i, w, h, radius, WHITE);
    }
}

static void draw_all_cell_borders() {
    for (int32_t index = 0; index < GRID_ROWS * GRID_COLS; ++index) {
        ScreenRegion region;
        if (resolve_image_region(static_cast<uint32_t>(index), region)) {
            draw_grid_cell_border(region);
        }
    }
}

void draw_jpeg_in_region(const uint8_t* data, size_t len, const ScreenRegion& region, bool clip_to_region) {
    if (data == nullptr || len == 0 || region.w <= 0 || region.h <= 0) {
        return;
    }

    ScreenRegion content_region = compute_inner_grid_region(region);

    if (region.is_grid_cell) {
        draw_grid_cell_border(region);
    }

    const ScreenRegion& target_region = region.is_grid_cell ? content_region : region;
    if (target_region.w <= 0 || target_region.h <= 0) {
        return;
    }

    if (!draw_jpeg_scaled(data, len, target_region)) {
        if (clip_to_region) {
            M5.Display.startWrite();
            M5.Display.setClipRect(target_region.x, target_region.y, target_region.w, target_region.h);
            M5.Display.drawJpg(data, len, target_region.x, target_region.y, target_region.w, target_region.h);
            M5.Display.clearClipRect();
            M5.Display.endWrite();
        } else {
            M5.Display.drawJpg(data, len, target_region.x, target_region.y, target_region.w, target_region.h);
        }
    }
}

static void redraw_cell_from_cache(int32_t cell_index, bool pressed) {
    if (cell_index < 0 || cell_index >= GRID_ROWS * GRID_COLS) {
        return;
    }

    ScreenRegion base_region;
    if (!resolve_image_region(static_cast<uint32_t>(cell_index), base_region)) {
        return;
    }

    ScreenRegion border_region = base_region;
    if (pressed) {
        int32_t border_inset = std::max<int32_t>(2, std::min(base_region.w, base_region.h) / 12);
        int32_t max_inset = std::max<int32_t>(0, std::min(base_region.w, base_region.h) / 2 - 1);
        border_inset = std::min<int32_t>(border_inset, max_inset);
        if (border_inset > 0 && border_region.w > border_inset * 2 && border_region.h > border_inset * 2) {
            border_region.x += border_inset;
            border_region.y += border_inset;
            border_region.w -= border_inset * 2;
            border_region.h -= border_inset * 2;
        }
    }

    ScreenRegion content_region = compute_inner_grid_region(border_region);
    const CellImageCache& cache = g_cell_cache[cell_index];
    bool has_image = cache.has_data && !cache.data.empty() && cache.format == omip_FeedbackImage_ImageFormat_JPEG;

    // Clear original drawing area (including previous border) before redrawing.
    M5.Display.fillRect(base_region.x, base_region.y, base_region.w, base_region.h, BLACK);
    draw_grid_cell_border(border_region);

    if (!has_image) {
        return;
    }

    ScreenRegion target_region = content_region;
    if (!draw_cached_jpeg_scaled(cache, target_region)) {
        ScreenRegion draw_region = target_region;
        draw_region.is_grid_cell = false;
        draw_jpeg_in_region(cache.data.data(), cache.data.size(), draw_region, true);
    }
}

static void set_cell_press_visual(int32_t cell_index, bool pressed) {
    if (pressed) {
        if (g_pressed_visual_cell == cell_index) {
            return;
        }
        if (g_pressed_visual_cell >= 0) {
            redraw_cell_from_cache(g_pressed_visual_cell, false);
        }
        if (cell_index >= 0) {
            redraw_cell_from_cache(cell_index, true);
            g_pressed_visual_cell = cell_index;
        } else {
            g_pressed_visual_cell = -1;
        }
    } else {
        if (cell_index < 0) {
            if (g_pressed_visual_cell >= 0) {
                redraw_cell_from_cache(g_pressed_visual_cell, false);
                g_pressed_visual_cell = -1;
            }
            return;
        }
        if (g_pressed_visual_cell == cell_index) {
            redraw_cell_from_cache(cell_index, false);
            g_pressed_visual_cell = -1;
        }
    }
}

void handle_feedback_image(const omip_FeedbackImage& img) {
    bool success = true;

    do {
        if (img.chunk_offset == 0) {
            reset_image_reconstruction();
            if (img.total_size == 0) {
                ScreenRegion region;
                bool has_region = resolve_image_region(img.screen_id, region);
                if (has_region) {
                    M5.Display.fillRect(region.x, region.y, region.w, region.h, BLACK);
                    draw_grid_cell_border(region);
                    int32_t cell_index;
                    if (screen_id_to_cell_index(img.screen_id, cell_index)) {
                        g_cell_cache[cell_index].data.clear();
                        g_cell_cache[cell_index].has_data = false;
                        if (g_pressed_visual_cell == cell_index) {
                            g_pressed_visual_cell = -1;
                        }
                    }
                } else {
                    M5.Display.fillScreen(BLACK);
                    draw_header();
                    draw_sidebar(g_current_volume);
                    draw_all_cell_borders();
                }
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
                int32_t cell_index;
                if (screen_id_to_cell_index(g_image_recon.screen_id, cell_index)) {
                    CellImageCache& cache = g_cell_cache[cell_index];
                    cache.data.assign(g_image_recon.buffer, g_image_recon.buffer + g_image_recon.total_size);
                    cache.format = g_image_recon.format;
                    cache.has_data = true;
                    if (g_pressed_visual_cell == cell_index) {
                        redraw_cell_from_cache(cell_index, true);
                    }
                }
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

static bool point_in_button(int32_t x, int32_t y, const ButtonRegion& btn) {
    return (x >= btn.x && x < (btn.x + btn.w) && y >= btn.y && y < (btn.y + btn.h));
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
    
    M5.Display.setTextDatum(middle_left);
    M5.Display.setTextSize(2);
    M5.Display.drawString("M5Tab OMIP", 12, g_headerHeight / 2);

    // --- Draw Brightness Buttons ---
    M5.Display.setTextDatum(middle_center);
    M5.Display.setTextSize(3);
    M5.Display.drawRect(g_layout.brightness_down_btn.x, g_layout.brightness_down_btn.y, g_layout.brightness_down_btn.w, g_layout.brightness_down_btn.h, WHITE);
    M5.Display.drawString("-", g_layout.brightness_down_btn.x + g_layout.brightness_down_btn.w / 2, g_layout.brightness_down_btn.y + g_layout.brightness_down_btn.h / 2);
    M5.Display.drawRect(g_layout.brightness_up_btn.x, g_layout.brightness_up_btn.y, g_layout.brightness_up_btn.w, g_layout.brightness_up_btn.h, WHITE);
    M5.Display.drawString("+", g_layout.brightness_up_btn.x + g_layout.brightness_up_btn.w / 2, g_layout.brightness_up_btn.y + g_layout.brightness_up_btn.h / 2);
    M5.Display.setTextSize(1);
    M5.Display.drawString("BRT", g_layout.brightness_down_btn.x + (g_layout.brightness_up_btn.x - g_layout.brightness_down_btn.x + g_layout.brightness_up_btn.w) / 2, g_layout.brightness_down_btn.y - 6);

    // --- Draw Beep Volume Buttons ---
    M5.Display.setTextSize(3);
    M5.Display.drawRect(g_layout.beep_vol_down_btn.x, g_layout.beep_vol_down_btn.y, g_layout.beep_vol_down_btn.w, g_layout.beep_vol_down_btn.h, WHITE);
    M5.Display.drawString("-", g_layout.beep_vol_down_btn.x + g_layout.beep_vol_down_btn.w / 2, g_layout.beep_vol_down_btn.y + g_layout.beep_vol_down_btn.h / 2);
    M5.Display.drawRect(g_layout.beep_vol_up_btn.x, g_layout.beep_vol_up_btn.y, g_layout.beep_vol_up_btn.w, g_layout.beep_vol_up_btn.h, WHITE);
    M5.Display.drawString("+", g_layout.beep_vol_up_btn.x + g_layout.beep_vol_up_btn.w / 2, g_layout.beep_vol_up_btn.y + g_layout.beep_vol_up_btn.h / 2);
    M5.Display.setTextSize(1);
    M5.Display.drawString("BEEP", g_layout.beep_vol_down_btn.x + (g_layout.beep_vol_up_btn.x - g_layout.beep_vol_down_btn.x + g_layout.beep_vol_up_btn.w) / 2, g_layout.beep_vol_down_btn.y - 6);
    M5.Display.setTextSize(2);
    String vol_str = String(g_beepVolume * 100 / 255);
    M5.Display.drawString(vol_str, g_layout.beep_vol_down_btn.x + (g_layout.beep_vol_up_btn.x - g_layout.beep_vol_down_btn.x + g_layout.beep_vol_up_btn.w) / 2, g_layout.beep_vol_down_btn.y + g_layout.beep_vol_down_btn.h / 2);

    M5.Display.setTextDatum(top_left); // Reset datum
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

    // Calculate header button positions
    int32_t btn_size = g_headerHeight * 0.7;
    int32_t btn_margin = (g_headerHeight - btn_size) / 2;
    g_layout.brightness_up_btn = {g_layout.screen_width - btn_size - btn_margin, btn_margin, btn_size, btn_size};
    g_layout.brightness_down_btn = {g_layout.brightness_up_btn.x - btn_size - btn_margin, btn_margin, btn_size, btn_size};

    // Calculate beep volume button positions to the left of brightness controls
    int32_t separator_margin = btn_margin * 2;
    g_layout.beep_vol_up_btn = {g_layout.brightness_down_btn.x - separator_margin - btn_size, btn_margin, btn_size, btn_size};
    g_layout.beep_vol_down_btn = {g_layout.beep_vol_up_btn.x - btn_size - btn_margin, btn_margin, btn_size, btn_size};

    M5.Display.fillScreen(BLACK);
    draw_header();
    draw_sidebar(g_current_volume);
    draw_all_cell_borders();
}

void handle_touch() {
    if (!M5.Touch.isEnabled()) {
        return;
    }

    const auto& detail = M5.Touch.getDetail();
    bool pressed_begin = detail.wasPressed();
    bool pressed_now = detail.isPressed();
    bool released_now = detail.wasReleased();

    if (!pressed_begin && !pressed_now && !released_now) {
        return;
    }

    int32_t x = detail.x;
    int32_t y = detail.y;

    // Handle header buttons on press
    if (pressed_begin) {
        // Beep volume controls
        if (point_in_button(x, y, g_layout.beep_vol_up_btn)) {
            g_beepVolume = std::min(255, g_beepVolume + 16);
            M5.Speaker.setVolume(g_beepVolume);
            M5.Speaker.tone(1000, 50); // Play a short beep to confirm
            draw_header(); // Redraw header to show new volume
            set_cell_press_visual(-1, false);
            return; 
        } else if (point_in_button(x, y, g_layout.beep_vol_down_btn)) {
            g_beepVolume = std::max(0, g_beepVolume - 16);
            M5.Speaker.setVolume(g_beepVolume);
            M5.Speaker.tone(800, 50); // Play a short beep to confirm
            draw_header(); // Redraw header to show new volume
            set_cell_press_visual(-1, false);
            return;
        }

        // Brightness controls
        if (point_in_button(x, y, g_layout.brightness_up_btn)) {
            g_brightness = std::min(255, g_brightness + 32);
            M5.Display.setBrightness(g_brightness);
            set_cell_press_visual(-1, false);
            return; // Header button handled
        } else if (point_in_button(x, y, g_layout.brightness_down_btn)) {
            g_brightness = std::max(0, g_brightness - 32);
            M5.Display.setBrightness(g_brightness);
            set_cell_press_visual(-1, false);
            return; // Header button handled
        }
    }

    // --- Normal UI touch handling (Grid and Sidebar) ---
    if (pressed_begin) {
        g_touch_context.grid_active = false;
        g_touch_context.sidebar_active = false;
        g_touch_context.active_port = -1;

        int32_t port = point_to_grid_port(x, y);
        if (port >= 0) {
            g_touch_context.grid_active = true;
            g_touch_context.active_port = port;
            set_cell_press_visual(port, true);
        } else if (point_in_sidebar(x, y)) {
            g_touch_context.sidebar_active = true;
            g_current_volume = compute_volume_from_y(y);
            g_touch_context.last_volume_sent = g_current_volume;
            send_analog_input(PORT_ANALOG_VOLUME, g_current_volume);
            draw_sidebar(g_current_volume);
            set_cell_press_visual(-1, false);
        } else {
            set_cell_press_visual(-1, false);
        }
    } else if (g_touch_context.sidebar_active && pressed_now) {
        float new_volume = compute_volume_from_y(y);
        if (std::fabs(new_volume - g_touch_context.last_volume_sent) > 0.01f) {
            g_touch_context.last_volume_sent = new_volume;
            g_current_volume = new_volume;
            send_analog_input(PORT_ANALOG_VOLUME, g_current_volume);
            draw_sidebar(g_current_volume);
        }
    } else if (g_touch_context.grid_active && pressed_now) {
        int32_t port = point_to_grid_port(x, y);
        if (port != g_touch_context.active_port) {
            set_cell_press_visual(g_touch_context.active_port, false);
            if (port >= 0) {
                g_touch_context.active_port = port;
                set_cell_press_visual(port, true);
            } else {
                g_touch_context.grid_active = false;
                g_touch_context.active_port = -1;
            }
        }
    }

    if (released_now) {
        if (g_touch_context.grid_active && g_touch_context.active_port >= 0 && !g_swipe_state.gesture_consumed) {
            // Send grid button activation on release to avoid triggering during swipes
            send_digital_input(g_touch_context.active_port, true);
            send_digital_input(g_touch_context.active_port, false);
        }
        set_cell_press_visual(g_touch_context.active_port, false);
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
        g_swipe_state.gesture_consumed = false;
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
                g_swipe_state.gesture_consumed = true;
                send_digital_input(PORT_SWIPE_LEFT, true);
                send_digital_input(PORT_SWIPE_LEFT, false);
            } else {
                g_swipe_state.gesture_consumed = true;
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
  M5.Display.setBrightness(g_brightness);
  M5.Speaker.setVolume(g_beepVolume);
  draw_ui();
  Serial.begin(115200);
  setup_ble();
}

void loop() {
  M5.update();
  handle_gesture();
  handle_touch();

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
