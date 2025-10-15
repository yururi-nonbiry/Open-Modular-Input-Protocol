import React from 'react';
import { useTheme } from "./contexts/ThemeContext";
import './ThemeSettings.css';

const ThemeSettings: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <h2>Appearance Settings</h2>
      <div className="form-group">
        <label htmlFor="theme-switch">Theme</label>
        <div className="theme-switcher">
          <span>Light</span>
          <label className="switch">
            <input 
              id="theme-switch"
              type="checkbox" 
              checked={theme === 'dark'}
              onChange={toggleTheme} 
            />
            <span className="slider round"></span>
          </label>
          <span>Dark</span>
        </div>
      </div>
    </>
  );
};

export default ThemeSettings;
