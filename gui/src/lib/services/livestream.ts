import { SimplePool } from 'nostr-tools/pool';
import { writable, get } from 'svelte/store';
import type { LiveStream, LiveStreamState } from '$lib/types/livestream';
import { LIVESTREAM_RELAYS, parseLiveStreamEvent, isVideoUrlSupported } from '$lib/types/livestream';
import type { NostrEvent, Filter } from '$lib/types/nostr';
import { browser } from '$app/environment';
import { soundService } from './sound';

export const livestreamStore = writable<LiveStreamState>({
  streams: [],
  currentStream: null,
  isLoading: false,
  isPlaying: false,
  error: null,
  volume: 0.7,
  showStatic: false
});

class LiveStreamService {
  private pool = new SimplePool();
  private streams = new Map<string, LiveStream>();
  private activeSubscriptions = new Set<any>();
  private videoElement: HTMLVideoElement | null = null;
  private staticElement: HTMLVideoElement | null = null;
  private currentStreamId: string | null = null;
  
  // Cache settings
  private readonly CACHE_KEY = 'hypergate-livestreams';
  private readonly CACHE_DURATION = 1000 * 60 * 5; // 5 minutes
  private readonly PRUNE_OFFLINE_AFTER = 1000 * 60 * 60 * 2; // 2 hours
  
  constructor() {
    if (browser) {
      this.loadFromCache();
      this.initializeDiscovery();
      this.setupStaticVideo();
    }
  }
  
