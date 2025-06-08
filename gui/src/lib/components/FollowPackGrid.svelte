<script lang="ts">
  import { followPacks, selectedFollowPacks, feedManager } from '$lib/services/feed-manager';
  import type { FollowPack } from '$lib/types/feed-types';
  
  function getPackDisplay(pack: FollowPack) {
    return {
      title: pack.title || 'Unnamed Pack',
      description: pack.description || `${pack.pubkeys.length} follows`,
      userCount: pack.pubkeys.length
    };
  }
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
  {#each Array.from($followPacks.values()) as pack}
    {@const display = getPackDisplay(pack)}
    {@const isSelected = $selectedFollowPacks.has(pack.id)}
    
    <button
      onclick={() => feedManager.toggleFollowPack(pack.id)}
      class="relative p-4 border-2 transition-all text-left group
        {isSelected 
          ? 'bg-green-900/30 border-green-400 shadow-lg shadow-green-500/20' 
          : 'bg-black/50 border-green-800 hover:border-green-600 hover:bg-green-900/10'}"
    >
      <!-- Selection indicator -->
      {#if isSelected}
        <div class="absolute top-2 right-2 w-4 h-4 bg-green-400 rounded-full animate-pulse"></div>
      {/if}
      
      <!-- Pack image -->
      {#if pack.image}
        <div class="w-full h-32 mb-3 rounded overflow-hidden bg-green-900/20">
          <img 
            src={pack.image} 
            alt={display.title}
            class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            loading="lazy"
          />
        </div>
      {:else}
        <div class="w-full h-32 mb-3 rounded bg-green-900/20 flex items-center justify-center">
          <div class="text-4xl text-green-600">📦</div>
        </div>
      {/if}
      
      <!-- Pack info -->
      <h3 class="text-green-300 font-bold mb-1">{display.title}</h3>
      <p class="text-green-600 text-sm mb-2 line-clamp-2">{display.description}</p>
      
      <!-- Stats -->
      <div class="flex items-center justify-between text-xs">
        <span class="text-green-500">
          {display.userCount} users
        </span>
        {#if pack.relays && pack.relays.length > 0}
          <span class="text-green-700">
            {pack.relays.length} relays
          </span>
        {/if}
      </div>
      
      <!-- Created date -->
      <div class="text-xs text-green-700 mt-1">
        {new Date(pack.created_at * 1000).toLocaleDateString()}
      </div>
    </button>
  {/each}
  
  {#if $followPacks.size === 0}
    <div class="col-span-full text-center py-8">
      <p class="text-green-600">Loading follow packs...</p>
    </div>
  {/if}
</div>

<!-- Selected packs summary -->
{#if $selectedFollowPacks.size > 0}
  <div class="mt-4 p-4 bg-green-900/20 border border-green-800">
    <div class="flex items-center justify-between">
      <p class="text-green-400 text-sm">
        {$selectedFollowPacks.size} pack{$selectedFollowPacks.size === 1 ? '' : 's'} selected
      </p>
      <button
        onclick={() => selectedFollowPacks.set(new Set())}
        class="text-xs text-red-400 hover:text-red-300"
      >
        Clear selection
      </button>
    </div>
  </div>
{/if}

<style>
  /* Tailwind line-clamp utility fallback */
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>