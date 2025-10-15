import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './App.css';
import { socket } from './socket';
import DeviceGrid from './DeviceGrid';
import Settings from './Settings';
import { ThemeProvider } from './contexts/ThemeContext';
import { DeviceSettingsProvider, useDeviceSettings } from './contexts/DeviceSettingsContext';

const MainContent: React.FC = () => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState({});
  const { getActiveProfilePages, findProfileByAppName } = useDeviceSettings();
  const [activeAppName, setActiveAppName] = useState('');

  useEffect(() => {
    socket.on('device_update', (data) => {
      setDevices(prevDevices => ({ ...prevDevices, ...data }));
    });

    window.electron.onActiveWindowChange((appName: string) => {
      setActiveAppName(appName);
      const profile = findProfileByAppName(appName);
      if (profile) {
        // TODO: Set active profile based on appName
        console.log(`App changed to ${appName}, found profile: ${profile.name}`);
      }
    });

    return () => {
      socket.off('device_update');
    };
  }, [findProfileByAppName]);

  const deviceSettings = getActiveProfilePages()[1] || {}; // Assuming page 1 for now

  return (
    <main>
      <div className="main-content">
        <div className="grid-container">
          <h3>{t('deviceGrid')}</h3>
          <DeviceGrid devices={devices} deviceSettings={deviceSettings} />
        </div>
        <div className="settings-panel">
          <Settings />
        </div>
      </div>
    </main>
  );
}

function App() {
  return (
    <ThemeProvider>
      <DeviceSettingsProvider>
        <MainContent />
      </DeviceSettingsProvider>
    </ThemeProvider>
  );
}

export default App;