import { nip19 } from 'nostr-tools';

export type EntityType = 'npub' | 'note' | 'nprofile' | 'nevent' | 'naddr' | 'nsec' | 'image' | 'video' | 'youtube' | 'spotify' | 'github' | 'x' | 'facebook' | 'substack' | 'medium' | 'link';

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
 * Uses exact bech32 character set: qpzry9x8gf2tvdw0s3jn54khce6mua7l
 * Excludes: 1 (separator), b, i, o (confusing characters)
 * Uses word boundary to prevent matching text after the identifier
 */
const NOSTR_ENTITY_REGEX = /nostr:(?:npub|note|nprofile|nevent|naddr|nsec)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+\b/g;

/**
 * Regular expression to match bare NIP-19 entities (without nostr: prefix)
 * Matches: npub1..., note1..., nprofile1..., nevent1..., naddr1..., nsec1...
 * IMPORTANT: Must not match when part of a URL path
 * Uses negative lookbehind to exclude:
 * - After :// (protocol separator)
 * - After / (path separator, unless preceded by whitespace)
 */
const BARE_NIP19_REGEX = /(?:^|[\s\n\r\t()\[\]{}'"<>])(?<entity>(?:npub|note|nprofile|nevent|naddr|nsec)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+)\b/g;

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
 * Matches:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtube.com/live/VIDEO_ID
 * - youtu.be/VIDEO_ID
 */
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/gi;

/**
 * Regular expression to match Spotify URLs
 * Matches: open.spotify.com/(track|album|playlist|episode|show)/ID
 */
const SPOTIFY_REGEX = /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)(?:\?[^\s]*)?/gi;

/**
 * Regular expression to match GitHub URLs
 * Matches repos, issues, PRs, releases
 */
const GITHUB_REGEX = /https?:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?:\/(issues|pull|releases\/tag)\/([0-9a-zA-Z_.-]+))?/gi;

/**
 * Regular expression to match X/Twitter URLs
 * Matches: x.com/username/status/ID or twitter.com/username/status/ID
 */
const X_REGEX = /https?:\/\/(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)(?:\?[^\s]*)?/gi;

/**
 * Regular expression to match Facebook URLs
 * Matches posts, photos, videos, pages
 */
const FACEBOOK_REGEX = /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?:(?:[^\/]+\/)?(?:posts|photos|videos|permalink)\/([^\/\s?]+)|([a-zA-Z0-9.]+))(?:\?[^\s]*)?/gi;

/**
 * Regular expression to match Substack URLs
 * Matches:
 * - subdomain.substack.com/p/post-slug
 * - subdomain.substack.com/pub/username/p/post-slug
 * - subdomain.substack.com (homepage)
 */
const SUBSTACK_REGEX = /https?:\/\/([a-zA-Z0-9-]+)\.substack\.com(?:\/(?:pub\/[a-zA-Z0-9-]+\/)?p\/([a-zA-Z0-9-]+))?(?:[^\s]*)?/gi;

/**
 * Regular expression to match Medium URLs
 * Matches: medium.com/@username/post-slug or medium.com/publication/post-slug
 */
const MEDIUM_REGEX = /https?:\/\/(?:www\.)?medium\.com\/(?:@([a-zA-Z0-9_-]+)|([a-zA-Z0-9_-]+))\/([a-zA-Z0-9_-]+)(?:\?[^\s]*)?/gi;

/**
 * Regular expression to match generic HTTP(S) URLs
 * This should be checked LAST after all specific patterns
 * Matches any http:// or https:// URL
 */
const GENERIC_URL_REGEX = /https?:\/\/[^\s<>]+/gi;

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
      // Skip invalid entities
    }
  }
  return entities;
}

/**
 * Parse a string to find bare NIP-19 entities (without nostr: prefix)
 * Carefully avoids matching entities that are part of URLs
 * @param content - The text content to parse
 * @returns Array of parsed entities
 */
