import { Component, createSignal, Show, For, onCleanup, createEffect } from 'solid-js';
import { useRelatrSearch } from '../hooks/useRelatr';
import { useProfile } from '../hooks/useProfile';
import { nip19 } from 'nostr-tools';
import { debug } from '../lib/debug';

interface MentionAutocompleteProps {
  /** Position from the top of the textarea */
  top: number;
  /** Position from the left of the textarea */
  left: number;
  /** Search query (without the @ symbol) */
  query: string;
  /** Callback when a user is selected */
  onSelect: (npub: string, displayName: string) => void;
  /** Callback when autocomplete should close */
  onClose: () => void;
}

interface SearchResult {
  pubkey: string;
  trustScore: number;
  rank: number;
}

// Component for individual result that can use hooks
const MentionResultItem: Component<{
  result: SearchResult;
  isSelected: boolean;
  onSelect: (npub: string, displayName: string) => void;
}> = (props) => {
  const npub = nip19.npubEncode(props.result.pubkey);
  const profile = useProfile(props.result.pubkey);

  const displayName = () => {
    const name = profile()?.metadata?.display_name
      || profile()?.metadata?.name
      || `${props.result.pubkey.slice(0, 8)}...`;
    debug('[MentionResultItem]', props.result.pubkey.slice(0, 8), 'displayName:', name, 'profile:', profile());
    return name;
  };

  const picture = () => profile()?.metadata?.picture;
  const nip05 = () => profile()?.metadata?.nip05;

  return (
    <button
      class="w-full px-3 py-2 flex items-center gap-3 hover:bg-[var(--bg-secondary)] dark:hover:bg-bg-tertiary transition-colors"
      classList={{
        'bg-[var(--bg-secondary)] dark:bg-bg-tertiary': props.isSelected,
      }}
      onClick={() => props.onSelect(npub, displayName())}
    >
      {/* Avatar */}
      <Show when={picture()} fallback={
        <div class="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm">
          {displayName()[0]?.toUpperCase() || '?'}
        </div>
      }>
        <img
          src={picture()}
          alt={displayName()}
          class="w-10 h-10 rounded-full object-cover"
        />
      </Show>

      {/* User Info */}
      <div class="flex-1 text-left min-w-0">
        <div class="text-sm font-medium text-[var(--text-primary)] truncate">
          {displayName()}
        </div>
        <Show when={nip05()}>
          <div class="text-xs text-[var(--text-secondary)] truncate">
            {nip05()}
          </div>
        </Show>
      </div>

      {/* Trust Score */}
      <div class="text-xs text-[var(--accent)] font-mono">
        {(props.result.trustScore * 100).toFixed(0)}%
      </div>
    </button>
  );
};

export const MentionAutocomplete: Component<MentionAutocompleteProps> = (props) => {
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [results, setResults] = createSignal<SearchResult[]>([]);
  const { searchProfiles, searching } = useRelatrSearch();

  // Search for profiles when query changes
  createEffect(async () => {
    const query = props.query;
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    debug('[MentionAutocomplete] Searching for:', query);
    const searchResults = await searchProfiles(query, 5);
    debug('[MentionAutocomplete] Search results:', searchResults);
    setResults(searchResults);
    setSelectedIndex(0);
  });

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    const resultsList = results();
    if (resultsList.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % resultsList.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + resultsList.length) % resultsList.length);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
    }
  };

  // Attach keyboard listener
  document.addEventListener('keydown', handleKeyDown);
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div
      class="fixed bg-[var(--bg-primary)] dark:bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 w-80 max-h-60 overflow-y-auto"
      style={{
        top: `${props.top}px`,
        left: `${props.left}px`,
      }}
    >
      <Show when={searching()}>
        <div class="p-3 text-sm text-[var(--text-secondary)] text-center">
          Searching...
        </div>
      </Show>

      <Show when={!searching() && results().length === 0}>
        <div class="p-3 text-sm text-[var(--text-secondary)] text-center">
          No users found
        </div>
      </Show>

      <Show when={!searching() && results().length > 0}>
        <div class="py-1">
          <For each={results()}>
            {(result, index) => (
              <MentionResultItem
                result={result}
                isSelected={index() === selectedIndex()}
                onSelect={props.onSelect}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
