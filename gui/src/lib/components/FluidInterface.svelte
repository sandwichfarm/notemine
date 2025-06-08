<script lang="ts">
  import { onMount } from 'svelte';
  import { interfaceState, composeMetrics, feedMetrics, settingsMetrics, trackInteraction, idleTimeout } from '$lib/services/interface-controller';
  import { relayPool } from '$lib/stores/relay-pool';
  import { pow } from '$lib/services/pow-client';
  import { keyManager } from '$lib/services/keys';
  import { miningQueue } from '$lib/services/mining-queue';
  import { events } from '$lib/stores/events';
  import { globalDifficulty, perKindDifficulty } from '$lib/stores/difficulty';
  import KeyManager from './KeyManager.svelte';
  import MiningQueue from './MiningQueue.svelte';

  let noteContent = '';
  let isTyping = false;
  let typingTimeout: NodeJS.Timeout;
  let hasKeys = false;
  
  // Subscribe to key manager state
  $: hasKeys = keyManager.getPublicKey() !== null;
  
  // Subscribe to mining queue
  const queueStore = miningQueue.queue;

  $: isConnected = keyManager.getPublicKey() !== null && $relayPool.connected > 0;

  // Update interface state
  $: interfaceState.update(s => ({
    ...s,
    hasKeys,
    hasRelays: $relayPool.relays.length > 0,
    hasNotes: $events.notes.length > 0,
    isMining: $queueStore.length > 0,
    isTyping,
    noteCount: $events.notes.length,
    relayCount: $relayPool.relays.length,
    miningQueueSize: $queueStore.length
  }));

  function handleTyping() {
    isTyping = true;
    trackInteraction('compose');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isTyping = false;
    }, 1000);
  }

  async function handleSubmit() {
    console.log('handleSubmit called');
    console.log('noteContent:', noteContent);
    console.log('isConnected:', isConnected);
    
    if (!noteContent.trim() || !isConnected) {
      console.log('Aborting submit - no content or not connected');
      return;
    }
    
    const content = noteContent.trim();
    noteContent = '';
    isTyping = false;
    
    const difficulty = $perKindDifficulty[1] || $globalDifficulty;
    console.log('Queueing note with difficulty:', difficulty);
    
    try {
      await pow.queueNote(content, difficulty);
      console.log('Note queued successfully');
    } catch (error) {
      console.error('Failed to queue note:', error);
    }
  }

  function transform(metrics: any) {
    return `
      transform: translate(${metrics.x}px, ${metrics.y}px) scale(${metrics.scale});
      opacity: ${metrics.opacity};
      width: ${metrics.width}px;
      height: ${metrics.height}px;
      font-size: ${metrics.fontSize}px;
    `;
  }
</script>

<div class="fixed inset-0 bg-black text-green-400 overflow-hidden">
  <!-- Compose Area -->
  <div 
    class="absolute transition-all duration-700 ease-out"
    style={transform($composeMetrics)}
    on:click={() => trackInteraction('compose')}
    on:keydown={handleTyping}
  >
    {#if !hasKeys}
      <div class="flex items-center justify-center h-full">
        <p class="text-2xl animate-pulse">Initialize keys to begin...</p>
      </div>
    {:else}
      <label for="compose-note" class="sr-only">Compose note</label>
      <textarea
        id="compose-note"
        bind:value={noteContent}
        on:input={handleTyping}
        on:keydown={(e) => e.key === 'Enter' && e.ctrlKey && handleSubmit()}
        placeholder={isConnected ? "Compose..." : "Connecting..."}
        disabled={!isConnected}
        class="w-full h-full bg-transparent border-none outline-none resize-none p-4 
               placeholder-green-400/30 caret-green-400"
        style="font-size: {$composeMetrics.fontSize}px"
      />
    {/if}
  </div>

  <!-- Feed Area -->
  <div 
    class="absolute transition-all duration-700 ease-out overflow-auto"
    style={transform($feedMetrics)}
    on:click={() => trackInteraction('feed')}
  >
    {#each $events.notes as note (note.id)}
      <div 
        class="mb-4 transition-opacity duration-1000"
        style="opacity: {1 - (note.decay || 0)}"
      >
        <p class="text-xs text-green-600 flex items-center gap-2">
          {#if note.pow > 0}
            <span class="flex items-center gap-1">
              <span>⛏️</span>
              <span>{note.pow}</span>
            </span>
            <span>|</span>
          {/if}
          <span>{new Date(note.created_at * 1000).toLocaleTimeString()}</span>
        </p>
        <p>{note.content}</p>
      </div>
    {/each}
  </div>

  <!-- Settings Area -->
  <div 
    class="absolute transition-all duration-700 ease-out"
    style={transform($settingsMetrics)}
    on:click={() => trackInteraction('settings')}
  >
    <div class="space-y-2">
      <p class="text-xs">Relays: {$relayPool.relays.length}</p>
      <p class="text-xs">Mining: {$queueStore.length}</p>
      <p class="text-xs">Difficulty: {$globalDifficulty}</p>
    </div>
  </div>

  <!-- Key Manager (appears when needed) -->
  {#if !hasKeys}
    <div class="fixed top-4 right-4 transition-all duration-500"
         style="opacity: {$idleTimeout ? 0.3 : 1}">
      <KeyManager />
    </div>
  {/if}

  <!-- Mining Progress (appears when mining) -->
  {#if $queueStore.length > 0}
    <div class="fixed bottom-4 left-4 transition-all duration-500"
         style="opacity: {$composeMetrics.priority > 8 ? 0.3 : 0.9}">
      <MiningQueue jobs={$queueStore} />
    </div>
  {/if}
</div>