import { AppBar, Box, Button, CssBaseline, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, Grid, IconButton, InputLabel, MenuItem, Select, Stack, TextField, Toolbar, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useCallback, useEffect, useRef, useState } from 'react';

// Define types for our configuration
interface CellConfig {
  icon: string | null;
  action: string;
}

interface PageConfigs {
  [page: string]: CellConfig[];
}

import { GridCell } from './components/GridCell';
import type { DroppedIconPayload } from './components/GridCell';

const isLikelyAbsolutePath = (value: string) => {
  if (!value) return false;
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
};

const sanitizePageConfigs = (config: PageConfigs): PageConfigs => {
  const sanitized: PageConfigs = {};
  for (const [pageKey, cells] of Object.entries(config ?? {})) {
    sanitized[pageKey] = Array.from({ length: 18 }, (_, index) => {
      const cell = cells?.[index];
      const icon = typeof cell?.icon === 'string' ? cell.icon : null;
      const safeIcon = icon && (icon.startsWith('data:') || isLikelyAbsolutePath(icon)) ? icon : null;
      return {
        icon: safeIcon,
        action: typeof cell?.action === 'string' ? cell.action : '',
      };
    });
  }
  return sanitized;
};

function App() {
  // React state for UI
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [totalPages] = useState<number>(5);
  const [flashingCell, setFlashingCell] = useState<number | null>(null);
  const [pageConfigs, setPageConfigs] = useState<PageConfigs>({});
  const [editingCell, setEditingCell] = useState<{page: number, index: number} | null>(null);
  const [editingAction, setEditingAction] = useState<string>('');
  const [hasIpc, setHasIpc] = useState<boolean>(() => typeof window !== 'undefined' && Boolean(window.ipcRenderer));
  const warnedMessages = useRef<Set<string>>(new Set());
  const portStatusMessage = hasIpc
    ? (ports.length === 0 ? 'No serial ports detected. Connect your device and press refresh.' : 'Select the serial port you want to use.')
    : 'Serial ports are only available when running inside the Electron shell.';

  const warnOnce = (message: string) => {
    if (!warnedMessages.current.has(message)) {
      warnedMessages.current.add(message);
      console.warn(message);
    }
  };

const createUploadPayload = useCallback((screenId: number, cell: CellConfig, targetPage: number): Record<string, unknown> | null => {
  if (!cell || !cell.icon) {
    return { screenId, page: targetPage, clear: true };
  }
  if (cell.icon.startsWith('data:')) {
    return { screenId, page: targetPage, dataUrl: cell.icon };
  }
  if (isLikelyAbsolutePath(cell.icon)) {
    return { screenId, page: targetPage, filePath: cell.icon };
  }
  return { screenId, page: targetPage, clear: true };
}, []);

const syncPageIcons = useCallback(
  async (targetPage: number, override?: CellConfig[]) => {
      if (!hasIpc || !isConnected || !window.ipcRenderer) {
        return;
      }
      const configs = override ?? pageConfigs[targetPage] ?? [];
      const totalCells = Math.max(configs.length, 18);
      for (let index = 0; index < totalCells; index += 1) {
        const cell = configs[index] ?? { icon: null, action: '' };
        const payload = createUploadPayload(index, cell, targetPage);
        if (!payload) {
          continue;
        }
        try {
          await window.ipcRenderer.invoke('image:upload', payload);
        } catch (err) {
          console.error(`Failed to upload image for screen ${index} on page ${targetPage}:`, err);
        }
      }
    },
    [createUploadPayload, hasIpc, isConnected, pageConfigs]
  );

  const fetchPorts = () => {
    if (!hasIpc) {
      warnOnce('ipcRenderer not available; skipping port fetch.');
      setPorts([]);
      return;
    }
    window.ipcRenderer!.invoke('serial:get_ports').then((value) => {
      const availablePorts = Array.isArray(value)
        ? value.filter((port): port is string => typeof port === 'string')
        : [];
      setPorts(availablePorts);
      if (availablePorts.length > 0 && !availablePorts.includes(selectedPort)) {
        setSelectedPort(availablePorts[0]);
      }
    }).catch((err: Error) => {
      console.error('Failed to get ports:', err);
    });
  };

  const fetchConfig = () => {
    if (!hasIpc) {
      warnOnce('ipcRenderer not available; using empty page config.');
      setPageConfigs({});
      return;
    }
    window.ipcRenderer!.invoke('config:get').then((value) => {
      if (value && typeof value === 'object') {
        const sanitized = sanitizePageConfigs(value as PageConfigs);
        setPageConfigs(sanitized);
        if (isConnected) {
          const override = sanitized[String(page)] ?? sanitized[page];
          void syncPageIcons(page, override);
        }
      } else {
        setPageConfigs({});
      }
    }).catch((err: Error) => {
      console.error('Failed to get config:', err);
    });
  };

  // Initial data fetch
  useEffect(() => {
    fetchPorts();
    fetchConfig();

    if (!hasIpc && typeof window !== 'undefined') {
      const checkInterval = window.setInterval(() => {
        if (window.ipcRenderer) {
          setHasIpc(true);
          window.clearInterval(checkInterval);
        }
      }, 200);
      return () => window.clearInterval(checkInterval);
    }

    if (!hasIpc) {
      warnOnce('ipcRenderer not available; skipping backend listener setup.');
      return;
    }

    // Listener for backend events
    const handleBackendEvent = (_event: unknown, raw: unknown) => {
      if (typeof raw !== 'string') {
        return;
      }
      try {
        const response = JSON.parse(raw);
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
            // PC Volume is handled by the main process, no UI update needed here.
          }
        }
      } catch (e) {}
    };

    window.ipcRenderer!.on('from-backend', handleBackendEvent);

    return () => {
      window.ipcRenderer!.off('from-backend', handleBackendEvent);
    };
  }, [hasIpc]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    void syncPageIcons(page);
  }, [isConnected, page, syncPageIcons]);

  const handleConnect = async () => {
    if (!hasIpc) {
      warnOnce('ipcRenderer not available; cannot connect to device.');
      return;
    }
    if (!selectedPort) return;
    try {
      await window.ipcRenderer!.invoke('serial:connect', selectedPort);
      setIsConnected(true);
    } catch (err) {
      console.error('Failed to connect:', err);
      setIsConnected(false);
    }
  };

  const handleDisconnect = async () => {
    if (!hasIpc) {
      warnOnce('ipcRenderer not available; nothing to disconnect.');
      return;
    }
    try {
      await window.ipcRenderer!.invoke('serial:disconnect');
      setIsConnected(false);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const handlePageChange = (newPage: number) => {
    const clampedPage = Math.max(1, Math.min(totalPages, newPage));
    setPage(clampedPage);
    if (hasIpc) {
      window.ipcRenderer!.invoke('config:set_page', clampedPage);
    }
  };

  const handlePrevPage = () => handlePageChange(page - 1);
  const handleNextPage = () => handlePageChange(page + 1);

  const handleIconDrop = (index: number, payload: DroppedIconPayload) => {
    const { dataUrl, filePath } = payload;
    const absolutePath = filePath && isLikelyAbsolutePath(filePath) ? filePath : null;
    const iconValue = absolutePath ?? dataUrl ?? null;
    if (!iconValue) {
      console.warn('No icon data available for drop operation.');
      return;
    }
    const newConfigs = JSON.parse(JSON.stringify(pageConfigs)); // Deep copy
    if (!Array.isArray(newConfigs[page])) {
      newConfigs[page] = Array.from({ length: 18 }, () => ({ icon: null, action: '' }));
    }
    if (!newConfigs[page][index]) {
      newConfigs[page][index] = { icon: null, action: '' };
    }
    newConfigs[page][index].icon = iconValue;

    const sanitizedConfigs = sanitizePageConfigs(newConfigs);
    setPageConfigs(sanitizedConfigs);
    if (hasIpc) {
      window.ipcRenderer!.invoke('config:save', sanitizedConfigs);
      if (isConnected) {
        const cell = sanitizedConfigs[page]?.[index];
        const payload = cell ? createUploadPayload(index, cell, page) : null;
        if (payload) {
          window.ipcRenderer!
            .invoke('image:upload', payload)
            .catch((err: Error) => {
              console.error('Failed to upload image to device:', err);
            });
        }
      }
    }
  };

  const handleIconClear = (index: number) => {
    const currentPage = page;
    const newConfigs = JSON.parse(JSON.stringify(pageConfigs)); // Deep copy
    if (!Array.isArray(newConfigs[currentPage])) {
      newConfigs[currentPage] = Array.from({ length: 18 }, () => ({ icon: null, action: '' }));
    }
    if (!newConfigs[currentPage][index]) {
      newConfigs[currentPage][index] = { icon: null, action: '' };
    }
    newConfigs[currentPage][index].icon = null;

    const sanitizedConfigs = sanitizePageConfigs(newConfigs);
    setPageConfigs(sanitizedConfigs);
    if (hasIpc) {
      window.ipcRenderer!.invoke('config:save', sanitizedConfigs);
      if (isConnected) {
        const cell = sanitizedConfigs[currentPage]?.[index] ?? { icon: null, action: '' };
        const payload = createUploadPayload(index, cell, currentPage);
        if (payload) {
          window.ipcRenderer!
            .invoke('image:upload', payload)
            .catch((err: Error) => {
              console.error('Failed to clear icon on device:', err);
            });
        }
      }
    }
  };

  const handleCellClick = (index: number) => {
    setEditingCell({ page, index });
    setEditingAction(pageConfigs[page]?.[index]?.action || '');
  };

  const handleSaveEditing = () => {
    if (!editingCell) return;
    const newConfigs = JSON.parse(JSON.stringify(pageConfigs)); // Deep copy
    if (!newConfigs[editingCell.page]) {
      newConfigs[editingCell.page] = Array.from({ length: 18 }, () => ({ icon: null, action: '' }));
    }
    newConfigs[editingCell.page][editingCell.index].action = editingAction;
    const sanitizedConfigs = sanitizePageConfigs(newConfigs);
    setPageConfigs(sanitizedConfigs);
    if (hasIpc) {
      window.ipcRenderer!.invoke('config:save', sanitizedConfigs);
    }
    setEditingCell(null);
  };

  const currentGridConfig = pageConfigs[page] || Array.from({ length: 18 }, () => ({ icon: null, action: '' }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <CssBaseline />
      
      {/* Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ flexGrow: 1, mr: 2 }}>OMIP Configurator</Typography>
          
          <FormControl size="small" sx={{ m: 1, minWidth: 180 }} disabled={isConnected}>
            <InputLabel id="serial-port-label">Serial Port</InputLabel>
            <Select
              labelId="serial-port-label"
              id="serial-port-select"
              value={selectedPort}
              label="Serial Port"
              displayEmpty
              renderValue={(value) => {
                if (!value) {
                  return ports.length === 0 ? 'No ports available' : 'Select port';
                }
                return value;
              }}
              onChange={(e) => setSelectedPort(e.target.value as string)}
            >
              {ports.length === 0 ? (
                <MenuItem value="" disabled>No ports found</MenuItem>
              ) : (
                ports.map((port) => (
                  <MenuItem key={port} value={port}>{port}</MenuItem>
                ))
              )}
            </Select>
            <FormHelperText>{portStatusMessage}</FormHelperText>
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
        

        {/* Main Content */}
        <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto' }}>
      <Grid container spacing={2}>
        {currentGridConfig.map((cell, index) => (
          <Grid key={index} size={2}>
              <GridCell
                config={cell}
                isFlashing={flashingCell === index}
                onClick={() => handleCellClick(index)}
                onIconDrop={(icon) => handleIconDrop(index, icon)}
                onIconClear={() => handleIconClear(index)}
              />
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
