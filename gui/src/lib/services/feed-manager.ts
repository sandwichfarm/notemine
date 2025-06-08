import { writable, derived, get } from 'svelte/store';
import type { FeedConfig, FeedType, FollowPack, GlobalFeedWarning } from '$lib/types/feed-types';
import { GLOBAL_FEED_WARNINGS } from '$lib/types/feed-types';
import { DEFAULT_FOLLOW_PACKS, FOLLOW_PACK_RELAYS } from '$lib/data/default-follow-packs';
import { getPowClient } from '$lib/services/pow-client';
import { keyManager } from '$lib/services/keys';
import { userDiscoveryService } from '$lib/services/user-discovery';
import type { NostrEvent } from '$lib/types/nostr';
import { SimplePool } from 'nostr-tools/pool';

// Store for available feeds
export const availableFeeds = writable<FeedConfig[]>([]);
export const activeFeedId = writable<string>('curated');
export const followPacks = writable<Map<string, FollowPack>>(new Map());
export const selectedFollowPacks = writable<Set<string>>(new Set());
export const globalFeedWarningState = writable<{
  isWarning: boolean;
  clicksRemaining: number;
  currentWarning: GlobalFeedWarning | null;
}>({
  isWarning: false,
  clicksRemaining: 0,
  currentWarning: null
});

// Derived store for the active feed
export const activeFeed = derived(
  [availableFeeds, activeFeedId],
  ([$feeds, $id]) => $feeds.find(f => f.id === $id)
);

class FeedManagerService {
  private pool = new SimplePool();
  private inboxOutbox: any; // Will be initialized lazily
  
  constructor() {
    this.initializeFeeds();
    this.loadFollowPacks();
  }

  private initializeFeeds() {
    const feeds: FeedConfig[] = [
      {
        id: 'curated',
        type: 'curated',
        name: 'Curated',
        description: 'Interesting content from curated follow packs',
        enabled: true,
        requiresAuth: false
      },
      {
        id: 'web',
        type: 'web',
        name: 'Web',
        description: 'Notes from people you follow',
        enabled: true,
        requiresAuth: true
      },
      {
        id: 'follow-packs',
        type: 'follow-packs',
        name: 'Follow Packs',
        description: 'Browse and select community-curated lists',
        enabled: true,
        requiresAuth: false
      },
      {
        id: 'global',
        type: 'global',
        name: 'Global',
        description: 'The unfiltered firehose. Proceed with caution.',
        enabled: true,
        requiresAuth: false,
        warningLevel: 5
      }
    ];
    
    availableFeeds.set(feeds);
  }

  /**
   * Load follow packs (kind 39089 events)
   */
  async loadFollowPacks() {
    try {
      // Load default follow packs first
      const defaultPackIds = DEFAULT_FOLLOW_PACKS.map(p => p.id);
      
      // Use default relays for follow pack discovery
      const relays = FOLLOW_PACK_RELAYS;
      
      // Subscribe to specific default packs
      const sub = this.pool.subscribeMany(
        relays,
        [{ kinds: [39089], ids: defaultPackIds }],
        {
          onevent: (event: NostrEvent) => {
            this.parseFollowPack(event);
          }
        }
      );

      // Also search for more follow packs
      const discoverSub = this.pool.subscribeMany(
        relays,
        [{ kinds: [39089], limit: 50 }],
        {
          onevent: (event: NostrEvent) => {
            this.parseFollowPack(event);
          }
        }
      );

      // Clean up after initial load
      setTimeout(() => {
        discoverSub.close();
      }, 5000);

    } catch (error) {
      console.error('Failed to load follow packs:', error);
    }
  }

  private parseFollowPack(event: NostrEvent) {
    const pack: FollowPack = {
      id: event.id,
      pubkey: event.pubkey,
      title: '',
      pubkeys: [],
      created_at: event.created_at
    };

    // Parse tags
    for (const tag of event.tags) {
      switch (tag[0]) {
        case 'title':
          pack.title = tag[1];
          break;
        case 'description':
          pack.description = tag[1];
          break;
        case 'image':
          pack.image = tag[1];
          break;
        case 'p':
          pack.pubkeys.push(tag[1]);
          break;
        case 'relay':
        case 'relays':
          if (!pack.relays) pack.relays = [];
          pack.relays.push(...tag.slice(1));
          break;
      }
    }

    followPacks.update(packs => {
      packs.set(event.id, pack);
      return packs;
    });
  }

