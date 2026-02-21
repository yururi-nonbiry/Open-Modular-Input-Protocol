using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Ports;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using Omip; // Assuming the generated namespace from omip.proto

namespace pc_software_cs.Services
{
    public class SerialDeviceManager : IDisposable
    {
        private SerialPort? _serialPort;
        private CancellationTokenSource? _cancellationTokenSource;
        private BlockingCollection<byte> _ackQueue = new BlockingCollection<byte>();

        private const byte SYNC_BYTE = (byte)'~';
        private const byte ACK_READY = 0x06;
        private const byte ACK_ERROR = 0x15;
        private const int ACK_TIMEOUT_MS = 2000;
        private const int CHUNK_SIZE = 190;

        public event Action<WrapperMessage>? OnMessageReceived;
        public event Action<string>? OnError;
        public event Action? OnDisconnected;

        public string[] GetAvailablePorts()
        {
            return SerialPort.GetPortNames();
        }

        public bool Connect(string portName)
        {
            try
            {
                Disconnect();

                _serialPort = new SerialPort(portName, 115200)
                {
                    ReadTimeout = 1000,
                    WriteTimeout = 1000
                };
                
                _serialPort.Open();

                _cancellationTokenSource = new CancellationTokenSource();
                Task.Run(() => ReadLoop(_cancellationTokenSource.Token));

                return true;
            }
            catch (Exception ex)
            {
                OnError?.Invoke($"Failed to connect to {portName}: {ex.Message}");
                return false;
            }
        }

        public void Disconnect()
        {
            _cancellationTokenSource?.Cancel();
            _cancellationTokenSource = null;

            if (_serialPort != null && _serialPort.IsOpen)
            {
                try { _serialPort.Close(); } catch { }
            }
            _serialPort = null;
            OnDisconnected?.Invoke();
        }

        private void ReadLoop(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    if (_serialPort == null || !_serialPort.IsOpen)
                    {
                        break;
                    }

                    if (_serialPort.BytesToRead > 0)
                    {
                        byte firstByte = (byte)_serialPort.ReadByte();

                        if (firstByte == ACK_READY || firstByte == ACK_ERROR)
                        {
                            _ackQueue.Add(firstByte);
                            continue;
                        }

                        if (firstByte != SYNC_BYTE)
                        {
                            continue;
                        }

                        byte lengthByte = (byte)_serialPort.ReadByte();
                        if (lengthByte == 0) continue;

                        byte[] buffer = new byte[lengthByte];
                        int bytesRead = 0;
                        while(bytesRead < lengthByte)
                        {
                            int read = _serialPort.Read(buffer, bytesRead, lengthByte - bytesRead);
                            if(read <= 0) break;
                            bytesRead += read;
                        }

                        if (bytesRead == lengthByte)
                        {
                            var wrapperMsg = WrapperMessage.Parser.ParseFrom(buffer);
                            OnMessageReceived?.Invoke(wrapperMsg);
                        }
                    }
                    else
                    {
                        Thread.Sleep(5);
                    }
                }
                catch (TimeoutException) { }
                catch (Exception ex)
                {
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        OnError?.Invoke($"Serial error: {ex.Message}");
                        Disconnect();
                    }
                }
            }
        }

        private void ClearAckQueue()
        {
            while (_ackQueue.TryTake(out _)) { }
        }

        private void WaitForAck()
        {
            if (_ackQueue.TryTake(out byte ack, ACK_TIMEOUT_MS))
            {
                if (ack == ACK_ERROR)
                {
                    throw new Exception("Device reported an error via ACK.");
                }
                return;
            }
            throw new Exception("Timed out waiting for ACK from device.");
        }

        private void SendData(byte[] data)
        {
            if (_serialPort == null || !_serialPort.IsOpen)
                throw new InvalidOperationException("Device not connected.");

            if (data.Length > 255)
                throw new ArgumentException("Payload exceeds 255 bytes.");

            byte[] frame = new byte[data.Length + 2];
            frame[0] = SYNC_BYTE;
            frame[1] = (byte)data.Length;
            Buffer.BlockCopy(data, 0, frame, 2, data.Length);

            _serialPort.Write(frame, 0, frame.Length);
        }

        public void SendImageClear(int screenId)
        {
            ClearAckQueue();

            var feedback = new FeedbackImage
            {
                ScreenId = (uint)screenId,
                Format = FeedbackImage.Types.ImageFormat.Jpeg,
                TotalSize = 0,
                ChunkOffset = 0,
                ChunkData = ByteString.Empty,
                IsLastChunk = true
            };

            var wrapper = new WrapperMessage { FeedbackImage = feedback };
            SendData(wrapper.ToByteArray());
            WaitForAck();
        }

        public void SendImageData(int screenId, byte[] jpegData)
        {
            int totalSize = jpegData.Length;
            ClearAckQueue();

            int offset = 0;
            while (offset < totalSize)
            {
                int chunkSize = Math.Min(CHUNK_SIZE, totalSize - offset);
                bool isLast = (offset + chunkSize) == totalSize;

                var chunkData = new byte[chunkSize];
                Buffer.BlockCopy(jpegData, offset, chunkData, 0, chunkSize);

                var feedback = new FeedbackImage
                {
                    ScreenId = (uint)screenId,
                    Format = FeedbackImage.Types.ImageFormat.Jpeg,
                    TotalSize = (uint)totalSize,
                    ChunkOffset = (uint)offset,
                    ChunkData = ByteString.CopyFrom(chunkData),
                    IsLastChunk = isLast
                };

                var wrapper = new WrapperMessage { FeedbackImage = feedback };
                SendData(wrapper.ToByteArray());
                WaitForAck();

                offset += chunkSize;
            }
        }

        public void Dispose()
        {
            Disconnect();
            _ackQueue.Dispose();
        }
    }
}
