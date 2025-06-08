<script lang="ts">
  import { availableFeeds, activeFeedId, activeFeed, feedManager } from '$lib/services/feed-manager';
  import { keyManager } from '$lib/services/keys';
  import { feedStore, DEFAULT_SORT_OPTIONS } from '$lib/stores/feeds';
  import { Plus, RefreshCw, Settings, Edit } from 'lucide-svelte';
  
  // Store subscriptions  
  const { feedConfigs, activeFeed: activeFeedStore, activeFeedId: activeFeedIdStore } = feedStore;
  
  let hasKeys = false;
  let showCreateFeed = false;
  let showFilters = false;
  let newFeedName = '';
  
  // Sync the two feed systems - buttons control the main feed system
  $: if ($activeFeedId) {
    // Find corresponding feedStore config or create one
    const existingConfig = $feedConfigs.find(config => config.id === $activeFeedId);
    if (!existingConfig) {
      // Create a feedStore config for this feed button
      const feed = $availableFeeds.find(f => f.id === $activeFeedId);
      if (feed) {
        feedStore.createFeed(feed.name);
      }
    } else {
      feedStore.setActiveFeed($activeFeedId);
    }
  }
  
  $: hasKeys = keyManager.getPublicKey() !== null;
  $: feedRelays = $activeFeedStore.relays || [];
  
  function updateSortBy(sortBy: string) {
    feedStore.updateFeed($activeFeedIdStore, { sortBy });
  }
  
  function createFeed() {
    if (newFeedName.trim()) {
      // Create feed in both systems - buttons and feedStore
      const feedId = feedStore.createFeed(newFeedName.trim());
      
      // Also add to availableFeeds (feed manager)
      const customFeed = {
        id: feedId,
        type: 'custom',
        name: newFeedName.trim(),
        description: 'Custom filter configuration',
        enabled: true,
        requiresAuth: false
      };
      
      availableFeeds.update(feeds => [...feeds, customFeed]);
      
      // Switch to the new feed
      handleFeedButtonClick(feedId);
      
      newFeedName = '';
      showCreateFeed = false;
    }
  }
  
  function refreshFeed() {
    console.log('🔄 Manual refresh triggered');
    // Force a subscription update by updating timestamp and relays
    feedStore.updateFeed($activeFeedIdStore, { 
      relays: [...feedRelays],
      lastRefresh: Date.now() // Add timestamp to force subscription refresh
    });
    
    // Also trigger a feed filter update to refresh the subscription
    globalThis.dispatchEvent(new CustomEvent('feed-refresh', { 
      detail: { feedId: $activeFeedIdStore } 
    }));
  }
  
  // Dispatch filter toggle event for the parent Feed component
  function toggleFilters() {
    showFilters = !showFilters;
    globalThis.dispatchEvent(new CustomEvent('toggle-feed-filters', { detail: { showFilters } }));
  }
  
  // Handle feed button clicks - this is the key functionality!
  async function handleFeedButtonClick(feedId: string) {
    console.log('🎯 Switching to feed:', feedId);
    try {
      await feedManager.switchFeed(feedId);
      // Also update the feed store for legacy compatibility
      feedStore.setActiveFeed(feedId);
    } catch (error) {
      console.error('Failed to switch feed:', error);
    }
  }
  
  // Handle creating custom feed with filters - same as the + button functionality
  function createCustomFeed() {
    showCreateFeed = true;
  }
  
  function deleteFeed(feedId: string) {
    // Remove from both systems
    availableFeeds.update(feeds => feeds.filter(f => f.id !== feedId));
    feedStore.deleteFeed(feedId);
  }
</script>

<div class="bg-black/50 border border-green-800">
  <!-- Main Feed Selector -->
  <div class="p-2">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-green-400 text-xs font-bold">FEED:</span>
      
      {#each $availableFeeds as feed}
        {#if feed.enabled && (!feed.requiresAuth || hasKeys)}
          <button
            onclick={() => handleFeedButtonClick(feed.id)}
            class="text-xs px-2 py-1 border transition-all
              {$activeFeedId === feed.id 
                ? 'bg-green-900/40 border-green-400 text-green-300' 
                : 'bg-black/50 border-green-800 text-green-600 hover:border-green-600 hover:text-green-400'}"
          >
            {feed.name.toUpperCase()}
            {#if feed.type === 'global'}
              <span class="text-red-500">⚠️</span>
            {/if}
            {#if feed.type === 'custom'}
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  deleteFeed(feed.id);
                }}
                class="ml-1 text-red-400 hover:text-red-300"
                title="Remove custom feed"
              >
                ✕
              </button>
            {/if}
          </button>
        {/if}
      {/each}
      
      <!-- Add Custom Feed Button - same as + button below -->
      <button
        onclick={createCustomFeed}
        class="text-xs px-2 py-1 border border-green-800 text-green-600 hover:border-green-600 hover:text-green-400 bg-black/50 transition-all"
        title="Create custom feed button"
      >
        <Plus class="w-3 h-3" />
      </button>
    </div>
    
    {#if $activeFeed}
      <p class="text-green-600 text-xs mt-1">{$activeFeed.description}</p>
    {/if}
  </div>
  
  <!-- Feed Controls - Only sorting and settings, no dropdown -->
  <div class="flex items-center justify-between px-2 pb-2 border-t border-green-800/50">
    <div class="flex items-center gap-2">
      <button 
        onclick={() => showCreateFeed = !showCreateFeed}
        class="text-green-400 hover:text-green-300 p-1"
        title="Create new feed"
      >
        <Plus class="w-3 h-3" />
      </button>
      
      <button
        onclick={refreshFeed}
        class="text-green-400 hover:text-green-300 p-1"
        title="Refresh feed"
      >
        <RefreshCw class="w-3 h-3" />
      </button>
    </div>
    
    <div class="flex items-center gap-2">
      <select 
        value={$activeFeedStore?.sortBy || 'newest'}
        onchange={(e) => updateSortBy(e.target.value)}
        class="bg-black border border-green-800 text-green-400 text-xs px-1 py-0.5 rounded"
      >
        {#each DEFAULT_SORT_OPTIONS as option}
          <option value={option.id}>{option.name}</option>
        {/each}
      </select>
      
      <button 
        onclick={toggleFilters}
        class="text-green-400 hover:text-green-300 p-1"
        title="Configure filters"
      >
        <Settings class="w-3 h-3" />
      </button>
    </div>
  </div>
  
  <!-- Create Feed Form -->
  {#if showCreateFeed}
    <div class="p-2 border-t border-green-800 bg-green-900/10">
      <div class="flex items-center gap-2">
        <input
          type="text"
          bind:value={newFeedName}
          placeholder="Feed name..."
          class="flex-1 bg-transparent border border-green-800 px-2 py-1 text-green-400 text-xs rounded"
        />
        <button 
          onclick={createFeed}
          class="px-2 py-1 bg-green-900 text-green-400 border border-green-600 hover:bg-green-800 text-xs rounded"
        >
          Create
        </button>
        <button 
          onclick={() => showCreateFeed = false}
          class="px-2 py-1 text-green-600 hover:text-green-400 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}
</div>