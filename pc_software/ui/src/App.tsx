import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './App.css';
import { socket } from './socket';
import DeviceGrid from './DeviceGrid';
import Settings from './Settings';
import { ThemeProvider } from './contexts/ThemeContext';
import { DeviceSettingsProvider, useDeviceSettings } from './contexts/DeviceSettingsContext';

// Joy-Conの型定義
export interface JoyConDevice {
  id: string;
  type: 'L' | 'R';
  battery: number;
  buttons?: { [key: string]: boolean }; // ボタン状態を保持
}

const MainContent: React.FC = () => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState({});
  const [joycons, setJoycons] = useState<JoyConDevice[]>([]); // Joy-Con用のstate
  const { getActiveProfilePages, findProfileByAppName } = useDeviceSettings();
  const [activeAppName, setActiveAppName] = useState('');

  useEffect(() => {
    // 従来のデバイスアップデート
    socket.on('device_update', (data) => {
      setDevices(prevDevices => ({ ...prevDevices, ...data }));
    });

    // Joy-Conデバイスリストの受信
    socket.on('joycon_devices', (data) => {
      setJoycons(data.devices || []);
    });

    // Joy-Conの状態更新
    socket.on('joycon_update', (data) => {
      setJoycons(prevJoycons => 
        prevJoycons.map(jc => {
          if (jc.id === data.id) {
            if (data.type === 'battery') {
              return { ...jc, battery: data.level };
            } else if (data.type === 'input') {
              return { ...jc, buttons: data.buttons }; // ボタン状態を直接保持
            }
          }
          return jc;
        })
      );
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
      socket.off('joycon_devices');
      socket.off('joycon_update');
    };
  }, [findProfileByAppName]);

  const deviceSettings = getActiveProfilePages()[1] || {}; // Assuming page 1 for now

  return (
    <main>
      <div className="main-content">
        <div className="grid-container">
          <h3>{t('deviceGrid')}</h3>
          {/* DeviceGridにjoyconsを渡す */}
          <DeviceGrid devices={devices} joycons={joycons} deviceSettings={deviceSettings} />
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