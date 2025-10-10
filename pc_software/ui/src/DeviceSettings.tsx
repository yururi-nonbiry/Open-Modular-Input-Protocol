import React, { useState } from 'react';
import { useDeviceSettings, Profile } from '../contexts/DeviceSettingsContext';
import './DeviceSettings.css';
import { Socket } from 'socket.io-client';

// --- TYPE DEFINITIONS ---
interface DeviceData {
  type: 'digital' | 'analog' | 'encoder';
  device_id: number;
  port_id: number;
}

interface DeviceSettingsProps {
  activeDevices: { [key: string]: DeviceData };
  socket: Socket;
  currentPage: number;
  setCurrentPage: (page: number) => void;
}

// --- HELPER FUNCTIONS ---
const processImage = (file: File, size: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('Could not get canvas context');
                ctx.drawImage(img, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg'));
            };
            img.onerror = reject;
            img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// --- SUB-COMPONENTS ---
const ProfileManager: React.FC<{}> = () => {
    const { profiles, activeProfileId, setActiveProfileId, addProfile, deleteProfile, updateProfile } = useDeviceSettings();
    const activeProfile = profiles.find(p => p.id === activeProfileId);

    const handleAddProfile = () => {
        const name = prompt("Enter new profile name:");
        if (name) {
            const newId = addProfile(name, '');
            setActiveProfileId(newId);
        }
    };

    const handleDeleteProfile = () => {
        if (activeProfileId && activeProfileId !== 'default') {
            if (window.confirm(`Delete profile "${activeProfile?.name}"?`)) {
                deleteProfile(activeProfileId);
            }
        }
    };

    const handleUpdateAppName = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (activeProfileId) updateProfile(activeProfileId, { appName: e.target.value });
    };

    return (
        <div className="profile-manager form-group">
            <label htmlFor="profile-select">Profile</label>
            <div className="profile-controls">
                <select id="profile-select" value={activeProfileId || ''} onChange={(e) => setActiveProfileId(e.target.value)}>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={handleAddProfile} className="button-outline">Add</button>
                {activeProfileId !== 'default' && <button onClick={handleDeleteProfile} className="button-danger">Delete</button>}
            </div>
            {activeProfileId !== 'default' && (
                 <div className="form-group-inline app-name-input">
                    <label htmlFor="app-name">Application Name</label>
                    <input id="app-name" type="text" value={activeProfile?.appName || ''} onChange={handleUpdateAppName} placeholder="e.g., Code.exe"/>
                </div>
            )}
        </div>
    );
};

const PageManager: React.FC<{
    currentPage: number;
    setCurrentPage: (page: number) => void;
    pages: number[];
    onAddPage: () => void;
    onDeletePage: (page: number) => void;
}> = ({ currentPage, setCurrentPage, pages, onAddPage, onDeletePage }) => (
    <div className="page-manager">
        <label>Pages</label>
        <div className="page-tabs">
            {pages.map(page => (
                <button key={page} className={`page-tab-button ${currentPage === page ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>
                    Page {page}
                    {page > 1 && <span className="delete-page-btn" onClick={(e) => { e.stopPropagation(); onDeletePage(page); }}>&times;</span>}
                </button>
            ))}
            <button className="add-page-btn" onClick={onAddPage}>+</button>
        </div>
    </div>
);

// --- MAIN COMPONENT ---
const DeviceSettings: React.FC<DeviceSettingsProps> = ({ activeDevices, socket, currentPage, setCurrentPage }) => {
  const { getActiveProfilePages, updatePageSetting, addPage, deletePage } = useDeviceSettings();
  
  const activePages = getActiveProfilePages();
  const pageSettings = activePages[currentPage] || {};

  const handleAddPage = () => {
    const newPage = addPage();
    setCurrentPage(newPage);
  };

  const handleDeletePage = (page: number) => {
    if (window.confirm(`Are you sure you want to delete Page ${page}?`)) {
        if (currentPage === page) setCurrentPage(1);
        deletePage(page);
    }
  };

  const handleSettingChange = (key: string, newConfig: object) => {
    updatePageSetting(currentPage, key, newConfig);
  };

  const handleImageChange = async (key: string, file: File | null) => {
    if (!file) return;
    try {
        const device = activeDevices[key];
        if (!device) return;
        const imageBase64 = await processImage(file, 72);
        handleSettingChange(key, { icon: imageBase64 });
        socket.emit('set_feedback_image', {
            device_id: device.device_id,
            port_id: device.port_id,
            image_data: imageBase64.split(',')[1]
        });
    } catch (error) {
        console.error("Image processing failed:", error);
    }
  };

  const deviceKeys = Object.keys(activeDevices);
  const pageNumbers = Object.keys(activePages).map(Number).sort((a, b) => a - b);

  return (
    <>
      <h2>Device Settings</h2>
      <ProfileManager />
      <PageManager currentPage={currentPage} setCurrentPage={setCurrentPage} pages={pageNumbers} onAddPage={handleAddPage} onDeletePage={handleDeletePage} />
      
      <div className="device-settings-list">
          {deviceKeys.length > 0 ? deviceKeys.map(key => {
            const device = activeDevices[key];
            const config = pageSettings[key] || { alias: '', isVisible: true, icon: '', shortcut: '' };
            return (
              <div key={key} className="device-setting-item">
                <span className="device-key-label">Device {key}</span>
                <div className="settings-controls">
                    <div className="form-group-inline">
                        <label>Alias</label>
                        <input type="text" value={config.alias} placeholder="e.g., 'Copy'" onChange={(e) => handleSettingChange(key, { alias: e.target.value })} />
                    </div>
                    {device.type === 'digital' && (
                        <div className="form-group-inline">
                            <label>Shortcut</label>
                            <input type="text" value={config.shortcut} placeholder="e.g., 'control+c'" onChange={(e) => handleSettingChange(key, { shortcut: e.target.value })} />
                        </div>
                    )}
                    <div className="form-group-inline visibility-toggle">
                        <label>Visible</label>
                        <label className="switch">
                            <input type="checkbox" checked={config.isVisible} onChange={(e) => handleSettingChange(key, { isVisible: e.target.checked })} />
                            <span className="slider round"></span>
                        </label>
                    </div>
                </div>
                {device.type === 'digital' && (
                    <div className="icon-uploader">
                        {config.icon ? <img src={config.icon} alt="Icon" className="icon-preview" /> : <div className="icon-preview-placeholder">No Icon</div>}
                        <input type="file" accept="image/*" id={`icon-${key}-${currentPage}`} style={{display: 'none'}} onChange={(e) => handleImageChange(key, e.target.files ? e.target.files[0] : null)} />
                        <label htmlFor={`icon-${key}-${currentPage}`} className="button-outline">Upload</label>
                    </div>
                )}
              </div>
            );
          }) : <p>No active devices to configure.</p>}
      </div>
    </>
  );
};

export default DeviceSettings;
