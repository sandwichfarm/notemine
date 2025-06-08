import { writable, derived, get } from 'svelte/store';
import type { FilterState, FilterPreset, Nip01Filter } from '$lib/types/nip01-filters';
import { DEFAULT_PRESETS } from '$lib/types/nip01-filters';

const STORAGE_KEY = 'notemine_nip01_filter_presets';

function createNip01FilterStore() {
  const { subscribe, set, update } = writable<FilterState>({
    activeFilters: [],
    presets: []
  });

  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        update(state => ({
          ...state,
          presets: [...DEFAULT_PRESETS, ...parsed.presets.filter((p: FilterPreset) => !p.isDefault)]
        }));
      } else {
        update(state => ({
          ...state,
          presets: DEFAULT_PRESETS
        }));
      }
    } catch (error) {
      console.error('Failed to load filter presets:', error);
      update(state => ({
        ...state,
        presets: DEFAULT_PRESETS
      }));
    }
  }

  function saveToStorage() {
    const state = get({ subscribe });
    const customPresets = state.presets.filter(p => !p.isDefault);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        presets: customPresets
      }));
    } catch (error) {
      console.error('Failed to save filter presets:', error);
    }
  }

  function setActiveFilters(filters: Nip01Filter[]) {
    update(state => ({
      ...state,
      activeFilters: filters
    }));
  }

  function clearActiveFilters() {
    update(state => ({
      ...state,
      activeFilters: []
    }));
  }

  function addPreset(preset: FilterPreset) {
    update(state => {
      const newState = {
        ...state,
        presets: [...state.presets, preset]
      };
      return newState;
    });
    saveToStorage();
  }

  function updatePreset(id: string, updates: Partial<FilterPreset>) {
    update(state => {
      const newState = {
        ...state,
        presets: state.presets.map(p => 
          p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
        )
      };
      return newState;
    });
    saveToStorage();
  }

  function deletePreset(id: string) {
    update(state => {
      const preset = state.presets.find(p => p.id === id);
      if (preset?.isDefault) {
        console.warn('Cannot delete default preset');
        return state;
      }
      
      const newState = {
        ...state,
        presets: state.presets.filter(p => p.id !== id)
      };
      return newState;
    });
    saveToStorage();
  }

  function saveCurrentAsPreset(name: string, description?: string) {
    const state = get({ subscribe });
    if (state.activeFilters.length === 0) return;

    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name,
      description,
      filters: [...state.activeFilters],
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    addPreset(preset);
    return preset;
  }

  function loadPreset(presetId: string) {
    const state = get({ subscribe });
    const preset = state.presets.find(p => p.id === presetId);
    
    if (preset) {
      setActiveFilters([...preset.filters]);
    }
  }

  loadFromStorage();

  return {
    subscribe,
    setActiveFilters,
    clearActiveFilters,
    addPreset,
    updatePreset,
    deletePreset,
    saveCurrentAsPreset,
    loadPreset,
    loadFromStorage
  };
}

export const nip01FilterStore = createNip01FilterStore();

export const activeNip01Filters = derived(
  nip01FilterStore,
  $store => $store.activeFilters
);

export const nip01FilterPresets = derived(
  nip01FilterStore,
  $store => $store.presets
);