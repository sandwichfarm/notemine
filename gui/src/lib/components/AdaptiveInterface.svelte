<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { powClient } from '$lib/services/pow-client';
  import type { PoWMiningProgress, PoWMiningResult } from '$lib/services/pow-client';
  import type { NostrEvent } from '$lib/types';
  
  // Interface state
  let content = '';
  let isComposing = false;
  let activeMiningJobs: Map<string, PoWMiningProgress[]>;
  let miningResults: PoWMiningResult[];
  let events: NostrEvent[];
  let isConnected: boolean;
  
  // Pane visibility (configurable by user)
  let showComposer = true;
  let showMiningStatus = true;
  let showFeed = true;
  let showStats = true;
  
  // Adaptive behavior
  $: hasContent = content.trim().length > 0;
  $: isMining = activeMiningJobs && activeMiningJobs.size > 0;
  $: hasEvents = events && events.length > 0;
  $: canCompose = isConnected && !isComposing;
  
  // Auto-adapt interface based on user journey
  $: {
    // If user is new (no events), emphasize composer
    if (!hasEvents && events !== undefined) {
      showComposer = true;
      showFeed = false;
    }
    
    // If mining is active, show mining status
    if (isMining) {
      showMiningStatus = true;
    }
    
    // If user has events, show feed
    if (hasEvents) {
      showFeed = true;
    }
  }
  
  onMount(() => {
    // Subscribe to reactive stores
    const unsubscribeProgress = powClient.miningProgress.subscribe(progress => {
      activeMiningJobs = progress;
    });
    
    const unsubscribeResults = powClient.miningResults.subscribe(results => {
      miningResults = results;
    });
    
    const unsubscribeEvents = powClient.events.subscribe(eventList => {
      events = eventList;
    });
    
    const unsubscribeConnected = powClient.isConnected.subscribe(connected => {
      isConnected = connected;
    });
    
    return () => {
      unsubscribeProgress();
      unsubscribeResults();
      unsubscribeEvents();
      unsubscribeConnected();
    };
  });
  
  async function submitNote() {
    if (!hasContent || !canCompose) return;
    
    isComposing = true;
    
    try {
      const jobId = await powClient.createNote(content);
      content = ''; // Clear composer
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      isComposing = false;
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      submitNote();
    }
  }
  
  function togglePane(pane: string) {
    switch (pane) {
      case 'composer': showComposer = !showComposer; break;
      case 'mining': showMiningStatus = !showMiningStatus; break;
      case 'feed': showFeed = !showFeed; break;
      case 'stats': showStats = !showStats; break;
    }
  }
  
  function calculateOverallHashRate(): number {
    if (!activeMiningJobs || activeMiningJobs.size === 0) return 0;
    
    let totalHashRate = 0;
    for (const progressArray of activeMiningJobs.values()) {
      totalHashRate += progressArray.reduce((sum, p) => sum + (p?.hashRate || 0), 0);
    }
    return totalHashRate;
  }
  
  function formatHashRate(hashRate: number): { value: string; unit: string } {
    if (hashRate >= 1000000) {
      return { value: (hashRate / 1000000).toFixed(1), unit: 'MH/s' };
    } else if (hashRate >= 1000) {
      return { value: (hashRate / 1000).toFixed(1), unit: 'kH/s' };
    } else {
      return { value: hashRate.toFixed(1), unit: 'H/s' };
    }
  }
  
  function getBestPoW(): number {
    if (!activeMiningJobs || activeMiningJobs.size === 0) return 0;
    
    let bestPow = 0;
    for (const progressArray of activeMiningJobs.values()) {
      for (const progress of progressArray) {
        if (progress?.bestPow > bestPow) {
          bestPow = progress.bestPow;
        }
      }
    }
    return bestPow;
  }
</script>

