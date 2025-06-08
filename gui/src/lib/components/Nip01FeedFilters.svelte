<script lang="ts">
  import { nip01FilterStore, activeNip01Filters } from '$lib/stores/nip01-filters';
  import type { Nip01Filter } from '$lib/types/nip01-filters';
  
  let filters: Nip01Filter[] = [];
  let showCreateFilter = false;
  let editingFilterIndex = -1;
  
  // New filter form state
  let newFilter: Partial<Nip01Filter> = {};
  let kindsInput = '';
  let authorsInput = '';
  let tagName = '';
  let tagValues = '';
  
  // Subscribe to active filters
  nip01FilterStore.subscribe(state => {
    filters = [...state.activeFilters];
  });
  
  function startNewFilter() {
    newFilter = {};
    kindsInput = '';
    authorsInput = '';
    tagName = '';
    tagValues = '';
    showCreateFilter = true;
    editingFilterIndex = -1;
  }
  
  function startEditFilter(index: number) {
    const filter = filters[index];
    newFilter = { ...filter };
    kindsInput = filter.kinds?.join(',') || '';
    authorsInput = filter.authors?.join('\n') || '';
    // Extract first tag filter for editing
    const tagEntries = Object.entries(filter).filter(([k]) => k.startsWith('#'));
    if (tagEntries.length > 0) {
      tagName = tagEntries[0][0].slice(1);
      tagValues = (tagEntries[0][1] as string[]).join(',');
    } else {
      tagName = '';
      tagValues = '';
    }
    showCreateFilter = true;
    editingFilterIndex = index;
  }
  
  function saveFilter() {
    const filter: Nip01Filter = {};
    
    // Parse kinds
    if (kindsInput.trim()) {
      filter.kinds = kindsInput.split(',').map(k => parseInt(k.trim())).filter(k => !isNaN(k));
    }
    
    // Parse authors
    if (authorsInput.trim()) {
      filter.authors = authorsInput.split('\n').map(a => a.trim()).filter(Boolean);
    }
    
    // Add other fields
    if (newFilter.limit) filter.limit = newFilter.limit;
    if (newFilter.since) filter.since = newFilter.since;
    if (newFilter.until) filter.until = newFilter.until;
    if (newFilter.search) filter.search = newFilter.search;
    
    // Add tag filter
    if (tagName && tagValues) {
      const key = `#${tagName}` as `#${string}`;
      filter[key] = tagValues.split(',').map(v => v.trim()).filter(Boolean);
    }
    
    // Update filters
    if (editingFilterIndex >= 0) {
      filters[editingFilterIndex] = filter;
    } else {
      filters = [...filters, filter];
    }
    
    nip01FilterStore.setActiveFilters(filters);
    showCreateFilter = false;
  }
  
  function removeFilter(index: number) {
    filters = filters.filter((_, i) => i !== index);
    nip01FilterStore.setActiveFilters(filters);
  }
  
  function toggleFilter(index: number) {
    // In NIP-01, filters are always active when present
    // So toggling means removing/adding back
    removeFilter(index);
  }
  
  function formatFilter(filter: Nip01Filter): string {
    const parts = [];
    
    if (filter.kinds?.length) {
      parts.push(`kinds:${filter.kinds.join(',')}`);
    }
    if (filter.authors?.length) {
      if (filter.authors.length === 1) {
        // Show partial pubkey for single author
        const pubkey = filter.authors[0];
        parts.push(`author:${pubkey.slice(0, 8)}...`);
      } else {
        parts.push(`${filter.authors.length} authors`);
      }
    }
    if (filter.limit) {
      parts.push(`limit:${filter.limit}`);
    }
    if (filter.since) {
      const hours = Math.floor((Date.now() / 1000 - filter.since) / 3600);
      parts.push(`≥${hours}h ago`);
    }
    if (filter.search) {
      parts.push(`"${filter.search}"`);
    }
    
    // Tag filters
    Object.entries(filter).forEach(([key, values]) => {
      if (key.startsWith('#') && Array.isArray(values)) {
        parts.push(`${key}:${values.length}`);
      }
    });
    
    return parts.join(' ');
  }
  
  // Convert hours to timestamp
  function hoursToTimestamp(hours: number): number {
    return Math.floor(Date.now() / 1000) - (hours * 3600);
  }
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between">
    <h4 class="text-green-400 font-bold">FILTERS</h4>
    <button 
      onclick={startNewFilter}
      class="text-green-400 hover:text-green-300 text-xs"
    >
      + Add Filter
    </button>
  </div>
  
  <!-- Create/Edit Filter Form -->
  {#if showCreateFilter}
    <div class="space-y-2 p-2 border border-green-800 rounded">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-green-600 text-xs">Kinds (comma-separated):</label>
          <input
            type="text"
            bind:value={kindsInput}
            placeholder="1,7,1111"
            class="w-full bg-transparent border border-green-800 px-1 text-green-400 text-xs"
          />
        </div>
        <div>
          <label class="text-green-600 text-xs">Limit:</label>
          <input
            type="number"
            bind:value={newFilter.limit}
            placeholder="100"
            min="1"
            class="w-full bg-transparent border border-green-800 px-1 text-green-400 text-xs"
          />
        </div>
        <div>
          <label class="text-green-600 text-xs">Max Age (hours):</label>
          <input
            type="number"
            oninput={(e) => {
              const hours = parseInt(e.currentTarget.value);
              if (!isNaN(hours) && hours > 0) {
                newFilter.since = hoursToTimestamp(hours);
              } else {
                delete newFilter.since;
              }
            }}
            placeholder="24"
            min="1"
            class="w-full bg-transparent border border-green-800 px-1 text-green-400 text-xs"
          />
        </div>
        <div>
          <label class="text-green-600 text-xs">Search:</label>
          <input
            type="text"
            bind:value={newFilter.search}
            placeholder="keyword"
            class="w-full bg-transparent border border-green-800 px-1 text-green-400 text-xs"
          />
        </div>
      </div>
      
      <!-- Authors -->
      <div>
        <label class="text-green-600 text-xs">Authors (one per line):</label>
        <textarea
          bind:value={authorsInput}
          placeholder="npub... or hex"
          rows="2"
          class="w-full bg-transparent border border-green-800 px-1 text-green-400 text-xs font-mono"
        />
      </div>
      
      <!-- Tag Filter -->
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-green-600 text-xs">Tag name:</label>
          <input
            type="text"
            bind:value={tagName}
            placeholder="e, p, t, etc"
            class="w-full bg-transparent border border-green-800 px-1 text-green-400 text-xs"
          />
        </div>
        <div>
          <label class="text-green-600 text-xs">Tag values:</label>
          <input
            type="text"
            bind:value={tagValues}
            placeholder="value1,value2"
            class="w-full bg-transparent border border-green-800 px-1 text-green-400 text-xs"
          />
        </div>
      </div>
      
      <div class="flex gap-2">
        <button 
          onclick={saveFilter}
          class="px-2 py-1 bg-green-900 text-green-400 border border-green-600 hover:bg-green-800 text-xs"
        >
          {editingFilterIndex >= 0 ? 'Update' : 'Add'}
        </button>
        <button 
          onclick={() => showCreateFilter = false}
          class="px-2 py-1 text-green-600 hover:text-green-400 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Active Filters -->
  <div class="space-y-1">
    {#each filters as filter, index}
      <div class="flex items-center justify-between p-1 border border-green-800 rounded">
        <div class="flex items-center gap-2 flex-1">
          <span class="text-green-400 text-xs font-mono truncate">
            Filter {index + 1}: {formatFilter(filter)}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button 
            onclick={() => startEditFilter(index)}
            class="text-green-600 hover:text-green-400 text-xs"
          >
            ✏️
          </button>
          <button 
            onclick={() => removeFilter(index)}
            class="text-red-400 hover:text-red-300 text-xs"
          >
            ✕
          </button>
        </div>
      </div>
    {/each}
    
    {#if filters.length === 0}
      <p class="text-green-600 text-xs">No filters active. Showing all events.</p>
    {/if}
  </div>
  
  <!-- Filter Info -->
  <div class="text-green-600 text-xs border-t border-green-800 pt-1">
    {#if filters.length > 1}
      <p>Multiple filters are OR'd together (NIP-01)</p>
    {/if}
  </div>
</div>