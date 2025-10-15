import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './contexts/ThemeContext';
import './ThemeSettings.css';

const ThemeSettings = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setTheme(event.target.value);
  };

  return (
    <div className="settings-section">
      <h3>{t('themeSettings')}</h3>
      <div className="setting-item">
        <label htmlFor="theme-select">{t('themeLabel')}:</label>
        <select id="theme-select" value={theme} onChange={handleThemeChange}>
          <option value="light">{t('lightTheme')}</option>
          <option value="dark">{t('darkTheme')}</option>
        </select>
      </div>
    </div>
  );
};

export default ThemeSettings;
