/**
 * Feed Improvements (Phases 1-2)
 * Type definitions for adaptive fetch and stable rendering
 */

import type { NostrEvent } from 'nostr-tools/core';

/**
 * Parameters for adaptive feed fetching strategy
 */
export interface FeedParams {
  /** Target number of notes to fetch */
  desiredCount: number;

  /** Initial relay query limit (e.g., 50) */
  initialLimit: number;

  /** Maximum relay query limit cap (e.g., 2000) */
  maxLimit: number;

  /** Initial time horizon in milliseconds (e.g., 12 hours) */
  initialHorizonMs: number;

  /** Maximum time horizon in milliseconds (e.g., 14 days) */
  maxHorizonMs: number;

  /** Growth multiplier when no results found (e.g., 3.0) */
  growthFast: number;

  /** Growth multiplier when partial results found (e.g., 1.6) */
  growthSlow: number;

  /** Temporal overlap ratio between windows (e.g., 0.15 for 15%) */
  overlapRatio: number;

  /** Overfetch multiplier to enable prioritization (e.g., 2.0) */
  overfetch: number;

  /** Clock skew margin to subtract from 'since' in milliseconds (default: 15 minutes) */
  skewMarginMs: number;

  /** Filter by author pubkeys (WoT follows) */
  authors?: string[];

  /** Target specific relays (optional) */
  relays?: string[];
}


/**
 * Detected media reference in note content
 */
export interface MediaRef {
  /** Unique identifier for this media item */
  id: string;

  /** Media type */
  type: 'image' | 'video' | 'embed';

  /** Source URL */
  url: string;

  /** Position in content string */
  position: number;

  /** Known dimensions if available */
  dimensions?: {
    width: number;
    height: number;
    aspectRatio: number;
  };

  /** Embed-specific metadata */
  embedMetadata?: {
    provider: string; // 'youtube', 'spotify', etc.
    embedId: string;
  };
}

/**
 * Feed note with PoW and media metadata
 */
export interface FeedNote {
  /** Original Nostr event */
  event: NostrEvent;

  /** Event ID (denormalized for convenience) */
  id: string;

  /** Author pubkey */
  author: string;

  /** Created timestamp (seconds) */
  created_at: number;

  /** PoW difficulty in bits (from NIP-13) */
  powBits?: number;

  /** Detected media references */
  media?: MediaRef[];

  /** Intake priority score (transient, not persisted) */
  priority?: number;
}

/**
 * Note prepared for rendering with reserved layout space
 */
export interface PreparedNote {
  /** Source feed note */
  note: FeedNote;

  /** Reserved heights for media items (keyed by media.id or url) */
  reservedHeights: Record<string, number>;

  /** Whether all media fully preloaded */
  ready: boolean;

  /** Time spent in preload (ms) */
  elapsedMs: number;

  /** Media items that timed out */
  timedOut: string[];
}

/**
 * Feed fetch events (Observable stream)
 */
export type FeedEvent =
  | {
      type: 'progress';
      step: number;
      limit: number;
      horizonMs: number;
      found: number;
      total: number;
    }
  | {
      type: 'batch';
      notes: FeedNote[];
    }
  | {
      type: 'complete';
      total: number;
      exhausted: boolean;
    };

/**
 * Prioritization configuration
 */
export interface PriorityConfig {
  /** Weight for PoW strength (default: 0.7) */
  powCoefficient: number;

  /** Weight for freshness/recency (default: 0.3) */
  freshnessCoefficient: number;

  /** Recency decay half-life in milliseconds (default: 36 hours) */
  recencyHalfLifeMs: number;
}


/**
 * Media preload configuration
 */
export interface MediaPreloadConfig {
  /** Timeout for media preload in milliseconds (default: 1500) */
  timeoutMs: number;

  /** Enable media preloading (default: true) */
  enabled: boolean;

  /** Default aspect ratio for unknown media (default: 16/9) */
  defaultAspectRatio: number;

  /** Maximum reserved height for single media item (default: 800px) */
  maxMediaHeight: number;
}

export {
  DEFAULT_FEED_PARAMS,
  DEFAULT_MEDIA_PRELOAD_CONFIG,
  DEFAULT_PRIORITY_CONFIG,
} from '../config/defaults';
