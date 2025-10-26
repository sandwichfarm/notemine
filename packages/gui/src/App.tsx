import { Component, ParentComponent, onMount, createSignal, Show } from 'solid-js';
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
import About from './pages/About';
import Stats from './pages/Stats';
import NoteDetail from './pages/NoteDetail';
import ProfileDetail from './pages/ProfileDetail';
import { Preferences } from './pages/Preferences';
import { fetchNip66PowRelays } from './lib/nip66';
import { setPowRelays, connectToRelays, getActiveRelays, eventStore } from './lib/applesauce';
import { initializeCache, loadCachedEvents, setupCachePersistence } from './lib/cache';

// App initialization component
const AppInit: ParentComponent = (props) => {
  const { authAnon } = useUser();
  const [relaysReady, setRelaysReady] = createSignal(false);

  onMount(async () => {
    // FIXME: Cache disabled due to WASM threading conflict with COOP/COEP headers
    // Turso WASM with threading requires COOP/COEP headers, but those break WebSocket relay connections
    // Need to either: use non-threaded Turso, use different cache, or solve COOP/COEP + WebSocket issue

    // Initialize local cache
    // try {
    //   await initializeCache();
    //   console.log('[App] Cache initialized');

    //   // Load cached events into event store
    //   const cachedCount = await loadCachedEvents(eventStore);
    //   console.log(`[App] Loaded ${cachedCount} events from cache`);

    //   // Set up automatic cache persistence
    //   setupCachePersistence(eventStore);
    // } catch (error) {
    //   console.error('[App] Cache initialization failed:', error);
    //   // Continue without cache
    // }
    console.log('[App] Cache disabled - WASM threading conflict with relay WebSockets');

    // Fetch NIP-66 POW relays BEFORE mounting children
    try {
      const relays = await fetchNip66PowRelays();
      setPowRelays(relays);

      // Connect to relays
      const activeRelays = getActiveRelays();
      connectToRelays(activeRelays);
      console.log('[App] Connected to relays:', activeRelays);
    } catch (error) {
      console.error('[App] Failed to fetch NIP-66 relays:', error);
    }

    // Initialize with anonymous user
    authAnon();

    // Signal that relays are ready and children can mount
    setRelaysReady(true);
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
                      <Route path="/about" component={About} />
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
