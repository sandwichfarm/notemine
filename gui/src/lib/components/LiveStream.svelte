<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { livestreamStore, livestreamService } from '$lib/services/livestream';
  import { 
    Play, 
    Square, 
    Volume2, 
    Users, 
    Plus, 
    X, 
    ExternalLink, 
    Loader,
    Tv,
    SkipForward,
    MessageSquare
  } from 'lucide-svelte';
  import { STATIC_PATTERNS } from '$lib/types/livestream';
  
  let videoElement: HTMLVideoElement;
  let chatContainer: HTMLDivElement;
  let newStreamUrl = '';
  let showAddStream = false;
  let showChat = false;
  let staticPatternIndex = 0;
  let staticInterval: number;
  let containerWidth = 0;
  let containerHeight = 0;
  let containerEl: HTMLDivElement;
  
  // Reactive values from store
  $: streams = $livestreamStore.streams;
  $: currentStream = $livestreamStore.currentStream;
  $: isPlaying = $livestreamStore.isPlaying;
  $: isLoading = $livestreamStore.isLoading;
  $: showStatic = $livestreamStore.showStatic;
  $: error = $livestreamStore.error;
  $: volume = $livestreamStore.volume;
  
  // Layout calculations
  $: isPortrait = containerHeight > containerWidth;
  $: isSmallPane = containerWidth < 300 || containerHeight < 200;
  $: showChatPanel = !isSmallPane && showChat;
  
  // Stream count
  $: streamCount = streams.length;
  
  onMount(() => {
    // Start static animation
    staticInterval = window.setInterval(() => {
      staticPatternIndex = (staticPatternIndex + 1) % STATIC_PATTERNS.length;
    }, 100);
    
    // Observe container size
    if (containerEl) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          containerWidth = entry.contentRect.width;
          containerHeight = entry.contentRect.height;
        }
      });
      resizeObserver.observe(containerEl);
      
      return () => resizeObserver.disconnect();
    }
  });
  
  onDestroy(() => {
    if (staticInterval) clearInterval(staticInterval);
  });
  
  async function playStream(streamId: string) {
    if (videoElement) {
      await livestreamService.playStream(streamId, videoElement);
    }
  }
  
  function stopStream() {
    livestreamService.stopStream();
  }
  
  function nextStream() {
    livestreamService.nextStream();
  }
  
  function setVolume(vol: number) {
    livestreamService.setVolume(vol);
  }
  
  async function addCustomStream() {
    if (newStreamUrl.trim()) {
      const success = livestreamService.addCustomStream(newStreamUrl.trim());
      if (success) {
        newStreamUrl = '';
        showAddStream = false;
      } else {
        // TODO: Show error message
        console.error('Unsupported stream URL');
      }
    }
  }
  
  function formatParticipants(count?: number): string {
    if (!count) return '0';
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1000000).toFixed(1)}M`;
  }
  
  function getLayoutClass(): string {
    if (isSmallPane) {
      return 'grid-small';
    } else if (isPortrait) {
      return 'grid-portrait';
    } else {
      return 'grid-landscape';
    }
  }
</script>

<div 
  bind:this={containerEl}
  class="w-full h-full flex flex-col bg-black text-green-400 font-mono overflow-hidden {getLayoutClass()}"
>
  <!-- Header -->
  <div class="flex items-center justify-between p-3 border-b border-green-800 flex-shrink-0">
    <div class="flex items-center gap-2">
      <Tv class="w-5 h-5" />
      <h2 class="text-lg font-bold">LIVE STREAMS</h2>
    </div>
    <div class="flex items-center gap-2 text-xs text-green-600">
      {#if !isSmallPane}
        <button
          onclick={() => showChat = !showChat}
          class="text-green-600 hover:text-green-400 transition-colors"
          title="Toggle chat"
        >
          <MessageSquare class="w-4 h-4" />
        </button>
        <button
          onclick={() => showAddStream = !showAddStream}
          class="text-green-600 hover:text-green-400 transition-colors"
          title="Add custom stream"
        >
          <Plus class="w-4 h-4" />
        </button>
      {/if}
      <span>{streamCount} streams</span>
    </div>
  </div>
  
  <!-- Add Custom Stream -->
  {#if showAddStream && !isSmallPane}
    <div class="p-3 border-b border-green-800 bg-green-950/20">
      <div class="flex gap-2">
        <input
          bind:value={newStreamUrl}
          placeholder="Enter stream URL (HLS, MP4, etc.)"
          class="flex-1 bg-transparent border border-green-800 px-2 py-1 text-green-400 text-xs focus:outline-none focus:border-green-600"
        />
        <button
          onclick={addCustomStream}
          class="px-3 py-1 bg-green-900 hover:bg-green-800 border border-green-600 text-xs"
        >
          ADD
        </button>
        <button
          onclick={() => showAddStream = false}
          class="px-2 py-1 text-green-600 hover:text-green-400"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Main Content Area -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Video Area -->
    <div class="flex-1 flex flex-col">
      <!-- Video Container -->
      <div class="flex-1 relative bg-black">
        {#if showStatic}
          <!-- Static Effect -->
          <div class="absolute inset-0 flex items-center justify-center bg-gray-900 text-green-400 font-mono">
            <div class="text-center">
              <div class="text-4xl mb-4 animate-pulse">
                {STATIC_PATTERNS[staticPatternIndex]}
              </div>
              <div class="text-lg">TUNING...</div>
              <div class="text-sm opacity-60 mt-2">
                {currentStream?.title || 'Loading stream...'}
              </div>
            </div>
          </div>
        {:else if currentStream}
          <!-- Video Player -->
          <video
            bind:this={videoElement}
            class="w-full h-full object-contain"
            poster={currentStream.image}
            controls={false}
            autoplay
            muted={false}
          >
            <track kind="captions" />
          </video>
          
          <!-- Video Overlay Info -->
          <div class="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs">
            <div class="text-green-400 font-bold">{currentStream.title}</div>
            {#if currentStream.participants}
              <div class="text-green-600 flex items-center gap-1">
                <Users class="w-3 h-3" />
                {formatParticipants(currentStream.participants)}
              </div>
            {/if}
          </div>
          
          <!-- Live Indicator -->
          {#if currentStream.status === 'live'}
            <div class="absolute top-2 right-2 bg-red-600 px-2 py-1 rounded text-xs font-bold animate-pulse">
              ● LIVE
            </div>
          {/if}
        {:else if isLoading}
          <!-- Loading State -->
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <Loader class="w-12 h-12 animate-spin text-green-500 mb-4 mx-auto" />
              <p class="text-green-600">Scanning for live streams...</p>
            </div>
          </div>
        {:else}
          <!-- No Stream State -->
          <div class="absolute inset-0 flex items-center justify-center text-center">
            <div>
              <Tv class="w-16 h-16 text-green-800 mb-4 mx-auto" />
              <p class="text-green-600 mb-2">No stream selected</p>
              <p class="text-xs text-green-700">Click a stream below to tune in</p>
            </div>
          </div>
        {/if}
        
        <!-- Error Overlay -->
        {#if error}
          <div class="absolute bottom-0 left-0 right-0 p-4 bg-red-900/20 border-t border-red-800">
            <p class="text-red-400 text-xs">{error}</p>
          </div>
        {/if}
      </div>
      
      <!-- Controls -->
      <div class="p-3 border-t border-green-800 space-y-2">
        <!-- Main Controls -->
        <div class="flex justify-center gap-3">
          {#if isPlaying}
            <button
              onclick={stopStream}
              class="px-4 py-2 bg-red-900 hover:bg-red-800 border border-red-600 rounded flex items-center gap-2 transition-colors text-xs"
            >
              <Square class="w-4 h-4" />
              STOP
            </button>
          {/if}
          
          <button
            onclick={nextStream}
            disabled={streams.length === 0}
            class="px-4 py-2 bg-green-900 hover:bg-green-800 disabled:bg-green-950 disabled:opacity-50 border border-green-600 rounded flex items-center gap-2 transition-colors text-xs"
          >
            <SkipForward class="w-4 h-4" />
            NEXT
          </button>
        </div>
        
        <!-- Volume Control -->
        {#if !isSmallPane}
          <div class="flex items-center gap-2 justify-center">
            <Volume2 class="w-4 h-4 text-green-600" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              oninput={(e) => setVolume(parseFloat(e.target.value))}
              class="w-24 accent-green-500"
            />
            <span class="text-xs text-green-600 w-8">{Math.round(volume * 100)}%</span>
          </div>
        {/if}
      </div>
    </div>
    
    <!-- Chat Panel -->
    {#if showChatPanel}
      <div class="w-80 border-l border-green-800 flex flex-col">
        <!-- Chat Header -->
        <div class="p-2 border-b border-green-800 flex items-center justify-between">
          <span class="text-xs font-bold">STREAM CHAT</span>
          <button
            onclick={() => showChat = false}
            class="text-green-600 hover:text-green-400"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
        
        <!-- Chat Messages -->
        <div 
          bind:this={chatContainer}
          class="flex-1 p-2 overflow-y-auto space-y-1"
        >
          <!-- Placeholder chat -->
          <div class="text-xs text-green-700 text-center py-8">
            Chat integration coming soon...
          </div>
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Stream List -->
  {#if !isSmallPane && streams.length > 0}
    <div class="border-t border-green-800 max-h-40 overflow-y-auto">
      <div class="p-2">
        <div class="text-xs text-green-600 mb-2">Available Streams ({streams.length}):</div>
        <div class="space-y-1">
          {#each streams as stream}
            <button
              onclick={() => playStream(stream.id)}
              class="w-full p-2 text-left border border-green-900 hover:border-green-600 hover:bg-green-900/20 transition-all {currentStream?.id === stream.id ? 'border-green-400 bg-green-900/40' : ''}"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-bold text-green-400 truncate">{stream.title}</div>
                  {#if stream.participants}
                    <div class="text-xs text-green-600 flex items-center gap-1">
                      <Users class="w-3 h-3" />
                      {formatParticipants(stream.participants)}
                    </div>
                  {/if}
                </div>
                <div class="flex items-center gap-2">
                  {#if stream.status === 'live'}
                    <span class="text-xs bg-red-600 px-1 rounded">LIVE</span>
                  {/if}
                  {#if currentStream?.id === stream.id && isPlaying}
                    <span class="text-xs text-green-400">▶</span>
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Layout grids */
  .grid-small {
    /* Minimal layout for small panes */
  }
  
  .grid-portrait {
    /* Portrait orientation - video on top, controls below */
  }
  
  .grid-landscape {
    /* Landscape orientation - video left, chat right */
  }
  
  /* Custom range slider styling */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }
  
  input[type="range"]::-webkit-slider-track {
    background: #166534;
    height: 2px;
  }
  
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: #22c55e;
    height: 12px;
    width: 12px;
    border-radius: 50%;
    margin-top: -5px;
  }
  
  input[type="range"]::-moz-range-track {
    background: #166534;
    height: 2px;
  }
  
  input[type="range"]::-moz-range-thumb {
    background: #22c55e;
    height: 12px;
    width: 12px;
    border-radius: 50%;
    border: none;
  }
</style>