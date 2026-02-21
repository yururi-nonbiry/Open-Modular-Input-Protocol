import { AppBar, Box, CssBaseline, IconButton, Toolbar, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useState } from 'react';
import './webviewIpc';

// Import Views
import { Home } from './views/Home';
import { M5TabConfig } from './views/M5TabConfig';
import { JoyConConfig } from './views/JoyConConfig';

type ViewMode = 'home' | 'm5tab' | 'joycon';

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const handleBack = () => {
    setCurrentView('home');
    setSelectedDeviceId('');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'home':
        return <Home onSelectDevice={(type, id) => { setCurrentView(type); setSelectedDeviceId(id || ''); }} />;
      case 'm5tab':
        return <M5TabConfig />;
      case 'joycon':
        return <JoyConConfig deviceId={selectedDeviceId} />;
      default:
        return <Home onSelectDevice={(type, id) => { setCurrentView(type); setSelectedDeviceId(id || ''); }} />;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <CssBaseline />

      {/* Global Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense">
          {currentView !== 'home' && (
            <IconButton edge="start" color="inherit" onClick={handleBack} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            OMIP Configurator
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Main Content Area */}
      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        {renderCurrentView()}
      </Box>
    </Box>
  );
}

export default App;
