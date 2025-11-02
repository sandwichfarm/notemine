import { Component, createSignal, onMount, onCleanup, For, Show, createEffect } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { createTimelineStream, getActiveRelays, relayPool, eventStore, batchFetchMetadata, getPowRelays } from '../lib/applesauce';
import { calculatePowScore, getPowDifficulty, hasValidPow } from '../lib/pow';
import { Note } from './Note';
import { Subscription } from 'rxjs';
import { relayStatsTracker } from '../lib/relay-stats';
import { debug } from '../lib/debug';

// Minimum POW difficulty required for notes to appear in timeline
const MIN_POW_DIFFICULTY = 8;

interface InfiniteTimelineProps {
  limit?: number;
  showScores?: boolean;
}

interface ScoredNote {
  event: NostrEvent;
  score: number;
}

export const InfiniteTimeline: Component<InfiniteTimelineProps> = (props) => {
  const [notes, setNotes] = createSignal<ScoredNote[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [hasMore, setHasMore] = createSignal(true);
  const [oldestTimestamp, setOldestTimestamp] = createSignal<number | undefined>(undefined);

  let timelineLoader: ((since?: number) => any) | null = null;
  let currentSubscription: Subscription | null = null;

  const eventCache = new Map<string, NostrEvent>();
  const reactionsCache = new Map<string, NostrEvent[]>();
  const repliesCache = new Map<string, NostrEvent[]>();
  const batchSize = props.limit ?? 20;

  const loadEvents = (since?: number) => {
    if (!timelineLoader) return;

    const isLoadingMore = since !== undefined;
    if (isLoadingMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    debug('[InfiniteTimeline] Loading events', { since, isLoadingMore });

    const relays = getActiveRelays();
    debug('[InfiniteTimeline] Active relays:', relays);
    let eventCount = 0;

    // Track EOSE from each relay
    const relayCompletions = new Set<string>();
    let hasSetLoadingFalse = false;

    const checkAllComplete = () => {
      if (hasSetLoadingFalse) return;
      debug(`[InfiniteTimeline] checkAllComplete: ${relayCompletions.size}/${relays.length} relays done, ${eventCount} events`);
      if (relayCompletions.size === relays.length) {
        hasSetLoadingFalse = true;
        debug('[InfiniteTimeline] All relays complete', { eventCount, batchSize });
        setLoading(false);
        setLoadingMore(false);

        // If we got fewer events than requested, we've reached the end
        if (eventCount < batchSize) {
          debug('[InfiniteTimeline] Fewer events than batch size, marking hasMore=false');
          setHasMore(false);
        }
      }
    };

    // Subscribe to each relay individually to track which relay sent which event
    const relaySubscriptions: Subscription[] = [];

    relays.forEach((relayUrl) => {
      const filter = { kinds: [1, 30023], limit: batchSize, ...(since ? { until: since } : {}) };
      debug(`[InfiniteTimeline] Querying relay ${relayUrl} with filter:`, filter);
      const relay$ = relayPool.req([relayUrl], filter);

      const sub = relay$.subscribe({
        next: (response) => {
          if (response === 'EOSE') {
            debug(`[InfiniteTimeline] EOSE from ${relayUrl}`);
            relayCompletions.add(relayUrl);
            debug(`[InfiniteTimeline] Completions: ${relayCompletions.size}/${relays.length}`);
            checkAllComplete();
            return;
          }

          // Only process kind 1 (short notes) and kind 30023 (long-form content)
          if (response.kind === 1 || response.kind === 30023) {
            const event = response as NostrEvent;
            debug(`[InfiniteTimeline] Processing event from ${relayUrl}: ${event.id.slice(0, 8)} kind=${event.kind}`);

            // Track which relay sent this event
            relayStatsTracker.recordEvent(relayUrl, event.id);

            // Filter out replies - ROOT NOTES ONLY (notes without 'e' tags)
            const hasETag = event.tags.some((tag) => tag[0] === 'e');
            if (hasETag) {
              debug(`[InfiniteTimeline] Filtering out reply ${event.id.slice(0, 8)}`);
              return;
            }

            // Filter out events that don't meet minimum POW requirement
            const powDifficulty = getPowDifficulty(event);
            const eventHasValidPow = hasValidPow(event, MIN_POW_DIFFICULTY);
            if (!eventHasValidPow || powDifficulty < MIN_POW_DIFFICULTY) {
              debug(`[InfiniteTimeline] Filtering out event ${event.id.slice(0, 8)} (POW ${powDifficulty} < ${MIN_POW_DIFFICULTY}, has nonce: ${eventHasValidPow})`);
              return;
            }

            eventCount++;
            eventCache.set(event.id, event);
            // Add to global event store so it's available when navigating to detail page
            eventStore.add(event);

            // Track oldest timestamp for pagination
            const currentOldest = oldestTimestamp();
            if (!currentOldest || event.created_at < currentOldest) {
              setOldestTimestamp(event.created_at);
            }

            // Initialize reaction and reply arrays
            if (!reactionsCache.has(event.id)) {
              reactionsCache.set(event.id, []);
            }
            if (!repliesCache.has(event.id)) {
              repliesCache.set(event.id, []);
            }

            // Fetch reactions for this event
            const reactionsObs = relayPool.req(relays, { kinds: [7], '#e': [event.id], limit: 100 });
            reactionsObs.subscribe({
              next: (response) => {
                if (response !== 'EOSE' && response.kind === 7) {
                  const reaction = response as NostrEvent;
                  const existing = reactionsCache.get(event.id) || [];
                  if (!existing.find((r) => r.id === reaction.id)) {
                    existing.push(reaction);
                    reactionsCache.set(event.id, existing);
                    eventStore.add(reaction);
                    recalculateScores();
                  }
                }
              },
            });

            // Fetch replies for this event
            const repliesObs = relayPool.req(relays, { kinds: [1], '#e': [event.id], limit: 50 });
            repliesObs.subscribe({
              next: (response) => {
                if (response !== 'EOSE' && response.kind === 1) {
                  const reply = response as NostrEvent;
                  const existing = repliesCache.get(event.id) || [];
                  if (!existing.find((r) => r.id === reply.id)) {
                    existing.push(reply);
                    repliesCache.set(event.id, existing);
                    eventStore.add(reply);
                    recalculateScores();
                  }
                }
              },
            });

            recalculateScores();
          }
        },
        error: (err: unknown) => {
          console.error(`[InfiniteTimeline] Error from ${relayUrl}:`, err);
          // Count errors as completion to avoid hanging
          relayCompletions.add(relayUrl);
          checkAllComplete();
        },
        complete: () => {
          debug(`[InfiniteTimeline] ${relayUrl} subscription complete`);
          relayCompletions.add(relayUrl);
          checkAllComplete();
        },
      });

      relaySubscriptions.push(sub);
    });

    // Fallback timeout - if relays don't respond within 10 seconds, stop loading
    setTimeout(() => {
      if (!hasSetLoadingFalse) {
        debug('[InfiniteTimeline] Timeout reached, stopping loading and unsubscribing');
        hasSetLoadingFalse = true;
        setLoading(false);
        setLoadingMore(false);
        // Unsubscribe from all relay subscriptions on timeout
        relaySubscriptions.forEach(sub => sub.unsubscribe());
      }
    }, 10000);

    // Store subscriptions for cleanup
    currentSubscription = { unsubscribe: () => relaySubscriptions.forEach(sub => sub.unsubscribe()) } as Subscription;
  };

  const recalculateScores = () => {
    const scoredNotes = Array.from(eventCache.values())
      // Safety filter: only include ROOT notes (kind 1 or 30023, no 'e' tags = not replies)
      .filter((evt) => {
        const isCorrectKind = evt.kind === 1 || evt.kind === 30023;
        const isRootNote = !evt.tags.some((tag) => tag[0] === 'e');
        return isCorrectKind && isRootNote;
      })
      .map((evt) => {
        const reactions = reactionsCache.get(evt.id) || [];
        const replies = repliesCache.get(evt.id) || [];

        // Calculate score with reactions
        const score = calculatePowScore(evt, reactions);

        // Add reply POW to total score (delegated POW from replies)
        // Note: calculatePowScore already handles this, but we're adding extra here
        const repliesPow = replies.reduce((sum, r) => {
          return sum + (hasValidPow(r, 1) ? getPowDifficulty(r) : 0);
        }, 0);
        const totalScore = score.totalScore + repliesPow;

        return { event: evt, score: totalScore };
      });

    // Sort by score
    scoredNotes.sort((a, b) => b.score - a.score);

    setNotes(scoredNotes);

    // Batch fetch metadata for all unique pubkeys
    const uniquePubkeys = new Set<string>();
    for (const note of scoredNotes) {
      uniquePubkeys.add(note.event.pubkey);
    }
    // Also fetch for reactions and replies authors
    for (const reactions of reactionsCache.values()) {
      reactions.forEach(r => uniquePubkeys.add(r.pubkey));
    }
    for (const replies of repliesCache.values()) {
      replies.forEach(r => uniquePubkeys.add(r.pubkey));
    }

    if (uniquePubkeys.size > 0) {
      batchFetchMetadata(Array.from(uniquePubkeys));
    }
  };

  const loadMore = () => {
    if (loadingMore() || !hasMore()) return;

    const oldest = oldestTimestamp();
    if (oldest === undefined) return;

    debug('[InfiniteTimeline] Loading more from', oldest);
    loadEvents(oldest);
  };

  const handleScroll = () => {
    if (loadingMore() || !hasMore()) return;

    // Check window scroll position
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    const scrollPercentage = (scrollTop + windowHeight) / documentHeight;

    // Load more when scrolled to 80% of the way down
    if (scrollPercentage > 0.8) {
      loadMore();
    }
  };

  // Watch for relay changes and reload timeline when NIP-66 relays are discovered
  createEffect(() => {
    // Track reactive dependency on pow relays even if value is unused
    void getPowRelays();
    const relays = getActiveRelays();

    debug('[InfiniteTimeline] Relay change detected, relays:', relays);

    if (relays.length === 0) {
      setError('No relays connected');
      setLoading(false);
      return;
    }

    // Unsubscribe from previous subscription
    currentSubscription?.unsubscribe();

    // Clear cache and reset state for fresh load
    eventCache.clear();
    reactionsCache.clear();
    repliesCache.clear();
    setNotes([]);
    setOldestTimestamp(undefined);
    setHasMore(true);

    // Create the timeline loader function with new relays
    timelineLoader = (since?: number) => {
      return createTimelineStream(
        relays,
        [{ kinds: [1], limit: batchSize, ...(since ? { until: since } : {}) }],
        { limit: batchSize }
      );
    };

    // Load initial events
    debug('[InfiniteTimeline] Reloading with updated relays:', relays);
    loadEvents();
  });

  onMount(() => {
    // Add scroll listener to window
    window.addEventListener('scroll', handleScroll);
  });

  onCleanup(() => {
    currentSubscription?.unsubscribe();
    window.removeEventListener('scroll', handleScroll);
  });

  return (
    <div class="w-full max-w-2xl mx-auto space-y-4">
      {/* Initial Loading state */}
      <Show when={loading() && notes().length === 0}>
        <div class="card p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
          <p class="mt-4 text-text-secondary">Loading notes from POW relays...</p>
        </div>
      </Show>

      {/* Error state */}
      <Show when={error()}>
        <div class="card p-4 bg-red-100 dark:bg-red-900/20 border-red-500">
          <p class="text-red-700 dark:text-red-400">Error: {error()}</p>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!loading() && !error() && notes().length === 0}>
        <div class="card p-8 text-center">
          <p class="text-xl mb-2">⛏️</p>
          <p class="text-text-secondary">No notes found</p>
          <p class="text-sm text-text-tertiary mt-2">
            Be the first to post with proof-of-work!
          </p>
        </div>
      </Show>

      {/* Notes list */}
      <Show when={notes().length > 0}>
        <div class="space-y-3">
          <div class="text-sm text-text-secondary mb-2">
            {notes().length} notes • sorted by POW score
          </div>
          <For each={notes()}>
            {(scoredNote) => (
              <Note
                event={scoredNote.event}
                score={scoredNote.score}
                showScore={props.showScores ?? true}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Load more indicator */}
      <Show when={loadingMore()}>
        <div class="card p-4 text-center">
          <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent"></div>
          <p class="mt-2 text-sm text-text-secondary">Loading more...</p>
        </div>
      </Show>

      {/* End of feed */}
      <Show when={!hasMore() && notes().length > 0}>
        <div class="card p-4 text-center text-sm text-text-secondary">
          <p>⛏️ You've reached the end of the feed</p>
        </div>
      </Show>
    </div>
  );
};
