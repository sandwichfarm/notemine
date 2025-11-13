/**
 * Adaptive Feed Service
 * Progressive fetch strategy with expanding limits and time windows
 * Implements Phase 1: Adaptive Fetch
 */

import { Observable } from 'rxjs';
import type { NostrEvent } from 'nostr-tools/core';
import { relayPool, eventStore } from '../lib/applesauce';
import { getPowDifficultyFromId } from '../lib/pow';
import { detectMedia } from '../utils/mediaDetection';
import type { FeedParams, FeedNote, FeedEvent } from '../types/FeedTypes';
import { DEFAULT_FEED_PARAMS } from '../types/FeedTypes';

/**
 * Relay map for author-specific relay targeting
 */
export type RelayMap = Map<string, string[]>;

/**
 * Internal fetch state
 */
interface FetchState {
  limit: number;
  horizonMs: number;
  until: number; // Unix timestamp in seconds
  accumulated: Map<string, FeedNote>; // Keyed by event ID for deduplication
  step: number;
}

/**
 * AdaptiveFeedService class
 * Manages progressive feed fetching with adaptive strategies
 */
export class AdaptiveFeedService {
  private params: FeedParams;
  private authorRelays: RelayMap;
  private runId: string; // Unique ID for this service instance
  private debug: boolean; // Enable diagnostic logging

  constructor(
    authors: string[],
    authorRelays: RelayMap = new Map(),
    params: Partial<FeedParams> = {},
    debug: boolean = false
  ) {
    this.params = {
      ...DEFAULT_FEED_PARAMS,
      ...params,
      authors,
    };
    this.authorRelays = authorRelays;
    this.runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.debug = debug;

    // Ensure all authors have at least empty array
    authors.forEach(author => {
      if (!this.authorRelays.has(author)) {
        this.authorRelays.set(author, []);
      }
    });

    if (this.debug) {
      console.log(`[AdaptiveFeed:${this.runId.slice(0, 8)}] Initialized with ${authors.length} authors, debug enabled`);
      console.log(`[AdaptiveFeed:${this.runId.slice(0, 8)}] Params:`, {
        desiredCount: this.params.desiredCount,
        initialLimit: this.params.initialLimit,
        maxLimit: this.params.maxLimit,
        initialHorizonMs: `${(this.params.initialHorizonMs / (60 * 60 * 1000)).toFixed(1)}h`,
        maxHorizonMs: `${(this.params.maxHorizonMs / (24 * 60 * 60 * 1000)).toFixed(1)}d`,
        growthFast: this.params.growthFast,
        growthSlow: this.params.growthSlow,
        overlapRatio: this.params.overlapRatio,
        overfetch: this.params.overfetch,
        skewMarginMs: `${(this.params.skewMarginMs / (60 * 1000)).toFixed(0)}min`,
      });
    }
  }

  /**
   * Converts NostrEvent to FeedNote with metadata
   */
  private toFeedNote(event: NostrEvent): FeedNote {
    const powBits = getPowDifficultyFromId(event.id);
    const media = detectMedia(event.content);

    return {
      event,
      id: event.id,
      author: event.pubkey,
      created_at: event.created_at,
      powBits,
      media: media.length > 0 ? media : undefined,
    };
  }

