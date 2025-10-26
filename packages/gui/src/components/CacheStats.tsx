import { Component, createSignal, onMount, Show } from 'solid-js';
import { getCacheStats, clearCache } from '../lib/cache';

export const CacheStats: Component = () => {
  const [stats, setStats] = createSignal<{
    notes: number;
    metadata: number;
    reactions: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [clearing, setClearing] = createSignal(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const cacheStats = await getCacheStats();
      setStats(cacheStats);
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
      console.log('[CacheStats] Cache cleared successfully');
    } catch (error) {
      console.error('[CacheStats] Error clearing cache:', error);
    } finally {
      setClearing(false);
    }
  };

  onMount(() => {
    loadStats();
  });

  return (
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">Local Cache</h2>
        <button
          onClick={loadStats}
          disabled={loading()}
          class="btn text-xs"
          title="Refresh stats"
        >
          🔄 Refresh
        </button>
      </div>

      <Show when={loading()} fallback={
        <Show when={stats()} fallback={
          <p class="text-text-secondary text-sm">Cache not available</p>
        }>
          <div class="space-y-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-2xl font-bold text-accent">{stats()!.notes}</div>
                <div class="text-xs text-text-secondary">Notes</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-2xl font-bold text-accent">{stats()!.metadata}</div>
                <div class="text-xs text-text-secondary">Profiles</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-2xl font-bold text-accent">{stats()!.reactions}</div>
                <div class="text-xs text-text-secondary">Reactions</div>
              </div>
              <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary rounded-lg">
                <div class="text-2xl font-bold text-cyber-400">{stats()!.total}</div>
                <div class="text-xs text-text-secondary">Total</div>
              </div>
            </div>

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
