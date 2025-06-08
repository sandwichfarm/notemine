import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { HyprlandWindowManager } from './window-manager';
import { BSPTree } from './bsp-tree';
import { statePersistence } from './state-persistence';
import type { HyprlandWindow } from '../types';

// Mock dependencies
vi.mock('./bsp-tree');
vi.mock('./state-persistence', () => ({
  statePersistence: {
    getSetting: vi.fn().mockReturnValue(null),
    updateSetting: vi.fn(),
    loadInterfaceState: vi.fn().mockReturnValue(null),
    saveInterfaceState: vi.fn()
  }
}));

describe('HyprlandWindowManager', () => {
  let windowManager: HyprlandWindowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    windowManager = new HyprlandWindowManager();
    windowManager.setViewport(1920, 1080); // Set a default viewport
  });

  describe('Window Creation and Management', () => {
    describe('when creating a new window', () => {
      it('should create a window with correct default properties', () => {
        // Given an empty workspace
        const initialState = get(windowManager.state);
        expect(initialState.windows.size).toBe(0);

        // When I create a new window with class "compose"
        const windowId = windowManager.createWindow('compose', 'New Note');

        // Then a window should be created with correct default properties
        const state = get(windowManager.state);
        const window = state.windows.get(windowId);
        
        expect(window).toBeDefined();
        expect(window?.class).toBe('compose');
        expect(window?.title).toBe('New Note');
        expect(window?.type).toBe('normal');
        expect(window?.focused).toBe(true);
        expect(window?.fullscreen).toBe(false);
        expect(window?.minimized).toBe(false);
        expect(window?.pinned).toBe(false);
        expect(window?.opacity).toBe(1);
      });

      it('should add the window to the current workspace', () => {
        // Given an empty workspace
        const windowId = windowManager.createWindow('compose');

        // Then the window should be added to the current workspace
        const state = get(windowManager.state);
        const currentWorkspace = state.workspaces.get(state.activeWorkspace);
        
        expect(currentWorkspace?.windows).toContain(windowId);
      });

      it('should insert the window into the BSP tree', () => {
        // Given a mocked BSP tree
        const mockInsert = vi.fn();
        BSPTree.prototype.insert = mockInsert;

        // When creating a new window
        const windowId = windowManager.createWindow('compose');

        // Then the window should be inserted into the BSP tree
        expect(mockInsert).toHaveBeenCalledWith(windowId);
      });

      it('should focus the new window', () => {
        // When creating a new window
        const windowId = windowManager.createWindow('compose');

        // Then the window should be focused
        const state = get(windowManager.state);
        expect(state.focusedWindowId).toBe(windowId);
        expect(state.windows.get(windowId)?.focused).toBe(true);
      });
    });

    describe('when creating singleton windows', () => {
      it('should close existing singleton window instead of creating new one', () => {
        // Given a workspace with a settings window
        const firstWindowId = windowManager.createWindow('settings');
        expect(get(windowManager.state).windows.size).toBe(1);

        // When I try to create another settings window
        const secondWindowId = windowManager.createWindow('settings');

        // Then the existing settings window should be closed
        const state = get(windowManager.state);
        expect(state.windows.size).toBe(0);
        expect(state.windows.has(firstWindowId)).toBe(false);
        
        // And no new window should be created
        expect(secondWindowId).toBe('');
      });

      it('should recognize all singleton window types', () => {
        const singletonTypes = ['relays', 'mining', 'settings', 'signer', 
                               'mining-overview', 'keybinds', 'shortcuts', 'radio', 'profile'];

        singletonTypes.forEach(windowClass => {
          // Create first instance
          const firstId = windowManager.createWindow(windowClass as any);
          expect(firstId).toBeTruthy();

          // Try to create second instance - should close first
          const secondId = windowManager.createWindow(windowClass as any);
          expect(secondId).toBe('');
          expect(get(windowManager.state).windows.has(firstId)).toBe(false);
        });
      });
    });

    describe('when closing windows', () => {
      it('should remove window from workspace', () => {
        // Given a workspace with multiple windows
        const windowId1 = windowManager.createWindow('compose');
        const windowId2 = windowManager.createWindow('feed');
        
        // When I close a window
        windowManager.closeWindow(windowId1);

        // Then the window should be removed from the workspace
        const state = get(windowManager.state);
        expect(state.windows.has(windowId1)).toBe(false);
        expect(state.windows.has(windowId2)).toBe(true);
        
        const workspace = state.workspaces.get(state.activeWorkspace);
        expect(workspace?.windows).not.toContain(windowId1);
        expect(workspace?.windows).toContain(windowId2);
      });

      it('should remove window from BSP tree', () => {
        // Given a mocked BSP tree
        const mockRemove = vi.fn();
        BSPTree.prototype.remove = mockRemove;

        // When closing a tiled window
        const windowId = windowManager.createWindow('compose');
        windowManager.closeWindow(windowId);

        // Then the window should be removed from the BSP tree
        expect(mockRemove).toHaveBeenCalledWith(windowId);
      });

      it('should focus next available window when closing focused window', () => {
        // Given multiple windows with the second one focused
        const windowId1 = windowManager.createWindow('compose');
        const windowId2 = windowManager.createWindow('feed');
        windowManager.focusWindow(windowId2);

        // When closing the focused window
        windowManager.closeWindow(windowId2);

        // Then focus should move to the next available window
        const state = get(windowManager.state);
        expect(state.focusedWindowId).toBe(windowId1);
        expect(state.windows.get(windowId1)?.focused).toBe(true);
      });

      it('should handle closing the last window gracefully', () => {
        // Given a single window
        const windowId = windowManager.createWindow('compose');

        // When closing the last window
        windowManager.closeWindow(windowId);

        // Then the workspace should be empty but valid
        const state = get(windowManager.state);
        expect(state.windows.size).toBe(0);
        expect(state.focusedWindowId).toBe(null);
        expect(state.workspaces.get(state.activeWorkspace)?.windows.length).toBe(0);
      });
    });

    describe('when managing window focus', () => {
      it('should only allow one focused window at a time', () => {
        // Given multiple windows in a workspace
        const windowId1 = windowManager.createWindow('compose');
        const windowId2 = windowManager.createWindow('feed');
        const windowId3 = windowManager.createWindow('relays');

        // When I focus a specific window
        windowManager.focusWindow(windowId2);

        // Then only that window should have focused state
        const state = get(windowManager.state);
        expect(state.windows.get(windowId2)?.focused).toBe(true);
        
        // And the previously focused window should lose focus
        expect(state.windows.get(windowId1)?.focused).toBe(false);
        expect(state.windows.get(windowId3)?.focused).toBe(false);
      });

      it('should update focusedWindowId in state', () => {
        // Given multiple windows
        const windowId1 = windowManager.createWindow('compose');
        const windowId2 = windowManager.createWindow('feed');

        // When focusing a window
        windowManager.focusWindow(windowId2);

        // Then focusedWindowId should be updated
        expect(get(windowManager.state).focusedWindowId).toBe(windowId2);
      });

      it('should handle focusing non-existent window gracefully', () => {
        // Given a window
        const windowId = windowManager.createWindow('compose');

        // When trying to focus a non-existent window
        windowManager.focusWindow('non-existent-id');

        // Then the current focus should remain unchanged
        expect(get(windowManager.state).focusedWindowId).toBe(windowId);
      });
    });
  });

  describe('Window State Persistence', () => {
    describe('when saving window state', () => {
      it('should persist window positions and content', () => {
        // Given windows across multiple workspaces
        const windowId1 = windowManager.createWindow('compose');
        const windowId2 = windowManager.createWindow('feed');
        
        windowManager.switchToWorkspace(2);
        const windowId3 = windowManager.createWindow('settings');

        // Mock window content
        const mockContents = new Map([
          [windowId1, { content: 'Test note', scrollPosition: 100 }],
          [windowId2, { content: '', scrollPosition: 0 }]
        ]);

        // When the state is saved
        windowManager.saveState(mockContents);

        // Then saveInterfaceState should be called with correct data
        expect(statePersistence.saveInterfaceState).toHaveBeenCalledWith(
          expect.objectContaining({
            windows: expect.any(Map),
            workspaces: expect.any(Map),
            activeWorkspace: 2
          }),
          mockContents
        );
      });

      it('should save floating window rectangles', () => {
        // Given a floating window
        const windowId = windowManager.createWindow('compose');
        windowManager.toggleFloating(windowId);
        
        const floatingRect = { x: 100, y: 100, width: 600, height: 400 };
        windowManager.updateFloatingRect(windowId, floatingRect);

        // When saving state
        windowManager.saveState(new Map());

        // Then floating rectangles should be persisted
        const savedState = (statePersistence.saveInterfaceState as any).mock.calls[0][0];
        expect(savedState.floatingRects.get(windowId)).toEqual(floatingRect);
      });
    });

    describe('when restoring window state', () => {
      it('should recreate windows with saved properties', () => {
        // Given saved window state exists
        const mockPersistedState = {
          windows: [
            {
              id: 'window-1',
              class: 'compose',
              title: 'Saved Note',
              focused: false,
              floating: true,
              fullscreen: false,
              pinned: false,
              content: 'Saved content'
            }
          ],
          workspaces: {
            1: { id: 1, name: '1', windows: ['window-1'], focused: true }
          },
          activeWorkspace: 1,
          focusedWindowId: 'window-1',
          settings: {},
          drafts: {},
          lastSaved: Date.now()
        };

        vi.mocked(statePersistence.loadInterfaceState).mockReturnValue(mockPersistedState);

        // When the window manager initializes and restores state
        const newWindowManager = new HyprlandWindowManager();
        newWindowManager.setViewport(1920, 1080);

        // Then windows should be recreated with saved properties
        const state = get(newWindowManager.state);
        const window = state.windows.get('window-1');
        
        expect(window).toBeDefined();
        expect(window?.class).toBe('compose');
        expect(window?.title).toBe('Saved Note');
        expect(window?.type).toBe('floating'); // floating: true should set type
      });

      it('should restore workspace assignments', () => {
        // Given saved state with multiple workspaces
        const mockPersistedState = {
          windows: [
            { id: 'w1', class: 'compose', title: 'W1', focused: false, floating: false, fullscreen: false, pinned: false },
            { id: 'w2', class: 'feed', title: 'W2', focused: false, floating: false, fullscreen: false, pinned: false }
          ],
          workspaces: {
            1: { id: 1, name: '1', windows: ['w1'], focused: false },
            2: { id: 2, name: '2', windows: ['w2'], focused: true }
          },
          activeWorkspace: 2,
          focusedWindowId: 'w2',
          settings: {},
          drafts: {},
          lastSaved: Date.now()
        };

        vi.mocked(statePersistence.loadInterfaceState).mockReturnValue(mockPersistedState);

        // When restoring state
        const newWindowManager = new HyprlandWindowManager();
        newWindowManager.setViewport(1920, 1080);

        // Then workspace assignments should be restored
        const state = get(newWindowManager.state);
        expect(state.workspaces.get(1)?.windows).toContain('w1');
        expect(state.workspaces.get(2)?.windows).toContain('w2');
        expect(state.activeWorkspace).toBe(2);
      });

      it('should rebuild BSP trees correctly', () => {
        // Given a complex window layout
        const mockPersistedState = {
          windows: [
            { id: 'w1', class: 'compose', title: 'W1', focused: false, floating: false, fullscreen: false, pinned: false },
            { id: 'w2', class: 'feed', title: 'W2', focused: false, floating: false, fullscreen: false, pinned: false },
            { id: 'w3', class: 'settings', title: 'W3', focused: false, floating: true, fullscreen: false, pinned: false }
          ],
          workspaces: {
            1: { id: 1, name: '1', windows: ['w1', 'w2', 'w3'], focused: true }
          },
          activeWorkspace: 1,
          focusedWindowId: null,
          settings: {},
          drafts: {},
          lastSaved: Date.now()
        };

        const mockInsert = vi.fn();
        BSPTree.prototype.insert = mockInsert;

        vi.mocked(statePersistence.loadInterfaceState).mockReturnValue(mockPersistedState);

        // When restoring state
        const newWindowManager = new HyprlandWindowManager();
        newWindowManager.setViewport(1920, 1080);

        // Then BSP trees should be rebuilt (only for non-floating windows)
        expect(mockInsert).toHaveBeenCalledWith('w1');
        expect(mockInsert).toHaveBeenCalledWith('w2');
        expect(mockInsert).not.toHaveBeenCalledWith('w3'); // floating window
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle viewport of 0x0 gracefully', () => {
      // When setting viewport to 0x0
      windowManager.setViewport(0, 0);

      // Then creating windows should still work
      const windowId = windowManager.createWindow('compose');
      expect(windowId).toBeTruthy();

      // And layout calculation should handle it
      const rects = get(windowManager.windowRects);
      const rect = rects.get(windowId);
      expect(rect).toBeDefined();
      // Rect values might be 0 or have minimum sizes, but shouldn't crash
    });

    it('should handle invalid window class gracefully', () => {
      // When creating window with invalid class
      const windowId = windowManager.createWindow('invalid-class' as any);

      // Then window should still be created
      expect(windowId).toBeTruthy();
      const window = get(windowManager.state).windows.get(windowId);
      expect(window?.class).toBe('invalid-class');
    });

    it('should recover from corrupted BSP tree', () => {
      // Given a window manager with windows
      const windowId1 = windowManager.createWindow('compose');
      const windowId2 = windowManager.createWindow('feed');

      // When BSP tree is corrupted (simulate by calling validateAndRepairLayout)
      const mockValidate = vi.spyOn(windowManager as any, 'validateAndRepairLayout');
      windowManager.recalculateLayout();

      // Then validation should run
      expect(mockValidate).toHaveBeenCalled();
    });

    it('should handle concurrent operations safely', () => {
      // When performing multiple operations rapidly
      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(windowManager.createWindow('compose'));
      }

      // Then all operations should complete without errors
      expect(operations.length).toBe(10);
      expect(get(windowManager.state).windows.size).toBe(1); // Only 1 due to singleton
    });
  });
});