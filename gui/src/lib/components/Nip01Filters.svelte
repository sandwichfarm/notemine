<script lang="ts">
  import { nip01FilterStore } from '$lib/stores/nip01-filters';
  import type { Nip01Filter } from '$lib/types/nip01-filters';
  import { Plus, X, ChevronDown, ChevronUp, Save, Trash2 } from 'lucide-svelte';
  
  let filters: Nip01Filter[] = [];
  let expandedFilters = new Set<number>();
  let tagInputs: Map<number, { names: string; values: string }> = new Map();
  
  // Subscribe to active filters
  nip01FilterStore.subscribe(state => {
    filters = [...state.activeFilters];
    if (filters.length === 0) {
      addFilter();
    }
  });
  
  function addFilter() {
    filters = [...filters, {}];
    expandedFilters.add(filters.length - 1);
    expandedFilters = expandedFilters;
  }
  
  function removeFilter(index: number) {
    filters = filters.filter((_, i) => i !== index);
    expandedFilters.delete(index);
    expandedFilters = expandedFilters;
    updateStore();
  }
  
  function toggleFilter(index: number) {
    if (expandedFilters.has(index)) {
      expandedFilters.delete(index);
    } else {
      expandedFilters.add(index);
    }
    expandedFilters = expandedFilters;
  }
  
  function updateStore() {
    // Clean up empty filters
    const validFilters = filters.filter(f => 
      (f.ids && f.ids.length > 0) ||
      (f.authors && f.authors.length > 0) ||
      (f.kinds && f.kinds.length > 0) ||
      f.since ||
      f.until ||
      f.limit ||
      Object.keys(f).some(k => k.startsWith('#'))
    );
    
    nip01FilterStore.setActiveFilters(validFilters);
  }
  
  function handleAuthorsInput(index: number, value: string) {
    const authors = value.split('\n').map(a => a.trim()).filter(Boolean);
    filters[index].authors = authors.length > 0 ? authors : undefined;
    updateStore();
  }
  
  function handleIdsInput(index: number, value: string) {
    const ids = value.split('\n').map(id => id.trim()).filter(Boolean);
    filters[index].ids = ids.length > 0 ? ids : undefined;
    updateStore();
  }
  
  function handleKindsInput(index: number, value: string) {
    const kinds = value.split(',').map(k => parseInt(k.trim())).filter(k => !isNaN(k));
    filters[index].kinds = kinds.length > 0 ? kinds : undefined;
    updateStore();
  }
  
  function addTagFilter(filterIndex: number) {
    const input = tagInputs.get(filterIndex) || { names: '', values: '' };
    const tagNames = input.names.split(',').map(n => n.trim()).filter(Boolean);
    const tagValues = input.values.split(',').map(v => v.trim()).filter(Boolean);
    
    if (tagNames.length > 0 && tagValues.length > 0) {
      tagNames.forEach(name => {
        const key = `#${name}` as `#${string}`;
        filters[filterIndex][key] = tagValues;
      });
      
      // Clear inputs
      tagInputs.set(filterIndex, { names: '', values: '' });
      updateStore();
    }
  }
  
  function removeTagFilter(filterIndex: number, tagKey: string) {
    delete filters[filterIndex][tagKey as keyof Nip01Filter];
    filters = filters;
    updateStore();
  }
  
  function getTagFilters(filter: Nip01Filter): Array<[string, string[]]> {
    return Object.entries(filter)
      .filter(([key]) => key.startsWith('#'))
      .map(([key, values]) => [key, values as string[]]);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold text-white">Filters</h2>
    <button
      onclick={addFilter}
      class="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded text-white transition-colors"
    >
      <Plus class="w-4 h-4" />
      New Filter
    </button>
  </div>
  
  {#each filters as filter, index}
    <div class="bg-surface-800 rounded-lg border border-surface-700">
      <div class="p-4 flex items-center justify-between">
        <button
          onclick={() => toggleFilter(index)}
          class="flex items-center gap-2 text-left flex-1"
        >
          {#if expandedFilters.has(index)}
            <ChevronUp class="w-4 h-4 text-surface-400" />
          {:else}
            <ChevronDown class="w-4 h-4 text-surface-400" />
          {/if}
          <span class="text-white font-medium">Filter #{index + 1}</span>
        </button>
        
        <button
          onclick={() => removeFilter(index)}
          class="p-1 text-surface-400 hover:text-red-400 transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
      
      {#if expandedFilters.has(index)}
        <div class="px-4 pb-4 space-y-4 border-t border-surface-700">
          <!-- Authors -->
          <div class="mt-4">
            <label class="block text-sm font-medium text-surface-300 mb-2">
              Authors
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                placeholder="pubkey (in hex format)"
                class="flex-1 px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget;
                    const value = input.value.trim();
                    if (value) {
                      filters[index].authors = [...(filters[index].authors || []), value];
                      input.value = '';
                      updateStore();
                    }
                  }
                }}
              />
              <button
                onclick={(e) => {
                  const input = e.currentTarget.parentElement?.querySelector('input');
                  if (input && input.value.trim()) {
                    filters[index].authors = [...(filters[index].authors || []), input.value.trim()];
                    input.value = '';
                    updateStore();
                  }
                }}
                class="px-3 py-2 bg-primary-600 hover:bg-primary-500 rounded text-white transition-colors"
              >
                Add
              </button>
            </div>
            {#if filter.authors && filter.authors.length > 0}
              <div class="mt-2 flex flex-wrap gap-2">
                {#each filter.authors as author}
                  <span class="inline-flex items-center gap-1 px-2 py-1 bg-surface-700 rounded text-sm text-surface-200">
                    {author.slice(0, 8)}...{author.slice(-8)}
                    <button
                      onclick={() => {
                        filters[index].authors = filter.authors?.filter(a => a !== author);
                        if (filters[index].authors?.length === 0) {
                          delete filters[index].authors;
                        }
                        updateStore();
                      }}
                      class="text-surface-400 hover:text-red-400"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </span>
                {/each}
              </div>
            {:else}
              <p class="mt-2 text-sm text-surface-400">Nothing yet!</p>
            {/if}
          </div>
          
          <!-- IDs -->
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-2">
              IDs
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                placeholder="event id (in hex format)"
                class="flex-1 px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget;
                    const value = input.value.trim();
                    if (value) {
                      filters[index].ids = [...(filters[index].ids || []), value];
                      input.value = '';
                      updateStore();
                    }
                  }
                }}
              />
              <button
                onclick={(e) => {
                  const input = e.currentTarget.parentElement?.querySelector('input');
                  if (input && input.value.trim()) {
                    filters[index].ids = [...(filters[index].ids || []), input.value.trim()];
                    input.value = '';
                    updateStore();
                  }
                }}
                class="px-3 py-2 bg-primary-600 hover:bg-primary-500 rounded text-white transition-colors"
              >
                Add
              </button>
            </div>
            {#if filter.ids && filter.ids.length > 0}
              <div class="mt-2 flex flex-wrap gap-2">
                {#each filter.ids as id}
                  <span class="inline-flex items-center gap-1 px-2 py-1 bg-surface-700 rounded text-sm text-surface-200">
                    {id.slice(0, 8)}...{id.slice(-8)}
                    <button
                      onclick={() => {
                        filters[index].ids = filter.ids?.filter(i => i !== id);
                        if (filters[index].ids?.length === 0) {
                          delete filters[index].ids;
                        }
                        updateStore();
                      }}
                      class="text-surface-400 hover:text-red-400"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </span>
                {/each}
              </div>
            {:else}
              <p class="mt-2 text-sm text-surface-400">Nothing yet!</p>
            {/if}
          </div>
          
          <!-- Kinds -->
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-2">
              Kinds
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                placeholder="event kind (e.g. 0, 1, 9735, etc.)"
                class="flex-1 px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget;
                    const value = parseInt(input.value.trim());
                    if (!isNaN(value)) {
                      filters[index].kinds = [...(filters[index].kinds || []), value];
                      input.value = '';
                      updateStore();
                    }
                  }
                }}
              />
              <button
                onclick={(e) => {
                  const input = e.currentTarget.parentElement?.querySelector('input');
                  if (input) {
                    const value = parseInt(input.value.trim());
                    if (!isNaN(value)) {
                      filters[index].kinds = [...(filters[index].kinds || []), value];
                      input.value = '';
                      updateStore();
                    }
                  }
                }}
                class="px-3 py-2 bg-primary-600 hover:bg-primary-500 rounded text-white transition-colors"
              >
                Add
              </button>
            </div>
            {#if filter.kinds && filter.kinds.length > 0}
              <div class="mt-2 flex flex-wrap gap-2">
                {#each filter.kinds as kind}
                  <span class="inline-flex items-center gap-1 px-2 py-1 bg-surface-700 rounded text-sm text-surface-200">
                    {kind}
                    <button
                      onclick={() => {
                        filters[index].kinds = filter.kinds?.filter(k => k !== kind);
                        if (filters[index].kinds?.length === 0) {
                          delete filters[index].kinds;
                        }
                        updateStore();
                      }}
                      class="text-surface-400 hover:text-red-400"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </span>
                {/each}
              </div>
            {:else}
              <p class="mt-2 text-sm text-surface-400">Nothing yet!</p>
            {/if}
          </div>
          
          <!-- Tags -->
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-2">
              Tags
            </label>
            
            <!-- Tag input -->
            <div class="space-y-2">
              <label class="block text-xs text-surface-400">Tag Names</label>
              <div class="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="tag name based on NIP-1 (e.g. e, p, a, t, r, etc.)"
                  value={tagInputs.get(index)?.names || ''}
                  oninput={(e) => {
                    const current = tagInputs.get(index) || { names: '', values: '' };
                    tagInputs.set(index, { ...current, names: e.currentTarget.value });
                  }}
                  class="flex-1 px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
                />
                <button
                  onclick={() => addTagFilter(index)}
                  class="px-3 py-2 bg-primary-600 hover:bg-primary-500 rounded text-white transition-colors"
                >
                  Add
                </button>
              </div>
              
              {#if tagInputs.get(index)?.names}
                <div class="flex gap-2">
                  {#each tagInputs.get(index).names.split(',').map(n => n.trim()).filter(Boolean) as name}
                    <span class="inline-flex items-center px-2 py-1 bg-surface-700 rounded text-sm text-surface-200">
                      #{name}
                      <button
                        onclick={() => {
                          const current = tagInputs.get(index) || { names: '', values: '' };
                          const names = current.names.split(',').map(n => n.trim()).filter(n => n && n !== name);
                          tagInputs.set(index, { ...current, names: names.join(', ') });
                        }}
                        class="ml-1 text-surface-400 hover:text-red-400"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </span>
                  {/each}
                </div>
              {/if}
              
              <label class="block text-xs text-surface-400">Tag Values (#t)</label>
              <input
                type="text"
                placeholder="something"
                value={tagInputs.get(index)?.values || ''}
                oninput={(e) => {
                  const current = tagInputs.get(index) || { names: '', values: '' };
                  tagInputs.set(index, { ...current, values: e.currentTarget.value });
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    addTagFilter(index);
                  }
                }}
                class="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            
            <!-- Existing tags -->
            {#if getTagFilters(filter).length > 0}
              <div class="mt-3 space-y-2">
                {#each getTagFilters(filter) as [tagKey, tagValues]}
                  <div class="flex items-start gap-2">
                    <span class="text-surface-400 mt-1">{tagKey}:</span>
                    <div class="flex-1 flex flex-wrap gap-2">
                      {#each tagValues as value}
                        <span class="inline-flex items-center gap-1 px-2 py-1 bg-surface-700 rounded text-sm text-surface-200">
                          {value}
                        </span>
                      {/each}
                    </div>
                    <button
                      onclick={() => removeTagFilter(index, tagKey)}
                      class="p-1 text-surface-400 hover:text-red-400"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="mt-2 text-sm text-surface-400">Nothing yet!</p>
            {/if}
          </div>
          
          <!-- Search -->
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-2">
              Search
            </label>
            <input
              type="text"
              placeholder="Search string"
              value={filter.search || ''}
              oninput={(e) => {
                filters[index].search = e.currentTarget.value || undefined;
                updateStore();
              }}
              class="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
            />
          </div>
          
          <!-- Limit -->
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-2">
              Limit
            </label>
            <input
              type="number"
              placeholder="Maximum number of events"
              value={filter.limit || ''}
              oninput={(e) => {
                const value = parseInt(e.currentTarget.value);
                filters[index].limit = !isNaN(value) && value > 0 ? value : undefined;
                updateStore();
              }}
              class="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
            />
          </div>
          
          <!-- Since -->
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-2">
              Since
            </label>
            <input
              type="number"
              placeholder="Timestamp in seconds"
              value={filter.since || ''}
              oninput={(e) => {
                const value = parseInt(e.currentTarget.value);
                filters[index].since = !isNaN(value) && value > 0 ? value : undefined;
                updateStore();
              }}
              class="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
            />
          </div>
          
          <!-- Until -->
          <div>
            <label class="block text-sm font-medium text-surface-300 mb-2">
              Until
            </label>
            <input
              type="number"
              placeholder="Timestamp in seconds"
              value={filter.until || ''}
              oninput={(e) => {
                const value = parseInt(e.currentTarget.value);
                filters[index].until = !isNaN(value) && value > 0 ? value : undefined;
                updateStore();
              }}
              class="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-400 focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>
      {/if}
    </div>
  {/each}
  
  {#if filters.length === 0}
    <div class="text-center py-8 text-surface-400">
      <p>No filters configured. Click "New Filter" to add one.</p>
    </div>
  {/if}
</div>