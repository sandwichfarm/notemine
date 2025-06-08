<script lang="ts">
  import { relayStatuses } from '$lib/stores/relay-status';
  import { fade } from 'svelte/transition';
  
  let showRelayStatus = false;
  
  $: connectedCount = Array.from($relayStatuses.values()).filter(s => s.state === 'connected').length;
  $: totalCount = $relayStatuses.size;
  
  function getStatusColor(state: string): string {
    switch (state) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  }
  
  function getStatusIcon(state: string): string {
    switch (state) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'error': return '✕';
      default: return '○';
    }
  }
</script>

<!-- Relay Status Indicator -->
<div class="fixed bottom-4 left-4">
  <button
    on:click={() => showRelayStatus = !showRelayStatus}
    class="bg-neutral-800 text-neutral-400 px-3 py-1.5 rounded-lg text-sm hover:bg-neutral-700 transition-colors flex items-center gap-2"
  >
    <span class="{connectedCount > 0 ? 'text-green-400' : 'text-gray-400'}">
      {getStatusIcon(connectedCount > 0 ? 'connected' : 'disconnected')}
    </span>
    {connectedCount}/{totalCount} relays
  </button>
</div>

<!-- Relay Status Panel -->
{#if showRelayStatus}
  <div 
    class="fixed bottom-16 left-4 bg-neutral-900 rounded-lg p-4 min-w-[300px] max-h-[400px] overflow-y-auto border border-neutral-800"
    in:fade={{ duration: 200 }}
  >
    <div class="text-sm font-semibold text-white mb-3">Relay Connections</div>
    
    {#if $relayStatuses.size === 0}
      <div class="text-neutral-500 text-sm">No relays connected</div>
    {:else}
      <div class="space-y-3">
        {#each Array.from($relayStatuses.values()) as relay (relay.url)}
          <div class="border border-neutral-800 rounded-lg p-3">
            <div class="flex items-center justify-between text-sm mb-2">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="{getStatusColor(relay.state)}">
                  {getStatusIcon(relay.state)}
                </span>
                <span class="text-neutral-300 truncate">
                  {relay.url.replace('wss://', '').replace('ws://', '')}
                </span>
              </div>
              <span class="text-neutral-500 text-xs">
                {relay.state}
              </span>
            </div>
            
            {#if relay.state === 'connected' && (relay.avgResponseTime || relay.uptime)}
              <div class="grid grid-cols-2 gap-2 text-xs mt-2">
                {#if relay.avgResponseTime}
                  <div>
                    <span class="text-neutral-500">Avg Response:</span>
                    <span class="text-neutral-300 ml-1">{relay.avgResponseTime}ms</span>
                  </div>
                {/if}
                {#if relay.uptime}
                  <div>
                    <span class="text-neutral-500">Uptime:</span>
                    <span class="text-neutral-300 ml-1">{relay.uptime}%</span>
                  </div>
                {/if}
                {#if relay.totalRequests}
                  <div>
                    <span class="text-neutral-500">Requests:</span>
                    <span class="text-neutral-300 ml-1">{relay.totalRequests}</span>
                  </div>
                {/if}
                {#if relay.successfulRequests && relay.totalRequests}
                  <div>
                    <span class="text-neutral-500">Success Rate:</span>
                    <span class="text-neutral-300 ml-1">
                      {Math.round((relay.successfulRequests / relay.totalRequests) * 100)}%
                    </span>
                  </div>
                {/if}
              </div>
            {/if}
            
            {#if relay.lastError}
              <div class="text-xs text-red-400 mt-2">
                {relay.lastError}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    
    <div class="mt-3 pt-3 border-t border-neutral-800 text-xs text-neutral-500">
      Click to toggle • Updates in real-time
    </div>
  </div>
{/if}