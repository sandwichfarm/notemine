import { createContext, useContext, Component, JSX, Accessor } from 'solid-js';
import { createLocalStore } from '../lib/localStorage';

/**
 * User preferences with all configurable magic numbers
 */
export interface UserPreferences {
  // POW Difficulty settings
  powDifficultyRootNote: number;
  powDifficultyReply: number;
  powDifficultyReaction: number;
  powDifficultyProfile: number;

  // Content length limits
  maxContentLengthRootNote: number;
  maxContentLengthReply: number;

  // Timeline settings
  minPowDifficulty: number;
  minPowThreshold: number;

  // UI settings
  threadedRepliesCollapseDepth: number;

  // Relay settings
  enabledRelays: {
    [relayUrl: string]: boolean;
  };
}

const DEFAULT_PREFERENCES: UserPreferences = {
  // POW Difficulty defaults
  powDifficultyRootNote: 20,
  powDifficultyReply: 18,
  powDifficultyReaction: 18,
  powDifficultyProfile: 20,

  // Content length defaults
  maxContentLengthRootNote: 140,
  maxContentLengthReply: 280,

  // Timeline defaults
  minPowDifficulty: 8,
  minPowThreshold: 16,

  // UI defaults
  threadedRepliesCollapseDepth: 2,

  // Relay defaults (empty initially, will be populated when relays are discovered)
  enabledRelays: {},
};

interface PreferencesContextType {
  preferences: Accessor<UserPreferences>;
  updatePreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  resetPreferences: () => void;

  // Relay-specific helpers
  isRelayEnabled: (relayUrl: string) => boolean;
  toggleRelay: (relayUrl: string) => boolean; // Returns false if cannot disable (last relay)
  getEnabledRelays: (allRelays: string[]) => string[];
}

const PreferencesContext = createContext<PreferencesContextType>();

export const PreferencesProvider: Component<{ children: JSX.Element }> = (props) => {
  const [preferences, setPreferences] = createLocalStore<UserPreferences>(
    'notemine:preferences',
    DEFAULT_PREFERENCES
  );

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
    setPreferences(DEFAULT_PREFERENCES);
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
    isRelayEnabled,
    toggleRelay,
    getEnabledRelays,
  };

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
