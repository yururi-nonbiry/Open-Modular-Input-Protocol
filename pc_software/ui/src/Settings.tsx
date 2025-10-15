import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThemeSettings from './ThemeSettings';
import DeviceSettings from './DeviceSettings';
import ConnectionSettings from './ConnectionSettings';
import LanguageSettings from './LanguageSettings'; // Import LanguageSettings

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('theme');

  return (
    <div className="settings-container">
      <h2>{t('settings')}</h2>
      <div className="settings-nav">
        <button onClick={() => setActiveTab('theme')} className={activeTab === 'theme' ? 'active' : ''}>{t('theme')}</button>
        <button onClick={() => setActiveTab('device')} className={activeTab === 'device' ? 'active' : ''}>{t('device')}</button>
        <button onClick={() => setActiveTab('connection')} className={activeTab === 'connection' ? 'active' : ''}>{t('connection')}</button>
        <button onClick={() => setActiveTab('language')} className={activeTab === 'language' ? 'active' : ''}>{t('language')}</button> {/* Add Language Tab */}
      </div>
      <div className="settings-content">
        {activeTab === 'theme' && <ThemeSettings />}
        {activeTab === 'device' && <DeviceSettings />}
        {activeTab === 'connection' && <ConnectionSettings />}
        {activeTab === 'language' && <LanguageSettings />} {/* Add LanguageSettings Component */}
      </div>
    </div>
  );
};

export default Settings;
