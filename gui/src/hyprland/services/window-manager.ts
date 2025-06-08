import { writable, derived, get } from 'svelte/store';
import { BSPTree, type Rectangle } from './bsp-tree';
import type { HyprlandWindow, WindowType, Workspace, HyprlandConfig } from '../types';
import { WindowPersistence } from './window-persistence';
import { statePersistence } from './state-persistence';
import { browser } from '$app/environment';
import { soundService } from '$lib/services/sound';

// Workspace color themes
export interface WorkspaceTheme {
  id: number;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  border: string;
  text: string;
  bg: string;
}

const WORKSPACE_THEMES: WorkspaceTheme[] = [
  { id: 1, name: 'green', primary: 'rgb(34, 197, 94)', secondary: 'rgb(20, 83, 45)', accent: 'rgb(74, 222, 128)', border: 'rgb(34, 197, 94)', text: 'rgb(187, 247, 208)', bg: 'rgb(5, 46, 22)' },
  { id: 2, name: 'blue', primary: 'rgb(59, 130, 246)', secondary: 'rgb(30, 58, 138)', accent: 'rgb(96, 165, 250)', border: 'rgb(59, 130, 246)', text: 'rgb(191, 219, 254)', bg: 'rgb(23, 37, 84)' },
  { id: 3, name: 'purple', primary: 'rgb(147, 51, 234)', secondary: 'rgb(88, 28, 135)', accent: 'rgb(168, 85, 247)', border: 'rgb(147, 51, 234)', text: 'rgb(221, 214, 254)', bg: 'rgb(46, 16, 101)' },
  { id: 4, name: 'red', primary: 'rgb(239, 68, 68)', secondary: 'rgb(153, 27, 27)', accent: 'rgb(248, 113, 113)', border: 'rgb(239, 68, 68)', text: 'rgb(254, 202, 202)', bg: 'rgb(69, 10, 10)' },
  { id: 5, name: 'orange', primary: 'rgb(249, 115, 22)', secondary: 'rgb(154, 52, 18)', accent: 'rgb(251, 146, 60)', border: 'rgb(249, 115, 22)', text: 'rgb(254, 215, 170)', bg: 'rgb(67, 20, 7)' },
  { id: 6, name: 'cyan', primary: 'rgb(6, 182, 212)', secondary: 'rgb(21, 94, 117)', accent: 'rgb(34, 211, 238)', border: 'rgb(6, 182, 212)', text: 'rgb(165, 243, 252)', bg: 'rgb(8, 51, 68)' },
  { id: 7, name: 'pink', primary: 'rgb(236, 72, 153)', secondary: 'rgb(157, 23, 77)', accent: 'rgb(244, 114, 182)', border: 'rgb(236, 72, 153)', text: 'rgb(252, 207, 227)', bg: 'rgb(80, 7, 36)' },
  { id: 8, name: 'yellow', primary: 'rgb(245, 158, 11)', secondary: 'rgb(146, 64, 14)', accent: 'rgb(251, 191, 36)', border: 'rgb(245, 158, 11)', text: 'rgb(254, 240, 138)', bg: 'rgb(69, 26, 3)' },
  { id: 9, name: 'indigo', primary: 'rgb(99, 102, 241)', secondary: 'rgb(55, 48, 163)', accent: 'rgb(129, 140, 248)', border: 'rgb(99, 102, 241)', text: 'rgb(199, 210, 254)', bg: 'rgb(30, 27, 75)' }
];

function getWorkspaceTheme(workspaceId: number): WorkspaceTheme {
  return WORKSPACE_THEMES[(workspaceId - 1) % WORKSPACE_THEMES.length];
}

export type WindowClass = 'compose' | 'feed' | 'mining' | 'mining-overview' | 'relays' | 'settings' | 'signer' | 'shortcuts' | 'quickstart' | 'keybinds' | 'radio' | 'livestream' | 'chat' | 'zap' | 'profile';

export interface WindowManagerState {
  windows: Map<string, HyprlandWindow>;
  workspaces: Map<number, Workspace>;
  activeWorkspace: number;
  focusedWindowId: string | null;
  config: HyprlandConfig;
  floatingRects: Map<string, Rectangle>;
}

const defaultConfig: HyprlandConfig = {
  general: {
    gaps_in: 5,
    gaps_out: 10,
    border_size: 2,
    col_active_border: 'rgb(34, 197, 94)', // green-400
    col_inactive_border: 'rgb(20, 83, 45)', // green-900
    resize_on_border: true,
    layout: 'dwindle'
  },
  decoration: {
    rounding: 0,
    blur: false,
    blur_size: 8,
    blur_passes: 2,
    drop_shadow: true,
    shadow_range: 10,
    shadow_render_power: 3,
    col_shadow: 'rgba(0, 0, 0, 0.5)'
  },
  animations: {
    enabled: true,
    bezier: {
      'default': [0.42, 0, 0.58, 1]
    },
    animation: {
      'windows': { enabled: true, duration: 300, curve: 'default' },
      'fade': { enabled: true, duration: 200, curve: 'default' },
      'border': { enabled: true, duration: 200, curve: 'default' }
    }
  },
  input: {
    follow_mouse: 1,
    float_switch_override_focus: true,
    mouse_refocus: false
  },
  binds: {}
};

const initialState: WindowManagerState = {
  windows: new Map(),
  workspaces: new Map([[1, { id: 1, name: '1', windows: [], focused: true, special: false }]]),
  activeWorkspace: 1,
  focusedWindowId: null,
  config: defaultConfig,
  floatingRects: new Map()
};

export class HyprlandWindowManager {
  private stateStore = writable<WindowManagerState>(initialState);
  private bspTrees = new Map<number, BSPTree>(); // Per workspace
  private viewport = { width: 0, height: 0 };
  private saveDebounceTimer: number | null = null;
  private windowContents = new Map<string, any>(); // Track window content for persistence
  
