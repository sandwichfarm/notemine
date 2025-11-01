import { Component, createSignal, onCleanup, For, Show, createEffect } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { relayPool, getUserFollows, getUserOutboxRelays, getUserInboxRelays, eventStore } from '../lib/applesauce';
import { calculatePowScore } from '../lib/pow';
import { Note } from './Note';
import { Subscription } from 'rxjs';
import { usePreferences } from '../providers/PreferencesProvider';

interface WoTTimelineProps {
  userPubkey: string;
  limit?: number;
  showScores?: boolean;
}

interface ScoredNote {
  event: NostrEvent;
  score: number;
}

export const WoTTimeline: Component<WoTTimelineProps> = (props) => {
  const { preferences } = usePreferences();
  const [notes, setNotes] = createSignal<ScoredNote[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [loadingStatus, setLoadingStatus] = createSignal<string>('Initializing...');
  const [hasMore, setHasMore] = createSignal(true);

  let subscriptions: Subscription[] = [];
  let eventCache = new Map<string, NostrEvent>();
  let reactionsCache = new Map<string, NostrEvent[]>();
  let repliesCache = new Map<string, NostrEvent[]>();
  let trackedEventIds = new Set<string>(); // Track which events already have reaction/reply subscriptions
  let myInboxRelays: string[] = []; // Store inbox relays at component level
  let allFollows: string[] = []; // Store all follows
  let loadedFollowsCount = 0; // Track how many follows we've loaded
  let loadMoreObserver: IntersectionObserver | null = null;
  let sentinelRef: HTMLDivElement | undefined;
  let recalculateTimer: number | null = null; // Debounce timer

  // Watch for userPubkey changes and reload timeline
  createEffect(() => {
    const userPubkey = props.userPubkey;

    // Guard: Don't run if pubkey is not provided
    if (!userPubkey || userPubkey.length < 10) {
      console.log('[WoTTimeline] Waiting for valid pubkey...');
      return;
    }

    // Clean up previous subscriptions properly
    console.log('[WoTTimeline] Cleaning up', subscriptions.length, 'previous subscriptions');
    subscriptions.forEach(sub => {
      try {
        sub.unsubscribe();
      } catch (e) {
        console.error('[WoTTimeline] Error unsubscribing:', e);
      }
    });
    subscriptions = [];

      // Reset state
    eventCache.clear();
    reactionsCache.clear();
    repliesCache.clear();
    trackedEventIds.clear();
    setNotes([]);
    setLoading(true);
    setLoadingMore(false);
    setHasMore(true);
    setError(null);
    allFollows = [];
    loadedFollowsCount = 0;

    console.log('[WoTTimeline] Loading WoT feed for', userPubkey.slice(0, 8));

    // Async function to load WoT timeline
    const loadWoTTimeline = async () => {
      try {
        // Step 1: Get my follows
        setLoadingStatus('Fetching your follows...');
        const follows = await getUserFollows(userPubkey);
        console.log('[WoTTimeline] Found', follows.length, 'follows');

        if (follows.length === 0) {
          // No follows: show a graceful empty state (no error)
          setLoading(false);
          setHasMore(false);
          setLoadingStatus('');
          return;
        }

        allFollows = follows;

        // Step 2: Get my inbox relays (for later lazy loading of reactions/replies)
        myInboxRelays = await getUserInboxRelays(userPubkey);
        console.log('[WoTTimeline] My inbox relays:', myInboxRelays);

        // Step 3: Load initial batch of follows (just 10 to start)
        await loadMoreFollows();

        // Turn off initial loading
        setLoading(false);
        setLoadingStatus('');

        // Function to load more follows
        async function loadMoreFollows() {
          if (loadedFollowsCount >= allFollows.length) {
            setHasMore(false);
            return;
          }

          setLoadingMore(true);
          const LOAD_BATCH = 3; // Load only 3 follows at a time
          const batch = allFollows.slice(loadedFollowsCount, loadedFollowsCount + LOAD_BATCH);
          loadedFollowsCount += batch.length;

          console.log('[WoTTimeline] Loading batch:', batch.length, 'follows. Total loaded:', loadedFollowsCount, '/', allFollows.length);

          const batchPromises = batch.map(async (followPubkey) => {
            const outboxRelays = await getUserOutboxRelays(followPubkey);

            if (outboxRelays.length === 0) {
              console.log('[WoTTimeline] Skipping', followPubkey.slice(0, 8), '- no outbox relays');
              return;
            }

            // Subscribe to this follow's notes
            const filter = {
              kinds: [1],
              authors: [followPubkey],
              limit: 10 // Smaller limit per follow
            };

            const relay$ = relayPool.req(outboxRelays, filter);
            const sub = relay$.subscribe({
              next: (response) => {
                if (response !== 'EOSE' && response.kind === 1) {
                  const event = response as NostrEvent;

                  // Filter out replies (only root notes)
                  const hasETag = event.tags.some((tag) => tag[0] === 'e');
                  if (hasETag) return;

                  // Add to cache
                  eventCache.set(event.id, event);

                  // CRITICAL FIX: Add event to eventStore so NoteDetail can find it
                  eventStore.add(event);

                  // Initialize reaction/reply caches (but don't fetch yet - will be lazy loaded)
                  if (!reactionsCache.has(event.id)) {
                    reactionsCache.set(event.id, []);
                  }
                  if (!repliesCache.has(event.id)) {
                    repliesCache.set(event.id, []);
                  }

                  // Update UI with debouncing
                  recalculateScores();
                }
              },
              error: (err) => {
                // Silently ignore relay errors (like 401) - they're expected with some relays
                console.log('[WoTTimeline] Relay error (ignoring):', err);
              },
            });

            subscriptions.push(sub);
          });

          await Promise.all(batchPromises);
          setLoadingMore(false);

          if (loadedFollowsCount >= allFollows.length) {
            setHasMore(false);
            console.log('[WoTTimeline] All follows loaded');
          }
        }

        // Set up intersection observer for infinite scroll
        setTimeout(() => {
          if (sentinelRef) {
            loadMoreObserver = new IntersectionObserver(
              (entries) => {
                if (entries[0].isIntersecting && hasMore() && !loadingMore()) {
                  console.log('[WoTTimeline] Sentinel visible, loading more follows...');
                  loadMoreFollows();
                }
              },
              { rootMargin: '200px' }
            );
            loadMoreObserver.observe(sentinelRef);
          }
        }, 100);

      } catch (err) {
        console.error('[WoTTimeline] Setup error:', err);
        setError(String(err));
        setLoading(false);
      }
    };

    // Start loading
    loadWoTTimeline();
  });

  // Lazy loading handler for reactions/replies (defined outside createEffect so it's stable)
  const handleNoteVisible = (eventId: string) => {
    // Don't fetch if already tracked
    if (trackedEventIds.has(eventId)) {
      return;
    }

    trackedEventIds.add(eventId);

    if (myInboxRelays.length === 0) {
      console.warn('[WoTTimeline] No inbox relays available for lazy loading');
      return;
    }

    console.log('[WoTTimeline] Note visible, fetching reactions/replies for', eventId.slice(0, 8));

    // Fetch reactions (kind 7)
    const reactionsObs = relayPool.req(myInboxRelays, { kinds: [7], '#e': [eventId], limit: 100 });
    const reactionsSub = reactionsObs.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === 7) {
          const reaction = response as NostrEvent;
          const existing = reactionsCache.get(eventId) || [];
          if (!existing.find(r => r.id === reaction.id)) {
            existing.push(reaction);
            reactionsCache.set(eventId, existing);
            recalculateScores();
          }
        }
      },
      error: (err) => {
        // Silently ignore relay errors
        console.log('[WoTTimeline] Reaction fetch error (ignoring):', err);
      },
    });
    subscriptions.push(reactionsSub);

    // Fetch replies (kind 1 with e tag)
    const repliesObs = relayPool.req(myInboxRelays, { kinds: [1], '#e': [eventId], limit: 50 });
    const repliesSub = repliesObs.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === 1) {
          const reply = response as NostrEvent;
          const existing = repliesCache.get(eventId) || [];
          if (!existing.find(r => r.id === reply.id)) {
            existing.push(reply);
            repliesCache.set(eventId, existing);
            recalculateScores();
          }
        }
      },
      error: (err) => {
        // Silently ignore relay errors
        console.log('[WoTTimeline] Reply fetch error (ignoring):', err);
      },
    });
    subscriptions.push(repliesSub);
  };

  // Helper function to recalculate scores immediately
  const recalculateScoresImmediate = () => {
    const prefs = preferences();
    const scoredNotes = Array.from(eventCache.values())
      .filter((evt) => {
        // Only include root notes (no 'e' tags)
        const isRootNote = !evt.tags.some((tag) => tag[0] === 'e');
        return isRootNote;
      })
      .map((evt) => {
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

    // Sort by total score (including delegated PoW)
    scoredNotes.sort((a, b) => b.score - a.score);

    setNotes(scoredNotes);
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

  onCleanup(() => {
    console.log('[WoTTimeline] Cleaning up', subscriptions.length, 'subscriptions');
    subscriptions.forEach(sub => {
      try {
        sub.unsubscribe();
      } catch (e) {
        console.error('[WoTTimeline] Cleanup error:', e);
      }
    });
    loadMoreObserver?.disconnect();
    if (recalculateTimer !== null) {
      clearTimeout(recalculateTimer);
    }
  });

  return (
    <div class="w-full max-w-2xl mx-auto space-y-4">
      {/* Loading state */}
      <Show when={loading()}>
        <div class="card p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
          <p class="mt-4 text-text-secondary">{loadingStatus()}</p>
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
          <p class="text-xl mb-2">📭</p>
          <p class="text-text-secondary">No notes found from your follows</p>
          <p class="text-sm text-text-tertiary mt-2">
            Notes from people you follow will appear here
          </p>
        </div>
      </Show>

      {/* Notes list */}
      <Show when={notes().length > 0}>
        <div class="space-y-3">
          <div class="text-sm text-text-secondary mb-2">
            {notes().length} notes from your Web of Trust • sorted by total PoW (including delegated)
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
              <p class="mt-2 text-sm text-text-secondary">Loading more from your follows...</p>
            </div>
          </Show>

          {/* End of feed indicator */}
          <Show when={!hasMore() && !loadingMore()}>
            <div class="card p-4 text-center">
              <p class="text-sm text-text-tertiary">You've reached the end • All follows loaded</p>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
