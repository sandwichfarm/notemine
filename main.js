// main.js

// Create a new Web Worker as a module
const worker = new Worker('worker.js', { type: 'module' });

const mineButton = document.getElementById('mineButton');
const eventInput = document.getElementById('eventInput');
const difficultyInput = document.getElementById('difficulty');
const resultOutput = document.getElementById('result');
const cancelButton = document.createElement('button');

cancelButton.textContent = 'Cancel Mining';
document.body.appendChild(cancelButton);

// Flag to check if the worker is ready
let isWorkerReady = false;

// Listen for messages from the worker
worker.onmessage = function (e) {
    const { type, data, error } = e.data;

    if (type === 'ready') {
        isWorkerReady = true;
        console.log('Worker is ready.');
        mineButton.disabled = false;
        resultOutput.textContent = 'Worker is ready. You can start mining.';
    } else if (type === 'result') {
        if (data.error) {
            resultOutput.textContent = `Error: ${data.error}`;
        } else {
            resultOutput.textContent = JSON.stringify(data, null, 2);
        }
        mineButton.disabled = false;
    } else if (type === 'error') {
        resultOutput.textContent = `Error: ${error}`;
        mineButton.disabled = false;
    }
};

// Handle mining button click
mineButton.addEventListener('click', () => {
    const eventJson = eventInput.value.trim();
    const difficulty = parseInt(difficultyInput.value, 10);

    if (!eventJson) {
        alert('Please enter a Nostr event JSON.');
        return;
    }

    // Ensure eventJson is a valid JSON string
    let parsedEvent;
    try {
        parsedEvent = JSON.parse(eventJson);
    } catch (e) {
        alert('Invalid JSON format. Please correct it.');
        return;
    }

    // Stringify the parsed JSON to ensure it's a string
    const eventString = JSON.stringify(parsedEvent);

    if (isNaN(difficulty) || difficulty <= 0) {
        alert('Please enter a valid difficulty.');
        return;
    }

    if (!isWorkerReady) {
        alert('Worker is not ready yet. Please wait.');
        return;
    }

    // Disable the button to prevent multiple clicks
    mineButton.disabled = true;
    resultOutput.textContent = 'Mining in progress...';

    // Send mining request to the worker
    worker.postMessage({
        type: 'mine',
        event: eventString, // Ensure event is a string
        difficulty: difficulty,
    });
});

// Handle cancel button click
cancelButton.addEventListener('click', () => {
    if (isWorkerReady) {
        worker.postMessage({ type: 'cancel' });
        resultOutput.textContent = 'Mining cancellation requested.';
        mineButton.disabled = false;
    }
});
