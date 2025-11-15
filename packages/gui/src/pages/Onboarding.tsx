import {
  Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  createResource,
  onCleanup,
} from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useOnboardingFlow } from '../hooks/useOnboardingFlow';
import { useNip66RelayFeed } from '../hooks/useNip66RelayFeed';
import type {
  OnboardingKeyDraft,
  OnboardingProfileDraft,
  OnboardingRelayDraft,
  FollowPackSelectionState,
  OnboardingStep,
} from '../types/onboarding';
import { ONBOARDING_STEPS } from '../types/onboarding';
import { mineKeyWithDifficulty, type KeyMiningResult } from '../lib/key-miner';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { useUser } from '../providers/UserProvider';
import { useQueue } from '../providers/QueueProvider';
import { usePublishing } from '../providers/PublishingProvider';
import { base32DataUrlToBase64, encodeFileToBase32DataUrl, sanitizeText } from '../lib/base32-image';
import { fetchFollowPackConfig, resolveFollowPacks, type FollowPack } from '../lib/follow-packs';
import type { QueueItem } from '../types/queue';
import type { PublishJob } from '../types/publishing';
import type { NostrEvent } from 'nostr-tools/core';
import { buildContactListTags } from '../lib/contact-list';
import { clearOnboardingCompletion, markOnboardingCompleted } from '../lib/onboarding-progress';
import { USER_META_RELAYS } from '../lib/user-meta-relays';
import { usePreferences } from '../providers/PreferencesProvider';
import { getUserOutboxRelays, getActiveRelays } from '../lib/applesauce';
import { startFeedPrefetch } from '../lib/feed-prefetcher';
import type { RelayMap } from '../services/AdaptiveFeedService';
import { DEFAULT_RELAY_BASELINE } from '../config/defaults';

const PROFILE_MINING_DIFFICULTY = 4;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const RELAY_RANDOM_COUNT = 3;
const STEP_METADATA: Record<
  OnboardingStep,
  { title: string; description: string; subtitle?: string }
> = {
  intro: {
    title: 'Welcome',
    description: 'Understand what you are about to create and how it will be used inside notemine.',
  },
  'key-mining': {
    title: 'Create Key',
    description: 'Generate a secure keypair for your new identity.',
  },
  'key-safety': {
    title: 'Secure Key',
    description: 'Copy, store, and acknowledge the private key (nsec) safety checklist.',
  },
  profile: {
    title: 'Profile',
    description: 'Add a display name and photo so people recognize you.',
  },
  'follow-packs': {
    title: 'Follow Packs',
    description: 'Adopt curated groups to seed your contact list.',
  },
  complete: {
    title: 'Done',
    description: 'Review next steps and jump into the notemine feed.',
  },
};

const getStepIndex = (step: OnboardingStep) => {
  const idx = ONBOARDING_STEPS.indexOf(step);
  return idx >= 0 ? idx : 0;
};

const StepProgress: Component<{ current: OnboardingStep }> = (props) => {
  const currentIndex = createMemo(() => getStepIndex(props.current));
  return (
    <ol class="flex flex-wrap gap-3">
      <For each={ONBOARDING_STEPS}>
        {(step, index) => {
          const isActive = createMemo(() => props.current === step);
          const isComplete = createMemo(() => index() < currentIndex());
          return (
            <li
              class="flex items-center gap-2 px-3 py-1 rounded-full border text-xs uppercase tracking-wide"
              classList={{
                'border-accent text-accent bg-accent/10': isActive(),
                'border-border text-text-tertiary': !isActive(),
                'opacity-70': !isActive() && !isComplete(),
                'line-through opacity-80': isComplete(),
              }}
            >
              <span class="font-semibold">{index() + 1}</span>
              <span>{STEP_METADATA[step].title}</span>
            </li>
          );
        }}
      </For>
    </ol>
  );
};

const PlaceholderStep: Component<{ step: OnboardingStep; onNext?: () => void }> = (props) => (
  <div class="card p-6 space-y-4">
    <div>
      <p class="text-sm text-text-secondary">
        {STEP_METADATA[props.step].description} This step is being wired up.
      </p>
    </div>
    <Show when={props.onNext}>
      <button class="btn w-fit" onClick={props.onNext}>
        Continue
      </button>
    </Show>
  </div>
);

const IntroStep: Component<{ onStart: () => void }> = (props) => (
  <div class="card p-6 space-y-4">
    <div class="space-y-2">
      <h2 class="text-2xl font-bold">Welcome to notemine</h2>
      <p class="text-text-secondary">
        This guided flow will create your identity, publish your introduction, and seed your follows.
        Set aside a few minutes—some of the background work can take time on lower-powered hardware.
      </p>
      <p class="text-text-secondary text-sm">
        You can leave and return later. We keep your progress locally until you finish or reset.
      </p>
    </div>
    <div class="flex flex-wrap gap-3">
      <button class="btn" onClick={props.onStart}>
        Begin Setup
      </button>
    </div>
  </div>
);

interface KeyMiningStepProps {
  difficulty: number;
  keyDraft?: OnboardingKeyDraft;
  onComplete: (result: KeyMiningResult) => void;
  onBack: () => void;
  onRemine: () => void;
  onContinueExisting: () => void;
  onDifficultyChange: (value: number) => void;
}

const formatDuration = (ms: number): string => {
  if (!ms || Number.isNaN(ms)) return '0.0s';
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
};

