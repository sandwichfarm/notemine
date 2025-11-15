import { Component, For, Show, createSignal } from 'solid-js';
import { usePreferences, type FeedViewPreferences } from '../providers/PreferencesProvider';

const WIDTH_OPTIONS: { value: FeedViewPreferences['widthPreset']; label: string; description: string }[] = [
  { value: 'compact', label: 'Compact', description: 'max-w-xl — tight columns' },
  { value: 'default', label: 'Default', description: 'max-w-2xl — current width' },
  { value: 'wide', label: 'Wide', description: 'max-w-3xl — extra breathing room' },
  { value: 'full', label: 'Full', description: 'max-w-4xl — desktop wide' },
];

const HEIGHT_OPTIONS = [
  { value: 0, label: 'No limit' },
  { value: 400, label: 'Clamp at 400px' },
  { value: 600, label: 'Clamp at 600px' },
  { value: 800, label: 'Clamp at 800px' },
];

export const FeedViewMenu: Component = () => {
  const { preferences, updatePreference } = usePreferences();
  const [isOpen, setIsOpen] = createSignal(false);
  const viewPrefs = () => preferences().feedView;

  const updateViewPreference = <K extends keyof FeedViewPreferences>(key: K, value: FeedViewPreferences[K]) => {
    updatePreference('feedView', {
      ...viewPrefs(),
      [key]: value,
    });
  };

  return (
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-2 px-3 py-2 text-sm border border-[var(--border-color)] rounded hover:border-[var(--accent)] transition-colors"
        classList={{ 'bg-[var(--accent)] text-white border-[var(--accent)]': isOpen() }}
        onClick={() => setIsOpen(!isOpen())}
      >
        <span>🪟</span>
        <span>View</span>
        <span class="text-xs opacity-70">{isOpen() ? '▼' : '▶'}</span>
      </button>

      <Show when={isOpen()}>
        <div class="absolute right-0 mt-2 w-72 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] shadow-xl z-30 p-4 space-y-4">
          <div>
            <label class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Width</label>
            <select
              class="mt-1 w-full text-sm bg-transparent border border-[var(--border-color)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
              value={viewPrefs().widthPreset}
              onChange={(e) => updateViewPreference('widthPreset', e.currentTarget.value as FeedViewPreferences['widthPreset'])}
            >
              <For each={WIDTH_OPTIONS}>
                {(option) => (
                  <option value={option.value}>
                    {option.label}
                  </option>
                )}
              </For>
            </select>
            <p class="text-xs text-text-tertiary mt-1">
              {WIDTH_OPTIONS.find((o) => o.value === viewPrefs().widthPreset)?.description}
            </p>
          </div>

          <div>
            <label class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Max note height</label>
            <select
              class="mt-1 w-full text-sm bg-transparent border border-[var(--border-color)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
              value={String(viewPrefs().maxNoteHeightPx ?? 0)}
              onChange={(e) => updateViewPreference('maxNoteHeightPx', Number(e.currentTarget.value))}
            >
              <For each={HEIGHT_OPTIONS}>
                {(option) => (
                  <option value={option.value}>{option.label}</option>
                )}
              </For>
            </select>
            <p class="text-xs text-text-tertiary mt-1">
              Tall notes fade out and can be expanded when a clamp is set.
            </p>
          </div>

          <label class="flex items-center justify-between text-sm gap-3">
            <div>
              <div class="font-medium">Show interaction counts</div>
              <div class="text-xs text-text-tertiary">Hide reactions/replies rows for a calmer feed.</div>
            </div>
            <input
              type="checkbox"
              class="w-5 h-5"
              checked={viewPrefs().showInteractionCounts}
              onChange={(e) => updateViewPreference('showInteractionCounts', e.currentTarget.checked)}
            />
          </label>

          <label class="flex items-center justify-between text-sm gap-3">
            <div>
              <div class="font-medium">Auto-deblur images</div>
              <div class="text-xs text-text-tertiary">Show all images without blur/vignettes.</div>
            </div>
            <input
              type="checkbox"
              class="w-5 h-5"
              checked={preferences().autoDeblurImages}
              onChange={(e) => updatePreference('autoDeblurImages', e.currentTarget.checked)}
            />
          </label>
        </div>
      </Show>
    </div>
  );
};
