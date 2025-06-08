import type { NostrEvent, Filter } from '$lib/types';
import { keyManager } from './keys';
import { mineEvent } from './mining';
import { relayDiscovery } from './relay-discovery';
import { decayEngineService } from './decay-engine';
import { get } from 'svelte/store';
// Temporary: Comment out applesauce-core for now
// import { EventStore, QueryStore } from 'applesauce-core';
import type { UnsignedEvent } from 'nostr-tools';
import { SimpleRelayPool } from './simple-pool';
import { updateRelayStatus, relayStatuses } from '$lib/stores/relay-status';
import type { RelayState } from '$lib/stores/relay-status';

export class EventService {
  private events: Map<string, NostrEvent> = new Map();
  private pool: SimpleRelayPool;
  private activeSubscriptions: Map<string, any> = new Map();
  private followList: Set<string> = new Set();
  private seenEventIds: Set<string> = new Set(); // For deduplication
  private relayMetrics: Map<string, { startTime: number; requests: number[] }> = new Map();

  constructor() {
    // Initialize SimpleRelayPool for relay connections
    this.pool = new SimpleRelayPool();
    
    // Start performance monitoring
    this.startPerformanceMonitoring();
  }

  async initialize() {
    // Initialize event store and setup subscriptions
    await this.subscribeToEvents();
  }

  private async subscribeToEvents() {
    const userPubkey = keyManager.getPublicKey();
    let relayUrls: string[] = [];
    
    // Try to get user's relay list first (NIP-65)
    if (userPubkey) {
      const userRelayList = await this.getUserRelayList(userPubkey);
      if (userRelayList.length > 0) {
        // Use relays marked for reading
        relayUrls = userRelayList
          .filter(r => r.read)
          .map(r => r.url);
        console.log('Using user relay list from NIP-65:', relayUrls);
      }
    }
    
    // Fallback to discovered relays if no relay list
    if (relayUrls.length === 0) {
      const relays = get(relayDiscovery.discoveredRelays);
      relayUrls = Array.from(relays.values())
        .filter(r => r.supportsPow)
        .map(r => r.url);
    }

    if (relayUrls.length === 0) {
      console.warn('No PoW-compatible relays found, using default');
      relayUrls.push('ws://localhost:7777');
    }
    
    // If we have a follow list, use inbox/outbox model
    if (userPubkey && this.followList.size > 0) {
      // Inbox subscription: Get content from people we follow
      const inboxSubscription = this.applesauce.subscribeInbox({
        relayUrls,
        pubkey: userPubkey,
        followedPubkeys: Array.from(this.followList),
        onEvent: (event) => {
          // Only process PoW events
          if (event.tags.some(tag => tag[0] === 'nonce')) {
            this.handleNewEvent(event);
          }
        },
        onError: (err) => console.error('Inbox subscription error:', err)
      });
      
      this.activeSubscriptions.set('inbox', inboxSubscription);
      
      // Outbox subscription: Get replies and mentions to us
      const outboxSubscription = this.applesauce.subscribeOutbox({
        relayUrls,
        pubkey: userPubkey,
        onEvent: (event) => {
          if (event.tags.some(tag => tag[0] === 'nonce')) {
            this.handleNewEvent(event);
          }
        },
        onError: (err) => console.error('Outbox subscription error:', err)
      });
      
      this.activeSubscriptions.set('outbox', outboxSubscription);
    } else {
      // Fallback to regular subscriptions if no follow list
      // Subscribe to kind 1 notes with nonce tags (PoW notes)
      const notesFilter: Filter = {
        kinds: [1],
        '#nonce': ['*'],
        limit: 100
      };

      const notesSubscription = this.applesauce.subscribeToRelays({
        relayUrls,
        filters: [notesFilter],
        onEvent: (event) => {
          if (event.kind === 1) {
            this.handleNewEvent(event);
          }
        },
        onError: (err) => console.error('Notes subscription error:', err)
      });
      
      this.activeSubscriptions.set('notes', notesSubscription);
    }

    // Subscribe to kind 1111 comments
    const commentsFilter: Filter = {
      kinds: [1111],
      '#nonce': ['*'],
      limit: 100
    };

    const commentsSubscription = this.applesauce.subscribeToRelays({
      relayUrls,
      filters: [commentsFilter],
      onEvent: (event) => {
        if (event.kind === 1111) {
          this.handleNewEvent(event);
        }
      },
      onError: (err) => console.error('Comments subscription error:', err)
    });

    const zapsSubscription = this.applesauce.subscribeToRelays({
      relayUrls,
      filters: [zapsFilter],
      onEvent: (event) => {
        if (event.kind === 9735) {
          this.handleZapEvent(event);
        }
      },
      onError: (err) => console.error('Zaps subscription error:', err)
    });

    // Subscribe to follow lists
    const followListSubscription = this.applesauce.subscribeToRelays({
      relayUrls,
      filters: [followListFilter],
      onEvent: (event) => {
        if (event.kind === 3) {
          this.handleFollowListEvent(event);
        }
      },
      onError: (err) => console.error('Follow list subscription error:', err)
    });

    // Store subscriptions for cleanup
    this.activeSubscriptions.set('notes', notesSubscription);
    this.activeSubscriptions.set('comments', commentsSubscription);
    this.activeSubscriptions.set('zaps', zapsSubscription);
    this.activeSubscriptions.set('followList', followListSubscription);

    // Also subscribe to mentions of our pubkey if we have one
    const pubkey = keyManager.getPublicKey();
    if (pubkey) {
      const mentionsFilter: Filter = {
        kinds: [1, 1111],
        '#p': [pubkey],
        '#nonce': ['*'],
        limit: 100
      };

      const mentionsSubscription = this.applesauce.subscribeToRelays({
        relayUrls,
        filters: [mentionsFilter],
        onEvent: (event) => {
          this.handleNewEvent(event);
        },
        onError: (err) => console.error('Mentions subscription error:', err)
      });

      this.activeSubscriptions.set('mentions', mentionsSubscription);
    }
  }

