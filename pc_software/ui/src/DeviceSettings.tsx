import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeviceSettings, type Profile } from './contexts/DeviceSettingsContext';
import './DeviceSettings.css';
import { socket } from './socket';

const DeviceSettings = () => {
  const { t } = useTranslation();
  const { 
    profiles, 
    activeProfileId, 
    setActiveProfileId, 
    addProfile,
    deleteProfile,
    updateProfile,
    getActiveProfilePages,
    updatePageSetting
  } = useDeviceSettings();

  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileApp, setNewProfileApp] = useState('');

  const handleAddProfile = () => {
    if (newProfileName) {
      addProfile(newProfileName, newProfileApp);
      setNewProfileName('');
      setNewProfileApp('');
    }
  };

  const handleUpdateAlias = (key: string, alias: string) => {
    // Assuming page 1 for now
    updatePageSetting(1, key, { alias });
  };

  const handleToggleVisibility = (key: string, isVisible: boolean) => {
    // Assuming page 1 for now
    updatePageSetting(1, key, { isVisible });
  };

  const handleUpdateShortcut = (key: string, shortcut: string) => {
    updatePageSetting(1, key, { shortcut });
    socket.emit('update-shortcut', { key, shortcut });
  };

  const activePages = getActiveProfilePages();
  const gridSettings = activePages[1] || {}; // Assuming page 1

  return (
    <div className="settings-section">
      <h3>{t('deviceSettings')}</h3>

      <div className="settings-subsection">
        <h4>{t('profiles')}</h4>
        <div className="setting-item">
          <select 
            value={activeProfileId || ''} 
            onChange={(e) => setActiveProfileId(e.target.value)}
          >
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.appName || 'Default'})</option>)
            }
          </select>
          <button onClick={() => activeProfileId && deleteProfile(activeProfileId)} disabled={!activeProfileId || activeProfileId === 'default'}>{t('deleteProfile')}</button>
        </div>
        <div className="setting-item">
          <input 
            type="text" 
            placeholder={t('profileName')} 
            value={newProfileName} 
            onChange={(e) => setNewProfileName(e.target.value)} 
          />
          <input 
            type="text" 
            placeholder={t('appName')} 
            value={newProfileApp} 
            onChange={(e) => setNewProfileApp(e.target.value)} 
          />
          <button onClick={handleAddProfile}>{t('addProfile')}</button>
        </div>
      </div>

      <div className="settings-subsection">
        <h4>{t('gridSettings')}</h4>
        <div className="grid-settings-list">
          {Object.keys(gridSettings).map(key => (
            <div key={key} className="grid-setting-item">
              <span>{gridSettings[key].alias || key}</span>
              <input 
                type="text" 
                placeholder={t('alias')} 
                value={gridSettings[key].alias || ''} 
                onChange={(e) => handleUpdateAlias(key, e.target.value)}
              />
              <input 
                type="text" 
                placeholder={t('shortcut')} 
                value={gridSettings[key].shortcut || ''} 
                onChange={(e) => handleUpdateShortcut(key, e.target.value)}
              />
              <label>
                <input 
                  type="checkbox" 
                  checked={gridSettings[key].isVisible === undefined ? true : gridSettings[key].isVisible} 
                  onChange={(e) => handleToggleVisibility(key, e.target.checked)}
                />
                {t('visible')}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DeviceSettings;
