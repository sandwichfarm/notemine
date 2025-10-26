import { Component, createSignal, onMount, For, Show, createEffect } from 'solid-js';
import { relayPool, getPowRelays, DEFAULT_POW_RELAY } from '../lib/applesauce';
import { relayStatsTracker } from '../lib/relay-stats';

interface RelayStatus {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  eventCount: number;
  error?: string;
}

export const RelayStats: Component = () => {
  const [relayStatuses, setRelayStatuses] = createSignal<RelayStatus[]>([]);
  const [loading, setLoading] = createSignal(true);

  const updateRelayStats = async () => {
    // Get all relay URLs
    const allRelays = [DEFAULT_POW_RELAY, ...getPowRelays()];

    // Check status of each relay
    const statuses = await Promise.all(
      allRelays.map(async (url) => {
        try {
          const relay = relayPool.relay(url);
          const stats = relayStatsTracker.getRelayStats(url);

          return {
            url,
            status: relay.connected ? 'connected' : 'disconnected',
            eventCount: stats?.eventCount || 0,
          } as RelayStatus;
        } catch (error) {
          return {
            url,
            status: 'error',
            error: String(error),
            eventCount: 0,
          } as RelayStatus;
        }
      })
    );

    setRelayStatuses(statuses);
  };

  onMount(async () => {
    await updateRelayStats();
    setLoading(false);

    // Update stats every 2 seconds
    const interval = setInterval(() => {
      updateRelayStats();
    }, 2000);

    return () => clearInterval(interval);
  });

  const connectedCount = () =>
    relayStatuses().filter(r => r.status === 'connected').length;

  const totalCount = () => relayStatuses().length;

  return (
    <div class="space-y-6">
      {/* Summary Cards */}
      <div class="grid md:grid-cols-3 gap-4">
        <div class="card p-6 text-center">
          <div class="text-3xl font-bold text-accent mb-2">
            {connectedCount()}
          </div>
          <div class="text-sm text-text-secondary">Connected Relays</div>
        </div>

        <div class="card p-6 text-center">
          <div class="text-3xl font-bold text-text-primary mb-2">
            {totalCount()}
          </div>
          <div class="text-sm text-text-secondary">Total Relays</div>
        </div>

        <div class="card p-6 text-center">
          <div class="text-3xl font-bold text-cyber-400 mb-2">
            16+
          </div>
          <div class="text-sm text-text-secondary">Min POW Difficulty</div>
        </div>
      </div>

      {/* Relay List */}
      <div class="card p-6">
        <h2 class="text-xl font-bold mb-4">POW Relay Network</h2>

        <Show when={loading()} fallback={
          <div class="space-y-3">
            <For each={relayStatuses()}>
              {(relay) => (
                <div class="flex items-center justify-between p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg border border-border">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    {/* Status indicator */}
                    <div
                      class="w-3 h-3 rounded-full flex-shrink-0"
                      classList={{
                        'bg-green-500 animate-pulse': relay.status === 'connected',
                        'bg-yellow-500': relay.status === 'connecting',
                        'bg-gray-500': relay.status === 'disconnected',
                        'bg-red-500': relay.status === 'error',
                      }}
                    />

                    {/* Relay URL */}
                    <div class="flex-1 min-w-0">
                      <div class="font-mono text-sm truncate">
                        {relay.url}
                      </div>
                      <div class="flex items-center gap-2 mt-1">
                        <Show when={relay.url === DEFAULT_POW_RELAY}>
                          <span class="text-xs text-accent">Default Relay</span>
                        </Show>
                        <Show when={relay.eventCount > 0}>
                          <span class="text-xs text-text-secondary">
                            📊 {relay.eventCount} events
                          </span>
                        </Show>
                      </div>
                      <Show when={relay.error}>
                        <div class="text-xs text-red-500">{relay.error}</div>
                      </Show>
                    </div>
                  </div>

                  <div class="flex items-center gap-3">
                    {/* Event count badge */}
                    <Show when={relay.eventCount > 0}>
                      <div class="text-xs px-2 py-1 rounded bg-accent/20 text-accent font-mono font-bold">
                        {relay.eventCount}
                      </div>
                    </Show>

                    {/* Status badge */}
                    <div
                      class="text-xs px-2 py-1 rounded font-medium"
                      classList={{
                        'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400': relay.status === 'connected',
                        'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400': relay.status === 'connecting',
                        'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400': relay.status === 'disconnected',
                        'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400': relay.status === 'error',
                      }}
                    >
                      {relay.status}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        }>
          <div class="text-center py-8 text-text-secondary">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent mb-4"></div>
            <p>Loading relay information...</p>
          </div>
        </Show>
      </div>

      {/* Info Cards */}
      <div class="grid md:grid-cols-2 gap-4">
        <div class="card p-6">
          <h3 class="font-bold mb-3 flex items-center gap-2">
            <span>⚙️</span>
            <span>Relay Configuration</span>
          </h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-text-secondary">Max Kind 1 Events:</dt>
              <dd class="font-mono">1,000</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-text-secondary">Retention Algorithm:</dt>
              <dd class="font-mono">POW + Time Decay</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-text-secondary">Pruning Interval:</dt>
              <dd class="font-mono">1 hour</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-text-secondary">Cascade Deletion:</dt>
              <dd class="font-mono text-green-500">Enabled</dd>
            </div>
          </dl>
        </div>

        <div class="card p-6">
          <h3 class="font-bold mb-3 flex items-center gap-2">
            <span>📊</span>
            <span>Retention Scoring</span>
          </h3>
          <div class="text-sm space-y-3 text-text-secondary">
            <div>
              <div class="font-mono text-xs mb-1 text-text-primary">
                score = rootPOW + reactionsPOW + (replies × 0.5)
              </div>
              <div class="text-xs">
                Higher POW content stays longer
              </div>
            </div>
            <div>
              <div class="font-mono text-xs mb-1 text-text-primary">
                decayed = score × exp(-0.1 × days)
              </div>
              <div class="text-xs">
                Exponential time decay favors fresh content
              </div>
            </div>
            <div class="mt-3 p-3 bg-accent/10 rounded text-xs">
              💡 Post with high POW to maximize retention time
            </div>
          </div>
        </div>
      </div>

      {/* Discovery Info */}
      <div class="card p-6 bg-gradient-to-r from-cyber-900/20 to-matrix-900/20 border-accent/20">
        <h3 class="font-bold mb-2 flex items-center gap-2">
          <span>🔍</span>
          <span>NIP-66 Discovery</span>
        </h3>
        <p class="text-sm text-text-secondary mb-3">
          POW relays are automatically discovered using NIP-66 (Relay Monitor) from relay.nostr.watch
        </p>
        <div class="flex items-center gap-2 text-xs">
          <span class="px-2 py-1 bg-accent/20 rounded font-mono">kind: 30166</span>
          <span class="px-2 py-1 bg-accent/20 rounded font-mono">#R: pow</span>
          <span class="text-text-tertiary">→</span>
          <span class="text-accent">{getPowRelays().length} relays discovered</span>
        </div>
      </div>
    </div>
  );
};
