<script lang="ts">
  import { feedStore, DEFAULT_SORT_OPTIONS } from '$lib/stores/feeds';
  import type { FeedFilter } from '$lib/types/feeds';
  import { extractPowDifficulty } from '$lib/utils/nostr';
  import type { NostrEvent } from '$lib/types/nostr';
  import Nip01FeedFilters from './Nip01FeedFilters.svelte';
  import { activeNip01Filters, nip01FilterStore } from '$lib/stores/nip01-filters';
  import { onMount, onDestroy } from 'svelte';
  import RelaySearch from './RelaySearch.svelte';
  import Reactions from './Reactions.svelte';
  import { getPowClient } from '$lib/services/pow-client';
  import { browser } from '$app/environment';
  import FeedSelector from './FeedSelector.svelte';
  import GlobalFeedWarning from './GlobalFeedWarning.svelte';
  import FollowPackGrid from './FollowPackGrid.svelte';
  import { activeFeed as activeFeedConfig, feedManager } from '$lib/services/feed-manager';
  
  // Store subscriptions
  const { feedConfigs, activeFeed, sortedAndFilteredEvents, activeFeedId } = feedStore;
  
  // Component state
  let showFilters = false;
  let exclusiveRelayMode = false;
  
  // Relay management - use local state that syncs with the store
  $: feedRelays = $activeFeed.relays || [];
  
  // Update feed when relays change
  function updateRelays(newRelays: string[]) {
    console.log('🔄 Updating feed relays:', newRelays);
    feedStore.updateFeed($activeFeedId, { relays: newRelays });
  }
  
  
  // Handle exclusive relay mode changes
  function handleExclusiveModeChange(event) {
    exclusiveRelayMode = event.detail;
    // Store this setting in the feed configuration
    feedStore.updateFeed($activeFeedId, { exclusiveRelayMode });
    console.log('🔒 Exclusive relay mode:', exclusiveRelayMode);
  }
  // Window ID for keybind targeting (passed from parent Window component)
  export let windowId: string = '';
  
  // Update filters when feed changes
  $: if ($activeFeedConfig && browser) {
    updateFeedFilters();
  }
  
  async function updateFeedFilters() {
    const filter = await feedManager.getFeedFilter();
    if (filter) {
      // Update the active NIP01 filters
      activeNip01Filters.update(filters => ({
        ...filters,
        ...filter
      }));
    }
  }
  
  // Listen for filter toggle event and feed refresh events
  onMount(() => {
    // Ensure PoWClient is initialized to start subscriptions
    if (browser) {
      try {
        const powClient = getPowClient();
        console.log('✅ PoW client initialized for feed');
      } catch (error) {
        console.error('❌ Failed to initialize PoW client:', error);
      }
    }
    
    const handleToggleFilters = (event: CustomEvent) => {
      if (!windowId || event.detail.windowId === windowId) {
        showFilters = !showFilters;
      } else if (event.detail.showFilters !== undefined) {
        showFilters = event.detail.showFilters;
      }
    };
    
    const handleFeedRefresh = (event: CustomEvent) => {
      console.log('📡 Feed refresh event received:', event.detail);
      // The refresh is already handled by the feedStore update in FeedSelector
      // This is just for logging and potential future enhancements
    };
    
    globalThis.addEventListener('toggle-feed-filters', handleToggleFilters as EventListener);
    globalThis.addEventListener('feed-refresh', handleFeedRefresh as EventListener);
    
    return () => {
      globalThis.removeEventListener('toggle-feed-filters', handleToggleFilters as EventListener);
      globalThis.removeEventListener('feed-refresh', handleFeedRefresh as EventListener);
    };
  });
  
  // Helper functions
  function formatRelativeTime(timestamp: number): string {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }
  
  function formatPubkey(pubkey: string): string {
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
  }
  
  function getEventPow(event: NostrEvent): number {
    return extractPowDifficulty(event);
  }
  
  function getKindName(kind: number): string {
    const kindNames: Record<number, string> = {
      0: 'Profile',
      1: 'Note',
      3: 'Contacts',
      4: 'DM',
      6: 'Repost',
      7: 'Reaction',
      9735: 'Zap',
      10002: 'Relay List',
      30023: 'Article'
    };
    return kindNames[kind] || `Kind ${kind}`;
  }
  
  
  // Feed management
  
  function updateFeedSetting(key: keyof typeof $activeFeed, value: any) {
    feedStore.updateFeed($activeFeedId, { [key]: value });
  }
  
  // Ensure feed has relays array
  $: if ($activeFeed && !$activeFeed.relays) {
    feedStore.updateFeed($activeFeedId, { relays: [] });
  }
  
  // Debug: log feed subscription state
  $: console.log('📊 Feed state:', {
    feedId: $activeFeedId,
    relays: feedRelays,
    eventCount: $sortedAndFilteredEvents.length,
    nip01Filters: $activeNip01Filters,
    activeFeedConfig: $activeFeedConfig
  });
  
  // Additional debug for filter troubleshooting
  $: if ($sortedAndFilteredEvents.length <= 1 && $activeNip01Filters.length > 0) {
    console.warn('🚨 Feed showing only 1 event with active filters:', {
      filters: $activeNip01Filters,
      events: $sortedAndFilteredEvents,
      feedConfig: $activeFeedConfig
    });
  }
