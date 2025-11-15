import { Component, Show, For, createSignal, createResource, createMemo, createEffect, onCleanup } from 'solid-js';
import { useNavigate, useLocation } from '@solidjs/router';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { useTimelineContext } from '../providers/TimelineProvider';
import { parseNpub, formatShortNpub, type ParsedNpub } from '../lib/npub';
import { LoginPanel } from '../components/LoginModal';
import { useProfile } from '../hooks/useProfile';

interface ResolvedPreset {
  id: string;
  raw: string;
  parsed: ParsedNpub;
}

const fetchAnonPresets = async (): Promise<string[]> => {
  try {
    const response = await fetch('/anon-presets.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load presets (${response.status})`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      console.warn('[Landing] anon-presets.json is not an array');
      return [];
    }
    return payload
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry): entry is string => !!entry);
  } catch (err) {
    console.error('[Landing] Failed to fetch anon presets', err);
    return [];
  }
};

const Landing: Component = () => {
  const { user } = useUser();
  const { preferences, setAnonWotPreference, clearAnonWotPreference } = usePreferences();
  const { context } = useTimelineContext();
  const [presets] = createResource(fetchAnonPresets);
  const [npubInput, setNpubInput] = createSignal('');
  const [npubError, setNpubError] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<string | null>(null);
  const resolvedPresets = createMemo<ResolvedPreset[]>(() => {
    const seeds = presets() ?? [];
    return seeds
      .map((entry, index) => {
        const parsed = parseNpub(entry);
        if (!parsed) return null;
        return {
          id: `${index}-${parsed.hex}`,
          raw: entry,
          parsed,
        };
      })
      .filter((preset): preset is ResolvedPreset => !!preset);
  });
  const [visiblePresetIds, setVisiblePresetIds] = createSignal<Set<string>>(new Set());
  const handlePresetVisibility = (id: string, visible: boolean) => {
    setVisiblePresetIds((prev) => {
      const next = new Set(prev);
      if (visible) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };
  createEffect(() => {
    const validIds = new Set(resolvedPresets().map((preset) => preset.id));
    setVisiblePresetIds((prev) => {
      const filtered = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          filtered.add(id);
        }
      });
      return filtered;
    });
  });
  const [flow, setFlow] = createSignal<'start' | 'auth' | 'anon'>('start');

  const navigate = useNavigate();
  const location = useLocation();

  const queryNotice = createMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('notice');
  });

  const redirectTarget = createMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('redirect') || '/feed';
  });

  const mergeRelayHints = (a?: string[], b?: string[]) => {
    const merged = [...(a ?? []), ...(b ?? [])].filter(Boolean);
    return merged.length ? Array.from(new Set(merged)) : undefined;
  };

  const onAnonSelect = (entity: string, presetRelayHints?: string[]) => {
    const parsed = parseNpub(entity);
    if (!parsed) {
      setNpubError('Please enter a valid npub or nprofile.');
      return;
    }

    setAnonWotPreference({
      npub: parsed.npub,
      relayHints: mergeRelayHints(parsed.relays, presetRelayHints),
      lastUsed: Date.now(),
    });
    setStatus('Preference saved. Redirecting to your feed…');
    setNpubError(null);
    setTimeout(() => {
      navigate(redirectTarget(), { replace: true });
    }, 300);
  };

  const handleManualSubmit = (event: Event) => {
    event.preventDefault();
    if (!npubInput()) {
      setNpubError('Enter an npub to continue.');
      return;
    }
    onAnonSelect(npubInput()!);
  };

  createEffect(() => {
    // Automatically continue when visiting "/" and a context already exists.
    if (location.pathname !== '/') return;
    const currentUser = user();
    if (!currentUser) return;
    if (!currentUser.isAnon || context()) {
      navigate(redirectTarget(), { replace: true });
    }
  });

  const currentPref = createMemo(() => preferences().anonWotPreference);
  const isStartFlow = createMemo(() => flow() === 'start');
  const landingWrapperClass = createMemo(() =>
    isStartFlow()
      ? 'w-full min-h-[calc(100vh-6rem)] flex flex-col items-center justify-center gap-8 px-4'
      : 'w-full space-y-10'
  );

  const isExistingAccount = createMemo(() => {
    const current = user();
    return !!current && !current.isAnon;
  });

  const handleStartOnboarding = () => {
    if (isExistingAccount()) return;
    navigate('/onboarding');
  };

  return (
    <div class={landingWrapperClass()}>
      <Show when={queryNotice() === 'global-deprecated'}>
        <div class="card border border-yellow-500/50 bg-yellow-500/10 text-center text-sm text-yellow-700 dark:text-yellow-200 max-w-2xl w-full">
          The global timeline route has been deprecated. Please select a Web-of-Trust seed below to continue browsing.
        </div>
      </Show>

      <Show when={flow() === 'start'}>
        <section class="w-full max-w-2xl mx-auto text-center space-y-6">
          <div class="space-y-4">
            <h1 class="text-4xl font-bold">notemine</h1>
            <p class="text-text-secondary">
              an experimental social experience that puts you in control. 
            </p>
          </div>

          <div class="flex flex-col sm:flex-row justify-center gap-3">
            <button
              class="button basic"
              onClick={() => setFlow('auth')}
            >
              Authenticate
            </button>
            <button
              class="button basic"
              classList={{
                'opacity-70 cursor-not-allowed': isExistingAccount(),
              }}
              disabled={isExistingAccount()}
              onClick={handleStartOnboarding}
            >
              New User
            </button>
            <button
              class="button basic"
              onClick={() => setFlow('anon')}
            >
              Anonymous
            </button>
          </div>
          <Show when={isExistingAccount()}>
            <p class="text-sm text-text-secondary">
              You&apos;re already signed in. Log out first if you need to restart onboarding.
            </p>
          </Show>

          <Show when={currentPref()}>
            {(pref) => (
              <div class="space-y-3 text-sm text-text-secondary">
                <p class="font-mono tracking-wide text-text-secondary">
                  Resume with {formatShortNpub(pref().npub)}
                </p>
                <div class="flex flex-col sm:flex-row justify-center gap-3">
                  <button
                    class="btn text-sm"
                    onClick={() => navigate('/feed')}
                  >
                    Enter Feed
                  </button>
                  <button
                    class="btn text-sm bg-bg-secondary hover:bg-bg-tertiary"
                    onClick={() => clearAnonWotPreference()}
                  >
                    Clear
                  </button>
                </div>
                <Show when={status()}>
                  <p class="text-xs text-text-tertiary">{status()}</p>
                </Show>
              </div>
            )}
          </Show>
        </section>
      </Show>

      <Show when={flow() === 'auth'}>
        <section class="max-w-3xl mx-auto">
          <h2 class="text-3xl font-bold mb-4">Authenticate</h2>
          <p class="text-text-secondary mb-6">
            Connect using your preferred signer. Once authenticated, you can access your personalized feed.
          </p>
          <LoginPanel
            onBack={() => setFlow('start')}
            onSuccess={() => navigate('/feed')}
          />
        </section>
      </Show>

     <Show when={flow() === 'anon'}>
        <section class="space-y-6">
          <button class="btn w-fit text-sm" onClick={() => setFlow('start')}>
            ← Back
          </button>
          <h2 class="text-xl font-semibold">np cypherpunk</h2>
          <p class="text-sm text-text-secondary">
            notemine builds feeds starting at an npub, so in order to browse anonymously, so 
            the app needs a starting point
          </p>
          <div class="grid gap-6 md:grid-cols-2">
            

            <div class="card p-6 space-y-4">
              <h2 class="text-xl font-semibold">pick an npub to browse as</h2>
              <Show
                when={!presets.loading}
                fallback={<p class="text-sm text-text-secondary">Loading presets…</p>}
              >
                <Show
                  when={resolvedPresets().length > 0}
                  fallback={<p class="text-sm text-text-secondary">No presets available right now.</p>}
                >
                  <div class="space-y-3">
                    <For each={resolvedPresets()}>
                      {(preset) => (
                        <PresetCard
                          preset={preset}
                          onSelect={() => onAnonSelect(preset.raw, preset.parsed.relays)}
                          onVisibilityChange={(visible) => handlePresetVisibility(preset.id, visible)}
                        />
                      )}
                    </For>
                  </div>
                  <Show when={visiblePresetIds().size === 0}>
                    <p class="text-xs text-text-tertiary">Fetching curated profiles…</p>
                  </Show>
                </Show>
              </Show>
            </div>

            <div class="card p-6 space-y-4">
            <h2 class="text-xl font-semibold">Pick an npub</h2>

            <form class="space-y-3" onSubmit={handleManualSubmit}>
              <input
                type="text"
                placeholder="npub1..."
                class="input w-full"
                value={npubInput()}
                onInput={(e) => setNpubInput(e.currentTarget.value)}
              />
              <Show when={npubError()}>
                <p class="text-sm text-red-500">{npubError()}</p>
              </Show>
              <button type="submit" class="btn w-full bg-accent text-white hover:bg-accent/90">
                Continue with this npub
              </button>
            </form>
            </div>

          </div>
        </section>
      </Show>

    </div>
  );
};

