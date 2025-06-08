<script lang="ts">
  import { radioSearch, LANGUAGES, MUSIC_GENRES } from '$lib/services/radio-search';
  import type { RadioStation } from '$lib/services/radio-search';
  import { Search, Filter, X, Globe, Music, Radio, Loader } from 'lucide-svelte';
  import { onMount, onDestroy } from 'svelte';
  
  export let onStationSelect: (station: RadioStation) => void = () => {};
  
  let searchQuery = '';
  let showLanguageFilter = false;
  let showGenreFilter = false;
  let searchInputEl: HTMLInputElement;
  
  // Subscribe to stores
  let selectedLanguages = new Set<string>();
  let selectedGenres = new Set<string>();
  let searchResults: RadioStation[] = [];
  let isLoading = false;
  
  const unsubscribeLanguages = radioSearch.selectedLanguages.subscribe(v => selectedLanguages = v);
  const unsubscribeGenres = radioSearch.selectedGenres.subscribe(v => selectedGenres = v);
  const unsubscribeResults = radioSearch.searchResults.subscribe(v => searchResults = v);
  const unsubscribeLoading = radioSearch.isLoading.subscribe(v => isLoading = v);
  
  onDestroy(() => {
    unsubscribeLanguages();
    unsubscribeGenres();
    unsubscribeResults();
    unsubscribeLoading();
  });
  
  function handleSearch() {
    radioSearch.search(searchQuery, 15);
  }
  
  function toggleLanguage(langCode: string) {
    radioSearch.toggleLanguage(langCode);
    handleSearch();
  }
  
  function toggleGenre(genre: string) {
    radioSearch.toggleGenre(genre);
    handleSearch();
  }
  
  function clearFilters() {
    radioSearch.clearFilters();
    handleSearch();
  }
  
  function selectStation(station: RadioStation) {
    onStationSelect(station);
  }
  
  // Auto-search on mount if there are cached stations
  onMount(() => {
    radioSearch.search('', 15);
    searchInputEl?.focus();
  });
  
  // Group genres by category for better organization
  const genreCategories = {
    'Major': MUSIC_GENRES.slice(0, 29),
    'Sub-genres': MUSIC_GENRES.slice(29, 72),
    'Regional': MUSIC_GENRES.slice(72, 86),
    'Era': MUSIC_GENRES.slice(86, 95),
    'Mood': MUSIC_GENRES.slice(95)
  };
</script>

