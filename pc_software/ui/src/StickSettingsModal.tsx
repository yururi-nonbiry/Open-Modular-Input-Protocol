import React from 'react';
import './JoyConSettings.css'; // 既存のモーダルスタイルを流用
import type { StickConfig } from './types'; // 型定義をインポート

interface StickSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stickConfig: StickConfig | undefined;
  onConfigChange: (newConfig: StickConfig) => void;
  stickLabel: string;
}

const StickSettingsModal: React.FC<StickSettingsModalProps> = ({ isOpen, onClose, stickConfig, onConfigChange, stickLabel }) => {
  if (!isOpen || !stickConfig) {
    return null;
  }

  const handleSensitivityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSensitivity = parseInt(e.target.value, 10);
    onConfigChange({
      ...stickConfig,
      sensitivity: newSensitivity,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{stickLabel} - 詳細設定</h2>
        
        {stickConfig.mode === 'mouse' && (
          <div className="setting-item">
            <label htmlFor="sensitivity-slider">マウス感度: {stickConfig.sensitivity}</label>
            <input
              type="range"
              id="sensitivity-slider"
              min="1"
              max="100"
              value={stickConfig.sensitivity || 50}
              onChange={handleSensitivityChange}
            />
          </div>
        )}

        {/* 他のモード（例：スクロール）の設定項目を将来的にここに追加できる */}

        <div className="modal-actions">
          <button onClick={onClose} className="save-button">閉じる</button>
        </div>
      </div>
    </div>
  );
};

export default StickSettingsModal;
