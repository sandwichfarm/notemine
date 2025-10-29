import { Component, createSignal, Show, createEffect } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { useProfile } from '../hooks/useProfile';
import { useQueue } from '../providers/QueueProvider';
import { nip19 } from 'nostr-tools';
import { debug } from '../lib/debug';
import { useNip05Validation } from '../lib/nip05-validator';

interface ProfileMetadata {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
  bot?: boolean;
}

const DEFAULT_DIFFICULTY = 20;

const Profile: Component = () => {
  const { user } = useUser();
  const { queueState, addToQueue, removeFromQueue } = useQueue();

  const [isEditing, setIsEditing] = createSignal(false);
  const [editData, setEditData] = createSignal<ProfileMetadata>({});
  const [difficulty, setDifficulty] = createSignal(DEFAULT_DIFFICULTY);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal(false);
  const [profileQueueItemId, setProfileQueueItemId] = createSignal<string | null>(null);

  // Use the useProfile hook to get profile data from EventStore
  const profile = useProfile(() => user()?.pubkey);

  // NIP-05 validation for view mode (validates saved profile)
  const profileNip05Validation = useNip05Validation(
    () => profile().metadata?.nip05,
    () => user()?.pubkey
  );

  // NIP-05 validation for edit mode (validates current input)
  const editNip05Validation = useNip05Validation(
    () => editData().nip05,
    () => user()?.pubkey
  );

  // Check if profile update is in queue or being processed
  const profileInQueue = () => {
    const itemId = profileQueueItemId();
    if (!itemId) return false;
    const item = queueState().items.find(i => i.id === itemId);
    return item && (item.status === 'queued' || queueState().activeItemId === itemId);
  };

  // Initialize editData when profile metadata first loads
  createEffect(() => {
    const metadata = profile().metadata;
    if (metadata && !editData().name && !editData().about) {
      // Only set if editData is empty (initial load)
      setEditData(metadata);
    }
  });

  const handleSave = () => {
    const currentUser = user();
    if (!currentUser) {
      setError('No user authenticated');
      return;
    }

    setError(null);
    setSuccess(false);

    try {
      debug('[Profile] Adding profile update to queue');

      // Create kind 0 event content
      const content = JSON.stringify(editData());

      // Check if there's already a profile update in queue
      const existingProfileItem = queueState().items.find(
        item => item.type === 'profile' && (item.status === 'queued' || queueState().activeItemId === item.id)
      );

      if (existingProfileItem) {
        // Remove old profile update and add new one
        debug('[Profile] Replacing existing profile update in queue');
        removeFromQueue(existingProfileItem.id);
      }

      // Add to queue
      const itemId = addToQueue({
        type: 'profile',
        content,
        pubkey: currentUser.pubkey,
        difficulty: difficulty(),
        tags: [['client', 'notemine.io']],
        kind: 0,
      });

      setProfileQueueItemId(itemId);
      setIsEditing(false);
      setSuccess(true);
      debug('[Profile] Profile update added to queue:', itemId);

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('[Profile] Error adding profile to queue:', err);
      setError(String(err));
    }
  };

  const handleCancel = () => {
    setEditData(profile().metadata || {});
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
            <Show when={!isEditing() && !profile().loading}>
              <button onClick={() => setIsEditing(true)} class="btn-primary">
                Edit Profile
              </button>
            </Show>
          </div>

          {/* Loading */}
          <Show when={profile().loading}>
            <div class="text-center py-8">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent mb-4"></div>
              <p class="text-text-secondary">Loading profile...</p>
            </div>
          </Show>

          {/* View Mode */}
          <Show when={!isEditing() && !profile().loading}>
            <div class="space-y-4">
              {/* Banner */}
              <Show when={profile().metadata?.banner}>
                <div class="w-full h-32 rounded-lg overflow-hidden">
                  <img
                    src={profile().metadata!.banner}
                    alt="Banner"
                    class="w-full h-full object-cover"
                  />
                </div>
              </Show>

              {/* Profile Picture */}
              <Show when={profile().metadata?.picture}>
                <div class="flex justify-center">
                  <img
                    src={profile().metadata!.picture}
                    alt="Profile"
                    class="w-24 h-24 rounded-full object-cover border-2 border-accent"
                  />
                </div>
              </Show>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Name</label>
                <div class="text-text-primary">
                  {profile().metadata?.name || <span class="text-text-tertiary italic">Not set</span>}
                </div>
              </div>

              <Show when={profile().metadata?.display_name}>
                <div>
                  <label class="block text-sm font-medium text-text-secondary mb-1">Display Name</label>
                  <div class="text-text-primary">
                    {profile().metadata!.display_name}
                  </div>
                </div>
              </Show>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">About</label>
                <div class="text-text-primary whitespace-pre-wrap">
                  {profile().metadata?.about || <span class="text-text-tertiary italic">Not set</span>}
                </div>
              </div>

              <Show when={profile().metadata?.website}>
                <div>
                  <label class="block text-sm font-medium text-text-secondary mb-1">Website</label>
                  <a href={profile().metadata!.website} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">
                    {profile().metadata!.website}
                  </a>
                </div>
              </Show>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">NIP-05</label>
                <Show
                  when={profile().metadata?.nip05}
                  fallback={<div class="text-text-tertiary italic text-sm">Not set</div>}
                >
                  <div class="flex items-center gap-2">
                    <div class="text-text-primary font-mono text-sm">
                      {profile().metadata!.nip05}
                    </div>
                    {/* Validation badge */}
                    <Show when={!profileNip05Validation().loading}>
                      <Show
                        when={profileNip05Validation().valid}
                        fallback={<span class="text-red-500 text-xs" title="Not verified">✗</span>}
                      >
                        <span class="text-green-500 text-xs" title="Verified">✓</span>
                      </Show>
                    </Show>
                    <Show when={profileNip05Validation().loading}>
                      <span class="text-text-secondary text-xs" title="Verifying...">⏳</span>
                    </Show>
                  </div>
                </Show>
              </div>

              <Show when={profile().metadata?.lud16}>
                <div>
                  <label class="block text-sm font-medium text-text-secondary mb-1">Lightning Address</label>
                  <div class="text-text-primary font-mono text-sm">
                    {profile().metadata!.lud16}
                  </div>
                </div>
              </Show>

              <Show when={profile().metadata?.bot}>
                <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg">
                  <div class="flex items-center space-x-2">
                    <span class="text-text-secondary">🤖</span>
                    <span class="text-sm text-text-secondary">This is a bot account</span>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* Edit Mode */}
          <Show when={isEditing()}>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-2">Banner Image URL</label>
                <input
                  type="url"
                  value={editData().banner || ''}
                  onInput={(e) => setEditData({ ...editData(), banner: e.currentTarget.value })}
                  placeholder="https://example.com/banner.jpg"
                  class="w-full px-3 py-2 bg-neutral-800 text-white border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400"
                  disabled={profileInQueue()}
                />
                <p class="text-xs text-text-secondary mt-1">Wide banner image (~1024x768)</p>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Profile Picture URL</label>
                <input
                  type="url"
                  value={editData().picture || ''}
                  onInput={(e) => setEditData({ ...editData(), picture: e.currentTarget.value })}
                  placeholder="https://example.com/avatar.jpg"
                  class="w-full px-3 py-2 bg-neutral-800 text-white border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400"
                  disabled={profileInQueue()}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={editData().name || ''}
                  onInput={(e) => setEditData({ ...editData(), name: e.currentTarget.value })}
                  placeholder="Your name"
                  class="w-full px-3 py-2 bg-neutral-800 text-white border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400"
                  disabled={profileInQueue()}
                />
                <p class="text-xs text-text-secondary mt-1">Short unique identifier</p>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Display Name</label>
                <input
                  type="text"
                  value={editData().display_name || ''}
                  onInput={(e) => setEditData({ ...editData(), display_name: e.currentTarget.value })}
                  placeholder="Your display name"
                  class="w-full px-3 py-2 bg-neutral-800 text-white border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400"
                  disabled={profileInQueue()}
                />
                <p class="text-xs text-text-secondary mt-1">Full name with richer characters</p>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">About</label>
                <textarea
                  value={editData().about || ''}
                  onInput={(e) => setEditData({ ...editData(), about: e.currentTarget.value })}
                  placeholder="Tell us about yourself..."
                  rows={4}
                  class="w-full px-3 py-2 bg-neutral-800 text-white border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent resize-none placeholder:text-neutral-400"
                  disabled={profileInQueue()}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Website</label>
                <input
                  type="url"
                  value={editData().website || ''}
                  onInput={(e) => setEditData({ ...editData(), website: e.currentTarget.value })}
                  placeholder="https://example.com"
                  class="w-full px-3 py-2 bg-neutral-800 text-white border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400"
                  disabled={profileInQueue()}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">NIP-05 Identifier</label>
                <input
                  type="text"
                  value={editData().nip05 || ''}
                  onInput={(e) => setEditData({ ...editData(), nip05: e.currentTarget.value })}
                  placeholder="name@example.com"
                  class="w-full px-3 py-2 bg-neutral-800 text-white border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400"
                  disabled={profileInQueue()}
                />
                {/* Validation status */}
                <Show when={editData().nip05}>
                  <div class="mt-1 text-xs flex items-center gap-1">
                    <Show when={editNip05Validation().loading}>
                      <span class="text-text-secondary">⏳ Verifying...</span>
                    </Show>
                    <Show when={!editNip05Validation().loading && editNip05Validation().valid}>
                      <span class="text-green-500">✓ Verified</span>
                    </Show>
                    <Show when={!editNip05Validation().loading && !editNip05Validation().valid}>
                      <span class="text-red-500">✗ Not verified (but you can still save it)</span>
                    </Show>
                  </div>
                </Show>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Lightning Address (LUD-16)</label>
                <input
                  type="text"
                  value={editData().lud16 || ''}
                  onInput={(e) => setEditData({ ...editData(), lud16: e.currentTarget.value })}
                  placeholder="you@getalby.com"
                  class="w-full px-3 py-2 bg-neutral-800 text-white border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400"
                  disabled={profileInQueue()}
                />
              </div>

              <div>
                <label class="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editData().bot || false}
                    onChange={(e) => setEditData({ ...editData(), bot: e.currentTarget.checked })}
                    class="w-4 h-4 text-accent bg-neutral-800 border-neutral-700 rounded focus:ring-2 focus:ring-accent"
                    disabled={profileInQueue()}
                  />
                  <span class="text-sm font-medium">Bot Account</span>
                </label>
                <p class="text-xs text-text-secondary mt-1">Check if this account is automated</p>
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
                  disabled={profileInQueue()}
                />
                <div class="text-xs text-text-secondary mt-1">
                  Profile updates require POW to prevent spam
                </div>
              </div>

              {/* Queue status */}
              <Show when={profileInQueue()}>
                <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg">
                  <div class="text-sm text-text-secondary">
                    Profile update queued for mining. Check the queue panel to see progress.
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
                  ✅ Profile update added to queue!
                </div>
              </Show>

              {/* Buttons */}
              <div class="flex gap-2 pt-4">
                <button
                  onClick={handleSave}
                  disabled={profileInQueue()}
                  class="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {profileInQueue() ? 'Queued for Mining' : 'Save Profile'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={profileInQueue()}
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
