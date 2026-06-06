import { Box, Typography, Paper, FormControl, InputLabel, Select, MenuItem, TextField, Button, Divider } from '@mui/material';
import { InteractiveJoyCon } from '../components/InteractiveJoyCon';
import type { JoyConElement } from '../components/InteractiveJoyCon';
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

const directions8way = ['up', 'down', 'left', 'right', 'up_left', 'up_right', 'down_left', 'down_right'];
const dialSectors = ['up', 'down', 'left', 'right'];

interface JoyConConfigProps {
    deviceId?: string;
}

export function JoyConConfig({ deviceId }: JoyConConfigProps) {
    const activeDeviceId = deviceId || 'global';
    const [hasIpc, setHasIpc] = useState<boolean>(() => typeof window !== 'undefined' && Boolean(window.ipcRenderer));
    const [deviceConfig, setDeviceConfig] = useState<DeviceConfig>({});
    const [selectedElement, setSelectedElement] = useState<JoyConElement | undefined>(undefined);

    // Helper functions for reading/writing config state safely
    const getButtonMap = (btn: JoyConElement) => {
        const val = deviceConfig[btn];
        return typeof val === 'string' ? val : '';
    };

    const handleButtonChange = (btn: JoyConElement, val: string) => {
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
    }, [hasIpc]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const renderStickConfig = (side: 'l' | 'r') => {
        const config = getStickConfig(side);
        return (
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth size="small">
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
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        {directions8way.map(dir => (
                            <TextField
                                key={dir}
                                label={dir}
                                size="small"
                                value={config.mappings?.[dir] || ''}
                                onChange={(e) => handleStickMappingChange(side, dir, e.target.value)}
                            />
                        ))}
                    </Box>
                )}

                {config.mode === 'dial' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {dialSectors.map(sector => (
                            <Box key={sector} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" gutterBottom>{sector.toUpperCase()}</Typography>
                                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
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
                            </Box>
                        ))}
                    </Box>
                )}

                <Divider sx={{ my: 1 }} />

                <TextField
                    label={`${side === 'l' ? 'Left' : 'Right'} Stick Press (Click)`}
                    size="small"
                    fullWidth
                    value={getButtonMap(`stick_press_${side}`)}
                    onChange={(e) => handleButtonChange(`stick_press_${side}`, e.target.value)}
                    helperText="Optional action when stick is pressed"
                />
            </Box>
        );
    };

    const renderDetailPane = () => {
        if (!selectedElement) {
            return (
                <Box sx={{ p: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                    <Typography>左の図形からボタンまたはスティックをクリックして設定します。</Typography>
                </Box>
            );
        }

        const isStick = selectedElement === 'stick_l' || selectedElement === 'stick_r';

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" gutterBottom sx={{ textTransform: 'uppercase', borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                    {selectedElement.replace('_', ' ')} Settings
                </Typography>
                <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 1, mt: 2 }}>
                    {isStick ? (
                        renderStickConfig(selectedElement === 'stick_l' ? 'l' : 'r')
                    ) : (
                        <TextField
                            label={`${selectedElement.toUpperCase()} Action`}
                            size="small"
                            fullWidth
                            value={getButtonMap(selectedElement)}
                            onChange={(e) => handleButtonChange(selectedElement, e.target.value)}
                            placeholder="e.g. enter, ctrl+c, a"
                            helperText="PC側で送信するキーまたはマクロを入力します。"
                            autoFocus
                        />
                    )}
                </Box>
            </Box>
        );
    };

    return (
        <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">
                    Joy-Con Configuration ({activeDeviceId})
                </Typography>
                <Button variant="contained" onClick={saveConfig} color="primary">Save Config</Button>
            </Box>

            <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden', gap: 4 }}>
                {/* Left Pane: Interactive Graphic */}
                <Paper elevation={3} sx={{ flex: '1 1 60%', p: 2, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    <Typography variant="subtitle1" color="text.secondary" gutterBottom align="center">
                        グラフィカル設定 (クリックして選択)
                    </Typography>
                    <InteractiveJoyCon
                        selectedElement={selectedElement}
                        onSelectElement={setSelectedElement}
                        deviceConfig={deviceConfig}
                    />
                </Paper>

                {/* Right Pane: Settings Detail */}
                <Paper elevation={3} sx={{ flex: '1 1 40%', p: 3, display: 'flex', flexDirection: 'column', minWidth: 300, overflowY: 'hidden' }}>
                    {renderDetailPane()}
                </Paper>
            </Box>
        </Box>
    );
}
