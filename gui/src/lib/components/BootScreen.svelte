<script lang="ts">
  import { bootState, bootService } from '$lib/services/boot';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  
  let terminalEl: HTMLDivElement;
  let showCursor = true;
  let cursorInterval: number;
  
  onMount(() => {
    // Blinking cursor
    cursorInterval = window.setInterval(() => {
      showCursor = !showCursor;
    }, 500);
    
    // Auto-scroll to bottom
    $: if (terminalEl && $bootState.lines.length > 0) {
      terminalEl.scrollTop = terminalEl.scrollHeight;
    }
    
    return () => {
      if (cursorInterval) clearInterval(cursorInterval);
    };
  });
  
  function handleClick() {
    if ($bootState.complete) {
      bootService.skipBoot();
    }
  }
  
  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === ' ') {
      bootService.skipBoot();
    }
  }
  
  // Special boot message
  const specialMessage = bootService.getSpecialBootMessage();
</script>

{#if $bootState.isBooting}
  <div 
    class="fixed inset-0 bg-black z-[100] flex flex-col overflow-hidden"
    onclick={handleClick}
    onkeydown={handleKeyPress}
    transition:fade={{ duration: 300 }}
  >
    <!-- Scanlines effect -->
    <div class="scanlines"></div>
    
    <!-- Terminal content -->
    <div 
      bind:this={terminalEl}
      class="flex-1 p-8 overflow-y-auto font-mono text-sm leading-relaxed"
    >
      {#each $bootState.lines as line, i}
        <div 
          class="whitespace-pre {line.className || 'text-green-600'}"
          class:typing={i === $bootState.currentLine}
        >
          {line.text}
          {#if i === $bootState.lines.length - 1 && !$bootState.complete}
            <span class="cursor {showCursor ? '' : 'invisible'}">█</span>
          {/if}
        </div>
      {/each}
    </div>
    
    <!-- Progress bar -->
    <div class="absolute bottom-0 left-0 right-0 h-1 bg-gray-900">
      <div 
        class="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-300"
        style="width: {$bootState.progress}%"
      ></div>
    </div>
    
    <!-- Skip hint -->
    {#if !$bootState.complete}
      <div class="absolute bottom-4 right-4 text-xs text-gray-600 animate-pulse">
        Press [ESC] to skip
      </div>
    {/if}
    
    <!-- Special message -->
    {#if specialMessage && $bootState.complete}
      <div class="absolute top-4 right-4 text-xs text-purple-400 animate-pulse">
        {specialMessage}
      </div>
    {/if}
    
    <!-- Glitch overlay occasionally -->
    {#if Math.random() < 0.05}
      <div class="glitch-overlay"></div>
    {/if}
  </div>
{/if}

<style>
  /* Scanlines effect */
  .scanlines {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      transparent 50%,
      rgba(0, 255, 0, 0.03) 51%
    );
    background-size: 100% 4px;
    pointer-events: none;
    animation: scanlines 8s linear infinite;
  }
  
  @keyframes scanlines {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: 0 8px;
    }
  }
  
  /* Cursor blink */
  .cursor {
    @apply text-green-400;
    animation: none;
  }
  
  /* Typing animation */
  .typing {
    animation: typing 0.1s ease-out;
  }
  
  @keyframes typing {
    from {
      opacity: 0;
      transform: translateX(-2px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  /* Glitch effect */
  .glitch-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 0, 255, 0.05);
    mix-blend-mode: screen;
    animation: glitch 0.2s ease-in-out;
    pointer-events: none;
  }
  
  @keyframes glitch {
    0%, 100% {
      opacity: 0;
    }
    50% {
      opacity: 1;
      transform: translateX(2px) scale(1.01);
    }
  }
  
  /* Terminal glow */
  :global(body) {
    text-shadow: 0 0 2px currentColor;
  }
</style>