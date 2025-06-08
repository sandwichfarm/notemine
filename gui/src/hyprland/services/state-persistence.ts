import { browser } from '$app/environment';
import type { HyprlandWindow, WindowManagerState } from '../types';
import { writable } from 'svelte/store';

interface PersistedPaneState {
  // Feed pane state
  activeFeedId?: string;
  feedConfigs?: any[];
  selectedRelays?: string[];
  exclusiveMode?: boolean;
  feedEvents?: any[];
  scrollPosition?: number;
  
  // Compose pane state
  content?: string;
  difficulty?: number;
  replyTo?: string;
  
  // Mining pane state
  targetDifficulty?: number;
  miningThreads?: number;
  
  // Radio pane state
  selectedStation?: any;
  volume?: number;
  isPlaying?: boolean;
  
  // Profile pane state
  pubkey?: string;
  profileData?: any;
  
  // General pane state
  customData?: Record<string, any>;
}

interface PersistedWindowData {
  id: string;
  class: string;
  title: string;
  focused: boolean;
  floating: boolean;
  fullscreen: boolean;
  pinned: boolean;
  workspaceId: number; // Track which workspace this window belongs to
  paneState: PersistedPaneState; // Complete pane state
}

interface PersistedWorkspaceState {
  id: number;
  name: string;
  windows: string[];
  focused: boolean;
  lastActiveWindowId?: string; // Remember last focused window in this workspace
  createdAt: number;
  lastActiveAt: number;
}

interface PersistedState {
  windows: PersistedWindowData[];
  workspaces: Record<number, PersistedWorkspaceState>;
  activeWorkspace: number;
  focusedWindowId: string | null;
  settings: Record<string, any>;
  drafts: Record<string, string>; // windowId -> content (kept for backwards compatibility)
  version: number; // For migration support
  lastSaved: number;
}

export class StatePersistenceService {
  private static readonly STORAGE_KEY = 'notemine-interface-state';
  private static readonly SETTINGS_KEY = 'notemine-settings';
  private static readonly DRAFTS_KEY = 'notemine-drafts';
  
  // Auto-save settings store
  public settings = writable<Record<string, any>>({});
  
  constructor() {
    if (browser) {
      this.loadSettings();
      
      // Auto-save settings when they change
      this.settings.subscribe(settings => {
        this.saveSettings(settings);
      });
    }
  }
  
  /**
   * Save complete interface state with per-pane workspace state
   */
  saveInterfaceState(state: WindowManagerState, windowContents: Map<string, any>): void {
    if (!browser) return;
    
    console.log('💾 Saving interface state with per-pane workspace state...');
    
    // Find which workspace each window belongs to
    const windowToWorkspace = new Map<string, number>();
    for (const [workspaceId, workspace] of state.workspaces) {
      for (const windowId of workspace.windows) {
        windowToWorkspace.set(windowId, workspaceId);
      }
    }
    
    const persistedState: PersistedState = {
      version: 2, // Increment version for new pane state format
      windows: Array.from(state.windows.values()).map(window => {
        const contents = windowContents.get(window.id) || {};
        const workspaceId = windowToWorkspace.get(window.id) || state.activeWorkspace;
        
        // Extract pane-specific state based on window class
        const paneState: PersistedPaneState = {
          scrollPosition: contents.scrollPosition || 0,
          customData: contents.customData || {}
        };
        
        // Add class-specific state
        switch (window.class) {
          case 'feed':
            paneState.activeFeedId = contents.activeFeedId;
            paneState.feedConfigs = contents.feedConfigs;
            paneState.selectedRelays = contents.selectedRelays;
            paneState.exclusiveMode = contents.exclusiveMode;
            paneState.feedEvents = contents.feedEvents;
            break;
          case 'compose':
            paneState.content = contents.content || '';
            paneState.difficulty = contents.difficulty;
            paneState.replyTo = contents.replyTo;
            break;
          case 'mining':
          case 'mining-overview':
            paneState.targetDifficulty = contents.targetDifficulty;
            paneState.miningThreads = contents.miningThreads;
            break;
          case 'radio':
            paneState.selectedStation = contents.selectedStation;
            paneState.volume = contents.volume;
            paneState.isPlaying = contents.isPlaying;
            break;
          case 'profile':
            paneState.pubkey = contents.pubkey;
            paneState.profileData = contents.profileData;
            break;
        }
        
        return {
          id: window.id,
          class: window.class,
          title: window.title,
          focused: window.focused,
          floating: window.type === 'floating',
          fullscreen: window.fullscreen,
          pinned: window.pinned,
          workspaceId: workspaceId,
          paneState: paneState
        };
      }),
      workspaces: Object.fromEntries(
        Array.from(state.workspaces.entries()).map(([id, workspace]) => [
          id,
          {
            id: workspace.id,
            name: workspace.name,
            windows: workspace.windows,
            focused: workspace.focused,
            lastActiveWindowId: workspace.focused ? state.focusedWindowId : undefined,
            createdAt: Date.now(), // Will be overridden on load for existing workspaces
            lastActiveAt: workspace.focused ? Date.now() : Date.now() - 1000 // Recent but not current
          }
        ])
      ),
      activeWorkspace: state.activeWorkspace,
      focusedWindowId: state.focusedWindowId,
      settings: this.getSettings(),
      drafts: this.getAllDrafts(),
      lastSaved: Date.now()
    };
    
    try {
      localStorage.setItem(this.constructor.STORAGE_KEY, JSON.stringify(persistedState));
      console.log('✅ Interface state saved successfully');
    } catch (error) {
      console.error('❌ Failed to save interface state:', error);
    }
  }
  
