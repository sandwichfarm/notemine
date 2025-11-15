import { Component, ParentComponent, onMount, createSignal, createEffect, Show } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { EventStoreProvider } from './providers/EventStoreProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { UserProvider } from './providers/UserProvider';
import { MiningProvider } from './providers/MiningProvider';
import { PreferencesProvider } from './providers/PreferencesProvider';
import { TooltipProvider } from './providers/TooltipProvider';
import { QueueProvider } from './providers/QueueProvider';
import { QueueProcessor } from './components/QueueProcessor';
import { PublishingProvider } from './providers/PublishingProvider';
import { FollowsProvider } from './providers/FollowsProvider';
import { PublishingProcessor } from './components/PublishingProcessor';
import { EmojiProvider } from './providers/EmojiProvider';
import { EmojiSetsProvider } from './providers/EmojiSetsProvider';
import { useUser } from './providers/UserProvider';
import Layout from './components/Layout';
import Home from './pages/Home';
import Feed from './pages/Feed';
import About from './pages/About';
import Stats from './pages/Stats';
import Relays from './pages/Relays';
import Diagnostics from './pages/Diagnostics';
import NoteDetail from './pages/NoteDetail';
import ProfileDetail from './pages/ProfileDetail';
import { Preferences } from './pages/Preferences';
import { fetchNip66PowRelays } from './lib/nip66';
import { setPowRelays, eventStore } from './lib/applesauce';
import {
  initializeCache,
  loadCachedEvents,
  setupCachePersistence,
  configureCacheRetention,
  startCompactionScheduler,
} from './lib/cache';
import { debug } from './lib/debug';

