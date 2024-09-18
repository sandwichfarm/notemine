const CLIENT = 'https://sandwichfarm.github.io/notemine';
const MINER = 'notemine';
let POW_RELAYS = ['wss://nostr.bitcoiner.social', 'wss://nostr.mom', 'wss://nos.lol', 'wss://powrelay.xyz', 'wss://labour.fiatjaf.com/', 'wss://nostr.lu.ke', 'wss://140.f7z.io'];
let MY_RELAYS = []

const Relay = window.NostrTools.Relay;
const SimplePool = window.NostrTools.SimplePool;

let user = { name: 'anon', photo: './lib/img/anon.svg' };

let isAnon = false
let secret
let pubkey

let k0
let k3
let k10002

const pool = new SimplePool();
let pubs = [];
let usub = null;

let totalWorkers = navigator.hardwareConcurrency-1 || 2; // Or set a fixed number
let workers = [];
let isWorkerReady = 0;
let isMining = false;

const mineButton = document.getElementById('mineButton');
const cancelButton = document.getElementById('cancelButton');
const loginButton = document.getElementById('loginButton');

const eventInput = document.getElementById('eventInput');

const difficultyInput = document.getElementById('difficulty');
const numberOfWorkers = document.getElementById('numberOfWorkers')

const relayStatus = document.getElementById('relayStatus');

const myRelaysContainer = document.getElementById('myRelaysContainer');
const powRelays = document.getElementById('powRelays');
const powRelaysEnable = document.getElementById('powRelaysEnable');
const relaysToggle = document.getElementById('relaysToggle');
const relaysContainer = document.getElementById('relaysContainer');


const minersBestPowOutput = document.getElementById('minersBestPow');
const overallBestPowOutput = document.getElementById('overallBestPow');
const hashrateOutput = document.getElementById('hashrate');

const resultOutput = document.getElementById('result');
const neventOutput = document.getElementById('neventOutput');

const userName = document.getElementById('userName');
const userPhoto = document.getElementById('userPhoto');

numberOfWorkers.value = totalWorkers;
// numberOfWorkers.max = navigator.hardwareConcurrency || 3;

minersBestPowOutput.style.display = 'none';
overallBestPowOutput.style.display = 'none';
neventOutput.style.display = 'none';
relayStatus.style.display = 'none';

if(window?.nostr !== undefined) {
    loginButton.style.display = 'inline-block';
}

authAnon()
refreshUserDom()
refreshRelaysDom()

let workerHashRates = {};
let minersBestPow
let overallBestPow

let halt = false

function activeRelays(){
    let relays = MY_RELAYS
    if(powRelaysEnable.checked) {
        relays = [ ...relays, ...POW_RELAYS ]
    }
    return relays
}


async function toggleAuth(){
    const doLogin = isAnon
    if(doLogin) {
        await authUser()
        loginButton.textContent = 'logout'
    }
    else { //logout
        console.log('logouot')
        authAnon()
        loginButton.textContent = 'login'
        powRelaysEnable.checked = true
    }
    refreshUserDom()
    refreshRelaysDom()
    
    console.log('active relays:', activeRelays())
}

loginButton.addEventListener('click', toggleAuth)

function authAnon(){
    isAnon = true
    secret = window.NostrTools.generateSecretKey();
    pubkey = window.NostrTools.getPublicKey(secret);    
    MY_RELAYS = []
    user.name = 'anon';
    user.photo = './lib/img/anon.svg';
}

async function authUser(){
    return new Promise( async (resolve, reject) => {
        loginButton.disabled = true
        pubkey = await window.nostr.getPublicKey()
        const relay = await Relay.connect('wss://purplepag.es')
        usub = relay.subscribe(
            [{kinds: [0,3,10002], authors: [pubkey]}],
            { onevent, oneose, onclose: onclose(resolve) }
        );
        
    })
}

function refreshUserDom (){
    console.log(user)
    userName.textContent = user.name;
    userPhoto.src = user.photo;
}

function refreshRelaysDom(){
    console.log('anon?', isAnon)
    if(isAnon) {
        myRelaysContainer.style.display = 'none';
        powRelaysEnable.style.display = 'none';
    }
    else {
        myRelaysContainer.style.display = 'block';
        powRelaysEnable.style.display = 'inline';
    }
    refreshPowRelaysDom()
    refreshMyRelaysDom()
}

function refreshMyRelaysDom (){
    myRelays.textContent = MY_RELAYS.join(', ');
}

function refreshPowRelaysDom (){
    powRelays.textContent = POW_RELAYS.join(', ');
}

function setMyRelays( relays ){
    MY_RELAYS = Array.from(new Set([...MY_RELAYS, ...relays]))
}

