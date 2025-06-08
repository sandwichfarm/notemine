import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { FeedConfig, FeedFilter, FeedSortOption } from '$lib/types/feeds';
import { DEFAULT_FEED_CONFIG, DEFAULT_SORT_OPTIONS, buildNip01Filter, sortEvents, filterEvents } from '$lib/types/feeds';
import type { NostrEvent } from '$lib/types/nostr';
import { activeNip01Filters } from './nip01-filters';
import { matchesAnyFilter } from '$lib/types/nip01-filters';

const STORAGE_KEY = 'notemine-feed-configs';

function createFeedStore() {
  // Load saved configurations or use defaults
  let initialConfigs: FeedConfig[] = [DEFAULT_FEED_CONFIG];
  
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialConfigs = parsed;
        }
      } catch (error) {
        console.error('Failed to parse feed configurations:', error);
      }
    }
  }
  
  const feedConfigs = writable<FeedConfig[]>(initialConfigs);
  const activeFeedId = writable<string>(initialConfigs[0]?.id || 'default');
  const feedEvents = writable<NostrEvent[]>([]);
  
  // Save to localStorage when configurations change
  feedConfigs.subscribe(configs => {
    if (browser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    }
  });
  
  return {
    // Stores
    feedConfigs,
    activeFeedId,
    feedEvents,
    
    // Derived stores
    activeFeed: derived(
      [feedConfigs, activeFeedId],
      ([configs, activeId]) => configs.find(c => c.id === activeId) || configs[0]
    ),
    
    sortedAndFilteredEvents: derived(
      [feedEvents, feedConfigs, activeFeedId, activeNip01Filters],
      ([events, configs, activeId, nip01Filters]) => {
        const activeFeed = configs.find(c => c.id === activeId);
        if (!activeFeed) return [];
        
        // Apply basic filters first
        let filtered = filterEvents(events, activeFeed.filters);
        
        // Apply NIP-01 filters if any are active
        if (nip01Filters.length > 0) {
          filtered = filtered.filter(event => matchesAnyFilter(event, nip01Filters));
        }
        
        // Apply sorting
        const sortOption = DEFAULT_SORT_OPTIONS.find(s => s.id === activeFeed.sortBy) || DEFAULT_SORT_OPTIONS[0];
        const sorted = sortEvents(filtered, sortOption);
        
        // Apply max events limit
        return sorted.slice(0, activeFeed.maxEvents);
      }
    ),
    
    activeNip01Filters: derived(
      [feedConfigs, activeFeedId],
      ([configs, activeId]) => {
        const activeFeed = configs.find(c => c.id === activeId);
        if (!activeFeed) return [];
        return buildNip01Filter(activeFeed.filters);
      }
    ),
    
    // Subscription info including filters and relays
    activeFeedSubscription: derived(
      [feedConfigs, activeFeedId, activeNip01Filters],
      ([configs, activeId, filters]) => {
        const activeFeed = configs.find(c => c.id === activeId);
        if (!activeFeed) return { feedId: activeId, filters: [], relays: [], timestamp: Date.now() };
        
        console.log('📡 Feed subscription update:', {
          feedId: activeId,
          filterCount: filters.length,
          relayCount: activeFeed.relays?.length || 0,
          relays: activeFeed.relays || [],
          lastRefresh: activeFeed.lastRefresh
        });
        
        return {
          feedId: activeId,
          filters: filters,
          relays: activeFeed.relays || [],
          timestamp: activeFeed.lastRefresh || Date.now() // Include lastRefresh to trigger on manual refresh
        };
      }
    ),
    
    // Actions
    createFeed: (name: string) => {
      const newFeed: FeedConfig = {
        ...DEFAULT_FEED_CONFIG,
        id: `feed_${Date.now()}`,
        name,
        relays: [] // Ensure relays array is initialized
      };
      
      feedConfigs.update(configs => [...configs, newFeed]);
      activeFeedId.set(newFeed.id);
      return newFeed.id;
    },
    
    deleteFeed: (feedId: string) => {
      feedConfigs.update(configs => {
        const filtered = configs.filter(c => c.id !== feedId);
        return filtered.length > 0 ? filtered : [DEFAULT_FEED_CONFIG];
      });
      
      // Switch to first available feed if current was deleted
      activeFeedId.update(currentId => {
        if (currentId === feedId) {
          const configs = browser ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') : [];
          return configs[0]?.id || DEFAULT_FEED_CONFIG.id;
        }
        return currentId;
      });
    },
    
    updateFeed: (feedId: string, updates: Partial<FeedConfig>) => {
      feedConfigs.update(configs =>
        configs.map(config =>
          config.id === feedId ? { ...config, ...updates } : config
        )
      );
    },
    
    updateFilter: (feedId: string, filterId: string, updates: Partial<FeedFilter>) => {
      feedConfigs.update(configs =>
        configs.map(config => {
          if (config.id !== feedId) return config;
          
          return {
            ...config,
            filters: config.filters.map(filter =>
              filter.id === filterId ? { ...filter, ...updates } : filter
            )
          };
        })
      );
    },
    
    addFilter: (feedId: string, filter: FeedFilter) => {
      feedConfigs.update(configs =>
        configs.map(config => {
          if (config.id !== feedId) return config;
          
          return {
            ...config,
            filters: [...config.filters, filter]
          };
        })
      );
    },
    
    removeFilter: (feedId: string, filterId: string) => {
      feedConfigs.update(configs =>
        configs.map(config => {
          if (config.id !== feedId) return config;
          
          return {
            ...config,
            filters: config.filters.filter(f => f.id !== filterId)
          };
        })
      );
    },
    
    setActiveFeed: (feedId: string) => {
      activeFeedId.set(feedId);
    },
    
    setEvents: (events: NostrEvent[]) => {
      feedEvents.set(events);
    },
    
    addEvents: (newEvents: NostrEvent[]) => {
      feedEvents.update(current => {
        const existingIds = new Set(current.map(e => e.id));
        const uniqueNew = newEvents.filter(e => !existingIds.has(e.id));
        return [...current, ...uniqueNew];
      });
    },
    
    reset: () => {
      feedConfigs.set([DEFAULT_FEED_CONFIG]);
      activeFeedId.set(DEFAULT_FEED_CONFIG.id);
      feedEvents.set([]);
    }
  };
}

export const feedStore = createFeedStore();
export { DEFAULT_SORT_OPTIONS };