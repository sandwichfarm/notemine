import type { NostrEvent, Filter } from '$lib/types';
import { keyManager } from './keys';
import { decayEngineService } from './decay-engine';
import { get } from 'svelte/store';
import { EventStore } from 'applesauce-core';
import { SimpleRelayPool } from './simple-pool';
import { events as eventsStore } from '$lib/stores/events';
import { dev } from '$app/environment';

export class EventService {
  private eventStore: EventStore;
  private relayPool: SimpleRelayPool;
  private followList: Set<string> = new Set();
  
  // Only local relay in development, no default relays in production
  private relays = dev ? ['ws://localhost:7777'] : [];

  constructor() {
    // Initialize Applesauce EventStore and SimpleRelayPool
    this.eventStore = new EventStore();
    this.relayPool = new SimpleRelayPool();
  }

  async initialize() {
    try {
      console.log('EventService initializing with Applesauce...');
      
      // Subscribe to events timeline using Applesauce
      this.setupApplesauceSubscriptions();
      
      // No fake data - only real events from relays
      
      // Load follow list if we have keys
      const userPubkey = keyManager.getPublicKey();
      if (userPubkey) {
        await this.loadFollowList();
      }
      
      // Initialize decay engine
      decayEngineService.startDecayUpdates();
      
      console.log('EventService initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize EventService:', error);
    }
  }

  private setupApplesauceSubscriptions() {
    console.log('Setting up Applesauce subscriptions...');
    
    // Subscribe to PoW events using Applesauce RelayPool
    const filter: Filter = {
      kinds: [1, 1111], // Text notes and comments
      '#nonce': ['*'], // Only events with nonce tags (PoW requirement)
      limit: 100
    };

    // Subscribe to events from relays using SimpleRelayPool
    const subscription = this.relayPool.req(this.relays, filter);
    
    subscription.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && typeof response === 'object' && response !== null && 'id' in response) {
          console.log('Received event from relay:', response.id);
          // Add to EventStore
          this.eventStore.add(response as NostrEvent);
        } else if (response === 'EOSE') {
          console.log('Initial relay subscription complete (EOSE)');
        }
      },
      error: (error) => {
        console.error('Relay subscription error:', error);
      }
    });

    // Subscribe to timeline from EventStore
    const timeline = this.eventStore.timeline({
      kinds: [1, 1111] // Text notes and comments
    });

    timeline.subscribe(events => {
      console.log('Applesauce timeline updated:', events.length, 'events');
      
      // Filter for kind 1 notes and update store
      const notes = events.filter(e => e.kind === 1);
      eventsStore.setNotes(notes);
      
      // Handle replies (kind 1111)
      const replies = events.filter(e => e.kind === 1111);
      replies.forEach(reply => {
        const parentTag = reply.tags.find(tag => tag[0] === 'e');
        if (parentTag && parentTag[1]) {
          eventsStore.addReply(parentTag[1], reply);
        }
      });
    });
  }


  // Add event to Applesauce EventStore
  addEvent(event: NostrEvent) {
    this.eventStore.add(event);
  }

  private updateFollowList(event: NostrEvent) {
    this.followList.clear();
    event.tags
      .filter(tag => tag[0] === 'p')
      .forEach(tag => this.followList.add(tag[1]));
  }

  async loadFollowList() {
    const userPubkey = keyManager.getPublicKey();
    if (!userPubkey) return;

    // Subscribe to follow list events for current user
    const followListFilter: Filter = {
      kinds: [3],
      authors: [userPubkey],
      limit: 1
    };

    // Use SimpleRelayPool's req method which returns an Observable
    const subscription = this.relayPool.req(this.relays, followListFilter).subscribe({
      next: (response) => {
        if (response !== 'EOSE' && typeof response === 'object' && response.pubkey === userPubkey) {
          this.updateFollowList(response as NostrEvent);
        }
      },
      error: (error) => {
        console.error('Error loading follow list:', error);
      }
    });

    // Clean up subscription after a timeout
    setTimeout(() => subscription.unsubscribe(), 5000);
  }

  // Get events from EventStore
  getEvents(): NostrEvent[] {
    // Use Applesauce timeline to get current events
    const timeline = this.eventStore.timeline({ kinds: [1, 1111] });
    let events: NostrEvent[] = [];
    
    // Get current value synchronously
    const subscription = timeline.subscribe(currentEvents => {
      events = currentEvents;
    });
    subscription.unsubscribe();
    
    return events;
  }

  getEvent(eventId: string): NostrEvent | undefined {
    return this.eventStore.getEvent(eventId);
  }

  destroy() {
    // Clean up RelayPool
    this.relayPool.destroy();
    this.followList.clear();
  }
}

export const eventService = new EventService();
export const events = eventService;