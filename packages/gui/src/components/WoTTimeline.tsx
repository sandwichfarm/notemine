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
import { configureVisibilityObserver, getVisibilityObserver } from '../services/VisibilityObserver';
import { configureInteractionsCoordinator, getInteractionsCoordinator } from '../services/InteractionsCoordinator';

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

  // Services for Phase 1 & 2 (initialized with debug mode and config from preferences)
  const initDebug = () => preferences().feedDebugMode || false;
  const prioritizer = new IntakePrioritizer();
  const preloader = new MediaPreloader({
    timeoutMs: preferences().feedParams.preloaderTimeoutMs,
    maxMediaHeight: preferences().feedParams.maxMediaHeightPx,
  }, initDebug());

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

  // Phase 3: Scroll detection to determine if user is at top (with configurable threshold)
  const checkScrollPosition = () => {
    if (!feedContainerRef) return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const prefs = preferences();
    const threshold = prefs.feedParams.topThresholdPx; // Configurable threshold (default 100px)

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

  // Phase 3: Flush pending notes to main feed with below-fold insertion and enhanced anchor preservation
  const flushPendingNotes = () => {
    const pending = pendingNotes();
    if (pending.length === 0) return;

    const prefs = preferences();
    const anchorDelayMs = prefs.feedParams.anchorPreserveDelayMs;

    if (prefs.feedDebugMode) {
      console.log(`[WoTTimeline] Flushing ${pending.length} pending notes with below-fold insertion`);
    }

    // Phase 3: Find first visible element for anchor (not first in viewport, but first fully visible)
    let anchorElement: Element | null = null;
    let anchorOffset = 0;
    let anchorId: string | null = null;

    const noteElements = document.querySelectorAll('[data-note-id]');
    for (const element of noteElements) {
      const rect = element.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < window.innerHeight) {
        // This note is visible in viewport - use as anchor
        anchorElement = element;
        anchorOffset = rect.top;
        anchorId = element.getAttribute('data-note-id');
        break;
      }
    }

    // Phase 3: Find last visible note for below-fold insertion
    let lastVisibleIndex = -1;
    const currentNotes = notes();

    for (let i = 0; i < noteElements.length; i++) {
      const element = noteElements[i];
      const rect = element.getBoundingClientRect();

      // Note is below the fold (rect.top > viewport height)
      if (rect.top > window.innerHeight) {
        break; // Found first below-fold note, so previous was last visible
      }

      // This note is visible or above fold
      const noteId = element.getAttribute('data-note-id');
      if (noteId) {
        // Find this note's index in our notes array
        const idx = currentNotes.findIndex(n => n.event.id === noteId);
        if (idx > lastVisibleIndex) {
          lastVisibleIndex = idx;
        }
      }
    }

    // Phase 3: Insert pending notes after last visible (below fold), not at top
    setNotes(prev => {
      if (lastVisibleIndex === -1 || lastVisibleIndex >= prev.length - 1) {
        // No visible notes or last visible is at end - append
        return [...prev, ...pending];
      } else {
        // Insert after last visible note
        const before = prev.slice(0, lastVisibleIndex + 1);
        const after = prev.slice(lastVisibleIndex + 1);
        return [...before, ...pending, ...after];
      }
    });

    // Clear pending queue
    setPendingNotes([]);

    // Phase 3: Enhanced anchor preservation with configurable delay and ±2px target accuracy
    setTimeout(() => {
      if (anchorElement && anchorId) {
        // Find the same note in the updated DOM
        const updatedElement = document.querySelector(`[data-note-id="${anchorId}"]`);
        if (updatedElement) {
          const rect = updatedElement.getBoundingClientRect();
          const currentTop = rect.top;
          const scrollAdjustment = currentTop - anchorOffset;

          // Only adjust if shift is >2px (avoid sub-pixel jitter)
          if (Math.abs(scrollAdjustment) > 2) {
            window.scrollBy(0, scrollAdjustment);
            if (prefs.feedDebugMode) {
              console.log(`[WoTTimeline] Anchor preserved, adjusted scroll by ${scrollAdjustment}px (target: ±2px)`);
            }
          } else if (prefs.feedDebugMode) {
            console.log(`[WoTTimeline] Anchor preserved within target (shift: ${scrollAdjustment}px)`);
          }
        }
      }
    }, anchorDelayMs);
  };

  // Phase 4: Infinite scroll (older items) loader with batch size clamping
  const loadMoreOlder = async () => {
    if (loadingMore() || !hasMore()) return;
    if (!currentAuthors || currentAuthors.length === 0) return;

    setLoadingMore(true);

    const prefs = preferences();

    // Build target relay set from author outbox relays; fallback to active relays
    const relaySet = new Set<string>();
    currentAuthors.forEach(a => (currentAuthorRelays.get(a) || []).forEach((r) => relaySet.add(r)));
    let relays = Array.from(relaySet);
    if (relays.length === 0) relays = getActiveRelays();

    // Phase 4: Batch size clamping with configurable min/max
    const rawBatchSize = prefs.feedParams?.initialLimit ?? 10;
    const LOAD_MORE_BATCH = Math.max(
      prefs.feedParams.batchClampMin,
      Math.min(prefs.feedParams.batchClampMax, rawBatchSize)
    );

    const since = oldestTimestamp - 1;

    if (prefs.feedDebugMode) {
      console.log(`[WoTTimeline] Loading more: batch=${LOAD_MORE_BATCH}, since=${new Date(since * 1000).toISOString()}, relays=${relays.length}`);
    }

    const more$ = createTimelineStream(
      relays,
      [{ kinds: [1], authors: currentAuthors, limit: LOAD_MORE_BATCH }],
      {
        limit: LOAD_MORE_BATCH,
        since,
        cacheWidenMultiplier: prefs.feedParams.cacheWidenMultiplier,
        cacheWidenCap: prefs.feedParams.cacheWidenCap,
      }
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
          const prefs = preferences();

          // Phase 4: Advance pagination cursor based on any events seen (even if replies)
          if (seenAny && minSeenTs < oldestTimestamp) {
            oldestTimestamp = minSeenTs;
          }

          if (collected.length === 0) {
            if (!seenAny) {
              // Truly exhausted - no events at all
              if (prefs.feedDebugMode) {
                console.log('[WoTTimeline] Load more exhausted (no events found)');
              }
              setHasMore(false);
              setLoadingMore(false);
              return;
            } else {
              // Phase 4: Saw only replies/dupes; advance cursor and retry immediately
              if (prefs.feedDebugMode) {
                console.log('[WoTTimeline] Load more got only replies/dupes, retrying immediately (cursor advanced)');
              }
              setLoadingMore(false);
              setTimeout(() => { void loadMoreOlder(); }, 0);
              return;
            }
          }

          if (prefs.feedDebugMode) {
            console.log(`[WoTTimeline] Load more collected ${collected.length} root notes`);
          }

          // Prepare notes with media preloading
          const prioritized = collected.map((e) => ({ event: e, id: e.id, author: e.pubkey, created_at: e.created_at } as any));
          const prepared = await preloader.prepareBatch(prioritized, prefs.feedParams.preloaderTimeoutMs);

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

    // Phase 2: Configure global visibility observer and interactions coordinator
    const prefs = preferences();
    configureVisibilityObserver(
      prefs.feedParams.visibilityDwellMs,
      prefs.feedParams.visibilityRootMarginPx,
      prefs.feedDebugMode
    );
    configureInteractionsCoordinator(
      prefs.feedParams.interactionsMaxConcurrent,
      prefs.feedParams.interactionsQueueMax,
      prefs.feedDebugMode
    );

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
        const hydrationLimit = preferences().feedParams.hydrationLimit;
        const cacheStartTime = Date.now();
        try {
          const cached = await getCachedEventsByFilters([
            { kinds: [1], authors: follows, limit: hydrationLimit }
          ]);
          let added = 0;
          for (const evt of cached) {
            // Only root notes
            if (Array.isArray(evt.tags) && evt.tags.some((t: string[]) => t[0] === 'e')) continue;
            if (eventCache.has(evt.id)) continue;
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

            // Show cached items immediately at top
            setNotes(prev => [...prev, {
              event: evt,
              score: score.totalScore,
              insertionOrder: insertionCounter++,
            }]);

            added++;
          }
          const cacheHydrateTime = Date.now() - cacheStartTime;
          if (added > 0) {
            setLoading(false);
            setLoadingStatus(`✨ Showing ${added} cached notes...`);
          }
          // Phase 1: Debug logging for cache performance
          if (preferences().feedDebugMode) {
            console.log(`[WoTTimeline] Cache hydrated ${added}/${hydrationLimit} notes in ${cacheHydrateTime}ms`);
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
              const prepared = await preloader.prepareBatch(trimmed, preferences().feedParams.preloaderTimeoutMs);

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

              // Phase 6: Log debug stats after processing batch
              logDebugStats();
            } else if (event.type === 'complete') {
              const prefs = preferences();
              console.log('[WoTTimeline] Feed load complete:', event.total, 'notes', event.exhausted ? '(exhausted)' : '');
              setLoading(false);
              setLoadingStatus(event.total > 0 ? `🎉 Feed ready! (${event.total} notes)` : '');

              // Phase 3: Set up scroll listener after initial load
              setTimeout(() => setupScrollListener(), 100);

              // Phase 4: Set up infinite scroll sentinel ONLY after initial load complete
              // This prevents race conditions with the initial fetch
              setTimeout(() => {
                if (bottomSentinelRef && !loadMoreObserver) {
                  const rootMargin = prefs.feedParams.infiniteRootMarginPx;

                  loadMoreObserver = new IntersectionObserver(
                    (entries) => {
                      if (entries[0].isIntersecting && hasMore() && !loadingMore()) {
                        if (prefs.feedDebugMode) {
                          console.log('[WoTTimeline] Bottom sentinel visible, loading more (rootMargin: ' + rootMargin + 'px)...');
                        }
                        void loadMoreOlder();
                      }
                    },
                    { rootMargin: `${rootMargin}px` }
                  );
                  loadMoreObserver.observe(bottomSentinelRef);

                  if (prefs.feedDebugMode) {
                    console.log(`[WoTTimeline] Infinite scroll sentinel activated (rootMargin: ${rootMargin}px)`);
                  }
                }
              }, 150);

              // Start live stream for new notes from follows
              startLiveStream();

              // Clear success message after 2 seconds
              if (event.total > 0) {
                setTimeout(() => setLoadingStatus(''), 2000);
              }

              // Phase 6: Log debug stats after initial load complete
              logDebugStats();
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
      {
        limit: 50,
        since: Math.max(liveSinceTimestamp, Math.floor(Date.now() / 1000) - 30),
        cacheWidenMultiplier: preferences().feedParams.cacheWidenMultiplier,
        cacheWidenCap: preferences().feedParams.cacheWidenCap,
      }
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

  // Phase 2: Lazy loading handler using InteractionsCoordinator (defined outside createEffect so it's stable)
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

    const coordinator = getInteractionsCoordinator();

    // Phase 2: Request interactions fetch through coordinator (with concurrency limiting)
    coordinator.request({
      noteId: eventId,
      fetcher: () => {
        if (preferences().feedDebugMode) {
          console.log('[WoTTimeline] Starting interactions fetch for', eventId.slice(0, 8));
        }

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
            if (preferences().feedDebugMode) {
              console.log('[WoTTimeline] Reaction fetch error (ignoring):', err);
            }
          },
        });

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
            if (preferences().feedDebugMode) {
              console.log('[WoTTimeline] Reply fetch error (ignoring):', err);
            }
          },
        });

        // Create a combined subscription
        const combined = new Subscription();
        combined.add(reactionsSub);
        combined.add(repliesSub);

        // Track subscriptions for cleanup
        subscriptions.push(combined);

        return combined;
      },
      priority: 0, // All notes have equal priority for now
    });
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

  // Phase 6: Debug stats logging (throttled)
  let lastDebugLog = 0;
  const logDebugStats = () => {
    const prefs = preferences();
    if (!prefs.feedDebugMode) return;

    const now = Date.now();
    const throttleMs = prefs.feedParams.logThrottleMs;
    if (now - lastDebugLog < throttleMs) return;
    lastDebugLog = now;

    const visibilityObserver = getVisibilityObserver();
    const interactionsCoordinator = getInteractionsCoordinator();

    console.log('[WoTTimeline] Debug Stats:', {
      notes: notes().length,
      pendingNotes: pendingNotes().length,
      cacheSize: eventCache.size,
      reactionsCache: reactionsCache.size,
      repliesCache: repliesCache.size,
      subscriptions: subscriptions.length,
      trackedInteractions: trackedEventIds.size,
      isAtTop: isAtTop(),
      hasMore: hasMore(),
      loadingMore: loadingMore(),
      oldestTimestamp: new Date(oldestTimestamp * 1000).toISOString(),
      visibilityObserver: visibilityObserver.getStats(),
      interactionsCoordinator: interactionsCoordinator.getStats(),
    });
  };

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