  // Public getters
  get state() {
    return this.stateStore;
  }
  
  // Public stores
  public windows = derived(this.stateStore, $state => 
    Array.from($state.windows.values()).filter(w => 
      $state.workspaces.get($state.activeWorkspace)?.windows.includes(w.id)
    )
  );
  
  public focusedWindow = derived(this.stateStore, $state => 
    $state.focusedWindowId ? $state.windows.get($state.focusedWindowId) : null
  );
  
  public activeWorkspaceStore = derived(this.stateStore, $state => $state.activeWorkspace);
  
  public currentWorkspaceTheme = derived(this.stateStore, $state => 
    getWorkspaceTheme($state.activeWorkspace)
  );
  
  public windowRects = derived(this.stateStore, $state => {
    const tree = this.bspTrees.get($state.activeWorkspace);
    const rects = new Map<string, Rectangle>();
    
    // Early return if no tree exists (empty workspace)
    if (!tree) {
      console.log(`No BSP tree for workspace ${$state.activeWorkspace}, creating empty rects map`);
      return rects;
    }
    
    const config = $state.config.general;
    
    // Ensure viewport is valid
    if (this.viewport.width <= 0 || this.viewport.height <= 0) {
      console.warn('Invalid viewport dimensions:', this.viewport);
      return rects;
    }
    
    const containerRect: Rectangle = {
      x: config.gaps_out,
      y: config.gaps_out,
      width: Math.max(100, this.viewport.width - config.gaps_out * 2), // Minimum 100px width
      height: Math.max(100, this.viewport.height - config.gaps_out * 2 - 20) // Account for status bar
    };
    
    // Get tiled window rects from BSP tree
    const tiledRects = tree.calculateRects(containerRect);
    
    // Apply gaps to tiled windows and validate dimensions
    for (const [id, rect] of tiledRects) {
      const adjustedRect = {
        x: rect.x + config.gaps_in,
        y: rect.y + config.gaps_in,
        width: Math.max(50, rect.width - config.gaps_in * 2), // Minimum 50px width
        height: Math.max(30, rect.height - config.gaps_in * 2) // Minimum 30px height
      };
      
      // Ensure the window is within viewport bounds
      if (adjustedRect.x >= 0 && adjustedRect.y >= 0 && 
          adjustedRect.x + adjustedRect.width <= this.viewport.width &&
          adjustedRect.y + adjustedRect.height <= this.viewport.height) {
        rects.set(id, adjustedRect);
      } else {
        console.warn(`Window ${id} rect out of bounds:`, adjustedRect, 'viewport:', this.viewport);
        // Clamp to viewport
        rects.set(id, {
          x: Math.max(0, Math.min(adjustedRect.x, this.viewport.width - 100)),
          y: Math.max(0, Math.min(adjustedRect.y, this.viewport.height - 100)),
          width: Math.min(adjustedRect.width, this.viewport.width - adjustedRect.x),
          height: Math.min(adjustedRect.height, this.viewport.height - adjustedRect.y)
        });
      }
    }
    
    // Handle floating windows separately - they maintain their own positions
    const workspace = $state.workspaces.get($state.activeWorkspace);
    if (workspace) {
      for (const windowId of workspace.windows) {
        const window = $state.windows.get(windowId);
        if (window && window.type === 'floating') {
          // Check if we already have a stored rect for this floating window
          const storedRect = $state.floatingRects.get(windowId);
          if (storedRect) {
            // Validate stored rect is within viewport bounds
            const validatedRect = {
              x: Math.max(0, Math.min(storedRect.x, this.viewport.width - 100)),
              y: Math.max(0, Math.min(storedRect.y, this.viewport.height - 100)),
              width: Math.max(200, Math.min(storedRect.width, this.viewport.width)),
              height: Math.max(150, Math.min(storedRect.height, this.viewport.height))
            };
            rects.set(windowId, validatedRect);
            
            // Update stored rect if it was corrected
            if (validatedRect.x !== storedRect.x || validatedRect.y !== storedRect.y ||
                validatedRect.width !== storedRect.width || validatedRect.height !== storedRect.height) {
              $state.floatingRects.set(windowId, validatedRect);
            }
          } else {
            // New floating window - center it with reasonable size
            const floatWidth = Math.min(this.viewport.width * 0.6, 800);
            const floatHeight = Math.min(this.viewport.height * 0.6, 600);
            const centeredRect = {
              x: (this.viewport.width - floatWidth) / 2,
              y: (this.viewport.height - floatHeight) / 2,
              width: floatWidth,
              height: floatHeight
            };
            
            rects.set(windowId, centeredRect);
            // Store the initial floating position
            $state.floatingRects.set(windowId, centeredRect);
          }
        }
      }
    }
    
    console.log(`Generated ${rects.size} window rects for workspace ${$state.activeWorkspace}`);
    return rects;
  });
  
  constructor() {
    // Initialize BSP tree for default workspace
    this.bspTrees.set(1, new BSPTree());
    
    // Set up viewport tracking
    if (typeof window !== 'undefined') {
      this.viewport = { width: window.innerWidth, height: window.innerHeight };
      window.addEventListener('resize', () => {
        this.viewport = { width: window.innerWidth, height: window.innerHeight };
        this.recalculateLayout();
      });
    }
    
    // Subscribe to state changes for auto-save
    this.stateStore.subscribe(state => {
      this.scheduleStateSave(state);
    });
  }
  
