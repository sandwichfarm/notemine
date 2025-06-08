<script lang="ts">
  import type { HyprlandWindow, Rectangle } from '../types';
  import { windowManager } from '../services/window-manager';
  import { hotkeyManager } from '../services/hotkeys';
  import { getPowClient } from '$lib/services/pow-client';
  import { browser } from '$app/environment';
  import { globalDifficulty, difficultySettings } from '$lib/stores/difficulty';
  import { events } from '$lib/stores/events';
  import { relayPool } from '$lib/stores/relay-pool';
  import { miningQueue } from '$lib/services/mining-queue';
  import MiningQueue from '$lib/components/MiningQueue.svelte';
  import KeybindManager from '$lib/components/KeybindManager.svelte';
  import Feed from '$lib/components/Feed.svelte';
  import Radio from '$lib/components/Radio.svelte';
  import LiveStream from '$lib/components/LiveStream.svelte';
  import RelayManager from '$lib/components/RelayManager.svelte';
  import SoundSettings from '$lib/components/SoundSettings.svelte';
  import EphemeralChat from '$lib/components/EphemeralChat.svelte';
  import ZapPane from '$lib/components/ZapPane.svelte';
  import UserProfile from '$lib/components/UserProfile.svelte';
  import { draftManager } from '../services/draft-manager';
  import { statePersistence } from '../services/state-persistence';
  import { keyManager } from '$lib/services/keys';
  import { onMount, onDestroy } from 'svelte';
  import { decaySettings } from '$lib/services/decay-engine';
  import { AnimationService } from '../services/animation';
  import QRCode from 'qrcode';
  
  export let window: HyprlandWindow;
  export let rect: Rectangle | undefined;
  
  // Alias window prop to avoid conflicts with global window
  const win = window;
  
  let noteContent = '';
  let isEditingTitle = false;
  let editedTitle = win.title;
  let textareaElement: HTMLTextAreaElement;
  let nostrConnectUrl = '';
  let showNostrConnectDialog = false;
  let showNip07Error = false;
  let nip07ErrorMessage = '';
  let showNsec = false;
  let nostrConnectQR = '';
  let generatedNostrConnectUrl = '';
  
  // Drag state for floating windows
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let windowStartX = 0;
  let windowStartY = 0;
  
  // Update edited title when window title changes
  $: editedTitle = window.title;
  
  // Auto-focus textarea when compose window becomes focused
  $: if (window.focused && window.class === 'compose' && textareaElement && hasKeys) {
    setTimeout(() => {
      textareaElement.focus();
    }, 50); // Small delay to ensure DOM is ready
  }
  
  // Compose window state tracking
  let composeState = 'idle'; // idle, pending, success, failed
  let composeStats = { success: 0, failed: 0 };
  let composeStateTimeout: number;
  
  const queueStore = miningQueue.queue;
  const activeJobStore = miningQueue.activeJob;
  const queuedJobsStore = miningQueue.queuedJobs;
  const completedJobsStore = miningQueue.completedJobs;
  
  // Mining progress stores from pow client
  let miningProgress = new Map();
  let totalHashRate = 0;
  let miningResults = [];
  
  // Get pow client instance
  let pow: any = null;
  $: if (browser) {
    try {
      pow = getPowClient();
    } catch (err) {
      console.error('Failed to get pow client:', err);
    }
  }
  
  // Subscribe to real data from pow client
  $: if (pow) {
    // Subscribe to mining progress
    if (pow.miningProgress) {
      pow.miningProgress.subscribe(progress => {
        miningProgress = progress;
        // Calculate total hash rate
        totalHashRate = 0;
        for (const jobProgress of progress.values()) {
          for (const workerProgress of jobProgress) {
            totalHashRate += workerProgress.hashRate || 0;
          }
        }
      });
    }
    
    // Subscribe to mining results
    if (pow.miningResults) {
      pow.miningResults.subscribe(results => {
        miningResults = results;
      });
    }
    
  }
  
  // Calculate hasKeys reactively
  let hasKeys = false;
  $: hasKeys = keyManager.getPublicKey() !== null;
  
  // Helper function to format hash rates in readable units
  function formatHashRate(khps: number): string {
    if (khps >= 1000000) {
      return `${(khps / 1000000).toFixed(1)} GH/s`;
    } else if (khps >= 1000) {
      return `${(khps / 1000).toFixed(1)} MH/s`;
    } else {
      return `${khps.toFixed(1)} kH/s`;
    }
  }
  
  // Track current signing method
  let currentSigningMethod = 'private-key';
  keyManager.signingMethod.subscribe(method => {
    currentSigningMethod = method;
  });
  
  // Load saved content on mount
  onMount(() => {
    if (window.class === 'compose') {
      // Try to load from new persistence first
      const savedContent = statePersistence.loadDraft(window.id);
      if (savedContent) {
        noteContent = savedContent;
        console.log('Loaded draft from persistence for', window.title);
      } else {
        // Fall back to old draft manager
        const savedDraft = draftManager.getDraftForWindow(window.id);
        if (savedDraft) {
          noteContent = savedDraft.content;
          console.log('Loaded draft from legacy for', window.title);
        }
      }
      
      // Listen for global submit-note event
      const handleGlobalSubmit = (event: CustomEvent) => {
        if (event.detail.windowId === window.id) {
          handleSubmit();
        }
      };
      
      globalThis.addEventListener('submit-note', handleGlobalSubmit as EventListener);
      
      return () => {
        globalThis.removeEventListener('submit-note', handleGlobalSubmit as EventListener);
      };
    }
    
    // Restore other window content
    const savedContent = windowManager.getWindowContent(window.id);
    if (savedContent && savedContent.content && window.class === 'compose') {
      noteContent = savedContent.content;
    }
  });
  
  // Clean up auto-save on destroy
  onDestroy(() => {
    if (window.class === 'compose') {
      draftManager.clearAutoSave(window.id);
    }
    // Clear any pending save timer
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
    }
  });
  
  // Debounce timer for auto-save
  let saveDebounceTimer: number | null = null;
  
  // Auto-save draft when content changes (debounced)
  function debouncedSave() {
    // Clear existing timer
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
    }
    
    // Capture window prop to avoid ambiguity in setTimeout callback
    const windowId = win.id;
    const windowTitle = win.title;
    
    // Set new timer for saving
    saveDebounceTimer = setTimeout(() => {
      if (noteContent && noteContent.trim()) {
        // Use the already debounced autoSave method
        draftManager.autoSave(windowId, noteContent, windowTitle);
        // These can be called less frequently since they're the source of lag
        statePersistence.saveDraft(windowId, noteContent);
        windowManager.updateWindowContent(windowId, { 
          content: noteContent,
          scrollPosition: 0 
        });
      }
      saveDebounceTimer = null;
    }, 500); // 500ms debounce for immediate persistence, draftManager has its own 2s debounce
  }
  
  // Call debounced save when content changes
  $: if (window.class === 'compose' && noteContent !== undefined && noteContent !== '') {
    debouncedSave();
  }
  
  // Settings variables - loaded from persistence and auto-saved
  let gapsIn = statePersistence.getSetting('gapsIn', 5);
  let gapsOut = statePersistence.getSetting('gapsOut', 10);
  let borderSize = statePersistence.getSetting('borderSize', 2);
  let layout = statePersistence.getSetting('layout', 'dwindle');
  let rounding = statePersistence.getSetting('rounding', 0);
  let blur = statePersistence.getSetting('blur', false);
  let dropShadow = statePersistence.getSetting('dropShadow', true);
  let shadowRange = statePersistence.getSetting('shadowRange', 10);
  let animationsEnabled = statePersistence.getSetting('animationsEnabled', true);
  let windowDuration = statePersistence.getSetting('windowDuration', 300);
  let fadeDuration = statePersistence.getSetting('fadeDuration', 200);
  let animationCurve = statePersistence.getSetting('animationCurve', 'default');
  let followMouse = statePersistence.getSetting('followMouse', 1);
  let mouseRefocus = statePersistence.getSetting('mouseRefocus', false);
  let fullscreenBg = statePersistence.getSetting('fullscreenBg', '#000000');
  
  // Notemine-specific settings
  let minimumDiff = statePersistence.getSetting('minimumDiff', 16);
  let targetDiff = $globalDifficulty; // Start with current global difficulty
  let decayRate = statePersistence.getSetting('decayRate', 0.02); // 2% per hour default
  
  // UI settings
  let showTimestamps = true;
  let showPowValues = true;
  let fadeOldNotes = true;
  let compactMode = false;
  
  // Mining settings  
  let miningThreads = statePersistence.getSetting('miningThreads', Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
  let autoMine = statePersistence.getSetting('autoMine', true);
  let batchSize = statePersistence.getSetting('batchSize', 10);
  let maxQueueSize = statePersistence.getSetting('maxQueueSize', 100);
  
  // Relay settings
  let maxRelays = 10;
  let connectionTimeout = 5000;
  let enableDiscovery = true;
  let preferredRelays = ['ws://localhost:7777'];
  let blacklistedRelays = [];
  
  // Per-event-type difficulty settings (reactive from store)
  $: currentSettings = $difficultySettings;
  $: globalDiff = currentSettings.globalDifficulty;
  $: kindModifiers = currentSettings.kindModifiers;
  
  $: isConnected = hasKeys && ($relayPool.connected > 0 || $relayPool.relays.includes('ws://localhost:7777'));
  
  // Auto-save settings when they change (no Apply button needed)
  $: statePersistence.updateSetting('gapsIn', gapsIn);
  $: statePersistence.updateSetting('gapsOut', gapsOut);
  $: statePersistence.updateSetting('borderSize', borderSize);
  $: statePersistence.updateSetting('layout', layout);
  $: {
    statePersistence.updateSetting('rounding', rounding);
    windowManager.updateVisualSettings({ rounding });
  }
  $: {
    statePersistence.updateSetting('blur', blur);
    windowManager.updateVisualSettings({ blur });
  }
  $: {
    statePersistence.updateSetting('dropShadow', dropShadow);
    windowManager.updateVisualSettings({ dropShadow });
  }
  $: {
    statePersistence.updateSetting('shadowRange', shadowRange);
    windowManager.updateVisualSettings({ shadowRange });
  }
  $: {
    statePersistence.updateSetting('animationsEnabled', animationsEnabled);
    windowManager.updateVisualSettings({ animationsEnabled });
  }
  $: {
    statePersistence.updateSetting('windowDuration', windowDuration);
    windowManager.updateVisualSettings({ windowDuration });
  }
  $: {
    statePersistence.updateSetting('fadeDuration', fadeDuration);
    windowManager.updateVisualSettings({ fadeDuration });
  }
  $: {
    statePersistence.updateSetting('animationCurve', animationCurve);
    windowManager.updateVisualSettings({ animationCurve });
  }
  $: statePersistence.updateSetting('followMouse', followMouse);
  $: statePersistence.updateSetting('mouseRefocus', mouseRefocus);
  $: statePersistence.updateSetting('fullscreenBg', fullscreenBg);
  $: statePersistence.updateSetting('minimumDiff', minimumDiff);
  $: statePersistence.updateSetting('targetDiff', targetDiff);
  $: statePersistence.updateSetting('decayRate', decayRate);
  
  // Wire decay rate to decay engine
  $: if (decayRate !== undefined) {
    decaySettings.update(s => ({ ...s, decayRate }));
  }
  $: statePersistence.updateSetting('miningThreads', miningThreads);
  $: statePersistence.updateSetting('autoMine', autoMine);
  $: statePersistence.updateSetting('batchSize', batchSize);
  $: statePersistence.updateSetting('maxQueueSize', maxQueueSize);
  
  // Apply settings to difficulty store and window manager
  $: if (targetDiff && targetDiff !== $globalDifficulty) {
    difficultySettings.update(settings => ({
      ...settings,
      globalDifficulty: targetDiff
    }));
  }
  $: if (gapsIn || gapsOut || borderSize || layout) {
    windowManager.updateConfig({
      general: {
        gaps_in: gapsIn,
        gaps_out: gapsOut,
        border_size: borderSize,
        layout
      }
    });
  }
  
  async function handleSubmit() {
    console.log('handleSubmit called with:', {
      noteContent: noteContent.trim(),
      hasKeys,
      isConnected,
      pow: !!pow
    });
    if (!noteContent.trim() || !isConnected) {
      console.log('Submit blocked - content or connection missing');
      return;
    }
    
    const content = noteContent.trim();
    noteContent = '';
    
    // Set pending state
    composeState = 'pending';
    
    // Clear any existing timeout
    if (composeStateTimeout) {
      clearTimeout(composeStateTimeout);
    }
    
    try {
      console.log('Attempting to submit note:', content);
      console.log('pow client available:', !!pow);
      console.log('hasKeys:', hasKeys);
      console.log('isConnected:', isConnected);
      
      if (!pow) {
        throw new Error('PoW client not available');
      }
      
      const jobId = await pow.createNote(content);
      console.log('Note submitted for mining with job ID:', jobId);
      
      // Set success state
      composeState = 'success';
      composeStats.success++;
      
      // Clear the draft since note was successfully submitted
      draftManager.deleteDraftForWindow(window.id);
      
      // Open mining stats window to show progress
      windowManager.createWindow('mining-overview');
      
      // Reset to idle after 2 seconds
      composeStateTimeout = setTimeout(() => {
        composeState = 'idle';
      }, 2000);
      
    } catch (error) {
      console.error('Failed to submit note:', error);
      
      // Set failed state
      composeState = 'failed';
      composeStats.failed++;
      
      // Restore content on error
      noteContent = content;
      
      // Reset to idle after 3 seconds
      composeStateTimeout = setTimeout(() => {
        composeState = 'idle';
      }, 3000);
    }
  }
  
  // Manual save draft function
  function saveDraft() {
    if (noteContent.trim()) {
      // Clear any pending auto-save since we're saving manually
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
      }
      
      // Save immediately
      draftManager.saveDraft(window.id, noteContent, window.title);
      statePersistence.saveDraft(window.id, noteContent);
      windowManager.updateWindowContent(window.id, { 
        content: noteContent,
        scrollPosition: 0 
      });
      console.log('Draft saved manually');
    }
  }
  
  function handleClick() {
    windowManager.focusWindow(window.id);
  }
  
  function startEditingTitle() {
    isEditingTitle = true;
    editedTitle = window.title;
  }
  
  function saveTitle() {
    if (editedTitle.trim()) {
      windowManager.renameWindow(window.id, editedTitle.trim());
    }
    isEditingTitle = false;
  }
  
  function cancelEditingTitle() {
    editedTitle = window.title;
    isEditingTitle = false;
  }
  
  function handleTitleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      saveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelEditingTitle();
    }
    // Let all other keys bubble up to global handler
  }
  
  function applySettings() {
    windowManager.updateConfig({
      general: {
        gaps_in: gapsIn,
        gaps_out: gapsOut,
        border_size: borderSize,
        layout
      },
      decoration: {
        rounding,
        blur,
        drop_shadow: dropShadow,
        shadow_range: shadowRange,
        fullscreen_bg: fullscreenBg
      },
      animations: {
        enabled: animationsEnabled,
        animation: {
          windows: { duration: windowDuration },
          fade: { duration: fadeDuration }
        }
      },
      input: {
        follow_mouse: followMouse,
        mouse_refocus: mouseRefocus
      }
    });
    
    // Update difficulty store
    difficultySettings.update(settings => ({
      ...settings,
      globalDifficulty: targetDiff
    }));
    
    console.log('Settings applied - Target difficulty set to:', targetDiff);
  }
  
  function resetSettings() {
    // Hyprland settings
    gapsIn = 5;
    gapsOut = 10;
    borderSize = 2;
    layout = 'dwindle';
    rounding = 0;
    blur = false;
    dropShadow = true;
    shadowRange = 10;
    animationsEnabled = true;
    windowDuration = 300;
    fadeDuration = 200;
    followMouse = 1;
    mouseRefocus = false;
    fullscreenBg = '#000000';
    
    // Notemine settings
    minimumDiff = 16;
    targetDiff = 21;
    decayRate = 0.001;
    
    // UI settings
    showTimestamps = true;
    showPowValues = true;
    fadeOldNotes = true;
    compactMode = false;
    
    // Mining settings
    miningThreads = Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2));
    autoMine = true;
    batchSize = 10;
    maxQueueSize = 100;
    
    // Relay settings
    maxRelays = 10;
    connectionTimeout = 5000;
    enableDiscovery = true;
    
    // Reset difficulty settings to defaults
    difficultySettings.reset();
    
    // Reset sound settings to defaults
    import('$lib/services/sound').then(({ soundService }) => {
      if (soundService) {
        soundService.updateSettings({
          enabled: false,
          volume: 0.3,
          windowActions: true,
          miningActions: true,
          networkActions: true,
          radioActions: true,
          notificationActions: true
        });
      }
    });
    
    // Apply visual settings to all windows
    windowManager.updateVisualSettings({
      rounding: 0,
      blur: false,
      dropShadow: true,
      shadowRange: 10,
      animationsEnabled: true,
      windowDuration: 300,
      fadeDuration: 200
    });
    
    applySettings();
  }
