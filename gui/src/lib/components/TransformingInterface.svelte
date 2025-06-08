<script lang="ts">
  import { onMount } from 'svelte';
  import { getPowClient } from '$lib/services/pow-client';
  import type { PoWMiningProgress, PoWMiningResult } from '$lib/services/pow-client';
  import type { NostrEvent } from '$lib/types';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { flip } from 'svelte/animate';
  import { miningQueue as miningQueueService } from '$lib/services/mining-queue';
  import { rankedEvents, decaySettings, updateDecaySettings, getEventOpacity } from '$lib/services/decay-engine';
  import KeyManager from './KeyManager.svelte';
  import MiningStats from './MiningStats.svelte';
  import RelayStatus from './RelayStatus.svelte';
  import ErrorBoundary from './ErrorBoundary.svelte';
  
  let powClient: ReturnType<typeof getPowClient> | null = null;
  
  // State
  let content = '';
  let isComposing = false;
  let activeMiningJobs: Map<string, PoWMiningProgress[]> = new Map();
  let events: NostrEvent[] = [];
  let isConnected: boolean = false;
  let showDecaySettings = false;
  let textarea: HTMLTextAreaElement;
  let showMiningQueue = false;
  let miningQueue: Array<{id: string, content: string, progress: number, status: string}> = [];
  
  // Derived state
  $: hasContent = content.trim().length > 0;
  $: isMining = miningQueue.some(job => job.status === 'mining');
  $: hasEvents = events.length > 0;
  $: isReady = isConnected;
  $: totalHashRate = calculateTotalHashRate();
  $: hasMiningJobs = miningQueue.length > 0;
  $: currentMiningJob = miningQueue.find(job => job.status === 'mining');
  
  // Interface position state
  $: composerPosition = hasEvents ? 'top' : 'center';
  
  onMount(() => {
    // Initialize powClient in browser
    powClient = getPowClient();
    
    // Subscribe to reactive stores
    const unsubscribeProgress = powClient.miningProgress.subscribe(progress => {
      activeMiningJobs = progress;
    });
    
    const unsubscribeEvents = powClient.events.subscribe(eventList => {
      events = eventList;
    });
    
    const unsubscribeConnected = powClient.isConnected.subscribe(connected => {
      isConnected = connected;
    });
    
    // Subscribe to mining queue
    const unsubscribeQueue = miningQueueService.queue.subscribe(queue => {
      console.log('Mining queue updated:', queue);
      miningQueue = queue.map(job => ({
        id: job.id,
        content: job.content,
        progress: job.bestPow || 0,
        status: job.status
      }));
    });
    
    // Subscribe to ranked events from decay engine
    const unsubscribeRanked = rankedEvents.subscribe(rankedEventsList => {
      events = rankedEventsList.map(cached => cached.event);
    });
    
    return () => {
      unsubscribeProgress();
      unsubscribeEvents();
      unsubscribeConnected();
      unsubscribeQueue();
      unsubscribeRanked();
    };
  });
  
  async function submitNote() {
    console.log('submitNote called', {
      hasContent,
      isComposing,
      isConnected,
      powClient: !!powClient,
      content
    });
    
    if (!hasContent || isComposing || !isConnected || !powClient) return;
    
    isComposing = true;
    
    try {
      console.log('Creating note with content:', content);
      const jobId = await powClient.createNote(content);
      console.log('Note creation started with job ID:', jobId);
      content = '';
      textarea.value = '';
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
  
  function calculateTotalHashRate(): number {
    if (!activeMiningJobs) return 0;
    
    let total = 0;
    for (const progressArray of activeMiningJobs.values()) {
      total += progressArray.reduce((sum, p) => sum + (p?.hashRate || 0), 0);
    }
    return total;
  }
  
  function formatHashRate(rate: number): string {
    if (rate >= 1000000) {
      return `${(rate / 1000000).toFixed(1)} MH/s`;
    } else if (rate >= 1000) {
      return `${(rate / 1000).toFixed(1)} kH/s`;
    }
    return `${rate.toFixed(1)} H/s`;
  }
  
  function getEventAge(timestamp: number): string {
    const age = Date.now() / 1000 - timestamp;
    if (age < 60) return 'just now';
    if (age < 3600) return `${Math.floor(age / 60)}m ago`;
    if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
    return `${Math.floor(age / 86400)}d ago`;
  }
  
  
  // Drag and drop handlers
  let draggedItem: any = null;
  
  function handleDragStart(e: DragEvent, item: any) {
    draggedItem = item;
  }
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }
  
  function handleDrop(e: DragEvent, targetItem: any) {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetItem.id) return;
    
    const draggedIndex = miningQueue.findIndex(item => item.id === draggedItem.id);
    const targetIndex = miningQueue.findIndex(item => item.id === targetItem.id);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newQueue = [...miningQueue];
      const [removed] = newQueue.splice(draggedIndex, 1);
      newQueue.splice(targetIndex, 0, removed);
      miningQueue = newQueue;
      
      // TODO: Update actual mining priority
      console.log('Reordered mining queue');
    }
  }
