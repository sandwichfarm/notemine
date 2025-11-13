import { Component, createSignal, onCleanup, For, Show, createEffect } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { relayPool, getUserFollows, getUserOutboxRelays, getUserInboxRelays, eventStore, createTimelineStream, getActiveRelays } from '../lib/applesauce';
import { getCachedEventsByFilters } from '../lib/cache';
import { calculatePowScore } from '../lib/pow';
import { Note } from './Note';
import { AlgorithmControls } from './AlgorithmControls';
import { FeedControls } from './FeedControls';
import { NewNotesBar } from './NewNotesBar';
import { Subscription } from 'rxjs';
import { usePreferences } from '../providers/PreferencesProvider';
import { loadWoTFeed, type RelayMap } from '../services/AdaptiveFeedService';
import { IntakePrioritizer } from '../services/IntakePrioritizer';
import { MediaPreloader } from '../services/MediaPreloader';
import type { PreparedNote } from '../types/FeedTypes';

interface WoTTimelineProps {
  userPubkey: string;
  limit?: number;
  showScores?: boolean;
}

interface ScoredNote {
  event: NostrEvent;
  score: number;
  preparedNote?: PreparedNote; // Reserved heights for stable rendering
  insertionOrder: number; // Preserve insertion order
}

export const WoTTimeline: Component<WoTTimelineProps> = (props) => {
  const { preferences } = usePreferences();
  const [notes, setNotes] = createSignal<ScoredNote[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [loadingStatus, setLoadingStatus] = createSignal<string>('Initializing...');
  const [reloadTrigger, setReloadTrigger] = createSignal(0); // Trigger feed reload

  // Phase 3: New notes queuing
  const [pendingNotes, setPendingNotes] = createSignal<ScoredNote[]>([]);
  const [isAtTop, setIsAtTop] = createSignal(true); // Track if user is at top of feed

  let subscriptions: Subscription[] = [];
  let eventCache = new Map<string, NostrEvent>();
  let reactionsCache = new Map<string, NostrEvent[]>();
  let repliesCache = new Map<string, NostrEvent[]>();
  let trackedEventIds = new Set<string>(); // Track which events already have reaction/reply subscriptions
  let myInboxRelays: string[] = []; // Store inbox relays at component level
  let insertionCounter = 0; // Track insertion order for stable sorting
  let feedContainerRef: HTMLDivElement | undefined; // Ref for scroll detection
  let bottomSentinelRef: HTMLDivElement | undefined; // Sentinel for infinite scroll
  let scrollListenerActive = false;
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  let oldestTimestamp = Math.floor(Date.now() / 1000);
  let currentAuthors: string[] = []; // Follows list captured for load more
  let currentAuthorRelays: RelayMap = new Map(); // Author relay map captured for load more
  let loadMoreObserver: IntersectionObserver | null = null;
  let liveSinceTimestamp = Math.floor(Date.now() / 1000);

  // Services for Phase 1 & 2 (initialized with debug mode based on preferences)
  const initDebug = () => preferences().feedDebugMode || false;
  const prioritizer = new IntakePrioritizer();
  const preloader = new MediaPreloader({}, initDebug());

  // Fun loading messages
  const funMessages = [
    "🔍 Searching the nostrverse...",
    "⚡ Mining for quality notes...",
    "🌊 Surfing through your web of trust...",
    "🎯 Gathering notes from your follows...",
    "🎨 Curating your personalized feed...",
    "🚀 Fetching notes at lightspeed...",
    "🎪 Building your timeline circus...",
    "🎭 Assembling the note theatre...",
    "🎲 Rolling for high-quality content...",
    "🎸 Tuning your social frequency...",
  ];

  const getRandomFunMessage = () => {
    return funMessages[Math.floor(Math.random() * funMessages.length)];
  };

  // Phase 3: Scroll detection to determine if user is at top
  const checkScrollPosition = () => {
    if (!feedContainerRef) return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const threshold = 100; // Consider "at top" if within 100px of top

    setIsAtTop(scrollTop < threshold);
  };

  // Set up scroll listener
  const setupScrollListener = () => {
    if (scrollListenerActive) return;

    window.addEventListener('scroll', checkScrollPosition, { passive: true });
    scrollListenerActive = true;

    // Initial check
    checkScrollPosition();
  };

  // Phase 3: Flush pending notes to main feed with anchor preservation
  const flushPendingNotes = () => {
    const pending = pendingNotes();
    if (pending.length === 0) return;

    console.log('[WoTTimeline] Flushing', pending.length, 'pending notes');

    // Find the note currently at the top of viewport for anchor
    let anchorElement: Element | null = null;
    let anchorOffset = 0;

    const noteElements = document.querySelectorAll('[data-note-id]');
    for (const element of noteElements) {
      const rect = element.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < window.innerHeight) {
        // This note is visible in viewport
        anchorElement = element;
        anchorOffset = rect.top;
        break;
      }
    }

    // Prepend pending notes to main feed (they're newer)
    setNotes(prev => [...pending, ...prev]);

    // Clear pending queue
    setPendingNotes([]);

    // Restore scroll position after DOM updates
    setTimeout(() => {
      if (anchorElement) {
        const anchorId = anchorElement.getAttribute('data-note-id');
        if (anchorId) {
          // Find the same note in the updated DOM
          const updatedElement = document.querySelector(`[data-note-id="${anchorId}"]`);
          if (updatedElement) {
            const rect = updatedElement.getBoundingClientRect();
            const currentTop = rect.top;
            const scrollAdjustment = currentTop - anchorOffset;

            // Scroll to maintain the same visual position
            window.scrollBy(0, scrollAdjustment);
            console.log('[WoTTimeline] Anchor preserved, adjusted scroll by', scrollAdjustment, 'px');
          }
        }
      }
    }, 50); // Small delay for DOM to update
  };

  // Phase 4: Infinite scroll (older items) loader
  const loadMoreOlder = async () => {
    if (loadingMore() || !hasMore()) return;
    if (!currentAuthors || currentAuthors.length === 0) return;

    setLoadingMore(true);

    // Build target relay set from author outbox relays; fallback to active relays
    const relaySet = new Set<string>();
    currentAuthors.forEach(a => (currentAuthorRelays.get(a) || []).forEach((r) => relaySet.add(r)));
    let relays = Array.from(relaySet);
    if (relays.length === 0) relays = getActiveRelays();

    const LOAD_MORE_BATCH = Math.max(5, Math.min(20, (preferences().feedParams?.initialLimit ?? 10)));
    const since = oldestTimestamp - 1;

    const more$ = createTimelineStream(
      relays,
      [{ kinds: [1], authors: currentAuthors, limit: LOAD_MORE_BATCH }],
      { limit: LOAD_MORE_BATCH, since }
    );

    const collected: NostrEvent[] = [];
    let seenAny = false;
    let minSeenTs = oldestTimestamp;
    const sub = more$.subscribe({
      next: (evt) => {
        seenAny = true;
        if (typeof evt.created_at === 'number' && evt.created_at < minSeenTs) {
          minSeenTs = evt.created_at;
        }
        // Only root notes
        if (evt.tags?.some((t) => t[0] === 'e')) return;
        if (!eventCache.has(evt.id)) {
          collected.push(evt);
        }
      },
      error: (err) => {
        console.warn('[WoTTimeline] loadMore error:', err);
        setLoadingMore(false);
      },
      complete: async () => {
        try {
          // Advance pagination cursor based on any events seen (even if replies)
          if (seenAny && minSeenTs < oldestTimestamp) {
            oldestTimestamp = minSeenTs;
          }

          if (collected.length === 0) {
            if (!seenAny) {
              // Truly exhausted
              setHasMore(false);
              setLoadingMore(false);
              return;
            } else {
              // Saw only replies/dupes; step again immediately
              setLoadingMore(false);
              setTimeout(() => { void loadMoreOlder(); }, 0);
              return;
            }
          }

          // Prepare notes with media preloading
          const prioritized = collected.map((e) => ({ event: e, id: e.id, author: e.pubkey, created_at: e.created_at } as any));
          const prepared = await preloader.prepareBatch(prioritized, 1500);

          const appended: typeof prepared = [];
          for (const prep of prepared) {
            const event = prep.note.event;
            if (eventCache.has(event.id)) continue;
            eventCache.set(event.id, event);
            eventStore.add(event);
            if (event.created_at < oldestTimestamp) oldestTimestamp = event.created_at;

            const score = calculatePowScore(event, [], [], {
              reactionPowWeight: preferences().reactionPowWeight,
              replyPowWeight: preferences().replyPowWeight,
              profilePowWeight: preferences().profilePowWeight,
              nonPowReactionWeight: preferences().nonPowReactionWeight,
              nonPowReplyWeight: preferences().nonPowReplyWeight,
              powInteractionThreshold: preferences().powInteractionThreshold,
            });

            appended.push(prep);
            setNotes(prev => [...prev, {
              event,
              score: score.totalScore,
              preparedNote: prep,
              insertionOrder: insertionCounter++,
            }]);
          }

          if (collected.length < LOAD_MORE_BATCH) {
            setHasMore(false);
          }
        } finally {
          setLoadingMore(false);
        }
      }
    });

    subscriptions.push(sub);
  };

  // Phase 3: Add note to feed or queue based on scroll position
  const addNoteToFeed = (scoredNote: ScoredNote) => {
    if (isAtTop() || loading()) {
      // Auto-insert if at top or still loading
      setNotes(prev => [...prev, scoredNote]);
    } else {
      // Queue for later if scrolled down
      setPendingNotes(prev => [...prev, scoredNote]);
    }
  };

  // Watch for userPubkey changes and reload timeline
  createEffect(() => {
    const userPubkey = props.userPubkey;
    void reloadTrigger(); // Watch for feed param changes

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
    setError(null);
    insertionCounter = 0;

    // Phase 3: Reset pending notes
    setPendingNotes([]);
    setIsAtTop(true);

    console.log('[WoTTimeline] Loading WoT feed for', userPubkey.slice(0, 8));

    // Async function to load WoT timeline with adaptive fetch
    const loadWoTTimeline = async () => {
      try {
        // Step 1: Get my follows
        setLoadingStatus(getRandomFunMessage());
        const follows = await getUserFollows(userPubkey);
        console.log('[WoTTimeline] Found', follows.length, 'follows');
        currentAuthors = follows;

        if (follows.length === 0) {
          // No follows: show a graceful empty state (no error)
          setLoading(false);
          setLoadingStatus('');
          return;
        }

        // Phase 0: Cache-first hydration of root notes from follows
        try {
          const cached = await getCachedEventsByFilters([
            { kinds: [1], authors: follows, limit: 200 }
          ]);
          let added = 0;
          for (const evt of cached) {
            // Only root notes
            if (Array.isArray(evt.tags) && evt.tags.some((t: string[]) => t[0] === 'e')) continue;
            if (eventCache.has(evt.id)) continue;
            eventCache.set(evt.id, evt);
            eventStore.add(evt, true);
            if (!reactionsCache.has(evt.id)) reactionsCache.set(evt.id, []);
            if (!repliesCache.has(evt.id)) repliesCache.set(evt.id, []);
            if (evt.created_at > liveSinceTimestamp) liveSinceTimestamp = evt.created_at;

            const score = calculatePowScore(evt, [], [], {
              reactionPowWeight: preferences().reactionPowWeight,
              replyPowWeight: preferences().replyPowWeight,
              profilePowWeight: preferences().profilePowWeight,
              nonPowReactionWeight: preferences().nonPowReactionWeight,
              nonPowReplyWeight: preferences().nonPowReplyWeight,
              powInteractionThreshold: preferences().powInteractionThreshold,
            });

            // Show cached items immediately at top
            setNotes(prev => [...prev, {
              event: evt,
              score: score.totalScore,
              insertionOrder: insertionCounter++,
            }]);

            added++;
          }
          if (added > 0) {
            setLoading(false);
            setLoadingStatus(`✨ Showing ${added} cached notes...`);
          }
        } catch (e) {
          // Keep going on cache failures
          console.log('[WoTTimeline] Cache hydrate skipped/failed:', e);
        }

        // Step 2: Get my inbox relays (for later lazy loading of reactions/replies)
        myInboxRelays = await getUserInboxRelays(userPubkey);
        console.log('[WoTTimeline] My inbox relays:', myInboxRelays);

        // Step 3: Build relay map for each follow
        setLoadingStatus(getRandomFunMessage());
        const authorRelays: RelayMap = new Map();
        const relayPromises = follows.map(async (followPubkey) => {
          const relays = await getUserOutboxRelays(followPubkey);
          authorRelays.set(followPubkey, relays);
        });

        // Fetch all relay lists in parallel (with timeout)
        await Promise.race([
          Promise.all(relayPromises),
          new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
        ]);

        console.log('[WoTTimeline] Relay map ready for', authorRelays.size, 'authors');
        currentAuthorRelays = authorRelays;

        // Step 4: Start adaptive feed loading
        setLoadingStatus(getRandomFunMessage());

        // Get feed parameters from preferences
        const feedParams = preferences().feedParams;
        const debugMode = preferences().feedDebugMode || false;
        const feedObservable = loadWoTFeed(follows, authorRelays, {
          desiredCount: props.limit ?? feedParams.desiredCount,
          initialLimit: feedParams.initialLimit,
          maxLimit: feedParams.maxLimit,
          initialHorizonMs: feedParams.initialHorizonHours * 60 * 60 * 1000,
          maxHorizonMs: feedParams.maxHorizonDays * 24 * 60 * 60 * 1000,
          growthFast: feedParams.growthFast,
          growthSlow: feedParams.growthSlow,
          overlapRatio: feedParams.overlapRatio,
          overfetch: feedParams.overfetch,
          skewMarginMs: feedParams.skewMarginMinutes * 60 * 1000,
        }, debugMode);

        const feedSub = feedObservable.subscribe({
          next: async (event) => {
            if (event.type === 'progress') {
              // Show simple progress with fun message
              if (event.total > 0) {
                setLoadingStatus(`✨ Found ${event.total} notes...`);
              } else {
                setLoadingStatus(getRandomFunMessage());
              }
            } else if (event.type === 'batch') {
              console.log('[WoTTimeline] Received batch of', event.notes.length, 'notes');

              // Prioritize batch using PoW + recency
              const prioritized = prioritizer.prioritize(event.notes);

              // Phase 1: Trim overfetched notes to avoid processing too many
              // Trim to desiredCount to process only the best notes from overfetch
              const trimmed = prioritizer.trim(prioritized, feedParams.desiredCount);
              console.log('[WoTTimeline] Trimmed from', prioritized.length, 'to', trimmed.length, 'notes');

              // Prepare notes with media preloading
              const prepared = await preloader.prepareBatch(trimmed, 1500);

              // Add to cache and render in intake order
              for (const prep of prepared) {
                const event = prep.note.event;

                // Skip if already in cache
                if (eventCache.has(event.id)) continue;

                // Add to cache
                eventCache.set(event.id, event);
                eventStore.add(event);

                // Track oldest timestamp for pagination
                if (event.created_at < oldestTimestamp) {
                  oldestTimestamp = event.created_at;
                }

                // Initialize reaction/reply caches
                if (!reactionsCache.has(event.id)) {
                  reactionsCache.set(event.id, []);
                }
                if (!repliesCache.has(event.id)) {
                  repliesCache.set(event.id, []);
                }

                // Calculate initial PoW score (for badges, not for reordering)
                const score = calculatePowScore(event, [], [], {
                  reactionPowWeight: preferences().reactionPowWeight,
                  replyPowWeight: preferences().replyPowWeight,
                  profilePowWeight: preferences().profilePowWeight,
                  nonPowReactionWeight: preferences().nonPowReactionWeight,
                  nonPowReplyWeight: preferences().nonPowReplyWeight,
                  powInteractionThreshold: preferences().powInteractionThreshold,
                });

                // Phase 3: Add to feed or queue based on scroll position
                addNoteToFeed({
                  event,
                  score: score.totalScore,
                  preparedNote: prep,
                  insertionOrder: insertionCounter++,
                });
              }
            } else if (event.type === 'complete') {
              console.log('[WoTTimeline] Feed load complete:', event.total, 'notes', event.exhausted ? '(exhausted)' : '');
              setLoading(false);
              setLoadingStatus(event.total > 0 ? `🎉 Feed ready! (${event.total} notes)` : '');

              // Phase 3: Set up scroll listener after initial load
              setTimeout(() => setupScrollListener(), 100);

              // Set up infinite scroll sentinel after initial load
              setTimeout(() => {
                if (bottomSentinelRef && !loadMoreObserver) {
                  loadMoreObserver = new IntersectionObserver(
                    (entries) => {
                      if (entries[0].isIntersecting && hasMore() && !loadingMore()) {
                        console.log('[WoTTimeline] Bottom sentinel visible, loading more...');
                        void loadMoreOlder();
                      }
                    },
                    { rootMargin: '300px' }
                  );
                  loadMoreObserver.observe(bottomSentinelRef);
                }
              }, 150);

              // Start live stream for new notes from follows
              startLiveStream();

              // Clear success message after 2 seconds
              if (event.total > 0) {
                setTimeout(() => setLoadingStatus(''), 2000);
              }
            }
          },
          error: (err) => {
            console.error('[WoTTimeline] Feed error:', err);
            setError(String(err));
            setLoading(false);
          },
        });

        subscriptions.push(feedSub);

      } catch (err) {
        console.error('[WoTTimeline] Setup error:', err);
        setError(String(err));
        setLoading(false);
      }
    };

    // Start loading
    loadWoTTimeline();
  });

  // Start live stream of new root notes from follows, injected below the fold when scrolled
  const startLiveStream = () => {
    if (!currentAuthors || currentAuthors.length === 0) return;

    const liveRelaysSet = new Set<string>();
    currentAuthors.forEach(a => (currentAuthorRelays.get(a) || []).forEach((r) => liveRelaysSet.add(r)));
    myInboxRelays.forEach((r) => liveRelaysSet.add(r));
    let liveRelays = Array.from(liveRelaysSet);
    if (liveRelays.length === 0) liveRelays = getActiveRelays();

    const live$ = createTimelineStream(
      liveRelays,
      [{ kinds: [1], authors: currentAuthors }],
      { limit: 50, since: Math.max(liveSinceTimestamp, Math.floor(Date.now() / 1000) - 30) }
    );

    const sub = live$.subscribe({
      next: (evt) => {
        // Only root notes
        if (Array.isArray(evt.tags) && evt.tags.some((t) => t[0] === 'e')) return;
        if (eventCache.has(evt.id)) return;

        eventCache.set(evt.id, evt);
        eventStore.add(evt);
        if (!reactionsCache.has(evt.id)) reactionsCache.set(evt.id, []);
        if (!repliesCache.has(evt.id)) repliesCache.set(evt.id, []);
        if (evt.created_at > liveSinceTimestamp) liveSinceTimestamp = evt.created_at;

        const score = calculatePowScore(evt, [], [], {
          reactionPowWeight: preferences().reactionPowWeight,
          replyPowWeight: preferences().replyPowWeight,
          profilePowWeight: preferences().profilePowWeight,
          nonPowReactionWeight: preferences().nonPowReactionWeight,
          nonPowReplyWeight: preferences().nonPowReplyWeight,
          powInteractionThreshold: preferences().powInteractionThreshold,
        });

        addNoteToFeed({
          event: evt,
          score: score.totalScore,
          insertionOrder: insertionCounter++,
        });
      },
      error: (err) => console.warn('[WoTTimeline] Live stream error:', err),
    });

    subscriptions.push(sub);
  };

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
            // Persist to global EventStore for cache/state coherence across views
            eventStore.add(reaction);
            recalculateScoresImmediate();
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
            // Persist to global EventStore for cache/state coherence across views
            eventStore.add(reply);
            recalculateScoresImmediate();
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

  // Helper function to recalculate scores without reordering
  // CRITICAL: Scores are updated for badges, but notes stay in insertion order
  const recalculateScoresImmediate = () => {
    const prefs = preferences();

    setNotes(prev => {
      // Recalculate scores in-place without changing order
      return prev.map(scoredNote => {
        const reactions = reactionsCache.get(scoredNote.event.id) || [];
        const replies = repliesCache.get(scoredNote.event.id) || [];

        // Recalculate score with updated reactions/replies
        const score = calculatePowScore(scoredNote.event, reactions, replies, {
          reactionPowWeight: prefs.reactionPowWeight,
          replyPowWeight: prefs.replyPowWeight,
          profilePowWeight: prefs.profilePowWeight,
          nonPowReactionWeight: prefs.nonPowReactionWeight,
          nonPowReplyWeight: prefs.nonPowReplyWeight,
          powInteractionThreshold: prefs.powInteractionThreshold,
        });

        // Return updated note with new score but same insertion order
        return {
          ...scoredNote,
          score: score.totalScore,
        };
      });
      // NO SORTING - preserve insertion order!
    });
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

    // Phase 3: Clean up scroll listener
    if (scrollListenerActive) {
      window.removeEventListener('scroll', checkScrollPosition);
      scrollListenerActive = false;
    }

    // Clean up load more observer
    if (loadMoreObserver) {
      try { loadMoreObserver.disconnect(); } catch {}
      loadMoreObserver = null;
    }
  });

  // Reload feed when feed params change
  const handleFeedParamsUpdate = () => {
    console.log('[WoTTimeline] Feed params updated, triggering reload...');
    setReloadTrigger(prev => prev + 1); // Increment to trigger createEffect
  };

  return (
    <div ref={feedContainerRef} class="w-full max-w-2xl mx-auto space-y-4">
      {/* Feed Settings and Algorithm Controls - Inline */}
      <Show when={!loading()}>
        <div class="flex gap-3">
          <FeedControls onUpdate={handleFeedParamsUpdate} />
          <Show when={notes().length > 0}>
            <AlgorithmControls onUpdate={recalculateScoresImmediate} />
          </Show>
        </div>
      </Show>

      {/* Phase 3: New Notes Bar */}
      <NewNotesBar
        count={pendingNotes().length}
        visible={!loading() && !isAtTop()}
        onLoadNew={flushPendingNotes}
      />

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
          {/* <div class="text-sm text-text-secondary mb-6 p-6">
            {notes().length} notes from your Web of Trust • sorted by total PoW (including delegated)
          </div> */}
          <For each={notes()}>
            {(scoredNote) => (
              <Note
                event={scoredNote.event}
                score={scoredNote.score}
                reactions={reactionsCache.get(scoredNote.event.id) || []}
                replies={repliesCache.get(scoredNote.event.id) || []}
                showScore={props.showScores ?? true}
                onVisible={handleNoteVisible}
                preparedNote={scoredNote.preparedNote}
              />
            )}
          </For>

          {/* Infinite scroll sentinel */}
          <div ref={bottomSentinelRef} class="h-6" />
        </div>
      </Show>
    </div>
  );
};

// Load more older WoT notes based on current authors and oldest timestamp
async function loadMoreOlder(this: any) {
  // 'this' is not used; defined outside component
}
