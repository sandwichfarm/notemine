import { createContext, useContext, Component, JSX, Accessor, createEffect } from 'solid-js';
import { createLocalStore } from '../lib/localStorage';
import { setDebugEnabled } from '../lib/debug';
import type { QueueOrderingStrategy } from '../lib/queue-ordering';
import { setDeblurCacheSize } from '../lib/image-deblur-cache';
import { initializeRelayConnectionManager } from '../lib/applesauce';

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
  autoDeblurImages: boolean; // Auto-deblur all images without user interaction
  deblurCacheSize: number; // Max number of deblurred image hashes to remember (1-5000)

  // Debug settings
  debugMode: boolean;
  feedDebugMode: boolean; // Enable diagnostic logging for feed system (Phase 4)

  // Relay settings
  enabledRelays: {
    [relayUrl: string]: boolean;
  };
  maxActiveRelays: number; // Maximum simultaneous relay connections (smart connection management)
  maxRelaysPerUser: number; // Maximum relays to use per user in optimal selection

  // Mining settings
  // Preferred number of workers to use for mining. Clamped to device capabilities.
  // Default leaves one core free.
  minerNumberOfWorkers: number;
  // When true, use all available cores and hide the slider
  minerUseAllCores: boolean;
  // When true, always start fresh and ignore saved mining state on resume
  disableResume: boolean;
  // When true, resume with saved worker count; when false, use preference/all-cores setting
  resumeUseSavedWorkers: boolean;

  // Queue ordering strategy
  // Controls how new items are inserted and whether lower-difficulty items preempt higher ones
  queueOrderingStrategy: QueueOrderingStrategy;

  // Feed parameters (adaptive fetch settings)
  feedParams: {
    desiredCount: number;
    initialLimit: number;
    maxLimit: number;
    initialHorizonHours: number;
    maxHorizonDays: number;
    growthFast: number;
    growthSlow: number;
    overlapRatio: number;
    overfetch: number;
    skewMarginMinutes: number; // Clock skew tolerance in minutes

    // Phase 1: Cache hydration limits
    hydrationLimit: number; // Max root notes to show from cache on initial load
    cacheWidenMultiplier: number; // Multiplier for cache query (e.g. 2x desiredCount)
    cacheWidenCap: number; // Absolute max for cache widen (hard cap)

    // Phase 2: Visibility and lazy loading
    visibilityDwellMs: number; // Milliseconds to wait before triggering lazy load
    visibilityRootMarginPx: number; // Root margin in pixels for intersection observer
    interactionsMaxConcurrent: number; // Max concurrent interactions fetches
    interactionsQueueMax: number; // Max queued interactions requests

    // Phase 3: Anchor preservation
    anchorPreserveDelayMs: number; // Delay before measuring anchor for preservation
    topThresholdPx: number; // Scroll position threshold for "at top"

    // Phase 4: Infinite scroll
    infiniteRootMarginPx: number; // Root margin for infinite scroll sentinel
    infiniteTriggerPct: number; // Trigger percentage (0.0-1.0) for loading more
    batchClampMin: number; // Minimum batch size for pagination
    batchClampMax: number; // Maximum batch size for pagination
    overscan: number; // Render buffer beyond window edge (Phase 2 windowing)

    // Phase 6: Diagnostics
    preloaderTimeoutMs: number; // Timeout for media preloader
    maxMediaHeightPx: number; // Max height for media elements
    logThrottleMs: number; // Throttle interval for debug logging
  };
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
  autoDeblurImages: false,
  deblurCacheSize: 500,

  // Debug defaults
  debugMode: false,
  feedDebugMode: false, // Disabled by default (Phase 4)

  // Relay defaults (empty initially, will be populated when relays are discovered)
  enabledRelays: {},
  maxActiveRelays: 10, // Default to 10 simultaneous connections
  maxRelaysPerUser: 3, // Default to 3 relays per user in optimal selection

  // Mining defaults
  minerNumberOfWorkers: Math.max(1, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4) - 1),
  minerUseAllCores: false,
  disableResume: false,
  resumeUseSavedWorkers: true,

  // Queue ordering default
  queueOrderingStrategy: 'lowDifficultyFirst',

  // Feed parameters defaults
  feedParams: {
    desiredCount: 20,
    initialLimit: 20,
    maxLimit: 500,
    initialHorizonHours: 12,
    maxHorizonDays: 14,
    growthFast: 3.0,
    growthSlow: 1.6,
    overlapRatio: 0.15,
    overfetch: 2.0,
    skewMarginMinutes: 15, // 15 minutes clock skew tolerance

    // Phase 1: Cache hydration limits
    hydrationLimit: 50, // Show up to 50 cached notes immediately
    cacheWidenMultiplier: 2, // Query 2x desiredCount from cache
    cacheWidenCap: 50, // Hard cap on cache widen

    // Phase 2: Visibility and lazy loading
    visibilityDwellMs: 300, // 300ms dwell before triggering lazy load
    visibilityRootMarginPx: 300, // 300px pre-heating margin
    interactionsMaxConcurrent: 3, // Max 3 concurrent interactions fetches
    interactionsQueueMax: 24, // Max 24 queued requests

    // Phase 3: Anchor preservation
    anchorPreserveDelayMs: 50, // 50ms delay before anchor measurement
    topThresholdPx: 100, // Consider "at top" when scrollY < 100px

    // Phase 4: Infinite scroll
    infiniteRootMarginPx: 300, // 300px margin for infinite scroll trigger
    infiniteTriggerPct: 0.8, // Trigger at 80% of scroll
    batchClampMin: 5, // Min 5 notes per batch
    batchClampMax: 20, // Max 20 notes per batch
    overscan: 5, // Small buffer beyond window edge for smooth scrolling

    // Phase 6: Diagnostics
    preloaderTimeoutMs: 1500, // 1.5s timeout for media preloading
    maxMediaHeightPx: 900, // Max 900px height for media
    logThrottleMs: 2000, // Throttle debug logs to every 2s
  },
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
  const storedPreferences = stored ? JSON.parse(stored) : {} as Partial<UserPreferences>;
  // Deep-merge nested objects (notably feedParams) so new keys get defaults
  const mergedPreferences: UserPreferences = {
    ...DEFAULT_PREFERENCES,
    ...storedPreferences,
    feedParams: {
      ...DEFAULT_PREFERENCES.feedParams,
      ...(storedPreferences as any)?.feedParams,
    },
  };

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
