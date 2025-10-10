import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext'
import { DeviceSettingsProvider } from './contexts/DeviceSettingsContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <DeviceSettingsProvider>
        <App />
      </DeviceSettingsProvider>
    </ThemeProvider>
  </StrictMode>,
)
