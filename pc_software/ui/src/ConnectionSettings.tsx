import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SerialSettings from './SerialSettings';

const ConnectionSettings = () => {
  const { t } = useTranslation();
  const [connectionType, setConnectionType] = useState('serial');

  return (
    <div className="settings-section">
      <h3>{t('connectionSettings')}</h3>
      <div className="setting-item">
        <label htmlFor="connection-type-select">{t('connectionType')}:</label>
        <select 
          id="connection-type-select" 
          value={connectionType} 
          onChange={(e) => setConnectionType(e.target.value)}
        >
          <option value="serial">{t('serial')}</option>
          {/* Add other connection types like Bluetooth here in the future */}
        </select>
      </div>

      {connectionType === 'serial' && <SerialSettings />}
    </div>
  );
};

export default ConnectionSettings;