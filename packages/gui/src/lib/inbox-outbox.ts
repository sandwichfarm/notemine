import { NostrEvent } from 'nostr-tools';
import { getUserInboxRelays, getUserOutboxRelays } from './applesauce';

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

// Note: getUserInboxRelays and getUserOutboxRelays are now imported from './applesauce'
// They use the correct EventStore API: eventStore.mailboxes(pubkey) with network fallback

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
 * Returns: ['e', eventId, relayHint, marker] or ['e', eventId, marker] if no hint
 */
export function addRelayHintToETag(
  eventId: string,
  relayHint: string | undefined,
  marker?: string
): string[] {
  // Build tag without empty relay hint
  if (relayHint) {
    // Has relay hint: ['e', eventId, relayHint, marker?]
    const tag = ['e', eventId, relayHint];
    if (marker) tag.push(marker);
    return tag;
  } else if (marker) {
    // No relay hint but has marker: ['e', eventId, marker]
    return ['e', eventId, marker];
  } else {
    // No relay hint, no marker: ['e', eventId]
    return ['e', eventId];
  }
}

/**
 * Add relay hint to a 'p' tag
 * Returns: ['p', pubkey, relayHint] or ['p', pubkey] if no hint
 */
export function addRelayHintToPTag(
  pubkey: string,
  relayHint: string | undefined
): string[] {
  // Build tag without empty relay hint
  if (relayHint) {
    return ['p', pubkey, relayHint];
  } else {
    return ['p', pubkey];
  }
}

/**
 * Get the relay URL where an event was first seen
 * This will be populated by the event store tracking
 * Note: Currently returns undefined as relay hint tracking is not yet implemented
 */
export function getEventRelayHint(_eventId: string): string | undefined {
  // TODO: Implement relay hint tracking via eventStore.event(eventId) observable
  // For now, return undefined as the feature is not critical for basic functionality
  return undefined;
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
