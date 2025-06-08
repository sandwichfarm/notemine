import { writable, derived, get } from 'svelte/store';
import type { FilterState, FeedFilter, FilterPreset } from '$lib/types/filters';
import { DEFAULT_PRESETS } from '$lib/types/filters';

const STORAGE_KEY = 'notemine_filter_presets';

function createFilterStore() {
  const { subscribe, set, update } = writable<FilterState>({
    activeFilter: null,
    presets: [],
    customFilters: []
  });

  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        update(state => ({
          ...state,
          presets: [...DEFAULT_PRESETS, ...parsed.presets.filter((p: FilterPreset) => !p.isDefault)],
          customFilters: parsed.customFilters || []
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
        presets: customPresets,
        customFilters: state.customFilters
      }));
    } catch (error) {
      console.error('Failed to save filter presets:', error);
    }
  }

  function setActiveFilter(filter: FeedFilter | null) {
    update(state => ({
      ...state,
      activeFilter: filter
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
    if (!state.activeFilter) return;

    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name,
      description,
      filter: { ...state.activeFilter },
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
      setActiveFilter({ ...preset.filter });
    }
  }

  function addCustomFilter(filter: FeedFilter) {
    update(state => ({
      ...state,
      customFilters: [...state.customFilters, filter]
    }));
    saveToStorage();
  }

  function updateCustomFilter(id: string, updates: Partial<FeedFilter>) {
    update(state => ({
      ...state,
      customFilters: state.customFilters.map(f => 
        f.id === id ? { ...f, ...updates, updatedAt: Date.now() } : f
      )
    }));
    saveToStorage();
  }

  function deleteCustomFilter(id: string) {
    update(state => ({
      ...state,
      customFilters: state.customFilters.filter(f => f.id !== id)
    }));
    saveToStorage();
  }

  loadFromStorage();

  return {
    subscribe,
    setActiveFilter,
    addPreset,
    updatePreset,
    deletePreset,
    saveCurrentAsPreset,
    loadPreset,
    addCustomFilter,
    updateCustomFilter,
    deleteCustomFilter,
    loadFromStorage
  };
}

export const filterStore = createFilterStore();

export const activeFilter = derived(
  filterStore,
  $filterStore => $filterStore.activeFilter
);

export const filterPresets = derived(
  filterStore,
  $filterStore => $filterStore.presets
);