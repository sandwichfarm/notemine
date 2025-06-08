import { Notemine } from '@notemine/wrapper';
import { EventStore } from 'applesauce-core';
import { SimpleRelayPool } from './simple-pool';
import { relayPool as relayPoolStore } from '$lib/stores/relay-pool';
import type { NostrEvent, UnsignedEvent } from '$lib/types';
import { keyManager } from './keys';
import { InboxOutboxService } from './inbox-outbox';
import { RelayDiscoveryService } from './relay-discovery';
import { miningQueue } from './mining-queue';
import { writable } from 'svelte/store';
import { firstValueFrom } from 'rxjs';
import { verifyEvent } from 'nostr-tools';
import { verifyPowDifficulty, extractPowDifficulty } from '$lib/utils/nostr';
import { globalDifficulty, difficultySettings } from '$lib/stores/difficulty';
import { calculateTargetDifficulty } from '$lib/types/difficulty';
import { statePersistence } from '../../hyprland/services/state-persistence';
import { feedStore } from '$lib/stores/feeds';
import { get } from 'svelte/store';
import { playSound } from './sound';

export interface PoWMiningProgress {
  workerId: number;
  hashRate: number;
  bestPow: number;
  nonce: string;
  hash: string;
}

export interface PoWMiningResult {
  event: NostrEvent;
  total_time: number;
  khs: number;
}

export class PoWClient {
  public eventStore: EventStore; // Make public so reactions service can access it
  public pool: SimpleRelayPool; // Make public so reactions service can access it
  private inboxOutbox: InboxOutboxService;
  private relayDiscovery: RelayDiscoveryService;
  private activeMiners: Map<string, Notemine> = new Map();
  private onEventMined?: (event: NostrEvent) => void;
  
  // Reactive stores
  public miningProgress = writable<Map<string, PoWMiningProgress[]>>(new Map());
  public miningResults = writable<PoWMiningResult[]>([]);
  public events = writable<NostrEvent[]>([]);
  public isConnected = writable(false);
  
  // PoW data relays - discovered via NIP-66, used for subscribing to notes
  private relays = [
    'wss://relay.damus.io',  // Popular public relay
    'wss://relay.nostr.band' // Another popular relay
    // 'ws://localhost:7777' // Local nak ephemeral relay for development
  ];
  
  constructor() {
    this.eventStore = new EventStore();
    this.pool = new SimpleRelayPool();
    // Don't filter by PoW at relay level - we'll do it in post-processing
    this.pool.setMinPowDifficulty(0); // Accept all events, filter later
    this.inboxOutbox = new InboxOutboxService(this.pool, this.eventStore);
    this.relayDiscovery = new RelayDiscoveryService(this.pool, this.eventStore);
    this.initialize();
  }
  
