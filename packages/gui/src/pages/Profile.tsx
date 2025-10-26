import { Component, createSignal, Show, onMount } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { usePowMining } from '../hooks/usePowMining';
import { relayPool, getActiveRelays, getUserOutboxRelays } from '../lib/applesauce';
import { finalizeEvent } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/core';
import { nip19 } from 'nostr-tools';

interface ProfileMetadata {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

const DEFAULT_DIFFICULTY = 20;

const Profile: Component = () => {
  const { user } = useUser();
  const { state: miningState, startMining } = usePowMining();

  const [isEditing, setIsEditing] = createSignal(false);
  const [profileData, setProfileData] = createSignal<ProfileMetadata>({});
  const [editData, setEditData] = createSignal<ProfileMetadata>({});
  const [difficulty, setDifficulty] = createSignal(DEFAULT_DIFFICULTY);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal(false);

  onMount(async () => {
    const currentUser = user();
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      // Fetch kind 0 metadata for current user
      const relays = getActiveRelays();
      console.log('[Profile] Fetching metadata from relays:', relays);

      const filter = {
        kinds: [0],
        authors: [currentUser.pubkey],
        limit: 1,
      };

      // Subscribe to get profile metadata
      const subscription = relayPool.req(relays, filter).subscribe({
        next: (response) => {
          if (response !== 'EOSE' && response.kind === 0) {
            try {
              const metadata: ProfileMetadata = JSON.parse(response.content);
              setProfileData(metadata);
              setEditData(metadata);
            } catch (err) {
              console.error('[Profile] Failed to parse metadata:', err);
            }
          }
        },
        complete: () => {
          setLoading(false);
        },
      });

      setTimeout(() => {
        subscription.unsubscribe();
        setLoading(false);
      }, 3000);
    } catch (err) {
      console.error('[Profile] Error fetching metadata:', err);
      setError(String(err));
      setLoading(false);
    }
  });

  const handleSave = async () => {
    const currentUser = user();
    if (!currentUser) {
      setError('No user authenticated');
      return;
    }

    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      console.log('[Profile] Mining kind 0 event with POW...');

      // Create kind 0 event content
      const content = JSON.stringify(editData());

      // Mine with POW
      const minedEvent = await startMining({
        content,
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: [['client', 'notemine.io']],
        kind: 0,
      });

      if (!minedEvent) {
        throw new Error('Mining failed: no event returned');
      }

      console.log('[Profile] POW mining complete, publishing...');

      // Sign the event
      let signedEvent: NostrEvent;
      if (currentUser.isAnon && currentUser.secret) {
        signedEvent = finalizeEvent(minedEvent as any, currentUser.secret);
      } else if (currentUser.signer) {
        signedEvent = await currentUser.signer.signEvent(minedEvent as any);
      } else if (window.nostr) {
        signedEvent = await window.nostr.signEvent(minedEvent);
      } else {
        throw new Error('Cannot sign event: no signing method available');
      }

      // Publish to relays (using NIP-65 outbox relays)
      const activeRelays = await getUserOutboxRelays(currentUser.pubkey);
      console.log('[Profile] Publishing to user outbox relays:', activeRelays);

      const promises = activeRelays.map(async (relayUrl) => {
        const relay = relayPool.relay(relayUrl);
        return relay.publish(signedEvent);
      });

      await Promise.allSettled(promises);

      // Success!
      setProfileData(editData());
      setIsEditing(false);
      setSuccess(true);
      console.log('[Profile] Profile updated successfully');

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('[Profile] Error saving profile:', err);
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData(profileData());
    setIsEditing(false);
    setError(null);
  };

  const npub = () => {
    const currentUser = user();
    if (!currentUser) return '';
    try {
      return nip19.npubEncode(currentUser.pubkey);
    } catch {
      return currentUser.pubkey;
    }
  };

