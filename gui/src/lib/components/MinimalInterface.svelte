<script lang="ts">
  import { onMount } from 'svelte';
  import { powClient } from '$lib/services/pow-client';
  import type { PoWMiningProgress, PoWMiningResult } from '$lib/services/pow-client';
  import type { NostrEvent } from '$lib/types';
  import { fade } from 'svelte/transition';
  
  // State
  let content = '';
  let isComposing = false;
  let activeMiningJobs: Map<string, PoWMiningProgress[]>;
  let events: NostrEvent[] = [];
  let isConnected: boolean;
  let textarea: HTMLTextAreaElement;
  
  // Derived state
  $: hasContent = content.trim().length > 0;
  $: isMining = activeMiningJobs && activeMiningJobs.size > 0;
  $: totalHashRate = calculateTotalHashRate();
  
  onMount(() => {
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
    
    return () => {
      unsubscribeProgress();
      unsubscribeEvents();
      unsubscribeConnected();
    };
  });
  
  async function submitNote() {
    if (!hasContent || isComposing || !isConnected) return;
    
    isComposing = true;
    
    try {
      await powClient.createNote(content);
      content = '';
      textarea.blur();
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
    if (age < 60) return 'now';
    if (age < 3600) return `${Math.floor(age / 60)}m`;
    if (age < 86400) return `${Math.floor(age / 3600)}h`;
    return `${Math.floor(age / 86400)}d`;
  }
  
  function getEventOpacity(timestamp: number): number {
    const age = Date.now() / 1000 - timestamp;
    const dayInSeconds = 86400;
    // Fade from 1.0 to 0.1 over 24 hours
    return Math.max(0.1, 1 - (age / dayInSeconds) * 0.9);
  }
</script>

<div class="min-h-screen bg-black text-white overflow-hidden">
  <!-- Connection indicator - subtle, only when connecting -->
  {#if isConnected === false}
    <div 
      class="fixed top-8 left-8 text-xs opacity-30"
      transition:fade={{ duration: 1000 }}
    >
      connecting...
    </div>
  {/if}
  
  <!-- Mining indicator - appears when mining -->
  {#if isMining}
    <div 
      class="fixed top-8 right-8 text-xs font-mono"
      transition:fade={{ duration: 500 }}
    >
      {formatHashRate(totalHashRate)}
    </div>
  {/if}
  
  <!-- Composer - center of screen, appears on focus or when has content -->
  <div class="fixed inset-0 flex items-center justify-center pointer-events-none">
    {#if hasContent || document.activeElement === textarea}
      <div 
        class="w-full max-w-2xl px-8 pointer-events-auto"
        transition:fade={{ duration: 300 }}
      >
        <textarea
          bind:this={textarea}
          bind:value={content}
          on:keydown={handleKeydown}
          placeholder=""
          disabled={!isConnected || isComposing}
          class="w-full bg-transparent text-white text-lg leading-relaxed placeholder-gray-800 border-none outline-none resize-none"
          rows="3"
          style="caret-color: white;"
        />
        
        {#if hasContent && !isComposing}
          <div 
            class="mt-4 text-xs opacity-50"
            transition:fade={{ duration: 200 }}
          >
            <span class="cursor-pointer" on:click={submitNote}>
              mine & publish
            </span>
          </div>
        {/if}
        
        {#if isComposing}
          <div 
            class="mt-4 text-xs"
            transition:fade={{ duration: 200 }}
          >
            mining...
          </div>
        {/if}
      </div>
    {:else}
      <!-- Invisible textarea to capture focus -->
      <textarea
        bind:this={textarea}
        bind:value={content}
        on:keydown={handleKeydown}
        class="absolute opacity-0 pointer-events-auto"
        style="width: 1px; height: 1px;"
      />
    {/if}
  </div>
  
  <!-- Events - scattered across the screen, fading with age -->
  <div class="fixed inset-0 pointer-events-none">
    {#each events.slice(0, 20) as event, i}
      {@const age = getEventAge(event.created_at)}
      {@const opacity = getEventOpacity(event.created_at)}
      {@const x = 10 + (i % 3) * 30}
      {@const y = 20 + (i % 7) * 12}
      
      <div
        class="absolute text-sm"
        style="
          left: {x}%; 
          top: {y}%; 
          opacity: {opacity};
          transform: translate(-50%, -50%);
        "
        transition:fade={{ duration: 2000 }}
      >
        <div class="mb-1 text-xs opacity-50">{age}</div>
        <div class="max-w-md">{event.content}</div>
      </div>
    {/each}
  </div>
  
  <!-- Click anywhere to focus composer -->
  <div 
    class="fixed inset-0" 
    on:click={() => textarea?.focus()}
    style="z-index: -1;"
  />
</div>

<style>
  textarea {
    field-sizing: content;
    min-height: 1.5rem;
  }
  
  /* Remove all scrollbars */
  :global(body) {
    overflow: hidden;
  }
  
  /* Subtle focus glow */
  textarea:focus {
    filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.1));
  }
</style>