  /**
   * Queries relays for a batch of authors with given filters
   * Returns a subscription that can be unsubscribed for cleanup
   */
  private async fetchBatch(
    authors: string[],
    limit: number,
    until: number,
    since: number,
    activeRunId: string,
    subscriptions: any[] // Array to track active subscriptions for cleanup
  ): Promise<FeedNote[]> {
    const batchStartTime = Date.now();

    return new Promise((resolve) => {
      const notes = new Map<string, FeedNote>();
      const seenEOSE = new Set<string>();
      let totalEvents = 0; // Track all events received (including dupes)

      // Collect all unique relays for these authors
      const relaySet = new Set<string>();
      authors.forEach(author => {
        const relays = this.authorRelays.get(author) || [];
        relays.forEach(r => relaySet.add(r));
      });

      // Fallback to default relays if no author-specific relays
      const targetRelays = relaySet.size > 0 ? Array.from(relaySet) : this.params.relays || [];

      if (targetRelays.length === 0) {
        if (this.debug) {
          console.warn(`[AdaptiveFeed:${this.runId.slice(0, 8)}] No relays available for batch fetch`);
        }
        resolve([]);
        return;
      }

      if (this.debug) {
        const sinceDate = new Date(since * 1000).toISOString();
        const untilDate = new Date(until * 1000).toISOString();
        console.log(`[AdaptiveFeed:${this.runId.slice(0, 8)}] Fetching batch: limit=${limit}, since=${sinceDate}, until=${untilDate}, relays=${targetRelays.length}`);
      }

      // Create filter
      const filter: any = {
        kinds: [1], // Only text notes for WoT feed
        authors,
        limit: Math.ceil(limit),
        until,
        since,
      };

      // Query relays
      const subscription = relayPool.req(targetRelays, filter).subscribe({
        next: (response) => {
          // Ignore events from stale runs (Phase 1: Session isolation)
          if (this.runId !== activeRunId) {
            return;
          }

          if (response === 'EOSE') {
            seenEOSE.add('eose'); // Track EOSE
            // Don't resolve yet, wait for timeout
          } else if (response && typeof response === 'object' && 'id' in response) {
            const event = response as NostrEvent;
            totalEvents++;

            // Add to event store for caching
            eventStore.add(event);

            // Skip if already seen (dedupe)
            if (notes.has(event.id)) return;

            // Skip replies (events with 'e' tags) - keep only root notes
            const hasETag = event.tags.some((tag: string[]) => tag[0] === 'e');
            if (hasETag) return;

            // Convert and store
            const note = this.toFeedNote(event);
            notes.set(note.id, note);
          }
        },
        error: (err) => {
          console.error('[AdaptiveFeed] Relay error:', err);
        },
      });

      // Track this subscription for cleanup
      subscriptions.push(subscription);

      // Timeout: give relays reasonable time to respond
      const timeout = setTimeout(() => {
        clearInterval(checkComplete);
        subscription.unsubscribe();
        const batchElapsed = Date.now() - batchStartTime;
        const dedupeRate = totalEvents > 0 ? ((totalEvents - notes.size) / totalEvents * 100).toFixed(1) : '0';

        if (this.debug) {
          console.log(`[AdaptiveFeed:${this.runId.slice(0, 8)}] Batch complete (timeout): found=${notes.size}, total_events=${totalEvents}, dedupe_rate=${dedupeRate}%, elapsed=${batchElapsed}ms`);
        }

        resolve(Array.from(notes.values()));
      }, 3000); // 3 second timeout per batch

      // Early resolve if we get EOSE and enough notes
      const checkComplete = setInterval(() => {
        if (seenEOSE.size > 0 && notes.size > 0) {
          clearTimeout(timeout);
          clearInterval(checkComplete);
          subscription.unsubscribe();
          const batchElapsed = Date.now() - batchStartTime;
          const dedupeRate = totalEvents > 0 ? ((totalEvents - notes.size) / totalEvents * 100).toFixed(1) : '0';

          if (this.debug) {
            console.log(`[AdaptiveFeed:${this.runId.slice(0, 8)}] Batch complete (EOSE): found=${notes.size}, total_events=${totalEvents}, dedupe_rate=${dedupeRate}%, elapsed=${batchElapsed}ms`);
          }

          resolve(Array.from(notes.values()));
        }
      }, 100);
    });
  }

