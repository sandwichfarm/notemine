import { Component, createSignal, Show, For } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { useQueue } from '../providers/QueueProvider';
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

export const ReactionPicker: Component<ReactionPickerProps> = (props) => {
  const { preferences, updatePreference } = usePreferences();

  const [customEmoji, setCustomEmoji] = createSignal('');
  const [difficulty, setDifficulty] = createSignal(preferences().powDifficultyReaction);
  const [queueSuccess, setQueueSuccess] = createSignal(false);

  const { user } = useUser();
  const { addToQueue } = useQueue();

  // Save difficulty preference when changed
  const handleDifficultyChange = (newDifficulty: number) => {
    setDifficulty(newDifficulty);
    updatePreference('powDifficultyReaction', newDifficulty);
  };

  const handleReact = async (emoji: string) => {
    setQueueSuccess(false);

    const currentUser = user();
    if (!currentUser) {
      console.error('[ReactionPicker] No user authenticated');
      return;
    }

    try {
      debug('[ReactionPicker] Adding reaction to mining queue...');

      // Add to queue
      addToQueue({
        type: 'reaction',
        content: emoji,
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: [
          ['e', props.eventId],
          ['p', props.eventAuthor],
          ['client', 'notemine.io'],
        ],
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
                    class="p-3 text-2xl hover:bg-bg-secondary dark:hover:bg-bg-tertiary rounded-lg transition-colors border border-border"
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

          {/* Difficulty slider */}
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