  /**
   * Switch to a different feed
   */
  async switchFeed(feedId: string) {
    const feeds = get(availableFeeds);
    const feed = feeds.find(f => f.id === feedId);
    
    if (!feed) {
      console.error('Feed not found:', feedId);
      return;
    }

    // Check if feed requires auth
    if (feed.requiresAuth && !keyManager.getPublicKey()) {
      console.warn('Feed requires authentication');
      return;
    }

    // Handle global feed warning
    if (feed.type === 'global') {
      this.initiateGlobalFeedWarning();
      return;
    }

    activeFeedId.set(feedId);
  }

  /**
   * Initiate the global feed warning sequence
   */
  private initiateGlobalFeedWarning() {
    // Random number of clicks (1-5)
    const clicks = Math.floor(Math.random() * 5) + 1;
    
    // Random warning message
    const warning = GLOBAL_FEED_WARNINGS[Math.floor(Math.random() * GLOBAL_FEED_WARNINGS.length)];
    
    globalFeedWarningState.set({
      isWarning: true,
      clicksRemaining: clicks,
      currentWarning: warning
    });
  }

  /**
   * Handle global feed warning click
   */
  handleGlobalWarningClick() {
    globalFeedWarningState.update(state => {
      if (state.clicksRemaining > 1) {
        // Get a new random warning
        const newWarning = GLOBAL_FEED_WARNINGS[Math.floor(Math.random() * GLOBAL_FEED_WARNINGS.length)];
        return {
          ...state,
          clicksRemaining: state.clicksRemaining - 1,
          currentWarning: newWarning
        };
      } else {
        // Final click - activate global feed
        activeFeedId.set('global');
        return {
          isWarning: false,
          clicksRemaining: 0,
          currentWarning: null
        };
      }
    });
  }

  /**
   * Cancel global feed warning
   */
  cancelGlobalWarning() {
    globalFeedWarningState.set({
      isWarning: false,
      clicksRemaining: 0,
      currentWarning: null
    });
  }

  /**
   * Get filter for current feed
   */
  async getFeedFilter() {
    const feed = get(activeFeed);
    if (!feed) return null;

    switch (feed.type) {
      case 'curated':
        return this.getCuratedFilter();
      
      case 'web':
        return this.getWebFilter();
      
      case 'follow-packs':
        return this.getFollowPacksFilter();
      
      case 'global':
        return this.getGlobalFilter();
      
      case 'custom':
        return {
          kinds: [1, 1111],
          '#nonce': ['*'],
          limit: 100
        };
      
      default:
        return null;
    }
  }

  private async getCuratedFilter() {
    const hasFollows = await this.userHasFollows();
    
    if (!hasFollows) {
      // Use default follow packs for anonymous/new users
      const packs = get(followPacks);
      const defaultPackIds = DEFAULT_FOLLOW_PACKS.map(p => p.id);
      
      // Combine pubkeys from all default packs
      const allPubkeys = new Set<string>();
      for (const packId of defaultPackIds) {
        const pack = packs.get(packId);
        if (pack) {
          pack.pubkeys.forEach(p => allPubkeys.add(p));
        }
      }
      
      if (allPubkeys.size > 0) {
        // Also trigger inbox/outbox discovery for these users
        this.discoverUserRelays(Array.from(allPubkeys));
        
        return {
          kinds: [1, 1111],
          authors: Array.from(allPubkeys).slice(0, 100), // Limit to 100 authors
          '#nonce': ['*'] // Only PoW notes
        };
      }
    }
    
    // Otherwise use web filter
    return this.getWebFilter();
  }

  private async getWebFilter() {
    const pubkey = keyManager.getPublicKey();
    if (!pubkey) return null;

    // Get user's follow list
    const followList = await this.getUserFollows(pubkey);
    if (followList.length === 0) {
      // Fallback to curated
      return this.getCuratedFilter();
    }

    return {
      kinds: [1, 1111],
      authors: followList,
      '#nonce': ['*'] // Only PoW notes
    };
  }

