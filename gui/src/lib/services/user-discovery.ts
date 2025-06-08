import { writable, get } from 'svelte/store';
import { getPowClient } from './pow-client';
import type { NostrEvent } from '$lib/types/nostr';

interface UserProfile {
  pubkey: string;
  profile?: NostrEvent; // kind 0
  relayList?: NostrEvent; // kind 10002
  lastUpdated: number;
}

interface DiscoveryRelayConfig {
  url: string;
  description: string;
  types: string[];
}

// Common discovery relays for user metadata
const DISCOVERY_RELAYS: DiscoveryRelayConfig[] = [
  {
    url: 'wss://relay.damus.io',
    description: 'Damus relay - popular for profiles',
    types: ['profiles', 'relay-lists']
  },
  {
    url: 'wss://relay.nostr.band',
    description: 'Nostr.band relay - good metadata coverage',
    types: ['profiles', 'relay-lists']
  },
  {
    url: 'wss://nos.lol',
    description: 'nos.lol relay - metadata focused',
    types: ['profiles', 'relay-lists']
  },
  {
    url: 'wss://relayable.org',
    description: 'Relayable - metadata discovery',
    types: ['profiles', 'relay-lists']
  },
  {
    url: 'wss://relay.snort.social',
    description: 'Snort relay - user metadata',
    types: ['profiles', 'relay-lists']
  }
];

class UserDiscoveryService {
  private userProfiles = writable<Map<string, UserProfile>>(new Map());
  private activeDiscoveries = new Set<string>();
  private discoveryTimeouts = new Map<string, number>();

  constructor() {
    // Load cached profiles from localStorage
    if (typeof window !== 'undefined') {
      this.loadFromCache();
    }
  }

  private loadFromCache() {
    try {
      const cached = localStorage.getItem('notemine-user-profiles');
      if (cached) {
        const profiles = JSON.parse(cached);
        const profileMap = new Map<string, UserProfile>();
        
        // Only load profiles that are less than 1 hour old
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        for (const [pubkey, profile] of Object.entries(profiles)) {
          const userProfile = profile as UserProfile;
          if (userProfile.lastUpdated > oneHourAgo) {
            profileMap.set(pubkey, userProfile);
          }
        }
        
        this.userProfiles.set(profileMap);
        console.log(`Loaded ${profileMap.size} cached user profiles`);
      }
    } catch (error) {
      console.error('Failed to load user profiles from cache:', error);
    }
  }

  private saveToCache() {
    try {
      const profiles = get(this.userProfiles);
      const serializable = Object.fromEntries(profiles);
      localStorage.setItem('notemine-user-profiles', JSON.stringify(serializable));
    } catch (error) {
      console.error('Failed to save user profiles to cache:', error);
    }
  }

  // Get user profile store
  getUserProfiles() {
    return this.userProfiles;
  }

  // Get specific user profile
  getUserProfile(pubkey: string): UserProfile | null {
    const profiles = get(this.userProfiles);
    return profiles.get(pubkey) || null;
  }

  // Discover user profile and relay list
  async discoverUser(pubkey: string): Promise<UserProfile> {
    console.log(`Starting user discovery for ${pubkey.slice(0, 8)}...`);
    
    // Check if already discovering this user
    if (this.activeDiscoveries.has(pubkey)) {
      console.log(`Already discovering user ${pubkey.slice(0, 8)}, waiting...`);
      return this.waitForDiscovery(pubkey);
    }

    // Check cache first
    const cached = this.getUserProfile(pubkey);
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    if (cached && cached.lastUpdated > fiveMinutesAgo) {
      console.log(`Using cached profile for ${pubkey.slice(0, 8)}`);
      return cached;
    }

    this.activeDiscoveries.add(pubkey);

    try {
      const userProfile: UserProfile = {
        pubkey,
        lastUpdated: Date.now()
      };

      // Discover profile and relay list in parallel
      const [profile, relayList] = await Promise.allSettled([
        this.discoverProfile(pubkey),
        this.discoverRelayList(pubkey)
      ]);

      if (profile.status === 'fulfilled' && profile.value) {
        userProfile.profile = profile.value;
        console.log(`Found profile for ${pubkey.slice(0, 8)}`);
      }

      if (relayList.status === 'fulfilled' && relayList.value) {
        userProfile.relayList = relayList.value;
        console.log(`Found relay list for ${pubkey.slice(0, 8)}`);
      }

      // Update store
      this.userProfiles.update(profiles => {
        profiles.set(pubkey, userProfile);
        return new Map(profiles);
      });

      // Save to cache
      this.saveToCache();

      console.log(`Discovery completed for ${pubkey.slice(0, 8)}: profile=${!!userProfile.profile}, relays=${!!userProfile.relayList}`);
      return userProfile;

    } finally {
      this.activeDiscoveries.delete(pubkey);
    }
  }

