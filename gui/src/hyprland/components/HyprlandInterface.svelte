<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { windowManager } from '../services/window-manager';
  import { hotkeyManager, type HotkeyDefinition } from '../services/hotkeys';
  import type { HyprlandWindow } from '../types';
  import Window from './Window.svelte';
  import StatusBar from './StatusBar.svelte';
  import { eventService } from '$lib/services/events';
  import { relayDiscovery } from '$lib/services/relay-discovery';
  import { pow } from '$lib/services/pow-client';
  import { keybindStore, matchesKeybind, getKeybindByAction } from '../services/keybind-config';
  import type { Keybind } from '../services/keybind-config';
  
  // Subscribe to window manager stores
  const windows = windowManager.windows;
  const windowRects = windowManager.windowRects;
  const focusedWindow = windowManager.focusedWindow;
  const activeWorkspace = windowManager.activeWorkspaceStore;
  const currentTheme = windowManager.currentWorkspaceTheme;
  
  // Workspace indicator state
  let showWorkspaceIndicator = false;
  let workspaceIndicatorNumber = 1;
  let workspaceIndicatorTimeout: number;
  let previousWorkspace = 1;
  
  // Debug reactive changes
  $: console.log('Windows changed:', $windows.length, $windows.map(w => w.title));
  $: console.log('Window rects changed:', $windowRects.size, Array.from($windowRects.keys()));
  $: console.log('Active workspace:', $activeWorkspace);
  
  // Track workspace changes for indicator
  let mounted = false;
  
  $: if (mounted && $activeWorkspace !== undefined && $activeWorkspace !== previousWorkspace) {
    displayWorkspaceIndicator($activeWorkspace);
    previousWorkspace = $activeWorkspace;
  }
  
  let lastWorkspaceIndicatorTime = 0;
  const WORKSPACE_INDICATOR_DEBOUNCE = 100; // Prevent rapid updates
  
  function displayWorkspaceIndicator(workspaceNum: number) {
    const now = Date.now();
    
    // Debounce to prevent rapid updates
    if (now - lastWorkspaceIndicatorTime < WORKSPACE_INDICATOR_DEBOUNCE) {
      return;
    }
    lastWorkspaceIndicatorTime = now;
    
    // Clear any existing timeout
    if (workspaceIndicatorTimeout) {
      clearTimeout(workspaceIndicatorTimeout);
    }
    
    // Update indicator
    workspaceIndicatorNumber = workspaceNum;
    showWorkspaceIndicator = true;
    
    // Hide after 1.2 seconds with fade
    workspaceIndicatorTimeout = setTimeout(() => {
      showWorkspaceIndicator = false;
    }, 1200);
  }
  
  
  onMount(async () => {
    // Make windowManager globally available
    if (typeof window !== 'undefined') {
      (window as any).windowManager = windowManager;
    }
    
    // Initialize services
    await relayDiscovery.initialize();
    await eventService.initialize();
    
    // Restore saved window state
    await windowManager.initialize();
    
    // Only create default windows if no windows were restored
    const currentWindows = get(windowManager.state).windows;
    if (currentWindows.size === 0) {
      // Initialize with quickstart and compose windows
      windowManager.createWindow('quickstart');
      windowManager.createWindow('compose');
    }
    
    // Set initial workspace and mark as mounted
    previousWorkspace = $activeWorkspace || 1;
    mounted = true;
    
    // Subscribe to keybind configuration
    let keybinds: Keybind[] = [];
    const unsubscribeKeybinds = keybindStore.subscribe(kb => keybinds = kb);
    
    // Track last action time to prevent rapid-fire executions
    const lastActionTime = new Map<string, number>();
    const ACTION_DEBOUNCE_MS = 100; // Minimum time between same actions
    
    // Comprehensive Hyprland keyboard handler
    const handleKeydown = (e: KeyboardEvent) => {
      // Ignore standalone modifier keys to reduce noise
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }
      
      // Check if an input or textarea is focused - if so, only allow certain hotkeys
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      );
      
      // For relay-specific single-key hotkeys, skip if input is focused
      if (isInputFocused) {
        const noModifierKeys = ['a', 'r', 'd', 't', 'c', '/', 'n']; // relay and radio hotkeys
        if (noModifierKeys.includes(e.key.toLowerCase()) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          return; // Don't process single-key hotkeys when typing in inputs
        }
      }
      
      console.log('🎹 HOTKEY HANDLER CALLED - Key pressed:', e.key, 'modifiers:', { 
        ctrl: e.ctrlKey || e.metaKey, 
        shift: e.shiftKey, 
        alt: e.altKey 
      });
      console.log('🎹 Total keybinds loaded:', keybinds.length);
      
      // Special debug for window management keys
      if (['m', 'r', 's', 'i'].includes(e.key.toLowerCase()) && (e.ctrlKey || e.metaKey)) {
        console.log('🔍 WINDOW MANAGEMENT KEY DETECTED:', e.key.toLowerCase(), 'with ctrl/meta');
        
        if (e.key.toLowerCase() === 's') {
          console.log('🔍 SETTINGS KEY (S) DETECTED - should create settings window');
        }
      }
      
      // Find matching keybind
      console.log('🔍 Looking for keybind match for:', e.key, 'modifiers:', {
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey
      });
      
      const matchingKeybind = keybinds.find(kb => {
        const matches = matchesKeybind(e, kb);
        if (['m', 'r', 's', 'i', 'o'].includes(e.key.toLowerCase()) && (e.ctrlKey || e.metaKey)) {
          console.log('🔍 Testing keybind:', kb.key, kb.modifiers, '-> matches:', matches);
        }
        return matches;
      });
      
      if (!matchingKeybind) {
        console.log('❌ No matching keybind found for', e.key, 'with modifiers:', {
          ctrl: e.ctrlKey || e.metaKey,
          shift: e.shiftKey,
          alt: e.altKey
        });
        if (['m', 'r', 's', 'i', 'o'].includes(e.key.toLowerCase()) && (e.ctrlKey || e.metaKey)) {
          console.log('🚨 FAILED TO MATCH WINDOW MANAGEMENT KEY:', e.key.toLowerCase());
          console.log('📋 All keybinds:', keybinds.map(kb => `${kb.modifiers.join('+')}+${kb.key} -> ${kb.action}`));
          
          // Check specifically for the 's' key
          if (e.key.toLowerCase() === 's') {
            const settingsKeybind = keybinds.find(kb => kb.key === 's' && kb.modifiers.includes('ctrl'));
            console.log('Settings keybind found:', settingsKeybind);
          }
        }
        return;
      }
      
      console.log('Found matching keybind:', matchingKeybind.action, matchingKeybind.description);
      
      // Prevent default and stop propagation only after we've found a matching keybind
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Check debounce to prevent rapid-fire execution
      const now = Date.now();
      const lastTime = lastActionTime.get(matchingKeybind.action) || 0;
      if (now - lastTime < ACTION_DEBOUNCE_MS) {
        console.log('🚫 Action debounced:', matchingKeybind.action, 'too soon after last execution');
        return;
      }
      lastActionTime.set(matchingKeybind.action, now);
      
      // Get focused window for operations that need it
      const currentFocusedWindow = get(focusedWindow);
      
      // Execute action based on keybind
      switch (matchingKeybind.action) {
        // Navigation
        case 'focusLeft':
          windowManager.moveFocus('left');
          break;
        case 'focusRight':
          windowManager.moveFocus('right');
          break;
        case 'focusUp':
          windowManager.moveFocus('up');
          break;
        case 'focusDown':
          windowManager.moveFocus('down');
          break;
          
        // Window management
        case 'killActiveWindow':
          windowManager.killActiveWindow();
          break;
          
        // Window creation
        case 'createCompose': {
          const currentWindows = get(windows);
          const composeCount = currentWindows.filter(w => w.class === 'compose').length;
          windowManager.createWindow('compose', `COMPOSE_${composeCount + 1}`);
          break;
        }
        case 'createFeed': {
          const currentWindows = get(windows);
          const feedCount = currentWindows.filter(w => w.class === 'feed').length;
          windowManager.createWindow('feed', `FEED_${feedCount + 1}`);
          break;
        }
        case 'createMining':
          console.log('🎯 Creating mining window');
          windowManager.createWindow('mining');
          break;
        case 'createRelays':
          console.log('🎯 Creating relays window');
          windowManager.createWindow('relays');
          break;
        case 'createSettings':
          console.log('🎯 Creating settings window');
          try {
            const result = windowManager.createWindow('settings');
            console.log('Settings window creation result:', result);
          } catch (error) {
            console.error('Failed to create settings window:', error);
          }
          break;
        case 'createSigner':
          console.log('🎯 Creating signer window');
          windowManager.createWindow('signer');
          break;
        case 'createRadio':
          console.log('🎯 Creating radio window');
          windowManager.createWindow('radio');
          break;
        case 'createLivestream':
          console.log('📺 Creating livestream window');
          windowManager.createWindow('livestream');
          break;
        case 'createChat':
          console.log('💬 Creating chat window');
          windowManager.createWindow('chat');
          break;
        case 'toggleFilters': {
          // Find focused feed window and toggle its filters
          const currentWindows = get(windows);
          const focusedWindow = currentWindows.find(w => w.focused && w.class === 'feed');
          if (focusedWindow) {
            globalThis.dispatchEvent(new CustomEvent('toggle-feed-filters', { detail: { windowId: focusedWindow.id } }));
          }
          break;
        }
        case 'createMiningOverview':
          windowManager.createWindow('mining-overview');
          break;
        case 'createKeybinds':
          windowManager.createWindow('keybinds');
          break;
        case 'createProfile':
          console.log('👤 Creating profile window');
          windowManager.createWindow('profile');
          break;
          
        // Special actions
        case 'submitNote': {
          const currentWindows = get(windows);
          const focusedWindow = currentWindows.find(w => w.focused && w.class === 'compose');
          if (focusedWindow) {
            globalThis.dispatchEvent(new CustomEvent('submit-note', { detail: { windowId: focusedWindow.id } }));
          }
          break;
        }
        case 'toggleFloating':
          windowManager.toggleFloating();
          break;
        case 'toggleFullscreen':
          windowManager.toggleFullscreen();
          break;
        case 'togglePin':
          windowManager.togglePin();
          break;
        case 'centerWindow':
          windowManager.centerWindow();
          break;
        case 'cycleNext':
          windowManager.cycleWindows('next');
          break;
        case 'cyclePrev':
          windowManager.cycleWindows('prev');
          break;
        case 'radioNext': {
          // Check if focused window is radio and scan is not active
          const currentWindows = get(windows);
          const focusedRadioWindow = currentWindows.find(w => w.focused && w.class === 'radio');
          if (focusedRadioWindow) {
            // Import radioStore to check scanning state and call changeStation
            import('$lib/stores/radio').then(({ radioStore, isScanning }) => {
              const unsubscribe = isScanning.subscribe(scanning => {
                if (!scanning) {
                  radioStore.changeStation();
                  console.log('🎵 Radio next station triggered via hotkey');
                }
                unsubscribe();
              });
            });
          }
          break;
        }
        
        // Handle relay-specific hotkeys when relay window is focused
        case 'relayAdd':
        case 'relayRemove':
        case 'relayDiscover':
        case 'relayTest':
        case 'relayClear':
        case 'relaySearch': {
          const currentWindows = get(windows);
          const focusedRelayWindow = currentWindows.find(w => w.focused && w.class === 'relays');
          if (focusedRelayWindow) {
            // Dispatch relay-specific hotkey event
            globalThis.dispatchEvent(new CustomEvent('relay-hotkey', { 
              detail: { 
                windowId: focusedRelayWindow.id, 
                action: matchingKeybind.action,
                event: e
              } 
            }));
          }
          break;
        }
          
        // Window movement
        case 'moveLeft':
          windowManager.moveWindow('left');
          break;
        case 'moveRight':
          windowManager.moveWindow('right');
          break;
        case 'moveUp':
          windowManager.moveWindow('up');
          break;
        case 'moveDown':
          windowManager.moveWindow('down');
          break;
          
        // Window resizing
        case 'resizeShrinkWidth':
          windowManager.resizeWindow('shrink', 'width');
          break;
        case 'resizeGrowWidth':
          windowManager.resizeWindow('grow', 'width');
          break;
        case 'resizeShrinkHeight':
          windowManager.resizeWindow('shrink', 'height');
          break;
        case 'resizeGrowHeight':
          windowManager.resizeWindow('grow', 'height');
          break;
          
        // Workspace switching
        case 'switchWorkspace1':
          windowManager.switchWorkspace(1);
          break;
        case 'switchWorkspace2':
          windowManager.switchWorkspace(2);
          break;
        case 'switchWorkspace3':
          windowManager.switchWorkspace(3);
          break;
        case 'switchWorkspace4':
          windowManager.switchWorkspace(4);
          break;
        case 'switchWorkspace5':
          windowManager.switchWorkspace(5);
          break;
        case 'switchWorkspace6':
          windowManager.switchWorkspace(6);
          break;
        case 'switchWorkspace7':
          windowManager.switchWorkspace(7);
          break;
        case 'switchWorkspace8':
          windowManager.switchWorkspace(8);
          break;
        case 'switchWorkspace9':
          windowManager.switchWorkspace(9);
          break;
        case 'switchWorkspace10':
          windowManager.switchWorkspace(10);
          break;
          
        // Move to workspace
        case 'moveToWorkspace1':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 1);
            // displayWorkspaceIndicator is called automatically via reactive statement
          }
          break;
        case 'moveToWorkspace2':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 2);
          }
          break;
        case 'moveToWorkspace3':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 3);
          }
          break;
        case 'moveToWorkspace4':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 4);
          }
          break;
        case 'moveToWorkspace5':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 5);
          }
          break;
        case 'moveToWorkspace6':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 6);
          }
          break;
        case 'moveToWorkspace7':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 7);
          }
          break;
        case 'moveToWorkspace8':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 8);
          }
          break;
        case 'moveToWorkspace9':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 9);
          }
          break;
        case 'moveToWorkspace10':
          if (currentFocusedWindow) {
            windowManager.moveWindowToWorkspace(currentFocusedWindow.id, 10);
          }
          break;
          
        // Special workspace navigation
        case 'moveToPrevWorkspace': {
          const currentWorkspace = get(activeWorkspace);
          if (currentFocusedWindow) {
            const targetWorkspace = Math.max(1, currentWorkspace - 1);
            if (targetWorkspace !== currentWorkspace) {
              windowManager.moveWindowToWorkspace(currentFocusedWindow.id, targetWorkspace);
            }
          }
          break;
        }
        case 'moveToNextWorkspace': {
          const currentWorkspace = get(activeWorkspace);
          if (currentFocusedWindow) {
            const targetWorkspace = Math.min(10, currentWorkspace + 1);
            if (targetWorkspace !== currentWorkspace) {
              windowManager.moveWindowToWorkspace(currentFocusedWindow.id, targetWorkspace);
            }
          }
          break;
        }
          
        // System actions
        case 'minimizeAll':
          windowManager.minimizeAll();
          break;
          
        // Debug/test actions
        // case 'testHotkey':
        //   console.log('🎉 TEST HOTKEY WORKS! Ctrl+T detected successfully');
        //   break;
          
        default:
          // If we have a custom handler, execute it
          if (matchingKeybind.handler) {
            matchingKeybind.handler();
          }
      }
    };
    
    globalThis.addEventListener('keydown', handleKeydown);
    
    return () => {
      globalThis.removeEventListener('keydown', handleKeydown);
      unsubscribeKeybinds();
    };
  });
