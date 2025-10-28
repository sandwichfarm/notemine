import { createContext, useContext, Component, JSX, onMount, onCleanup } from 'solid-js';
import type { QueueItem, QueueState } from '../types/queue';
import { createLocalStore } from '../lib/localStorage';
import { debug } from '../lib/debug';

interface QueueContextType {
  queueState: () => QueueState;
  addToQueue: (item: Omit<QueueItem, 'id' | 'status' | 'createdAt'>) => string;
  removeFromQueue: (itemId: string) => void;
  moveToTop: (itemId: string) => void;
  reorderItem: (itemId: string, toIndex: number, stopMiningCallback?: () => void) => void;
  clearCompleted: () => void;
  clearQueue: () => void;
  updateItemStatus: (itemId: string, status: QueueItem['status'], error?: string) => void;
  updateItemMiningState: (itemId: string, miningState: any) => void;
  setActiveItem: (itemId: string | null) => void;
  startQueue: () => void;
  pauseQueue: () => void;
  skipCurrent: () => void;
  toggleAutoProcess: () => void;
  getNextQueuedItem: () => QueueItem | null;
}

const QueueContext = createContext<QueueContextType>();

const DEFAULT_QUEUE_STATE: QueueState = {
  items: [],
  activeItemId: null,
  isProcessing: false,
  autoProcess: true,
};

