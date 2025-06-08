<script lang="ts">
  import { onMount } from 'svelte';
  import { relayPool } from '$lib/stores/relay-pool';
  import { relayIndex } from '$lib/services/relay-index';
  import { getPowClient } from '$lib/services/pow-client';
  import { browser } from '$app/environment';
  import { Plus, X, Search, Wifi, WifiOff, RefreshCw } from 'lucide-svelte';
  import RelaySearch from './RelaySearch.svelte';
  
  export let windowId: string;
  
  let selectedRelay: string | null = null;
  let relayStatuses = new Map<string, 'connected' | 'connecting' | 'disconnected' | 'error'>();
  let isDiscovering = false;
  
  // Get pow client for relay operations
  let pow: any = null;
  $: if (browser) {
    try {
      pow = getPowClient();
    } catch (err) {
      console.error('Failed to get pow client:', err);
    }
  }
  
  // Local copy of relays that syncs with the pool
  $: poolRelays = [...$relayPool.relays];
  
  onMount(async () => {
    // Initialize relay index service
    await relayIndex.initialize();
    
    // Initialize relay statuses
    $relayPool.relays.forEach(relay => {
      relayStatuses.set(relay, 'disconnected');
    });
    
    // Listen for relay-specific hotkeys from HyprlandInterface
    const handleRelayHotkey = (e: CustomEvent) => {
      if (e.detail.windowId === windowId) {
        const action = e.detail.action;
        
        switch (action) {
          case 'relayAdd':
            // Focus the relay search input
            const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
            }
            break;
          case 'relayRemove':
            removeSelectedRelay();
            break;
          case 'relayDiscover':
            discoverRelays();
            break;
          case 'relayTest':
            testSelectedRelay();
            break;
          case 'relayClear':
            // Clear selection
            selectedRelay = null;
            break;
          case 'relaySearch':
            // Focus search is handled by relayAdd
            const searchInput2 = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
            if (searchInput2) {
              searchInput2.focus();
            }
            break;
        }
      }
    };
    
    globalThis.addEventListener('relay-hotkey', handleRelayHotkey as EventListener);
    
    return () => {
      globalThis.removeEventListener('relay-hotkey', handleRelayHotkey as EventListener);
    };
  });
  
  // Update relay pool when local relays change
  function updatePoolRelays(newRelays: string[]) {
    // Add new relays
    newRelays.forEach(relay => {
      if (!$relayPool.relays.includes(relay)) {
        relayPool.addRelay(relay);
        relayStatuses.set(relay, 'connecting');
      }
    });
    
    // Remove deleted relays
    $relayPool.relays.forEach(relay => {
      if (!newRelays.includes(relay)) {
        relayPool.removeRelay(relay);
        relayStatuses.delete(relay);
      }
    });
    
    // Trigger reactivity
    relayStatuses = relayStatuses;
  }
  
  function removeSelectedRelay() {
    if (selectedRelay) {
      const newRelays = poolRelays.filter(r => r !== selectedRelay);
      poolRelays = newRelays;
      updatePoolRelays(newRelays);
      selectedRelay = null;
    }
  }
  
  function selectRelay(url: string) {
    selectedRelay = selectedRelay === url ? null : url;
  }
  
  async function discoverRelays() {
    if (isDiscovering) return;
    
    isDiscovering = true;
    try {
      // Use relay index service for discovery
      await relayIndex.discoverNoAuthRelays();
      console.log('✅ Relay discovery completed');
    } catch (error) {
      console.error('❌ Failed to discover relays:', error);
    } finally {
      isDiscovering = false;
    }
  }
  
  function testSelectedRelay() {
    if (selectedRelay) {
      console.log('Testing relay:', selectedRelay);
      relayStatuses.set(selectedRelay, 'connecting');
      
      // Simulate connection test
      setTimeout(() => {
        const success = Math.random() > 0.3; // 70% success rate
        relayStatuses.set(selectedRelay!, success ? 'connected' : 'error');
        relayStatuses = new Map(relayStatuses); // Trigger reactivity
      }, 1000);
    }
  }
  
  function getStatusIcon(status: string) {
    switch (status) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  }
</script>

