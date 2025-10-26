import { Component, createSignal, Show } from 'solid-js';
import { usePowMining } from '../hooks/usePowMining';
import { useUser } from '../providers/UserProvider';
import { relayPool, getActiveRelays } from '../lib/applesauce';
import { finalizeEvent } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/core';

const MAX_CONTENT_LENGTH = 140;
const DEFAULT_DIFFICULTY = 20;
const CLIENT_TAG = 'notemine.io';

export const NoteComposer: Component = () => {
  const [content, setContent] = createSignal('');
  const [difficulty, setDifficulty] = createSignal(DEFAULT_DIFFICULTY);
  const [publishing, setPublishing] = createSignal(false);
  const [publishError, setPublishError] = createSignal<string | null>(null);
  const [publishSuccess, setPublishSuccess] = createSignal(false);

  const { user } = useUser();
  const { state: miningState, startMining, stopMining } = usePowMining();

  const remainingChars = () => MAX_CONTENT_LENGTH - content().length;
  const canSubmit = () => {
    return (
      content().trim().length > 0 &&
      content().length <= MAX_CONTENT_LENGTH &&
      user() &&
      !miningState().mining &&
      !publishing()
    );
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setPublishError(null);
    setPublishSuccess(false);

    const currentUser = user();
    if (!currentUser) {
      setPublishError('No user authenticated');
      return;
    }

    try {
      console.log('[NoteComposer] Starting POW mining...');

      // Start mining with POW
      const minedEvent = await startMining({
        content: content().trim(),
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: [['client', CLIENT_TAG]],
        kind: 1,
      });

      if (!minedEvent) {
        throw new Error('Mining failed: no event returned');
      }

      console.log('[NoteComposer] POW mining complete, publishing...');

      // Sign the event if user is anonymous (has secret key)
      let signedEvent: NostrEvent;
      if (currentUser.isAnon && currentUser.secret) {
        signedEvent = finalizeEvent(minedEvent as any, currentUser.secret);
      } else if (window.nostr) {
        // Use NIP-07 extension for signing
        signedEvent = await window.nostr.signEvent(minedEvent);
      } else {
        throw new Error('Cannot sign event: no signing method available');
      }

      // Publish to relays
      setPublishing(true);
      const activeRelays = getActiveRelays();
      console.log('[NoteComposer] Publishing to relays:', activeRelays);

      const promises = activeRelays.map(async (relayUrl) => {
        const relay = relayPool.relay(relayUrl);
        return relay.publish(signedEvent);
      });

      await Promise.allSettled(promises);

      // Success!
      setPublishSuccess(true);
      setContent('');
      console.log('[NoteComposer] Note published successfully');

      // Reset success message after 3 seconds
      setTimeout(() => setPublishSuccess(false), 3000);
    } catch (error) {
      console.error('[NoteComposer] Error:', error);
      setPublishError(String(error));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div class="w-full max-w-2xl mx-auto p-4 bg-bg-secondary dark:bg-bg-primary border border-border rounded-lg">
      <form onSubmit={handleSubmit}>
        {/* Textarea */}
        <div class="mb-4">
          <textarea
            class="w-full p-3 bg-bg-primary dark:bg-bg-secondary text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent resize-none font-mono"
            placeholder={`What's on your mind? (${MAX_CONTENT_LENGTH} chars max, POW required)`}
            rows={4}
            value={content()}
            onInput={(e) => setContent(e.currentTarget.value)}
            maxLength={MAX_CONTENT_LENGTH}
            disabled={miningState().mining || publishing()}
          />
          <div
            class="text-sm mt-1"
            classList={{
              'text-text-secondary': remainingChars() >= 20,
              'text-yellow-500': remainingChars() < 20 && remainingChars() >= 0,
              'text-red-500': remainingChars() < 0,
            }}
          >
            {remainingChars()} characters remaining
          </div>
        </div>

        {/* Difficulty slider */}
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-2">
            POW Difficulty: {difficulty()}
          </label>
          <input
            type="range"
            min="16"
            max="28"
            step="1"
            value={difficulty()}
            onInput={(e) => setDifficulty(Number(e.currentTarget.value))}
            class="w-full"
            disabled={miningState().mining || publishing()}
          />
          <div class="text-xs text-text-secondary mt-1">
            Higher difficulty = longer mining time but better anti-spam protection
          </div>
        </div>

        {/* Mining stats */}
        <Show when={miningState().mining}>
          <div class="mb-4 p-3 bg-bg-primary dark:bg-bg-tertiary border border-border rounded-lg">
            <div class="text-sm text-text-primary space-y-1">
              <div>⛏️ Mining in progress...</div>
              <div>Hash rate: {miningState().hashRate.toFixed(2)} H/s</div>
              <Show when={miningState().overallBestPow !== null}>
                <div>Best POW: {miningState().overallBestPow}</div>
              </Show>
            </div>
          </div>
        </Show>

        {/* Error message */}
        <Show when={publishError()}>
          <div class="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 rounded-lg text-sm">
            Error: {publishError()}
          </div>
        </Show>

        {/* Success message */}
        <Show when={publishSuccess()}>
          <div class="mb-4 p-3 bg-green-100 dark:bg-green-900/20 border border-green-500 text-green-700 dark:text-green-400 rounded-lg text-sm">
            ✅ Note published successfully!
          </div>
        </Show>

        {/* Buttons */}
        <div class="flex gap-2">
          <button
            type="submit"
            disabled={!canSubmit()}
            class="flex-1 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Show when={!miningState().mining && !publishing()} fallback="Mining...">
              Post
            </Show>
          </button>

          <Show when={miningState().mining}>
            <button
              type="button"
              onClick={stopMining}
              class="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Cancel
            </button>
          </Show>
        </div>
      </form>

      {/* Mining error */}
      <Show when={miningState().error}>
        <div class="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 rounded-lg text-sm">
          Mining error: {miningState().error}
        </div>
      </Show>
    </div>
  );
};
