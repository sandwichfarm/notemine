import { Component } from 'solid-js';
import { usePublishing } from '../providers/PublishingProvider';

interface PublishingButtonProps {
  onToggle: () => void;
  isActive: boolean;
}

export const PublishingButton: Component<PublishingButtonProps> = (props) => {
  const { publishState } = usePublishing();

  const getActiveCount = () => {
    const state = publishState();
    return state.activeJobId ? 1 : 0;
  };

  const getPendingCount = () => {
    const state = publishState();
    return state.items.filter(
      (job) => job.status === 'pending-sign' || job.status === 'signed-pending-publish'
    ).length;
  };

  const getFailedCount = () => {
    const state = publishState();
    return state.items.filter((job) => job.status === 'failed').length;
  };

  const isProcessing = () => publishState().isProcessing;

  return (
    <button
      onClick={props.onToggle}
      class="btn text-xs px-3 py-2 flex items-center gap-2 relative"
      title="Toggle publishing queue - Active/Pending/Failed"
    >
      <span
        class="inline-block"
        classList={{
          'animate-pulse': isProcessing(),
        }}
      >
        📤
      </span>
      <span class="font-mono text-xs flex items-center gap-1">
        <span class="text-green-500">{getActiveCount()}</span>
        <span class="text-text-secondary">/</span>
        <span class="text-blue-500">{getPendingCount()}</span>
        <span class="text-text-secondary">/</span>
        <span class="text-red-500">{getFailedCount()}</span>
      </span>
    </button>
  );
};
