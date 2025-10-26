import { createSignal, onMount, onCleanup } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { eventStore, relayPool, PROFILE_RELAYS } from '../lib/applesauce';
import { Subscription } from 'rxjs';

export interface ProfileMetadata {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
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
export function useProfile(pubkey: string | undefined): () => Profile {
  const [profile, setProfile] = createSignal<Profile>({
    pubkey: pubkey || '',
    metadata: null,
    loading: true,
  });

  let subscription: Subscription | null = null;
  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    if (!pubkey || typeof pubkey !== 'string' || pubkey.length === 0) {
      setProfile({ pubkey: '', metadata: null, loading: false });
      return;
    }

    // First, check if metadata is already in the event store
    subscription = eventStore.replaceable(0, pubkey).subscribe({
      next: (event) => {
        if (event) {
          try {
            const metadata: ProfileMetadata = JSON.parse(event.content);
            setProfile({
              pubkey,
              metadata,
              loading: false,
              event,
            });
            console.log(`[useProfile] Got metadata for ${typeof pubkey === 'string' ? pubkey.slice(0, 8) : 'unknown'} from store`);
          } catch (error) {
            console.error('[useProfile] Failed to parse metadata:', error);
            setProfile({ pubkey, metadata: null, loading: false });
          }
        }
      },
    });

    // If not found in store after 200ms, fetch from relays
    fetchTimeout = setTimeout(async () => {
      // Check if we already got data from store
      if (profile().metadata) return;

      console.log(`[useProfile] Fetching metadata for ${typeof pubkey === 'string' ? pubkey.slice(0, 8) : 'unknown'} from profile relays`);

      // Always use well-known profile relays for kind 0 (profiles)
      const relays = PROFILE_RELAYS;

      // Fetch from relays
      const filter = {
        kinds: [0],
        authors: [pubkey],
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
                pubkey,
                metadata,
                loading: false,
                event,
              });
              // Add to event store for caching
              eventStore.add(event);
              console.log(`[useProfile] Got metadata for ${typeof pubkey === 'string' ? pubkey.slice(0, 8) : 'unknown'} from relays`);
            } catch (error) {
              console.error('[useProfile] Failed to parse metadata:', error);
            }
          }
        },
        complete: () => {
          // If still no metadata after complete, stop loading
          if (!profile().metadata) {
            setProfile({ pubkey, metadata: null, loading: false });
          }
        },
      });
    }, 200);
  });

  onCleanup(() => {
    subscription?.unsubscribe();
    if (fetchTimeout) clearTimeout(fetchTimeout);
  });

  return profile;
}
