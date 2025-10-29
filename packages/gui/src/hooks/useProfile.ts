import { createSignal, onCleanup, createEffect } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { eventStore, relayPool, PROFILE_RELAYS } from '../lib/applesauce';
import { Subscription } from 'rxjs';
import { debug } from '../lib/debug';

export interface ProfileMetadata {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
  bot?: boolean;
}

export interface Profile {
  pubkey: string;
  metadata: ProfileMetadata | null;
  loading: boolean;
  event?: NostrEvent;
}

/**
 * Hook to fetch and subscribe to profile metadata (kind 0) for a pubkey
 * Uses inbox/outbox relays if available, falls back to active relays
 */
export function useProfile(pubkeyInput: string | (() => string | undefined) | undefined): () => Profile {
  const [profile, setProfile] = createSignal<Profile>({
    pubkey: '',
    metadata: null,
    loading: true,
  });

  let subscription: Subscription | null = null;
  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    subscription?.unsubscribe();
    subscription = null;
    if (fetchTimeout) {
      clearTimeout(fetchTimeout);
      fetchTimeout = null;
    }
  };

  createEffect(() => {
    const resolvedPubkey =
      typeof pubkeyInput === 'function' ? pubkeyInput() : pubkeyInput;

    cleanup();

    if (!resolvedPubkey || resolvedPubkey.length === 0) {
      setProfile({ pubkey: '', metadata: null, loading: false });
      return;
    }

    setProfile({ pubkey: resolvedPubkey, metadata: null, loading: true });

    subscription = eventStore.replaceable(0, resolvedPubkey).subscribe({
      next: (event) => {
        if (event) {
          try {
            const metadata: ProfileMetadata = JSON.parse(event.content);
            setProfile({
              pubkey: resolvedPubkey,
              metadata,
              loading: false,
              event,
            });
            debug(`[useProfile] Got metadata for ${resolvedPubkey.slice(0, 8)} from store`);
          } catch (error) {
            console.error('[useProfile] Failed to parse metadata:', error);
            setProfile({ pubkey: resolvedPubkey, metadata: null, loading: false });
          }
        }
      },
    });

    fetchTimeout = setTimeout(async () => {
      if (profile().metadata) return;

      debug(`[useProfile] Fetching metadata for ${resolvedPubkey.slice(0, 8)} from profile relays`);

      const relays = PROFILE_RELAYS;
      const filter = {
        kinds: [0],
        authors: [resolvedPubkey],
        limit: 1,
      };

      const relay$ = relayPool.req(relays, filter);
      relay$.subscribe({
        next: (response) => {
          if (response !== 'EOSE' && response.kind === 0) {
            const event = response as NostrEvent;
            try {
              const metadata: ProfileMetadata = JSON.parse(event.content);
              setProfile({
                pubkey: resolvedPubkey,
                metadata,
                loading: false,
                event,
              });
              eventStore.add(event);
              debug(`[useProfile] Got metadata for ${resolvedPubkey.slice(0, 8)} from relays`);
            } catch (error) {
              console.error('[useProfile] Failed to parse metadata:', error);
            }
          }
        },
        complete: () => {
          if (!profile().metadata) {
            setProfile({ pubkey: resolvedPubkey, metadata: null, loading: false });
          }
        },
      });
    }, 200);
  });

  onCleanup(cleanup);

  return profile;
}
