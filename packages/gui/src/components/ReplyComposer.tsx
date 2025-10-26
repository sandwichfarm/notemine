import { Component, createSignal, Show } from 'solid-js';
import { usePowMining } from '../hooks/usePowMining';
import { useUser } from '../providers/UserProvider';
import { relayPool, getActiveRelays, getUserOutboxRelays } from '../lib/applesauce';
import { finalizeEvent } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/core';

const MAX_CONTENT_LENGTH = 280; // Replies can be longer
const DEFAULT_DIFFICULTY = 18; // Slightly lower than posts
const CLIENT_TAG = 'notemine.io';

interface ReplyComposerProps {
  parentEvent: NostrEvent;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReplyComposer: Component<ReplyComposerProps> = (props) => {
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
      console.log('[ReplyComposer] Starting POW mining for reply...');

      // Build reply tags
      const replyTags: string[][] = [
        ['e', props.parentEvent.id, '', 'reply'],
        ['p', props.parentEvent.pubkey],
        ['client', CLIENT_TAG],
      ];

      // If parent has 'e' tags, preserve the root
      const parentETags = props.parentEvent.tags.filter((t) => t[0] === 'e');
      if (parentETags.length > 0) {
        // First e tag is root
        const rootTag = parentETags[0];
        if (rootTag[1] !== props.parentEvent.id) {
          replyTags.unshift(['e', rootTag[1], '', 'root']);
        }
      }

      // Start mining with POW
      const minedEvent = await startMining({
        content: content().trim(),
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: replyTags,
        kind: 1,
      });

      if (!minedEvent) {
        throw new Error('Mining failed: no event returned');
      }

      console.log('[ReplyComposer] POW mining complete, publishing...');

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
      console.log('[ReplyComposer] Publishing to user outbox relays:', activeRelays);

      const promises = activeRelays.map(async (relayUrl) => {
        const relay = relayPool.relay(relayUrl);
        return relay.publish(signedEvent);
      });

      await Promise.allSettled(promises);

      // Success!
      setPublishSuccess(true);
      setContent('');
      console.log('[ReplyComposer] Reply published successfully');

      props.onSuccess?.();

      // Close modal after success
      setTimeout(() => props.onClose(), 1500);
    } catch (error) {
      console.error('[ReplyComposer] Error:', error);
      setPublishError(String(error));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={props.onClose}
    >
      <div class="card max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="border-b border-border p-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold">Reply with POW</h3>
            <button onClick={props.onClose} class="text-text-secondary hover:text-text-primary">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Parent note preview */}
        <div class="p-4 bg-bg-secondary dark:bg-bg-tertiary border-b border-border">
          <div class="text-xs text-text-secondary mb-1">Replying to:</div>
          <div class="text-sm text-text-primary line-clamp-3">{props.parentEvent.content}</div>
        </div>

        {/* Reply form */}
        <form onSubmit={handleSubmit} class="p-4 space-y-4">
          {/* Textarea */}
          <div>
            <textarea
              class="w-full p-3 bg-bg-primary dark:bg-bg-secondary text-text-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent resize-none font-mono"
              placeholder={`Write your reply... (${MAX_CONTENT_LENGTH} chars max, POW required)`}
              rows={6}
              value={content()}
              onInput={(e) => setContent(e.currentTarget.value)}
              maxLength={MAX_CONTENT_LENGTH}
              disabled={miningState().mining || publishing()}
              autofocus
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
          <div>
            <label class="block text-sm font-medium text-text-primary mb-2">
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
              Replies typically use lower difficulty than root posts
            </div>
          </div>

          {/* Mining stats */}
          <Show when={miningState().mining}>
            <div class="p-3 bg-bg-primary dark:bg-bg-tertiary border border-border rounded-lg">
              <div class="text-sm text-text-primary space-y-1">
                <div>⛏️ Mining reply with POW...</div>
                <div>Hash rate: {miningState().hashRate.toFixed(2)} H/s</div>
                <Show when={miningState().overallBestPow !== null}>
                  <div>Best POW: {miningState().overallBestPow}</div>
                </Show>
              </div>
            </div>
          </Show>

          {/* Error message */}
          <Show when={publishError()}>
            <div class="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 rounded-lg text-sm">
              Error: {publishError()}
            </div>
          </Show>

          {/* Success message */}
          <Show when={publishSuccess()}>
            <div class="p-3 bg-green-100 dark:bg-green-900/20 border border-green-500 text-green-700 dark:text-green-400 rounded-lg text-sm">
              ✅ Reply published successfully!
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
                Reply
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

            <button
              type="button"
              onClick={props.onClose}
              class="px-4 py-2 btn"
            >
              Close
            </button>
          </div>

          {/* Mining error */}
          <Show when={miningState().error}>
            <div class="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 rounded-lg text-sm">
              Mining error: {miningState().error}
            </div>
          </Show>
        </form>
      </div>
    </div>
  );
};
