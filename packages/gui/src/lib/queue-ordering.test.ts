import { describe, it, expect } from 'vitest';
import { computeInsertionIndex, shouldPreempt, type QueueOrderingStrategy } from './queue-ordering';
import type { QueueItem } from '../types/queue';

// Helper to create test queue items
function createQueueItem(id: string, difficulty: number, status: QueueItem['status'] = 'queued'): QueueItem {
  return {
    id,
    type: 'note',
    content: `Test content ${id}`,
    pubkey: 'testpubkey',
    difficulty,
    kind: 1,
    status,
    createdAt: Date.now(),
  };
}

describe('computeInsertionIndex', () => {
  describe('lowDifficultyFirst strategy', () => {
    const strategy: QueueOrderingStrategy = 'lowDifficultyFirst';

    it('should insert at beginning when no queued items exist', () => {
      const items: QueueItem[] = [];
      const newItem = createQueueItem('new', 21);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(0);
    });

    it('should insert before first item with higher difficulty', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21),
        createQueueItem('item2', 25),
        createQueueItem('item3', 30),
      ];
      const newItem = createQueueItem('new', 23);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(1); // Before item2 (25)
    });

    it('should append when new item has highest difficulty', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21),
        createQueueItem('item2', 25),
        createQueueItem('item3', 30),
      ];
      const newItem = createQueueItem('new', 35);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(3); // After item3
    });

    it('should insert at front when new item has lowest difficulty', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21),
        createQueueItem('item2', 25),
        createQueueItem('item3', 30),
      ];
      const newItem = createQueueItem('new', 18);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(0); // Before item1
    });

    it('should handle equal difficulty by appending after same-difficulty items', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21),
        createQueueItem('item2', 21),
        createQueueItem('item3', 30),
      ];
      const newItem = createQueueItem('new', 21);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(2); // After item2, before item3
    });

    it('should skip non-queued items when computing position', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21, 'queued'),
        createQueueItem('item2', 25, 'completed'),
        createQueueItem('item3', 30, 'queued'),
      ];
      const newItem = createQueueItem('new', 23);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(2); // Before item3, ignoring completed item2
    });

    it('should handle all non-queued items by inserting at beginning', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21, 'completed'),
        createQueueItem('item2', 25, 'failed'),
        createQueueItem('item3', 30, 'skipped'),
      ];
      const newItem = createQueueItem('new', 23);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(0);
    });
  });

  describe('fifo strategy', () => {
    const strategy: QueueOrderingStrategy = 'fifo';

    it('should append after last queued item', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21),
        createQueueItem('item2', 25),
        createQueueItem('item3', 30),
      ];
      const newItem = createQueueItem('new', 18); // Lower difficulty doesn't matter
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(3); // After all items
    });

    it('should insert at beginning when no queued items', () => {
      const items: QueueItem[] = [];
      const newItem = createQueueItem('new', 21);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(0);
    });

    it('should append after last queued item, ignoring completed items', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21, 'queued'),
        createQueueItem('item2', 25, 'queued'),
        createQueueItem('item3', 30, 'completed'),
      ];
      const newItem = createQueueItem('new', 18);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(2); // After item2, the last queued item
    });

    it('should handle mixed queued and non-queued items', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21, 'completed'),
        createQueueItem('item2', 25, 'queued'),
        createQueueItem('item3', 30, 'failed'),
        createQueueItem('item4', 35, 'queued'),
      ];
      const newItem = createQueueItem('new', 40);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(4); // After item4, the last queued item
    });
  });

  describe('lifo strategy', () => {
    const strategy: QueueOrderingStrategy = 'lifo';

    it('should insert before first queued item', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21),
        createQueueItem('item2', 25),
        createQueueItem('item3', 30),
      ];
      const newItem = createQueueItem('new', 35); // Higher difficulty doesn't matter
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(0); // Before item1
    });

    it('should insert at beginning when no queued items', () => {
      const items: QueueItem[] = [];
      const newItem = createQueueItem('new', 21);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(0);
    });

    it('should insert before first queued item, ignoring completed items', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21, 'completed'),
        createQueueItem('item2', 25, 'queued'),
        createQueueItem('item3', 30, 'queued'),
      ];
      const newItem = createQueueItem('new', 18);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(1); // Before item2, the first queued item
    });

    it('should handle all non-queued items by inserting at beginning', () => {
      const items: QueueItem[] = [
        createQueueItem('item1', 21, 'completed'),
        createQueueItem('item2', 25, 'failed'),
      ];
      const newItem = createQueueItem('new', 30);
      const index = computeInsertionIndex(items, newItem, strategy);
      expect(index).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle single queued item with lowDifficultyFirst', () => {
      const items: QueueItem[] = [createQueueItem('item1', 25)];
      const newItemLower = createQueueItem('new', 20);
      const newItemHigher = createQueueItem('new', 30);

      expect(computeInsertionIndex(items, newItemLower, 'lowDifficultyFirst')).toBe(0);
      expect(computeInsertionIndex(items, newItemHigher, 'lowDifficultyFirst')).toBe(1);
    });

    it('should handle single queued item with fifo', () => {
      const items: QueueItem[] = [createQueueItem('item1', 25)];
      const newItem = createQueueItem('new', 20);

      expect(computeInsertionIndex(items, newItem, 'fifo')).toBe(1);
    });

    it('should handle single queued item with lifo', () => {
      const items: QueueItem[] = [createQueueItem('item1', 25)];
      const newItem = createQueueItem('new', 20);

      expect(computeInsertionIndex(items, newItem, 'lifo')).toBe(0);
    });
  });
});

