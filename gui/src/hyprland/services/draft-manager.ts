import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface Draft {
  id: string;
  windowId: string;
  content: string;
  title: string;
  created: number;
  modified: number;
}

class DraftManagerService {
  public drafts = writable<Draft[]>([]);
  private storageKey = 'notemine-drafts';

  constructor() {
    if (browser) {
      this.loadDrafts();
    }
  }

  /**
   * Load drafts from localStorage
   */
  private loadDrafts() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const drafts = JSON.parse(stored);
        this.drafts.set(drafts);
      }
    } catch (error) {
      console.error('Failed to load drafts:', error);
    }
  }

  /**
   * Save drafts to localStorage
   */
  private saveDrafts(drafts: Draft[]) {
    if (!browser) return;
    
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(drafts));
    } catch (error) {
      console.error('Failed to save drafts:', error);
    }
  }

  /**
   * Create or update a draft
   */
  saveDraft(windowId: string, content: string, title: string): string {
    const now = Date.now();
    let draftId: string;

    this.drafts.update(drafts => {
      // Find existing draft for this window
      const existingIndex = drafts.findIndex(d => d.windowId === windowId);
      
      if (existingIndex >= 0) {
        // Update existing draft
        drafts[existingIndex].content = content;
        drafts[existingIndex].title = title;
        drafts[existingIndex].modified = now;
        draftId = drafts[existingIndex].id;
      } else {
        // Create new draft
        draftId = crypto.randomUUID();
        const newDraft: Draft = {
          id: draftId,
          windowId,
          content,
          title,
          created: now,
          modified: now
        };
        drafts.push(newDraft);
      }

      this.saveDrafts(drafts);
      return drafts;
    });

    return draftId!;
  }

  /**
   * Get draft for a specific window
   */
  getDraftForWindow(windowId: string): Draft | null {
    let result: Draft | null = null;
    
    this.drafts.subscribe(drafts => {
      result = drafts.find(d => d.windowId === windowId) || null;
    })();
    
    return result;
  }

  /**
   * Delete a draft
   */
  deleteDraft(draftId: string) {
    this.drafts.update(drafts => {
      const filtered = drafts.filter(d => d.id !== draftId);
      this.saveDrafts(filtered);
      return filtered;
    });
  }

  /**
   * Delete draft by window ID
   */
  deleteDraftForWindow(windowId: string) {
    this.drafts.update(drafts => {
      const filtered = drafts.filter(d => d.windowId !== windowId);
      this.saveDrafts(filtered);
      return filtered;
    });
  }

  /**
   * Auto-save draft (debounced)
   */
  autoSave(windowId: string, content: string, title: string) {
    // Clear existing timeout for this window
    if (this.autoSaveTimeouts.has(windowId)) {
      clearTimeout(this.autoSaveTimeouts.get(windowId));
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      if (content.trim()) {
        this.saveDraft(windowId, content, title);
        console.log('Auto-saved draft for', title);
      }
      this.autoSaveTimeouts.delete(windowId);
    }, 2000); // Auto-save after 2 seconds of inactivity

    this.autoSaveTimeouts.set(windowId, timeoutId);
  }

  private autoSaveTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Clear auto-save timeout for a window
   */
  clearAutoSave(windowId: string) {
    const timeoutId = this.autoSaveTimeouts.get(windowId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.autoSaveTimeouts.delete(windowId);
    }
  }

  /**
   * Get all drafts sorted by modification date
   */
  getAllDrafts(): Draft[] {
    let result: Draft[] = [];
    this.drafts.subscribe(drafts => {
      result = [...drafts].sort((a, b) => b.modified - a.modified);
    })();
    return result;
  }

  /**
   * Clear all drafts
   */
  clearAllDrafts() {
    this.drafts.set([]);
    if (browser) {
      localStorage.removeItem(this.storageKey);
    }
  }
}

export const draftManager = new DraftManagerService();