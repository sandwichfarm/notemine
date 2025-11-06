import { Component, Show, For, createSignal } from 'solid-js';
import { usePublishing } from '../providers/PublishingProvider';
import type { PublishJob } from '../types/publishing';

export const PublishingPanel: Component = () => {
  const {
    publishState,
    removePublishJob,
    retryPublishJob,
    retryAllFailed,
    pausePublishing,
    resumePublishing,
    clearPublished,
    toggleAutoPublish,
  } = usePublishing();

  const [expandedErrors, setExpandedErrors] = createSignal<Set<string>>(new Set());
  const [expandedRelays, setExpandedRelays] = createSignal<Set<string>>(new Set());

  const handlePause = () => {
    pausePublishing();
  };

  const handleResume = () => {
    resumePublishing();
  };

  const handleRetry = (jobId: string) => {
    retryPublishJob(jobId);
  };

  const handleRemove = (jobId: string) => {
    removePublishJob(jobId);
  };

  const handleCopyEvent = async (job: PublishJob) => {
    const eventData = job.signedEvent || job.eventTemplate;
    try {
      await navigator.clipboard.writeText(JSON.stringify(eventData, null, 2));
      // Could show a toast notification here
    } catch (error) {
      console.error('Failed to copy event:', error);
    }
  };

  const toggleErrorExpanded = (jobId: string) => {
    const current = expandedErrors();
    const newSet = new Set(current);
    if (newSet.has(jobId)) {
      newSet.delete(jobId);
    } else {
      newSet.add(jobId);
    }
    setExpandedErrors(newSet);
  };

  const toggleRelaysExpanded = (jobId: string) => {
    const current = expandedRelays();
    const newSet = new Set(current);
    if (newSet.has(jobId)) {
      newSet.delete(jobId);
    } else {
      newSet.add(jobId);
    }
    setExpandedRelays(newSet);
  };

  const getPendingSignJobs = () =>
    publishState().items.filter((job) => job.status === 'pending-sign');

  const getPendingPublishJobs = () =>
    publishState().items.filter((job) => job.status === 'signed-pending-publish');

  const getPublishedJobs = () =>
    publishState().items
      .filter((job) => job.status === 'published')
      .sort((a, b) => b.updatedAt - a.updatedAt); // Newest first

  const getFailedJobs = () =>
    publishState().items.filter((job) => job.status === 'failed');

  const getCancelledJobs = () =>
    publishState().items
      .filter((job) => job.status === 'cancelled')
      .sort((a, b) => b.updatedAt - a.updatedAt); // Newest first

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = timestamp - now;
    const absDiff = Math.abs(diff);

    if (absDiff < 1000) return 'now';

    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (diff > 0) {
      // Future
      if (days > 0) return `in ${days}d`;
      if (hours > 0) return `in ${hours}h`;
      if (minutes > 0) return `in ${minutes}m`;
      return `in ${seconds}s`;
    } else {
      // Past
      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return `${seconds}s ago`;
    }
  };

  const getStatusBadge = (status: PublishJob['status']) => {
    switch (status) {
      case 'pending-sign':
        return <span class="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-500 rounded">Pending Sign</span>;
      case 'signed-pending-publish':
        return <span class="text-xs px-2 py-1 bg-blue-500/20 text-blue-500 rounded">Pending Publish</span>;
      case 'published':
        return <span class="text-xs px-2 py-1 bg-green-500/20 text-green-500 rounded">Published</span>;
      case 'failed':
        return <span class="text-xs px-2 py-1 bg-red-500/20 text-red-500 rounded">Failed</span>;
      case 'cancelled':
        return <span class="text-xs px-2 py-1 bg-gray-500/20 text-gray-500 rounded">Cancelled</span>;
      default:
        return null;
    }
  };

  const formatContent = (job: PublishJob, maxLength = 50) => {
    const content = job.eventTemplate.content;
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  };

  // Render compact finished job card for published/cancelled items
  const renderFinishedJobCard = (job: PublishJob) => {
    const relaysExpanded = () => expandedRelays().has(job.id);
    const successfulRelays = () => job.relayResults?.filter(r => r.status === 'success') || [];
    const failedRelays = () => job.relayResults?.filter(r => r.status === 'failed') || [];
    const timeoutRelays = () => job.relayResults?.filter(r => r.status === 'timeout') || [];

    // Get first 20 chars of note ID to show leading zeros
    const noteId = () => (job.signedEvent?.id || job.eventTemplate.id || '').slice(0, 20);

    // Format time ago for when job finished
    const getTimeAgo = () => {
      const now = Date.now();
      const diff = now - job.updatedAt;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      if (seconds > 0) return `${seconds}s ago`;
      return 'just now';
    };

    return (
      <div class="p-3 rounded bg-bg-secondary/50 flex flex-col gap-2">
        {/* Header row */}
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2 flex-wrap">
            {getStatusBadge(job.status)}
            <span class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded">
              {job.meta.type}
            </span>
            <span class="text-xs text-accent">
              POW: {job.meta.difficulty}
            </span>
            <span class="text-xs text-text-secondary">
              Kind: {job.meta.kind}
            </span>
            <Show when={noteId()}>
              <span class="text-xs font-mono text-text-secondary">
                ID: {noteId()}...
              </span>
            </Show>
            <span class="text-xs text-text-secondary">
              {job.status === 'published' ? 'Published' : 'Cancelled'} {getTimeAgo()}
            </span>
          </div>

          {/* Action buttons - with separator before delete */}
          <div class="flex items-center gap-1">
            <button
              onClick={() => handleCopyEvent(job)}
              class="text-xs px-2 py-1 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-tertiary/80 transition-colors"
              title="Copy event JSON"
            >
              📋
            </button>
            <div class="w-px h-4 bg-bg-tertiary mx-1"></div>
            <button
              onClick={() => handleRemove(job.id)}
              class="text-xs px-2 py-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500/30 transition-colors"
              title="Remove"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div class="text-sm text-text-primary">
          {formatContent(job, 80)}
        </div>

        {/* Relay results */}
        <Show when={job.relayResults && job.relayResults.length > 0}>
          <div class="mt-1">
            <button
              onClick={() => toggleRelaysExpanded(job.id)}
              class="text-xs hover:text-text-primary transition-colors flex items-center gap-1"
              classList={{
                'text-green-500': successfulRelays().length > 0,
                'text-red-500': successfulRelays().length === 0,
              }}
            >
              <span>{relaysExpanded() ? '▼' : '▶'}</span>
              <span>
                Relays: {successfulRelays().length}/{job.relays.length} successful
              </span>
            </button>
            <Show when={relaysExpanded()}>
              <div class="mt-2 space-y-2">
                {/* Successful relays */}
                <Show when={successfulRelays().length > 0}>
                  <div class="p-2 bg-green-500/10 border border-green-500/30 rounded">
                    <div class="text-xs text-green-500 font-semibold mb-1">
                      ✓ Published ({successfulRelays().length})
                    </div>
                    <div class="space-y-1">
                      <For each={successfulRelays()}>
                        {(relay) => (
                          <div class="text-xs text-text-primary font-mono">
                            {relay.url}
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Failed relays */}
                <Show when={failedRelays().length > 0}>
                  <div class="p-2 bg-red-500/10 border border-red-500/30 rounded">
                    <div class="text-xs text-red-500 font-semibold mb-1">
                      ✗ Failed ({failedRelays().length})
                    </div>
                    <div class="space-y-1">
                      <For each={failedRelays()}>
                        {(relay) => (
                          <div class="text-xs">
                            <div class="font-mono text-text-primary">{relay.url}</div>
                            <Show when={relay.error}>
                              <div class="text-red-400 ml-2">{relay.error}</div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Timeout relays */}
                <Show when={timeoutRelays().length > 0}>
                  <div class="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                    <div class="text-xs text-yellow-500 font-semibold mb-1">
                      ⏱ Timeout ({timeoutRelays().length})
                    </div>
                    <div class="space-y-1">
                      <For each={timeoutRelays()}>
                        {(relay) => (
                          <div class="text-xs font-mono text-text-primary">
                            {relay.url}
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    );
  };

  const renderJobCard = (job: PublishJob) => {
    const isActive = () => publishState().activeJobId === job.id;
    const errorExpanded = () => expandedErrors().has(job.id);

    return (
      <div
        class="p-3 rounded flex flex-col gap-2"
        classList={{
          'bg-blue-500/10 border border-blue-500/30': isActive(),
          'bg-bg-secondary/50': !isActive(),
        }}
      >
        {/* Header row */}
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2 flex-wrap">
            <Show when={isActive()}>
              <span class="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-500 rounded font-semibold">
                ACTIVE
              </span>
            </Show>
            {getStatusBadge(job.status)}
            <span class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded">
              {job.meta.type}
            </span>
            <span class="text-xs text-accent">
              POW: {job.meta.difficulty}
            </span>
            <span class="text-xs text-text-secondary">
              Kind: {job.meta.kind}
            </span>
          </div>

          {/* Action buttons - with separator before delete */}
          <div class="flex items-center gap-1">
            <Show when={job.status === 'pending-sign' || job.status === 'signed-pending-publish' || job.status === 'failed'}>
              <button
                onClick={() => handleRetry(job.id)}
                class="text-xs px-2 py-1 bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
                title="Retry now (bypass backoff)"
              >
                ↻ Retry
              </button>
            </Show>
            <button
              onClick={() => handleCopyEvent(job)}
              class="text-xs px-2 py-1 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-tertiary/80 transition-colors"
              title="Copy event JSON"
            >
              📋
            </button>
            <div class="w-px h-4 bg-bg-tertiary mx-1"></div>
            <button
              onClick={() => handleRemove(job.id)}
              class="text-xs px-2 py-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500/30 transition-colors"
              title="Remove"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div class="text-sm text-text-primary">
          {formatContent(job, 80)}
        </div>

        {/* Metadata row */}
        <div class="flex items-center gap-3 text-xs text-text-secondary flex-wrap">
          <span>
            Sign: <span class="font-mono text-text-primary">{job.attempts.sign}</span>
          </span>
          <span>
            Publish: <span class="font-mono text-text-primary">{job.attempts.publish}</span>
          </span>
          <span>
            Relays: <span class="font-mono text-text-primary">{job.relays.length}</span>
          </span>
          <Show when={job.status === 'pending-sign' || job.status === 'signed-pending-publish'}>
            <span>
              Next: <span class="font-mono text-accent">{formatRelativeTime(job.nextAttemptAt)}</span>
            </span>
          </Show>
          <Show when={job.meta.sourceQueueItemId}>
            <span>
              Queue: <span class="font-mono text-text-primary">{job.meta.sourceQueueItemId?.slice(0, 12)}...</span>
            </span>
          </Show>
        </div>

        {/* Relay discovery warning */}
        <Show when={job.meta.relayDiscoveryWarning}>
          <div class="mt-1 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs">
            <div class="text-yellow-500 font-semibold">⚠ Relay Discovery Warning</div>
            <div class="text-text-secondary mt-1">{job.meta.relayDiscoveryWarning}</div>
          </div>
        </Show>

        {/* Error details */}
        <Show when={job.error}>
          <div class="mt-1">
            <button
              onClick={() => toggleErrorExpanded(job.id)}
              class="text-xs text-red-500 hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <span>{errorExpanded() ? '▼' : '▶'}</span>
              <span>Error: {job.error!.code}</span>
              <span class="text-text-secondary">({job.error!.phase})</span>
            </button>
            <Show when={errorExpanded()}>
              <div class="mt-1 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs">
                <div class="text-red-500 font-semibold mb-1">{job.error!.code}</div>
                <div class="text-text-secondary mb-1">Phase: {job.error!.phase}</div>
                <div class="text-text-primary">{job.error!.message}</div>
                <div class="text-text-secondary mt-1">
                  {formatRelativeTime(job.error!.timestamp)}
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    );
  };

  const totalActiveJobs = () => {
    const state = publishState();
    return state.items.filter(
      (job) => job.status === 'pending-sign' || job.status === 'signed-pending-publish'
    ).length;
  };

  return (
    <div class="px-6 py-4 bg-black/90 max-h-[calc(100vh-200px)] overflow-y-auto">
      <div class="max-w-6xl mx-auto">
        {/* Header */}
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-bold">
              Publishing Queue ({totalActiveJobs()} {totalActiveJobs() === 1 ? 'job' : 'jobs'})
            </h3>
            <Show when={publishState().isProcessing}>
              <span class="text-xs px-2 py-1 bg-blue-500/20 text-blue-500 rounded">Processing</span>
            </Show>
            <Show when={!publishState().isProcessing && totalActiveJobs() > 0}>
              <span class="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-500 rounded">Paused</span>
            </Show>
          </div>

          <div class="flex items-center gap-2">
            {/* Auto-publish toggle */}
            <button
              onClick={toggleAutoPublish}
              class="text-xs px-3 py-1.5 rounded transition-colors"
              classList={{
                'bg-accent/20 text-accent': publishState().autoPublish,
                'bg-bg-tertiary text-text-secondary': !publishState().autoPublish,
              }}
              title={publishState().autoPublish ? 'Auto-publish enabled' : 'Auto-publish disabled'}
            >
              Auto {publishState().autoPublish ? '✓' : '✗'}
            </button>

            {/* Pause/Resume */}
            <Show when={totalActiveJobs() > 0}>
              <Show
                when={publishState().isProcessing}
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

            {/* Retry all failed */}
            <Show when={getFailedJobs().length > 0 || publishState().items.some(j => j.error)}>
              <button
                onClick={retryAllFailed}
                class="text-xs px-3 py-1.5 bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
              >
                Retry All Failed
              </button>
            </Show>

            {/* Clear published */}
            <Show when={getPublishedJobs().length > 0}>
              <button
                onClick={clearPublished}
                class="text-xs px-3 py-1.5 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-tertiary/80 transition-colors"
              >
                Clear Published
              </button>
            </Show>
          </div>
        </div>

        {/* Pending Sign Jobs */}
        <Show when={getPendingSignJobs().length > 0}>
          <div class="mb-4">
            <div class="text-xs text-text-secondary mb-2 opacity-60">
              Pending Sign ({getPendingSignJobs().length})
            </div>
            <div class="space-y-2">
              <For each={getPendingSignJobs()}>{(job) => renderJobCard(job)}</For>
            </div>
          </div>
        </Show>

        {/* Pending Publish Jobs */}
        <Show when={getPendingPublishJobs().length > 0}>
          <div class="mb-4">
            <div class="text-xs text-text-secondary mb-2 opacity-60">
              Pending Publish ({getPendingPublishJobs().length})
            </div>
            <div class="space-y-2">
              <For each={getPendingPublishJobs()}>{(job) => renderJobCard(job)}</For>
            </div>
          </div>
        </Show>

        {/* Failed Jobs */}
        <Show when={getFailedJobs().length > 0}>
          <div class="mb-4">
            <div class="text-xs text-text-secondary mb-2 opacity-60">
              Failed ({getFailedJobs().length})
            </div>
            <div class="space-y-2">
              <For each={getFailedJobs()}>{(job) => renderJobCard(job)}</For>
            </div>
          </div>
        </Show>

        {/* Published Jobs (collapsible) */}
        <Show when={getPublishedJobs().length > 0}>
          <details class="mb-4">
            <summary class="text-xs text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
              Published ({getPublishedJobs().length})
            </summary>
            <div class="mt-2 space-y-2">
              <For each={getPublishedJobs()}>{(job) => renderFinishedJobCard(job)}</For>
            </div>
          </details>
        </Show>

        {/* Cancelled Jobs (collapsible) */}
        <Show when={getCancelledJobs().length > 0}>
          <details>
            <summary class="text-xs text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
              Cancelled ({getCancelledJobs().length})
            </summary>
            <div class="mt-2 space-y-2">
              <For each={getCancelledJobs()}>{(job) => renderFinishedJobCard(job)}</For>
            </div>
          </details>
        </Show>

        {/* Empty state */}
        <Show when={publishState().items.length === 0}>
          <div class="text-center py-8 text-text-secondary opacity-60">
            <div class="text-3xl mb-2">📤</div>
            <div class="text-sm">No publishing jobs</div>
          </div>
        </Show>
      </div>
    </div>
  );
};
