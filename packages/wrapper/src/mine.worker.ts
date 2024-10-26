import initWasm, { mine_event } from 'notemine';
//@ts-ignore: esbuild wasm loader
import wasm from '@notemine/core/wasm';

import type { BestPowData } from './index';

type BestPowDataMap = Map<'best_pow' | 'nonce' | 'hash', number | string>;

let mining = false;
let workerId: number;
let miningCancelled = false;

const destructureBestPowData = (data: BestPowDataMap | any): BestPowData => {
  ////console.log('Destructuring bestPowData:', data, typeof data, data.get ? 'has get' : 'no get');

  let bestPow: number;
  let nonce: string;
  let hash: string;

  if (typeof data.get === 'function') {
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

  if (bestPow === undefined || nonce === undefined || hash === undefined) {
    throw new Error('Incomplete bestPowData received from mine_event');
  }

  return {
    bestPow,
    nonce,
    hash,
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
    const { type, event, difficulty, id, totalWorkers } = e.data;
    ////console.log(e.data)

    // return 

    // if (!event || !difficulty || id === undefined || !totalWorkers || type === 'error') {
    //   throw new Error('Missing required mining parameters');
    // }

    workerId = id;

    if (type === 'mine' && !mining) {
      miningCancelled = false;
      mining = true;

      try {
        ////console.log('Initializing WASM...');
        await initWasm(wasm);
        ////console.log('WASM Initialized successfully.');

        const startNonce = BigInt(workerId);
        const nonceStep = BigInt(totalWorkers);

        const reportProgress = (hashRate: number, bestPowData: any) => {
          ////console.log('Progress:', hashRate, bestPowData);
          const message: any = {
            type: 'progress',
            workerId,
            hashRate,
            bestPowData: bestPowData ? destructureBestPowData(bestPowData) : undefined,
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
        self.postMessage({ type: 'result', data: minedResult, workerId });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        console.error('Error during mining:', errorMessage);
        self.postMessage({ type: 'error', error: errorMessage, workerId });
      } finally {
        mining = false;
      }
    } else if (type === 'cancel') {
      miningCancelled = true;
      ////console.log('Mining cancelled by user.');
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Unknown error occurred in worker';
    console.error('Critical Worker error:', errorMessage);
    self.postMessage({ type: 'error', error: errorMessage, workerId });
    self.close();
  }
};

export {};