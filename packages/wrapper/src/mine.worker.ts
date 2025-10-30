import initWasm, { mine_event } from '@notemine/core';

import type { BestPowData } from './index.js';

type BestPowDataMap = Map<'best_pow' | 'nonce' | 'hash', number | string>;

let mining = false;
let workerId: number;
let miningCancelled = false;
let currentRunId: string | null = null;

const destructureBestPowData = (data: BestPowDataMap | any): BestPowData => {
  ////console.log('Destructuring bestPowData:', data, typeof data, data.get ? 'has get' : 'no get');

  let bestPow: number;
  let nonce: string;
  let hash: string;

  // Check if it's a primitive array [pow, nonce] from optimized Rust
  if (Array.isArray(data) && data.length >= 2) {
    bestPow = data[0];
    nonce = data[1];
    hash = ''; // Not needed for progress updates
  } else if (typeof data.get === 'function') {
    bestPow = data.get('best_pow') as number;
    nonce = data.get('nonce') as string;
    hash = data.get('hash') as string;
  } else if (typeof data === 'object' && data !== null) {
    bestPow = data.best_pow;
    nonce = data.nonce;
    hash = data.hash;
  } else {
    throw new Error('Invalid bestPowData received from mine_event');
  }

  if (bestPow === undefined || nonce === undefined) {
    throw new Error('Incomplete bestPowData received from mine_event');
  }

  return {
    bestPow,
    nonce,
    hash: hash || '',
  };
};

self.postMessage({ type: 'initialized', message: 'Worker initialized successfully' });

self.onmessage = async function (e: MessageEvent) {

  if (e?.data?.name) {
    ////console.log("Ignoring injected message:", e.data);
    return;
  }
  ////console.log('Worker received message:', e.data);
  try {
    const { type, event, difficulty, id, totalWorkers, workerNonces, runId } = e.data;
    ////console.log(e.data)

    // return

    // if (!event || !difficulty || id === undefined || !totalWorkers || type === 'error') {
    //   throw new Error('Missing required mining parameters');
    // }

    workerId = id;
    currentRunId = runId || null; // Store runId for this mining session

    if (type === 'mine' && !mining) {
      miningCancelled = false;
      mining = true;

      try {
        ////console.log('Initializing WASM...');
        await initWasm();
        ////console.log('WASM Initialized successfully.');

        let startNonce = BigInt(workerId);
        const nonceStep = BigInt(totalWorkers);

        // Handle resume with worker nonces
        if (workerNonces && Array.isArray(workerNonces) && workerNonces.length > 0) {
          if (workerNonces.length === totalWorkers) {
            // Same worker count - use the saved nonce for this worker
            startNonce = BigInt(workerNonces[workerId] || workerId);
          } else {
            // Phase 8: Different worker count - use span-based redistribution
            // Sort nonces to ensure stable mapping
            const sortedNonces = workerNonces.map(n => BigInt(n)).sort((a, b) => {
              if (a < b) return -1;
              if (a > b) return 1;
              return 0;
            });

            const minNonce = sortedNonces[0];
            const maxNonce = sortedNonces[sortedNonces.length - 1];
            const span = maxNonce - minNonce;

            // Phase 8.2: Handle edge case where span < totalWorkers
            if (span < BigInt(totalWorkers)) {
              // Round-robin fallback: use sorted saved nonces
              const mappedIndex = workerId % sortedNonces.length;
              startNonce = sortedNonces[mappedIndex];

              // Phase 8.3: Diagnostics
              if (workerId < 3) {
                console.log(`[Worker ${workerId}] Span too small (${span}), using round-robin: nonce=${startNonce}`);
              }
            } else {
              // Phase 8.1: Distribute workers across the span
              const stride = span / BigInt(totalWorkers);
              startNonce = minNonce + (BigInt(workerId) * stride);

              // Optional: Preserve lane parity (nonce % totalWorkers === workerId)
              // Adjust startNonce to maintain correct lane
              const currentLane = startNonce % BigInt(totalWorkers);
              const targetLane = BigInt(workerId);
              if (currentLane !== targetLane) {
                const adjustment = (targetLane - currentLane + BigInt(totalWorkers)) % BigInt(totalWorkers);
                startNonce = startNonce + adjustment;
              }

              // Phase 8.3: Diagnostics
              if (workerId < 3) {
                console.log(`[Worker ${workerId}] Span-based redistribution: min=${minNonce}, max=${maxNonce}, span=${span}, stride=${stride}, startNonce=${startNonce}`);
              }
            }
          }
          ////console.log(`Worker ${workerId} resuming from nonce: ${startNonce}`);
        }

        // Announce starting nonce immediately so the wrapper can persist resume positions
        try {
          self.postMessage({
            type: 'progress',
            workerId,
            currentNonce: startNonce.toString(),
            runId: currentRunId,
          });
        } catch {}

        const reportProgress = (hashRate: number, bestPowData: any) => {
          ////console.log('Progress:', hashRate, bestPowData);

          let currentNonce: string | undefined;
          let parsedBestPowData: BestPowData | undefined;

          const extractCurrentNonce = (data: any) => {
            if (typeof data?.get === 'function') {
              const nonce = data.get('currentNonce');
              return typeof nonce === 'string' ? nonce : undefined;
            }
            if (typeof data === 'object' && data !== null) {
              const nonce = (data as any).currentNonce;
              return typeof nonce === 'string' ? nonce : undefined;
            }
            return undefined;
          };

          const hasBestPowFields = (data: any) => {
            if (!data) return false;
            if (typeof data?.get === 'function') {
              return data.get('best_pow') !== undefined || data.get('bestPow') !== undefined;
            }
            if (typeof data === 'object' && data !== null) {
              return 'best_pow' in data || 'bestPow' in data;
            }
            return false;
          };

          if (bestPowData && hasBestPowFields(bestPowData)) {
            const destructured = destructureBestPowData(bestPowData);
            parsedBestPowData = destructured;
            currentNonce = extractCurrentNonce(bestPowData);
          } else if (bestPowData) {
            currentNonce = extractCurrentNonce(bestPowData);
          }

          const message: any = {
            type: 'progress',
            workerId,
            hashRate,
            bestPowData: parsedBestPowData,
            currentNonce,
            runId: currentRunId,
          };
          self.postMessage(message);
        };

        const shouldCancel = () => miningCancelled;

        ////console.log('Starting mining with event:', event, 'difficulty:', difficulty);
        const minedResult = mine_event(
          event,
          difficulty,
          startNonce.toString(),
          nonceStep.toString(),
          reportProgress,
          shouldCancel
        );

        ////console.log('Mining completed successfully:', minedResult);
        self.postMessage({ type: 'result', data: minedResult, workerId, runId: currentRunId });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        console.error('Error during mining:', errorMessage);
        self.postMessage({ type: 'error', error: errorMessage, workerId, runId: currentRunId });
      } finally {
        mining = false;
      }
    } else if (type === 'cancel') {
      miningCancelled = true;
      console.log(`[Worker ${workerId}] Received cancel, setting miningCancelled=true`);
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Unknown error occurred in worker';
    console.error('Critical Worker error:', errorMessage);
    self.postMessage({ type: 'error', error: errorMessage, workerId, runId: currentRunId });
    self.close();
  }
};

export {};
