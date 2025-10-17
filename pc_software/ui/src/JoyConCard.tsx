import React, { useState } from 'react';
import JoyConSettings from './JoyConSettings';

// Joy-Conの型定義
interface JoyConDevice {
  id: string;
  type: 'L' | 'R';
  battery: number;
  input?: any;
}

interface JoyConCardProps {
  device: JoyConDevice;
}

// バッテリーレベルをパーセンテージ風の文字列に変換
const getBatteryDisplay = (level: number) => {
    if (level >= 8) return '100%'; // 満タン
    if (level >= 6) return '75%';  // 中
    if (level >= 4) return '50%';  // 低
    if (level >= 2) return '25%';  // 要充電
    return '0%'; // 空
};

const JoyConCard: React.FC<JoyConCardProps> = ({ device }) => {
  const [isSettingsOpen, setSettingsOpen] = useState(false);

  const handleOpenSettings = () => {
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
  };

  const cardClassName = `device-card joycon-card joycon-${device.type.toLowerCase()}`;

  return (
    <>
      <div className={cardClassName}>
        <div className="card-header">
          <span>{`Joy-Con (${device.type})`}</span>
        </div>
        <div className="card-content">
            <div className="joycon-status">
                <span>Battery: {getBatteryDisplay(device.battery)}</span>
                {/* ここに他のステータス（接続状態など）も追加可能 */}
            </div>
            <button onClick={handleOpenSettings} className="settings-button">Settings</button>
        </div>
      </div>

      <JoyConSettings 
        isOpen={isSettingsOpen} 
        onClose={handleCloseSettings} 
        device={device} 
      />
    </>
  );
};

export default JoyConCard;
