<script lang="ts">
  import { nip01FilterStore, activeNip01Filters, nip01FilterPresets } from '$lib/stores/nip01-filters';
  import type { FilterPreset } from '$lib/types/nip01-filters';
  import Nip01Filters from './Nip01Filters.svelte';
  import { Save, Trash2 } from 'lucide-svelte';
  
  let showSavePreset = false;
  let presetName = '';
  let presetDescription = '';
  let selectedPresetId = '';

  function handleLoadPreset() {
    if (selectedPresetId) {
      nip01FilterStore.loadPreset(selectedPresetId);
    }
  }

  function handleSaveAsPreset() {
    if (presetName && $activeNip01Filters.length > 0) {
      nip01FilterStore.saveCurrentAsPreset(presetName, presetDescription);
      presetName = '';
      presetDescription = '';
      showSavePreset = false;
    }
  }

  function handleDeletePreset(id: string) {
    if (confirm('Are you sure you want to delete this preset?')) {
      nip01FilterStore.deletePreset(id);
    }
  }

  function handleClearFilters() {
    nip01FilterStore.clearActiveFilters();
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <select
        bind:value={selectedPresetId}
        onchange={handleLoadPreset}
        class="px-3 py-1.5 bg-surface-800 border border-surface-700 rounded text-sm text-white focus:outline-none focus:border-primary-500"
      >
        <option value="">Load preset...</option>
        {#each $nip01FilterPresets as preset}
          <option value={preset.id}>{preset.name}</option>
        {/each}
      </select>
      
      {#if $activeNip01Filters.length > 0}
        <button
          onclick={() => showSavePreset = true}
          class="flex items-center gap-1 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 rounded text-sm text-white transition-colors"
        >
          <Save class="w-3 h-3" />
          Save as Preset
        </button>
        
        <button
          onclick={handleClearFilters}
          class="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          Clear all
        </button>
      {/if}
    </div>
  </div>

  <!-- Filter Builder -->
  <Nip01Filters />

  <!-- Custom Presets -->
  {#if $nip01FilterPresets.filter(p => !p.isDefault).length > 0}
    <div>
      <h3 class="text-lg font-semibold text-white mb-3">Custom Presets</h3>
      <div class="space-y-2">
        {#each $nip01FilterPresets.filter(p => !p.isDefault) as preset}
          <div class="flex items-center justify-between p-3 bg-surface-800 border border-surface-700 rounded-lg">
            <div>
              <h4 class="font-medium text-white">{preset.name}</h4>
              {#if preset.description}
                <p class="text-sm text-surface-400">{preset.description}</p>
              {/if}
            </div>
            <button
              onclick={() => handleDeletePreset(preset.id)}
              class="p-1 text-surface-400 hover:text-red-400 transition-colors"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Save Preset Modal -->
  {#if showSavePreset}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-surface-900 border border-surface-800 rounded-lg p-6 max-w-md w-full">
        <h3 class="text-lg font-semibold text-white mb-4">Save Filter Preset</h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-1">
              Preset Name
            </label>
            <input
              type="text"
              bind:value={presetName}
              placeholder="e.g., My Custom Filter"
              class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-1">
              Description (optional)
            </label>
            <textarea
              bind:value={presetDescription}
              placeholder="What does this filter do?"
              class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
              rows="2"
            />
          </div>
        </div>
        
        <div class="flex justify-end gap-2 mt-6">
          <button
            onclick={() => showSavePreset = false}
            class="px-4 py-2 text-surface-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onclick={handleSaveAsPreset}
            disabled={!presetName}
            class="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-surface-700 disabled:cursor-not-allowed rounded text-white transition-colors"
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>