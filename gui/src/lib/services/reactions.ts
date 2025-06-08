import { writable, derived, get } from 'svelte/store';
import { EventStore } from 'applesauce-core';
import { parseLightningAddress, getInvoice } from 'applesauce-core/helpers';
import { getZapPayment, getZapRequest, isValidZap } from 'applesauce-core/helpers';
import type { NostrEvent } from '$lib/types/nostr';
import { getPowClient } from './pow-client';
import { keyManager } from './keys';
import { makeZapRequest, getZapEndpoint } from 'nostr-tools/nip57';
import { eventService } from './events';

interface ReactionData {
  eventId: string;
  reactions: Map<string, NostrEvent[]>; // reaction content -> events
  zapAmount: number;
  zapCount: number;
  zaps: NostrEvent[];
}

class ReactionsService {
  private eventStore: EventStore;
  private reactionsStore = writable<Map<string, ReactionData>>(new Map());
  private subscription: any;
  private subscribedEventIds = new Set<string>();

  constructor() {
    this.eventStore = new EventStore();
  }

  // Subscribe to reactions and zaps for specific events
  subscribeToReactions(eventIds: string[]) {
    // Only subscribe to new event IDs
    const newEventIds = eventIds.filter(id => !this.subscribedEventIds.has(id));
    if (newEventIds.length === 0) return;

    newEventIds.forEach(id => this.subscribedEventIds.add(id));

    const pow = getPowClient();
    const relays = pow.getActiveRelays();

    if (relays.length === 0) return;

    // Subscribe to reactions (kind 7)
    const reactionsFilter = {
      kinds: [7],
      '#e': newEventIds,
      limit: 100
    };

    // Subscribe to zaps (kind 9735)
    const zapsFilter = {
      kinds: [9735],
      '#e': newEventIds,
      limit: 100
    };

    // Use the pool directly
    const observable = pow.pool.req(relays, [reactionsFilter, zapsFilter]);
    
    const subscription = observable.subscribe({
      next: (response: any) => {
        if (response !== 'EOSE' && response !== 'OK' && 'id' in response) {
          this.handleReactionEvent(response as NostrEvent);
        }
      },
      error: (error: any) => {
        console.error('Reactions subscription error:', error);
      }
    });

    // Store subscription for cleanup
    this.subscription = subscription;
  }

  private handleReactionEvent(event: NostrEvent) {
    // Get the event ID being reacted to
    const targetEventId = event.tags.find(tag => tag[0] === 'e')?.[1];
    if (!targetEventId) return;

    this.reactionsStore.update(store => {
      const data = store.get(targetEventId) || {
        eventId: targetEventId,
        reactions: new Map(),
        zapAmount: 0,
        zapCount: 0,
        zaps: []
      };

      if (event.kind === 7) {
        // Handle reaction
        const content = event.content || '+';
        if (!data.reactions.has(content)) {
          data.reactions.set(content, []);
        }
        
        // Check if we already have this reaction
        const existing = data.reactions.get(content)!.find(e => e.id === event.id);
        if (!existing) {
          data.reactions.get(content)!.push(event);
        }
      } else if (event.kind === 9735) {
        // Handle zap using Applesauce helpers
        // Check if we already have this zap
        const existing = data.zaps.find(e => e.id === event.id);
        if (!existing && isValidZap(event)) {
          data.zaps.push(event);
          data.zapCount++;
          
          // Use Applesauce helper to get payment info
          const payment = getZapPayment(event);
          if (payment && payment.amount) {
            data.zapAmount += payment.amount;
          }
        }
      }

      store.set(targetEventId, data);
      return new Map(store);
    });
  }


