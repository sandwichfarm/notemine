import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools/core';
import { relayPool, PROFILE_RELAYS } from './applesauce';

export interface FollowPack {
  id: string;
  title: string;
  description?: string;
  image?: string;
  pubkeys: string[];
  rawEvent: NostrEvent;
  relays: string[];
  source: string;
}

const FOLLOW_PACK_CONFIG_URL = '/onboarding-follow-packs.json';

export const fetchFollowPackConfig = async (): Promise<string[]> => {
  try {
    const response = await fetch(FOLLOW_PACK_CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load follow pack config (${response.status})`);
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
  } catch (error) {
    console.error('[Onboarding] Failed to fetch follow pack config', error);
    return [];
  }
};

const parseFollowPackEvent = (event: NostrEvent, relays: string[], source: string): FollowPack => {
  const title = event.tags.find((tag) => tag[0] === 'title')?.[1] ?? 'Follow Pack';
  const description = event.tags.find((tag) => tag[0] === 'description')?.[1];
  const image = event.tags.find((tag) => tag[0] === 'image')?.[1];
  const pubkeys = event.tags.filter((tag) => tag[0] === 'p' && tag[1]).map((tag) => tag[1]);

  return {
    id: event.id,
    title,
    description,
    image,
    pubkeys,
    rawEvent: event,
    relays,
    source,
  };
};

export const resolveFollowPack = (naddr: string): Promise<FollowPack | null> => {
  return new Promise((resolve) => {
    try {
      const decoded = nip19.decode(naddr);
      if (decoded.type !== 'naddr') {
        resolve(null);
        return;
      }

      const { pubkey, kind, identifier, relays } = decoded.data;
      const targetRelays = relays?.length ? relays : PROFILE_RELAYS;
      const filter = {
        authors: [pubkey],
        kinds: [kind],
        '#d': [identifier],
        limit: 1,
      };

      const relay$ = relayPool.req(targetRelays, filter);
      let settled = false;
      let subscription: { unsubscribe: () => void } | null = null;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          subscription?.unsubscribe();
          resolve(null);
        }
      }, 5000);

      subscription = relay$.subscribe({
        next: (response) => {
          if (response === 'EOSE' || !response || typeof response === 'string') {
            return;
          }
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          subscription?.unsubscribe();
          const pack = parseFollowPackEvent(response as NostrEvent, targetRelays, naddr);
          resolve(pack);
        },
        error: (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          console.error('[FollowPacks] Relay error resolving', naddr, error);
          subscription?.unsubscribe();
          resolve(null);
        },
        complete: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          subscription?.unsubscribe();
          resolve(null);
        },
      });
    } catch (error) {
      console.error('[FollowPacks] Failed to resolve', naddr, error);
      resolve(null);
    }
  });
};

export const resolveFollowPacks = async (naddrs: string[]): Promise<FollowPack[]> => {
  const results = await Promise.all(
    naddrs.map((entry) =>
      resolveFollowPack(entry).then((pack) => ({ pack, entry }))
    )
  );

  return results
    .filter((result): result is { pack: FollowPack; entry: string } => !!result.pack)
    .map((result) => result.pack);
};