  private async handleNewEvent(event: NostrEvent) {
    // Deduplication check
    if (this.seenEventIds.has(event.id)) {
      return; // Already processed this event
    }
    
    // Validate event structure
    const validationResult = validateEvent(event);
    if (!validationResult.valid) {
      console.warn('Invalid event received:', validationResult.errors);
      return;
    }
    
    // Verify event signature
    const isValidSignature = await verifyEventSignature(event);
    if (!isValidSignature) {
      console.warn('Event signature verification failed:', event.id);
      return;
    }
    
    // Additional PoW validation
    const nonceTag = event.tags.find(tag => tag[0] === 'nonce');
    if (!nonceTag || nonceTag.length < 3) {
      console.warn('Event missing proper nonce tag:', event.id);
      return;
    }
    
    // Mark as seen for deduplication
    this.seenEventIds.add(event.id);
    
    // Check if event already exists in our store
    if (this.events.has(event.id)) {
      return; // Already have this event
    }
    
    this.addEvent(event);
    
    // Store event relationships in database
    await this.storeEventRelationships(event);
    
    // Update decay engine with new event
    decayEngineService.addEvent(event);
    
    // Clean up old seen events periodically (keep last 10,000)
    if (this.seenEventIds.size > 10000) {
      const idsArray = Array.from(this.seenEventIds);
      const toRemove = idsArray.slice(0, idsArray.length - 10000);
      toRemove.forEach(id => this.seenEventIds.delete(id));
    }
  }

  private async storeEventRelationships(event: NostrEvent) {
    const { db } = await import('./database');
    
    // Parse e tags for reply/root relationships
    const eTags = event.tags.filter(tag => tag[0] === 'e' && tag[1]);
    
    for (const tag of eTags) {
      const parentEventId = tag[1];
      const marker = tag[3]; // 'reply', 'root', or undefined
      
      let relationType: 'reply' | 'mention' | 'root' = 'mention';
      if (marker === 'reply' || marker === 'root') {
        relationType = marker;
      } else if (eTags.length === 1 || tag === eTags[eTags.length - 1]) {
        // If no marker, last e tag is considered reply
        relationType = 'reply';
      }
      
      await db.saveEventRelationship(event, parentEventId, relationType);
    }
  }

