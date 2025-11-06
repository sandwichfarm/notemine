import { createContext, useContext, Component, JSX, onMount, onCleanup } from 'solid-js';
import type {
  PublishJob,
  PublishingState,
  CreatePublishJobInput,
  PublishJobStatus,
  PublishError,
  RelayResult,
} from '../types/publishing';
import { createLocalStore } from '../lib/localStorage';
import { debug } from '../lib/debug';

interface PublishingContextType {
  publishState: () => PublishingState;
  addPublishJob: (input: CreatePublishJobInput) => string;
  removePublishJob: (jobId: string) => void;
  retryPublishJob: (jobId: string) => void;
  retryAllFailed: () => void;
  updateJobStatus: (jobId: string, status: PublishJobStatus, error?: PublishError) => void;
  updateJobAttempts: (jobId: string, phase: 'sign' | 'publish', nextAttemptAt: number, error?: PublishError) => void;
  setSignedEvent: (jobId: string, signedEvent: any) => void;
  setRelayResults: (jobId: string, relayResults: RelayResult[]) => void;
  setActiveJob: (jobId: string | null) => void;
  pausePublishing: () => void;
  resumePublishing: () => void;
  clearPublished: () => void;
  toggleAutoPublish: () => void;
  getNextEligibleJob: () => PublishJob | null;
}

const PublishingContext = createContext<PublishingContextType>();

const DEFAULT_PUBLISHING_STATE: PublishingState = {
  items: [],
  activeJobId: null,
  isProcessing: true,  // Auto-start by default
  autoPublish: true,   // Auto-process by default
};

// Maximum attempts before marking job as failed
const MAX_SIGN_ATTEMPTS = 20;
const MAX_PUBLISH_ATTEMPTS = 20;

