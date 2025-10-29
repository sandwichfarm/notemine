import { createSignal, Show, createMemo, onMount } from 'solid-js';
import type { RouteSectionProps } from '@solidjs/router';
import { Timeline } from '../components/Timeline';
import { WoTTimeline } from '../components/WoTTimeline';
import { useUser } from '../providers/UserProvider';

export type FeedMode = 'global' | 'wot';

export interface FeedBodyProps { showHeader?: boolean }

export const FeedBody = (props: FeedBodyProps = {}) => {
  const { user } = useUser();
  const isLoggedIn = () => !!user();
  const isAnon = () => !!user()?.isAnon;

  // Load saved feed mode from localStorage, default to 'global'
  const savedMode = (localStorage.getItem('feedMode') as FeedMode) || 'global';
  const [feedMode, setFeedMode] = createSignal<FeedMode>(savedMode);

  const handleModeChange = (mode: FeedMode) => {
    setFeedMode(mode);
    // Persist preference only for non-anon users
    if (!isAnon()) {
      localStorage.setItem('feedMode', mode);
    }
  };

  // For anon users, show Global PoW by default, selector hidden
  const effectiveMode = createMemo<FeedMode>(() => (isAnon() ? 'global' : feedMode()));

  // Ensure initial anon state shows Global and does not flash other modes
  onMount(() => {
    if (isAnon()) setFeedMode('global');
  });

  return (
    <div class="space-y-6">
      <Show when={props.showHeader ?? true}>
        <div class="text-center">
          <h1 class="text-3xl font-bold mb-2">
            Feed <span class="text-[var(--accent)]">⛏️</span>
          </h1>
          <p class="text-text-secondary">
            <Show when={effectiveMode() === 'global'} fallback="Notes from your Web of Trust • sorted by PoW + engagement">
              Notes ranked by proof-of-work • highest score first
            </Show>
          </p>
        </div>
      </Show>

      {/* Feed Mode Toggle - Hide for anon; compact styling */}
      <Show when={isLoggedIn() && !isAnon()}>
        <div class="flex justify-center">
          <div class="inline-flex items-center gap-1 rounded-md border border-gray-600 bg-[var(--bg-primary)] p-1">
            <button
              class={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                effectiveMode() === 'global'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              onClick={() => handleModeChange('global')}
            >
              Global
            </button>
            <button
              class={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                effectiveMode() === 'wot'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              onClick={() => handleModeChange('wot')}
            >
              WoT
            </button>
          </div>
        </div>
      </Show>

      {/* Show login prompt if WoT mode selected but not logged in */}
      <Show when={effectiveMode() === 'wot' && !isLoggedIn()}>
        <div class="card text-center">
          <p class="text-text-secondary mb-4">
            Web of Trust feed requires authentication
          </p>
          <p class="text-sm text-text-secondary">
            Please login to see notes from people you follow
          </p>
        </div>
      </Show>

      {/* Timeline */}
      <Show when={effectiveMode() === 'global'}>
        <Timeline
          limit={100}
          showScores={true}
        />
      </Show>

      {/* WoT Timeline */}
      <Show when={effectiveMode() === 'wot' && isLoggedIn() && user()?.pubkey}>
        <WoTTimeline
          userPubkey={user()!.pubkey}
          limit={100}
          showScores={true}
        />
      </Show>
    </div>
  );
};

// Route component wrapper so router typing remains happy
const Feed = (_: RouteSectionProps<unknown>) => {
  return <FeedBody showHeader={true} />;
};

export default Feed;