  private async getFollowPacksFilter() {
    const selected = get(selectedFollowPacks);
    const packs = get(followPacks);
    
    if (selected.size === 0) {
      // No packs selected - return null to show pack selector
      return null;
    }

    // Combine all selected pack pubkeys
    const allPubkeys = new Set<string>();
    for (const packId of selected) {
      const pack = packs.get(packId);
      if (pack) {
        pack.pubkeys.forEach(p => allPubkeys.add(p));
      }
    }

    return {
      kinds: [1, 1111],
      authors: Array.from(allPubkeys).slice(0, 100), // Limit to 100 authors
      '#nonce': ['*'] // Only PoW notes
    };
  }

  private getGlobalFilter() {
    // Global feed - minimal filtering
    return {
      kinds: [1, 1111],
      '#nonce': ['*'], // Still require PoW
      limit: 100
    };
  }

  /**
   * Check if user has a follow list
   */
  private async userHasFollows(): Promise<boolean> {
    const pubkey = keyManager.getPublicKey();
    if (!pubkey) return false;

    const follows = await this.getUserFollows(pubkey);
    return follows.length > 0;
  }

  /**
   * Get user's follow list from kind 3 event
   */
  private async getUserFollows(pubkey: string): Promise<string[]> {
    return new Promise(async (resolve) => {
      // Get user's relays for finding their follow list
      const relays = await this.getInboxOutbox().getReadRelaysFor(pubkey);
      const allRelays = relays.length > 0 ? relays : FOLLOW_PACK_RELAYS;
      
      let found = false;
      const sub = this.pool.subscribeMany(
        allRelays,
        [{ kinds: [3], authors: [pubkey], limit: 1 }],
        {
          onevent: (event: NostrEvent) => {
            found = true;
            const follows = event.tags
              .filter(tag => tag[0] === 'p')
              .map(tag => tag[1]);
            sub.close();
            resolve(follows);
          }
        }
      );

      // Timeout after 3 seconds
      setTimeout(() => {
        if (!found) {
          sub.close();
          resolve([]);
        }
      }, 3000);
    });
  }

  /**
   * Toggle follow pack selection
   */
  toggleFollowPack(packId: string) {
    selectedFollowPacks.update(selected => {
      if (selected.has(packId)) {
        selected.delete(packId);
      } else {
        selected.add(packId);
      }
      return selected;
    });
  }

  /**
   * Get relay hints for selected follow packs
   */
  getFollowPackRelays(): string[] {
    const selected = get(selectedFollowPacks);
    const packs = get(followPacks);
    const relaySet = new Set<string>();

    for (const packId of selected) {
      const pack = packs.get(packId);
      if (pack?.relays) {
        pack.relays.forEach(r => relaySet.add(r));
      }
    }

    return Array.from(relaySet);
  }
  
  /**
   * Get inbox/outbox service (lazy initialization)
   */
  private getInboxOutbox() {
    if (!this.inboxOutbox) {
      try {
        const powClient = getPowClient();
        this.inboxOutbox = powClient.getInboxOutboxService();
      } catch (error) {
        console.error('Failed to get inbox/outbox service:', error);
        // Return a dummy service that returns empty arrays
        return {
          getReadRelaysFor: async () => [],
          getWriteRelaysFor: async () => []
        };
      }
    }
    return this.inboxOutbox;
  }
  
  /**
   * Discover relays for a list of pubkeys using inbox/outbox model
   */
  private async discoverUserRelays(pubkeys: string[]) {
    // Use inbox/outbox service to find where these users write
    const inbox = this.getInboxOutbox();
    for (const pubkey of pubkeys.slice(0, 20)) { // Limit to prevent overload
      try {
        const relays = await inbox.getWriteRelaysFor(pubkey);
        console.log(`Found ${relays.length} write relays for ${pubkey.slice(0, 8)}...`);
      } catch (error) {
        console.error('Failed to discover relays for user:', error);
      }
    }
  }
}

// Export singleton instance
export const feedManager = new FeedManagerService();