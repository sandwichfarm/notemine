import { Component, Show, For, createSignal } from 'solid-js';
import { useQueue } from '../providers/QueueProvider';
import type { QueueItem } from '../types/queue';
import { useMining } from '../providers/MiningProvider';
import { ConfirmDialog } from './ConfirmDialog';
import { usePreferences } from '../providers/PreferencesProvider';
import type { QueueOrderingStrategy } from '../lib/queue-ordering';
import { debug } from '../lib/debug';

export const QueuePanel: Component = () => {
  const { queueState, reorderItem, removeFromQueue, clearCompleted, toggleAutoProcess, pauseQueue, startQueue, skipCurrent } = useQueue();
  const { miningState, pauseMining, stopMining } = useMining();
  const { preferences, updatePreference } = usePreferences();

  // Confirmation dialog state
  const [itemToDelete, setItemToDelete] = createSignal<QueueItem | null>(null);

  // Handle strategy change
  const handleStrategyChange = (strategy: QueueOrderingStrategy) => {
    const oldStrategy = preferences().queueOrderingStrategy;
    debug('[QueuePanel] Strategy change:', { from: oldStrategy, to: strategy });
    updatePreference('queueOrderingStrategy', strategy);
  };

  const handlePause = () => {
    pauseQueue(); // Pause queue processing
    pauseMining(); // Pause actual mining
  };

  const handleResume = () => {
    startQueue(); // Resume queue processing - QueueProcessor will handle resuming or starting next item
  };

  const handleSkip = () => {
    skipCurrent(); // Mark current item as skipped in queue
    pauseMining(); // Stop actual mining immediately
  };

  const handleDelete = (item: QueueItem) => {
    // Check if item has mining state (saved progress)
    if (item.miningState) {
      // Show confirmation dialog
      setItemToDelete(item);
    } else {
      // Delete immediately if no mining state
      confirmDelete(item);
    }
  };

  const confirmDelete = (item: QueueItem) => {
    const isActive = queueState().activeItemId === item.id;

    // If deleting active item, stop mining first
    if (isActive) {
      stopMining();
    }

    // Remove from queue
    removeFromQueue(item.id);

    // Close confirmation dialog
    setItemToDelete(null);

    // If deleted active item and queue is still processing, trigger next item after delay
    if (isActive && queueState().isProcessing) {
      // QueueProcessor will detect the change and start next item automatically
    }
  };

  const cancelDelete = () => {
    setItemToDelete(null);
  };

  const handleMoveUp = (item: QueueItem, currentIndex: number) => {
    if (currentIndex === 0) return; // Already at top

    const targetIndex = currentIndex - 1;
    const wasProcessing = queueState().isProcessing;

    reorderItem(item.id, targetIndex, () => {
      stopMining();
    });

    // Restart queue after reorder if it was processing
    if (wasProcessing) {
      // Pause first to clear state, then restart
      setTimeout(() => {
        pauseQueue();
        setTimeout(() => {
          startQueue();
        }, 50);
      }, 200);
    }
  };

  const handleMoveDown = (item: QueueItem, currentIndex: number) => {
    const allItems = getAllQueuedItems();
    if (currentIndex === allItems.length - 1) return; // Already at bottom

    const targetIndex = currentIndex + 1;
    const wasProcessing = queueState().isProcessing;

    reorderItem(item.id, targetIndex, () => {
      stopMining();
    });

    // Restart queue after reorder if it was processing
    if (wasProcessing) {
      // Pause first to clear state, then restart
      setTimeout(() => {
        pauseQueue();
        setTimeout(() => {
          startQueue();
        }, 50);
      }, 200);
    }
  };

  const getAllQueuedItems = () => {
    const state = queueState();
    // Get ALL queued items (including active one)
    return state.items.filter((item) => item.status === 'queued');
  };

  const getCompletedItems = () => queueState().items.filter((item) => ['completed', 'failed', 'skipped'].includes(item.status));
  const getActiveItem = () => queueState().items.find((item) => item.id === queueState().activeItemId);
  const hasActiveOrQueuedItems = () => {
    const state = queueState();
    return state.items.some((item) => item.status === 'queued') || state.activeItemId !== null;
  };

  const formatContent = (content: string, maxLength = 50) => {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  };

  const getStatusColor = (status: QueueItem['status']) => {
    switch (status) {
      case 'completed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'skipped': return 'text-gray-500';
      case 'queued': return 'text-blue-500';
      default: return 'text-text-secondary';
    }
  };

  return (
    <div class="px-6 py-4 bg-black/90">
      <div class="max-w-6xl mx-auto">
        {/* Header */}
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-bold">
              Mining Queue ({getAllQueuedItems().length} {getAllQueuedItems().length === 1 ? 'item' : 'items'})
            </h3>
            <Show when={queueState().isProcessing}>
              <span class="text-xs px-2 py-1 bg-blue-500/20 text-blue-500 rounded">Processing</span>
            </Show>
            <Show when={!queueState().isProcessing && getAllQueuedItems().length > 0}>
              <span class="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-500 rounded">Paused</span>
            </Show>
          </div>

          <div class="flex items-center gap-2">
            {/* Auto-process toggle */}
            <button
              onClick={toggleAutoProcess}
              class="text-xs px-3 py-1.5 rounded transition-colors"
              classList={{
                'bg-accent/20 text-accent': queueState().autoProcess,
                'bg-bg-tertiary text-text-secondary': !queueState().autoProcess,
              }}
              title={queueState().autoProcess ? 'Auto-process enabled' : 'Auto-process disabled'}
            >
              Auto {queueState().autoProcess ? '✓' : '✗'}
            </button>

            {/* Queue Ordering Strategy Selector */}
            <select
              value={preferences().queueOrderingStrategy}
              onChange={(e) => handleStrategyChange(e.currentTarget.value as QueueOrderingStrategy)}
              class="text-xs px-3 py-1.5 bg-bg-tertiary text-text-primary rounded hover:bg-bg-tertiary/80 transition-colors cursor-pointer border border-bg-tertiary focus:border-accent focus:outline-none"
              title="Queue ordering strategy"
            >
              <option value="lowDifficultyFirst">⚡ Low Diff (default)</option>
              <option value="fifo">📋 FIFO</option>
              <option value="lifo">📚 LIFO</option>
            </select>

            {/* Pause/Resume - show when there are queued OR mining items */}
            <Show when={hasActiveOrQueuedItems()}>
              <Show
                when={queueState().isProcessing}
                fallback={
                  <button
                    onClick={handleResume}
                    class="text-xs px-3 py-1.5 bg-green-500/20 text-green-500 rounded hover:bg-green-500/30 transition-colors"
                  >
                    ▶ Resume
                  </button>
                }
              >
                <button
                  onClick={handlePause}
                  class="text-xs px-3 py-1.5 bg-yellow-500/20 text-yellow-500 rounded hover:bg-yellow-500/30 transition-colors"
                >
                  ⏸ Pause
                </button>
              </Show>
            </Show>

            {/* Clear completed */}
            <Show when={getCompletedItems().length > 0}>
              <button
                onClick={clearCompleted}
                class="text-xs px-3 py-1.5 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-tertiary/80 transition-colors"
              >
                Clear Done
              </button>
            </Show>
          </div>
        </div>

        {/* Mining stats - show above queue when mining */}
        <Show when={miningState().mining && getActiveItem()}>
          <div class="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4 text-xs">
                <div>
                  <span class="text-text-secondary">Hash Rate: </span>
                  <span class="font-mono text-accent">{miningState().hashRate.toFixed(2)} KH/s</span>
                </div>
                <Show when={miningState().overallBestPow !== null}>
                  <div>
                    <span class="text-text-secondary">Best POW: </span>
                    <span class="font-mono text-accent">{miningState().overallBestPow}</span>
                  </div>
                </Show>
              </div>
              <button
                onClick={handleSkip}
                class="text-xs px-2 py-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500/30 transition-colors"
              >
                Skip Current
              </button>
            </div>
          </div>
        </Show>

        {/* Queue items (all including active) */}
        <Show
          when={getAllQueuedItems().length > 0}
          fallback={
            <Show when={getCompletedItems().length === 0}>
              <div class="text-center py-8 text-text-secondary opacity-60">
                <div class="text-3xl mb-2">📭</div>
                <div class="text-sm">Queue is empty</div>
              </div>
            </Show>
          }
        >
          <div class="space-y-2">
            <div class="text-xs text-text-secondary mb-2 opacity-60">
              Queue ({getAllQueuedItems().length} {getAllQueuedItems().length === 1 ? 'item' : 'items'})
            </div>
            <For each={getAllQueuedItems()}>
              {(item, index) => {
                // Make isActive reactive by accessing queueState() in a function
                const isActive = () => queueState().activeItemId === item.id;
                const allItems = getAllQueuedItems();
                return (
                  <div
                    class="p-3 rounded flex items-start justify-between hover:bg-bg-tertiary/50 transition-colors"
                    classList={{
                      'bg-blue-500/10 border border-blue-500/30': isActive(),
                      'bg-bg-secondary/50': !isActive(),
                    }}
                  >
                    <div class="flex items-start gap-3 flex-1">
                      {/* Reorder arrows on the left */}
                      <div class="flex flex-col items-center gap-0.5 pt-1">
                        <Show when={index() > 0}>
                          <button
                            onClick={() => handleMoveUp(item, index())}
                            class="text-3xl leading-none hover:text-accent transition-colors"
                            title="Move up"
                          >
                            ▲
                          </button>
                        </Show>
                        <Show when={index() < allItems.length - 1}>
                          <button
                            onClick={() => handleMoveDown(item, index())}
                            class="text-3xl leading-none hover:text-accent transition-colors"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </Show>
                      </div>

                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="text-xs text-text-secondary">
                            #{index() + 1}
                          </span>
                          <Show when={isActive()}>
                            <span class="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-500 rounded font-semibold">
                              ACTIVE
                            </span>
                          </Show>
                          <span class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded">
                            {item.type}
                          </span>
                          <span class="text-xs text-accent">
                            POW: {item.difficulty}
                          </span>
                        </div>
                        <div class="text-sm text-text-primary">
                          {formatContent(item.content, 80)}
                        </div>
                        <Show when={item.metadata?.reactionContent}>
                          <div class="text-xs text-text-secondary mt-1">
                            Reaction: {item.metadata?.reactionContent}
                          </div>
                        </Show>
                        {/* Additional metadata */}
                        <div class="flex items-center gap-3 text-xs text-text-secondary mt-1.5">
                          <span>
                            Kind: <span class="font-mono text-text-primary">{item.kind}</span>
                          </span>
                          {/* Only show saved mining progress for inactive jobs */}
                          <Show when={!isActive() && item.miningState?.bestPow}>
                            <span>
                              Best POW: <span class="font-mono text-accent">{item.miningState?.bestPow?.bestPow}</span>
                            </span>
                          </Show>
                          <Show when={!isActive() && item.miningState?.bestPow?.nonce}>
                            <span>
                              Nonce: <span class="font-mono text-text-primary">{item.miningState?.bestPow?.nonce}</span>
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>

                    {/* Delete button on the right */}
                    <div class="flex items-start ml-2 pt-1">
                      <button
                        onClick={() => handleDelete(item)}
                        class="text-xs px-2 py-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500/30 transition-colors"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        {/* Completed items (collapsible) */}
        <Show when={getCompletedItems().length > 0}>
          <details class="mt-4">
            <summary class="text-xs text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
              Completed ({getCompletedItems().length})
            </summary>
            <div class="mt-2 space-y-1">
              <For each={getCompletedItems()}>
                {(item) => (
                  <div class="p-2 bg-bg-secondary/30 rounded text-xs flex items-center justify-between">
                    <div class="flex items-center gap-2 flex-1">
                      <span class={getStatusColor(item.status)}>{item.status}</span>
                      <span class="text-text-secondary">
                        {formatContent(item.content, 60)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(item)}
                      class="text-text-secondary hover:text-red-500 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </For>
            </div>
          </details>
        </Show>

        {/* Confirmation Dialog */}
        <Show when={itemToDelete()}>
          {(item) => (
            <ConfirmDialog
              isOpen={true}
              title="Delete Queue Item?"
              message={`This item has saved mining progress. Are you sure you want to delete it? Progress: ${item().miningState ? 'Saved' : 'None'}`}
              confirmText="Delete"
              cancelText="Cancel"
              onConfirm={() => confirmDelete(item())}
              onCancel={cancelDelete}
            />
          )}
        </Show>
      </div>
    </div>
  );
};