export default Landing;

const PresetCard: Component<{
  preset: ResolvedPreset;
  onSelect: () => void;
  onVisibilityChange: (visible: boolean) => void;
}> = (props) => {
  const profile = useProfile(
    () => props.preset.parsed?.hex,
    props.preset.parsed?.relays?.length
      ? { additionalRelays: () => props.preset.parsed?.relays ?? [] }
      : undefined
  );

  const metadata = () => profile().metadata;
  const shortHandle = () => formatShortNpub(props.preset.parsed.npub);

  createEffect(() => {
    props.onVisibilityChange(!!metadata());
  });

  onCleanup(() => props.onVisibilityChange(false));

  return (
    <Show when={metadata()}>
      {(meta) => (
        <button
          class="w-full text-left border border-border rounded-lg p-3 hover:border-accent transition-colors"
          onClick={props.onSelect}
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-border flex items-center justify-center overflow-hidden">
              <Show when={meta().picture} fallback={<span class="text-lg">🧑‍🚀</span>}>
                {(src) => (
                  <img
                    src={src()}
                    alt=""
                    class="w-10 h-10 object-cover"
                  />
                )}
              </Show>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">
                {meta().display_name || meta().name || shortHandle()}
              </div>
              <Show when={meta().about}>
                <p class="text-xs text-text-secondary mt-1 line-clamp-2">
                  {meta().about}
                </p>
              </Show>
              <p class="text-xs text-text-tertiary mt-2 font-mono truncate">
                {shortHandle()}
              </p>
            </div>
          </div>
        </button>
      )}
    </Show>
  );
};
