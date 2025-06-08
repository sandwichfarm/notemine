import MiniSearch from 'minisearch';
import { writable, get } from 'svelte/store';
import type { NostrEvent } from '$lib/types/nostr';
import { SimplePool } from 'nostr-tools/pool';
import { browser } from '$app/environment';

export interface RadioStation {
  id: string;
  pubkey: string;
  created_at: number;
  name: string;
  description?: string;
  website?: string;
  thumbnail?: string;
  language?: string;
  countryCode?: string;
  location?: string;
  genres: string[];
  tags: string[];
  streams: Array<{
    url: string;
    format?: string;
    quality?: {
      bitrate?: number;
      codec?: string;
      sampleRate?: number;
    };
    primary?: boolean;
  }>;
  lastSeen: number;
  isOnline: boolean;
}

// Language codes and their display names
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' }
];

// Music genres and descriptors
export const MUSIC_GENRES = [
  // Major genres
  'rock', 'pop', 'jazz', 'classical', 'electronic', 'hip-hop', 'rap', 'country', 
  'blues', 'soul', 'funk', 'reggae', 'metal', 'punk', 'indie', 'alternative',
  'world', 'folk', 'latin', 'dance', 'house', 'techno', 'trance', 'drum-and-bass',
  'dubstep', 'ambient', 'experimental', 'noise', 'industrial',
  
  // Sub-genres and descriptors
  'psychedelic', 'progressive', 'hard-rock', 'soft-rock', 'classic-rock',
  'synth-pop', 'dream-pop', 'k-pop', 'j-pop', 'bebop', 'smooth-jazz', 'acid-jazz',
  'baroque', 'romantic', 'contemporary-classical', 'minimal', 'breakbeat',
  'trip-hop', 'lo-fi', 'chillout', 'downtempo', 'uplifting', 'melodic',
  'acoustic', 'instrumental', 'vocal', 'a-cappella', 'orchestral', 'chamber',
  'opera', 'musical-theatre', 'soundtrack', 'video-game', 'anime',
  
  // Regional/Cultural
  'afrobeat', 'bollywood', 'celtic', 'flamenco', 'tango', 'samba', 'bossa-nova',
  'mariachi', 'klezmer', 'polka', 'bluegrass', 'gospel', 'spiritual',
  'traditional', 'ethnic', 'tribal', 'fusion',
  
  // Era/Period
  '50s', '60s', '70s', '80s', '90s', '2000s', '2010s', '2020s',
  'oldies', 'retro', 'vintage', 'modern', 'contemporary',
  
  // Mood/Atmosphere
  'chill', 'relaxing', 'energetic', 'dark', 'upbeat', 'melancholic',
  'romantic', 'party', 'study', 'workout', 'meditation', 'sleep'
];

class RadioSearchService {
  private miniSearch: MiniSearch<RadioStation>;
  private pool = new SimplePool();
  private stations = new Map<string, RadioStation>();
  private updateInterval?: number;
  
  // Stores
  public searchResults = writable<RadioStation[]>([]);
  public allStations = writable<RadioStation[]>([]);
  public isLoading = writable(false);
  public selectedLanguages = writable<Set<string>>(new Set());
  public selectedGenres = writable<Set<string>>(new Set());
  
  // Cache settings
  private readonly CACHE_KEY = 'notemine-radio-stations';
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour
  private readonly PRUNE_OFFLINE_AFTER = 1000 * 60 * 60 * 24 * 7; // 7 days
  
  // Relay configuration
  private readonly RADIO_RELAYS = [
    'wss://relay.wavefunc.io',
    'wss://relay.wavman.app',
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol'
  ];
  
  constructor() {
    // Initialize MiniSearch with fields to index
    this.miniSearch = new MiniSearch({
      fields: ['name', 'description', 'genres', 'tags', 'language', 'location'],
      storeFields: ['id', 'name', 'description', 'thumbnail', 'language', 'genres', 'tags'],
      searchOptions: {
        boost: {
          name: 2,
          genres: 1.5,
          tags: 1.5,
          description: 1
        },
        fuzzy: 0.2,
        prefix: true
      }
    });
    
    if (browser) {
      this.loadFromCache();
      this.startDiscovery();
      this.startPeriodicUpdates();
    }
  }
  
