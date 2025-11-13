/**
 * Media Preloader Service
 * Preloads media and measures content to reserve layout space
 * Implements Phase 2: Stable Rendering
 */

import type { FeedNote, PreparedNote, MediaPreloadConfig, MediaRef } from '../types/FeedTypes';
import { DEFAULT_MEDIA_PRELOAD_CONFIG } from '../types/FeedTypes';

/**
 * Result of a single media preload attempt
 */
interface MediaPreloadResult {
  id: string;
  success: boolean;
  width?: number;
  height?: number;
  timedOut: boolean;
  error?: string;
}

/**
 * MediaPreloader class
 * Handles image preloading, dimension measurement, and height reservation
 */
export class MediaPreloader {
  private config: MediaPreloadConfig;
  private debug: boolean;
  private stats: {
    totalPreloads: number;
    successfulPreloads: number;
    timedOutPreloads: number;
    totalElapsedMs: number;
  };

  constructor(config: Partial<MediaPreloadConfig> = {}, debug: boolean = false) {
    this.config = { ...DEFAULT_MEDIA_PRELOAD_CONFIG, ...config };
    this.debug = debug;
    this.stats = {
      totalPreloads: 0,
      successfulPreloads: 0,
      timedOutPreloads: 0,
      totalElapsedMs: 0,
    };

    if (this.debug) {
      console.log('[MediaPreloader] Initialized with debug enabled', this.config);
    }
  }

  /**
   * Preloads a single image and resolves with dimensions
   */
  private preloadImage(url: string, timeoutMs: number): Promise<MediaPreloadResult> {
    return new Promise((resolve) => {
      const img = new Image();
      let completed = false;

      const complete = (result: MediaPreloadResult) => {
        if (completed) return;
        completed = true;
        resolve(result);
      };

      // Timeout handler
      const timeout = setTimeout(() => {
        complete({
          id: url,
          success: false,
          timedOut: true,
          error: 'Timeout',
        });
      }, timeoutMs);

      // Success handler
      img.onload = () => {
        clearTimeout(timeout);
        complete({
          id: url,
          success: true,
          width: img.naturalWidth,
          height: img.naturalHeight,
          timedOut: false,
        });
      };

      // Error handler
      img.onerror = () => {
        clearTimeout(timeout);
        complete({
          id: url,
          success: false,
          timedOut: false,
          error: 'Load error',
        });
      };

      // Start loading
      img.src = url;
    });
  }

  /**
   * Estimates height for video or embed based on known dimensions or defaults
   */
  private estimateMediaHeight(media: MediaRef, containerWidth: number = 600): number {
    const { type, dimensions, embedMetadata } = media;

    // If we have known dimensions, use them
    if (dimensions) {
      // Scale to fit container width
      const scaledHeight = (containerWidth / dimensions.width) * dimensions.height;
      return Math.min(scaledHeight, this.config.maxMediaHeight);
    }

    // Default estimates by type
    if (type === 'embed') {
      // Embeds have predictable heights based on provider
      if (embedMetadata?.provider === 'youtube') {
        return 315; // Standard YouTube embed height (560px width -> ~315px)
      }
      if (embedMetadata?.provider === 'spotify') {
        // Spotify heights vary by type (track: 152, album: 352, etc.)
        return 232; // Conservative default
      }
    }

    if (type === 'video') {
      // Videos default to 16:9 aspect ratio
      const defaultHeight = (containerWidth / 16) * 9;
      return Math.min(defaultHeight, this.config.maxMediaHeight);
    }

    // Fallback for unknown types
    return 300;
  }

  /**
   * Measures text content height using a hidden measurer element
   * This is a rough estimate; exact measurement happens in the browser
   */
  private measureTextHeight(content: string, containerWidth: number = 600): number {
    // Create a temporary hidden div to measure text
    const measurer = document.createElement('div');
    measurer.style.position = 'absolute';
    measurer.style.visibility = 'hidden';
    measurer.style.width = `${containerWidth}px`;
    measurer.style.fontSize = '14px';
    measurer.style.lineHeight = '1.5';
    measurer.style.whiteSpace = 'pre-wrap';
    measurer.style.wordWrap = 'break-word';
    measurer.textContent = content;

    document.body.appendChild(measurer);
    const height = measurer.offsetHeight;
    document.body.removeChild(measurer);

    return height;
  }

