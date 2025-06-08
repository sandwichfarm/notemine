<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { radioStore, currentStation, isPlaying, stationCount, isScanning } from '$lib/stores/radio';
  import { radioService } from '$lib/services/radio';
  import { Radio, SkipForward, Volume2, Loader, Plus, X, Wifi, Square, Star, Heart, Search } from 'lucide-svelte';
  import Reactions from './Reactions.svelte';
  import { favoritesService, type FavoriteItem } from '$lib/services/favorites';
  import { keyManager } from '$lib/services/keys';
  import RadioSearchBar from './RadioSearchBar.svelte';
  import RadioStationBubble from './RadioStationBubble.svelte';
  import type { RadioStation } from '$lib/services/radio-search';
  
  let volume = 0.7;
  let showRelayManager = false;
  let showFavoritesManager = false;
  let showSearchBar = false;
  let newRelayUrl = '';
  let selectedSearchStations: RadioStation[] = [];
  let activeRelays: string[] = [];
  let canvas: HTMLCanvasElement;
  let canvasCtx: CanvasRenderingContext2D | null = null;
  let animationId: number | null = null;
  let analyser: AnalyserNode | null = null;
  let frameCount = 0;
  let lastFrameTime = 0;
  const targetFPS = 30; // Limit to 30 FPS for performance
  const frameDelay = 1000 / targetFPS;
  let isComponentVisible = true;
  let hasKeys = false;
  let favoriteStations: FavoriteItem[] = [];
  let userFavorites = favoritesService.getUserFavorites();
  
  // Reactive favorite status
  $: isFavorited = $currentStation?.event ? favoritesService.createFavoritedStore($currentStation.event.id) : null;
  $: favoriteStatus = isFavorited ? $isFavorited : false;
  
  // Update favorite stations when favorites change
  $: {
    const favList = favoritesService.getUserFavorites();
    favoriteStations = favList?.favorites || [];
  }
  
  $: radioStore.setVolume(volume);
  $: activeRelays = radioService.getActiveRelays();
  
  onMount(async () => {
    // Check if we have keys
    hasKeys = keyManager.getPublicKey() !== null;
    
    // Subscribe to favorites
    if (hasKeys) {
      await favoritesService.subscribeToFavorites();
      // Load initial favorites
      const favList = favoritesService.getUserFavorites();
      favoriteStations = favList?.favorites || [];
    }
    
    // Check if we already have stations loaded
    if ($stationCount === 0) {
      await radioService.initialize();
    } else {
      console.log('📻 Radio already has', $stationCount, 'stations loaded');
    }
    
    // Set up canvas context
    if (canvas) {
      canvasCtx = canvas.getContext('2d');
      if (canvasCtx) {
        canvasCtx.strokeStyle = 'rgb(34, 197, 94)'; // green-400
        canvasCtx.lineWidth = 2;
      }
    }
    
    // Set up audio analyser when playing
    setupAudioAnalyser();
    
    // Set up keyboard shortcuts
    window.addEventListener('keydown', handleKeyPress);
    
    // Set up visibility observer to pause animation when not visible
    const observer = new IntersectionObserver(
      (entries) => {
        isComponentVisible = entries[0].isIntersecting;
      },
      { threshold: 0.1 }
    );
    
    if (canvas) {
      observer.observe(canvas);
    }
    
    return () => {
      observer.disconnect();
    };
  });
  
  onDestroy(() => {
    // Don't cleanup on destroy - keep stations loaded
    // radioService.cleanup();
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    // Remove keyboard event listener
    window.removeEventListener('keydown', handleKeyPress);
  });
  
  // Set up audio analyser for waveform
  $: if ($isPlaying && canvas) {
    // Small delay to ensure audio context is ready
    setTimeout(() => setupAudioAnalyser(), 100);
  } else if (!$isPlaying && animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
    frameCount = 0;
    lastFrameTime = 0;
    // Clear canvas with fade
    if (canvasCtx && canvas) {
      canvasCtx.fillStyle = 'rgba(0, 0, 0, 1)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  
  function setupAudioAnalyser() {
    const audio = radioService.getAudioElement();
    if (!audio || !canvasCtx || !canvas) return;
    
    try {
      // Get or create audio context
      const audioContext = radioService.getAudioContext();
      if (!audioContext) return;
      
      // Get analyser from radio service
      analyser = radioService.getAnalyser();
      if (!analyser) return;
      
      // Start drawing
      drawWaveform();
    } catch (error) {
      console.error('Failed to setup audio analyser:', error);
    }
  }
  
  function drawWaveform(currentTime?: number) {
    if (!analyser || !canvasCtx || !canvas) return;
    
    // Schedule next frame
    animationId = requestAnimationFrame(drawWaveform);
    
    // Don't draw if component is not visible
    if (!isComponentVisible) return;
    
    // Throttle to target FPS
    if (!currentTime) currentTime = performance.now();
    if (currentTime - lastFrameTime < frameDelay) return;
    lastFrameTime = currentTime;
    
    // Only update every 2nd frame for smoother performance
    frameCount++;
    if (frameCount % 2 !== 0) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    
    // Clear with slight fade for smoother trails
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    canvasCtx.beginPath();
    
    // Reduce sample rate for performance
    const step = Math.ceil(bufferLength / 128); // Sample every nth point
    const sliceWidth = canvas.width / (bufferLength / step);
    let x = 0;
    
    for (let i = 0; i < bufferLength; i += step) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;
      
      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
  }
  
  async function handleStationChange() {
    await radioStore.changeStation();
  }
  
  async function addRelay() {
    if (newRelayUrl.trim() && newRelayUrl.startsWith('wss://')) {
      await radioService.addCustomRelay(newRelayUrl.trim());
      newRelayUrl = '';
    }
  }
  
  function removeRelay(url: string) {
    radioService.removeRelay(url);
  }
  
  function formatTrackInfo(station: typeof $currentStation) {
    if (!station) return 'No station selected';
    
    const track = station.currentTrack;
    if (!track) return station.name;
    
    const artist = track.artist || 'Unknown Artist';
    const title = track.title || 'Untitled';
    
    return `${artist} - ${title}`;
  }
  
  async function toggleFavorite() {
    if (!hasKeys || !$currentStation?.event) return;
    
    try {
      if (favoriteStatus) {
        await favoritesService.removeFavorite($currentStation.event.id);
      } else {
        await favoritesService.addFavorite(
          $currentStation.event.id,
          undefined,
          $currentStation.name
        );
      }
      // Update local favorites list
      const favList = favoritesService.getUserFavorites();
      favoriteStations = favList?.favorites || [];
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  }
  
  async function switchToFavorite(favoriteId: string) {
    // Find the station in our current stations list
    const station = $radioStore.stations.find(s => s.event?.id === favoriteId || s.id === favoriteId);
    
    if (station) {
      // Stop current playback
      radioStore.stop();
      
      // Update current station
      radioStore.update(s => ({ 
        ...s, 
        currentStation: station,
        error: null 
      }));
      
      // Play the station
      await radioStore.play();
      
      // Close favorites manager
      showFavoritesManager = false;
    } else {
      console.error('Favorite station not found in current stations list');
    }
  }
  
  // Get station name for a favorite
  function getStationName(favorite: FavoriteItem): string {
    const station = $radioStore.stations.find(s => s.event?.id === favorite.eventId || s.id === favorite.eventId);
    return station?.name || favorite.petname || 'Unknown Station';
  }
  
  // Check if favorite is currently playing
  function isFavoritePlaying(favorite: FavoriteItem): boolean {
    return $currentStation?.event?.id === favorite.eventId || $currentStation?.id === favorite.eventId;
  }
  
  // Handle keyboard shortcuts
  function handleKeyPress(event: KeyboardEvent) {
    // Check if we're in an input field
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    
    // Favorites shortcuts (Ctrl/Cmd + 1-9)
    if ((event.ctrlKey || event.metaKey) && event.key >= '1' && event.key <= '9') {
      event.preventDefault();
      const index = parseInt(event.key) - 1;
      if (favoriteStations[index]) {
        switchToFavorite(favoriteStations[index].eventId);
      }
    }
    
    // Toggle favorites panel (Ctrl/Cmd + F)
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      event.preventDefault();
      if (hasKeys && favoriteStations.length > 0) {
        showFavoritesManager = !showFavoritesManager;
        if (showFavoritesManager) {
          showRelayManager = false; // Close relay manager if open
          showSearchBar = false; // Close search bar if open
        }
      }
    }
    
    // Next station (N or Space)
    if (event.key === 'n' || event.key === ' ') {
      event.preventDefault();
      handleStationChange();
    }
    
    // Toggle scan mode (S)
    if (event.key === 's') {
      event.preventDefault();
      radioStore.toggleScan();
    }
    
    // Stop playback (X) or close search (Escape)
    if (event.key === 'x' || event.key === 'Escape') {
      event.preventDefault();
      if (showSearchBar) {
        showSearchBar = false;
      } else if ($isPlaying) {
        radioStore.stop();
      }
    }
  }
</script>

<div class="w-full h-full flex flex-col bg-black text-green-400 font-mono overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between p-3 border-b border-green-800">
    <div class="flex items-center gap-2">
      <Radio class="w-5 h-5" />
      <h2 class="text-lg font-bold">NOSTR RADIO</h2>
    </div>
    <div class="flex items-center gap-4">
      <button
        onclick={() => { showSearchBar = !showSearchBar; showRelayManager = false; showFavoritesManager = false; }}
        class="text-green-600 hover:text-green-400 transition-colors"
        title="Search stations"
      >
        <Search class="w-4 h-4" />
      </button>
      <div class="text-xs text-green-600">
        {$stationCount} stations available
      </div>
    </div>
  </div>
  
  <!-- Main Display -->
  <div class="flex-1 flex flex-col items-center justify-center p-6 relative">
    {#if $radioStore.isLoading}
      <div class="flex flex-col items-center gap-4">
        <Loader class="w-12 h-12 animate-spin text-green-500" />
        <p class="text-green-600">Scanning frequencies...</p>
      </div>
    {:else if $currentStation}
      <!-- Station Display -->
      <div class="text-center space-y-4 w-full max-w-md">
        <!-- Station Name -->
        <div class="text-2xl text-green-400 flex items-center justify-center gap-2">
          {$currentStation.name}
          {#if $isScanning}
            <span class="text-xs text-orange-400 animate-pulse">[SCAN MODE]</span>
          {/if}
          {#if hasKeys && $currentStation.event}
            <button
              onclick={toggleFavorite}
              class="text-yellow-400 hover:text-yellow-300 transition-colors"
              title={favoriteStatus ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star class="w-5 h-5 {favoriteStatus ? 'fill-current' : ''}" />
            </button>
          {/if}
        </div>
        
        <!-- Current Track -->
        <div class="text-sm text-green-600 px-4 py-2 border border-green-800 rounded bg-green-900/20">
          <div class="truncate">
            {formatTrackInfo($currentStation)}
          </div>
          {#if $currentStation.genre}
            <div class="text-xs mt-1 text-green-700">
              Genre: {$currentStation.genre}
            </div>
          {/if}
        </div>
        
        <!-- Waveform Visualizer -->
        <div class="relative h-20 w-full bg-green-950/20 rounded border border-green-800 overflow-hidden">
          <canvas 
            bind:this={canvas}
            width="400" 
            height="80"
            class="absolute inset-0 w-full h-full"
          />
          {#if !$isPlaying}
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs text-green-700">NO SIGNAL</span>
            </div>
          {/if}
        </div>
        
        <!-- Station Reactions -->
        {#if $currentStation.event}
          <div class="pt-2">
            <Reactions event={$currentStation.event} compact={false} />
          </div>
        {/if}
      </div>
    {:else}
      <div class="text-center space-y-4">
        <p class="text-green-600">No stations found</p>
        <p class="text-xs text-green-700">Try adding more relays or wait for events to load</p>
      </div>
    {/if}
    
    <!-- Error Display -->
    {#if $radioStore.error}
      <div class="absolute bottom-0 left-0 right-0 p-4 bg-red-900/20 border-t border-red-800">
        <p class="text-red-400 text-xs">{$radioStore.error}</p>
      </div>
    {/if}
  </div>
  
  <!-- Controls -->
  <div class="p-4 border-t border-green-800 space-y-3">
    <!-- Main Controls -->
    <div class="flex justify-center gap-3">
      {#if $isPlaying}
        <button
          onclick={() => radioStore.stop()}
          class="px-6 py-3 bg-red-900 hover:bg-red-800 border border-red-600 
                 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Square class="w-5 h-5" />
          <span class="font-bold">STOP</span>
        </button>
      {/if}
      
      <button
        onclick={handleStationChange}
        disabled={$radioStore.isLoading || $stationCount === 0 || $isScanning}
        class="px-6 py-3 bg-green-900 hover:bg-green-800 disabled:bg-green-950 disabled:opacity-50 
               border border-green-600 rounded-lg flex items-center gap-2 transition-colors"
      >
        <SkipForward class="w-5 h-5" />
        <span class="font-bold">NEXT</span>
      </button>
      
      <button
        onclick={() => radioStore.toggleScan()}
        disabled={$radioStore.isLoading || $stationCount === 0}
        class="px-6 py-3 {$isScanning ? 'bg-orange-900 hover:bg-orange-800 border-orange-600' : 'bg-green-900 hover:bg-green-800 border-green-600'} 
               disabled:bg-green-950 disabled:opacity-50 
               border rounded-lg flex items-center gap-2 transition-colors"
      >
        <Wifi class="w-5 h-5 {$isScanning ? 'animate-pulse' : ''}" />
        <span class="font-bold">{$isScanning ? 'SCANNING' : 'SCAN'}</span>
      </button>
    </div>
    
    <!-- Volume Control -->
    <div class="flex items-center gap-3 justify-center">
      <Volume2 class="w-4 h-4 text-green-600" />
      <input
        type="range"
        bind:value={volume}
        min="0"
        max="1"
        step="0.05"
        class="w-32 accent-green-500"
      />
      <span class="text-xs text-green-600 w-8">{Math.round(volume * 100)}%</span>
    </div>
    
    {#if $isScanning}
      <div class="text-center text-xs text-orange-600">
        Scanning... Next station in {$radioStore.scanInterval / 1000}s
      </div>
    {/if}
    
    <!-- Bottom Controls -->
    <div class="flex justify-center gap-4">
      {#if hasKeys && favoriteStations.length > 0}
        <button
          onclick={() => showFavoritesManager = !showFavoritesManager}
          class="text-xs text-green-600 hover:text-green-400 flex items-center gap-1"
        >
          <Heart class="w-3 h-3" />
          Favorites ({favoriteStations.length})
        </button>
      {/if}
      
      <button
        onclick={() => showRelayManager = !showRelayManager}
        class="text-xs text-green-600 hover:text-green-400 flex items-center gap-1"
      >
        <Plus class="w-3 h-3" />
        Manage Relays
      </button>
    </div>
  </div>
  
  <!-- Relay Manager -->
  {#if showRelayManager}
    <div class="border-t border-green-800 bg-black p-4 max-h-64 overflow-hidden flex flex-col">
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-green-400 font-bold">RELAY MANAGEMENT</h3>
          <button
            onclick={() => showRelayManager = false}
            class="text-green-600 hover:text-green-400"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        
        <!-- Add Relay -->
        <div class="flex gap-2 mb-4">
          <input
            type="text"
            bind:value={newRelayUrl}
            placeholder="wss://relay.example.com"
            class="flex-1 bg-transparent border border-green-800 px-2 py-1 text-green-400 text-xs"
          />
          <button
            onclick={addRelay}
            class="px-3 py-1 bg-green-900 hover:bg-green-800 border border-green-600 text-xs"
          >
            Add
          </button>
        </div>
        
        <!-- Relay List -->
        <div class="flex-1 overflow-y-auto space-y-1">
          <p class="text-xs text-green-600 mb-2">Active Relays ({activeRelays.length}):</p>
          {#each activeRelays as relay}
            <div class="flex items-center justify-between p-2 bg-green-900/20 border border-green-800 rounded text-xs">
              <span class="text-green-400 truncate flex-1">{relay}</span>
              <button
                onclick={() => removeRelay(relay)}
                class="text-red-400 hover:text-red-300 ml-2"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Favorites Manager -->
  {#if showFavoritesManager && hasKeys}
    <div class="border-t border-green-800 bg-black p-4 max-h-64 overflow-hidden flex flex-col">
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-green-400 font-bold">FAVORITE STATIONS</h3>
          <button
            onclick={() => showFavoritesManager = false}
            class="text-green-600 hover:text-green-400"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        
        <!-- Favorites List -->
        <div class="flex-1 overflow-y-auto space-y-1">
          {#if favoriteStations.length === 0}
            <p class="text-xs text-green-600 text-center py-4">
              No favorite stations yet. Click the star icon on a station to add it to favorites.
            </p>
          {:else}
            <p class="text-xs text-green-600 mb-2">Your Favorites ({favoriteStations.length}):</p>
            {#each favoriteStations as favorite, index}
              {@const stationName = getStationName(favorite)}
              {@const isCurrentlyPlaying = isFavoritePlaying(favorite)}
              <button
                onclick={() => switchToFavorite(favorite.eventId)}
                class="w-full flex items-center justify-between p-2 bg-green-900/20 border border-green-800 
                       rounded text-xs hover:bg-green-900/40 transition-colors
                       {isCurrentlyPlaying ? 'border-green-400 bg-green-900/40' : ''}"
              >
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  {#if index < 9}
                    <span class="text-green-700 font-bold w-4">{index + 1}</span>
                  {/if}
                  {#if isCurrentlyPlaying}
                    <Radio class="w-3 h-3 text-green-400 animate-pulse" />
                  {:else}
                    <Heart class="w-3 h-3 text-green-600" />
                  {/if}
                  <span class="text-green-400 truncate">{stationName}</span>
                </div>
                {#if isCurrentlyPlaying}
                  <span class="text-xs text-green-500 ml-2">NOW PLAYING</span>
                {/if}
              </button>
            {/each}
            
            <div class="mt-4 pt-2 border-t border-green-800 space-y-1">
              <p class="text-xs text-green-700 text-center">
                Click a station to tune in
              </p>
              <p class="text-xs text-green-700 text-center">
                Keyboard: ⌃1-9 or ⌘1-9 for quick access
              </p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Search Overlay -->
  {#if showSearchBar}
    <div class="absolute inset-0 bg-black z-50 flex flex-col">
      <!-- Search Header -->
      <div class="flex items-center justify-between p-3 border-b border-green-800">
        <div class="flex items-center gap-2">
          <Search class="w-5 h-5" />
          <h2 class="text-lg font-bold">STATION SEARCH</h2>
        </div>
        <button
          onclick={() => showSearchBar = false}
          class="text-green-600 hover:text-green-400"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      
      <!-- Search Content -->
      <div class="flex-1 overflow-hidden">
        <RadioSearchBar 
          onStationSelect={(station) => {
            // Try to play the station immediately
            const radioStation = {
              id: station.id,
              name: station.name,
              streamUrl: station.streams[0]?.url || '',
              genre: station.genres[0],
              description: station.description,
              event: null // Search results don't have events
            };
            
            // Stop current playback
            radioStore.stop();
            
            // Update current station
            radioStore.update(s => ({ 
              ...s, 
              currentStation: radioStation,
              error: null 
            }));
            
            // Play the station
            radioStore.play();
            
            // Close search
            showSearchBar = false;
          }}
        />
      </div>
    </div>
  {/if}
</div>

<style>
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