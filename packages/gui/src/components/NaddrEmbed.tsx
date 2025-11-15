import { Component, createSignal, onMount, Show } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { A } from '@solidjs/router';
import { nip19 } from 'nostr-tools';
import { relayPool, eventStore, getActiveRelays } from '../lib/applesauce';
import { ProfileName } from './ProfileName';
import { getRelayHints } from '../lib/content-parser';
import type { ParsedEntity } from '../lib/content-parser';

interface NaddrEmbedProps {
  entity: ParsedEntity;
  /** Recursion guard: current embed depth */
  embedDepth?: number;
  /** Recursion guard: set of event IDs in the embed chain */
  seenEventIds?: Set<string>;
}

/**
 * Embed component for naddr references (long-form content, kind 30023)
 * Shows the title and summary with a link to the full content
 */
export const NaddrEmbed: Component<NaddrEmbedProps> = (props) => {
  const [event, setEvent] = createSignal<NostrEvent | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(false);

  const naddrData = () => {
    if (props.entity.type !== 'naddr') return null;
    return props.entity.data as { kind: number; pubkey: string; identifier: string; relays?: string[] };
  };

  const seenIds = props.seenEventIds ?? new Set<string>();

  onMount(async () => {
    const data = naddrData();
    if (!data) {
      setError(true);
      setLoading(false);
      return;
    }

    // Get relays from hint or use defaults
    const relayHints = getRelayHints(props.entity);
    const relays = relayHints.length > 0 ? relayHints : getActiveRelays();

    // Fetch parameterized replaceable event
    const filter = {
      kinds: [data.kind],
      authors: [data.pubkey],
      '#d': [data.identifier],
      limit: 1,
    };

    const relay$ = relayPool.req(relays, filter);
    relay$.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === data.kind) {
          const evt = response as NostrEvent;

          // Recursion guard: check for cycle
          if (seenIds.has(evt.id)) {
            setError(true);
            setLoading(false);
            return;
          }

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
  });

  const title = () => {
    const evt = event();
    if (!evt) return 'Untitled';

    const titleTag = evt.tags.find(t => t[0] === 'title');
    return titleTag ? titleTag[1] : 'Untitled Article';
  };

  const summary = () => {
    const evt = event();
    if (!evt) return '';

    const summaryTag = evt.tags.find(t => t[0] === 'summary');
    return summaryTag ? summaryTag[1] : '';
  };

  const noteLink = () => {
    const data = naddrData();
    if (!data) return '#';

    const naddr = nip19.naddrEncode({
      kind: data.kind,
      pubkey: data.pubkey,
      identifier: data.identifier,
      relays: data.relays,
    });
    return `/n/${naddr}`;
  };

  return (
    <div class="my-3 border border-border bg-bg-secondary dark:bg-bg-tertiary rounded p-4 min-h-[160px] flex flex-col justify-between">
      <Show when={loading()}>
        <div class="space-y-3 animate-pulse">
          <div class="h-4 bg-white/10 dark:bg-black/20 rounded w-32" />
          <div class="h-5 bg-white/5 dark:bg-black/10 rounded w-full" />
          <div class="h-5 bg-white/5 dark:bg-black/10 rounded w-5/6" />
        </div>
      </Show>

      <Show when={error()}>
        <div class="text-sm text-text-tertiary italic">Failed to load article</div>
      </Show>

      <Show when={event() && !loading() && !error()}>
        <A href={noteLink()} class="block hover:opacity-80 transition-opacity">
          {/* Icon + Label */}
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xl">📄</span>
            <span class="text-xs font-mono text-text-tertiary uppercase">Long-form Article</span>
          </div>

          {/* Title */}
          <h3 class="text-lg font-bold text-text-primary mb-2">
            {title()}
          </h3>

          {/* Summary */}
          <Show when={summary()}>
            <p class="text-sm text-text-secondary mb-3 line-clamp-2">
              {summary()}
            </p>
          </Show>

          {/* Author */}
          <div class="flex items-center gap-2 text-xs">
            <span class="text-text-tertiary">by</span>
            <ProfileName pubkey={event()!.pubkey} asLink={false} showAvatar={true} />
          </div>
        </A>
      </Show>
    </div>
  );
};
