/**
 * Queue Ordering Strategies
 *
 * Pure helper functions for queue item insertion and preemption logic.
 * Strategy applies to: new item placement, next-item selection defaults, and preemption rules.
 * Manual ordering always takes precedence over these strategies.
 */

import type { QueueItem } from '../types/queue';

/**
 * Queue ordering strategy type
 */
export type QueueOrderingStrategy = 'lowDifficultyFirst' | 'fifo' | 'lifo';

/**
 * Compute the insertion index for a new queue item based on the current strategy.
 *
 * @param items - Current list of all queue items (may include completed, failed, etc.)
 * @param newItem - The new item to insert
 * @param strategy - The queue ordering strategy to apply
 * @returns The index where the new item should be inserted
 *
 * Strategy behaviors:
 * - lowDifficultyFirst: Insert before first queued item with higher difficulty; else append
 * - fifo: Append after last queued item
 * - lifo: Insert before first queued item (front of queued slice)
 */
export function computeInsertionIndex(
  items: QueueItem[],
  newItem: QueueItem,
  strategy: QueueOrderingStrategy
): number {
  // Filter to only queued items (exclude completed, failed, skipped)
  const queuedItems = items.filter(item => item.status === 'queued');

  // If no queued items, insert at beginning
  if (queuedItems.length === 0) {
    return 0;
  }

  switch (strategy) {
    case 'lowDifficultyFirst': {
      // Find first queued item with higher difficulty than new item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.status === 'queued' && item.difficulty > newItem.difficulty) {
          return i;
        }
      }
      // No higher difficulty found, append after last queued item
      const lastQueuedIndex = items.lastIndexOf(queuedItems[queuedItems.length - 1]);
      return lastQueuedIndex + 1;
    }

    case 'fifo': {
      // Append after last queued item
      const lastQueuedIndex = items.lastIndexOf(queuedItems[queuedItems.length - 1]);
      return lastQueuedIndex + 1;
    }

    case 'lifo': {
      // Insert before first queued item (front of queue)
      const firstQueuedIndex = items.indexOf(queuedItems[0]);
      return firstQueuedIndex;
    }

    default:
      // Fallback to FIFO behavior
      const lastQueuedIndex = items.lastIndexOf(queuedItems[queuedItems.length - 1]);
      return lastQueuedIndex + 1;
  }
}

/**
 * Determine whether a new item should preempt the currently active item.
 *
 * @param activeItem - The currently active queue item (may be null)
 * @param newItem - The new item being added to the queue
 * @param strategy - The queue ordering strategy
 * @returns true if the new item should preempt the active item
 *
 * Preemption rules:
 * - Only applies to 'lowDifficultyFirst' strategy
 * - Active item must have status 'queued' (not completed/failed/skipped)
 * - New item must have lower difficulty than active item
 */
export function shouldPreempt(
  activeItem: QueueItem | null | undefined,
  newItem: QueueItem,
  strategy: QueueOrderingStrategy
): boolean {
  // Only lowDifficultyFirst strategy supports preemption
  if (strategy !== 'lowDifficultyFirst') {
    return false;
  }

  // Must have an active item
  if (!activeItem) {
    return false;
  }

  // Active item must be queued (not terminal status)
  if (activeItem.status !== 'queued') {
    return false;
  }

  // New item must have lower difficulty to preempt
  return newItem.difficulty < activeItem.difficulty;
}
