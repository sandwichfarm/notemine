import init, { mine_event } from './pkg/notemine/notemine.js';

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

    function reportProgress(progress) {
        const { hashRate, bestPowData, nonce, event } = destructureMap(progress);
        console.log(workerId, hashRate, bestPowData, nonce);
        const message = {
            type: 'progress',
            hashRate,
            workerId,
            nonce: BigInt(nonce)
        };
    
        if (bestPowData && bestPowData !== null) {
            message.bestPowData = bestPowData;
        }

        if(event && event !== null) {
            message.event = event;
        }
    
        postMessage(message);
    }

    if (type === 'cancel' && mining) {
        console.log('Mining cancellation requested.');
        miningCancelled = true;
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
