import type { NostrEvent } from './nostr';

export interface LiveStream {
  id: string;
  title: string;
  summary?: string;
  image?: string;
  status: 'live' | 'offline' | 'scheduled';
  streamUrl?: string;
  participants?: number;
  tags: string[];
  host: {
    pubkey: string;
    relay?: string;
  };
  relays: string[];
  starts?: number;
  service?: string;
  event: NostrEvent;
  isPlaying: boolean;
  lastSeen: number;
}

export interface LiveStreamState {
  streams: LiveStream[];
  currentStream: LiveStream | null;
  isLoading: boolean;
  isPlaying: boolean;
  error: string | null;
  volume: number;
  showStatic: boolean;
}

// Default relays for discovering live streams
export const LIVESTREAM_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.fountain.fm'
];

// Supported video formats
export const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'application/x-mpegURL', // HLS
  'application/vnd.apple.mpegurl', // HLS
  'application/dash+xml', // DASH
  'video/x-flv',
  'video/quicktime'
];

// Static noise patterns for visual effect
export const STATIC_PATTERNS = [
  '▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░',
  '█▓▒░█▓▒░█▓▒░█▓▒░█▓▒░█▓▒░',
  '░▒▓█░▒▓█░▒▓█░▒▓█░▒▓█░▒▓█',
  '▒▓░█▒▓░█▒▓░█▒▓░█▒▓░█▒▓░█',
  '▓█░▒▓█░▒▓█░▒▓█░▒▓█░▒▓█░▒'
];

export function parseLiveStreamEvent(event: NostrEvent): LiveStream | null {
  if (event.kind !== 30311) return null;
  
  try {
    const tags = new Map(event.tags.map(tag => [tag[0], tag.slice(1)]));
    
    // Extract basic info
    const title = tags.get('title')?.[0] || tags.get('d')?.[0] || 'Untitled Stream';
    const summary = tags.get('summary')?.[0];
    const image = tags.get('image')?.[0];
    const status = (tags.get('status')?.[0] as 'live' | 'offline' | 'scheduled') || 'offline';
    const streamUrl = tags.get('streaming')?.[0];
    const participants = parseInt(tags.get('current_participants')?.[0] || '0');
    const starts = parseInt(tags.get('starts')?.[0] || '0');
    const service = tags.get('service')?.[0];
    
    // Extract host info
    const hostTag = event.tags.find(tag => tag[0] === 'p' && tag[3] === 'host');
    const host = {
      pubkey: hostTag?.[1] || event.pubkey,
      relay: hostTag?.[2]
    };
    
    // Extract relays
    const relays = tags.get('relays') || [];
    
    // Extract content tags
    const contentTags = event.tags
      .filter(tag => tag[0] === 't')
      .map(tag => tag[1])
      .filter(Boolean);
    
    return {
      id: event.id,
      title,
      summary,
      image,
      status,
      streamUrl,
      participants,
      tags: contentTags,
      host,
      relays,
      starts,
      service,
      event,
      isPlaying: false,
      lastSeen: Date.now()
    };
  } catch (error) {
    console.error('Failed to parse live stream event:', error);
    return null;
  }
}

export function isVideoUrlSupported(url: string): boolean {
  // Check for common video streaming patterns
  const patterns = [
    /\.m3u8$/i, // HLS
    /\.mpd$/i,  // DASH
    /\.mp4$/i,
    /\.webm$/i,
    /\.ogg$/i,
    /\.mov$/i,
    /\.avi$/i,
    /\.flv$/i,
    /youtube\.com\/watch/i,
    /youtu\.be\//i,
    /twitch\.tv\//i,
    /vimeo\.com\//i,
    /dailymotion\.com\//i
  ];
  
  return patterns.some(pattern => pattern.test(url));
}