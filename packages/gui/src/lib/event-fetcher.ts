import { NostrEvent } from 'nostr-tools';
import { eventStore, relayPool } from './applesauce';
import { getRelayHintFromTag, getAllRelayHintsFromEvent } from './inbox-outbox';

/**
 * Event Fetching with Relay Hint Support
 * Fetches missing events using relay hints from tags
 */

interface FetchOptions {
  timeout?: number;
  relayHints?: string[];
  fallbackRelays?: string[];
}

/**
 * Fetch a single event by ID, using relay hints if available
 */
export async function fetchEventWithHints(
  eventId: string,
  options: FetchOptions = {}
): Promise<NostrEvent | null> {
  const { timeout = 5000, relayHints = [], fallbackRelays = [] } = options;

  // Check if we already have it
  const cached = eventStore.getEvent(eventId);
  if (cached) return cached;

  // Build relay list: hints first, then fallbacks
  const relaysToTry = [...new Set([...relayHints, ...fallbackRelays])];

  if (relaysToTry.length === 0) {
    console.warn(`No relays to fetch event ${eventId}`);
    return null;
  }

  // Create a promise that resolves when we get the event or timeout
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub?.close();
      resolve(null);
    }, timeout);

    // Subscribe to the event from the relay pool
    const sub = relayPool.subscribeMany(
      relaysToTry,
      [{ ids: [eventId] }],
      {
        onevent: (event: NostrEvent) => {
          clearTimeout(timer);
          sub?.close();

          // Add to event store
          eventStore.add(event);
          resolve(event);
        },
        oneose: () => {
          // End of stored events, no event found
          clearTimeout(timer);
          sub?.close();
          resolve(null);
        },
      }
    );
  });
}

/**
 * Fetch multiple events by IDs, using relay hints if available
 */
export async function fetchEventsWithHints(
  eventIds: string[],
  options: FetchOptions = {}
): Promise<NostrEvent[]> {
  const { timeout = 5000, relayHints = [], fallbackRelays = [] } = options;

  // Filter out events we already have
  const missingIds = eventIds.filter(id => !eventStore.getEvent(id));
  if (missingIds.length === 0) {
    return eventIds.map(id => eventStore.getEvent(id)!).filter(Boolean);
  }

  // Build relay list
  const relaysToTry = [...new Set([...relayHints, ...fallbackRelays])];

  if (relaysToTry.length === 0) {
    console.warn(`No relays to fetch events ${missingIds.join(', ')}`);
    return [];
  }

  // Fetch events
  return new Promise((resolve) => {
    const foundEvents: NostrEvent[] = [];
    const foundIds = new Set<string>();

    const timer = setTimeout(() => {
      sub?.close();
      resolve(foundEvents);
    }, timeout);

    const sub = relayPool.subscribeMany(
      relaysToTry,
      [{ ids: missingIds }],
      {
        onevent: (event: NostrEvent) => {
          if (!foundIds.has(event.id)) {
            foundIds.add(event.id);
            foundEvents.push(event);
            eventStore.add(event);

            // If we found all events, close early
            if (foundIds.size === missingIds.length) {
              clearTimeout(timer);
              sub?.close();
              resolve(foundEvents);
            }
          }
        },
        oneose: () => {
          clearTimeout(timer);
          sub?.close();
          resolve(foundEvents);
        },
      }
    );
  });
}

/**
 * Fetch parent event referenced in a reply/reaction
 * Uses relay hint from 'e' tag if available
 */
export async function fetchParentEvent(
  childEvent: NostrEvent,
  fallbackRelays: string[] = []
): Promise<NostrEvent | null> {
  // Find 'e' tags with 'reply' or 'root' marker, or first 'e' tag
  const eTags = childEvent.tags.filter(t => t[0] === 'e');
  if (eTags.length === 0) return null;

  // Prefer 'reply' marker, then 'root', then first tag
  let parentTag = eTags.find(t => t[3] === 'reply') ||
                  eTags.find(t => t[3] === 'root') ||
                  eTags[0];

  const parentId = parentTag[1];
  const relayHint = getRelayHintFromTag(parentTag);

  // Also collect any other relay hints from the event
  const allHints = getAllRelayHintsFromEvent(childEvent);

  return fetchEventWithHints(parentId, {
    relayHints: relayHint ? [relayHint, ...allHints] : allHints,
    fallbackRelays,
  });
}

/**
 * Fetch author profile (kind 0) for an event
 * Uses relay hint from 'p' tag if available
 */
export async function fetchAuthorProfile(
  event: NostrEvent,
  fallbackRelays: string[] = []
): Promise<NostrEvent | null> {
  const pubkey = event.pubkey;

  // Check if we already have the profile
  const cached = eventStore.getEventsByFilter({
    kinds: [0],
    authors: [pubkey],
  })?.[0];
  if (cached) return cached;

  // Look for 'p' tags with relay hints
  const pTags = event.tags.filter(t => t[0] === 'p' && t[1] === pubkey);
  const relayHints = pTags
    .map(t => getRelayHintFromTag(t))
    .filter(Boolean) as string[];

  // Fetch profile
  return new Promise((resolve) => {
    const relaysToTry = [...new Set([...relayHints, ...fallbackRelays])];
    if (relaysToTry.length === 0) {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      sub?.close();
      resolve(null);
    }, 5000);

    const sub = relayPool.subscribeMany(
      relaysToTry,
      [{ kinds: [0], authors: [pubkey] }],
      {
        onevent: (profile: NostrEvent) => {
          clearTimeout(timer);
          sub?.close();
          eventStore.add(profile);
          resolve(profile);
        },
        oneose: () => {
          clearTimeout(timer);
          sub?.close();
          resolve(null);
        },
      }
    );
  });
}

/**
 * Fetch all referenced events from a note (replies, reactions, mentions)
 * Returns array of fetched events
 */
export async function fetchReferencedEvents(
  event: NostrEvent,
  fallbackRelays: string[] = []
): Promise<NostrEvent[]> {
  const eTags = event.tags.filter(t => t[0] === 'e');
  if (eTags.length === 0) return [];

  const eventIds = eTags.map(t => t[1]);
  const relayHints = eTags
    .map(t => getRelayHintFromTag(t))
    .filter(Boolean) as string[];

  return fetchEventsWithHints(eventIds, {
    relayHints,
    fallbackRelays,
  });
}

/**
 * Recursively fetch a thread (parent, grandparent, etc.)
 * Returns array of events in thread, oldest first
 */
export async function fetchThread(
  event: NostrEvent,
  fallbackRelays: string[] = [],
  maxDepth: number = 10
): Promise<NostrEvent[]> {
  const thread: NostrEvent[] = [event];
  let current = event;
  let depth = 0;

  while (depth < maxDepth) {
    const parent = await fetchParentEvent(current, fallbackRelays);
    if (!parent) break;

    thread.unshift(parent); // Add to beginning
    current = parent;
    depth++;
  }

  return thread;
}
