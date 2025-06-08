import { SimpleRelayPool } from './simple-pool';
import type { NostrEvent, Filter } from '$lib/types/nostr';
import { writable, derived } from 'svelte/store';

export interface RelayInfo {
  url: string;
  name?: string;
  description?: string;
  supportedNips?: number[];
  software?: string;
  version?: string;
  limitation?: {
    payment_required?: boolean;
    auth_required?: boolean;
    restricted_writes?: boolean;
  };
  fees?: {
    admission?: { amount: number; unit: string }[];
    subscription?: { amount: number; unit: string; period: number }[];
    publication?: { kinds: number[]; amount: number; unit: string }[];
  };
  tags?: string[];
}

export interface DiscoveredRelay {
  url: string;
  info?: RelayInfo;
  lastSeen: number;
  supportsPow: boolean;
}

export class RelayDiscoveryService {
  private pool: SimpleRelayPool;
  
  // NIP-66 discovery relays
  private discoveryRelays = [
    'wss://relaypag.es',
    'wss://relay.nostr.watch',
    'wss://monitorlizard.nostr1.com'
  ];
  
  // Stores
  public discoveredRelays = writable<Map<string, DiscoveredRelay>>(new Map());
  public powRelays = derived(this.discoveredRelays, $relays => 
    Array.from($relays.values()).filter(r => r.supportsPow)
  );
  public isDiscovering = writable(false);
  
  constructor(pool: SimpleRelayPool) {
    this.pool = pool;
  }
  
  /**
   * Discover PoW-compatible relays using NIP-66
   */
  async discoverPowRelays(): Promise<void> {
    console.log('Starting relay discovery...');
    this.isDiscovering.set(true);
    
    try {
      // Query for NIP-66 relay events with #R pow tag
      const filter: Filter = {
        kinds: [30166],
        '#R': ['pow'],
        limit: 1000,
        since: Math.floor(Date.now() / 1000) - ( 7 * 24 * 60 * 60 )
      };
      
      console.log('Discovery filter:', filter);
      console.log('Discovery relays:', this.discoveryRelays);
      
      const discoveredRelaysMap = new Map<string, DiscoveredRelay>();
      
      await new Promise<void>((resolve) => {
        console.log('🔍 Starting NIP-66 discovery on relays:', this.discoveryRelays);
        console.log('🔍 Discovery filter:', filter);
        
        const subscription = this.pool.req(this.discoveryRelays, filter).subscribe({
          next: (response) => {
            if (response !== 'EOSE' && 'id' in response) {
              console.log('📥 Received NIP-66 relay event:', response.id.substring(0, 8));
              const relay = this.parseRelayEvent(response);
              if (relay) {
                console.log('✅ Discovered PoW relay:', relay.url);
                discoveredRelaysMap.set(relay.url, relay);
              } else {
                console.log('❌ Event failed PoW relay parsing');
              }
            } else if (response === 'EOSE') {
              console.log('🏁 NIP-66 discovery EOSE - found', discoveredRelaysMap.size, 'PoW relays');
              subscription.unsubscribe();
              resolve();
            }
          },
          error: (error) => {
            console.error('❌ NIP-66 discovery error:', error);
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
      
      // Update store
      this.discoveredRelays.set(discoveredRelaysMap);
      
      
      // Skip fetching relay info via HTTP to avoid CORS issues
      // Relay info can be obtained through other means if needed
      
    } finally {
      this.isDiscovering.set(false);
    }
  }
  
  /**
   * Parse NIP-66 relay event
   */
  private parseRelayEvent(event: NostrEvent): DiscoveredRelay | null {
    try {
      // Get relay URL from 'd' tag
      const dTag = event.tags.find(tag => tag[0] === 'd');
      if (!dTag || !dTag[1]) return null;
      
      const url = dTag[1];
      
      const hasPow = event.tags.some(tag => 
        (tag[0] === 'R' && tag[1] === 'pow')
        &&
        (tag[2] !== '' && !isNaN(parseInt(tag[2], 10)) && parseInt(tag[2], 10) > 0)
      );
      
      if (!hasPow) return null;
      
      // Parse relay info from content if available
      let info: RelayInfo | undefined;
      if (event.content) {
        try {
          const parsed = JSON.parse(event.content);
          info = {
            url,
            ...parsed
          };
        } catch (e) {
          // Content is not valid JSON
        }
      }
      
      return {
        url,
        info,
        lastSeen: event.created_at * 1000,
        supportsPow: true
      };
    } catch (error) {
      console.error('Failed to parse relay event:', error);
      return null;
    }
  }
  
  /**
   * Get relay info through WebSocket connection (future implementation)
   * For now, we skip HTTP-based NIP-11 info to avoid CORS issues
   */
  private async getRelayInfo(relayUrl: string): Promise<RelayInfo | null> {
    // TODO: Implement WebSocket-based relay info retrieval
    // This would connect to the relay and request info through the WebSocket
    return null;
  }
  
  
  /**
   * Get best PoW relays based on various criteria
   */
  getBestPowRelays(limit: number = 5): DiscoveredRelay[] {
    let relays: DiscoveredRelay[] = [];
    
    this.powRelays.subscribe(value => {
      relays = value;
    })();
    
    // Sort by various criteria
    return relays
      .sort((a, b) => {
        // Prefer relays with more info
        const aScore = (a.info ? 1 : 0) + (a.info?.supportedNips?.includes(13) ? 1 : 0);
        const bScore = (b.info ? 1 : 0) + (b.info?.supportedNips?.includes(13) ? 1 : 0);
        
        if (aScore !== bScore) return bScore - aScore;
        
        // Then by last seen
        return b.lastSeen - a.lastSeen;
      })
      .slice(0, limit);
  }
  
  /**
   * Initialize with default PoW relays
   */
  async initialize(): Promise<void> {
    // Start with some known PoW relays
    const defaultPowRelays = [
      'ws://localhost:7777' // Local nak ephemeral relay for development
    ];
    
    const relaysMap = new Map<string, DiscoveredRelay>();
    
    for (const url of defaultPowRelays) {
      relaysMap.set(url, {
        url,
        lastSeen: Date.now(),
        supportsPow: true
      });
    }
    
    this.discoveredRelays.set(relaysMap);
  }
  
  /**
   * Start discovery process (initialization + continuous discovery)
   */
  async startDiscovery(): Promise<void> {
    await this.initialize();
    await this.discoverPowRelays();
    this.startContinuousDiscovery();
  }
  
  /**
   * Subscribe to relay events for continuous discovery
   */
  startContinuousDiscovery(): void {
    const filter: Filter = {
      kinds: [30166],
      '#R': ['pow'],
      since: Math.floor(Date.now() / 1000)
    };
    
    this.pool.req(this.discoveryRelays, filter).subscribe({
      next: (response) => {
        if (response !== 'EOSE' && 'id' in response) {
          const relay = this.parseRelayEvent(response);
          if (relay) {
            this.discoveredRelays.update(relays => {
              relays.set(relay.url, relay);
              return relays;
            });
          }
        }
      }
    });
  }
}

export const relayDiscovery = new RelayDiscoveryService(new SimpleRelayPool());