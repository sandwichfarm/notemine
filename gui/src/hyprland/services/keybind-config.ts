import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export interface Keybind {
  id: string;
  key: string;
  modifiers: string[];
  action: string;
  description: string;
  category: string;
  handler?: () => void;
}

export interface KeybindCategory {
  name: string;
  description: string;
}

// Default keybind configuration
const defaultKeybinds: Keybind[] = [
  // Window Management
  { id: 'close-window', key: 'q', modifiers: ['ctrl'], action: 'killActiveWindow', description: 'Close active window', category: 'window-management' },
  { id: 'new-compose', key: 'n', modifiers: ['ctrl'], action: 'createCompose', description: 'New note/composer', category: 'window-management' },
  { id: 'new-feed', key: 'f', modifiers: ['ctrl'], action: 'createFeed', description: 'New feed', category: 'window-management' },
  { id: 'mining-queue', key: 'm', modifiers: ['ctrl'], action: 'createMining', description: 'Mining queue', category: 'window-management' },
  { id: 'mining-overview', key: 'o', modifiers: ['ctrl'], action: 'createMiningOverview', description: 'Mining overview/stats', category: 'window-management' },
  { id: 'relays', key: 'r', modifiers: ['ctrl'], action: 'createRelays', description: 'Relay management', category: 'window-management' },
  { id: 'settings', key: 's', modifiers: ['ctrl'], action: 'createSettings', description: 'Settings', category: 'window-management' },
  { id: 'signer', key: 'i', modifiers: ['ctrl'], action: 'createSigner', description: 'Identity/Signer', category: 'window-management' },
  { id: 'radio', key: 'd', modifiers: ['ctrl'], action: 'createRadio', description: 'Radio', category: 'window-management' },
  { id: 'livestream', key: 'v', modifiers: ['ctrl'], action: 'createLivestream', description: 'Live Stream', category: 'window-management' },
  { id: 'chat', key: 'u', modifiers: ['ctrl'], action: 'createChat', description: 'Ephemeral Chat', category: 'window-management' },
  { id: 'toggle-filters', key: 'g', modifiers: ['ctrl'], action: 'toggleFilters', description: 'Toggle feed filters', category: 'window-management' },
  { id: 'keybinds', key: '?', modifiers: ['ctrl'], action: 'createKeybinds', description: 'Show keybinds', category: 'window-management' },
  { id: 'keybinds-alt', key: '/', modifiers: ['ctrl'], action: 'createKeybinds', description: 'Show keybinds (alternative)', category: 'window-management' },
  { id: 'profile', key: 'p', modifiers: ['ctrl', 'shift'], action: 'createProfile', description: 'User profile viewer', category: 'window-management' },
  
  // Navigation
  { id: 'focus-left', key: 'h', modifiers: ['ctrl'], action: 'focusLeft', description: 'Focus left window', category: 'navigation' },
  { id: 'focus-left-alt', key: 'ArrowLeft', modifiers: ['ctrl'], action: 'focusLeft', description: 'Focus left window (arrow)', category: 'navigation' },
  { id: 'focus-right', key: 'l', modifiers: ['ctrl'], action: 'focusRight', description: 'Focus right window', category: 'navigation' },
  { id: 'focus-right-alt', key: 'ArrowRight', modifiers: ['ctrl'], action: 'focusRight', description: 'Focus right window (arrow)', category: 'navigation' },
  { id: 'focus-up', key: 'k', modifiers: ['ctrl'], action: 'focusUp', description: 'Focus window above', category: 'navigation' },
  { id: 'focus-up-alt', key: 'ArrowUp', modifiers: ['ctrl'], action: 'focusUp', description: 'Focus window above (arrow)', category: 'navigation' },
  { id: 'focus-down', key: 'j', modifiers: ['ctrl'], action: 'focusDown', description: 'Focus window below', category: 'navigation' },
  { id: 'focus-down-alt', key: 'ArrowDown', modifiers: ['ctrl'], action: 'focusDown', description: 'Focus window below (arrow)', category: 'navigation' },
  
  // Window Movement
  { id: 'move-left', key: 'h', modifiers: ['ctrl', 'shift'], action: 'moveLeft', description: 'Move window left', category: 'window-movement' },
  { id: 'move-left-alt', key: 'ArrowLeft', modifiers: ['ctrl', 'shift'], action: 'moveLeft', description: 'Move window left (arrow)', category: 'window-movement' },
  { id: 'move-right', key: 'l', modifiers: ['ctrl', 'shift'], action: 'moveRight', description: 'Move window right', category: 'window-movement' },
  { id: 'move-right-alt', key: 'ArrowRight', modifiers: ['ctrl', 'shift'], action: 'moveRight', description: 'Move window right (arrow)', category: 'window-movement' },
  { id: 'move-up', key: 'k', modifiers: ['ctrl', 'shift'], action: 'moveUp', description: 'Move window up', category: 'window-movement' },
  { id: 'move-up-alt', key: 'ArrowUp', modifiers: ['ctrl', 'shift'], action: 'moveUp', description: 'Move window up (arrow)', category: 'window-movement' },
  { id: 'move-down', key: 'j', modifiers: ['ctrl', 'shift'], action: 'moveDown', description: 'Move window down', category: 'window-movement' },
  { id: 'move-down-alt', key: 'ArrowDown', modifiers: ['ctrl', 'shift'], action: 'moveDown', description: 'Move window down (arrow)', category: 'window-movement' },
  
  // Workspaces
  { id: 'workspace-1', key: '1', modifiers: ['ctrl'], action: 'switchWorkspace1', description: 'Switch to workspace 1', category: 'workspaces' },
  { id: 'workspace-2', key: '2', modifiers: ['ctrl'], action: 'switchWorkspace2', description: 'Switch to workspace 2', category: 'workspaces' },
  { id: 'workspace-3', key: '3', modifiers: ['ctrl'], action: 'switchWorkspace3', description: 'Switch to workspace 3', category: 'workspaces' },
  { id: 'workspace-4', key: '4', modifiers: ['ctrl'], action: 'switchWorkspace4', description: 'Switch to workspace 4', category: 'workspaces' },
  { id: 'workspace-5', key: '5', modifiers: ['ctrl'], action: 'switchWorkspace5', description: 'Switch to workspace 5', category: 'workspaces' },
  { id: 'workspace-6', key: '6', modifiers: ['ctrl'], action: 'switchWorkspace6', description: 'Switch to workspace 6', category: 'workspaces' },
  { id: 'workspace-7', key: '7', modifiers: ['ctrl'], action: 'switchWorkspace7', description: 'Switch to workspace 7', category: 'workspaces' },
  { id: 'workspace-8', key: '8', modifiers: ['ctrl'], action: 'switchWorkspace8', description: 'Switch to workspace 8', category: 'workspaces' },
  { id: 'workspace-9', key: '9', modifiers: ['ctrl'], action: 'switchWorkspace9', description: 'Switch to workspace 9', category: 'workspaces' },
  { id: 'workspace-10', key: '0', modifiers: ['ctrl'], action: 'switchWorkspace10', description: 'Switch to workspace 10', category: 'workspaces' },
  
  // Special Actions  
  // { id: 'test-hotkey', key: 't', modifiers: ['ctrl'], action: 'testHotkey', description: 'Test hotkey (debug)', category: 'special-actions' },
  { id: 'toggle-floating', key: ' ', modifiers: ['ctrl'], action: 'toggleFloating', description: 'Toggle window floating', category: 'special-actions' },
  { id: 'toggle-fullscreen', key: 'f', modifiers: ['ctrl', 'shift'], action: 'toggleFullscreen', description: 'Toggle fullscreen', category: 'special-actions' },
  { id: 'submit-note', key: 'Enter', modifiers: ['ctrl'], action: 'submitNote', description: 'Submit note in composer', category: 'special-actions' },
  { id: 'toggle-pin', key: 'p', modifiers: ['ctrl'], action: 'togglePin', description: 'Toggle pin window', category: 'special-actions' },
  { id: 'center-window', key: 'c', modifiers: ['ctrl'], action: 'centerWindow', description: 'Center floating window', category: 'special-actions' },
  { id: 'cycle-next', key: 'Tab', modifiers: ['ctrl'], action: 'cycleNext', description: 'Cycle to next window', category: 'special-actions' },
  { id: 'cycle-prev', key: 'Tab', modifiers: ['ctrl', 'shift'], action: 'cyclePrev', description: 'Cycle to previous window', category: 'special-actions' },
  { id: 'radio-next', key: 'n', modifiers: [], action: 'radioNext', description: 'Next radio station (when focused)', category: 'special-actions' },
  { id: 'relay-add', key: 'a', modifiers: [], action: 'relayAdd', description: 'Add relay (when relay window focused)', category: 'relay-actions' },
  { id: 'relay-remove', key: 'r', modifiers: [], action: 'relayRemove', description: 'Remove selected relay (when relay window focused)', category: 'relay-actions' },
  { id: 'relay-discover', key: 'd', modifiers: [], action: 'relayDiscover', description: 'Discover relays (when relay window focused)', category: 'relay-actions' },
  { id: 'relay-test', key: 't', modifiers: [], action: 'relayTest', description: 'Test selected relay (when relay window focused)', category: 'relay-actions' },
  { id: 'relay-clear', key: 'c', modifiers: [], action: 'relayClear', description: 'Clear search (when relay window focused)', category: 'relay-actions' },
  { id: 'relay-search', key: '/', modifiers: [], action: 'relaySearch', description: 'Focus search (when relay window focused)', category: 'relay-actions' },
  
  // Window Resizing
  { id: 'resize-shrink-width', key: 'h', modifiers: ['ctrl', 'alt'], action: 'resizeShrinkWidth', description: 'Shrink window width', category: 'window-resizing' },
  { id: 'resize-shrink-width-alt', key: 'ArrowLeft', modifiers: ['ctrl', 'alt'], action: 'resizeShrinkWidth', description: 'Shrink window width (arrow)', category: 'window-resizing' },
  { id: 'resize-grow-width', key: 'l', modifiers: ['ctrl', 'alt'], action: 'resizeGrowWidth', description: 'Grow window width', category: 'window-resizing' },
  { id: 'resize-grow-width-alt', key: 'ArrowRight', modifiers: ['ctrl', 'alt'], action: 'resizeGrowWidth', description: 'Grow window width (arrow)', category: 'window-resizing' },
  { id: 'resize-shrink-height', key: 'k', modifiers: ['ctrl', 'alt'], action: 'resizeShrinkHeight', description: 'Shrink window height', category: 'window-resizing' },
  { id: 'resize-shrink-height-alt', key: 'ArrowUp', modifiers: ['ctrl', 'alt'], action: 'resizeShrinkHeight', description: 'Shrink window height (arrow)', category: 'window-resizing' },
  { id: 'resize-grow-height', key: 'j', modifiers: ['ctrl', 'alt'], action: 'resizeGrowHeight', description: 'Grow window height', category: 'window-resizing' },
  { id: 'resize-grow-height-alt', key: 'ArrowDown', modifiers: ['ctrl', 'alt'], action: 'resizeGrowHeight', description: 'Grow window height (arrow)', category: 'window-resizing' },
  
  // Move to workspace
  { id: 'move-to-workspace-1', key: '1', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace1', description: 'Move window to workspace 1', category: 'workspace-movement' },
  { id: 'move-to-workspace-2', key: '2', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace2', description: 'Move window to workspace 2', category: 'workspace-movement' },
  { id: 'move-to-workspace-3', key: '3', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace3', description: 'Move window to workspace 3', category: 'workspace-movement' },
  { id: 'move-to-workspace-4', key: '4', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace4', description: 'Move window to workspace 4', category: 'workspace-movement' },
  { id: 'move-to-workspace-5', key: '5', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace5', description: 'Move window to workspace 5', category: 'workspace-movement' },
  { id: 'move-to-workspace-6', key: '6', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace6', description: 'Move window to workspace 6', category: 'workspace-movement' },
  { id: 'move-to-workspace-7', key: '7', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace7', description: 'Move window to workspace 7', category: 'workspace-movement' },
  { id: 'move-to-workspace-8', key: '8', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace8', description: 'Move window to workspace 8', category: 'workspace-movement' },
  { id: 'move-to-workspace-9', key: '9', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace9', description: 'Move window to workspace 9', category: 'workspace-movement' },
  { id: 'move-to-workspace-10', key: '0', modifiers: ['ctrl', 'shift'], action: 'moveToWorkspace10', description: 'Move window to workspace 10', category: 'workspace-movement' },
  { id: 'move-to-prev-workspace', key: '[', modifiers: ['ctrl', 'shift'], action: 'moveToPrevWorkspace', description: 'Move window to previous workspace', category: 'workspace-movement' },
  { id: 'move-to-next-workspace', key: ']', modifiers: ['ctrl', 'shift'], action: 'moveToNextWorkspace', description: 'Move window to next workspace', category: 'workspace-movement' },
  
  // System actions
  { id: 'minimize-all', key: 'm', modifiers: ['ctrl', 'alt', 'shift'], action: 'minimizeAll', description: 'Minimize all windows', category: 'system-actions' },
];

const categories: Record<string, KeybindCategory> = {
  'window-management': { name: 'Window Management', description: 'Create, close, and manage windows' },
  'navigation': { name: 'Navigation', description: 'Move focus between windows' },
  'window-movement': { name: 'Window Movement', description: 'Move windows around the screen' },
  'window-resizing': { name: 'Window Resizing', description: 'Resize windows' },
  'workspaces': { name: 'Workspaces', description: 'Switch between workspaces' },
  'workspace-movement': { name: 'Workspace Movement', description: 'Move windows between workspaces' },
  'special-actions': { name: 'Special Actions', description: 'Special window actions' },
  'relay-actions': { name: 'Relay Actions', description: 'Relay management (when relay window focused)' },
  'system-actions': { name: 'System Actions', description: 'System-wide actions' },
};

// Create store for keybinds
function createKeybindStore() {
  const STORAGE_KEY = 'notemine-keybinds';
  
  // Load keybinds from localStorage or use defaults
  let initialKeybinds = defaultKeybinds;
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        initialKeybinds = JSON.parse(stored);
      } catch (error) {
        console.error('Failed to parse stored keybinds:', error);
      }
    }
  }
  
  const { subscribe, set, update } = writable<Keybind[]>(initialKeybinds);
  
  return {
    subscribe,
    set: (keybinds: Keybind[]) => {
      set(keybinds);
      if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(keybinds));
      }
    },
    update: (updater: (keybinds: Keybind[]) => Keybind[]) => {
      update((keybinds) => {
        const newKeybinds = updater(keybinds);
        if (browser) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newKeybinds));
        }
        return newKeybinds;
      });
    },
    reset: () => {
      set(defaultKeybinds);
      if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultKeybinds));
      }
    },
    updateKeybind: (id: string, updates: Partial<Keybind>) => {
      update((keybinds) => {
        const newKeybinds = keybinds.map(kb => 
          kb.id === id ? { ...kb, ...updates } : kb
        );
        if (browser) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newKeybinds));
        }
        return newKeybinds;
      });
    }
  };
}

