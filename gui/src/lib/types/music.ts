import type { NostrEvent } from './nostr';

// Music-related event kinds based on various music NIPs
export const MUSIC_EVENT_KINDS = {
  TRACK: 31337,           // Individual track/song
  ALBUM: 31338,           // Album/release
  PLAYLIST: 30005,        // Playlist
  ARTIST: 31989,          // Artist profile
  LABEL: 31990,           // Record label
  PODCAST: 31991,         // Podcast show
  PODCAST_EPISODE: 31992, // Podcast episode
  RADIO_SHOW: 31993,      // Radio show/stream
  MIX: 31994,            // DJ mix/set
  LIVE_EVENT: 31995,     // Live performance/concert
} as const;

export type MusicEventKind = typeof MUSIC_EVENT_KINDS[keyof typeof MUSIC_EVENT_KINDS];

export interface MusicTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  url?: string;
  artwork?: string;
  genre?: string[];
  tags?: string[];
  pubkey: string;
  created_at: number;
  event?: NostrEvent;
}

export interface RadioStation {
  id: string;
  name: string;
  description?: string;
  genre?: string;
  url?: string;
  artwork?: string;
  pubkey: string;
  tracks: MusicTrack[];
  currentTrack?: MusicTrack;
  isPlaying: boolean;
  lastPlayed?: number;
  event?: NostrEvent; // The original event for reactions
}

// Default music relays - configurable
export const DEFAULT_MUSIC_RELAYS = [
  'wss://relay.nostr.band',     // Nostr Band relay
  'wss://relay.damus.io',       // Damus relay  
  'wss://relay.primal.net',     // Primal relay
  'wss://relay.wavefunc.live'   // Wavefunc relay for radio stations
];

// Additional known music relays
export const ADDITIONAL_MUSIC_RELAYS = [
  'wss://relay.stemstr.app',
  'wss://relay.wavlake.com',
  'wss://relay.tunestr.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.nostr.wirednet.jp',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.nostr.info',
  'wss://nostr.mom',
  'wss://nostr.oxtr.dev',
  'wss://relay.nostrplebs.com',
  'wss://relay.nostrati.com',
  'wss://relay.nostr.bg',
  'wss://nostr.bitcoiner.social',
  'wss://nostr.rocks',
  'wss://nostr.fmt.wiz.biz',
  'wss://relay.nostr.com.au'
];

// All music relays combined
export const MUSIC_RELAYS = [...DEFAULT_MUSIC_RELAYS, ...ADDITIONAL_MUSIC_RELAYS];

// Parse music event content
export function parseMusicEvent(event: NostrEvent): MusicTrack | null {
  try {
    // Check if it's a music event (including kind 30311 and 32123 for Wavlake)
    if (!Object.values(MUSIC_EVENT_KINDS).includes(event.kind as MusicEventKind) && 
        event.kind !== 30311 && event.kind !== 32123) {
      return null;
    }

    // Extract title from tags
    const titleTag = event.tags.find(tag => tag[0] === 'title' || tag[0] === 'subject');
    const title = titleTag?.[1] || 'Untitled';

    // Extract other metadata from tags
    const artistTag = event.tags.find(tag => tag[0] === 'artist' || tag[0] === 'author' || tag[0] === 'creator');
    const albumTag = event.tags.find(tag => tag[0] === 'album' || tag[0] === 'release');
    const urlTag = event.tags.find(tag => tag[0] === 'url' || tag[0] === 'streaming' || tag[0] === 'link' || tag[0] === 'r');
    const artworkTag = event.tags.find(tag => tag[0] === 'image' || tag[0] === 'artwork' || tag[0] === 'cover' || tag[0] === 'thumb');
    const durationTag = event.tags.find(tag => tag[0] === 'duration' || tag[0] === 'length');
    const genreTags = event.tags.filter(tag => tag[0] === 'genre' || tag[0] === 'g' || tag[0] === 'category').map(tag => tag[1]);
    const hashtagTags = event.tags.filter(tag => tag[0] === 't').map(tag => tag[1]);

    // Try to parse content as JSON for additional metadata
    let contentData: any = {};
    try {
      contentData = JSON.parse(event.content);
    } catch {
      // Content might be plain text description
    }

    return {
      id: event.id,
      title: contentData.title || title,
      artist: contentData.artist || artistTag?.[1],
      album: contentData.album || albumTag?.[1],
      url: contentData.url || urlTag?.[1],
      artwork: contentData.artwork || contentData.image || artworkTag?.[1],
      duration: contentData.duration || (durationTag ? parseInt(durationTag[1]) : undefined),
      genre: [...new Set([...(contentData.genre || []), ...genreTags])].filter(Boolean),
      tags: [...new Set([...(contentData.tags || []), ...hashtagTags])].filter(Boolean),
      pubkey: event.pubkey,
      created_at: event.created_at,
      event
    };
  } catch (error) {
    console.error('Failed to parse music event:', error);
    return null;
  }
}

// Create a radio station from tracks
export function createRadioStation(
  tracks: MusicTrack[], 
  name?: string,
  genre?: string
): RadioStation {
  const id = crypto.randomUUID();
  const genreFromTracks = genre || getMostCommonGenre(tracks);
  
  return {
    id,
    name: name || `${genreFromTracks || 'Mixed'} Radio`,
    genre: genreFromTracks,
    tracks,
    pubkey: tracks[0]?.pubkey || '',
    isPlaying: false,
    currentTrack: tracks[0]
  };
}

function getMostCommonGenre(tracks: MusicTrack[]): string | undefined {
  const genreCounts = new Map<string, number>();
  
  tracks.forEach(track => {
    track.genre?.forEach(g => {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    });
  });
  
  let maxCount = 0;
  let mostCommon: string | undefined;
  
  genreCounts.forEach((count, genre) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = genre;
    }
  });
  
  return mostCommon;
}