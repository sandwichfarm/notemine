const CLIENT = 'notemine';
const TOPIC = 'notemine';
const RELAYS = ['wss://nostr.bitcoiner.social', 'wss://nostr.mom', 'wss://nos.lol', 'wss://powrelay.xyz', 'wss://labour.fiatjaf.com/', 'wss://nostr.lu.ke', 'wss://140.f7z.io'];

const Relay = window.NostrTools.Relay;
const SimplePool = window.NostrTools.SimplePool;
const pool = new SimplePool();


const secret = window.NostrTools.generateSecretKey();
const pubkey = window.NostrTools.getPublicKey(secret);

const mineButton = document.getElementById('mineButton');
const eventInput = document.getElementById('eventInput');
const difficultyInput = document.getElementById('difficulty');
const resultOutput = document.getElementById('result');
const numberOfWorkers = document.getElementById('numberOfWorkers');
const hashrateOutput = document.getElementById('hashrate');
const cancelButton = document.getElementById('cancelButton');
const relayStatus = document.getElementById('relayStatus');
const neventOutput = document.getElementById('neventOutput');

let NUM_WORKERS = navigator.hardwareConcurrency || 4; // Or set a fixed number
let workers = [];
let isWorkerReady = 0;
let isMining = false;

let pubs = [];

numberOfWorkers.value = NUM_WORKERS;

const MOVING_AVERAGE_WINDOW = 2;
let recentHashRates = [];

for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker('./worker.js', { type: 'module' });
    worker.onmessage = handleWorkerMessage;
    worker.postMessage({ type: 'init' });
    workers.push(worker);
}

function handleWorkerMessage(e) {
    const { type, data, error, averageHashRate, workerId } = e.data;

    if (type === 'progress') {
        recentHashRates.push(averageHashRate);
        if (recentHashRates.length > MOVING_AVERAGE_WINDOW * NUM_WORKERS) {
            recentHashRates.shift();
        }
        const totalHashRate = recentHashRates.reduce((a, b) => a + b, 0);
        hashrateOutput.textContent = `${(totalHashRate / 1000).toFixed(2)} kH/s`;
    } else if (type === 'ready') {
        isWorkerReady++;
        if (isWorkerReady === NUM_WORKERS) {
            console.log('All workers are ready.');
            mineButton.disabled = false;
            resultOutput.textContent = 'Workers are ready. You can start mining.';
        }
    } else if (type === 'result') {
        if (data.error) {
            resultOutput.textContent = `
Error: ${data.error}
${JSON.stringify(data, null, 2)}
            `;
        } else {
            try {
                resultOutput.textContent = JSON.stringify(data, null, 2);
                publishEvent(data.event);
                cancelOtherWorkers(workerId);
            } catch (e) {
                console.error('Error publishing event:', e);
                resultOutput.textContent = `Error publishing event: ${e.message}`;
            }
        }
        hashrateOutput.textContent = '0 H/s';
        mineButton.disabled = false;
        isMining = false;
    } else if (type === 'error') {
        resultOutput.textContent = `Error: ${error}`;
        hashrateOutput.textContent = '0 H/s';
        mineButton.disabled = false;
        isMining = false;
    }
}

function cancelOtherWorkers(excludeWorkerId) {
    workers.forEach((worker, index) => {
        if (index !== excludeWorkerId) {
            worker.postMessage({ type: 'cancel' });
        }
    });
}

mineButton.addEventListener('click', () => {
    if (isMining) return;

    const content = eventInput.value.trim();
    const nostrEvent = generateEvent(content);
    const difficulty = parseInt(difficultyInput.value, 10);
    NUM_WORKERS = parseInt(numberOfWorkers.value, 10);

    relayStatus.textContent = '';
    neventOutput.textContent = '';
    resultOutput.textContent = '';
    recentHashRates = [];

    if (!content) {
        alert('Please enter content for the Nostr event.');
        return;
    }

    if (isNaN(difficulty) || difficulty <= 0) {
        alert('Please enter a valid difficulty.');
        return;
    }

    if (isWorkerReady < NUM_WORKERS) {
        alert('Workers are not ready yet. Please wait.');
        return;
    }

    const event = JSON.stringify(nostrEvent);

    mineButton.disabled = true;
    resultOutput.textContent = 'Mining in progress...';
    hashrateOutput.textContent = '0 H/s';
    isMining = true;

    workers.forEach((worker, index) => {
        worker.postMessage({
            type: 'mine',
            event,
            difficulty: difficulty,
            workerId: index,
        });
    });
});

cancelButton.addEventListener('click', () => {
    if (isMining) {
        workers.forEach(worker => {
            worker.postMessage({ type: 'cancel' });
        });
        resultOutput.textContent = 'Mining cancellation requested.';
        hashrateOutput.textContent = '0 H/s';
        mineButton.disabled = false;
        isMining = false;
    }
});

const getPow = (hex) => {
    let count = 0;

    for (let i = 0; i < hex.length; i++) {
        const nibble = parseInt(hex[i], 16);
        if (nibble === 0) {
            count += 4;
        } else {
            count += Math.clz32(nibble) - 28;
            break;
        }
    }

    return count;
}

const verifyPow = (event) => {
    const hash = window.NostrTools.getEventHash(event);
    const count = getPow(hash);
    const nonceTag = event.tags.find(tag => tag[0] === 'nonce');
    if (!nonceTag || nonceTag.length < 3) {
        return 0;
    }
    const targetDifficulty = parseInt(nonceTag[2], 10);
    return Math.min(count, targetDifficulty);
}

const generateEvent = (content) => {
    return {
        pubkey,
        kind: 1,
        tags: [['t', TOPIC], ['client', CLIENT]],
        content,
    }
}

const generateNEvent = (event) => {
    const { id, pubkey: author } = event;
    const pointer = { id, pubkey, relays: RELAYS };
    return window.NostrTools.nip19.neventEncode(pointer);
}

const publishEvent = async (ev) => {
    const pow = verifyPow(ev);

    if (!pow || getPow(ev.id) < pow) {
        resultOutput.textContent = `Error: Invalid POW ${pow}`;
        return;
    }
    console.log('Publishing event:', ev);
    try {
        ev = window.NostrTools.finalizeEvent(ev, secret);
        let isGood = window.NostrTools.verifyEvent(ev);
        if (!isGood) throw new Error('Event is not valid');
        pubs = pool.publish(RELAYS, ev);
        await Promise.allSettled(pubs);
        showRelayStatus();
        console.log('Event published successfully.');
        neventOutput.textContent = generateNEvent(ev);
    } catch (error) {
        console.error('Error publishing event:', error);
        resultOutput.textContent = `Error publishing event: ${error.message}`;
    }
};

let settledCount = 0;

const showRelayStatus = () => {
    const settled = Array(pubs.length).fill(false);
    const intervalId = setInterval(() => {
        settledCount = settled.filter(Boolean).length;
        relayStatus.textContent = `Published to ${settledCount}/${pubs.length} relays.`;
        if (settledCount === pubs.length) {
            clearInterval(intervalId);
        }
    }, 100);

    pubs.forEach((pub, index) => {
        pub.finally(() => {
            relayStatus.textContent = `Published to all relays [${RELAYS.join(', ')}]`;
            settled[index] = true;
        });
    });
}
