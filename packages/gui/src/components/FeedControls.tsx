import { Component, createSignal, Show } from 'solid-js';
import { usePreferences } from '../providers/PreferencesProvider';

interface FeedControlsProps {
  onUpdate?: () => void; // Callback when values change (triggers feed reload)
}

export const FeedControls: Component<FeedControlsProps> = (props) => {
  const { preferences, updatePreference } = usePreferences();
  const [isOpen, setIsOpen] = createSignal(false);

  // Track applied parameters to detect pending changes
  const [appliedParams, setAppliedParams] = createSignal(preferences().feedParams);

  // Helper to update nested feedParams properties
  const updateFeedParam = (key: string, value: number) => {
    const currentFeedParams = preferences().feedParams;
    updatePreference('feedParams', {
      ...currentFeedParams,
      [key]: value,
    });
  };

  const handleUpdate = (key: string, value: number) => {
    // Update preferences immediately (persists to localStorage)
    updateFeedParam(key, value);
    // DO NOT trigger feed reload here - user needs to click Apply Changes
  };

  // Check if there are pending changes
  const hasPendingChanges = () => {
    const current = preferences().feedParams;
    const applied = appliedParams();
    return JSON.stringify(current) !== JSON.stringify(applied);
  };

  // Apply changes and trigger feed reload
  const applyChanges = () => {
    setAppliedParams(preferences().feedParams);
    props.onUpdate?.();
  };

  const resetToDefaults = () => {
    const defaults = {
      desiredCount: 20,
      initialLimit: 20,
      maxLimit: 500,
      initialHorizonHours: 12,
      maxHorizonDays: 14,
      growthFast: 3.0,
      growthSlow: 1.6,
      overlapRatio: 0.15,
      overfetch: 2.0,
      skewMarginMinutes: 15,
      hydrationLimit: 50,
      cacheWidenMultiplier: 2,
      cacheWidenCap: 50,
      visibilityDwellMs: 300,
      visibilityRootMarginPx: 300,
      interactionsMaxConcurrent: 3,
      interactionsQueueMax: 24,
      timelineRelayLimit: 8,
      interactionRelayLimit: 12,
      prefetchInteractionsCount: 3,
      anchorPreserveDelayMs: 50,
      topThresholdPx: 100,
      infiniteRootMarginPx: 300,
      infiniteTriggerPct: 0.8,
      batchClampMin: 5,
      batchClampMax: 20,
      overscan: 5,
      preloaderTimeoutMs: 1500,
      maxMediaHeightPx: 900,
      logThrottleMs: 2000,
    };
    updatePreference('feedParams', defaults);
    setAppliedParams(defaults);
    props.onUpdate?.();
  };

  const prefs = () => preferences().feedParams || {
    desiredCount: 20,
    initialLimit: 20,
    maxLimit: 500,
    initialHorizonHours: 12,
    maxHorizonDays: 14,
    growthFast: 3.0,
    growthSlow: 1.6,
    overlapRatio: 0.15,
    overfetch: 2.0,
    skewMarginMinutes: 15,
    visibilityDwellMs: 300,
    visibilityRootMarginPx: 300,
    interactionsMaxConcurrent: 3,
    interactionsQueueMax: 24,
    timelineRelayLimit: 8,
    interactionRelayLimit: 12,
    prefetchInteractionsCount: 3,
  };

  return (
    <div class="mb-4">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="flex items-center gap-2 px-3 py-2 text-sm border border-[var(--border-color)] rounded hover:border-[var(--accent)] transition-colors"
        classList={{
          'bg-[var(--accent)] text-white border-[var(--accent)]': isOpen(),
        }}
      >
        <span>🎚️</span>
        <span>Feed Settings</span>
        <span class="text-xs opacity-70">{isOpen() ? '▼' : '▶'}</span>
      </button>

      {/* Compact Slider Box */}
      <Show when={isOpen()}>
        <div class="mt-3 p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] space-y-3">
          <div class="flex justify-between items-center mb-3">
            <div class="text-xs font-semibold text-text-secondary opacity-70">
              Adaptive Feed Parameters
            </div>
            <button
              onClick={resetToDefaults}
              class="text-xs text-[var(--accent)] hover:underline"
            >
              Reset
            </button>
          </div>

          {/* Desired Note Count */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Target number of notes to load">📊 Desired Notes</span>
              <span class="font-mono">{prefs().desiredCount}</span>
            </label>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={prefs().desiredCount}
              onInput={(e) => handleUpdate('desiredCount', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">More notes = slower load</div>
          </div>

          {/* Initial Limit */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Starting relay query size">🎯 Initial Query Size</span>
              <span class="font-mono">{prefs().initialLimit}</span>
            </label>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={prefs().initialLimit}
              onInput={(e) => handleUpdate('initialLimit', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">First batch size from relays</div>
          </div>

          {/* Max Limit */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Maximum relay query size">⚡ Max Query Size</span>
              <span class="font-mono">{prefs().maxLimit}</span>
            </label>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={prefs().maxLimit}
              onInput={(e) => handleUpdate('maxLimit', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">Upper limit for queries</div>
          </div>

          {/* Initial Horizon */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Starting lookback time window">🕐 Initial Horizon</span>
              <span class="font-mono">{prefs().initialHorizonHours}h</span>
            </label>
            <input
              type="range"
              min="1"
              max="48"
              step="1"
              value={prefs().initialHorizonHours}
              onInput={(e) => handleUpdate('initialHorizonHours', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">How far back to search initially</div>
          </div>

          {/* Max Horizon */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Maximum lookback time window">📅 Max Horizon</span>
              <span class="font-mono">{prefs().maxHorizonDays}d</span>
            </label>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={prefs().maxHorizonDays}
              onInput={(e) => handleUpdate('maxHorizonDays', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">Maximum lookback period</div>
          </div>

          {/* Growth Fast */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Growth multiplier when no results">🚀 Fast Growth</span>
              <span class="font-mono">{prefs().growthFast.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min="1.0"
              max="5.0"
              step="0.1"
              value={prefs().growthFast}
              onInput={(e) => handleUpdate('growthFast', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">When no results found</div>
          </div>

          {/* Growth Slow */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Growth multiplier with partial results">🐌 Slow Growth</span>
              <span class="font-mono">{prefs().growthSlow.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min="1.0"
              max="3.0"
              step="0.1"
              value={prefs().growthSlow}
              onInput={(e) => handleUpdate('growthSlow', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">When partial results found</div>
          </div>

          {/* Overlap Ratio */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Time window overlap to avoid gaps">🔗 Overlap</span>
              <span class="font-mono">{(prefs().overlapRatio * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.05"
              value={prefs().overlapRatio}
              onInput={(e) => handleUpdate('overlapRatio', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">Prevents missed notes between windows</div>
          </div>

          {/* Prefetch Interactions */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Number of notes below the fold to prefetch interactions for">⚡ Prefetch Interactions</span>
              <span class="font-mono">{prefs().prefetchInteractionsCount}</span>
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={prefs().prefetchInteractionsCount}
              onInput={(e) => handleUpdate('prefetchInteractionsCount', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">Prefetch replies/reactions this many notes ahead of the fold</div>
          </div>

          {/* Interactions Concurrency */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Max number of interaction fetches to run at once">🧵 Interaction Slots</span>
              <span class="font-mono">{prefs().interactionsMaxConcurrent}</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={prefs().interactionsMaxConcurrent}
              onInput={(e) => handleUpdate('interactionsMaxConcurrent', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">Higher values fetch more replies simultaneously (heavier on relays)</div>
          </div>

          {/* Interactions Queue Size */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Max notes waiting for interactions to load">📥 Interaction Queue</span>
              <span class="font-mono">{prefs().interactionsQueueMax}</span>
            </label>
            <input
              type="range"
              min="6"
              max="48"
              step="2"
              value={prefs().interactionsQueueMax}
              onInput={(e) => handleUpdate('interactionsQueueMax', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">Controls how many off-screen notes queue for reactions</div>
          </div>

          {/* Visibility dwell time */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Delay before a visible note triggers lazy loading">⏱️ Visibility Dwell</span>
              <span class="font-mono">{prefs().visibilityDwellMs}ms</span>
            </label>
            <input
              type="range"
              min="0"
              max="1000"
              step="50"
              value={prefs().visibilityDwellMs}
              onInput={(e) => handleUpdate('visibilityDwellMs', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">Lower values trigger interaction fetches sooner</div>
          </div>

          {/* Visibility root margin */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span title="Viewport buffer for the visibility observer">🪟 Visibility Margin</span>
              <span class="font-mono">{prefs().visibilityRootMarginPx}px</span>
            </label>
            <input
              type="range"
              min="0"
              max="600"
              step="50"
              value={prefs().visibilityRootMarginPx}
              onInput={(e) => handleUpdate('visibilityRootMarginPx', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
            <div class="text-xs opacity-50">Bigger margin starts fetching before notes enter the viewport</div>
          </div>

          {/* Apply Changes Button */}
          <Show when={hasPendingChanges()}>
            <div class="pt-2 border-t border-[var(--border-color)]">
              <button
                onClick={applyChanges}
                class="w-full px-3 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded hover:opacity-90 transition-opacity"
              >
                ✓ Apply Changes
              </button>
              <p class="text-xs text-text-tertiary mt-1 opacity-70 text-center">
                Changes saved • Click to reload feed
              </p>
            </div>
          </Show>

          <div class="pt-2 border-t border-[var(--border-color)]">
            <a
              href="/preferences"
              class="text-xs text-[var(--accent)] hover:underline"
            >
              More settings →
            </a>
          </div>
        </div>
      </Show>
    </div>
  );
};
