import { Component, createSignal, onMount, onCleanup, Show, createMemo, createEffect } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useParams, useNavigate } from '@solidjs/router';
import { nip19, type NostrEvent } from 'nostr-tools';
import { relayPool, getActiveRelays, eventStore, createTimelineStream } from '../lib/applesauce';
import { getPowDifficulty, hasValidPow } from '../lib/pow';
import { getCachedEventsByFilters } from '../lib/cache';
import { ReactionBreakdown } from '../components/ReactionBreakdown';
import { ThreadedReplies } from '../components/ThreadedReplies';
import { ProfileName } from '../components/ProfileName';
import { ParsedContent } from '../components/ParsedContent';
import { ReactionPicker } from '../components/ReactionPicker';
import { ReplyComposer } from '../components/ReplyComposer';
import { ProfilePowBadge } from '../components/ProfilePowBadge';
import { useProfile } from '../hooks/useProfile';

// Minimum POW threshold for replies/reactions
const MIN_POW_THRESHOLD = 16;

const NoteDetail: Component = () => {
  const params = useParams();
  const navigate = useNavigate();

  const [note, setNote] = createSignal<NostrEvent | null>(null);
  const [reactions, setReactions] = createSignal<NostrEvent[]>([]);
  const [replies, setReplies] = createSignal<NostrEvent[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  // Persisted UI state for low-POW visibility
  const SHOW_LOW_POW_KEY = 'notemine:ui:showLowPowInteractions';
  const initialShowLowPow = (() => {
    try {
      const v = localStorage.getItem(SHOW_LOW_POW_KEY);
      return v === '1' || v === 'true';
    } catch {
      return false;
    }
  })();
  const [showLowPow, setShowLowPow] = createSignal(initialShowLowPow);
  createEffect(() => {
    try {
      localStorage.setItem(SHOW_LOW_POW_KEY, showLowPow() ? '1' : '0');
    } catch {}
  });

  // Interaction state - for reaction picker and reply composer modals
  const [showReactionPicker, setShowReactionPicker] = createSignal(false);
  const [showRootReplyComposer, setShowRootReplyComposer] = createSignal(true); // Default visible below root post

  let storeSubscription: any = null;
  let relaySubscription: any = null;
  let reactionsModelSubscription: any = null;
  let threadModelSubscription: any = null;
  let fetchTimeout: any = null;
  let safetyTimeout: any = null;
  let storeRepliesSubscription: any = null;
  let reactionsSubscription: any = null;
  const replySubscriptions: any[] = [];

  const cleanup = () => {
    if (storeSubscription) {
      storeSubscription.unsubscribe();
      storeSubscription = null;
    }
    if (relaySubscription) {
      relaySubscription.unsubscribe();
      relaySubscription = null;
    }
    if (reactionsModelSubscription) {
      reactionsModelSubscription.unsubscribe();
      reactionsModelSubscription = null;
    }
    if (threadModelSubscription) {
      threadModelSubscription.unsubscribe();
      threadModelSubscription = null;
    }
    if (fetchTimeout) {
      clearTimeout(fetchTimeout);
      fetchTimeout = null;
    }
    if (safetyTimeout) {
      clearTimeout(safetyTimeout);
      safetyTimeout = null;
    }
    if (storeRepliesSubscription) {
      try { storeRepliesSubscription.unsubscribe(); } catch {}
      storeRepliesSubscription = null;
    }
    if (reactionsSubscription) {
      try { reactionsSubscription.unsubscribe(); } catch {}
      reactionsSubscription = null;
    }
    if (replySubscriptions.length > 0) {
      replySubscriptions.forEach(sub => { try { sub.unsubscribe?.(); } catch {} });
      replySubscriptions.length = 0;
    }
  };

  onCleanup(cleanup);

  onMount(async () => {
    try {
      // Parse the naddr or nevent identifier
      const identifier = params.id;
      if (!identifier) {
        setError('No note identifier provided');
        setLoading(false);
        return;
      }

      let eventId: string;
      let relays: string[] = getActiveRelays();

      // Decode based on prefix
      if (identifier.startsWith('naddr')) {
        const decoded = nip19.decode(identifier);
        if (decoded.type !== 'naddr') {
          setError('Invalid naddr identifier');
          setLoading(false);
          return;
        }
        // For naddr we need to fetch by kind and d-tag
        // This is more complex, for now just show error
        setError('naddr support coming soon');
        setLoading(false);
        return;
      } else if (identifier.startsWith('nevent')) {
        const decoded = nip19.decode(identifier);
        if (decoded.type !== 'nevent') {
          setError('Invalid nevent identifier');
          setLoading(false);
          return;
        }
        eventId = decoded.data.id;
        if (decoded.data.relays && decoded.data.relays.length > 0) {
          relays = [...decoded.data.relays, ...relays];
        }
      } else if (identifier.startsWith('note')) {
        const decoded = nip19.decode(identifier);
        if (decoded.type !== 'note') {
          setError('Invalid note identifier');
          setLoading(false);
          return;
        }
        eventId = decoded.data;
      } else {
        // Assume raw hex event ID
        eventId = identifier;
      }

      console.log('[NoteDetail] Fetching event:', eventId, 'from relays:', relays);

      // SAFETY TIMEOUT: Ensure loading state always clears within 10 seconds
      safetyTimeout = setTimeout(() => {
        if (loading()) {
          console.error('[NoteDetail] ⚠️ SAFETY TIMEOUT fired - forcing loading to stop');
          setLoading(false);
          if (!note()) {
            setError('Failed to load note - timeout after 10 seconds');
          }
        }
      }, 10000);

      // Subscribe to event store with timeout fallback pattern (like useProfile)
      let foundInStore = false;

      storeSubscription = eventStore.event(eventId).subscribe({
        next: (evt) => {
          console.log('[NoteDetail] Store subscription next() called, evt:', evt ? evt.id : 'null', 'foundInStore:', foundInStore);
          if (evt && !foundInStore) {
            foundInStore = true;
            console.log('[NoteDetail] ✓ Found event in store:', evt.id);
            setNote(evt);
            setLoading(false);
            void loadRepliesAndReactions(evt, relays); // Fire-and-forget async relay discovery
            cleanup(); // Clean up all subscriptions
          }
        },
        complete: () => {
          console.log('[NoteDetail] Store subscription completed, foundInStore:', foundInStore);
        },
        error: (err) => {
          console.error('[NoteDetail] Store subscription error:', err);
        },
      });

      // If not found in store after 200ms, fetch from relays (like useProfile pattern)
      fetchTimeout = setTimeout(() => {
        console.log('[NoteDetail] Timeout fired (200ms), foundInStore:', foundInStore);
        if (foundInStore) {
          console.log('[NoteDetail] Already found in store, skipping relay fetch');
          return; // Already found in store
        }

        console.log('[NoteDetail] Not found in store, fetching from relays:', relays);

        // Fetch from relays
        const relay$ = relayPool.req(relays, { ids: [eventId] });
        relaySubscription = relay$.subscribe({
          next: (response) => {
            console.log('[NoteDetail] Relay response:', response);
            if (response !== 'EOSE' && response.id === eventId) {
              const evt = response as NostrEvent;
              console.log('[NoteDetail] ✓ Found event from relay:', evt.id);
              setNote(evt);
              setLoading(false);
              void loadRepliesAndReactions(evt, relays); // Fire-and-forget async relay discovery
              eventStore.add(evt); // Add to store for caching
            } else if (response === 'EOSE') {
              console.log('[NoteDetail] Received EOSE from relay');
            }
          },
          error: (err) => {
            console.error('[NoteDetail] Relay error:', err);
            setError('Failed to fetch note');
            setLoading(false);
          },
          complete: () => {
            console.log('[NoteDetail] Relay subscription complete, note:', note() ? 'found' : 'NOT FOUND');
            if (!note()) {
              console.error('[NoteDetail] ✗ Note not found after relay fetch');
              setError('Note not found');
              setLoading(false);
            }
          },
        });
      }, 200);
    } catch (err) {
      console.error('[NoteDetail] Error:', err);
      setError(String(err));
      setLoading(false);
    }
  });

  const loadRepliesAndReactions = async (event: NostrEvent, baseRelays: string[]) => {
    // Build comprehensive relay list for fetching interactions
    let relays = [...baseRelays];

    try {
      // 1. Add relay hints from parent event tags
      const { getAllRelayHintsFromEvent } = await import('../lib/inbox-outbox');
      const relayHints = getAllRelayHintsFromEvent(event);
      relays = [...relays, ...relayHints];

      // 2. Add NIP-66 PoW relays (where replies/reactions were published)
      const { fetchNip66PowRelays } = await import('../lib/nip66');
      const powRelays = await fetchNip66PowRelays().catch(() => {
        console.warn('[NoteDetail] Failed to fetch NIP-66 PoW relays, continuing without them');
        return [];
      });
      relays = [...relays, ...powRelays];

      // 3. Add author's inbox relays (where users published their replies to this author)
      const { getUserInboxRelays } = await import('../lib/applesauce');
      const authorInbox = await getUserInboxRelays(event.pubkey).catch(() => {
        console.warn('[NoteDetail] Failed to get author inbox relays, continuing without them');
        return [];
      });
      relays = [...relays, ...authorInbox];

      // 4. Add current user's outbox relays (where they published their replies)
      const { useUser } = await import('../providers/UserProvider');
      const { user } = useUser();
      const currentUser = user();
      let myOutbox: string[] = [];
      if (currentUser) {
        const { getUserOutboxRelays } = await import('../lib/applesauce');
        myOutbox = await getUserOutboxRelays(currentUser.pubkey).catch(() => {
          console.warn('[NoteDetail] Failed to get user outbox relays, continuing without them');
          return [];
        });
        relays = [...relays, ...myOutbox];
      }

      // Deduplicate relays
      relays = Array.from(new Set(relays));

      console.log('[NoteDetail] Loading replies and reactions for:', event.id);
      console.log('[NoteDetail] Relay sources:', {
        base: baseRelays.length,
        hints: relayHints.length,
        pow: powRelays.length,
        authorInbox: authorInbox.length,
        userOutbox: myOutbox.length,
        total: relays.length,
      });
      console.log('[NoteDetail] Querying relays:', relays);
    } catch (err) {
      console.error('[NoteDetail] Error building relay list, using base relays only:', err);
      relays = [...baseRelays];
    }

    // Helper: is reaction targeted at this root id (NIP-25 style via #e)
    const isReactionToRoot = (rxn: NostrEvent, rootId: string): boolean => {
      if (!rxn || rxn.kind !== 7) return false;
      const eTags = rxn.tags.filter(t => t[0] === 'e');
      return eTags.some(t => t[1] === rootId);
    };

    // Load reactions (kind 7) via cache-first, then stream+store
    const allReactions: NostrEvent[] = [];

    // Prime from cache immediately
    try {
      const cachedReacts = await getCachedEventsByFilters([
        { kinds: [7], '#e': [event.id], limit: 1000 },
      ]);
      if (cachedReacts.length > 0) {
        for (const r of cachedReacts) {
          if (!isReactionToRoot(r, event.id)) continue;
          if (!allReactions.find(x => x.id === r.id)) {
            allReactions.push(r);
            // Ensure present in global store for coherence
            eventStore.add(r);
          }
        }
        updateReactions();
        console.log('[NoteDetail] Preloaded reactions from cache:', cachedReacts.length);
      }
    } catch (e) {
      console.warn('[NoteDetail] Cached reactions preload failed:', e);
    }
    const reactions$ = createTimelineStream(
      relays,
      [{ kinds: [7], '#e': [event.id], limit: 500 }],
      { limit: 500 }
    );
    reactionsSubscription = reactions$.subscribe({
      next: (evt: any) => {
        if (!evt || evt.kind !== 7) return;
        const reaction = evt as NostrEvent;
        if (!isReactionToRoot(reaction, event.id)) return;
        if (!allReactions.find(r => r.id === reaction.id)) {
          allReactions.push(reaction);
          // Loader integrates with EventStore; no need to add again
          updateReactions();
        }
      },
      complete: () => {
        console.log('[NoteDetail] ✓ Loaded', allReactions.length, 'reactions (cache-first)');
      },
    });

    // Also subscribe to reactions from the EventStore (store-first, strictly #e -> root)
    try {
      reactionsModelSubscription = eventStore
        .filters({ kinds: [7], '#e': [event.id] })
        .subscribe({
          next: (rxn: any) => {
            if (!rxn || rxn.kind !== 7) return;
            if (!isReactionToRoot(rxn as NostrEvent, event.id)) return;
            if (!allReactions.find(r => r.id === rxn.id)) {
              allReactions.push(rxn);
              updateReactions();
            }
          },
        });
    } catch (e) {
      console.warn('[NoteDetail] EventStore reactions(#e) subscription failed:', e);
    }

    // Load ALL replies in the thread (direct replies + nested replies)
    const allReplies: NostrEvent[] = [];
    const seenIds = new Set<string>();
    const replyIds = new Set<string>([event.id]); // Start with root note

    // Helper: True if reply's NIP-10 reply reference points to one of known IDs
    function isReplyToKnown(reply: NostrEvent, known: Set<string>): boolean {
      const eTags = reply.tags.filter(t => t[0] === 'e');
      if (eTags.length === 0) return false;

      // Prefer explicit reply markers
      const replyTag = eTags.find(t => t[3] === 'reply');
      if (replyTag && replyTag[1]) {
        return known.has(replyTag[1]);
      }

      // If markers exist but are only 'mention', do not treat as reply
      const hasAnyMarker = eTags.some(t => !!t[3]);
      const onlyMentions = hasAnyMarker && eTags.every(t => t[3] && t[3] === 'mention');
      if (onlyMentions) return false;

      // Unmarked fallback (legacy): last e-tag is the parent
      const lastETag = eTags[eTags.length - 1];
      return !!lastETag?.[1] && known.has(lastETag[1]);
    }

    // STORE-FIRST: stream replies from EventStore (existing + new)
    try {
      const storeReplies$ = eventStore.filters({ kinds: [1], '#e': [event.id] });
      storeRepliesSubscription = storeReplies$.subscribe({
        next: (evt: any) => {
          if (!evt || evt.kind !== 1) return;
          const reply = evt as NostrEvent;
          if (!isReplyToKnown(reply, replyIds)) return;
          if (seenIds.has(reply.id)) return;
          seenIds.add(reply.id);
          allReplies.push(reply);
          replyIds.add(reply.id);
          updateReplies();
        },
        error: (err) => console.warn('[NoteDetail] store replies error:', err),
      });
    } catch (e) {
      console.warn('[NoteDetail] EventStore.filters for replies failed:', e);
    }

    async function fetchRepliesRecursive() {
      const currentIds = Array.from(replyIds);

      // Prime from cache for currentIds
      try {
        const cached = await getCachedEventsByFilters([
          { kinds: [1], '#e': currentIds, limit: 2000 },
        ]);
        let added = 0;
        for (const reply of cached) {
          if (!isReplyToKnown(reply, replyIds)) continue;
          if (seenIds.has(reply.id)) continue;
          seenIds.add(reply.id);
          allReplies.push(reply);
          replyIds.add(reply.id);
          added++;
        }
        if (added > 0) {
          console.log('[NoteDetail] Preloaded replies from cache (filtered):', added);
          updateReplies();
        }
      } catch (e) {
        console.warn('[NoteDetail] Cached replies preload failed:', e);
      }

      // Fetch replies to all known IDs (cache-first timeline stream)
      const repliesObs = createTimelineStream(
        relays,
        [{ kinds: [1], '#e': currentIds, limit: 500 }],
        { limit: 500 }
      );

      let newRepliesFound = 0;

      const sub = repliesObs.subscribe({
        next: (evt: any) => {
          if (!evt || evt.kind !== 1) return;
          const reply = evt as NostrEvent;
          if (!isReplyToKnown(reply, replyIds)) return;
          const pow = hasValidPow(reply, 1) ? getPowDifficulty(reply) : 0;

          if (!seenIds.has(reply.id)) {
            seenIds.add(reply.id);
            allReplies.push(reply);
            replyIds.add(reply.id); // Track for next recursive fetch
            newRepliesFound++;

            console.log('[NoteDetail] Received reply:', reply.id.slice(0, 8), 'POW:', pow);
            // Loader integrates with EventStore; no need to add again
            updateReplies();
          }
        },
        complete: () => {
          console.log('[NoteDetail] Fetch round complete. New replies:', newRepliesFound, 'Total:', allReplies.length);

          // If we found new replies, fetch their replies too (recursive)
          if (newRepliesFound > 0) {
            console.log('[NoteDetail] Fetching nested replies...');
            fetchRepliesRecursive();
          } else {
            console.log('[NoteDetail] ✓ Loaded all replies in thread:', allReplies.length);
            const highPowCount = allReplies.filter(r => hasValidPow(r, MIN_POW_THRESHOLD) && getPowDifficulty(r) >= MIN_POW_THRESHOLD).length;
            const lowPowCount = allReplies.length - highPowCount;
            console.log('[NoteDetail] Reply breakdown: high-POW:', highPowCount, 'low-POW:', lowPowCount);
          }
        },
      });
      replySubscriptions.push(sub);
    }

    // Start recursive fetch
    fetchRepliesRecursive();

    // Note: we avoid EventStore.thread() here because its model filter includes any event that references the root via #e,
    // which may include mentions. We curate replies via NIP-10 semantics in this component instead.

    function updateReactions() {
      setReactions([...allReactions]);
    }

    function updateReplies() {
      setReplies([...allReplies]);
      console.log('[NoteDetail] Updated replies state, total:', allReplies.length);
    }
  };

  const filteredReactions = createMemo(() => {
    const all = reactions();
    if (showLowPow()) return all;
    return all.filter(r => hasValidPow(r, MIN_POW_THRESHOLD) && getPowDifficulty(r) >= MIN_POW_THRESHOLD);
  });

  const filteredReplies = createMemo(() => {
    const all = replies();
    const shouldShowLowPow = showLowPow();
    console.log('[NoteDetail] filteredReplies() called - showLowPow:', shouldShowLowPow, 'total replies:', all.length);

    if (shouldShowLowPow) {
      console.log('[NoteDetail] Showing ALL replies (low-POW enabled):', all.length);
      return all;
    }

    const filtered = all.filter(r => hasValidPow(r, MIN_POW_THRESHOLD) && getPowDifficulty(r) >= MIN_POW_THRESHOLD);
    console.log('[NoteDetail] Showing high-POW replies only:', filtered.length, 'of', all.length);
    return filtered;
  });

  // Removed shortPubkey - now using ProfileName component

  const timestamp = (created_at: number) => {
    const date = new Date(created_at * 1000);
    return date.toLocaleString();
  };

  // Get profile for compact profile section - useProfile accepts a signal
  const authorPubkey = () => note()?.pubkey;
  const authorProfile = useProfile(authorPubkey);

  return (
    <div class="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        class="text-sm text-text-secondary hover:text-accent transition-colors"
      >
        ← back to feed
      </button>

      {/* Compact Profile Section */}
      <Show when={false && note() && authorProfile()}>
        <div class="p-4 border-l-2 border-l-accent/30">
          <div class="flex items-center gap-3">
            {/* Avatar */}
            <Show when={authorProfile().metadata?.picture}>
              <img
                src={authorProfile().metadata!.picture}
                alt="Profile"
                class="w-12 h-12 rounded-full object-cover"
              />
            </Show>

            {/* Profile Info */}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <ProfileName
                  pubkey={note()!.pubkey}
                  asLink={true}
                  class="font-medium text-base text-text-primary"
                />
                <Show when={authorProfile().event?.id}>
                  <ProfilePowBadge
                    profileEventId={authorProfile().event!.id}
                    style="inline"
                  />
                </Show>
              </div>
              <Show when={authorProfile().metadata?.about}>
                <p class="text-sm text-text-secondary mt-1 line-clamp-2">
                  {authorProfile().metadata!.about}
                </p>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Loading State */}
      <Show when={loading()}>
        <div class="p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8"></div>
          <p class="mt-4 text-text-secondary">Loading note...</p>
        </div>
      </Show>

      {/* Error State */}
      <Show when={error()}>
        <div class="p-4 bg-red-100 dark:bg-red-900/20 border-red-500">
          <p class="text-red-700 dark:text-red-400">Error: {error()}</p>
        </div>
      </Show>

      {/* Note Content */}
      <Show when={note()}>
        <div id={note()!.id}>

          <div class="note">
            {/* Header */}
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-2">
                <ProfileName pubkey={note()!.pubkey} asLink={true} />
                <div class="text-xs text-text-tertiary opacity-50">
                  {timestamp(note()!.created_at)}
                </div>
              </div>

              {/* POW Badge */}
              <Show when={hasValidPow(note()!, 1)}>
                <span class="text-xs font-medium px-2 py-1 rounded bg-accent/10 text-accent">
                  💎 {getPowDifficulty(note()!)}
                </span>
              </Show>
            </div>

            {/* Content */}
            <ParsedContent
              content={note()!.content}
              class="text-text-primary break-words text-2xl mb-6"
            />

            {/* REACTIONS - Horizontal bar between content and replies */}
            <Show when={filteredReactions().length > 0}>
              <div class="mb-4 pl-0 ml-0">
                <ReactionBreakdown
                  reactions={filteredReactions()}
                  eventId={note()!.id}
                  eventAuthor={note()!.pubkey}
                />
              </div>
            </Show>

            {/* INTERACTION BAR - React, reply, share buttons matching feed functionality */}
            <div class="flex gap-4 text-xs pb-4 hover:opacity-100 transition-opacity">
              <button
                onClick={() => setShowRootReplyComposer(!showRootReplyComposer())}
                class="text-text-tertiary hover:text-accent transition-colors"
                classList={{ 'text-accent': showRootReplyComposer() }}
              >
                💬 reply
              </button>
              <button
                onClick={() => setShowReactionPicker(true)}
                class="text-text-tertiary hover:text-accent transition-colors"
              >
                react
              </button>
              <button
                onClick={() => {
                  const noteId = nip19.noteEncode(note()!.id);
                  navigator.clipboard.writeText(`https://notemine.io/n/${noteId}`);
                }}
                class="text-text-tertiary hover:text-accent transition-colors"
              >
                share
              </button>
            </div>
            
          </div>

          {/* ROOT REPLY COMPOSER - Default visible below root post */}
          <Show when={showRootReplyComposer()}>
            <div class="mb-6">
              <ReplyComposer
                parentEvent={note()!}
                onClose={() => setShowRootReplyComposer(false)}
                inline={true}
              />
            </div>
          </Show>

          
          {/* POW Filter Toggle */}
          <div class="flex items-center gap-2 mb-4">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showLowPow()}
                onChange={(e) => setShowLowPow((e.currentTarget as HTMLInputElement).checked)}
                class="rounded"
              />
              <span class="text-text-secondary">
                Show low-POW reactions/replies (POW &lt; {MIN_POW_THRESHOLD})
              </span>
            </label>
          </div>

          {/* REPLIES - Threaded comments section */}
          <Show when={filteredReplies().length > 0}>
            <div>
              <h3 class="text-lg font-bold mb-3 text-text-primary">
                Replies ({filteredReplies().length})
              </h3>
              <ThreadedReplies
                replies={filteredReplies()}
                rootEventId={note()!.id}
              />
            </div>
          </Show>

          {/* Empty State */}
          <Show when={!loading() && filteredReactions().length === 0 && filteredReplies().length === 0}>
            <div class="text-center py-8 text-text-secondary">
              <p>No reactions or replies yet</p>
              <p class="text-sm text-text-tertiary mt-2">
                Be the first to respond with proof-of-work!
              </p>
            </div>
          </Show>

        </div>
      </Show>

      {/* Reaction Picker Modal - Rendered at document root */}
      <Portal>
        <Show when={showReactionPicker()}>
          <ReactionPicker
            eventId={note()!.id}
            eventAuthor={note()!.pubkey}
            onClose={() => setShowReactionPicker(false)}
          />
        </Show>
      </Portal>
    </div>
  );
};

export default NoteDetail;
