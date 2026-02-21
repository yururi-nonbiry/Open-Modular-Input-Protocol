import { Box, Card, CardActionArea, CardContent, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, InputLabel, FormControl, IconButton } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GamepadIcon from '@mui/icons-material/Gamepad';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useState, useEffect } from 'react';

import '../webviewIpc';

interface RegisteredDevice {
    id: string;
    type: string; // "m5tab" | "joycon"
    name: string;
}

interface HomeProps {
    onSelectDevice: (device: 'm5tab' | 'joycon', deviceId?: string) => void;
}

export function Home({ onSelectDevice }: HomeProps) {
    const [devices, setDevices] = useState<RegisteredDevice[]>([]);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newDeviceType, setNewDeviceType] = useState('m5tab');
    const [newDeviceName, setNewDeviceName] = useState('');
    const [hasIpc, setHasIpc] = useState<boolean>(() => typeof window !== 'undefined' && Boolean(window.ipcRenderer));

    const loadDevices = () => {
        if (!hasIpc) return;
        window.ipcRenderer!.invoke('devices:get').then((res: any) => {
            console.log("Got devices", res);
            setDevices(res || []);
        }).catch(console.error);
    };

    useEffect(() => {
        if (!hasIpc && typeof window !== 'undefined') {
            const checkInterval = window.setInterval(() => {
                if (window.ipcRenderer) {
                    setHasIpc(true);
                    window.clearInterval(checkInterval);
                }
            }, 200);
            return () => window.clearInterval(checkInterval);
        }
    }, [hasIpc]);

    useEffect(() => {
        if (hasIpc) {
            loadDevices();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasIpc]);

    const handleAddDevice = () => {
        if (!hasIpc) return;
        window.ipcRenderer!.invoke('devices:register', { type: newDeviceType, name: newDeviceName }).then(() => {
            setIsAddDialogOpen(false);
            setNewDeviceName('');
            loadDevices();
        }).catch(console.error);
    };

    const handleDeleteDevice = (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // prevent clicking the card
        if (!hasIpc) return;
        window.ipcRenderer!.invoke('devices:unregister', id).then(() => {
            loadDevices();
        }).catch(console.error);
    };

    return (
        <Box sx={{ flexGrow: 1, p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
            <Typography variant="h4" gutterBottom sx={{ mb: 4 }}>
                デバイスを選択してください
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', width: '100%', maxWidth: 1000, pb: 4 }}>
                {devices.map(dev => (
                    <Box key={dev.id} sx={{ flex: '1 1 300px', maxWidth: 400, position: 'relative' }}>
                        <Card elevation={3} sx={{ height: '100%' }}>
                            <CardActionArea
                                onClick={() => onSelectDevice(dev.type as 'm5tab' | 'joycon', dev.id)}
                                sx={{ height: '100%', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            >
                                {dev.type === 'm5tab' ? (
                                    <DashboardIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
                                ) : (
                                    <GamepadIcon sx={{ fontSize: 80, color: 'secondary.main', mb: 2 }} />
                                )}
                                <CardContent sx={{ textAlign: 'center', width: '100%' }}>
                                    <Typography variant="h5" component="div" gutterBottom>
                                        {dev.name}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {dev.type === 'm5tab' ? 'M5Tab Stream Deck' : 'Joy-Con 両手デバイス'}
                                    </Typography>
                                </CardContent>
                            </CardActionArea>
                            <IconButton
                                aria-label="delete"
                                color="error"
                                onClick={(e) => handleDeleteDevice(dev.id, e)}
                                sx={{ position: 'absolute', top: 8, right: 8 }}
                            >
                                <DeleteIcon />
                            </IconButton>
                        </Card>
                    </Box>
                ))}

                {/* Add Device Card */}
                <Box sx={{ flex: '1 1 300px', maxWidth: 400 }}>
                    <Card elevation={0} sx={{ height: '100%', minHeight: 250, border: '2px dashed', borderColor: 'divider', bgcolor: 'transparent' }}>
                        <CardActionArea
                            onClick={() => setIsAddDialogOpen(true)}
                            sx={{ height: '100%', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <AddIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 1 }} />
                            <Typography variant="h6" color="text.secondary">
                                デバイスを追加
                            </Typography>
                        </CardActionArea>
                    </Card>
                </Box>
            </Box>

            {/* Add Device Dialog */}
            <Dialog open={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>新しいデバイスの登録</DialogTitle>
                <DialogContent sx={{ mt: 1 }}>
                    <FormControl fullWidth sx={{ mb: 3, mt: 1 }}>
                        <InputLabel>デバイスの種類</InputLabel>
                        <Select
                            value={newDeviceType}
                            label="デバイスの種類"
                            onChange={(e) => setNewDeviceType(e.target.value)}
                        >
                            <MenuItem value="m5tab">M5Tab Stream Deck</MenuItem>
                            <MenuItem value="joycon">Joy-Con</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        fullWidth
                        label="デバイス名"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        placeholder={newDeviceType === 'm5tab' ? "メインのM5Tab" : "L/R Joy-Con"}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsAddDialogOpen(false)}>キャンセル</Button>
                    <Button onClick={handleAddDevice} variant="contained" disabled={!newDeviceName.trim()}>
                        登録
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

