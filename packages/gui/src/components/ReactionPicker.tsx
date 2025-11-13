import { Component, createSignal, Show, For, onMount, createEffect } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { useQueue } from '../providers/QueueProvider';
import { useEmojiSets, type EmojiSet } from '../providers/EmojiSetsProvider';
import type { Emoji } from '../providers/EmojiProvider';
import { debug } from '../lib/debug';

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

type Tab = 'quick' | 'sets' | 'custom';

export const ReactionPicker: Component<ReactionPickerProps> = (props) => {
  const { preferences, updatePreference } = usePreferences();

  const [activeTab, setActiveTab] = createSignal<Tab>('quick');
  const [selectedSet, setSelectedSet] = createSignal<EmojiSet | null>(null);
  const [customEmoji, setCustomEmoji] = createSignal('');
  const [difficulty, setDifficulty] = createSignal(preferences().powDifficultyReaction);
  const [queueSuccess, setQueueSuccess] = createSignal(false);

  const { user } = useUser();
  const { addToQueue } = useQueue();
  const { sets, loadForUser, isLoading, error } = useEmojiSets();

  // Load emoji sets when modal opens
  onMount(() => {
    const currentUser = user();
    if (currentUser && !currentUser.isAnon) {
      loadForUser(currentUser.pubkey);
    }
  });

  // Auto-select first set when loaded
  createEffect(() => {
    const availableSets = sets();
    if (availableSets.length > 0 && !selectedSet()) {
      setSelectedSet(availableSets[0]);
    }
  });

  // Save difficulty preference when changed
  const handleDifficultyChange = (newDifficulty: number) => {
    setDifficulty(newDifficulty);
    updatePreference('powDifficultyReaction', newDifficulty);
  };

  const handleReact = async (emoji: string, customEmoji?: Emoji) => {
    setQueueSuccess(false);

    const currentUser = user();
    if (!currentUser) {
      console.error('[ReactionPicker] No user authenticated');
      return;
    }

    try {
      debug('[ReactionPicker] Adding reaction to mining queue...');

      // Build tags array
      const tags: string[][] = [
        ['e', props.eventId],
        ['p', props.eventAuthor],
        ['client', 'notemine.io'],
      ];

      // Add emoji tag for NIP-30 custom emojis
      if (customEmoji) {
        tags.push(['emoji', customEmoji.shortcode, customEmoji.url]);
        debug('[ReactionPicker] Adding custom emoji tag:', customEmoji.shortcode, customEmoji.url);
      }

      // Add to queue
      addToQueue({
        type: 'reaction',
        content: emoji,
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags,
        kind: 7, // kind 7 is reaction
        metadata: {
          targetEventId: props.eventId,
          targetAuthor: props.eventAuthor,
          reactionContent: emoji,
        },
      });

      debug('[ReactionPicker] Reaction added to queue');

      // Show success and close modal
      setQueueSuccess(true);
      setTimeout(() => props.onClose(), 500);
    } catch (err) {
      console.error('[ReactionPicker] Error:', err);
    }
  };

  const handleCustomReact = () => {
    const emoji = customEmoji().trim();
    if (emoji) {
      handleReact(emoji);
    }
  };

  return (
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={props.onClose}>
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

        {/* Tab Navigation */}
        <div class="flex border-b border-border">
          <button
            onClick={() => setActiveTab('quick')}
            class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
            classList={{
              'text-accent border-b-2 border-accent': activeTab() === 'quick',
              'text-text-secondary hover:text-text-primary': activeTab() !== 'quick',
            }}
          >
            Quick
          </button>
          <button
            onClick={() => setActiveTab('sets')}
            class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
            classList={{
              'text-accent border-b-2 border-accent': activeTab() === 'sets',
              'text-text-secondary hover:text-text-primary': activeTab() !== 'sets',
            }}
          >
            My Sets {sets().length > 0 && `(${sets().length})`}
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
            classList={{
              'text-accent border-b-2 border-accent': activeTab() === 'custom',
              'text-text-secondary hover:text-text-primary': activeTab() !== 'custom',
            }}
          >
            Custom
          </button>
        </div>

        <div class="p-4 space-y-4">
          {/* Quick Tab - Common reactions */}
          <Show when={activeTab() === 'quick'}>
            <div class="grid grid-cols-4 gap-2">
              <For each={COMMON_REACTIONS}>
                {(reaction) => (
                  <button
                    onClick={() => handleReact(reaction.emoji)}
                    class="p-3 text-2xl hover:bg-bg-secondary dark:hover:bg-bg-tertiary rounded-lg transition-colors border border-border"
                    title={reaction.label}
                  >
                    {reaction.emoji}
                  </button>
                )}
              </For>
            </div>
          </Show>

          {/* My Sets Tab */}
          <Show when={activeTab() === 'sets'}>
            <Show
              when={!isLoading() && !error() && sets().length > 0}
              fallback={
                <div class="text-center py-8">
                  <Show when={isLoading()}>
                    <div class="text-text-secondary">Loading emoji sets...</div>
                  </Show>
                  <Show when={!isLoading() && error()}>
                    <div class="space-y-2">
                      <div class="text-red-600 dark:text-red-400">Failed to load emoji sets</div>
                      <div class="text-xs text-text-tertiary">
                        {error()}
                      </div>
                      <button
                        onClick={() => {
                          const currentUser = user();
                          if (currentUser && !currentUser.isAnon) {
                            loadForUser(currentUser.pubkey);
                          }
                        }}
                        class="text-sm text-accent hover:underline mt-2"
                      >
                        Retry
                      </button>
                    </div>
                  </Show>
                  <Show when={!isLoading() && !error() && sets().length === 0}>
                    <div class="space-y-2 text-text-secondary">
                      <div>No emoji sets found.</div>
                      <div class="text-xs">
                        You haven't created any NIP-51 emoji sets yet.
                      </div>
                    </div>
                  </Show>
                </div>
              }
            >
              {/* Emoji Set Selector */}
              <div>
                <label class="block text-sm font-medium mb-2">Select Set</label>
                <select
                  value={selectedSet()?.id || ''}
                  onChange={(e) => {
                    const set = sets().find(s => s.id === e.currentTarget.value);
                    setSelectedSet(set || null);
                  }}
                  class="w-full px-3 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <For each={sets()}>
                    {(set) => (
                      <option value={set.id}>
                        {set.name} ({set.emojis.length} emojis)
                      </option>
                    )}
                  </For>
                </select>
              </div>

              {/* Emoji Grid */}
              <Show when={selectedSet()}>
                <div class="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                  <For each={selectedSet()!.emojis}>
                    {(emoji) => (
                      <button
                        onClick={() => handleReact(`:${emoji.shortcode}:`, emoji)}
                        class="p-2 hover:bg-bg-secondary dark:hover:bg-bg-tertiary rounded-lg transition-colors border border-border"
                        title={emoji.shortcode}
                      >
                        <img
                          src={emoji.url}
                          alt={emoji.alt || emoji.shortcode}
                          class="w-8 h-8 mx-auto"
                          style={{ 'object-fit': 'contain' }}
                        />
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>

          {/* Custom Tab */}
          <Show when={activeTab() === 'custom'}>
            <div>
              <label class="block text-sm font-medium mb-2">Custom emoji</label>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={customEmoji()}
                  onInput={(e) => setCustomEmoji(e.currentTarget.value)}
                  placeholder="Enter any emoji"
                  class="flex-1 px-3 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  onClick={handleCustomReact}
                  disabled={!customEmoji().trim()}
                  class="btn-primary"
                >
                  Add to Queue
                </button>
              </div>
            </div>
          </Show>

          {/* Difficulty slider - shown on all tabs */}
          <div>
            <label class="block text-sm font-medium mb-2">
              POW Difficulty: {difficulty()}
            </label>
            <input
              type="range"
              min="16"
              max="42"
              step="1"
              value={difficulty()}
              onInput={(e) => handleDifficultyChange(Number(e.currentTarget.value))}
              class="w-full"
            />
            <div class="text-xs text-text-secondary mt-1">
              Reactions typically use lower difficulty than posts
            </div>
          </div>

          {/* Success message */}
          <Show when={queueSuccess()}>
            <div class="p-3 bg-green-100 dark:bg-green-900/20 border border-green-500 text-green-700 dark:text-green-400 rounded-lg text-sm">
              ✅ Reaction added to mining queue!
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
