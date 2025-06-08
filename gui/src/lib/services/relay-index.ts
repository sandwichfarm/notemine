import { writable, derived, get } from 'svelte/store';
import { relayDiscovery } from './relay-discovery';
import { db } from './database';
import type { RelayMetadata } from '../types/nostr';

export interface RelayInfo {
  url: string;
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  limitation?: {
    payment_required?: boolean;
    auth_required?: boolean;
  };
  pow?: {
    enabled: boolean;
    minPow?: number;
    minPowKinds?: Record<number, number>;
  };
  lastSeen?: number;
  status?: 'active' | 'inactive' | 'error';
  performance?: {
    latency?: number;
    uptime?: number;
  };
}

// Popular/known relays with metadata
const KNOWN_RELAYS: RelayInfo[] = [
  {
    url: 'wss://relay.damus.io',
    name: 'Damus',
    description: 'Popular iOS Nostr client relay',
    pow: { enabled: false }
  },
  {
    url: 'wss://relay.snort.social',
    name: 'Snort',
    description: 'Snort.social relay',
    pow: { enabled: false }
  },
  {
    url: 'wss://nos.lol',
    name: 'nos.lol',
    description: 'General purpose relay',
    pow: { enabled: false }
  },
  {
    url: 'wss://relay.primal.net',
    name: 'Primal',
    description: 'Primal client relay with caching',
    pow: { enabled: false }
  },
  {
    url: 'wss://relay.nostr.band',
    name: 'nostr.band',
    description: 'Search and trending relay',
    pow: { enabled: false }
  },
  {
    url: 'ws://localhost:7777',
    name: 'Local Dev Relay',
    description: 'Local development relay',
    pow: { enabled: true, minPow: 16 }
  }
];

class RelayIndexService {
  private relaysStore = writable<Map<string, RelayInfo>>(new Map());
  private discoveryPool: any = null;
  private isDiscovering = false;
  
  // Public readable store
  public relays = derived(this.relaysStore, $relays => Array.from($relays.values()));
  
  // Search functionality
  public searchRelays = (query: string) => {
    const relays = get(this.relays);
    const searchTerm = query.toLowerCase();
    
    if (!searchTerm) return relays;
    
    return relays.filter(relay => {
      return (
        relay.url.toLowerCase().includes(searchTerm) ||
        relay.name?.toLowerCase().includes(searchTerm) ||
        relay.description?.toLowerCase().includes(searchTerm) ||
        (relay.pow?.enabled && 'pow'.includes(searchTerm))
      );
    });
  };
  
  constructor() {
    // Initialize with known relays
    const relayMap = new Map<string, RelayInfo>();
    KNOWN_RELAYS.forEach(relay => {
      relayMap.set(relay.url, relay);
    });
    this.relaysStore.set(relayMap);
  }
  
  async initialize() {
    // Load discovered relays from database
    try {
      const dbRelays = await db.relays.toArray();
      const currentRelays = get(this.relaysStore);
      
      dbRelays.forEach(dbRelay => {
        const existing = currentRelays.get(dbRelay.url);
        const relayInfo: RelayInfo = {
          url: dbRelay.url,
          pow: {
            enabled: dbRelay.powSupported || false,
            minPow: dbRelay.minPow,
            minPowKinds: dbRelay.minPowKinds
          },
          lastSeen: dbRelay.lastSeen,
          status: dbRelay.active ? 'active' : dbRelay.error ? 'error' : 'inactive',
          ...existing // Preserve known relay metadata
        };
        currentRelays.set(dbRelay.url, relayInfo);
      });
      
      this.relaysStore.set(currentRelays);
    } catch (error) {
      console.error('Failed to load relays from database:', error);
    }
    
    // Subscribe to relay discovery updates
    relayDiscovery.discoveredRelays.subscribe(discovered => {
      const currentRelays = get(this.relaysStore);
      
      discovered.forEach(relay => {
        const existing = currentRelays.get(relay.url);
        const relayInfo: RelayInfo = {
          ...existing,
          url: relay.url,
          pow: {
            enabled: relay.powSupported || false,
            minPow: relay.minPow,
            minPowKinds: relay.minPowKinds
          },
          lastSeen: relay.lastSeen,
          status: relay.active ? 'active' : relay.error ? 'error' : 'inactive'
        };
        currentRelays.set(relay.url, relayInfo);
      });
      
      this.relaysStore.set(currentRelays);
    });
  }
  
