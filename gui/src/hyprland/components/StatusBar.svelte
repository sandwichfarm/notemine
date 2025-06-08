<script lang="ts">
  import { windowManager } from '../services/window-manager';
  import { keyManager } from '$lib/services/keys';
  import { relayPool } from '$lib/stores/relay-pool';
  import { miningQueue } from '$lib/services/mining-queue';
  import { getPowClient } from '$lib/services/pow-client';
  import { browser } from '$app/environment';
  import { radioStore, currentStation, isPlaying } from '$lib/stores/radio';
  
  const windows = windowManager.windows;
  const activeWorkspace = windowManager.activeWorkspaceStore;
  const focusedWindow = windowManager.focusedWindow;
  const queueStore = miningQueue.queue;
  
  $: hasKeys = keyManager.getPublicKey() !== null;
  
  // Mining progress tracking
  let totalHashRate = 0;
  let pow: any = null;
  
  // Get pow client instance
  $: if (browser) {
    try {
      pow = getPowClient();
    } catch (err) {
      console.error('Failed to get pow client:', err);
    }
  }
  
  // Subscribe to mining progress
  $: if (pow && pow.miningProgress) {
    pow.miningProgress.subscribe(progress => {
      // Calculate total hash rate
      totalHashRate = 0;
      for (const jobProgress of progress.values()) {
        for (const workerProgress of jobProgress) {
          totalHashRate += workerProgress.hashRate || 0;
        }
      }
    });
  }
  
  // Format hashrate for display
  function formatHashrate(hashrate: number): string {
    if (hashrate === 0) return '0';
    if (hashrate < 1) return `${(hashrate * 1000).toFixed(0)}H/s`;
    if (hashrate < 1000) return `${hashrate.toFixed(1)}kH/s`;
    if (hashrate < 1000000) return `${(hashrate / 1000).toFixed(1)}MH/s`;
    return `${(hashrate / 1000000).toFixed(1)}GH/s`;
  }
</script>

<div class="fixed bottom-0 left-0 right-0 h-5 bg-green-900/20 text-green-400 text-xs px-2 flex items-center justify-between font-mono">
  <div class="flex gap-4">
    <span class="text-green-600">WS:{$activeWorkspace}</span>
    <span>WINDOWS:{$windows.length}</span>
    <span>RELAYS:{$relayPool.connected}/{$relayPool.relays.length}</span>
    <span>MINING:{formatHashrate(totalHashRate)}</span>
    {#if $currentStation && $isPlaying}
      <span class="text-green-400 flex items-center gap-1">
        <span class="animate-pulse">📻</span>
        <span>RADIO:</span>
        <div class="max-w-32 overflow-hidden">
          <div class="whitespace-nowrap {$currentStation.name.length > 15 ? 'animate-marquee' : ''}">
            {$currentStation.name}
          </div>
        </div>
      </span>
    {/if}
    <span class="{hasKeys ? 'text-green-400' : 'text-yellow-400'}">
      🔑 SIGNER:{hasKeys ? 'EPHEMERAL' : 'LOADING'} {hasKeys ? '' : '(⌃I)'}
    </span>
    <span class="text-green-600">HELP: ⌃/</span>
  </div>
  
  <div class="flex gap-4">
    {#if $focusedWindow}
      <span class="text-green-300">[{$focusedWindow.title}]</span>
    {/if}
    <span>HYPERGATE</span>
  </div>
</div>

<style>
  @keyframes marquee {
    0% {
      transform: translateX(100%);
    }
    100% {
      transform: translateX(-100%);
    }
  }
  
  .animate-marquee {
    animation: marquee 8s linear infinite;
  }
</style>