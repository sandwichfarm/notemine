import { createContext, useContext, ParentComponent, createSignal, onCleanup } from 'solid-js';
import {
  Notemine,
  type BestPowData,
  type SuccessEvent,
  type WorkerPow,
  type MiningState as WrapperMiningState,
} from '@notemine/wrapper';
import type { NostrEvent } from 'nostr-tools/core';
import type { Subscription } from 'rxjs';
import { usePreferences } from './PreferencesProvider';

export interface MiningState {
  mining: boolean;
  hashRate: number;
  overallBestPow: number | null;
  workersBestPow: BestPowData[];
  workersHashRates: Record<number, number>; // Hash rate per worker in H/s
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

interface MiningContextType {
  miningState: () => MiningState;
  startMining: (
    options: MiningOptions,
    queueItemId?: string,
    onStateUpdate?: (state: WrapperMiningState) => void
  ) => Promise<NostrEvent | null>;
  stopMining: () => void;
  pauseMining: () => void;
  resumeMining: (
    queueItemOrNonces?: any,
    onStateUpdate?: (state: WrapperMiningState) => void
  ) => Promise<NostrEvent | null>;
  getMiningState: () => WrapperMiningState | null;
  restoreMiningState: (restoredState: WrapperMiningState) => void;
  currentQueueItemId: string | null;
}

const MiningContext = createContext<MiningContextType>();

export const MiningProvider: ParentComponent = (props) => {
  const { preferences } = usePreferences();

  let notemine: Notemine | null = null;
  let subscriptions: Subscription[] = [];
  let currentQueueItemId: string | null = null;
  let onMiningStateUpdate: ((state: WrapperMiningState) => void) | null = null;
  // Debug: track active workerIds seen in progress
  const activeWorkerIds = new Set<number>();
  // Phase 5: Throttle state updates to ~500ms to avoid excessive persistence writes
  let lastStateUpdateTime = 0;
  const STATE_UPDATE_THROTTLE_MS = 500;

  const [miningState, setMiningState] = createSignal<MiningState>({
    mining: false,
    hashRate: 0,
    overallBestPow: null,
    workersBestPow: [],
    workersHashRates: {},
    result: null,
    error: null,
  });

  // Debug logger helper (non-reactive)
  const debug = (...args: any[]) => {
    // Read preferences value directly without creating reactive dependency
    const debugMode = preferences().debugMode;
    if (debugMode) {
      console.log(...args);
    }
  };

  const startMining = async (
    options: MiningOptions,
    queueItemId?: string,
    onStateUpdate?: (state: WrapperMiningState) => void
  ): Promise<NostrEvent | null> => {
    // Clean up any existing subscriptions and instance first
    debug('[MiningProvider] Starting mining, cleaning up old instance');
    subscriptions.forEach((sub) => sub.unsubscribe());
    subscriptions = [];
    if (notemine) {
      notemine.cancel();
      notemine = null;
    }
    activeWorkerIds.clear();
    lastStateUpdateTime = 0; // Phase 5: Reset throttle timer

    // Cache debug mode to avoid repeated preferences() calls in hot path
    const debugMode = preferences().debugMode;

    currentQueueItemId = queueItemId || null;
    onMiningStateUpdate = onStateUpdate || null;

    // Reset state
    setMiningState({
      mining: true,
      hashRate: 0,
      overallBestPow: null,
      workersBestPow: [],
      workersHashRates: {},
      result: null,
      error: null,
    });

    // Initialize notemine
    const hw = navigator.hardwareConcurrency || 4;
    const defaultWorkers = Math.max(1, hw - 1);
    const prefWorkers = preferences().minerNumberOfWorkers;
    const useAll = preferences().minerUseAllCores;
    // Choose: explicit option > preference > default
    let chosenWorkers = useAll ? hw : (options.numberOfWorkers ?? (prefWorkers && prefWorkers > 0 ? prefWorkers : defaultWorkers));
    // Clamp to 1..hw
    chosenWorkers = Math.max(1, Math.min(chosenWorkers, hw));
    debug('[MiningProvider] startMining worker selection:', {
      hardwareConcurrency: navigator.hardwareConcurrency,
      requested: options.numberOfWorkers,
      preference: prefWorkers,
      useAllCores: useAll,
      chosen: chosenWorkers,
    });
    notemine = new Notemine({
      content: options.content,
      pubkey: options.pubkey,
      difficulty: options.difficulty,
      numberOfWorkers: chosenWorkers,
      tags: options.tags || [],
      kind: options.kind,
      debug: preferences().debugMode,
    });

    // Subscribe to workers list (debug visibility)
    const workersSub = notemine.workers$.subscribe((workers) => {
      debug('[MiningProvider] workers$ count:', workers.length);
    });
    subscriptions.push(workersSub);

    // Subscribe to workers' POW progress
    const workersPowSub = notemine.workersPow$.subscribe((data: Record<number, BestPowData>) => {
      setMiningState((prev) => ({
        ...prev,
        workersBestPow: Object.values(data),
      }));
    });
    subscriptions.push(workersPowSub);

    // Subscribe to overall best POW
    const bestPowSub = notemine.highestPow$.subscribe((pow: WorkerPow | null) => {
      setMiningState((prev) => ({
        ...prev,
        overallBestPow: pow?.bestPow ?? null,
      }));
    });
    subscriptions.push(bestPowSub);

    // Subscribe to progress (for hash rate)
    const currentInstance = notemine;
    const progressSub = currentInstance.progress$.subscribe(({ workerId, hashRate: workerHashRate }) => {
      const totalHashRate = currentInstance.totalHashRate;

      setMiningState((prev) => ({
        ...prev,
        hashRate: totalHashRate,
        // Update per-worker hash rate
        workersHashRates: workerHashRate
          ? { ...prev.workersHashRates, [workerId]: workerHashRate }
          : prev.workersHashRates,
      }));

      // Phase 5: Save mining state for queue if callback provided (with throttling)
      if (onMiningStateUpdate) {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastStateUpdateTime;

        // Throttle: only update every 500ms to avoid excessive writes
        if (timeSinceLastUpdate >= STATE_UPDATE_THROTTLE_MS) {
          const miningStateData = currentInstance.getState();
          onMiningStateUpdate(miningStateData);
          lastStateUpdateTime = now;

          if (debugMode) {
            debug('[MiningProvider] State update:', {
              nonces: miningStateData.workerNonces.length,
              hashRate: (totalHashRate / 1000).toFixed(2) + ' kH/s'
            });
          }
        }
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

        setMiningState((prev) => ({
          ...prev,
          mining: false,
          result: result.event,
        }));
        resolve(result.event);
      });
      subscriptions.push(successSub);

      // Subscribe to errors
      const errorSub = notemine!.error$.subscribe(({ error }) => {
        // Phase 6: Log errors with context (queue item id, event kind)
        console.error('[MiningProvider] Error:', {
          error: String(error),
          queueItemId: currentQueueItemId,
          kind: options.kind,
          difficulty: options.difficulty,
        });
        setMiningState((prev) => ({
          ...prev,
          mining: false,
          error: String(error),
        }));
        reject(error);
      });
      subscriptions.push(errorSub);

      // Subscribe to cancelled events
      const cancelledSub = notemine!.cancelled$.subscribe((cancelled) => {
        if (cancelled) {
          debug('[MiningProvider] Mining was cancelled, resolving promise with null');
          setMiningState((prev) => ({
            ...prev,
            mining: false,
          }));
          resolve(null);
        }
      });
      subscriptions.push(cancelledSub);

      // Subscribe to paused events
      const pausedSub = notemine!.paused$.subscribe((paused) => {
        if (paused) {
          debug('[MiningProvider] Mining was paused, resolving promise with null');
          setMiningState((prev) => ({
            ...prev,
            mining: false,
          }));
          resolve(null);
        }
      });
      subscriptions.push(pausedSub);

      // Start mining
      notemine!.mine().catch(reject);
    });
  };