<div class="flex flex-col h-full bg-black text-green-400 font-mono p-4">
  <!-- Search Input -->
  <div class="mb-4">
    <div class="flex items-center gap-2 mb-2">
      <input
        bind:this={searchInputEl}
        bind:value={searchQuery}
        oninput={handleSearch}
        type="text"
        placeholder="ENTER SEARCH TERM..."
        class="flex-1 bg-transparent border-b border-green-800 px-2 py-2 text-green-400 placeholder-green-700 focus:outline-none focus:border-green-600 uppercase"
      />
      
      <!-- Filter Buttons -->
      <button
        onclick={() => showLanguageFilter = !showLanguageFilter}
        class="p-2 border transition-colors {selectedLanguages.size > 0 ? 'bg-green-900 border-green-600 text-green-300' : 'border-green-800 text-green-600 hover:text-green-400 hover:border-green-600'}"
        title="Filter by language"
      >
        <Globe class="w-5 h-5" />
      </button>
      
      <button
        onclick={() => showGenreFilter = !showGenreFilter}
        class="p-2 border transition-colors {selectedGenres.size > 0 ? 'bg-green-900 border-green-600 text-green-300' : 'border-green-800 text-green-600 hover:text-green-400 hover:border-green-600'}"
        title="Filter by genre"
      >
        <Music class="w-5 h-5" />
      </button>
      
      {#if selectedLanguages.size > 0 || selectedGenres.size > 0}
        <button
          onclick={clearFilters}
          class="p-2 border border-green-800 text-green-600 hover:text-green-400 hover:border-green-600 transition-colors"
          title="Clear filters"
        >
          <X class="w-5 h-5" />
        </button>
      {/if}
    </div>
    
    <!-- Active Filters Display -->
    {#if selectedLanguages.size > 0 || selectedGenres.size > 0}
      <div class="text-xs text-green-700 mb-2">
        FILTERS: 
        {#if selectedLanguages.size > 0}
          <span class="text-green-600">LANG({selectedLanguages.size})</span>
        {/if}
        {#if selectedGenres.size > 0}
          <span class="text-green-600 ml-2">GENRE({selectedGenres.size})</span>
        {/if}
      </div>
    {/if}
  </div>
  
  <!-- Filter Panels -->
  {#if showLanguageFilter}
    <div class="mb-4 p-3 border border-green-800 bg-green-950/20">
      <div class="text-xs text-green-600 uppercase tracking-wider mb-2">SELECT LANGUAGES</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
        {#each LANGUAGES as lang}
          <button
            onclick={() => toggleLanguage(lang.code)}
            class="px-2 py-1 text-xs uppercase transition-colors {selectedLanguages.has(lang.code) ? 'bg-green-800 text-green-300' : 'bg-transparent border border-green-900 text-green-600 hover:bg-green-900/50'}"
          >
            {lang.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  
  {#if showGenreFilter}
    <div class="mb-4 p-3 border border-green-800 bg-green-950/20 max-h-64 overflow-y-auto">
      {#each Object.entries(genreCategories) as [category, genres]}
        <div class="mb-3">
          <div class="text-xs text-green-600 uppercase tracking-wider mb-2">{category}</div>
          <div class="flex flex-wrap gap-1">
            {#each genres as genre}
              <button
                onclick={() => toggleGenre(genre)}
                class="px-2 py-1 text-xs uppercase transition-colors {selectedGenres.has(genre) ? 'bg-green-800 text-green-300' : 'bg-transparent border border-green-900 text-green-600 hover:bg-green-900/50'}"
              >
                {genre}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  
  <!-- Search Results -->
  <div class="flex-1 overflow-y-auto">
    {#if isLoading}
      <div class="flex flex-col items-center justify-center h-full">
        <Loader class="w-8 h-8 animate-spin text-green-500 mb-4" />
        <p class="text-green-600">SCANNING FREQUENCIES...</p>
      </div>
    {:else if searchResults.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center">
        <Radio class="w-12 h-12 text-green-800 mb-4" />
        <p class="text-green-600 mb-2">NO STATIONS FOUND</p>
        <p class="text-xs text-green-700">TRY ADJUSTING YOUR SEARCH OR FILTERS</p>
      </div>
    {:else}
      <div class="space-y-1">
        <div class="text-xs text-green-600 mb-2">
          FOUND {searchResults.length} STATIONS
        </div>
        {#each searchResults as station}
          <button
            onclick={() => selectStation(station)}
            class="w-full p-3 border border-green-900 hover:border-green-600 hover:bg-green-900/20 transition-all text-left group"
          >
            <div class="flex items-start gap-3">
              {#if station.thumbnail}
                <img 
                  src={station.thumbnail} 
                  alt={station.name}
                  class="w-10 h-10 object-cover flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                  onerror={(e) => e.currentTarget.style.display = 'none'}
                />
              {:else}
                <div class="w-10 h-10 border border-green-800 flex items-center justify-center flex-shrink-0">
                  <Radio class="w-5 h-5 text-green-700" />
                </div>
              {/if}
              <div class="flex-1 min-w-0">
                <h4 class="font-bold text-green-400 uppercase truncate">{station.name}</h4>
                {#if station.description}
                  <p class="text-xs text-green-600 line-clamp-1 mt-1">{station.description}</p>
                {/if}
                <div class="flex items-center gap-3 mt-1 text-xs text-green-700">
                  {#if station.language}
                    <span>[{LANGUAGES.find(l => l.code === station.language)?.name || station.language}]</span>
                  {/if}
                  {#if station.genres.length > 0}
                    <span>{station.genres.slice(0, 2).join(' / ')}</span>
                  {/if}
                </div>
              </div>
              <div class="text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Instructions -->
  <div class="mt-4 pt-3 border-t border-green-800 text-xs text-green-700 text-center">
    CLICK STATION TO TUNE IN • ESC TO CLOSE
  </div>
</div>

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  /* Custom scrollbar for the retro look */
  ::-webkit-scrollbar {
    width: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: #052e16;
  }
  
  ::-webkit-scrollbar-thumb {
    background: #166534;
    border-radius: 0;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: #15803d;
  }
</style>