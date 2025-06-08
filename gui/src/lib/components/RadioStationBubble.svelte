<script lang="ts">
  import type { RadioStation } from '$lib/services/radio-search';
  import { X, Radio as RadioIcon, AlertCircle } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  
  export let station: RadioStation;
  export let isPlaying: boolean = false;
  export let hasError: boolean = false;
  
  const dispatch = createEventDispatcher();
  
  function handleClick() {
    dispatch('select');
  }
  
  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    dispatch('remove');
  }
</script>

<div class="relative group flex items-center gap-2">
  <button
    onclick={handleClick}
    class="flex items-center gap-2 px-3 py-2 rounded-full transition-all {
      isPlaying 
        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg scale-105' 
        : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
    } {hasError ? 'opacity-50' : ''}"
  >
    <!-- Station Icon/Thumbnail -->
    <div class="relative flex-shrink-0">
      {#if station.thumbnail && !hasError}
        <img 
          src={station.thumbnail} 
          alt={station.name}
          class="w-8 h-8 rounded-full object-cover"
          onerror={(e) => e.currentTarget.style.display = 'none'}
        />
      {:else}
        <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
          {#if hasError}
            <AlertCircle class="w-4 h-4 text-red-400" />
          {:else}
            <RadioIcon class="w-4 h-4 text-gray-400" />
          {/if}
        </div>
      {/if}
      
      {#if isPlaying}
        <!-- Animated playing indicator -->
        <div class="absolute -top-1 -right-1 flex gap-0.5">
          <span class="w-0.5 h-3 bg-white rounded-full animate-pulse"></span>
          <span class="w-0.5 h-3 bg-white rounded-full animate-pulse" style="animation-delay: 0.3s"></span>
          <span class="w-0.5 h-3 bg-white rounded-full animate-pulse" style="animation-delay: 0.6s"></span>
        </div>
      {/if}
    </div>
    
    <!-- Station Name -->
    <span class="font-medium truncate max-w-[150px]">{station.name}</span>
  </button>
  
  <!-- Remove Button -->
  <button
    onclick={handleRemove}
    class="absolute -right-2 -top-2 w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
    title="Remove station"
  >
    <X class="w-3 h-3" />
  </button>
</div>

<style>
  @keyframes pulse {
    0%, 100% {
      opacity: 0.3;
      transform: scaleY(0.5);
    }
    50% {
      opacity: 1;
      transform: scaleY(1);
    }
  }
  
  .animate-pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }
</style>