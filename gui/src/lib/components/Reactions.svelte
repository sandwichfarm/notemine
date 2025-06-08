<script lang="ts">
  import { onMount } from 'svelte';
  import { Heart, Zap as ZapIcon, ThumbsUp, ThumbsDown, Laugh, MessageCircle } from 'lucide-svelte';
  import { reactionsService } from '$lib/services/reactions';
  import { keyManager } from '$lib/services/keys';
  import type { NostrEvent } from '$lib/types/nostr';
  
  export let event: NostrEvent;
  export let compact = false;
  
  const reactions = reactionsService.createEventReactionsStore(event.id);
  let hasKeys = false;
  let isReacting = false;
  let reactionStates = new Map<string, 'sending' | 'success' | 'error' | null>();
  let successAnimations = new Set<string>();
  let userSupportsZaps = false;
  let checkingZapSupport = false;
  
  // Common reaction emojis - supporting both standard and custom emojis (NIP-30)
  const reactionOptions = [
    { content: '+', icon: ThumbsUp, label: 'Like', isCustom: false },
    { content: '❤️', icon: Heart, label: 'Love', isCustom: false },
    { content: '😂', icon: Laugh, label: 'Funny', isCustom: false },
    { content: '🔥', icon: null, label: 'Fire', isCustom: false },
    { content: '💯', icon: null, label: 'Hundred', isCustom: false },
    { content: '🚀', icon: null, label: 'Rocket', isCustom: false },
    { content: '-', icon: ThumbsDown, label: 'Dislike', isCustom: false }
  ];
  
  // Custom emoji picker state
  let showCustomEmojiPicker = false;
  let customEmojiInput = '';
  
  // Get all unique reactions for this event (including custom ones)
  $: allReactions = Array.from($reactions.reactions.keys());
  
  onMount(async () => {
    hasKeys = keyManager.getPublicKey() !== null;
    
    // Subscribe to reactions for this event
    reactionsService.subscribeToReactions([event.id]);
    
    // Check if user supports zaps
    await checkZapSupport();
  });
  
  // Check if the event author supports zaps by looking for lightning address in their profile
  async function checkZapSupport() {
    if (checkingZapSupport) return;
    checkingZapSupport = true;
    
    try {
      const metadata = await reactionsService.getUserMetadata(event.pubkey);
      if (metadata && metadata.content) {
        const profile = JSON.parse(metadata.content);
        // Check for lightning address (lud16) or LNURL (lud06)
        userSupportsZaps = !!(profile.lud16 || profile.lud06);
      }
    } catch (error) {
      console.warn('Failed to check zap support for user:', error);
      userSupportsZaps = false;
    } finally {
      checkingZapSupport = false;
    }
  }
  
  // Get reaction count for a specific emoji
  function getReactionCount(content: string): number {
    return $reactions.reactions.get(content)?.length || 0;
  }
  
  // Get total reaction count
  function getTotalReactions(): number {
    let total = 0;
    $reactions.reactions.forEach(events => {
      total += events.length;
    });
    return total;
  }
  
  // Handle reaction click
  async function handleReaction(content: string) {
    if (!hasKeys) return;
    
    // Set reaction state to sending
    reactionStates.set(content, 'sending');
    reactionStates = new Map(reactionStates);
    
    try {
      await reactionsService.publishReaction(event.id, content, event.pubkey);
      
      // Success feedback
      reactionStates.set(content, 'success');
      reactionStates = new Map(reactionStates);
      
      // Trigger success animation
      successAnimations.add(content);
      successAnimations = new Set(successAnimations);
      
      // Clear success state after 2 seconds
      setTimeout(() => {
        reactionStates.set(content, null);
        reactionStates = new Map(reactionStates);
        successAnimations.delete(content);
        successAnimations = new Set(successAnimations);
      }, 2000);
      
    } catch (error) {
      console.error('Failed to publish reaction:', error);
      
      // Error feedback
      reactionStates.set(content, 'error');
      reactionStates = new Map(reactionStates);
      
      // Clear error state after 3 seconds
      setTimeout(() => {
        reactionStates.set(content, null);
        reactionStates = new Map(reactionStates);
      }, 3000);
    }
  }
  
  // Handle custom emoji submission
  async function handleCustomEmoji() {
    if (!customEmojiInput.trim() || !hasKeys) return;
    
    const content = customEmojiInput.trim();
    await handleReaction(content);
    customEmojiInput = '';
    showCustomEmojiPicker = false;
  }
  
  // Check if emoji is a custom emoji shortcode (NIP-30)
  function isCustomEmoji(content: string): boolean {
    return content.startsWith(':') && content.endsWith(':') && content.length > 2;
  }
  
  // Render emoji content (supporting NIP-30 custom emojis)
  function renderEmoji(content: string): string {
    if (isCustomEmoji(content)) {
      // For now, just show the shortcode - in a full implementation,
      // we'd resolve these to actual emoji images via NIP-30
      return content;
    }
    return content;
  }
  
  // Check if current user has reacted with this content
  function hasUserReacted(content: string): boolean {
    const userPubkey = keyManager.getPublicKey();
    if (!userPubkey) return false;
    
    const reactionEvents = $reactions.reactions.get(content);
    return reactionEvents?.some(event => event.pubkey === userPubkey) || false;
  }
  
  // Get visual state for reaction button
  function getReactionButtonState(content: string): string {
    const state = reactionStates.get(content);
    const userReacted = hasUserReacted(content);
    const count = getReactionCount(content);
    const hasAnimation = successAnimations.has(content);
    
    let classes = "flex items-center gap-1 px-2 py-1 text-xs rounded transition-all duration-200 ";
    
    if (state === 'sending') {
      classes += "bg-yellow-900/30 text-yellow-400 scale-95 opacity-75 animate-pulse ";
    } else if (state === 'success' || hasAnimation) {
      classes += "bg-green-900/40 text-green-300 scale-105 ring-1 ring-green-500/50 ";
    } else if (state === 'error') {
      classes += "bg-red-900/30 text-red-400 border border-red-600 ";
    } else if (userReacted) {
      classes += "bg-green-900/30 text-green-400 border border-green-700 ";
    } else if (count > 0) {
      classes += "bg-green-900/20 text-green-400 ";
    } else {
      classes += "text-green-600 ";
    }
    
    classes += "hover:bg-green-900/50 disabled:opacity-50 disabled:cursor-not-allowed";
    
    return classes;
  }
  
  // Format zap amount
  function formatZapAmount(sats: number): string {
    if (sats >= 1000000) {
      return `${(sats / 1000000).toFixed(1)}M`;
    } else if (sats >= 1000) {
      return `${(sats / 1000).toFixed(1)}K`;
    }
    return sats.toString();
  }
  
  function openZapPane() {
    // Create a zap window with the event data
    const windowId = `zap-${event.id}`;
    
    // Check if window manager is available
    if (typeof window !== 'undefined' && (window as any).windowManager) {
      const windowManager = (window as any).windowManager;
      
      // Store the event data in multiple places to ensure it persists
      (window as any).zapEventData = { event };
      localStorage.setItem('tempZapData', JSON.stringify({ event }));
      
      // Create the zap window as floating
      const createdWindow = windowManager.createWindow('zap', windowId);
      if (createdWindow) {
        // Set the window to floating mode
        setTimeout(() => {
          windowManager.toggleFloating(windowId);
        }, 100);
      }
    }
  }