  /**
   * Initialize and restore saved state
   */
  async initialize(): Promise<void> {
    if (!browser) return;
    
    // Try to restore from new comprehensive persistence first
    await this.restoreState();
    
    // If no comprehensive state, try old window persistence
    const currentState = get(this.stateStore);
    if (currentState.windows.size === 0) {
      const savedState = WindowPersistence.loadState();
      if (savedState) {
        console.log('Restoring saved window state from legacy persistence...');
        
        // Restore workspaces
        for (const workspace of savedState.workspaces) {
          if (!this.bspTrees.has(workspace.id)) {
            this.bspTrees.set(workspace.id, new BSPTree());
          }
        }
        
        // Restore windows
        for (const windowData of savedState.windows) {
          // Only restore certain window types
          const persistableClasses = ['compose', 'feed'];
          if (!persistableClasses.includes(windowData.class)) continue;
          
          // Create window with saved title
          const id = this.createWindow(windowData.class as WindowClass, windowData.title);
          
          // Move to correct workspace if needed
          if (windowData.workspace !== savedState.activeWorkspace && id) {
            this.moveWindowToWorkspace(id, windowData.workspace);
          }
        }
        
        // Switch to saved active workspace
        if (savedState.activeWorkspace !== 1) {
          this.switchWorkspace(savedState.activeWorkspace);
        }
      }
    }
    
    // Set initial viewport size
    this.viewport = { width: window.innerWidth, height: window.innerHeight };
  }
  
  /**
   * Set viewport size
   */
  setViewportSize(width: number, height: number): void {
    this.viewport = { width, height };
    this.recalculateLayout();
  }
  
  /**
   * Schedule state save with debouncing
   */
  private scheduleStateSave(state: WindowManagerState): void {
    if (!browser) return;
    
    // Clear existing timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    // Schedule new save
    this.saveDebounceTimer = window.setTimeout(() => {
      // Save to both old persistence and new comprehensive persistence
      WindowPersistence.saveState(state.windows, state.workspaces, state.activeWorkspace);
      statePersistence.saveInterfaceState(state, this.windowContents);
    }, 1000); // Save after 1 second of inactivity
  }
  
  /**
   * Update window content for persistence
   */
  updateWindowContent(windowId: string, content: any): void {
    this.windowContents.set(windowId, content);
    // Auto-save when content changes
    const state = get(this.stateStore);
    this.scheduleStateSave(state);
  }
  
  /**
   * Get window content
   */
  getWindowContent(windowId: string): any {
    return this.windowContents.get(windowId);
  }
  
  /**
   * Restore state from persistence
   */
  async restoreState(): Promise<void> {
    if (!browser) return;
    
    console.log('🔄 Restoring interface state...');
    
    const persistedState = statePersistence.loadInterfaceState();
    if (!persistedState) {
      console.log('📭 No persisted state found, using defaults');
      return;
    }
    
    try {
      // Restore workspaces
      const workspaces = new Map<number, Workspace>();
      Object.entries(persistedState.workspaces).forEach(([id, workspace]) => {
        workspaces.set(parseInt(id), {
          id: workspace.id,
          name: workspace.name,
          windows: workspace.windows,
          focused: workspace.focused,
          special: false
        });
      });
      
      // Restore windows
      const windows = new Map<string, HyprlandWindow>();
      const restoredContents = new Map<string, any>();
      
      persistedState.windows.forEach(windowData => {
        // Get visual settings from persistence
        const rounding = statePersistence.getSetting('rounding', 0);
        const blur = statePersistence.getSetting('blur', false);
        const dropShadow = statePersistence.getSetting('dropShadow', true);
        
        const window: HyprlandWindow = {
          id: windowData.id,
          title: windowData.title,
          class: windowData.class as any,
          type: windowData.floating ? 'floating' : 'normal',
          focused: windowData.focused,
          urgent: false,
          pinned: windowData.pinned,
          fullscreen: windowData.fullscreen,
          minimized: false,
          opacity: 1,
          rounding: rounding,
          blur: blur,
          shadow: dropShadow,
          animating: false
        };
        
        windows.set(window.id, window);
        
        // Restore window content
        if (windowData.content || windowData.scrollPosition || windowData.customData) {
          restoredContents.set(window.id, {
            content: windowData.content || '',
            scrollPosition: windowData.scrollPosition || 0,
            customData: windowData.customData || {}
          });
        }
      });
      
      // Restore floating window rectangles
      const floatingRects = new Map<string, Rectangle>();
      persistedState.windows.forEach(windowData => {
        const window = windows.get(windowData.id);
        if (window && window.floating && windowData.customData?.floatingRect) {
          floatingRects.set(windowData.id, windowData.customData.floatingRect);
        }
      });

      // Update state
      this.stateStore.update(state => ({
        ...state,
        windows,
        workspaces,
        activeWorkspace: persistedState.activeWorkspace,
        focusedWindowId: persistedState.focusedWindowId,
        floatingRects
      }));
      
      // Restore window contents
      this.windowContents = restoredContents;
      
      // Rebuild BSP trees for each workspace
      for (const [workspaceId, workspace] of workspaces.entries()) {
        if (workspace.windows.length > 0) {
          const tree = new BSPTree();
          workspace.windows.forEach(windowId => {
            const window = windows.get(windowId);
            // Only add non-floating windows to BSP tree
            if (window && window.type !== 'floating') {
              tree.insert(windowId);
            }
          });
          this.bspTrees.set(workspaceId, tree);
        }
      }
      
      console.log('✅ Interface state restored successfully');
      console.log(`📊 Restored ${windows.size} windows across ${workspaces.size} workspaces`);
      
    } catch (error) {
      console.error('❌ Failed to restore interface state:', error);
    }
  }
  
