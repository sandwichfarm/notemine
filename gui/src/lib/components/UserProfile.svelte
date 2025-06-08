<script lang="ts">
  import type { NostrEvent } from '$lib/types/nostr';
  import { onMount, onDestroy } from 'svelte';
  import { eventService } from '$lib/services/events';
  import { SimpleRelayPool } from '$lib/services/simple-pool';
  import { EventStore } from 'applesauce-core';
  import { contactsService } from '$lib/services/contacts';
  import { extractPowDifficulty } from '$lib/utils/nostr';
  import { relayPool } from '$lib/stores/relay-pool';
  import { npubToHex, isValidHexPubkey, isValidNpub } from '$lib/utils/bech32';
  import { get } from 'svelte/store';

  export let initialPubkey: string = '';
  export let windowId: string;

  // Profile state
  let pubkeyInput = initialPubkey;
  let currentPubkey = '';
  let profile: any = null;
  let userNotes: NostrEvent[] = [];
  let userRelays: string[] = [];
  let isLoading = false;
  let error = '';
  let subscription: any = null;
  let notesSubscription: any = null;
  let relaysSubscription: any = null;

  // UI state
  let showingNotes = true;
  let showingRelays = false;
  let showingContacts = false;
  let sortBy: 'date' | 'pow' = 'date';
  let noteLimit = 20;

  // Pool and store instances
  let pool: SimpleRelayPool;
  let eventStore: EventStore;

  function normalizePubkey(input: string): string | null {
    const trimmed = input.trim();
    
    if (isValidHexPubkey(trimmed)) {
      return trimmed.toLowerCase();
    }
    
    if (isValidNpub(trimmed)) {
      return npubToHex(trimmed);
    }
    
    return null;
  }

  function formatPubkey(pubkey: string): string {
    if (pubkey.length === 64) {
      return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
    }
    return pubkey;
  }

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  function parseProfile(content: string): any {
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  async function loadUserProfile(pubkey: string) {
    if (!pubkey) return;
    
    isLoading = true;
    error = '';
    
    try {
      const relays = get(relayPool).relays.slice(0, 5); // Use first 5 relays
      
      if (relays.length === 0) {
        throw new Error('No relays available');
      }

      console.log(`Loading profile for ${formatPubkey(pubkey)} from relays:`, relays);

      // Subscribe to profile events (kind 0)
      const profileFilter = {
        kinds: [0],
        authors: [pubkey],
        limit: 1
      };

      subscription = pool.req(relays, profileFilter).subscribe({
        next: (response) => {
          if (response !== 'EOSE' && 'kind' in response && response.kind === 0) {
            console.log('Received profile event:', response);
            profile = parseProfile(response.content);
            profile._event = response; // Store the raw event
          }
        },
        error: (err) => {
          console.error('Profile subscription error:', err);
          error = `Failed to load profile: ${err.message}`;
        }
      });

      // Load user's notes
      await loadUserNotes(pubkey, relays);
      
      // Load user's relay list
      await loadUserRelays(pubkey, relays);

    } catch (err) {
      console.error('Profile loading error:', err);
      error = `Failed to load profile: ${err.message}`;
    } finally {
      isLoading = false;
    }
  }

  async function loadUserNotes(pubkey: string, relays: string[]) {
    const notesFilter = {
      kinds: [1], // Text notes
      authors: [pubkey],
      limit: noteLimit
    };

    notesSubscription = pool.req(relays, notesFilter).subscribe({
      next: (response) => {
        if (response !== 'EOSE' && 'kind' in response && response.kind === 1) {
          const note = response as NostrEvent;
          // Check if note already exists to avoid duplicates
          if (!userNotes.find(n => n.id === note.id)) {
            userNotes = [...userNotes, note];
            // Sort notes
            sortNotes();
          }
        }
      },
      error: (err) => {
        console.error('Notes subscription error:', err);
      }
    });
  }

  async function loadUserRelays(pubkey: string, relays: string[]) {
    const relaysFilter = {
      kinds: [10002], // Relay list events
      authors: [pubkey],
      limit: 1
    };

    relaysSubscription = pool.req(relays, relaysFilter).subscribe({
      next: (response) => {
        if (response !== 'EOSE' && 'kind' in response && response.kind === 10002) {
          console.log('Received relay list event:', response);
          userRelays = parseRelayList(response as NostrEvent);
        }
      },
      error: (err) => {
        console.error('Relay list subscription error:', err);
      }
    });
  }

  function parseRelayList(event: NostrEvent): string[] {
    const relays: string[] = [];
    for (const tag of event.tags) {
      if (tag[0] === 'r' && tag[1]) {
        relays.push(tag[1]);
      }
    }
    return relays;
  }

  function sortNotes() {
    userNotes = userNotes.sort((a, b) => {
      if (sortBy === 'date') {
        return b.created_at - a.created_at;
      } else if (sortBy === 'pow') {
        const aPow = extractPowDifficulty(a);
        const bPow = extractPowDifficulty(b);
        return bPow - aPow;
      }
      return 0;
    });
  }

  function handlePubkeySubmit() {
    const normalized = normalizePubkey(pubkeyInput);
    if (!normalized) {
      error = 'Invalid pubkey format. Use hex (64 chars) or npub format.';
      return;
    }
    
    if (normalized === currentPubkey) {
      return; // Already loaded
    }

    // Clean up previous subscriptions
    cleanup();
    
    // Reset state
    profile = null;
    userNotes = [];
    userRelays = [];
    error = '';
    
    currentPubkey = normalized;
    loadUserProfile(normalized);
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handlePubkeySubmit();
    }
  }

  function cleanup() {
    if (subscription) {
      subscription.unsubscribe();
      subscription = null;
    }
    if (notesSubscription) {
      notesSubscription.unsubscribe();
      notesSubscription = null;
    }
    if (relaysSubscription) {
      relaysSubscription.unsubscribe();
      relaysSubscription = null;
    }
  }

  // Initialize pool and event store
  onMount(() => {
    pool = new SimpleRelayPool();
    eventStore = new EventStore();
    
    // Check if we have window parameters with a pubkey
    if (typeof window !== 'undefined' && window.windowManager) {
      const windowContent = window.windowManager.getWindowContent(windowId);
      if (windowContent?.params?.pubkey) {
        pubkeyInput = windowContent.params.pubkey;
        const normalized = normalizePubkey(windowContent.params.pubkey);
        if (normalized) {
          currentPubkey = normalized;
          loadUserProfile(normalized);
          return;
        }
      }
    }
    
    // Load initial profile if pubkey provided via props
    if (initialPubkey) {
      const normalized = normalizePubkey(initialPubkey);
      if (normalized) {
        pubkeyInput = initialPubkey;
        currentPubkey = normalized;
        loadUserProfile(normalized);
      }
    }
  });

  onDestroy(() => {
    cleanup();
    if (pool) {
      pool.destroy();
    }
  });

  // Reactive sorting
  $: if (userNotes.length > 0) {
    sortNotes();
  }
