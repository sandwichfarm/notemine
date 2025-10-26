import { Component, onMount } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { EventStoreProvider } from './providers/EventStoreProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { UserProvider } from './providers/UserProvider';
import { useUser } from './providers/UserProvider';
import Layout from './components/Layout';
import Home from './pages/Home';
import Feed from './pages/Feed';
import Profile from './pages/Profile';
import Stats from './pages/Stats';
import { fetchNip66PowRelays } from './lib/nip66';
import { setPowRelays, connectToRelays, getActiveRelays } from './lib/applesauce';

// App initialization component
const AppInit: Component = (props: any) => {
  const { authAnon } = useUser();

  onMount(async () => {
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
              <Route path="/feed" component={Feed} />
              <Route path="/profile" component={Profile} />
              <Route path="/stats" component={Stats} />
            </Router>
          </AppInit>
        </UserProvider>
      </EventStoreProvider>
    </ThemeProvider>
  );
};

export default App;