  // Publish a reaction (NIP-25 with NIP-30 custom emoji support)
  async publishReaction(eventId: string, content: string = '+', authorPubkey?: string) {
    const pubkey = keyManager.getPublicKey();
    if (!pubkey) throw new Error('No public key available');

    // Build tags according to NIP-25
    const tags: string[][] = [
      ['e', eventId], // Event being reacted to
    ];
    
    // Add author pubkey tag if provided (recommended by NIP-25)
    if (authorPubkey) {
      tags.push(['p', authorPubkey]);
    }
    
    // For custom emojis (NIP-30), we might want to add emoji tags
    // but for now we'll just use the content field
    
    const unsignedEvent = {
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 7,
      tags,
      content
    };

    const signedEvent = await keyManager.signEvent(unsignedEvent);
    const pow = getPowClient();
    
    // Use inbox/outbox model for publishing reactions
    if (authorPubkey) {
      console.log('Publishing reaction using inbox/outbox model to author:', authorPubkey.slice(0, 8));
      const inboxOutbox = pow.getInboxOutboxService();
      await inboxOutbox.publishWithInboxOutbox(signedEvent, authorPubkey);
    } else {
      // Fallback to regular publishing if no author pubkey
      const relays = pow.getActiveRelays();
      if (relays.length > 0) {
        await pow.pool.publish(relays, signedEvent);
      }
    }

    return signedEvent;
  }

  // Get reactions for an event
  getReactionsForEvent(eventId: string): ReactionData | null {
    const store = get(this.reactionsStore);
    return store.get(eventId) || null;
  }

  // Create derived store for a specific event
  createEventReactionsStore(eventId: string) {
    return derived(this.reactionsStore, $store => 
      $store.get(eventId) || {
        eventId,
        reactions: new Map(),
        zapAmount: 0,
        zapCount: 0,
        zaps: []
      }
    );
  }

  // Get user metadata for zapping
  async getUserMetadata(pubkey: string): Promise<NostrEvent | null> {
    // Check local event stores first - try multiple sources
    let metadata: NostrEvent | null = null;
    
    // Try eventService eventStore (not working currently, but try anyway)
    try {
      const pow = getPowClient();
      // Look for kind 0 events in the event store
      const timeline = pow.eventStore.timeline({ kinds: [0], authors: [pubkey] });
      let profiles: NostrEvent[] = [];
      const sub = timeline.subscribe(events => profiles = events);
      sub.unsubscribe();
      metadata = profiles.find(p => p.pubkey === pubkey) || null;
    } catch (error) {
      console.error('Error checking local event store for profile:', error);
    }
    
    if (metadata) return metadata;

    // Fetch from relays if not found
    const pow = getPowClient();
    const relays = pow.getActiveRelays();
    
    if (relays.length === 0) return null;

    return new Promise((resolve) => {
      let resolved = false;
      let subscription: any = null;
      
      const resolveOnce = (result: NostrEvent | null) => {
        if (!resolved) {
          resolved = true;
          if (subscription) {
            subscription.unsubscribe();
          }
          resolve(result);
        }
      };

      const observable = pow.pool.req(relays, {
        kinds: [0],
        authors: [pubkey],
        limit: 1
      });

      let found = false;
      subscription = observable.subscribe({
        next: (response: any) => {
          if (response !== 'EOSE' && response !== 'OK' && 'id' in response && !found) {
            found = true;
            resolveOnce(response as NostrEvent);
          } else if (response === 'EOSE' && !found) {
            resolveOnce(null);
          }
        },
        error: () => {
          resolveOnce(null);
        }
      });
      
      // Add timeout after 10 seconds
      setTimeout(() => {
        console.warn(`getUserMetadata timeout for pubkey ${pubkey.slice(0, 8)}`);
        resolveOnce(null);
      }, 10000);
    });
  }