  /**
   * Prepares a note by preloading media and reserving heights
   * @param note - Feed note to prepare
   * @param timeoutMs - Optional timeout override
   * @returns Promise that resolves to PreparedNote
   */
  public async prepare(
    note: FeedNote,
    timeoutMs?: number
  ): Promise<PreparedNote> {
    const startTime = Date.now();
    const timeout = timeoutMs ?? this.config.timeoutMs;
    const reservedHeights: Record<string, number> = {};
    const timedOut: string[] = [];

    // Skip if preloading is disabled
    if (!this.config.enabled) {
      return {
        note,
        reservedHeights: {},
        ready: true,
        elapsedMs: Date.now() - startTime,
        timedOut: [],
      };
    }

    const media = note.media || [];
    const containerWidth = 600; // Assume standard container width

    // Estimate text height (rough estimate, will be more accurate in DOM)
    const textHeight = this.measureTextHeight(note.event.content, containerWidth);
    reservedHeights['text'] = textHeight;

    // Process each media item
    const mediaPromises = media.map(async (mediaItem) => {
      if (mediaItem.type === 'image') {
        // Preload image to get actual dimensions
        const result = await this.preloadImage(mediaItem.url, timeout);

        if (result.success && result.width && result.height) {
          // Scale to fit container
          const scaledHeight = (containerWidth / result.width) * result.height;
          const clampedHeight = Math.min(scaledHeight, this.config.maxMediaHeight);
          reservedHeights[mediaItem.id] = clampedHeight;
        } else {
          // Fallback: use default aspect ratio
          const fallbackHeight = containerWidth / this.config.defaultAspectRatio;
          reservedHeights[mediaItem.id] = Math.min(fallbackHeight, this.config.maxMediaHeight);

          if (result.timedOut) {
            timedOut.push(mediaItem.id);
          }
        }
      } else if (mediaItem.type === 'video' || mediaItem.type === 'embed') {
        // Use estimated heights for videos/embeds
        const estimatedHeight = this.estimateMediaHeight(mediaItem, containerWidth);
        reservedHeights[mediaItem.id] = estimatedHeight;
      }
    });

    // Wait for all media with timeout
    await Promise.race([
      Promise.all(mediaPromises),
      new Promise(resolve => setTimeout(resolve, timeout)),
    ]);

    const elapsedMs = Date.now() - startTime;
    const ready = timedOut.length === 0;

    // Update stats
    this.stats.totalPreloads++;
    this.stats.totalElapsedMs += elapsedMs;
    if (ready) {
      this.stats.successfulPreloads++;
    } else {
      this.stats.timedOutPreloads++;
    }

    if (this.debug) {
      const avgTime = this.stats.totalPreloads > 0 ? (this.stats.totalElapsedMs / this.stats.totalPreloads).toFixed(0) : '0';
      const timeoutRate = this.stats.totalPreloads > 0 ? ((this.stats.timedOutPreloads / this.stats.totalPreloads) * 100).toFixed(1) : '0';
      console.log(`[MediaPreloader] Prepared note ${note.id.slice(0, 8)}: media_count=${media.length}, elapsed=${elapsedMs}ms, ready=${ready}, avg_time=${avgTime}ms, timeout_rate=${timeoutRate}%`);
    }

    return {
      note,
      reservedHeights,
      ready,
      elapsedMs,
      timedOut,
    };
  }

  /**
   * Prepares multiple notes in parallel
   * @param notes - Array of notes to prepare
   * @param timeoutMs - Optional timeout override
   * @returns Promise that resolves to array of PreparedNotes
   */
  public async prepareBatch(
    notes: FeedNote[],
    timeoutMs?: number
  ): Promise<PreparedNote[]> {
    const promises = notes.map(note => this.prepare(note, timeoutMs));
    return Promise.all(promises);
  }

  /**
   * Updates the preloader configuration
   */
  public updateConfig(config: Partial<MediaPreloadConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets the current configuration
   */
  public getConfig(): MediaPreloadConfig {
    return { ...this.config };
  }

  /**
   * Computes the total reserved height for a prepared note
   * @param prepared - PreparedNote to measure
   * @returns Total height in pixels
   */
  public getTotalHeight(prepared: PreparedNote): number {
    const heights = Object.values(prepared.reservedHeights);
    return heights.reduce((sum, h) => sum + h, 0);
  }

  /**
   * Gets current performance stats
   * @returns Stats object with timing metrics
   */
  public getStats() {
    return { ...this.stats };
  }

  /**
   * Resets performance stats
   */
  public resetStats(): void {
    this.stats = {
      totalPreloads: 0,
      successfulPreloads: 0,
      timedOutPreloads: 0,
      totalElapsedMs: 0,
    };

    if (this.debug) {
      console.log('[MediaPreloader] Stats reset');
    }
  }
}

/**
 * Singleton instance for convenience
 */
export const defaultPreloader = new MediaPreloader();

/**
 * Convenience function: prepare a note using default config
 * @param note - Note to prepare
 * @param timeoutMs - Optional timeout
 * @returns Promise of PreparedNote
 */
export async function prepareNote(
  note: FeedNote,
  timeoutMs?: number
): Promise<PreparedNote> {
  return defaultPreloader.prepare(note, timeoutMs);
}
