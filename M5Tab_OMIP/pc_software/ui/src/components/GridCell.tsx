import { Box, Paper, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";

interface CellConfig {
    icon: string | null;
    action: string;
}

export interface DroppedIconPayload {
    dataUrl: string;
    filePath?: string | null;
}

const isLikelyAbsolutePath = (value: string) => {
    if (!value) return false;
    return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
};

interface GridCellProps {
    config: CellConfig;
    isFlashing: boolean;
    onClick: () => void;
    onIconDrop: (payload: DroppedIconPayload) => void;
}

export function GridCell({ config, isFlashing, onClick, onIconDrop }: GridCellProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    const handleFileDrop = useCallback((file: File) => {
        if (!file) {
            return;
        }

        // Read the file as a Data URL so we always have an immediate preview.
        if (typeof window === 'undefined') {
            return;
        }

        const reader = new FileReader();
        const fileWithPath = file as File & { path?: string };
        const droppedFilePath = typeof fileWithPath.path === 'string' ? fileWithPath.path : undefined;
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : null;
            if (result) {
                setImageUrl(result);
                onIconDrop({
                    dataUrl: result,
                    filePath: droppedFilePath ?? null,
                });
            }
        };
        reader.onerror = (error) => {
            console.error("Failed to read dropped image:", error);
            setImageUrl(null);
        };
        reader.readAsDataURL(file);
    }, [onIconDrop]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { 'image/*': ['.png', '.gif', '.jpeg', '.jpg'] },
        noClick: true, // We use our own onClick for the edit dialog
        useFsAccessApi: false,
        onDrop: (acceptedFiles) => {
            if (acceptedFiles.length > 0) {
                handleFileDrop(acceptedFiles[0]);
            }
        }
    });

    useEffect(() => {
        if (!config.icon) {
            setImageUrl(null);
            return;
        }

        if (config.icon.startsWith('data:')) {
            setImageUrl(config.icon);
            return;
        }

        if (!isLikelyAbsolutePath(config.icon)) {
            setImageUrl(null);
            return;
        }

        const hasIpc = typeof window !== 'undefined' && Boolean(window.ipcRenderer);
        if (!hasIpc) {
            console.warn("ipcRenderer unavailable; cannot load icon from filesystem path.");
            setImageUrl(null);
            return;
        }

        window.ipcRenderer!.invoke('image:get_base64', config.icon)
            .then((value) => {
                const dataUrl = typeof value === 'string' ? value : null;
                setImageUrl(dataUrl);
            })
            .catch(err => {
                console.error("Failed to load image:", err);
                setImageUrl(null);
            });
    }, [config.icon]);

    return (
        <Paper
            {...getRootProps()}
            elevation={isFlashing ? 8 : 2}
            sx={{
                height: 120,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-around',
                p: 1,
                cursor: 'pointer',
                backgroundColor: isFlashing ? 'primary.light' : 'background.paper',
                transition: 'background-color 0.1s ease-in-out',
                '&:hover': { backgroundColor: 'action.hover' },
                overflow: 'hidden',
                border: isDragActive ? '2px dashed' : '2px solid transparent',
                borderColor: isDragActive ? 'primary.main' : 'transparent',
            }}
        >
            <input {...getInputProps()} />
            {/* We need a wrapper Box for the onClick to work separately from the dropzone's root props */}
            <Box onClick={onClick} sx={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-around'}}>
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                    {imageUrl ? (
                        <img src={imageUrl} alt={config.action} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : (
                        <Typography variant="h5">?</Typography>
                    )}
                </Box>
                <Typography variant="caption" noWrap sx={{ width: '100%', textAlign: 'center' }}>
                    {config.action || 'Unset'}
                </Typography>
            </Box>
        </Paper>
    );
}
