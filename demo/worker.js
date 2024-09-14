import init, { mine_event } from './pkg/notemine.js';

let wasm;
let mining = false;

async function initWasm() {
    try {
        wasm = await init({});
        postMessage({ type: 'ready' });
    } catch (error) {
        postMessage({ type: 'error', error: `WASM initialization failed: ${error.message}` });
    }
}

initWasm();

function reportProgress(averageHashRate) {
    postMessage({ type: 'progress', averageHashRate, workerId });
}

let workerId;

self.onmessage = async function (e) {
    const { type, event, difficulty, id } = e.data;
    if (type === 'init') {
        workerId = id;
    } else if (type === 'mine' && !mining) {
        mining = true;
        try {
            if (typeof event !== 'string') {
                throw new Error('Event must be a stringified JSON.');
            }
            const minedResult = mine_event(event, difficulty, reportProgress);
            postMessage({ type: 'result', data: minedResult, workerId });
        } catch (error) {
            postMessage({ type: 'error', error: error.message, workerId });
        } finally {
            mining = false;
        }
    } else if (type === 'cancel' && mining) {
        console.log('Mining cancellation requested.');
    }
};
