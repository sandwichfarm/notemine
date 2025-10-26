import { Component, createSignal, Show, For } from 'solid-js';
import { usePowMining } from '../hooks/usePowMining';
import { useUser } from '../providers/UserProvider';
import { relayPool, getActiveRelays, getUserOutboxRelays } from '../lib/applesauce';
import { finalizeEvent } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/core';

interface ReactionPickerProps {
  eventId: string;
  eventAuthor: string;
  onClose: () => void;
}

const COMMON_REACTIONS = [
  { emoji: '❤️', label: 'Heart', type: 'positive' },
  { emoji: '+', label: 'Like', type: 'positive' },
  { emoji: '👍', label: 'Thumbs up', type: 'positive' },
  { emoji: '-', label: 'Dislike', type: 'negative' },
  { emoji: '👎', label: 'Thumbs down', type: 'negative' },
  { emoji: '🔥', label: 'Fire', type: 'neutral' },
  { emoji: '💯', label: '100', type: 'neutral' },
  { emoji: '⚡', label: 'Zap', type: 'neutral' },
];

const DEFAULT_DIFFICULTY = 18;

export const ReactionPicker: Component<ReactionPickerProps> = (props) => {
  const [selectedReaction, setSelectedReaction] = createSignal<string>('');
  const [customEmoji, setCustomEmoji] = createSignal('');
  const [difficulty, setDifficulty] = createSignal(DEFAULT_DIFFICULTY);
  const [publishing, setPublishing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const { user } = useUser();
  const { state: miningState, startMining } = usePowMining();

  const handleReact = async (emoji: string) => {
    setError(null);
    setSelectedReaction(emoji);

    const currentUser = user();
    if (!currentUser) {
      setError('No user authenticated');
      return;
    }

    try {
      console.log('[ReactionPicker] Mining reaction with POW...');

      // Mine reaction with POW
      const minedEvent = await startMining({
        content: emoji,
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: [
          ['e', props.eventId],
          ['p', props.eventAuthor],
          ['client', 'notemine.io'],
        ],
        kind: 7, // kind 7 is reaction
      });

      if (!minedEvent) {
        throw new Error('Mining failed: no event returned');
      }

      console.log('[ReactionPicker] POW mining complete, publishing...');

      // Sign the event
      let signedEvent: NostrEvent;
      if (currentUser.isAnon && currentUser.secret) {
        signedEvent = finalizeEvent(minedEvent as any, currentUser.secret);
      } else if (currentUser.signer) {
        signedEvent = await currentUser.signer.signEvent(minedEvent as any);
      } else if (window.nostr) {
        signedEvent = await window.nostr.signEvent(minedEvent);
      } else {
        throw new Error('Cannot sign event: no signing method available');
      }

      // Publish to relays (using NIP-65 outbox relays)
      setPublishing(true);
      const activeRelays = await getUserOutboxRelays(currentUser.pubkey);
      console.log('[ReactionPicker] Publishing to user outbox relays:', activeRelays);

      const promises = activeRelays.map(async (relayUrl) => {
        const relay = relayPool.relay(relayUrl);
        return relay.publish(signedEvent);
      });

      await Promise.allSettled(promises);

      console.log('[ReactionPicker] Reaction published successfully');

      // Close modal after success
      setTimeout(() => props.onClose(), 500);
    } catch (err) {
      console.error('[ReactionPicker] Error:', err);
      setError(String(err));
    } finally {
      setPublishing(false);
      setSelectedReaction('');
    }
  };

  const handleCustomReact = () => {
    const emoji = customEmoji().trim();
    if (emoji) {
      handleReact(emoji);
    }
  };

  return (
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={props.onClose}>
      <div class="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div class="border-b border-border p-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold">React with POW</h3>
            <button onClick={props.onClose} class="text-text-secondary hover:text-text-primary">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div class="p-4 space-y-4">
          {/* Common reactions */}
          <div>
            <label class="block text-sm font-medium mb-2">Quick reactions</label>
            <div class="grid grid-cols-4 gap-2">
              <For each={COMMON_REACTIONS}>
                {(reaction) => (
                  <button
                    onClick={() => handleReact(reaction.emoji)}
                    disabled={miningState().mining || publishing()}
                    class="p-3 text-2xl hover:bg-bg-secondary dark:hover:bg-bg-tertiary rounded-lg transition-colors border border-border disabled:opacity-50"
                    title={reaction.label}
                  >
                    {reaction.emoji}
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* Custom emoji */}
          <div>
            <label class="block text-sm font-medium mb-2">Custom emoji</label>
            <div class="flex gap-2">
              <input
                type="text"
                value={customEmoji()}
                onInput={(e) => setCustomEmoji(e.currentTarget.value)}
                placeholder="Enter any emoji"
                class="flex-1 px-3 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={miningState().mining || publishing()}
              />
              <button
                onClick={handleCustomReact}
                disabled={!customEmoji().trim() || miningState().mining || publishing()}
                class="btn-primary"
              >
                React
              </button>
            </div>
          </div>

          {/* Difficulty slider */}
          <div>
            <label class="block text-sm font-medium mb-2">
              POW Difficulty: {difficulty()}
            </label>
            <input
              type="range"
              min="16"
              max="24"
              step="1"
              value={difficulty()}
              onInput={(e) => setDifficulty(Number(e.currentTarget.value))}
              class="w-full"
              disabled={miningState().mining || publishing()}
            />
            <div class="text-xs text-text-secondary mt-1">
              Reactions typically use lower difficulty than posts
            </div>
          </div>

          {/* Mining status */}
          <Show when={miningState().mining}>
            <div class="p-3 bg-bg-primary dark:bg-bg-tertiary border border-border rounded-lg">
              <div class="text-sm space-y-1">
                <div>⛏️ Mining reaction with POW...</div>
                <div>Hash rate: {miningState().hashRate.toFixed(2)} H/s</div>
                <Show when={miningState().overallBestPow !== null}>
                  <div>Best POW: {miningState().overallBestPow}</div>
                </Show>
              </div>
            </div>
          </Show>

          {/* Error */}
          <Show when={error()}>
            <div class="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 rounded-lg text-sm">
              Error: {error()}
            </div>
          </Show>

          {/* Mining error */}
          <Show when={miningState().error}>
            <div class="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 rounded-lg text-sm">
              Mining error: {miningState().error}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
