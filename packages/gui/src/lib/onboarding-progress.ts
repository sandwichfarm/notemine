import {
  type FollowPackSelectionState,
  type OnboardingDraft,
  type OnboardingStep,
  type OnboardingProfileDraft,
  type OnboardingRelayDraft,
} from '../types/onboarding';
import { hasOnboardingDraft, loadOnboardingDraft, clearOnboardingDraft } from './onboarding-storage';

const COMPLETION_STORAGE_KEY = 'notemine:onboarding:status';

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export interface OnboardingCompletionRecord {
  pubkey?: string;
  completedAt: number;
}

export interface OnboardingSnapshot {
  hasDraft: boolean;
  step: OnboardingStep;
  pubkey?: string;
  profileStatus?: OnboardingProfileDraft['status'];
  relayStatus?: OnboardingRelayDraft['status'];
  followStatus?: FollowPackSelectionState['status'];
  followSelectionCount: number;
}

const EMPTY_SNAPSHOT: OnboardingSnapshot = {
  hasDraft: false,
  step: 'intro',
  followSelectionCount: 0,
};

const safeParseJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const normalizeCompletion = (payload: unknown): OnboardingCompletionRecord | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Partial<OnboardingCompletionRecord>;
  if (typeof record.completedAt !== 'number') return null;
  return {
    completedAt: record.completedAt,
    pubkey: typeof record.pubkey === 'string' ? record.pubkey : undefined,
  };
};

export const getOnboardingCompletion = (): OnboardingCompletionRecord | null => {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(COMPLETION_STORAGE_KEY);
  return normalizeCompletion(safeParseJson(raw));
};

export const markOnboardingCompleted = (pubkey?: string): OnboardingCompletionRecord | null => {
  if (!isBrowser()) return null;
  const record: OnboardingCompletionRecord = {
    pubkey,
    completedAt: Date.now(),
  };
  window.localStorage.setItem(COMPLETION_STORAGE_KEY, JSON.stringify(record));
  // Clear the draft once completion is recorded
  clearOnboardingDraft();
  return record;
};

export const clearOnboardingCompletion = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(COMPLETION_STORAGE_KEY);
};

const countAggregatedFollows = (follows?: FollowPackSelectionState) =>
  follows?.aggregatedPubkeys ? Object.keys(follows.aggregatedPubkeys).length : 0;

export const getOnboardingSnapshot = (): OnboardingSnapshot => {
  if (!isBrowser() || !hasOnboardingDraft()) {
    return { ...EMPTY_SNAPSHOT };
  }

  let draft: OnboardingDraft | null = null;
  try {
    draft = loadOnboardingDraft();
  } catch {
    return { ...EMPTY_SNAPSHOT };
  }

  if (!draft) {
    return { ...EMPTY_SNAPSHOT };
  }

  return {
    hasDraft: true,
    step: draft.step,
    pubkey: draft.key?.pubkeyHex,
    profileStatus: draft.profile?.status,
    relayStatus: draft.relays?.status,
    followStatus: draft.follows?.status,
    followSelectionCount: countAggregatedFollows(draft.follows),
  };
};

const isDraftComplete = (snapshot: OnboardingSnapshot) => {
  const profileDone = snapshot.profileStatus === 'completed';
  const relayDone = snapshot.relayStatus === 'completed';
  const followsDone =
    snapshot.followStatus === 'completed' || snapshot.followSelectionCount > 0;
  return profileDone && relayDone && followsDone;
};

const completionMatchesSnapshot = (
  snapshot: OnboardingSnapshot,
  completion: OnboardingCompletionRecord | null
) => {
  if (!snapshot.pubkey) return false;
  if (!completion) return false;
  if (!completion.pubkey) return false;
  return completion.pubkey === snapshot.pubkey;
};

const isSnapshotOwner = (snapshot: OnboardingSnapshot, userPubkey?: string) => {
  if (!snapshot.pubkey) {
    // Draft has not recorded a mined key yet; any session with an active draft should resume.
    return true;
  }
  if (!userPubkey) {
    // User may still be anonymous until we re-auth with the mined key.
    return true;
  }
  return snapshot.pubkey === userPubkey;
};

export const shouldForceOnboarding = (
  snapshot: OnboardingSnapshot,
  completion: OnboardingCompletionRecord | null,
  userPubkey?: string
): boolean => {
  if (!snapshot.hasDraft) return false;

  const owner = isSnapshotOwner(snapshot, userPubkey);
  if (!owner) return false;

  const matchedCompletion = completionMatchesSnapshot(snapshot, completion);
  if (matchedCompletion && isDraftComplete(snapshot)) {
    return false;
  }

  return true;
};
