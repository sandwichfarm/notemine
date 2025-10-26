/**
 * Applesauce infrastructure setup
 * Central EventStore, RelayPool, and Loaders for the entire app
 */

import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import {
  createAddressLoader,
  createEventLoader,
  createTimelineLoader,
  createReactionsLoader,
} from 'applesauce-loaders/loaders';

// Create singleton EventStore
export const eventStore = new EventStore({
  keepOldVersions: false,
  keepExpired: false,
});

// Create singleton RelayPool
export const relayPool = new RelayPool();

// Default POW relay - will be replaced with actual notemine relay
export const DEFAULT_POW_RELAY = 'wss://relay.notemine.io';

// NIP-66 POW relays (from svelte demo)
export let powRelays: string[] = [];

// Set POW relays from NIP-66 discovery
export function setPowRelays(relays: string[]) {
  powRelays = relays;
}

// Create loaders with EventStore integration
export const addressLoader = createAddressLoader(relayPool, {
  eventStore,
  bufferTime: 500,
  bufferSize: 100,
});

export const eventLoader = createEventLoader(relayPool, {
  eventStore,
  bufferTime: 500,
  bufferSize: 100,
});

export const timelineLoader = createTimelineLoader(relayPool, {
  eventStore,
  bufferTime: 500,
  bufferSize: 100,
});

export const reactionsLoader = createReactionsLoader(relayPool, {
  eventStore,
  bufferTime: 500,
  bufferSize: 100,
});

// Helper to get active relay list
export function getActiveRelays(userRelays: string[] = []): string[] {
  const relays = new Set<string>();

  // Always include default POW relay
  relays.add(DEFAULT_POW_RELAY);

  // Add NIP-66 discovered POW relays
  powRelays.forEach(r => relays.add(r));

  // Add user relays if logged in
  userRelays.forEach(r => relays.add(r));

  return Array.from(relays);
}

// Connect to relays
export function connectToRelays(relays: string[]) {
  relays.forEach(url => {
    relayPool.relay(url);
  });
}

// Disconnect from relays
export function disconnectFromRelays() {
  relayPool.close();
}
