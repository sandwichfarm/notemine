import { Component, createSignal, onMount, Show } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { nip19, type NostrEvent } from 'nostr-tools';
import { relayPool, getActiveRelays, eventStore } from '../lib/applesauce';
import { getPowDifficulty, hasValidPow } from '../lib/pow';
import { ReactionBreakdown } from '../components/ReactionBreakdown';
import { ThreadedReplies } from '../components/ThreadedReplies';
import { ProfileName } from '../components/ProfileName';
import { ParsedContent } from '../components/ParsedContent';
import { debug } from '../lib/debug';

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
  const [showLowPow, setShowLowPow] = createSignal(false);

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

      debug('[NoteDetail] Fetching event:', eventId);

      // Check event store synchronously first
      let foundInStore = false;
      const storeSubscription = eventStore.event(eventId).subscribe({
        next: (evt) => {
          if (evt && !foundInStore) {
            foundInStore = true;
            debug('[NoteDetail] Found event in store:', evt.id);
            setNote(evt);
            setLoading(false);
            loadRepliesAndReactions(evt, relays);
            storeSubscription.unsubscribe();
          }
        },
      });

      // If not found in store after 100ms, fetch from relays
      setTimeout(() => {
        if (!foundInStore) {
          debug('[NoteDetail] Not found in store, fetching from relays...');
          storeSubscription.unsubscribe();

          // Fetch from relays
          const relay$ = relayPool.req(relays, { ids: [eventId] });
          relay$.subscribe({
            next: (response) => {
              debug('[NoteDetail] Relay response:', response);
              if (response !== 'EOSE' && response.id === eventId) {
                const evt = response as NostrEvent;
                debug('[NoteDetail] Found event from relay');
                setNote(evt);
                setLoading(false);
                loadRepliesAndReactions(evt, relays);
              }
            },
            error: (err) => {
              console.error('[NoteDetail] Relay error:', err);
              setError('Failed to fetch note');
              setLoading(false);
            },
            complete: () => {
              debug('[NoteDetail] Relay subscription complete');
              if (!note()) {
                setError('Note not found');
              }
              setLoading(false);
            },
          });
        }
      }, 100);
    } catch (err) {
      console.error('[NoteDetail] Error:', err);
      setError(String(err));
      setLoading(false);
    }
  });

  const loadRepliesAndReactions = (event: NostrEvent, relays: string[]) => {
    debug('[NoteDetail] Loading replies and reactions for:', event.id);

    // Load reactions (kind 7)
    const reactionsObs = relayPool.req(relays, {
      kinds: [7],
      '#e': [event.id],
      limit: 500
    });

    const allReactions: NostrEvent[] = [];
    reactionsObs.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === 7) {
          const reaction = response as NostrEvent;
          if (!allReactions.find(r => r.id === reaction.id)) {
            allReactions.push(reaction);

            // Only cache reactions that meet POW threshold
            const pow = getPowDifficulty(reaction);
            if (pow >= MIN_POW_THRESHOLD) {
              eventStore.add(reaction);
            }

            updateReactions();
          }
        }
      },
      complete: () => {
        debug('[NoteDetail] Loaded', allReactions.length, 'reactions');
      },
    });

    // Load replies (kind 1)
    const repliesObs = relayPool.req(relays, {
      kinds: [1],
      '#e': [event.id],
      limit: 500
    });

    const allReplies: NostrEvent[] = [];
    repliesObs.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === 1) {
          const reply = response as NostrEvent;
          if (!allReplies.find(r => r.id === reply.id)) {
            allReplies.push(reply);

            // Only cache replies that meet POW threshold
            const pow = getPowDifficulty(reply);
            if (pow >= MIN_POW_THRESHOLD) {
              eventStore.add(reply);
            }

            updateReplies();
          }
        }
      },
      complete: () => {
        debug('[NoteDetail] Loaded', allReplies.length, 'replies');
      },
    });

    function updateReactions() {
      setReactions([...allReactions]);
    }

    function updateReplies() {
      setReplies([...allReplies]);
    }
  };

  const filteredReactions = () => {
    const all = reactions();
    if (showLowPow()) return all;
    return all.filter(r => getPowDifficulty(r) >= MIN_POW_THRESHOLD);
  };

  const filteredReplies = () => {
    const all = replies();
    if (showLowPow()) return all;
    return all.filter(r => getPowDifficulty(r) >= MIN_POW_THRESHOLD);
  };

  // Removed shortPubkey - now using ProfileName component

  const timestamp = (created_at: number) => {
    const date = new Date(created_at * 1000);
    return date.toLocaleString();
  };

  return (
    <div class="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        class="text-sm text-text-secondary hover:text-accent transition-colors"
      >
        ← back to feed
      </button>

      {/* Loading State */}
      <Show when={loading()}>
        <div class="card p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
          <p class="mt-4 text-text-secondary">Loading note...</p>
        </div>
      </Show>

      {/* Error State */}
      <Show when={error()}>
        <div class="card p-4 bg-red-100 dark:bg-red-900/20 border-red-500">
          <p class="text-red-700 dark:text-red-400">Error: {error()}</p>
        </div>
      </Show>

      {/* Note Content */}
      <Show when={note()}>
        <div class="card p-6 border-l-4 border-l-accent">
          {/* Header */}
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-2">
              <ProfileName pubkey={note()!.pubkey} asLink={true} />
              <div class="text-xs text-text-tertiary">
                {timestamp(note()!.created_at)}
              </div>
            </div>

            {/* POW Badge */}
            <Show when={hasValidPow(note()!, 1)}>
              <span class="text-xs font-medium px-2 py-1 rounded bg-accent/10 text-accent">
                ⛏️ {getPowDifficulty(note()!)}
              </span>
            </Show>
          </div>

          {/* Content */}
          <ParsedContent
            content={note()!.content}
            class="text-text-primary break-words text-lg mb-6"
          />

          {/* REACTIONS - Horizontal bar between content and replies */}
          <Show when={filteredReactions().length > 0}>
            <div class="mb-6 pb-6 border-b border-border">
              <ReactionBreakdown reactions={filteredReactions()} />
            </div>
          </Show>

          {/* POW Filter Toggle */}
          <div class="flex items-center gap-2 mb-4">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showLowPow()}
                onChange={(e) => setShowLowPow(e.target.checked)}
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
    </div>
  );
};

export default NoteDetail;