</script>

{#if rect}
  <div 
    class="absolute overflow-hidden
           {window.focused ? 'border-2 border-green-400' : 'border border-green-900'}
           {window.fullscreen ? 'fixed inset-0 z-40' : ''}
           {window.type === 'floating' ? 'z-30 bg-black' : 'z-10'}
           {isDragging ? 'select-none' : ''}"
    style="
      {window.fullscreen ? `background-color: ${fullscreenBg};` : `
        left: ${rect.x}px;
        top: ${rect.y}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
      `}
      {window.type === 'floating' && !window.fullscreen ? 'background-color: #000000;' : ''}
      border-radius: {window.rounding}px;
      border-width: {borderSize}px;
      {window.shadow ? `box-shadow: 0 0 ${window.shadowRange || shadowRange}px rgba(0, 0, 0, 0.8), 0 4px 6px -1px rgba(0, 0, 0, 0.5);` : ''}
      {window.type === 'floating' ? 'box-shadow: 0 10px 25px rgba(0, 0, 0, 0.9), 0 6px 10px rgba(0, 0, 0, 0.7);' : ''}
      {window.blur ? 'backdrop-filter: blur(8px);' : ''}
      transition-duration: {window.animationsEnabled !== undefined ? (window.animationsEnabled ? `${window.windowDuration || windowDuration}ms` : '0ms') : (animationsEnabled ? `${windowDuration}ms` : '0ms')};
      transition-timing-function: {AnimationService.getBezierValue(window.animationCurve || 'default')};
    "
    onclick={handleClick}
  >
    <!-- Window header -->
    <div 
      class="flex items-center justify-between px-2 py-1 bg-green-900/20 text-green-400 text-xs
                {window.focused ? 'bg-green-800/30' : ''}
                {window.type === 'floating' ? 'cursor-move' : ''}"
      onmousedown={(e) => {
        // Only drag if clicking on the header bar itself, not buttons or inputs
        const target = e.target as HTMLElement;
        const isButton = target.tagName === 'BUTTON' || target.closest('button');
        const isInput = target.tagName === 'INPUT';
        
        if (window.type === 'floating' && !isEditingTitle && e.button === 0 && !isButton && !isInput) {
          console.log('Starting drag for floating window', window.id);
          e.preventDefault();
          e.stopPropagation();
          isDragging = true;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          windowStartX = rect.x;
          windowStartY = rect.y;
          
          const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!isDragging) return;
            
            const deltaX = moveEvent.clientX - dragStartX;
            const deltaY = moveEvent.clientY - dragStartY;
            
            const newX = windowStartX + deltaX;
            const newY = windowStartY + deltaY;
            
            console.log('Dragging to:', newX, newY);
            
            windowManager.setFloatingPosition(window.id, {
              x: newX,
              y: newY,
              width: rect.width,
              height: rect.height
            });
          };
          
          const handleMouseUp = () => {
            console.log('Ending drag');
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          };
          
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }
      }}
    >
      {#if isEditingTitle}
        <input
          type="text"
          bind:value={editedTitle}
          onkeydown={handleTitleKeydown}
          onblur={saveTitle}
          class="bg-transparent border-b border-green-600 outline-none flex-1 mr-2"
          autofocus
        />
      {:else}
        <span 
          ondblclick={startEditingTitle}
          class="cursor-text hover:text-green-300 flex-1"
          title="Double-click to edit"
        >
          [{window.title}]{window.type === 'floating' ? ' [FLOATING]' : ''}
        </span>
      {/if}
      <div class="flex items-center gap-1">
        <button 
          onclick={(e) => { e.stopPropagation(); windowManager.toggleFloating(window.id); }}
          class="hover:text-green-300 {window.type === 'floating' ? 'text-green-300' : 'text-green-600'}"
          title="{window.type === 'floating' ? 'Tile window' : 'Pop out window'}"
        >
          {window.type === 'floating' ? '⊟' : '⊞'}
        </button>
        <button 
          onclick={(e) => { e.stopPropagation(); windowManager.closeWindow(window.id); }}
          class="hover:text-red-400"
        >
          ✕
        </button>
      </div>
    </div>
    
    <!-- Window content -->
    <div class="h-full p-2 pr-4 pb-6 overflow-auto text-green-400 {window.type === 'floating' ? 'bg-black' : ''}">
      {#if window.class === 'compose'}
        {#if !hasKeys}
          <div class="flex flex-col items-center justify-center h-full space-y-4">
            <p class="text-2xl animate-pulse">🔑 KEYS_LOADING</p>
            <p class="text-sm">Generating ephemeral session keys...</p>
            <p class="text-xs text-green-600">Press ⌃I for signer options</p>
          </div>
        {:else}
          <div class="h-full flex flex-col">
            <textarea
              bind:this={textareaElement}
              bind:value={noteContent}
              onkeydown={(e) => {
                // Only handle specific keys we want to override
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmit();
                  return;
                } 
                if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.stopPropagation();
                  saveDraft();
                  return;
                }
                // Let all other keys bubble up to global handler
              }}
              placeholder={isConnected ? "COMPOSE_NOTE..." : "CONNECTING..."}
              disabled={!hasKeys}
              class="flex-1 w-full bg-transparent outline-none resize-none 
                     placeholder-green-600 focus:placeholder-green-400 text-sm mb-2"
            />
            <div class="flex justify-between text-xs border-t border-green-800 pt-1 mt-1 bg-black">
              <span class="text-green-600">⌘Enter: SUBMIT | ⌘S: SAVE_DRAFT</span>
              <div class="flex gap-2 items-center">
                {#if composeState === 'pending'}
                  <span class="text-yellow-400 animate-pulse">PENDING...</span>
                {:else if composeState === 'success'}
                  <span class="text-green-400">SUCCESS!</span>
                {:else if composeState === 'failed'}
                  <span class="text-red-400">FAILED!</span>
                {:else}
                  <button 
                    onclick={handleSubmit}
                    disabled={!noteContent.trim() || !isConnected}
                    class="px-2 py-0.5 bg-green-900/20 border border-green-800 text-green-400 
                           hover:bg-green-800/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    SUBMIT
                  </button>
                {/if}
                
                {#if composeStats.success > 0 || composeStats.failed > 0}
                  <span class="text-green-600">S:{composeStats.success} F:{composeStats.failed}</span>
                {/if}
              </div>
            </div>
          </div>
        {/if}
        
      {:else if window.class === 'feed'}
        <Feed windowId={window.id} />
        
      {:else if window.class === 'mining'}
        <MiningQueue jobs={$queueStore} />
        
      {:else if window.class === 'mining-overview'}
        <div class="text-xs space-y-3 h-full overflow-auto">
          <h3 class="text-sm mb-2 text-green-300">MINING_OVERVIEW</h3>
          
          <!-- Current Statistics -->
          <div class="space-y-2">
            <h4 class="text-green-400 font-bold">CURRENT STATS</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <div class="flex justify-between">
                <span class="text-green-600">Total Hashrate:</span>
                <span class="text-green-400">{formatHashRate(totalHashRate)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-green-600">Queue Length:</span>
                <span class="text-green-400">{$queueStore.length}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-green-600">Active Jobs:</span>
                <span class="text-green-400">{$queueStore.filter(j => j.status === 'mining').length}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-green-600">Queued Jobs:</span>
                <span class="text-green-400">{$queuedJobsStore.length}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-green-600">Completed:</span>
                <span class="text-green-400">{miningResults.length}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-green-600">Workers:</span>
                <span class="text-green-400">{$activeJobStore && miningProgress.get($activeJobStore.id) ? miningProgress.get($activeJobStore.id).length : miningThreads}</span>
              </div>
            </div>
          </div>
          
          <!-- Mining Animation -->
          {#if $activeJobStore && totalHashRate > 0}
            <div class="space-y-2">
              <h4 class="text-green-400 font-bold">MINING_STATUS</h4>
              <div class="pl-2">
                <!-- Retro Mining Animation -->
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-green-400 font-mono animate-bounce">⛏️</span>
                  <div class="flex-1 bg-green-900/20 border border-green-800 rounded px-2 py-1">
                    <div class="flex items-center justify-between">
                      <span class="text-green-400 mining-glow font-bold">MINING...</span>
                      <span class="text-green-600 font-mono">{formatHashRate(totalHashRate)}</span>
                    </div>
                  </div>
                  <span class="text-green-400 font-mono animate-spin">⚙️</span>
                  <span class="text-yellow-400 font-mono animate-pulse">💎</span>
                </div>
                
                <!-- Hash Animation Bar -->
                <div class="space-y-1">
                  <div class="text-green-600 text-xs">Hash Generation:</div>
                  <div class="bg-black border border-green-800 p-1 font-mono text-xs overflow-hidden">
                    <div class="flex animate-pulse">
                      <span class="text-green-400">0x</span>
                      <span class="text-green-300 animate-bounce" style="animation-delay: 0ms">0</span>
                      <span class="text-green-300 animate-bounce" style="animation-delay: 100ms">0</span>
                      <span class="text-green-300 animate-bounce" style="animation-delay: 200ms">0</span>
                      <span class="text-green-300 animate-bounce" style="animation-delay: 300ms">a</span>
                      <span class="text-green-300 animate-bounce" style="animation-delay: 400ms">b</span>
                      <span class="text-green-300 animate-bounce" style="animation-delay: 500ms">c</span>
                      <span class="text-green-400">...</span>
                    </div>
                  </div>
                </div>
                
                <!-- Worker Activity Visualization -->
                <div class="space-y-1">
                  <div class="text-green-600 text-xs">Worker Activity:</div>
                  <div class="flex gap-1 flex-wrap">
                    {#each Array(Math.min(16, miningThreads)) as _, i}
                      <div class="w-3 h-3 border border-green-800 bg-green-400 animate-pulse rounded-sm" 
                           style="animation-delay: {i * 50}ms; animation-duration: {800 + Math.random() * 400}ms"></div>
                    {/each}
                  </div>
                </div>
                
                <!-- PoW Target Visualization -->
                <div class="space-y-1">
                  <div class="text-green-600 text-xs">Target PoW: {$activeJobStore.difficulty} bits</div>
                  <div class="bg-black border border-green-800 p-1 font-mono text-xs">
                    <div class="flex items-center">
                      <!-- Show binary representation -->
                      <span class="text-green-400">
                        {#each Array(Math.min($activeJobStore.difficulty, 32)) as _, i}
                          <span class="animate-pulse" style="animation-delay: {i * 30}ms">0</span>
                        {/each}
                        {#if $activeJobStore.difficulty < 32}
                          <span class="text-green-600">{'1'.padEnd(32 - $activeJobStore.difficulty, 'x').slice(0, 8)}...</span>
                        {/if}
                      </span>
                      <span class="text-green-400 ml-2 animate-bounce text-xs">← {$activeJobStore.difficulty} leading zero bits</span>
                    </div>
                    <!-- Show hex representation -->
                    <div class="text-green-600 mt-1">
                      Hex: {Array(Math.floor($activeJobStore.difficulty / 4)).fill('0').join('')}{$activeJobStore.difficulty % 4 > 0 ? '≤' + (Math.pow(2, 4 - ($activeJobStore.difficulty % 4)) - 1).toString(16) : ''}...
                    </div>
                  </div>
                </div>
                
                <!-- Retro Mining Graphics -->
                <div class="text-center py-2">
                  <div class="text-green-400 font-mono">
                    <div class="animate-pulse">    ⚡ NOTEMINE ⚡</div>
                    <div class="text-xs text-green-600 animate-bounce">     ◇◇◇◇◇◇◇</div>
                    <div class="text-xs text-green-600 animate-pulse">    PROOF OF WORK</div>
                  </div>
                </div>
              </div>
            </div>
          {:else if $queueStore.length > 0}
            <div class="space-y-2">
              <h4 class="text-green-400 font-bold">MINING_STATUS</h4>
              <div class="pl-2">
                <div class="flex items-center gap-2">
                  <span class="text-yellow-400 animate-pulse">⏳</span>
                  <span class="text-yellow-400">QUEUED - Waiting to start mining...</span>
                </div>
              </div>
            </div>
          {:else}
            <div class="space-y-2">
              <h4 class="text-green-400 font-bold">MINING_STATUS</h4>
              <div class="pl-2">
                <div class="flex items-center gap-2">
                  <span class="text-green-600">💤</span>
                  <span class="text-green-600">IDLE - No active mining jobs</span>
                </div>
              </div>
            </div>
          {/if}
          
          <!-- Active Job Details -->
          {#if $activeJobStore}
            <div class="space-y-2">
              <h4 class="text-green-400 font-bold">ACTIVE JOB</h4>
              <div class="pl-2 space-y-1">
                <div class="flex justify-between">
                  <span class="text-green-600">Content:</span>
                  <span class="text-green-400 truncate max-w-32">"{$activeJobStore.content}"</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-600">Difficulty:</span>
                  <span class="text-green-400">{$activeJobStore.difficulty} bits</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-600">Best PoW:</span>
                  <span class="text-green-400">{$activeJobStore.bestPow || 0} bits</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-600">Runtime:</span>
                  <span class="text-green-400">
                    {$activeJobStore.startedAt ? Math.floor((Date.now() - $activeJobStore.startedAt) / 1000) : 0}s
                  </span>
                </div>
              </div>
            </div>
          {/if}
          
          <!-- Worker Progress -->
          {#if $activeJobStore && miningProgress.has($activeJobStore.id)}
            <div class="space-y-2">
              <h4 class="text-green-400 font-bold">WORKER_PROGRESS</h4>
              <div class="pl-2 space-y-1">
                {#each miningProgress.get($activeJobStore.id) || [] as worker, i}
                  {#if worker}
                    <div class="flex justify-between text-xs">
                      <span class="text-green-600">Worker {worker.workerId}:</span>
                      <span class="text-green-400">{formatHashRate(worker.hashRate)}</span>
                      <span class="text-green-500">Best: {worker.bestPow} bits</span>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
          
          <!-- Completed Jobs -->
          {#if miningResults.length > 0}
            <div class="space-y-2">
              <h4 class="text-green-400 font-bold">COMPLETED_JOBS</h4>
              <div class="pl-2 space-y-1">
                {#each miningResults.slice(-5) as result}
                  <div class="flex justify-between text-xs">
                    <span class="text-green-600 truncate max-w-20">"{result.event.content.slice(0, 20)}..."</span>
                    <span class="text-green-400">{formatHashRate(result.khs)}</span>
                    <span class="text-green-500">{result.total_time.toFixed(1)}s</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          
          <!-- Queue Summary -->
          <div class="space-y-2">
            <h4 class="text-green-400 font-bold">QUEUE_SUMMARY</h4>
            <div class="pl-2 space-y-1">
              {#each $queueStore.slice(0, 5) as job}
                <div class="flex justify-between text-xs">
                  <span class="text-green-600 truncate max-w-24">"{job.content}"</span>
                  <span class="text-green-400">{job.difficulty} bits</span>
                  <span class="text-green-500 uppercase">{job.status}</span>
                </div>
              {/each}
              {#if $queueStore.length > 5}
                <div class="text-green-600 text-center">...and {$queueStore.length - 5} more</div>
              {/if}
            </div>
          </div>
          
          <!-- Controls -->
          <div class="space-y-2">
            <h4 class="text-green-400 font-bold">CONTROLS</h4>
            <div class="flex flex-wrap gap-1">
              {#if $activeJobStore}
                <button 
                  onclick={() => {
                    if (pow) {
                      pow.pauseMining($activeJobStore.id);
                      console.log('Paused mining for job:', $activeJobStore.id);
                    }
                  }}
                  class="px-2 py-1 bg-yellow-900/20 border border-yellow-800 text-yellow-400 hover:bg-yellow-800/30 text-xs"
                >
                  PAUSE
                </button>
                <button 
                  onclick={() => {
                    if (pow) {
                      pow.cancelMining($activeJobStore.id);
                      console.log('Cancelled mining for job:', $activeJobStore.id);
                    }
                  }}
                  class="px-2 py-1 bg-red-900/20 border border-red-800 text-red-400 hover:bg-red-800/30 text-xs"
                >
                  CANCEL
                </button>
                <button 
                  onclick={() => {
                    if (pow && $activeJobStore.status === 'paused') {
                      pow.resumeMining($activeJobStore.id);
                      console.log('Resumed mining for job:', $activeJobStore.id);
                    }
                  }}
                  disabled={$activeJobStore.status !== 'paused'}
                  class="px-2 py-1 bg-green-900/20 border border-green-800 text-green-400 hover:bg-green-800/30 disabled:opacity-50 text-xs"
                >
                  RESUME
                </button>
              {/if}
              <button 
                onclick={() => {
                  miningQueue.clearCompleted();
                  console.log('Cleared completed jobs');
                }}
                class="px-2 py-1 bg-blue-900/20 border border-blue-800 text-blue-400 hover:bg-blue-800/30 text-xs"
              >
                CLEAR_COMPLETED
              </button>
              <button 
                onclick={() => {
                  if (pow) {
                    pow.cancelAllMining();
                    console.log('Cancelled all mining');
                  }
                }}
                class="px-2 py-1 bg-red-900/20 border border-red-800 text-red-400 hover:bg-red-800/30 text-xs"
              >
                CANCEL_ALL
              </button>
            </div>
          </div>
        </div>
        
      {:else if window.class === 'relays'}
        <RelayManager windowId={window.id} />
        
      {:else if window.class === 'settings'}
        <div class="text-xs space-y-4 h-full overflow-auto">
          <h3 class="text-sm mb-2 text-green-300">HYPRLAND_CONFIG</h3>
          
          <!-- General Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">GENERAL</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <label class="text-green-600">gaps_in:</label>
              <input type="number" bind:value={gapsIn} class="bg-transparent border border-green-800 px-1 text-green-400" min="0" max="50">
              
              <label class="text-green-600">gaps_out:</label>
              <input type="number" bind:value={gapsOut} class="bg-transparent border border-green-800 px-1 text-green-400" min="0" max="50">
              
              <label class="text-green-600">border_size:</label>
              <input type="number" bind:value={borderSize} class="bg-transparent border border-green-800 px-1 text-green-400" min="0" max="10">
              
              <label class="text-green-600">layout:</label>
              <select bind:value={layout} class="bg-black border border-green-800 text-green-400">
                <option value="dwindle">dwindle</option>
                <option value="master">master</option>
              </select>
            </div>
          </div>
          
          <!-- Decoration Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">DECORATION</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <label class="text-green-600">rounding:</label>
              <input type="number" bind:value={rounding} class="bg-transparent border border-green-800 px-1 text-green-400" min="0" max="20">
              
              <label class="text-green-600">blur:</label>
              <input type="checkbox" bind:checked={blur} class="accent-green-600">
              
              <label class="text-green-600">drop_shadow:</label>
              <input type="checkbox" bind:checked={dropShadow} class="accent-green-600">
              
              <label class="text-green-600">shadow_range:</label>
              <input type="number" bind:value={shadowRange} class="bg-transparent border border-green-800 px-1 text-green-400" min="0" max="50">
              
              <label class="text-green-600">fullscreen_bg:</label>
              <input type="color" bind:value={fullscreenBg} class="bg-transparent border border-green-800 h-6 w-16">
            </div>
          </div>
          
          <!-- Animation Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">ANIMATIONS</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <label class="text-green-600">enabled:</label>
              <input type="checkbox" bind:checked={animationsEnabled} class="accent-green-600">
              
              <label class="text-green-600">window_duration:</label>
              <input type="number" bind:value={windowDuration} class="bg-transparent border border-green-800 px-1 text-green-400" min="0" max="1000">
              
              <label class="text-green-600">fade_duration:</label>
              <input type="number" bind:value={fadeDuration} class="bg-transparent border border-green-800 px-1 text-green-400" min="0" max="1000">
              
              <label class="text-green-600">animation_curve:</label>
              <select bind:value={animationCurve} class="bg-black border border-green-800 text-green-400">
                {#each AnimationService.getCurveNames() as curveName}
                  <option value={curveName}>{AnimationService.getBezierCurve(curveName).name}</option>
                {/each}
              </select>
            </div>
          </div>
          
          <!-- Input Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">INPUT</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <label class="text-green-600">follow_mouse:</label>
              <select bind:value={followMouse} class="bg-black border border-green-800 text-green-400">
                <option value={0}>disabled</option>
                <option value={1}>cursor_only</option>
                <option value={2}>full</option>
              </select>
              
              <label class="text-green-600">mouse_refocus:</label>
              <input type="checkbox" bind:checked={mouseRefocus} class="accent-green-600">
            </div>
          </div>
          
          <!-- Notemine Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">NOTEMINE</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <label class="text-green-600">minimum_diff:</label>
              <input type="number" bind:value={minimumDiff} class="bg-transparent border border-green-800 px-1 text-green-400" min="10">
              
              <label class="text-green-600">target_diff:</label>
              <input type="number" bind:value={targetDiff} class="bg-transparent border border-green-800 px-1 text-green-400" min="10">
              
              <label class="text-green-600">decay_rate:</label>
              <input type="number" bind:value={decayRate} step="0.001" class="bg-transparent border border-green-800 px-1 text-green-400" min="0" max="1">
            </div>
          </div>
          
          <!-- UI Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">UI</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <label class="text-green-600">show_timestamps:</label>
              <input type="checkbox" bind:checked={showTimestamps} class="accent-green-600">
              
              <label class="text-green-600">show_pow_values:</label>
              <input type="checkbox" bind:checked={showPowValues} class="accent-green-600">
              
              <label class="text-green-600">fade_old_notes:</label>
              <input type="checkbox" bind:checked={fadeOldNotes} class="accent-green-600">
              
              <label class="text-green-600">compact_mode:</label>
              <input type="checkbox" bind:checked={compactMode} class="accent-green-600">
            </div>
          </div>
          
          <!-- Mining Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">MINING</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <label class="text-green-600">mining_threads:</label>
              <input type="number" bind:value={miningThreads} 
                     class="bg-transparent border border-green-800 px-1 text-green-400" 
                     min="1" max={navigator.hardwareConcurrency || 4}
                     title="Available cores: {navigator.hardwareConcurrency || 4}, Default: {Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2))}">
              
              <span class="text-green-600 text-xs col-span-2">Available: {navigator.hardwareConcurrency || 4} cores (default: {Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2))} = half of available cores)</span>
              
              <label class="text-green-600">auto_mine:</label>
              <input type="checkbox" bind:checked={autoMine} class="accent-green-600">
              
              <label class="text-green-600">batch_size:</label>
              <input type="number" bind:value={batchSize} class="bg-transparent border border-green-800 px-1 text-green-400" min="1" max="100">
              
              <label class="text-green-600">max_queue_size:</label>
              <input type="number" bind:value={maxQueueSize} class="bg-transparent border border-green-800 px-1 text-green-400" min="10" max="1000">
            </div>
          </div>
          
          <!-- Relay Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">RELAYS</h4>
            <div class="grid grid-cols-2 gap-2 pl-2">
              <label class="text-green-600">max_relays:</label>
              <input type="number" bind:value={maxRelays} class="bg-transparent border border-green-800 px-1 text-green-400" min="1" max="50">
              
              <label class="text-green-600">connection_timeout:</label>
              <input type="number" bind:value={connectionTimeout} class="bg-transparent border border-green-800 px-1 text-green-400" min="1000" max="30000" step="1000">
              
              <label class="text-green-600">enable_discovery:</label>
              <input type="checkbox" bind:checked={enableDiscovery} class="accent-green-600">
            </div>
          </div>
          
          <!-- Mining Difficulty Settings -->
          <div class="space-y-2">
            <h4 class="text-green-400">MINING DIFFICULTY</h4>
            <div class="grid grid-cols-2 gap-1 pl-2 text-xs">
              <label class="text-green-600">global baseline:</label>
              <input type="number" bind:value={globalDiff} 
                     oninput={() => difficultySettings.update(s => ({...s, globalDifficulty: globalDiff}))}
                     class="bg-transparent border border-green-800 px-1 text-green-400" min="10" max="32">
              
              <label class="text-green-600">notes (kind 1):</label>
              <input type="number" value={globalDiff + (kindModifiers[1] || 0)}
                     oninput={(e) => difficultySettings.update(s => ({...s, kindModifiers: {...s.kindModifiers, 1: parseInt(e.target.value) - globalDiff}}))}
                     class="bg-transparent border border-green-800 px-1 text-green-400" min="8" max="32">
              
              <label class="text-green-600">reactions (kind 7):</label>
              <input type="number" value={globalDiff + (kindModifiers[7] || 0)}
                     oninput={(e) => difficultySettings.update(s => ({...s, kindModifiers: {...s.kindModifiers, 7: parseInt(e.target.value) - globalDiff}}))}
                     class="bg-transparent border border-green-800 px-1 text-green-400" min="8" max="32">
              
              <label class="text-green-600">profile (kind 0):</label>
              <input type="number" value={globalDiff + (kindModifiers[0] || 0)}
                     oninput={(e) => difficultySettings.update(s => ({...s, kindModifiers: {...s.kindModifiers, 0: parseInt(e.target.value) - globalDiff}}))}
                     class="bg-transparent border border-green-800 px-1 text-green-400" min="8" max="32">
              
              <label class="text-green-600">contacts (kind 3):</label>
              <input type="number" value={globalDiff + (kindModifiers[3] || 0)}
                     oninput={(e) => difficultySettings.update(s => ({...s, kindModifiers: {...s.kindModifiers, 3: parseInt(e.target.value) - globalDiff}}))}
                     class="bg-transparent border border-green-800 px-1 text-green-400" min="8" max="32">
              
              <label class="text-green-600">dm (kind 4):</label>
              <input type="number" value={globalDiff + (kindModifiers[4] || 0)}
                     oninput={(e) => difficultySettings.update(s => ({...s, kindModifiers: {...s.kindModifiers, 4: parseInt(e.target.value) - globalDiff}}))}
                     class="bg-transparent border border-green-800 px-1 text-green-400" min="8" max="32">
              
              <label class="text-green-600">zaps (kind 9735):</label>
              <input type="number" value={globalDiff + (kindModifiers[9735] || 0)}
                     oninput={(e) => difficultySettings.update(s => ({...s, kindModifiers: {...s.kindModifiers, 9735: parseInt(e.target.value) - globalDiff}}))}
                     class="bg-transparent border border-green-800 px-1 text-green-400" min="8" max="32">
            </div>
          </div>
          
          <!-- Sound Settings -->
          <SoundSettings />
          
          <div class="flex gap-2 pt-2 border-t border-green-800">
            <p class="text-green-600 text-xs">⚙️ Settings auto-save as you change them</p>
            <button 
              onclick={resetSettings}
              class="px-2 py-1 bg-red-900 text-red-400 border border-red-600 hover:bg-red-800"
            >
              RESET
            </button>
          </div>
        </div>
        
      {:else if window.class === 'shortcuts'}
        <div class="text-xs space-y-2 h-full overflow-auto">
          <h3 class="text-sm mb-2 text-green-300">NOTEMINE_SHORTCUTS</h3>
          
          <div class="space-y-3">
            <!-- Window Management -->
            <div>
              <h4 class="text-green-400 font-bold">WINDOW MANAGEMENT</h4>
              <div class="grid grid-cols-1 gap-1 pl-2">
                <div class="flex justify-between">
                  <span class="text-green-300">⌃Q</span>
                  <span class="text-green-500">Kill focused window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃Enter</span>
                  <span class="text-green-500">New compose window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃N</span>
                  <span class="text-green-500">New feed window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃M</span>
                  <span class="text-green-500">Open mining window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃O</span>
                  <span class="text-green-500">Open mining overview</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃R</span>
                  <span class="text-green-500">Open relays window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃S</span>
                  <span class="text-green-500">Open settings window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃I</span>
                  <span class="text-green-500">Open signer window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⇧P</span>
                  <span class="text-green-500">Open profile viewer</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃F</span>
                  <span class="text-green-500">Toggle fullscreen</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃Space</span>
                  <span class="text-green-500">Toggle floating mode</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃P</span>
                  <span class="text-green-500">Toggle pin window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃C</span>
                  <span class="text-green-500">Center floating window</span>
                </div>
              </div>
            </div>
            
            <!-- Focus Navigation -->
            <div>
              <h4 class="text-green-400 font-bold">FOCUS NAVIGATION</h4>
              <div class="grid grid-cols-1 gap-1 pl-2">
                <div class="flex justify-between">
                  <span class="text-green-300">⌃H/⌃←</span>
                  <span class="text-green-500">Focus window to the left</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃J/⌃↓</span>
                  <span class="text-green-500">Focus window below</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃K/⌃↑</span>
                  <span class="text-green-500">Focus window above</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃L/⌃→</span>
                  <span class="text-green-500">Focus window to the right</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃Tab</span>
                  <span class="text-green-500">Cycle to next window</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⇧Tab</span>
                  <span class="text-green-500">Cycle to previous window</span>
                </div>
              </div>
            </div>
            
            <!-- Window Movement -->
            <div>
              <h4 class="text-green-400 font-bold">WINDOW MOVEMENT</h4>
              <div class="grid grid-cols-1 gap-1 pl-2">
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⇧H/⌃⇧←</span>
                  <span class="text-green-500">Move window left (swap)</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⇧J/⌃⇧↓</span>
                  <span class="text-green-500">Move window down (swap)</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⇧K/⌃⇧↑</span>
                  <span class="text-green-500">Move window up (swap)</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⇧L/⌃⇧→</span>
                  <span class="text-green-500">Move window right (swap)</span>
                </div>
              </div>
            </div>
            
            <!-- Window Resizing -->
            <div>
              <h4 class="text-green-400 font-bold">WINDOW RESIZING</h4>
              <div class="grid grid-cols-1 gap-1 pl-2">
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⌥H/⌃⌥←</span>
                  <span class="text-green-500">Shrink width</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⌥J/⌃⌥↓</span>
                  <span class="text-green-500">Grow height</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⌥K/⌃⌥↑</span>
                  <span class="text-green-500">Shrink height</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⌥L/⌃⌥→</span>
                  <span class="text-green-500">Grow width</span>
                </div>
              </div>
            </div>
            
            <!-- Workspaces -->
            <div>
              <h4 class="text-green-400 font-bold">WORKSPACES</h4>
              <div class="grid grid-cols-1 gap-1 pl-2">
                <div class="flex justify-between">
                  <span class="text-green-300">⌃1-9</span>
                  <span class="text-green-500">Switch to workspace 1-9</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⇧1-9</span>
                  <span class="text-green-500">Move window to workspace 1-9</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⇧[ ]</span>
                  <span class="text-green-500">Move window to prev/next workspace</span>
                </div>
              </div>
            </div>
            
            <!-- System Actions -->
            <div>
              <h4 class="text-green-400 font-bold">SYSTEM ACTIONS</h4>
              <div class="grid grid-cols-1 gap-1 pl-2">
                <div class="flex justify-between">
                  <span class="text-green-300">⌃⌥⇧M</span>
                  <span class="text-green-500">Minimize all windows</span>
                </div>
              </div>
            </div>
            
            <!-- Special Functions -->
            <div>
              <h4 class="text-green-400 font-bold">SPECIAL FUNCTIONS</h4>
              <div class="grid grid-cols-1 gap-1 pl-2">
                <div class="flex justify-between">
                  <span class="text-green-300">⌃/</span>
                  <span class="text-green-500">Show this help</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="mt-4 pt-2 border-t border-green-800">
            <p class="text-green-600">⌃ = Ctrl/Cmd | ⇧ = Shift | ⌥ = Alt</p>
            <p class="text-green-600">Click window headers to focus manually</p>
          </div>
        </div>
        
      {:else if window.class === 'quickstart'}
        <div class="text-xs space-y-2 h-full overflow-auto">
          <h3 class="text-sm mb-2 text-green-300">NOTEMINE_QUICKSTART</h3>
          
          <div class="space-y-2">
            <p class="text-green-500">Welcome to Notemine's Hyprland-inspired interface!</p>
            
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <h4 class="text-green-400 font-bold">BASIC CONTROLS:</h4>
                <p><span class="text-green-600">⌃/</span> <span class="text-green-500">Full help window</span></p>
                <p><span class="text-green-600">⌃N</span> <span class="text-green-500">New compose window</span></p>
                <p><span class="text-green-600">⌃F</span> <span class="text-green-500">New feed window</span></p>
                <p><span class="text-green-600">⌃Q</span> <span class="text-green-500">Kill focused window</span></p>
                <p><span class="text-green-600">⌃Tab</span> <span class="text-green-500">Cycle windows</span></p>
              </div>
              <div class="space-y-1">
                <h4 class="text-green-400 font-bold">NAVIGATION:</h4>
                <p><span class="text-green-600">⌃HJKL</span> <span class="text-green-500">Focus windows</span></p>
                <p><span class="text-green-600">⌃⇧HJKL</span> <span class="text-green-500">Move windows</span></p>
                <p><span class="text-green-600">⌃⌥HJKL</span> <span class="text-green-500">Resize windows</span></p>
                <p><span class="text-green-600">⌃1-9</span> <span class="text-green-500">Switch workspaces</span></p>
                <p><span class="text-green-600">⌃⇧1-9</span> <span class="text-green-500">Move to workspace</span></p>
                <p><span class="text-green-600">⌃⇧[ ]</span> <span class="text-green-500">Move to prev/next workspace</span></p>
              </div>
            </div>
            
            <div class="space-y-1">
              <h4 class="text-green-400 font-bold">WINDOW ACTIONS:</h4>
              <p><span class="text-green-600">⌃F</span> Toggle fullscreen | <span class="text-green-600">⌃Space</span> Toggle floating | <span class="text-green-600">⌃P</span> Pin window</p>
              <p><span class="text-green-600">⌃M</span> Mining | <span class="text-green-600">⌃O</span> Overview | <span class="text-green-600">⌃R</span> Relays | <span class="text-green-600">⌃S</span> Settings | <span class="text-green-600">⌃I</span> Signer | <span class="text-green-600">⌃D</span> Radio | <span class="text-green-600">⌃V</span> Livestream</p>
            </div>
            
            <div class="space-y-1">
              <h4 class="text-green-400 font-bold">KEY CONCEPTS:</h4>
              <p class="text-green-500">• Every function is a window pane - no overlays!</p>
              <p class="text-green-500">• Windows auto-tile using binary space partitioning</p>
              <p class="text-green-500">• Focus follows window management, like Hyprland</p>
              <p class="text-green-500">• All shortcuts follow ⌃ (Ctrl/Cmd) + modifier patterns</p>
            </div>
            
            <div class="pt-2 border-t border-green-800">
              <p class="text-green-600">⌃ = Ctrl/Cmd | ⇧ = Shift | ⌥ = Alt</p>
              <p class="text-green-600">Try creating windows and navigating between them!</p>
              <p class="text-green-600">Close this window with ⌃Q when ready.</p>
            </div>
          </div>
        </div>
        
      {:else if window.class === 'signer'}
        <div class="text-xs space-y-2 h-full overflow-auto">
          <h3 class="text-sm mb-2 text-green-300">NOTEMINE_SIGNER</h3>
          
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-green-400">Status:</span>
              <span class="{hasKeys ? 'text-green-400' : 'text-red-400'}">
                {hasKeys ? 'ACTIVE' : 'NO_KEYS'}
              </span>
            </div>
            
            {#if hasKeys}
              <div class="space-y-2">
                <div>
                  <h4 class="text-green-400 font-bold">CURRENT SIGNER:</h4>
                  <p class="text-green-500">
                    {#if currentSigningMethod === 'private-key'}
                      {keyManager.getSecretKey() ? 'Persistent keys' : 'Ephemeral session keys'}
                    {:else if currentSigningMethod === 'nip-07'}
                      NIP-07 Browser Extension
                    {:else if currentSigningMethod === 'nostr-connect'}
                      NostrConnect Remote Signer
                    {:else}
                      {currentSigningMethod}
                    {/if}
                  </p>
                  <p class="text-green-600 font-mono text-xs break-all">{keyManager.getPublicKey()}</p>
                  {#if keyManager.getNpub()}
                    <p class="text-green-600 font-mono text-xs break-all">npub: {keyManager.getNpub()}</p>
                  {/if}
                  
                  {#if currentSigningMethod === 'private-key' && keyManager.getNsec()}
                    <div class="mt-2">
                      <button 
                        onclick={() => showNsec = !showNsec}
                        class="text-xs text-yellow-400 hover:text-yellow-300"
                      >
                        {showNsec ? 'Hide' : 'Show'} Private Key (nsec)
                      </button>
                      {#if showNsec}
                        <div class="mt-1 p-2 bg-red-900/20 border border-red-800 rounded">
                          <p class="text-red-400 text-xs mb-1">⚠️ Keep this secret!</p>
                          <p class="text-red-300 font-mono text-xs break-all select-all">{keyManager.getNsec()}</p>
                          <button 
                            onclick={() => {
                              navigator.clipboard.writeText(keyManager.getNsec() || '');
                              // Brief visual feedback
                              const btn = event.target;
                              const originalText = btn.textContent;
                              btn.textContent = 'Copied!';
                              setTimeout(() => btn.textContent = originalText, 1000);
                            }}
                            class="mt-1 text-xs px-2 py-1 bg-red-900/40 border border-red-800 text-red-400 hover:bg-red-800/40"
                          >
                            Copy nsec
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
                
                <div class="pt-2 border-t border-green-800">
                  <h4 class="text-green-400 font-bold">SIGNER OPTIONS:</h4>
                  <div class="space-y-1">
                    <button 
                      onclick={async () => {
                        try {
                          await keyManager.generateEphemeralKeys();
                          showNip07Error = false;
                        } catch (error) {
                          showNip07Error = true;
                          nip07ErrorMessage = 'Failed to generate ephemeral keys: ' + error.message;
                        }
                      }}
                      class="w-full text-left px-2 py-1 bg-green-900/20 border border-green-800 hover:bg-green-800/30"
                    >
                      <span class="text-green-400">Generate New Ephemeral Keys</span>
                      <span class="text-green-600 block text-xs">Create fresh session-only keypair</span>
                    </button>
                    <button 
                      onclick={async () => {
                        try {
                          await keyManager.generateKeys();
                          showNip07Error = false;
                        } catch (error) {
                          showNip07Error = true;
                          nip07ErrorMessage = 'Failed to generate persistent keys: ' + error.message;
                        }
                      }}
                      class="w-full text-left px-2 py-1 bg-yellow-900/20 border border-yellow-800 hover:bg-yellow-800/30"
                    >
                      <span class="text-yellow-400">Generate Persistent Keys</span>
                      <span class="text-yellow-600 block text-xs">Create and save keypair to localStorage</span>
                    </button>
                    <button 
                      onclick={async () => {
                        try {
                          await keyManager.setSigningMethod({ method: 'nip-07' });
                          showNip07Error = false;
                        } catch (error) {
                          showNip07Error = true;
                          nip07ErrorMessage = error.message;
                        }
                      }}
                      class="w-full text-left px-2 py-1 bg-blue-900/20 border border-blue-800 hover:bg-blue-800/30"
                    >
                      <span class="text-blue-400">NIP-07 Extension</span>
                      <span class="text-blue-600 block text-xs">Use browser extension signer</span>
                    </button>
                    <button 
                      onclick={() => showNostrConnectDialog = true}
                      class="w-full text-left px-2 py-1 bg-purple-900/20 border border-purple-800 hover:bg-purple-800/30"
                    >
                      <span class="text-purple-400">Nostr Connect</span>
                      <span class="text-purple-600 block text-xs">Connect to remote signer</span>
                    </button>
                  </div>
                </div>
              </div>
            {:else}
              <div class="space-y-2">
                <p class="text-yellow-400">No active signer found.</p>
                <p class="text-green-500">Notemine automatically generates ephemeral keys each session.</p>
                
                <div class="space-y-1">
                  <button 
                    onclick={async () => {
                      try {
                        await keyManager.generateEphemeralKeys();
                        showNip07Error = false;
                      } catch (error) {
                        showNip07Error = true;
                        nip07ErrorMessage = 'Failed to generate ephemeral keys: ' + error.message;
                      }
                    }}
                    class="w-full text-left px-2 py-1 bg-green-900/20 border border-green-800 hover:bg-green-800/30"
                  >
                    <span class="text-green-400">Generate Ephemeral Keys</span>
                    <span class="text-green-600 block text-xs">Create session-only keys (default)</span>
                  </button>
                  <button 
                    onclick={async () => {
                      try {
                        await keyManager.generateKeys();
                        showNip07Error = false;
                      } catch (error) {
                        showNip07Error = true;
                        nip07ErrorMessage = 'Failed to generate persistent keys: ' + error.message;
                      }
                    }}
                    class="w-full text-left px-2 py-1 bg-yellow-900/20 border border-yellow-800 hover:bg-yellow-800/30"
                  >
                    <span class="text-yellow-400">Generate Persistent Keys</span>
                    <span class="text-yellow-600 block text-xs">Create and save keys to localStorage</span>
                  </button>
                  <button 
                    onclick={async () => {
                      try {
                        await keyManager.setSigningMethod({ method: 'nip-07' });
                        showNip07Error = false;
                      } catch (error) {
                        showNip07Error = true;
                        nip07ErrorMessage = error.message;
                      }
                    }}
                    class="w-full text-left px-2 py-1 bg-blue-900/20 border border-blue-800 hover:bg-blue-800/30"
                  >
                    <span class="text-blue-400">NIP-07 Extension</span>
                    <span class="text-blue-600 block text-xs">Use browser extension signer</span>
                  </button>
                  <button 
                    onclick={() => showNostrConnectDialog = true}
                    class="w-full text-left px-2 py-1 bg-purple-900/20 border border-purple-800 hover:bg-purple-800/30"
                  >
                    <span class="text-purple-400">Nostr Connect</span>
                    <span class="text-purple-600 block text-xs">Connect to remote signer</span>
                  </button>
                </div>
              </div>
            {/if}
            
            {#if showNip07Error}
              <div class="bg-red-900/20 border border-red-800 p-2 rounded">
                <p class="text-red-400 text-xs">{nip07ErrorMessage}</p>
              </div>
            {/if}
            
            {#if showNostrConnectDialog}
              <div class="bg-purple-900/20 border border-purple-800 p-2 rounded space-y-2">
                <h4 class="text-purple-400 font-bold">NOSTR CONNECT</h4>
                
                <div class="space-y-2">
                  <p class="text-purple-600 text-xs">Option 1: Connect to existing remote signer</p>
                  <input 
                    type="text" 
                    bind:value={nostrConnectUrl}
                    placeholder="bunker://pubkey?relay=wss://...&secret=..."
                    class="w-full bg-black border border-purple-800 px-2 py-1 text-purple-400 text-xs"
                  />
                  
                  <div class="border-t border-purple-800 pt-2">
                    <p class="text-purple-600 text-xs mb-2">Option 2: Generate connection for remote signer</p>
                    <button
                      onclick={async () => {
                        try {
                          // Generate a random secret for the connection
                          const secret = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                            .map(b => b.toString(16).padStart(2, '0'))
                            .join('');
                          
                          // Get current public key (or generate one if needed)
                          let pubkey = keyManager.getPublicKey();
                          if (!pubkey) {
                            await keyManager.generateEphemeralKeys();
                            pubkey = keyManager.getPublicKey();
                          }
                          
                          // Create the bunker URL
                          generatedNostrConnectUrl = `bunker://${pubkey}?relay=wss://relay.nsec.app&secret=${secret}`;
                          
                          // Generate QR code
                          nostrConnectQR = await QRCode.toDataURL(generatedNostrConnectUrl, {
                            width: 256,
                            margin: 2,
                            color: {
                              dark: '#a855f7',
                              light: '#000000'
                            }
                          });
                        } catch (error) {
                          showNip07Error = true;
                          nip07ErrorMessage = 'Failed to generate QR code: ' + error.message;
                        }
                      }}
                      class="w-full px-2 py-1 bg-purple-900/40 border border-purple-800 text-purple-400 hover:bg-purple-800/40"
                    >
                      Generate QR Code
                    </button>
                    
                    {#if nostrConnectQR}
                      <div class="mt-2 space-y-2">
                        <img src={nostrConnectQR} alt="NostrConnect QR" class="mx-auto" />
                        <div class="p-2 bg-black border border-purple-800 rounded">
                          <p class="text-purple-400 text-xs font-mono break-all select-all">{generatedNostrConnectUrl}</p>
                        </div>
                        <button
                          onclick={() => {
                            navigator.clipboard.writeText(generatedNostrConnectUrl);
                            const btn = event.target;
                            const originalText = btn.textContent;
                            btn.textContent = 'Copied!';
                            setTimeout(() => btn.textContent = originalText, 1000);
                          }}
                          class="w-full px-2 py-1 bg-purple-900/40 border border-purple-800 text-purple-400 hover:bg-purple-800/40 text-xs"
                        >
                          Copy URL
                        </button>
                      </div>
                    {/if}
                  </div>
                  
                  <div class="flex gap-2 pt-2">
                    <button 
                      onclick={async () => {
                        try {
                          const urlToConnect = nostrConnectUrl || generatedNostrConnectUrl;
                          if (!urlToConnect) {
                            throw new Error('Please enter a URL or generate a QR code');
                          }
                          await keyManager.setSigningMethod({ 
                            method: 'nostr-connect', 
                            connectUrl: urlToConnect 
                          });
                          showNostrConnectDialog = false;
                          nostrConnectUrl = '';
                          nostrConnectQR = '';
                          generatedNostrConnectUrl = '';
                        } catch (error) {
                          showNip07Error = true;
                          nip07ErrorMessage = error.message;
                        }
                      }}
                      class="px-2 py-1 bg-purple-900/40 border border-purple-800 text-purple-400 hover:bg-purple-800/40"
                    >
                      Connect
                    </button>
                    <button 
                      onclick={() => {
                        showNostrConnectDialog = false;
                        nostrConnectUrl = '';
                        nostrConnectQR = '';
                        generatedNostrConnectUrl = '';
                      }}
                      class="px-2 py-1 bg-gray-900/40 border border-gray-800 text-gray-400 hover:bg-gray-800/40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            {/if}
            
            <div class="pt-2 border-t border-green-800">
              <h4 class="text-green-400 font-bold mb-1">ABOUT SIGNERS:</h4>
              <div class="text-green-600 space-y-1 text-xs">
                <p>• <strong>Ephemeral (Default):</strong> New keys each session, no data stored</p>
                <p>• <strong>Persistent:</strong> Keys saved to localStorage, same identity</p>
                <p>• <strong>NIP-07:</strong> Browser extension manages keys securely</p>
                <p>• <strong>Nostr Connect:</strong> Remote signer (bunkers, hardware)</p>
                <p>• Keys are required for posting and mining notes</p>
              </div>
            </div>
          </div>
        </div>
        
      {:else if window.class === 'keybinds'}
        <KeybindManager />
        
      {:else if window.class === 'radio'}
        <Radio />
        
      {:else if window.class === 'livestream'}
        <LiveStream />
        
      {:else if window.class === 'chat'}
        <EphemeralChat />
        
      {:else if window.class === 'zap'}
        <ZapPane />
        
      {:else if window.class === 'profile'}
        <UserProfile windowId={window.id} />
      {/if}
    </div>
  </div>
{/if}