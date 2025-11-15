import { DEFAULT_ONBOARDING_DRAFT, ONBOARDING_DRAFT_VERSION, type OnboardingDraft } from '../types/onboarding';

const STORAGE_KEY = 'notemine:onboarding:v1';

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const cloneDraft = (draft: OnboardingDraft): OnboardingDraft => ({
  ...draft,
  key: draft.key ? { ...draft.key } : undefined,
  profile: draft.profile ? { ...draft.profile } : undefined,
  relays: draft.relays ? { ...draft.relays } : undefined,
  follows: draft.follows
    ? {
        selectedPackIds: [...draft.follows.selectedPackIds],
        aggregatedPubkeys: { ...draft.follows.aggregatedPubkeys },
        previewPubkeys: [...draft.follows.previewPubkeys],
      }
    : undefined,
});

const normalizeDraft = (draft: OnboardingDraft): OnboardingDraft => {
  const version = draft.version ?? ONBOARDING_DRAFT_VERSION;
  return {
    ...DEFAULT_ONBOARDING_DRAFT,
    ...draft,
    version,
    lastUpdated: draft.lastUpdated || Date.now(),
    key: draft.key
      ? {
          ...draft.key,
        }
      : undefined,
    profile: draft.profile
      ? {
          ...draft.profile,
        }
      : undefined,
    relays: draft.relays
      ? {
          ...draft.relays,
        }
      : undefined,
    follows: draft.follows
      ? {
          selectedPackIds: draft.follows.selectedPackIds || [],
          aggregatedPubkeys: draft.follows.aggregatedPubkeys || {},
          previewPubkeys: draft.follows.previewPubkeys || [],
        }
      : undefined,
  };
};

export function loadOnboardingDraft(): OnboardingDraft {
  if (!isBrowser()) {
    return cloneDraft(DEFAULT_ONBOARDING_DRAFT);
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return cloneDraft(DEFAULT_ONBOARDING_DRAFT);
    }

    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    if (parsed.version !== ONBOARDING_DRAFT_VERSION) {
      return cloneDraft(DEFAULT_ONBOARDING_DRAFT);
    }

    return normalizeDraft(parsed as OnboardingDraft);
  } catch (error) {
    console.warn('[OnboardingStorage] Failed to parse draft, resetting', error);
    return cloneDraft(DEFAULT_ONBOARDING_DRAFT);
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
  if (!isBrowser()) return;
  try {
    const normalized = normalizeDraft(draft);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.error('[OnboardingStorage] Failed to persist draft', error);
  }
}

export function updateOnboardingDraft(
  updater: (draft: OnboardingDraft) => OnboardingDraft
): OnboardingDraft {
  const next = updater(loadOnboardingDraft());
  const normalized = normalizeDraft({
    ...next,
    lastUpdated: Date.now(),
  });
  saveOnboardingDraft(normalized);
  return normalized;
}

export function clearOnboardingDraft(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function hasOnboardingDraft(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(STORAGE_KEY) !== null;
}
