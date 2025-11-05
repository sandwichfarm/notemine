/**
 * ReportModal Component
 * Modal for reporting notes or profiles (NIP-56)
 */

import { createSignal, Show, For, Component } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useMining } from '../providers/MiningProvider';
import { usePublishing } from '../providers/PublishingProvider';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import {
  buildReportEvent,
  getAllReportTypes,
  type ReportType,
  type ReportInput,
} from '../lib/services/report';
import { debug } from '../lib/debug';

export interface ReportModalProps {
  /** Whether modal is open */
  isOpen: boolean;
  /** Callback to close modal */
  onClose: () => void;
  /** Event ID for reporting notes */
  eventId?: string;
  /** Pubkey for reporting profiles */
  pubkey?: string;
  /** Optional kind of target */
  targetKind?: number;
  /** Optional author pubkey (for note reports) */
  authorPubkey?: string;
}

export const ReportModal: Component<ReportModalProps> = (props) => {
  const mining = useMining();
  const publishing = usePublishing();
  const { user } = useUser();
  const preferences = usePreferences();

  const [selectedReason, setSelectedReason] = createSignal<ReportType>('spam');
  const [comment, setComment] = createSignal('');
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [targetDifficulty, setTargetDifficulty] = createSignal(0);

  const reportTypes = getAllReportTypes();

  const handleClose = () => {
    // Cancel mining if active
    if (mining.miningState().mining && isSubmitting()) {
      debug('[ReportModal] Cancelling active mining session');
      mining.stopMining();
    }

    // Reset state
    setSelectedReason('spam');
    setComment('');
    setIsSubmitting(false);
    setError(null);

    props.onClose();
  };

  const handleSubmit = async () => {
    const currentUser = user();
    if (!currentUser) {
      setError('You must be logged in to report');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Build report input
      const reportInput: ReportInput = {
        eventId: props.eventId,
        pubkey: props.eventId ? props.authorPubkey : props.pubkey, // Author for notes, target for profiles
        reason: selectedReason(),
        targetKind: props.targetKind,
        comment: comment().trim() || undefined,
      };

      debug('[ReportModal] Building report event:', reportInput);

      // Build unsigned event
      const unsignedEvent = buildReportEvent(reportInput, currentUser.pubkey);

      // Get target difficulty from preferences (use root note difficulty for reports)
      const prefs = preferences.preferences();
      const difficulty = prefs.powDifficultyRootNote || 21;
      setTargetDifficulty(difficulty);

      debug('[ReportModal] Starting mining with difficulty:', difficulty);

      // Mine the event
      const minedEvent = await mining.startMining({
        content: unsignedEvent.content,
        pubkey: unsignedEvent.pubkey,
        tags: unsignedEvent.tags,
        difficulty,
        kind: 1984,
      });

      if (!minedEvent) {
        throw new Error('Mining was cancelled or failed');
      }

      debug('[ReportModal] Mining completed, publishing report');

      // Get user relays
      const { getUserOutboxRelays, DEFAULT_POW_RELAY } = await import('../lib/applesauce');
      const userRelays = await getUserOutboxRelays(currentUser.pubkey);
      const targetRelays = userRelays.length > 0 ? userRelays : [DEFAULT_POW_RELAY];

      // Add to publishing queue
      publishing.addPublishJob({
        eventTemplate: minedEvent,
        relays: targetRelays,
        meta: {
          kind: 1984,
          difficulty,
          type: 'report',
        },
      });

      debug('[ReportModal] Report added to publishing queue');

      // Show success message (could use toast here)
      console.log('✓ Report submitted successfully');

      // Close modal
      handleClose();
    } catch (err: any) {
      console.error('[ReportModal] Failed to submit report:', err);
      setError(err.message || 'Failed to submit report');
      setIsSubmitting(false);
    }
  };

  // Don't render if not open
  if (!props.isOpen) return null;

  const miningState = mining.miningState();
  const isReportingNote = !!props.eventId;

  return (
    <Portal>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
        onClick={(e) => {
          // Close if clicking backdrop
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
          {/* Header */}
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
              Report {isReportingNote ? 'Note' : 'Profile'}
            </h2>
            <button
              onClick={handleClose}
              class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              disabled={isSubmitting() && miningState.mining}
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div class="space-y-4">
            {/* Reason Selection */}
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Reason for report *
              </label>
              <select
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                value={selectedReason()}
                onChange={(e) => setSelectedReason(e.currentTarget.value as ReportType)}
                disabled={isSubmitting()}
              >
                <For each={reportTypes}>
                  {(type) => (
                    <option value={type.value}>
                      {type.label}
                    </option>
                  )}
                </For>
              </select>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {reportTypes.find(t => t.value === selectedReason())?.description}
              </p>
            </div>

            {/* Comment */}
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Additional details (optional)
              </label>
              <textarea
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows="3"
                placeholder="Explain why you're reporting this..."
                value={comment()}
                onInput={(e) => setComment(e.currentTarget.value)}
                disabled={isSubmitting()}
              />
            </div>

            {/* Mining Progress */}
            <Show when={isSubmitting() && miningState.mining}>
              <div class="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-md p-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Mining proof-of-work...
                  </span>
                  <span class="text-xs text-blue-700 dark:text-blue-300">
                    {miningState.overallBestPow ?? 0} / {targetDifficulty()} bits
                  </span>
                </div>
                <div class="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                  <div
                    class="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ((miningState.overallBestPow ?? 0) / targetDifficulty()) * 100)}%`,
                    }}
                  />
                </div>
                <Show when={miningState.hashRate > 0}>
                  <p class="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    {(miningState.hashRate / 1000).toFixed(1)} kH/s
                  </p>
                </Show>
              </div>
            </Show>

            {/* Error */}
            <Show when={error()}>
              <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-3">
                <p class="text-sm text-red-800 dark:text-red-200">{error()}</p>
              </div>
            </Show>

            {/* Info */}
            <div class="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
              <p class="text-xs text-gray-600 dark:text-gray-400">
                Reports are published to your relays to signal that content may be objectionable.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div class="flex gap-3 mt-6">
            <button
              onClick={handleClose}
              class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              disabled={isSubmitting() && miningState.mining}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              class="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              disabled={isSubmitting()}
            >
              {isSubmitting() && miningState.mining ? 'Mining...' : 'Submit Report'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};
