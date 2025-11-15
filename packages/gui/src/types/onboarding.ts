export type OnboardingStep =
  | 'intro'
  | 'key-mining'
  | 'key-safety'
  | 'profile'
  | 'follow-packs'
  | 'complete';

export interface OnboardingKeyDraft {
  secretHex?: string;
  pubkeyHex?: string;
  powScore?: number;
  confirmed?: boolean;
  createdAt?: number;
  lastAttemptCount?: number;
  targetDifficulty?: number;
}

export interface OnboardingProfileDraft {
  name?: string;
  about?: string;
  imageDataUrl?: string;
  imagePreviewDataUrl?: string;
  mimeType?: string;
  minedEventId?: string;
  publishedAt?: number;
  queueItemId?: string;
  publishJobId?: string;
  status?: 'idle' | 'queued' | 'mining' | 'publishing' | 'completed' | 'error';
  lastError?: string;
}

export interface OnboardingRelayDraft {
  relays?: string[];
  selectedOpenRelays?: string[];
  publishedAt?: number;
  relaySample?: string[];
  publishJobId?: string;
  status?: 'idle' | 'publishing' | 'completed' | 'error';
  lastError?: string;
}

export interface FollowPackSelectionState {
  selectedPackIds: string[];
  aggregatedPubkeys: Record<string, number>;
  previewPubkeys: string[];
  publishJobId?: string;
  publishedAt?: number;
  status?: 'idle' | 'publishing' | 'completed' | 'error';
  lastError?: string;
}

export interface OnboardingDraft {
  version: number;
  step: OnboardingStep;
  lastUpdated: number;
  key?: OnboardingKeyDraft;
  profile?: OnboardingProfileDraft;
  relays?: OnboardingRelayDraft;
  follows?: FollowPackSelectionState;
}

export const ONBOARDING_DRAFT_VERSION = 1;

export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  version: ONBOARDING_DRAFT_VERSION,
  step: 'intro',
  lastUpdated: Date.now(),
  key: undefined,
  profile: undefined,
  relays: undefined,
  follows: undefined,
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'intro',
  'key-mining',
  'key-safety',
  'profile',
  'follow-packs',
  'complete',
];
