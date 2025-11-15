import { Component, createSignal, onMount, Show, createEffect, onCleanup } from 'solid-js';
import { getStorageItem, setStorageItem } from '../lib/localStorage';
import { getCacheStats, clearCache, getCacheMetrics, getCacheHealth, forceCacheFlush, resetCacheMetrics, getBrowserCapabilities } from '../lib/cache';
import { debug } from '../lib/debug';

// Helper functions
const formatDuration = (ms: number): string => {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatTimestamp = (ts: number): string => {
  if (ts === 0) return 'Never';
  const date = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleString();
};

const getHealthColor = (status: string): string => {
  switch (status) {
    case 'healthy': return 'text-green-500';
    case 'degraded': return 'text-yellow-500';
    case 'unhealthy': return 'text-red-500';
    case 'disabled': return 'text-gray-500';
    default: return 'text-text-secondary';
  }
};

export const CacheStats: Component = () => {
  const [stats, setStats] = createSignal<{
    notes: number;
    metadata: number;
    contacts: number;
    reposts: number;
    reactions: number;
    relayLists: number;
    longForm: number;
    total: number;
  } | null>(null);
  const [metrics, setMetrics] = createSignal<ReturnType<typeof getCacheMetrics> | null>(null);
  const [health, setHealth] = createSignal<ReturnType<typeof getCacheHealth> | null>(null);
  const [capabilities, setCapabilities] = createSignal<ReturnType<typeof getBrowserCapabilities> | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [clearing, setClearing] = createSignal(false);
  const [flushing, setFlushing] = createSignal(false);
  const [resetting, setResetting] = createSignal(false);
  const [auto, setAuto] = createSignal<boolean>(getStorageItem('cache:autoRefresh', true));
  const [intervalSec, setIntervalSec] = createSignal<number>(getStorageItem('cache:autoIntervalSec', 30));
  const [countdown, setCountdown] = createSignal<number>(intervalSec());
  let countdownTimer: number | undefined;

  const loadStats = async () => {
    setLoading(true);
    try {
      const cacheStats = await getCacheStats();
      const cacheMetrics = getCacheMetrics();
      const cacheHealth = getCacheHealth();
      const browserCaps = getBrowserCapabilities(); // Phase 2: Browser capabilities
      setStats(cacheStats);
      setMetrics(cacheMetrics);
      setHealth(cacheHealth);
      setCapabilities(browserCaps);
    } catch (error) {
      console.error('[CacheStats] Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Are you sure you want to clear all cached data?')) {
      return;
    }

    setClearing(true);
    try {
      await clearCache();
      await loadStats(); // Reload stats
      debug('[CacheStats] Cache cleared successfully');
    } catch (error) {
      console.error('[CacheStats] Error clearing cache:', error);
    } finally {
      setClearing(false);
    }
  };

  const handleForceFlush = async () => {
    setFlushing(true);
    try {
      await forceCacheFlush();
      await loadStats();
      debug('[CacheStats] Force flush completed');
      // Auto-refresh shortly after to capture any late writes/compaction
      setTimeout(() => {
        loadStats();
      }, 1500);
    } catch (error) {
      console.error('[CacheStats] Error forcing flush:', error);
    } finally {
      setFlushing(false);
    }
  };

  const handleResetMetrics = async () => {
    setResetting(true);
    try {
      resetCacheMetrics();
      await loadStats();
      debug('[CacheStats] Metrics reset');
    } catch (error) {
      console.error('[CacheStats] Error resetting metrics:', error);
    } finally {
      setResetting(false);
    }
  };

  // Countdown + auto-refresh loop
  createEffect(() => {
    // Reset countdown when interval changes
    setCountdown(intervalSec());
  });

  // Persist settings when they change
  createEffect(() => {
    setStorageItem('cache:autoRefresh', auto());
  });
  createEffect(() => {
    setStorageItem('cache:autoIntervalSec', intervalSec());
  });

  const tick = () => {
    if (!auto()) return;
    if (loading()) return; // avoid piling up
    const next = countdown() - 1;
    if (next <= 0) {
      setCountdown(intervalSec());
      // Fire refresh; do not await to keep timer smooth
      void loadStats();
    } else {
      setCountdown(next);
    }
  };

  onMount(() => {
    countdownTimer = window.setInterval(tick, 1000);
  });

  onCleanup(() => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = undefined;
    }
  });

  onMount(() => {
    loadStats();
  });

  return (
    <div class="card">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xl font-bold">Local Cache</h2>
        <div class="flex items-center gap-2">
          <button
            onClick={handleResetMetrics}
            disabled={loading() || resetting()}
            class="btn text-xs"
            title="Reset diagnostic metrics"
          >
            {resetting() ? '🧹 Resetting…' : '🧹 Reset'}
          </button>
          <button
            onClick={handleForceFlush}
            disabled={loading() || flushing()}
            class="btn text-xs"
            title="Force flush pending writes"
          >
            {flushing() ? '⚡ Flushing…' : '⚡ Flush'}
          </button>
          <button
            onClick={loadStats}
            disabled={loading()}
            class="btn text-xs"
            title="Refresh stats"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Auto-refresh controls and countdown */}
      <div class="flex items-center justify-between mb-4 text-xs">
        <div class="flex items-center gap-3">
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={auto()}
              onInput={(e) => setAuto((e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="text-text-secondary">Auto refresh</span>
          </label>
          <label class="inline-flex items-center gap-1">
            <span class="text-text-secondary">Every</span>
            <input
              type="number"
              min={5}
              max={3600}
              step={5}
              value={intervalSec()}
              class="input w-16 px-2 py-1 text-[var(--text-primary)]"
              onInput={(e) => {
                const v = parseInt((e.currentTarget as HTMLInputElement).value || '30', 10);
                const clamped = Math.max(5, Math.min(3600, isNaN(v) ? 30 : v));
                setIntervalSec(clamped);
                setCountdown(clamped);
              }}
            />
            <span class="text-text-secondary">s</span>
          </label>
        </div>
        <div class="text-text-secondary">
          {auto() ? `Auto refresh in ${countdown()}s` : 'Auto refresh paused'}
        </div>
      </div>

      <Show when={loading()} fallback={
        <Show when={stats()} fallback={
          <p class="text-text-secondary text-sm">Cache not available</p>
        }>
          <div class="space-y-4">
            {/* Primary stats - most important kinds */}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-2xl font-bold text-accent">{stats()!.notes}</div>
                <div class="text-xs text-text-secondary">Notes (1)</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-2xl font-bold text-accent">{stats()!.metadata}</div>
                <div class="text-xs text-text-secondary">Profiles (0)</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-2xl font-bold text-accent">{stats()!.reactions}</div>
                <div class="text-xs text-text-secondary">Reactions (7)</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-2xl font-bold text-cyber-400">{stats()!.total}</div>
                <div class="text-xs text-text-secondary font-semibold">Total</div>
              </div>
            </div>

            {/* Secondary stats - Phase 1 additions */}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-xl font-bold text-accent">{stats()!.contacts}</div>
                <div class="text-xs text-text-secondary">Contacts (3)</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-xl font-bold text-accent">{stats()!.reposts}</div>
                <div class="text-xs text-text-secondary">Reposts (6)</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-xl font-bold text-accent">{stats()!.relayLists}</div>
                <div class="text-xs text-text-secondary">Relay Lists (10002)</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-xl font-bold text-accent">{stats()!.longForm}</div>
                <div class="text-xs text-text-secondary">Long-form (30023)</div>
              </div>
            </div>

            {/* Health Status */}
            <Show when={health()}>
              <div class="pt-4 border-t border-border">
                <h3 class="text-sm font-semibold mb-3">Cache Health</h3>
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-text-secondary">Status</span>
                    <span class={`text-sm font-semibold ${getHealthColor(health()!.status)}`}>
                      {health()!.status.toUpperCase()}
                    </span>
                  </div>
                  <Show when={health()!.info.coiEnabled}>
                    <div class="flex items-center gap-2 text-xs">
                      <span class="text-green-500">✓</span>
                      <span>Cross-Origin Isolation enabled</span>
                    </div>
                  </Show>
                  <Show when={health()!.info.backend}>
                    <div class="flex items-center gap-2 text-xs">
                      <span class="text-text-secondary">Backend</span>
                      <span class="font-mono">{health()!.info.backend}</span>
                    </div>
                  </Show>
                  <Show when={!health()!.info.coiEnabled}>
                    <div class="flex items-center gap-2 text-xs">
                      <span class="text-red-500">✗</span>
                      <span>Cross-Origin Isolation disabled</span>
                    </div>
                  </Show>
                  <Show when={health()!.info.isLeader}>
                    <div class="flex items-center gap-2 text-xs">
                      <span class="text-green-500">✓</span>
                      <span>Leader tab (persistence + compaction)</span>
                    </div>
                  </Show>
                  <Show when={!health()!.info.isLeader && health()!.info.cacheInitialized}>
                    <div class="flex items-center gap-2 text-xs">
                      <span class="text-blue-500">ℹ</span>
                      <span>Follower tab (read-only mode)</span>
                    </div>
                  </Show>
                  {/* Phase 2: Browser Capabilities */}
                  <Show when={capabilities()}>
                    <div class="mt-3 pt-3 border-t border-border">
                      <div class="text-xs font-semibold mb-2">Browser Capabilities</div>
                      <div class="space-y-1">
                        <div class="flex items-center gap-2 text-xs">
                          <span class={capabilities()!.opfsSupported ? 'text-green-500' : 'text-red-500'}>
                            {capabilities()!.opfsSupported ? '✓' : '✗'}
                          </span>
                          <span>OPFS SyncAccessHandle (persistent storage)</span>
                        </div>
                        <div class="flex items-center gap-2 text-xs">
                          <span class={capabilities()!.broadcastChannelSupported ? 'text-green-500' : 'text-yellow-500'}>
                            {capabilities()!.broadcastChannelSupported ? '✓' : '~'}
                          </span>
                          <span>BroadcastChannel (multi-tab coordination)</span>
                        </div>
                        <Show when={capabilities()!.recommendation !== 'All features supported'}>
                          <div class="mt-2 p-2 bg-yellow-500/10 rounded text-xs text-yellow-600 dark:text-yellow-400">
                            {capabilities()!.recommendation}
                          </div>
                        </Show>
                      </div>
                    </div>
                  </Show>
                  <Show when={health()!.issues && health()!.issues.length > 0}>
                    <div class="mt-2 space-y-1">
                      {health()!.issues.map((issue: string) => (
                        <div class="flex items-start gap-2 text-xs text-red-500">
                          <span>⚠</span>
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  </Show>
                  <Show when={health()!.warnings && health()!.warnings.length > 0}>
                    <div class="mt-2 space-y-1">
                      {health()!.warnings.map((warning: string) => (
                        <div class="flex items-start gap-2 text-xs text-yellow-500">
                          <span>⚠</span>
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </Show>
                </div>
              </div>
            </Show>

            {/* Performance Metrics */}
            <Show when={metrics()}>
              <div class="pt-4 border-t border-border">
                <h3 class="text-sm font-semibold mb-3">Performance Metrics</h3>
                <div class="grid grid-cols-2 gap-3">
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Pending Queue</div>
                    <div class="text-lg font-semibold">{metrics()!.pendingQueueDepth}</div>
                    <div class="text-[10px] text-text-secondary">Max: {metrics()!.maxQueueDepthSeen}</div>
                  </div>
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Events Written</div>
                    <div class="text-lg font-semibold">{metrics()!.totalEventsWritten}</div>
                  </div>
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Cache Hits</div>
                    <div class="text-lg font-semibold">{metrics()!.cacheHits}</div>
                  </div>
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Cache Misses</div>
                    <div class="text-lg font-semibold">{metrics()!.cacheMisses}</div>
                    <div class="text-[10px] text-text-secondary">
                      Hit rate: {(() => {
                        const h = metrics()!.cacheHits;
                        const m = metrics()!.cacheMisses;
                        const t = h + m;
                        return t > 0 ? `${((h / t) * 100).toFixed(1)}%` : '—';
                      })()}
                    </div>
                  </div>
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Last Flush</div>
                    <div class="text-lg font-semibold">{formatDuration(metrics()!.lastFlushDurationMs)}</div>
                    <div class="text-[10px] text-text-secondary">{formatTimestamp(metrics()!.lastFlushTimestamp)}</div>
                  </div>
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Avg Flush</div>
                    <div class="text-lg font-semibold">{formatDuration(metrics()!.avgFlushDurationMs)}</div>
                  </div>
                  <Show when={metrics()!.flushErrorCount > 0 || metrics()!.quotaErrorCount > 0}>
                    <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded col-span-2">
                      <div class="text-xs text-text-secondary">Errors</div>
                      <div class="flex gap-4 mt-1">
                        <Show when={metrics()!.flushErrorCount > 0}>
                          <div class="text-sm text-red-500">Flush: {metrics()!.flushErrorCount}</div>
                        </Show>
                        <Show when={metrics()!.quotaErrorCount > 0}>
                          <div class="text-sm text-red-500">Quota: {metrics()!.quotaErrorCount}</div>
                        </Show>
                      </div>
                    </div>
                  </Show>
                </div>
              </div>
            </Show>

            {/* Compaction Stats */}
            <Show when={metrics() && metrics()!.compactionRuns > 0}>
              <div class="pt-4 border-t border-border">
                <h3 class="text-sm font-semibold mb-3">Compaction Statistics</h3>
                <div class="grid grid-cols-2 gap-3">
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Total Runs</div>
                    <div class="text-lg font-semibold">{metrics()!.compactionRuns}</div>
                  </div>
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Events Deleted</div>
                    <div class="text-lg font-semibold">{metrics()!.totalEventsDeleted}</div>
                  </div>
                  <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                    <div class="text-xs text-text-secondary">Last Duration</div>
                    <div class="text-lg font-semibold">{formatDuration(metrics()!.lastCompactionDurationMs)}</div>
                    <div class="text-[10px] text-text-secondary">{formatTimestamp(metrics()!.lastCompactionTimestamp)}</div>
                  </div>
                  <Show when={metrics()!.lastCompactionStats}>
                    <div class="p-2 bg-bg-secondary dark:bg-bg-tertiary rounded">
                      <div class="text-xs text-text-secondary">Last Run</div>
                      <div class="text-sm">
                        {metrics()!.lastCompactionStats!.eventsBefore} → {metrics()!.lastCompactionStats!.eventsAfter}
                      </div>
                      <div class="text-[10px] text-text-secondary">
                        Deleted: {metrics()!.lastCompactionStats!.cascadeDeleted}
                      </div>
                    </div>
                  </Show>
                </div>
              </div>
            </Show>

            <div class="pt-4 border-t border-border">
              <p class="text-xs text-text-secondary mb-3">
                Events are automatically cached in your browser using IndexedDB. This improves load times and allows offline browsing.
              </p>
              <button
                onClick={handleClearCache}
                disabled={clearing() || stats()!.total === 0}
                class="btn text-xs text-red-500 disabled:opacity-50"
              >
                {clearing() ? 'Clearing...' : 'Clear Cache'}
              </button>
            </div>
          </div>
        </Show>
      }>
        <div class="text-center py-4">
          <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent"></div>
          <p class="text-sm text-text-secondary mt-2">Loading cache stats...</p>
        </div>
      </Show>
    </div>
  );
};