  /**
   * Create a new window
   */
  createWindow(windowClass: WindowClass, title?: string, params?: any): string {
    // Define singleton window types
    const singletonClasses: WindowClass[] = ['relays', 'mining', 'settings', 'signer', 'mining-overview', 'keybinds', 'shortcuts', 'radio', 'profile'];
    
    // Check if this is a singleton window type
    if (singletonClasses.includes(windowClass)) {
      console.log(`🔍 Checking for existing ${windowClass} window (singleton)`);
      
      // Check if window already exists in current workspace
      const state = get(this.stateStore);
      const workspace = state.workspaces.get(state.activeWorkspace)!;
      console.log(`📊 Current workspace ${state.activeWorkspace} has ${workspace.windows.length} windows:`, workspace.windows);
      
      const allWindowsOfType = Array.from(state.windows.values()).filter(w => w.class === windowClass);
      console.log(`🔍 Found ${allWindowsOfType.length} total ${windowClass} windows:`, allWindowsOfType.map(w => w.id));
      
      const existingWindow = allWindowsOfType.find(w => workspace.windows.includes(w.id));
      console.log(`🎯 Existing ${windowClass} window in current workspace:`, existingWindow?.id || 'none');
      
      if (existingWindow) {
        // Window exists in current workspace - close it instead (toggle behavior)
        console.log(`🔄 Toggling singleton window: ${windowClass} (closing existing window ${existingWindow.id})`);
        this.closeWindow(existingWindow.id);
        return '';
      } else {
        console.log(`✅ No existing ${windowClass} window found, creating new one`);
      }
    }
    
    const id = `window-${Date.now()}-${Math.random()}`;
    console.log('WindowManager.createWindow called:', { windowClass, title, id });
    
    // Get visual settings from persistence
    const rounding = statePersistence.getSetting('rounding', 0);
    const blur = statePersistence.getSetting('blur', false);
    const dropShadow = statePersistence.getSetting('dropShadow', true);
    const shadowRange = statePersistence.getSetting('shadowRange', 10);
    const animationsEnabled = statePersistence.getSetting('animationsEnabled', true);
    const windowDuration = statePersistence.getSetting('windowDuration', 300);
    const fadeDuration = statePersistence.getSetting('fadeDuration', 200);
    const animationCurve = statePersistence.getSetting('animationCurve', 'default');
    
    const window: HyprlandWindow = {
      id,
      title: title || windowClass.toUpperCase(),
      class: windowClass,
      type: 'normal',
      focused: false,
      urgent: false,
      pinned: false,
      fullscreen: false,
      minimized: false,
      opacity: 1,
      rounding: rounding,
      blur: blur,
      shadow: dropShadow,
      shadowRange: shadowRange,
      animationsEnabled: animationsEnabled,
      windowDuration: windowDuration,
      fadeDuration: fadeDuration,
      animationCurve: animationCurve,
      animating: false
    };
    
    this.stateStore.update(state => {
      state.windows.set(id, window);
      
      // Add to current workspace
      const workspace = state.workspaces.get(state.activeWorkspace)!;
      workspace.windows.push(id);
      
      // Insert into BSP tree only if not floating
      const tree = this.bspTrees.get(state.activeWorkspace)!;
      if (window.type !== 'floating') {
        tree.insert(id);
      }
      
      // Unfocus current window
      if (state.focusedWindowId) {
        const currentFocused = state.windows.get(state.focusedWindowId);
        if (currentFocused) {
          currentFocused.focused = false;
        }
      }
      
      // Focus new window
      state.focusedWindowId = id;
      window.focused = true;
      
      console.log('Window created. Current state:', {
        totalWindows: state.windows.size,
        workspaceWindows: workspace.windows.length,
        activeWorkspace: state.activeWorkspace
      });
      
      return state;
    });
    
    // Store window parameters if provided
    if (params) {
      this.updateWindowContent(id, { params });
    }
    
    // Play window open sound
    soundService.windowOpen();
    
    return id;
  }
  
  /**
   * Close a window
   */
  closeWindow(windowId: string): void {
    console.log('🗑️ Closing window:', windowId);
    
    this.stateStore.update(state => {
      const window = state.windows.get(windowId);
      if (!window) {
        console.log('❌ Window not found:', windowId);
        return state;
      }
      
      console.log('📋 Window to close:', window.class, window.title);
      
      // Remove from workspace
      const workspace = state.workspaces.get(state.activeWorkspace)!;
      const originalLength = workspace.windows.length;
      workspace.windows = workspace.windows.filter(id => id !== windowId);
      console.log(`🏠 Workspace windows: ${originalLength} -> ${workspace.windows.length}`);
      
      // Remove from BSP tree
      const tree = this.bspTrees.get(state.activeWorkspace)!;
      tree.remove(windowId);
      console.log('🌳 Removed from BSP tree');
      
      // Update focus
      if (state.focusedWindowId === windowId) {
        state.focusedWindowId = workspace.windows[workspace.windows.length - 1] || null;
        if (state.focusedWindowId) {
          state.windows.get(state.focusedWindowId)!.focused = true;
        }
        console.log('🎯 Updated focus to:', state.focusedWindowId);
      }
      
      // Remove window
      const removed = state.windows.delete(windowId);
      console.log('🗂️ Removed from windows map:', removed);
      
      return state;
    });
    
    // Play window close sound
    soundService.windowClose();
  }
  
  /**
   * Focus a window
   */
  focusWindow(windowId: string): void {
    this.stateStore.update(state => {
      // Unfocus current
      if (state.focusedWindowId) {
        const current = state.windows.get(state.focusedWindowId);
        if (current) current.focused = false;
      }
      
      // Focus new
      const window = state.windows.get(windowId);
      if (window) {
        window.focused = true;
        state.focusedWindowId = windowId;
      }
      
      return state;
    });
    
    // Play window focus sound
    soundService.windowMove();
  }
  
  /**
   * Move focus in a direction
   */
  moveFocus(direction: 'left' | 'right' | 'up' | 'down'): void {
    const state = get(this.state);
    if (!state.focusedWindowId) return;
    
    const tree = this.bspTrees.get(state.activeWorkspace);
    if (!tree) return;
    
    const rects = get(this.windowRects);
    const nextWindow = tree.getFocusInDirection(state.focusedWindowId, direction, rects);
    
    if (nextWindow) {
      this.focusWindow(nextWindow);
    }
  }
  
  /**
   * Swap windows
   */
  swapWindows(windowId1: string, windowId2: string): void {
    const state = get(this.state);
    const tree = this.bspTrees.get(state.activeWorkspace);
    if (!tree) return;
    
    tree.swapWindows(windowId1, windowId2);
    this.recalculateLayout();
  }
  
