import { AppBar, Box, Button, CssBaseline, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Slider, Stack, TextField, Toolbar, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useEffect, useState } from 'react';

// Define types for our configuration
interface CellConfig {
  icon: string | null;
  action: string;
}

interface PageConfigs {
  [page: string]: CellConfig[];
}

function App() {
  // React state for UI
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(5);
  const [volume, setVolume] = useState<number>(75);
  const [flashingCell, setFlashingCell] = useState<number | null>(null);
  const [pageConfigs, setPageConfigs] = useState<PageConfigs>({});
  const [editingCell, setEditingCell] = useState<{page: number, index: number} | null>(null);
  const [editingAction, setEditingAction] = useState<string>('');

  const fetchPorts = () => {
    window.ipcRenderer.invoke('serial:get_ports').then((availablePorts: string[]) => {
      setPorts(availablePorts);
      if (availablePorts.length > 0 && !availablePorts.includes(selectedPort)) {
        setSelectedPort(availablePorts[0]);
      }
    }).catch((err: Error) => {
      console.error('Failed to get ports:', err);
    });
  };

  const fetchConfig = () => {
    window.ipcRenderer.invoke('config:get').then((config: PageConfigs) => {
      setPageConfigs(config);
    }).catch((err: Error) => {
      console.error('Failed to get config:', err);
    });
  };

  // Initial data fetch
  useEffect(() => {
    fetchPorts();
    fetchConfig();

    // Listener for backend events
    const handleBackendEvent = (event: any, message: string) => {
      try {
        const response = JSON.parse(message);
        if (response.type === 'device_event') {
          if (response.event === 'input_digital' && response.state === true) {
            const portId = response.port_id;
            if (portId >= 0 && portId < 18) {
              setFlashingCell(portId);
              setTimeout(() => setFlashingCell(null), 200);
            }
            if (portId === 19) { handleNextPage(); }
            else if (portId === 20) { handlePrevPage(); }
          } else if (response.event === 'input_analog') {
            if (response.port_id === 18) { setVolume(response.value * 100); }
          }
        }
      } catch (e) {}
    };

    window.ipcRenderer.on('from-backend', handleBackendEvent);

    return () => {
      window.ipcRenderer.off('from-backend', handleBackendEvent);
    };
  }, []);

  const handleConnect = async () => {
    if (!selectedPort) return;
    try {
      await window.ipcRenderer.invoke('serial:connect', selectedPort);
      setIsConnected(true);
    } catch (err) {
      console.error('Failed to connect:', err);
      setIsConnected(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.ipcRenderer.invoke('serial:disconnect');
      setIsConnected(false);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const handlePageChange = (newPage: number) => {
    const clampedPage = Math.max(1, Math.min(totalPages, newPage));
    setPage(clampedPage);
    window.ipcRenderer.invoke('config:set_page', clampedPage);
  };

  const handlePrevPage = () => handlePageChange(page - 1);
  const handleNextPage = () => handlePageChange(page + 1);

  const handleCellClick = (index: number) => {
    setEditingCell({ page, index });
    setEditingAction(pageConfigs[page]?.[index]?.action || '');
  };

  const handleSaveEditing = () => {
    if (!editingCell) return;
    const newConfigs = JSON.parse(JSON.stringify(pageConfigs)); // Deep copy
    if (!newConfigs[editingCell.page]) {
      newConfigs[editingCell.page] = Array(18).fill({ icon: null, action: '' });
    }
    newConfigs[editingCell.page][editingCell.index].action = editingAction;
    setPageConfigs(newConfigs);
    window.ipcRenderer.invoke('config:save', newConfigs);
    setEditingCell(null);
  };

  const currentGridConfig = pageConfigs[page] || Array(18).fill({ icon: null, action: '' });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <CssBaseline />
      
      {/* Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ flexGrow: 1, mr: 2 }}>OMIP Configurator</Typography>
          
          <FormControl size="small" sx={{ m: 1, minWidth: 120 }} disabled={isConnected}>
            <InputLabel id="serial-port-label">Serial Port</InputLabel>
            <Select
              labelId="serial-port-label"
              id="serial-port-select"
              value={selectedPort}
              label="Serial Port"
              onChange={(e) => setSelectedPort(e.target.value as string)}
            >
              {ports.map((port) => (
                <MenuItem key={port} value={port}>{port}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button variant="outlined" size="small" sx={{ mr: 1 }} disabled={isConnected} onClick={fetchPorts}>
            <RefreshIcon />
          </Button>

          <Button 
            variant="contained" 
            color={isConnected ? 'error' : 'primary'} 
            onClick={isConnected ? handleDisconnect : handleConnect}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </Button>
        </Toolbar>
      </AppBar>

      {/* Body */}
      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        
        {/* Sidebar */}
        <Box sx={{ width: 120, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider' }}>
          <Typography id="volume-slider-label" gutterBottom>Volume</Typography>
          <Slider
            aria-labelledby="volume-slider-label"
            orientation="vertical"
            value={volume}
            onChange={(e, newValue) => setVolume(newValue as number)}
            sx={{ flexGrow: 1, mt: 2, mb: 2}} 
          />
        </Box>

        {/* Main Content */}
        <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto' }}>
          <Grid container spacing={2}>
            {currentGridConfig.map((cell, index) => (
              <Grid item xs={2} key={index}>
                <Paper 
                  onClick={() => handleCellClick(index)}
                  elevation={flashingCell === index ? 8 : 2}
                  sx={{
                    height: 120, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'space-around',
                    p: 1,
                    cursor: 'pointer',
                    backgroundColor: flashingCell === index ? 'primary.light' : 'background.paper',
                    transition: 'background-color 0.1s ease-in-out',
                    '&:hover': { backgroundColor: 'action.hover' }
                  }}
                >
                  {/* TODO: Icon display */}
                  <Box sx={{ flexGrow: 1, display:'flex', alignItems:'center'}}>
                     <Typography variant="h5">?</Typography>
                  </Box>
                  <Typography variant="caption" noWrap sx={{ width: '100%', textAlign: 'center'}}>
                    {cell.action || `Port ${index}`}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

      </Box>

      {/* Footer */}
      <Box sx={{ p: 1, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Stack direction="row" spacing={1} alignItems="center">
            <IconButton size="small" onClick={handlePrevPage} disabled={page <= 1}>
                <ArrowBackIosNewIcon fontSize="inherit" />
            </IconButton>
            <Typography variant="body2">Page {page} / {totalPages}</Typography>
            <IconButton size="small" onClick={handleNextPage} disabled={page >= totalPages}>
                <ArrowForwardIosIcon fontSize="inherit" />
            </IconButton>
        </Stack>
      </Box>

      {/* Edit Dialog */}
      <Dialog open={editingCell !== null} onClose={() => setEditingCell(null)}>
        <DialogTitle>Edit Action for Port {editingCell?.index}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="action-input"
            label="Action (e.g., ctrl+c)"
            type="text"
            fullWidth
            variant="standard"
            value={editingAction}
            onChange={(e) => setEditingAction(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingCell(null)}>Cancel</Button>
          <Button onClick={handleSaveEditing}>Save</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

export default App;
