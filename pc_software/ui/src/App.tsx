import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import Settings from './Settings';
import DeviceGrid from './DeviceGrid';
import { useDeviceSettings } from './contexts/DeviceSettingsContext';

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

// Expose a simplified API to the main process
declare global {
    interface Window {
        api?: {
            executeShortcut: (shortcut: string) => void;
            setVolume: (volume: number) => void;
            onActiveWindowChanged: (callback: (appName: string) => void) => void;
        }
    }
}

const socket = io('http://127.0.0.1:8000');

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [devices, setDevices] = useState<{ [key: string]: DeviceData }>({});
  const [bleDevices, setBleDevices] = useState<BleDevice[]>([]);
  const [currentView, setCurrentView] = useState<'main' | 'settings'>('main');
  
  const {
    activeProfileId, 
    setActiveProfileId, 
    findProfileByAppName, 
    getActiveProfilePages, 
    getMaxPage 
  } = useDeviceSettings();

  const [currentPage, setCurrentPage] = useState(1);

  const activePages = getActiveProfilePages();
  const currentPageSettings = activePages[currentPage] || {};

  const sendAllIconsForPage = useCallback((profileId: string | null, page: number) => {
    const pages = getActiveProfilePages();
    const settingsForPage = pages[page] || {};
    console.log(`Sending icons for profile ${profileId}, page ${page}`);
    for (const key in settingsForPage) {
        const config = settingsForPage[key];
        const [deviceId, portId] = key.split('-').map(Number);
        if (config.icon) {
            socket.emit('set_feedback_image', {
                device_id: deviceId,
                port_id: portId,
                image_data: config.icon.split(',')[1]
            });
        }
    }
  }, [getActiveProfilePages]);

  // Effect for handling active window changes
  useEffect(() => {
    window.api?.onActiveWindowChanged((appName) => {
        console.log("Active app changed:", appName);
        const foundProfile = findProfileByAppName(appName);
        const newProfileId = foundProfile ? foundProfile.id : 'default';
        if (newProfileId !== activeProfileId) {
            console.log(`Switching to profile: ${newProfileId}`);
            setActiveProfileId(newProfileId);
            setCurrentPage(1); // Reset to page 1 on profile switch
        }
    });
  }, [findProfileByAppName, setActiveProfileId, activeProfileId]);

  // Effect for handling socket events
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      console.log('Connected to backend');
      sendAllIconsForPage(activeProfileId, currentPage);
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log('Disconnected from backend');
    }

    function onBleDevices(devices: BleDevice[]) {
        setBleDevices(devices);
    }

    function onDeviceData(data: DeviceData) {
      const deviceKey = `${data.device_id}-${data.port_id}`;
      setDevices(prev => ({ ...prev, [deviceKey]: data }));

      if (data.type === 'digital' && data.state) {
        if (data.port_id === 19) { 
            setCurrentPage(prev => Math.max(1, prev - 1));
            return;
        }
        if (data.port_id === 20) {
            const maxPage = getMaxPage();
            setCurrentPage(prev => Math.min(maxPage, prev + 1));
            return;
        }

        const shortcut = currentPageSettings[deviceKey]?.shortcut;
        if (shortcut && window.api) {
            console.log(`Executing shortcut: ${shortcut} from profile ${activeProfileId}, page ${currentPage}`);
            window.api.executeShortcut(shortcut);
        }
      } else if (data.type === 'analog' && data.port_id === 18 && data.value !== undefined) {
        if (window.api) window.api.setVolume(data.value);
      }
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('device_data', onDeviceData);
    socket.on('ble_devices', onBleDevices);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('device_data', onDeviceData);
      socket.off('ble_devices', onBleDevices);
    };
  }, [currentPageSettings, activeProfileId, currentPage, getMaxPage, sendAllIconsForPage]);

  // Effect to send icons when page or profile changes
  useEffect(() => {
    sendAllIconsForPage(activeProfileId, currentPage);
  }, [currentPage, activeProfileId, sendAllIconsForPage]);

  const renderView = () => {
    if (currentView === 'settings') {
      return <Settings socket={socket} activeDevices={devices} bleDevices={bleDevices} currentPage={currentPage} setCurrentPage={setCurrentPage} />;
    }
    return (
      <>
        <h2>Device States (Page {currentPage})</h2>
        <DeviceGrid devices={devices} deviceSettings={currentPageSettings} />
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
      </main>
    </div>
  );
}

export default App;