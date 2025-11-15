import type { QueueOrderingStrategy } from '../lib/queue-ordering';

/**
 * Feed layout preferences for width presets and display toggles.
 */
export interface FeedViewPreferences {
  widthPreset: 'compact' | 'default' | 'wide' | 'full';
  maxNoteHeightPx: number;
  showInteractionCounts: boolean;
}

/**
 * Anonymous WoT preference used for browsing without signing in.
 */
export interface AnonWotPreference {
  npub: string;
  relayHints?: string[];
  lastUsed: number;
}

export type CacheBackendPreference = 'worker-relay' | 'turso-wasm' | 'off';

/**
 * User preferences with all configurable magic numbers.
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
  feedView: FeedViewPreferences;

  // Cache settings
  cacheBackendPreference: CacheBackendPreference;

  // Debug settings
  debugMode: boolean;
  feedDebugMode: boolean; // Enable diagnostic logging for feed system (Phase 4)
  anonWotPreference: AnonWotPreference | null;

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
    prefetchInteractionsCount: number; // Number of notes below fold to prefetch interactions for
    timelineRelayLimit: number; // Max relays for timeline fetches
    interactionRelayLimit: number; // Max relays for interaction hydration

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