<div class="min-h-screen bg-gray-900 text-gray-100">
  <!-- Header with pane toggles -->
  <header class="bg-gray-800 border-b border-gray-700">
    <div class="max-w-4xl mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Notemine</h1>
          <p class="text-sm text-gray-400">Everything is PoW</p>
        </div>
        
        <!-- Connection status -->
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <div class="w-2 h-2 rounded-full {isConnected ? 'bg-green-400' : 'bg-red-400'}"></div>
            <span class="text-sm text-gray-400">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          
          <!-- Pane toggles -->
          <div class="flex space-x-1">
            <button
              on:click={() => togglePane('composer')}
              class="px-2 py-1 text-xs rounded {showComposer ? 'bg-purple-600' : 'bg-gray-600'}"
              title="Toggle Composer"
            >
              ✏️
            </button>
            <button
              on:click={() => togglePane('mining')}
              class="px-2 py-1 text-xs rounded {showMiningStatus ? 'bg-purple-600' : 'bg-gray-600'}"
              title="Toggle Mining Status"
            >
              ⛏️
            </button>
            <button
              on:click={() => togglePane('feed')}
              class="px-2 py-1 text-xs rounded {showFeed ? 'bg-purple-600' : 'bg-gray-600'}"
              title="Toggle Feed"
            >
              📰
            </button>
            <button
              on:click={() => togglePane('stats')}
              class="px-2 py-1 text-xs rounded {showStats ? 'bg-purple-600' : 'bg-gray-600'}"
              title="Toggle Stats"
            >
              📊
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <!-- Main content container -->
  <main class="max-w-4xl mx-auto px-4 py-6">
    <div class="space-y-6">
      
      <!-- Stats Pane (when mining or has data) -->
      {#if showStats && (isMining || miningResults?.length > 0)}
        <div class="bg-gray-800 rounded-lg p-4">
          <h3 class="text-lg font-semibold mb-4">Mining Status</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            {#if true}
              {@const hashRateData = formatHashRate(calculateOverallHashRate())}
              <div class="text-center">
                <div class="text-2xl font-bold text-orange-400">{hashRateData.value}</div>
                <div class="text-sm text-gray-400">{hashRateData.unit}</div>
              </div>
            {/if}
            <div class="text-center">
              <div class="text-2xl font-bold text-purple-400">{getBestPoW()}</div>
              <div class="text-sm text-gray-400">Best PoW</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-green-400">{activeMiningJobs?.size || 0}</div>
              <div class="text-sm text-gray-400">Active Jobs</div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Composer Pane -->
      {#if showComposer}
        <div class="bg-gray-800 rounded-lg p-4">
          <h3 class="text-lg font-semibold mb-4">Compose Note</h3>
          
          <div class="space-y-4">
            <textarea
              bind:value={content}
              on:keydown={handleKeydown}
              placeholder="What's happening?"
              rows="4"
              disabled={!canCompose}
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none disabled:opacity-50"
            ></textarea>
            
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-400">
                {#if content.includes('@npub')}
                  <span class="text-yellow-400">📌 Mention detected - easier PoW</span>
                {:else if content.includes('#[')}
                  <span class="text-blue-400">💬 Reply detected - easier PoW</span>
                {:else if hasContent}
                  <span>📝 Standard note</span>
                {:else}
                  <span>Start typing...</span>
                {/if}
              </div>
              
              <button
                on:click={submitNote}
                disabled={!hasContent || !canCompose}
                class="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
              >
                {#if isComposing}
                  Mining...
                {:else}
                  Mine & Publish
                {/if}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Mining Status Pane (when actively mining) -->
      {#if showMiningStatus && isMining}
        <div class="bg-gray-800 rounded-lg p-4">
          <h3 class="text-lg font-semibold mb-4">Active Mining</h3>
          
          {#each Array.from(activeMiningJobs.entries()) as [jobId, progressArray]}
            <div class="mb-4 p-3 bg-gray-700 rounded">
              <div class="text-sm text-gray-300 mb-2">Job: {jobId.slice(0, 8)}...</div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {#each progressArray as progress, i}
                  {#if progress}
                    {@const workerHashRate = formatHashRate(progress.hashRate)}
                    <div class="bg-gray-600 p-2 rounded">
                      <div>Worker {i}</div>
                      <div class="font-mono">{workerHashRate.value} {workerHashRate.unit}</div>
                      <div class="text-purple-400">PoW: {progress.bestPow}</div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Feed Pane -->
      {#if showFeed}
        <div class="bg-gray-800 rounded-lg p-4">
          <h3 class="text-lg font-semibold mb-4">Feed</h3>
          
          {#if hasEvents}
            <div class="space-y-4">
              {#each events.slice(0, 10) as event}
                <div class="border-l-4 border-purple-500 pl-4 py-2">
                  <div class="text-sm text-gray-400 mb-1">
                    {new Date(event.created_at * 1000).toLocaleString()}
                  </div>
                  <div class="text-gray-100">{event.content}</div>
                  {#if event.tags.find(t => t[0] === 'nonce')?.[2] && parseInt(event.tags.find(t => t[0] === 'nonce')?.[2] || '0') > 0}
                    <div class="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <span>⛏️</span>
                      <span>{event.tags.find(t => t[0] === 'nonce')?.[2]}</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-8 text-gray-400">
              <div class="text-4xl mb-2">🎯</div>
              <div>No PoW events yet</div>
              <div class="text-sm">Write your first note to get started!</div>
            </div>
          {/if}
        </div>
      {/if}

    </div>
  </main>
</div>