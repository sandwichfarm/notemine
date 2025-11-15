import { createContext, useContext, Component, JSX, Accessor, createEffect } from 'solid-js';
import { createLocalStore } from '../lib/localStorage';
import { setDebugEnabled } from '../lib/debug';
import { setDeblurCacheSize } from '../lib/image-deblur-cache';
import { initializeRelayConnectionManager } from '../lib/applesauce';
import { CACHE_BACKEND_STORAGE_KEY } from '../lib/cache';
import { createDefaultPreferences } from '../config/defaults';
import type { UserPreferences, AnonWotPreference } from '../types/preferences';

interface PreferencesContextType {
  preferences: Accessor<UserPreferences>;
  updatePreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  resetPreferences: () => void;
  setAnonWotPreference: (pref: AnonWotPreference) => void;
  clearAnonWotPreference: () => void;

  // Relay-specific helpers
  isRelayEnabled: (relayUrl: string) => boolean;
  toggleRelay: (relayUrl: string) => boolean; // Returns false if cannot disable (last relay)
  getEnabledRelays: (allRelays: string[]) => string[];
}

const PreferencesContext = createContext<PreferencesContextType>();

const loadPreferences = (): UserPreferences => {
  const stored = localStorage.getItem('notemine:preferences');
  const storedPreferences = stored ? (JSON.parse(stored) as Partial<UserPreferences>) : {};
  const defaults = createDefaultPreferences();

  // Deep-merge nested objects (notably feedParams) so new keys get defaults
  const merged: UserPreferences = {
    ...defaults,
    ...storedPreferences,
    feedParams: {
      ...defaults.feedParams,
      ...(storedPreferences.feedParams ?? {}),
    },
    feedView: {
      ...defaults.feedView,
      ...(storedPreferences.feedView ?? {}),
    },
    enabledRelays: {
      ...defaults.enabledRelays,
      ...(storedPreferences.enabledRelays ?? {}),
    },
  };

  // Ensure localStorage contains merged defaults so new fields get initialized
  try {
    localStorage.setItem('notemine:preferences', JSON.stringify(merged));
  } catch {}

  return merged;
};

export const PreferencesProvider: Component<{ children: JSX.Element }> = (props) => {
  const mergedPreferences = loadPreferences();
  const [preferences, setPreferences] = createLocalStore<UserPreferences>('notemine:preferences', mergedPreferences);

  const updatePreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetPreferences = () => {
    const defaults = createDefaultPreferences();
    setPreferences(defaults);
  };

  const setAnonWotPreference = (pref: AnonWotPreference) => {
    setPreferences((prev) => ({
      ...prev,
      anonWotPreference: {
        npub: pref.npub,
        relayHints: pref.relayHints?.filter(Boolean),
        lastUsed: pref.lastUsed,
      },
    }));
  };

  const clearAnonWotPreference = () => {
    setPreferences((prev) => ({
      ...prev,
      anonWotPreference: null,
    }));
  };

  const isRelayEnabled = (relayUrl: string): boolean => {
    const prefs = preferences();
    // If not explicitly set, default to enabled
    return prefs.enabledRelays[relayUrl] !== false;
  };

  const toggleRelay = (relayUrl: string): boolean => {
    const prefs = preferences();
    const currentStatus = isRelayEnabled(relayUrl);

    // If trying to disable, check if this is the last enabled relay
    if (currentStatus) {
      const allRelays = Object.keys(prefs.enabledRelays);
      const enabledCount = allRelays.filter((url) => isRelayEnabled(url)).length;

      // Don't allow disabling the last relay
      if (enabledCount <= 1) {
        return false;
      }
    }

    // Toggle the relay
    setPreferences((prev) => ({
      ...prev,
      enabledRelays: {
        ...prev.enabledRelays,
        [relayUrl]: !currentStatus,
      },
    }));

    return true;
  };

  const getEnabledRelays = (allRelays: string[]): string[] => {
    return allRelays.filter((url) => isRelayEnabled(url));
  };

  const value: PreferencesContextType = {
    preferences,
    updatePreference,
    resetPreferences,
    setAnonWotPreference,
    clearAnonWotPreference,
    isRelayEnabled,
    toggleRelay,
    getEnabledRelays,
  };

  // Sync debug mode to global debug utility
  createEffect(() => {
    setDebugEnabled(preferences().debugMode);
  });

  // Sync deblur cache size when preference changes
  createEffect(() => {
    setDeblurCacheSize(preferences().deblurCacheSize);
  });

  // Sync relay connection manager config when preferences change
  createEffect(() => {
    initializeRelayConnectionManager(
      preferences().maxActiveRelays,
      preferences().maxRelaysPerUser,
      preferences().debugMode
    );
  });

  // Keep cache backend preference mirrored for cache module access
  createEffect(() => {
    const backendPref = preferences().cacheBackendPreference;
    try {
      if (backendPref === 'off') {
        localStorage.removeItem(CACHE_BACKEND_STORAGE_KEY);
      } else {
        localStorage.setItem(CACHE_BACKEND_STORAGE_KEY, backendPref);
      }
    } catch {}
  });

  return (
    <PreferencesContext.Provider value={value}>
      {props.children}
    </PreferencesContext.Provider>
  );
};

export function usePreferences(): PreferencesContextType {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return context;
}
