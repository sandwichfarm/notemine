<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Nip01Filter } from '$lib/types/nip01-filters';
  import { validateFilter } from '$lib/types/nip01-filters';
  import { Plus, Trash2, AlertCircle } from 'lucide-svelte';

  export let filter: Nip01Filter = {};
  
  const dispatch = createEventDispatcher();
  
  let tagFilters: Array<{ key: string; values: string }> = [];
  let errors: string[] = [];

  // Initialize tag filters from existing filter
  $: {
    tagFilters = Object.entries(filter)
      .filter(([key]) => key.startsWith('#'))
      .map(([key, values]) => ({
        key: key.slice(1),
        values: Array.isArray(values) ? values.join(', ') : ''
      }));
  }

  function updateFilter() {
    const newFilter: Nip01Filter = {};
    
    if (filter.ids?.length) newFilter.ids = filter.ids;
    if (filter.authors?.length) newFilter.authors = filter.authors;
    if (filter.kinds?.length) newFilter.kinds = filter.kinds;
    if (filter.since) newFilter.since = filter.since;
    if (filter.until) newFilter.until = filter.until;
    if (filter.limit) newFilter.limit = filter.limit;
    
    // Add tag filters
    tagFilters.forEach(({ key, values }) => {
      if (key && values) {
        const tagKey = `#${key}` as `#${string}`;
        newFilter[tagKey] = values.split(',').map(v => v.trim()).filter(Boolean);
      }
    });
    
    filter = newFilter;
    errors = validateFilter(filter);
  }

  function addTagFilter() {
    tagFilters = [...tagFilters, { key: '', values: '' }];
  }

  function removeTagFilter(index: number) {
    tagFilters = tagFilters.filter((_, i) => i !== index);
    updateFilter();
  }

  function handleSave() {
    updateFilter();
    if (errors.length === 0) {
      dispatch('save', filter);
    }
  }

  function handleCancel() {
    dispatch('cancel');
  }

  function handleIdsInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    filter.ids = target.value.split('\n').map(id => id.trim()).filter(Boolean);
    updateFilter();
  }

  function handleAuthorsInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    filter.authors = target.value.split('\n').map(author => author.trim()).filter(Boolean);
    updateFilter();
  }

  function handleKindsInput(e: Event) {
    const target = e.target as HTMLInputElement;
    filter.kinds = target.value.split(',').map(k => parseInt(k.trim())).filter(k => !isNaN(k));
    updateFilter();
  }
</script>

<div class="space-y-4">
  <h3 class="text-lg font-semibold text-white">NIP-01 Filter Builder</h3>
  
  {#if errors.length > 0}
    <div class="bg-red-900/20 border border-red-800 rounded-lg p-3">
      <div class="flex items-start gap-2">
        <AlertCircle class="w-5 h-5 text-red-400 mt-0.5" />
        <div class="space-y-1">
          {#each errors as error}
            <p class="text-sm text-red-300">{error}</p>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-surface-300 mb-1">
        Event IDs
      </label>
      <textarea
        value={filter.ids?.join('\n') || ''}
        oninput={handleIdsInput}
        placeholder="One event ID per line (64 character hex)"
        class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500 font-mono text-sm"
        rows="2"
      />
    </div>

    <div>
      <label class="block text-sm font-medium text-surface-300 mb-1">
        Authors (Pubkeys)
      </label>
      <textarea
        value={filter.authors?.join('\n') || ''}
        oninput={handleAuthorsInput}
        placeholder="One pubkey per line (64 character hex)"
        class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500 font-mono text-sm"
        rows="2"
      />
    </div>

    <div>
      <label class="block text-sm font-medium text-surface-300 mb-1">
        Event Kinds
      </label>
      <input
        type="text"
        value={filter.kinds?.join(', ') || ''}
        oninput={handleKindsInput}
        placeholder="e.g., 1, 7, 1111 (comma separated)"
        class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-surface-300 mb-1">
          Since (Unix timestamp)
        </label>
        <input
          type="number"
          bind:value={filter.since}
          oninput={updateFilter}
          placeholder="e.g., {Math.floor(Date.now() / 1000) - 3600}"
          class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-surface-300 mb-1">
          Until (Unix timestamp)
        </label>
        <input
          type="number"
          bind:value={filter.until}
          oninput={updateFilter}
          placeholder="e.g., {Math.floor(Date.now() / 1000)}"
          class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
        />
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium text-surface-300 mb-1">
        Limit
      </label>
      <input
        type="number"
        bind:value={filter.limit}
        oninput={updateFilter}
        placeholder="Maximum number of events"
        class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
      />
    </div>

    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="text-sm font-medium text-surface-300">
          Tag Filters
        </label>
        <button
          type="button"
          onclick={addTagFilter}
          class="flex items-center gap-1 px-2 py-1 bg-surface-700 hover:bg-surface-600 rounded text-sm text-white transition-colors"
        >
          <Plus class="w-3 h-3" />
          Add Tag
        </button>
      </div>
      
      <div class="space-y-2">
        {#each tagFilters as tagFilter, index}
          <div class="flex items-center gap-2">
            <span class="text-surface-400">#</span>
            <input
              type="text"
              bind:value={tagFilter.key}
              oninput={updateFilter}
              placeholder="Tag name (e.g., e, p, t)"
              class="w-24 px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
            />
            <input
              type="text"
              bind:value={tagFilter.values}
              oninput={updateFilter}
              placeholder="Values (comma separated, use * for any)"
              class="flex-1 px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
            />
            <button
              type="button"
              onclick={() => removeTagFilter(index)}
              class="p-1 text-surface-400 hover:text-red-400 transition-colors"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="flex items-center justify-end gap-2 pt-4 border-t border-surface-700">
    <button
      type="button"
      onclick={handleCancel}
      class="px-4 py-2 text-surface-300 hover:text-white transition-colors"
    >
      Cancel
    </button>
    <button
      type="button"
      onclick={handleSave}
      disabled={errors.length > 0}
      class="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-surface-700 disabled:cursor-not-allowed rounded text-white transition-colors"
    >
      Apply Filter
    </button>
  </div>
</div>