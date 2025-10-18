import React, { useState, useEffect, useMemo } from 'react';
import ButtonMapping from './ButtonMapping';
import StickSettingsModal from './StickSettingsModal';
import './JoyConSettings.css';
import { socket } from './socket';
import type { Mapping, StickConfig, JoyConDevice } from './types';

interface JoyConSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  allJoyCons: JoyConDevice[];
}

const JoyConSettings: React.FC<JoyConSettingsProps> = ({ isOpen, onClose, allJoyCons }) => {
  const [mappings, setMappings] = useState<{ L?: Mapping, R?: Mapping }>({});
  const [isStickModalOpen, setStickModalOpen] = useState(false);
  const [editingStick, setEditingStick] = useState<{ deviceType: 'L' | 'R', stickKey: 'stick_l' | 'stick_r', label: string } | null>(null);

  const joyConL = useMemo(() => allJoyCons.find(jc => jc.type === 'L'), [allJoyCons]);
  const joyConR = useMemo(() => allJoyCons.find(jc => jc.type === 'R'), [allJoyCons]);

  useEffect(() => {
    if (isOpen) {
      if (joyConL) socket.emit('load_joycon_mapping', { deviceId: joyConL.id });
      if (joyConR) socket.emit('load_joycon_mapping', { deviceId: joyConR.id });

      const handleMappingLoaded = (data: { deviceId: string, mapping: Mapping }) => {
        if (joyConL && data.deviceId === joyConL.id) {
          setMappings(prev => ({ ...prev, L: data.mapping || {} }));
        } else if (joyConR && data.deviceId === joyConR.id) {
          setMappings(prev => ({ ...prev, R: data.mapping || {} }));
        }
      };

      socket.on('joycon_mapping_loaded', handleMappingLoaded);
      return () => { socket.off('joycon_mapping_loaded', handleMappingLoaded); };
    } else {
      setMappings({});
    }
  }, [isOpen, joyConL, joyConR]);

  const handleMappingChange = (type: 'L' | 'R', newMapping: Mapping) => {
    setMappings(prev => ({ ...prev, [type]: newMapping }));
  };

  const handleSave = () => {
    if (joyConL && mappings.L) socket.emit('save_joycon_mapping', { deviceId: joyConL.id, mapping: mappings.L });
    if (joyConR && mappings.R) socket.emit('save_joycon_mapping', { deviceId: joyConR.id, mapping: mappings.R });
    onClose();
  };

  const handleOpenStickSettings = (deviceType: 'L' | 'R', stickKey: 'stick_l' | 'stick_r') => {
    setEditingStick({ deviceType, stickKey, label: deviceType === 'L' ? '左スティック' : '右スティック' });
    setStickModalOpen(true);
  };

  const handleStickConfigChange = (newConfig: StickConfig) => {
    if (editingStick) {
      const { deviceType, stickKey } = editingStick;
      setMappings(prev => ({
        ...prev,
        [deviceType]: {
          ...prev[deviceType],
          [stickKey]: newConfig,
        },
      }));
    }
  };

  if (!isOpen) return null;

  const currentStickConfig = editingStick ? mappings[editingStick.deviceType]?.[editingStick.stickKey] as StickConfig : undefined;

  return (
    <>
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
                  pressedButtons={joyConL.buttons || {}}
                  onOpenStickSettings={(stickKey) => handleOpenStickSettings('L', stickKey as 'stick_l' | 'stick_r')}
                />
              ) : <p>Joy-Con (L) not connected.</p>}
            </div>
            <div className="joycon-view">
              {joyConR ? (
                <ButtonMapping
                  deviceType="R"
                  initialMapping={mappings.R || {}}
                  onMappingChange={(newMap) => handleMappingChange('R', newMap)}
                  pressedButtons={joyConR.buttons || {}}
                  onOpenStickSettings={(stickKey) => handleOpenStickSettings('R', stickKey as 'stick_l' | 'stick_r')}
                />
              ) : <p>Joy-Con (R) not connected.</p>}
            </div>
          </div>
          <div className="modal-actions">
            <button onClick={handleSave} className="save-button">Save & Close</button>
            <button onClick={onClose} className="close-button">Cancel</button>
          </div>
        </div>
      </div>

      {editingStick && (
        <StickSettingsModal
          isOpen={isStickModalOpen}
          onClose={() => setStickModalOpen(false)}
          stickConfig={currentStickConfig}
          onConfigChange={handleStickConfigChange}
          stickLabel={editingStick.label}
        />
      )}
    </>
  );
};

export default JoyConSettings;