  private handleZapEvent(event: NostrEvent) {
    // Extract the zapped event ID from tags
    const zapTag = event.tags.find(tag => tag[0] === 'e');
    if (zapTag && zapTag[1]) {
      const zappedEventId = zapTag[1];
      
      // Extract amount from bolt11 tag or description
      const bolt11Tag = event.tags.find(tag => tag[0] === 'bolt11');
      let amount = 0;
      
      if (bolt11Tag && bolt11Tag[1]) {
        // Parse amount from bolt11 invoice (simplified for now)
        // In production, use a proper bolt11 parser
        amount = 1000; // Default to 1000 sats for now
      }

      // Notify decay engine about the zap
      decayEngineService.addZap(zappedEventId, amount);
    }
  }

  private handleFollowListEvent(event: NostrEvent) {
    // Clear current follow list
    this.followList.clear();
    
    // Parse p tags for followed pubkeys
    event.tags
      .filter(tag => tag[0] === 'p' && tag[1])
      .forEach(tag => this.followList.add(tag[1]));
    
    console.log(`Updated follow list with ${this.followList.size} pubkeys`);
    
    // Re-subscribe with inbox/outbox model
    this.subscribeToEvents();
  }


  async publishReply(content: string, replyToEventId: string, difficulty: number) {
    const pubkey = keyManager.getPublicKey();
    if (!pubkey) {
      throw new Error('No keys available. Please set up your keys first.');
    }
    
    // Get the event we're replying to
    const parentEvent = this.getEvent(replyToEventId);
    if (!parentEvent) {
      throw new Error('Parent event not found');
    }
    
    // Build reply tags according to NIP-10
    const tags: string[][] = [];
    
    // Add root tag if this is a direct reply
    const rootTag = parentEvent.tags.find(tag => tag[0] === 'e' && tag[3] === 'root');
    if (rootTag) {
      tags.push(rootTag);
    } else {
      // This is a root post, so it becomes the root
      tags.push(['e', parentEvent.id, '', 'root']);
    }
    
    // Add reply tag
    tags.push(['e', replyToEventId, '', 'reply']);
    
    // Add p tag for the person we're replying to
    tags.push(['p', parentEvent.pubkey]);
    
    // Create unsigned event template
    const replyEventTemplate: UnsignedEvent = {
      kind: 1111, // Comment kind
      content: content.trim(),
      tags,
      pubkey,
      created_at: Math.floor(Date.now() / 1000)
    };

    // Mine the event
    const minedEvent = await mineEvent(replyEventTemplate, difficulty);
    
    // Optimistically add the reply to the feed immediately
    this.addEvent(minedEvent);
    await this.handleNewEvent(minedEvent);
    
    // Publish to relays in the background
    this.publishEvent(minedEvent).catch(error => {
      console.error('Failed to publish reply, removing from feed:', error);
      this.removeEvent(minedEvent.id);
    });
    
    return minedEvent.id;
  }

  async publishNote(content: string, difficulty: number) {
    const pubkey = keyManager.getPublicKey();
    if (!pubkey) {
      throw new Error('No keys available. Please set up your keys first.');
    }
    
    // Create unsigned event template
    const baseEventTemplate: UnsignedEvent = {
      kind: 1,
      content: content.trim(),
      tags: [],
      pubkey,
      created_at: Math.floor(Date.now() / 1000)
    };

    // Mine the event
    const minedEvent = await mineEvent(baseEventTemplate, difficulty);
    
    // Optimistically add the event to the feed immediately
    this.addEvent(minedEvent);
    await this.handleNewEvent(minedEvent);
    
    // Publish to relays in the background
    this.publishEvent(minedEvent).catch(error => {
      console.error('Failed to publish event, removing from feed:', error);
      // Remove from local store if publish fails
      this.removeEvent(minedEvent.id);
    });
    
    return minedEvent.id;
  }

  async publishEvent(event: NostrEvent) {
    // Validate event before publishing
    const validationResult = validateEvent(event);
    if (!validationResult.valid) {
      throw new Error(`Invalid event: ${validationResult.errors.join(', ')}`);
    }
    
    // Verify signature
    const isValidSignature = await verifyEventSignature(event);
    if (!isValidSignature) {
      throw new Error('Event signature is invalid');
    }
    
    // Get discovered relays
    const relays = get(relayDiscovery.discoveredRelays);
    const relayUrls = Array.from(relays.values())
      .filter(r => r.supportsPow)
      .map(r => r.url);

    if (relayUrls.length === 0) {
      console.warn('No PoW-compatible relays found, using default');
      relayUrls.push('ws://localhost:7777');
    }

    // Publish to all relays using Applesauce
    await this.applesauce.publishToRelays({
      relayUrls,
      event,
      onOk: (url, message) => {
        console.log(`Event published to ${url}:`, message);
      },
      onError: (url, reason) => {
        console.error(`Failed to publish to ${url}:`, reason);
      }
    });
  }

