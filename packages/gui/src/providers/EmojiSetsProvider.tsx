import { createContext, useContext, ParentComponent, JSX, createSignal, Accessor } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { relayPool, eventStore } from '../lib/applesauce';
import { debug } from '../lib/debug';
import type { Emoji } from './EmojiProvider';

// EmojiSet data structure (NIP-51 kind 10030)
export interface EmojiSet {
  id: string; // Event id
  name: string; // Set name from 'd' tag or content
  author: string; // Pubkey of author
  emojis: Emoji[]; // Array of emojis in this set
  event: NostrEvent; // Original event
}

interface EmojiSetsContextType {
  // Reactive accessor for emoji sets
  sets: Accessor<EmojiSet[]>;

  // Load emoji sets for a specific user
  loadForUser: (pubkey: string, relays?: string[]) => Promise<void>;

  // Loading state
  isLoading: Accessor<boolean>;

  // Error state
  error: Accessor<string | null>;
}

const EmojiSetsContext = createContext<EmojiSetsContextType>();

export const EmojiSetsProvider: ParentComponent = (props): JSX.Element => {
  const [sets, setSets] = createSignal<EmojiSet[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  /**
   * Normalize a kind 10030 event to an EmojiSet
   */
  const normalizeEvent = (event: NostrEvent): EmojiSet | null => {
    try {
      // Get set name from 'd' tag or content
      const dTag = event.tags.find(tag => tag[0] === 'd');
      const name = dTag?.[1] || event.content || 'Unnamed Set';

      // Extract emoji tags
      // Format: ['emoji', '<shortcode>', '<url>']
      const emojis: Emoji[] = [];

      event.tags.forEach(tag => {
        if (tag[0] === 'emoji' && tag[1] && tag[2]) {
          const shortcode = tag[1];
          const url = tag[2];

          // Validate URL (only http/https)
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return;
          }

          emojis.push({
            shortcode,
            url,
            alt: shortcode,
          });
        }
      });

      // Only return if we have emojis
      if (emojis.length === 0) {
        return null;
      }

      return {
        id: event.id,
        name,
        author: event.pubkey,
        emojis,
        event,
      };
    } catch (err) {
      console.error('[EmojiSets] Failed to normalize event:', err);
      return null;
    }
  };

  /**
   * Load emoji sets for a user from relays
   * @param pubkey - User's public key
   * @param relays - Optional relay list (defaults to user's relays)
   */
  const loadForUser = async (pubkey: string, relays?: string[]): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      // Determine which relays to use
      let targetRelays = relays;

      if (!targetRelays || targetRelays.length === 0) {
        // Try to get user's inbox/outbox relays
        const { getUserInboxRelays, getUserOutboxRelays } = await import('../lib/applesauce');

        const inboxRelays = await getUserInboxRelays(pubkey);
        const outboxRelays = await getUserOutboxRelays(pubkey);

        // Combine and deduplicate
        const userRelays = [...new Set([...inboxRelays, ...outboxRelays])];

        if (userRelays.length > 0) {
          targetRelays = userRelays;
        } else {
          // Fallback to active relays
          const { getActiveRelays } = await import('../lib/applesauce');
          targetRelays = getActiveRelays();
        }
      }

      debug('[EmojiSets] Fetching kind 10030 from relays:', targetRelays);

      const filter = {
        kinds: [10030],
        authors: [pubkey],
      };

      const loadedSets: EmojiSet[] = [];

      // Create subscription
      const subscription = relayPool.req(targetRelays, filter).subscribe({
        next: (response) => {
          if (response !== 'EOSE') {
            // Store in eventStore for caching
            eventStore.add(response);

            // Normalize to EmojiSet
            const emojiSet = normalizeEvent(response);
            if (emojiSet) {
              loadedSets.push(emojiSet);
              debug('[EmojiSets] Loaded set:', emojiSet.name, `(${emojiSet.emojis.length} emojis)`);
            }
          }
        },
        error: (err) => {
          console.error('[EmojiSets] Subscription error:', err);
          setError(err.message || 'Failed to load emoji sets');
          setIsLoading(false);
        },
        complete: () => {
          debug(`[EmojiSets] Loaded ${loadedSets.length} sets with ${loadedSets.reduce((sum, s) => sum + s.emojis.length, 0)} total emojis`);
          setSets(loadedSets);
          setIsLoading(false);
        },
      });

      // Cleanup after timeout
      setTimeout(() => {
        subscription.unsubscribe();

        // Set results even if complete was never called
        // This handles relays that don't fire complete properly
        if (isLoading()) {
          debug(`[EmojiSets] Timeout: Loaded ${loadedSets.length} sets with ${loadedSets.reduce((sum, s) => sum + s.emojis.length, 0)} total emojis`);
          setSets(loadedSets);
          setIsLoading(false);
        }
      }, 5000);
    } catch (err: any) {
      console.error('[EmojiSets] Failed to load emoji sets:', err);
      setError(err.message || 'Failed to load emoji sets');
      setIsLoading(false);
    }
  };

  return (
    <EmojiSetsContext.Provider
      value={{
        sets,
        loadForUser,
        isLoading,
        error,
      }}
    >
      {props.children}
    </EmojiSetsContext.Provider>
  );
};

export const useEmojiSets = () => {
  const context = useContext(EmojiSetsContext);
  if (!context) {
    throw new Error('useEmojiSets must be used within EmojiSetsProvider');
  }
  return context;
};