  /**
   * Toggle fullscreen
   */
  toggleFullscreen(windowId?: string): void {
    const id = windowId || get(this.state).focusedWindowId;
    if (!id) return;
    
    this.stateStore.update(state => {
      const window = state.windows.get(id);
      if (window) {
        window.fullscreen = !window.fullscreen;
      }
      return state;
    });
  }
  
  /**
   * Toggle floating
   */
  /**
   * Set position for a floating window
   */
  setFloatingPosition(windowId: string, rect: Rectangle): void {
    this.stateStore.update(state => {
      const window = state.windows.get(windowId);
      if (window && window.type === 'floating') {
        // Store the floating position
        state.floatingRects.set(windowId, rect);
      }
      return state;
    });
  }
  
  toggleFloating(windowId?: string): void {
    const id = windowId || get(this.state).focusedWindowId;
    if (!id) return;
    
    console.log(`🔄 Toggling floating state for window ${id}`);
    
    this.stateStore.update(state => {
      const window = state.windows.get(id);
      if (!window) {
        console.error(`Window ${id} not found when toggling floating`);
        return state;
      }
      
      const currentWorkspace = state.workspaces.get(state.activeWorkspace);
      if (!currentWorkspace) {
        console.error(`Current workspace ${state.activeWorkspace} not found`);
        return state;
      }
      
      const tree = this.bspTrees.get(state.activeWorkspace);
      if (!tree) {
        console.error(`BSP tree for workspace ${state.activeWorkspace} not found`);
        return state;
      }
      
      const wasFloating = window.type === 'floating';
      console.log(`Window ${id} was ${wasFloating ? 'floating' : 'tiled'}, making it ${wasFloating ? 'tiled' : 'floating'}`);
      
      if (!wasFloating) {
        // Becoming floating - remove from BSP tree first
        window.type = 'floating';
        tree.remove(id);
        
        // Calculate floating position based on current tiled position or center it
        const currentRects = get(this.windowRects);
        const currentRect = currentRects.get(id);
        
        let floatingRect: Rectangle;
        if (currentRect) {
          // Use current position as starting point, but ensure it's a reasonable floating size
          const minFloatWidth = Math.max(400, this.viewport.width * 0.3);
          const minFloatHeight = Math.max(300, this.viewport.height * 0.3);
          
          floatingRect = {
            x: Math.max(0, currentRect.x),
            y: Math.max(0, currentRect.y),
            width: Math.max(minFloatWidth, Math.min(currentRect.width, this.viewport.width * 0.8)),
            height: Math.max(minFloatHeight, Math.min(currentRect.height, this.viewport.height * 0.8))
          };
        } else {
          // Fallback to centered floating window
          const floatWidth = Math.min(this.viewport.width * 0.6, 800);
          const floatHeight = Math.min(this.viewport.height * 0.6, 600);
          floatingRect = {
            x: (this.viewport.width - floatWidth) / 2,
            y: (this.viewport.height - floatHeight) / 2,
            width: floatWidth,
            height: floatHeight
          };
        }
        
        // Store floating position
        state.floatingRects.set(id, floatingRect);
        console.log(`Window ${id} is now floating at:`, floatingRect);
        
      } else {
        // Returning to tiled - add to BSP tree
        window.type = 'normal';
        
        // Remove stored floating position
        state.floatingRects.delete(id);
        
        // Rebuild BSP tree to ensure proper layout
        console.log('📐 Unfloating window, rebuilding BSP tree for optimal layout');
        
        // Get all windows that should be tiled (including the one being unfloated)
        const tiledWindows = currentWorkspace.windows.filter(wId => {
          const w = state.windows.get(wId);
          return w && w.type !== 'floating';
        });
        
        console.log(`📐 Rebuilding tree with ${tiledWindows.length} tiled windows:`, tiledWindows);
        
        // Clear and rebuild the BSP tree for optimal layout
        tree.clear();
        tiledWindows.forEach(windowId => {
          tree.insert(windowId);
        });
        
        console.log(`Window ${id} is now tiled, BSP tree rebuilt with ${tiledWindows.length} windows`);
      }
      
      return state;
    });
    
    // Force layout recalculation
    this.recalculateLayout();
  }
  
  /**
   * Switch workspace
   */
  switchWorkspace(workspaceId: number): void {
    this.stateStore.update(state => {
      // Don't switch if already on the same workspace
      if (state.activeWorkspace === workspaceId) {
        return state;
      }
      
      console.log(`🔄 Switching from workspace ${state.activeWorkspace} to ${workspaceId}`);
      
      // Create workspace if it doesn't exist
      if (!state.workspaces.has(workspaceId)) {
        state.workspaces.set(workspaceId, {
          id: workspaceId,
          name: workspaceId.toString(),
          windows: [],
          focused: false,
          special: false
        });
        this.bspTrees.set(workspaceId, new BSPTree());
        console.log(`Created new workspace ${workspaceId}`);
      }
      
      // Validate BSP tree for the target workspace
      const targetWorkspace = state.workspaces.get(workspaceId)!;
      let targetTree = this.bspTrees.get(workspaceId);
      
      if (!targetTree) {
        targetTree = new BSPTree();
        this.bspTrees.set(workspaceId, targetTree);
        console.log(`Created missing BSP tree for workspace ${workspaceId}`);
      }
      
      // Verify BSP tree integrity for target workspace
      const tiledWindows = targetWorkspace.windows.filter(wId => {
        const w = state.windows.get(wId);
        return w && w.type !== 'floating';
      });
      
      const treeWindows = targetTree.getWindowOrder();
      const missingWindows = tiledWindows.filter(wId => !treeWindows.includes(wId));
      const extraWindows = treeWindows.filter(wId => !tiledWindows.includes(wId));
      
      if (missingWindows.length > 0 || extraWindows.length > 0) {
        console.warn(`BSP tree out of sync for workspace ${workspaceId}, rebuilding...`);
        console.log(`Missing: ${missingWindows}, Extra: ${extraWindows}`);
        
        // Rebuild the tree with correct windows
        const newTree = new BSPTree();
        tiledWindows.forEach(wId => newTree.insert(wId));
        this.bspTrees.set(workspaceId, newTree);
      }
      
      // Update workspace focus states
      const currentWorkspace = state.workspaces.get(state.activeWorkspace);
      if (currentWorkspace) {
        currentWorkspace.focused = false;
      }
      
      targetWorkspace.focused = true;
      state.activeWorkspace = workspaceId;
      
      // Update focused window to the last window in the target workspace
      const lastWindowId = targetWorkspace.windows[targetWorkspace.windows.length - 1] || null;
      
      // Update all window focus states
      for (const [wId, window] of state.windows) {
        window.focused = wId === lastWindowId;
      }
      
      state.focusedWindowId = lastWindowId;
      
      console.log(`Successfully switched to workspace ${workspaceId}, focused window: ${lastWindowId}`);
      
      return state;
    });
    
    // Force layout recalculation to apply changes
    this.recalculateLayout();
  }
  
