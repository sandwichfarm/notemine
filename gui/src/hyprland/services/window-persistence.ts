import { browser } from '$app/environment';
import type { HyprlandWindow, Workspace } from '../types';

interface PersistedWindowState {
  windows: Array<{
    id: string;
    title: string;
    class: string;
    workspace: number;
    content?: any; // Window-specific content (e.g., draft text)
  }>;
  workspaces: Array<{
    id: number;
    windows: string[];
  }>;
  activeWorkspace: number;
}

const STORAGE_KEY = 'notemine-window-state';

export class WindowPersistence {
  /**
   * Save window state to localStorage
   */
  static saveState(
    windows: Map<string, HyprlandWindow>,
    workspaces: Map<number, Workspace>,
    activeWorkspace: number
  ): void {
    if (!browser) return;
    
    try {
      const state: PersistedWindowState = {
        windows: [],
        workspaces: [],
        activeWorkspace
      };
      
      // Find which workspace each window belongs to
      const windowToWorkspace = new Map<string, number>();
      for (const [workspaceId, workspace] of workspaces) {
        for (const windowId of workspace.windows) {
          windowToWorkspace.set(windowId, workspaceId);
        }
      }
      
      // Save window information
      for (const [id, window] of windows) {
        const workspaceId = windowToWorkspace.get(id);
        if (workspaceId !== undefined) {
          state.windows.push({
            id,
            title: window.title,
            class: window.class,
            workspace: workspaceId
          });
        }
      }
      
      // Save workspace information
      for (const [id, workspace] of workspaces) {
        state.workspaces.push({
          id,
          windows: workspace.windows
        });
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  }
  
  /**
   * Load window state from localStorage
   */
  static loadState(): PersistedWindowState | null {
    if (!browser) return null;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load window state:', error);
      return null;
    }
  }
  
  /**
   * Clear saved state
   */
  static clearState(): void {
    if (!browser) return;
    localStorage.removeItem(STORAGE_KEY);
  }
}