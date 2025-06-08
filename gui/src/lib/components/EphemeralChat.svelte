<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getPowClient } from '$lib/services/pow-client';
  import { keyManager } from '$lib/services/keys';
  import { userDiscoveryService } from '$lib/services/user-discovery';
  import type { NostrEvent } from '$lib/types/nostr';
  import { Send, Hash, Users, X, User } from 'lucide-svelte';
  
  // Chat state
  let messages: NostrEvent[] = [];
  let messageContent = '';
  let currentChannel = '_'; // Default channel
  let channelInput = '';
  let showChannelManager = false;
  let followedChannels: string[] = ['_', 'general', 'random'];
  let isConnected = false;
  let hasKeys = false;
  
  // User discovery state
  const userProfiles = userDiscoveryService.getUserProfiles();
  let discoveredUsers = new Set<string>();
  let showUserList = false;
  
  // Relay configuration for ephemeral chat
  const CHAT_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol'
  ];
  
  let powClient: any = null;
  let subscription: any = null;
  
  // Initialize
  onMount(async () => {
    if (browser) {
      try {
        powClient = getPowClient();
        hasKeys = keyManager.getPublicKey() !== null;
        
        // Subscribe to ephemeral chat events
        subscribeToChannel(currentChannel);
        isConnected = true;
      } catch (error) {
        console.error('Failed to initialize chat:', error);
      }
    }
  });
  
  onDestroy(() => {
    if (subscription) {
      subscription.unsubscribe();
    }
  });
  
  // Subscribe to channel messages
  function subscribeToChannel(channel: string) {
    if (subscription) {
      subscription.unsubscribe();
    }
    
    if (!powClient) return;
    
    // Clear messages when switching channels
    messages = [];
    
    // Subscribe to ephemeral chat events (kind 23333)
    const filter = {
      kinds: [23333],
      '#d': [channel],
      limit: 50
    };
    
    subscription = powClient.pool.req(CHAT_RELAYS, filter).subscribe({
      next: (response: any) => {
        if (response !== 'EOSE' && 'id' in response) {
          // Add message to list, avoiding duplicates
          if (!messages.find(m => m.id === response.id)) {
            messages = [...messages, response].sort((a, b) => a.created_at - b.created_at);
            
            // Discover user profile for new message authors
            const event = response as NostrEvent;
            if (!discoveredUsers.has(event.pubkey)) {
              discoveredUsers.add(event.pubkey);
              userDiscoveryService.discoverUser(event.pubkey).catch(console.error);
            }
            
            // Keep only last 100 messages
            if (messages.length > 100) {
              messages = messages.slice(-100);
            }
          }
        }
      },
      error: (error: any) => {
        console.error('Chat subscription error:', error);
      }
    });
  }
  
  // Send message
  async function sendMessage() {
    if (!messageContent.trim() || !hasKeys || !powClient) return;
    
    const content = messageContent.trim();
    messageContent = '';
    
    try {
      // Create ephemeral chat event
      const unsignedEvent = {
        pubkey: keyManager.getPublicKey()!,
        created_at: Math.floor(Date.now() / 1000),
        kind: 23333,
        tags: [
          ['d', currentChannel]
        ],
        content
      };
      
      // Sign and publish (no PoW required for ephemeral chat)
      const signedEvent = await keyManager.signEvent(unsignedEvent);
      await powClient.pool.publish(CHAT_RELAYS, signedEvent);
      
      // Add to local messages immediately
      messages = [...messages, signedEvent];
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }
  
  // Change channel
  function changeChannel(channel: string) {
    if (channel === currentChannel) return;
    currentChannel = channel;
    subscribeToChannel(channel);
  }
  
  // Add new channel
  function addChannel() {
    const channel = channelInput.trim();
    if (!channel || followedChannels.includes(channel)) return;
    
    // Validate channel name (24 chars max, alphanumeric)
    if (!/^[\p{L}\p{N}]{1,24}$/u.test(channel)) {
      alert('Channel names must be 1-24 alphanumeric characters');
      return;
    }
    
    followedChannels = [...followedChannels, channel];
    channelInput = '';
    changeChannel(channel);
    showChannelManager = false;
  }
  
  // Remove channel
  function removeChannel(channel: string) {
    if (channel === '_') return; // Can't remove default channel
    followedChannels = followedChannels.filter(c => c !== channel);
    if (currentChannel === channel) {
      changeChannel('_');
    }
  }
  
  // Format timestamp
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Format pubkey with display name if available
  function formatPubkey(pubkey: string): string {
    const displayName = userDiscoveryService.getDisplayName(pubkey);
    // If display name is same as truncated pubkey, user wasn't found
    if (displayName === pubkey.slice(0, 8)) {
      return pubkey.slice(0, 8);
    }
    // Show display name with truncated pubkey
    return `${displayName} (${pubkey.slice(0, 4)})`;
  }
  
  // Get unique users in current channel
  $: channelUsers = Array.from(new Set(messages.map(m => m.pubkey)));
  
  // Get users with profiles
  $: usersWithProfiles = channelUsers.filter(pubkey => {
    const profile = userDiscoveryService.getUserProfile(pubkey);
    return profile?.profile;
  });
</script>

<div class="h-full flex flex-col bg-black text-green-400 font-mono">
  <!-- Header -->
  <div class="flex items-center justify-between p-2 border-b border-green-800 bg-green-900/10">
    <div class="flex items-center gap-2">
      <Hash class="w-4 h-4" />
      <select 
        bind:value={currentChannel}
        onchange={(e) => changeChannel(e.target.value)}
        class="bg-transparent border-b border-green-600 text-green-400 text-sm outline-none"
      >
        {#each followedChannels as channel}
          <option value={channel} class="bg-black">{channel}</option>
        {/each}
      </select>
      <button
        onclick={() => showChannelManager = !showChannelManager}
        class="text-green-600 hover:text-green-400"
        title="Manage channels"
      >
        <Users class="w-4 h-4" />
      </button>
      <button
        onclick={() => showUserList = !showUserList}
        class="text-green-600 hover:text-green-400 relative"
        title="View users"
      >
        <User class="w-4 h-4" />
        {#if channelUsers.length > 0}
          <span class="absolute -top-1 -right-1 bg-green-600 text-black text-xs rounded-full w-3 h-3 flex items-center justify-center" style="font-size: 8px;">
            {channelUsers.length}
          </span>
        {/if}
      </button>
    </div>
    <div class="text-xs text-green-600">
      EPHEMERAL CHAT • {messages.length} messages
    </div>
  </div>
  
  <!-- Channel Manager -->
  {#if showChannelManager}
    <div class="p-2 border-b border-green-800 bg-green-900/10">
      <div class="flex items-center gap-2 mb-2">
        <input
          type="text"
          bind:value={channelInput}
          placeholder="New channel name..."
          onkeydown={(e) => e.key === 'Enter' && addChannel()}
          class="flex-1 bg-transparent border border-green-800 px-2 py-1 text-green-400 text-xs outline-none"
        />
        <button
          onclick={addChannel}
          class="px-2 py-1 bg-green-900 hover:bg-green-800 border border-green-600 text-xs"
        >
          Add
        </button>
      </div>
      <div class="space-y-1">
        {#each followedChannels as channel}
          <div class="flex items-center justify-between text-xs">
            <span class="text-green-600">#{channel}</span>
            {#if channel !== '_'}
              <button
                onclick={() => removeChannel(channel)}
                class="text-red-600 hover:text-red-400"
              >
                <X class="w-3 h-3" />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
  
  <!-- User List -->
  {#if showUserList}
    <div class="p-2 border-b border-green-800 bg-green-900/10">
      <div class="mb-2 text-xs text-green-600">
        USERS IN #{currentChannel} ({channelUsers.length})
      </div>
      <div class="space-y-1 max-h-32 overflow-y-auto">
        {#each channelUsers as pubkey}
          {@const profile = userDiscoveryService.getUserProfile(pubkey)}
          {@const relays = userDiscoveryService.getUserRelays(pubkey)}
          <div class="flex items-center justify-between text-xs p-1 hover:bg-green-900/20 rounded">
            <div class="flex flex-col">
              <span class="text-green-400">{formatPubkey(pubkey)}</span>
              {#if profile?.profile}
                <span class="text-green-600 text-xs">Profile: ✓</span>
              {:else}
                <span class="text-yellow-600 text-xs">Discovering...</span>
              {/if}
            </div>
            <div class="text-right">
              {#if relays.length > 0}
                <span class="text-green-600 text-xs">{relays.length} relays</span>
              {:else if profile?.relayList}
                <span class="text-yellow-600 text-xs">No relays</span>
              {:else}
                <span class="text-gray-600 text-xs">No relay list</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      {#if usersWithProfiles.length !== channelUsers.length}
        <div class="mt-2 text-xs text-yellow-600">
          Discovering {channelUsers.length - usersWithProfiles.length} user profiles...
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Messages -->
  <div class="flex-1 overflow-y-auto p-2 space-y-1">
    {#if !isConnected}
      <div class="text-center text-yellow-400 py-4">Connecting to chat relays...</div>
    {:else if !hasKeys}
      <div class="text-center text-yellow-400 py-4">
        <p>No keys configured</p>
        <p class="text-xs text-green-600 mt-1">Press ⌃I to set up keys</p>
      </div>
    {:else if messages.length === 0}
      <div class="text-center text-green-600 py-4">
        <p>No messages in #{currentChannel}</p>
        <p class="text-xs mt-1">Be the first to say something!</p>
      </div>
    {:else}
      {#each messages as message}
        {@const profile = userDiscoveryService.getUserProfile(message.pubkey)}
        <div class="flex gap-2 text-xs hover:bg-green-900/10 p-1 rounded">
          <span class="text-green-600 flex-shrink-0">{formatTime(message.created_at)}</span>
          <span class="text-green-500 flex-shrink-0 min-w-0" title={message.pubkey}>
            {formatPubkey(message.pubkey)}
            {#if profile?.profile}
              <span class="text-green-700">✓</span>
            {/if}
          </span>
          <span class="text-green-400 flex-1 break-words">{message.content}</span>
        </div>
      {/each}
    {/if}
  </div>
  
  <!-- Input -->
  <div class="p-2 border-t border-green-800 bg-green-900/10">
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={messageContent}
        onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
        placeholder={hasKeys ? `Message #${currentChannel}...` : 'Configure keys to chat...'}
        disabled={!hasKeys || !isConnected}
        class="flex-1 bg-transparent border border-green-800 px-2 py-1 text-green-400 text-sm outline-none
               disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        onclick={sendMessage}
        disabled={!hasKeys || !isConnected || !messageContent.trim()}
        class="px-3 py-1 bg-green-900 hover:bg-green-800 disabled:bg-green-950 disabled:opacity-50
               border border-green-600 flex items-center gap-1 text-sm"
      >
        <Send class="w-3 h-3" />
        Send
      </button>
    </div>
    <div class="text-xs text-green-600 mt-1">
      Ephemeral messages • No PoW required • Not stored permanently
    </div>
  </div>
</div>