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
import type { TimelineLoaderOptions } from 'applesauce-loaders/loaders/timeline-loader';

// Create singleton EventStore
export const eventStore = new EventStore();

// Create singleton RelayPool
export const relayPool = new RelayPool();

// Default POW relay - switches based on environment
export const DEFAULT_POW_RELAY = import.meta.env.DEV
  ? 'ws://localhost:3334'
  : 'wss://notemine.io';

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

type TimelineFilters = Parameters<typeof createTimelineLoader>[2];

export function createTimelineStream(
  relays: string[],
  filters: TimelineFilters,
  options: TimelineLoaderOptions & { since?: number } = {},
) {
  const { since, ...loaderOptions } = options;
  const loader = createTimelineLoader(relayPool, relays, filters, {
    eventStore,
    ...loaderOptions,
  });

  return loader(since);
}

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
  for (const relay of relayPool.relays.values()) {
    relayPool.remove(relay);
  }
}

// NIP-65: Get user's outbox relays (where they write)
export async function getUserOutboxRelays(pubkey: string): Promise<string[]> {
  return new Promise((resolve) => {
    const subscription = eventStore.mailboxes(pubkey).subscribe({
      next: (mailboxes) => {
        if (mailboxes?.outboxes && mailboxes.outboxes.length > 0) {
          console.log('[NIP-65] Found outbox relays:', mailboxes.outboxes);
          resolve(mailboxes.outboxes);
          subscription.unsubscribe();
        }
      },
      complete: () => {
        subscription.unsubscribe();
      },
    });

    // Timeout after 2 seconds, fallback to default relays
    setTimeout(() => {
      subscription.unsubscribe();
      console.log('[NIP-65] No outbox relays found, using defaults');
      resolve(getActiveRelays());
    }, 2000);
  });
}

// NIP-65: Get user's inbox relays (where they read)
export async function getUserInboxRelays(pubkey: string): Promise<string[]> {
  return new Promise((resolve) => {
    const subscription = eventStore.mailboxes(pubkey).subscribe({
      next: (mailboxes) => {
        if (mailboxes?.inboxes && mailboxes.inboxes.length > 0) {
          console.log('[NIP-65] Found inbox relays:', mailboxes.inboxes);
          resolve(mailboxes.inboxes);
          subscription.unsubscribe();
        }
      },
      complete: () => {
        subscription.unsubscribe();
      },
    });

    // Timeout after 2 seconds, fallback to default relays
    setTimeout(() => {
      subscription.unsubscribe();
      console.log('[NIP-65] No inbox relays found, using defaults');
      resolve(getActiveRelays());
    }, 2000);
  });
}
