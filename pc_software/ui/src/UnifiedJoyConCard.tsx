import React, { useState, useMemo } from 'react';
import JoyConSettings from './JoyConSettings';
import { JoyConDiagram } from './ButtonMapping'; // インポート
import './ButtonMapping.css'; // スタイルシートもインポート
import type { JoyConDevice } from './types';

interface UnifiedJoyConCardProps {
  allJoyCons: JoyConDevice[];
}

// バッテリーレベルをパーセンテージ風の文字列に変換
const getBatteryDisplay = (level: number) => {
    if (level >= 8) return '100%';
    if (level >= 6) return '75%';
    if (level >= 4) return '50%';
    if (level >= 2) return '25%';
    return '0%';
};

const UnifiedJoyConCard: React.FC<UnifiedJoyConCardProps> = ({ allJoyCons }) => {
  const [isSettingsOpen, setSettingsOpen] = useState(false);

  const joyConL = useMemo(() => allJoyCons.find(jc => jc.type === 'L'), [allJoyCons]);
  const joyConR = useMemo(() => allJoyCons.find(jc => jc.type === 'R'), [allJoyCons]);

  const handleOpenSettings = () => {
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
  };

  return (
    <>
      <div className="device-card joycon-card-unified">
        <div className="card-header">
          <span>Joy-Con</span>
        </div>
        <div className="card-content">
          <div 
            className="joycon-diagram-container-unified"
            style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: '40px', width: '100%' }}
          >
            {joyConL ? (
              <JoyConDiagram type="L" pressedButtons={joyConL.buttons || {}} />
            ) : (
              <div className="joycon-placeholder l" />
            )}
            {joyConR ? (
              <JoyConDiagram type="R" pressedButtons={joyConR.buttons || {}} />
            ) : (
              <div className="joycon-placeholder r" />
            )}
          </div>
          <div className="joycon-status-group">
                <div className={`joycon-status-item ${joyConL ? 'connected' : ''}`}>
                    <span>L: {joyConL ? `Connected (Battery: ${getBatteryDisplay(joyConL.battery)})` : 'Disconnected'}</span>
                </div>
                <div className={`joycon-status-item ${joyConR ? 'connected' : ''}`}>
                    <span>R: {joyConR ? `Connected (Battery: ${getBatteryDisplay(joyConR.battery)})` : 'Disconnected'}</span>
                </div>
            </div>
            <button onClick={handleOpenSettings} className="settings-button">Settings</button>
        </div>
      </div>

      <JoyConSettings 
        isOpen={isSettingsOpen} 
        onClose={handleCloseSettings} 
        allJoyCons={allJoyCons} 
      />
    </>
  );
};

export default UnifiedJoyConCard;
