// worker.js
import init, { mine_event } from './pkg/nostr_miner.js';

let wasm;

async function initWasm() {
    try {
        wasm = await init({});
        postMessage({ type: 'ready' });
    } catch (error) {
        postMessage({ type: 'error', error: `WASM initialization failed: ${error.message}` });
    }
}

initWasm();

self.onmessage = async function (e) {
    const { type, event, difficulty } = e.data;

    console.log('Worker received message:', e.data); // Debugging log

    if (type === 'mine') {
        try {
            // Ensure event is a string
            if (typeof event !== 'string') {
                throw new Error('Event must be a stringified JSON.');
            }

            console.log('Event String:', event);
            console.log('Difficulty:', difficulty);

            const minedResult = mine_event(event, difficulty);
            postMessage({ type: 'result', data: minedResult });
        } catch (error) {
            postMessage({ type: 'error', error: error.message });
        }
    } else if (type === 'cancel') {
        console.log('Mining cancellation requested.');
    }
};
