import React, { useState, useEffect, useMemo } from 'react';
import ButtonMapping from './ButtonMapping';
import './JoyConSettings.css';
import { socket } from './socket';

// Joy-Conの型定義
interface JoyConDevice {
  id: string;
  type: 'L' | 'R';
  battery: number;
  input?: any;
}

interface Mapping {
  [key: string]: string;
}

interface JoyConSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  allJoyCons: JoyConDevice[];
}

const JoyConSettings: React.FC<JoyConSettingsProps> = ({ isOpen, onClose, allJoyCons }) => {
  const [mappings, setMappings] = useState<{ L?: Mapping, R?: Mapping }>({});

  const joyConL = useMemo(() => allJoyCons.find(jc => jc.type === 'L'), [allJoyCons]);
  const joyConR = useMemo(() => allJoyCons.find(jc => jc.type === 'R'), [allJoyCons]);

  useEffect(() => {
    if (isOpen) {
      // 接続されているJoy-Conの設定をロード
      if (joyConL) {
        socket.emit('load_joycon_mapping', { deviceId: joyConL.id });
      }
      if (joyConR) {
        socket.emit('load_joycon_mapping', { deviceId: joyConR.id });
      }

      const handleMappingLoaded = (data: { deviceId: string, mapping: Mapping }) => {
        if (joyConL && data.deviceId === joyConL.id) {
          setMappings(prev => ({ ...prev, L: data.mapping || {} }));
        } else if (joyConR && data.deviceId === joyConR.id) {
          setMappings(prev => ({ ...prev, R: data.mapping || {} }));
        }
      };

      socket.on('joycon_mapping_loaded', handleMappingLoaded);

      return () => {
        socket.off('joycon_mapping_loaded', handleMappingLoaded);
      };
    } else {
      // モーダルが閉じられたらマッピングをリセット
      setMappings({});
    }
  }, [isOpen, joyConL, joyConR]);

  const handleMappingChange = (type: 'L' | 'R', newMapping: Mapping) => {
    setMappings(prev => ({ ...prev, [type]: newMapping }));
  };

  const handleSave = () => {
    if (joyConL && mappings.L) {
      socket.emit('save_joycon_mapping', { deviceId: joyConL.id, mapping: mappings.L });
    }
    if (joyConR && mappings.R) {
      socket.emit('save_joycon_mapping', { deviceId: joyConR.id, mapping: mappings.R });
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content wide">
        <h2>Joy-Con Settings</h2>
        <div className="dual-view-container">
          <div className="joycon-view">
            {joyConL ? (
              <ButtonMapping
                deviceType="L"
                initialMapping={mappings.L || {}}
                onMappingChange={(newMap) => handleMappingChange('L', newMap)}
              />
            ) : (
              <p>Joy-Con (L) not connected.</p>
            )}
          </div>
          <div className="joycon-view">
            {joyConR ? (
              <ButtonMapping
                deviceType="R"
                initialMapping={mappings.R || {}}
                onMappingChange={(newMap) => handleMappingChange('R', newMap)}
              />
            ) : (
              <p>Joy-Con (R) not connected.</p>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={handleSave} className="save-button">Save & Close</button>
          <button onClick={onClose} className="close-button">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default JoyConSettings;