// App initialization component
const AppInit: ParentComponent = (props) => {
  const { user, authAnon, loadPersistedAnonKey, restoreSession, fetchUserData } = useUser();
  const [relaysReady, setRelaysReady] = createSignal(false);
  const [coiError, setCoiError] = createSignal<string | null>(null);
  const [sessionRestoreError, setSessionRestoreError] = createSignal<string | null>(null);

  onMount(async () => {
    // NOTE: COI (Cross-Origin Isolation) is REQUIRED for both:
    // - WASM threading (cache with Turso SQLite)
    // - WebSocket relay connections
    // COEP:credentialless allows both while permitting cross-origin WebSockets
    // COI is controlled via VITE_ENABLE_COI environment variable (dev) or COOP/COEP headers (prod)

    // Enforce COI requirement - block app boot if not available
    if (!window.crossOriginIsolated) {
      const isDev = import.meta.env.DEV;
      const errorMessage = isDev
        ? 'Cross-Origin Isolation is required but not enabled.\n\nDevelopment fix: Set VITE_ENABLE_COI=1 environment variable and restart the dev server.'
        : 'Cross-Origin Isolation is required but not enabled.\n\nProduction fix: Ensure your web server sends these headers:\n- Cross-Origin-Opener-Policy: same-origin\n- Cross-Origin-Embedder-Policy: credentialless';

      console.error('[CACHE-IMPL] COI check failed:', errorMessage);
      setCoiError(errorMessage);
      return; // Block further initialization
    }

    // Initialize local cache (COI confirmed available)
    try {
      await initializeCache({ allowMemoryFallback: true });
      console.log('[CACHE-IMPL] Cache initialized');

      // Load cached events into event store
      const cachedCount = await loadCachedEvents(eventStore);
      console.log(`[CACHE-IMPL] Loaded ${cachedCount} events from cache`);

      // Set up automatic cache persistence
      setupCachePersistence(eventStore);
      console.log('[CACHE-IMPL] Cache persistence enabled');

      // Phase 2: Configure retention with default budgets
      configureCacheRetention({
        maxTotalEvents: 100_000,
      });
      console.log('[CACHE-IMPL] Retention policy configured');

      // Phase 2: Start compaction scheduler (runs every 15 minutes)
      startCompactionScheduler(15);
      console.log('[CACHE-IMPL] Compaction scheduler started');
    } catch (error) {
      console.error('[CACHE-IMPL] Cache initialization failed:', error);
      // Continue without cache
    }

    // Fetch NIP-66 POW relays BEFORE mounting children
    try {
      const relays = await fetchNip66PowRelays();
      setPowRelays(relays);
      // Relay connections are now managed automatically by RelayConnectionManager
      debug('[App] POW relays discovered:', relays);
    } catch (error) {
      console.error('[App] Failed to fetch NIP-66 relays:', error);
    }

    // Try to restore persisted session (extension, nostrconnect, or bunker)
    const { hasPersistedSession } = await import('./lib/session-storage');
    if (hasPersistedSession()) {
      debug('[App] Attempting to restore persisted session');
      const result = await restoreSession();

      if (result.success) {
        debug('[App] Session restored successfully:', result.method);
      } else {
        debug('[App] Session restoration failed:', result.error);
        setSessionRestoreError(result.error || 'Failed to restore session');

        // Fall back to anonymous user
        const persistedKey = loadPersistedAnonKey();
        if (persistedKey) {
          debug('[App] Loading persisted anonymous key as fallback');
          authAnon(persistedKey, true);
        } else {
          debug('[App] Creating new ephemeral anonymous key as fallback');
          authAnon();
        }
      }
    } else {
      // No persisted session - initialize with anonymous user
      const persistedKey = loadPersistedAnonKey();
      if (persistedKey) {
        debug('[App] Loading persisted anonymous key');
        authAnon(persistedKey, true);
      } else {
        debug('[App] Creating new ephemeral anonymous key');
        authAnon();
      }
    }

    // Signal that relays are ready and children can mount
    setRelaysReady(true);
  });

  // Fetch user profile data once when a non-anonymous user is first set
  let lastFetchedPubkey: string | null = null;
  createEffect(() => {
    const currentUser = user();
    if (currentUser && !currentUser.isAnon && relaysReady()) {
      // Only fetch if we haven't fetched for this pubkey yet
      if (lastFetchedPubkey !== currentUser.pubkey) {
        debug('[App] Fetching user profile data on session load');
        fetchUserData(currentUser.pubkey);
        lastFetchedPubkey = currentUser.pubkey;
      }
    }
  });

  // Phase 2: Update cache retention config when user changes (to pin their events)
  createEffect(() => {
    const currentUser = user();
    if (currentUser && !currentUser.isAnon && window.crossOriginIsolated) {
      debug('[App] Updating cache retention config for user:', currentUser.pubkey);

      // Get user's follows from EventStore (kind 3 contact list)
      const contactLists = eventStore.getReplaceable(3, currentUser.pubkey);
      const followsPubkeys = contactLists
        ? contactLists.tags
            .filter((t: string[]) => t[0] === 'p')
            .map((t: string[]) => t[1])
        : [];

      configureCacheRetention({
        userPubkey: currentUser.pubkey,
        followsPubkeys: followsPubkeys.slice(0, 500), // Limit to 500 follows for performance
      });

      debug(`[App] Cache retention updated: user pinned, ${followsPubkeys.length} follows pinned`);
    }
  });

  return (
    <Show
      when={!coiError()}
      fallback={
        <div class="fixed inset-0 flex items-center justify-center bg-bg-primary dark:bg-bg-secondary p-8">
          <div class="max-w-2xl bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg p-8">
            <div class="text-5xl mb-4">⚠️</div>
            <h1 class="text-2xl font-bold text-red-800 dark:text-red-200 mb-4">
              Configuration Error
            </h1>
            <pre class="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap font-mono bg-red-100 dark:bg-red-900/40 p-4 rounded">
              {coiError()}
            </pre>
            <div class="text-sm text-red-600 dark:text-red-400 mt-4">
              The application cannot start without Cross-Origin Isolation enabled.
            </div>
          </div>
        </div>
      }
    >
      <Show
        when={relaysReady()}
        fallback={
          <div class="fixed inset-0 flex items-center justify-center bg-bg-primary dark:bg-bg-secondary">
            <div class="text-center">
              <div class="text-9xl animate-[swing_0.8s_ease-in-out_infinite]" style={{ "transform-origin": "center top" }}>
                ⛏️
              </div>
              <div class="text-text-secondary text-sm mt-4">Loading notemine.io...</div>
            </div>
          </div>
        }
      >
        {/* Show session restoration error notification if present */}
        <Show when={sessionRestoreError()}>
          <div class="fixed top-4 right-4 max-w-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4 shadow-lg z-50">
            <div class="flex items-start gap-3">
              <div class="text-yellow-600 dark:text-yellow-400 text-xl">⚠️</div>
              <div class="flex-1">
                <h3 class="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                  Session Restoration Failed
                </h3>
                <p class="text-sm text-yellow-700 dark:text-yellow-300">
                  {sessionRestoreError()}
                </p>
                <p class="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                  You've been signed in anonymously. Please sign in again to restore your account.
                </p>
              </div>
              <button
                onClick={() => setSessionRestoreError(null)}
                class="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200"
              >
                ×
              </button>
            </div>
          </div>
        </Show>
        {props.children}
      </Show>
    </Show>
  );
};

const App: Component = () => {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <TooltipProvider>
          <EventStoreProvider>
            <EmojiProvider>
              <EmojiSetsProvider>
                <UserProvider>
                  <MiningProvider>
                    <QueueProvider>
                      <PublishingProvider>
                        <FollowsProvider>
                          <QueueProcessor />
                          <PublishingProcessor />
                          <AppInit>
                            <Router root={Layout}>
                              <Route path="/" component={Home} />
                              <Route path="/feed" component={Feed} />
                              <Route path="/about" component={About} />
                              <Route path="/relays" component={Relays} />
                              <Route path="/diagnostics" component={Diagnostics} />
                              <Route path="/stats" component={Stats} />
                              <Route path="/preferences" component={Preferences} />
                              <Route path="/n/:id" component={NoteDetail} />
                              <Route path="/e/:id" component={NoteDetail} />
                              <Route path="/p/:identifier" component={ProfileDetail} />
                            </Router>
                          </AppInit>
                        </FollowsProvider>
                      </PublishingProvider>
                    </QueueProvider>
                  </MiningProvider>
                </UserProvider>
              </EmojiSetsProvider>
            </EmojiProvider>
          </EventStoreProvider>
        </TooltipProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
};

export default App;
