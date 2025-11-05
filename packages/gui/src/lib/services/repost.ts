/**
 * Repost Service (NIP-18)
 * Handles building and publishing kind 6 repost events
 */

import type { NostrEvent } from 'nostr-tools';

/**
 * Input for creating a repost event
 */
export interface RepostInput {
  /** Event ID of the note being reposted */
  eventId: string;
  /** Original event (if already fetched) */
  originalEvent?: NostrEvent;
  /** Relay hint for where the original event can be found */
  relayHint?: string;
}

/**
 * Build a kind 6 repost event (unsigned)
 *
 * Per NIP-18:
 * - Content: Stringified JSON of the reposted note (recommended)
 * - e tag: MUST include event id with relay URL (3rd entry)
 * - p tag: SHOULD include author pubkey
 *
 * @param input - Repost input parameters
 * @param reposterPubkey - Public key of the user making the repost
 * @returns Unsigned event ready for mining
 *
 * @throws Error if originalEvent is not provided
 */
export function buildRepostEvent(
  input: RepostInput,
  reposterPubkey: string
): Omit<NostrEvent, 'id' | 'sig'> {
  const { eventId, originalEvent, relayHint } = input;

  if (!originalEvent) {
    throw new Error('Original event is required to build repost');
  }

  // Per NIP-18: content should be stringified JSON of original event
  const content = JSON.stringify(originalEvent);

  // Extract relay hint from original event's tags if not provided
  let finalRelayHint = relayHint;
  if (!finalRelayHint && originalEvent.tags) {
    // Look for relay hints in e tags or r tags
    const relayTag = originalEvent.tags.find(
      (t) => t[0] === 'r' || (t[0] === 'e' && t[2])
    );
    if (relayTag && relayTag[1]) {
      finalRelayHint = relayTag[1];
    }
  }

  // Fallback to a default relay if no hint available
  if (!finalRelayHint) {
    finalRelayHint = 'wss://relay.damus.io'; // Common fallback
  }

  const tags: string[][] = [
    // e tag MUST include relay URL as 3rd entry
    ['e', eventId, finalRelayHint],
    // p tag SHOULD include author pubkey
    ['p', originalEvent.pubkey],
  ];

  // Build event
  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    kind: 6,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
    pubkey: reposterPubkey,
  };

  return event;
}

/**
 * Check if user has already reposted an event
 * @param eventId - ID of the event to check
 * @param userPubkey - User's public key
 * @param userReposts - Array of user's kind 6 events
 * @returns true if already reposted
 */
export function hasUserReposted(
  eventId: string,
  userPubkey: string,
  userReposts: NostrEvent[]
): boolean {
  return userReposts.some((repost) => {
    // Check if this is a repost by the user
    if (repost.kind !== 6 || repost.pubkey !== userPubkey) {
      return false;
    }

    // Check if it reposts the target event
    const eTag = repost.tags.find((t) => t[0] === 'e');
    return eTag && eTag[1] === eventId;
  });
}