  getEvents(): NostrEvent[] {
    return Array.from(this.events.values());
  }

  getEventsByKind(kind: number): NostrEvent[] {
    return Array.from(this.events.values()).filter(e => e.kind === kind);
  }

  getEvent(id: string): NostrEvent | undefined {
    return this.events.get(id);
  }

  addEvent(event: NostrEvent) {
    this.events.set(event.id, event);
  }

  removeEvent(eventId: string) {
    this.events.delete(eventId);
    // Also remove from database
    import('./database').then(({ db }) => {
      db.cachedEvents.delete(eventId).catch(err => 
        console.error('Failed to remove event from database:', err)
      );
    });
  }

  getRepliesTo(eventId: string): NostrEvent[] {
    return Array.from(this.events.values()).filter(event => {
      // Check if this event references the target event
      const replyTag = event.tags.find(tag => 
        tag[0] === 'e' && tag[1] === eventId && 
        (tag[3] === 'reply' || tag[3] === 'root' || !tag[3])
      );
      return !!replyTag;
    });
  }

  getMentionsOf(eventId: string): NostrEvent[] {
    return Array.from(this.events.values()).filter(event => {
      // Check if this event mentions the target event
      const mentionTag = event.tags.find(tag => 
        tag[0] === 'e' && tag[1] === eventId && tag[3] === 'mention'
      );
      return !!mentionTag;
    });
  }

  getFollowList(): string[] {
    return Array.from(this.followList);
  }

  async publishRelayList(relays: Array<{url: string, read: boolean, write: boolean}>) {
    const userPubkey = keyManager.getPublicKey();
    if (!userPubkey) {
      throw new Error('No keys available. Please set up your keys first.');
    }
    
    // Build NIP-65 relay list metadata event (kind 10002)
    const relayTags = relays.map(relay => {
      if (relay.read && relay.write) {
        return ['r', relay.url];
      } else if (relay.read) {
        return ['r', relay.url, 'read'];
      } else if (relay.write) {
        return ['r', relay.url, 'write'];
      }
      return ['r', relay.url];
    }).filter(Boolean);
    
    const relayListEventTemplate: UnsignedEvent = {
      kind: 10002,
      content: '',
      tags: relayTags,
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000)
    };
    
    // Sign the event
    const signedEvent = await keyManager.signEvent(relayListEventTemplate);
    
    // Publish to relays
    await this.publishEvent(signedEvent);
    
