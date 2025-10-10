import React, { createContext, useState, useMemo, useContext, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

// --- Data Structures ---
export interface DeviceConfig {
  alias: string;
  isVisible: boolean;
  icon: string; 
  shortcut: string;
}

export type PageSettings = { [key: string]: DeviceConfig };
export type ProfilePages = { [page: number]: PageSettings };

export interface Profile {
    id: string;
    name: string;
    appName: string; // e.g., 'Code.exe' or 'photoshop.exe'
}

export interface ProfileData {
    profile: Profile;
    pages: ProfilePages;
}

export type AllProfilesData = { [profileId: string]: ProfileData };

// --- Context Type ---
interface DeviceSettingsContextType {
  profiles: Profile[];
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  
  // Profile Management
  addProfile: (name: string, appName: string) => string;
  deleteProfile: (profileId: string) => void;
  updateProfile: (profileId: string, newInfo: Partial<Omit<Profile, 'id'>>) => void;
  findProfileByAppName: (appName: string) => Profile | undefined;

  // Page & Settings Management (for the active profile)
  getActiveProfilePages: () => ProfilePages;
  updatePageSetting: (page: number, key: string, newConfig: Partial<DeviceConfig>) => void;
  addPage: () => number;
  deletePage: (page: number) => void;
  getMaxPage: () => number;
}

const DeviceSettingsContext = createContext<DeviceSettingsContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'omip-device-settings-v3';
const DEFAULT_PROFILE_ID = 'default';

const defaultProfile: ProfileData = {
    profile: { id: DEFAULT_PROFILE_ID, name: 'Default', appName: '' },
    pages: { 1: {} }
};

const loadSettings = (): AllProfilesData => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : { [DEFAULT_PROFILE_ID]: defaultProfile };
    if (!parsed[DEFAULT_PROFILE_ID]) {
        parsed[DEFAULT_PROFILE_ID] = defaultProfile;
    }
    return parsed;
  } catch (error) {
    console.error("Failed to load device settings:", error);
    return { [DEFAULT_PROFILE_ID]: defaultProfile };
  }
};

export const DeviceSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profilesData, setProfilesData] = useState<AllProfilesData>(loadSettings());
  const [activeProfileId, setActiveProfileId] = useState<string | null>(DEFAULT_PROFILE_ID);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profilesData));
    } catch (error) {
      console.error("Failed to save device settings:", error);
    }
  }, [profilesData]);

  const profiles = useMemo(() => Object.values(profilesData).map(p => p.profile), [profilesData]);

  const getActiveProfilePages = useCallback(() => {
    if (!activeProfileId || !profilesData[activeProfileId]) return { 1: {} };
    return profilesData[activeProfileId].pages;
  }, [activeProfileId, profilesData]);

  const updateProfile = useCallback((profileId: string, newInfo: Partial<Omit<Profile, 'id'>>) => {
    setProfilesData(prev => {
        if (!prev[profileId]) return prev;
        const updatedProfile = { ...prev[profileId].profile, ...newInfo };
        return { ...prev, [profileId]: { ...prev[profileId], profile: updatedProfile } };
    });
  }, []);

  const addProfile = useCallback((name: string, appName: string) => {
    const newId = uuidv4();
    const newProfile: ProfileData = {
        profile: { id: newId, name, appName },
        pages: { 1: {} }
    };
    setProfilesData(prev => ({ ...prev, [newId]: newProfile }));
    return newId;
  }, []);

  const deleteProfile = useCallback((profileId: string) => {
    if (profileId === DEFAULT_PROFILE_ID) return; // Cannot delete default
    setProfilesData(prev => {
        const newState = { ...prev };
        delete newState[profileId];
        return newState;
    });
    if (activeProfileId === profileId) {
        setActiveProfileId(DEFAULT_PROFILE_ID);
    }
  }, [activeProfileId]);

  const findProfileByAppName = useCallback((appName: string) => {
    return profiles.find(p => p.appName.toLowerCase() === appName.toLowerCase());
  }, [profiles]);

  const updatePageSetting = useCallback((page: number, key: string, newConfig: Partial<DeviceConfig>) => {
    if (!activeProfileId) return;
    setProfilesData(prev => {
        const activeProfileData = prev[activeProfileId];
        const currentPageSettings = activeProfileData.pages[page] || {};
        const updatedDeviceConfig = { ...currentPageSettings[key] || { alias: '', isVisible: true, icon: '', shortcut: '' }, ...newConfig };
        const updatedPages = { ...activeProfileData.pages, [page]: { ...currentPageSettings, [key]: updatedDeviceConfig } };
        return { ...prev, [activeProfileId]: { ...activeProfileData, pages: updatedPages } };
    });
  }, [activeProfileId]);

  const getMaxPage = useCallback(() => {
    const pages = getActiveProfilePages();
    const pageNumbers = Object.keys(pages).map(Number);
    return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 0;
  }, [getActiveProfilePages]);

  const addPage = useCallback(() => {
    if (!activeProfileId) return 0;
    const newPageNumber = getMaxPage() + 1;
    setProfilesData(prev => {
        const activeProfileData = prev[activeProfileId];
        const updatedPages = { ...activeProfileData.pages, [newPageNumber]: {} };
        return { ...prev, [activeProfileId]: { ...activeProfileData, pages: updatedPages } };
    });
    return newPageNumber;
  }, [activeProfileId, getMaxPage]);

  const deletePage = useCallback((page: number) => {
    if (!activeProfileId || page === 1) return;
    setProfilesData(prev => {
        const activeProfileData = prev[activeProfileId];
        const updatedPages = { ...activeProfileData.pages };
        delete updatedPages[page];
        return { ...prev, [activeProfileId]: { ...activeProfileData, pages: updatedPages } };
    });
  }, [activeProfileId]);

  const value = useMemo(() => ({
    profiles,
    activeProfileId,
    setActiveProfileId,
    addProfile,
    deleteProfile,
    updateProfile,
    findProfileByAppName,
    getActiveProfilePages,
    updatePageSetting,
    addPage,
    deletePage,
    getMaxPage,
  }), [profiles, activeProfileId, addProfile, deleteProfile, updateProfile, findProfileByAppName, getActiveProfilePages, updatePageSetting, addPage, deletePage, getMaxPage]);

  return (
    <DeviceSettingsContext.Provider value={value}>
      {children}
    </DeviceSettingsContext.Provider>
  );
};

export const useDeviceSettings = () => {
  const context = useContext(DeviceSettingsContext);
  if (context === undefined) {
    throw new Error('useDeviceSettings must be used within a DeviceSettingsProvider');
  }
  return context;
};
