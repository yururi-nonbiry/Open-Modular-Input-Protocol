import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PageSettings } from './contexts/DeviceSettingsContext';
import JoyConCard from './JoyConCard'; // JoyConCardをインポート

// Joy-Conの型定義
interface JoyConDevice {
  id: string;
  type: 'L' | 'R';
  battery: number;
  input?: any;
}

interface DeviceData {
  type: 'digital' | 'analog' | 'encoder';
  device_id: number;
  port_id: number;
  state?: boolean;
  value?: number;
  steps?: number;
}

interface DeviceGridProps {
  devices: { [key: string]: DeviceData };
  joycons: JoyConDevice[]; // joycons propを追加
  deviceSettings: PageSettings;
}

const DeviceCard: React.FC<{ device: DeviceData; deviceKey: string; alias?: string }> = ({ device, deviceKey, alias }) => {
  const { t } = useTranslation();

  const renderValue = () => {
    switch (device.type) {
      case 'digital':
        return <span className={`digital-state ${device.state ? 'on' : 'off'}`}>{device.state ? 'ON' : 'OFF'}</span>;
      case 'analog':
        return (
          <div className="analog-bar-container">
            <div className="analog-bar" style={{ width: `${(device.value ?? 0) * 100}%` }}></div>
            <span>{(device.value ?? 0).toFixed(2)}</span>
          </div>
        );
      case 'encoder':
        return <span>{device.steps}</span>;
      default:
        return null;
    }
  };

  const headerText = alias || `${t('deviceHeader')}: ${device.device_id} - ${t('portHeader')}: ${device.port_id}`;
  const cardClassName = `device-card ${device.type === 'digital' && device.state ? 'active' : ''}`;

  return (
    <div className={cardClassName}>
      <div className="card-header">
        <span>{headerText} ({device.type})</span>
      </div>
      <div className="card-content">
        {renderValue()}
      </div>
    </div>
  );
};

const DeviceGrid: React.FC<DeviceGridProps> = ({ devices, joycons, deviceSettings }) => {
  const { t } = useTranslation();

  const visibleDeviceKeys = Object.keys(devices)
    .filter(key => (deviceSettings[key] ? deviceSettings[key].isVisible : true))
    .sort((a, b) => {
      const devA = devices[a];
      const devB = devices[b];
      return devA.device_id - devB.device_id || devA.port_id - devB.port_id;
    });

  const hasVisibleDevices = visibleDeviceKeys.length > 0;
  const hasJoyCons = joycons.length > 0;

  if (!hasVisibleDevices && !hasJoyCons) {
    return <p>{t('waitingForData')}</p>;
  }

  return (
    <div className="device-grid">
      {/* 既存のデバイスの表示 */}
      {visibleDeviceKeys.map(key => {
        const device = devices[key];
        const alias = deviceSettings[key]?.alias;
        return <DeviceCard key={key} device={device} deviceKey={key} alias={alias} />;
      })}
      {/* Joy-Conの表示 */}
      {joycons.map(joycon => (
        <JoyConCard key={joycon.id} device={joycon} />
      ))}
    </div>
  );
};

export default DeviceGrid;
