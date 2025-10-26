import { createSignal, onCleanup, createEffect } from 'solid-js';
import {
  Notemine,
  type BestPowData,
  type SuccessEvent,
  type WorkerPow,
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
    setGlobalMiningState(state());
  });

  const startMining = async (options: MiningOptions): Promise<NostrEvent | null> => {
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
    const progressSub = notemine.progress$.subscribe(() => {
      if (notemine) {
        const hashRate = notemine!.totalHashRate;
        // Note: totalHashRate is actually in KH/s (divided by 1000 in wrapper)
        const actualHashRate = hashRate * 1000; // Convert back to H/s
        console.log(`[POW Mining] Total hash rate: ${(actualHashRate / 1000000).toFixed(2)} MH/s (${hashRate} KH/s) across ${notemine!.numberOfWorkers} workers`);
        setState((prev) => ({
          ...prev,
          hashRate,
        }));
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
    cleanup,
  };
}
