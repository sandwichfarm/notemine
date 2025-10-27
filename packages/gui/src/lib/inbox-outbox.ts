import { NostrEvent } from 'nostr-tools';
import { eventStore } from './applesauce';

/**
 * NIP-65 Relay List Management and Relay Hint Utilities
 */

interface RelayListEntry {
  url: string;
  read: boolean;
  write: boolean;
}

// Cache for user relay lists (kind 10002)
const relayListCache = new Map<string, RelayListEntry[]>();

/**
 * Parse kind 10002 relay list event into structured entries
 */
export function parseRelayList(event: NostrEvent): RelayListEntry[] {
  const entries: RelayListEntry[] = [];

  for (const tag of event.tags) {
    if (tag[0] === 'r') {
      const url = tag[1];
      const marker = tag[2]; // 'read', 'write', or undefined (both)

      entries.push({
        url,
        read: !marker || marker === 'read',
        write: !marker || marker === 'write',
      });
    }
  }

  return entries;
}

/**
 * Get inbox relays for a user (where they read from)
 */
export async function getUserInboxRelays(pubkey: string): Promise<string[]> {
  // Check cache first
  const cached = relayListCache.get(pubkey);
  if (cached) {
    return cached.filter(r => r.read).map(r => r.url);
  }

  // Fetch from event store
  const relayListEvent = eventStore.getEventsByFilter({
    kinds: [10002],
    authors: [pubkey],
  })?.[0];

  if (relayListEvent) {
    const entries = parseRelayList(relayListEvent);
    relayListCache.set(pubkey, entries);
    return entries.filter(r => r.read).map(r => r.url);
  }

  return [];
}

/**
 * Get outbox relays for a user (where they write to)
 */
export async function getUserOutboxRelays(pubkey: string): Promise<string[]> {
  // Check cache first
  const cached = relayListCache.get(pubkey);
  if (cached) {
    return cached.filter(r => r.write).map(r => r.url);
  }

  // Fetch from event store
  const relayListEvent = eventStore.getEventsByFilter({
    kinds: [10002],
    authors: [pubkey],
  })?.[0];

  if (relayListEvent) {
    const entries = parseRelayList(relayListEvent);
    relayListCache.set(pubkey, entries);
    return entries.filter(r => r.write).map(r => r.url);
  }

  return [];
}

/**
 * Extract relay hint from an 'e' or 'p' tag
 * Format: ['e', eventId, relayUrl, marker]
 */
export function getRelayHintFromTag(tag: string[]): string | undefined {
  if ((tag[0] === 'e' || tag[0] === 'p') && tag.length >= 3) {
    return tag[2] || undefined;
  }
  return undefined;
}

/**
 * Add relay hint to an 'e' tag
 * Returns: ['e', eventId, relayHint, marker]
 */
export function addRelayHintToETag(
  eventId: string,
  relayHint: string | undefined,
  marker?: string
): string[] {
  const tag = ['e', eventId, relayHint || '', marker || ''];
  // Remove trailing empty strings
  while (tag.length > 2 && tag[tag.length - 1] === '') {
    tag.pop();
  }
  return tag;
}

/**
 * Add relay hint to a 'p' tag
 * Returns: ['p', pubkey, relayHint]
 */
export function addRelayHintToPTag(
  pubkey: string,
  relayHint: string | undefined
): string[] {
  const tag = ['p', pubkey, relayHint || ''];
  // Remove trailing empty strings
  while (tag.length > 2 && tag[tag.length - 1] === '') {
    tag.pop();
  }
  return tag;
}

/**
 * Get the relay URL where an event was first seen
 * This will be populated by the event store tracking
 */
export function getEventRelayHint(eventId: string): string | undefined {
  const event = eventStore.getEvent(eventId);
  if (!event) return undefined;

  // Check if event has relay metadata (will be added in Phase 6)
  const metadata = (event as any)._relayHint as string | undefined;
  return metadata;
}

/**
 * Get all relay hints from event tags
 */
export function getAllRelayHintsFromEvent(event: NostrEvent): string[] {
  const hints = new Set<string>();

  for (const tag of event.tags) {
    const hint = getRelayHintFromTag(tag);
    if (hint) {
      hints.add(hint);
    }
  }

  return Array.from(hints);
}

/**
 * Build comprehensive relay list for publishing an interaction
 * Includes: author's inbox + your outbox + notemine.io + NIP-66 PoW relays
 */
export async function getPublishRelaysForInteraction(
  authorPubkey: string,
  yourPubkey: string,
  defaultRelay: string,
  powRelays: string[]
): Promise<string[]> {
  const relays = new Set<string>();

  // Always include default relay (notemine.io)
  relays.add(defaultRelay);

  // Add NIP-66 PoW relays
  powRelays.forEach(url => relays.add(url));

  // Add author's inbox relays
  const authorInbox = await getUserInboxRelays(authorPubkey);
  authorInbox.forEach(url => relays.add(url));

  // Add your outbox relays
  const yourOutbox = await getUserOutboxRelays(yourPubkey);
  yourOutbox.forEach(url => relays.add(url));

  return Array.from(relays);
}

/**
 * Clear relay list cache (call when relay lists are updated)
 */
export function clearRelayListCache(pubkey?: string) {
  if (pubkey) {
    relayListCache.delete(pubkey);
  } else {
    relayListCache.clear();
  }
}
