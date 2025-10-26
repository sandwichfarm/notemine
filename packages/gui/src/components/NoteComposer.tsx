import { Component, createSignal, Show, createEffect } from 'solid-js';
import { usePowMining } from '../hooks/usePowMining';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { relayPool, getPublishRelays, getUserOutboxRelays } from '../lib/applesauce';
import { finalizeEvent } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/core';
import { MentionAutocomplete } from './MentionAutocomplete';

const CLIENT_TAG = 'notemine.io';

export const NoteComposer: Component = () => {
  const { preferences, updatePreference } = usePreferences();
  const maxContentLength = () => preferences().maxContentLengthRootNote;

  const [content, setContent] = createSignal('');
  const [difficulty, setDifficulty] = createSignal(preferences().powDifficultyRootNote);
  const [publishing, setPublishing] = createSignal(false);
  const [publishError, setPublishError] = createSignal<string | null>(null);
  const [publishSuccess, setPublishSuccess] = createSignal(false);
  const [showMentionAutocomplete, setShowMentionAutocomplete] = createSignal(false);
  const [mentionQuery, setMentionQuery] = createSignal('');
  const [mentionPosition, setMentionPosition] = createSignal({ top: 0, left: 0 });
  const [mentionStartIndex, setMentionStartIndex] = createSignal(-1);
  let textareaRef: HTMLTextAreaElement | undefined;

  const { user } = useUser();
  const { state: miningState, startMining, stopMining } = usePowMining();

  const remainingChars = () => maxContentLength() - content().length;
  const canSubmit = () => {
    return (
      content().trim().length > 0 &&
      content().length <= maxContentLength() &&
      user() &&
      !miningState().mining &&
      !publishing()
    );
  };

  // Save difficulty preference when changed
  const handleDifficultyChange = (newDifficulty: number) => {
    setDifficulty(newDifficulty);
    updatePreference('powDifficultyRootNote', newDifficulty);
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

      // Publish to relays (using NIP-65 outbox relays or localhost in dev)
      setPublishing(true);
      const outboxRelays = await getUserOutboxRelays(currentUser.pubkey);
      const publishRelays = getPublishRelays(outboxRelays);
      console.log('[NoteComposer] Publishing to relays:', publishRelays);

      const promises = publishRelays.map(async (relayUrl) => {
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

  // Helper to get cursor coordinates in textarea
  const getCursorCoordinates = (textarea: HTMLTextAreaElement, position: number) => {
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);

    // Copy relevant styles
    ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight',
     'padding', 'border', 'width'].forEach(prop => {
      div.style[prop as any] = style[prop as any];
    });

    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';

    const textBeforeCursor = textarea.value.substring(0, position);
    div.textContent = textBeforeCursor;

    const span = document.createElement('span');
    span.textContent = textarea.value.substring(position) || '.';
    div.appendChild(span);

    document.body.appendChild(div);
    const coordinates = {
      top: span.offsetTop,
      left: span.offsetLeft,
    };
    document.body.removeChild(div);

    return coordinates;
  };

  // Detect @ mentions and show autocomplete
  const handleContentChange = (e: InputEvent) => {
    const textarea = e.currentTarget as HTMLTextAreaElement;
    const newContent = textarea.value;
    setContent(newContent);

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = newContent.slice(0, cursorPos);

    // Find the last @ symbol before cursor
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Check if @ is at start or preceded by whitespace
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      const isValidMention = charBeforeAt === ' ' || charBeforeAt === '\n' || lastAtIndex === 0;

      if (isValidMention) {
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
        // Check if there's no whitespace after @
        if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
          setMentionQuery(textAfterAt);
          setMentionStartIndex(lastAtIndex);
          setShowMentionAutocomplete(true);

          // Calculate position near cursor
          const rect = textarea.getBoundingClientRect();
          const cursorCoords = getCursorCoordinates(textarea, cursorPos);

          setMentionPosition({
            top: rect.top + cursorCoords.top + 20,
            left: rect.left + cursorCoords.left,
          });
          return;
        }
      }
    }

    // Hide autocomplete if no valid @ mention
    setShowMentionAutocomplete(false);
  };

  // Handle mention selection
  const handleMentionSelect = (npub: string, displayName: string) => {
    const currentContent = content();
    const startIdx = mentionStartIndex();

    if (startIdx === -1) return;

    // Replace @query with @npub
    const before = currentContent.slice(0, startIdx);
    const after = currentContent.slice(startIdx + 1 + mentionQuery().length);
    const newContent = `${before}@${npub}${after}`;

    setContent(newContent);
    setShowMentionAutocomplete(false);

    // Focus back on textarea
    if (textareaRef) {
      textareaRef.focus();
      const newCursorPos = startIdx + npub.length + 1;
      textareaRef.setSelectionRange(newCursorPos, newCursorPos);
    }
  };

  return (
    <div class="w-full max-w-2xl mx-auto p-4 bg-transparent border-0 rounded-lg relative">
      <form onSubmit={handleSubmit}>
        {/* Textarea */}
        <div class="mb-4 relative">
          <textarea
            ref={textareaRef}
            class="w-full p-3 bg-[var(--bg-secondary)] text-[var(--text-primary)] border-0 rounded-lg focus:outline-none focus:ring-0 resize-none font-sans placeholder:opacity-40"
            placeholder={`What's on your mind? (${maxContentLength()} chars max, POW required, use @ to mention users)`}
            rows={4}
            value={content()}
            onInput={handleContentChange}
            maxLength={maxContentLength()}
            disabled={miningState().mining || publishing()}
          />

          {/* Mention Autocomplete */}
          <Show when={showMentionAutocomplete()}>
            <MentionAutocomplete
              top={mentionPosition().top}
              left={mentionPosition().left}
              query={mentionQuery()}
              onSelect={handleMentionSelect}
              onClose={() => setShowMentionAutocomplete(false)}
            />
          </Show>
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
          <label class="block text-sm font-medium text-text-secondary opacity-60 mb-2">
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
            disabled={miningState().mining || publishing()}
          />
        </div>

        {/* Mining stats */}
        <Show when={miningState().mining}>
          <div class="mb-4 p-3 bg-bg-primary dark:bg-bg-tertiary border border-border rounded-lg">
            <div class="text-sm text-text-primary space-y-1">
              <div>⛏️ Mining in progress...</div>
              <div>Hash rate: {miningState().hashRate.toFixed(2)} KH/s ({(miningState().hashRate / 1000).toFixed(2)} MH/s)</div>
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
