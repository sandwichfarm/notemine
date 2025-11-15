import type { NostrEvent } from 'nostr-tools/core';
import { SimplePool } from 'nostr-tools/pool';
import { debug } from '../lib/debug';
import { DEFAULT_NIP66_LOOKBACK_SECONDS } from '../config/defaults';

const NIP66_RELAYS = ['wss://relay.nostr.watch'];

const normalizeRelayUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return null;
    }
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
};

export interface Nip66Relay {
  url: string;
  powLevel?: number;
}

export interface Nip66RelayDescriptor {
  url: string;
  normalizedUrl: string;
  tags: string[][];
  requiresAuth: boolean;
  requiresPayment: boolean;
  event: NostrEvent;
  lastSeen: number;
}

export interface Nip66RelayFeedOptions {
  relays?: string[];
  sinceSeconds?: number;
  onRelay?: (descriptor: Nip66RelayDescriptor, snapshot: Nip66RelayDescriptor[]) => void;
  onEose?: (snapshot: Nip66RelayDescriptor[]) => void;
  filter?: (descriptor: Nip66RelayDescriptor) => boolean;
}

export interface Nip66RelayFeed {
  snapshot: () => Nip66RelayDescriptor[];
  dispose: () => void;
}

export async function fetchNip66PowRelays(): Promise<string[]> {
  return new Promise((resolve) => {
    const pool = new SimplePool();
    const relays = new Set<string>();
    const since = Math.floor(Date.now() / 1000) - DEFAULT_NIP66_LOOKBACK_SECONDS; // Last 24 hours

    pool.subscribeMany(
      NIP66_RELAYS,
      {
        since,
        kinds: [30166],
        '#R': ['pow'],
      },
      {
        onevent(event) {
          try {
            // Find POW tag
            const powTag = event.tags.find((t) => t[0] === 'R' && t[1].includes('pow'));
            if (!powTag) return;

            // Check if it's actually a POW relay (R tag = "pow" with no threshold or threshold > 0)
            const isPow =
              (powTag[1] === 'pow' && !powTag?.[2]) ||
              (powTag[1] === 'pow' && Number(powTag?.[2]) > 0);
            if (!isPow) return;

            // Extract relay URL from 'd' tag
            const dTag = event.tags.find((t) => t[0] === 'd');
            if (!dTag?.[1]) return;

            const relayUrl = new URL(dTag[1]).toString();
            if (!relays.has(relayUrl)) {
              relays.add(relayUrl);
              debug('[NIP-66] Found POW relay:', relayUrl);
            }
          } catch (e) {
            // Silently ignore malformed events
          }
        },
        oneose() {
          const relayArray = Array.from(relays);
          debug(`[NIP-66] Discovered ${relayArray.length} POW relays`);
          resolve(relayArray);
        },
      }
    );
  });
}

const parseRelayDescriptor = (event: NostrEvent): Nip66RelayDescriptor | null => {
  const dTag = event.tags.find((tag) => tag[0] === 'd');
  if (!dTag?.[1]) return null;
  const normalizedUrl = normalizeRelayUrl(dTag[1]);
  if (!normalizedUrl) return null;

  const requirementTags = event.tags.filter((tag) => tag[0] === 'R');
  const requiresAuth = requirementTags.some((tag) => tag[1] === 'auth');
  const requiresPayment = requirementTags.some((tag) => tag[1] === 'payment');

  return {
    url: dTag[1],
    normalizedUrl,
    tags: event.tags || [],
    requiresAuth,
    requiresPayment,
    event,
    lastSeen: event.created_at || Math.floor(Date.now() / 1000),
  };
};

export const filterOpenRelays = (relays: Nip66RelayDescriptor[]): Nip66RelayDescriptor[] =>
  relays.filter((relay) => !relay.requiresAuth && !relay.requiresPayment);

export const createNip66RelayFeed = (
  options: Nip66RelayFeedOptions = {}
): Nip66RelayFeed => {
  const pool = new SimplePool();
  const relays = options.relays ?? NIP66_RELAYS;
  const sinceSeconds = options.sinceSeconds ?? DEFAULT_NIP66_LOOKBACK_SECONDS;
  const since = Math.floor(Date.now() / 1000) - sinceSeconds;
  const descriptors = new Map<string, Nip66RelayDescriptor>();

  const emitSnapshot = (descriptor?: Nip66RelayDescriptor) => {
    const snapshot = Array.from(descriptors.values());
    if (descriptor) {
      options.onRelay?.(descriptor, snapshot);
    } else {
      options.onEose?.(snapshot);
    }
  };

  const subscription = pool.subscribeMany(
    relays,
    {
      kinds: [30166],
      since,
    },
    {
      onevent(event) {
        const descriptor = parseRelayDescriptor(event);
        if (!descriptor) return;
        if (options.filter && !options.filter(descriptor)) return;
        descriptors.set(descriptor.normalizedUrl, descriptor);
        emitSnapshot(descriptor);
      },
      oneose() {
        emitSnapshot();
      },
    }
  );

  const dispose = () => {
    subscription.close();
    pool.close(relays);
  };

  return {
    snapshot: () => Array.from(descriptors.values()),
    dispose,
  };
};
