import { createSignal, onCleanup, createEffect } from 'solid-js';
import {
  Notemine,
  type BestPowData,
  type SuccessEvent,
  type WorkerPow,
  type MiningState as WrapperMiningState,
} from '@notemine/wrapper';
import type { NostrEvent } from 'nostr-tools/core';
import type { Subscription } from 'rxjs';
import { useMining } from '../providers/MiningProvider';

export interface MiningState {
  mining: boolean;
  hashRate: number;
  overallBestPow: number | null;
  workersBestPow: BestPowData[];
  result: NostrEvent | null;
  error: string | null;
}

export interface MiningOptions {
  content: string;
  pubkey: string;
  difficulty: number;
  numberOfWorkers?: number;
  tags?: string[][];
  kind?: number; // Event kind (default: 1)
}

export function usePowMining() {
  let notemine: Notemine | null = null;
  let subscriptions: Subscription[] = [];
  const { setGlobalMiningState } = useMining();
  let currentQueueItemId: string | null = null;
  let onMiningStateUpdate: ((state: WrapperMiningState) => void) | null = null;

  const [state, setState] = createSignal<MiningState>({
    mining: false,
    hashRate: 0,
    overallBestPow: null,
    workersBestPow: [],
    result: null,
    error: null,
  });

  // Sync local state to global state
  createEffect(() => {
    const currentState = state();
    setGlobalMiningState(currentState);
    console.log('[usePowMining] Syncing to global state:', {
      mining: currentState.mining,
      hashRate: currentState.hashRate
    });
  });

  const startMining = async (
    options: MiningOptions,
    queueItemId?: string,
    onStateUpdate?: (state: WrapperMiningState) => void
  ): Promise<NostrEvent | null> => {
    // Clean up any existing subscriptions and instance first
    console.log('[usePowMining] Starting mining, cleaning up old instance');
    subscriptions.forEach((sub) => sub.unsubscribe());
    subscriptions = [];
    if (notemine) {
      notemine.cancel();
      notemine = null;
    }

    currentQueueItemId = queueItemId || null;
    onMiningStateUpdate = onStateUpdate || null;
    // Reset state
    setState({
      mining: true,
      hashRate: 0,
      overallBestPow: null,
      workersBestPow: [],
      result: null,
      error: null,
    });

    // Initialize notemine
    // Use cores-1 to leave one core free for the system
    const defaultWorkers = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    notemine = new Notemine({
      content: options.content,
      pubkey: options.pubkey,
      difficulty: options.difficulty,
      numberOfWorkers: options.numberOfWorkers || defaultWorkers,
      tags: options.tags || [],
      kind: options.kind, // Pass the kind parameter
    });

    // Subscribe to workers' POW progress
    const workersPowSub = notemine.workersPow$.subscribe((data: Record<number, BestPowData>) => {
      setState((prev) => ({
        ...prev,
        workersBestPow: Object.values(data),
      }));
    });
    subscriptions.push(workersPowSub);

    // Subscribe to overall best POW
    const bestPowSub = notemine.highestPow$.subscribe((pow: WorkerPow | null) => {
      setState((prev) => ({
        ...prev,
        overallBestPow: pow?.bestPow ?? null,
      }));
    });
    subscriptions.push(bestPowSub);

    // Subscribe to progress (for hash rate)
    // Capture the current notemine instance in the closure to avoid stale references
    const currentInstance = notemine;
    const progressSub = currentInstance.progress$.subscribe((progressData) => {
      const hashRate = currentInstance.totalHashRate;
      // Note: totalHashRate is actually in KH/s (divided by 1000 in wrapper)
      const actualHashRate = hashRate * 1000; // Convert back to H/s
      console.log(`[POW Mining] Progress event received:`, {
        progressData,
        totalHashRate: hashRate,
        totalHashRateMHs: (actualHashRate / 1000000).toFixed(2),
        numberOfWorkers: currentInstance.numberOfWorkers
      });
      setState((prev) => ({
        ...prev,
        hashRate,
      }));

      // Save mining state for queue if callback provided
      if (onMiningStateUpdate) {
        console.log('[POW Mining] About to call getState, instance:', {
          hasGetState: typeof currentInstance.getState === 'function',
          instanceType: currentInstance.constructor.name,
          instanceKeys: Object.keys(currentInstance).slice(0, 10)
        });
        const miningState = currentInstance.getState();
        onMiningStateUpdate(miningState);
      }
    });
    subscriptions.push(progressSub);

    // Return promise that resolves when mining completes
    return new Promise((resolve, reject) => {
      // Subscribe to success
      const successSub = notemine!.success$.subscribe(({ result }: SuccessEvent) => {
        if (!result) {
          return;
        }

        setState((prev) => ({
          ...prev,
          mining: false,
          result: result.event,
        }));
        resolve(result.event);
      });
      subscriptions.push(successSub);

      // Subscribe to errors
      const errorSub = notemine!.error$.subscribe(({ error }) => {
        console.error('[POW Mining] Error:', error);
        setState((prev) => ({
          ...prev,
          mining: false,
          error: String(error),
        }));
        reject(error);
      });
      subscriptions.push(errorSub);

      // Start mining
      notemine!.mine().catch(reject);
    });
  };

  const stopMining = () => {
    if (notemine) {
      notemine.cancel();
      setState((prev) => ({
        ...prev,
        mining: false,
      }));
    }
    currentQueueItemId = null;
    onMiningStateUpdate = null;
  };

  const pauseMining = () => {
    if (notemine) {
      notemine.pause();
      setState((prev) => ({
        ...prev,
        mining: false,
      }));
    }
  };

  const resumeMining = async (
    queueItemOrNonces?: any,
    onStateUpdate?: (state: WrapperMiningState) => void
  ): Promise<NostrEvent | null> => {
    // Handle both old signature (workerNonces array) and new signature (queue item)
    const isQueueItem = queueItemOrNonces && typeof queueItemOrNonces === 'object' && 'miningState' in queueItemOrNonces;

    if (isQueueItem) {
      // New resume flow with queue item
      const queueItem = queueItemOrNonces;

      // Clean up any existing subscriptions and instance first
      console.log('[usePowMining] Resuming mining, cleaning up old instance');
      subscriptions.forEach((sub) => sub.unsubscribe());
      subscriptions = [];
      if (notemine) {
        notemine.cancel();
        notemine = null;
      }

      currentQueueItemId = queueItem.id || null;
      onMiningStateUpdate = onStateUpdate || null;

      console.log('[usePowMining] Resuming with queue item:', queueItem.id);
      console.log('[usePowMining] Resume state:', {
        workerNonces: queueItem.miningState?.workerNonces,
        numberOfWorkers: queueItem.miningState?.numberOfWorkers,
        hasState: !!queueItem.miningState
      });

      // Initialize notemine with the original parameters
      const defaultWorkers = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
      notemine = new Notemine({
        content: queueItem.content,
        pubkey: queueItem.pubkey,
        difficulty: queueItem.difficulty,
        numberOfWorkers: queueItem.miningState?.numberOfWorkers || defaultWorkers,
        tags: queueItem.tags || [],
        kind: queueItem.kind,
      });

      // Restore the saved state
      console.log('[usePowMining] Calling restoreState with:', {
        fullState: queueItem.miningState,
        workerNonces: queueItem.miningState?.workerNonces,
        numberOfWorkers: queueItem.miningState?.numberOfWorkers,
        bestPow: queueItem.miningState?.bestPow
      });
      notemine.restoreState(queueItem.miningState);
      console.log('[usePowMining] restoreState complete');

      // Subscribe to observables (same as startMining)
      subscriptions.forEach(sub => sub.unsubscribe());
      subscriptions = [];

      // Subscribe to workers' POW progress
      const workersPowSub = notemine.workersPow$.subscribe((data: Record<number, BestPowData>) => {
        setState((prev) => ({
          ...prev,
          workersBestPow: Object.values(data),
        }));
      });
      subscriptions.push(workersPowSub);

      // Subscribe to overall best POW
      const bestPowSub = notemine.highestPow$.subscribe((pow: WorkerPow | null) => {
        setState((prev) => ({
          ...prev,
          overallBestPow: pow?.bestPow ?? null,
        }));
      });
      subscriptions.push(bestPowSub);

      // Subscribe to progress (for hash rate)
      // Capture the current notemine instance in the closure to avoid stale references
      const currentInstance = notemine;
      const progressSub = currentInstance.progress$.subscribe((progressData) => {
        const hashRate = currentInstance.totalHashRate;
        console.log(`[POW Mining] Progress event received:`, {
          progressData,
          totalHashRate: hashRate,
          totalHashRateMHs: ((hashRate * 1000) / 1000000).toFixed(2),
          numberOfWorkers: currentInstance.numberOfWorkers
        });
        setState((prev) => ({
          ...prev,
          hashRate,
        }));

        // Save mining state for queue if callback provided
        if (onMiningStateUpdate) {
          const miningState = currentInstance.getState();
          console.log('[POW Mining] Saving mining state:', {
            workerNonces: miningState.workerNonces,
            bestPow: currentInstance.highestPow$.getValue()?.bestPow
          });
          onMiningStateUpdate(miningState);
        }
      });
      subscriptions.push(progressSub);

      // Set mining state
      setState((prev) => ({
        ...prev,
        mining: true,
      }));

      // Return promise that resolves when mining completes
      return new Promise((resolve, reject) => {
        // Subscribe to success
        const successSub = notemine!.success$.subscribe(({ result }: SuccessEvent) => {
          if (!result) {
            return;
          }

          setState((prev) => ({
            ...prev,
            mining: false,
            result: result.event,
          }));
          resolve(result.event);
        });
        subscriptions.push(successSub);

        // Subscribe to errors
        const errorSub = notemine!.error$.subscribe(({ error }) => {
          console.error('[POW Mining] Error:', error);
          setState((prev) => ({
            ...prev,
            mining: false,
            error: String(error),
          }));
          reject(error);
        });
        subscriptions.push(errorSub);

        // Resume mining
        console.log('[usePowMining] Calling resume with nonces:', queueItem.miningState.workerNonces);
        notemine!.resume(queueItem.miningState.workerNonces).catch(reject);
      });
    } else {
      // Old signature: just resume with nonces (simple pause/resume within same session)
      const workerNonces = queueItemOrNonces as string[] | undefined;
      if (notemine) {
        await notemine.resume(workerNonces);
        setState((prev) => ({
          ...prev,
          mining: true,
        }));
      }
      return null;
    }
  };

  const getMiningState = (): WrapperMiningState | null => {
    return notemine ? notemine.getState() : null;
  };

  const restoreMiningState = (restoredState: WrapperMiningState) => {
    if (notemine) {
      notemine.restoreState(restoredState);
    }
  };

  const cleanup = () => {
    subscriptions.forEach((sub) => sub.unsubscribe());
    subscriptions = [];
    if (notemine && state().mining) {
      notemine.cancel();
    }
    notemine = null;
  };

  onCleanup(cleanup);

  return {
    state,
    startMining,
    stopMining,
    pauseMining,
    resumeMining,
    getMiningState,
    restoreMiningState,
    cleanup,
    get currentQueueItemId() {
      return currentQueueItemId;
    },
  };
}
