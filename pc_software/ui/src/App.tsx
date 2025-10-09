import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import Settings from './Settings';

// Define the structure of the data received from the backend
interface DeviceData {
  type: 'digital' | 'analog' | 'encoder';
  device_id: number;
  port_id: number;
  state?: boolean;
  value?: number;
  steps?: number;
}

interface BleDevice {
  name: string;
  address: string;
}

type View = 'main' | 'settings';

const socket = io('http://127.0.0.1:8000');

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastMessage, setLastMessage] = useState<DeviceData | null>(null);
  const [bleDevices, setBleDevices] = useState<BleDevice[]>([]);
  const [currentView, setCurrentView] = useState<View>('main');

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      console.log('Connected to backend');
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log('Disconnected from backend');
    }

    function onDeviceData(data: DeviceData) {
      setLastMessage(data);
    }

    function onBleDevices(devices: BleDevice[]) {
      setBleDevices(devices);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('device_data', onDeviceData);
    socket.on('ble_devices', onBleDevices);

    // Cleanup on component unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('device_data', onDeviceData);
      socket.off('ble_devices', onBleDevices);
    };
  }, []);

  const renderView = () => {
    if (currentView === 'settings') {
      return <Settings socket={socket} />;
    }
    // Default to main view
    return (
      <>
        <h2>Last Received Message:</h2>
        {lastMessage ? (
          <div className="card">
            <p><strong>Type:</strong> {lastMessage.type}</p>
            <p><strong>Device ID:</strong> {lastMessage.device_id}</p>
            <p><strong>Port ID:</strong> {lastMessage.port_id}</p>
            {lastMessage.type === 'digital' && <p><strong>State:</strong> {lastMessage.state ? 'ON' : 'OFF'}</p>}
            {lastMessage.type === 'analog' && <p><strong>Value:</strong> {lastMessage.value?.toFixed(2)}</p>}
            {lastMessage.type === 'encoder' && <p><strong>Steps:</strong> {lastMessage.steps}</p>}
          </div>
        ) : (
          <p>Waiting for data from a device...</p>
        )}
      </>
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>OMIP Controller</h1>
        <nav>
          <button onClick={() => setCurrentView(currentView === 'main' ? 'settings' : 'main')}>
            {currentView === 'main' ? 'Go to Settings' : 'Back to Main'}
          </button>
        </nav>
        <p style={{ marginBottom: 0 }}>Connection Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      </header>
      <main>
        {renderView()}
        <hr />
        <div className="ble-scan-results">
          <h2>Discovered BLE Devices:</h2>
          {bleDevices.length > 0 ? (
            <ul>
              {bleDevices.map(device => (
                <li key={device.address}>
                  {device.name} <span>({device.address})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Scanning for Bluetooth devices...</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;