</script>

<div class="h-full flex flex-col text-xs">
  <!-- Global Feed Warning Modal -->
  <GlobalFeedWarning />
  
  <!-- Feed Selector -->
  <FeedSelector />
  
  <!-- Feed Content -->
  {#if $activeFeedConfig?.type === 'follow-packs' && !feedManager.getFeedFilter()}
    <!-- Show follow pack selector -->
    <div class="flex-1 overflow-y-auto">
      <div class="p-4">
        <h2 class="text-green-400 font-bold mb-2">SELECT FOLLOW PACKS</h2>
        <p class="text-green-600 text-sm mb-4">Choose community-curated lists to build your feed</p>
      </div>
      <FollowPackGrid />
    </div>
  {:else}
    <!-- Regular feed content -->
    <!-- Filters Panel -->
    {#if showFilters}
    <div class="p-2 border-b border-green-800 bg-green-900/10 max-h-96 overflow-y-auto">
      <div class="space-y-3">
        <!-- NIP-01 Filters -->
        <Nip01FeedFilters />
        
        <!-- Relay Selection -->
        <div class="pt-2 border-t border-green-800">
          <h5 class="text-green-400 font-bold text-xs mb-1">RELAYS</h5>
          <RelaySearch 
            bind:selectedRelays={feedRelays}
            bind:exclusiveMode={exclusiveRelayMode}
            on:change={() => updateRelays(feedRelays)}
            on:exclusiveModeChange={handleExclusiveModeChange}
            placeholder="Search or add relay URL..."
            maxHeight="150px"
          />
        </div>
        
        <!-- Feed Settings -->
        <div class="pt-2 border-t border-green-800">
          <h5 class="text-green-400 font-bold text-xs mb-1">FEED SETTINGS</h5>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={$activeFeed?.showPowValues || false}
                onchange={(e) => updateFeedSetting('showPowValues', e.target.checked)}
                class="accent-green-600"
              />
              <span class="text-green-600">Show PoW</span>
            </label>
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={$activeFeed?.showRelativeTime || false}
                onchange={(e) => updateFeedSetting('showRelativeTime', e.target.checked)}
                class="accent-green-600"
              />
              <span class="text-green-600">Relative Time</span>
            </label>
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={$activeFeed?.compactMode || false}
                onchange={(e) => updateFeedSetting('compactMode', e.target.checked)}
                class="accent-green-600"
              />
              <span class="text-green-600">Compact</span>
            </label>
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={$activeFeed?.autoRefresh || false}
                onchange={(e) => updateFeedSetting('autoRefresh', e.target.checked)}
                class="accent-green-600"
              />
              <span class="text-green-600">Auto Refresh</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Events List -->
  <div class="flex-1 overflow-y-auto p-2 space-y-2">
    {#if $sortedAndFilteredEvents.length === 0}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <p class="text-yellow-400 mb-2">No events match current filters</p>
          <p class="text-green-600 text-xs">Try adjusting filters or wait for new events</p>
        </div>
      </div>
    {:else}
      {#each $sortedAndFilteredEvents as event (event.id)}
        <div class="border-l-2 border-green-800 pl-2 {$activeFeed?.compactMode ? 'py-1' : 'py-2'}">
          <!-- Event Header -->
          <div class="flex items-center justify-between text-green-600 mb-1">
            <div class="flex items-center gap-2">
              <span class="text-green-500">{getKindName(event.kind)}</span>
              {#if $activeFeed?.showPowValues && getEventPow(event) > 0}
                <span class="text-green-400 flex items-center gap-1">
                  <span>⛏️</span>
                  <span>{getEventPow(event)}</span>
                </span>
              {/if}
              <span class="text-green-600 font-mono">{formatPubkey(event.pubkey)}</span>
            </div>
            <div class="text-green-600">
              {#if $activeFeed?.showRelativeTime}
                {formatRelativeTime(event.created_at)}
              {:else}
                {new Date(event.created_at * 1000).toLocaleString()}
              {/if}
            </div>
          </div>
          
          <!-- Event Content -->
          <div class="text-green-400">
            {#if event.kind === 0}
              <!-- Profile Event -->
              <div class="text-green-600">Profile Update</div>
              <pre class="text-xs overflow-hidden">{JSON.stringify(JSON.parse(event.content), null, 2).slice(0, 200)}...</pre>
            {:else if event.kind === 7}
              <!-- Reaction Event -->
              <div class="flex items-center gap-2">
                <span class="text-green-600">Reaction:</span>
                <span class="text-green-400">{event.content || '👍'}</span>
                {#if event.tags.find(t => t[0] === 'e')}
                  <span class="text-green-600">to {event.tags.find(t => t[0] === 'e')?.[1]?.slice(0, 8)}...</span>
                {/if}
              </div>
            {:else if event.kind === 6}
              <!-- Repost Event -->
              <div class="text-green-600">Repost of {event.tags.find(t => t[0] === 'e')?.[1]?.slice(0, 8)}...</div>
              {#if event.content}
                <div class="text-green-400 mt-1">{event.content}</div>
              {/if}
            {:else}
              <!-- Regular content -->
              <div class="{$activeFeed?.compactMode ? 'line-clamp-2' : ''}">{event.content}</div>
            {/if}
          </div>
          
          <!-- Event Tags (if not compact) -->
          {#if !$activeFeed?.compactMode && event.tags.length > 0}
            <div class="mt-1 text-green-600 text-xs">
              {#each event.tags.slice(0, 3) as tag}
                <span class="inline-block bg-green-900/20 px-1 rounded mr-1">
                  {tag[0]}: {tag[1]?.slice(0, 8)}...
                </span>
              {/each}
              {#if event.tags.length > 3}
                <span class="text-green-500">+{event.tags.length - 3} more</span>
              {/if}
            </div>
          {/if}
          
          <!-- Reactions -->
          {#if event.kind === 1 || event.kind === 1111}
            <div class="mt-2">
              <Reactions {event} compact={$activeFeed?.compactMode} />
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  
  <!-- Feed Stats -->
  <div class="p-2 border-t border-green-800 bg-green-900/10 text-green-600 text-xs">
    <div class="flex justify-between">
      <span>Events: {$sortedAndFilteredEvents.length}</span>
      <span>Filters: {$activeNip01Filters.length} active</span>
      <span>Sort: {DEFAULT_SORT_OPTIONS.find(s => s.id === $activeFeed?.sortBy)?.name || 'None'}</span>
    </div>
    
    <!-- Debug info when few events -->
    {#if $sortedAndFilteredEvents.length <= 3 && $activeNip01Filters.length > 0}
      <div class="mt-2 p-2 border border-yellow-600 bg-yellow-900/20 rounded text-yellow-400">
        <div class="font-bold mb-1">⚠️ Debug: Few events found</div>
        {#each $activeNip01Filters as filter, i}
          <div class="text-xs font-mono">
            Filter {i + 1}:
            {#if filter.kinds}kinds=[{filter.kinds.join(',')}]{/if}
            {#if filter.authors}
              {#if filter.authors.length === 1}
                author={filter.authors[0].slice(0, 16)}...
              {:else}
                authors=[{filter.authors.length}]
              {/if}
            {/if}
            {#if filter.limit}limit={filter.limit}{/if}
            {#if filter.since}since={new Date(filter.since * 1000).toLocaleString()}{/if}
            {#if filter['#nonce']}nonce={filter['#nonce'].join(',')}{/if}
          </div>
        {/each}
        {#if $activeNip01Filters.some(f => f.authors && f.authors.length > 0)}
          <div class="mt-1 text-yellow-300">
            <strong>Tip:</strong> You have author filters active. Only notes from specific authors will show.
            <button 
              onclick={() => {
                // Clear author filters
                const filtersWithoutAuthors = $activeNip01Filters.map(f => {
                  const {authors, ...rest} = f;
                  return rest;
                });
                nip01FilterStore.setActiveFilters(filtersWithoutAuthors);
              }}
              class="ml-2 px-1 bg-yellow-700 text-yellow-200 rounded hover:bg-yellow-600"
            >
              Clear Author Filters
            </button>
            <button 
              onclick={() => {
                nip01FilterStore.clearActiveFilters();
              }}
              class="ml-2 px-1 bg-red-700 text-red-200 rounded hover:bg-red-600"
            >
              Clear All Filters
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {/if}
</div>


<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>