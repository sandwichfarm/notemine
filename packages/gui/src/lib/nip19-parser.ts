import { nip19 } from 'nostr-tools';

export type EntityType = 'npub' | 'note' | 'nprofile' | 'nevent' | 'naddr' | 'nsec' | 'image' | 'video' | 'youtube';

export interface ParsedEntity {
  type: EntityType;
  data: any;
  start: number;
  end: number;
  raw: string;
}

export interface ContentSegment {
  type: 'text' | 'entity';
  content: string;
  entity?: ParsedEntity;
}

/**
 * Regular expression to match nostr: references
 * Matches: nostr:npub..., nostr:note..., nostr:nprofile..., nostr:nevent..., nostr:naddr...
 */
const NOSTR_ENTITY_REGEX = /nostr:(npub|note|nprofile|nevent|naddr|nsec)[a-zA-Z0-9]+/gi;

/**
 * Regular expression to match image URLs
 */
const IMAGE_REGEX = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)(?:\?[^\s]*)?/gi;

/**
 * Regular expression to match video URLs
 */
const VIDEO_REGEX = /https?:\/\/[^\s]+\.(?:mp4|webm|ogg|mov|avi|mkv)(?:\?[^\s]*)?/gi;

/**
 * Regular expression to match YouTube URLs
 */
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/gi;

/**
 * Parse a string to find all nostr: entity references
 * @param content - The text content to parse
 * @returns Array of parsed entities
 */
export function findNostrEntities(content: string): ParsedEntity[] {
  const entities: ParsedEntity[] = [];
  const matches = content.matchAll(NOSTR_ENTITY_REGEX);

  for (const match of matches) {
    const raw = match[0];
    const identifier = raw.slice(6); // Remove 'nostr:' prefix

    try {
      const decoded = nip19.decode(identifier);
      entities.push({
        type: decoded.type as EntityType,
        data: decoded.data,
        start: match.index!,
        end: match.index! + raw.length,
        raw,
      });
    } catch (error) {
      console.warn('[nip19-parser] Failed to decode:', identifier, error);
      // Skip invalid entities
    }
  }

  return entities;
}

/**
 * Find all media entities (images, videos, YouTube)
 */
function findMediaEntities(content: string): ParsedEntity[] {
  const entities: ParsedEntity[] = [];

  // Find YouTube links
  const youtubeMatches = content.matchAll(YOUTUBE_REGEX);
  for (const match of youtubeMatches) {
    const videoId = match[1];
    entities.push({
      type: 'youtube',
      data: { videoId, url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find video files
  const videoMatches = content.matchAll(VIDEO_REGEX);
  for (const match of videoMatches) {
    entities.push({
      type: 'video',
      data: { url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find images
  const imageMatches = content.matchAll(IMAGE_REGEX);
  for (const match of imageMatches) {
    entities.push({
      type: 'image',
      data: { url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  return entities;
}

/**
 * Split content into segments of text and entities
 * This makes it easy to render mixed content
 * @param content - The text content to parse
 * @returns Array of content segments
 */
export function parseContent(content: string): ContentSegment[] {
  const nostrEntities = findNostrEntities(content);
  const mediaEntities = findMediaEntities(content);
  const allEntities = [...nostrEntities, ...mediaEntities].sort((a, b) => a.start - b.start);

  if (allEntities.length === 0) {
    return [{ type: 'text', content }];
  }

  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const entity of allEntities) {
    // Add text segment before this entity
    if (entity.start > lastIndex) {
      const textContent = content.slice(lastIndex, entity.start);
      if (textContent.length > 0) {
        segments.push({
          type: 'text',
          content: textContent,
        });
      }
    }

    // Add entity segment
    segments.push({
      type: 'entity',
      content: entity.raw,
      entity,
    });

    lastIndex = entity.end;
  }

  // Add remaining text after last entity
  if (lastIndex < content.length) {
    const textContent = content.slice(lastIndex);
    if (textContent.length > 0) {
      segments.push({
        type: 'text',
        content: textContent,
      });
    }
  }

  return segments;
}

/**
 * Helper to get event ID from nevent or note
 */
export function getEventId(entity: ParsedEntity): string | null {
  if (entity.type === 'note') {
    return entity.data as string;
  } else if (entity.type === 'nevent') {
    return entity.data.id;
  }
  return null;
}

/**
 * Helper to get pubkey from npub or nprofile
 */
export function getPubkey(entity: ParsedEntity): string | null {
  if (entity.type === 'npub') {
    return entity.data as string;
  } else if (entity.type === 'nprofile') {
    return entity.data.pubkey;
  }
  return null;
}

/**
 * Helper to get relay hints from entity
 */
export function getRelayHints(entity: ParsedEntity): string[] {
  if (entity.type === 'nprofile' && entity.data.relays) {
    return entity.data.relays;
  } else if (entity.type === 'nevent' && entity.data.relays) {
    return entity.data.relays;
  } else if (entity.type === 'naddr' && entity.data.relays) {
    return entity.data.relays;
  }
  return [];
}
