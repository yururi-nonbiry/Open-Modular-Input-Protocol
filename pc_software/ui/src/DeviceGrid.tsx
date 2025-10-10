import React from 'react';
import { PageSettings } from './contexts/DeviceSettingsContext';

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
  deviceSettings: PageSettings;
}

const DeviceCard: React.FC<{ device: DeviceData; deviceKey: string; alias?: string }> = ({ device, deviceKey, alias }) => {
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

  const headerText = alias || `Device: ${device.device_id} - Port: ${device.port_id}`;
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

const DeviceGrid: React.FC<DeviceGridProps> = ({ devices, deviceSettings }) => {

  const visibleDeviceKeys = Object.keys(devices)
    .filter(key => (deviceSettings[key] ? deviceSettings[key].isVisible : true))
    .sort((a, b) => {
      const devA = devices[a];
      const devB = devices[b];
      return devA.device_id - devB.device_id || devA.port_id - devB.port_id;
    });

  if (visibleDeviceKeys.length === 0) {
    return <p>Waiting for data from a device, or all devices are hidden in settings.</p>;
  }

  return (
    <div className="device-grid">
      {visibleDeviceKeys.map(key => {
        const device = devices[key];
        const alias = deviceSettings[key]?.alias;
        return <DeviceCard key={key} device={device} deviceKey={key} alias={alias} />;
      })}
    </div>
  );
};

export default DeviceGrid;
