import { Component, createSignal, Show } from 'solid-js';
import { usePreferences } from '../providers/PreferencesProvider';

interface AlgorithmControlsProps {
  onUpdate?: () => void; // Callback when values change
}

export const AlgorithmControls: Component<AlgorithmControlsProps> = (props) => {
  const { preferences, updatePreference } = usePreferences();
  const [isOpen, setIsOpen] = createSignal(false);

  const handleUpdate = (key: string, value: number) => {
    updatePreference(key as any, value);
    // Trigger recalculation in parent
    props.onUpdate?.();
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
        <span>⚙️</span>
        <span>Algorithm</span>
        <span class="text-xs opacity-70">{isOpen() ? '▼' : '▶'}</span>
      </button>

      {/* Compact Slider Box */}
      <Show when={isOpen()}>
        <div class="mt-3 p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] space-y-3">
          <div class="text-xs font-semibold text-text-secondary mb-3 opacity-70">
            Timeline Algorithm Weights
          </div>

          {/* Reaction POW Weight */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span>Reaction POW</span>
              <span class="font-mono">{(preferences().reactionPowWeight * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={preferences().reactionPowWeight}
              onInput={(e) => handleUpdate('reactionPowWeight', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
          </div>

          {/* Reply POW Weight */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span>Reply POW</span>
              <span class="font-mono">{(preferences().replyPowWeight * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={preferences().replyPowWeight}
              onInput={(e) => handleUpdate('replyPowWeight', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
          </div>

          {/* Profile POW Weight */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span>Profile POW</span>
              <span class="font-mono">{(preferences().profilePowWeight * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={preferences().profilePowWeight}
              onInput={(e) => handleUpdate('profilePowWeight', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
          </div>

          {/* Non-POW Reaction Weight */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span>Non-POW Reaction</span>
              <span class="font-mono">{(preferences().nonPowReactionWeight * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={preferences().nonPowReactionWeight}
              onInput={(e) => handleUpdate('nonPowReactionWeight', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
          </div>

          {/* Non-POW Reply Weight */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span>Non-POW Reply</span>
              <span class="font-mono">{(preferences().nonPowReplyWeight * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={preferences().nonPowReplyWeight}
              onInput={(e) => handleUpdate('nonPowReplyWeight', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
          </div>

          {/* POW Interaction Threshold */}
          <div class="space-y-1">
            <label class="flex justify-between text-xs text-text-secondary">
              <span>POW Threshold</span>
              <span class="font-mono">{preferences().powInteractionThreshold}</span>
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={preferences().powInteractionThreshold}
              onInput={(e) => handleUpdate('powInteractionThreshold', Number(e.currentTarget.value))}
              class="w-full h-1"
            />
          </div>

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