  private async initialize() {
    console.log('PoWClient initializing...');
    
    // Initialize relay discovery with default relays
    await this.relayDiscovery.initialize();
    
    // Discover PoW-compatible relays
    try {
      console.log('🔍 Starting NIP-66 relay discovery...');
      await this.relayDiscovery.discoverPowRelays();
      console.log('✅ NIP-66 relay discovery completed');
    } catch (error) {
      console.error('❌ Failed to discover PoW relays:', error);
    }
    
    // Update data relays with PoW relays discovered via NIP-66
    this.relayDiscovery.powRelays.subscribe(powRelays => {
      console.log('📋 NIP-66 discovered PoW relays for data subscription:', powRelays.length);
      
      // Check if exclusive mode is enabled
      const currentState = get(relayPoolStore);
      
      if (currentState.exclusiveMode) {
        // In exclusive mode, only use explicitly configured relays
        this.relays = currentState.relays;
        console.log('🔒 Exclusive mode enabled - using only configured relays:', this.relays);
      } else if (powRelays.length > 0) {
        // Normal mode - use public relays and discovered PoW relays
        const relayUrls = powRelays.map(r => r.url);
        // Keep public relays and add discovered PoW relays
        this.relays = [
          'wss://relay.damus.io',
          'wss://relay.nostr.band',
          ...relayUrls.slice(0, 3)
        ];
        console.log('📡 Updated PoW data relay list:', this.relays);
        
        // Update relay pool store with combined list
        relayPoolStore.setRelays(this.relays);
      }
      
      // Update connection status
      const connectedCount = this.relays.length > 0 ? this.relays.length : 0;
      relayPoolStore.updateStatus(connectedCount, 0, 0);
    });
    
    // Start continuous relay discovery
    this.relayDiscovery.startContinuousDiscovery();
    
    // Subscribe to relay pool changes to handle exclusive mode and manual relay configuration
    relayPoolStore.subscribe(state => {
      if (state.exclusiveMode && state.relays.length > 0) {
        // In exclusive mode, only use manually configured relays
        this.relays = state.relays;
        console.log('🔒 Updating relay connections - exclusive mode with relays:', this.relays);
      }
    });
    
    // Connect to relays
    await this.connectToRelays();
    
    // Subscribe to events
    this.subscribeToEvents();
    
    // Setup event store reactivity
    this.setupReactivity();
    
    console.log('PoWClient initialized');
  }
  
  private async connectToRelays() {
    try {
      console.log('🌐 Connecting to relays:', this.relays);
      // Update relay pool store with current relays
      relayPoolStore.setRelays(this.relays);
      
      // For now, assume connected when we have relays configured
      // TODO: Get actual connection status from applesauce-relay
      const connectedCount = this.relays.length > 0 ? 1 : 0; // At least localhost should work
      relayPoolStore.updateStatus(connectedCount, 0, 0);
      
      this.isConnected.set(true);
      console.log('✅ Relay pool updated with', this.relays.length, 'relays:', this.relays);
    } catch (error) {
      console.error('❌ Failed to connect to relays:', error);
      relayPoolStore.updateStatus(0, 0, this.relays.length);
    }
  }
  
  private async subscribeToEvents() {
    // Track current subscriptions to clean them up when feed changes
    let currentSubscriptions: any[] = [];
    
    // Subscribe to complete feed subscription info (filters + relays + timestamp)
    feedStore.activeFeedSubscription.subscribe(({ feedId, filters, relays, timestamp }) => {
      console.log('🔄 Feed subscription triggered:', { feedId, relayCount: relays.length, filterCount: filters.length, timestamp });
      
      // Cancel previous subscriptions when feed changes
      currentSubscriptions.forEach(sub => {
        try {
          sub.unsubscribe();
        } catch (err) {
          console.error('Error unsubscribing:', err);
        }
      });
      currentSubscriptions = [];
      
      if (filters.length === 0) {
        console.log('📡 No active filters for feed', feedId, ', creating default filter');
        // Create a basic filter if none exist
        filters = [{ kinds: [1], limit: 100 }];
      }
      
      // Use feed-specific relays if available, fallback to discovered PoW relays
      const targetRelays = relays.length > 0 ? relays : this.relays;
      
      if (targetRelays.length === 0) {
        console.log('⚠️ No relays available for subscription');
        return;
      }
      
      console.log('📡 Subscribing to feed', feedId, 'with relays:', targetRelays);
      console.log('📡 Using filters:', JSON.stringify(filters, null, 2));
      
      // Subscribe using the feed's NIP-01 filters and relays
      filters.forEach(filter => {
        const sub = this.pool.req(targetRelays, filter).subscribe({
          next: (response) => {
            if (response !== 'EOSE' && 'id' in response) {
              // Calculate PoW difficulty for all events
              const pow = extractPowDifficulty(response);
              console.log('📥 Received event from relay:', response.id.substring(0, 8), 'PoW:', pow);
              
              // Add PoW difficulty to event for sorting/filtering
              const eventWithPow = {
                ...response,
                pow: pow
              };
              
              // Add to event store and feed store (post-filtering happens in feed store)
              this.eventStore.add(response);
              feedStore.addEvents([eventWithPow as any]);
            } else if (response === 'EOSE') {
              console.log('✅ Initial events loaded from relays');
            }
          },
          error: (error) => {
            console.error('❌ Relay subscription error:', error);
          }
        });
        currentSubscriptions.push(sub);
      });
    });
  }
  