</script>

<div class="fixed inset-0 bg-black text-white flex flex-col">
  <!-- Main content area with scrolling -->
  <div class="flex-1 overflow-y-auto">
    <!-- Composer Container -->
    <div 
      class="w-full transition-all duration-1000 ease-out px-4 md:px-8 lg:px-12"
      style="
        margin-top: {composerPosition === 'center' ? '50vh' : '10vh'};
        transform: translateY({composerPosition === 'center' ? '-50%' : '0'});
      "
    >
      {#if isReady}
        <div 
          class="max-w-6xl mx-auto"
          in:fade={{ duration: 1000, delay: 500 }}
        >
          <textarea
            bind:this={textarea}
            bind:value={content}
            on:keydown={handleKeydown}
            placeholder="write a note..."
            disabled={!isConnected || isComposing}
            class="w-full bg-transparent text-white text-xl md:text-2xl lg:text-3xl leading-relaxed placeholder-gray-600 border-none outline-none resize-none focus:placeholder-gray-500"
            rows="1"
            style="caret-color: white; field-sizing: content; min-height: 1.5rem;"
          />
          
          {#if hasContent}
            <div 
              class="mt-4 text-sm text-gray-600 hover:text-gray-400 transition-colors cursor-pointer inline-block"
              on:click={submitNote}
              in:fade={{ duration: 200 }}
            >
              {isComposing ? 'mining...' : 'mine & publish'}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  
  <!-- Controls Widget -->
  <!-- Key Manager Component -->
  <KeyManager />
  
  <!-- Mining Stats Component -->
  <MiningStats />
  
  <!-- Relay Status Component -->
  <RelayStatus />
  
  <!-- Error Boundary Component -->
  <ErrorBoundary />
  
  <div class="fixed top-16 right-4 space-y-2">
    <!-- Mining Status Widget -->
    {#if hasMiningJobs}
      <div 
        class="bg-gray-900 border border-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors min-w-[120px] shadow-lg"
        on:click={() => showMiningQueue = !showMiningQueue}
        in:fly={{ x: 100, duration: 300 }}
      >
        <div class="text-xs text-gray-400">{isMining ? 'mining' : 'queued'}</div>
        <div class="text-sm font-mono text-purple-400">
          {isMining ? formatHashRate(totalHashRate) : '—'}
        </div>
        <div class="flex items-center justify-between mt-1">
          <div class="text-xs text-gray-500">{miningQueue.length} notes</div>
          {#if currentMiningJob}
            <div class="text-xs text-purple-500">
              {currentMiningJob.progress.toFixed(1)}
            </div>
          {/if}
        </div>
        {#if isMining}
          <div class="mt-2">
            <div class="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-purple-500 animate-pulse"
                style="width: {currentMiningJob ? Math.min((currentMiningJob.progress / 21) * 100, 100) : 0}%"
              />
            </div>
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Decay Settings Toggle -->
    <div 
      class="bg-gray-900 border border-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors text-center shadow-lg"
      on:click={() => showDecaySettings = !showDecaySettings}
      in:fade={{ duration: 300 }}
    >
      <div class="text-xs text-gray-400">decay</div>
      <div class="text-sm">{($decaySettings.decayRate * 100).toFixed(1)}%/h</div>
    </div>
  </div>
  
  <!-- Decay Settings Panel -->
  {#if showDecaySettings}
    <div 
      class="fixed top-32 right-4 bg-gray-900 border border-gray-800 rounded-lg p-4 w-80 z-40 shadow-xl"
      in:fly={{ y: -20, duration: 300 }}
    >
      <div class="text-sm mb-3 text-gray-400">Decay Settings</div>
      <div class="space-y-3">
        <div>
          <label class="text-xs text-gray-500">Decay Rate (%/hour)</label>
          <input 
            type="range" 
            min="0.1" 
            max="10" 
            step="0.1" 
            value={$decaySettings.decayRate * 100}
            on:input={(e) => updateDecaySettings({ decayRate: parseFloat((e.target as HTMLInputElement).value) / 100 })}
            class="w-full mt-1"
          />
          <div class="text-xs text-gray-400">{($decaySettings.decayRate * 100).toFixed(1)}%</div>
        </div>
        
        <div>
          <label class="text-xs text-gray-500">PoW Weight</label>
          <input 
            type="range" 
            min="0.1" 
            max="3" 
            step="0.1" 
            value={$decaySettings.powWeight}
            on:input={(e) => updateDecaySettings({ powWeight: parseFloat((e.target as HTMLInputElement).value) })}
            class="w-full mt-1"
          />
          <div class="text-xs text-gray-400">{$decaySettings.powWeight.toFixed(1)}x</div>
        </div>
        
        <div>
          <label class="text-xs text-gray-500">Mention PoW Bonus</label>
          <input 
            type="range" 
            min="1" 
            max="10" 
            step="0.5" 
            value={$decaySettings.mentionPowBonus}
            on:input={(e) => updateDecaySettings({ mentionPowBonus: parseFloat((e.target as HTMLInputElement).value) })}
            class="w-full mt-1"
          />
          <div class="text-xs text-gray-400">{$decaySettings.mentionPowBonus.toFixed(1)}x</div>
        </div>
        
        <div>
          <label class="text-xs text-gray-500">Zap Weight</label>
          <input 
            type="range" 
            min="0" 
            max="2" 
            step="0.1" 
            value={$decaySettings.zapWeight}
            on:input={(e) => updateDecaySettings({ zapWeight: parseFloat((e.target as HTMLInputElement).value) })}
            class="w-full mt-1"
          />
          <div class="text-xs text-gray-400">{$decaySettings.zapWeight.toFixed(1)}x</div>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Mining Queue (Expandable) -->
  {#if showMiningQueue && miningQueue.length > 0}
    <div 
      class="fixed top-32 right-4 bg-gray-900 border border-gray-800 rounded-lg p-4 w-80 max-h-96 overflow-y-auto z-40 shadow-xl"
      in:fly={{ y: -20, duration: 300 }}
    >
      <div class="text-sm mb-3 text-gray-400">Mining Queue</div>
      <div class="space-y-2">
        {#each miningQueue as item (item.id)}
          <div
            class="bg-gray-800 rounded p-3 cursor-move hover:bg-gray-750 transition-colors"
            draggable="true"
            on:dragstart={(e) => handleDragStart(e, item)}
            on:dragover={handleDragOver}
            on:drop={(e) => handleDrop(e, item)}
            animate:flip={{ duration: 300 }}
          >
            <div class="text-sm truncate">{item.content}</div>
            <div class="flex items-center justify-between mt-1">
              <div class="text-xs text-gray-500">{item.status}</div>
              {#if item.status === 'mining' && item === currentMiningJob}
                <div class="text-xs text-purple-400 font-mono">
                  {formatHashRate(totalHashRate)}
                </div>
              {/if}
            </div>
            {#if item.status === 'mining'}
              <div class="mt-2">
                <div class="flex justify-between items-center mb-1">
                  <div class="text-xs text-gray-600">PoW: {item.progress.toFixed(1)}</div>
                  <div class="text-xs text-gray-600">Target: 21</div>
                </div>
                <div class="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-300"
                    style="width: {Math.min((item.progress / 21) * 100, 100)}%"
                  />
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <div class="mt-3 text-xs text-gray-500">
        Drag to reorder
      </div>
    </div>
  {/if}
  
    <!-- Events Feed -->
    {#if hasEvents}
      <div 
        class="w-full px-4 md:px-8 lg:px-12 mt-8 pb-20"
        in:fade={{ duration: 1000 }}
      >
        <div class="max-w-6xl mx-auto">
          <div class="grid gap-4 md:gap-6">
            {#each $rankedEvents.slice(0, 50) as cachedEvent, i}
              {@const event = cachedEvent.event}
              {@const opacity = getEventOpacity(cachedEvent.decayScore || 1)}
              <div
                class="border-l-2 border-gray-800 pl-4 md:pl-6 py-2"
                style="opacity: {opacity}"
                in:fly={{ y: 20, duration: 500, delay: Math.min(i * 50, 500) }}
              >
                <div class="text-xs text-gray-600 mb-2 flex justify-between">
                  <span>{getEventAge(event.created_at)}</span>
                  {#if cachedEvent.decayScore}
                    <span class="text-purple-500">score: {cachedEvent.decayScore.toFixed(1)}</span>
                  {/if}
                </div>
                <div class="text-base md:text-lg leading-relaxed">
                  {event.content}
                </div>
                <div class="flex justify-between items-center mt-2">
                  {#if event.tags.find(t => t[0] === 'nonce')}
                    <div class="text-xs text-gray-700">
                      pow: {event.tags.find(t => t[0] === 'nonce')?.[2]}
                    </div>
                  {/if}
                  {#if cachedEvent.cumulativePow}
                    <div class="text-xs text-blue-500">
                      cumulative: {cachedEvent.cumulativePow.toFixed(1)}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
  
</div>

<style>
  /* Remove scrollbars */
  :global(body) {
    overflow: hidden;
  }
  
  /* Smooth textarea focus */
  textarea:focus {
    filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.05));
  }
  
  /* Custom scrollbar for mining queue */
  .overflow-y-auto::-webkit-scrollbar {
    width: 4px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #374151;
    border-radius: 2px;
  }
</style>