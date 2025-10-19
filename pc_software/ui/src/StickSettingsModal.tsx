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

        {stickConfig.mode === '8way' && (
          <div className="setting-item">
            <h4>8方向キーマッピング</h4>
            <div className="eight-way-grid">
              {[ 'up_left', 'up', 'up_right', 'left', 'center', 'right', 'down_left', 'down', 'down_right'].map(dir => {
                if (dir === 'center') return <div key={dir} className="grid-center"></div>;
                return (
                  <div key={dir} className="grid-item">
                    <label>{dir}</label>
                    <input
                      type="text"
                      value={stickConfig.mappings?.[dir] || ''}
                      onChange={(e) => {
                        const newMappings = { ...stickConfig.mappings, [dir]: e.target.value };
                        onConfigChange({ ...stickConfig, mappings: newMappings });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {stickConfig.mode === 'dial' && (
          <div className="setting-item">
            <h4>ダイヤルマッピング</h4>
            <div className="dial-mapping">
              {['up', 'down', 'left', 'right'].map(dir => (
                <div key={dir} className="dial-row">
                  <label className="dial-dir">{dir}</label>
                  <div className="dial-inputs">
                    <label>Increase</label>
                    <input
                      type="text"
                      value={stickConfig.dials?.[dir]?.increase || ''}
                      onChange={(e) => {
                        const newDials = { 
                          ...stickConfig.dials, 
                          [dir]: { ...stickConfig.dials?.[dir], increase: e.target.value }
                        };
                        onConfigChange({ ...stickConfig, dials: newDials });
                      }}
                    />
                    <label>Decrease</label>
                    <input
                      type="text"
                      value={stickConfig.dials?.[dir]?.decrease || ''}
                      onChange={(e) => {
                        const newDials = { 
                          ...stickConfig.dials, 
                          [dir]: { ...stickConfig.dials?.[dir], decrease: e.target.value }
                        };
                        onConfigChange({ ...stickConfig, dials: newDials });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
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
