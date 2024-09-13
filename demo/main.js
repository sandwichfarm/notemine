let minedEvent = {}

//conf 
const CLIENT = 'notemine'
const TOPIC = 'notemine'
const RELAYS = ['wss://nostr.bitcoiner.social', 'wss://nostr.bitcoiner.social', 'wss://nostr.mom', 'wss://nos.lol', 'wss://powrelay.xyz', 'wss://powrelay.xyz', 'wss://labour.fiatjaf.com/', 'wss://nostr.lu.ke', 'wss://140.f7z.io']

const Relay = window.NostrTools.Relay
const SimplePool = window.NostrTools.SimplePool

//anon user
const secret = window.NostrTools.generateSecretKey();
const pubkey = window.NostrTools.getPublicKey(secret)

const pool = new SimplePool()
let   pubs = []

//worker 
const worker = new Worker('./worker.js', { type: 'module' });

//dom
const mineButton = document.getElementById('mineButton');
const eventInput = document.getElementById('eventInput');
const difficultyInput = document.getElementById('difficulty');
const resultOutput = document.getElementById('result');
const hashrateOutput = document.getElementById('hashrate');
const cancelButton = document.getElementById('cancelButton'); 
const relayStatus = document.getElementById('relayStatus');

let isWorkerReady = false;

const MOVING_AVERAGE_WINDOW = 5;
let recentHashRates = [];

worker.onmessage = function (e) {
    const { type, data, error, hashCount, elapsedTime } = e.data;

    if (type === 'progress') {
        recentHashRates.push(hashCount / elapsedTime);
        if (recentHashRates.length > MOVING_AVERAGE_WINDOW) {
            recentHashRates.shift();
        }
        const averageHashRate = recentHashRates.reduce((a, b) => a + b, 0) / recentHashRates.length;
        hashrateOutput.textContent = `${(averageHashRate/1000).toFixed(2)} kH/s`;
    } else if (type === 'ready') {
        isWorkerReady = true;
        console.log('Worker is ready.');
        mineButton.disabled = false;
        resultOutput.textContent = 'Worker is ready. You can start mining.';
    } else if (type === 'result') {
        if (data.error) {
            resultOutput.textContent = `Error: ${data.error}`;
        } else {
            try {
                resultOutput.textContent = JSON.stringify(data, null, 2);
                publishEvent(data.event);
            } catch (e) {
                console.error('Error publishing event:', e);
                resultOutput.textContent = `Error publishing event: ${e.message}`;
            }
        }
        hashrateOutput.textContent = '0 H/s'; 
        mineButton.disabled = false;
    } else if (type === 'error') {
        resultOutput.textContent = `Error: ${error}`;
        hashrateOutput.textContent = '0 H/s'; 
        mineButton.disabled = false;
    }
};

mineButton.addEventListener('click', () => {
    const content = eventInput.value.trim();
    const nostrEvent = generateEvent(content);
    const difficulty = parseInt(difficultyInput.value, 10);

    if (!content) {
        alert('Please enter content for the Nostr event.');
        return;
    }

    if (isNaN(difficulty) || difficulty <= 0) {
        alert('Please enter a valid difficulty.');
        return;
    }

    if (!isWorkerReady) {
        alert('Worker is not ready yet. Please wait.');
        return;
    }

    const event = JSON.stringify(nostrEvent);

    mineButton.disabled = true;
    resultOutput.textContent = 'Mining in progress...';
    hashrateOutput.textContent = '0 H/s'; 

    worker.postMessage({
        type: 'mine',
        event,
        difficulty: difficulty,
    });
});

cancelButton.addEventListener('click', () => {
    if (isWorkerReady) {
        worker.postMessage({ type: 'cancel' });
        resultOutput.textContent = 'Mining cancellation requested.';
        hashrateOutput.textContent = '0 H/s';
        mineButton.disabled = false;
    }
});


const generateEvent = (content) => {
  return {
    pubkey,
    kind: 1,
    tags: [['t', TOPIC], ['client', CLIENT]],
    content,
  }
}

const publishEvent = async (ev) => {
  console.log('Publishing event:', ev);
  try {
      ev = window.NostrTools.finalizeEvent(ev, secret);
      let isGood = window.NostrTools.verifyEvent(ev);
      if (!isGood) throw new Error('Event is not valid');
      pubs = pool.publish(RELAYS, ev);
      await Promise.allSettled(pubs);
      showRelayStatus()
      console.log('Event published successfully.');
  } catch (error) {
      console.error('Error publishing event:', error);
      resultOutput.textContent = `Error publishing event: ${error.message}`;
  }
};

const showRelayStatus = () => {
  const settled = Array(pubs.length).fill(false);
  const intervalId = setInterval(() => {
    settledCount = settled.filter(Boolean).length;
    relayStatus.textContent = `Published to ${settledCount}/${pubs.length} relays.`
    if (settledCount === pubs.length) {
      clearInterval(intervalId);
    }
  }, 100);

  pubs.forEach((pub, index) => {
    pub.finally(() => {
      relayStatus.textContent = `Published to all relays [${RELAYS.join(', ')}]`
      settled[index] = true;
    });
  });
  
}