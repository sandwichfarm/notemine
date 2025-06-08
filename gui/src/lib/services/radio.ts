import { SimpleRelayPool } from './simple-pool';
import { radioStore } from '$lib/stores/radio';
import { MUSIC_RELAYS, MUSIC_EVENT_KINDS, parseMusicEvent, createRadioStation } from '$lib/types/music';
import type { NostrEvent, Filter } from '$lib/types/nostr';
import type { MusicTrack, RadioStation } from '$lib/types/music';
import { browser } from '$app/environment';

interface StationCache {
  stations: RadioStation[];
  lastSync: number;
  version: number;
}

interface StationFailures {
  [stationId: string]: {
    count: number;
    lastFailed: number;
  };
}

const CACHE_KEY = 'notemine_radio_stations';
const FAILURES_KEY = 'notemine_radio_failures';
const CACHE_VERSION = 1;
const SYNC_INTERVAL = 1000 * 60 * 60; // 1 hour
const MAX_FAILURES = 3;
const FAILURE_RESET_TIME = 1000 * 60 * 60 * 24; // 24 hours

export class RadioService {
  private pool: SimpleRelayPool;
  private relays: string[] = [...MUSIC_RELAYS];
  private activeSubscriptions = new Map<string, any>();
  private stationsByGenre = new Map<string, RadioStation>();
  private isInitialized = false;
  private stationFailures: StationFailures = {};
  private syncTimer: number | null = null;
  
  constructor() {
    this.pool = new SimpleRelayPool();
    this.loadCache();
    this.loadFailures();
  }

  async initialize() {
    // Prevent multiple initializations
    if (this.isInitialized) {
      console.log('🎵 Radio Service already initialized, skipping...');
      return;
    }
    
    console.log('🎵 Initializing Radio Service...');
    radioStore.setLoading(true);
    
    // Try to load from cache first
    const cached = this.loadFromCache();
    if (cached && cached.length > 0) {
      console.log('💾 Loaded', cached.length, 'stations from cache');
      radioStore.addStations(cached);
      this.isInitialized = true;
      radioStore.setLoading(false);
      
      // Schedule background sync
      this.scheduleSync();
      return;
    }
    
    // No cache or empty cache, fetch from relays
    console.log('🌐 No cache found, fetching from relays...');
    await this.syncStations();
    this.isInitialized = true;
    
    // Schedule periodic sync
    this.scheduleSync();
  }

