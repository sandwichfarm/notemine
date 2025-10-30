import { Component, createSignal, Show, createEffect, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { useTheme } from '../providers/ThemeProvider';
import { useUser } from '../providers/UserProvider';
import { useTooltip } from '../providers/TooltipProvider';
import { LoginModal } from './LoginModal';
import Profile from '../pages/Profile';
import { MiningStatsButton, MiningPanel } from './MiningStatsButton';
import { useMining } from '../providers/MiningProvider';
import { QueueButton } from './QueueButton';
import { QueuePanel } from './QueuePanel';
import { PublishingButton } from './PublishingButton';
import { PublishingPanel } from './PublishingPanel';
import { clearAnonKey } from '../lib/anon-storage';
import { useQueue } from '../providers/QueueProvider';
import { useProfile } from '../hooks/useProfile';
import { useNip05Validation } from '../lib/nip05-validator';
import { nip19 } from 'nostr-tools';
import { eventStore, getUserOutboxRelaysSignal } from '../lib/applesauce';

const Layout: Component<{ children?: any }> = (props) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, authAnon, setAnonPersistence } = useUser();
  const { activeTooltip, tooltipContent, setActiveTooltip, setCloseAllPanels } = useTooltip();
  const { miningState, pauseMining } = useMining();
  const { queueState, pauseQueue, startQueue } = useQueue();
  const [showLoginModal, setShowLoginModal] = createSignal(false);
  const [showProfileModal, setShowProfileModal] = createSignal(false);
  const [activePanel, setActivePanel] = createSignal<'mining' | 'user' | 'queue' | 'publishing' | null>(null);
  const [showPersistenceConfirm, setShowPersistenceConfirm] = createSignal(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = createSignal(false);
  const [headerHeight, setHeaderHeight] = createSignal(80); // Default fallback

  // Get current user's profile for display
  const userProfile = useProfile(() => user()?.pubkey);

  // NIP-05 validation for current user
  const nip05Validation = useNip05Validation(
    () => userProfile().metadata?.nip05,
    () => user()?.pubkey
  );

  // Helper to copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Computed identifiers
  const userIdentifiers = createMemo(() => {
    const pubkey = user()?.pubkey;
    if (!pubkey) return null;

    const npub = nip19.npubEncode(pubkey);

    // Get user's outbox relays for nprofile (use empty array if not yet loaded)
    const relays = getUserOutboxRelaysSignal().slice(0, 3) || [];
    const nprofile = nip19.nprofileEncode({ pubkey, relays });

    return { pubkey, npub, nprofile };
  });

  // Discovery status for events
  const [discoveryStatus, setDiscoveryStatus] = createSignal({
    kind0: false,
    kind3: false,
    kind10002: false,
  });

  // Track event discovery
  createEffect(() => {
    const pubkey = user()?.pubkey;
    if (!pubkey) {
      setDiscoveryStatus({ kind0: false, kind3: false, kind10002: false });
      return;
    }

    // Subscribe to each event type
    const subs: any[] = [];

    subs.push(eventStore.replaceable(0, pubkey).subscribe({
      next: (event) => {
        setDiscoveryStatus(prev => ({ ...prev, kind0: !!event }));
      }
    }));

    subs.push(eventStore.replaceable(3, pubkey).subscribe({
      next: (event) => {
        setDiscoveryStatus(prev => ({ ...prev, kind3: !!event }));
      }
    }));

    subs.push(eventStore.replaceable(10002, pubkey).subscribe({
      next: (event) => {
        setDiscoveryStatus(prev => ({ ...prev, kind10002: !!event }));
      }
    }));

    // Cleanup subscriptions
    return () => {
      subs.forEach(sub => sub?.unsubscribe());
    };
  });

  let headerRef: HTMLDivElement | undefined;

  // Register panel close callback with tooltip provider
  setCloseAllPanels(() => {
    setActivePanel(null);
  });

  // Close tooltip when opening a panel
  const openPanel = (panel: 'mining' | 'user' | 'queue' | 'publishing') => {
    setActiveTooltip(null);
    setActivePanel(activePanel() === panel ? null : panel);
  };

  // Pause/Resume handlers
  const handlePause = () => {
    pauseQueue(); // Pause queue processing
    pauseMining(); // Pause actual mining
  };

  const handleResume = () => {
    startQueue(); // Resume queue processing - QueueProcessor will handle resuming or starting next item
  };

  // Check if there are any queued or active items
  const hasActiveOrQueuedItems = () => {
    const state = queueState();
    return state.items.some((item) => item.status === 'queued') || state.activeItemId !== null;
  };

  // Update header height whenever it changes
  createEffect(() => {
    // Trigger on these dependencies
    activeTooltip();
    activePanel();
    miningState().mining;

    // Measure header height after render
    setTimeout(() => {
      if (headerRef) {
        const height = headerRef.getBoundingClientRect().height;
        setHeaderHeight(height);
      }
    }, 0);
  });

  return (
    <div class="min-h-screen flex flex-col pb-16">
      {/* Backdrop when tooltip or panel is active */}
      <Show when={activeTooltip() || activePanel()}>
        <div
          class="fixed inset-0 bg-black/85 z-35"
          onClick={() => {
            setActiveTooltip(null);
            setActivePanel(null);
          }}
        />
      </Show>

      {/* Header with Mining, User, Login, Theme */}
      <div
        ref={headerRef}
        class="fixed top-0 left-0 right-0 z-40 transition-all bg-bg-primary dark:bg-bg-secondary"
      >
        <div class="flex items-center justify-center py-4 bg-black/90">
          <div class="flex items-center gap-2">
            {/* Pause/Resume button (far left) */}
            <Show when={hasActiveOrQueuedItems()}>
              <Show
                when={queueState().isProcessing}
                fallback={
                  <button
                    onClick={handleResume}
                    class="text-xs px-3 py-2 bg-green-500/20 text-green-500 rounded hover:bg-green-500/30 transition-colors"
                    title="Resume mining queue"
                  >
                    ▶
                  </button>
                }
              >
                <button
                  onClick={handlePause}
                  class="text-xs px-3 py-2 bg-yellow-500/20 text-yellow-500 rounded hover:bg-yellow-500/30 transition-colors"
                  title="Pause mining queue"
                >
                  ⏸
                </button>
              </Show>
            </Show>

            {/* Mining toggle (left, after pause/resume) */}
            <MiningStatsButton onToggle={() => openPanel('mining')} isActive={activePanel() === 'mining'} />
            <QueueButton onToggle={() => openPanel('queue')} isActive={activePanel() === 'queue'} />
            <PublishingButton onToggle={() => openPanel('publishing')} isActive={activePanel() === 'publishing'} />

            <Show when={user()}>
              <button
                onClick={() => openPanel('user')}
                class="btn text-sm flex items-center gap-2"
                title="Click to view profile"
              >
                <Show when={user()?.isAnon}>
                  <Show
                    when={user()?.isAnonPersisted}
                    fallback={
                      <span class="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded">anon</span>
                    }
                  >
                    <span class="text-xs px-2 py-0.5 bg-green-500/20 text-green-500 rounded">anon 💾</span>
                  </Show>
                </Show>

                {/* Avatar */}
                <Show
                  when={userProfile().metadata?.picture}
                  fallback={
                    <div class="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-xs">
                      👤
                    </div>
                  }
                >
                  <img
                    src={userProfile().metadata!.picture}
                    alt=""
                    class="w-5 h-5 rounded-full object-cover"
                  />
                </Show>

                {/* Name or pubkey */}
                <span class={userProfile().metadata?.display_name || userProfile().metadata?.name ? '' : 'font-mono'}>
                  {userProfile().metadata?.display_name ||
                   userProfile().metadata?.name ||
                   `${user()?.pubkey.slice(0, 8)}...`}
                </span>

                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </Show>

            {/* Login Button (visible for anon users) */}
            <Show when={user()?.isAnon}>
              <button
                onClick={() => setShowLoginModal(true)}
                class="btn text-xs px-3 py-2"
              >
                Sign In
              </button>
            </Show>

            {/* Preferences Button */}
            <A
              href="/preferences"
              class="btn text-xs px-3 py-2"
              title="Preferences"
            >
              ⚙️
            </A>

            {/* Diagnostics Button */}
            <A
              href="/diagnostics"
              class="btn text-xs px-3 py-2"
              title="Diagnostics"
            >
              🧪
            </A>

            {/* Theme Toggle (far right) */}
            <button
              onClick={toggleTheme}
              class="btn text-xs px-3 py-2"
              title={`Switch to ${theme() === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme() === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Tooltip Panel */}
        <Show when={activeTooltip()}>
          <div class="px-6 py-4">
            <div class="max-w-6xl mx-auto">
              <pre class="text-xs font-mono text-text-secondary whitespace-pre-wrap">
                {tooltipContent()}
              </pre>
            </div>
          </div>
        </Show>

        {/* Mining Panel */}
        <Show when={activePanel() === 'mining'}>
          <MiningPanel />
        </Show>

        {/* Queue Panel */}
        <Show when={activePanel() === 'queue'}>
          <QueuePanel />
        </Show>

        {/* Publishing Panel */}
        <Show when={activePanel() === 'publishing'}>
          <PublishingPanel />
        </Show>

        {/* User Panel */}
        <Show when={activePanel() === 'user'}>
          <div class="px-6 py-4 bg-black/90 max-h-[80vh] overflow-y-auto">
            <div class="max-w-6xl mx-auto space-y-3">

              {/* Section 1: Profile Preview (for non-anon users) */}
              <Show when={!user()?.isAnon}>
                <div class="bg-bg-secondary dark:bg-bg-tertiary rounded-lg p-4">
                  <div class="flex gap-3">
                    {/* Avatar */}
                    <Show
                      when={userProfile().metadata?.picture}
                      fallback={
                        <div class="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-2xl flex-shrink-0">
                          👤
                        </div>
                      }
                    >
                      <img
                        src={userProfile().metadata!.picture}
                        alt="Profile"
                        class="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      />
                    </Show>

                    {/* Name and NIP-05 */}
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold text-base truncate">
                        {userProfile().metadata?.display_name ||
                         userProfile().metadata?.name ||
                         'Anonymous'}
                      </div>

                      {/* NIP-05 with validation */}
                      <Show when={userProfile().metadata?.nip05}>
                        <div class="flex items-center gap-1 text-xs mt-1">
                          <span class="text-text-secondary truncate">
                            {userProfile().metadata!.nip05}
                          </span>
                          <Show when={!nip05Validation().loading}>
                            <Show
                              when={nip05Validation().valid}
                              fallback={<span class="text-red-500" title="Not verified">✗</span>}
                            >
                              <span class="text-green-500" title="Verified">✓</span>
                            </Show>
                          </Show>
                          <Show when={nip05Validation().loading}>
                            <span class="text-text-secondary" title="Verifying...">⏳</span>
                          </Show>
                        </div>
                      </Show>

                      {/* Bio (truncated to 2 lines) */}
                      <Show when={userProfile().metadata?.about}>
                        <p class="text-xs text-text-secondary mt-2 line-clamp-2">
                          {userProfile().metadata!.about}
                        </p>
                      </Show>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Section 2: Identifiers (collapsible) */}
              <Show when={!user()?.isAnon && userIdentifiers()}>
                <details class="bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                  <summary class="px-4 py-2 cursor-pointer hover:bg-accent/10 rounded-lg text-sm font-medium">
                    Identifiers
                  </summary>
                  <div class="px-4 pb-3 pt-1 space-y-2">
                    {/* Pubkey */}
                    <div>
                      <div class="text-xs text-text-secondary mb-1">Pubkey (hex)</div>
                      <div class="flex items-center gap-2">
                        <code class="text-xs font-mono bg-black/30 px-2 py-1 rounded flex-1 truncate">
                          {userIdentifiers()?.pubkey}
                        </code>
                        <button
                          onClick={() => copyToClipboard(userIdentifiers()!.pubkey)}
                          class="text-xs px-2 py-1 bg-accent/20 hover:bg-accent/30 rounded transition-colors"
                          title="Copy"
                        >
                          📋
                        </button>
                      </div>
                    </div>

                    {/* npub */}
                    <div>
                      <div class="text-xs text-text-secondary mb-1">npub</div>
                      <div class="flex items-center gap-2">
                        <code class="text-xs font-mono bg-black/30 px-2 py-1 rounded flex-1 truncate">
                          {userIdentifiers()?.npub}
                        </code>
                        <button
                          onClick={() => copyToClipboard(userIdentifiers()!.npub)}
                          class="text-xs px-2 py-1 bg-accent/20 hover:bg-accent/30 rounded transition-colors"
                          title="Copy"
                        >
                          📋
                        </button>
                      </div>
                    </div>

                    {/* nprofile */}
                    <div>
                      <div class="text-xs text-text-secondary mb-1">nprofile (with relays)</div>
                      <div class="flex items-center gap-2">
                        <code class="text-xs font-mono bg-black/30 px-2 py-1 rounded flex-1 truncate">
                          {userIdentifiers()?.nprofile}
                        </code>
                        <button
                          onClick={() => copyToClipboard(userIdentifiers()!.nprofile)}
                          class="text-xs px-2 py-1 bg-accent/20 hover:bg-accent/30 rounded transition-colors"
                          title="Copy"
                        >
                          📋
                        </button>
                      </div>
                    </div>
                  </div>
                </details>
              </Show>

              {/* Section 3: Discovery Status */}
              <Show when={!user()?.isAnon}>
                <div class="bg-bg-secondary dark:bg-bg-tertiary rounded-lg px-4 py-3">
                  <div class="text-xs text-text-secondary mb-2">Event Discovery</div>
                  <div class="flex gap-2 flex-wrap">
                    <span
                      class="text-xs px-2 py-1 rounded"
                      classList={{
                        'bg-green-500/20 text-green-500': discoveryStatus().kind0,
                        'bg-gray-500/20 text-gray-500': !discoveryStatus().kind0,
                      }}
                      title="Profile metadata (kind 0)"
                    >
                      {discoveryStatus().kind0 ? '✓' : '✗'} Profile
                    </span>
                    <span
                      class="text-xs px-2 py-1 rounded"
                      classList={{
                        'bg-green-500/20 text-green-500': discoveryStatus().kind3,
                        'bg-gray-500/20 text-gray-500': !discoveryStatus().kind3,
                      }}
                      title="Contact list (kind 3)"
                    >
                      {discoveryStatus().kind3 ? '✓' : '✗'} Contacts
                    </span>
                    <span
                      class="text-xs px-2 py-1 rounded"
                      classList={{
                        'bg-green-500/20 text-green-500': discoveryStatus().kind10002,
                        'bg-gray-500/20 text-gray-500': !discoveryStatus().kind10002,
                      }}
                      title="Relay list (kind 10002)"
                    >
                      {discoveryStatus().kind10002 ? '✓' : '✗'} Relays
                    </span>
                  </div>
                </div>
              </Show>

              {/* Anon User Info */}
              <Show when={user()?.isAnon}>
                <div class="bg-bg-secondary dark:bg-bg-tertiary rounded-lg p-4">
                  <div class="text-xs text-text-secondary mb-1">Browsing as</div>
                  <div class="font-mono text-xs break-all">{user()?.pubkey}</div>
                  <div class="text-xs text-accent mt-1">
                    {user()?.authMethod} {user()?.isAnonPersisted ? '(persisted)' : '(ephemeral)'}
                  </div>
                </div>
              </Show>

              {/* Anon user controls */}
              <Show when={user()?.isAnon}>
                <div class="bg-bg-secondary dark:bg-bg-tertiary rounded-lg p-4 space-y-2">
                  {/* Persistence toggle */}
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="text-sm">Persist Key</span>
                      <span class="text-xs text-text-secondary">💾</span>
                    </div>
                    <button
                      onClick={() => {
                        const isPersisted = user()?.isAnonPersisted;
                        if (isPersisted) {
                          setShowPersistenceConfirm(true);
                        } else {
                          setAnonPersistence(true);
                        }
                      }}
                      class="relative inline-flex items-center h-6 rounded-full w-11 transition-colors"
                      classList={{
                        'bg-green-500': user()?.isAnonPersisted,
                        'bg-gray-500': !user()?.isAnonPersisted,
                      }}
                    >
                      <span
                        class="inline-block w-4 h-4 transform bg-white rounded-full transition-transform"
                        classList={{
                          'translate-x-6': user()?.isAnonPersisted,
                          'translate-x-1': !user()?.isAnonPersisted,
                        }}
                      />
                    </button>
                  </div>

                  {/* Regenerate button (only when persisted) */}
                  <Show when={user()?.isAnonPersisted}>
                    <button
                      onClick={() => setShowRegenerateConfirm(true)}
                      class="w-full px-3 py-2 text-left text-sm bg-black/30 hover:bg-accent/20 rounded transition-colors flex items-center justify-between"
                    >
                      <span>Regenerate Key</span>
                      <span class="text-xs">🔄</span>
                    </button>
                  </Show>
                </div>
              </Show>

              {/* Section 4: Action Buttons */}
              <Show when={!user()?.isAnon}>
                <div class="flex gap-2">
                  <button
                    onClick={() => {
                      setActivePanel(null);
                      setShowProfileModal(true);
                    }}
                    class="flex-1 px-4 py-2.5 text-sm font-medium bg-accent hover:bg-accent/80 rounded-lg transition-colors"
                  >
                    Edit Profile
                  </button>
                  <A
                    href={`/p/${user()?.pubkey}`}
                    onClick={() => setActivePanel(null)}
                    class="flex-1 px-4 py-2.5 text-center text-sm font-medium bg-bg-secondary dark:bg-bg-tertiary hover:bg-accent/20 rounded-lg transition-colors"
                  >
                    View Profile
                  </A>
                </div>

                <button
                  onClick={() => {
                    logout();
                    setActivePanel(null);
                  }}
                  class="w-full px-4 py-2.5 text-sm font-medium bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal()}
        onClose={() => setShowLoginModal(false)}
      />

      {/* Profile Modal */}
      <Show when={showProfileModal()}>
        <div
          class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowProfileModal(false)}
        >
          <div class="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div class="card p-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-2xl font-bold">Profile</h2>
                <button
                  onClick={() => setShowProfileModal(false)}
                  class="text-text-secondary hover:text-text-primary"
                >
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <Profile />
            </div>
          </div>
        </div>
      </Show>

      {/* Persistence Disable Confirmation */}
      <Show when={showPersistenceConfirm()}>
        <div
          class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowPersistenceConfirm(false)}
        >
          <div
            class="card p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="text-lg font-bold mb-3">Disable Key Persistence?</h3>
            <p class="text-sm text-text-secondary mb-4">
              Your anonymous key will no longer be saved. What would you like to do?
            </p>
            <div class="space-y-2">
              <button
                onClick={() => {
                  // Keep current key, just clear storage
                  clearAnonKey();
                  setAnonPersistence(false);
                  setShowPersistenceConfirm(false);
                }}
                class="w-full px-4 py-2 bg-accent hover:bg-accent/80 rounded transition-colors text-sm font-medium"
              >
                Keep Current Key (Ephemeral)
              </button>
              <button
                onClick={() => {
                  // Generate new key
                  clearAnonKey();
                  authAnon(undefined, false);
                  setShowPersistenceConfirm(false);
                }}
                class="w-full px-4 py-2 bg-bg-secondary hover:bg-bg-tertiary rounded transition-colors text-sm"
              >
                Generate New Key
              </button>
              <button
                onClick={() => setShowPersistenceConfirm(false)}
                class="w-full px-4 py-2 bg-bg-secondary hover:bg-bg-tertiary rounded transition-colors text-sm text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Regenerate Key Confirmation */}
      <Show when={showRegenerateConfirm()}>
        <div
          class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowRegenerateConfirm(false)}
        >
          <div
            class="card p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="text-lg font-bold mb-3">Regenerate Anonymous Key?</h3>
            <p class="text-sm text-text-secondary mb-4">
              This will generate a new anonymous key and save it. Your old key will be permanently lost.
            </p>
            <div class="space-y-2">
              <button
                onClick={() => {
                  authAnon(undefined, true);
                  setShowRegenerateConfirm(false);
                }}
                class="w-full px-4 py-2 bg-red-500 hover:bg-red-600 rounded transition-colors text-sm font-medium"
              >
                Regenerate Key
              </button>
              <button
                onClick={() => setShowRegenerateConfirm(false)}
                class="w-full px-4 py-2 bg-bg-secondary hover:bg-bg-tertiary rounded transition-colors text-sm text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Main Content */}
      <main
        class="flex-1 px-6 py-8 transition-all"
        style={{
          'padding-top': `${headerHeight()}px`
        }}
      >
        <div class="max-w-6xl mx-auto">
          {props.children}
        </div>
      </main>

      {/* Floating Footer */}
      <footer class="fixed bottom-0 left-0 right-0 bg-bg-primary/80 dark:bg-bg-secondary/80 backdrop-blur-sm border-t border-border px-6 py-3 z-30">
        <div class="max-w-6xl mx-auto flex items-center justify-between text-xs">
          <A href="/" class="font-bold hover:text-accent transition-colors">
            notemine.io
          </A>
          <div class="flex gap-4">
            <A href="/about" class="hover:text-accent transition-colors">
              about
            </A>
            <A href="/relays" class="hover:text-accent transition-colors">
              relays
            </A>
            <A href="/stats" class="hover:text-accent transition-colors">
              stats
            </A>
            <a
              href="https://github.com/sandwichfarm/notemine"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-accent transition-colors"
            >
              github
            </a>
            <a
              href="https://crates.io/crates/notemine"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-accent transition-colors"
            >
              crates.io
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
