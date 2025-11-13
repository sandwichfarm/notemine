import { createContext, useContext, ParentComponent, JSX, createSignal, Accessor } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';

// Emoji data structure
export interface Emoji {
  shortcode: string;
  url: string;
  m?: string; // MIME type
  w?: number; // width
  h?: number; // height
  alt?: string; // alt text
}

// Default emoji pack (commonly used emojis)
const DEFAULT_EMOJIS: Emoji[] = [
  { shortcode: 'bitcoin', url: 'https://i.nostr.build/bitcoin.png', alt: 'Bitcoin' },
  { shortcode: 'lightning', url: 'https://i.nostr.build/lightning.png', alt: 'Lightning' },
  { shortcode: 'zap', url: 'https://i.nostr.build/zap.png', alt: 'Zap' },
  { shortcode: 'nostr', url: 'https://i.nostr.build/nostr.png', alt: 'Nostr' },
  { shortcode: 'notemine', url: 'https://notemine.io/favicon.png', alt: 'Notemine' },
];

// Emoji registry with source tracking (for global entries only)
interface RegistryEntry extends Emoji {
  source: 'user' | 'default';
}

interface EmojiContextType {
  // Resolve a shortcode to an Emoji with optional event context
  resolve: (shortcode: string, options?: { eventId?: string }) => Emoji | null;

  // Get all emojis with their resolved URLs
  withEmojis: () => Map<string, Emoji>;

  // Register an event's emoji tags for scoped resolution
  registerEvent: (eventId: string, event: NostrEvent) => void;

  // Unregister an event's emojis (cleanup on unmount)
  unregisterEvent: (eventId: string) => void;

  // Merge user emoji sets into the global registry
  mergeUserEmojis: (emojis: Emoji[]) => void;

  // Get the current global registry accessor
  registry: Accessor<Map<string, RegistryEntry>>;
}

const EmojiContext = createContext<EmojiContextType>();

export const EmojiProvider: ParentComponent = (props): JSX.Element => {
  // Global registry for defaults and user emojis
  const initialRegistry = new Map<string, RegistryEntry>();
  DEFAULT_EMOJIS.forEach(emoji => {
    initialRegistry.set(emoji.shortcode, { ...emoji, source: 'default' });
  });
  const [registry, setRegistry] = createSignal<Map<string, RegistryEntry>>(initialRegistry);

  // Per-event emoji maps: eventId -> Map<shortcode, Emoji>
  const [perEventEmojis, setPerEventEmojis] = createSignal<Map<string, Map<string, Emoji>>>(new Map());

  /**
   * Resolve a shortcode to an Emoji with optional event context
   * Precedence: event-scoped > user > default
   */
  const resolve = (shortcode: string, options?: { eventId?: string }): Emoji | null => {
    // Check event-scoped emojis first
    if (options?.eventId) {
      const eventEmojis = perEventEmojis().get(options.eventId);
      if (eventEmojis?.has(shortcode)) {
        return eventEmojis.get(shortcode)!;
      }
    }

    // Fallback to global registry (user/defaults)
    const entry = registry().get(shortcode);
    if (!entry) return null;

    // Return without source property
    const { source, ...emoji } = entry;
    return emoji;
  };

  /**
   * Get all emojis with their resolved URLs
   */
  const withEmojis = (): Map<string, Emoji> => {
    const emojis = new Map<string, Emoji>();
    registry().forEach((entry, shortcode) => {
      const { source, ...emoji } = entry;
      emojis.set(shortcode, emoji);
    });
    return emojis;
  };

  /**
   * Register an event's emoji tags for scoped resolution
   * Extracts emoji tags and stores them in per-event map
   * Format: ['emoji', '<shortcode>', '<url>']
   */
  const registerEvent = (eventId: string, event: NostrEvent) => {
    if (!event.tags || event.tags.length === 0) return;

    const eventEmojis = new Map<string, Emoji>();

    event.tags.forEach(tag => {
      if (tag[0] === 'emoji' && tag[1] && tag[2]) {
        const shortcode = tag[1];
        const url = tag[2];

        // Validate URL (only http/https)
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return;
        }

        eventEmojis.set(shortcode, {
          shortcode,
          url,
          alt: shortcode,
        });
      }
    });

    // Only update if we found emoji tags
    if (eventEmojis.size > 0) {
      const newPerEventEmojis = new Map(perEventEmojis());
      newPerEventEmojis.set(eventId, eventEmojis);
      setPerEventEmojis(newPerEventEmojis);
    }
  };

  /**
   * Unregister an event's emojis (cleanup on unmount)
   * Prevents memory leaks when components unmount
   */
  const unregisterEvent = (eventId: string) => {
    const currentPerEventEmojis = perEventEmojis();
    if (currentPerEventEmojis.has(eventId)) {
      const newPerEventEmojis = new Map(currentPerEventEmojis);
      newPerEventEmojis.delete(eventId);
      setPerEventEmojis(newPerEventEmojis);
    }
  };

  /**
   * Merge user emoji sets into the global registry
   * User emojis have precedence over defaults
   */
  const mergeUserEmojis = (emojis: Emoji[]) => {
    const newRegistry = new Map(registry());

    emojis.forEach(emoji => {
      const existing = newRegistry.get(emoji.shortcode);

      // Only add if it doesn't exist or is a default
      if (!existing || existing.source === 'default') {
        newRegistry.set(emoji.shortcode, {
          ...emoji,
          source: 'user',
        });
      }
    });

    setRegistry(newRegistry);
  };

  return (
    <EmojiContext.Provider
      value={{
        resolve,
        withEmojis,
        registerEvent,
        unregisterEvent,
        mergeUserEmojis,
        registry,
      }}
    >
      {props.children}
    </EmojiContext.Provider>
  );
};

export const useEmojiRegistry = () => {
  const context = useContext(EmojiContext);
  if (!context) {
    throw new Error('useEmojiRegistry must be used within EmojiProvider');
  }
  return context;
};