function resetBestPow() {   
    minersBestPow = {};
    overallBestPow = {
        bestPow: 0,
        nonce: 0,
        hash: '',
        workerId: null,
    };
}

function spawnWorkers(amt=null){
    amt = amt? amt : totalWorkers
    console.log('Spawning workers...', totalWorkers);
    for (let i = 0; i < amt; i++) {
        const worker = new Worker('./worker.js', { type: 'module' });
        worker.onmessage = handleWorkerMessage;
        worker.postMessage({ type: 'init', id: i });
        workers.push(worker);
    }
}

spawnWorkers()

function disableInputs(){
    mineButton.disabled = true;
    cancelButton.disabled = true;
    numberOfWorkers.disabled = true;
    difficultyInput.disabled = true;
    eventInput.disabled = true;
}

function enableInputs(){
    mineButton.disabled = false;
    cancelButton.disabled = true;
    numberOfWorkers.disabled = false;
    difficultyInput.disabled = false;
    eventInput.disabled = false;
}


async function handleWorkerMessage(e) {
    const { type, data, error, hashRate, workerId, bestPowData:bestPowDataMap } = e.data;

    if (type === 'progress') {
        if(halt && hashRate > 0) {
            return workers[workerId].postMessage({ type: 'cancel' });
        }
        
        workerHashRates[workerId] = hashRate;
        const totalHashRate = Object.values(workerHashRates).reduce((a, b) => a + b, 0);
        hashrateOutput.textContent = `${(totalHashRate / 1000).toFixed(2)} kH/s`;

        if (bestPowDataMap?.size > 0) {
            const bestPowData = Object.fromEntries(bestPowDataMap);
            const { best_pow, nonce, hash } = bestPowData;
            minersBestPow[workerId] = {
                bestPow: best_pow,
                nonce,
                hash,
            };
            if (best_pow > overallBestPow.bestPow) {
                overallBestPow = {
                    bestPow: best_pow,
                    nonce,
                    hash,
                    workerId,
                };
            }
            updateBestPowDisplay();
        }

    } else if (type === 'ready') {
        isWorkerReady++;
        if (isWorkerReady === totalWorkers) {
            console.log('All workers are ready.');
            mineButton.disabled = false;
            resultOutput.textContent = 'Workers are ready. You can start mining.';
        }
    } else if (type === 'result') {
        if (data.error) {
            resultOutput.textContent = `Error: ${data.error}\n${JSON.stringify(data, null, 2)}`;
        } else {
            if(halt === false) {
                halt = true
                try {
                    cancelOtherWorkers(workerId);
                    await publishEvent(data.event);
                    resultOutput.textContent = JSON.stringify(data, null, 2);
                    neventOutput.style.display = 'block';
                } catch (e) {
                    console.error('Error publishing event:', e);
                    resultOutput.textContent = `Error publishing event: ${e.message}`;
                }
            }
        }
        hashrateOutput.textContent = '0 H/s';

        isMining = false;
        workerHashRates = {};
        mineButton.disabled = false;
        cancelButton.disabled = true;
        eventInput.value = '';
        workers[workerId]?.terminate();
        workers = []
        spawnWorkers()
        
    } else if (type === 'stopped') {
        
    } else if (type === 'error') {
        resultOutput.textContent = `Error: ${error}`;
        hashrateOutput.textContent = '0 H/s';
        mineButton.disabled = false;
        cancelButton.disabled = true; // Disable the cancel button
        isMining = false;
        workerHashRates = {}; // Reset hash rates on error
    }
}

function cancelOtherWorkers(excludeWorkerId) {
    workers.forEach((worker, index) => {
        if (index !== excludeWorkerId) {
            worker.postMessage({ type: 'cancel' });
            setTimeout( () => worker.terminate(), 1);
        }
    });
}

function updateBestPowDisplay() {
    // Update the UI to display each miner's best PoW
    let minersPowInfo = '';
    for (const [workerId, powData] of Object.entries(minersBestPow)) {
        minersPowInfo += `Miner #${workerId}: Best PoW ${powData.bestPow} (Nonce: ${powData.nonce}, Hash: ${powData.hash})\n`;
    }
    minersBestPowOutput.textContent = minersPowInfo;

    // Update the UI to display the overall best PoW
    if (overallBestPow.workerId !== null) {
        overallBestPowOutput.textContent = `Overall Best PoW: ${overallBestPow.bestPow} by Miner #${overallBestPow.workerId} (Nonce: ${overallBestPow.nonce}, Hash: ${overallBestPow.hash})`
    }
}

numberOfWorkers.addEventListener('change', () => {
    disableInputs()
    const c = parseInt(totalWorkers, 10)
    const n = parseInt(numberOfWorkers.value, 10);
    const delta = n - c;
    if (delta > 0) {
        spawnWorkers(delta)
    } else {
        const workersToTerminate = workers.splice(n, Math.abs(delta))
        workersToTerminate.forEach(worker => worker.terminate())
    }
    enableInputs()
})