  /**
   * Move window to workspace
   */
  moveWindowToWorkspace(windowId: string, workspaceId: number): void {
    console.log(`🚀 Moving window ${windowId} to workspace ${workspaceId}`);
    
    this.stateStore.update(state => {
      const window = state.windows.get(windowId);
      if (!window) {
        console.error(`Window ${windowId} not found`);
        return state;
      }
      
      // Store the current workspace to see if we need to switch
      const sourceWorkspaceId = state.activeWorkspace;
      console.log(`Source workspace: ${sourceWorkspaceId}, Target workspace: ${workspaceId}`);
      
      // If moving to the same workspace, do nothing
      if (sourceWorkspaceId === workspaceId) {
        console.log(`Window ${windowId} is already in workspace ${workspaceId}`);
        return state;
      }
      
      // Get current workspace and validate it exists
      const currentWorkspace = state.workspaces.get(sourceWorkspaceId);
      if (!currentWorkspace) {
        console.error(`Source workspace ${sourceWorkspaceId} not found`);
        return state;
      }
      
      // Remove from current workspace
      const windowIndexInSource = currentWorkspace.windows.indexOf(windowId);
      if (windowIndexInSource === -1) {
        console.error(`Window ${windowId} not found in source workspace ${sourceWorkspaceId}`);
        return state;
      }
      currentWorkspace.windows.splice(windowIndexInSource, 1);
      
      // Handle BSP tree for source workspace
      const isFloating = window.type === 'floating';
      if (!isFloating) {
        const currentTree = this.bspTrees.get(sourceWorkspaceId);
        if (currentTree) {
          currentTree.remove(windowId);
          console.log(`Removed window ${windowId} from source BSP tree`);
        }
        
        // If source workspace is now empty, recreate its BSP tree
        if (currentWorkspace.windows.length === 0) {
          this.bspTrees.set(sourceWorkspaceId, new BSPTree());
          console.log(`Reset empty source workspace ${sourceWorkspaceId} BSP tree`);
        } else {
          // Validate and potentially rebuild source tree to prevent corruption
          const remainingTiledWindows = currentWorkspace.windows.filter(wId => {
            const w = state.windows.get(wId);
            return w && w.type !== 'floating';
          });
          
          if (remainingTiledWindows.length > 0) {
            // Verify tree integrity - rebuild if necessary
            const treeWindows = currentTree ? currentTree.getWindowOrder() : [];
            const missingWindows = remainingTiledWindows.filter(wId => !treeWindows.includes(wId));
            const extraWindows = treeWindows.filter(wId => !remainingTiledWindows.includes(wId));
            
            if (missingWindows.length > 0 || extraWindows.length > 0) {
              console.warn(`BSP tree out of sync for workspace ${sourceWorkspaceId}, rebuilding...`);
              const newTree = new BSPTree();
              remainingTiledWindows.forEach(wId => newTree.insert(wId));
              this.bspTrees.set(sourceWorkspaceId, newTree);
            }
          }
        }
      }
      
      // Create target workspace if needed
      if (!state.workspaces.has(workspaceId)) {
        state.workspaces.set(workspaceId, {
          id: workspaceId,
          name: workspaceId.toString(),
          windows: [],
          focused: false,
          special: false
        });
        this.bspTrees.set(workspaceId, new BSPTree());
        console.log(`Created new workspace ${workspaceId}`);
      }
      
      // Add to target workspace
      const targetWorkspace = state.workspaces.get(workspaceId)!;
      targetWorkspace.windows.push(windowId);
      
      // Handle BSP tree for target workspace
      if (!isFloating) {
        let targetTree = this.bspTrees.get(workspaceId);
        
        // Ensure target tree exists
        if (!targetTree) {
          targetTree = new BSPTree();
          this.bspTrees.set(workspaceId, targetTree);
          console.log(`Created new BSP tree for workspace ${workspaceId}`);
        }
        
        // Insert window into target tree
        targetTree.insert(windowId);
        console.log(`Added window ${windowId} to target BSP tree`);
      } else {
        // For floating windows, preserve their floating rect if it exists
        console.log(`Moving floating window ${windowId}, preserving position`);
      }
      
      // Switch to the target workspace
      state.activeWorkspace = workspaceId;
      
      // Update workspace focus states atomically
      for (const [wsId, ws] of state.workspaces) {
        ws.focused = wsId === workspaceId;
      }
      
      // Keep the moved window focused
      state.focusedWindowId = windowId;
      
      // Update window focus states atomically
      for (const [wId, w] of state.windows) {
        w.focused = wId === windowId;
      }
      
      console.log(`Successfully moved window ${windowId} from workspace ${sourceWorkspaceId} to ${workspaceId}`);
      
      return state;
    });
    
    // Force layout recalculation after state update
    this.recalculateLayout();
  }
  