  return (
    <div class="max-w-2xl mx-auto space-y-6">
      <div class="text-center">
        <h1 class="text-3xl font-bold mb-2">Profile</h1>
        <p class="text-text-secondary">
          View and edit your Nostr profile metadata
        </p>
      </div>

      <Show when={!user()}>
        <div class="card p-8 text-center">
          <p class="text-text-secondary">Please sign in to view your profile</p>
        </div>
      </Show>

      <Show when={user()}>
        <div class="card p-6">
          {/* Header */}
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-xl font-bold">
                {isEditing() ? 'Edit Profile' : 'Your Profile'}
              </h2>
              <div class="text-xs text-text-secondary font-mono mt-1">
                {npub()}
              </div>
            </div>
            <Show when={!isEditing() && !loading()}>
              <button onClick={() => setIsEditing(true)} class="btn-primary">
                Edit Profile
              </button>
            </Show>
          </div>

          {/* Loading */}
          <Show when={loading()}>
            <div class="text-center py-8">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent mb-4"></div>
              <p class="text-text-secondary">Loading profile...</p>
            </div>
          </Show>

          {/* View Mode */}
          <Show when={!isEditing() && !loading()}>
            <div class="space-y-4">
              <Show when={profileData().picture}>
                <div class="flex justify-center">
                  <img
                    src={profileData().picture}
                    alt="Profile"
                    class="w-24 h-24 rounded-full object-cover border-2 border-accent"
                  />
                </div>
              </Show>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Name</label>
                <div class="text-text-primary">
                  {profileData().name || <span class="text-text-tertiary italic">Not set</span>}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">About</label>
                <div class="text-text-primary whitespace-pre-wrap">
                  {profileData().about || <span class="text-text-tertiary italic">Not set</span>}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">NIP-05</label>
                <div class="text-text-primary font-mono text-sm">
                  {profileData().nip05 || <span class="text-text-tertiary italic">Not set</span>}
                </div>
              </div>
            </div>
          </Show>

          {/* Edit Mode */}
          <Show when={isEditing()}>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-2">Profile Picture URL</label>
                <input
                  type="url"
                  value={editData().picture || ''}
                  onInput={(e) => setEditData({ ...editData(), picture: e.currentTarget.value })}
                  placeholder="https://example.com/avatar.jpg"
                  class="w-full px-3 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  disabled={miningState().mining || saving()}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={editData().name || ''}
                  onInput={(e) => setEditData({ ...editData(), name: e.currentTarget.value })}
                  placeholder="Your name"
                  class="w-full px-3 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  disabled={miningState().mining || saving()}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">About</label>
                <textarea
                  value={editData().about || ''}
                  onInput={(e) => setEditData({ ...editData(), about: e.currentTarget.value })}
                  placeholder="Tell us about yourself..."
                  rows={4}
                  class="w-full px-3 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  disabled={miningState().mining || saving()}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">NIP-05 Identifier</label>
                <input
                  type="text"
                  value={editData().nip05 || ''}
                  onInput={(e) => setEditData({ ...editData(), nip05: e.currentTarget.value })}
                  placeholder="name@example.com"
                  class="w-full px-3 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  disabled={miningState().mining || saving()}
                />
              </div>

              {/* Difficulty slider */}
              <div>
                <label class="block text-sm font-medium mb-2">
                  POW Difficulty: {difficulty()}
                </label>
                <input
                  type="range"
                  min="16"
                  max="28"
                  step="1"
                  value={difficulty()}
                  onInput={(e) => setDifficulty(Number(e.currentTarget.value))}
                  class="w-full"
                  disabled={miningState().mining || saving()}
                />
                <div class="text-xs text-text-secondary mt-1">
                  Profile updates require POW to prevent spam
                </div>
              </div>

              {/* Mining stats */}
              <Show when={miningState().mining}>
                <div class="p-3 bg-bg-primary dark:bg-bg-tertiary border border-border rounded-lg">
                  <div class="text-sm text-text-primary space-y-1">
                    <div>⛏️ Mining profile update with POW...</div>
                    <div>Hash rate: {miningState().hashRate.toFixed(2)} H/s</div>
                    <Show when={miningState().overallBestPow !== null}>
                      <div>Best POW: {miningState().overallBestPow}</div>
                    </Show>
                  </div>
                </div>
              </Show>

              {/* Error message */}
              <Show when={error()}>
                <div class="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  Error: {error()}
                </div>
              </Show>

              {/* Success message */}
              <Show when={success()}>
                <div class="p-3 bg-green-100 dark:bg-green-900/20 border border-green-500 text-green-700 dark:text-green-400 rounded-lg text-sm">
                  ✅ Profile updated successfully!
                </div>
              </Show>

              {/* Mining error */}
              <Show when={miningState().error}>
                <div class="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  Mining error: {miningState().error}
                </div>
              </Show>

              {/* Buttons */}
              <div class="flex gap-2 pt-4">
                <button
                  onClick={handleSave}
                  disabled={miningState().mining || saving()}
                  class="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Show when={!miningState().mining && !saving()} fallback="Mining...">
                    Save Profile
                  </Show>
                </button>
                <button
                  onClick={handleCancel}
                  disabled={miningState().mining || saving()}
                  class="px-4 py-2 btn disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default Profile;
