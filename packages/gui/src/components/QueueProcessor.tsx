import { Component, createEffect } from 'solid-js';
import { useQueue } from '../providers/QueueProvider';
import { useUser } from '../providers/UserProvider';
import { useMining } from '../providers/MiningProvider';
import { relayPool, getPublishRelays, getUserOutboxRelays } from '../lib/applesauce';
import { finalizeEvent } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/core';
import { debug } from '../lib/debug';
import { getPublishRelaysForInteraction } from '../lib/inbox-outbox';

/**
 * QueueProcessor handles automatic processing of queued mining operations.
 * It runs in the background and processes items one at a time.
 */
export const QueueProcessor: Component = () => {
  const { queueState, updateItemStatus, updateItemMiningState, setActiveItem, getNextQueuedItem } = useQueue();
  const { user } = useUser();
  const { startMining, resumeMining, stopMining, miningState, currentQueueItemId } = useMining();

  let processingLock = false;

  // Process next queue item
  const processNextItem = async () => {
    if (processingLock) {
      debug('[QueueProcessor] Already processing, skipping');
      return;
    }

    const state = queueState();
    if (!state.isProcessing || !state.autoProcess) {
      debug('[QueueProcessor] Queue not active or auto-process disabled');
      return;
    }

    // Check if there's already an active item that needs to be resumed
    const activeItem = state.activeItemId ? state.items.find((item) => item.id === state.activeItemId && item.status === 'queued') : null;
    const nextItem = activeItem || getNextQueuedItem();

    if (!nextItem) {
      debug('[QueueProcessor] No items in queue');
      return;
    }

    debug('[QueueProcessor] Processing item:', {
      id: nextItem.id,
      type: nextItem.type,
      status: nextItem.status,
      isActiveItem: !!activeItem,
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
        debug('[QueueProcessor] Item is invalid, skipping:', nextItem.id);
        updateItemStatus(nextItem.id, 'skipped', 'Target event no longer exists');
        processingLock = false;
        setTimeout(processNextItem, 100); // Process next item
        return;
      }

      // Set as active (if not already)
      if (state.activeItemId !== nextItem.id) {
        setActiveItem(nextItem.id);
      }

      // Resume from saved state if available, otherwise start fresh
      let minedEvent: NostrEvent | null = null;

      if (nextItem.miningState) {
        debug('[QueueProcessor] Resuming from saved state:', nextItem.miningState);
        // Resume flow: restore state, then resume mining (which returns a promise)
        minedEvent = await resumeMining(
          nextItem,
          (state) => {
            updateItemMiningState(nextItem.id, state);
          }
        );
      } else {
        debug('[QueueProcessor] Starting fresh mining');
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

      // If minedEvent is null, it means mining was paused or cancelled
      // Keep the item as active with saved miningState so it can be resumed later
      if (!minedEvent) {
        debug('[QueueProcessor] Mining was paused/cancelled, keeping item active for resume');
        processingLock = false;
        return;
      }

      debug('[QueueProcessor] Mining complete, signing and publishing...');

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

      // Determine which relays to publish to based on event type
      let allPublishRelays: string[];

      // Check if this is a reply or reaction (interacting with another user's content)
      const isInteraction = nextItem.type === 'reply' || nextItem.type === 'reaction';
      const targetPubkey = isInteraction ? nextItem.tags?.find(t => t[0] === 'p')?.[1] : null;

      if (isInteraction && targetPubkey) {
        // For interactions: publish to author's inbox + your outbox + notemine.io + NIP-66 PoW relays
        const { getNip66PowRelays } = await import('../lib/nip66');
        const { DEFAULT_POW_RELAY: defaultRelay } = await import('../lib/applesauce');
        const powRelays = getNip66PowRelays();

        debug('[QueueProcessor] Publishing interaction to inbox/outbox model:', {
          targetPubkey,
          type: nextItem.type,
        });

        allPublishRelays = await getPublishRelaysForInteraction(
          targetPubkey,
          currentUser.pubkey,
          defaultRelay,
          powRelays
        );
      } else {
        // For regular notes: notemine.io + NIP-66 POW relays + user's outbox relays
        const outboxRelays = await getUserOutboxRelays(currentUser.pubkey);
        allPublishRelays = getPublishRelays(outboxRelays);
      }

      // Get write-enabled relays from settings
      const { getWriteRelays } = await import('../lib/relay-settings');
      const { DEFAULT_POW_RELAY: defaultRelay } = await import('../lib/applesauce');
      const writeEnabledRelays = getWriteRelays();

      // Filter to write-enabled relays, but ALWAYS include notemine.io (immutable)
      const publishRelays = allPublishRelays.filter(url => {
        return url === defaultRelay || writeEnabledRelays.includes(url);
      });

      debug('[QueueProcessor] Publishing to write-enabled relays:', publishRelays);

      const promises = publishRelays.map(async (relayUrl) => {
        const relay = relayPool.relay(relayUrl);
        return relay.publish(signedEvent);
      });

      await Promise.allSettled(promises);

      debug('[QueueProcessor] Event published successfully');

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
  const isItemValid = (_item: any): boolean => {
    // All items with event IDs in their tags are valid
    // We don't need to check if the target event is in the store,
    // as long as we have the event ID to reference in the tags
    // The Nostr protocol handles references via event IDs, not local storage
    return true;
  };

  // Monitor queue state changes and auto-start processing
  createEffect(() => {
    const state = queueState();

    debug('[QueueProcessor] State changed:', {
      isProcessing: state.isProcessing,
      autoProcess: state.autoProcess,
      mining: miningState().mining,
      currentQueueItemId: currentQueueItemId,
      activeItemId: state.activeItemId,
      queuedItems: state.items.filter(item => item.status === 'queued').length,
    });

    // Check if currently mining item was removed from queue or is no longer active
    if (miningState().mining && currentQueueItemId) {
      const currentItem = state.items.find(item => item.id === currentQueueItemId);
      // Stop mining if item was removed OR if it's no longer the active item OR status changed to terminal
      const isTerminalStatus = currentItem && ['completed', 'failed', 'skipped'].includes(currentItem.status);
      if (!currentItem || state.activeItemId !== currentQueueItemId || isTerminalStatus) {
        debug('[QueueProcessor] Currently mining item was removed or stopped, stopping mining');
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
    // 3. There are queued items OR an active item to resume
    // 4. No item is currently being mined by the hook
    // 5. Not already locked
    if (state.isProcessing && state.autoProcess && !miningState().mining && !processingLock) {
      const hasQueuedItems = state.items.some((item) => item.status === 'queued');
      const hasActiveItem = state.activeItemId && state.items.some((item) => item.id === state.activeItemId && item.status === 'queued');

      if (hasQueuedItems || hasActiveItem) {
        debug('[QueueProcessor] Queue active with pending items, starting processing');
        processNextItem();
      }
    }
  });

  return null; // This component doesn't render anything
};