describe('shouldPreempt', () => {
  describe('lowDifficultyFirst strategy', () => {
    const strategy: QueueOrderingStrategy = 'lowDifficultyFirst';

    it('should preempt when new item has lower difficulty', () => {
      const activeItem = createQueueItem('active', 30, 'queued');
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(activeItem, newItem, strategy)).toBe(true);
    });

    it('should not preempt when new item has higher difficulty', () => {
      const activeItem = createQueueItem('active', 21, 'queued');
      const newItem = createQueueItem('new', 30);

      expect(shouldPreempt(activeItem, newItem, strategy)).toBe(false);
    });

    it('should not preempt when new item has equal difficulty', () => {
      const activeItem = createQueueItem('active', 25, 'queued');
      const newItem = createQueueItem('new', 25);

      expect(shouldPreempt(activeItem, newItem, strategy)).toBe(false);
    });

    it('should not preempt when active item is null', () => {
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(null, newItem, strategy)).toBe(false);
    });

    it('should not preempt when active item is undefined', () => {
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(undefined, newItem, strategy)).toBe(false);
    });

    it('should not preempt when active item is completed', () => {
      const activeItem = createQueueItem('active', 30, 'completed');
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(activeItem, newItem, strategy)).toBe(false);
    });

    it('should not preempt when active item is failed', () => {
      const activeItem = createQueueItem('active', 30, 'failed');
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(activeItem, newItem, strategy)).toBe(false);
    });

    it('should not preempt when active item is skipped', () => {
      const activeItem = createQueueItem('active', 30, 'skipped');
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(activeItem, newItem, strategy)).toBe(false);
    });
  });

  describe('fifo strategy', () => {
    const strategy: QueueOrderingStrategy = 'fifo';

    it('should never preempt regardless of difficulty', () => {
      const activeItem = createQueueItem('active', 30, 'queued');
      const newItemLower = createQueueItem('new', 21);
      const newItemHigher = createQueueItem('new', 35);

      expect(shouldPreempt(activeItem, newItemLower, strategy)).toBe(false);
      expect(shouldPreempt(activeItem, newItemHigher, strategy)).toBe(false);
    });

    it('should never preempt when active is null', () => {
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(null, newItem, strategy)).toBe(false);
    });
  });

  describe('lifo strategy', () => {
    const strategy: QueueOrderingStrategy = 'lifo';

    it('should never preempt regardless of difficulty', () => {
      const activeItem = createQueueItem('active', 30, 'queued');
      const newItemLower = createQueueItem('new', 21);
      const newItemHigher = createQueueItem('new', 35);

      expect(shouldPreempt(activeItem, newItemLower, strategy)).toBe(false);
      expect(shouldPreempt(activeItem, newItemHigher, strategy)).toBe(false);
    });

    it('should never preempt when active is null', () => {
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(null, newItem, strategy)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle very large difficulty differences', () => {
      const activeItem = createQueueItem('active', 50, 'queued');
      const newItem = createQueueItem('new', 5);

      expect(shouldPreempt(activeItem, newItem, 'lowDifficultyFirst')).toBe(true);
    });

    it('should handle minimal difficulty differences', () => {
      const activeItem = createQueueItem('active', 22, 'queued');
      const newItem = createQueueItem('new', 21);

      expect(shouldPreempt(activeItem, newItem, 'lowDifficultyFirst')).toBe(true);
    });
  });
});