  /**
   * Main load function: progressively fetches notes with adaptive strategy
   * Returns an Observable that emits progress, batches, and completion
   */
  public load(): Observable<FeedEvent> {
    return new Observable<FeedEvent>((observer) => {
      const { authors, desiredCount, initialLimit, maxLimit, initialHorizonMs, maxHorizonMs, growthFast, growthSlow, overlapRatio, overfetch } = this.params;

      if (!authors || authors.length === 0) {
        observer.next({ type: 'complete', total: 0, exhausted: true });
        observer.complete();
        return;
      }

      // Phase 1: Session isolation - track runId and subscriptions
      const activeRunId = this.runId;
      const subscriptions: any[] = [];

      // Cancellation tracking
      let aborted = false;
      let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

      const state: FetchState = {
        limit: initialLimit,
        horizonMs: initialHorizonMs,
        until: Math.floor(Date.now() / 1000), // Current time in seconds
        accumulated: new Map(),
        step: 0,
      };

      /**
       * Recursive fetch step
       */
      const fetchStep = async () => {
        // Check if aborted before proceeding
        if (aborted) return;

        state.step++;

        // Calculate time window (Phase 1: Apply clock skew margin to catch events from relays with clock drift)
        const skewMarginSeconds = Math.floor(this.params.skewMarginMs / 1000);
        const since = state.until - Math.floor(state.horizonMs / 1000) - skewMarginSeconds;

        // Overfetch to allow prioritization
        const effectiveLimit = Math.min(
          Math.ceil(state.limit * overfetch),
          maxLimit
        );

        // Emit progress
        if (!aborted) {
          observer.next({
            type: 'progress',
            step: state.step,
            limit: effectiveLimit,
            horizonMs: state.horizonMs,
            found: 0,
            total: state.accumulated.size,
          });
        }

        // Fetch batch (Phase 1: Pass runId and subscriptions for session isolation)
        const batchNotes = await this.fetchBatch(
          authors,
          effectiveLimit,
          state.until,
          since,
          activeRunId,
          subscriptions
        );

        // Check if aborted after async fetch
        if (aborted) return;

        // Deduplicate against accumulated
        const newNotes = batchNotes.filter(note => !state.accumulated.has(note.id));
        newNotes.forEach(note => state.accumulated.set(note.id, note));

        const found = newNotes.length;
        const total = state.accumulated.size;

        // Emit batch if we found new notes
        if (found > 0 && !aborted) {
          observer.next({
            type: 'batch',
            notes: newNotes,
          });
        }

        // Check termination conditions
        const hasEnough = total >= desiredCount;
        const atLimitCap = state.limit >= maxLimit;
        const atHorizonCap = state.horizonMs >= maxHorizonMs;
        const exhausted = found === 0 && atLimitCap && atHorizonCap;

        if (hasEnough || exhausted) {
          // Done!
          if (!aborted) {
            observer.next({
              type: 'complete',
              total,
              exhausted: total < desiredCount,
            });
            observer.complete();
          }
          return;
        }

        // Adjust strategy for next step
        const prevLimit = state.limit;
        const prevHorizon = state.horizonMs;

        if (found === 0) {
          // No results: expand horizon aggressively
          state.horizonMs = Math.min(state.horizonMs * growthFast, maxHorizonMs);

          if (this.debug) {
            console.log(`[AdaptiveFeed:${this.runId.slice(0, 8)}] Growth strategy: FAST (no results) - horizon: ${(prevHorizon / (60 * 60 * 1000)).toFixed(1)}h → ${(state.horizonMs / (60 * 60 * 1000)).toFixed(1)}h`);
          }
        } else {
          // Partial results: grow both limit and horizon moderately
          state.limit = Math.min(state.limit * growthSlow, maxLimit);
          state.horizonMs = Math.min(state.horizonMs * growthSlow, maxHorizonMs);

          if (this.debug) {
            console.log(`[AdaptiveFeed:${this.runId.slice(0, 8)}] Growth strategy: SLOW (partial results) - limit: ${prevLimit} → ${state.limit.toFixed(0)}, horizon: ${(prevHorizon / (60 * 60 * 1000)).toFixed(1)}h → ${(state.horizonMs / (60 * 60 * 1000)).toFixed(1)}h`);
          }
        }

        // Slide time window backward with overlap
        const slideAmount = state.horizonMs * (1 - overlapRatio);
        state.until = state.until - Math.floor(slideAmount / 1000);

        if (this.debug) {
          const untilDate = new Date(state.until * 1000).toISOString();
          console.log(`[AdaptiveFeed:${this.runId.slice(0, 8)}] Window slide: overlap=${(overlapRatio * 100).toFixed(0)}%, new_until=${untilDate}`);
        }

        // Prevent sliding into the future (sanity check)
        const now = Math.floor(Date.now() / 1000);
        if (state.until > now) {
          state.until = now;
        }

        // Continue to next step
        pendingTimeout = setTimeout(() => fetchStep(), 100); // Small delay between steps
      };

      // Start the fetch loop
      fetchStep().catch(err => {
        console.error('[AdaptiveFeed] Fetch error:', err);
        if (!aborted) {
          observer.error(err);
        }
      });

      // Return teardown function to cancel ongoing operations
      return () => {
        aborted = true;
        if (pendingTimeout !== null) {
          clearTimeout(pendingTimeout);
          pendingTimeout = null;
        }

        // Phase 1: Clean up all relay subscriptions to prevent late events
        subscriptions.forEach(sub => {
          try {
            sub.unsubscribe();
          } catch (err) {
            console.warn('[AdaptiveFeed] Error unsubscribing:', err);
          }
        });
        subscriptions.length = 0; // Clear array
      };
    });
  }

  /**
   * Updates the feed parameters
   */
  public updateParams(params: Partial<FeedParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Gets current parameters
   */
  public getParams(): FeedParams {
    return { ...this.params };
  }
}

/**
 * Convenience function: create and load WoT feed in one call
 * @param authors - Array of author pubkeys (WoT follows)
 * @param authorRelays - Map of author -> relay URLs
 * @param params - Optional feed parameters
 * @param debug - Enable diagnostic logging (default: false)
 * @returns Observable of feed events
 */
export function loadWoTFeed(
  authors: string[],
  authorRelays: RelayMap = new Map(),
  params: Partial<FeedParams> = {},
  debug: boolean = false
): Observable<FeedEvent> {
  const service = new AdaptiveFeedService(authors, authorRelays, params, debug);
  return service.load();
}
