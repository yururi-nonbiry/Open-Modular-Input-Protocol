import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import ConnectionSettings from './ConnectionSettings';
import ThemeSettings from './ThemeSettings';
import DeviceSettings from './DeviceSettings';

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

interface SettingsProps {
  socket: Socket;
  activeDevices: { [key: string]: DeviceData };
  bleDevices: BleDevice[];
  currentPage: number;
  setCurrentPage: (page: number) => void;
}

type Tab = 'connection' | 'appearance' | 'devices';

const Settings: React.FC<SettingsProps> = ({ socket, activeDevices, bleDevices, currentPage, setCurrentPage }) => {
  const [activeTab, setActiveTab] = useState<Tab>('connection');

  return (
    <div className="card settings-card">
      <div className="settings-tabs">
        <button 
          className={`tab-button ${activeTab === 'connection' ? 'active' : ''}`}
          onClick={() => setActiveTab('connection')}
        >
          Connection
        </button>
        <button 
          className={`tab-button ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          Appearance
        </button>
        <button 
          className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          Devices
        </button>
      </div>
      <div className="settings-content">
        {activeTab === 'connection' && <ConnectionSettings socket={socket} bleDevices={bleDevices} />}
        {activeTab === 'appearance' && <ThemeSettings />}
        {activeTab === 'devices' && <DeviceSettings activeDevices={activeDevices} socket={socket} currentPage={currentPage} setCurrentPage={setCurrentPage} />}
      </div>
    </div>
  );
};

export default Settings;
