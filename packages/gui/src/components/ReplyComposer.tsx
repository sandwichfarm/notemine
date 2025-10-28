import { Component, createSignal, Show } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { useQueue } from '../providers/QueueProvider';
import type { NostrEvent } from 'nostr-tools/core';
import { MentionAutocomplete } from './MentionAutocomplete';
import { debug } from '../lib/debug';
import { getEventRelayHint, addRelayHintToETag, addRelayHintToPTag } from '../lib/inbox-outbox';

const CLIENT_TAG = 'notemine.io';

interface ReplyComposerProps {
  parentEvent: NostrEvent;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReplyComposer: Component<ReplyComposerProps> = (props) => {
  const { preferences, updatePreference } = usePreferences();
  const maxContentLength = () => preferences().maxContentLengthReply;

  const [content, setContent] = createSignal('');
  const [difficulty, setDifficulty] = createSignal(preferences().powDifficultyReply);
  const [queueSuccess, setQueueSuccess] = createSignal(false);
  const [showMentionAutocomplete, setShowMentionAutocomplete] = createSignal(false);
  const [mentionQuery, setMentionQuery] = createSignal('');
  const [mentionPosition, setMentionPosition] = createSignal({ top: 0, left: 0 });
  const [mentionStartIndex, setMentionStartIndex] = createSignal(-1);
  let textareaRef: HTMLTextAreaElement | undefined;

  const { user } = useUser();
  const { addToQueue } = useQueue();

  const remainingChars = () => maxContentLength() - content().length;
  const canSubmit = () => {
    return (
      content().trim().length > 0 &&
      content().length <= maxContentLength() &&
      user()
    );
  };

  // Save difficulty preference when changed
  const handleDifficultyChange = (newDifficulty: number) => {
    setDifficulty(newDifficulty);
    updatePreference('powDifficultyReply', newDifficulty);
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setQueueSuccess(false);

    const currentUser = user();
    if (!currentUser) {
      console.error('[ReplyComposer] No user authenticated');
      return;
    }

    try {
      debug('[ReplyComposer] Adding reply to mining queue...');

      // Build reply tags with relay hints
      const parentRelayHint = getEventRelayHint(props.parentEvent.id);

      const replyTags: string[][] = [
        addRelayHintToETag(props.parentEvent.id, parentRelayHint, 'reply'),
        addRelayHintToPTag(props.parentEvent.pubkey, parentRelayHint),
        ['client', CLIENT_TAG],
      ];

      // If parent has 'e' tags, preserve the root with its relay hint
      const parentETags = props.parentEvent.tags.filter((t) => t[0] === 'e');
      if (parentETags.length > 0) {
        // First e tag is root
        const rootTag = parentETags[0];
        if (rootTag[1] !== props.parentEvent.id) {
          const rootRelayHint = rootTag[2] || undefined;
          replyTags.unshift(addRelayHintToETag(rootTag[1], rootRelayHint, 'root'));
        }
      }

      // Add to queue
      addToQueue({
        type: 'reply',
        content: content().trim(),
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: replyTags,
        kind: 1,
        metadata: {
          targetEventId: props.parentEvent.id,
          targetAuthor: props.parentEvent.pubkey,
        },
      });

      // Success!
      setQueueSuccess(true);
      setContent('');
      debug('[ReplyComposer] Reply added to queue');

      props.onSuccess?.();

      // Close modal after success
      setTimeout(() => props.onClose(), 1500);
    } catch (error) {
      console.error('[ReplyComposer] Error:', error);
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
  const handleMentionSelect = (npub: string) => {
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
    <div
      class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
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
          <div class="relative">
            <textarea
              ref={textareaRef}
              class="w-full p-3 bg-[var(--bg-secondary)] text-[var(--text-primary)] border-0 rounded-lg focus:outline-none focus:ring-0 resize-none font-sans placeholder:opacity-40"
              placeholder={`Write your reply... (${maxContentLength()} chars max, POW required, use @ to mention users)`}
              rows={6}
              value={content()}
              onInput={handleContentChange}
              maxLength={maxContentLength()}
              autofocus
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
          <div>
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
            />
          </div>

          {/* Success message */}
          <Show when={queueSuccess()}>
            <div class="p-3 bg-green-100 dark:bg-green-900/20 border border-green-500 text-green-700 dark:text-green-400 rounded-lg text-sm">
              ✅ Reply added to mining queue!
            </div>
          </Show>

          {/* Buttons */}
          <div class="flex gap-2">
            <button
              type="submit"
              disabled={!canSubmit()}
              class="flex-1 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add to Queue
            </button>

            <button
              type="button"
              onClick={props.onClose}
              class="px-4 py-2 btn"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
