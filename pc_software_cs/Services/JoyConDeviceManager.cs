using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using HidLibrary;

namespace pc_software_cs.Services
{
    public class JoyConDeviceManager : IDisposable
    {
        private const int VENDOR_ID = 0x057E;
        private const int PRODUCT_ID_L = 0x2006;
        private const int PRODUCT_ID_R = 0x2007;

        private readonly ConcurrentDictionary<string, HidDevice> _connectedJoyCons = new();
        private CancellationTokenSource? _scanCts;

        public event Action<string, string>? OnButtonPressed;     // DeviceId, ButtonName
        public event Action<string, string>? OnButtonReleased;    // DeviceId, ButtonName
        public event Action<string, int, int>? OnStickMoved;      // DeviceId, X, Y
        public event Action<string>? OnJoyConConnected;
        public event Action<string>? OnJoyConDisconnected;

        // Button Masks
        private static readonly Dictionary<int, string> LEFT_MAPPING = new()
        {
            { 0x01, "Down" }, { 0x02, "Up" }, { 0x04, "Right" }, { 0x08, "Left" },
            { 0x10, "SR" }, { 0x20, "SL" }, { 0x40, "L" }, { 0x80, "ZL" }
        };

        private static readonly Dictionary<int, string> RIGHT_MAPPING = new()
        {
            { 0x01, "Y" }, { 0x02, "X" }, { 0x04, "B" }, { 0x08, "A" },
            { 0x10, "SR" }, { 0x20, "SL" }, { 0x40, "R" }, { 0x80, "ZR" }
        };

        private static readonly Dictionary<int, string> SHARED_MAPPING = new()
        {
            { 0x01, "Minus" }, { 0x02, "Plus" }, { 0x04, "RStick" },
            { 0x08, "LStick" }, { 0x10, "Home" }, { 0x20, "Capture" }
        };

        private readonly ConcurrentDictionary<string, HashSet<string>> _lastButtonStates = new();
        private readonly ConcurrentDictionary<string, (int X, int Y)> _lastStickStates = new();

        public void StartScanning()
        {
            _scanCts = new CancellationTokenSource();
            Task.Run(() => ScanLoop(_scanCts.Token));
        }

        public void StopScanning()
        {
            _scanCts?.Cancel();
            foreach (var kvp in _connectedJoyCons)
            {
                kvp.Value.CloseDevice();
                kvp.Value.Dispose();
            }
            _connectedJoyCons.Clear();
        }

        private async Task ScanLoop(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                var devices = HidDevices.Enumerate(VENDOR_ID, PRODUCT_ID_L)
                                .Concat(HidDevices.Enumerate(VENDOR_ID, PRODUCT_ID_R));

                var currentPaths = devices.Select(d => d.DevicePath).ToHashSet();
                
                // Disconnect removed devices
                var toRemove = _connectedJoyCons.Keys.Where(k => !currentPaths.Contains(k)).ToList();
                foreach (var path in toRemove)
                {
                    if (_connectedJoyCons.TryRemove(path, out var dev))
                    {
                        dev.CloseDevice();
                        dev.Dispose();
                        _lastButtonStates.TryRemove(path, out _);
                        _lastStickStates.TryRemove(path, out _);
                        OnJoyConDisconnected?.Invoke(path);
                    }
                }

                // Connect new devices
                foreach (var device in devices)
                {
                    if (!_connectedJoyCons.ContainsKey(device.DevicePath))
                    {
                        device.OpenDevice();
                        if (device.IsOpen)
                        {
                            // Initialize JoyCon to Standard input mode (0x30)
                            InitializeJoyCon(device);
                            
                            _connectedJoyCons.TryAdd(device.DevicePath, device);
                            _lastButtonStates.TryAdd(device.DevicePath, new HashSet<string>());
                            _lastStickStates.TryAdd(device.DevicePath, (2048, 2048));
                            
                            OnJoyConConnected?.Invoke(device.DevicePath);

                            // Start reading
                            device.ReadReport(r => OnReportReceived(device, r));
                        }
                    }
                }

                await Task.Delay(2000, token);
            }
        }

