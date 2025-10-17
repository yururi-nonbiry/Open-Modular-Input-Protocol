import React from 'react';
import ButtonMapping from './ButtonMapping';
import './JoyConSettings.css';

interface JoyConSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  device: { id: string; type: 'L' | 'R' }; // もう少し詳細なデバイス情報が必要になります
}

const JoyConSettings: React.FC<JoyConSettingsProps> = ({ isOpen, onClose, device }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{`Joy-Con (${device.type}) Settings`}</h2>
        <ButtonMapping deviceType={device.type} />
        <button onClick={onClose} className="close-button">Close</button>
      </div>
    </div>
  );
};

export default JoyConSettings;
