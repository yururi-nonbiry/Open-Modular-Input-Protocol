import React, { useState, useEffect } from 'react';
import ButtonMapping from './ButtonMapping';
import './JoyConSettings.css';
import { socket } from './socket';

interface JoyConSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  device: { id: string; type: 'L' | 'R' };
}

const JoyConSettings: React.FC<JoyConSettingsProps> = ({ isOpen, onClose, device }) => {
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (isOpen) {
      // モーダルが開いた時に設定をロードする
      socket.emit('load_joycon_mapping', { deviceId: device.id });

      const handleMappingLoaded = (data: { mapping: { [key: string]: string } }) => {
        setMapping(data.mapping || {});
      };

      socket.on('joycon_mapping_loaded', handleMappingLoaded);

      return () => {
        socket.off('joycon_mapping_loaded', handleMappingLoaded);
      };
    }
  }, [isOpen, device.id]);

  const handleSave = () => {
    socket.emit('save_joycon_mapping', { deviceId: device.id, mapping });
    // TODO: 保存成功のフィードバックをユーザーに表示
    onClose(); // 保存後にモーダルを閉じる
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{`Joy-Con (${device.type}) Settings`}</h2>
        <ButtonMapping 
          deviceType={device.type} 
          initialMapping={mapping}
          onMappingChange={setMapping}
        />
        <div className="modal-actions">
          <button onClick={handleSave} className="save-button">Save & Close</button>
          <button onClick={onClose} className="close-button">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default JoyConSettings;