  private loadFromCache() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.timestamp && Date.now() - data.timestamp < this.CACHE_DURATION) {
          data.streams.forEach((stream: LiveStream) => {
            this.streams.set(stream.id, stream);
          });
          this.updateStore();
          console.log(`📺 Loaded ${this.streams.size} streams from cache`);
        }
      }
    } catch (error) {
      console.error('Failed to load livestreams from cache:', error);
    }
  }
  
  private saveToCache() {
    if (!browser) return;
    
    try {
      const data = {
        timestamp: Date.now(),
        streams: Array.from(this.streams.values())
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to cache livestreams:', error);
    }
  }
  
  private async initializeDiscovery() {
    livestreamStore.update(state => ({ ...state, isLoading: true }));
    
    // Subscribe to live stream events (kind 30311)
    const filter: Filter = {
      kinds: [30311],
      limit: 100
    };
    
    console.log('📺 Discovering live streams from relays:', LIVESTREAM_RELAYS);
    
    const sub = this.pool.subscribeMany(
      LIVESTREAM_RELAYS,
      [filter],
      {
        onevent: (event: NostrEvent) => {
          this.processLiveStreamEvent(event);
        },
        oneose: () => {
          console.log('📺 Initial livestream discovery complete');
          livestreamStore.update(state => ({ ...state, isLoading: false }));
          this.saveToCache();
        }
      }
    );
    
    this.activeSubscriptions.add(sub);
    
    // Close subscription after 30 seconds
    setTimeout(() => {
      sub.close();
      livestreamStore.update(state => ({ ...state, isLoading: false }));
    }, 30000);
    
    // Start periodic updates
    this.startPeriodicUpdates();
  }
  
  private processLiveStreamEvent(event: NostrEvent) {
    const stream = parseLiveStreamEvent(event);
    if (stream) {
      // Only include live or recently live streams
      if (stream.status === 'live' || (stream.status === 'offline' && stream.lastSeen > Date.now() - this.PRUNE_OFFLINE_AFTER)) {
        this.streams.set(stream.id, stream);
        console.log(`📺 Found stream: ${stream.title} [${stream.status}]`);
        this.updateStore();
      }
    }
  }
  
  private updateStore() {
    const streams = Array.from(this.streams.values())
      .filter(stream => stream.status === 'live' || stream.lastSeen > Date.now() - this.PRUNE_OFFLINE_AFTER)
      .sort((a, b) => {
        // Sort by status (live first), then by participants, then by recency
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (b.status === 'live' && a.status !== 'live') return 1;
        if (a.participants !== b.participants) return (b.participants || 0) - (a.participants || 0);
        return b.lastSeen - a.lastSeen;
      });
    
    livestreamStore.update(state => ({ ...state, streams }));
  }
  
  private startPeriodicUpdates() {
    // Update every 2 minutes
    setInterval(() => {
      this.checkForNewStreams();
      this.pruneOfflineStreams();
    }, 2 * 60 * 1000);
  }
  
  private async checkForNewStreams() {
    const since = Math.floor(Date.now() / 1000) - 300; // Last 5 minutes
    
    const sub = this.pool.subscribeMany(
      LIVESTREAM_RELAYS,
      [{ kinds: [30311], since }],
      {
        onevent: (event: NostrEvent) => {
          this.processLiveStreamEvent(event);
        }
      }
    );
    
    // Close after 10 seconds
    setTimeout(() => {
      sub.close();
      this.saveToCache();
    }, 10000);
  }
  
  private pruneOfflineStreams() {
    const now = Date.now();
    const pruned: string[] = [];
    
    for (const [id, stream] of this.streams) {
      if (stream.status === 'offline' && now - stream.lastSeen > this.PRUNE_OFFLINE_AFTER) {
        pruned.push(id);
        this.streams.delete(id);
      }
    }
    
    if (pruned.length > 0) {
      console.log(`📺 Pruned ${pruned.length} offline streams`);
      this.updateStore();
      this.saveToCache();
    }
  }
  
  private setupStaticVideo() {
    if (!browser) return;
    
    // Create static video element for transition effect
    this.staticElement = document.createElement('video');
    this.staticElement.style.display = 'none';
    this.staticElement.muted = false;
    this.staticElement.loop = true;
    
    // Generate static video source (we'll use CSS animation instead)
    document.body.appendChild(this.staticElement);
  }
  
  async playStream(streamId: string, videoElement: HTMLVideoElement) {
    const stream = this.streams.get(streamId);
    if (!stream || !stream.streamUrl) {
      console.error('Stream not found or no URL:', streamId);
      return;
    }
    
    // Stop any currently playing stream
    this.stopAllStreams();
    
    // Set current stream
    this.currentStreamId = streamId;
    this.videoElement = videoElement;
    
    // Update store
    livestreamStore.update(state => ({
      ...state,
      currentStream: stream,
      showStatic: true,
      error: null
    }));
    
    // Play static sound
    soundService.playStatic();
    
    try {
      // Check if URL is supported
      if (!isVideoUrlSupported(stream.streamUrl)) {
        throw new Error('Unsupported video format');
      }
      
      // Configure video element
      videoElement.volume = get(livestreamStore).volume;
      videoElement.muted = false;
      videoElement.autoplay = true;
      videoElement.controls = false;
      
      // Set up event listeners
      videoElement.onloadstart = () => {
        console.log('📺 Stream loading started');
      };
      
      videoElement.oncanplay = () => {
        console.log('📺 Stream ready to play');
        // Hide static and show video
        livestreamStore.update(state => ({
          ...state,
          showStatic: false,
          isPlaying: true
        }));
        soundService.stopStatic();
      };
      
      videoElement.onplay = () => {
        livestreamStore.update(state => ({ ...state, isPlaying: true }));
      };
      
      videoElement.onpause = () => {
        livestreamStore.update(state => ({ ...state, isPlaying: false }));
      };
      
      videoElement.onerror = (e) => {
        console.error('📺 Stream playback error:', e);
        livestreamStore.update(state => ({
          ...state,
          isPlaying: false,
          showStatic: false,
          error: 'Failed to load stream. The stream may be offline or incompatible.'
        }));
        soundService.stopStatic();
      };
      
      videoElement.onended = () => {
        this.nextStream();
      };
      
      // Start loading the stream
      videoElement.src = stream.streamUrl;
      await videoElement.load();
      
    } catch (error) {
      console.error('📺 Failed to play stream:', error);
      livestreamStore.update(state => ({
        ...state,
        isPlaying: false,
        showStatic: false,
        error: 'Failed to play stream'
      }));
      soundService.stopStatic();
    }
  }
  
  stopStream() {
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement = null;
    }
    
    this.currentStreamId = null;
    soundService.stopStatic();
    
    livestreamStore.update(state => ({
      ...state,
      currentStream: null,
      isPlaying: false,
      showStatic: false
    }));
  }
  
  stopAllStreams() {
    // Stop all video elements in the page
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (!video.paused) {
        video.pause();
      }
    });
    
    this.stopStream();
  }
  
  nextStream() {
    const state = get(livestreamStore);
    if (state.streams.length === 0) return;
    
    // Find next stream
    let nextStream: LiveStream;
    if (state.currentStream) {
      const currentIndex = state.streams.findIndex(s => s.id === state.currentStream!.id);
      const nextIndex = (currentIndex + 1) % state.streams.length;
      nextStream = state.streams[nextIndex];
    } else {
      nextStream = state.streams[0];
    }
    
    // Find the video element (we'll need to pass this from the component)
    const videoElement = this.videoElement;
    if (videoElement) {
      this.playStream(nextStream.id, videoElement);
    }
  }
  
  setVolume(volume: number) {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    if (this.videoElement) {
      this.videoElement.volume = clampedVolume;
    }
    
    livestreamStore.update(state => ({ ...state, volume: clampedVolume }));
  }
  
  addCustomStream(url: string, title?: string): boolean {
    if (!isVideoUrlSupported(url)) {
      return false;
    }
    
    // Create a custom stream object
    const customStream: LiveStream = {
      id: `custom-${Date.now()}`,
      title: title || 'Custom Stream',
      status: 'live',
      streamUrl: url,
      tags: ['custom'],
      host: { pubkey: 'local' },
      relays: [],
      event: null as any, // Custom streams don't have events
      isPlaying: false,
      lastSeen: Date.now()
    };
    
    this.streams.set(customStream.id, customStream);
    this.updateStore();
    return true;
  }
  
  getStreamCount(): number {
    return this.streams.size;
  }
  
  getCurrentStream(): LiveStream | null {
    return get(livestreamStore).currentStream;
  }
  
  destroy() {
    // Close all subscriptions
    this.activeSubscriptions.forEach(sub => {
      try {
        sub.close();
      } catch (error) {
        console.warn('Error closing livestream subscription:', error);
      }
    });
    this.activeSubscriptions.clear();
    
    // Clean up video elements
    this.stopStream();
    
    if (this.staticElement) {
      document.body.removeChild(this.staticElement);
      this.staticElement = null;
    }
  }
}

export const livestreamService = new LiveStreamService();