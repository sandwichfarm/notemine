import { Component, createSignal, Show } from 'solid-js';
import { Timeline } from '../components/Timeline';
import { WoTTimeline } from '../components/WoTTimeline';
import { useUser } from '../providers/UserProvider';

export type FeedMode = 'global' | 'wot';

const Feed: Component = () => {
  const { user } = useUser();
  const isLoggedIn = () => !!user();

  // Load saved feed mode from localStorage, default to 'global'
  const savedMode = (localStorage.getItem('feedMode') as FeedMode) || 'global';
  const [feedMode, setFeedMode] = createSignal<FeedMode>(savedMode);

  const handleModeChange = (mode: FeedMode) => {
    setFeedMode(mode);
    localStorage.setItem('feedMode', mode);
  };

  return (
    <div class="space-y-6">
      <div class="text-center">
        <h1 class="text-3xl font-bold mb-2">
          Feed <span class="text-[var(--accent)]">⛏️</span>
        </h1>
        <p class="text-text-secondary">
          <Show when={feedMode() === 'global'} fallback="Notes from your Web of Trust • sorted by PoW + engagement">
            Notes ranked by proof-of-work • highest score first
          </Show>
        </p>
      </div>

      {/* Feed Mode Toggle - Only show for authenticated users */}
      <Show when={isLoggedIn() && !user()?.isAnon}>
        <div class="flex justify-center gap-3">
          <button
            class={`px-6 py-3 rounded-lg font-semibold transition-all border-2 ${
              feedMode() === 'global'
                ? 'bg-accent text-white border-accent shadow-lg scale-105'
                : 'bg-bg-primary text-text-secondary border-gray-600 hover:border-gray-400 hover:text-text-primary'
            }`}
            onClick={() => handleModeChange('global')}
          >
            Global PoW
          </button>
          <button
            class={`px-6 py-3 rounded-lg font-semibold transition-all border-2 ${
              feedMode() === 'wot'
                ? 'bg-accent text-white border-accent shadow-lg scale-105'
                : 'bg-bg-primary text-text-secondary border-gray-600 hover:border-gray-400 hover:text-text-primary'
            }`}
            onClick={() => handleModeChange('wot')}
          >
            Web of Trust
          </button>
        </div>
      </Show>

      {/* Show login prompt if WoT mode selected but not logged in */}
      <Show when={feedMode() === 'wot' && !isLoggedIn()}>
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
      <Show when={feedMode() === 'global'}>
        <Timeline
          limit={100}
          showScores={true}
        />
      </Show>

      {/* WoT Timeline */}
      <Show when={feedMode() === 'wot' && isLoggedIn() && user()?.pubkey}>
        <WoTTimeline
          userPubkey={user()!.pubkey}
          limit={100}
          showScores={true}
        />
      </Show>
    </div>
  );
};

export default Feed;
