import { Component, createSignal, onCleanup, For, Show, createEffect, untrack } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { relayPool, getUserFollows, getUserOutboxRelays, getUserInboxRelays, eventStore, createTimelineStream, getActiveRelays, relayConnectionManager, PROFILE_RELAYS } from '../lib/applesauce';
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

  // Phase 2: Windowing - separate store from rendered view
  const [allNotes, setAllNotes] = createSignal<ScoredNote[]>([]); // Full store
  const [renderCount, setRenderCount] = createSignal(0); // Number of items to render
  const notes = () => allNotes().slice(0, renderCount()); // Computed: windowed view

  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [loadingStatus, setLoadingStatus] = createSignal<string>('Initializing...');
  const [reloadTrigger, setReloadTrigger] = createSignal(0); // Trigger feed reload

  // Phase 1 & 3: Initial load and new events queuing
  const [initialQueue, setInitialQueue] = createSignal<ScoredNote[]>([]); // Network items during initial load
  const [pendingNew, setPendingNew] = createSignal<ScoredNote[]>([]); // Truly new events (post-cutoff)
  const [isAtTop, setIsAtTop] = createSignal(true); // Track if user is at top of feed
  let initialMaxCreatedAt = 0; // Strict cutoff for "new" events (set after initial load completes)

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
  // Phase 1: Track initial network stream state separately from UI spinner
  let initialStreamActive = false;
  // Phase 3: Per-note tick to force reactive updates on interaction arrivals
  const [interactionTicks, setInteractionTicks] = createSignal<Record<string, number>>({});

  const bumpInteractionTick = (id: string) => {
    setInteractionTicks(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };
  // Phase 4: Debounce infinite scroll to prevent runaway loads
  let lastLoadTs = 0; // Track last network fetch timestamp
  let lastGrowthTs = 0; // Track last render window growth timestamp

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

  // Phase 3: Flush new events to top with anchor preservation
  const flushNewToTop = () => {
    const pending = pendingNew();
    if (pending.length === 0) return;

    const prefs = preferences();
    const anchorDelayMs = prefs.feedParams.anchorPreserveDelayMs;

    if (prefs.feedDebugMode) {
      console.log(`[WoTTimeline] Phase 3: Flushing ${pending.length} new notes to top (prepend)`);
    }

    // Phase 3: Find first visible element for anchor preservation
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

    // Phase 3: Prepend pending notes to top (not below-fold insertion)
    setAllNotes(prev => [...pending, ...prev]);

    // Phase 3: Extend render window to include new notes
    setRenderCount(prev => prev + pending.length);

    // Phase 3: Update cutoff to max created_at of flushed notes
    const maxCreatedAt = Math.max(...pending.map(n => n.event.created_at));
    if (maxCreatedAt > initialMaxCreatedAt) {
      initialMaxCreatedAt = maxCreatedAt;
      if (prefs.feedDebugMode) {
        console.log(`[WoTTimeline] Phase 3: Updated cutoff to ${new Date(initialMaxCreatedAt * 1000).toISOString()}`);
      }
    }

    // Clear pending queue
    setPendingNew([]);

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
              console.log(`[WoTTimeline] Phase 3: Anchor preserved, adjusted scroll by ${scrollAdjustment}px (target: ±2px)`);
            }
          } else if (prefs.feedDebugMode) {
            console.log(`[WoTTimeline] Phase 3: Anchor preserved within target (shift: ${scrollAdjustment}px)`);
          }
        }
      }
    }, anchorDelayMs);
  };

  // Phase 1: Bounded fetch helper for pagination (one-shot, deterministic)
  const fetchOlderBatch = async (
    until: number,
    authors: string[],
    relays: string[],
    limit: number
  ): Promise<NostrEvent[]> => {
    const prefs = preferences();
    const timeoutMs = 3000; // 3s timeout for bounded fetch

    if (prefs.feedDebugMode) {
      console.log(`[fetchOlderBatch] Fetching limit=${limit}, until=${new Date(until * 1000).toISOString()}, relays=${relays.length}`);
    }

    return new Promise((resolve) => {
      const collected: NostrEvent[] = [];
      const startTime = Date.now();
      let completed = false;

      // Create subscription with filter
      const obs = relayPool.req(relays, {
        kinds: [1],
        authors,
        until,
        limit,
      });

      // Set timeout to resolve
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          sub.unsubscribe();
          if (prefs.feedDebugMode) {
            console.log(`[fetchOlderBatch] Timeout after ${Date.now() - startTime}ms, collected ${collected.length} events`);
          }
          resolve(collected);
        }
      }, timeoutMs);

      const sub = obs.subscribe({
        next: (response) => {
          if (response === 'EOSE') {
            if (!completed) {
              completed = true;
              clearTimeout(timeoutId);
              sub.unsubscribe();
              if (prefs.feedDebugMode) {
                console.log(`[fetchOlderBatch] EOSE after ${Date.now() - startTime}ms, collected ${collected.length} events`);
              }
              resolve(collected);
            }
            return;
          }

          // Filter: only root notes (no replies), not already cached
          const evt = response as NostrEvent;
          const isReply = Array.isArray(evt.tags) && evt.tags.some((t) => t[0] === 'e');
          if (!isReply && !eventCache.has(evt.id)) {
            collected.push(evt);
          }
        },
        error: (err) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutId);
            if (prefs.feedDebugMode) {
              console.warn('[fetchOlderBatch] Error:', err);
            }
            resolve(collected); // Resolve with what we have
          }
        },
      });
    });
  };

  // Phase 1: Infinite scroll (older items) loader with bounded fetch
  const loadMoreOlder = async () => {
    if (loadingMore() || !hasMore()) return;
    if (!currentAuthors || currentAuthors.length === 0) return;

    // Phase 4: Sentinel already unobserved itself before calling this
    setLoadingMore(true);

    const prefs = preferences();

    // Build target relay set from author outbox relays; fallback to active relays
    const relaySet = new Set<string>();
    currentAuthors.forEach(a => (currentAuthorRelays.get(a) || []).forEach((r) => relaySet.add(r)));
    let relays = Array.from(relaySet);
    if (relays.length === 0) relays = getActiveRelays();

    // Phase 1: Batch size clamping with configurable min/max
    const rawBatchSize = prefs.feedParams?.initialLimit ?? 10;
    const LOAD_MORE_BATCH = Math.max(
      prefs.feedParams.batchClampMin,
      Math.min(prefs.feedParams.batchClampMax, rawBatchSize)
    );

    const until = oldestTimestamp - 1; // Phase 1: Use until for bounded fetch

    if (prefs.feedDebugMode) {
      console.log(`[WoTTimeline] Loading more: batch=${LOAD_MORE_BATCH}, until=${new Date(until * 1000).toISOString()}, relays=${relays.length}`);
    }

    try {
      // Phase 1: Use bounded fetch helper (replaces createTimelineStream)
      const collected = await fetchOlderBatch(until, currentAuthors, relays, LOAD_MORE_BATCH);

      if (collected.length === 0) {
        // No events found - exhausted
        if (prefs.feedDebugMode) {
          console.log('[WoTTimeline] Load more exhausted (no events found)');
        }
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      if (prefs.feedDebugMode) {
        console.log(`[WoTTimeline] Load more collected ${collected.length} root notes`);
      }

      // Update pagination cursor
      const minTs = Math.min(...collected.map(e => e.created_at));
      if (minTs < oldestTimestamp) {
        oldestTimestamp = minTs;
      }

      // Prepare notes with media preloading
      const prioritized = collected.map((e) => ({ event: e, id: e.id, author: e.pubkey, created_at: e.created_at } as any));
      const prepared = await preloader.prepareBatch(prioritized, prefs.feedParams.preloaderTimeoutMs);

      // Phase 1: Batch insertion - build array first, then single setAllNotes call
      const newNotes: ScoredNote[] = [];
      for (const prep of prepared) {
        const event = prep.note.event;
        if (eventCache.has(event.id)) continue;

        eventCache.set(event.id, event);
        eventStore.add(event);
        if (!reactionsCache.has(event.id)) reactionsCache.set(event.id, []);
        if (!repliesCache.has(event.id)) repliesCache.set(event.id, []);

        const score = calculatePowScore(event, [], [], {
          reactionPowWeight: prefs.reactionPowWeight,
          replyPowWeight: prefs.replyPowWeight,
          profilePowWeight: prefs.profilePowWeight,
          nonPowReactionWeight: prefs.nonPowReactionWeight,
          nonPowReplyWeight: prefs.nonPowReplyWeight,
          powInteractionThreshold: prefs.powInteractionThreshold,
        });

        newNotes.push({
          event,
          score: score.totalScore,
          preparedNote: prep,
          insertionOrder: insertionCounter++,
        });
      }

      // Phase 1: Single batched setAllNotes call
      if (newNotes.length > 0) {
        setAllNotes(prev => [...prev, ...newNotes]);

        // Phase 2: Extend render window to include newly fetched notes
        setRenderCount(prev => Math.min(prev + newNotes.length, allNotes().length));
        if (prefs.feedDebugMode) {
          console.log(`[WoTTimeline] Phase 2: Extended render window by ${newNotes.length} (new renderCount: ${renderCount()})`);
        }
      }

      if (collected.length < LOAD_MORE_BATCH) {
        setHasMore(false);
      }
    } catch (err) {
      console.warn('[WoTTimeline] loadMore error:', err);
    } finally {
      setLoadingMore(false);

      // Phase 1: Re-observe sentinel after load completes
      if (loadMoreObserver && bottomSentinelRef && hasMore()) {
        loadMoreObserver.observe(bottomSentinelRef);
      }
    }
  };

  // Phase 3: Queue new events that arrived after initial cutoff
  const queueNewIfAfterCutoff = (scoredNote: ScoredNote) => {
    const prefs = preferences();

    // Phase 3: Only queue events created after initial cutoff
    if (scoredNote.event.created_at <= initialMaxCreatedAt) {
      if (prefs.feedDebugMode) {
        console.log(`[WoTTimeline] Phase 3: Ignoring event ${scoredNote.event.id.slice(0, 8)} (created_at ${scoredNote.event.created_at} <= cutoff ${initialMaxCreatedAt})`);
      }
      return; // Ignore events from before or at cutoff
    }

    // Phase 3: If at top, auto-prepend; otherwise queue for banner
    if (isAtTop()) {
      // Auto-prepend when at top
      setAllNotes(prev => [scoredNote, ...prev]);
      setRenderCount(prev => prev + 1); // Grow render window to include new note
      if (prefs.feedDebugMode) {
        console.log(`[WoTTimeline] Phase 3: Auto-prepended new event at top ${scoredNote.event.id.slice(0, 8)}`);
      }
    } else {
      // Queue for banner when scrolled
      setPendingNew(prev => [...prev, scoredNote]);
      if (prefs.feedDebugMode) {
        console.log(`[WoTTimeline] Phase 3: Queued new event for banner ${scoredNote.event.id.slice(0, 8)} (pending: ${pendingNew().length + 1})`);
      }
    }
  };

  // Watch for userPubkey changes and reload timeline
  createEffect(() => {
    const userPubkey = props.userPubkey;
    void reloadTrigger(); // Watch for feed param changes

    // Capture preferences without creating reactive dependency
    // Only userPubkey and reloadTrigger should trigger this effect
    const prefs = untrack(() => preferences());

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
    setAllNotes([]);
    setLoading(true);
    setError(null);
    insertionCounter = 0;

    // Phase 1 & 3: Reset queues and cutoff
    setInitialQueue([]);
    setPendingNew([]);
    setIsAtTop(true);
    initialMaxCreatedAt = 0;

    // Phase 2: Reset render window
    setRenderCount(0);

    // Phase 2: Configure global visibility observer and interactions coordinator
    // (prefs already captured with untrack at top of effect)
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
        const hydrationLimit = prefs.feedParams.hydrationLimit;
        const cacheStartTime = Date.now();
        try {
          const cached = await getCachedEventsByFilters([
            { kinds: [1], authors: follows, limit: hydrationLimit }
          ]);

          // Batch cache hydration - build array first, then single setAllNotes
          const cachedNotes: ScoredNote[] = [];
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
              reactionPowWeight: prefs.reactionPowWeight,
              replyPowWeight: prefs.replyPowWeight,
              profilePowWeight: prefs.profilePowWeight,
              nonPowReactionWeight: prefs.nonPowReactionWeight,
              nonPowReplyWeight: prefs.nonPowReplyWeight,
              powInteractionThreshold: prefs.powInteractionThreshold,
            });

            cachedNotes.push({
              event: evt,
              score: score.totalScore,
              insertionOrder: insertionCounter++,
            });
          }

          // Single batched setAllNotes for cache hydration
          if (cachedNotes.length > 0) {
            setAllNotes(cachedNotes);
          }

          const cacheHydrateTime = Date.now() - cacheStartTime;
          if (cachedNotes.length > 0) {
            setLoading(false);
            setLoadingStatus(`✨ Showing ${cachedNotes.length} cached notes...`);

            // Phase 2: Set initial render count for cached notes
            const PAGE_SIZE = prefs.feedParams.initialLimit || 20;
            setRenderCount(Math.min(allNotes().length, PAGE_SIZE));
          }
          // Phase 1: Debug logging for cache performance
          if (prefs.feedDebugMode) {
            console.log(`[WoTTimeline] Cache hydrated ${cachedNotes.length}/${hydrationLimit} notes in ${cacheHydrateTime}ms`);
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

        // Get feed parameters from preferences (already captured)
        const feedParams = prefs.feedParams;
        const debugMode = prefs.feedDebugMode || false;
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

        // Phase 1: Mark initial network stream active
        initialStreamActive = true;

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
              const prepared = await preloader.prepareBatch(trimmed, prefs.feedParams.preloaderTimeoutMs);

              // Phase 1: Add to cache and queue for later injection if initial stream is active
              const batchNotes: ScoredNote[] = [];
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
                  reactionPowWeight: prefs.reactionPowWeight,
                  replyPowWeight: prefs.replyPowWeight,
                  profilePowWeight: prefs.profilePowWeight,
                  nonPowReactionWeight: prefs.nonPowReactionWeight,
                  nonPowReplyWeight: prefs.nonPowReplyWeight,
                  powInteractionThreshold: prefs.powInteractionThreshold,
                });

                batchNotes.push({
                  event,
                  score: score.totalScore,
                  preparedNote: prep,
                  insertionOrder: insertionCounter++,
                });
              }

              // Phase 1: Queue items into initialQueue while the initial stream is active,
              // regardless of the loading() spinner state
              if (initialStreamActive && batchNotes.length > 0) {
                setInitialQueue(prev => [...prev, ...batchNotes]);
                if (prefs.feedDebugMode) {
                  console.log(`[WoTTimeline] Queued ${batchNotes.length} notes to initialQueue (total: ${initialQueue().length + batchNotes.length})`);
                }
              }

              // Phase 6: Log debug stats after processing batch
              logDebugStats();
            } else if (event.type === 'complete') {
              console.log('[WoTTimeline] Feed load complete:', event.total, 'notes', event.exhausted ? '(exhausted)' : '');

              // Phase 1: Mark initial stream inactive
              initialStreamActive = false;

              // Phase 1: Compute initialMaxCreatedAt from all existing notes (full store) + initial queue
              const cachedNotes = allNotes();
              const queuedNotes = initialQueue();
              const allCreatedAts = [
                ...cachedNotes.map(n => n.event.created_at),
                ...queuedNotes.map(n => n.event.created_at)
              ];
              if (allCreatedAts.length > 0) {
                initialMaxCreatedAt = Math.max(...allCreatedAts);
                if (prefs.feedDebugMode) {
                  console.log(`[WoTTimeline] Set initialMaxCreatedAt to ${new Date(initialMaxCreatedAt * 1000).toISOString()}`);
                }
              }

              // Phase 1: Inject initialQueue below fold if not empty
              if (queuedNotes.length > 0) {
                if (prefs.feedDebugMode) {
                  console.log(`[WoTTimeline] Injecting ${queuedNotes.length} notes from initialQueue below fold`);
                }

                // Find last visible note for below-fold insertion
                let lastVisibleIndex = -1;
                const noteElements = document.querySelectorAll('[data-note-id]');

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
                    const idx = cachedNotes.findIndex(n => n.event.id === noteId);
                    if (idx > lastVisibleIndex) {
                      lastVisibleIndex = idx;
                    }
                  }
                }

                // Insert below fold in one batched update
                setAllNotes(prev => {
                  if (lastVisibleIndex === -1 || lastVisibleIndex >= prev.length - 1) {
                    // No visible notes or last visible is at end - append
                    return [...prev, ...queuedNotes];
                  } else {
                    // Insert after last visible note
                    const before = prev.slice(0, lastVisibleIndex + 1);
                    const after = prev.slice(lastVisibleIndex + 1);
                    return [...before, ...queuedNotes, ...after];
                  }
                });

                // Clear initial queue
                setInitialQueue([]);
              }

              setLoading(false);
              setLoadingStatus(event.total > 0 ? `🎉 Feed ready! (${event.total} notes)` : '');

              // Phase 2: Initialize render window
              const PAGE_SIZE = prefs.feedParams.initialLimit || 20;
              const initialRenderCount = Math.min(allNotes().length, PAGE_SIZE);
              setRenderCount(initialRenderCount);
              if (prefs.feedDebugMode) {
                console.log(`[WoTTimeline] Phase 2: Initialized renderCount=${initialRenderCount}, allNotes=${allNotes().length}`);
              }

              // Phase 3: Set up scroll listener after initial load
              setTimeout(() => setupScrollListener(), 100);

              // Phase 2 & 4: Set up infinite scroll sentinel with two-stage behavior
              // Stage 1: Grow render window; Stage 2: Fetch more from network
              setTimeout(() => {
                if (bottomSentinelRef && !loadMoreObserver) {
                  const rootMargin = prefs.feedParams.infiniteRootMarginPx;

                  loadMoreObserver = new IntersectionObserver(
                    (entries) => {
                      if (!entries[0].isIntersecting) return;

                      // Phase 4: Unobserve immediately to prevent tight loops
                      if (loadMoreObserver && bottomSentinelRef) {
                        loadMoreObserver.unobserve(bottomSentinelRef);
                      }

                      // Use prefs from outer createEffect scope (already captured with untrack)
                      const PAGE_SIZE = prefs.feedParams.initialLimit || 20;
                      const overscan = prefs.feedParams.overscan;
                      const currentRenderCount = renderCount();
                      const totalNotes = allNotes().length;
                      const now = Date.now();

                      // Phase 2: Stage 1 - Grow render window if not at end of allNotes
                      if (currentRenderCount < totalNotes - overscan) {
                        // Phase 4: Debounce growth to prevent rapid fire
                        const minGrowthInterval = 150; // ms between growth actions
                        if (now - lastGrowthTs < minGrowthInterval) {
                          if (prefs.feedDebugMode) {
                            console.log(`[WoTTimeline] Phase 4: Skipping growth (debounced, ${now - lastGrowthTs}ms since last)`);
                          }
                          // Re-observe after debounce period
                          setTimeout(() => {
                            if (loadMoreObserver && bottomSentinelRef) {
                              loadMoreObserver.observe(bottomSentinelRef);
                            }
                          }, minGrowthInterval - (now - lastGrowthTs));
                          return;
                        }

                        lastGrowthTs = now;
                        const newRenderCount = Math.min(currentRenderCount + PAGE_SIZE, totalNotes);
                        setRenderCount(newRenderCount);
                        if (prefs.feedDebugMode) {
                          console.log(`[WoTTimeline] Phase 2: Growing render window ${currentRenderCount} -> ${newRenderCount} (total: ${totalNotes})`);
                        }

                        // Phase 4: Re-observe after delay matching debounce to prevent rapid re-fire
                        setTimeout(() => {
                          if (loadMoreObserver && bottomSentinelRef) {
                            loadMoreObserver.observe(bottomSentinelRef);
                          }
                        }, minGrowthInterval);
                        return;
                      }

                      // Phase 2: Stage 2 - Trigger network fetch when render window reaches end
                      if (hasMore() && !loadingMore() && currentRenderCount >= totalNotes - overscan) {
                        // Phase 4: Debounce network loads to prevent runaway
                        const minLoadInterval = 500; // ms between network fetches
                        if (now - lastLoadTs < minLoadInterval) {
                          if (prefs.feedDebugMode) {
                            console.log(`[WoTTimeline] Phase 4: Skipping load (debounced, ${now - lastLoadTs}ms since last)`);
                          }
                          // Re-observe after debounce period
                          setTimeout(() => {
                            if (loadMoreObserver && bottomSentinelRef) {
                              loadMoreObserver.observe(bottomSentinelRef);
                            }
                          }, minLoadInterval - (now - lastLoadTs));
                          return;
                        }

                        lastLoadTs = now;
                        if (prefs.feedDebugMode) {
                          console.log('[WoTTimeline] Phase 2: Render window at end, fetching more from network...');
                        }
                        void loadMoreOlder();
                        // Note: loadMoreOlder will re-observe in its finally block
                      } else {
                        // Phase 4: No action needed, re-observe after small delay to prevent tight loop
                        setTimeout(() => {
                          if (loadMoreObserver && bottomSentinelRef) {
                            loadMoreObserver.observe(bottomSentinelRef);
                          }
                        }, 250); // 250ms cooldown even when no action
                      }
                    },
                    { rootMargin: `${rootMargin}px` }
                  );
                  loadMoreObserver.observe(bottomSentinelRef);

                  if (prefs.feedDebugMode) {
                    console.log(`[WoTTimeline] Phase 2: Sentinel activated with windowing (rootMargin: ${rootMargin}px)`);
                  }
                }
              }, 150);

              // Start live stream for new notes from follows
              startLiveStream(prefs);

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
  const startLiveStream = (prefs: UserPreferences) => {
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
        cacheWidenMultiplier: prefs.feedParams.cacheWidenMultiplier,
        cacheWidenCap: prefs.feedParams.cacheWidenCap,
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
          reactionPowWeight: prefs.reactionPowWeight,
          replyPowWeight: prefs.replyPowWeight,
          profilePowWeight: prefs.profilePowWeight,
          nonPowReactionWeight: prefs.nonPowReactionWeight,
          nonPowReplyWeight: prefs.nonPowReplyWeight,
          powInteractionThreshold: prefs.powInteractionThreshold,
        });

        // Phase 3: Use strict cutoff for new events
        queueNewIfAfterCutoff({
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
  const handleNoteVisible = async (eventId: string) => {

    // Build a robust relay set for interactions:
    // CRITICAL: Interactions (replies/reactions) are addressed to the NOTE AUTHOR's inbox relays
    // - Note author's inbox relays (primary - where interactions are sent)
    // - Author outbox relays (secondary - sometimes mirrored)
    // - Currently connected relays (opportunistic)
    // - Active baseline relays as final fallback
    const evt = eventCache.get(eventId) || allNotes().find(n => n.event.id === eventId)?.event;
    const author = evt?.pubkey;
    const relaySet = new Set<string>();

    // CRITICAL: Fetch note author's inbox relays (where interactions are actually sent)
    if (author) {
      try {
        const authorInboxRelays = await getUserInboxRelays(author);
        authorInboxRelays.forEach(r => relaySet.add(r));
        if (preferences().feedDebugMode) {
          console.log(`[WoTTimeline] Found ${authorInboxRelays.length} inbox relays for note author ${author.slice(0, 8)}`);
        }
      } catch (err) {
        if (preferences().feedDebugMode) {
          console.warn('[WoTTimeline] Failed to fetch author inbox relays:', err);
        }
      }

      // Author outbox relays (secondary)
      (currentAuthorRelays.get(author) || []).forEach(r => relaySet.add(r));
    }

    // Currently connected relays (opportunistic)
    try {
      relayConnectionManager.getConnectedRelays().forEach(r => relaySet.add(r));
    } catch {}

    // Baseline active relays (fallback)
    getActiveRelays().forEach(r => relaySet.add(r));
    // Include profile relays as additional fallback (often host widely used infra)
    PROFILE_RELAYS.forEach(r => relaySet.add(r));

    const interactionRelays = Array.from(relaySet);
    if (interactionRelays.length === 0) {
      console.warn('[WoTTimeline] No relays available for interactions fetch');
      return;
    }

    const coordinator = getInteractionsCoordinator();

    // Phase 2+: Request interactions fetch through coordinator with robust aggregation
    coordinator.request({
      noteId: eventId,
      fetcher: () => {
        // Coordinator dedupes queued/in-flight; no local tracked gating

        const prefs = preferences();
        if (prefs.feedDebugMode) {
          console.log('[WoTTimeline] Starting interactions fetch for', eventId.slice(0, 8), 'on', interactionRelays.length, 'relays');
        }

        const combined = new Subscription();

        // Multi-relay REQs (let them run until scroll-away or component cleanup)
        const reactionsFilter: any = { kinds: [7], '#e': [eventId], limit: 1000 };
        const repliesFilter: any = { kinds: [1], '#e': [eventId], limit: 1000 };

        const rSub = relayPool.req(interactionRelays, reactionsFilter).subscribe({
          next: (response) => {
            if (response !== 'EOSE' && (response as any).kind === 7) {
              const reaction = response as NostrEvent;
              const existing = reactionsCache.get(eventId) || [];
              if (!existing.find(r => r.id === reaction.id)) {
                reactionsCache.set(eventId, [...existing, reaction]);
                eventStore.add(reaction);
                recalculateScoresImmediate();
                bumpInteractionTick(eventId);
              }
            }
          },
          error: () => { /* ignore errors */ },
        });
        combined.add(rSub);

        const rpSub = relayPool.req(interactionRelays, repliesFilter).subscribe({
          next: (response) => {
            if (response !== 'EOSE' && (response as any).kind === 1) {
              const reply = response as NostrEvent;
              const existing = repliesCache.get(eventId) || [];
              if (!existing.find(r => r.id === reply.id)) {
                repliesCache.set(eventId, [...existing, reply]);
                eventStore.add(reply);
                recalculateScoresImmediate();
                bumpInteractionTick(eventId);
              }
            }
          },
          error: () => { /* ignore errors */ },
        });
        combined.add(rpSub);

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

    setAllNotes(prev => {
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
      allNotes: allNotes().length,
      renderCount: renderCount(),
      rendered: notes().length,
      initialQueue: initialQueue().length,
      pendingNew: pendingNew().length,
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
        count={pendingNew().length}
        visible={!loading() && !isAtTop()}
        onLoadNew={flushNewToTop}
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
                interactionTick={(interactionTicks()[scoredNote.event.id] || 0)}
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