</script>

<div class="h-full flex flex-col text-xs overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 border-b border-green-800 pb-2 mb-3">
    <h3 class="text-sm mb-2 text-green-300">USER_PROFILE</h3>
    
    <!-- Pubkey input -->
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={pubkeyInput}
        placeholder="Enter pubkey (hex) or npub..."
        onkeypress={handleKeyPress}
        class="flex-1 bg-transparent border border-green-800 px-2 py-1 text-green-400 placeholder-green-600 focus:border-green-600 outline-none"
      />
      <button
        onclick={handlePubkeySubmit}
        disabled={isLoading}
        class="px-3 py-1 bg-green-900/20 border border-green-800 text-green-400 hover:bg-green-800/30 disabled:opacity-50"
      >
        {isLoading ? 'LOADING...' : 'LOAD'}
      </button>
    </div>
    
    {#if error}
      <div class="text-red-400 text-xs mt-1">{error}</div>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-auto">
    {#if isLoading}
      <div class="flex items-center justify-center h-32">
        <div class="text-green-400 animate-pulse">LOADING_PROFILE...</div>
      </div>
    {:else if currentPubkey && !error}
      <!-- Profile info -->
      {#if profile}
        <div class="space-y-3 mb-4">
          <div class="bg-green-900/10 border border-green-800 p-3 rounded">
            <!-- Avatar and basic info -->
            <div class="flex items-start gap-3 mb-3">
              {#if profile.picture}
                <img
                  src={profile.picture}
                  alt="Profile"
                  class="w-16 h-16 rounded border border-green-800 object-cover"
                  onerror={(e) => e.target.style.display = 'none'}
                />
              {:else}
                <div class="w-16 h-16 bg-green-900/20 border border-green-800 rounded flex items-center justify-center">
                  <span class="text-green-600 text-xl">👤</span>
                </div>
              {/if}
              
              <div class="flex-1 min-w-0">
                <h4 class="text-green-300 font-bold text-sm">
                  {profile.name || profile.display_name || 'Anonymous'}
                </h4>
                {#if profile.nip05}
                  <div class="text-green-500 text-xs">✓ {profile.nip05}</div>
                {/if}
                <div class="text-green-600 font-mono text-xs break-all">
                  {formatPubkey(currentPubkey)}
                </div>
              </div>
            </div>
            
            <!-- About -->
            {#if profile.about}
              <div class="space-y-1">
                <h5 class="text-green-400 font-bold">ABOUT:</h5>
                <p class="text-green-500 text-xs leading-relaxed">{profile.about}</p>
              </div>
            {/if}
            
            <!-- Additional metadata -->
            <div class="grid grid-cols-2 gap-2 text-xs mt-3 pt-2 border-t border-green-800">
              {#if profile.website}
                <div>
                  <span class="text-green-600">Website:</span>
                  <a href={profile.website} target="_blank" class="text-green-400 hover:text-green-300 ml-1">
                    {profile.website}
                  </a>
                </div>
              {/if}
              {#if profile.lud16}
                <div>
                  <span class="text-green-600">Lightning:</span>
                  <span class="text-green-400 ml-1">{profile.lud16}</span>
                </div>
              {/if}
              {#if profile._event}
                <div class="col-span-2">
                  <span class="text-green-600">Profile updated:</span>
                  <span class="text-green-400 ml-1">{formatTimestamp(profile._event.created_at)}</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="text-green-600 text-center py-4">
          No profile found for this user
        </div>
      {/if}

      <!-- Navigation tabs -->
      <div class="flex gap-2 mb-3 border-b border-green-800 pb-2">
        <button
          onclick={() => { showingNotes = true; showingRelays = false; showingContacts = false; }}
          class="px-2 py-1 text-xs {showingNotes ? 'bg-green-800/30 text-green-300' : 'text-green-600 hover:text-green-400'}"
        >
          NOTES ({userNotes.length})
        </button>
        <button
          onclick={() => { showingNotes = false; showingRelays = true; showingContacts = false; }}
          class="px-2 py-1 text-xs {showingRelays ? 'bg-green-800/30 text-green-300' : 'text-green-600 hover:text-green-400'}"
        >
          RELAYS ({userRelays.length})
        </button>
        <button
          onclick={() => { showingNotes = false; showingRelays = false; showingContacts = true; }}
          class="px-2 py-1 text-xs {showingContacts ? 'bg-green-800/30 text-green-300' : 'text-green-600 hover:text-green-400'}"
        >
          CONTACTS
        </button>
      </div>

      <!-- Content sections -->
      {#if showingNotes}
        <div class="space-y-2">
          <!-- Sort controls -->
          <div class="flex justify-between items-center text-xs">
            <div class="flex gap-2">
              <span class="text-green-600">Sort:</span>
              <button
                onclick={() => sortBy = 'date'}
                class={sortBy === 'date' ? 'text-green-400' : 'text-green-600 hover:text-green-400'}
              >
                DATE
              </button>
              <button
                onclick={() => sortBy = 'pow'}
                class={sortBy === 'pow' ? 'text-green-400' : 'text-green-600 hover:text-green-400'}
              >
                POW
              </button>
            </div>
            <div class="flex gap-2 items-center">
              <span class="text-green-600">Limit:</span>
              <select bind:value={noteLimit} class="bg-black border border-green-800 text-green-400 text-xs">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <!-- Notes list -->
          {#if userNotes.length > 0}
            <div class="space-y-2">
              {#each userNotes as note}
                <div class="bg-green-900/10 border border-green-800 p-2 rounded">
                  <div class="flex justify-between items-start mb-1">
                    <span class="text-green-600 text-xs">{formatTimestamp(note.created_at)}</span>
                    <div class="flex gap-2 text-xs">
                      {#if extractPowDifficulty(note) > 0}
                        <span class="text-yellow-400">⚡{extractPowDifficulty(note)}</span>
                      {/if}
                      <span class="text-green-600 font-mono">{note.id.slice(0, 8)}...</span>
                    </div>
                  </div>
                  <p class="text-green-400 text-xs leading-relaxed">
                    {note.content}
                  </p>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-green-600 text-center py-4">
              No notes found for this user
            </div>
          {/if}
        </div>
      {:else if showingRelays}
        <div class="space-y-2">
          {#if userRelays.length > 0}
            <div class="space-y-1">
              {#each userRelays as relay}
                <div class="bg-green-900/10 border border-green-800 p-2 rounded">
                  <div class="text-green-400 font-mono text-xs break-all">{relay}</div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-green-600 text-center py-4">
              No relay list found for this user
            </div>
          {/if}
        </div>
      {:else if showingContacts}
        <div class="text-green-600 text-center py-4">
          Contact list functionality coming soon...
        </div>
      {/if}
    {:else if !currentPubkey && !error}
      <div class="flex flex-col items-center justify-center h-32 space-y-2">
        <div class="text-green-600 text-center">
          Enter a pubkey or npub to view profile
        </div>
        <div class="text-green-700 text-xs text-center">
          Format: 64-character hex or npub1...
        </div>
      </div>
    {/if}
  </div>
</div>