  private setupReactivity() {
    // Subscribe to timeline of PoW events (sorted arrays)
    // Events are already filtered for nonce tags in subscribeToEvents
    this.eventStore.timeline({
      kinds: [1, 1111] // Text notes and comments
    }).subscribe(events => {
      this.events.set(events);
    });
  }
  
  async createNote(content: string): Promise<string> {
    const publicKey = keyManager.getPublicKey();
    console.log('Public key from keyManager:', publicKey);
    
    if (!publicKey) {
      throw new Error('No public key available. Please set up your keys first.');
    }
    
    const difficulty = this.calculateDifficulty(content);
    
    const unsignedEvent: UnsignedEvent = {
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: content.trim()
    };
    
    console.log('Creating note with event:', unsignedEvent);
    console.log('Difficulty:', difficulty);
    
    // Add to mining queue
    const jobId = miningQueue.addJob({
      content: content.trim(),
      difficulty
    });
    
    // The queue will automatically start this job if no other job is active
    // We need to check if this job became active immediately
    let currentActiveJob: any = null;
    const unsubscribeActive = miningQueue.activeJob.subscribe(job => currentActiveJob = job);
    unsubscribeActive();
    
    console.log('Current active job:', currentActiveJob);
    
    if (currentActiveJob && currentActiveJob.id === jobId && currentActiveJob.status === 'mining') {
      // Start mining immediately
      console.log('Starting mining immediately for job:', jobId);
      this.mineEvent(unsignedEvent, difficulty, jobId, currentActiveJob.currentNonce);
    }
    
    // Also subscribe for future changes (pause/resume)
    const unsubscribe = miningQueue.activeJob.subscribe(activeJob => {
      if (activeJob && activeJob.id === jobId && activeJob.status === 'mining' && !this.activeMiners.has(jobId)) {
        console.log('Starting mining from subscription for job:', jobId);
        this.mineEvent(unsignedEvent, difficulty, jobId, activeJob.currentNonce);
      }
    });
    
    // Clean up subscription when job is done
    const unsubscribeQueue = miningQueue.queue.subscribe(queue => {
      const job = queue.find(j => j.id === jobId);
      if (!job || job.status === 'completed') {
        unsubscribe();
        unsubscribeQueue();
      }
    });
    
    return jobId;
  }
  
