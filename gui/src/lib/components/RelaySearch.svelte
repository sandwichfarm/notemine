<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { relayIndex, type RelayInfo } from '$lib/services/relay-index';
  
  const dispatch = createEventDispatcher();
  
  export let selectedRelays: string[] = [];
  export let maxHeight = '200px';
  export let placeholder = 'Search relays...';
  export let allowAdd = true;
  export let exclusiveMode = false;
  
  let searchQuery = '';
  let searchResults: RelayInfo[] = [];
  let showResults = false;
  let inputElement: HTMLInputElement;
  let selectedIndex = -1;
  
  $: {
    if (searchQuery) {
      searchResults = relayIndex.searchRelays(searchQuery);
      showResults = true;
      selectedIndex = -1;
    } else {
      searchResults = [];
      showResults = false;
    }
  }
  
  onMount(async () => {
    await relayIndex.initialize();
    // Start discovering non-auth relays in the background
    relayIndex.discoverNoAuthRelays();
  });
  
  function selectRelay(relay: RelayInfo) {
    console.log('Selecting relay:', relay.url);
    if (!selectedRelays.includes(relay.url)) {
      selectedRelays = [...selectedRelays, relay.url];
      // Auto-enable exclusive mode when first relay is manually added
      if (selectedRelays.length === 1 && !exclusiveMode) {
        exclusiveMode = true;
        dispatch('exclusiveModeChange', exclusiveMode);
      }
      console.log('Updated selectedRelays:', selectedRelays);
      dispatch('change', selectedRelays);
    }
    // Reset search
    searchQuery = '';
    showResults = false;
    selectedIndex = -1;
    // Focus back on input for next search
    if (inputElement) {
      inputElement.focus();
    }
  }
  
  function removeRelay(url: string) {
    selectedRelays = selectedRelays.filter(r => r !== url);
    // Auto-disable exclusive mode if no relays left
    if (selectedRelays.length === 0 && exclusiveMode) {
      exclusiveMode = false;
      dispatch('exclusiveModeChange', exclusiveMode);
    }
    dispatch('change', selectedRelays);
  }
  
  function toggleExclusiveMode() {
    exclusiveMode = !exclusiveMode;
    dispatch('exclusiveModeChange', exclusiveMode);
  }
  
  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (searchResults.length > 0) {
          selectedIndex = Math.min(selectedIndex + 1, searchResults.length - 1);
          showResults = true;
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (searchResults.length > 0) {
          selectedIndex = Math.max(selectedIndex - 1, -1);
          showResults = true;
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && searchResults[selectedIndex]) {
          selectRelay(searchResults[selectedIndex]);
        } else if (searchResults.length > 0 && selectedIndex === -1) {
          // Select first result if none selected
          selectRelay(searchResults[0]);
        } else if (allowAdd && searchQuery.startsWith('ws')) {
          // Allow adding custom relay URL
          addCustomRelay(searchQuery);
        }
        break;
      case 'Escape':
        e.preventDefault();
        searchQuery = '';
        showResults = false;
        selectedIndex = -1;
        break;
    }
  }
  
  async function addCustomRelay(url: string) {
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      return;
    }
    
    await relayIndex.addRelay(url);
    selectRelay({ url, pow: { enabled: false } });
  }
  
  function handleBlur() {
    // Delay to allow click events on results
    setTimeout(() => {
      showResults = false;
    }, 200);
  }
  
  function formatRelayName(relay: RelayInfo): string {
    if (relay.name) return relay.name;
    // Extract domain from URL
    try {
      const url = new URL(relay.url);
      return url.hostname;
    } catch {
      return relay.url;
    }
  }
</script>

<div class="relay-search">
  <!-- Selected Relays -->
  {#if selectedRelays.length > 0}
    <div class="selected-relays mb-2">
      <div class="flex items-center justify-between mb-1">
        <div class="text-green-600 text-xs">Selected Relays ({selectedRelays.length}):</div>
        <label class="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            bind:checked={exclusiveMode}
            onchange={toggleExclusiveMode}
            class="accent-green-600"
          />
          <span class="text-green-400">Exclusive mode</span>
        </label>
      </div>
      <div class="space-y-1 max-h-32 overflow-y-auto">
        {#each selectedRelays as relay}
          <div class="flex items-center justify-between py-0.5 px-2 bg-green-900/10 border border-green-800/50 rounded">
            <span class="text-green-400 text-xs font-mono truncate flex-1">{relay}</span>
            <button 
              onclick={() => removeRelay(relay)}
              class="ml-2 text-red-400 hover:text-red-300 text-sm"
              title="Remove relay"
            >
              ✕
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  
  <!-- Search Input -->
  <div class="relative">
    <input
      bind:this={inputElement}
      bind:value={searchQuery}
      onkeydown={handleKeydown}
      onfocus={() => searchQuery && (showResults = true)}
      onblur={handleBlur}
      type="text"
      {placeholder}
      class="w-full bg-transparent border border-green-800 px-2 py-1 text-green-400 text-xs
             placeholder-green-600 focus:border-green-600 focus:outline-none"
    />
    
    <!-- Search Results -->
    {#if showResults && searchResults.length > 0}
      <div 
        class="absolute top-full left-0 right-0 mt-1 bg-black border border-green-800 
               overflow-y-auto z-50 shadow-lg"
        style="max-height: {maxHeight}"
      >
        {#each searchResults as relay, index}
          <button
            onclick={() => selectRelay(relay)}
            class="w-full text-left px-2 py-1 hover:bg-green-900/20 text-xs
                   {index === selectedIndex ? 'bg-green-900/30' : ''}"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="text-green-400">{formatRelayName(relay)}</div>
                {#if relay.description}
                  <div class="text-green-600 text-xs truncate">{relay.description}</div>
                {/if}
              </div>
              <div class="flex items-center gap-1 text-xs">
                {#if relay.limitation?.auth_required}
                  <span class="text-orange-400" title="Authentication required">🔐</span>
                {/if}
                {#if relay.limitation?.payment_required}
                  <span class="text-yellow-400" title="Payment required">💰</span>
                {/if}
                {#if relay.pow?.enabled}
                  <span class="text-yellow-400" title="PoW enabled">⚡</span>
                {/if}
                {#if relay.status === 'active'}
                  <span class="text-green-400" title="Active">●</span>
                {:else}
                  <span class="text-gray-500" title="Status unknown">○</span>
                {/if}
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
    
    <!-- Custom URL hint -->
    {#if showResults && allowAdd && searchQuery.startsWith('ws') && !searchResults.some(r => r.url === searchQuery)}
      <div class="absolute top-full left-0 right-0 mt-1 bg-black border border-green-800 p-2 text-xs">
        <div class="text-green-600">Press Enter to add custom relay:</div>
        <div class="text-green-400 font-mono">{searchQuery}</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .relay-tag {
    @apply inline-flex items-center px-2 py-0.5 bg-green-900/20 border border-green-800 rounded text-xs;
  }
</style>