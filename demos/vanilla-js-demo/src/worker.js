import init, { mine_event } from './lib/notemine/dist/notemine.js';

let wasmInitialized = false;
let mining = false;
let workerId;
let miningCancelled = false;

function shouldCancel() {
    return miningCancelled;
}

function destructureMap (map) {
    return new Proxy(map, {
      get (obj, prop) {
        return obj.get(prop)
      }
    })
  }

self.onmessage = async function (e) {
    const { type, event, difficulty, workerId: msgWorkerId, totalWorkers } = e.data;

    function reportProgress(hashRate = undefined, bestPow = undefined) {
        let header = { type: 'progress' }
        if(typeof hashRate == 'number') {
            postMessage({ ...header, workerId, hashRate });
        }
        if(bestPow !== null && bestPow !== undefined) {
            // Check if it's a primitive array [pow, nonce] from optimized Rust
            if (Array.isArray(bestPow) && bestPow.length >= 2) {
                postMessage({ ...header, workerId, best_pow: bestPow[0], nonce: bestPow[1], event, hash: '' });
            } else {
                // Fallback for old format
                const { best_pow, nonce, hash } = destructureMap(bestPow);
                postMessage({ ...header, workerId, best_pow, nonce, event, hash });
            }
        }
    }

    if (type === 'cancel' && mining) {
        console.log('Mining cancellation requested.');
        miningCancelled = true;
    }
    else if (type === 'init') {
        workerId = msgWorkerId;
    } else if (type === 'mine' && !mining) {
        try {
            miningCancelled = false;
            mining = true;

            // Initialize WASM on first mine call
            if (!wasmInitialized) {
                await init('./lib/notemine/dist/notemine_bg.wasm');
                wasmInitialized = true;
            }

            const startNonce = BigInt(workerId);
            const nonceStep = BigInt(totalWorkers);

            const minedResult = mine_event(
                event,
                difficulty,
                startNonce.toString(),
                nonceStep.toString(),
                reportProgress,
                shouldCancel
            );
            postMessage({ type: 'result', data: minedResult, workerId });
        } catch (error) {
            if (error.message !== 'Mining cancelled.') {
                postMessage({ type: 'error', error: error.message, workerId });
            } else {
                console.log('Mining was cancelled.');
                postMessage({ type: 'cancelled', workerId });
            }
        } finally {
            mining = false;
        }
    }
};
