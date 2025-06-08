import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { DEFAULT_DIFFICULTY_SETTINGS, type DifficultySettings } from '$lib/types/difficulty';

function createDifficultyStore() {
  // Initialize with defaults
  let initialSettings = DEFAULT_DIFFICULTY_SETTINGS;
  
  // Load from localStorage if in browser
  if (browser) {
    const stored = localStorage.getItem('notemine-difficulty-settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        initialSettings = { ...DEFAULT_DIFFICULTY_SETTINGS, ...parsed };
      } catch (error) {
        console.error('Failed to parse stored difficulty settings:', error);
      }
    }
  }
  
  const { subscribe, set, update } = writable<DifficultySettings>(initialSettings);
  
  return {
    subscribe,
    set: (value: DifficultySettings) => {
      set(value);
      if (browser) {
        localStorage.setItem('notemine-difficulty-settings', JSON.stringify(value));
      }
    },
    update: (updater: (value: DifficultySettings) => DifficultySettings) => {
      update((current) => {
        const newValue = updater(current);
        if (browser) {
          localStorage.setItem('notemine-difficulty-settings', JSON.stringify(newValue));
        }
        return newValue;
      });
    },
    reset: () => {
      const defaults = DEFAULT_DIFFICULTY_SETTINGS;
      set(defaults);
      if (browser) {
        localStorage.setItem('notemine-difficulty-settings', JSON.stringify(defaults));
      }
    }
  };
}

export const difficultySettings = createDifficultyStore();

// Derived stores for easy access
export const globalDifficulty = derived(
  difficultySettings,
  $settings => $settings.global
);

export const perKindDifficulty = derived(
  difficultySettings,
  $settings => $settings.perKind
);