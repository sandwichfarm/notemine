import { Component, ParentComponent, onMount } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { EventStoreProvider } from './providers/EventStoreProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { UserProvider } from './providers/UserProvider';
import { useUser } from './providers/UserProvider';
import Layout from './components/Layout';
import Home from './pages/Home';
import About from './pages/About';
import Stats from './pages/Stats';
import { fetchNip66PowRelays } from './lib/nip66';
import { setPowRelays, connectToRelays, getActiveRelays } from './lib/applesauce';
// import { initializeCache, loadCachedEvents, setupCachePersistence } from './lib/cache';

// App initialization component
const AppInit: ParentComponent = (props) => {
  const { authAnon } = useUser();

  onMount(async () => {
    // Initialize local cache (temporarily disabled for debugging)
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

    // Fetch NIP-66 POW relays
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
  });

  return props.children;
};

const App: Component = () => {
  return (
    <ThemeProvider>
      <EventStoreProvider>
        <UserProvider>
          <AppInit>
            <Router root={Layout}>
              <Route path="/" component={Home} />
              <Route path="/about" component={About} />
              <Route path="/stats" component={Stats} />
            </Router>
          </AppInit>
        </UserProvider>
      </EventStoreProvider>
    </ThemeProvider>
  );
};

export default App;
