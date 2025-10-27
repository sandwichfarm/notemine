import init, { mine_event } from './lib/notemine/notemine.js';

let wasm;
let mining = false;
let workerId;
let miningCancelled = false;

async function initWasm() {
    try {
        wasm = await init({});
        postMessage({ type: 'ready', workerId });
    } catch (error) {
        postMessage({ type: 'error', error: `WASM initialization failed: ${error.message}`, workerId });
    }
}

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
    const { type, event, difficulty, workerId, totalWorkers } = e.data;

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
        miningCancelled = true;1
    }
    else if (type === 'init') {
        initWasm();
    } else if (type === 'mine' && !mining) {
        try {
            miningCancelled = false;
            mining = true;
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
