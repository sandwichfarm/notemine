import { Component, createSignal, onMount, Show } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { A } from '@solidjs/router';
import { nip19 } from 'nostr-tools';
import { relayPool, eventStore, getActiveRelays } from '../lib/applesauce';
import { getPowDifficulty } from '../lib/pow';
import { ProfileName } from './ProfileName';
import { getEventId, getRelayHints } from '../lib/content-parser';
import type { ParsedEntity } from '../lib/content-parser';

interface NeventEmbedProps {
  entity: ParsedEntity;
  /** Recursion guard: current embed depth */
  embedDepth?: number;
  /** Recursion guard: set of event IDs in the embed chain */
  seenEventIds?: Set<string>;
}

/**
 * Embed component for nevent and note references
 * Fetches and displays the referenced event as a quoted note
 */
export const NeventEmbed: Component<NeventEmbedProps> = (props) => {
  const [event, setEvent] = createSignal<NostrEvent | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(false);

  const eventId = () => getEventId(props.entity);
  const seenIds = props.seenEventIds ?? new Set<string>();
  const currentDepth = props.embedDepth ?? 0;

  // Recursion guard: check for cycles
  if (eventId() && seenIds.has(eventId()!)) {
    return (
      <div class="my-3 border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-r p-3">
        <div class="text-sm text-yellow-700 dark:text-yellow-300 italic">
          [Circular reference detected - note embeds itself]
        </div>
      </div>
    );
  }

  onMount(async () => {
    const id = eventId();
    if (!id) {
      setError(true);
      setLoading(false);
      return;
    }

    // Try to get from event store first
    let storeSubscription: any = null;
    storeSubscription = eventStore.event(id).subscribe({
      next: (evt) => {
        if (evt) {
          setEvent(evt);
          setLoading(false);
          storeSubscription?.unsubscribe();
        }
      },
    });

    // If not found in store after 100ms, fetch from relays
    setTimeout(() => {
      if (!event()) {
        storeSubscription?.unsubscribe();

        // Get relays from hint or use defaults
        const relayHints = getRelayHints(props.entity);
        const relays = relayHints.length > 0 ? relayHints : getActiveRelays();

        const relay$ = relayPool.req(relays, { ids: [id] });
        relay$.subscribe({
          next: (response) => {
            if (response !== 'EOSE' && response.id === id) {
              const evt = response as NostrEvent;
              setEvent(evt);
              eventStore.add(evt);
              setLoading(false);
            }
          },
          error: () => {
            setError(true);
            setLoading(false);
          },
          complete: () => {
            if (!event()) {
              setError(true);
              setLoading(false);
            }
          },
        });
      }
    }, 100);
  });

  const noteLink = () => {
    const id = eventId();
    if (!id) return '#';

    const nevent = nip19.neventEncode({ id });
    return `/e/${nevent}`;
  };

  const timestamp = () => {
    const evt = event();
    if (!evt) return '';

    const date = new Date(evt.created_at * 1000);
    return date.toLocaleString();
  };

  return (
    <div class="my-3 border-l-4 border-accent bg-bg-secondary dark:bg-bg-tertiary rounded-r p-3">
      <Show when={loading()}>
        <div class="text-sm text-text-secondary italic">Loading quoted note...</div>
      </Show>

      <Show when={error()}>
        <div class="text-sm text-text-tertiary italic">Failed to load quoted note</div>
      </Show>

      <Show when={event() && !loading() && !error()}>
        <A href={noteLink()} class="block hover:opacity-80 transition-opacity">
          {/* Header */}
          <div class="flex items-center gap-2 mb-2 text-xs">
            <ProfileName pubkey={event()!.pubkey} asLink={false} showAvatar={true} />
            <span class="text-text-tertiary">{timestamp()}</span>
            <Show when={getPowDifficulty(event()!) > 0}>
              <span class="text-accent font-mono">⛏️ {getPowDifficulty(event()!)}</span>
            </Show>
          </div>

          {/* Content */}
          <div class="text-sm text-text-primary line-clamp-4">
            {event()!.content}
          </div>

          {/* Footer */}
          <div class="mt-2 text-xs text-text-tertiary">
            Click to view full note →
          </div>
        </A>
      </Show>
    </div>
  );
};
