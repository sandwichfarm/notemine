import { Component, createEffect } from 'solid-js';
import { usePublishing } from '../providers/PublishingProvider';
import { useUser } from '../providers/UserProvider';
import { relayPool } from '../lib/applesauce';
import { finalizeEvent } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/core';
import { debug } from '../lib/debug';
import type { PublishError } from '../types/publishing';

/**
 * PublishingProcessor handles background processing of publish jobs.
 * It runs separately from mining and retries with exponential backoff.
 */
export const PublishingProcessor: Component = () => {
  const publishing = usePublishing();
  const { publishState, updateJobStatus, updateJobAttempts, setSignedEvent, setActiveJob, getNextEligibleJob } = publishing;
  const { user } = useUser();

  let processingLock = false;
  let wakeupTimer: number | null = null;

  // Exponential backoff sequence (milliseconds)
  const BACKOFF_SEQUENCE = [2000, 5000, 10000, 30000, 60000, 120000, 300000];

  // Compute next attempt delay with exponential backoff and jitter
  const computeNextAttempt = (attemptNumber: number): number => {
    const index = Math.min(attemptNumber, BACKOFF_SEQUENCE.length - 1);
    const baseDelay = BACKOFF_SEQUENCE[index];
    // Add jitter: multiply by random [0.5, 1.5]
    const jitter = 0.5 + Math.random();
    const delay = baseDelay * jitter;
    return Date.now() + delay;
  };

  // Choose signer based on available options
  const chooseSigner = (): 'secret' | 'nip46' | 'nip07' | 'none' => {
    const currentUser = user();
    if (!currentUser) return 'none';

    // Priority: anon secret > NIP-46 > NIP-07
    if (currentUser.isAnon && currentUser.secret) {
      return 'secret';
    }
    if (currentUser.signer) {
      return 'nip46';
    }
    if (window.nostr) {
      return 'nip07';
    }
    return 'none';
  };

  // Sign an event using the chosen signer
  const signEvent = async (
    eventTemplate: NostrEvent,
    signerType: 'secret' | 'nip46' | 'nip07'
  ): Promise<NostrEvent> => {
    const currentUser = user();
    if (!currentUser) {
      throw new Error('No user authenticated');
    }

    try {
      switch (signerType) {
        case 'secret':
          if (!currentUser.secret) throw new Error('No secret available');
          return finalizeEvent(eventTemplate as any, currentUser.secret);

        case 'nip46':
          if (!currentUser.signer) throw new Error('No NIP-46 signer available');
          return await currentUser.signer.signEvent(eventTemplate as any);

        case 'nip07':
          if (!window.nostr) throw new Error('No NIP-07 extension available');
          return await window.nostr.signEvent(eventTemplate);

        default:
          throw new Error(`Unknown signer type: ${signerType}`);
      }
    } catch (error: any) {
      // Map specific errors to codes
      if (error.message?.includes('User rejected') || error.message?.includes('denied')) {
        throw { code: 'USER_REJECTED', message: error.message };
      }
      if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
        throw { code: 'TIMEOUT', message: error.message };
      }
      throw { code: 'SIGNER_ERROR', message: error.message || String(error) };
    }
  };

  // Publish event to relays with timeout
  const publishToRelays = async (
    signedEvent: NostrEvent,
    relays: string[],
    timeoutMs: number = 7000
  ): Promise<{ anySuccess: boolean; perRelay: Record<string, 'ok' | 'error' | 'timeout'> }> => {
    const perRelay: Record<string, 'ok' | 'error' | 'timeout'> = {};

    const publishPromises = relays.map(async (relayUrl) => {
      try {
        const relay = relayPool.relay(relayUrl);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        );

        await Promise.race([relay.publish(signedEvent), timeoutPromise]);
        perRelay[relayUrl] = 'ok';
      } catch (error: any) {
        if (error.message === 'timeout') {
          perRelay[relayUrl] = 'timeout';
        } else {
          perRelay[relayUrl] = 'error';
        }
      }
    });

    await Promise.allSettled(publishPromises);

    const anySuccess = Object.values(perRelay).some((status) => status === 'ok');

    return { anySuccess, perRelay };
  };

  // Process the next eligible job
  const processNextJob = async () => {
    if (processingLock) {
      debug('[PublishingProcessor] Already processing, skipping');
      return;
    }

    const state = publishState();
    if (!state.isProcessing) {
      debug('[PublishingProcessor] Publishing paused');
      return;
    }

    const nextJob = getNextEligibleJob();
    if (!nextJob) {
      debug('[PublishingProcessor] No eligible jobs to process');
      return;
    }

    debug('[PublishingProcessor] Processing job:', {
      id: nextJob.id,
      status: nextJob.status,
      kind: nextJob.meta.kind,
      signAttempts: nextJob.attempts.sign,
      publishAttempts: nextJob.attempts.publish,
    });

    processingLock = true;
    setActiveJob(nextJob.id);

    try {
      // Phase 1: Signing
      if (nextJob.status === 'pending-sign') {
        const signerType = chooseSigner();

        if (signerType === 'none') {
          // No signer available - schedule retry
          const error: PublishError = {
            phase: 'sign',
            code: 'SIGNER_UNAVAILABLE',
            message: 'No signing method available (NIP-46 bunker offline, NIP-07 disabled, or no anon secret)',
            timestamp: Date.now(),
          };

          const nextAttemptAt = computeNextAttempt(nextJob.attempts.sign);
          debug('[PublishingProcessor] No signer available, retry at:', new Date(nextAttemptAt));

          updateJobAttempts(nextJob.id, 'sign', nextAttemptAt, error);

          processingLock = false;
          setActiveJob(null);
          return;
        }

        // Attempt signing
        debug('[PublishingProcessor] Attempting to sign with:', signerType);
        try {
          const signedEvent = await signEvent(nextJob.eventTemplate, signerType);
          debug('[PublishingProcessor] Signing successful');
          setSignedEvent(nextJob.id, signedEvent);
        } catch (error: any) {
          const publishError: PublishError = {
            phase: 'sign',
            code: error.code || 'SIGNING_FAILED',
            message: error.message || String(error),
            timestamp: Date.now(),
          };

          const nextAttemptAt = computeNextAttempt(nextJob.attempts.sign);
          debug('[PublishingProcessor] Signing failed:', publishError.code, 'retry at:', new Date(nextAttemptAt));

          updateJobAttempts(nextJob.id, 'sign', nextAttemptAt, publishError);

          processingLock = false;
          setActiveJob(null);
          return;
        }
      }

      // Phase 2: Publishing
      if (nextJob.status === 'signed-pending-publish') {
        if (!nextJob.signedEvent) {
          console.error('[PublishingProcessor] Job marked as signed but no signedEvent found');
          updateJobStatus(nextJob.id, 'failed', {
            phase: 'publish',
            code: 'MISSING_SIGNED_EVENT',
            message: 'Internal error: signed event not found',
            timestamp: Date.now(),
          });
          processingLock = false;
          setActiveJob(null);
          return;
        }

        debug('[PublishingProcessor] Publishing to', nextJob.relays.length, 'relays');
        const { anySuccess, perRelay } = await publishToRelays(nextJob.signedEvent, nextJob.relays);

        const successCount = Object.values(perRelay).filter((s) => s === 'ok').length;
        debug('[PublishingProcessor] Publishing result:', {
          success: anySuccess,
          successCount,
          totalRelays: nextJob.relays.length,
        });

        if (anySuccess) {
          // At least one relay succeeded
          updateJobStatus(nextJob.id, 'published');
          debug('[PublishingProcessor] Job published successfully');
        } else {
          // All relays failed
          const error: PublishError = {
            phase: 'publish',
            code: 'ALL_RELAYS_FAILED',
            message: `Failed to publish to all ${nextJob.relays.length} relays`,
            timestamp: Date.now(),
          };

          const nextAttemptAt = computeNextAttempt(nextJob.attempts.publish);
          debug('[PublishingProcessor] All relays failed, retry at:', new Date(nextAttemptAt));

          updateJobAttempts(nextJob.id, 'publish', nextAttemptAt, error);
        }
      }

      processingLock = false;
      setActiveJob(null);

      // Process next job if autoPublish is enabled
      if (state.autoPublish) {
        setTimeout(processNextJob, 1000);
      }
    } catch (error) {
      console.error('[PublishingProcessor] Unexpected error:', error);
      processingLock = false;
      setActiveJob(null);
    }
  };

  // Clear wake-up timer
  const clearWakeupTimer = () => {
    if (wakeupTimer !== null) {
      clearTimeout(wakeupTimer);
      wakeupTimer = null;
    }
  };

  // Schedule wake-up for next eligible job
  const scheduleWakeup = (state: ReturnType<typeof publishState>) => {
    clearWakeupTimer();

    if (!state.isProcessing) return;

    // Find soonest nextAttemptAt among pending jobs
    const now = Date.now();
    const pendingJobs = state.items.filter(
      (j) => j.status === 'pending-sign' || j.status === 'signed-pending-publish'
    );

    if (pendingJobs.length === 0) return;

    const soonestTime = Math.min(...pendingJobs.map((j) => j.nextAttemptAt));

    if (soonestTime > now) {
      const delay = soonestTime - now;
      debug('[PublishingProcessor] Scheduling wake-up in', delay, 'ms at', new Date(soonestTime));
      wakeupTimer = window.setTimeout(() => {
        debug('[PublishingProcessor] Wake-up timer fired');
        processNextJob();
      }, delay);
    }
  };

  // Monitor state changes and auto-start processing
  createEffect(() => {
    const state = publishState();
    const currentUser = user(); // Track signer availability

    debug('[PublishingProcessor] State changed:', {
      isProcessing: state.isProcessing,
      autoPublish: state.autoPublish,
      pendingJobs: state.items.filter((j) => j.status === 'pending-sign' || j.status === 'signed-pending-publish').length,
      activeJobId: state.activeJobId,
      hasSigner: currentUser?.signer ? 'nip46' : currentUser?.secret ? 'secret' : window.nostr ? 'nip07' : 'none',
    });

    // Clear timer if processing is paused
    if (!state.isProcessing) {
      clearWakeupTimer();
      return;
    }

    // Auto-start processing when conditions are met
    if (!processingLock) {
      const nextJob = getNextEligibleJob();
      if (nextJob) {
        debug('[PublishingProcessor] Eligible job found, starting processing');
        processNextJob();
      } else {
        // No eligible jobs now - schedule wake-up for next retry
        scheduleWakeup(state);
      }
    }
  });

  return null; // Headless component
};