export const keybindStore = createKeybindStore();

// Derived store for keybinds grouped by category
export const keybindsByCategory = derived(
  keybindStore,
  ($keybinds) => {
    const grouped: Record<string, Keybind[]> = {};
    
    for (const keybind of $keybinds) {
      if (!grouped[keybind.category]) {
        grouped[keybind.category] = [];
      }
      grouped[keybind.category].push(keybind);
    }
    
    return grouped;
  }
);

// Helper to get keybind by action
export function getKeybindByAction(keybinds: Keybind[], action: string): Keybind | undefined {
  return keybinds.find(kb => kb.action === action);
}

// Helper to check if a key combination matches a keybind
export function matchesKeybind(event: KeyboardEvent, keybind: Keybind): boolean {
  const keyMatch = event.key.toLowerCase() === keybind.key.toLowerCase() || event.key === keybind.key;
  
  const modifiersMatch = keybind.modifiers.every(mod => {
    switch (mod) {
      case 'ctrl':
        return event.ctrlKey || event.metaKey;
      case 'shift':
        return event.shiftKey;
      case 'alt':
        return event.altKey;
      default:
        return false;
    }
  });
  
  // Check that no extra modifiers are pressed
  const hasExtraModifiers = 
    (event.ctrlKey || event.metaKey) && !keybind.modifiers.includes('ctrl') ||
    event.shiftKey && !keybind.modifiers.includes('shift') ||
    event.altKey && !keybind.modifiers.includes('alt');
  
  const matches = keyMatch && modifiersMatch && !hasExtraModifiers;
  
  // Debug logging for failed matches
  if (!matches && (event.ctrlKey || event.metaKey)) {
    console.log('Keybind match failed for', keybind.key, keybind.modifiers, ':', {
      keyMatch,
      modifiersMatch,
      hasExtraModifiers,
      eventKey: event.key,
      eventModifiers: {
        ctrl: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey
      }
    });
  }
  
  return matches;
}

export { categories };