  private async fetchMusicEvents() {
    console.log('📡 Fetching radio station events from', this.relays.length, 'relays...');
    console.log('📡 Using relays:', this.relays);
    
    // Create filters for radio station events according to NostrRadio spec
    const filters: Filter[] = [
      // Primary: Radio Station Events (kind 31237)
      {
        kinds: [31237],
        limit: 500
      },
      // Also get featured station lists and user favorites (kind 30078)
      {
        kinds: [30078],
        '#l': ['featured_station_list', 'user_favourite_list'],
        limit: 100
      }
    ];

    console.log('📡 Using filters:', JSON.stringify(filters, null, 2));

    // Subscribe to each filter on music relays
    const subscriptionPromises = filters.map(filter => this.subscribeToFilter(filter));
    await Promise.all(subscriptionPromises);

    // Wait for events to come in
    console.log('⏳ Waiting for events to arrive...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('📡 Collected', this.stationsByGenre.size, 'stations so far');
    
    // If no stations collected, create demo stations
    if (this.stationsByGenre.size === 0) {
      console.log('⚠️ No stations found, creating demo stations...');
      this.createDemoStations();
    }
  }

  private async subscribeToFilter(filter: Filter) {
    const subId = crypto.randomUUID();
    
    console.log('🔍 Subscribing with filter:', JSON.stringify(filter));
    
    const subscription = this.pool.req(this.relays, filter).subscribe({
      next: (response) => {
        if (response !== 'EOSE' && typeof response === 'object' && 'id' in response) {
          const event = response as NostrEvent;
          console.log('📥 Received event - Kind:', event.kind, 'Content preview:', event.content?.substring(0, 50));
          this.handleMusicEvent(event);
        } else if (response === 'EOSE') {
          console.log('✅ Subscription complete for filter:', JSON.stringify(filter.kinds || 'all'));
        }
      },
      error: (error) => {
        console.error('❌ Subscription error:', error);
      }
    });

    this.activeSubscriptions.set(subId, subscription);
  }

  private handleMusicEvent(event: NostrEvent) {
    // Handle Radio Station Events (kind 31237)
    if (event.kind === 31237) {
      const station = this.parseRadioStation(event);
      if (station) {
        this.stationsByGenre.set(station.id, station);
        console.log('📻 Found radio station:', station.name, '-', station.genre || 'Unknown genre');
      }
    } 
    // Handle Featured Station Lists (kind 30078)
    else if (event.kind === 30078) {
      console.log('📋 Found station list:', event.id.substring(0, 8));
      // TODO: Parse featured lists and favorites
    }
  }


  private parseRadioStation(event: NostrEvent): RadioStation | null {
    try {
      // Parse content JSON
      const content = JSON.parse(event.content);
      
      // Extract station name from tags
      const nameTag = event.tags.find(tag => tag[0] === 'name');
      const name = nameTag?.[1] || 'Unknown Station';
      
      console.log('📻 Parsing station:', name);
      console.log('📻 Content:', content);
      console.log('📻 Streams:', content.streams);
      
      // Extract other metadata from tags
      const genreTags = event.tags.filter(tag => tag[0] === 't').map(tag => tag[1]);
      const thumbnailTag = event.tags.find(tag => tag[0] === 'thumbnail');
      const websiteTag = event.tags.find(tag => tag[0] === 'website');
      const languageTags = event.tags.filter(tag => tag[0] === 'language').map(tag => tag[1]);
      const locationTag = event.tags.find(tag => tag[0] === 'location');
      
      // Find primary stream
      const primaryStream = content.streams?.find((s: any) => s.primary) || content.streams?.[0];
      
      if (!primaryStream?.url) {
        console.warn('Station has no valid stream URL:', name);
        console.warn('Content was:', content);
        return null;
      }
      
      // Log the stream URL for debugging
      console.log('📻 Stream URL for', name, ':', primaryStream.url);
      
      // Create a dummy track for the station's stream
      const streamTrack: MusicTrack = {
        id: event.id,
        title: name,
        artist: 'Radio Stream',
        url: primaryStream.url,
        pubkey: event.pubkey,
        created_at: event.created_at,
        tags: genreTags,
        event
      };
      
      return {
        id: event.id,
        name,
        description: content.description,
        genre: genreTags[0], // Use first genre as primary
        url: websiteTag?.[1],
        artwork: thumbnailTag?.[1],
        pubkey: event.pubkey,
        tracks: [streamTrack], // Add the stream as a track
        isPlaying: false,
        currentTrack: streamTrack,
        event // Include the event for reactions
      };
    } catch (error) {
      console.error('Failed to parse radio station event:', error);
      return null;
    }
  }

  private parseMusicTrack(event: NostrEvent): MusicTrack | null {
    // First try the music event parser
    const musicTrack = parseMusicEvent(event);
    if (musicTrack) return musicTrack;

    // For regular notes, look for music URLs in content
    if (event.kind === 1 || event.kind === 30023) {
      const urls = this.extractMusicUrls(event.content);
      if (urls.length > 0) {
        // Extract metadata from tags
        const titleMatch = event.content.match(/(?:title|track|song):\s*([^\n]+)/i);
        const artistMatch = event.content.match(/(?:artist|by):\s*([^\n]+)/i);
        
        // Also check for r tags (references) that might contain music URLs
        const rTags = event.tags.filter(t => t[0] === 'r' && t[1]);
        const rUrls = rTags.map(t => t[1]).filter(url => this.isMusicUrl(url));
        
        const allUrls = [...urls, ...rUrls];
        if (allUrls.length > 0) {
          return {
            id: event.id,
            title: titleMatch?.[1]?.trim() || 'Untitled Track',
            artist: artistMatch?.[1]?.trim(),
            url: allUrls[0],
            pubkey: event.pubkey,
            created_at: event.created_at,
            tags: event.tags.filter(t => t[0] === 't').map(t => t[1]),
            event
          };
        }
      }
    }

    return null;
  }

  private extractMusicUrls(content: string): string[] {
    const urls: string[] = [];
    
    // Common music streaming patterns
    const patterns = [
      /https?:\/\/(?:www\.)?wavlake\.com\/track\/[^\s]+/gi,
      /https?:\/\/(?:www\.)?soundcloud\.com\/[^\s]+/gi,
      /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[^\s]+/gi,
      /https?:\/\/(?:www\.)?youtu\.be\/[^\s]+/gi,
      /https?:\/\/(?:www\.)?spotify\.com\/track\/[^\s]+/gi,
      /https?:\/\/[^\s]+\.(?:mp3|m4a|wav|ogg|opus|flac)(?:\?[^\s]*)?/gi,
      /https?:\/\/(?:www\.)?mixcloud\.com\/[^\s]+/gi,
      /https?:\/\/(?:www\.)?bandcamp\.com\/track\/[^\s]+/gi
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        urls.push(...matches);
      }
    });

