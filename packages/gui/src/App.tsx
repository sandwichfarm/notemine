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
import { useUser } from './providers/UserProvider';
import Layout from './components/Layout';
import Home from './pages/Home';
import Feed from './pages/Feed';
import About from './pages/About';
import Stats from './pages/Stats';
import Relays from './pages/Relays';
import NoteDetail from './pages/NoteDetail';
import ProfileDetail from './pages/ProfileDetail';
import { Preferences } from './pages/Preferences';
import { fetchNip66PowRelays } from './lib/nip66';
import { setPowRelays, connectToRelays, getActiveRelays } from './lib/applesauce';
// import { initializeCache, loadCachedEvents, setupCachePersistence } from './lib/cache';
import { debug } from './lib/debug';

// App initialization component
const AppInit: ParentComponent = (props) => {
  const { user, authAnon, loadPersistedAnonKey, restoreNostrConnectSession, fetchUserData } = useUser();
  const [relaysReady, setRelaysReady] = createSignal(false);

  onMount(async () => {
    // FIXME: Cache disabled due to WASM threading conflict with COOP/COEP headers
    // Turso WASM with threading requires COOP/COEP headers, but those break WebSocket relay connections
    // Need to either: use non-threaded Turso, use different cache, or solve COOP/COEP + WebSocket issue

    // Initialize local cache
    // try {
    //   await initializeCache();
    //   debug('[App] Cache initialized');

    //   // Load cached events into event store
    //   const cachedCount = await loadCachedEvents(eventStore);
    //   debug(`[App] Loaded ${cachedCount} events from cache`);

    //   // Set up automatic cache persistence
    //   setupCachePersistence(eventStore);
    // } catch (error) {
    //   console.error('[App] Cache initialization failed:', error);
    //   // Continue without cache
    // }
    debug('[App] Cache disabled - WASM threading conflict with relay WebSockets');

    // Fetch NIP-66 POW relays BEFORE mounting children
    try {
      const relays = await fetchNip66PowRelays();
      setPowRelays(relays);

      // Connect to relays
      const activeRelays = getActiveRelays();
      connectToRelays(activeRelays);
      debug('[App] Connected to relays:', activeRelays);
    } catch (error) {
      console.error('[App] Failed to fetch NIP-66 relays:', error);
    }

    // Try to restore NostrConnect session first
    const { hasPersistedNostrConnectSession } = await import('./lib/nostrconnect-storage');
    if (hasPersistedNostrConnectSession()) {
      debug('[App] Restoring NostrConnect session');
      await restoreNostrConnectSession();
    } else {
      // Initialize with anonymous user - check for persisted key first
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

  return (
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
      {props.children}
    </Show>
  );
};

const App: Component = () => {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <TooltipProvider>
          <EventStoreProvider>
            <UserProvider>
              <MiningProvider>
                <QueueProvider>
                  <QueueProcessor />
                  <AppInit>
                    <Router root={Layout}>
                      <Route path="/" component={Home} />
                      <Route path="/feed" component={Feed} />
                      <Route path="/about" component={About} />
                      <Route path="/relays" component={Relays} />
                      <Route path="/stats" component={Stats} />
                      <Route path="/preferences" component={Preferences} />
                      <Route path="/n/:id" component={NoteDetail} />
                      <Route path="/e/:id" component={NoteDetail} />
                      <Route path="/p/:identifier" component={ProfileDetail} />
                    </Router>
                  </AppInit>
                </QueueProvider>
              </MiningProvider>
            </UserProvider>
          </EventStoreProvider>
        </TooltipProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
};

export default App;
