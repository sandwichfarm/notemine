<script lang="ts">
  import { globalFeedWarningState, feedManager } from '$lib/services/feed-manager';
  import { onMount } from 'svelte';
  
  let glitchText = '';
  let visualEffect = '';
  
  $: if ($globalFeedWarningState.currentWarning) {
    visualEffect = $globalFeedWarningState.currentWarning.visual || 'static';
  }
  
  // Generate random glitch text
  function generateGlitch() {
    const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 20; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
  
  onMount(() => {
    const interval = setInterval(() => {
      if ($globalFeedWarningState.isWarning) {
        glitchText = generateGlitch();
      }
    }, 100);
    
    return () => clearInterval(interval);
  });
</script>

{#if $globalFeedWarningState.isWarning && $globalFeedWarningState.currentWarning}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
    <!-- Visual effects overlay -->
    <div class="absolute inset-0 pointer-events-none">
      {#if visualEffect === 'static'}
        <div class="w-full h-full opacity-10 bg-gradient-to-b from-transparent via-white to-transparent animate-pulse"></div>
      {:else if visualEffect === 'glitch'}
        <div class="glitch-effect absolute inset-0">
          <div class="glitch-line" style="top: {Math.random() * 100}%"></div>
          <div class="glitch-line" style="top: {Math.random() * 100}%"></div>
          <div class="glitch-line" style="top: {Math.random() * 100}%"></div>
        </div>
      {:else if visualEffect === 'matrix'}
        <div class="matrix-rain absolute inset-0 overflow-hidden">
          {#each Array(20) as _, i}
            <div 
              class="matrix-column" 
              style="left: {i * 5}%; animation-delay: {Math.random() * 2}s"
            >
              {generateGlitch()}
            </div>
          {/each}
        </div>
      {:else if visualEffect === 'scan'}
        <div class="scan-line"></div>
      {:else if visualEffect === 'corrupt'}
        <div class="corrupt-blocks">
          {#each Array(10) as _, i}
            <div 
              class="corrupt-block" 
              style="
                left: {Math.random() * 80}%; 
                top: {Math.random() * 80}%;
                width: {20 + Math.random() * 100}px;
                height: {10 + Math.random() * 50}px;
                animation-delay: {Math.random()}s;
              "
            ></div>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- Warning content -->
    <div class="relative max-w-2xl mx-auto p-8 bg-black border-2 border-red-500 shadow-2xl shadow-red-500/20">
      <div class="absolute -top-4 -left-4 text-red-500 text-6xl opacity-50 animate-pulse">⚠</div>
      <div class="absolute -bottom-4 -right-4 text-red-500 text-6xl opacity-50 animate-pulse">⚠</div>
      
      <!-- Glitch text decoration -->
      <div class="absolute top-2 left-2 text-red-900 text-xs font-mono opacity-50">
        {glitchText}
      </div>
      
      <h2 class="text-2xl font-bold mb-4 text-red-500 glitch-text" data-text="WARNING">
        WARNING
      </h2>
      
      <div class="mb-6 text-green-400 font-mono whitespace-pre-wrap {$globalFeedWarningState.currentWarning.style}">
        {$globalFeedWarningState.currentWarning.message}
      </div>
      
      {#if $globalFeedWarningState.clicksRemaining > 1}
        <p class="text-yellow-500 text-sm mb-4">
          [{$globalFeedWarningState.clicksRemaining} confirmations remaining]
        </p>
      {/if}
      
      <div class="flex gap-4">
        <button
          onclick={() => feedManager.handleGlobalWarningClick()}
          class="px-6 py-3 bg-red-900/50 border border-red-500 text-red-300 hover:bg-red-800/50 transition-all font-mono uppercase tracking-wider hover:tracking-widest"
        >
          {$globalFeedWarningState.currentWarning.buttonText}
        </button>
        
        <button
          onclick={() => feedManager.cancelGlobalWarning()}
          class="px-6 py-3 bg-gray-900/50 border border-gray-600 text-gray-400 hover:bg-gray-800/50 transition-all font-mono"
        >
          ABORT
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes glitch {
    0%, 100% { text-shadow: 2px 0 red, -2px 0 cyan; }
    25% { text-shadow: -2px 0 red, 2px 0 cyan; }
    50% { text-shadow: 2px 2px red, -2px -2px cyan; }
    75% { text-shadow: -2px -2px red, 2px 2px cyan; }
  }
  
  .glitch-text {
    animation: glitch 0.3s infinite;
  }
  
  .glitch-line {
    position: absolute;
    width: 100%;
    height: 2px;
    background: red;
    opacity: 0.5;
    animation: glitch-move 2s infinite;
  }
  
  @keyframes glitch-move {
    0%, 100% { transform: translateX(0); }
    50% { transform: translateX(10px); }
  }
  
  .matrix-column {
    position: absolute;
    top: -100%;
    font-family: monospace;
    font-size: 12px;
    color: #00ff00;
    animation: matrix-fall 4s linear infinite;
    white-space: pre;
    line-height: 1.2;
  }
  
  @keyframes matrix-fall {
    to { transform: translateY(200vh); }
  }
  
  .scan-line {
    position: absolute;
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, transparent, rgba(0, 255, 0, 0.8), transparent);
    animation: scan 3s linear infinite;
  }
  
  @keyframes scan {
    0% { top: -4px; }
    100% { top: 100%; }
  }
  
  .corrupt-block {
    position: absolute;
    background: rgba(255, 0, 0, 0.2);
    border: 1px solid red;
    animation: corrupt-flicker 0.5s infinite;
  }
  
  @keyframes corrupt-flicker {
    0%, 100% { opacity: 0; }
    50% { opacity: 1; }
  }
  
  .terminal {
    font-family: 'Courier New', monospace;
    text-shadow: 0 0 5px currentColor;
  }
  
  .matrix {
    color: #00ff00;
    text-shadow: 0 0 10px #00ff00;
  }
  
  .cypherpunk {
    background: linear-gradient(45deg, #ff00ff, #00ffff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .chaos {
    animation: chaos-colors 0.5s infinite;
  }
  
  @keyframes chaos-colors {
    0% { color: red; }
    33% { color: yellow; }
    66% { color: cyan; }
    100% { color: magenta; }
  }
</style>