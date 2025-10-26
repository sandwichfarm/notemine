import { Component, Show, createSignal } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty, hasValidPow, formatPowDifficulty } from '../lib/pow';
import { nip19 } from 'nostr-tools';
import { ReactionPicker } from './ReactionPicker';
import { ReplyComposer } from './ReplyComposer';
import { useNoteStats } from '../hooks/useNoteStats';

interface NoteProps {
  event: NostrEvent;
  score?: number;
  showScore?: boolean;
}

export const Note: Component<NoteProps> = (props) => {
  const [showReactionPicker, setShowReactionPicker] = createSignal(false);
  const [showReplyComposer, setShowReplyComposer] = createSignal(false);

  const powDifficulty = () => getPowDifficulty(props.event);
  const hasPow = () => hasValidPow(props.event, 1);
  const formattedPow = () => formatPowDifficulty(powDifficulty());
  const stats = useNoteStats(props.event);

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

      {/* Aggregate Stats */}
      <Show when={!stats().loading && (stats().reactionCount > 0 || stats().replyCount > 0)}>
        <div class="mt-3 p-2 bg-bg-primary dark:bg-bg-tertiary rounded border border-border">
          <div class="flex gap-4 text-xs">
            <Show when={stats().reactionCount > 0}>
              <div class="flex items-center gap-1">
                <span class="text-text-secondary">⚡</span>
                <span class="text-text-primary font-medium">{stats().reactionCount}</span>
                <span class="text-text-tertiary">reactions</span>
                <span class="text-accent font-mono">({stats().reactionsPowTotal} POW)</span>
              </div>
            </Show>
            <Show when={stats().replyCount > 0}>
              <div class="flex items-center gap-1">
                <span class="text-text-secondary">💬</span>
                <span class="text-text-primary font-medium">{stats().replyCount}</span>
                <span class="text-text-tertiary">replies</span>
                <span class="text-accent font-mono">({stats().repliesPowTotal} POW)</span>
              </div>
            </Show>
            <div class="flex items-center gap-1 ml-auto">
              <span class="text-text-tertiary">score:</span>
              <span class="text-cyber-400 font-mono font-bold">{stats().totalScore.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </Show>

      {/* Footer */}
      <div class="mt-3 pt-3 border-t border-border flex gap-3 text-xs text-text-tertiary">
        <button
          onClick={() => setShowReplyComposer(true)}
          class="hover:text-accent transition-colors"
        >
          💬 reply
        </button>
        <button
          onClick={() => setShowReactionPicker(true)}
          class="hover:text-accent transition-colors"
        >
          ⚡ react
        </button>
        <button
          onClick={() => {
            const noteId = nip19.noteEncode(props.event.id);
            navigator.clipboard.writeText(`https://notemine.io/n/${noteId}`);
          }}
          class="hover:text-accent transition-colors"
        >
          🔗 share
        </button>
      </div>

      {/* Reaction Picker Modal */}
      <Show when={showReactionPicker()}>
        <ReactionPicker
          eventId={props.event.id}
          eventAuthor={props.event.pubkey}
          onClose={() => setShowReactionPicker(false)}
        />
      </Show>

      {/* Reply Composer Modal */}
      <Show when={showReplyComposer()}>
        <ReplyComposer
          parentEvent={props.event}
          onClose={() => setShowReplyComposer(false)}
        />
      </Show>
    </div>
  );
};
