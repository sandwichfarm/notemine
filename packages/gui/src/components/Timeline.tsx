import { Component, createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { createTimelineStream, relayPool, eventStore, relayConnectionManager } from '../lib/applesauce';
import { calculatePowScore } from '../lib/pow';
import { Note } from './Note';
import { AlgorithmControls } from './AlgorithmControls';
import { Subscription } from 'rxjs';
import { debug } from '../lib/debug';
import { usePreferences } from '../providers/PreferencesProvider';

interface TimelineProps {
  limit?: number;
  showScores?: boolean;
}

interface ScoredNote {
  event: NostrEvent;
  score: number;
}

export const Timeline: Component<TimelineProps> = (props) => {
  const { preferences } = usePreferences();
  const [notes, setNotes] = createSignal<ScoredNote[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [hasMore, setHasMore] = createSignal(true);

  let subscription: Subscription | null = null;
  let loadMoreObserver: IntersectionObserver | null = null;
  let sentinelRef: HTMLDivElement | undefined;

  // Component-level caches and state
  const eventCache = new Map<string, NostrEvent>();
  const reactionsCache = new Map<string, NostrEvent[]>();
  const repliesCache = new Map<string, NostrEvent[]>();
  const trackedEventIds = new Set<string>(); // Track which events have reactions/replies loaded
  let relaysCache: string[] = [];
  let recalculateTimer: number | null = null; // Debounce timer

  onMount(() => {
    const INITIAL_LOAD = 10; // Start with just 10 notes
    const LOAD_MORE_BATCH = 5; // Load 5 more at a time
    const maxEvents = props.limit ?? 100;
    let oldestTimestamp = Math.floor(Date.now() / 1000);

    try {
      // Use relay connection manager's connected relays (limited and optimized)
      const relays = relayConnectionManager.getConnectedRelays();
      relaysCache = relays; // Store for lazy loading
      debug('[Timeline] Loading from relays:', relays);
      debug('[Timeline] Connection stats:', relayConnectionManager.getStats());

      if (relays.length === 0) {
        setError('No relays connected');
        setLoading(false);
        return;
      }

      // Create initial timeline subscription for kind 1 (notes) and kind 30023 (long-form articles)
      const timeline$ = createTimelineStream(relays, [{ kinds: [1, 30023], limit: INITIAL_LOAD }], {
        limit: INITIAL_LOAD,
      });

      // Subscribe to timeline updates
      subscription = timeline$.subscribe({
        next: (event: NostrEvent) => {
          // Stop showing spinner on first cache/network event (even if reply)
          if (loading()) {
            setLoading(false);
          }

          // Filter out replies - only show root notes (no 'e' tags)
          const hasETag = event.tags.some((tag) => tag[0] === 'e');
          if (hasETag) {
            debug('[Timeline] Skipping reply:', event.id.slice(0, 8));
            return;
          }

          eventCache.set(event.id, event);

          // CRITICAL FIX: Add event to eventStore so NoteDetail can find it
          // This is what InfiniteTimeline does correctly
          eventStore.add(event);

          // Track oldest timestamp for pagination
          if (event.created_at < oldestTimestamp) {
            oldestTimestamp = event.created_at;
          }

          // Initialize reaction and reply arrays for this event
          if (!reactionsCache.has(event.id)) {
            reactionsCache.set(event.id, []);
          }
          if (!repliesCache.has(event.id)) {
            repliesCache.set(event.id, []);
          }

          recalculateScores();
        },
        error: (err: unknown) => {
          // Silently ignore relay errors (like 401) - they're expected with some relays
          debug('[Timeline] Relay error (ignoring):', err);
        },
        complete: () => {
          setLoading(false);
          recalculateScoresImmediate(); // Final update when stream completes
        },
      });

      // Function to load more notes
      function loadMore() {
        if (loadingMore() || !hasMore()) return;

        setLoadingMore(true);
        const since = oldestTimestamp - 1;
        debug('[Timeline] Loading more via loader, since:', since);

        const moreTimeline$ = createTimelineStream(
          relays,
          [{ kinds: [1, 30023], limit: LOAD_MORE_BATCH }],
          { limit: LOAD_MORE_BATCH, since }
        );

        let receivedCount = 0;
        moreTimeline$.subscribe({
          next: (event: NostrEvent) => {
            // Filter out replies - only show root notes
            const hasETag = event.tags.some((tag) => tag[0] === 'e');
            if (hasETag) return;

            if (!eventCache.has(event.id)) {
              eventCache.set(event.id, event);
              receivedCount++;
              eventStore.add(event);
              if (event.created_at < oldestTimestamp) {
                oldestTimestamp = event.created_at;
              }
              if (!reactionsCache.has(event.id)) reactionsCache.set(event.id, []);
              if (!repliesCache.has(event.id)) repliesCache.set(event.id, []);
              recalculateScores();
            }
          },
          error: () => {
            setLoadingMore(false);
          },
          complete: () => {
            setLoadingMore(false);
            if (receivedCount < LOAD_MORE_BATCH || eventCache.size >= maxEvents) {
              setHasMore(false);
              debug('[Timeline] No more notes to load (complete)');
            }
          },
        });
      }



      // Set up intersection observer for infinite scroll
      setTimeout(() => {
        if (sentinelRef) {
          loadMoreObserver = new IntersectionObserver(
            (entries) => {
              if (entries[0].isIntersecting && hasMore() && !loadingMore()) {
                debug('[Timeline] Sentinel visible, loading more...');
                loadMore();
              }
            },
            { rootMargin: '200px' }
          );
          loadMoreObserver.observe(sentinelRef);
        }
      }, 100);
    } catch (err) {
      console.error('[Timeline] Setup error:', err);
      setError(String(err));
      setLoading(false);
    }
  });

  onCleanup(() => {
    subscription?.unsubscribe();
    loadMoreObserver?.disconnect();
    if (recalculateTimer !== null) {
      clearTimeout(recalculateTimer);
    }
  });

  // Lazy loading handler for reactions/replies (outside onMount so it can access caches)
  const handleNoteVisible = (eventId: string) => {
    if (trackedEventIds.has(eventId) || relaysCache.length === 0) return;
    trackedEventIds.add(eventId);

    debug('[Timeline] Note visible, fetching reactions/replies for', eventId.slice(0, 8));

    // Fetch reactions
    const reactionsObs = relayPool.req(relaysCache, { kinds: [7], '#e': [eventId], limit: 100 });
    reactionsObs.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === 7) {
          const reaction = response as NostrEvent;
          const existing = reactionsCache.get(eventId) || [];
          if (!existing.find(r => r.id === reaction.id)) {
            existing.push(reaction);
            reactionsCache.set(eventId, existing);
            // Persist to global EventStore so other views (e.g., NoteDetail) and cache can see it
            eventStore.add(reaction);
            recalculateScores();
          }
        }
      },
      error: (err) => {
        // Silently ignore relay errors
        debug('[Timeline] Reaction fetch error (ignoring):', err);
      },
    });

    // Fetch replies
    const repliesObs = relayPool.req(relaysCache, { kinds: [1], '#e': [eventId], limit: 50 });
    repliesObs.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === 1) {
          const reply = response as NostrEvent;
          const existing = repliesCache.get(eventId) || [];
          if (!existing.find(r => r.id === reply.id)) {
            existing.push(reply);
            repliesCache.set(eventId, existing);
            // Persist to global EventStore so other views (e.g., NoteDetail) and cache can see it
            eventStore.add(reply);
            recalculateScores();
          }
        }
      },
      error: (err) => {
        // Silently ignore relay errors
        debug('[Timeline] Reply fetch error (ignoring):', err);
      },
    });
  };

  // Helper function to recalculate scores immediately (for when loading completes)
  const recalculateScoresImmediate = () => {
    const prefs = preferences();
    const scoredNotes = Array.from(eventCache.values()).map((evt) => {
      const reactions = reactionsCache.get(evt.id) || [];
      const replies = repliesCache.get(evt.id) || [];

      // Calculate score with reactions, replies, and user preferences
      const score = calculatePowScore(evt, reactions, replies, {
        reactionPowWeight: prefs.reactionPowWeight,
        replyPowWeight: prefs.replyPowWeight,
        profilePowWeight: prefs.profilePowWeight,
        nonPowReactionWeight: prefs.nonPowReactionWeight,
        nonPowReplyWeight: prefs.nonPowReplyWeight,
        powInteractionThreshold: prefs.powInteractionThreshold,
      });

      return { event: evt, score: score.totalScore };
    });

    scoredNotes.sort((a, b) => b.score - a.score);
    setNotes(scoredNotes);
    setLoading(false);
  };

  // Debounced version - only recalculate after events stop arriving for 300ms
  const recalculateScores = () => {
    if (recalculateTimer !== null) {
      clearTimeout(recalculateTimer);
    }
    recalculateTimer = window.setTimeout(() => {
      recalculateScoresImmediate();
      recalculateTimer = null;
    }, 300); // Wait 300ms after last event before recalculating
  };

  return (
    <div class="w-full max-w-2xl mx-auto space-y-4">
      {/* Algorithm Controls */}
      <Show when={!loading() && notes().length > 0}>
        <AlgorithmControls onUpdate={recalculateScoresImmediate} />
      </Show>

      {/* Loading state */}
      <Show when={loading()}>
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
      <Show when={!loading() && notes().length > 0}>
        <div class="space-y-3">
          <div class="text-sm text-text-secondary mb-2">
            {notes().length} notes • sorted by POW score
          </div>
          <For each={notes()}>
            {(scoredNote) => (
              <Note
                event={scoredNote.event}
                score={scoredNote.score}
                reactions={reactionsCache.get(scoredNote.event.id) || []}
                replies={repliesCache.get(scoredNote.event.id) || []}
                showScore={props.showScores ?? true}
                onVisible={handleNoteVisible}
              />
            )}
          </For>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} class="h-4" />

          {/* Loading more indicator */}
          <Show when={loadingMore()}>
            <div class="card p-4 text-center">
              <div class="inline-block animate-spin rounded-full h-6 w-6 border-4 border-accent border-t-transparent"></div>
              <p class="mt-2 text-sm text-text-secondary">Loading more...</p>
            </div>
          </Show>

          {/* End of feed indicator */}
          <Show when={!hasMore() && !loadingMore()}>
            <div class="card p-4 text-center">
              <p class="text-sm text-text-tertiary">You've reached the end</p>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
