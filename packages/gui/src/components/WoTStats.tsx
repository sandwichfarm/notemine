import { Component, createSignal, Show, For, onMount } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { getUserFollows, getUserOutboxRelays, getUserInboxRelays } from '../lib/applesauce';

interface FollowStats {
  pubkey: string;
  outboxRelays: string[];
  hasOutbox: boolean;
}

export const WoTStats: Component = () => {
  const { user } = useUser();
  const [loading, setLoading] = createSignal(false);
  const [follows, setFollows] = createSignal<string[]>([]);
  const [followStats, setFollowStats] = createSignal<FollowStats[]>([]);
  const [myInboxRelays, setMyInboxRelays] = createSignal<string[]>([]);
  const [myOutboxRelays, setMyOutboxRelays] = createSignal<string[]>([]);
  const [error, setError] = createSignal<string | null>(null);

  // Auto-load on mount if user is logged in
  onMount(() => {
    if (user()?.pubkey) {
      loadWoTStats();
    }
  });

  const loadWoTStats = async () => {
    const currentUser = user();
    if (!currentUser?.pubkey) {
      setError('No user logged in');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get follows
      const followsList = await getUserFollows(currentUser.pubkey);
      setFollows(followsList);

      // Get my inbox/outbox relays
      const inbox = await getUserInboxRelays(currentUser.pubkey);
      const outbox = await getUserOutboxRelays(currentUser.pubkey);
      setMyInboxRelays(inbox);
      setMyOutboxRelays(outbox);

      // Get outbox relays for each follow (limit to first 50)
      const followsToCheck = followsList.slice(0, 50);
      const statsPromises = followsToCheck.map(async (followPubkey) => {
        try {
          const outboxRelays = await getUserOutboxRelays(followPubkey);
          return {
            pubkey: followPubkey,
            outboxRelays,
            hasOutbox: outboxRelays.length > 0,
          };
        } catch (err) {
          return {
            pubkey: followPubkey,
            outboxRelays: [],
            hasOutbox: false,
          };
        }
      });

      const stats = await Promise.all(statsPromises);
      setFollowStats(stats);

    } catch (err) {
      console.error('[WoTStats] Error loading stats:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const followsWithOutbox = () => followStats().filter(f => f.hasOutbox).length;
  const followsWithoutOutbox = () => followStats().filter(f => !f.hasOutbox).length;
  const totalRelays = () => {
    const relaySet = new Set<string>();
    followStats().forEach(f => {
      f.outboxRelays.forEach(r => relaySet.add(r));
    });
    return relaySet.size;
  };
  const uniqueHosts = () => {
    const hostSet = new Set<string>();
    followStats().forEach(f => {
      f.outboxRelays.forEach(r => {
        try {
          const url = new URL(r);
          hostSet.add(url.host);
        } catch (e) {
          // Invalid URL, skip
        }
      });
    });
    return hostSet.size;
  };

  // Only show WoT stats to authenticated non-anonymous users
  return (
    <Show when={user() && !user()?.isAnon}>
      <div class="space-y-6">
        <div class="card">
          <h2 class="text-xl font-semibold mb-4">Web of Trust Statistics</h2>
          {/* Only show load button if no data and not loading */}
          <Show when={follows().length === 0 && !loading()}>
            <button
              onClick={loadWoTStats}
              class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80"
            >
              Load WoT Stats
            </button>
          </Show>

          {/* Loading state */}
          <Show when={loading()}>
            <div class="flex items-center gap-2 text-text-secondary">
              <div class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-accent border-t-transparent"></div>
              <span>Loading WoT statistics...</span>
            </div>
          </Show>

          <Show when={error()}>
            <div class="mt-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded">
              <p class="text-red-700 dark:text-red-400">Error: {error()}</p>
            </div>
          </Show>

          <Show when={follows().length > 0}>
            <div class="mt-6 space-y-4">
              {/* Summary Stats */}
              <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div class="card bg-bg-secondary">
                  <div class="text-2xl font-bold text-accent">{follows().length}</div>
                  <div class="text-sm text-text-secondary">Total Follows</div>
                </div>
                <div class="card bg-bg-secondary">
                  <div class="text-2xl font-bold text-green-500">{followsWithOutbox()}</div>
                  <div class="text-sm text-text-secondary">With Outbox</div>
                </div>
                <div class="card bg-bg-secondary">
                  <div class="text-2xl font-bold text-orange-500">{followsWithoutOutbox()}</div>
                  <div class="text-sm text-text-secondary">Without Outbox</div>
                </div>
                <div class="card bg-bg-secondary">
                  <div class="text-2xl font-bold text-blue-500">{totalRelays()}</div>
                  <div class="text-sm text-text-secondary">Unique Relays</div>
                </div>
                <div class="card bg-bg-secondary">
                  <div class="text-2xl font-bold text-purple-500">{uniqueHosts()}</div>
                  <div class="text-sm text-text-secondary">Unique Hosts</div>
                </div>
              </div>

              {/* My Relays */}
              <div class="card bg-bg-secondary">
                <h3 class="text-lg font-semibold mb-3">My Relays</h3>
                <div class="space-y-2">
                  <div>
                    <div class="text-sm font-medium text-text-secondary mb-1">Inbox ({myInboxRelays().length})</div>
                    <div class="text-xs font-mono space-y-1">
                      <For each={myInboxRelays()}>
                        {(relay) => <div class="text-text-tertiary">{relay}</div>}
                      </For>
                    </div>
                  </div>
                  <div class="mt-3">
                    <div class="text-sm font-medium text-text-secondary mb-1">Outbox ({myOutboxRelays().length})</div>
                    <div class="text-xs font-mono space-y-1">
                      <For each={myOutboxRelays()}>
                        {(relay) => <div class="text-text-tertiary">{relay}</div>}
                      </For>
                    </div>
                  </div>
                </div>
              </div>

              {/* Follow Details */}
              <div class="card bg-bg-secondary">
                <h3 class="text-lg font-semibold mb-3">Follow Details (First 50)</h3>
                <div class="max-h-96 overflow-y-auto space-y-2">
                  <For each={followStats()}>
                    {(stat) => (
                      <div class="border-b border-gray-700 pb-2">
                        <div class="flex items-center justify-between mb-1">
                          <code class="text-xs text-text-secondary">{stat.pubkey.slice(0, 16)}...</code>
                          <span class={`text-xs px-2 py-1 rounded ${stat.hasOutbox ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                            {stat.hasOutbox ? '✓ Has Outbox' : '✗ No Outbox'}
                          </span>
                        </div>
                        <Show when={stat.outboxRelays.length > 0}>
                          <div class="text-xs font-mono text-text-tertiary ml-4">
                            <For each={stat.outboxRelays}>
                              {(relay) => <div>→ {relay}</div>}
                            </For>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};
