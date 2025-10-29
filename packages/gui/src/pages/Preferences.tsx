import { Component, createSignal, Show } from 'solid-js';
import { usePreferences } from '../providers/PreferencesProvider';

type TabId = 'pow' | 'content' | 'mining' | 'advanced';

export const Preferences: Component = () => {
  const { preferences, updatePreference, resetPreferences } = usePreferences();
  const [showResetConfirm, setShowResetConfirm] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<TabId>('pow');
  const maxWorkers = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;

  const handleReset = () => {
    resetPreferences();
    setShowResetConfirm(false);
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'pow', label: 'POW Settings' },
    { id: 'content', label: 'Content & Timeline' },
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
