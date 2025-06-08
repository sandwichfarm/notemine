import type { NostrEvent, Filter } from '$lib/types/nostr';
import { SimpleRelayPool } from './simple-pool';
import { EventStore } from 'applesauce-core';
import { firstValueFrom } from 'rxjs';

export interface RelayMetadata {
  url: string;
  read: boolean;
  write: boolean;
}

export interface UserRelayList {
  pubkey: string;
  relays: RelayMetadata[];
  updated_at: number;
}

export class InboxOutboxService {
  private pool: SimpleRelayPool;
  private eventStore: EventStore;
  private userRelayLists: Map<string, UserRelayList> = new Map();
  private discoveryRelays = [
    'wss://relay.damus.io',      // Popular relay with good metadata coverage
    'wss://relay.nostr.band',    // Good for discovering user data
    'wss://nos.lol',             // Popular relay
    'wss://relay.snort.social',  // Good metadata coverage
    'wss://relayable.org'        // Specialized in metadata
  ];

  constructor(pool: SimpleRelayPool, eventStore: EventStore) {
    this.pool = pool;
    this.eventStore = eventStore;
  }

  /**
   * Fetch relay list for a user (NIP-65 kind:10002)
   */
  async fetchUserRelayList(pubkey: string): Promise<UserRelayList | null> {
    // Check cache first
    const cached = this.userRelayLists.get(pubkey);
    if (cached && Date.now() - cached.updated_at < 3600000) { // 1 hour cache
      return cached;
    }

    const filter: Filter = {
      kinds: [10002],
      authors: [pubkey],
      limit: 1
    };

    return new Promise((resolve) => {
      let resolved = false;
      
      const resolveOnce = (result: UserRelayList | null) => {
        if (!resolved) {
          resolved = true;
          subscription.unsubscribe();
          resolve(result);
        }
      };
      
      const subscription = this.pool.req(this.discoveryRelays, filter).subscribe({
        next: (response) => {
          if (response !== 'EOSE' && 'id' in response) {
            const relayList = this.parseRelayListEvent(response);
            if (relayList) {
              this.userRelayLists.set(pubkey, relayList);
              resolveOnce(relayList);
            }
          } else if (response === 'EOSE') {
            resolveOnce(cached || null);
          }
        },
        error: (error) => {
          console.error('Failed to fetch relay list:', error);
          resolveOnce(cached || null);
        }
      });
      
      // Add timeout after 10 seconds
      setTimeout(() => {
        console.warn(`fetchUserRelayList timeout for pubkey ${pubkey.slice(0, 8)}`);
        resolveOnce(cached || null);
      }, 10000);
    });
  }

  /**
   * Parse NIP-65 relay list event
   */
  private parseRelayListEvent(event: NostrEvent): UserRelayList | null {
    try {
      const relays: RelayMetadata[] = [];
      
      for (const tag of event.tags) {
        if (tag[0] === 'r' && tag[1]) {
          const url = tag[1];
          const marker = tag[2];
          
          relays.push({
            url,
            read: !marker || marker === 'read',
            write: !marker || marker === 'write'
          });
        }
      }

      return {
        pubkey: event.pubkey,
        relays,
        updated_at: event.created_at * 1000
      };
    } catch (error) {
      console.error('Failed to parse relay list event:', error);
      return null;
    }
  }

  /**
   * Get write relays for a user (where they publish their events)
   */
  async getWriteRelays(pubkey: string): Promise<string[]> {
    const relayList = await this.fetchUserRelayList(pubkey);
    if (!relayList) {
      return this.discoveryRelays; // Fallback to discovery relays
    }
    
    return relayList.relays
      .filter(relay => relay.write)
      .map(relay => relay.url);
  }

  /**
   * Get read relays for a user (where they want to receive events)
   */
  async getReadRelays(pubkey: string): Promise<string[]> {
    const relayList = await this.fetchUserRelayList(pubkey);
    if (!relayList) {
      return this.discoveryRelays; // Fallback to discovery relays
    }
    
    return relayList.relays
      .filter(relay => relay.read)
      .map(relay => relay.url);
  }

  /**
   * Publish event to author's write relays + mentioned users' read relays
   */
  async publishWithInboxOutbox(event: NostrEvent, authorPubkey: string): Promise<void> {
    const writeRelays = await this.getWriteRelays(authorPubkey);
    const mentionedPubkeys = this.extractMentionedPubkeys(event);
    
    // Get read relays for all mentioned users
    const readRelayPromises = mentionedPubkeys.map(pubkey => this.getReadRelays(pubkey));
    const readRelayLists = await Promise.all(readRelayPromises);
    const allReadRelays = readRelayLists.flat();
    
    // Combine and deduplicate relays
    const allRelays = Array.from(new Set([...writeRelays, ...allReadRelays]));
    
    // Publish to all relevant relays using Applesauce
    const publishObservable = this.pool.event(allRelays, event);
    
    // Convert observable to promise and wait for completion
    try {
      await firstValueFrom(publishObservable);
    } catch (error) {
      console.error('Failed to publish event:', error);
    }
  }

  /**
   * Subscribe to events using inbox/outbox model
   */
  async subscribeWithInboxOutbox(filters: Filter[], followedPubkeys: string[]) {
    // Get write relays for all followed users
    const writeRelayPromises = followedPubkeys.map(pubkey => this.getWriteRelays(pubkey));
    const writeRelayLists = await Promise.all(writeRelayPromises);
    const allWriteRelays = writeRelayLists.flat();
    
    // Deduplicate relays
    const uniqueRelays = Array.from(new Set(allWriteRelays));
    
    // Subscribe using Applesauce relay pool
    filters.forEach(filter => {
      this.pool.req(uniqueRelays, filter).subscribe({
        next: (response) => {
          if (response !== 'EOSE' && 'id' in response) {
            // Only add events with nonce tags (PoW events)
            const hasNonce = response.tags.some(tag => tag[0] === 'nonce');
            if (hasNonce) {
              this.eventStore.add(response);
            }
          } else if (response === 'EOSE') {
            console.log('Inbox/Outbox subscription complete');
          }
        },
        error: (error) => {
          console.error('Subscription error:', error);
        }
      });
    });
  }

  /**
   * Extract mentioned pubkeys from event
   */
  private extractMentionedPubkeys(event: NostrEvent): string[] {
    const pubkeys: string[] = [];
    
    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) {
        pubkeys.push(tag[1]);
      }
    }
    
    return pubkeys;
  }

  /**
   * Create relay list event (NIP-65 kind:10002)
   */
  createRelayListEvent(relays: RelayMetadata[]): Omit<NostrEvent, 'id' | 'sig'> {
    const tags = relays.map(relay => {
      const tag = ['r', relay.url];
      
      // Add read/write markers if not both
      if (relay.read && !relay.write) {
        tag.push('read');
      } else if (relay.write && !relay.read) {
        tag.push('write');
      }
      // If both read and write, no marker needed
      
      return tag;
    });

    return {
      kind: 10002,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
      pubkey: '' // Will be set by caller
    };
  }

  /**
   * Clear cached relay lists
   */
  clearCache(): void {
    this.userRelayLists.clear();
  }
}

// Export singleton instance (will be initialized by pow-client)
export let inboxOutbox: InboxOutboxService;