<script lang="ts">
  import { onMount } from 'svelte';
  import { relayStatuses } from '$lib/stores/relay-status';
  import { fade } from 'svelte/transition';
  
  let showError = false;
  let errorMessage = '';
  let isReconnecting = false;
  
  $: allDisconnected = $relayStatuses.size > 0 && 
    Array.from($relayStatuses.values()).every(s => s.state === 'disconnected' || s.state === 'error');
  
  $: hasErrors = Array.from($relayStatuses.values()).some(s => s.state === 'error');
  
  $: if (allDisconnected && !isReconnecting) {
    showError = true;
    errorMessage = 'All relays disconnected. Unable to connect to the Nostr network.';
  } else if (hasErrors && !isReconnecting) {
    const errorCount = Array.from($relayStatuses.values()).filter(s => s.state === 'error').length;
    showError = true;
    errorMessage = `${errorCount} relay${errorCount > 1 ? 's' : ''} failed to connect.`;
  } else {
    showError = false;
  }
  
  function handleRetry() {
    isReconnecting = true;
    showError = false;
    
    // Trigger reconnection by reloading the page
    // In a real app, you'd trigger reconnection through the event service
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }
  
  function dismissError() {
    showError = false;
    // Re-show after 30 seconds if still disconnected
    setTimeout(() => {
      if (allDisconnected || hasErrors) {
        showError = true;
      }
    }, 30000);
  }
</script>

{#if showError}
  <div 
    class="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-900/90 backdrop-blur-sm text-white px-6 py-4 rounded-lg shadow-lg max-w-md z-50"
    in:fade={{ duration: 200 }}
  >
    <div class="flex items-start gap-3">
      <svg class="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      
      <div class="flex-1">
        <h3 class="font-semibold mb-1">Connection Error</h3>
        <p class="text-sm text-red-200">{errorMessage}</p>
        
        <div class="flex gap-2 mt-3">
          <button
            on:click={handleRetry}
            disabled={isReconnecting}
            class="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm transition-colors disabled:opacity-50"
          >
            {isReconnecting ? 'Reconnecting...' : 'Retry'}
          </button>
          <button
            on:click={dismissError}
            class="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Offline indicator -->
{#if !navigator.onLine}
  <div 
    class="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-yellow-900/90 backdrop-blur-sm text-yellow-100 px-4 py-2 rounded-lg shadow-lg z-50"
    in:fade={{ duration: 200 }}
  >
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
      </svg>
      <span class="text-sm">You are offline</span>
    </div>
  </div>
{/if}