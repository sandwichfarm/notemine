import type { QueueState } from '../types/queue';
import type { PublishingState } from '../types/publishing';
import type { UserPreferences } from '../types/preferences';
import type { Emoji } from '../types/emoji';
import type { FeedParams, MediaPreloadConfig, PriorityConfig } from '../types/FeedTypes';

const deriveDefaultWorkerCount = () => {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null;
  const fallback = 4;
  return Math.max(1, (cores ?? fallback) - 1);
};

const queueStateTemplate: QueueState = {
  items: [],
  activeItemId: null,
  isProcessing: false,
  autoProcess: true,
};

const publishingStateTemplate: PublishingState = {
  items: [],
  activeJobId: null,
  isProcessing: true,
  autoPublish: true,
};

const preferencesTemplate: UserPreferences = {
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
  reactionPowWeight: 0.5,
  replyPowWeight: 0.7,
  profilePowWeight: 0.3,

  // Non-POW interaction weighting factors
  nonPowReactionWeight: 0.1,
  nonPowReplyWeight: 0.1,
  powInteractionThreshold: 1,

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
  feedView: {
    widthPreset: 'default',
    maxNoteHeightPx: 0,
    showInteractionCounts: true,
  },
  cacheBackendPreference: 'worker-relay',

  // Debug defaults
  debugMode: false,
  feedDebugMode: false,
  anonWotPreference: null,

  // Relay defaults
  enabledRelays: {},
  maxActiveRelays: 10,
  maxRelaysPerUser: 3,

  // Mining defaults
  minerNumberOfWorkers: deriveDefaultWorkerCount(),
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
    skewMarginMinutes: 15,

    hydrationLimit: 50,
    cacheWidenMultiplier: 2,
    cacheWidenCap: 50,

    visibilityDwellMs: 300,
    visibilityRootMarginPx: 300,
    interactionsMaxConcurrent: 3,
    interactionsQueueMax: 24,
    prefetchInteractionsCount: 3,
    timelineRelayLimit: 8,
    interactionRelayLimit: 12,

    anchorPreserveDelayMs: 50,
    topThresholdPx: 100,

    infiniteRootMarginPx: 300,
    infiniteTriggerPct: 0.8,
    batchClampMin: 5,
    batchClampMax: 20,
    overscan: 5,

    preloaderTimeoutMs: 1500,
    maxMediaHeightPx: 900,
    logThrottleMs: 2000,
  },
};

const emojiDefaults: Emoji[] = [
  { shortcode: 'bitcoin', url: 'https://i.nostr.build/bitcoin.png', alt: 'Bitcoin' },
  { shortcode: 'lightning', url: 'https://i.nostr.build/lightning.png', alt: 'Lightning' },
  { shortcode: 'zap', url: 'https://i.nostr.build/zap.png', alt: 'Zap' },
  { shortcode: 'nostr', url: 'https://i.nostr.build/nostr.png', alt: 'Nostr' },
  { shortcode: 'notemine', url: 'https://notemine.io/favicon.png', alt: 'Notemine' },
];

const feedParamsTemplate: Omit<FeedParams, 'authors' | 'relays'> = {
  desiredCount: 20,
  initialLimit: 20,
  maxLimit: 500,
  initialHorizonMs: 12 * 60 * 60 * 1000,
  maxHorizonMs: 14 * 24 * 60 * 60 * 1000,
  growthFast: 3.0,
  growthSlow: 1.6,
  overlapRatio: 0.15,
  overfetch: 2.0,
  skewMarginMs: 15 * 60 * 1000,
};

const priorityConfigTemplate: PriorityConfig = {
  powCoefficient: 0.7,
  freshnessCoefficient: 0.3,
  recencyHalfLifeMs: 36 * 60 * 60 * 1000,
};

const mediaPreloadTemplate: MediaPreloadConfig = {
  timeoutMs: 1500,
  enabled: true,
  defaultAspectRatio: 16 / 9,
  maxMediaHeight: 800,
};

const nip66LookbackSeconds = 24 * 60 * 60;

