import { Component, createSignal, onMount, onCleanup, createEffect, For, Show } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { createTimelineStream, relayPool, eventStore, relayConnectionManager, getActiveRelays, PROFILE_RELAYS, getUserInboxRelays } from '../lib/applesauce';
import { calculatePowScore } from '../lib/pow';
import { Note } from './Note';
import { AlgorithmControls } from './AlgorithmControls';
import { Subscription } from 'rxjs';
import { debug } from '../lib/debug';
import { usePreferences } from '../providers/PreferencesProvider';
import { VirtualizedNoteSlot } from './VirtualizedNoteSlot';

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
  // Per-note tick to ensure Note reacts to interaction arrivals
  const [interactionTicks, setInteractionTicks] = createSignal<Record<string, number>>({});

  let subscription: Subscription | null = null;
  let loadMoreObserver: IntersectionObserver | null = null;
  let sentinelRef: HTMLDivElement | undefined;

  // Component-level caches and state
  const eventCache = new Map<string, NostrEvent>();
  const reactionsCache = new Map<string, NostrEvent[]>();
  const repliesCache = new Map<string, NostrEvent[]>();
  const prefetchedEventIds = new Set<string>(); // Track which notes we've proactively prefetched
  const hydratingNotes = new Set<string>();
  const [hydratedNotes, setHydratedNotes] = createSignal<Record<string, boolean>>({});
  const [virtualizedNotes, setVirtualizedNotes] = createSignal<Record<string, number>>({});
  const PREFETCH_VISIBLE_BUFFER = 2; // Approximate number of notes above the fold
  let relaysCache: string[] = [];
  let recalculateTimer: number | null = null; // Debounce timer

  onMount(() => {
    const INITIAL_LOAD = 15; // Slightly larger initial batch for faster first paint
    const LOAD_MORE_BATCH = 8; // Load more per batch for smoother scrolling
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
            { rootMargin: '400px' }
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
  const markHydrated = (eventId: string) => {
    setHydratedNotes(prev => (prev[eventId] ? prev : { ...prev, [eventId]: true }));
    hydratingNotes.delete(eventId);
  };

  const handleNoteVisible = async (eventId: string) => {
    if (relaysCache.length === 0) return;
    if (hydratedNotes()[eventId]) return;
    if (hydratingNotes.has(eventId)) return;
    hydratingNotes.add(eventId);

    debug('[Timeline] Note visible, fetching reactions/replies for', eventId.slice(0, 8));

    // Build a robust relay set for interactions similar to NoteDetail/WoTTimeline
    // - Author inbox relays (primary destination for interactions)
    // - Currently connected relays (optimized pool)
    // - Active baseline relays and profile relays (fallbacks)
    const evt = eventCache.get(eventId);
    const author = evt?.pubkey;
    const relaySet = new Set<string>();
    // Connected relays from manager
    relaysCache.forEach(r => relaySet.add(r));
    // Baseline/active relays
    getActiveRelays().forEach(r => relaySet.add(r));
    PROFILE_RELAYS.forEach(r => relaySet.add(r));
    // Author inbox relays (await but safe if fails)
    try {
      if (author) {
        const inbox = await getUserInboxRelays(author);
        inbox.forEach(r => relaySet.add(r));
      }
    } catch {}

    const interactionRelays = Array.from(relaySet);
    if (interactionRelays.length === 0) {
      markHydrated(eventId);
      return;
    }

    // Fetch reactions
    let reactionsDone = false;
    let repliesDone = false;
    let finished = false;
    const finishHydration = () => {
      if (finished) return;
      finished = true;
      markHydrated(eventId);
    };
    const maybeFinish = () => {
      if (reactionsDone && repliesDone) {
        finishHydration();
      }
    };

    const reactionsObs = relayPool.req(interactionRelays, { kinds: [7], '#e': [eventId], limit: 1000 });
    const reactionsSub = reactionsObs.subscribe({
      next: (response) => {
        if (response === 'EOSE') {
          reactionsDone = true;
          maybeFinish();
          return;
        }
        if (response.kind === 7) {
          const reaction = response as NostrEvent;
          const existing = reactionsCache.get(eventId) || [];
          if (!existing.find(r => r.id === reaction.id)) {
            // Immutable update to trigger Solid reactivity downstream
            reactionsCache.set(eventId, [...existing, reaction]);
            // Persist to global EventStore so other views (e.g., NoteDetail) and cache can see it
            eventStore.add(reaction);
            // Show updates as they arrive (no debounce)
            recalculateScoresImmediate();
            // Bump interaction tick for this note to propagate prop change
            setInteractionTicks(prev => ({ ...prev, [eventId]: (prev[eventId] || 0) + 1 }));
          }
        }
      },
      error: (err) => {
        // Silently ignore relay errors
        debug('[Timeline] Reaction fetch error (ignoring):', err);
        reactionsDone = true;
        maybeFinish();
      },
      complete: () => {
        reactionsDone = true;
        maybeFinish();
      },
    });

    // Fetch replies
    const repliesObs = relayPool.req(interactionRelays, { kinds: [1], '#e': [eventId], limit: 1000 });
    const repliesSub = repliesObs.subscribe({
      next: (response) => {
        if (response === 'EOSE') {
          repliesDone = true;
          maybeFinish();
          return;
        }
        if (response.kind === 1) {
          const reply = response as NostrEvent;
          const existing = repliesCache.get(eventId) || [];
          if (!existing.find(r => r.id === reply.id)) {
            // Immutable update to trigger Solid reactivity downstream
            repliesCache.set(eventId, [...existing, reply]);
            // Persist to global EventStore so other views (e.g., NoteDetail) and cache can see it
            eventStore.add(reply);
            // Show updates as they arrive (no debounce)
            recalculateScoresImmediate();
            // Bump interaction tick for this note to propagate prop change
            setInteractionTicks(prev => ({ ...prev, [eventId]: (prev[eventId] || 0) + 1 }));
          }
        }
      },
      error: (err) => {
        // Silently ignore relay errors
        debug('[Timeline] Reply fetch error (ignoring):', err);
        repliesDone = true;
        maybeFinish();
      },
      complete: () => {
        repliesDone = true;
        maybeFinish();
      },
    });

    setTimeout(() => {
      if (!finished) {
        reactionsSub.unsubscribe();
        repliesSub.unsubscribe();
        finishHydration();
      }
    }, 6000);
  };

  // Prefetch interactions for notes just below the fold so they feel instant when scrolling
  createEffect(() => {
    const feedPrefs = preferences();
    const prefetchCount = Math.max(0, feedPrefs.feedParams.prefetchInteractionsCount ?? 0);
    const currentNotes = notes();
    const hydratedSnapshot = hydratedNotes();
    if (prefetchCount <= 0 || currentNotes.length === 0) return;

    const startIndex = Math.min(currentNotes.length, PREFETCH_VISIBLE_BUFFER);
    const endIndex = Math.min(currentNotes.length, startIndex + prefetchCount);

    for (let i = startIndex; i < endIndex; i++) {
      const eventId = currentNotes[i].event.id;
      if (hydratedSnapshot[eventId]) continue;
      if (hydratingNotes.has(eventId)) continue;
      if (prefetchedEventIds.has(eventId)) continue;
      prefetchedEventIds.add(eventId);
      queueMicrotask(() => {
        void handleNoteVisible(eventId);
      });
    }
  });

  // Helper to virtualize/unvirtualize notes and prune stale entries
  const markVirtualized = (eventId: string, height: number) => {
    setVirtualizedNotes((prev) => {
      if (prev[eventId]) return prev;
      return { ...prev, [eventId]: height };
    });
  };

  const unvirtualize = (eventId: string) => {
    setVirtualizedNotes((prev) => {
      if (!prev[eventId]) return prev;
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
  };

  createEffect(() => {
    const currentIds = new Set(notes().map((n) => n.event.id));
    setVirtualizedNotes((prev) => {
      let mutated = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        if (!currentIds.has(id)) {
          delete next[id];
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  });

  createEffect(() => {
    const currentIds = new Set(notes().map((n) => n.event.id));
    setHydratedNotes((prev) => {
      let mutated = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          delete next[id];
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  });

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    createEffect(() => {
      (window as any).__NOTEMINE_DEBUG = {
        ...(window as any).__NOTEMINE_DEBUG,
        timelineVirtualized: virtualizedNotes(),
        timelineHydrated: hydratedNotes(),
      };
    });
  }

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
            {(scoredNote) => {
              const noteId = scoredNote.event.id;
              const virtualizationMap = virtualizedNotes();
              const virtualHeight = virtualizationMap[noteId];

              return (
                <VirtualizedNoteSlot
                  eventId={noteId}
                  isVirtualized={virtualHeight !== undefined}
                  virtualHeight={virtualHeight}
                  canVirtualize={!!hydratedNotes()[noteId]}
                  onVirtualize={(height) => markVirtualized(noteId, height)}
                  onUnvirtualize={() => unvirtualize(noteId)}
                >
                  <Note
                    event={scoredNote.event}
                    score={scoredNote.score}
                    reactions={reactionsCache.get(noteId) || []}
                    replies={repliesCache.get(noteId) || []}
                  showScore={props.showScores ?? true}
                  onVisible={handleNoteVisible}
                  interactionTick={interactionTicks()[noteId] || 0}
                  isHydrated={!!hydratedNotes()[noteId]}
                />
              </VirtualizedNoteSlot>
              );
            }}
          </For>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} class="h-6" />

          {/* Loading more indicator */}
          <Show when={loadingMore()}>
            <div class="card p-4 text-center">
              <div class="inline-block animate-spin rounded-full h-6 w-6 border-4 border-accent border-t-transparent"></div>
              <p class="mt-2 text-sm text-text-secondary">Loading more...</p>
            </div>
          </Show>

          <Show when={hasMore()}>
            <div class="text-center text-xs text-text-tertiary flex items-center justify-center gap-2 py-3">
              <span class="inline-block h-2 w-2 rounded-full bg-text-tertiary animate-pulse" />
              <span>{loadingMore() ? 'Fetching more notes…' : 'Scroll to load more notes'}</span>
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
