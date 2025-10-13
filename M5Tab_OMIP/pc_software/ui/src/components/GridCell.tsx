import { Box, Paper, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";

interface CellConfig {
    icon: string | null;
    action: string;
}

interface GridCellProps {
    config: CellConfig;
    isFlashing: boolean;
    onClick: () => void;
    onIconDrop: (filePath: string) => void;
}

export function GridCell({ config, isFlashing, onClick, onIconDrop }: GridCellProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { 'image/*': ['.png', '.gif', '.jpeg', '.jpg'] },
        noClick: true, // We use our own onClick for the edit dialog
        onDrop: (acceptedFiles) => {
            if (acceptedFiles.length > 0) {
                // In Electron, the File object has a 'path' property
                const filePath = (acceptedFiles[0] as any).path;
                if (filePath) {
                    onIconDrop(filePath);
                }
            }
        }
    });

    useEffect(() => {
        if (config.icon) {
            window.ipcRenderer.invoke('image:get_base64', config.icon)
                .then(dataUrl => {
                    if (dataUrl) {
                        setImageUrl(dataUrl);
                    }
                })
                .catch(err => {
                    console.error("Failed to load image:", err);
                    setImageUrl(null);
                });
        } else {
            setImageUrl(null);
        }
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