  const stopMining = () => {
    if (notemine) {
      notemine.cancel();
      setMiningState((prev) => ({
        ...prev,
        mining: false,
      }));
    }
    currentQueueItemId = null;
    onMiningStateUpdate = null;
    lastStateUpdateTime = 0; // Phase 5: Reset throttle timer
  };

  const pauseMining = () => {
    if (notemine) {
      notemine.pause();
      setMiningState((prev) => ({
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

      // If resume is disabled, start a fresh mining session using the queue item params
      if (preferences().disableResume) {
        debug('[MiningProvider] Disable Resume enabled — starting fresh instead of resume');
        return startMining(
          {
            content: queueItem.content,
            pubkey: queueItem.pubkey,
            difficulty: queueItem.difficulty,
            numberOfWorkers: preferences().minerUseAllCores
              ? (navigator.hardwareConcurrency || 4)
              : preferences().minerNumberOfWorkers,
            tags: queueItem.tags || [],
            kind: queueItem.kind,
          },
          queueItem.id,
          onStateUpdate
        );
      }

      // Clean up any existing subscriptions and instance first
      debug('[MiningProvider] Resuming mining, cleaning up old instance');
      subscriptions.forEach((sub) => sub.unsubscribe());
      subscriptions = [];
      if (notemine) {
        notemine.cancel();
        notemine = null;
      }
      activeWorkerIds.clear();
      lastStateUpdateTime = 0; // Phase 5: Reset throttle timer

      // Cache debug mode to avoid repeated preferences() calls in hot path
      const debugMode = preferences().debugMode;

      currentQueueItemId = queueItem.id || null;
      onMiningStateUpdate = onStateUpdate || null;

      debug('[MiningProvider] Resuming with queue item:', queueItem.id);

      // Initialize notemine with the original parameters
      const hw = navigator.hardwareConcurrency || 4;
      const defaultWorkers = Math.max(1, hw - 1);
      const prefWorkers = preferences().minerNumberOfWorkers;
      const useAll = preferences().minerUseAllCores;
      // Use preference if set; otherwise current default. Ignore saved worker count.
      let chosenWorkers = useAll ? hw : (prefWorkers && prefWorkers > 0 ? prefWorkers : defaultWorkers);
      chosenWorkers = Math.max(1, Math.min(chosenWorkers, hw));
      debug('[MiningProvider] resumeMining worker selection:', {
        hardwareConcurrency: navigator.hardwareConcurrency,
        saved: queueItem.miningState?.numberOfWorkers,
        preference: prefWorkers,
        useAllCores: useAll,
        chosen: chosenWorkers,
      });
      notemine = new Notemine({
        content: queueItem.content,
        pubkey: queueItem.pubkey,
        difficulty: queueItem.difficulty,
        numberOfWorkers: chosenWorkers,
        tags: queueItem.tags || [],
        kind: queueItem.kind,
        debug: preferences().debugMode,
      });

      // Restore the saved state
      notemine.restoreState(queueItem.miningState);

      // Subscribe to observables (same as startMining)
      subscriptions.forEach(sub => sub.unsubscribe());
      subscriptions = [];

      // Subscribe to workers list (debug visibility)
      const workersSub = notemine.workers$.subscribe((workers) => {
        debug('[MiningProvider] workers$ count:', workers.length);
      });
      subscriptions.push(workersSub);

      // Subscribe to workers' POW progress
      const workersPowSub = notemine.workersPow$.subscribe((data: Record<number, BestPowData>) => {
        setMiningState((prev) => ({
          ...prev,
          workersBestPow: Object.values(data),
        }));
      });
      subscriptions.push(workersPowSub);

      // Subscribe to overall best POW
      const bestPowSub = notemine.highestPow$.subscribe((pow: WorkerPow | null) => {
        setMiningState((prev) => ({
          ...prev,
          overallBestPow: pow?.bestPow ?? null,
        }));
      });
      subscriptions.push(bestPowSub);

      // Subscribe to progress (for hash rate)
      const currentInstance = notemine;
      const progressSub = currentInstance.progress$.subscribe(({ workerId, hashRate: workerHashRate }) => {
        const totalHashRate = currentInstance.totalHashRate;

        setMiningState((prev) => ({
          ...prev,
          hashRate: totalHashRate,
          // Update per-worker hash rate
          workersHashRates: workerHashRate
            ? { ...prev.workersHashRates, [workerId]: workerHashRate }
            : prev.workersHashRates,
        }));

        // Phase 5: Save mining state for queue if callback provided (with throttling)
        if (onMiningStateUpdate) {
          const now = Date.now();
          const timeSinceLastUpdate = now - lastStateUpdateTime;

          // Throttle: only update every 500ms to avoid excessive writes
          if (timeSinceLastUpdate >= STATE_UPDATE_THROTTLE_MS) {
            const miningStateData = currentInstance.getState();
            onMiningStateUpdate(miningStateData);
            lastStateUpdateTime = now;

            if (debugMode) {
              debug('[MiningProvider] State update (resume):', {
                nonces: miningStateData.workerNonces.length,
                hashRate: (totalHashRate / 1000).toFixed(2) + ' kH/s'
              });
            }
          }
        }
      });
      subscriptions.push(progressSub);

      // Set mining state
      setMiningState((prev) => ({
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

          setMiningState((prev) => ({
            ...prev,
            mining: false,
            result: result.event,
          }));
          resolve(result.event);
        });
        subscriptions.push(successSub);

        // Subscribe to errors
        const errorSub = notemine!.error$.subscribe(({ error }) => {
          // Phase 6: Log errors with context (queue item id, event kind)
          console.error('[MiningProvider] Error (resume):', {
            error: String(error),
            queueItemId: currentQueueItemId,
            kind: queueItem.kind,
            difficulty: queueItem.difficulty,
          });
          setMiningState((prev) => ({
            ...prev,
            mining: false,
            error: String(error),
          }));
          reject(error);
        });
        subscriptions.push(errorSub);

        // Subscribe to cancelled events
        const cancelledSub = notemine!.cancelled$.subscribe((cancelled) => {
          if (cancelled) {
            debug('[MiningProvider] Mining was cancelled during resume, resolving promise with null');
            setMiningState((prev) => ({
              ...prev,
              mining: false,
            }));
            resolve(null);
          }
        });
        subscriptions.push(cancelledSub);

        // Subscribe to paused events
        const pausedSub = notemine!.paused$.subscribe((paused) => {
          if (paused) {
            debug('[MiningProvider] Mining was paused during resume, resolving promise with null');
            setMiningState((prev) => ({
              ...prev,
              mining: false,
            }));
            resolve(null);
          }
        });
        subscriptions.push(pausedSub);

        // Resume mining
        debug('[MiningProvider] resume() with nonces count:', Array.isArray(queueItem.miningState.workerNonces) ? queueItem.miningState.workerNonces.length : 0);
        notemine!.resume(queueItem.miningState.workerNonces).catch(reject);
      });
    } else {
      // Old signature: just resume with nonces (simple pause/resume within same session)
      const workerNonces = queueItemOrNonces as string[] | undefined;
      if (notemine) {
        await notemine.resume(workerNonces);
        setMiningState((prev) => ({
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
    if (notemine && miningState().mining) {
      notemine.cancel();
    }
    notemine = null;
  };

  onCleanup(cleanup);

  const value: MiningContextType = {
    miningState,
    startMining,
    stopMining,
    pauseMining,
    resumeMining,
    getMiningState,
    restoreMiningState,
    get currentQueueItemId() {
      return currentQueueItemId;
    },
  };

  return (
    <MiningContext.Provider value={value}>
      {props.children}
    </MiningContext.Provider>
  );
};

export const useMining = () => {
  const context = useContext(MiningContext);
  if (!context) {
    throw new Error('useMining must be used within MiningProvider');
  }
  return context;
};
