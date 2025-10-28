import { createContext, useContext, Component, JSX, Accessor, createEffect } from 'solid-js';
import { createLocalStore } from '../lib/localStorage';
import { setDebugEnabled } from '../lib/debug';

/**
 * User preferences with all configurable magic numbers
 */
export interface UserPreferences {
  // POW Difficulty settings (defaults for composing)
  powDifficultyRootNote: number;
  powDifficultyReply: number;
  powDifficultyReaction: number;
  powDifficultyProfile: number;

  // Minimum POW requirements
  minPowRootNote: number;
  minPowReply: number;
  minPowReaction: number;
  minPowProfile: number;

  // POW weighting factors
  reactionPowWeight: number; // How much reactions WITH POW influence score (0.0 - 1.0)
  replyPowWeight: number; // How much replies WITH POW influence score (0.0 - 1.0)
  profilePowWeight: number; // How much profile POW influences score (0.0 - 1.0)

  // Non-POW interaction weighting factors
  nonPowReactionWeight: number; // How much reactions WITHOUT POW influence score (0.0 - 1.0)
  nonPowReplyWeight: number; // How much replies WITHOUT POW influence score (0.0 - 1.0)
  powInteractionThreshold: number; // Minimum POW for interaction to count as "with POW" (default 1)

  // Content length limits
  maxContentLengthRootNote: number;
  maxContentLengthReply: number;

  // Timeline settings
  minPowDifficulty: number;
  minPowThreshold: number;

  // UI settings
  threadedRepliesCollapseDepth: number;

  // Debug settings
  debugMode: boolean;

  // Relay settings
  enabledRelays: {
    [relayUrl: string]: boolean;
  };

  // Mining settings
  // Preferred number of workers to use for mining. Clamped to device capabilities.
  // Default leaves one core free.
  minerNumberOfWorkers: number;
  // When true, use all available cores and hide the slider
  minerUseAllCores: boolean;
  // When true, always start fresh and ignore saved mining state on resume
  disableResume: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  // POW Difficulty defaults (for composing)
  powDifficultyRootNote: 21,
  powDifficultyReply: 23,
  powDifficultyReaction: 28,
  powDifficultyProfile: 21,

  // Minimum POW requirements
  minPowRootNote: 16,
  minPowReply: 18,
  minPowReaction: 21,
  minPowProfile: 18,

  // POW weighting factors (non-linear influence)
  reactionPowWeight: 0.5, // Reactions WITH POW have 50% influence
  replyPowWeight: 0.7, // Replies WITH POW have 70% influence
  profilePowWeight: 0.3, // Profile POW has 30% influence

  // Non-POW interaction weighting factors
  nonPowReactionWeight: 0.1, // Reactions WITHOUT POW have 10% influence
  nonPowReplyWeight: 0.1, // Replies WITHOUT POW have 10% influence
  powInteractionThreshold: 1, // Minimum POW of 1 to count as "with POW"

  // Content length defaults
  maxContentLengthRootNote: 140,
  maxContentLengthReply: 280,

  // Timeline defaults
  minPowDifficulty: 8,
  minPowThreshold: 16,

  // UI defaults
  threadedRepliesCollapseDepth: 2,

  // Debug defaults
  debugMode: false,

  // Relay defaults (empty initially, will be populated when relays are discovered)
  enabledRelays: {},

  // Mining defaults
  minerNumberOfWorkers: Math.max(1, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4) - 1),
  minerUseAllCores: false,
  disableResume: false,
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
  // Load preferences and merge with defaults to handle new fields
  const stored = localStorage.getItem('notemine:preferences');
  const storedPreferences = stored ? JSON.parse(stored) : {};
  const mergedPreferences = { ...DEFAULT_PREFERENCES, ...storedPreferences };

  // Ensure localStorage contains merged defaults so new fields get initialized
  try {
    localStorage.setItem('notemine:preferences', JSON.stringify(mergedPreferences));
  } catch {}

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

  // Sync debug mode to global debug utility
  createEffect(() => {
    setDebugEnabled(preferences().debugMode);
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
