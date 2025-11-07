/**
 * RepostConfirmDialog Component
 * Confirmation dialog for reposting notes (NIP-18)
 */

import { createSignal, Show, Component } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { useQueue } from '../providers/QueueProvider';
import { buildRepostEvent, type RepostInput } from '../lib/services/repost';
import { debug } from '../lib/debug';
import type { NostrEvent } from 'nostr-tools';

export interface RepostConfirmDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;
  /** Callback to close dialog */
  onClose: () => void;
  /** Original event to repost */
  originalEvent: NostrEvent;
  /** Optional relay hint */
  relayHint?: string;
}

export const RepostConfirmDialog: Component<RepostConfirmDialogProps> = (props) => {
  const { user } = useUser();
  const { preferences, updatePreference } = usePreferences();
  const { addToQueue } = useQueue();

  const [difficulty, setDifficulty] = createSignal(preferences().powDifficultyRootNote);
  const [queueSuccess, setQueueSuccess] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Save difficulty preference when changed
  const handleDifficultyChange = (newDifficulty: number) => {
    setDifficulty(newDifficulty);
    updatePreference('powDifficultyRootNote', newDifficulty);
  };

  const handleRepost = async () => {
    setQueueSuccess(false);

    const currentUser = user();
    if (!currentUser) {
      setError('You must be logged in to repost');
      return;
    }

    try {
      debug('[RepostDialog] Adding repost to mining queue...');

      // Build repost input
      const repostInput: RepostInput = {
        eventId: props.originalEvent.id,
        originalEvent: props.originalEvent,
        relayHint: props.relayHint,
      };

      // Build unsigned event
      const unsignedEvent = buildRepostEvent(repostInput, currentUser.pubkey);

      // Add to queue
      addToQueue({
        type: 'note', // Use 'note' type since there's no 'repost' in queue types
        content: unsignedEvent.content,
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: unsignedEvent.tags,
        kind: 6,
        metadata: {
          targetEventId: props.originalEvent.id,
          targetAuthor: props.originalEvent.pubkey,
        },
      });

      debug('[RepostDialog] Repost added to queue');

      // Show success and close modal
      setQueueSuccess(true);
      setTimeout(() => props.onClose(), 500);
    } catch (err: any) {
      console.error('[RepostDialog] Error:', err);
      setError(err.message || 'Failed to add repost to queue');
    }
  };

  // Don't render if not open
  if (!props.isOpen) return null;

  return (
    <Portal>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
        onClick={(e) => {
          // Close if clicking backdrop
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
          {/* Header */}
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
              Repost Note
            </h2>
            <button
              onClick={props.onClose}
              class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div class="space-y-4">
            {/* Confirmation Message */}
            <div>
              <p class="text-gray-700 dark:text-gray-300 mb-2">
                Repost this note to your followers?
              </p>
            </div>

            {/* Original Note Preview */}
            <div class="bg-gray-50 dark:bg-gray-700 rounded-md p-3 border border-gray-200 dark:border-gray-600">
              <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                {props.originalEvent.content}
              </p>
            </div>

            {/* Difficulty slider */}
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Higher difficulty = more work, better visibility
              </div>
            </div>

            {/* Success message */}
            <Show when={queueSuccess()}>
              <div class="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-3">
                <p class="text-sm text-green-800 dark:text-green-200">
                  ✓ Repost added to mining queue!
                </p>
              </div>
            </Show>

            {/* Error */}
            <Show when={error()}>
              <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-3">
                <p class="text-sm text-red-800 dark:text-red-200">{error()}</p>
              </div>
            </Show>
          </div>

          {/* Actions */}
          <div class="flex gap-3 mt-6">
            <button
              onClick={props.onClose}
              class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleRepost}
              class="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              disabled={queueSuccess()}
            >
              Add to Queue
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};