<div class="text-xs space-y-3 h-full overflow-auto">
  <div class="flex items-center justify-between">
    <h3 class="text-sm text-green-300">RELAY_MANAGER</h3>
    <div class="text-xs text-green-600">
      [{$relayPool.connected}/{$relayPool.relays.length}] connected
    </div>
  </div>
  
  <!-- Hotkey Help -->
  <div class="bg-green-900/10 border border-green-800 p-2 rounded">
    <div class="text-green-400 font-bold mb-1">HOTKEYS (when focused):</div>
    <div class="grid grid-cols-2 gap-1 text-xs text-green-600">
      <span>A/: Search relays</span>
      <span>R: Remove selected</span>
      <span>D: Discover relays</span>
      <span>T: Test selected</span>
      <span>C: Clear selection</span>
      <span>ESC: Deselect</span>
    </div>
  </div>
  
  <!-- Relay Search and Selection -->
  <div class="space-y-2">
    <h4 class="text-green-400 font-bold flex items-center gap-2">
      <Search class="w-3 h-3" />
      RELAY_SELECTION
      {#if isDiscovering}
        <RefreshCw class="w-3 h-3 animate-spin" />
      {/if}
    </h4>
    
    <RelaySearch 
      bind:selectedRelays={poolRelays}
      on:change={() => updatePoolRelays(poolRelays)}
      placeholder="Search or add relay URL..."
      maxHeight="150px"
    />
    
    <button
      onclick={discoverRelays}
      disabled={isDiscovering}
      class="w-full px-3 py-1 bg-blue-900 hover:bg-blue-800 disabled:bg-blue-950 disabled:opacity-50 
             border border-blue-600 text-blue-400 text-xs"
    >
      {isDiscovering ? 'DISCOVERING...' : 'DISCOVER MORE RELAYS'}
    </button>
    
    <!-- Exclusive Mode Checkbox -->
    <label class="flex items-center gap-2 mt-2 cursor-pointer group p-2 rounded border 
                   {$relayPool.exclusiveMode ? 'bg-yellow-900/20 border-yellow-600' : 'bg-green-900/10 border-green-800'}
                   hover:bg-green-800/20 transition-colors">
      <input
        type="checkbox"
        checked={$relayPool.exclusiveMode}
        onchange={(e) => relayPool.setExclusiveMode(e.currentTarget.checked)}
        class="w-4 h-4 bg-transparent border-2 rounded
               {$relayPool.exclusiveMode ? 'border-yellow-400 text-yellow-400' : 'border-green-600 text-green-400'}
               focus:ring-0 focus:ring-offset-0 cursor-pointer checked:bg-current"
        style="color-scheme: dark"
      />
      <span class="{$relayPool.exclusiveMode ? 'text-yellow-400' : 'text-green-400'} text-xs font-bold group-hover:text-green-300 transition-colors">
        EXCLUSIVE MODE
      </span>
      <span class="{$relayPool.exclusiveMode ? 'text-yellow-600' : 'text-green-600'} text-xs">
        (only use listed relays)
      </span>
    </label>
  </div>
  
  <!-- Configured Relays -->
  <div class="space-y-2">
    <h4 class="text-green-400 font-bold flex items-center gap-2">
      <Wifi class="w-3 h-3" />
      CONFIGURED_RELAYS
      {#if $relayPool.exclusiveMode}
        <span class="text-yellow-400 text-xs">[EXCLUSIVE]</span>
      {/if}
    </h4>
    <div class="space-y-1 max-h-48 overflow-y-auto">
      {#each poolRelays as relay}
        {@const status = relayStatuses.get(relay) || 'disconnected'}
        <div 
          class="flex items-center justify-between p-2 border rounded cursor-pointer transition-colors
                 {selectedRelay === relay ? 'bg-green-800/30 border-green-600' : 'bg-green-900/10 border-green-800'}
                 hover:bg-green-800/20"
          onclick={() => selectRelay(relay)}
        >
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <span class="text-xs">{getStatusIcon(status)}</span>
            <span class="text-green-400 truncate text-xs">{relay}</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-green-600 text-xs uppercase">{status}</span>
          </div>
        </div>
      {/each}
      
      {#if poolRelays.length === 0}
        <div class="text-center py-4">
          {#if $relayPool.exclusiveMode}
            <div class="text-red-400 font-bold mb-1">⚠️ WARNING</div>
            <div class="text-red-400 text-xs">
              Exclusive mode is enabled but no relays are configured!
            </div>
            <div class="text-yellow-400 text-xs mt-1">
              Add relays or disable exclusive mode to connect.
            </div>
          {:else}
            <div class="text-yellow-400">
              No relays configured. Use the search above to add relays.
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Selected Relay Actions -->
  {#if selectedRelay}
    <div class="space-y-2 bg-green-900/20 border border-green-600 p-2 rounded">
      <h4 class="text-green-400 font-bold text-xs">SELECTED: {selectedRelay}</h4>
      <div class="flex gap-2">
        <button
          onclick={testSelectedRelay}
          class="px-3 py-1 bg-blue-900 hover:bg-blue-800 border border-blue-600 text-blue-400 text-xs"
        >
          TEST CONNECTION
        </button>
        <button
          onclick={removeSelectedRelay}
          class="px-3 py-1 bg-red-900 hover:bg-red-800 border border-red-600 text-red-400 text-xs"
        >
          REMOVE
        </button>
        <button
          onclick={() => selectedRelay = null}
          class="px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-600 text-gray-400 text-xs"
        >
          DESELECT
        </button>
      </div>
    </div>
  {/if}
</div>