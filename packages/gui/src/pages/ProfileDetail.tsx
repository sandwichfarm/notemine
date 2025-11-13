import { Component, createSignal, onMount, onCleanup, createEffect, Show, For } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { nip19, type NostrEvent } from 'nostr-tools';
import { relayPool, getActiveRelays, getUserInboxRelays, eventStore } from '../lib/applesauce';
import { getCachedEventsByFilters } from '../lib/cache';
import { useProfile } from '../hooks/useProfile';
import { usePreferences } from '../providers/PreferencesProvider';
import { Note } from '../components/Note';
import { ReportModal } from '../components/ReportModal';
import { ProfilePowBadge } from '../components/ProfilePowBadge';
import { hasValidPow } from '../lib/pow';
import { debug } from '../lib/debug';
import { useNip05Validation } from '../lib/nip05-validator';

const INITIAL_LOAD = 10;
const LOAD_MORE_BATCH = 5;
const REQUIRE_POW_KEY = 'notemine:ui:profileRequirePow';

const ProfileDetail: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { preferences, updatePreference } = usePreferences();

  const [pubkey, setPubkey] = createSignal<string | null>(null);
  const [notes, setNotes] = createSignal<NostrEvent[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingNotes, setLoadingNotes] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [showReportModal, setShowReportModal] = createSignal(false);

  // POW filter toggle - default to false (show all notes)
  const initialRequirePow = (() => {
    try {
      const v = localStorage.getItem(REQUIRE_POW_KEY);
      return v === '1' || v === 'true';
    } catch {
      return false;
    }
  })();
  const [requirePow, setRequirePow] = createSignal(initialRequirePow);

  // Persist POW requirement preference
  createEffect(() => {
    try {
      localStorage.setItem(REQUIRE_POW_KEY, requirePow() ? '1' : '0');
    } catch {}
  });

  // Reload notes when POW requirement or difficulty changes
  createEffect(() => {
    const currentPubkey = pubkey();
    requirePow(); // Track this signal
    preferences().minPowRootNote; // Track this signal too

    if (currentPubkey && !loading()) {
      debug('[ProfileDetail] POW settings changed, reloading notes');
      loadUserNotes(currentPubkey);
    }
  });

  const profile = useProfile(() => pubkey() || undefined);

  // State for infinite scroll
  let oldestTimestamp = Math.floor(Date.now() / 1000);
  let eventCache = new Map<string, NostrEvent>();
  let sentinelRef: HTMLDivElement | undefined;
  let relaySubscription: any = null;

  // NIP-05 validation
  const nip05Validation = useNip05Validation(
    () => profile().metadata?.nip05,
    () => pubkey() || undefined
  );

  onMount(async () => {
    try {
      const identifier = params.identifier;
      if (!identifier) {
        setError('No profile identifier provided');
        setLoading(false);
        return;
      }

      let decodedPubkey: string;

      // Decode identifier (npub or nprofile or raw hex)
      if (identifier.startsWith('npub')) {
        const decoded = nip19.decode(identifier);
        if (decoded.type !== 'npub') {
          setError('Invalid npub identifier');
          setLoading(false);
          return;
        }
        decodedPubkey = decoded.data;
      } else if (identifier.startsWith('nprofile')) {
        const decoded = nip19.decode(identifier);
        if (decoded.type !== 'nprofile') {
          setError('Invalid nprofile identifier');
          setLoading(false);
          return;
        }
        decodedPubkey = decoded.data.pubkey;
      } else {
        // Assume raw hex pubkey
        decodedPubkey = identifier;
      }

      setPubkey(decodedPubkey);
      setLoading(false);

      // Fetch user's notes
      loadUserNotes(decodedPubkey);
    } catch (err) {
      console.error('[ProfileDetail] Error:', err);
      setError(String(err));
      setLoading(false);
    }
  });

  // Setup infinite scroll observer
  onMount(() => {
    if (sentinelRef) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore() && !loadingMore()) {
            loadMore();
          }
        },
        { rootMargin: '200px' } // Start loading when 200px away from sentinel
      );

      observer.observe(sentinelRef);

      onCleanup(() => {
        observer.disconnect();
        if (relaySubscription) {
          relaySubscription.unsubscribe();
        }
      });
    }
  });

  const loadUserNotes = async (userPubkey: string) => {
    setLoadingNotes(true);
    eventCache.clear(); // Reset cache for new user
    oldestTimestamp = Math.floor(Date.now() / 1000);

    // Get POW threshold at the start of the function
    const minPowThreshold = preferences().minPowRootNote;

    try {
      // Step 1: Check cache first for existing events
      debug('[ProfileDetail] Checking cache for existing notes');
      const cachedEvents = await getCachedEventsByFilters([
        { kinds: [1, 30023], authors: [userPubkey], limit: INITIAL_LOAD }
      ]);

      // Add cached events to our event cache
      let cachedRootNotes = 0;
      let filteredByPow = 0;
      cachedEvents.forEach(event => {
        const hasETag = event.tags.some((tag: string[]) => tag[0] === 'e');
        if (!hasETag) {
          cachedRootNotes++;
          // Check POW only if required
          const passesPowCheck = !requirePow() || hasValidPow(event, minPowThreshold);
          if (passesPowCheck) {
            eventCache.set(event.id, event);
            if (event.created_at < oldestTimestamp) {
              oldestTimestamp = event.created_at;
            }
          } else {
            filteredByPow++;
          }
        }
      });

      debug(`[ProfileDetail] Cache results: ${cachedEvents.length} total, ${cachedRootNotes} root notes, ${filteredByPow} filtered by POW, ${eventCache.size} passed`);

      // Update UI with cached notes immediately
      if (eventCache.size > 0) {
        updateDisplayedNotes();
        setLoadingNotes(false); // Show cached notes immediately, continue loading in background
      }

      // Step 2: Fetch from relays (incremental loading)
      const inboxRelays = await getUserInboxRelays(userPubkey);
      const relays = inboxRelays.length > 0 ? inboxRelays : getActiveRelays();

      debug('[ProfileDetail] Fetching notes from:', relays);

      const filter = {
        kinds: [1, 30023],
        authors: [userPubkey],
        limit: INITIAL_LOAD,
      };

      let subscriptionCompleted = false;

      // Set timeout to ensure loading completes even if relays don't respond
      const timeoutId = setTimeout(() => {
        if (!subscriptionCompleted) {
          debug('[ProfileDetail] Timeout reached, using what we have');
          subscriptionCompleted = true;
          setLoadingNotes(false);
          if (eventCache.size < INITIAL_LOAD) {
            setHasMore(false);
          }
          if (relaySubscription) {
            relaySubscription.unsubscribe();
          }
        }
      }, 10000); // 10 second timeout

      let eventsReceived = 0;
      let eventsFiltered = 0;
      let eventsAdded = 0;

      relaySubscription = relayPool.req(relays, filter).subscribe({
        next: (response) => {
          if (response !== 'EOSE' && (response.kind === 1 || response.kind === 30023)) {
            eventsReceived++;
            try {
              const event = response as NostrEvent;

              // Filter out replies - only root notes
              const hasETag = event.tags.some((tag) => tag[0] === 'e');
              if (hasETag) {
                eventsFiltered++;
                return;
              }

              // Check POW only if required
              if (requirePow() && !hasValidPow(event, minPowThreshold)) {
                eventsFiltered++;
                return;
              }

              // Add to EventStore for global caching
              eventStore.add(event);

              // Add to local cache if not duplicate
              if (!eventCache.has(event.id)) {
                eventCache.set(event.id, event);
                eventsAdded++;

                // Track oldest timestamp for pagination
                if (event.created_at < oldestTimestamp) {
                  oldestTimestamp = event.created_at;
                }

                // Update display
                updateDisplayedNotes();
              }
            } catch (err) {
              debug('[ProfileDetail] Error processing event:', err);
            }
          }
        },
        complete: () => {
          if (!subscriptionCompleted) {
            clearTimeout(timeoutId);
            subscriptionCompleted = true;
            setLoadingNotes(false);
            // If we got less than INITIAL_LOAD, there are no more
            if (eventCache.size < INITIAL_LOAD) {
              setHasMore(false);
            }
            debug(`[ProfileDetail] Initial load complete: received ${eventsReceived}, filtered ${eventsFiltered}, added ${eventsAdded}, total cached ${eventCache.size} notes`);
          }
        },
        error: (err) => {
          if (!subscriptionCompleted) {
            clearTimeout(timeoutId);
            subscriptionCompleted = true;
            debug('[ProfileDetail] Subscription error:', err);
            setLoadingNotes(false);
            setHasMore(false);
          }
        },
      });
    } catch (err) {
      console.error('[ProfileDetail] Error loading notes:', err);
      setLoadingNotes(false);
    }
  };

  const updateDisplayedNotes = () => {
    const sortedNotes = Array.from(eventCache.values()).sort(
      (a, b) => b.created_at - a.created_at
    );
    setNotes(sortedNotes);
  };

  const loadMore = async () => {
    if (!hasMore() || loadingMore() || !pubkey()) return;

    setLoadingMore(true);
    debug('[ProfileDetail] Loading more notes, until:', oldestTimestamp);

    // Get POW threshold for this load more operation
    const minPowThreshold = preferences().minPowRootNote;

    try {
      const inboxRelays = await getUserInboxRelays(pubkey()!);
      const relays = inboxRelays.length > 0 ? inboxRelays : getActiveRelays();

      const filter = {
        kinds: [1, 30023],
        authors: [pubkey()!],
        limit: LOAD_MORE_BATCH,
        until: oldestTimestamp - 1, // Load notes older than the oldest we have
      };

      let receivedCount = 0;

      relayPool.req(relays, filter).subscribe({
        next: (response) => {
          if (response !== 'EOSE' && (response.kind === 1 || response.kind === 30023)) {
            try {
              const event = response as NostrEvent;

              // Filter out replies
              const hasETag = event.tags.some((tag) => tag[0] === 'e');
              if (hasETag) return;

              // Check POW only if required
              if (requirePow() && !hasValidPow(event, minPowThreshold)) return;

              // Add to EventStore
              eventStore.add(event);

              // Add to local cache
              if (!eventCache.has(event.id)) {
                eventCache.set(event.id, event);
                receivedCount++;

                // Update oldest timestamp
                if (event.created_at < oldestTimestamp) {
                  oldestTimestamp = event.created_at;
                }

                updateDisplayedNotes();
              }
            } catch (err) {
              debug('[ProfileDetail] Error processing event:', err);
            }
          }
        },
        complete: () => {
          setLoadingMore(false);
          // If we got less than requested, no more notes available
          if (receivedCount < LOAD_MORE_BATCH) {
            setHasMore(false);
            debug('[ProfileDetail] No more notes to load');
          }
          debug(`[ProfileDetail] Loaded ${receivedCount} more notes`);
        },
        error: (err) => {
          debug('[ProfileDetail] Load more error:', err);
          setLoadingMore(false);
        },
      });
    } catch (err) {
      console.error('[ProfileDetail] Error loading more notes:', err);
      setLoadingMore(false);
    }
  };

  const npub = () => {
    const pk = pubkey();
    if (!pk) return '';
    try {
      return nip19.npubEncode(pk);
    } catch {
      return pk;
    }
  };

  const copyNpub = () => {
    navigator.clipboard.writeText(npub());
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
          <p class="mt-4 text-text-secondary">Loading profile...</p>
        </div>
      </Show>

      {/* Error State */}
      <Show when={error()}>
        <div class="card p-4 bg-red-100 dark:bg-red-900/20 border-red-500">
          <p class="text-red-700 dark:text-red-400">Error: {error()}</p>
        </div>
      </Show>

      {/* Profile Content */}
      <Show when={pubkey() && !loading() && !error()}>
        <div class="card overflow-hidden">
          {/* Banner */}
          <Show when={profile().metadata?.banner}>
            <div class="w-full h-48 bg-gradient-to-r from-accent/20 to-cyber-500/20 relative">
              <img
                src={profile().metadata!.banner}
                alt="Banner"
                class="w-full h-full object-cover"
              />
            </div>
          </Show>

          {/* Profile Header */}
          <div class="p-6">
            <div class="flex items-start gap-6">
              {/* Avatar */}
              <div class="-mt-16 relative">
                <Show
                  when={profile().metadata?.picture}
                  fallback={
                    <div class="w-32 h-32 rounded-full bg-accent/20 border-4 border-bg-primary flex items-center justify-center text-4xl">
                      👤
                    </div>
                  }
                >
                  <img
                    src={profile().metadata!.picture}
                    alt="Avatar"
                    class="w-32 h-32 rounded-full object-cover border-4 border-bg-primary"
                  />
                </Show>
              </div>

              {/* Info */}
              <div class="flex-1 mt-4">
                {/* Name with PoW Badge */}
                <div class="flex items-center gap-3 mb-2">
                  <h1 class="text-3xl font-bold text-text-primary">
                    {profile().metadata?.display_name || profile().metadata?.name || 'Anonymous'}
                  </h1>
                  <Show when={profile().event?.id}>
                    <ProfilePowBadge profileEventId={profile().event!.id} style="full" />
                  </Show>
                </div>

                {/* NIP-05 with validation */}
                <Show when={profile().metadata?.nip05}>
                  <div class="flex items-center gap-2 text-sm text-text-secondary mb-2">
                    <Show when={!nip05Validation().loading}>
                      <Show
                        when={nip05Validation().valid}
                        fallback={<span class="text-red-500" title="Not verified">✗</span>}
                      >
                        <span class="text-green-500" title="Verified">✓</span>
                      </Show>
                    </Show>
                    <Show when={nip05Validation().loading}>
                      <span class="text-text-secondary" title="Verifying...">⏳</span>
                    </Show>
                    <span>{profile().metadata!.nip05}</span>
                  </div>
                </Show>

                {/* Npub */}
                <div class="flex items-center gap-2 mb-4">
                  <code class="text-xs font-mono text-text-tertiary">
                    {npub().slice(0, 20)}...{npub().slice(-8)}
                  </code>
                  <button
                    onClick={copyNpub}
                    class="text-xs text-accent hover:underline"
                    title="Copy npub"
                  >
                    📋 copy
                  </button>
                  <button
                    onClick={() => setShowReportModal(true)}
                    class="text-xs text-red-500 hover:underline"
                    title="Report profile"
                  >
                    🚩 report
                  </button>
                </div>

                {/* About */}
                <Show when={profile().metadata?.about}>
                  <p class="text-text-primary whitespace-pre-wrap mb-4">
                    {profile().metadata!.about}
                  </p>
                </Show>

                {/* Links */}
                <div class="flex items-center gap-4 text-sm">
                  <Show when={profile().metadata?.website}>
                    <a
                      href={profile().metadata!.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-accent hover:underline"
                    >
                      🌐 {profile().metadata!.website}
                    </a>
                  </Show>

                  <Show when={profile().metadata?.lud16}>
                    <span class="text-text-secondary">
                      ⚡ {profile().metadata!.lud16}
                    </span>
                  </Show>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* User's Notes */}
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-text-primary">Notes</h2>

            {/* POW Filter Toggle */}
            <div class="flex items-center gap-3 text-sm">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requirePow()}
                  onChange={(e) => setRequirePow(e.currentTarget.checked)}
                  class="w-4 h-4 accent-accent cursor-pointer"
                />
                <span class="text-text-secondary select-none">
                  Require POW
                </span>
              </label>

              {/* POW Difficulty Slider - only visible when POW is required */}
              <Show when={requirePow()}>
                <div class="flex items-center gap-2">
                  <span class="text-text-tertiary text-xs whitespace-nowrap">
                    {preferences().minPowRootNote}
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="32"
                    value={preferences().minPowRootNote}
                    onInput={(e) => updatePreference('minPowRootNote', parseInt(e.currentTarget.value))}
                    class="w-24 h-1 accent-accent cursor-pointer"
                  />
                </div>
              </Show>
            </div>
          </div>

          <Show when={loadingNotes()}>
            <div class="card p-8 text-center">
              <div class="inline-block animate-spin rounded-full h-6 w-6 border-4 border-accent border-t-transparent"></div>
              <p class="mt-4 text-text-secondary">Loading notes...</p>
            </div>
          </Show>

          <Show when={!loadingNotes() && notes().length === 0}>
            <div class="card p-8 text-center">
              <p class="text-text-secondary">No notes found</p>
              <p class="text-sm text-text-tertiary mt-2">
                This user hasn't posted any high-POW notes yet
              </p>
            </div>
          </Show>

          <Show when={!loadingNotes() && notes().length > 0}>
            <div class="space-y-3">
              <For each={notes()}>
                {(note) => <Note event={note} showScore={false} />}
              </For>

              {/* Infinite scroll sentinel */}
              <Show when={hasMore()}>
                <div ref={sentinelRef} class="h-4" />
                <Show when={loadingMore()}>
                  <div class="card p-6 text-center">
                    <div class="inline-block animate-spin rounded-full h-5 w-5 border-4 border-accent border-t-transparent"></div>
                    <p class="mt-2 text-sm text-text-secondary">Loading more...</p>
                  </div>
                </Show>
              </Show>

              {/* End of feed message */}
              <Show when={!hasMore() && notes().length > 0}>
                <div class="text-center py-6">
                  <p class="text-sm text-text-tertiary">No more notes to load</p>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      {/* Report Modal */}
      <Show when={showReportModal()}>
        <ReportModal
          isOpen={showReportModal()}
          onClose={() => setShowReportModal(false)}
          pubkey={pubkey() || undefined}
          targetKind={0}
        />
      </Show>
    </div>
  );
};

export default ProfileDetail;