export function findBareNip19Entities(content: string): ParsedEntity[] {
  const entities: ParsedEntity[] = [];
  const matches = content.matchAll(BARE_NIP19_REGEX);

  for (const match of matches) {
    // The named group captures just the entity without the preceding character
    const identifier = match.groups?.entity;
    if (!identifier) continue;

    // Calculate actual position (accounting for the preceding character in the match)
    const fullMatch = match[0];
    const precedingChar = fullMatch.substring(0, fullMatch.length - identifier.length);
    const actualStart = match.index! + precedingChar.length;

    // Additional safety check: ensure this isn't part of a URL
    // Check what comes before the match in the content
    const beforeMatch = content.substring(Math.max(0, actualStart - 10), actualStart);

    // Skip if preceded by :// or / (URL patterns)
    if (beforeMatch.includes('://') || beforeMatch.match(/\/[^\s]*$/)) {
      continue;
    }

    try {
      const decoded = nip19.decode(identifier);
      entities.push({
        type: decoded.type as EntityType,
        data: decoded.data,
        start: actualStart,
        end: actualStart + identifier.length,
        raw: identifier,
      });
    } catch (error) {
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

  // Find Spotify links
  const spotifyMatches = content.matchAll(SPOTIFY_REGEX);
  for (const match of spotifyMatches) {
    const type = match[1] as 'track' | 'album' | 'playlist' | 'episode' | 'show';
    const id = match[2];
    entities.push({
      type: 'spotify',
      data: { type, id, url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find GitHub links
  const githubMatches = content.matchAll(GITHUB_REGEX);
  for (const match of githubMatches) {
    const owner = match[1];
    const repo = match[2];
    const pathType = match[3]; // 'issues', 'pull', 'releases/tag', or undefined
    const number = match[4];

    let type: 'repo' | 'issue' | 'pr' | 'release' = 'repo';
    if (pathType === 'issues') type = 'issue';
    else if (pathType === 'pull') type = 'pr';
    else if (pathType === 'releases/tag') type = 'release';

    entities.push({
      type: 'github',
      data: { type, owner, repo, number, url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find X/Twitter links
  const xMatches = content.matchAll(X_REGEX);
  for (const match of xMatches) {
    const username = match[1];
    const tweetId = match[2];
    entities.push({
      type: 'x',
      data: { username, tweetId, url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find Facebook links
  const facebookMatches = content.matchAll(FACEBOOK_REGEX);
  for (const match of facebookMatches) {
    // Determine type based on URL structure
    let type: 'post' | 'photo' | 'video' | 'page' = 'post';
    if (match[0].includes('/photos/')) type = 'photo';
    else if (match[0].includes('/videos/')) type = 'video';
    else if (!match[1]) type = 'page';

    entities.push({
      type: 'facebook',
      data: { type, url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find Substack links
  const substackMatches = content.matchAll(SUBSTACK_REGEX);
  for (const match of substackMatches) {
    const publication = match[1];
    const postSlug = match[2];
    const type = postSlug ? 'post' : 'home';

    entities.push({
      type: 'substack',
      data: { publication, type, url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find Medium links
  const mediumMatches = content.matchAll(MEDIUM_REGEX);
  for (const match of mediumMatches) {
    const author = match[1]; // @username format
    const publication = match[2]; // publication name

    entities.push({
      type: 'medium',
      data: { author, publication, url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find video files
  const videoMatches = content.matchAll(VIDEO_REGEX);
  for (const match of videoMatches) {
    // Skip if this URL is already matched as YouTube
    const isAlreadyMatched = entities.some(
      e => e.start <= match.index! && e.end >= match.index! + match[0].length
    );
    if (isAlreadyMatched) continue;

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
    // Skip if this URL is already matched as video or YouTube
    const isAlreadyMatched = entities.some(
      e => e.start <= match.index! && e.end >= match.index! + match[0].length
    );
    if (isAlreadyMatched) continue;

    entities.push({
      type: 'image',
      data: { url: match[0] },
      start: match.index!,
      end: match.index! + match[0].length,
      raw: match[0],
    });
  }

  // Find generic links (checked LAST to avoid duplicates with specific patterns)
  const linkMatches = content.matchAll(GENERIC_URL_REGEX);
  for (const match of linkMatches) {
    // Skip if this URL is already matched by any specific pattern
    const isAlreadyMatched = entities.some(
      e => e.start <= match.index! && e.end >= match.index! + match[0].length
    );
    if (isAlreadyMatched) continue;

    entities.push({
      type: 'link',
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
  const bareNip19Entities = findBareNip19Entities(content);
  const mediaEntities = findMediaEntities(content);

  // Combine all entities and remove duplicates (prefer nostr: prefix over bare)
  // If a bare entity overlaps with a nostr: entity, keep the nostr: one
  const combinedNostr = [...nostrEntities];
  for (const bareEntity of bareNip19Entities) {
    const overlaps = nostrEntities.some(
      e => (bareEntity.start >= e.start && bareEntity.start < e.end) ||
           (bareEntity.end > e.start && bareEntity.end <= e.end)
    );
    if (!overlaps) {
      combinedNostr.push(bareEntity);
    }
  }

  const allEntities = [...combinedNostr, ...mediaEntities].sort((a, b) => a.start - b.start);

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
