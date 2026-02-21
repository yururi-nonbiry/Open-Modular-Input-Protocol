import { Box, Typography, Paper, FormControl, InputLabel, Select, MenuItem, TextField, Button } from '@mui/material';
import { JoyConIcon } from '../components/JoyConIcon';
import { useEffect, useState, useCallback } from 'react';
import '../webviewIpc';


// JoyCon Stick Mapping Types
type StickMode = 'none' | 'mouse' | '8way' | 'dial';

interface StickConfig {
    mode: StickMode;
    sensitivity?: number;
    mappings?: Record<string, string>;
    dials?: Record<string, { increase: string, decrease: string }>;
}

interface DeviceConfig {
    [key: string]: string | StickConfig | undefined;
    stick_l?: StickConfig;
    stick_r?: StickConfig;
}

const defaultLeftButtons = ['arrow_up', 'arrow_down', 'arrow_left', 'arrow_right', 'l', 'zl', 'sl', 'sr', 'minus', 'capture', 'stick_press_l'];
const defaultRightButtons = ['a', 'b', 'x', 'y', 'r', 'zr', 'sl', 'sr', 'plus', 'home', 'stick_press_r'];
const directions8way = ['up', 'down', 'left', 'right', 'up_left', 'up_right', 'down_left', 'down_right'];
const dialSectors = ['up', 'down', 'left', 'right'];

interface JoyConConfigProps {
    deviceId?: string;
}

