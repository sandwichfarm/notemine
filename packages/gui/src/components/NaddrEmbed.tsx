import { Component, createSignal, onMount, Show } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { A } from '@solidjs/router';
import { nip19 } from 'nostr-tools';
import { relayPool, eventStore, getActiveRelays } from '../lib/applesauce';
import { ProfileName } from './ProfileName';
import { getRelayHints } from '../lib/nip19-parser';
import type { ParsedEntity } from '../lib/nip19-parser';

interface NaddrEmbedProps {
  entity: ParsedEntity;
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
    <div class="my-3 border border-border bg-bg-secondary dark:bg-bg-tertiary rounded p-4">
      <Show when={loading()}>
        <div class="text-sm text-text-secondary italic">Loading article...</div>
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