const KeyMiningStep: Component<KeyMiningStepProps> = (props) => {
  const [miningState, setMiningState] = createSignal<{
    status: 'idle' | 'mining' | 'error';
    attempts: number;
    elapsedMs: number;
    hashRate: number;
    error?: string;
  }>({
    status: 'idle',
    attempts: 0,
    elapsedMs: 0,
    hashRate: 0,
  });

  let abortController: AbortController | null = null;
  let runtimeTimer: ReturnType<typeof setInterval> | null = null;
  let runtimeStart = 0;
  const [runtimeMs, setRuntimeMs] = createSignal(0);
  const [highestDifficulty, setHighestDifficulty] = createSignal(0);

  const stopRuntimeTimer = () => {
    if (runtimeTimer !== null) {
      clearInterval(runtimeTimer);
      runtimeTimer = null;
    }
  };

  const startRuntimeTimer = () => {
    stopRuntimeTimer();
    runtimeStart = Date.now();
    setRuntimeMs(0);
    runtimeTimer = setInterval(() => {
      setRuntimeMs(Date.now() - runtimeStart);
    }, 200);
  };

  const resetError = () => {
    setMiningState((prev) => ({
      ...prev,
      error: undefined,
    }));
  };

  const startMining = () => {
    if (miningState().status === 'mining') return;
    resetError();
    abortController?.abort();
    abortController = new AbortController();
    startRuntimeTimer();
    setMiningState({
      status: 'mining',
      attempts: 0,
      elapsedMs: 0,
      hashRate: 0,
    });
    setHighestDifficulty(0);

    mineKeyWithDifficulty({
      difficulty: props.difficulty,
      signal: abortController.signal,
      onProgress: ({ attempts, elapsedMs, bestPow }) => {
        setMiningState((prev) => ({
          ...prev,
          attempts,
          elapsedMs,
          hashRate: elapsedMs > 0 ? attempts / (elapsedMs / 1000) : 0,
        }));
        setRuntimeMs(elapsedMs);
        if (bestPow && bestPow > highestDifficulty()) {
          setHighestDifficulty(bestPow);
        }
      },
    })
      .then((result) => {
        abortController = null;
        stopRuntimeTimer();
        setMiningState((prev) => ({
          ...prev,
          status: 'idle',
          attempts: result.attempts,
          elapsedMs: result.durationMs,
          hashRate:
            result.durationMs > 0 ? result.attempts / (result.durationMs / 1000) : prev.hashRate,
        }));
        const finalBest = Math.max(result.powScore, result.bestPow ?? 0);
        setHighestDifficulty(finalBest);
        props.onComplete(result);
      })
      .catch((error) => {
        stopRuntimeTimer();
        if (error instanceof DOMException && error.name === 'AbortError') {
          setMiningState((prev) => ({
            ...prev,
            status: 'idle',
          }));
          return;
        }
        setMiningState((prev) => ({
          ...prev,
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to generate key',
        }));
      });
  };

  const cancelMining = () => {
    if (!abortController) return;
    abortController.abort();
    abortController = null;
    stopRuntimeTimer();
    setMiningState((prev) => ({
      ...prev,
      status: 'idle',
    }));
  };

  onCleanup(() => {
    cancelMining();
    stopRuntimeTimer();
  });

  const hasExistingKey = () => !!props.keyDraft?.secretHex && !!props.keyDraft?.pubkeyHex;

  const powScore = () => props.keyDraft?.powScore ?? 0;

  const lastMinedAt = () => {
    if (!props.keyDraft?.createdAt) return null;
    return new Date(props.keyDraft.createdAt).toLocaleString();
  };

  const elapsedMsDisplay = createMemo(() => {
    return miningState().status === 'mining'
      ? Math.max(miningState().elapsedMs, runtimeMs())
      : Math.max(miningState().elapsedMs, runtimeMs());
  });

  const computedHashRate = createMemo(() => {
    const elapsed = elapsedMsDisplay();
    if (elapsed <= 0) return 0;
    const attempts = miningState().attempts;
    return attempts > 0 ? attempts / (elapsed / 1000) : 0;
  });

  const hashRateText = createMemo(() => {
    const elapsed = elapsedMsDisplay();
    const rate = Math.max(miningState().hashRate, computedHashRate());
    if (rate <= 0 && elapsed < 1200) {
      return 'warming up…';
    }
    return `${rate.toFixed(1)} keys/s`;
  });

  const formattedElapsed = createMemo(() => formatDuration(elapsedMsDisplay()));

  return (
    <div class="card p-6 space-y-6">
      <div class="space-y-2">
        <h2 class="text-xl font-semibold">Generate a resilient key</h2>
        <p class="text-sm text-text-secondary">
          We&apos;ll keep searching until your public key meets our security target. Higher targets take a
          little longer, so keep this tab open while we work.
        </p>
      </div>
      <div class="space-y-1">
        <div class="flex items-center justify-between text-sm font-medium">
          <span>Security target</span>
          <span class="font-mono">{props.difficulty}</span>
        </div>
        <input
          type="range"
          min="2"
          max="6"
          step="1"
          value={props.difficulty}
          class="w-full accent-accent"
          disabled={miningState().status === 'mining'}
          onInput={(event) => props.onDifficultyChange(Number(event.currentTarget.value))}
        />
        <p class="text-xs text-text-tertiary">
          Stronger keys (higher numbers) take longer to generate.
        </p>
      </div>

      <Show
        when={!hasExistingKey()}
        fallback={
          <div class="rounded-lg border border-border bg-bg-secondary/40 p-4 space-y-3">
            <p class="text-sm text-text-secondary">
              You already generated a key. Continue to the safety step to copy the nsec or try again if
              you want a different result.
            </p>
            <div class="text-sm font-mono break-all p-3 rounded bg-bg-primary">
              {props.keyDraft?.pubkeyHex}
            </div>
            <div class="text-xs text-text-tertiary">
              Strength score: {powScore()} · {lastMinedAt() ? `Generated ${lastMinedAt()}` : 'recently generated'}
            </div>
            <div class="flex flex-wrap gap-3">
              <button class="btn" onClick={props.onContinueExisting}>
                Continue to Safety
              </button>
              <button class="btn basic" onClick={props.onRemine}>
                Try another key
              </button>
            </div>
          </div>
        }
      >
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-6">
          <div class="text-6xl animate-[swing_0.8s_ease-in-out_infinite]" style={{ "transform-origin": "center top" }}>
            ⛏️
          </div>
          <div class="space-y-2">
              <p class="text-sm text-text-secondary">
                Attempts: <span class="font-semibold">{miningState().attempts.toLocaleString()}</span>
              </p>
              <p class="text-sm text-text-secondary">
                Hash rate:{' '}
                <span class="font-semibold">{hashRateText()}</span>
              </p>
              <p class="text-sm text-text-secondary">
                Elapsed: <span class="font-semibold">{formattedElapsed()}</span>
              </p>
              <p class="text-sm text-text-secondary">
                Highest difficulty:{' '}
                <span class="font-semibold">
                  {highestDifficulty() > 0 ? `${highestDifficulty()} zeros` : 'waiting…'}
                </span>
              </p>
            </div>
          </div>
          <Show when={miningState().error}>
            <div class="text-sm text-red-500 bg-red-500/10 border border-red-500/40 rounded p-3">
              {miningState().error}
            </div>
          </Show>
          <div class="flex flex-wrap gap-3">
            <button class="btn basic" onClick={props.onBack}>
              ← Back
            </button>
            <Show
              when={miningState().status !== 'mining'}
              fallback={
                <button class="btn bg-bg-secondary hover:bg-bg-secondary/70" onClick={cancelMining}>
                  Cancel
                </button>
              }
            >
              <button class="btn" onClick={startMining}>
                Start search
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

interface KeySafetyStepProps {
  keyDraft?: OnboardingKeyDraft;
  onConfirmedChange: (next: boolean) => void;
  onContinue: () => void;
  onRegenerate: () => void;
  onBack: () => void;
}

const KeySafetyStep: Component<KeySafetyStepProps> = (props) => {
  const [copied, setCopied] = createSignal(false);
  const nsec = createMemo(() => {
    if (!props.keyDraft?.secretHex) return null;
    try {
      return nip19.nsecEncode(hexToBytes(props.keyDraft.secretHex));
    } catch {
      return null;
    }
  });
  const npub = createMemo(() => {
    if (!props.keyDraft?.pubkeyHex) return null;
    try {
      return nip19.npubEncode(props.keyDraft.pubkeyHex);
    } catch {
      return null;
    }
  });

  const handleCopy = async () => {
    if (!nsec()) return;
    try {
      await navigator.clipboard.writeText(nsec()!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('[Onboarding] Failed to copy nsec', error);
    }
  };

  const isReady = () => !!props.keyDraft?.confirmed && !!nsec();

  return (
    <div class="card p-6 space-y-5">
      <div class="space-y-2">
        <h2 class="text-xl font-semibold">Save your nsec</h2>
        <p class="text-sm text-text-secondary">
          This private key controls your new identity. Store it offline. If you share it, anyone can
          impersonate you. If you lose it, your identity is gone and you&apos;ll have to start over.
        </p>
      </div>

      <Show
        when={props.keyDraft?.secretHex}
        fallback={
          <div class="rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600">
            Your key isn&apos;t ready yet. Go back and finish generating before continuing.
          </div>
        }
      >
        <div class="space-y-3">
          <div class="space-y-1">
            <p class="text-xs uppercase tracking-wide text-text-tertiary">nsec</p>
            <div class="flex flex-col gap-2 rounded border border-border bg-bg-secondary/40 p-3 font-mono text-sm break-all">
              <span>{nsec() || 'nsec will appear here once ready'}</span>
              <div class="flex gap-2">
                <button class="btn text-xs" onClick={handleCopy} disabled={!nsec()}>
                  {copied() ? 'Copied!' : 'Copy nsec'}
                </button>
                <button class="btn basic text-xs" onClick={props.onRegenerate}>
                  Regenerate Key
                </button>
              </div>
            </div>
          </div>

          <Show when={npub()}>
            <div class="space-y-1">
              <p class="text-xs uppercase tracking-wide text-text-tertiary">npub</p>
              <div class="rounded border border-border bg-bg-secondary/40 p-3 font-mono text-sm break-all">
                {npub()}
              </div>
            </div>
          </Show>

          <label class="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 accent-accent"
              checked={props.keyDraft?.confirmed}
              onChange={(event) => props.onConfirmedChange(event.currentTarget.checked)}
            />
            <span>
              I copied my nsec to a safe place. I understand that losing or sharing it means losing
              this identity forever.
            </span>
          </label>

          <div class="flex flex-wrap gap-3">
            <button class="btn basic" onClick={props.onBack}>
              ← Back
            </button>
            <button class="btn" disabled={!isReady()} onClick={props.onContinue}>
              Continue
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
};

const CompleteStep: Component<{
  onEnterApp: () => void;
  onEditProfile: () => void;
  onEditFollows: () => void;
  profile?: OnboardingProfileDraft;
  relays?: OnboardingRelayDraft;
  follows?: FollowPackSelectionState;
}> = (props) => (
  <div class="card p-6 space-y-5">
    <div class="space-y-2">
      <h2 class="text-2xl font-bold">You&apos;re ready</h2>
      <p class="text-text-secondary">
        Here&apos;s a summary of what will be published. You can restart any step if something looks
        off, otherwise jump into your feed.
      </p>
    </div>
    <div class="space-y-3 text-sm">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-text-tertiary uppercase tracking-wide text-xs">Profile</p>
          <p class="font-semibold">{props.profile?.name || 'Not set'}</p>
        </div>
        <button class="btn text-xs" onClick={props.onEditProfile}>
          Edit
        </button>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="text-text-tertiary uppercase tracking-wide text-xs">Connections</p>
          <p>{props.relays?.relays?.length ?? 0} connections ready</p>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="text-text-tertiary uppercase tracking-wide text-xs">Contacts</p>
          <p>{Object.keys(props.follows?.aggregatedPubkeys ?? {}).length} unique follows</p>
        </div>
        <button class="btn text-xs" onClick={props.onEditFollows}>
          Edit
        </button>
      </div>
    </div>
    <div class="flex flex-wrap gap-3">
      <button class="btn secondary" onClick={props.onEnterApp}>
        Enter notemine
      </button>
    </div>
  </div>
);

const Onboarding: Component = () => {
  const navigate = useNavigate();
  const flow = useOnboardingFlow();
  const { authWithSecretKey, user } = useUser();
  const { preferences } = usePreferences();
  const queue = useQueue();
  const publishing = usePublishing();
  const step = createMemo(() => flow.step());
  const relayFeed = useNip66RelayFeed({ autoStart: false, openOnly: true });
  const keyDraft = createMemo(() => flow.draft().key);
  const profileDraft = createMemo(() => flow.draft().profile);
  const relayDraft = createMemo(() => flow.draft().relays);
  const followsDraft = createMemo(() => flow.draft().follows);
  const [followPackConfig] = createResource(fetchFollowPackConfig);
  const [resolvedFollowPacks] = createResource(
    () => followPackConfig() ?? [],
    (naddrs) => (naddrs.length ? resolveFollowPacks(naddrs) : []),
    { initialValue: [] as FollowPack[] }
  );
  const MIN_DIFFICULTY = 2;
  const MAX_DIFFICULTY = 6;
  const [targetDifficulty, setTargetDifficulty] = createSignal(
    Math.min(
      MAX_DIFFICULTY,
      Math.max(MIN_DIFFICULTY, flow.draft().key?.targetDifficulty ?? MIN_DIFFICULTY)
    )
  );
  const queueState = queue.queueState;
  const publishState = publishing.publishState;
  const [avatarError, setAvatarError] = createSignal<string | null>(null);
  const [avatarLoading, setAvatarLoading] = createSignal(false);
  const profileName = createMemo(() => profileDraft()?.name ?? '');
  const profileAbout = createMemo(() => profileDraft()?.about ?? '');
  const profileImageData = createMemo(() => profileDraft()?.imageDataUrl);
  const profileImagePreview = createMemo(() =>
    profileDraft()?.imagePreviewDataUrl ??
    (profileDraft()?.imageDataUrl ? base32DataUrlToBase64(profileDraft()!.imageDataUrl!) : null)
  );
  const sanitizedProfileName = createMemo(() => sanitizeText(profileName()));
  const sanitizedProfileAbout = createMemo(() => sanitizeText(profileAbout()));
  const profileCanSubmit = createMemo(() => {
    const status = profileDraft()?.status ?? 'idle';
    const allowed = status === 'idle' || status === 'error' || typeof status === 'undefined';
    return !!sanitizedProfileName() && !!profileImageData() && allowed;
  });
  const profileActionLabel = createMemo(() => {
    const status = profileDraft()?.status;
    if (status === 'queued' || status === 'mining') return 'Working…';
    if (status === 'publishing') return 'Sharing…';
    if (status === 'completed') return 'Profile ready';
    if (status === 'error') return 'Try again';
    return 'Next Step';
  });
  const profileStatusMessage = createMemo(() => {
    const status = profileDraft()?.status;
    if (status === 'queued' || status === 'mining') {
      return 'We’re getting your profile ready. This may take a minute.';
    }
    if (status === 'publishing') {
      return 'Sharing your profile so people can find you…';
    }
    if (status === 'completed') {
      return 'Profile ready! Moving ahead.';
    }
    if (status === 'error') {
      return 'We hit a snag while setting up your profile.';
    }
    return 'Add your details to continue.';
  });
  const connectionStatusMessage = createMemo(() => {
    const status = relayDraft()?.status;
    if (status === 'publishing') {
      return 'Linking your starting connections…';
    }
    if (status === 'completed') {
      return 'Connections ready for your profile.';
    }
    if (status === 'error') {
      return 'We couldn’t finish connecting. Reset the step to try again.';
    }
    return 'Preparing trusted connections…';
  });
  const followActionLabel = createMemo(() => {
    const status = followsDraft()?.status;
    if (status === 'publishing') return 'Working…';
    if (status === 'completed') return 'Saved';
    if (status === 'error') return 'Try again';
    return 'Save & Continue';
  });
  const followStatusMessage = createMemo(() => {
    const status = followsDraft()?.status;
    if (status === 'publishing') return 'Saving your selections…';
    if (status === 'completed') return 'Selections saved.';
    if (status === 'error') return 'We couldn’t save your selections.';
    return '';
  });

  const handleAvatarFileChange = async (file?: File | null) => {
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Images must be 2MB or less.');
      return;
    }
    setAvatarLoading(true);
    try {
      const payload = await encodeFileToBase32DataUrl(file);
      flow.updateProfileDraft({
        imageDataUrl: payload.base32DataUrl,
        imagePreviewDataUrl: payload.previewDataUrl,
        mimeType: payload.mimeType,
        lastError: undefined,
      });
      setAvatarError(null);
    } catch (error) {
      console.error('[Onboarding] Failed to encode avatar', error);
      setAvatarError('Failed to process image. Please try another file.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const resetProfileState = () => {
    const queueId = profileDraft()?.queueItemId;
    if (queueId) {
      queue.removeFromQueue(queueId);
    }
    const publishJobId = profileDraft()?.publishJobId;
    if (publishJobId) {
      publishing.removePublishJob(publishJobId);
    }
    flow.updateProfileDraft({
      queueItemId: undefined,
      publishJobId: undefined,
      minedEventId: undefined,
      publishedAt: undefined,
      status: 'idle',
      lastError: undefined,
    });
    setShouldAutoAdvanceProfile(false);
  };

  const enqueueProfileMining = () => {
    if (!profileCanSubmit()) return;
    const currentUser = user();
    if (!currentUser) {
      setAvatarError('You need an active key before continuing.');
      return;
    }
    const picture = profileImageData();
    if (!picture) {
      setAvatarError('Upload a photo first.');
      return;
    }
    if (!ensureRelayPublishBeforeProfile()) {
      setRelaySelectionError('Unable to finish setting up your connections. Please try again.');
      return;
    }
    const content = JSON.stringify({
      name: sanitizedProfileName(),
      ...(sanitizedProfileAbout() ? { about: sanitizedProfileAbout() } : {}),
      picture,
    });
    const queueItemId = queue.addToQueue({
      type: 'profile',
      content,
      pubkey: currentUser.pubkey,
      difficulty: PROFILE_MINING_DIFFICULTY,
      tags: [['client', 'notemine.io']],
      kind: 0,
    });
    queue.startQueue();
    flow.updateProfileDraft({
      queueItemId,
      status: 'queued',
      publishJobId: undefined,
      minedEventId: undefined,
      publishedAt: undefined,
      lastError: undefined,
    });
    setShouldAutoAdvanceProfile(true);
  };
  const profileQueueItem = createMemo<QueueItem | undefined>(() => {
    const id = profileDraft()?.queueItemId;
    if (!id) return undefined;
    return queueState().items.find((item) => item.id === id);
  });
  const profilePublishJob = createMemo<PublishJob | undefined>(() => {
    const queueId = profileDraft()?.queueItemId;
    if (!queueId) return undefined;
    return publishState().items.find((job) => job.meta.sourceQueueItemId === queueId);
  });
  const relayPublishJob = createMemo<PublishJob | undefined>(() => {
    const jobId = relayDraft()?.publishJobId;
    if (!jobId) return undefined;
    return publishState().items.find((job) => job.id === jobId);
  });
  const followsPublishJob = createMemo<PublishJob | undefined>(() => {
    const jobId = followsDraft()?.publishJobId;
    if (!jobId) return undefined;
    return publishState().items.find((job) => job.id === jobId);
  });

  const [relaySelectionError, setRelaySelectionError] = createSignal<string | null>(null);

  const normalizeRelay = (url: string): string => {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString();
    } catch {
      return url;
    }
  };

  const selectRelaySample = (): string[] => {
    const descriptors = relayFeed.relays();
    const normalizedDefaults = new Set(DEFAULT_RELAY_BASELINE.map(normalizeRelay));
    let picks: string[] = [];

    if (descriptors.length) {
      const pool = descriptors
        .map((entry) => entry.normalizedUrl)
        .filter((url): url is string => !!url && !normalizedDefaults.has(url));
      const uniquePool = Array.from(new Set(pool));
      const shuffled = [...uniquePool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      picks = shuffled.slice(0, RELAY_RANDOM_COUNT);
      setRelaySelectionError(null);
    } else {
      setRelaySelectionError('Using our trusted connections until new recommendations arrive.');
    }

    const combined = Array.from(new Set([...DEFAULT_RELAY_BASELINE, ...picks]));
    flow.updateRelayDraft({
      relays: combined,
      selectedOpenRelays: picks,
      lastError: undefined,
    });
    return combined;
  };

  const publishRelayList = (inputRelays?: string[]) => {
    const currentUser = user();
    const relays = inputRelays?.length
      ? inputRelays
      : relayDraft()?.relays ?? DEFAULT_RELAY_BASELINE;
    if (!currentUser) return false;
    if (!relays.length) {
      setRelaySelectionError('No connections selected');
      return false;
    }
    const eventTemplate: NostrEvent = {
      kind: 10002,
      created_at: Math.floor(Date.now() / 1000),
      tags: relays.map((url) => ['r', url]),
      content: '',
      pubkey: currentUser.pubkey,
    } as NostrEvent;
    const jobId = publishing.addPublishJob({
      eventTemplate,
      relays: USER_META_RELAYS,
      meta: {
        kind: 10002,
        difficulty: 0,
        type: 'relays',
      },
    });
    flow.updateRelayDraft({
      relays,
      publishJobId: jobId,
      status: 'publishing',
      publishedAt: undefined,
      lastError: undefined,
    });
    return true;
  };

  const ensureRelayPublishBeforeProfile = () => {
    const relays = selectRelaySample();
    return publishRelayList(relays);
  };

  const toggleFollowPackSelection = (packId: string) => {
    const current = new Set(followsDraft()?.selectedPackIds ?? []);
    if (current.has(packId)) {
      current.delete(packId);
    } else {
      current.add(packId);
    }
    flow.updateFollowDraft({
      selectedPackIds: Array.from(current),
      status: followsDraft()?.status === 'completed' ? 'idle' : followsDraft()?.status,
      publishJobId: undefined,
      lastError: undefined,
    });
  };

  const followPackList = createMemo(() => resolvedFollowPacks() ?? []);
  const selectedFollowPackIds = createMemo(() => new Set(followsDraft()?.selectedPackIds ?? []));
  const aggregatedFollows = createMemo(() => {
    const map = new Map<string, number>();
    const packs = followPackList();
    const selected = selectedFollowPackIds();
    packs.forEach((pack) => {
      if (!selected.has(pack.id)) return;
      pack.pubkeys.forEach((pk) => {
        if (!pk) return;
        map.set(pk, (map.get(pk) ?? 0) + 1);
      });
    });
    return map;
  });
  const aggregatedFollowList = createMemo(() => Array.from(aggregatedFollows().keys()));
  const [shouldAutoAdvanceProfile, setShouldAutoAdvanceProfile] = createSignal(false);
  const warmFeedFromFollowSelection = async (authors: string[]) => {
    if (!authors.length) return;
    try {
      const relayMap: RelayMap = new Map();
      const relayTasks = authors.map(async (pk) => {
        try {
          const relays = await getUserOutboxRelays(pk);
          relayMap.set(pk, relays);
        } catch {
          relayMap.set(pk, []);
        }
      });
      await Promise.race([
        Promise.allSettled(relayTasks),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      const feedPrefs = preferences().feedParams;
      startFeedPrefetch(
        authors,
        relayMap,
        {
          desiredCount: feedPrefs.desiredCount,
          initialLimit: feedPrefs.initialLimit,
          maxLimit: feedPrefs.maxLimit,
          initialHorizonMs: feedPrefs.initialHorizonHours * 60 * 60 * 1000,
          maxHorizonMs: feedPrefs.maxHorizonDays * 24 * 60 * 60 * 1000,
          growthFast: feedPrefs.growthFast,
          growthSlow: feedPrefs.growthSlow,
          overlapRatio: feedPrefs.overlapRatio,
          overfetch: feedPrefs.overfetch,
          skewMarginMs: feedPrefs.skewMarginMinutes * 60 * 1000,
          relays: getActiveRelays(),
        },
        preferences().feedDebugMode || false
      );
    } catch (error) {
      console.error('[Onboarding] Failed to prefetch feed', error);
    }
  };

  const publishFollowList = () => {
    const currentUser = user();
    if (!currentUser) return;
    const pubkeys = aggregatedFollowList();
    if (!pubkeys.length) return;
    void warmFeedFromFollowSelection(pubkeys);
    const followMap = new Map<string, string[]>(pubkeys.map((pk) => [pk, ['p', pk]]));
    const tags = buildContactListTags([], pubkeys, followMap);
    const eventTemplate: NostrEvent = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
      pubkey: currentUser.pubkey,
    } as NostrEvent;
    const jobId = publishing.addPublishJob({
      eventTemplate,
      relays: USER_META_RELAYS,
      meta: {
        kind: 3,
        difficulty: 0,
        type: 'contacts',
      },
    });
    flow.updateFollowDraft({
      publishJobId: jobId,
      status: 'publishing',
      lastError: undefined,
    });
  };
  const currentUser = createMemo(() => user());
  type BlockReason = 'existing-user' | 'mismatched-user';
  const draftPubkey = createMemo(() => keyDraft()?.pubkeyHex);
  const blockReason = createMemo<BlockReason | null>(() => {
    const userValue = currentUser();
    if (!userValue || userValue.isAnon) {
      return null;
    }
    const pubkey = draftPubkey();
    if (!pubkey) {
      return null;
    }
    if (userValue.pubkey !== pubkey) {
      return 'mismatched-user';
    }
    return null;
  });
  const isBlocked = createMemo(() => !!blockReason());
  const blockNpub = createMemo(() => {
    const pk = draftPubkey();
    if (!pk) return null;
    try {
      return nip19.npubEncode(pk);
    } catch {
      return pk;
    }
  });
  const blockedInfo = createMemo(() => {
    if (blockReason() === 'mismatched-user') {
      return {
        title: 'Resume with your onboarding key',
        body: blockNpub()
          ? `This onboarding flow is tied to ${blockNpub()}. Switch back to that identity or reset the flow before continuing.`
          : 'This onboarding flow is tied to a different key. Switch back to that identity or reset the flow before continuing.',
      };
    }
    return {
      title: "You're already signed in",
      body:
        'Onboarding is only available when creating a brand new key. Head to your feed or log out before starting over.',
    };
  });

  createEffect(() => {
    const confirmed = flow.draft().key?.confirmed;
    if (confirmed) {
      if (!relayFeed.isActive()) {
        relayFeed.start();
      }
    } else if (relayFeed.isActive()) {
      relayFeed.stop();
    }
  });

  createEffect(() => {
    const stored = flow.draft().key?.targetDifficulty;
    if (typeof stored === 'number') {
      const clamped = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, stored));
      if (clamped !== targetDifficulty()) {
        setTargetDifficulty(clamped);
      }
    }
  });

  createEffect(() => {
    const draft = profileDraft();
    if (!draft?.imageDataUrl || draft.imagePreviewDataUrl) return;
    const preview = base32DataUrlToBase64(draft.imageDataUrl);
    if (preview) {
      flow.updateProfileDraft({ imagePreviewDataUrl: preview });
    }
  });

  createEffect(() => {
    const draft = profileDraft();
    if (!draft) return;
    const queueItem = profileQueueItem();
    const publishJob = profilePublishJob();
    let status = draft.status ?? 'idle';
    let lastError = draft.lastError;
    let publishJobId = publishJob?.id ?? draft.publishJobId;
    let publishedAt = draft.publishedAt;
    let minedEventId = draft.minedEventId;

    if (queueItem) {
      if (queueItem.status === 'failed') {
        status = 'error';
        lastError = queueItem.error || 'Mining failed';
      } else if (queueItem.status === 'queued') {
        status = queueState().activeItemId === queueItem.id ? 'mining' : 'queued';
      } else if (queueItem.status === 'completed' && status !== 'publishing' && status !== 'completed') {
        status = 'publishing';
      }
    }

    if (publishJob) {
      publishJobId = publishJob.id;
      if (publishJob.signedEvent?.id && publishJob.signedEvent.id !== minedEventId) {
        minedEventId = publishJob.signedEvent.id;
      }
      if (publishJob.status === 'failed') {
        status = 'error';
        lastError = publishJob.error?.message || 'Publishing failed';
      } else if (publishJob.status === 'published') {
        status = 'completed';
        if (!publishedAt) {
          publishedAt = Date.now();
        }
      } else {
        status = 'publishing';
      }
    }

    if (
      status !== draft.status ||
      lastError !== draft.lastError ||
      publishJobId !== draft.publishJobId ||
      publishedAt !== draft.publishedAt ||
      minedEventId !== draft.minedEventId
    ) {
      flow.updateProfileDraft({
        status,
        lastError,
        publishJobId,
        publishedAt,
        minedEventId,
      });
    }
  });

  createEffect(() => {
    const draft = relayDraft();
    if (!draft) return;
    const job = relayPublishJob();
    let status = draft.status ?? 'idle';
    let lastError = draft.lastError;
    let publishJobId = draft.publishJobId;
    let publishedAt = draft.publishedAt;

    if (job) {
      publishJobId = job.id;
      if (job.status === 'failed') {
        status = 'error';
        lastError = job.error?.message || 'Publishing failed';
      } else if (job.status === 'published') {
        status = 'completed';
        if (!publishedAt) {
          publishedAt = Date.now();
        }
      } else {
        status = 'publishing';
      }
    }

    if (
      status !== draft.status ||
      lastError !== draft.lastError ||
      publishJobId !== draft.publishJobId ||
      publishedAt !== draft.publishedAt
    ) {
      flow.updateRelayDraft({
        status,
        lastError,
        publishJobId,
        publishedAt,
      });
    }
  });

  createEffect(() => {
    const draft = followsDraft();
    if (!draft) return;
    const job = followsPublishJob();
    let status = draft.status ?? 'idle';
    let lastError = draft.lastError;
    let publishJobId = draft.publishJobId;
    let publishedAt = draft.publishedAt;

    if (job) {
      publishJobId = job.id;
      if (job.status === 'failed') {
        status = 'error';
        lastError = job.error?.message || 'Publishing failed';
      } else if (job.status === 'published') {
        status = 'completed';
        if (!publishedAt) {
          publishedAt = Date.now();
        }
      } else {
        status = 'publishing';
      }
    }

    if (
      status !== draft.status ||
      lastError !== draft.lastError ||
      publishJobId !== draft.publishJobId ||
      publishedAt !== draft.publishedAt
    ) {
      flow.updateFollowDraft({
        status,
        lastError,
        publishJobId,
        publishedAt,
      });
    }
  });

  createEffect(() => {
    const packs = followPackList();
    const selected = followsDraft()?.selectedPackIds ?? [];
    if (!selected.length) return;
    if (!packs.length || resolvedFollowPacks.loading) return;
    const validIds = new Set(packs.map((pack) => pack.id));
    const filtered = selected.filter((id) => validIds.has(id));
    if (filtered.length !== selected.length) {
      flow.updateFollowDraft({ selectedPackIds: filtered });
    }
  });

  createEffect(() => {
    const preview = aggregatedFollowList().slice(0, 10);
    const current = followsDraft()?.previewPubkeys ?? [];
    const next = JSON.stringify(preview);
    const prev = JSON.stringify(current);
    if (next !== prev) {
      flow.updateFollowDraft({ previewPubkeys: preview });
    }
  });

  createEffect(() => {
    const map = aggregatedFollows();
    const next: Record<string, number> = {};
    map.forEach((count, pk) => {
      next[pk] = count;
    });
    const current = followsDraft()?.aggregatedPubkeys ?? {};
    const sameKeys = Object.keys(current).length === map.size;
    const sameValues =
      sameKeys &&
      Object.entries(current).every(([pk, count]) => map.get(pk) === count);
    if (!sameValues) {
      flow.updateFollowDraft({ aggregatedPubkeys: next });
    }
  });

  createEffect(() => {
    const secretHex = keyDraft()?.secretHex;
    if (!secretHex) return;
    const currentUser = user();
    if (currentUser?.secret) {
      const currentSecretHex = bytesToHex(currentUser.secret);
      if (currentSecretHex === secretHex) {
        return;
      }
    }
    try {
      authWithSecretKey(hexToBytes(secretHex), true);
    } catch (error) {
      console.error('[Onboarding] Failed to restore mined key', error);
    }
  });

  const canFinish = createMemo(
    () =>
      profileDraft()?.status === 'completed' &&
      relayDraft()?.status === 'completed' &&
      (followsDraft()?.status === 'completed' || (followsDraft()?.selectedPackIds?.length ?? 0) > 0)
  );

  createEffect(() => {
    if (profileDraft()?.status !== 'completed') return;
    const status = relayDraft()?.status;
    if (status === 'completed' || status === 'publishing') return;
    if (!user()) return;
    ensureRelayPublishBeforeProfile();
  });

  createEffect(() => {
    if (!shouldAutoAdvanceProfile()) return;
    if (step() !== 'profile') return;
    if (profileDraft()?.status === 'completed' && relayDraft()?.status === 'completed') {
      setShouldAutoAdvanceProfile(false);
      flow.goToStep('follow-packs');
    }
  });

  createEffect(() => {
    if (step() !== 'profile' && shouldAutoAdvanceProfile()) {
      setShouldAutoAdvanceProfile(false);
    }
  });

  createEffect(() => {
    if (step() !== 'follow-packs') return;
    if (followsDraft()?.status === 'completed') {
      flow.goToStep('complete');
    }
  });

  const handleKeyMiningComplete = (payload: KeyMiningResult) => {
    const secretHex = bytesToHex(payload.secret);
    flow.replaceDraft((draft) => ({
      ...draft,
      key: {
        secretHex,
        pubkeyHex: payload.pubkey,
        powScore: payload.powScore,
        confirmed: false,
        createdAt: Date.now(),
        lastAttemptCount: payload.attempts,
        targetDifficulty: targetDifficulty(),
      },
    }));
    authWithSecretKey(payload.secret, true).catch((error) =>
      console.error('[Onboarding] Failed to authenticate mined key', error)
    );
    flow.goToStep('key-safety');
  };

  const handleResetKeyDraft = () => {
    relayFeed.stop();
    flow.replaceDraft((draft) => ({
      ...draft,
      key: {
        targetDifficulty: targetDifficulty(),
      },
      step: 'key-mining',
    }));
  };

  const handleKeyConfirmationChange = (next: boolean) => {
    flow.updateKeyDraft({ confirmed: next });
  };

  const handleSafetyContinue = () => {
    if (!flow.draft().key?.confirmed) return;
    flow.goToStep('profile');
  };

  const handleResetFlow = () => {
    relayFeed.stop();
    clearOnboardingCompletion();
    flow.reset();
  };

  const handleBackToLanding = () => {
    relayFeed.stop();
    navigate('/landing');
  };

  const handleUseExistingKey = () => {
    if (!keyDraft()) return;
    flow.goToStep('key-safety');
  };

  const handleEnterApp = async () => {
    relayFeed.stop();
    if (!canFinish()) {
      flow.goToStep(profileDraft()?.status === 'completed' ? 'follow-packs' : 'profile');
      return;
    }

    const secretHex = keyDraft()?.secretHex;
    const draftPubkeyValue = draftPubkey();
    const currentUser = user();
    const needsAuth =
      !!secretHex &&
      (!currentUser ||
        currentUser.isAnon ||
        (draftPubkeyValue && currentUser.pubkey !== draftPubkeyValue));
    if (needsAuth && secretHex) {
      try {
        await authWithSecretKey(hexToBytes(secretHex), true);
      } catch (error) {
        console.error('[Onboarding] Failed to re-authenticate before entering feed', error);
      }
    }

    const finalUser = user();
    markOnboardingCompleted(draftPubkeyValue ?? finalUser?.pubkey);
    flow.clear();
    navigate('/feed', { replace: true });
  };

  return (
    <Show
      when={!isBlocked()}
      fallback={
        <div class="max-w-3xl mx-auto px-4 py-10">
          <div class="card p-6 space-y-4 text-center">
            <h2 class="text-2xl font-bold">{blockedInfo().title}</h2>
            <p class="text-text-secondary">{blockedInfo().body}</p>
            <div class="flex flex-wrap items-center justify-center gap-3">
              <button class="btn" onClick={() => navigate('/feed')}>
                Go to Feed
              </button>
              <Show when={blockReason() === 'mismatched-user'}>
                <button class="btn secondary" onClick={handleResetFlow}>
                  Reset Flow
                </button>
              </Show>
            </div>
          </div>
        </div>
      }
    >
      <div class="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <div class="flex items-center justify-between">
        <button class="btn text-sm" onClick={handleBackToLanding}>
          ← Back
        </button>
        <button
          class="btn text-sm text-red-500 border border-red-500/40"
          onClick={handleResetFlow}
        >
          Reset Flow
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <p class="text-sm text-text-tertiary uppercase tracking-wide">Onboarding</p>
          <h1 class="text-3xl font-bold">Create your notemine identity</h1>
        </div>
        <StepProgress current={step()} />
      </div>

      <Switch fallback={<PlaceholderStep step={step()} onNext={() => flow.nextStep()} />}>
        <Match when={step() === 'intro'}>
          <IntroStep onStart={() => flow.goToStep('key-mining')} />
        </Match>
        <Match when={step() === 'key-mining'}>
          <KeyMiningStep
            difficulty={targetDifficulty()}
            keyDraft={keyDraft()}
            onComplete={handleKeyMiningComplete}
            onBack={() => flow.goToStep('intro')}
            onRemine={handleResetKeyDraft}
            onContinueExisting={handleUseExistingKey}
            onDifficultyChange={(value) => {
              const clamped = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, value));
              setTargetDifficulty(clamped);
              flow.updateKeyDraft({ targetDifficulty: clamped });
            }}
          />
        </Match>
        <Match when={step() === 'key-safety'}>
          <KeySafetyStep
            keyDraft={keyDraft()}
            onConfirmedChange={handleKeyConfirmationChange}
            onContinue={handleSafetyContinue}
            onRegenerate={handleResetKeyDraft}
            onBack={() => flow.goToStep('key-mining')}
          />
        </Match>
        <Match when={step() === 'profile'}>
          <Show
            when={keyDraft()?.confirmed}
            fallback={
              <div class="card p-6 space-y-3">
                <h3 class="text-lg font-semibold">Finish key safety first</h3>
                <p class="text-sm text-text-secondary">
                  Confirm that you stored your nsec before creating your profile.
                </p>
                <button class="btn text-sm" onClick={() => flow.goToStep('key-safety')}>
                  Return to Key Safety
                </button>
              </div>
            }
          >
          <section class="space-y-6">
            <div class="card p-6 space-y-5">
              <div class="space-y-1">
                <h2 class="text-xl font-semibold">Introduce yourself</h2>
                <p class="text-sm text-text-secondary">
                  We’ll take a brief moment to polish your profile before anyone sees it. Add a name and
                  photo you like, then continue.
                </p>
              </div>
              <div class="space-y-4">
                <label class="space-y-1 block">
                  <span class="text-xs uppercase tracking-wide text-text-tertiary">Name</span>
                  <input
                    class="input w-full"
                    type="text"
                    value={profileName()}
                    onInput={(event) => flow.updateProfileDraft({ name: event.currentTarget.value })}
                    placeholder="Satoshi"
                  />
                </label>
                <label class="space-y-1 block">
                  <span class="text-xs uppercase tracking-wide text-text-tertiary">About</span>
                  <textarea
                    class="input w-full resize-none"
                    rows={3}
                    placeholder="Tell the world what you mine for…"
                    value={profileAbout()}
                    onInput={(event) => flow.updateProfileDraft({ about: event.currentTarget.value })}
                  />
                </label>
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs uppercase tracking-wide text-text-tertiary">Photo</span>
                    <button
                      class="btn text-xs"
                      onClick={() =>
                        flow.updateProfileDraft({
                          imageDataUrl: undefined,
                          imagePreviewDataUrl: undefined,
                          mimeType: undefined,
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div class="flex flex-col gap-3 md:flex-row">
                    <label class="flex-1 border border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-accent transition-colors">
                      <div class="text-sm text-text-secondary">
                        {avatarLoading() ? 'Processing image…' : 'Click to upload'}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        class="hidden"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          void handleAvatarFileChange(file);
                          event.currentTarget.value = '';
                        }}
                      />
                      <div class="text-xs text-text-tertiary mt-2">Max 2MB. Converted to base32.</div>
                    </label>
                    <div class="w-full md:w-40 aspect-square border border-border rounded-lg flex items-center justify-center overflow-hidden bg-bg-secondary/40">
                      <Show when={profileImagePreview()} fallback={<span class="text-3xl">🪪</span>}>
                        {(src) => <img src={src()} alt="Avatar preview" class="w-full h-full object-cover" />}
                      </Show>
                    </div>
                  </div>
                  <Show when={avatarError()}>
                    <p class="text-sm text-red-500">{avatarError()}</p>
                  </Show>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <button class="btn basic text-sm" onClick={() => flow.goToStep('key-safety')}>
                    ← Back
                  </button>
                  <button
                    class="btn"
                    disabled={!profileCanSubmit()}
                    onClick={enqueueProfileMining}
                  >
                    {profileActionLabel()}
                  </button>
                  <Show when={profileDraft()?.status && profileDraft()?.status !== 'idle'}>
                    <p class="text-sm text-text-secondary">{profileStatusMessage()}</p>
                  </Show>
                </div>
                <Show when={(relayDraft()?.status && relayDraft()?.status !== 'idle') || relaySelectionError()}>
                  <p class="text-xs text-text-tertiary">{connectionStatusMessage()}</p>
                </Show>
                <Show when={relaySelectionError()}>
                  <p class="text-sm text-red-500">{relaySelectionError()}</p>
                </Show>
                <Show when={relayDraft()?.lastError && relayDraft()?.status === 'error'}>
                  <div class="text-sm text-red-500 bg-red-500/10 border border-red-500/40 rounded p-3">
                    {relayDraft()?.lastError}
                  </div>
                </Show>
                <Show when={profileDraft()?.lastError && profileDraft()?.status === 'error'}>
                  <div class="text-sm text-red-500 bg-red-500/10 border border-red-500/40 rounded p-3">
                    {profileDraft()?.lastError}
                  </div>
                </Show>
              </div>
            </div>
            <Show when={profileDraft()?.status && profileDraft()?.status !== 'idle'}>
              <div class="flex flex-wrap gap-3">
                <button class="btn basic text-sm" onClick={resetProfileState}>
                  Reset Step
                </button>
              </div>
            </Show>
          </section>
          </Show>
        </Match>
        <Match when={step() === 'follow-packs'}>
          <Show
            when={relayDraft()?.status === 'completed'}
            fallback={
              <div class="card p-6 space-y-3">
                <h3 class="text-lg font-semibold">Finishing setup</h3>
                <p class="text-sm text-text-secondary">
                  We&apos;re connecting your profile behind the scenes. Once that&apos;s done you can pick who
                  to follow.
                </p>
                <button class="btn text-sm" onClick={() => flow.goToStep('profile')}>
                  Back to Profile
                </button>
              </div>
            }
          >
            <section class="space-y-6">
              <div class="card p-6 space-y-4">
                <div class="space-y-1">
                  <h2 class="text-xl font-semibold">Pick follow packs</h2>
                  <p class="text-sm text-text-secondary">
                    Choose curated packs to seed your contact list. People are deduplicated across
                    packs. Select at least one pack to continue.
                  </p>
                </div>
                <Show
                  when={!resolvedFollowPacks.loading}
                  fallback={<p class="text-sm text-text-secondary">Loading follow packs…</p>}
                >
                  <Show
                    when={followPackList().length > 0}
                    fallback={<p class="text-sm text-text-secondary">No packs configured yet.</p>}
                  >
                    <div class="space-y-3">
                      <For each={followPackList()}>
                        {(pack) => {
                          const isSelected = () => selectedFollowPackIds().has(pack.id);
                          return (
                            <div class="border border-border rounded-lg p-4 flex flex-col gap-3">
                              <div class="flex items-center justify-between gap-3">
                                <div>
                                  <h3 class="font-semibold">{pack.title}</h3>
                                  <p class="text-xs text-text-tertiary">
                                    {pack.pubkeys.length} people
                                  </p>
                                </div>
                                <button
                                  class="btn text-sm"
                                  classList={{ 'bg-accent text-white': isSelected() }}
                                  onClick={() => toggleFollowPackSelection(pack.id)}
                                >
                                  {isSelected() ? 'Selected' : 'Select'}
                                </button>
                              </div>
                              <Show when={pack.description}>
                                <p class="text-sm text-text-secondary">{pack.description}</p>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>
                <div class="space-y-2">
                  <p class="text-sm text-text-secondary">
                    Unique follows selected: {aggregatedFollowList().length}
                  </p>
                  <div class="text-xs text-text-tertiary space-y-1">
                    <For each={aggregatedFollowList().slice(0, 8)}>
                      {(pk) => <div class="font-mono break-all">{pk}</div>}
                    </For>
                    <Show when={aggregatedFollowList().length > 8}>
                      <div>+ {aggregatedFollowList().length - 8} more</div>
                    </Show>
                  </div>
                </div>
                <div class="flex flex-wrap gap-3">
                  <button class="btn basic text-sm" onClick={() => flow.goToStep('profile')}>
                    ← Back
                  </button>
                  <button
                    class="btn"
                    disabled={
                      aggregatedFollowList().length === 0 ||
                      followsDraft()?.status === 'publishing'
                    }
                    onClick={publishFollowList}
                  >
                    {followActionLabel()}
                  </button>
                  <Show when={followsDraft()?.status && followsDraft()?.status !== 'idle'}>
                    <p class="text-sm text-text-secondary">{followStatusMessage()}</p>
                  </Show>
                </div>
                <Show when={followsDraft()?.lastError && followsDraft()?.status === 'error'}>
                  <div class="text-sm text-red-500 bg-red-500/10 border border-red-500/40 rounded p-3">
                    {followsDraft()?.lastError}
                  </div>
                </Show>
              </div>
            </section>
          </Show>
        </Match>
        <Match when={step() === 'complete'}>
          <CompleteStep
            onEnterApp={handleEnterApp}
            onEditProfile={() => flow.goToStep('profile')}
            onEditFollows={() => flow.goToStep('follow-packs')}
            profile={profileDraft()}
            relays={relayDraft()}
            follows={followsDraft()}
          />
        </Match>
      </Switch>
      </div>
    </Show>
  );
};

export default Onboarding;
