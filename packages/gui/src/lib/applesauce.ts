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

// Well-known profile relays for kind 0 (profiles) and kind 10002 (relay lists)
// These are always used for fetching profile metadata
export const PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://user.kindpag.es',
  'wss://profiles.nostr1.com',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
];

import { createSignal } from 'solid-js';
import { debug } from '../lib/debug';

// NIP-66 POW relays (from svelte demo)
const [powRelays, setPowRelaysSignal] = createSignal<string[]>([]);

// Export getter for reactive access
export const getPowRelays = powRelays;

// Set POW relays from NIP-66 discovery
export function setPowRelays(relays: string[]) {
  setPowRelaysSignal(relays);
  // Connect to newly discovered relays immediately
  connectToRelays(relays);
}

// NIP-65 User relays (inbox/outbox)
const [userInboxRelays, setUserInboxRelaysSignal] = createSignal<string[]>([]);
const [userOutboxRelays, setUserOutboxRelaysSignal] = createSignal<string[]>([]);

// Export getters for reactive access
export const getUserInboxRelaysSignal = userInboxRelays;
export const getUserOutboxRelaysSignal = userOutboxRelays;

// Set user relays from NIP-65
export function setUserRelays(inbox: string[], outbox: string[]) {
  debug('[NIP-65] Setting user relays - inbox:', inbox, 'outbox:', outbox);
  setUserInboxRelaysSignal(inbox);
  setUserOutboxRelaysSignal(outbox);
  // Connect to user's relays immediately
  const allUserRelays = [...new Set([...inbox, ...outbox])];
  connectToRelays(allUserRelays);
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

// Helper to get active relay list (reactive - will update when powRelays changes)
export function getActiveRelays(userRelays: string[] = []): string[] {
  const relays = new Set<string>();

  // Always include default POW relay
  relays.add(DEFAULT_POW_RELAY);

  // Add NIP-66 discovered POW relays (reactive)
  powRelays().forEach(r => relays.add(r));

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
    let subscription: any = null;
    subscription = eventStore.mailboxes(pubkey).subscribe({
      next: (mailboxes) => {
        if (mailboxes?.outboxes && mailboxes.outboxes.length > 0) {
          debug('[NIP-65] Found outbox relays:', mailboxes.outboxes);
          setUserOutboxRelaysSignal(mailboxes.outboxes);
          resolve(mailboxes.outboxes);
          subscription?.unsubscribe();
        }
      },
      complete: () => {
        subscription?.unsubscribe();
      },
    });

    // If not found in store, fetch kind 10002 from profile relays
    const fetchTimeout = setTimeout(() => {
      const filter = { kinds: [10002], authors: [pubkey], limit: 1 };
      const relay$ = relayPool.req(PROFILE_RELAYS, filter);

      let found = false;
      relay$.subscribe({
        next: (response) => {
          if (response !== 'EOSE' && response.kind === 10002 && !found) {
            found = true;
            eventStore.add(response);
            debug('[NIP-65] Fetched kind 10002 from profile relays');
          }
        },
      });
    }, 500);

    // Timeout after 3 seconds total, fallback to default relays
    setTimeout(() => {
      clearTimeout(fetchTimeout);
      subscription?.unsubscribe();
      debug('[NIP-65] No outbox relays found, using defaults');
      resolve(getActiveRelays());
    }, 3000);
  });
}

// NIP-65: Get user's inbox relays (where they read)
export async function getUserInboxRelays(pubkey: string): Promise<string[]> {
  return new Promise((resolve) => {
    let subscription: any = null;
    subscription = eventStore.mailboxes(pubkey).subscribe({
      next: (mailboxes) => {
        if (mailboxes?.inboxes && mailboxes.inboxes.length > 0) {
          debug('[NIP-65] Found inbox relays:', mailboxes.inboxes);
          setUserInboxRelaysSignal(mailboxes.inboxes);
          resolve(mailboxes.inboxes);
          subscription?.unsubscribe();
        }
      },
      complete: () => {
        subscription?.unsubscribe();
      },
    });

    // If not found in store, fetch kind 10002 from profile relays
    const fetchTimeout = setTimeout(() => {
      const filter = { kinds: [10002], authors: [pubkey], limit: 1 };
      const relay$ = relayPool.req(PROFILE_RELAYS, filter);

      let found = false;
      relay$.subscribe({
        next: (response) => {
          if (response !== 'EOSE' && response.kind === 10002 && !found) {
            found = true;
            eventStore.add(response);
            debug('[NIP-65] Fetched kind 10002 from profile relays');
          }
        },
      });
    }, 500);

    // Timeout after 3 seconds total, fallback to default relays
    setTimeout(() => {
      clearTimeout(fetchTimeout);
      subscription?.unsubscribe();
      debug('[NIP-65] No inbox relays found, using defaults');
      resolve(getActiveRelays());
    }, 3000);
  });
}

// Check if localhost relay is available
export function isLocalhostRelayAvailable(): boolean {
  const localhostRelay = relayPool.relays.get('ws://localhost:3334') as
    | { status?: number; socket?: { readyState?: number } }
    | undefined;
  if (!localhostRelay) return false;

  // Check if the relay is actually connected
  const readyState =
    typeof localhostRelay.status === 'number'
      ? localhostRelay.status
      : localhostRelay.socket?.readyState;
  return readyState === 1; // 1 = OPEN in WebSocket
}

// Get relays for publishing - prefers localhost in dev mode if available
export function getPublishRelays(userRelays: string[] = []): string[] {
  // In dev mode, if localhost relay is available, only publish there
  if (import.meta.env.DEV && isLocalhostRelayAvailable()) {
    debug('[Publish] Using localhost relay only (dev mode)');
    return ['ws://localhost:3334'];
  }

  // Otherwise, use all active relays
  return getActiveRelays(userRelays);
}

// Batch fetch metadata (kind 0) for multiple pubkeys
export function batchFetchMetadata(pubkeys: string[]): void {
  if (pubkeys.length === 0) return;

  // Always use profile relays for kind 0, ignoring the relays parameter
  const targetRelays = PROFILE_RELAYS;
  debug(`[Metadata] Batch fetching kind 0 for ${pubkeys.length} pubkeys from profile relays`);

  const filter = {
    kinds: [0],
    authors: pubkeys,
  };

  const relay$ = relayPool.req(targetRelays, filter);
  relay$.subscribe({
    next: (response) => {
      if (response !== 'EOSE' && response.kind === 0) {
        // Add to event store for caching
        eventStore.add(response);
      }
    },
    complete: () => {
      debug('[Metadata] Batch fetch complete');
    },
  });
}

// Get user's follows from kind 3 event
export async function getUserFollows(pubkey: string): Promise<string[]> {
  return new Promise((resolve) => {
    let subscription: any = null;
    subscription = eventStore.replaceable(3, pubkey).subscribe({
      next: (event) => {
        if (event) {
          // Extract pubkeys from 'p' tags
          const follows = event.tags
            .filter(tag => tag[0] === 'p' && tag[1])
            .map(tag => tag[1]);
          debug('[WoT] Found', follows.length, 'follows for', pubkey.slice(0, 8));
          subscription?.unsubscribe();
          resolve(follows);
        }
      },
      complete: () => {
        subscription?.unsubscribe();
      },
    });

    // Timeout after 2 seconds, return empty array if no kind 3 event found
    setTimeout(() => {
      subscription?.unsubscribe();
      debug('[WoT] No follows found for', pubkey.slice(0, 8), 'using empty array');
      resolve([]);
    }, 2000);
  });
}