  /**
   * Load complete interface state
   */
  loadInterfaceState(): PersistedState | null {
    if (!browser) return null;
    
    try {
      const stored = localStorage.getItem(StatePersistenceService.STORAGE_KEY);
      if (!stored) return null;
      
      const state = JSON.parse(stored) as PersistedState;
      console.log('📂 Loaded interface state from', new Date(state.lastSaved).toLocaleString());
      
      return state;
    } catch (error) {
      console.error('❌ Failed to load interface state:', error);
      return null;
    }
  }
  
  /**
   * Auto-save settings (no Apply button needed)
   */
  updateSetting(key: string, value: any): void {
    this.settings.update(settings => ({
      ...settings,
      [key]: value
    }));
  }
  
  /**
   * Get setting value
   */
  getSetting(key: string, defaultValue?: any): any {
    const settings = this.getSettings();
    return settings[key] ?? defaultValue;
  }
  
  /**
   * Save settings to localStorage
   */
  private saveSettings(settings: Record<string, any>): void {
    if (!browser) return;
    
    try {
      localStorage.setItem(StatePersistenceService.SETTINGS_KEY, JSON.stringify(settings));
      console.log('⚙️ Settings auto-saved');
    } catch (error) {
      console.error('❌ Failed to save settings:', error);
    }
  }
  
  /**
   * Load settings from localStorage
   */
  private loadSettings(): void {
    if (!browser) return;
    
    try {
      const stored = localStorage.getItem(StatePersistenceService.SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        this.settings.set(settings);
        console.log('⚙️ Settings loaded');
      }
    } catch (error) {
      console.error('❌ Failed to load settings:', error);
    }
  }
  
  /**
   * Get current settings
   */
  getSettings(): Record<string, any> {
    let currentSettings = {};
    this.settings.subscribe(s => currentSettings = s)();
    return currentSettings;
  }
  
  /**
   * Auto-save draft for a window
   */
  saveDraft(windowId: string, content: string): void {
    if (!browser || !content.trim()) return;
    
    const drafts = this.getAllDrafts();
    drafts[windowId] = content;
    
    try {
      localStorage.setItem(StatePersistenceService.DRAFTS_KEY, JSON.stringify(drafts));
      console.log('📝 Draft auto-saved for window:', windowId);
    } catch (error) {
      console.error('❌ Failed to save draft:', error);
    }
  }
  
  /**
   * Load draft for a window
   */
  loadDraft(windowId: string): string | null {
    if (!browser) return null;
    
    const drafts = this.getAllDrafts();
    return drafts[windowId] || null;
  }
  
  /**
   * Delete draft for a window
   */
  deleteDraft(windowId: string): void {
    if (!browser) return;
    
    const drafts = this.getAllDrafts();
    delete drafts[windowId];
    
    try {
      localStorage.setItem(StatePersistenceService.DRAFTS_KEY, JSON.stringify(drafts));
      console.log('🗑️ Draft deleted for window:', windowId);
    } catch (error) {
      console.error('❌ Failed to delete draft:', error);
    }
  }
  
  /**
   * Get all drafts
   */
  private getAllDrafts(): Record<string, string> {
    if (!browser) return {};
    
    try {
      const stored = localStorage.getItem(StatePersistenceService.DRAFTS_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('❌ Failed to load drafts:', error);
      return {};
    }
  }
  
  /**
   * Clear all persisted data
   */
  clearAll(): void {
    if (!browser) return;
    
    localStorage.removeItem(StatePersistenceService.STORAGE_KEY);
    localStorage.removeItem(StatePersistenceService.SETTINGS_KEY);
    localStorage.removeItem(StatePersistenceService.DRAFTS_KEY);
    console.log('🧹 All persisted data cleared');
  }
}

// Export singleton instance
export const statePersistence = new StatePersistenceService();