import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface RelayPoolState {
  relays: string[];
  connected: number;
  connecting: number;
  failed: number;
  exclusiveMode: boolean;
}

// Load persisted state from localStorage
const loadPersistedState = (): RelayPoolState => {
  if (browser) {
    try {
      const savedRelays = localStorage.getItem('relay-pool-relays');
      const savedExclusiveMode = localStorage.getItem('relay-pool-exclusive-mode');
      
      return {
        relays: savedRelays ? JSON.parse(savedRelays) : [],
        connected: 0,
        connecting: 0,
        failed: 0,
        exclusiveMode: savedExclusiveMode === 'true'
      };
    } catch (error) {
      console.error('Failed to load relay pool state:', error);
    }
  }
  
  return {
    relays: [],
    connected: 0,
    connecting: 0,
    failed: 0,
    exclusiveMode: false
  };
};

const initialState: RelayPoolState = loadPersistedState();

function createRelayPoolStore() {
  const { subscribe, set, update } = writable<RelayPoolState>(initialState);

  // Helper to persist state
  const persistState = (state: RelayPoolState) => {
    if (browser) {
      try {
        localStorage.setItem('relay-pool-relays', JSON.stringify(state.relays));
        localStorage.setItem('relay-pool-exclusive-mode', String(state.exclusiveMode));
      } catch (error) {
        console.error('Failed to persist relay pool state:', error);
      }
    }
  };

  return {
    subscribe,
    setRelays: (relays: string[]) => update(state => {
      const newState = { ...state, relays };
      persistState(newState);
      return newState;
    }),
    addRelay: (relay: string) => update(state => {
      const newState = {
        ...state,
        relays: state.relays.includes(relay) ? state.relays : [...state.relays, relay]
      };
      persistState(newState);
      return newState;
    }),
    removeRelay: (relay: string) => update(state => {
      const newState = {
        ...state,
        relays: state.relays.filter(r => r !== relay)
      };
      persistState(newState);
      return newState;
    }),
    updateStatus: (connected: number, connecting: number, failed: number) => 
      update(state => ({ ...state, connected, connecting, failed })),
    setExclusiveMode: (exclusive: boolean) => update(state => {
      const newState = { ...state, exclusiveMode: exclusive };
      persistState(newState);
      return newState;
    }),
    clear: () => {
      const clearedState = {
        relays: [],
        connected: 0,
        connecting: 0,
        failed: 0,
        exclusiveMode: false
      };
      persistState(clearedState);
      set(clearedState);
    }
  };
}

export const relayPool = createRelayPoolStore();