</script>

<div 
  class="fixed inset-0 bg-black overflow-hidden font-mono"
  style="
    --theme-primary: {$currentTheme.primary};
    --theme-secondary: {$currentTheme.secondary};
    --theme-accent: {$currentTheme.accent};
    --theme-border: {$currentTheme.border};
    --theme-text: {$currentTheme.text};
    --theme-bg: {$currentTheme.bg};
  "
>
  <!-- Windows -->
  {#each $windows as window (window.id)}
    {#if $windowRects.has(window.id)}
      <Window 
        {window} 
        rect={$windowRects.get(window.id)}
      />
    {/if}
  {/each}
  
  <!-- Workspace indicator overlay -->
  {#if showWorkspaceIndicator}
    <div 
      class="fixed inset-0 pointer-events-none flex items-center justify-center z-50"
      style="transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);"
      class:opacity-100={showWorkspaceIndicator}
      class:opacity-0={!showWorkspaceIndicator}
    >
      <div 
        class="font-mono font-black text-green-400/15 select-none"
        style="font-size: clamp(10rem, 25vw, 30rem); text-shadow: 0 0 50px rgba(34, 197, 94, 0.1);"
      >
        {workspaceIndicatorNumber}
      </div>
    </div>
  {/if}
  
  <!-- Status bar -->
  <StatusBar />
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }
</style>