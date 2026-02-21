using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace pc_software_cs.Services
{
    public class ConfigData
    {
        public string? icon { get; set; }
        public string action { get; set; } = "";
    }

    public class RegisteredDevice
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Type { get; set; } = "";
        public string Name { get; set; } = "";
    }

    public class AppController : IDisposable
    {
        private readonly SerialDeviceManager _serialManager;
        private readonly JoyConDeviceManager _joyconManager;
        private Dictionary<string, List<ConfigData>> _m5TabConfig = new();
        private Dictionary<string, JsonElement> _joyconConfig = new();
        private List<RegisteredDevice> _registeredDevices = new();
        
        private int _currentPage = 1;
        
        private const string M5TAB_CONFIG_FILE = "gui_config.json";
        private const string JOYCON_CONFIG_FILE = "joycon_mapping.json";
        private const string DEVICES_CONFIG_FILE = "registered_devices.json";

        public event Action<string>? OnWebMessageResponse;

        public AppController(SerialDeviceManager serialManager, JoyConDeviceManager joyconManager)
        {
            _serialManager = serialManager;
            _joyconManager = joyconManager;

            LoadConfigs();

            // M5Tab Events
            _serialManager.OnMessageReceived += msg =>
            {
                if (msg.InputDigital != null)
                {
                    int portId = (int)msg.InputDigital.PortId;
                    bool state = msg.InputDigital.State;

                    SendResponse(new { type = "device_event", @event = "input_digital", port_id = portId, state = state });

                    if (state && portId >= 0 && portId < 18)
                    {
                        var pageStr = _currentPage.ToString();
                        if (_m5TabConfig.TryGetValue(pageStr, out var pageConfig) && portId < pageConfig.Count)
                        {
                            ExecuteAction(pageConfig[portId].action);
                        }
                    }
                }
                else if (msg.InputAnalog != null)
                {
                    SendResponse(new { type = "device_event", @event = "input_analog", port_id = msg.InputAnalog.PortId, value = msg.InputAnalog.Value });
                }
            };
            
            _serialManager.OnError += err => SendResponse(new { type = "error", message = err });

            // Joy-Con Events
            _joyconManager.OnJoyConConnected += id => SendResponse(new { type = "joycon_connected", id });
            _joyconManager.OnJoyConDisconnected += id => SendResponse(new { type = "joycon_disconnected", id });
            _joyconManager.OnButtonPressed += (id, btn) => 
            {
                SendResponse(new { type = "joycon_update", id = id, updateType = "input", button = btn, state = "pressed" });
                ExecuteJoyConKeyMapping(id, btn, true);
            };
            _joyconManager.OnButtonReleased += (id, btn) => 
            {
                SendResponse(new { type = "joycon_update", id = id, updateType = "input", button = btn, state = "released" });
                ExecuteJoyConKeyMapping(id, btn, false);
            };
            _joyconManager.OnStickMoved += (id, dx, dy) =>
            {
                ExecuteJoyConStickMapping(id, dx, dy);
            };
        }

        private void LoadConfigs()
        {
            try
            {
                if (File.Exists(M5TAB_CONFIG_FILE))
                {
                    string json = File.ReadAllText(M5TAB_CONFIG_FILE);
                    _m5TabConfig = JsonSerializer.Deserialize<Dictionary<string, List<ConfigData>>>(json) ?? new();
                }
                else
                {
                    // Default initialization
                    for (int i = 1; i <= 5; i++)
                    {
                        var list = new List<ConfigData>();
                        for(int j=0; j<18; j++) list.Add(new ConfigData());
                        _m5TabConfig[i.ToString()] = list;
                    }
                }

                if (File.Exists(JOYCON_CONFIG_FILE))
                {
                    string json = File.ReadAllText(JOYCON_CONFIG_FILE);
                    _joyconConfig = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json) ?? new();
                }

                if (File.Exists(DEVICES_CONFIG_FILE))
                {
                    string json = File.ReadAllText(DEVICES_CONFIG_FILE);
                    _registeredDevices = JsonSerializer.Deserialize<List<RegisteredDevice>>(json) ?? new();
                }
            }
            catch (Exception ex)
            {
                SendResponse(new { type = "error", message = "Error loading config: " + ex.Message });
            }
        }

        private void SaveM5TabConfig()
        {
            try
            {
                string json = JsonSerializer.Serialize(_m5TabConfig, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(M5TAB_CONFIG_FILE, json);
            }
            catch (Exception ex)
            {
                SendResponse(new { type = "error", message = "Error saving config: " + ex.Message });
            }
        }

        private void SaveJoyConConfig()
        {
            try
            {
                string json = JsonSerializer.Serialize(_joyconConfig, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(JOYCON_CONFIG_FILE, json);
            }
            catch (Exception ex)
            {
                SendResponse(new { type = "error", message = "Error saving JoyCon config: " + ex.Message });
            }
        }

        private void SaveRegisteredDevices()
        {
            try
            {
                string json = JsonSerializer.Serialize(_registeredDevices, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(DEVICES_CONFIG_FILE, json);
            }
            catch (Exception ex)
            {
                SendResponse(new { type = "error", message = "Error saving devices: " + ex.Message });
            }
        }

        private void ExecuteAction(string actionString)
        {
            if (string.IsNullOrWhiteSpace(actionString)) return;

            string[] keys = actionString.ToLower().Split('+');
            List<ushort> pressedKeys = new List<ushort>();

            // Key Down
            foreach (var key in keys)
            {
                if (VirtualKeyMap.TryGetVirtualKey(key.Trim(), out ushort vk))
                {
                    InputEmulator.SimulateKeyPress(vk, true); // Create Down method in emulator
                    pressedKeys.Add(vk);
                }
            }

            // Key Up (Reverse Order)
            pressedKeys.Reverse();
            foreach (var vk in pressedKeys)
            {
                InputEmulator.SimulateKeyPress(vk, false); // Create Up method
            }
        }

        private void ExecuteJoyConKeyMapping(string deviceId, string button, bool isPressed)
        {
            if (_joyconConfig.TryGetValue("global", out var deviceConfig))
            {
                if(deviceConfig.TryGetProperty(button, out var mappedKeyProp) && mappedKeyProp.ValueKind == JsonValueKind.String)
                {
                    string mappedKey = mappedKeyProp.GetString() ?? "";
                    if (VirtualKeyMap.TryGetVirtualKey(mappedKey, out ushort vk))
                    {
                        InputEmulator.SimulateKeyPress(vk, isPressed);
                    }
                }
            }
        }

        private const double STICK_DEADZONE = 0.15;
        private const int MOUSE_SENSITIVITY = 25;

        private (double X, double Y) ProcessStickInput(int xRaw, int yRaw)
        {
            double x = (xRaw - 2048) / 2048.0;
            double y = (yRaw - 2048) / 2048.0;

            double magnitude = Math.Sqrt(x * x + y * y);
            if (magnitude < STICK_DEADZONE)
            {
                return (0.0, 0.0);
            }

            magnitude = (magnitude - STICK_DEADZONE) / (1.0 - STICK_DEADZONE);
            return (x / Math.Sqrt(x * x + y * y) * magnitude, y / Math.Sqrt(x * x + y * y) * magnitude);
        }

        private Dictionary<string, string> _lastStickDirection = new();
        private Dictionary<string, string> _lastStickSector = new();
        private Dictionary<string, double> _lastStickAngle = new();

        private void ExecuteJoyConStickMapping(string deviceId, int stickH, int stickV)
        {
            if (!_joyconConfig.TryGetValue("global", out var deviceConfig)) return;

            // Determine if LHS or RHS by examining the HID path for the Left Joy-Con Product ID (2006)
            string stickKey = deviceId.Contains("vid_057e&pid_2006", StringComparison.OrdinalIgnoreCase) ? "stick_l" : "stick_r";

            if (!deviceConfig.TryGetProperty(stickKey, out var stickConfigProp)) return;

            string stickMode = "none";
            int sensitivity = MOUSE_SENSITIVITY;
            JsonElement mappings = default;
            JsonElement dials = default;

            if (stickConfigProp.ValueKind == JsonValueKind.Object)
            {
                if (stickConfigProp.TryGetProperty("mode", out var modeProp)) stickMode = modeProp.GetString() ?? "none";
                if (stickConfigProp.TryGetProperty("sensitivity", out var sensProp) && sensProp.TryGetInt32(out int s)) sensitivity = s;
                if (stickConfigProp.TryGetProperty("mappings", out mappings)) { }
                if (stickConfigProp.TryGetProperty("dials", out dials)) { }
            }
            else if (stickConfigProp.ValueKind == JsonValueKind.String)
            {
                stickMode = stickConfigProp.GetString() ?? "none";
            }

            var (dx, dy) = ProcessStickInput(stickH, stickV);

            if (stickMode == "mouse")
            {
                // Y axis is inverted
                InputEmulator.SimulateMouseMove((int)(dx * sensitivity), (int)(-dy * sensitivity));
            }
            else if (stickMode == "8way")
            {
                double dyInverted = -dy;
                string? direction = null;
                double threshold = 0.5;

                if (dyInverted > threshold)
                {
                    if (dx > threshold) direction = "up_right";
                    else if (dx < -threshold) direction = "up_left";
                    else direction = "up";
                }
                else if (dyInverted < -threshold)
                {
                    if (dx > threshold) direction = "down_right";
                    else if (dx < -threshold) direction = "down_left";
                    else direction = "down";
                }
                else if (dx > threshold) direction = "right";
                else if (dx < -threshold) direction = "left";

                _lastStickDirection.TryGetValue(deviceId, out string? lastDirection);

                if (direction != lastDirection)
                {
                    // Release previous
                    if (lastDirection != null && mappings.ValueKind == JsonValueKind.Object && mappings.TryGetProperty(lastDirection, out var relProp))
                    {
                        if (VirtualKeyMap.TryGetVirtualKey(relProp.GetString() ?? "", out ushort vkr))
                            InputEmulator.SimulateKeyPress(vkr, false);
                    }

                    // Press new
                    if (direction != null && mappings.ValueKind == JsonValueKind.Object && mappings.TryGetProperty(direction, out var pressProp))
                    {
                        if (VirtualKeyMap.TryGetVirtualKey(pressProp.GetString() ?? "", out ushort vkp))
                            InputEmulator.SimulateKeyPress(vkp, true);
                    }

                    if (direction != null) _lastStickDirection[deviceId] = direction;
                    else _lastStickDirection.Remove(deviceId);
                }
            }
            else if (stickMode == "dial")
            {
                double magnitude = Math.Sqrt(dx * dx + dy * dy);
                if (magnitude < 0.1)
                {
                    _lastStickSector.Remove(deviceId);
                    return;
                }

                double angle = Math.Atan2(-dy, dx);
                string sector;
                if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) sector = "up";
                else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) sector = "down";
                else if (angle >= -Math.PI / 4 && angle < Math.PI / 4) sector = "right";
                else sector = "left";

                _lastStickSector.TryGetValue(deviceId, out string? lastSector);
                _lastStickAngle.TryGetValue(deviceId, out double lastAngle);

                if (sector != lastSector)
                {
                    _lastStickSector[deviceId] = sector;
                    _lastStickAngle[deviceId] = angle;
                }
                else
                {
                    double deltaAngle = angle - lastAngle;
                    if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
                    if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

                    double rotationThreshold = 0.2; // Radians

                    if (dials.ValueKind == JsonValueKind.Object && dials.TryGetProperty(sector, out var dialMapping))
                    {
                        if (deltaAngle > rotationThreshold)
                        {
                            if (dialMapping.TryGetProperty("increase", out var incProp) &&
                                VirtualKeyMap.TryGetVirtualKey(incProp.GetString() ?? "", out ushort vkInc))
                            {
                                InputEmulator.SimulateKeyPress(vkInc);
                            }
                            _lastStickAngle[deviceId] = angle;
                        }
                        else if (deltaAngle < -rotationThreshold)
                        {
                            if (dialMapping.TryGetProperty("decrease", out var decProp) &&
                                VirtualKeyMap.TryGetVirtualKey(decProp.GetString() ?? "", out ushort vkDec))
                            {
                                InputEmulator.SimulateKeyPress(vkDec);
                            }
                            _lastStickAngle[deviceId] = angle;
                        }
                    }
                }
            }
        }

        public void ProcessWebMessage(string messageJson)
        {
            try
            {
                using JsonDocument doc = JsonDocument.Parse(messageJson);
                var root = doc.RootElement;
                
                string cmdType = root.GetProperty("command").GetString() ?? root.GetProperty("type").GetString() ?? "";

                switch(cmdType)
                {
                    case "get_devices":
                        SendResponse(new { command = "get_devices", status = "success", devices = _registeredDevices });
                        break;
                    case "register_device":
                        var newDevice = new RegisteredDevice
                        {
                            Type = root.GetProperty("deviceType").GetString() ?? "",
                            Name = root.GetProperty("name").GetString() ?? "New Device"
                        };
                        _registeredDevices.Add(newDevice);
                        SaveRegisteredDevices();
                        SendResponse(new { command = "register_device", status = "success", device = newDevice });
                        break;
                    case "unregister_device":
                        string unregId = root.GetProperty("id").GetString() ?? "";
                        _registeredDevices.RemoveAll(d => d.Id == unregId);
                        SaveRegisteredDevices();
                        SendResponse(new { command = "unregister_device", status = "success", id = unregId });
                        break;
                    case "get_ports":
                        SendResponse(new { command = "get_ports", status = "success", ports = _serialManager.GetAvailablePorts() });
                        break;
                    case "connect":
                        string port = root.GetProperty("port").GetString() ?? "";
                        if (_serialManager.Connect(port))
                            SendResponse(new { command = "connect", status = "success", port = port });
                        else
                            SendResponse(new { command = "connect", status = "error", message = "Connection failed" });
                        break;
                    case "disconnect":
                        _serialManager.Disconnect();
                        SendResponse(new { command = "disconnect", status = "success" });
                        break;
                    case "get_config":
                        SendResponse(new { command = "get_config", status = "success", config = _m5TabConfig });
                        break;
                    case "save_config":
                        _m5TabConfig = JsonSerializer.Deserialize<Dictionary<string, List<ConfigData>>>(root.GetProperty("config").GetRawText()) ?? _m5TabConfig;
                        SaveM5TabConfig();
                        SendResponse(new { command = "save_config", status = "success" });
                        break;
                    case "set_page":
                        _currentPage = root.GetProperty("page").GetInt32();
                        SendResponse(new { command = "set_page", status = "success", page = _currentPage });
                        break;
                    case "send_image":
                        int screenId = root.GetProperty("screen_id").GetInt32();
                        bool clear = root.TryGetProperty("clear", out var clearProp) && clearProp.GetBoolean();
                        
                        if (clear)
                        {
                            _serialManager.SendImageClear(screenId);
                        }
                        else if (root.TryGetProperty("data_url", out var dataUrlProp))
                        {
                            string dataUrl = dataUrlProp.GetString() ?? "";
                            if (dataUrl.Contains(",")) dataUrl = dataUrl.Split(',')[1];
                            byte[] imageBytes = Convert.FromBase64String(dataUrl);
                            _serialManager.SendImageData(screenId, imageBytes);
                        }
                        SendResponse(new { command = "send_image", status = "success", screen_id = screenId });
                        break;
                    // --- Joy-Con Commands ---
                    case "load_joycon_mapping":
                        string deviceId = root.GetProperty("deviceId").GetString() ?? "";
                        JsonElement mapping = default;
                        if(_joyconConfig.TryGetValue(deviceId, out var val)) mapping = val;
                        SendResponse(new { event_name = "joycon_mapping_loaded", deviceId = deviceId, mapping = mapping });
                        break;
                    case "save_joycon_mapping":
                        string saveId = root.GetProperty("deviceId").GetString() ?? "";
                        _joyconConfig[saveId] = root.GetProperty("mapping");
                        SaveJoyConConfig();
                        SendResponse(new { event_name = "joycon_mapping_saved", status = "success" });
                        break;
                    // ------------------------
                    default:
                        SendResponse(new { status = "error", message = $"Unknown command: {cmdType}" });
                        break;
                }
            }
            catch (Exception ex)
            {
                SendResponse(new { status = "error", message = ex.Message });
            }
        }

        private void SendResponse(object data)
        {
            string json = JsonSerializer.Serialize(data, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            OnWebMessageResponse?.Invoke(json);
        }

        public void Dispose()
        {
            _serialManager.Dispose();
            _joyconManager.Dispose();
        }
    }
}
