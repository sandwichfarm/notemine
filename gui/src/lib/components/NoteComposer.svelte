<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { UnsignedEvent } from '$lib/types';
  import { difficultySettings } from '$lib/stores/difficulty';
  import { calculateTargetDifficulty, EVENT_KINDS } from '$lib/types/difficulty';
  import DifficultySettings from './DifficultySettings.svelte';
  
  const dispatch = createEventDispatcher();
  
  let content = '';
  let selectedKind = 1; // Default to short text note
  let isSubmitting = false;
  let showSettings = false;
  
  $: isMention = content.includes('@npub') || content.includes('nostr:npub');
  $: isReply = content.includes('#[') || content.includes('nostr:note');
  $: calculatedDifficulty = calculateTargetDifficulty(selectedKind, $difficultySettings, isMention, isReply);
  
  async function submitNote() {
    if (!content.trim()) return;
    
    isSubmitting = true;
    
    const note: UnsignedEvent = {
      pubkey: '', // Will be set by the event service
      created_at: Math.floor(Date.now() / 1000),
      kind: selectedKind,
      tags: [],
      content: content.trim()
    };
    
    dispatch('submit', { note, difficulty: calculatedDifficulty });
    
    content = '';
    isSubmitting = false;
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      submitNote();
    }
  }
</script>

<div class="bg-gray-800 rounded-lg p-4 mb-6">
  <h3 class="text-lg font-semibold mb-4 text-gray-100">Compose Note</h3>
  
  <div class="space-y-4">
    <div>
      <label for="content" class="block text-sm font-medium text-gray-300 mb-2">
        Content
      </label>
      <textarea
        id="content"
        bind:value={content}
        on:keydown={handleKeydown}
        placeholder="What's happening?"
        rows="4"
        class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
      ></textarea>
    </div>
    
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <div>
          <label for="eventKind" class="block text-sm font-medium text-gray-300 mb-1">
            Event Type
          </label>
          <select
            id="eventKind"
            bind:value={selectedKind}
            class="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {#each Object.values(EVENT_KINDS) as kindConfig}
              <option value={kindConfig.kind}>
                {kindConfig.name} (Kind {kindConfig.kind})
              </option>
            {/each}
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">
            Target PoW Difficulty
          </label>
          <div class="flex items-center space-x-2">
            <span class="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-purple-400 font-mono">
              {calculatedDifficulty}
            </span>
            <button
              type="button"
              on:click={() => showSettings = true}
              class="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition-colors"
              title="Configure difficulty settings"
            >
              ⚙️
            </button>
          </div>
          {#if isMention}
            <div class="text-xs text-yellow-400 mt-1">Mention detected</div>
          {/if}
          {#if isReply}
            <div class="text-xs text-blue-400 mt-1">Reply detected</div>
          {/if}
        </div>
        
        <div class="text-sm text-gray-400">
          <kbd class="px-2 py-1 bg-gray-600 rounded text-xs">Ctrl/Cmd + Enter</kbd> to submit
        </div>
      </div>
      
      <button
        on:click={submitNote}
        disabled={isSubmitting || !content.trim()}
        class="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
      >
        {#if isSubmitting}
          Mining...
        {:else}
          Mine & Publish
        {/if}
      </button>
    </div>
  </div>
</div>

<!-- Difficulty Settings Modal -->
<DifficultySettings 
  bind:isOpen={showSettings}
  settings={$difficultySettings}
  on:update={(e) => difficultySettings.set(e.detail)}
  on:reset={() => difficultySettings.reset()}
/>