export interface GuiDefaults {
  relays: {
    pow: string;
    profile: string[];
    onboardingBaseline: string[];
    userMetadata: string[];
  };
  profile: {
    defaultDifficulty: number;
  };
  queue: QueueState;
  publishing: PublishingState;
  preferences: UserPreferences;
  emojis: Emoji[];
  feed: {
    params: Omit<FeedParams, 'authors' | 'relays'>;
    priority: PriorityConfig;
    mediaPreload: MediaPreloadConfig;
    nip66LookbackSeconds: number;
  };
}

export const GUI_DEFAULTS: GuiDefaults = {
  relays: {
    pow: import.meta.env.DEV ? 'ws://localhost:3334' : 'wss://notemine.io',
    profile: [
      'wss://purplepag.es',
      'wss://user.kindpag.es',
      'wss://profiles.nostr1.com',
      'wss://relay.damus.io',
      'wss://relay.primal.net',
      'wss://relay.nostr.band',
    ],
    onboardingBaseline: [
      'wss://notemine.io',
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.primal.net',
      'wss://relay.nostr.band',
    ],
    userMetadata: [
      'wss://profiles.nostr1.com',
      'wss://index.hzrd149.com',
      'wss://purplepag.es',
      'wss://user.kindpag.es',
    ],
  },
  profile: {
    defaultDifficulty: 20,
  },
  queue: queueStateTemplate,
  publishing: publishingStateTemplate,
  preferences: preferencesTemplate,
  emojis: emojiDefaults,
  feed: {
    params: feedParamsTemplate,
    priority: priorityConfigTemplate,
    mediaPreload: mediaPreloadTemplate,
    nip66LookbackSeconds,
  },
};

export const DEFAULT_POW_RELAY = GUI_DEFAULTS.relays.pow;
export const PROFILE_RELAYS = GUI_DEFAULTS.relays.profile;
export const DEFAULT_RELAY_BASELINE = GUI_DEFAULTS.relays.onboardingBaseline;
export const USER_META_RELAYS = GUI_DEFAULTS.relays.userMetadata;
export const DEFAULT_PROFILE_DIFFICULTY = GUI_DEFAULTS.profile.defaultDifficulty;

export const DEFAULT_QUEUE_STATE = GUI_DEFAULTS.queue;
export const DEFAULT_PUBLISHING_STATE = GUI_DEFAULTS.publishing;
export const DEFAULT_PREFERENCES = GUI_DEFAULTS.preferences;
export const DEFAULT_EMOJIS = GUI_DEFAULTS.emojis;
export const DEFAULT_FEED_PARAMS = GUI_DEFAULTS.feed.params;
export const DEFAULT_PRIORITY_CONFIG = GUI_DEFAULTS.feed.priority;
export const DEFAULT_MEDIA_PRELOAD_CONFIG = GUI_DEFAULTS.feed.mediaPreload;
export const DEFAULT_NIP66_LOOKBACK_SECONDS = GUI_DEFAULTS.feed.nip66LookbackSeconds;

export function createDefaultQueueState(): QueueState {
  return {
    ...DEFAULT_QUEUE_STATE,
    items: [],
  };
}

export function createDefaultPublishingState(): PublishingState {
  return {
    ...DEFAULT_PUBLISHING_STATE,
    items: [],
  };
}

export function createDefaultPreferences(): UserPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    feedView: { ...DEFAULT_PREFERENCES.feedView },
    enabledRelays: { ...DEFAULT_PREFERENCES.enabledRelays },
    feedParams: { ...DEFAULT_PREFERENCES.feedParams },
    anonWotPreference: DEFAULT_PREFERENCES.anonWotPreference
      ? { ...DEFAULT_PREFERENCES.anonWotPreference }
      : null,
  };
}

export function getDefaultEmojis(): Emoji[] {
  return DEFAULT_EMOJIS.map((emoji) => ({ ...emoji }));
}

export function getDefaultProfileRelays(): string[] {
  return [...PROFILE_RELAYS];
}

export function getDefaultRelayBaseline(): string[] {
  return [...DEFAULT_RELAY_BASELINE];
}

export function getDefaultUserMetaRelays(): string[] {
  return [...USER_META_RELAYS];
}