function onK0(event){
    let profile
    try {
        profile = JSON.parse(event.content)
        user.name = profile.name 
        let photo 
        if(profile?.photo) photo = profile.photo
        else if(profile?.picture) photo = profile.picture
        else if(profile?.avatar) photo = profile.avatar
        user.photo = photo
        
    }
    catch(e){
        console.error('Error parsing K0 content:', e)
    }
    console.log('K0 profile:', profile)
    k0 = event
    refreshUserDom()
}

function onK3(event){
    let relays = []
    try{
        relays = Object.keys(JSON.parse(event.content))
    }
    catch(e){
        console.error('Error parsing K3 content:', e)
    }
    
    console.log('K3 relays:', relays)
    setMyRelays(relays)
    k3 = event  
    refreshMyRelaysDom()
}

function onK10002(event){
    const relays = event.tags.filter( t => t[0] === 'r' ).map( r => r[1] )
    console.log('K10002 relays:', relays)
    setMyRelays(relays?.length? relays : [])
    refreshMyRelaysDom()
    k10002 = event
}


function onevent(event){ 
    switch(event.kind){
        case 0:     return onK0(event)
        case 3:     return onK3(event)
        case 10002: return onK10002(event)
    }
}

function oneose(){ 
    try {
        usub.close() 
    }
    catch(e){
        console.warn('Error closing subscription:', e)
    }   
}

function onclose( resolve ){
    loginButton.disabled = false
    powRelaysEnable.style.display = 'inline';
    isAnon = false
    resolve()
}

powRelaysEnable.addEventListener('change', () => {
    console.log('active relays:', activeRelays())
})

relaysToggle.addEventListener('click', () => {
    if(relaysContainer.style.display === 'none'){
        relaysContainer.style.display = 'block'
    }
    else {
        relaysContainer.style.display = 'none'
    }
})


mineButton.addEventListener('click', () => {
    if (isMining) return;
    halt = false

    console.log('mining as:', pubkey)

    resetBestPow();
    minersBestPowOutput.style.display = 'block';
    overallBestPowOutput.style.display = 'block';

    const content = eventInput.value.trim();
    const nostrEvent = generateEvent(content);
    const difficulty = parseInt(difficultyInput.value, 10);
    const totalWorkers = parseInt(numberOfWorkers.value, 10);

    relayStatus.textContent = '';
    neventOutput.textContent = '';
    resultOutput.textContent = '';
    workerHashRates = {};

    if (!content) {
        alert('Please enter content for the Nostr event.');
        return;
    }

    if (isNaN(difficulty) || difficulty <= 0) {
        alert('Please enter a valid difficulty.');
        return;
    }

    if (isWorkerReady < totalWorkers) {
        alert('Workers are not ready yet. Please wait.');
        return;
    }

    const event = JSON.stringify(nostrEvent);

    mineButton.disabled = true;
    cancelButton.disabled = false; // Enable the cancel button
    resultOutput.textContent = 'Mining in progress...';
    hashrateOutput.textContent = '0 H/s';
    isMining = true;

    console.log('main: event:', event)

    workers.forEach((worker, index) => {
        worker.postMessage({
            type: 'mine',
            event,
            difficulty: difficulty,
            workerId: index,
            totalWorkers,
        });
    });
});

cancelButton.addEventListener('click', () => {
    if (isMining) {
        workers.forEach(worker => {
            worker.postMessage({ type: 'cancel' });
            worker.terminate();
        });
        workers = []
        resultOutput.textContent = 'Mining cancellation requested.';
        hashrateOutput.textContent = '0 H/s';
        mineButton.disabled = false;
        cancelButton.disabled = true;
        isMining = false;
        workerHashRates = {}; 
        spawnWorkers()
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
        tags: [['miner', MINER],['client', CLIENT]],
        content,
    }
}

const generateNEvent = (event) => {
    const { id, pubkey: author } = event;
    const pointer = { id, pubkey, relays: POW_RELAYS };
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
        if(isAnon) {
            ev = window.NostrTools.finalizeEvent(ev, secret);
        }
        else {
            ev = await window.nostr.signEvent(ev)
        }
        let isGood = window.NostrTools.verifyEvent(ev);
        if (!isGood) throw new Error('Event is not valid');
        pubs = pool.publish(activeRelays(), ev);
        await Promise.allSettled(pubs);
        relayStatus.style.display = '';
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
            relayStatus.textContent = `Published to all relays [${POW_RELAYS.join(', ')}]`;
            settled[index] = true;
        });
    });
}