  // Add a custom relay
  async addRelay(url: string, metadata?: Partial<RelayInfo>) {
    const currentRelays = get(this.relaysStore);
    
    // Normalize URL
    const normalizedUrl = url.trim().replace(/\/$/, '');
    
    const relayInfo: RelayInfo = {
      url: normalizedUrl,
      status: 'inactive',
      pow: { enabled: false },
      ...metadata
    };
    
    currentRelays.set(normalizedUrl, relayInfo);
    this.relaysStore.set(currentRelays);
    
    // Save to database
    try {
      await db.relays.put({
        url: normalizedUrl,
        lastSeen: Date.now(),
        active: false,
        powSupported: relayInfo.pow?.enabled || false,
        minPow: relayInfo.pow?.minPow,
        minPowKinds: relayInfo.pow?.minPowKinds
      });
    } catch (error) {
      console.error('Failed to save relay to database:', error);
    }
  }
  
  // Get relay info by URL
  getRelay(url: string): RelayInfo | undefined {
    return get(this.relaysStore).get(url);
  }
  
  // Get only PoW-enabled relays
  getPowRelays(): RelayInfo[] {
    return get(this.relays).filter(relay => relay.pow?.enabled);
  }
  
  // Get active relays
  getActiveRelays(): RelayInfo[] {
    return get(this.relays).filter(relay => relay.status === 'active');
  }
  
  // Discover relays without auth requirements using NIP-66
  async discoverNoAuthRelays() {
    if (this.isDiscovering) return;
    
    console.log('🔍 Starting relay discovery for non-auth relays...');
    this.isDiscovering = true;
    
    try {
      // Import SimpleRelayPool dynamically to avoid circular dependencies
      const { SimpleRelayPool } = await import('./simple-pool');
      this.discoveryPool = new SimpleRelayPool();
      
      // NIP-66 discovery relays
      const discoveryRelays = [
        'wss://relaypag.es',
        'wss://relay.nostr.watch',
        'wss://monitorlizard.nostr1.com'
      ];
      
      // Query for NIP-66 relay events with #R !auth tag (no auth required)
      const filter = {
        kinds: [30166],
        '#R': ['!auth'],
        limit: 1000,
        since: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60) // Last 7 days
      };
      
      console.log('📡 Discovery filter:', filter);
      
      await new Promise<void>((resolve) => {
        const subscription = this.discoveryPool.req(discoveryRelays, filter).subscribe({
          next: (response: any) => {
            if (response !== 'EOSE' && 'id' in response) {
              const relay = this.parseNip66Event(response);
              if (relay) {
                console.log('✅ Discovered non-auth relay:', relay.url);
                const currentRelays = get(this.relaysStore);
                currentRelays.set(relay.url, relay);
                this.relaysStore.set(currentRelays);
              }
            } else if (response === 'EOSE') {
              console.log('🏁 Discovery complete');
              subscription.unsubscribe();
              resolve();
            }
          },
          error: (error: any) => {
            console.error('❌ Discovery error:', error);
            subscription.unsubscribe();
            resolve();
          }
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          subscription.unsubscribe();
          resolve();
        }, 10000);
      });
      
    } catch (error) {
      console.error('Failed to discover relays:', error);
    } finally {
      this.isDiscovering = false;
      if (this.discoveryPool) {
        this.discoveryPool.destroy();
        this.discoveryPool = null;
      }
    }
  }
  
  // Parse NIP-66 relay event
  private parseNip66Event(event: any): RelayInfo | null {
    try {
      // Extract relay URL from d tag
      const dTag = event.tags.find((t: string[]) => t[0] === 'd');
      if (!dTag || !dTag[1]) return null;
      
      const url = dTag[1];
      
      // Parse content JSON for metadata
      let metadata: any = {};
      try {
        metadata = JSON.parse(event.content);
      } catch {
        // Content might be empty or invalid
      }
      
      // Check for auth requirement in R tags
      const rTags = event.tags.filter((t: string[]) => t[0] === 'R');
      const hasAuth = rTags.some((t: string[]) => t[1] === 'auth');
      const hasPow = rTags.some((t: string[]) => t[1] === 'pow');
      
      return {
        url,
        name: metadata.name,
        description: metadata.description,
        limitation: {
          auth_required: hasAuth,
          payment_required: metadata.limitation?.payment_required
        },
        pow: {
          enabled: hasPow,
          minPow: metadata.limitation?.min_pow_difficulty
        },
        supported_nips: metadata.supported_nips,
        software: metadata.software,
        version: metadata.version,
        lastSeen: event.created_at * 1000,
        status: 'inactive'
      };
    } catch (error) {
      console.error('Failed to parse NIP-66 event:', error);
      return null;
    }
  }
}

export const relayIndex = new RelayIndexService();