    return [...new Set(urls)]; // Remove duplicates
  }

  private isMusicUrl(url: string): boolean {
    const musicPatterns = [
      /wavlake\.com\/track/i,
      /soundcloud\.com/i,
      /youtube\.com\/watch/i,
      /youtu\.be/i,
      /spotify\.com\/track/i,
      /\.(?:mp3|m4a|wav|ogg|opus|flac)(?:\?|$)/i,
      /mixcloud\.com/i,
      /bandcamp\.com\/track/i
    ];

    return musicPatterns.some(pattern => pattern.test(url));
  }

  private createStationsFromTracks() {
    const stations = Array.from(this.stationsByGenre.values());
    
    if (stations.length === 0) {
      console.warn('No stations collected');
      this.createDemoStations();
      return;
    }

    // Add stations to store
    radioStore.addStations(stations);
    console.log('📻 Added', stations.length, 'radio stations to store');
  }

  private createDemoStations() {
    // Create demo stations with actual working stream URLs
    const demoStations: RadioStation[] = [
      {
        id: crypto.randomUUID(),
        name: 'SomaFM - Drone Zone',
        description: 'Served best chilled, safe with most medications. Atmospheric textures with minimal beats.',
        genre: 'Ambient',
        url: 'https://somafm.com/dronezone/',
        pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
        tracks: [{
          id: 'soma-drone-1',
          title: 'Drone Zone Stream',
          artist: 'SomaFM',
          url: 'https://ice1.somafm.com/dronezone-128-mp3',
          pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
          created_at: Date.now() / 1000
        }],
        isPlaying: false,
        currentTrack: {
          id: 'soma-drone-1',
          title: 'Drone Zone Stream',
          artist: 'SomaFM',
          url: 'https://ice1.somafm.com/dronezone-128-mp3',
          pubkey: '0000000000000000000000000000000000000000000000000000000000000001',
          created_at: Date.now() / 1000
        }
      },
      {
        id: crypto.randomUUID(),
        name: 'SomaFM - DEF CON Radio',
        description: 'Music for Hacking. The DEF CON Year-Round Channel.',
        genre: 'Electronic',
        url: 'https://somafm.com/defcon/',
        pubkey: '0000000000000000000000000000000000000000000000000000000000000002',
        tracks: [{
          id: 'soma-defcon-1',
          title: 'DEF CON Radio Stream',
          artist: 'SomaFM',
          url: 'https://ice1.somafm.com/defcon-128-mp3',
          pubkey: '0000000000000000000000000000000000000000000000000000000000000002',
          created_at: Date.now() / 1000
        }],
        isPlaying: false,
        currentTrack: {
          id: 'soma-defcon-1',
          title: 'DEF CON Radio Stream',
          artist: 'SomaFM',
          url: 'https://ice1.somafm.com/defcon-128-mp3',
          pubkey: '0000000000000000000000000000000000000000000000000000000000000002',
          created_at: Date.now() / 1000
        }
      },
      {
        id: crypto.randomUUID(),
        name: 'SomaFM - Space Station Soma',
        description: 'Tune in, turn on, space out. Spaced-out ambient and mid-tempo electronica.',
        genre: 'Ambient',
        url: 'https://somafm.com/spacestation/',
        pubkey: '0000000000000000000000000000000000000000000000000000000000000003',
        tracks: [{
          id: 'soma-space-1',
          title: 'Space Station Soma Stream',
          artist: 'SomaFM',
          url: 'https://ice1.somafm.com/spacestation-128-mp3',
          pubkey: '0000000000000000000000000000000000000000000000000000000000000003',
          created_at: Date.now() / 1000
        }],
        isPlaying: false,
        currentTrack: {
          id: 'soma-space-1',
          title: 'Space Station Soma Stream',
          artist: 'SomaFM',
          url: 'https://ice1.somafm.com/spacestation-128-mp3',
          pubkey: '0000000000000000000000000000000000000000000000000000000000000003',
          created_at: Date.now() / 1000
        }
      }
    ];
    
    radioStore.addStations(demoStations);
    console.log('📻 Added', demoStations.length, 'demo stations with working streams');
  }

  async addCustomRelay(relayUrl: string) {
    if (!this.relays.includes(relayUrl)) {
      this.relays.push(relayUrl);
      console.log('➕ Added custom relay:', relayUrl);
      
      // Fetch music events from the new relay
      radioStore.setLoading(true);
      await this.fetchMusicEvents();
      this.createStationsFromTracks();
      radioStore.setLoading(false);
    }
  }

  removeRelay(relayUrl: string) {
    const index = this.relays.indexOf(relayUrl);
    if (index > -1) {
      this.relays.splice(index, 1);
      console.log('➖ Removed relay:', relayUrl);
    }
  }

  getActiveRelays(): string[] {
    return [...this.relays];
  }

  cleanup() {
    // Unsubscribe from all active subscriptions
    this.activeSubscriptions.forEach(sub => sub.unsubscribe());
    this.activeSubscriptions.clear();
    
    // Clear collected data
    this.stationsByGenre.clear();
    
    // Reset initialization flag
    this.isInitialized = false;
    
    // Cleanup radio store
    radioStore.cleanup();
  }
  
  // Expose audio elements for visualization
  getAudioElement(): HTMLAudioElement | null {
    return radioStore.getAudioElement();
  }
  
  getAudioContext(): AudioContext | null {
    return radioStore.getAudioContext();
  }
  
  getAnalyser(): AnalyserNode | null {
    return radioStore.getAnalyser();
  }
  
  // Cache management
  private loadCache() {
    if (!browser) return;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data: StationCache = JSON.parse(cached);
        if (data.version === CACHE_VERSION) {
          // Check if cache is still fresh
          const age = Date.now() - data.lastSync;
          if (age < SYNC_INTERVAL * 24) { // Keep cache for up to 24 hours
            return data;
          }
        }
      }
    } catch (error) {
      console.error('Failed to load station cache:', error);
    }
    return null;
  }
  
  private saveCache(stations: RadioStation[]) {
    if (!browser) return;
    try {
      const cache: StationCache = {
        stations,
        lastSync: Date.now(),
        version: CACHE_VERSION
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('Failed to save station cache:', error);
    }
  }
  
  private loadFromCache(): RadioStation[] {
    const cached = this.loadCache();
    if (!cached) return [];
    
    // Filter out stations that have failed too many times
    const validStations = cached.stations.filter(station => {
      const failures = this.stationFailures[station.id];
      if (!failures) return true;
      
      // Reset old failures
      if (Date.now() - failures.lastFailed > FAILURE_RESET_TIME) {
        delete this.stationFailures[station.id];
        this.saveFailures();
        return true;
      }
      
      return failures.count < MAX_FAILURES;
    });
    
    // Rebuild genre map
    this.stationsByGenre.clear();
    validStations.forEach(station => {
      const genre = station.genre || 'various';
      this.stationsByGenre.set(genre.toLowerCase(), station);
    });
    
    return validStations;
  }
  
  private loadFailures() {
    if (!browser) return;
    try {
      const failures = localStorage.getItem(FAILURES_KEY);
      if (failures) {
        this.stationFailures = JSON.parse(failures);
      }
    } catch (error) {
      console.error('Failed to load station failures:', error);
    }
  }
  
  private saveFailures() {
    if (!browser) return;
    try {
      localStorage.setItem(FAILURES_KEY, JSON.stringify(this.stationFailures));
    } catch (error) {
      console.error('Failed to save station failures:', error);
    }
  }
  
  recordStationFailure(stationId: string) {
    if (!this.stationFailures[stationId]) {
      this.stationFailures[stationId] = { count: 0, lastFailed: 0 };
    }
    
    this.stationFailures[stationId].count++;
    this.stationFailures[stationId].lastFailed = Date.now();
    this.saveFailures();
    
    console.log(`🚫 Station ${stationId} failed ${this.stationFailures[stationId].count} times`);
    
    // Remove from active stations if it exceeds failure threshold
    if (this.stationFailures[stationId].count >= MAX_FAILURES) {
      const stations = radioStore.getStations();
      const filtered = stations.filter(s => s.id !== stationId);
      if (filtered.length < stations.length) {
        radioStore.clearStations();
        radioStore.addStations(filtered);
        console.log(`❌ Removed station ${stationId} due to repeated failures`);
      }
    }
  }
  
  private scheduleSync() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    
    // Schedule next sync
    this.syncTimer = window.setTimeout(() => {
      console.log('🔄 Running scheduled station sync...');
      this.syncStations();
    }, SYNC_INTERVAL);
  }
  
  private async syncStations() {
    radioStore.setLoading(true);
    
    try {
      // Clear any existing stations
      radioStore.clearStations();
      this.stationsByGenre.clear();
      
      // Fetch fresh data
      await this.fetchMusicEvents();
      
      // Create stations from collected tracks
      this.createStationsFromTracks();
      
      // Save to cache
      const stations = Array.from(this.stationsByGenre.values());
      this.saveCache(stations);
      
      console.log('🎵 Synced', stations.length, 'stations');
    } catch (error) {
      console.error('Failed to sync stations:', error);
    } finally {
      radioStore.setLoading(false);
      // Schedule next sync
      this.scheduleSync();
    }
  }
}

// Create singleton instance
export const radioService = new RadioService();

// Make radioService available globally for error handlers
if (browser && typeof window !== 'undefined') {
  (window as any).radioService = radioService;
}