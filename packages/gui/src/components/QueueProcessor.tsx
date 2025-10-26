import { Component, createEffect, onCleanup } from 'solid-js';
import { useQueue } from '../providers/QueueProvider';
import { useUser } from '../providers/UserProvider';
import { usePowMining } from '../hooks/usePowMining';
import { relayPool, getPublishRelays, getUserOutboxRelays, eventStore } from '../lib/applesauce';
import { finalizeEvent } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/core';

/**
 * QueueProcessor handles automatic processing of queued mining operations.
 * It runs in the background and processes items one at a time.
 */
export const QueueProcessor: Component = () => {
  const { queueState, updateItemStatus, updateItemMiningState, setActiveItem, getNextQueuedItem } = useQueue();
  const { user } = useUser();
  const powMining = usePowMining();
  const { startMining, resumeMining, restoreMiningState, stopMining, state: miningState } = powMining;

  let processingLock = false;

  // Process next queue item
  const processNextItem = async () => {
    if (processingLock) {
      console.log('[QueueProcessor] Already processing, skipping');
      return;
    }

    const state = queueState();
    if (!state.isProcessing || !state.autoProcess) {
      console.log('[QueueProcessor] Queue not active or auto-process disabled');
      return;
    }

    // Check if there's already a mining item that needs to be resumed
    const miningItem = state.items.find((item) => item.id === state.activeItemId && item.status === 'mining');
    const nextItem = miningItem || getNextQueuedItem();

    if (!nextItem) {
      console.log('[QueueProcessor] No items in queue');
      return;
    }

    console.log('[QueueProcessor] Processing item:', {
      id: nextItem.id,
      type: nextItem.type,
      status: nextItem.status,
      isMiningItem: !!miningItem,
    });

    const currentUser = user();
    if (!currentUser) {
      console.error('[QueueProcessor] No user authenticated');
      return;
    }

    processingLock = true;

    try {
      // Check if item is still valid
      if (!isItemValid(nextItem)) {
        console.log('[QueueProcessor] Item is invalid, skipping:', nextItem.id);
        updateItemStatus(nextItem.id, 'skipped', 'Target event no longer exists');
        processingLock = false;
        setTimeout(processNextItem, 100); // Process next item
        return;
      }

      // Set as active and update status (only if not already mining)
      if (nextItem.status !== 'mining') {
        setActiveItem(nextItem.id);
        updateItemStatus(nextItem.id, 'mining');
      }

      // Resume from saved state if available, otherwise start fresh
      let minedEvent: NostrEvent | null = null;

      if (nextItem.miningState) {
        console.log('[QueueProcessor] Resuming from saved state:', nextItem.miningState);
        // Resume flow: restore state, then resume mining (which returns a promise)
        minedEvent = await resumeMining(
          nextItem,
          (state) => {
            updateItemMiningState(nextItem.id, state);
          }
        );
      } else {
        console.log('[QueueProcessor] Starting fresh mining');
        minedEvent = await startMining(
          {
            content: nextItem.content,
            pubkey: nextItem.pubkey,
            difficulty: nextItem.difficulty,
            tags: nextItem.tags || [],
            kind: nextItem.kind,
          },
          nextItem.id,
          (state) => {
            // Save mining state periodically
            updateItemMiningState(nextItem.id, state);
          }
        );
      }

      if (!minedEvent) {
        throw new Error('Mining failed: no event returned');
      }

      console.log('[QueueProcessor] Mining complete, signing and publishing...');

      // Sign the event
      let signedEvent: NostrEvent;
      if (currentUser.isAnon && currentUser.secret) {
        signedEvent = finalizeEvent(minedEvent as any, currentUser.secret);
      } else if (currentUser.signer) {
        signedEvent = await currentUser.signer.signEvent(minedEvent as any);
      } else if (window.nostr) {
        signedEvent = await window.nostr.signEvent(minedEvent);
      } else {
        throw new Error('Cannot sign event: no signing method available');
      }

      // Publish to relays
      const outboxRelays = await getUserOutboxRelays(currentUser.pubkey);
      const publishRelays = getPublishRelays(outboxRelays);
      console.log('[QueueProcessor] Publishing to relays:', publishRelays);

      const promises = publishRelays.map(async (relayUrl) => {
        const relay = relayPool.relay(relayUrl);
        return relay.publish(signedEvent);
      });

      await Promise.allSettled(promises);

      console.log('[QueueProcessor] Event published successfully');

      // Mark as completed
      updateItemStatus(nextItem.id, 'completed');
      setActiveItem(null);

      // Process next item after a short delay
      setTimeout(processNextItem, 500);
    } catch (error) {
      console.error('[QueueProcessor] Error processing item:', error);
      updateItemStatus(nextItem.id, 'failed', String(error));
      setActiveItem(null);

      // Continue with next item even if this one failed
      setTimeout(processNextItem, 500);
    } finally {
      processingLock = false;
    }
  };

  // Check if queue item is still valid (e.g., target event exists for reactions/replies)
  const isItemValid = (item: any): boolean => {
    // All items with event IDs in their tags are valid
    // We don't need to check if the target event is in the store,
    // as long as we have the event ID to reference in the tags
    // The Nostr protocol handles references via event IDs, not local storage
    return true;
  };

  // Monitor queue state changes and auto-start processing
  createEffect(() => {
    const state = queueState();

    console.log('[QueueProcessor] State changed:', {
      isProcessing: state.isProcessing,
      autoProcess: state.autoProcess,
      mining: miningState().mining,
      currentQueueItemId: powMining.currentQueueItemId,
      activeItemId: state.activeItemId,
      queuedItems: state.items.filter(item => item.status === 'queued').length,
      miningItems: state.items.filter(item => item.status === 'mining').length,
    });

    // Check if currently mining item was removed from queue or stopped
    if (miningState().mining && powMining.currentQueueItemId) {
      const currentItem = state.items.find(item => item.id === powMining.currentQueueItemId);
      // Stop mining if item was removed OR if its status is no longer 'mining'
      if (!currentItem || currentItem.status !== 'mining') {
        console.log('[QueueProcessor] Currently mining item was removed or stopped, stopping mining');
        stopMining();
        processingLock = false;
        // After stopping, trigger processing of next item if queue is still active
        if (state.isProcessing && state.autoProcess) {
          setTimeout(processNextItem, 100);
        }
        return;
      }
    }

    // Auto-start processing when:
    // 1. Queue is active (isProcessing=true)
    // 2. Auto-process is enabled
    // 3. There are queued OR mining items
    // 4. No item is currently being mined by the hook
    // 5. Not already locked
    if (state.isProcessing && state.autoProcess && !miningState().mining && !processingLock) {
      const hasQueuedItems = state.items.some((item) => item.status === 'queued');
      const hasMiningItems = state.items.some((item) => item.status === 'mining');

      if (hasQueuedItems || hasMiningItems) {
        console.log('[QueueProcessor] Queue active with pending items, starting processing');
        processNextItem();
      }
    }
  });

  return null; // This component doesn't render anything
};