  private async waitForDiscovery(pubkey: string): Promise<UserProfile> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.activeDiscoveries.has(pubkey)) {
          clearInterval(checkInterval);
          const profile = this.getUserProfile(pubkey);
          resolve(profile || { pubkey, lastUpdated: Date.now() });
        }
      }, 100);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve({ pubkey, lastUpdated: Date.now() });
      }, 30000);
    });
  }

  // Discover user profile (kind 0)
  private async discoverProfile(pubkey: string): Promise<NostrEvent | null> {
    const relays = DISCOVERY_RELAYS.filter(r => r.types.includes('profiles')).map(r => r.url);
    
    console.log(`Discovering profile for ${pubkey.slice(0, 8)} from ${relays.length} relays...`);
    
    const filter = {
      kinds: [0],
      authors: [pubkey],
      limit: 1
    };

    return this.queryRelays(relays, filter, 'profile');
  }

  // Discover user relay list (kind 10002)
  private async discoverRelayList(pubkey: string): Promise<NostrEvent | null> {
    const relays = DISCOVERY_RELAYS.filter(r => r.types.includes('relay-lists')).map(r => r.url);
    
    console.log(`Discovering relay list for ${pubkey.slice(0, 8)} from ${relays.length} relays...`);
    
    const filter = {
      kinds: [10002],
      authors: [pubkey],
      limit: 1
    };

    return this.queryRelays(relays, filter, 'relay-list');
  }

  // Query relays with timeout
  private async queryRelays(relays: string[], filter: any, type: string): Promise<NostrEvent | null> {
    const powClient = getPowClient();
    
    return new Promise((resolve) => {
      let resolved = false;
      let bestEvent: NostrEvent | null = null;

      const subscription = powClient.pool.req(relays, filter).subscribe({
        next: (response: any) => {
          if (response !== 'EOSE' && response !== 'OK' && 'id' in response) {
            const event = response as NostrEvent;
            
            // Keep the most recent event
            if (!bestEvent || event.created_at > bestEvent.created_at) {
              bestEvent = event;
              console.log(`Found ${type} for ${event.pubkey.slice(0, 8)} (${new Date(event.created_at * 1000).toLocaleString()})`);
            }
          } else if (response === 'EOSE') {
            // End of stored events from this relay
          }
        },
        error: (error: any) => {
          console.error(`Error discovering ${type}:`, error);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          subscription.unsubscribe();
          resolve(bestEvent);
          console.log(`Discovery timeout for ${type} - found: ${!!bestEvent}`);
        }
      }, 10000);
    });
  }

  // Get display name from profile
  getDisplayName(pubkey: string): string {
    const profile = this.getUserProfile(pubkey);
    if (!profile?.profile) {
      return pubkey.slice(0, 8);
    }

    try {
      const metadata = JSON.parse(profile.profile.content);
      return metadata.display_name || metadata.name || pubkey.slice(0, 8);
    } catch {
      return pubkey.slice(0, 8);
    }
  }

  // Get user relays from relay list
  getUserRelays(pubkey: string): string[] {
    const profile = this.getUserProfile(pubkey);
    if (!profile?.relayList) {
      return [];
    }

    try {
      // Parse NIP-65 relay list tags
      const relays: string[] = [];
      for (const tag of profile.relayList.tags) {
        if (tag[0] === 'r' && tag[1]) {
          relays.push(tag[1]);
        }
      }
      return relays;
    } catch {
      return [];
    }
  }

  // Bulk discover users (for chat participants)
  async discoverUsers(pubkeys: string[]): Promise<void> {
    console.log(`Starting bulk discovery for ${pubkeys.length} users...`);
    
    // Batch discover users to avoid overwhelming relays
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < pubkeys.length; i += batchSize) {
      batches.push(pubkeys.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const promises = batch.map(pubkey => this.discoverUser(pubkey));
      await Promise.allSettled(promises);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Bulk discovery completed for ${pubkeys.length} users`);
  }

  // Clear cache
  clearCache() {
    this.userProfiles.set(new Map());
    if (typeof window !== 'undefined') {
      localStorage.removeItem('notemine-user-profiles');
    }
  }

  // Get discovery relay configuration
  getDiscoveryRelays(): DiscoveryRelayConfig[] {
    return DISCOVERY_RELAYS;
  }
}

export const userDiscoveryService = new UserDiscoveryService();
export type { UserProfile, DiscoveryRelayConfig };