  private recalculateLayout(): void {
    // Validate layout before recalculation
    this.validateAndRepairLayout();
    
    // Force reactive update
    this.stateStore.update(state => state);
  }
  
  /**
   * Validate layout integrity and repair if necessary
   */
  private validateAndRepairLayout(): void {
    const state = get(this.stateStore);
    let needsRepair = false;
    
    console.log('🔍 Validating layout integrity...');
    
    for (const [workspaceId, workspace] of state.workspaces) {
      const tree = this.bspTrees.get(workspaceId);
      
      if (!tree) {
        console.warn(`Missing BSP tree for workspace ${workspaceId}, creating new one`);
        this.bspTrees.set(workspaceId, new BSPTree());
        needsRepair = true;
        continue;
      }
      
      // Get windows that should be in the tree (non-floating)
      const expectedTiledWindows = workspace.windows.filter(wId => {
        const window = state.windows.get(wId);
        return window && window.type !== 'floating';
      });
      
      // Get windows actually in the tree
      const actualTreeWindows = tree.getWindowOrder();
      
      // Find discrepancies
      const missingWindows = expectedTiledWindows.filter(wId => !actualTreeWindows.includes(wId));
      const extraWindows = actualTreeWindows.filter(wId => !expectedTiledWindows.includes(wId));
      
      if (missingWindows.length > 0 || extraWindows.length > 0) {
        console.warn(`Layout inconsistency in workspace ${workspaceId}:`);
        console.warn(`  Missing from tree: ${missingWindows}`);
        console.warn(`  Extra in tree: ${extraWindows}`);
        console.warn(`  Expected tiled: ${expectedTiledWindows}`);
        console.warn(`  Actual in tree: ${actualTreeWindows}`);
        
        // Repair by rebuilding the tree
        const newTree = new BSPTree();
        expectedTiledWindows.forEach(wId => newTree.insert(wId));
        this.bspTrees.set(workspaceId, newTree);
        needsRepair = true;
        
        console.log(`✅ Repaired BSP tree for workspace ${workspaceId}`);
      }
      
      // Validate floating window rects
      const floatingWindows = workspace.windows.filter(wId => {
        const window = state.windows.get(wId);
        return window && window.type === 'floating';
      });
      
      for (const floatingId of floatingWindows) {
        const rect = state.floatingRects.get(floatingId);
        if (!rect) {
          console.warn(`Missing floating rect for window ${floatingId}, creating default`);
          const defaultRect = {
            x: this.viewport.width * 0.2,
            y: this.viewport.height * 0.2,
            width: this.viewport.width * 0.6,
            height: this.viewport.height * 0.6
          };
          state.floatingRects.set(floatingId, defaultRect);
          needsRepair = true;
        } else {
          // Validate rect is within bounds
          if (rect.x < 0 || rect.y < 0 || 
              rect.x + rect.width > this.viewport.width ||
              rect.y + rect.height > this.viewport.height ||
              rect.width < 100 || rect.height < 100) {
            console.warn(`Invalid floating rect for window ${floatingId}, correcting`);
            const correctedRect = {
              x: Math.max(0, Math.min(rect.x, this.viewport.width - 200)),
              y: Math.max(0, Math.min(rect.y, this.viewport.height - 150)),
              width: Math.max(200, Math.min(rect.width, this.viewport.width)),
              height: Math.max(150, Math.min(rect.height, this.viewport.height))
            };
            state.floatingRects.set(floatingId, correctedRect);
            needsRepair = true;
          }
        }
      }
    }
    
    if (needsRepair) {
      console.log('🔧 Layout repair completed');
    } else {
      console.log('✅ Layout validation passed');
    }
  }
  
  /**
   * Move window in direction (swap with window in that direction)
   */
  moveWindow(direction: 'left' | 'right' | 'up' | 'down'): void {
    const state = get(this.state);
    if (!state.focusedWindowId) return;
    
    const tree = this.bspTrees.get(state.activeWorkspace);
    if (!tree) return;
    
    const rects = get(this.windowRects);
    const targetWindow = tree.getFocusInDirection(state.focusedWindowId, direction, rects);
    
    if (targetWindow) {
      this.swapWindows(state.focusedWindowId, targetWindow);
    }
  }
  
  /**
   * Resize window (adjust split ratio)
   */
  resizeWindow(direction: 'grow' | 'shrink', axis: 'width' | 'height'): void {
    const state = get(this.state);
    if (!state.focusedWindowId) return;
    
    const tree = this.bspTrees.get(state.activeWorkspace);
    if (!tree) return;
    
    const windowNode = tree.findWindow(state.focusedWindowId);
    if (!windowNode?.parent) return;
    
    const delta = direction === 'grow' ? 0.1 : -0.1;
    tree.resizeSplit(windowNode.parent.id, delta);
    this.recalculateLayout();
  }
  
  /**
   * Pin/unpin window
   */
  togglePin(windowId?: string): void {
    const id = windowId || get(this.state).focusedWindowId;
    if (!id) return;
    
    this.stateStore.update(state => {
      const window = state.windows.get(id);
      if (window) {
        window.pinned = !window.pinned;
      }
      return state;
    });
  }
  
  /**
   * Cycle through windows in current workspace
   */
  cycleWindows(direction: 'next' | 'prev'): void {
    const state = get(this.state);
    const workspace = state.workspaces.get(state.activeWorkspace);
    if (!workspace || workspace.windows.length <= 1) return;
    
    const currentIndex = workspace.windows.indexOf(state.focusedWindowId || '');
    if (currentIndex === -1) return;
    
    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % workspace.windows.length;
    } else {
      nextIndex = currentIndex === 0 ? workspace.windows.length - 1 : currentIndex - 1;
    }
    
