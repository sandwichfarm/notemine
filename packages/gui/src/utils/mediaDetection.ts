/**
 * Media Detection Utility
 * Extracts media references from note content for preloading and height reservation
 */

import type { MediaRef } from '../types/FeedTypes';

/**
 * Regular expression patterns for media detection
 */
const IMAGE_REGEX = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)(?:\?[^\s]*)?/gi;
const VIDEO_REGEX = /https?:\/\/[^\s]+\.(?:mp4|webm|ogg|mov|avi|mkv)(?:\?[^\s]*)?/gi;
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/gi;
const SPOTIFY_REGEX = /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)(?:\?[^\s]*)?/gi;

/**
 * Known embed providers and their metadata
 */
const EMBED_PROVIDERS = {
  youtube: {
    defaultAspectRatio: 16 / 9,
    defaultHeight: 315, // Based on 560px width standard
  },
  spotify: {
    track: { height: 152 },
    album: { height: 352 },
    playlist: { height: 352 },
    episode: { height: 232 },
    show: { height: 232 },
  },
} as const;

/**
 * Detects all media references in note content
 * @param content - Note content string
 * @returns Array of detected media references
 */
export function detectMedia(content: string): MediaRef[] {
  const media: MediaRef[] = [];
  const processedRanges: Array<{ start: number; end: number }> = [];

  // Helper to check if a position overlaps with already processed ranges
  const isOverlapping = (start: number, end: number): boolean => {
    return processedRanges.some(
      range => !(end <= range.start || start >= range.end)
    );
  };

  // Helper to add processed range
  const addProcessedRange = (start: number, end: number) => {
    processedRanges.push({ start, end });
  };

  // 1. Find YouTube embeds first (highest priority)
  const youtubeMatches = [...content.matchAll(YOUTUBE_REGEX)];
  for (const match of youtubeMatches) {
    const start = match.index!;
    const end = start + match[0].length;

    if (!isOverlapping(start, end)) {
      const videoId = match[1];
      media.push({
        id: `youtube-${videoId}`,
        type: 'embed',
        url: match[0],
        position: start,
        dimensions: {
          width: 560,
          height: EMBED_PROVIDERS.youtube.defaultHeight,
          aspectRatio: EMBED_PROVIDERS.youtube.defaultAspectRatio,
        },
        embedMetadata: {
          provider: 'youtube',
          embedId: videoId,
        },
      });
      addProcessedRange(start, end);
    }
  }

  // 2. Find Spotify embeds
  const spotifyMatches = [...content.matchAll(SPOTIFY_REGEX)];
  for (const match of spotifyMatches) {
    const start = match.index!;
    const end = start + match[0].length;

    if (!isOverlapping(start, end)) {
      const embedType = match[1] as keyof typeof EMBED_PROVIDERS.spotify;
      const spotifyId = match[2];
      const heightData = EMBED_PROVIDERS.spotify[embedType];

      media.push({
        id: `spotify-${embedType}-${spotifyId}`,
        type: 'embed',
        url: match[0],
        position: start,
        dimensions: {
          width: 300,
          height: heightData.height,
          aspectRatio: 300 / heightData.height,
        },
        embedMetadata: {
          provider: 'spotify',
          embedId: `${embedType}/${spotifyId}`,
        },
      });
      addProcessedRange(start, end);
    }
  }

  // 3. Find video files
  const videoMatches = [...content.matchAll(VIDEO_REGEX)];
  for (const match of videoMatches) {
    const start = match.index!;
    const end = start + match[0].length;

    if (!isOverlapping(start, end)) {
      media.push({
        id: match[0], // Use URL as ID for consistent lookup
        type: 'video',
        url: match[0],
        position: start,
        // Videos use 16:9 default, actual dimensions resolved during preload
        dimensions: {
          width: 640,
          height: 360,
          aspectRatio: 16 / 9,
        },
      });
      addProcessedRange(start, end);
    }
  }

  // 4. Find images (lowest priority, check for overlaps)
  const imageMatches = [...content.matchAll(IMAGE_REGEX)];
  for (const match of imageMatches) {
    const start = match.index!;
    const end = start + match[0].length;

    if (!isOverlapping(start, end)) {
      media.push({
        id: match[0], // Use URL as ID for consistent lookup
        type: 'image',
        url: match[0],
        position: start,
        // Images need actual dimension detection during preload
      });
      addProcessedRange(start, end);
    }
  }

  // Sort by position in content
  return media.sort((a, b) => a.position - b.position);
}

/**
 * Estimates text content height based on character count and line breaks
 * This is a rough estimate; actual measurement happens in MediaPreloader
 * @param content - Text content
 * @param averageCharWidth - Average character width in pixels (default: 8)
 * @param containerWidth - Container width in pixels (default: 600)
 * @param lineHeight - Line height in pixels (default: 24)
 * @returns Estimated height in pixels
 */
export function estimateTextHeight(
  content: string,
  averageCharWidth: number = 8,
  containerWidth: number = 600,
  lineHeight: number = 24
): number {
  // Count explicit line breaks
  const explicitLines = content.split('\n').length;

  // Estimate wrapped lines based on character count
  const chars = content.length;
  const charsPerLine = Math.floor(containerWidth / averageCharWidth);
  const estimatedWrappedLines = Math.ceil(chars / charsPerLine);

  // Use the larger estimate
  const totalLines = Math.max(explicitLines, estimatedWrappedLines);

  return totalLines * lineHeight;
}

/**
 * Checks if a URL points to a known media type
 * @param url - URL to check
 * @returns True if URL is recognized as media
 */
export function isMediaUrl(url: string): boolean {
  return (
    IMAGE_REGEX.test(url) ||
    VIDEO_REGEX.test(url) ||
    YOUTUBE_REGEX.test(url) ||
    SPOTIFY_REGEX.test(url)
  );
}

/**
 * Extracts media type from URL
 * @param url - URL to analyze
 * @returns Media type or null if not recognized
 */
export function getMediaType(url: string): 'image' | 'video' | 'embed' | null {
  if (YOUTUBE_REGEX.test(url) || SPOTIFY_REGEX.test(url)) return 'embed';
  if (VIDEO_REGEX.test(url)) return 'video';
  if (IMAGE_REGEX.test(url)) return 'image';
  return null;
}
