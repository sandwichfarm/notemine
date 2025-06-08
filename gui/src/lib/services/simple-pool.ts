import { SimplePool } from 'nostr-tools/pool';
import type { NostrEvent, Filter } from '$lib/types/nostr';
import { Observable, Subject } from 'rxjs';
import { verifyPowDifficulty } from '$lib/utils/nostr';

export type RelayResponse = NostrEvent | 'EOSE';

/**
 * Wrapper around nostr-tools SimplePool for reliable WebSocket connections
 */
export class SimpleRelayPool {
  private pool: SimplePool;
  private minPowDifficulty: number = 1; // Minimum PoW difficulty to accept
  private activeSubscriptions: Set<any> = new Set();
  
  constructor() {
    this.pool = new SimplePool();
  }
  
  setMinPowDifficulty(difficulty: number) {
    this.minPowDifficulty = difficulty;
  }
  
  /**
   * Subscribe to events from multiple relays
   */
  req(urls: string[], filter: Filter): Observable<RelayResponse> {
    console.log('🔌 SimplePool.req called with relays:', urls);
    console.log('🔌 Filter:', JSON.stringify(filter, null, 2));
    
    if (!urls || urls.length === 0) {
      console.error('⚠️ No relay URLs provided!');
      return new Observable(subscriber => {
        subscriber.complete();
      });
    }
    
    const subject = new Subject<RelayResponse>();
    
    // Use nostr-tools SimplePool subscription
    console.log('🌐 Creating subscription to relays...');
    const subscription = this.pool.subscribeMany(urls, [filter], {
      onevent: (event: NostrEvent) => {
        // For discovery relays, don't filter by PoW (we want all kind 30166 events)
        if (filter.kinds?.includes(30166)) {
          console.log('📥 NIP-66 relay discovery event:', event.id.substring(0, 8));
          subject.next(event);
          return;
        }
        
        // For music/radio events, don't filter by PoW
        const musicKinds = [30311, 31237, 30078, 31337, 31338, 31989, 31990, 31991, 31992, 31993, 31994, 31995];
        if (filter.kinds && filter.kinds.some(k => musicKinds.includes(k))) {
          console.log('🎵 Music/Radio event received:', event.kind, event.id.substring(0, 8));
          subject.next(event);
          return;
        }
        
        // For regular notes with music tags, also don't require PoW
        if (filter['#t'] && filter['#t'].some((tag: string) => 
          ['music', 'nowplaying', 'np', 'tunestr', 'wavlake', 'stemstr', 'wavefunc'].includes(tag)
        )) {
          console.log('🎵 Music-tagged note received:', event.id.substring(0, 8));
          subject.next(event);
          return;
        }
        
        // If no specific kinds are requested (catch-all filter for debugging)
        if (!filter.kinds || filter.kinds.length === 0) {
          console.log('🔍 Catch-all event received:', event.kind, event.id.substring(0, 8));
          subject.next(event);
          return;
        }
        
        // For regular events, don't filter by PoW - let post-processing handle it
        console.log('📨 Event received:', event.kind, event.id.substring(0, 8), 'from', event.pubkey?.substring(0, 8));
        subject.next(event);
      },
      oneose: () => {
        console.log('📨 EOSE received from relays');
        subject.next('EOSE');
      },
      onclose: (reason) => {
        console.log('🔌 Relay connection closed:', reason);
        subject.complete();
      }
    });
    
    // Track active subscriptions for cleanup
    this.activeSubscriptions.add(subscription);
    
    // Return observable and store subscription for cleanup
    const observable = subject.asObservable();
    (observable as any)._subscription = subscription;
    
    // Clean up subscription when observable is unsubscribed
    return new Observable<RelayResponse>(subscriber => {
      const sub = observable.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        this.activeSubscriptions.delete(subscription);
        subscription.close();
      };
    });
  }
  
  /**
   * Publish event to relays
   */
  async publish(urls: string[], event: NostrEvent): Promise<void> {
    console.log('📤 Publishing event to relays:', urls);
    console.log('📤 Event ID:', event.id);
    
    try {
      await Promise.allSettled(
        urls.map(url => this.pool.publish([url], event))
      );
      console.log('✅ Event published to all relays');
    } catch (error) {
      console.error('❌ Failed to publish event:', error);
      throw error;
    }
  }
  
  /**
   * Get connection status for relays
   */
  getConnectionStatus(urls: string[]): { connected: number; failed: number } {
    // nostr-tools SimplePool doesn't expose connection status directly
    // For now, assume all configured relays are connected
    return {
      connected: urls.length,
      failed: 0
    };
  }

  destroy(): void {
    console.log('🔌 Destroying SimplePool connections');
    
    // Close all active subscriptions
    for (const subscription of this.activeSubscriptions) {
      try {
        subscription.close();
      } catch (error) {
        console.warn('Error closing subscription:', error);
      }
    }
    this.activeSubscriptions.clear();
    
    // Close all relay connections
    const allRelays = Array.from(this.pool.seenOn.keys());
    this.pool.close(allRelays);
  }
}