  private async mineEvent(event: UnsignedEvent, difficulty: number, jobId: string, startNonce?: string): Promise<string> {
    console.log('Starting mining for job:', jobId, { difficulty, startNonce });
    
    // Get user-configured number of mining threads (defaults to half of available cores)
    const defaultThreads = Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2));
    const configuredThreads = statePersistence.getSetting('miningThreads', defaultThreads);
    const numberOfWorkers = Math.min(configuredThreads, navigator.hardwareConcurrency || 4);
    
    console.log(`Using ${numberOfWorkers} workers (configured: ${configuredThreads}, available: ${navigator.hardwareConcurrency || 4})`);
    
    // Use correct Notemine constructor according to API
    const notemine = new Notemine({
      content: event.content,
      pubkey: event.pubkey,
      tags: event.tags,
      difficulty,
      numberOfWorkers
    });
    
    // Set additional properties after creation if needed
    // Note: created_at, kind, and startNonce might not be supported in constructor
    
    this.activeMiners.set(jobId, notemine);
    
    // Update mining queue with miner reference
    miningQueue.queue.update(q => 
      q.map(job => job.id === jobId ? {...job, miner: notemine} : job)
    );
    
    // Debug what's available on notemine instance
    console.log('Notemine instance properties:', Object.getOwnPropertyNames(notemine));
    console.log('Notemine prototype properties:', Object.getOwnPropertyNames(Object.getPrototypeOf(notemine)));
    console.log('Available observables:', {
      'progress$': !!notemine.progress$,
      'highestPow$': !!notemine.highestPow$,
      'workersHashRate$': !!notemine.workersHashRate$,
      'workersPow$': !!notemine.workersPow$,
      'success$': !!notemine.success$
    });
    console.log('Current numberOfWorkers:', navigator.hardwareConcurrency);
    console.log('Notemine totalHashRate property:', notemine.totalHashRate);
    
    // Setup progress tracking - but don't create single worker entries since we use multi-worker fallback
    if (notemine.progress$) {
      console.log('Setting up progress$ subscription (for queue updates only)');
      notemine.progress$.subscribe((progressEvent) => {
        console.log('Progress update:', progressEvent);
        
        // Get overall hash rate from notemine property
        const totalHashRate = notemine.totalHashRate || 0;
        console.log('Total hashrate:', totalHashRate);
        
        // Only update mining queue, not individual worker progress (handled by fallback)
        miningQueue.queue.update(q => 
          q.map(job => job.id === jobId ? {
            ...job, 
            hashRate: totalHashRate
          } : job)
        );
      });
    } else {
      console.warn('No progress$ observable found on notemine instance');
    }
    
    // Setup best PoW tracking using highestPow$ observable
    if (notemine.highestPow$) {
      console.log('Setting up highestPow$ subscription');
      notemine.highestPow$.subscribe((bestPowData) => {
        console.log('Best PoW update:', bestPowData);
        
        const bestPow = bestPowData ? bestPowData.bestPow || 0 : 0;
        
        // Update mining queue with best PoW
        miningQueue.queue.update(q => 
          q.map(job => job.id === jobId ? {
            ...job, 
            bestPow: bestPow
          } : job)
        );
        
        // Update progress tracking
        this.miningProgress.update(map => {
          const currentProgress = map.get(jobId) || [];
          const updatedProgress = currentProgress.map(p => ({
            ...p,
            bestPow: bestPow
          }));
          map.set(jobId, updatedProgress);
          return map;
        });
      });
    } else {
      console.warn('No highestPow$ observable found on notemine instance');
    }
    
    // Check for individual worker hash rate tracking
    if (notemine.workersHashRate$) {
      console.log('Setting up workersHashRate$ subscription for individual worker hash rates');
      notemine.workersHashRate$.subscribe((workersHashRateData) => {
        console.log('Worker hash rate update:', workersHashRateData);
        
        // workersHashRateData should be Record<number, number> (workerId -> hashRate)
        const workers = Object.entries(workersHashRateData);
        
        if (workers.length > 0) {
          this.miningProgress.update(map => {
            const progress: PoWMiningProgress[] = [];
            
            workers.forEach(([workerIdStr, hashRate]) => {
              const workerId = parseInt(workerIdStr);
              const currentHashRate = typeof hashRate === 'number' ? hashRate : 0;
              
              progress.push({
                workerId: workerId,
                hashRate: currentHashRate,
                bestPow: 0, // Will be updated by workersPow$ subscription
                nonce: '',
                hash: ''
              });
            });
            
            console.log('Updated worker hash rates:', progress);
            map.set(jobId, progress);
            return map;
          });
        }
      });
    }
    
    // Track individual worker progress (best PoW, nonce, hash)
    if (notemine.workersPow$) {
      console.log('Setting up workersPow$ subscription for worker best PoW data');
      notemine.workersPow$.subscribe((workersPowData) => {
        console.log('Worker PoW update:', workersPowData);
        
        // workersPowData should be Record<number, BestPowData>
        const workers = Object.entries(workersPowData);
        
        if (workers.length > 0) {
          this.miningProgress.update(map => {
            const currentProgress = map.get(jobId) || [];
            
            // Update existing worker progress with PoW data, or create new entries
            const updatedProgress: PoWMiningProgress[] = [];
            
            workers.forEach(([workerIdStr, powData]) => {
              const workerId = parseInt(workerIdStr);
              const bestPow = (powData as any)?.bestPow || 0;
              const nonce = (powData as any)?.nonce || '';
              const hash = (powData as any)?.hash || '';
              
              // Find existing worker data or create new
              const existingWorker = currentProgress.find(w => w.workerId === workerId);
              
              updatedProgress.push({
                workerId: workerId,
                hashRate: existingWorker?.hashRate || 0, // Keep existing hash rate or 0
                bestPow: bestPow,
                nonce: nonce,
                hash: hash
              });
            });
            
            console.log('Updated worker PoW data:', updatedProgress);
            map.set(jobId, updatedProgress);
            return map;
          });
          
          // Update mining queue with aggregate data
          const bestPowValues = workers.map(([_, powData]) => (powData as any)?.bestPow || 0);
          const maxBestPow = bestPowValues.length > 0 ? Math.max(...bestPowValues) : 0;
          
          miningQueue.queue.update(q => 
            q.map(job => job.id === jobId ? {
              ...job, 
              bestPow: maxBestPow,
              hashRate: notemine.totalHashRate || 0,
              workerCount: workers.length
            } : job)
          );
        }
      });
    } else {
      console.warn('No workersPow$ observable found on notemine instance');
    }
    
    // Enhanced progress tracking that updates on any progress event
    const setupFallbackWorkerTracking = () => {
      console.log('Setting up fallback worker tracking');
      const workerCount = numberOfWorkers; // Use the configured number of workers
      console.log(`Creating ${workerCount} worker entries for fallback tracking`);
      
      // Update progress store with individual workers
      const updateWorkerProgress = () => {
        this.miningProgress.update(map => {
          const progress: PoWMiningProgress[] = [];
          const totalHashRate = notemine.totalHashRate || 0;
          const hashRatePerWorker = totalHashRate / Math.max(1, workerCount);
          
          for (let i = 0; i < workerCount; i++) {
            progress.push({
              workerId: i,
              hashRate: hashRatePerWorker,
              bestPow: notemine.overallBestPow || 0,
              nonce: '',
              hash: ''
            });
          }
          
          console.log(`Updated ${workerCount} workers with individual hash rates:`, progress);
          map.set(jobId, progress);
          return map;
        });
      };
      
      // Initial setup
      updateWorkerProgress();
      
      // Update when progress changes
      if (notemine.progress$) {
        notemine.progress$.subscribe(() => {
          updateWorkerProgress();
        });
      }
    };
    
    // Always set up fallback tracking since individual worker data seems limited
    setupFallbackWorkerTracking();
    
    // Handle mining completion - correct API usage
    notemine.success$.subscribe(async (successEvent: any) => {
      try {
        console.log('Mining success event:', successEvent);
        console.log('Success event keys:', Object.keys(successEvent));
        console.log('Success event type:', typeof successEvent);
        console.log('Full success event structure:', JSON.stringify(successEvent, null, 2));
        
        // According to API, success$ emits { result: MinedResult }
        // MinedResult has { event, totalTime, hashRate }
        let minedResult;
        let minedUnsignedEvent;
        
        if (successEvent && successEvent.result) {
          // Correct API structure: { result: { event, totalTime, hashRate } }
          minedResult = successEvent.result;
          minedUnsignedEvent = minedResult.event;
          console.log('Using correct API structure - result:', minedResult);
        } else if (successEvent && successEvent.event) {
          // Fallback: direct event structure
          minedUnsignedEvent = successEvent.event;
          minedResult = successEvent;
          console.log('Using fallback structure - direct event');
        } else if (successEvent && successEvent.id && successEvent.pubkey) {
          // Fallback: event is the successEvent itself
          minedUnsignedEvent = successEvent;
          minedResult = { event: successEvent, totalTime: 0, hashRate: 0 };
          console.log('Using fallback structure - event as successEvent');
        } else {
          console.error('Invalid mining result - no recognizable structure:', successEvent);
          return;
        }
        
        // Verify the unsigned event has the required fields
        if (!minedUnsignedEvent || !minedUnsignedEvent.id || !minedUnsignedEvent.pubkey || !minedUnsignedEvent.content) {
          console.error('Mining result event is missing required fields:', minedUnsignedEvent);
          return;
        }
        
        console.log('Found mined unsigned event:', minedUnsignedEvent);
        
        // Sign the mined event
        const signedEvent = await this.signEvent(minedUnsignedEvent);
        console.log('Signed event:', signedEvent);
        
        // Publish to relays
        await this.publishEvent(signedEvent);
        
        // Add to local store
        this.eventStore.add(signedEvent);
        
        // Notify events service
        if (this.onEventMined) {
          this.onEventMined(signedEvent);
        }
        
        // Track result (store only what we need) - using correct API structure
        this.miningResults.update(results => [...results, {
          event: signedEvent,
          total_time: minedResult.totalTime || 0,
          khs: minedResult.hashRate || 0
        }]);
        
        // Cleanup
        this.activeMiners.delete(jobId);
        this.miningProgress.update(map => {
          map.delete(jobId);
          return map;
        });
        
        // Play mining success sound
        playSound.miningSuccess();
        
        // Mark job as completed in queue
        miningQueue.completeJob(jobId);
        console.log('Event published successfully:', signedEvent.id);
      } catch (error) {
        console.error('Failed to publish event:', error);
      }
    });
    
    notemine.error$.subscribe(error => {
      console.error('Mining error:', error);
      this.activeMiners.delete(jobId);
    });
    
    // Set up periodic progress updates (fallback in case observables don't fire frequently enough)
    const progressInterval = setInterval(() => {
      if (this.activeMiners.has(jobId)) {
        const totalHashRate = notemine.totalHashRate || 0;
        
        console.log(`[${jobId}] Periodic update - HashRate: ${totalHashRate.toFixed(1)} kH/s`);
        
        // Only update hash rate, let observables handle bestPow updates
        miningQueue.queue.update(q => 
          q.map(job => job.id === jobId ? {
            ...job, 
            hashRate: totalHashRate
          } : job)
        );
      } else {
        clearInterval(progressInterval);
      }
    }, 1000); // Update every 1 second (less frequent since observables should handle most updates)
    
    // Start mining - don't await as it runs asynchronously
    console.log('Calling notemine.mine()...');
    
    // Play mining start sound
    playSound.miningStart();
    
    notemine.mine().then(() => {
      console.log('notemine.mine() promise resolved');
      clearInterval(progressInterval);
    }).catch(err => {
      console.error('notemine.mine() error:', err);
      clearInterval(progressInterval);
    });
    
    return jobId;
  }
  
  private async signEvent(event: NostrEvent): Promise<NostrEvent> {
    // Sign the event using keyManager
    const signedEvent = await keyManager.signEvent(event as UnsignedEvent);
    
    // Verify the event is valid
    if (!verifyEvent(signedEvent)) {
      throw new Error('Failed to create valid signed event');
    }
    
    return signedEvent;
  }
  
  private async publishEvent(event: NostrEvent): Promise<void> {
    // Extract mentioned pubkeys from event for inbox/outbox model
    const mentionedPubkeys = this.extractMentionedPubkeys(event);
    const isReply = event.tags.some(tag => tag[0] === 'e');
    
    if (mentionedPubkeys.length > 0 || isReply) {
      console.log('Publishing event with inbox/outbox model - mentions:', mentionedPubkeys.length, 'isReply:', isReply);
      
      // Use inbox/outbox model for events with mentions or replies
      const userPubkey = event.pubkey;
      try {
        await this.inboxOutbox.publishWithInboxOutbox(event, userPubkey);
        console.log('Successfully published event using inbox/outbox model');
      } catch (error) {
        console.error('Failed to publish with inbox/outbox, falling back to direct publish:', error);
        // Fallback to direct publish
        await this.pool.publish(this.relays, event);
      }
    } else {
      // Regular notes without mentions can be published to PoW relays directly
      console.log('Publishing regular note to PoW relays');
      await this.pool.publish(this.relays, event);
    }
  }
  
  // Extract mentioned pubkeys from event
  private extractMentionedPubkeys(event: NostrEvent): string[] {
    const pubkeys: string[] = [];
    
    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) {
        pubkeys.push(tag[1]);
      }
    }
    
    return pubkeys;
  }
  
  private calculateDifficulty(content: string): number {
    // Get the current difficulty settings
    const settings = get(difficultySettings);
    
    // Detect content type to determine appropriate difficulty
    const isMention = content.includes('@npub') || content.includes('nostr:npub');
    const isReply = content.includes('#[') || content.includes('nostr:note') || content.includes('nostr:nevent');
    
    // For text notes (kind 1), calculate target difficulty based on settings
    const eventKind = 1; // Text notes
    const targetDifficulty = calculateTargetDifficulty(eventKind, settings, isMention, isReply);
    
    console.log(`Using difficulty ${targetDifficulty} for ${isMention ? 'mention' : isReply ? 'reply' : 'note'}: "${content.slice(0, 50)}..."`);
    console.log('Settings:', settings);
    
    return Math.max(10, targetDifficulty); // Minimum 10 bits
  }
  
  cancelMining(jobId: string): void {
    const miner = this.activeMiners.get(jobId);
    if (miner) {
      miner.cancel();
      this.activeMiners.delete(jobId);
      miningQueue.removeJob(jobId);
    }
  }
  
  pauseMining(jobId: string): void {
    const miner = this.activeMiners.get(jobId);
    if (miner) {
      // Get current progress
      let currentNonce: string | undefined;
      let bestPow: number | undefined;
      
      this.miningProgress.subscribe(map => {
        const progress = map.get(jobId);
        if (progress && progress.length > 0) {
          // Get best progress from all workers
          const best = progress.reduce((best, curr) => {
            if (!curr) return best;
            if (!best || curr.bestPow > best.bestPow) return curr;
            return best;
          }, progress[0]);
          
          if (best) {
            currentNonce = best.nonce;
            bestPow = best.bestPow;
          }
        }
      })();
      
      // Cancel the miner
      miner.cancel();
      this.activeMiners.delete(jobId);
      
      // Update queue with paused state
      miningQueue.pauseJob(jobId, currentNonce, bestPow);
    }
  }
  
  resumeMining(jobId: string): void {
    miningQueue.resumeJob(jobId);
  }
  
  cancelAllMining(): void {
    for (const [jobId, miner] of this.activeMiners) {
      miner.cancel();
    }
    this.activeMiners.clear();
  }
  
  getInboxOutboxService(): InboxOutboxService {
    return this.inboxOutbox;
  }

  getRelayDiscoveryService(): RelayDiscoveryService {
    return this.relayDiscovery;
  }

  setOnEventMined(callback: (event: NostrEvent) => void): void {
    this.onEventMined = callback;
  }

  getActiveRelays(): string[] {
    return this.relays;
  }

  destroy(): void {
    this.cancelAllMining();
    // Applesauce relay pool cleanup
    this.pool.destroy();
  }
}

import { browser } from '$app/environment';

// Create a singleton instance only in browser
let powClientInstance: PoWClient | null = null;

export function getPowClient(): PoWClient {
  if (!browser) {
    throw new Error('PoWClient can only be used in browser environment');
  }
  
  if (!powClientInstance) {
    powClientInstance = new PoWClient();
  }
  
  return powClientInstance;
}

// Export for convenience but only create in browser
export const powClient = browser ? getPowClient() : null as any;
export const pow = powClient;

// Add alias for queueNote
if (browser && powClient) {
  (powClient as any).queueNote = powClient.createNote.bind(powClient);
}