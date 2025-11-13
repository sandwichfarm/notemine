import { Component, createSignal, Show } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { useQueue } from '../providers/QueueProvider';
import { MentionAutocomplete } from './MentionAutocomplete';
import { debug } from '../lib/debug';

const CLIENT_TAG = 'notemine.io';

export const NoteComposer: Component = () => {
  const { preferences, updatePreference } = usePreferences();
  const maxContentLength = () => preferences().maxContentLengthRootNote;

  const [content, setContent] = createSignal('');
  const [difficulty, setDifficulty] = createSignal(preferences().powDifficultyRootNote);
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
    updatePreference('powDifficultyRootNote', newDifficulty);
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setQueueSuccess(false);

    const currentUser = user();
    if (!currentUser) {
      console.error('[NoteComposer] No user authenticated');
      return;
    }

    try {
      debug('[NoteComposer] Adding note to mining queue...');

      // Add to queue
      addToQueue({
        type: 'note',
        content: content().trim(),
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: [['client', CLIENT_TAG]],
        kind: 1,
      });

      // Success!
      setQueueSuccess(true);
      setContent('');
      debug('[NoteComposer] Note added to queue');

      // Reset success message after 2 seconds
      setTimeout(() => setQueueSuccess(false), 2000);
    } catch (error) {
      console.error('[NoteComposer] Error:', error);
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
    <div class="w-full max-w-2xl mx-auto p-4 bg-transparent border-0 rounded-lg relative">
      <form onSubmit={handleSubmit}>
        {/* Textarea */}
        <div class="mb-4 relative">
          <textarea
            ref={textareaRef}
            class="
            w-full 
            p-3 
            bg-[var(--bg-secondary)] 
            text-[var(--text-primary)] 
            border-0
            focus:outline-none 
            focus:ring-0 
            resize-none 
            placeholder:opacity-40  
            placeholder:font-mono
            font-mono
            rounded-0 
            border 
            border-2 
            border-black 
            shadow-[0.5rem_0.5rem_rgba(0,0,0,0.6)]"            placeholder={`What's on your mind? (${maxContentLength()} chars max, POW required, use @ to mention users)`}
            rows={4}
            value={content()}
            onInput={handleContentChange}
            maxLength={maxContentLength()}
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
          />
        </div>

        {/* Success message */}
        <Show when={queueSuccess()}>
          <div class="mb-4 p-3 bg-green-100 dark:bg-green-900/20 border border-green-500 text-green-700 dark:text-green-400 rounded-lg text-sm">
            ✅ Note added to mining queue!
          </div>
        </Show>

        {/* Buttons */}
        <div class="flex gap-2">
          <button
            type="submit"
            disabled={!canSubmit()}
            class="
            flex-1 
            px-4 
            py-2 
            bg-accent 
            text-white 
            rounded-lg 
            font-medium 
            hover:opacity-90 
            transition-opacity 
            disabled:opacity-50 
            disabled:cursor-not-allowed"
          >
            Add to Queue
          </button>
        </div>
      </form>
    </div>
  );
};
