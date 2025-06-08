<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/services/database';
  import { generateNjumpLink } from '$lib/utils/nip19';
  import { fade, slide } from 'svelte/transition';
  import type { MiningJobDB } from '$lib/services/database';
  
  let minedNotes: MiningJobDB[] = [];
  let loading = true;
  let showCopiedTooltip: string | null = null;
  
  onMount(async () => {
    await loadMinedNotes();
  });
  
  async function loadMinedNotes() {
    try {
      loading = true;
      const completedJobs = await db.getAllMiningJobs('completed');
      // Sort by most recent first
      minedNotes = completedJobs
        .filter(job => job.minedEvent)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Failed to load mined notes:', error);
    } finally {
      loading = false;
    }
  }
  
  function getRelativeTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }
  
  function formatDifficulty(difficulty: number): string {
    return difficulty.toString().padStart(2, '0');
  }
  
  function formatEventId(id: string): string {
    // Show leading zeros to visualize PoW
    const leadingZeros = id.match(/^0+/)?.[0]?.length || 0;
    return `${'0'.repeat(leadingZeros)}${id.slice(leadingZeros, leadingZeros + 6)}...`;
  }
  
  async function copyToClipboard(text: string, noteId: string) {
    try {
      await navigator.clipboard.writeText(text);
      showCopiedTooltip = noteId;
      setTimeout(() => {
        showCopiedTooltip = null;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
  
  function truncateContent(content: string, maxLength: number = 100): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }
</script>

<div class="h-full flex flex-col bg-neutral-900 rounded-lg">
  <!-- Header -->
  <div class="flex items-center justify-between p-4 border-b border-neutral-800">
    <h3 class="text-white font-semibold flex items-center gap-2">
      <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Mining History
    </h3>
    <button 
      on:click={loadMinedNotes}
      class="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
      title="Refresh"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>
  
  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="text-neutral-500">Loading mining history...</div>
      </div>
    {:else if minedNotes.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center">
        <svg class="w-12 h-12 text-neutral-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-neutral-500 mb-2">No mined notes yet</p>
        <p class="text-neutral-600 text-sm">Start mining to see your history here</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each minedNotes as note (note.id)}
          <div 
            class="bg-neutral-800 rounded-lg p-4 hover:bg-neutral-750 transition-colors"
            in:slide={{ duration: 300 }}
          >
            <!-- Note Content -->
            <div class="mb-3">
              <p class="text-white text-sm break-words">
                {truncateContent(note.content)}
              </p>
            </div>
            
            <!-- Metadata Row -->
            <div class="flex items-center justify-between text-xs text-neutral-400 mb-3">
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {getRelativeTime(note.updatedAt)}
                </span>
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Difficulty {formatDifficulty(note.targetDifficulty)}
                </span>
                {#if note.minedEvent}
                  <span class="font-mono text-purple-400">
                    {formatEventId(note.minedEvent.id)}
                  </span>
                {/if}
              </div>
            </div>
            
            <!-- Action Buttons -->
            {#if note.minedEvent}
              <div class="flex items-center gap-2">
                <!-- Copy Event ID -->
                <button
                  on:click={() => copyToClipboard(note.minedEvent.id, note.id + '-id')}
                  class="relative flex items-center gap-1 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white rounded text-xs transition-colors"
                  title="Copy Event ID"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Event ID
                  {#if showCopiedTooltip === note.id + '-id'}
                    <span 
                      class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap"
                      in:fade={{ duration: 200 }}
                    >
                      Copied!
                    </span>
                  {/if}
                </button>
                
                <!-- Copy njump.me Link -->
                <button
                  on:click={() => copyToClipboard(generateNjumpLink(note.minedEvent), note.id + '-njump')}
                  class="relative flex items-center gap-1 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white rounded text-xs transition-colors"
                  title="Copy njump.me link"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  njump Link
                  {#if showCopiedTooltip === note.id + '-njump'}
                    <span 
                      class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap"
                      in:fade={{ duration: 200 }}
                    >
                      Copied!
                    </span>
                  {/if}
                </button>
                
                <!-- Open in njump.me -->
                <a
                  href={generateNjumpLink(note.minedEvent)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-1 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs transition-colors"
                  title="Open in njump.me"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View
                </a>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Custom scrollbar for history list */
  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-track {
    background: rgb(38, 38, 38);
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgb(64, 64, 64);
    border-radius: 3px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: rgb(82, 82, 82);
  }
</style>