export function JoyConConfig({ deviceId }: JoyConConfigProps) {
    const activeDeviceId = deviceId || 'global';
    const [hasIpc, setHasIpc] = useState<boolean>(() => typeof window !== 'undefined' && Boolean(window.ipcRenderer));
    const [deviceConfig, setDeviceConfig] = useState<DeviceConfig>({});

    // Helper functions for reading/writing config state safely
    const getButtonMap = (btn: string) => {
        const val = deviceConfig[btn];
        return typeof val === 'string' ? val : '';
    };

    const handleButtonChange = (btn: string, val: string) => {
        setDeviceConfig(prev => ({ ...prev, [btn]: val }));
    };

    const getStickConfig = (side: 'l' | 'r'): StickConfig => {
        const key = side === 'l' ? 'stick_l' : 'stick_r';
        const val = deviceConfig[key];
        if (typeof val === 'object') return val as StickConfig;
        if (typeof val === 'string') return { mode: val as StickMode };
        return { mode: 'none' };
    };

    const handleStickModeChange = (side: 'l' | 'r', mode: StickMode) => {
        const key = side === 'l' ? 'stick_l' : 'stick_r';
        const current = getStickConfig(side);
        setDeviceConfig(prev => ({ ...prev, [key]: { ...current, mode } }));
    };

    const handleStickSensitivityChange = (side: 'l' | 'r', sensitivity: number) => {
        const key = side === 'l' ? 'stick_l' : 'stick_r';
        const current = getStickConfig(side);
        setDeviceConfig(prev => ({ ...prev, [key]: { ...current, sensitivity } }));
    };

    const handleStickMappingChange = (side: 'l' | 'r', dir: string, val: string) => {
        const key = side === 'l' ? 'stick_l' : 'stick_r';
        const current = getStickConfig(side);
        setDeviceConfig(prev => ({
            ...prev,
            [key]: {
                ...current,
                mappings: { ...(current.mappings || {}), [dir]: val }
            }
        }));
    };

    const handleDialMappingChange = (side: 'l' | 'r', sector: string, action: 'increase' | 'decrease', val: string) => {
        const key = side === 'l' ? 'stick_l' : 'stick_r';
        const current = getStickConfig(side);
        const dials = current.dials || {};
        const sectorData = dials[sector] || { increase: '', decrease: '' };

        setDeviceConfig(prev => ({
            ...prev,
            [key]: {
                ...current,
                dials: {
                    ...dials,
                    [sector]: { ...sectorData, [action]: val }
                }
            }
        }));
    };

    const saveConfig = () => {
        if (!hasIpc) return;
        window.ipcRenderer!.invoke('joycon:save_mapping', { deviceId: activeDeviceId, mapping: deviceConfig }).catch(console.error);
    };

    const loadConfig = useCallback(() => {
        if (!hasIpc) return;
        window.ipcRenderer!.invoke('joycon:load_mapping', { deviceId: activeDeviceId }).then((res: any) => {
            if (res && res.mapping) setDeviceConfig(res.mapping);
            else setDeviceConfig({});
        }).catch(console.error);
    }, [hasIpc, activeDeviceId]);

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

        if (!hasIpc) return;

        const handleBackendEvent = (_event: unknown, raw: unknown) => {
            if (typeof raw !== 'string') return;
            try {
                const response = JSON.parse(raw);
                if (response.type === 'joycon_connected' || response.type === 'joycon_disconnected') {
                    // Refetch connected devices implicitly via status check, or just refresh list if we had an endpoint 
                    // To simplify, we'll manually fetch connected devices if we had a dedicated endpoint.
                    // For now, let's just log it. The C# backend pushes these events.
                }
            } catch (e) { }
        };

        window.ipcRenderer!.on('from-backend', handleBackendEvent);

        // Fetch initial devices if we implement a backend method for it. 
        // Currently AppController pushes 'joycon_connected' rather than a 'get_joycons' endpoint.
        // As a fallback, users can type the device path, or we can add a get_joycons command to C#.
        // For simplicity in this UI iteration, we might need the user to press a button to detect.

        return () => {
            window.ipcRenderer!.off('from-backend', handleBackendEvent);
        };
    }, [hasIpc]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const renderStickConfig = (side: 'l' | 'r') => {
        const config = getStickConfig(side);
        return (
            <Box sx={{ mt: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="subtitle1" gutterBottom>{side === 'l' ? 'Left Stick' : 'Right Stick'} Configuration</Typography>

                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <InputLabel>Stick Mode</InputLabel>
                    <Select value={config.mode} label="Stick Mode" onChange={(e) => handleStickModeChange(side, e.target.value as StickMode)}>
                        <MenuItem value="none">None</MenuItem>
                        <MenuItem value="mouse">Mouse</MenuItem>
                        <MenuItem value="8way">8-Way Keyboard</MenuItem>
                        <MenuItem value="dial">Dial (Radial)</MenuItem>
                    </Select>
                </FormControl>

                {config.mode === 'mouse' && (
                    <TextField
                        label="Mouse Sensitivity"
                        type="number"
                        size="small"
                        fullWidth
                        value={config.sensitivity || 25}
                        onChange={(e) => handleStickSensitivityChange(side, parseInt(e.target.value) || 25)}
                    />
                )}

                {config.mode === '8way' && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {directions8way.map(dir => (
                            <TextField
                                key={dir}
                                label={dir}
                                size="small"
                                value={config.mappings?.[dir] || ''}
                                onChange={(e) => handleStickMappingChange(side, dir, e.target.value)}
                                sx={{ width: 'calc(50% - 8px)' }}
                            />
                        ))}
                    </Box>
                )}

                {config.mode === 'dial' && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {dialSectors.map(sector => (
                            <Box key={sector} sx={{ width: '100%', display: 'flex', gap: 1, mb: 1 }}>
                                <Typography sx={{ width: 60, alignSelf: 'center' }}>{sector}</Typography>
                                <TextField
                                    label="Increase"
                                    size="small"
                                    fullWidth
                                    value={config.dials?.[sector]?.increase || ''}
                                    onChange={(e) => handleDialMappingChange(side, sector, 'increase', e.target.value)}
                                />
                                <TextField
                                    label="Decrease"
                                    size="small"
                                    fullWidth
                                    value={config.dials?.[sector]?.decrease || ''}
                                    onChange={(e) => handleDialMappingChange(side, sector, 'decrease', e.target.value)}
                                />
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>
        );
    };

    return (
        <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            <Typography variant="h5" gutterBottom>
                Joy-Con Configuration ({activeDeviceId})
            </Typography>

            <Box sx={{ mb: 3 }}>
                <Button variant="contained" onClick={saveConfig}>Save Config</Button>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                <JoyConIcon style={{ fontSize: 200 }} />
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {/* Left Joy-Con Box */}
                <Paper elevation={2} sx={{ p: 3, flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" gutterBottom>Left Joy-Con Actions</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {defaultLeftButtons.map(btn => (
                            <TextField
                                key={btn}
                                label={btn}
                                size="small"
                                value={getButtonMap(btn)}
                                onChange={(e) => handleButtonChange(btn, e.target.value)}
                                sx={{ width: 'calc(50% - 8px)' }}
                            />
                        ))}
                    </Box>
                    {renderStickConfig('l')}
                </Paper>

                {/* Right Joy-Con Box */}
                <Paper elevation={2} sx={{ p: 3, flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" gutterBottom>Right Joy-Con Actions</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {defaultRightButtons.map(btn => (
                            <TextField
                                key={btn}
                                label={btn}
                                size="small"
                                value={getButtonMap(btn)}
                                onChange={(e) => handleButtonChange(btn, e.target.value)}
                                sx={{ width: 'calc(50% - 8px)' }}
                            />
                        ))}
                    </Box>
                    {renderStickConfig('r')}
                </Paper>
            </Box>
        </Box>
    );
}
