import { Component } from 'solid-js';
import { useQueue } from '../providers/QueueProvider';
import { debug } from '../lib/debug';

interface QueueButtonProps {
  onToggle: () => void;
  isActive: boolean;
}

export const QueueButton: Component<QueueButtonProps> = (props) => {
  const { queueState } = useQueue();

  const getActiveCount = () => {
    const state = queueState();
    // Only count the item that's actually set as active
    const activeItem = state.items.find((item) => item.id === state.activeItemId && item.status === 'mining');
    debug('[QueueButton] Active item:', activeItem ? { id: activeItem.id, status: activeItem.status, content: activeItem.content } : 'none');
    return activeItem ? 1 : 0;
  };
  const getPendingCount = () => queueState().items.filter((item) => item.status === 'queued').length;
  const isProcessing = () => queueState().isProcessing;

  return (
    <button
      onClick={props.onToggle}
      class="btn text-xs px-3 py-2 flex items-center gap-2 relative"
      title="Toggle mining queue - Active/Pending"
    >
      <span
        class="inline-block"
        classList={{
          'animate-pulse': isProcessing(),
        }}
      >
        📋
      </span>
      <span class="font-mono text-xs flex items-center gap-1">
        <span class="text-green-500">{getActiveCount()}</span>
        <span class="text-text-secondary">/</span>
        <span class="text-blue-500">{getPendingCount()}</span>
      </span>
    </button>
  );
};