  /**
   * Load cached stations from localStorage
   */
  private loadFromCache() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.timestamp && Date.now() - data.timestamp < this.CACHE_DURATION) {
          data.stations.forEach((station: RadioStation) => {
            this.stations.set(station.id, station);
          });
          this.rebuildIndex();
          console.log(`Loaded ${this.stations.size} stations from cache`);
        }
      }
    } catch (error) {
      console.error('Failed to load radio stations from cache:', error);
    }
  }
  
  /**
   * Save stations to cache
   */
  private saveToCache() {
    if (!browser) return;
    
    try {
      const data = {
        timestamp: Date.now(),
        stations: Array.from(this.stations.values())
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to cache radio stations:', error);
    }
  }
  
  /**
   * Start discovering radio stations
   */
  private async startDiscovery() {
    this.isLoading.set(true);
    
    try {
      // Subscribe to radio station events (kind 31237)
      const sub = this.pool.subscribeMany(
        this.RADIO_RELAYS,
        [{ kinds: [31237], limit: 500 }],
        {
          onevent: (event: NostrEvent) => {
            this.processRadioEvent(event);
          },
          oneose: () => {
            console.log('Initial radio station discovery complete');
            this.isLoading.set(false);
            this.saveToCache();
          }
        }
      );
      
      // Close subscription after 30 seconds
      setTimeout(() => {
        sub.close();
        this.isLoading.set(false);
      }, 30000);
      
    } catch (error) {
      console.error('Failed to discover radio stations:', error);
      this.isLoading.set(false);
    }
  }
  
  /**
   * Process a radio station event
   */
  private processRadioEvent(event: NostrEvent) {
    try {
      // Parse content
      const content = JSON.parse(event.content);
      
      // Extract metadata from tags
      const tags = new Map(event.tags.map(tag => [tag[0], tag.slice(1)]));
      
      // Build station object
      const station: RadioStation = {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        name: tags.get('name')?.[0] || 'Unknown Station',
        description: content.description,
        website: tags.get('website')?.[0],
        thumbnail: tags.get('thumbnail')?.[0],
        language: tags.get('language')?.[0],
        countryCode: tags.get('countryCode')?.[0],
        location: tags.get('location')?.[0],
        genres: tags.get('t') || [],
        tags: tags.get('t') || [],
        streams: content.streams || [],
        lastSeen: Date.now(),
        isOnline: true
      };
      
      // Add or update station
      this.stations.set(station.id, station);
      
      // Update search index
      if (this.miniSearch.has(station.id)) {
        this.miniSearch.remove(station);
      }
      this.miniSearch.add(station);
      
      // Update stores
      this.allStations.set(Array.from(this.stations.values()));
      
    } catch (error) {
      console.error('Failed to process radio event:', error, event);
    }
  }
  
  /**
   * Rebuild the search index
   */
  private rebuildIndex() {
    this.miniSearch.removeAll();
    this.miniSearch.addAll(Array.from(this.stations.values()));
    this.allStations.set(Array.from(this.stations.values()));
  }
  
  /**
   * Start periodic updates to check for new stations and prune offline ones
   */
  private startPeriodicUpdates() {
    // Update every 5 minutes
    this.updateInterval = window.setInterval(() => {
      this.checkForNewStations();
      this.pruneOfflineStations();
    }, 5 * 60 * 1000);
  }
  
  /**
   * Check for new stations
   */
  private async checkForNewStations() {
    const since = Math.floor(Date.now() / 1000) - 3600; // Last hour
    
    const sub = this.pool.subscribeMany(
      this.RADIO_RELAYS,
      [{ kinds: [31237], since }],
      {
        onevent: (event: NostrEvent) => {
          this.processRadioEvent(event);
        }
      }
    );
    
    // Close after 10 seconds
    setTimeout(() => {
      sub.close();
      this.saveToCache();
    }, 10000);
  }
  
  /**
   * Remove stations that haven't been seen in a while
   */
  private pruneOfflineStations() {
    const now = Date.now();
    const pruned: string[] = [];
    
    for (const [id, station] of this.stations) {
      if (now - station.lastSeen > this.PRUNE_OFFLINE_AFTER) {
        pruned.push(id);
        this.stations.delete(id);
        this.miniSearch.remove(station);
      }
    }
    
    if (pruned.length > 0) {
      console.log(`Pruned ${pruned.length} offline stations`);
      this.allStations.set(Array.from(this.stations.values()));
      this.saveToCache();
    }
  }
  
  /**
   * Search for stations
   */
  search(query: string, limit: number = 15): RadioStation[] {
    if (!query.trim()) {
      // Return filtered stations based on selected languages/genres
      return this.getFilteredStations().slice(0, limit);
    }
    
    // Search with MiniSearch
    const results = this.miniSearch.search(query, {
      filter: (result) => {
        const station = this.stations.get(result.id);
        if (!station) return false;
        
        // Apply language filter
        const languages = get(this.selectedLanguages);
        if (languages.size > 0 && station.language && !languages.has(station.language)) {
          return false;
        }
        
        // Apply genre filter
        const genres = get(this.selectedGenres);
        if (genres.size > 0) {
          const stationGenres = new Set(station.genres.map(g => g.toLowerCase()));
          const hasMatchingGenre = Array.from(genres).some(g => stationGenres.has(g));
          if (!hasMatchingGenre) return false;
        }
        
        return true;
      }
    });
    
    // Convert results to stations
    const stations = results
      .slice(0, limit)
      .map(result => this.stations.get(result.id))
      .filter(Boolean) as RadioStation[];
    
    this.searchResults.set(stations);
    return stations;
  }
  
  /**
   * Get filtered stations based on selected languages and genres
   */
  private getFilteredStations(): RadioStation[] {
    const languages = get(this.selectedLanguages);
    const genres = get(this.selectedGenres);
    
    return Array.from(this.stations.values()).filter(station => {
      // Language filter
      if (languages.size > 0 && station.language && !languages.has(station.language)) {
        return false;
      }
      
      // Genre filter
      if (genres.size > 0) {
        const stationGenres = new Set(station.genres.map(g => g.toLowerCase()));
        const hasMatchingGenre = Array.from(genres).some(g => stationGenres.has(g));
        if (!hasMatchingGenre) return false;
      }
      
      return true;
    });
  }
  
  /**
   * Toggle language filter
   */
  toggleLanguage(language: string) {
    this.selectedLanguages.update(langs => {
      if (langs.has(language)) {
        langs.delete(language);
      } else {
        langs.add(language);
      }
      return langs;
    });
  }
  
  /**
   * Toggle genre filter
   */
  toggleGenre(genre: string) {
    this.selectedGenres.update(genres => {
      if (genres.has(genre)) {
        genres.delete(genre);
      } else {
        genres.add(genre);
      }
      return genres;
    });
  }
  
  /**
   * Clear all filters
   */
  clearFilters() {
    this.selectedLanguages.set(new Set());
    this.selectedGenres.set(new Set());
  }
  
  /**
   * Get a station by ID
   */
  getStation(id: string): RadioStation | undefined {
    return this.stations.get(id);
  }
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

// Export singleton instance
export const radioSearch = new RadioSearchService();