        private void InitializeJoyCon(HidDevice device)
        {
            // Set Input Report Mode to Standard (0x30)
            SendSubcommand(device, 0x03, new byte[] { 0x30 });
            Thread.Sleep(50);

            // Enable IMU (Optional, needed for full 0x30 reports sometimes)
            SendSubcommand(device, 0x40, new byte[] { 0x01 });
            Thread.Sleep(50);
        }

        private byte _packetCounter = 0;
        private void SendSubcommand(HidDevice device, byte command, byte[] data)
        {
            byte[] buf = new byte[40];
            buf[0] = 0x01; // Output report ID for subcommands
            buf[1] = _packetCounter;
            
            // Neutral rumble 8 bytes
            byte[] neutralRumble = { 0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40 };
            Array.Copy(neutralRumble, 0, buf, 2, 8);
            
            buf[10] = command;
            Array.Copy(data, 0, buf, 11, data.Length);

            device.Write(buf);
            _packetCounter = (byte)((_packetCounter + 1) & 0x0F);
        }

        private void OnReportReceived(HidDevice device, HidReport report)
        {
            if (report.Data.Length == 0) return;

            string devicePath = device.DevicePath;
            bool isLeft = device.Attributes.ProductId == PRODUCT_ID_L;

            if (report.Data[0] == 0x30) // Standard input report
            {
                ParseStandardReport(devicePath, isLeft, report.Data);
            }

            // Continue reading
            if (_connectedJoyCons.ContainsKey(devicePath))
            {
                device.ReadReport(r => OnReportReceived(device, r));
            }
        }

        private void ParseStandardReport(string devicePath, bool isLeft, byte[] data)
        {
            if (data.Length < 12) return;

            byte byte3 = data[3]; // R Buttons
            byte byte4 = data[4]; // Shared Buttons
            byte byte5 = data[5]; // L Buttons

            HashSet<string> currentButtons = new HashSet<string>();

            if (isLeft)
            {
                foreach (var kvp in LEFT_MAPPING) if ((byte5 & kvp.Key) != 0) currentButtons.Add(kvp.Value);
                foreach (var kvp in SHARED_MAPPING) if ((byte4 & kvp.Key) != 0) currentButtons.Add(kvp.Value);
            }
            else
            {
                foreach (var kvp in RIGHT_MAPPING) if ((byte3 & kvp.Key) != 0) currentButtons.Add(kvp.Value);
                foreach (var kvp in SHARED_MAPPING) if ((byte4 & kvp.Key) != 0) currentButtons.Add(kvp.Value);
            }

            if (_lastButtonStates.TryGetValue(devicePath, out var lastState))
            {
                var pressed = currentButtons.Except(lastState);
                var released = lastState.Except(currentButtons);

                foreach (var btn in pressed) OnButtonPressed?.Invoke(devicePath, btn);
                foreach (var btn in released) OnButtonReleased?.Invoke(devicePath, btn);

                _lastButtonStates[devicePath] = currentButtons;
            }

            // Stick parsing
            int stickH, stickV;
            if (isLeft)
            {
                stickH = data[6] | ((data[7] & 0x0F) << 8);
                stickV = (data[7] >> 4) | (data[8] << 4);
            }
            else
            {
                stickH = data[9] | ((data[10] & 0x0F) << 8);
                stickV = (data[10] >> 4) | (data[11] << 4);
            }

            if (_lastStickStates.TryGetValue(devicePath, out var lastStick))
            {
                if (Math.Abs(stickH - lastStick.X) > 100 || Math.Abs(stickV - lastStick.Y) > 100)
                {
                    OnStickMoved?.Invoke(devicePath, stickH, stickV);
                    _lastStickStates[devicePath] = (stickH, stickV);
                }
            }
        }

        public void Dispose()
        {
            StopScanning();
        }
    }
}
