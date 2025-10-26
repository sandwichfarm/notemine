import { Component, Show } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty, hasValidPow, formatPowDifficulty } from '../lib/pow';
import { nip19 } from 'nostr-tools';

interface NoteProps {
  event: NostrEvent;
  score?: number;
  showScore?: boolean;
}

export const Note: Component<NoteProps> = (props) => {
  const powDifficulty = () => getPowDifficulty(props.event);
  const hasPow = () => hasValidPow(props.event, 1);
  const formattedPow = () => formatPowDifficulty(powDifficulty());

  const shortPubkey = () => {
    try {
      const npub = nip19.npubEncode(props.event.pubkey);
      return npub.slice(0, 12) + '...' + npub.slice(-4);
    } catch {
      return props.event.pubkey.slice(0, 8) + '...' + props.event.pubkey.slice(-4);
    }
  };

  const timestamp = () => {
    const date = new Date(props.event.created_at * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  return (
    <div
      class="card p-4 border-l-4 transition-all hover:shadow-md"
      classList={{
        'border-l-accent': hasPow(),
        'border-l-gray-400 dark:border-l-gray-600 opacity-70': !hasPow(),
        'bg-bg-secondary dark:bg-bg-tertiary': !hasPow(),
      }}
    >
      {/* Header */}
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="font-mono text-sm text-text-secondary truncate">
            {shortPubkey()}
          </div>
          <div class="text-xs text-text-tertiary">{timestamp()}</div>
        </div>

        <div class="flex items-center gap-2">
          {/* POW Badge */}
          <Show when={hasPow()} fallback={<span class="text-xs text-gray-400">no pow</span>}>
            <span class="text-xs font-medium px-2 py-1 rounded bg-accent/10 text-accent">
              {formattedPow()}
            </span>
          </Show>

          {/* Score (if provided) */}
          <Show when={props.showScore && props.score !== undefined}>
            <span class="text-xs font-mono px-2 py-1 rounded bg-cyber-700/20 text-cyber-400">
              score: {props.score?.toFixed(1)}
            </span>
          </Show>
        </div>
      </div>

      {/* Content */}
      <div
        class="text-text-primary whitespace-pre-wrap break-words font-sans"
        classList={{
          'text-text-secondary': !hasPow(),
        }}
      >
        {props.event.content}
      </div>

      {/* Footer */}
      <div class="mt-3 pt-3 border-t border-border flex gap-3 text-xs text-text-tertiary">
        <button class="hover:text-accent transition-colors">
          💬 reply
        </button>
        <button class="hover:text-accent transition-colors">
          ⚡ react
        </button>
        <button class="hover:text-accent transition-colors">
          🔗 share
        </button>
      </div>
    </div>
  );
};