  // Create a zap invoice for an event
  async createZapInvoice(eventId: string, amountSats: number, comment?: string): Promise<string> {
    // Try to get the event from multiple sources
    let event = eventService.getEvent(eventId);
    
    // If not found in eventService, try getting from PoWClient's eventStore
    if (!event) {
      console.log('Event not found in eventService, trying PoWClient eventStore...');
      const pow = getPowClient();
      event = pow.eventStore?.getEvent(eventId);
    }
    
    // If still not found, try getting from feedStore events
    if (!event) {
      console.log('Event not found in PoWClient eventStore, trying feedStore...');
      const { feedEvents } = await import('$lib/stores/feeds');
      const currentEvents = get(feedEvents);
      event = currentEvents.find(e => e.id === eventId);
    }
    
    if (!event) {
      console.error('Event not found anywhere:', eventId);
      throw new Error('Event not found');
    }

    console.log('Found event for zapping:', event.id, 'by', event.pubkey.slice(0, 8));

    // Get the author's metadata
    console.log('Fetching user metadata for:', event.pubkey.slice(0, 8));
    const metadata = await this.getUserMetadata(event.pubkey);
    if (!metadata) {
      console.error('Could not find user metadata for:', event.pubkey.slice(0, 8));
      throw new Error('Could not find user metadata');
    }
    console.log('Found user metadata, parsing for zap endpoint...');

    // Get zap endpoint from metadata
    const zapEndpoint = await getZapEndpoint(metadata);
    if (!zapEndpoint) {
      console.error('User does not support zaps, no endpoint found in metadata');
      throw new Error('User does not support zaps');
    }
    console.log('Found zap endpoint:', zapEndpoint);

    // Get active relays
    const pow = getPowClient();
    const relays = pow.getActiveRelays();
    console.log('Using relays for zap request:', relays);

    // Create zap request event
    console.log('Creating zap request with params:', {
      profile: event.pubkey.slice(0, 8),
      event: eventId,
      amount: amountSats * 1000,
      relays: relays.length,
      comment: comment?.length || 0
    });
    
    const zapRequest = makeZapRequest({
      profile: event.pubkey,
      event: eventId,
      amount: amountSats * 1000, // Convert to millisats
      relays,
      comment: comment || ''
    });
    
    console.log('Created zap request event:', zapRequest.kind, zapRequest.tags?.length);

    // Sign the zap request
    console.log('Signing zap request...');
    const signedRequest = await keyManager.signEvent(zapRequest);
    console.log('Zap request signed successfully');

    // Build callback URL
    const callback = new URL(zapEndpoint);
    callback.searchParams.set('amount', (amountSats * 1000).toString());
    callback.searchParams.set('nostr', JSON.stringify(signedRequest));

    console.log('Requesting invoice from:', callback.toString());
    
    // Use Applesauce helper to get invoice with timeout
    const invoiceResponse = await Promise.race([
      getInvoice(callback),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Invoice request timeout')), 15000)
      )
    ]);
    
    console.log('Invoice response received:', !!invoiceResponse?.pr);
    
    if (!invoiceResponse || !invoiceResponse.pr) {
      throw new Error('No invoice returned from zap service');
    }

    return invoiceResponse.pr; // Return the bolt11 invoice
  }

  // Create a zap invoice for a user profile
  async createProfileZapInvoice(pubkey: string, amountSats: number, comment?: string): Promise<string> {
    // Get the user's metadata
    const metadata = await this.getUserMetadata(pubkey);
    if (!metadata) throw new Error('Could not find user metadata');

    // Get zap endpoint from metadata
    const zapEndpoint = await getZapEndpoint(metadata);
    if (!zapEndpoint) throw new Error('User does not support zaps');

    // Get active relays
    const pow = getPowClient();
    const relays = pow.getActiveRelays();

    // Create zap request event (no event field for profile zaps)
    const zapRequest = makeZapRequest({
      profile: pubkey,
      event: null,
      amount: amountSats * 1000, // Convert to millisats
      relays,
      comment: comment || ''
    });

    // Sign the zap request
    const signedRequest = await keyManager.signEvent(zapRequest);

    // Build callback URL
    const callback = new URL(zapEndpoint);
    callback.searchParams.set('amount', (amountSats * 1000).toString());
    callback.searchParams.set('nostr', JSON.stringify(signedRequest));

    console.log('Requesting invoice from:', callback.toString());
    
    // Use Applesauce helper to get invoice with timeout
    const invoiceResponse = await Promise.race([
      getInvoice(callback),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Invoice request timeout')), 15000)
      )
    ]);
    
    console.log('Invoice response received:', !!invoiceResponse?.pr);
    
    if (!invoiceResponse || !invoiceResponse.pr) {
      throw new Error('No invoice returned from zap service');
    }

    return invoiceResponse.pr; // Return the bolt11 invoice
  }

  cleanup() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.subscribedEventIds.clear();
  }
}

export const reactionsService = new ReactionsService();