export const PublishingProvider: Component<{ children: JSX.Element }> = (props) => {
  // Use lazy mode: keep state in-memory, only flush on page exit or critical operations
  const store = createLocalStore<PublishingState>(
    'notemine:publishingQueue',
    DEFAULT_PUBLISHING_STATE,
    { lazy: true }
  );
  const publishState = store.value;
  const setPublishState = store.setValue;
  const flushQueue = store.flush;

  // Event handlers for persistence
  const handleFlush = () => {
    debug('[PublishingProvider] Flushing publishing queue to localStorage');
    flushQueue();
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      debug('[PublishingProvider] Flushing publishing queue on tab hide');
      flushQueue();
    }
  };

  // Add event listeners to flush queue state on page exit
  onMount(() => {
    window.addEventListener('beforeunload', handleFlush);
    window.addEventListener('pagehide', handleFlush);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    debug('[PublishingProvider] Added event listeners for publishing queue persistence');
  });

  onCleanup(() => {
    debug('[PublishingProvider] Cleanup: flushing publishing queue and removing listeners');
    flushQueue();
    window.removeEventListener('beforeunload', handleFlush);
    window.removeEventListener('pagehide', handleFlush);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  // Add a new publish job
  const addPublishJob = (input: CreatePublishJobInput): string => {
    const id = `publish-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const newJob: PublishJob = {
      id,
      status: 'pending-sign',
      eventTemplate: input.eventTemplate,
      relays: input.relays,
      attempts: {
        sign: 0,
        publish: 0,
      },
      nextAttemptAt: now,
      meta: input.meta,
      createdAt: now,
      updatedAt: now,
    };

    setPublishState((prev) => ({
      ...prev,
      items: [...prev.items, newJob],
    }));

    debug('[PublishingQueue] Added job:', {
      id: newJob.id,
      kind: newJob.meta.kind,
      type: newJob.meta.type,
      relays: newJob.relays.length,
    });

    flushQueue(); // Persist immediately after adding job
    return id;
  };

  // Remove a publish job
  const removePublishJob = (jobId: string) => {
    const state = publishState();
    const isActiveJob = state.activeJobId === jobId;

    setPublishState((prev) => ({
      ...prev,
      items: prev.items.filter((job) => job.id !== jobId),
      activeJobId: prev.activeJobId === jobId ? null : prev.activeJobId,
    }));

    debug('[PublishingQueue] Removed job:', jobId, 'wasActive:', isActiveJob);
    flushQueue(); // Persist immediately after removing job
  };

  // Retry a publish job (bypasses backoff)
  const retryPublishJob = (jobId: string) => {
    setPublishState((prev) => ({
      ...prev,
      items: prev.items.map((job) =>
        job.id === jobId
          ? {
              ...job,
              nextAttemptAt: Date.now(),
              error: undefined,
              updatedAt: Date.now(),
            }
          : job
      ),
    }));

    debug('[PublishingQueue] Retry requested for job:', jobId);
    flushQueue(); // Persist immediately
  };

  // Retry all failed jobs (bulk recovery)
  const retryAllFailed = () => {
    const now = Date.now();
    let count = 0;

    setPublishState((prev) => ({
      ...prev,
      items: prev.items.map((job) => {
        // Retry jobs that are failed or have errors
        if (job.status === 'failed' || job.error) {
          count++;
          return {
            ...job,
            status: job.status === 'failed' ? 'pending-sign' : job.status, // Reset failed jobs to pending-sign
            nextAttemptAt: now,
            error: undefined,
            updatedAt: now,
          };
        }
        return job;
      }),
    }));

    debug('[PublishingQueue] Retry all failed requested, retrying', count, 'jobs');
    flushQueue(); // Persist immediately
  };

  // Update job status
  const updateJobStatus = (
    jobId: string,
    status: PublishJobStatus,
    error?: PublishError
  ) => {
    setPublishState((prev) => ({
      ...prev,
      items: prev.items.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status,
              error,
              updatedAt: Date.now(),
            }
          : job
      ),
    }));

    debug(`[PublishingQueue] Updated job ${jobId} status:`, status);

    // Flush on final states
    if (['published', 'failed', 'cancelled'].includes(status)) {
      flushQueue();
    }
  };

  // Update job attempts and schedule next retry
  const updateJobAttempts = (
    jobId: string,
    phase: 'sign' | 'publish',
    nextAttemptAt: number,
    error?: PublishError
  ) => {
    const maxAttempts = phase === 'sign' ? MAX_SIGN_ATTEMPTS : MAX_PUBLISH_ATTEMPTS;

    setPublishState((prev) => ({
      ...prev,
      items: prev.items.map((job) => {
        if (job.id !== jobId) return job;

        const newAttemptCount = job.attempts[phase] + 1;

        // Check if max attempts reached
        if (newAttemptCount >= maxAttempts) {
          debug(`[PublishingQueue] Job ${jobId} exceeded max ${phase} attempts (${maxAttempts}), marking as failed`);
          return {
            ...job,
            status: 'failed' as PublishJobStatus,
            attempts: {
              ...job.attempts,
              [phase]: newAttemptCount,
            },
            error: error || {
              phase,
              code: 'MAX_ATTEMPTS_EXCEEDED',
              message: `Exceeded maximum ${phase} attempts (${maxAttempts})`,
              timestamp: Date.now(),
            },
            updatedAt: Date.now(),
          };
        }

        // Schedule next retry
        return {
          ...job,
          attempts: {
            ...job.attempts,
            [phase]: newAttemptCount,
          },
          nextAttemptAt,
          error,
          updatedAt: Date.now(),
        };
      }),
    }));

    debug(`[PublishingQueue] Updated job ${jobId} ${phase} attempts:`, {
      nextAttempt: new Date(nextAttemptAt),
      error: error?.code,
    });

    flushQueue(); // Persist attempt updates
  };

  // Set signed event for a job
  const setSignedEvent = (jobId: string, signedEvent: any) => {
    setPublishState((prev) => ({
      ...prev,
      items: prev.items.map((job) =>
        job.id === jobId
          ? {
              ...job,
              signedEvent,
              status: 'signed-pending-publish' as PublishJobStatus,
              attempts: {
                ...job.attempts,
                publish: 0, // Reset publish attempts when newly signed
              },
              nextAttemptAt: Date.now(),
              updatedAt: Date.now(),
            }
          : job
      ),
    }));

    debug(`[PublishingQueue] Set signed event for job ${jobId}`);
    flushQueue(); // Persist signed event immediately
  };

  // Set relay results for a job
  const setRelayResults = (jobId: string, relayResults: RelayResult[]) => {
    setPublishState((prev) => ({
      ...prev,
      items: prev.items.map((job) =>
        job.id === jobId
          ? {
              ...job,
              relayResults,
              updatedAt: Date.now(),
            }
          : job
      ),
    }));

    debug(`[PublishingQueue] Set relay results for job ${jobId}:`, {
      success: relayResults.filter((r) => r.status === 'success').length,
      failed: relayResults.filter((r) => r.status === 'failed').length,
      timeout: relayResults.filter((r) => r.status === 'timeout').length,
    });
  };

  // Set active job
  const setActiveJob = (jobId: string | null) => {
    setPublishState((prev) => ({
      ...prev,
      activeJobId: jobId,
    }));
  };

  // Pause publishing
  const pausePublishing = () => {
    setPublishState((prev) => ({
      ...prev,
      isProcessing: false,
    }));
    debug('[PublishingQueue] Paused processing');
    flushQueue(); // Persist immediately
  };

  // Resume publishing
  const resumePublishing = () => {
    setPublishState((prev) => ({
      ...prev,
      isProcessing: true,
    }));
    debug('[PublishingQueue] Resumed processing');
    flushQueue(); // Persist immediately
  };

  // Clear published jobs
  const clearPublished = () => {
    setPublishState((prev) => ({
      ...prev,
      items: prev.items.filter((job) => job.status !== 'published'),
    }));
    debug('[PublishingQueue] Cleared published jobs');
    flushQueue(); // Persist immediately
  };

  // Toggle auto-publish
  const toggleAutoPublish = () => {
    setPublishState((prev) => ({
      ...prev,
      autoPublish: !prev.autoPublish,
    }));
    flushQueue(); // Persist immediately
  };

  // Get next eligible job for processing
  const getNextEligibleJob = (): PublishJob | null => {
    const state = publishState();
    const now = Date.now();

    // Find jobs that are ready to process (nextAttemptAt <= now)
    const eligibleJobs = state.items.filter(
      (job) =>
        (job.status === 'pending-sign' || job.status === 'signed-pending-publish') &&
        job.nextAttemptAt <= now
    );

    if (eligibleJobs.length === 0) return null;

    // Sort by nextAttemptAt (earliest first), then by priority: pending-sign > signed-pending-publish
    eligibleJobs.sort((a, b) => {
      if (a.nextAttemptAt !== b.nextAttemptAt) {
        return a.nextAttemptAt - b.nextAttemptAt;
      }
      // Prioritize pending-sign over signed-pending-publish
      if (a.status === 'pending-sign' && b.status !== 'pending-sign') return -1;
      if (a.status !== 'pending-sign' && b.status === 'pending-sign') return 1;
      return 0;
    });

    return eligibleJobs[0];
  };

  const value: PublishingContextType = {
    publishState,
    addPublishJob,
    removePublishJob,
    retryPublishJob,
    retryAllFailed,
    updateJobStatus,
    updateJobAttempts,
    setSignedEvent,
    setRelayResults,
    setActiveJob,
    pausePublishing,
    resumePublishing,
    clearPublished,
    toggleAutoPublish,
    getNextEligibleJob,
  };

  return (
    <PublishingContext.Provider value={value}>
      {props.children}
    </PublishingContext.Provider>
  );
};

export function usePublishing(): PublishingContextType {
  const context = useContext(PublishingContext);
  if (!context) {
    throw new Error('usePublishing must be used within PublishingProvider');
  }
  return context;
}
