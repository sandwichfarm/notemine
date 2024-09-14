import init, { mine_event } from './pkg/notemine.js';

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

self.onmessage = async function (e) {
    const { type, event, difficulty, workerId, totalWorkers } = e.data;

    function reportProgress(hashRate, bestPowData) {
        const message = {
            type: 'progress',
            hashRate,
            workerId,
        };
    
        if (bestPowData && bestPowData !== null) {
            message.bestPowData = bestPowData;
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
            miningCancelled = false; // Reset cancellation flag
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
