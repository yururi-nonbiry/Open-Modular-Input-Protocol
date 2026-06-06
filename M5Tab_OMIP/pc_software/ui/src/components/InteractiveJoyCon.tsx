import { Box, Tooltip } from "@mui/material";
import React from "react";

// Types corresponding to JoyCon buttons/sticks
export type JoyConElement = string; // e.g., 'a', 'b', 'stick_l', 'zl'

interface InteractiveJoyConProps {
    onSelectElement: (elementId: JoyConElement) => void;
    selectedElement?: JoyConElement;
    deviceConfig: Record<string, any>;
}

export function InteractiveJoyCon({ onSelectElement, selectedElement, deviceConfig }: InteractiveJoyConProps) {
    const isConfigured = (id: JoyConElement) => {
        const val = deviceConfig[id];
        if (!val) return false;
        if (typeof val === 'string' && val.trim() !== '') return true;
        if (typeof val === 'object' && val.mode && val.mode !== 'none') return true;
        return false;
    };

    const getTooltipText = (id: JoyConElement) => {
        const val = deviceConfig[id];
        if (!val) return "Not configured";
        if (typeof val === 'string') return val;
        if (typeof val === 'object') return `Mode: ${val.mode}`;
        return "";
    };

    const getFillColor = (id: JoyConElement, defaultColor: string) => {
        if (selectedElement === id) return "#FFD700"; // Gold highlight for selected
        if (isConfigured(id)) return "#4CAF50"; // Green highlight for configured
        return defaultColor;
    };

    const interactiveProps = (id: JoyConElement) => ({
        onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelectElement(id);
        },
        style: { cursor: 'pointer', transition: 'fill 0.2s', stroke: selectedElement === id ? 'white' : 'none', strokeWidth: selectedElement === id ? 1 : 0 },
        className: `joycon-element ${id}`,
    });

    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', maxWidth: 600, margin: '0 auto', p: 2 }}>
            <svg viewBox="-20 -10 140 120" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>
                <defs>
                    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
                    </filter>
                </defs>

                {/* --- Joy-Con (L) --- */}
                <g transform="translate(2, 10)">
                    {/* ZL Button (奥) */}
                    <Tooltip title={`ZL: ${getTooltipText('zl')}`} arrow placement="top">
                        <path d="M5,0 L20,0 C25,0 30,5 30,10 L30,15 L0,15 L0,5 C0,2.5 2.5,0 5,0 Z" fill={getFillColor('zl', '#007EBC')} {...interactiveProps('zl')} />
                    </Tooltip>
                    <text x="15" y="10" textAnchor="middle" fontSize="8" fill="white" style={{ pointerEvents: 'none' }}>ZL</text>

                    {/* L Button (手前) */}
                    <Tooltip title={`L: ${getTooltipText('l')}`} arrow placement="top">
                        <path d="M5,12 L20,12 C25,12 30,17 30,22 L30,27 L0,27 L0,17 C0,14.5 2.5,12 5,12 Z" fill={getFillColor('l', '#008ECC')} {...interactiveProps('l')} />
                    </Tooltip>

                    {/* Body */}
                    <path d="M25,20 C10,20 0,30 0,40 L0,80 C0,90 10,100 25,100 L35,100 L35,20 Z" transform="translate(0, -20)" fill="#00AEEF" filter="url(#shadow)" />

                    {/* SL Button */}
                    <Tooltip title={`SL: ${getTooltipText('sl')}`} arrow placement="left">
                        <rect x="35" y="30" width="3" height="15" rx="1.5" fill={getFillColor('sl', '#333')} {...interactiveProps('sl')} />
                    </Tooltip>
                    {/* SR Button */}
                    <Tooltip title={`SR: ${getTooltipText('sr')}`} arrow placement="left">
                        <rect x="35" y="55" width="3" height="15" rx="1.5" fill={getFillColor('sr', '#333')} {...interactiveProps('sr')} />
                    </Tooltip>

                    {/* Analog Stick L */}
                    <Tooltip title={`Left Stick: ${getTooltipText('stick_l')} / Press: ${getTooltipText('stick_press_l')}`} arrow placement="top">
                        <g {...interactiveProps('stick_l')}>
                            <circle cx="17.5" cy="25" r="8" fill={getFillColor('stick_l', '#333')} />
                            <circle cx="17.5" cy="25" r="6" fill="#555" />
                        </g>
                    </Tooltip>

                    {/* D-Pad Buttons */}
                    <Tooltip title={`Up: ${getTooltipText('arrow_up')}`} arrow placement="top">
                        <circle cx="17.5" cy="42" r="3" fill={getFillColor('arrow_up', '#222')} {...interactiveProps('arrow_up')} />
                    </Tooltip>
                    <Tooltip title={`Left: ${getTooltipText('arrow_left')}`} arrow placement="left">
                        <circle cx="10" cy="50" r="3" fill={getFillColor('arrow_left', '#222')} {...interactiveProps('arrow_left')} />
                    </Tooltip>
                    <Tooltip title={`Right: ${getTooltipText('arrow_right')}`} arrow placement="right">
                        <circle cx="25" cy="50" r="3" fill={getFillColor('arrow_right', '#222')} {...interactiveProps('arrow_right')} />
                    </Tooltip>
                    <Tooltip title={`Down: ${getTooltipText('arrow_down')}`} arrow placement="bottom">
                        <circle cx="17.5" cy="58" r="3" fill={getFillColor('arrow_down', '#222')} {...interactiveProps('arrow_down')} />
                    </Tooltip>

                    {/* Minus Button */}
                    <Tooltip title={`Minus: ${getTooltipText('minus')}`} arrow placement="top">
                        <rect x="23" y="10" width="8" height="3" rx="1" fill={getFillColor('minus', '#222')} {...interactiveProps('minus')} />
                    </Tooltip>

                    {/* Capture Button */}
                    <Tooltip title={`Capture: ${getTooltipText('capture')}`} arrow placement="bottom">
                        <rect x="22" y="72" width="6" height="6" rx="1" fill={getFillColor('capture', '#222')} {...interactiveProps('capture')} />
                    </Tooltip>
                    <circle cx="25" cy="75" r="2" fill="#555" style={{ pointerEvents: 'none' }} />
                </g>

                {/* --- Joy-Con (R) --- */}
                {/* Note: the visual logic is manually flipped for easier interactivity without messing up tooltips/events inside an SVG scale(-1, 1) */}
                <g transform="translate(62, 10)">
                    {/* ZR Button (奥) */}
                    <Tooltip title={`ZR: ${getTooltipText('zr')}`} arrow placement="top">
                        <path d="M30,0 L15,0 C10,0 5,5 5,10 L5,15 L35,15 L35,5 C35,2.5 32.5,0 30,0 Z" fill={getFillColor('zr', '#CC2222')} {...interactiveProps('zr')} />
                    </Tooltip>
                    <text x="20" y="10" textAnchor="middle" fontSize="8" fill="white" style={{ pointerEvents: 'none' }}>ZR</text>

                    {/* R Button (手前) */}
                    <Tooltip title={`R: ${getTooltipText('r')}`} arrow placement="top">
                        <path d="M30,12 L15,12 C10,12 5,17 5,22 L5,27 L35,27 L35,17 C35,14.5 32.5,12 30,12 Z" fill={getFillColor('r', '#DD3333')} {...interactiveProps('r')} />
                    </Tooltip>

                    {/* Body (Right side curve) */}
                    <path d="M10,20 C25,20 35,30 35,40 L35,80 C35,90 25,100 10,100 L0,100 L0,20 Z" transform="translate(0, -20)" fill="#FF4444" filter="url(#shadow)" />

                    {/* SL Button */}
                    <Tooltip title={`SL: ${getTooltipText('sl')}`} arrow placement="right">
                        <rect x="-3" y="30" width="3" height="15" rx="1.5" fill={getFillColor('sl', '#333')} {...interactiveProps('sl')} />
                    </Tooltip>
                    {/* SR Button */}
                    <Tooltip title={`SR: ${getTooltipText('sr')}`} arrow placement="right">
                        <rect x="-3" y="55" width="3" height="15" rx="1.5" fill={getFillColor('sr', '#333')} {...interactiveProps('sr')} />
                    </Tooltip>

                    {/* Analog Stick R */}
                    <Tooltip title={`Right Stick: ${getTooltipText('stick_r')} / Press: ${getTooltipText('stick_press_r')}`} arrow placement="bottom">
                        <g {...interactiveProps('stick_r')}>
                            <circle cx="17.5" cy="55" r="8" fill={getFillColor('stick_r', '#333')} />
                            <circle cx="17.5" cy="55" r="6" fill="#555" />
                        </g>
                    </Tooltip>

                    {/* ABXY Buttons */}
                    <Tooltip title={`X: ${getTooltipText('x')}`} arrow placement="top">
                        <circle cx="17.5" cy="22" r="3" fill={getFillColor('x', '#222')} {...interactiveProps('x')} />
                    </Tooltip>
                    <Tooltip title={`Y: ${getTooltipText('y')}`} arrow placement="left">
                        <circle cx="10" cy="30" r="3" fill={getFillColor('y', '#222')} {...interactiveProps('y')} />
                    </Tooltip>
                    <Tooltip title={`A: ${getTooltipText('a')}`} arrow placement="right">
                        <circle cx="25" cy="30" r="3" fill={getFillColor('a', '#222')} {...interactiveProps('a')} />
                    </Tooltip>
                    <Tooltip title={`B: ${getTooltipText('b')}`} arrow placement="bottom">
                        <circle cx="17.5" cy="38" r="3" fill={getFillColor('b', '#222')} {...interactiveProps('b')} />
                    </Tooltip>

                    {/* Plus Button */}
                    <Tooltip title={`Plus: ${getTooltipText('plus')}`} arrow placement="top">
                        <g {...interactiveProps('plus')}>
                            <rect x="5" y="10" width="8" height="2" fill={getFillColor('plus', '#222')} />
                            <rect x="8" y="7" width="2" height="8" fill={getFillColor('plus', '#222')} />
                        </g>
                    </Tooltip>

                    {/* Home Button */}
                    <Tooltip title={`Home: ${getTooltipText('home')}`} arrow placement="bottom">
                        <circle cx="10" cy="72" r="4" fill={getFillColor('home', '#222')} {...interactiveProps('home')} />
                    </Tooltip>
                    <circle cx="10" cy="72" r="2.5" fill="#555" style={{ pointerEvents: 'none' }} />
                </g>
            </svg>
            <style>
                {`
                    .joycon-element:hover {
                        opacity: 0.8;
                    }
                `}
            </style>
        </Box>
    );
}
