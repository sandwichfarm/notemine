import { Component, createSignal, onMount, For, Show } from 'solid-js';
import {
  relayPool,
  getPowRelays,
  DEFAULT_POW_RELAY,
  getUserInboxRelaysSignal,
  getUserOutboxRelaysSignal,
  relayConnectionManager,
} from '../lib/applesauce';
import { relayStatsTracker } from '../lib/relay-stats';
import {
  getRelaySettings,
  updateRelaySettings,
  initializeRelaySettings,
  type RelaySource,
} from '../lib/relay-settings';

interface RelayStatus {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  eventCount: number;
  error?: string;
  read: boolean;
  write: boolean;
  source: RelaySource;
  immutable: boolean;
}

const Relays: Component = () => {
  const [relayStatuses, setRelayStatuses] = createSignal<RelayStatus[]>([]);
  const [loading, setLoading] = createSignal(true);

  const updateRelayStats = async () => {
    // Get user relays from signals
    const userInbox = getUserInboxRelaysSignal();
    const userOutbox = getUserOutboxRelaysSignal();

    // Build relay map with source tracking and deduplication
    // Priority: default > user > nip66
    const relayMap = new Map<string, { source: RelaySource; defaultRead: boolean; defaultWrite: boolean }>();

    // 1. Add default relay (highest priority, immutable)
    relayMap.set(DEFAULT_POW_RELAY, { source: 'default', defaultRead: true, defaultWrite: true });

    // 2. Add user relays (second priority)
    // Determine if relay is inbox, outbox, or both
    const userInboxSet = new Set(userInbox);
    const userOutboxSet = new Set(userOutbox);

    [...userInbox, ...userOutbox].forEach((url) => {
      if (!relayMap.has(url)) {
        const inInbox = userInboxSet.has(url);
        const inOutbox = userOutboxSet.has(url);

        let source: RelaySource;
        if (inInbox && inOutbox) {
          source = 'user-both';
        } else if (inInbox) {
          source = 'user-inbox';
        } else {
          source = 'user-outbox';
        }

        relayMap.set(url, {
          source,
          defaultRead: inInbox,
          defaultWrite: inOutbox,
        });
      }
    });

    // 3. Add NIP-66 POW relays (lowest priority)
    getPowRelays().forEach((url) => {
      if (!relayMap.has(url)) {
        relayMap.set(url, { source: 'nip66', defaultRead: true, defaultWrite: true });
      }
    });

    // Build status array
    const allRelays = Array.from(relayMap.entries());
    const statuses = await Promise.all(
      allRelays.map(async ([url, { source, defaultRead, defaultWrite }]) => {
        try {
          const relay = relayPool.relay(url);
          const stats = relayStatsTracker.getRelayStats(url);

          // Initialize settings with proper source and defaults
          const isDefault = url === DEFAULT_POW_RELAY;
          initializeRelaySettings(url, source, defaultRead, defaultWrite, isDefault);

          const settings = getRelaySettings(url);

          return {
            url,
            status: relay.connected ? 'connected' : 'disconnected',
            eventCount: stats?.eventCount || 0,
            read: settings.read,
            write: settings.write,
            source: settings.source || source,
            immutable: settings.immutable || false,
          } as RelayStatus;
        } catch (error) {
          const isDefault = url === DEFAULT_POW_RELAY;
          initializeRelaySettings(url, source, defaultRead, defaultWrite, isDefault);
          const settings = getRelaySettings(url);

          return {
            url,
            status: 'error',
            error: String(error),
            eventCount: 0,
            read: settings.read,
            write: settings.write,
            source: settings.source || source,
            immutable: settings.immutable || false,
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

  const handleToggleRead = (relay: RelayStatus) => {
    if (relay.immutable) {
      console.warn('[Relays] Cannot toggle read for immutable relay:', relay.url);
      return;
    }
    const settings = getRelaySettings(relay.url);
    updateRelaySettings(relay.url, !relay.read, settings.write);
    updateRelayStats();
  };

  const handleToggleWrite = (relay: RelayStatus) => {
    if (relay.immutable) {
      console.warn('[Relays] Cannot toggle write for immutable relay:', relay.url);
      return;
    }
    const settings = getRelaySettings(relay.url);
    updateRelaySettings(relay.url, settings.read, !relay.write);
    updateRelayStats();
  };

  const connectedCount = () =>
    relayStatuses().filter(r => r.status === 'connected').length;

  const totalCount = () => relayStatuses().length;

  const connectionStats = () => relayConnectionManager.getStats();

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="text-center">
        <h1 class="text-3xl font-bold mb-2">
          Relays <span class="text-[var(--accent)]">🔗</span>
        </h1>
        <p class="text-text-secondary">
          Manage your POW relay connections and preferences
        </p>
      </div>

      {/* Connection Manager Banner */}
      <div class="card p-4 bg-gradient-to-r from-accent/10 to-cyber-400/10 border border-accent/30">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-bold text-accent mb-1">Smart Connection Management Active</h3>
            <p class="text-sm text-text-secondary">
              Connected to <span class="text-accent font-bold">{connectionStats().connected}</span> of{' '}
              <span class="font-bold">{connectionStats().totalCandidates}</span> relays (capped for performance)
            </p>
            <Show when={connectionStats().coverage.totalUsers > 0}>
              <p class="text-sm text-text-secondary mt-1">
                Coverage: <span class="text-cyber-400 font-bold">{connectionStats().coverage.coveredUsers}</span> of{' '}
                <span class="font-bold">{connectionStats().coverage.totalUsers}</span> users ({connectionStats().coverage.percentage}%)
              </p>
            </Show>
          </div>
          <div class="text-right">
            <div class="text-xs text-text-secondary mb-1">Baseline</div>
            <div class="text-2xl font-bold text-accent">{connectionStats().baselineRelays}</div>
          </div>
        </div>
      </div>

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
                      <div class="flex items-center gap-2 mt-1 flex-wrap">
                        <Show when={relay.source === 'default'}>
                          <span class="text-xs text-accent font-medium">
                            Default Relay {relay.immutable ? '(Immutable)' : ''}
                          </span>
                        </Show>
                        <Show when={relay.source === 'user-inbox'}>
                          <span class="text-xs text-blue-400 font-medium">Your Inbox Relay</span>
                        </Show>
                        <Show when={relay.source === 'user-outbox'}>
                          <span class="text-xs text-green-400 font-medium">Your Outbox Relay</span>
                        </Show>
                        <Show when={relay.source === 'user-both'}>
                          <span class="text-xs text-purple-400 font-medium">Your Inbox+Outbox Relay</span>
                        </Show>
                        <Show when={relay.source === 'nip66'}>
                          <span class="text-xs text-cyan-400 font-medium">NIP-66 POW Relay</span>
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
                    {/* Read/Write toggles */}
                    <div class="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleRead(relay)}
                        disabled={relay.immutable}
                        class="text-xs px-3 py-1.5 rounded transition-colors font-medium"
                        classList={{
                          'bg-blue-500/20 text-blue-500': relay.read && !relay.immutable,
                          'bg-gray-500/20 text-gray-500': !relay.read && !relay.immutable,
                          'bg-blue-500/30 text-blue-400 cursor-not-allowed': relay.immutable && relay.read,
                          'bg-gray-500/30 text-gray-400 cursor-not-allowed': relay.immutable && !relay.read,
                        }}
                        title={
                          relay.immutable
                            ? 'Cannot modify default relay'
                            : relay.read
                              ? 'Read enabled - click to disable'
                              : 'Read disabled - click to enable'
                        }
                      >
                        Read {relay.read ? '✓' : '✗'}
                      </button>
                      <button
                        onClick={() => handleToggleWrite(relay)}
                        disabled={relay.immutable}
                        class="text-xs px-3 py-1.5 rounded transition-colors font-medium"
                        classList={{
                          'bg-green-500/20 text-green-500': relay.write && !relay.immutable,
                          'bg-gray-500/20 text-gray-500': !relay.write && !relay.immutable,
                          'bg-green-500/30 text-green-400 cursor-not-allowed': relay.immutable && relay.write,
                          'bg-gray-500/30 text-gray-400 cursor-not-allowed': relay.immutable && !relay.write,
                        }}
                        title={
                          relay.immutable
                            ? 'Cannot modify default relay'
                            : relay.write
                              ? 'Write enabled - click to disable'
                              : 'Write disabled - click to enable'
                        }
                      >
                        Write {relay.write ? '✓' : '✗'}
                      </button>
                    </div>

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

      {/* Read/Write Info */}
      <div class="card p-6 bg-gradient-to-r from-blue-900/10 to-green-900/10 border-blue-500/20">
        <h3 class="font-bold mb-2 flex items-center gap-2">
          <span>ℹ️</span>
          <span>Read/Write Settings</span>
        </h3>
        <p class="text-sm text-text-secondary mb-2">
          Control which relays to read from and write to. Settings are saved locally in your browser.
        </p>
        <ul class="text-xs text-text-secondary space-y-1">
          <li>• <span class="text-blue-400">Read</span>: Fetch events from this relay</li>
          <li>• <span class="text-green-400">Write</span>: Publish events to this relay</li>
          <li>• Settings persist across sessions</li>
        </ul>
      </div>
    </div>
  );
};

export default Relays;
