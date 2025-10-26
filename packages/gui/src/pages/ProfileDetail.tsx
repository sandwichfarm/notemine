import { Component, createSignal, onMount, Show, For } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { nip19, type NostrEvent } from 'nostr-tools';
import { relayPool, getActiveRelays, getUserInboxRelays } from '../lib/applesauce';
import { useProfile } from '../hooks/useProfile';
import { Note } from '../components/Note';
import { getPowDifficulty } from '../lib/pow';

const MIN_POW_DIFFICULTY = 16;

const ProfileDetail: Component = () => {
  const params = useParams();
  const navigate = useNavigate();

  const [pubkey, setPubkey] = createSignal<string | null>(null);
  const [notes, setNotes] = createSignal<NostrEvent[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingNotes, setLoadingNotes] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const profile = useProfile(pubkey);

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

  const loadUserNotes = async (userPubkey: string) => {
    setLoadingNotes(true);

    try {
      // Get user's inbox relays for better discovery
      const inboxRelays = await getUserInboxRelays(userPubkey);
      const relays = inboxRelays.length > 0 ? inboxRelays : getActiveRelays();

      console.log('[ProfileDetail] Fetching notes from:', relays);

      const filter = {
        kinds: [1, 30023],
        authors: [userPubkey],
        limit: 50,
      };

      const allNotes: NostrEvent[] = [];

      const relay$ = relayPool.req(relays, filter);
      relay$.subscribe({
        next: (response) => {
          if (response !== 'EOSE' && (response.kind === 1 || response.kind === 30023)) {
            const event = response as NostrEvent;

            // Filter out replies - only root notes
            const hasETag = event.tags.some((tag) => tag[0] === 'e');
            if (hasETag) return;

            // Check POW
            const powDifficulty = getPowDifficulty(event);
            if (powDifficulty < MIN_POW_DIFFICULTY) return;

            // Check for duplicates
            if (!allNotes.find((n) => n.id === event.id)) {
              allNotes.push(event);
            }
          }
        },
        complete: () => {
          // Sort by created_at (newest first)
          allNotes.sort((a, b) => b.created_at - a.created_at);
          setNotes(allNotes);
          setLoadingNotes(false);
          console.log(`[ProfileDetail] Loaded ${allNotes.length} notes`);
        },
      });
    } catch (err) {
      console.error('[ProfileDetail] Error loading notes:', err);
      setLoadingNotes(false);
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
                {/* Name */}
                <h1 class="text-3xl font-bold text-text-primary mb-2">
                  {profile().metadata?.display_name || profile().metadata?.name || 'Anonymous'}
                </h1>

                {/* NIP-05 */}
                <Show when={profile().metadata?.nip05}>
                  <div class="flex items-center gap-2 text-sm text-text-secondary mb-2">
                    <span class="text-accent">✓</span>
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
          <h2 class="text-xl font-bold text-text-primary">Notes</h2>

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
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default ProfileDetail;
