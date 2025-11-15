import { Accessor, createMemo, createSignal } from 'solid-js';
import {
  DEFAULT_ONBOARDING_DRAFT,
  type FollowPackSelectionState,
  type OnboardingDraft,
  type OnboardingStep,
  ONBOARDING_STEPS,
} from '../types/onboarding';
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  clearOnboardingDraft,
} from '../lib/onboarding-storage';

const clone = <T>(value: T): T => {
  const structured =
    typeof globalThis !== 'undefined' ? (globalThis as any).structuredClone : undefined;
  if (typeof structured === 'function') {
    return structured(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const resolveStep = (step?: OnboardingStep): OnboardingStep => {
  if (step && ONBOARDING_STEPS.includes(step)) {
    return step;
  }
  return DEFAULT_ONBOARDING_DRAFT.step;
};

const getStepIndex = (step: OnboardingStep): number => {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index >= 0 ? index : 0;
};

const getNextStep = (step: OnboardingStep): OnboardingStep => {
  const currentIndex = getStepIndex(step);
  const nextIndex = Math.min(currentIndex + 1, ONBOARDING_STEPS.length - 1);
  return ONBOARDING_STEPS[nextIndex];
};

const getPreviousStep = (step: OnboardingStep): OnboardingStep => {
  const currentIndex = getStepIndex(step);
  const prevIndex = Math.max(currentIndex - 1, 0);
  return ONBOARDING_STEPS[prevIndex];
};

export interface OnboardingFlowController {
  draft: Accessor<OnboardingDraft>;
  step: Accessor<OnboardingStep>;
  isFirstStep: Accessor<boolean>;
  isLastStep: Accessor<boolean>;
  goToStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  previousStep: () => void;
  reset: () => void;
  clear: () => void;
  updateKeyDraft: (partial: Partial<NonNullable<OnboardingDraft['key']>>) => void;
  updateProfileDraft: (partial: Partial<NonNullable<OnboardingDraft['profile']>>) => void;
  updateRelayDraft: (partial: Partial<NonNullable<OnboardingDraft['relays']>>) => void;
  updateFollowDraft: (partial: Partial<FollowPackSelectionState>) => void;
  replaceDraft: (updater: (draft: OnboardingDraft) => OnboardingDraft) => void;
}

export const useOnboardingFlow = (): OnboardingFlowController => {
  const [draft, setDraft] = createSignal<OnboardingDraft>(loadOnboardingDraft());

  const persistDraft = (resolver: (current: OnboardingDraft) => OnboardingDraft) => {
    setDraft((prev) => {
      const workingCopy = clone(prev);
      const resolved = resolver(workingCopy);
      const withMeta = {
        ...resolved,
        step: resolveStep(resolved.step),
        lastUpdated: Date.now(),
      };
      saveOnboardingDraft(withMeta);
      return withMeta;
    });
  };

  const goToStep = (step: OnboardingStep) => {
    persistDraft((current) => ({
      ...current,
      step: resolveStep(step),
    }));
  };

  const nextStep = () => {
    persistDraft((current) => ({
      ...current,
      step: getNextStep(current.step),
    }));
  };

  const previousStep = () => {
    persistDraft((current) => ({
      ...current,
      step: getPreviousStep(current.step),
    }));
  };

  type MutableSections = 'key' | 'profile' | 'relays' | 'follows';
  const updateSection = <K extends MutableSections>(
    section: K,
    partial?: Partial<NonNullable<OnboardingDraft[K]>>
  ) => {
    persistDraft((current) => ({
      ...current,
      [section]: {
        ...(current[section] || {}),
        ...(partial || {}),
      },
    }));
  };

  const clear = () => {
    clearOnboardingDraft();
    setDraft(clone(DEFAULT_ONBOARDING_DRAFT));
  };

  const reset = () => {
    persistDraft(() => clone(DEFAULT_ONBOARDING_DRAFT));
  };

  const replaceDraft = (updater: (draft: OnboardingDraft) => OnboardingDraft) => {
    persistDraft((current) => updater(clone(current)));
  };

  const step = createMemo(() => draft().step);
  const isFirstStep = createMemo(() => getStepIndex(step()) === 0);
  const isLastStep = createMemo(() => getStepIndex(step()) === ONBOARDING_STEPS.length - 1);

  return {
    draft,
    step,
    isFirstStep,
    isLastStep,
    goToStep,
    nextStep,
    previousStep,
    reset,
    clear,
    replaceDraft,
    updateKeyDraft: (partial) => updateSection('key', partial ?? undefined),
    updateProfileDraft: (partial) => updateSection('profile', partial ?? undefined),
    updateRelayDraft: (partial) => updateSection('relays', partial ?? undefined),
    updateFollowDraft: (partial) =>
      updateSection('follows', {
        ...(draft().follows || {
          selectedPackIds: [],
          aggregatedPubkeys: {},
          previewPubkeys: [],
        }),
        ...(partial || {}),
      }),
  };
};
