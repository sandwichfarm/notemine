import type { NostrEvent } from 'nostr-tools/core';
import { mergeRelaySets, getSeenRelays } from 'applesauce-core/helpers/relays';
import { eventStore } from './applesauce';
import { getAllRelayHintsFromEvent } from './inbox-outbox';

const MAX_RELAY_HINTS = 8;

type RelaySource = string | Iterable<string> | undefined | null;

/**
 * Collect relay hints for an event (or event id) by merging seen relays, tag hints, and optional extras.
 * Returns undefined when no safe relays are available to avoid bloating NIP-19 encodings.
 */
export function buildRelayHintsForEvent(
  eventOrId?: NostrEvent | string | null,
  ...extraSources: RelaySource[]
): string[] | undefined {
  let event: NostrEvent | undefined;

  if (typeof eventOrId === 'string') {
    event = eventStore.getEvent(eventOrId);
  } else if (eventOrId) {
    event = eventOrId;
  }

  const sanitizedExtras = extraSources.filter(
    (src): src is Exclude<RelaySource, undefined | null> => Boolean(src)
  );

  const merged = mergeRelaySets(
    event ? getSeenRelays(event) : undefined,
    event ? getAllRelayHintsFromEvent(event) : undefined,
    ...sanitizedExtras
  );

  if (merged.length === 0) {
    return undefined;
  }

  return merged.slice(0, MAX_RELAY_HINTS);
}
