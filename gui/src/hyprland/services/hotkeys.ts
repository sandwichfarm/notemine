/**
 * Centralized hotkey definitions and management for Hyprland interface
 */

export interface HotkeyDefinition {
  key: string;
  modifiers: string[];
  action: string;
  description: string;
  category: 'window' | 'navigation' | 'workspace' | 'special';
  handler: () => void;
}

export interface HotkeyCategory {
  name: string;
  description: string;
  hotkeys: HotkeyDefinition[];
}

export class HotkeyManager {
  private hotkeys: Map<string, HotkeyDefinition> = new Map();
  private listeners: Set<(event: KeyboardEvent) => void> = new Set();

  constructor() {
    // Don't set up global listener here - let HyprlandInterface handle it
    // this.setupGlobalListener();
  }

  /**
   * Register a hotkey
   */
  register(hotkey: HotkeyDefinition): void {
    const key = this.getHotkeyKey(hotkey);
    this.hotkeys.set(key, hotkey);
  }

  /**
   * Register multiple hotkeys
   */
  registerAll(hotkeys: HotkeyDefinition[]): void {
    hotkeys.forEach(hotkey => this.register(hotkey));
  }

  /**
   * Get all hotkeys grouped by category
   */
  getHotkeysByCategory(): HotkeyCategory[] {
    const categories = new Map<string, HotkeyDefinition[]>();
    
    for (const hotkey of this.hotkeys.values()) {
      if (!categories.has(hotkey.category)) {
        categories.set(hotkey.category, []);
      }
      categories.get(hotkey.category)!.push(hotkey);
    }

    const categoryInfo = {
      window: { name: 'Window Management', description: 'Create, close, and manage windows' },
      navigation: { name: 'Navigation', description: 'Move focus between windows' },
      workspace: { name: 'Workspaces', description: 'Switch and manage workspaces' },
      special: { name: 'Special Functions', description: 'System and utility functions' }
    };

    return Array.from(categories.entries()).map(([category, hotkeys]) => ({
      name: categoryInfo[category as keyof typeof categoryInfo]?.name || category,
      description: categoryInfo[category as keyof typeof categoryInfo]?.description || '',
      hotkeys: hotkeys.sort((a, b) => a.key.localeCompare(b.key))
    }));
  }

  /**
   * Handle keyboard event
   */
  handleKeyEvent(event: KeyboardEvent): boolean {
    const key = this.getEventKey(event);
    const hotkey = this.hotkeys.get(key);
    
    if (hotkey) {
      event.preventDefault();
      event.stopPropagation();
      console.log('Executing hotkey:', hotkey.description);
      hotkey.handler();
      return true;
    }
    
    return false;
  }

  /**
   * Get formatted hotkey string for display
   */
  getHotkeyDisplay(hotkey: HotkeyDefinition): string {
    const modStr = hotkey.modifiers.map(mod => {
      switch (mod) {
        case 'ctrl': return '⌃';
        case 'cmd': return '⌘';
        case 'alt': return '⌥';
        case 'shift': return '⇧';
        default: return mod.toUpperCase();
      }
    }).join('');
    
    const keyStr = hotkey.key === ' ' ? 'Space' : hotkey.key.toUpperCase();
    return `${modStr}${keyStr}`;
  }

  private getHotkeyKey(hotkey: HotkeyDefinition): string {
    const modifiers = [...hotkey.modifiers].sort().join('+');
    return `${modifiers}+${hotkey.key.toLowerCase()}`;
  }

  private getEventKey(event: KeyboardEvent): string {
    const modifiers: string[] = [];
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.metaKey) modifiers.push('cmd');
    if (event.altKey) modifiers.push('alt');
    if (event.shiftKey) modifiers.push('shift');
    
    const key = event.key.toLowerCase();
    return `${modifiers.sort().join('+')}+${key}`;
  }

  private setupGlobalListener(): void {
    if (typeof window === 'undefined') return;
    
    const handler = (event: KeyboardEvent) => {
      this.handleKeyEvent(event);
    };
    
    window.addEventListener('keydown', handler);
  }
}

export const hotkeyManager = new HotkeyManager();