</script>

{#if compact}
  <!-- Compact view for feed -->
  <div class="flex items-center gap-3 text-xs">
    {#if $reactions.zapCount > 0}
      <button
        onclick={() => openZapPane()}
        class="flex items-center gap-1 text-yellow-400 hover:text-yellow-300"
        disabled={!hasKeys || !userSupportsZaps}
      >
        <ZapIcon class="w-3 h-3" />
        <span>{formatZapAmount($reactions.zapAmount)}</span>
      </button>
    {:else if hasKeys && userSupportsZaps}
      <button
        onclick={() => openZapPane()}
        class="flex items-center gap-1 text-green-600 hover:text-green-400"
      >
        <ZapIcon class="w-3 h-3" />
      </button>
    {/if}
    
    {#if getTotalReactions() > 0}
      <div class="flex items-center gap-1 text-green-600">
        <!-- Show top 3 most popular reactions in compact view -->
        {#each Array.from($reactions.reactions.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 3) as [content, events]}
          <button
            onclick={() => handleReaction(content)}
            disabled={!hasKeys || isReacting}
            class="flex items-center gap-1 text-green-600 hover:text-green-400 text-xs"
            title="React with {content}"
          >
            <span>{renderEmoji(content)}</span>
            <span>{events.length}</span>
          </button>
        {/each}
        
        <!-- Show total if there are more reactions -->
        {#if $reactions.reactions.size > 3}
          <span class="text-green-700 text-xs">+{getTotalReactions() - Array.from($reactions.reactions.values()).slice(0, 3).reduce((sum, events) => sum + events.length, 0)}</span>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <!-- Full view with reaction buttons -->
  <div class="flex items-center gap-2 flex-wrap">
    {#each reactionOptions as option}
      {@const state = reactionStates.get(option.content)}
      <button
        onclick={() => handleReaction(option.content)}
        disabled={!hasKeys || state === 'sending'}
        class={getReactionButtonState(option.content)}
        title={state === 'sending' ? 'Sending reaction...' : 
               state === 'success' ? 'Reaction sent!' :
               state === 'error' ? 'Failed to send reaction' :
               hasUserReacted(option.content) ? `You reacted with ${option.content}` :
               option.label}
      >
        {#if state === 'sending'}
          <span class="w-3 h-3 animate-spin">⏳</span>
        {:else if state === 'success'}
          <span class="w-3 h-3">✓</span>
        {:else if state === 'error'}
          <span class="w-3 h-3">⚠</span>
        {:else if option.icon}
          <svelte:component this={option.icon} class="w-3 h-3" />
        {:else}
          <span class="text-sm">{renderEmoji(option.content)}</span>
        {/if}
        {#if getReactionCount(option.content) > 0 && state !== 'sending' && state !== 'success'}
          <span>{getReactionCount(option.content)}</span>
        {/if}
      </button>
    {/each}
    
    <!-- Show any custom reactions that aren't in the default set -->
    {#each allReactions as reactionContent}
      {#if !reactionOptions.some(opt => opt.content === reactionContent)}
        {@const state = reactionStates.get(reactionContent)}
        <button
          onclick={() => handleReaction(reactionContent)}
          disabled={!hasKeys || state === 'sending'}
          class={getReactionButtonState(reactionContent)}
          title={state === 'sending' ? 'Sending reaction...' : 
                 state === 'success' ? 'Reaction sent!' :
                 state === 'error' ? 'Failed to send reaction' :
                 hasUserReacted(reactionContent) ? `You reacted with ${reactionContent}` :
                 `React with ${reactionContent}`}
        >
          {#if state === 'sending'}
            <span class="w-3 h-3 animate-spin">⏳</span>
          {:else if state === 'success'}
            <span class="w-3 h-3">✓</span>
          {:else if state === 'error'}
            <span class="w-3 h-3">⚠</span>
          {:else}
            <span class="text-sm">{renderEmoji(reactionContent)}</span>
          {/if}
          {#if getReactionCount(reactionContent) > 0 && state !== 'sending' && state !== 'success'}
            <span>{getReactionCount(reactionContent)}</span>
          {/if}
        </button>
      {/if}
    {/each}
    
    <!-- Custom emoji picker toggle -->
    {#if hasKeys}
      <button
        onclick={() => showCustomEmojiPicker = !showCustomEmojiPicker}
        class="flex items-center gap-1 px-2 py-1 text-xs rounded text-green-600
               hover:bg-green-900/50 transition-colors border border-green-800"
        title="Add custom emoji"
      >
        <span class="text-sm">+</span>
      </button>
    {/if}
    
    <!-- Custom emoji input -->
    {#if showCustomEmojiPicker}
      <div class="flex items-center gap-1 ml-2">
        <input
          bind:value={customEmojiInput}
          placeholder=":custom_emoji: or 🎯"
          class="bg-transparent border border-green-800 px-2 py-1 text-xs text-green-400
                 rounded w-32 focus:border-green-600 focus:outline-none"
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCustomEmoji();
            } else if (e.key === 'Escape') {
              showCustomEmojiPicker = false;
              customEmojiInput = '';
            }
          }}
        />
        <button
          onclick={handleCustomEmoji}
          disabled={!customEmojiInput.trim() || isReacting}
          class="px-2 py-1 text-xs bg-green-900 text-green-400 rounded
                 hover:bg-green-800 disabled:opacity-50 transition-colors"
        >
          React
        </button>
      </div>
    {/if}
    
    <!-- Zap Button - Only show if user supports zaps -->
    {#if userSupportsZaps}
      <button
        onclick={() => openZapPane()}
        disabled={!hasKeys}
        class="flex items-center gap-1 px-2 py-1 text-xs rounded
               {$reactions.zapCount > 0 
                 ? 'bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/30' 
                 : 'text-green-600 hover:bg-green-900/50'}
               transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Send zap"
      >
        <ZapIcon class="w-3 h-3" />
        {#if $reactions.zapCount > 0}
          <span>{formatZapAmount($reactions.zapAmount)}</span>
          <span class="text-yellow-600">({$reactions.zapCount})</span>
        {/if}
      </button>
    {:else if checkingZapSupport}
      <!-- Show a loading indicator while checking zap support -->
      <div class="flex items-center gap-1 px-2 py-1 text-xs text-gray-500">
        <ZapIcon class="w-3 h-3 opacity-50" />
        <span class="animate-pulse">...</span>
      </div>
    {/if}
  </div>
{/if}