    return signedEvent.id;
  }

  async getUserRelayList(pubkey: string): Promise<Array<{url: string, read: boolean, write: boolean}>> {
    // Query for NIP-65 relay list
    const relays = get(relayDiscovery.discoveredRelays);
    const relayUrls = Array.from(relays.values())
      .filter(r => r.supportsPow)
      .map(r => r.url)
      .slice(0, 3); // Use first 3 relays for metadata queries

    if (relayUrls.length === 0) {
      relayUrls.push('ws://localhost:7777');
    }

    return new Promise((resolve) => {
      let relayList: Array<{url: string, read: boolean, write: boolean}> = [];
      let found = false;

      const subscription = this.applesauce.subscribeToRelays({
        relayUrls,
        filters: [{
          kinds: [10002],
          authors: [pubkey],
          limit: 1
        }],
        onEvent: (event) => {
          if (!found && event.kind === 10002) {
            found = true;
            relayList = event.tags
              .filter(tag => tag[0] === 'r' && tag[1])
              .map(tag => ({
                url: tag[1],
                read: !tag[2] || tag[2] === 'read',
                write: !tag[2] || tag[2] === 'write'
              }));
          }
        },
        onEose: () => {
          subscription.unsubscribe();
          resolve(relayList);
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        subscription.unsubscribe();
        resolve(relayList);
      }, 5000);
    });
  }

  async updateFollowList(pubkeys: string[]) {
    const userPubkey = keyManager.getPublicKey();
    if (!userPubkey) {
      throw new Error('No keys available. Please set up your keys first.');
    }
    
    // Create unsigned event template for kind 3 event
    const followListEventTemplate: UnsignedEvent = {
      kind: 3,
      content: '',
      tags: pubkeys.map(pubkey => ['p', pubkey]),
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000)
    };
    
    // Sign the event
    const signedEvent = await keyManager.signEvent(followListEventTemplate);
    
    // Publish to relays
    await this.publishEvent(signedEvent);
    
    // Update local follow list
    this.followList = new Set(pubkeys);
    this.subscribeToEvents();
  }

  private handleRelayStateChange(url: string, state: string) {
    // Map Applesauce states to our RelayState type
    let relayState: RelayState;
    switch (state) {
      case 'connecting':
        relayState = 'connecting';
        break;
      case 'connected':
        relayState = 'connected';
        updateRelayStatus(url, { 
          state: relayState, 
          lastConnected: Date.now() 
        });
        // Resubscribe if this relay was previously disconnected
        this.resubscribeIfNeeded(url);
        return;
      case 'disconnected':
        relayState = 'disconnected';
        break;
      case 'error':
      case 'failed':
        relayState = 'error';
        // Schedule reconnection attempt
        this.scheduleReconnection(url);
        break;
      default:
        relayState = 'disconnected';
    }
    
    updateRelayStatus(url, { state: relayState });
  }

  private resubscribeIfNeeded(url: string) {
    // Check if we have active subscriptions that need to be re-established
    if (this.activeSubscriptions.size > 0) {
      console.log(`Relay ${url} reconnected, re-establishing subscriptions`);
      // The Applesauce library handles resubscription automatically
    }
  }

  private scheduleReconnection(url: string) {
    // Applesauce handles reconnection automatically with the configured retry logic
    console.log(`Relay ${url} disconnected, will retry according to configured policy`);
  }

  getRelayStatuses() {
    return this.applesauce.getRelayStatuses();
  }

  private trackRequestStart(url: string) {
    if (!this.relayMetrics.has(url)) {
      this.relayMetrics.set(url, { startTime: Date.now(), requests: [] });
    }
    const metrics = this.relayMetrics.get(url)!;
    metrics.startTime = Date.now();
  }

  private trackRequestEnd(url: string, success: boolean) {
    const metrics = this.relayMetrics.get(url);
    if (!metrics) return;
    
    const responseTime = Date.now() - metrics.startTime;
    metrics.requests.push(responseTime);
    
    // Keep only last 100 requests for averaging
    if (metrics.requests.length > 100) {
      metrics.requests.shift();
    }
    
    // Calculate metrics
    const avgResponseTime = metrics.requests.reduce((a, b) => a + b, 0) / metrics.requests.length;
    const totalRequests = (updateRelayStatus as any).totalRequests || 0;
    
    updateRelayStatus(url, {
      lastResponseTime: responseTime,
      avgResponseTime: Math.round(avgResponseTime),
      totalRequests: totalRequests + 1,
      successfulRequests: success ? ((updateRelayStatus as any).successfulRequests || 0) + 1 : undefined,
      failedRequests: !success ? ((updateRelayStatus as any).failedRequests || 0) + 1 : undefined
    });
  }

  private startPerformanceMonitoring() {
    // Update uptime metrics every 30 seconds
    setInterval(() => {
      const statuses = get(relayStatuses);
      statuses.forEach((status, url) => {
        if (status.lastConnected) {
          const uptimeMs = Date.now() - status.lastConnected;
          const totalTime = uptimeMs + (status.state === 'connected' ? 0 : 30000);
          const uptime = Math.round((uptimeMs / totalTime) * 100);
          updateRelayStatus(url, { uptime });
        }
      });
    }, 30000);
  }

  destroy() {
    // Clean up subscriptions
    for (const sub of this.activeSubscriptions.values()) {
      sub.unsubscribe();
    }
    this.activeSubscriptions.clear();
    
    // Clean up Applesauce connections
    this.applesauce.destroy();
  }
}

export const eventService = new EventService();