export const QueueProvider: Component<{ children: JSX.Element }> = (props) => {
  // Use lazy mode: keep state in-memory, only flush on page exit or critical operations
  const store = createLocalStore<QueueState>(
    'notemine:miningQueue',
    DEFAULT_QUEUE_STATE,
    { lazy: true }
  );
  const queueState = store.value;
  const setQueueState = store.setValue;
  const flushQueue = store.flush;

  // Event handlers for persistence
  const handleFlush = () => {
    debug('[QueueProvider] Flushing queue to localStorage on page exit');
    flushQueue();
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      debug('[QueueProvider] Flushing queue to localStorage on tab hide');
      flushQueue();
    }
  };

  // Add event listeners to flush queue state on page exit
  onMount(() => {
    // beforeunload: Universal support, fires on page exit (refresh, close, navigate away)
    window.addEventListener('beforeunload', handleFlush);

    // pagehide: More reliable on mobile Safari (iOS)
    window.addEventListener('pagehide', handleFlush);

    // visibilitychange: Fires when user switches tabs, gives more time to persist
    document.addEventListener('visibilitychange', handleVisibilityChange);

    debug('[QueueProvider] Added event listeners for queue persistence');
  });

  onCleanup(() => {
    debug('[QueueProvider] Cleanup: flushing queue and removing listeners');
    flushQueue(); // Flush one last time on cleanup
    window.removeEventListener('beforeunload', handleFlush);
    window.removeEventListener('pagehide', handleFlush);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  // Add item to queue
  const addToQueue = (item: Omit<QueueItem, 'id' | 'status' | 'createdAt'>): string => {
    const id = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newItem: QueueItem = {
      ...item,
      id,
      status: 'queued',
      createdAt: Date.now(),
    };

    setQueueState((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
      // Auto-start queue if autoProcess is enabled and not already processing
      isProcessing: prev.autoProcess ? true : prev.isProcessing,
    }));

    debug('[Queue] Added item:', newItem);
    flushQueue(); // Persist immediately after queue modification
    return id;
  };

  // Remove item from queue
  const removeFromQueue = (itemId: string) => {
    const state = queueState();
    const isActiveItem = state.activeItemId === itemId;

    setQueueState((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
      activeItemId: prev.activeItemId === itemId ? null : prev.activeItemId,
    }));

    debug('[Queue] Removed item:', itemId, 'wasActive:', isActiveItem);

    // If we removed the active item, we need to signal that mining should stop
    // The QueueProcessor will handle starting the next item
    if (isActiveItem) {
      debug('[Queue] Removed active item, mining should stop');
    }

    flushQueue(); // Persist immediately after queue modification
  };

  // Move item to top of queue
  const moveToTop = (itemId: string) => {
    setQueueState((prev) => {
      const item = prev.items.find((i) => i.id === itemId);
      if (!item || item.status !== 'queued') return prev;

      const otherItems = prev.items.filter((i) => i.id !== itemId);
      return {
        ...prev,
        items: [item, ...otherItems],
      };
    });
    debug('[Queue] Moved to top:', itemId);
    flushQueue(); // Persist immediately after queue modification
  };

  // Reorder item to specific index (supports moving active items)
  const reorderItem = (itemId: string, toIndex: number, stopMiningCallback?: () => void) => {
    const state = queueState();
    const item = state.items.find((i) => i.id === itemId);

    if (!item || item.status !== 'queued') {
      debug('[Queue] Cannot reorder: item not found or not queued');
      return;
    }

    // Reorder the items array
    const otherItems = state.items.filter((i) => i.id !== itemId);
    otherItems.splice(toIndex, 0, item);

    // Find the item at position 0 among queued items
    const queuedItems = otherItems.filter((i) => i.status === 'queued');
    const newActiveItemId = queuedItems.length > 0 ? queuedItems[0].id : null;

    // Check if active item changed
    const activeItemChanged = state.activeItemId !== newActiveItemId;

    if (activeItemChanged) {
      debug('[Queue] Active item changed from', state.activeItemId, 'to', newActiveItemId);

      // Stop mining the old active item if callback provided
      if (state.activeItemId && stopMiningCallback) {
        stopMiningCallback();
      }
    }

    setQueueState((prev) => ({
      ...prev,
      items: otherItems,
      activeItemId: newActiveItemId, // Always update to item at position 0
    }));

    debug('[Queue] Reordered:', itemId, 'to index', toIndex, 'newActive:', newActiveItemId);
  };

  // Clear completed/failed/skipped items
  const clearCompleted = () => {
    setQueueState((prev) => ({
      ...prev,
      items: prev.items.filter(
        (item) => !['completed', 'failed', 'skipped'].includes(item.status)
      ),
    }));
    debug('[Queue] Cleared completed items');
    flushQueue(); // Persist immediately after queue modification
  };

  // Clear entire queue
  const clearQueue = () => {
    setQueueState(DEFAULT_QUEUE_STATE);
    debug('[Queue] Cleared all items');
    flushQueue(); // Persist immediately after queue modification
  };

  // Update item status
  const updateItemStatus = (itemId: string, status: QueueItem['status'], error?: string) => {
    setQueueState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status,
              error,
              completedAt: ['completed', 'failed', 'skipped'].includes(status)
                ? Date.now()
                : item.completedAt,
            }
          : item
      ),
    }));
    debug(`[Queue] Updated item ${itemId} status:`, status);

    // Only flush on final states (completed/failed/skipped), not during active mining (e.g., 'mining' status)
    if (['completed', 'failed', 'skipped'].includes(status)) {
      flushQueue();
    }
  };

  // Update item mining state
  const updateItemMiningState = (itemId: string, miningState: any) => {
    debug(`[Queue] Updating mining state for ${itemId}:`, {
      workerNonces: miningState?.workerNonces,
      numberOfWorkers: miningState?.numberOfWorkers
    });
    setQueueState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? { ...item, miningState }
          : item
      ),
    }));
  };

  // Set active item
  const setActiveItem = (itemId: string | null) => {
    setQueueState((prev) => ({
      ...prev,
      activeItemId: itemId,
    }));
  };

  // Start queue processing
  const startQueue = () => {
    setQueueState((prev) => ({
      ...prev,
      isProcessing: true,
    }));
    debug('[Queue] Started processing');
    flushQueue(); // Persist immediately
  };

  // Pause queue processing
  const pauseQueue = () => {
    setQueueState((prev) => ({
      ...prev,
      isProcessing: false,
    }));
    debug('[Queue] Paused processing');
    flushQueue(); // Persist immediately
  };

  // Skip current item
  const skipCurrent = () => {
    const state = queueState();
    if (state.activeItemId) {
      updateItemStatus(state.activeItemId, 'skipped', 'Manually skipped by user');
      setActiveItem(null);
    }
  };

  // Toggle auto-process
  const toggleAutoProcess = () => {
    setQueueState((prev) => ({
      ...prev,
      autoProcess: !prev.autoProcess,
    }));
    flushQueue(); // Persist immediately
  };

  // Get next queued item
  const getNextQueuedItem = (): QueueItem | null => {
    const state = queueState();
    return state.items.find((item) => item.status === 'queued') || null;
  };

  const value: QueueContextType = {
    queueState,
    addToQueue,
    removeFromQueue,
    moveToTop,
    reorderItem,
    clearCompleted,
    clearQueue,
    updateItemStatus,
    updateItemMiningState,
    setActiveItem,
    startQueue,
    pauseQueue,
    skipCurrent,
    toggleAutoProcess,
    getNextQueuedItem,
  };

  return (
    <QueueContext.Provider value={value}>
      {props.children}
    </QueueContext.Provider>
  );
};

export function useQueue(): QueueContextType {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within QueueProvider');
  }
  return context;
}