    this.focusWindow(workspace.windows[nextIndex]);
  }
  
  /**
   * Split current window horizontally or vertically
   */
  splitWindow(direction: 'horizontal' | 'vertical'): void {
    const state = get(this.state);
    if (!state.focusedWindowId) return;
    
    // Create a new compose window, which will automatically split the current focused window
    const composeCount = Array.from(state.windows.values()).filter(w => w.class === 'compose').length;
    this.createWindow('compose', `COMPOSE_${composeCount + 1}`);
  }
  
  /**
   * Kill/close focused window
   */
  killActiveWindow(): void {
    const state = get(this.state);
    if (state.focusedWindowId) {
      this.closeWindow(state.focusedWindowId);
    }
  }
  
  /**
   * Focus urgent window
   */
  focusUrgent(): void {
    const state = get(this.state);
    for (const window of state.windows.values()) {
      if (window.urgent) {
        // Switch to window's workspace if needed
        for (const [workspaceId, workspace] of state.workspaces) {
          if (workspace.windows.includes(window.id)) {
            if (workspaceId !== state.activeWorkspace) {
              this.switchWorkspace(workspaceId);
            }
            this.focusWindow(window.id);
            return;
          }
        }
      }
    }
  }
  
  /**
   * Exit/minimize all windows (like Super+M in Hyprland)
   */
  minimizeAll(): void {
    this.stateStore.update(state => {
      for (const window of state.windows.values()) {
        window.minimized = true;
      }
      return state;
    });
  }
  
  /**
   * Center floating window
   */
  centerWindow(windowId?: string): void {
    const id = windowId || get(this.state).focusedWindowId;
    if (!id) return;
    
    // Toggle to floating if not already
    this.stateStore.update(state => {
      const window = state.windows.get(id);
      if (window) {
        window.type = 'floating';
      }
      return state;
    });
    
    this.recalculateLayout();
  }
  
  /**
   * Update configuration
   */
  updateConfig(configUpdate: Partial<HyprlandConfig>): void {
    this.stateStore.update(state => {
      state.config = {
        ...state.config,
        ...configUpdate,
        general: { ...state.config.general, ...configUpdate.general },
        decoration: { ...state.config.decoration, ...configUpdate.decoration },
        animations: { ...state.config.animations, ...configUpdate.animations },
        input: { ...state.config.input, ...configUpdate.input }
      };
      return state;
    });
    
    // Recalculate layout to apply new gaps/borders
    this.recalculateLayout();
  }
  
  /**
   * Rename a window
   */
  renameWindow(windowId: string, newTitle: string): void {
    this.stateStore.update(state => {
      const window = state.windows.get(windowId);
      if (window) {
        window.title = newTitle;
      }
      return state;
    });
  }

  /**
   * Manually validate and repair layout (for debugging)
   */
  validateLayout(): void {
    console.log('🔧 Manual layout validation triggered');
    this.validateAndRepairLayout();
    this.recalculateLayout();
  }

  /**
   * Create a profile window for a specific pubkey
   */
  createProfileWindow(pubkey: string): string {
    return this.createWindow('profile', `PROFILE_${pubkey.slice(0, 8)}...`, { pubkey });
  }

  /**
   * Update visual settings for all windows
   */
  updateVisualSettings(settings: {
    rounding?: number;
    blur?: boolean;
    dropShadow?: boolean;
    shadowRange?: number;
    animationsEnabled?: boolean;
    windowDuration?: number;
    fadeDuration?: number;
    animationCurve?: string;
  }): void {
    this.stateStore.update(state => {
      // Create new Map to trigger reactivity
      const newWindows = new Map<string, HyprlandWindow>();
      
      // Update all windows with new visual settings
      for (const [id, window] of state.windows.entries()) {
        // Create a new window object to trigger reactivity
        const updatedWindow = { ...window };
        
        if (settings.rounding !== undefined) {
          updatedWindow.rounding = settings.rounding;
        }
        if (settings.blur !== undefined) {
          updatedWindow.blur = settings.blur;
        }
        if (settings.dropShadow !== undefined) {
          updatedWindow.shadow = settings.dropShadow;
        }
        if (settings.shadowRange !== undefined) {
          updatedWindow.shadowRange = settings.shadowRange;
        }
        if (settings.animationsEnabled !== undefined) {
          updatedWindow.animationsEnabled = settings.animationsEnabled;
        }
        if (settings.windowDuration !== undefined) {
          updatedWindow.windowDuration = settings.windowDuration;
        }
        if (settings.fadeDuration !== undefined) {
          updatedWindow.fadeDuration = settings.fadeDuration;
        }
        if (settings.animationCurve !== undefined) {
          updatedWindow.animationCurve = settings.animationCurve;
        }
        
        newWindows.set(id, updatedWindow);
      }
      
      return {
        ...state,
        windows: newWindows
      };
    });
  }

  /**
   * Get debug information about the current layout state
   */
  getLayoutDebugInfo(): any {
    const state = get(this.stateStore);
    const debugInfo: any = {
      viewport: this.viewport,
      activeWorkspace: state.activeWorkspace,
      workspaces: {},
      bspTrees: {},
      floatingRects: Object.fromEntries(state.floatingRects)
    };

    for (const [workspaceId, workspace] of state.workspaces) {
      debugInfo.workspaces[workspaceId] = {
        ...workspace,
        tiledWindows: workspace.windows.filter(wId => {
          const window = state.windows.get(wId);
          return window && window.type !== 'floating';
        }),
        floatingWindows: workspace.windows.filter(wId => {
          const window = state.windows.get(wId);
          return window && window.type === 'floating';
        })
      };

      const tree = this.bspTrees.get(workspaceId);
      if (tree) {
        debugInfo.bspTrees[workspaceId] = {
          windowOrder: tree.getWindowOrder(),
          hasRoot: !!tree.getRoot()
        };
      }
    }

    return debugInfo;
  }
}

// Export singleton instance
export const windowManager = new HyprlandWindowManager();

// Export theme utilities
export { getWorkspaceTheme, WORKSPACE_THEMES };