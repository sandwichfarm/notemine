import { Component, createSignal, Show } from 'solid-js';
import { usePreferences } from '../providers/PreferencesProvider';
import { clearDeblurCache, getDeblurCacheStats } from '../lib/image-deblur-cache';

type TabId = 'pow' | 'content' | 'feed' | 'algorithm' | 'mining' | 'advanced';

export const Preferences: Component = () => {
  const { preferences, updatePreference, resetPreferences } = usePreferences();
  const [showResetConfirm, setShowResetConfirm] = createSignal(false);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<TabId>('pow');
  const maxWorkers = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;

  // Get current cache stats for display
  const getCacheStats = () => getDeblurCacheStats();

  const handleReset = () => {
    resetPreferences();
    setShowResetConfirm(false);
  };

  const handleClearCache = () => {
    clearDeblurCache();
    setShowClearCacheConfirm(false);
  };

  // Helper function to update nested feedParams properties
  const updateFeedParam = (key: string, value: number) => {
    const currentFeedParams = preferences().feedParams;
    updatePreference('feedParams', {
      ...currentFeedParams,
      [key]: value,
    });
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'pow', label: 'POW Settings' },
    { id: 'content', label: 'Content & Timeline' },
    { id: 'feed', label: 'Feed Settings' },
    { id: 'algorithm', label: 'Timeline Algorithm' },
    { id: 'mining', label: 'Mining' },
    { id: 'advanced', label: 'UI & Advanced' },
  ];

  return (
    <div class="max-w-4xl mx-auto p-6">
      <h1 class="text-2xl font-bold mb-6">Preferences</h1>

      {/* Tab Navigation */}
      <div class="flex gap-2 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            onClick={() => setActiveTab(tab.id)}
            class="px-4 py-2 text-sm font-medium transition-colors relative"
            classList={{
              'text-accent border-b-2 border-accent': activeTab() === tab.id,
              'text-text-secondary hover:text-text-primary': activeTab() !== tab.id,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <Show when={activeTab() === 'pow'}>
        {/* POW Difficulty Settings */}
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">POW Difficulty (Default)</h2>

        <div class="space-y-4">
          {/* Root Note POW */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Root Note POW Difficulty: {preferences().powDifficultyRootNote}
            </label>
            <input
              type="range"
              min="16"
              max="42"
              step="1"
              value={preferences().powDifficultyRootNote}
              onInput={(e) => updatePreference('powDifficultyRootNote', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Difficulty for new posts (default: 21)
            </p>
          </div>

          {/* Reply POW */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Reply POW Difficulty: {preferences().powDifficultyReply}
            </label>
            <input
              type="range"
              min="16"
              max="42"
              step="1"
              value={preferences().powDifficultyReply}
              onInput={(e) => updatePreference('powDifficultyReply', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Difficulty for replies (default: 23)
            </p>
          </div>

          {/* Reaction POW */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Reaction POW Difficulty: {preferences().powDifficultyReaction}
            </label>
            <input
              type="range"
              min="16"
              max="42"
              step="1"
              value={preferences().powDifficultyReaction}
              onInput={(e) => updatePreference('powDifficultyReaction', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Difficulty for reactions (default: 28)
            </p>
          </div>

          {/* Profile Update POW */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Profile Update POW Difficulty: {preferences().powDifficultyProfile}
            </label>
            <input
              type="range"
              min="16"
              max="42"
              step="1"
              value={preferences().powDifficultyProfile}
              onInput={(e) => updatePreference('powDifficultyProfile', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Difficulty for profile updates (default: 21)
            </p>
          </div>
        </div>
      </section>

      {/* Minimum POW Requirements */}
      <section class="mb-8">
        <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Minimum POW Requirements</h2>

        <div class="space-y-4">
          {/* Min Root Note POW */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Minimum Root Note POW: {preferences().minPowRootNote}
            </label>
            <input
              type="range"
              min="0"
              max="32"
              step="1"
              value={preferences().minPowRootNote}
              onInput={(e) => updatePreference('minPowRootNote', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Required minimum POW for root notes (default: 16)
            </p>
          </div>

          {/* Min Reply POW */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Minimum Reply POW: {preferences().minPowReply}
            </label>
            <input
              type="range"
              min="0"
              max="32"
              step="1"
              value={preferences().minPowReply}
              onInput={(e) => updatePreference('minPowReply', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Required minimum POW for replies (default: 18)
            </p>
          </div>

          {/* Min Reaction POW */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Minimum Reaction POW: {preferences().minPowReaction}
            </label>
            <input
              type="range"
              min="0"
              max="32"
              step="1"
              value={preferences().minPowReaction}
              onInput={(e) => updatePreference('minPowReaction', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Required minimum POW for reactions (default: 21)
            </p>
          </div>

          {/* Min Profile POW */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Minimum Profile POW: {preferences().minPowProfile}
            </label>
            <input
              type="range"
              min="0"
              max="32"
              step="1"
              value={preferences().minPowProfile}
              onInput={(e) => updatePreference('minPowProfile', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Required minimum POW for profile updates (default: 18)
            </p>
          </div>
        </div>
      </section>

      </Show>

      {/* Feed Settings Tab */}
      <Show when={activeTab() === 'feed'}>
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Adaptive Feed Parameters</h2>
          <p class="text-sm text-text-tertiary mb-4 opacity-70">
            Control how the WoT feed loads notes. Lower values = faster initial load, higher values = more content.
          </p>

          <div class="space-y-4">
            {/* Desired Note Count */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Desired Note Count: {preferences().feedParams.desiredCount}
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={preferences().feedParams.desiredCount}
                onInput={(e) => updateFeedParam('desiredCount', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Target number of notes to load (default: 20). Higher values take longer to load.
              </p>
            </div>

            {/* Initial Limit */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Initial Query Size: {preferences().feedParams.initialLimit}
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={preferences().feedParams.initialLimit}
                onInput={(e) => updateFeedParam('initialLimit', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Starting relay query size (default: 20). First batch of notes requested from relays.
              </p>
            </div>

            {/* Max Limit */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Max Query Size: {preferences().feedParams.maxLimit}
              </label>
              <input
                type="range"
                min="100"
                max="2000"
                step="100"
                value={preferences().feedParams.maxLimit}
                onInput={(e) => updateFeedParam('maxLimit', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Maximum relay query size cap (default: 500). Upper limit for large queries.
              </p>
              <Show when={preferences().feedParams.maxLimit > 1000}>
                <p class="text-xs text-orange-500 mt-2">
                  ⚠️ High values may cause slow relay responses
                </p>
              </Show>
            </div>

            {/* Initial Horizon */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Initial Time Horizon: {preferences().feedParams.initialHorizonHours} hours
              </label>
              <input
                type="range"
                min="1"
                max="48"
                step="1"
                value={preferences().feedParams.initialHorizonHours}
                onInput={(e) => updateFeedParam('initialHorizonHours', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                How far back to search initially (default: 12 hours). Shorter = more recent notes only.
              </p>
            </div>

            {/* Max Horizon */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Max Time Horizon: {preferences().feedParams.maxHorizonDays} days
              </label>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={preferences().feedParams.maxHorizonDays}
                onInput={(e) => updateFeedParam('maxHorizonDays', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Maximum lookback period (default: 14 days). Feed will search up to this far back if needed.
              </p>
            </div>

            {/* Growth Fast */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Fast Growth Rate: {preferences().feedParams.growthFast.toFixed(1)}x
              </label>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.1"
                value={preferences().feedParams.growthFast}
                onInput={(e) => updateFeedParam('growthFast', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Growth multiplier when no results found (default: 3.0). Higher = more aggressive expansion.
              </p>
            </div>

            {/* Growth Slow */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Slow Growth Rate: {preferences().feedParams.growthSlow.toFixed(1)}x
              </label>
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.1"
                value={preferences().feedParams.growthSlow}
                onInput={(e) => updateFeedParam('growthSlow', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Growth multiplier with partial results (default: 1.6). Used when finding some notes but not enough.
              </p>
            </div>

            {/* Overlap Ratio */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Window Overlap: {(preferences().feedParams.overlapRatio * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={preferences().feedParams.overlapRatio}
                onInput={(e) => updateFeedParam('overlapRatio', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Time window overlap percentage (default: 15%). Prevents missing notes between search windows.
              </p>
            </div>

            {/* Overfetch */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Overfetch Multiplier: {preferences().feedParams.overfetch.toFixed(1)}x
              </label>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.1"
                value={preferences().feedParams.overfetch}
                onInput={(e) => updateFeedParam('overfetch', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Fetch extra notes for better prioritization (default: 2.0). Higher = more notes to choose from.
              </p>
            </div>

            {/* Prefetch Interactions */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Prefetch Interactions: {preferences().feedParams.prefetchInteractionsCount}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={preferences().feedParams.prefetchInteractionsCount}
                onInput={(e) => updateFeedParam('prefetchInteractionsCount', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Number of notes below the fold to prefetch replies/reactions for (default: 3). Set to 0 to disable.
              </p>
            </div>

            {/* Interaction Concurrency */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Interaction Slots: {preferences().feedParams.interactionsMaxConcurrent}
              </label>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={preferences().feedParams.interactionsMaxConcurrent}
                onInput={(e) => updateFeedParam('interactionsMaxConcurrent', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Maximum number of interaction fetches that run in parallel (default: 3). Higher = faster but heavier.
              </p>
            </div>

            {/* Interaction Queue Size */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Interaction Queue Size: {preferences().feedParams.interactionsQueueMax}
              </label>
              <input
                type="range"
                min="6"
                max="60"
                step="2"
                value={preferences().feedParams.interactionsQueueMax}
                onInput={(e) => updateFeedParam('interactionsQueueMax', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Limits how many off-screen notes queue for reactions (default: 24). Larger queues = faster but more work.
              </p>
            </div>

            {/* Timeline Relay Limit */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Timeline Relay Fan-out: {preferences().feedParams.timelineRelayLimit}
              </label>
              <input
                type="range"
                min="2"
                max="24"
                step="1"
                value={preferences().feedParams.timelineRelayLimit}
                onInput={(e) => updateFeedParam('timelineRelayLimit', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Maximum number of relays queried for the main timeline (default: 8). Lower values use fewer WebSocket connections.
              </p>
            </div>

            {/* Interaction Relay Limit */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Interaction Relay Fan-out: {preferences().feedParams.interactionRelayLimit}
              </label>
              <input
                type="range"
                min="4"
                max="32"
                step="1"
                value={preferences().feedParams.interactionRelayLimit}
                onInput={(e) => updateFeedParam('interactionRelayLimit', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Limits how many relays are contacted when fetching replies/reactions (default: 12). Lower values reduce bursty fan-out.
              </p>
            </div>

            {/* Visibility Dwell */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Visibility Dwell: {preferences().feedParams.visibilityDwellMs} ms
              </label>
              <input
                type="range"
                min="0"
                max="1000"
                step="50"
                value={preferences().feedParams.visibilityDwellMs}
                onInput={(e) => updateFeedParam('visibilityDwellMs', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Delay before an on-screen note starts fetching interactions (default: 300ms). Lower = faster.
              </p>
            </div>

            {/* Visibility Root Margin */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Visibility Margin: {preferences().feedParams.visibilityRootMarginPx} px
              </label>
              <input
                type="range"
                min="0"
                max="600"
                step="25"
                value={preferences().feedParams.visibilityRootMarginPx}
                onInput={(e) => updateFeedParam('visibilityRootMarginPx', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                How far outside the viewport to begin fetching interactions (default: 300px).
              </p>
            </div>
          </div>
        </section>

        {/* Info Box */}
        <section class="mb-8">
          <div class="card bg-blue-50 dark:bg-blue-900/20 border-blue-500">
            <h3 class="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 How It Works</h3>
            <div class="text-xs text-blue-700 dark:text-blue-300 space-y-2">
              <p>
                The adaptive feed uses a smart fetching strategy that starts with a small time window and query size,
                then expands as needed to find enough notes.
              </p>
              <p>
                <strong>Growth Strategy:</strong> When no notes are found, it grows fast (3x). When some notes are found,
                it grows slowly (1.6x) to fine-tune the search.
              </p>
              <p>
                <strong>Overlap:</strong> Time windows overlap by 15% to ensure no notes slip through the gaps between queries.
              </p>
              <p>
                <strong>Quick adjustments:</strong> Use the inline "Feed Settings" button above the feed for temporary changes.
                Settings here persist permanently.
              </p>
            </div>
          </div>
        </section>
      </Show>

      {/* Timeline Algorithm Tab */}
      <Show when={activeTab() === 'algorithm'}>
        {/* POW Weighting Factors */}
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">POW Score Weighting</h2>

          <div class="space-y-4">
            {/* Reaction Weight */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Reaction POW Weight: {(preferences().reactionPowWeight * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={preferences().reactionPowWeight}
                onInput={(e) => updatePreference('reactionPowWeight', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                How much reactions influence note score (default: 50%)
              </p>
            </div>

            {/* Reply Weight */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Reply POW Weight: {(preferences().replyPowWeight * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={preferences().replyPowWeight}
                onInput={(e) => updatePreference('replyPowWeight', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                How much replies influence note score (default: 70%)
              </p>
            </div>

            {/* Profile Weight */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Profile POW Weight: {(preferences().profilePowWeight * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={preferences().profilePowWeight}
                onInput={(e) => updatePreference('profilePowWeight', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                How much author's mined pubkey influences note score (default: 30%)
              </p>
            </div>

            {/* Non-POW Reaction Weight */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Non-POW Reaction Weight: {(preferences().nonPowReactionWeight * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={preferences().nonPowReactionWeight}
                onInput={(e) => updatePreference('nonPowReactionWeight', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                How much reactions WITHOUT POW influence note score (default: 10%)
              </p>
            </div>

            {/* Non-POW Reply Weight */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Non-POW Reply Weight: {(preferences().nonPowReplyWeight * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={preferences().nonPowReplyWeight}
                onInput={(e) => updatePreference('nonPowReplyWeight', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                How much replies WITHOUT POW influence note score (default: 10%)
              </p>
            </div>

            {/* POW Interaction Threshold */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                POW Interaction Threshold: {preferences().powInteractionThreshold}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={preferences().powInteractionThreshold}
                onInput={(e) => updatePreference('powInteractionThreshold', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Minimum POW difficulty for an interaction to count as "with POW" (default: 1)
              </p>
            </div>
          </div>
        </section>
      </Show>

      {/* Content & Timeline Tab */}
      <Show when={activeTab() === 'content'}>
        {/* Content Length Settings */}
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Content Length Limits</h2>

        <div class="space-y-4">
          {/* Root Note Length */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Root Note Max Length: {preferences().maxContentLengthRootNote} characters
            </label>
            <input
              type="range"
              min="140"
              max="2000"
              step="10"
              value={preferences().maxContentLengthRootNote}
              onInput={(e) => updatePreference('maxContentLengthRootNote', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Maximum characters for new posts (default: 140)
            </p>
          </div>

          {/* Reply Length */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Reply Max Length: {preferences().maxContentLengthReply} characters
            </label>
            <input
              type="range"
              min="140"
              max="2000"
              step="10"
              value={preferences().maxContentLengthReply}
              onInput={(e) => updatePreference('maxContentLengthReply', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Maximum characters for replies (default: 280)
            </p>
          </div>
        </div>
      </section>

      {/* Timeline Settings */}
      <section class="mb-8">
        <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Timeline Filters</h2>

        <div class="space-y-4">
          {/* Min POW Difficulty */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Minimum POW Difficulty: {preferences().minPowDifficulty}
            </label>
            <input
              type="range"
              min="0"
              max="32"
              step="1"
              value={preferences().minPowDifficulty}
              onInput={(e) => updatePreference('minPowDifficulty', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Filter out notes below this POW difficulty (default: 8)
            </p>
          </div>

          {/* Min POW Threshold */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              POW Display Threshold: {preferences().minPowThreshold}
            </label>
            <input
              type="range"
              min="0"
              max="32"
              step="1"
              value={preferences().minPowThreshold}
              onInput={(e) => updatePreference('minPowThreshold', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Notes below this threshold appear dimmed (default: 16)
            </p>
          </div>
        </div>
      </section>

      {/* Relay Connection Management */}
      <section class="mb-8">
        <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Relay Connection Management</h2>
        <p class="text-sm text-text-tertiary mb-4 opacity-75">
          Smart connection management prevents browser crashes by limiting simultaneous connections
          and intelligently selecting relays based on user coverage.
        </p>

        <div class="space-y-4">
          {/* Max Active Relays */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Max Active Connections: {preferences().maxActiveRelays}
            </label>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={preferences().maxActiveRelays}
              onInput={(e) => updatePreference('maxActiveRelays', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Maximum simultaneous relay connections (default: 10). Lower values improve stability but may reduce coverage.
            </p>
            <Show when={preferences().maxActiveRelays > 15}>
              <p class="text-xs text-orange-500 mt-2">
                ⚠️ High connection counts may impact browser performance
              </p>
            </Show>
          </div>

          {/* Max Relays Per User */}
          <div class="card">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Max Relays Per User: {preferences().maxRelaysPerUser}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={preferences().maxRelaysPerUser}
              onInput={(e) => updatePreference('maxRelaysPerUser', Number(e.currentTarget.value))}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Maximum relays to use per user when computing optimal coverage (default: 3). Lower values prioritize shared relays.
            </p>
          </div>
        </div>
      </section>
      </Show>

      {/* Mining Tab */}
      <Show when={activeTab() === 'mining'}>
        {/* Mining Settings */}
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Mining</h2>

        <div class="space-y-4">
          {/* Disable Resume Toggle */}
          <div class="card">
            <label class="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences().disableResume}
                onChange={(e) => updatePreference('disableResume', e.currentTarget.checked)}
                class="w-5 h-5"
              />
              <div>
                <span class="block text-sm font-medium text-text-secondary">
                  Disable Resume
                </span>
                <p class="text-xs text-text-tertiary opacity-50">
                  Always start fresh when processing queued items or after refresh. Useful for debugging slowdowns.
                </p>
              </div>
            </label>
          </div>

          {/* Use All Cores Toggle */}
          <div class="card">
            <label class="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences().minerUseAllCores}
                onChange={(e) => updatePreference('minerUseAllCores', e.currentTarget.checked)}
                class="w-5 h-5"
              />
              <div>
                <span class="block text-sm font-medium text-text-secondary">
                  Use All Cores
                </span>
                <p class="text-xs text-text-tertiary opacity-50">
                  When enabled, uses all available hardware threads and hides the slider.
                </p>
              </div>
            </label>
          </div>

          {/* Number of Workers */}
          <div class="card" classList={{ hidden: preferences().minerUseAllCores }}>
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Number of Workers: {preferences().minerNumberOfWorkers} <span class="text-text-tertiary">(max {maxWorkers})</span>
            </label>
            <input
              type="range"
              min="1"
              max={maxWorkers}
              step="1"
              value={preferences().minerNumberOfWorkers}
              onInput={(e) => {
                const val = Math.max(1, Math.min(Number(e.currentTarget.value), maxWorkers));
                updatePreference('minerNumberOfWorkers', val);
              }}
              class="w-full"
            />
            <p class="text-xs text-text-tertiary mt-1 opacity-50">
              Adjust mining threads. Default leaves one core free.
            </p>
          </div>

          {/* Queue Ordering Strategy */}
          <div class="card">
            <h3 class="text-sm font-medium text-text-secondary mb-3">Queue Ordering Strategy</h3>

            <div class="space-y-3">
              {/* Low Difficulty First (default) */}
              <label class="flex items-start space-x-3 cursor-pointer group">
                <input
                  type="radio"
                  name="queueOrderingStrategy"
                  value="lowDifficultyFirst"
                  checked={preferences().queueOrderingStrategy === 'lowDifficultyFirst'}
                  onChange={(e) => {
                    if (e.currentTarget.checked) {
                      updatePreference('queueOrderingStrategy', 'lowDifficultyFirst');
                    }
                  }}
                  class="mt-1 w-4 h-4"
                />
                <div class="flex-1">
                  <span class="block text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                    ⚡ Low Difficulty First (default)
                  </span>
                  <p class="text-xs text-text-tertiary opacity-70 mt-1">
                    New lower-difficulty jobs jump to the front and preempt the current one.
                    <strong>Example:</strong> mining POW 38, a new POW 21 is added → POW 21 starts immediately.
                  </p>
                </div>
              </label>

              {/* FIFO */}
              <label class="flex items-start space-x-3 cursor-pointer group">
                <input
                  type="radio"
                  name="queueOrderingStrategy"
                  value="fifo"
                  checked={preferences().queueOrderingStrategy === 'fifo'}
                  onChange={(e) => {
                    if (e.currentTarget.checked) {
                      updatePreference('queueOrderingStrategy', 'fifo');
                    }
                  }}
                  class="mt-1 w-4 h-4"
                />
                <div class="flex-1">
                  <span class="block text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                    📋 FIFO (First In, First Out)
                  </span>
                  <p class="text-xs text-text-tertiary opacity-70 mt-1">
                    New jobs go to the end of the queue. No automatic preemption. Simple queue behavior.
                  </p>
                </div>
              </label>

              {/* LIFO */}
              <label class="flex items-start space-x-3 cursor-pointer group">
                <input
                  type="radio"
                  name="queueOrderingStrategy"
                  value="lifo"
                  checked={preferences().queueOrderingStrategy === 'lifo'}
                  onChange={(e) => {
                    if (e.currentTarget.checked) {
                      updatePreference('queueOrderingStrategy', 'lifo');
                    }
                  }}
                  class="mt-1 w-4 h-4"
                />
                <div class="flex-1">
                  <span class="block text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                    📚 LIFO (Last In, First Out / Stack)
                  </span>
                  <p class="text-xs text-text-tertiary opacity-70 mt-1">
                    New jobs go to the front of the queue (stack behavior). No automatic preemption.
                  </p>
                </div>
              </label>
            </div>

            <p class="text-xs text-text-tertiary opacity-50 mt-4 p-2 bg-bg-secondary rounded">
              <strong>Note:</strong> Manual ordering always works and overrides these defaults. You can reorder items
              anytime using the queue panel controls.
            </p>
          </div>
        </div>
      </section>
      </Show>

      {/* UI & Advanced Tab */}
      <Show when={activeTab() === 'advanced'}>
        {/* UI Settings */}
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">UI Settings</h2>

          <div class="space-y-4">
            {/* Thread Collapse Depth */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Thread Collapse Depth: {preferences().threadedRepliesCollapseDepth}
              </label>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={preferences().threadedRepliesCollapseDepth}
                onInput={(e) => updatePreference('threadedRepliesCollapseDepth', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Collapse reply threads after this depth (default: 2)
              </p>
            </div>
          </div>
        </section>

        {/* Image Settings */}
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Image Settings</h2>

          <div class="space-y-4">
            {/* Auto-deblur Toggle */}
            <div class="card">
              <label class="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences().autoDeblurImages}
                  onChange={(e) => updatePreference('autoDeblurImages', e.currentTarget.checked)}
                  class="w-5 h-5"
                />
                <div>
                  <span class="block text-sm font-medium text-text-secondary">
                    Auto-deblur All Images
                  </span>
                  <p class="text-xs text-text-tertiary opacity-50">
                    Automatically show all embedded images without blur. When disabled, images you've manually deblurred are remembered.
                  </p>
                </div>
              </label>
            </div>

            {/* Deblur Cache Size */}
            <div class="card">
              <label class="block text-sm font-medium text-text-secondary mb-2">
                Deblur Cache Size: {preferences().deblurCacheSize} images
              </label>
              <input
                type="range"
                min="100"
                max="5000"
                step="100"
                value={preferences().deblurCacheSize}
                onInput={(e) => updatePreference('deblurCacheSize', Number(e.currentTarget.value))}
                class="w-full"
              />
              <p class="text-xs text-text-tertiary mt-1 opacity-50">
                Maximum number of deblurred images to remember (default: 500)
              </p>
            </div>

            {/* Clear Cache Button */}
            <div class="card">
              <h3 class="text-sm font-medium text-text-secondary mb-2">Deblur Cache</h3>
              <p class="text-xs text-text-tertiary mb-3 opacity-70">
                Currently caching {getCacheStats().count} of {getCacheStats().maxSize} deblurred images
              </p>

              <Show
                when={showClearCacheConfirm()}
                fallback={
                  <button
                    onClick={() => setShowClearCacheConfirm(true)}
                    class="btn text-orange-500 hover:text-orange-600 border-orange-500 hover:border-orange-600"
                    disabled={getCacheStats().count === 0}
                  >
                    Clear Deblur Cache
                  </button>
                }
              >
                <div class="space-y-2">
                  <p class="text-sm text-orange-500">Clear all remembered deblur states?</p>
                  <div class="flex gap-2">
                    <button
                      onClick={handleClearCache}
                      class="btn bg-orange-500 text-white border-orange-500 hover:bg-orange-600"
                    >
                      Yes, Clear
                    </button>
                    <button
                      onClick={() => setShowClearCacheConfirm(false)}
                      class="btn"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </section>

        {/* Cache Settings */}
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Cache Settings</h2>
          <div class="card">
            <h3 class="text-sm font-medium text-text-secondary mb-2">Local Event Cache</h3>

            <Show
              when={window.crossOriginIsolated}
              fallback={
                <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-500 rounded">
                  <p class="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ Cache is disabled - Cross-Origin Isolation not available
                  </p>
                  <p class="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                    Enable COI to use the local event cache for faster load times and offline browsing.
                  </p>
                </div>
              }
            >
              <div class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-500 rounded mb-3">
                <p class="text-sm text-green-800 dark:text-green-200">
                  ✓ Cache is enabled and running
                </p>
                <p class="text-xs text-green-700 dark:text-green-300 mt-1">
                  Events are automatically cached in your browser using IndexedDB.
                </p>
              </div>

              <div class="space-y-2 text-sm text-text-secondary">
                <p><strong>Features:</strong></p>
                <ul class="list-disc list-inside text-xs text-text-tertiary opacity-70 space-y-1">
                  <li>Automatic caching of all observed events</li>
                  <li>Intelligent retention with priority tiers (user data protected)</li>
                  <li>Faster warm loads - timeline/profiles load instantly</li>
                  <li>Compaction runs every 15 minutes to maintain performance</li>
                </ul>

                <div class="mt-3 pt-3 border-t border-border">
                  <a href="/stats" class="text-accent hover:underline text-xs">
                    View Cache Statistics →
                  </a>
                </div>
              </div>
            </Show>
          </div>
        </section>

        {/* Debug Settings */}
        <section class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-text-secondary opacity-70">Debug Settings</h2>
        <div class="space-y-4">
          <div class="card">
            <label class="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences().debugMode}
                onChange={(e) => updatePreference('debugMode', e.currentTarget.checked)}
                class="w-5 h-5"
              />
              <div>
                <span class="block text-sm font-medium text-text-secondary">
                  Enable Debug Mode
                </span>
                <p class="text-xs text-text-tertiary opacity-50">
                  Shows detailed console logs including cache operations (may impact mining performance)
                </p>
            </div>
          </label>
        </div>

          {/* Feed Debug Mode */}
          <div class="card">
            <label class="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences().feedDebugMode}
                onChange={(e) => updatePreference('feedDebugMode', e.currentTarget.checked)}
                class="w-5 h-5"
              />
              <div>
                <span class="block text-sm font-medium text-text-secondary">
                  Enable Feed Debug Mode
                </span>
                <p class="text-xs text-text-tertiary opacity-50">
                  Shows diagnostic logs for feed system (adaptive fetch, media preloading, prioritization)
                </p>
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* Reset Button */}
      <section class="mb-8">
        <div class="card">
          <h3 class="text-lg font-semibold mb-2 text-text-secondary">Reset Preferences</h3>
          <p class="text-sm text-text-tertiary mb-4 opacity-70">
            Reset all preferences to their default values
          </p>

          <Show
            when={showResetConfirm()}
            fallback={
              <button
                onClick={() => setShowResetConfirm(true)}
                class="btn text-red-500 hover:text-red-600 border-red-500 hover:border-red-600"
              >
                Reset to Defaults
              </button>
            }
          >
            <div class="space-y-2">
              <p class="text-sm text-red-500">Are you sure? This cannot be undone.</p>
              <div class="flex gap-2">
                <button
                  onClick={handleReset}
                  class="btn bg-red-500 text-white border-red-500 hover:bg-red-600"
                >
                  Yes, Reset
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  class="btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Show>
        </div>
      </section>
      </Show>
    </div>
  );
};
