<script>
  import { writable, derived, get } from 'svelte/store';
  import { generateSecretKey, getPublicKey } from 'nostr-tools'; 
  import { onMount, onDestroy } from 'svelte';
  import { Notemine } from '@notemine/wrapper';
  import { user, relaySettings, miningState, contentState, activeRelays, usub, powRelays } from './lib/stores/index';
  import { publishEvent } from './lib/nostr';
  import { pool, onevent, oneose, onclose } from './lib/nostr';

  let notemine;
  let progressSub, successSub, errorSub, bestPowSub, workersPowSub;

  function authAnon() {
    const newSecret = generateSecretKey();
    user.set({
      isAnon: true,
      secret: newSecret,
      pubkey: getPublicKey(newSecret)
    });
    relaySettings.update(r => ({ ...r, myRelays: [] }));
  }

  async function authUser() {
    try {
      const pubkey = await window.nostr.getPublicKey();
      const isAnon = false 
      const secret = ''
      user.set({ isAnon, pubkey, secret });
      await getUserData();
    } catch (error) {
      console.error('Authentication failed:', error);
    }
  }

  function toggleAuth() {
    const currentUser = get(user);
    if (currentUser.isAnon) {
      authUser();
    } else {
      authAnon();
    }
  }

  function toggleRelays() {
    relaySettings.update(r => ({ ...r, myRelaysVisible: !r.myRelaysVisible }));
  }

  async function getUserData(){
    const currentUser = get(user);
    return new Promise( async (resolve, reject) => {
      $usub = pool.subscribeMany(
        ['wss://purplepag.es', 'wss://user.kindpag.es', 'wss://relay.nostr.band', 'wss://relay.primal.net', 'wss://relay.damus.io'],
        [{kinds: [0,3,10002], authors: [currentUser.pubkey]}],
        { onevent, oneose, onclose: onclose(resolve) }
      );
    });
  }

  async function startMining() {
    const currentUser = get(user);
    const currentContent = get(contentState);

    if (!currentUser.pubkey || !currentContent.content.trim()) {
      alert('Please fill in all required fields.');
      return;
    }

    resetMiningState();
    miningState.update(m => ({ ...m, mining: true }));

    notemine = new Notemine({
      content: currentContent.content,
      pubkey: currentUser.pubkey,
      difficulty: currentContent.difficulty,
      numberOfWorkers: currentContent.numberOfWorkers,
    });

    workersPowSub = notemine.workersPow$.subscribe((data) => {
      miningState.update(m => {
        const workersBestPow = Object.values(data);
        return {
          ...m,
          workersBestPow
        };
      });
    });

    bestPowSub = notemine.highestPow$.subscribe((data) => {
      miningState.update(m => {
        const overallBestPow = data;
        return {
          ...m,
          overallBestPow
        };
      });
    });

    progressSub = notemine.progress$.subscribe(() => {
      miningState.update(m => {
        const overallBestPow = m.overallBestPow;
        const hashRate = notemine.totalHashRate
        return {
          ...m,
          overallBestPow,
          hashRate
        };
      });
    });

    successSub = notemine.success$.subscribe(async ({ result: minedResult }) => {
      // const currentActiveRelays = get(activeRelays);
      // //console.log(`currentActiveRelays: ${$activeRelays}`);
      miningState.update(m => ({
        ...m,
        mining: false,
        result: minedResult ? JSON.stringify(minedResult, null, 2) : 'No result received.',
      }));
      await publishEvent(minedResult.event)
      miningState.update(m => ({
        ...m,
        relayStatus: `Published to relays: ${$activeRelays.join(', ')}`
      }));
    });

    errorSub = notemine.error$.subscribe(({ error }) => {
      console.error('Mining error:', error);
      miningState.update(m => ({
        ...m,
        mining: false,
        result: `Error: ${error}`
      }));
    });

    await notemine.mine();
    console.log('All workers mining.')
  }

  const resetMiningState = () => {
    miningState.update(m => ({
      ...m,
      mining: false,
      result: '',
      relayStatus: '',
      hashRate: 0,
      overallBestPow: null,
      publishSuccessNum: 0
    }));
  }

  function stopMining() {
    if (notemine) {
      notemine.cancel();
      resetMiningState();
    }
  }

  onMount(() => {
    authAnon();
  });

  onDestroy(() => {
    progressSub && progressSub.unsubscribe();
    successSub && successSub.unsubscribe();
    errorSub && errorSub.unsubscribe();
    if (notemine && get(miningState).mining) {
      notemine.cancel();
    }
  });
</script>

<style>
  body {
    font-family: Arial, sans-serif;
    padding: 20px;
  }

  #user {
    margin: 10px 0;
  }

  #relaysContainer {
    margin-top: 10px;
  }

  textarea, input[type="number"] {
    width: 100%;
    padding: 8px;
    margin-top: 5px;
    box-sizing: border-box;
  }

  button {
    padding: 10px 15px;
    margin-right: 10px;
    cursor: pointer;
  }

  pre {
    background-color: #f4f4f4;
    padding: 10px;
    overflow: auto;
  }

  ul {
    list-style-type: none;
    padding-left: 0;
  }

  li {
    margin-bottom: 5px;
  }
</style>

<h1><code>nnnnote⛏️</code></h1>
<p>This is a demo of <strong>Notemine</strong>, a wasm Nostr note miner written in Rust.</p>

<button on:click={toggleAuth}>
  {#if $user.isAnon}
    Login
  {/if}
  {#if !$user.isAnon}
    Logout
  {/if}
</button>

<button
  data-npub="npub1uac67zc9er54ln0kl6e4qp2y6ta3enfcg7ywnayshvlw9r5w6ehsqq99rx"
  data-relays="wss://relay.damus.io,wss://relay.snort.social,wss://nos.lol,wss://nostr.fmt.wiz.biz,wss://nostr.mutinywallet.com,wss://nostr.mywire.org,wss://relay.primal.net"
  style="inline-block"
>
    ⚡️ zap me
</button>

<button
  onclick="document.location.href='https://njump.me/nprofile1qythwumn8ghj7un9d3shjtnswf5k6ctv9ehx2ap0qy88wumn8ghj7mn0wvhxcmmv9uq3samnwvaz7tmwdaehgu3wvekhgtnhd9azucnf0ghsqg88wxhskpwga90umah7kdgq23xjlvwv6wz83r5lfy9m8m3garkkdusz5s2r'"
  style="display: inline-block; cursor: pointer;"
>
    🍻 follow
</button>

<button
  onclick="document.location.href='https://github.com/sandwichfarm/minnote-wasm'"
  style="display: inline-block; cursor: pointer;"
>
    🤖 git
</button>

<button
  onclick="document.location.href='https://crates.io/crates/notemine'"
  style="display: inline-block; cursor: pointer;"
>
    📦️ crate
</button>

<div id="user">
  posting as: 
  <!-- svelte-ignore a11y-img-redundant-alt -->
  <img 
    id="userPhoto" 
    width="20" 
    height="20" 
    src={$user.isAnon ? '/img/anon.svg' : $user.photo} 
    alt="User Photo" 
  /> 
  <span id="userName">{$user.isAnon ? 'anon' : $user.name}</span> 
  
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <small 
    id="relaysToggle" 
    style="cursor: pointer; color:#333;" 
    on:click={toggleRelays} 
    tabindex="0"
  >
    (relays)
  </small>
  
  {#if $relaySettings.myRelaysVisible}
    <div id="relaysContainer">
      {#if $relaySettings.myRelays.length > 0}
      <strong>My Relays:</strong>
      <ul>
        {#each $relaySettings.myRelays as relay}
          <li>{relay}</li>
        {/each}
      </ul>
      {/if}
      <br />
      {#if $relaySettings.myRelays.length > 0}
      <input type="checkbox" bind:checked={$relaySettings.powRelaysEnabled}> 
      {/if}
      <strong>POW Relays: </strong>
      <ul>
        {#each $powRelays as relay}
          <li>{relay}</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<textarea 
  id="eventInput" 
  rows="10" 
  placeholder="140 characters or less." 
  maxlength="140" 
  bind:value={$contentState.content}
></textarea>

<br><br>

<label for="difficulty">Difficulty:</label>
<input 
  type="number" 
  id="difficulty" 
  bind:value={$contentState.difficulty} 
  min="1"
/>
<br><br>

<label for="numberOfWorkers"># of workers:</label>
<input 
  type="number" 
  id="numberOfWorkers" 
  bind:value={$contentState.numberOfWorkers} 
  min="1" 
  max={navigator.hardwareConcurrency}
/>
<br><br>

<button on:click={startMining} disabled={$miningState.mining}>
  Mine & Publish
</button> 
<button on:click={stopMining} disabled={!$miningState.mining}>
  Cancel Mining
</button>

<h2>Hash Rate:</h2>
<pre id="hashrate">{$miningState.hashRate.toFixed(2)} kH/s</pre>

<h2>Worker Overview:</h2>
<pre id="hashrate">
  {#each $miningState.workersBestPow as worker, key}
    Miner #{key}: Best PoW: {worker.bestPow} (Nonce: {worker.nonce} Hash: {worker.hash} ) <br />
  {/each}
</pre>

<h2>Best PoW:</h2>
<pre id="overallBestPow">
  {#if $miningState.overallBestPow && typeof $miningState.overallBestPow.bestPow === 'number'}
    {JSON.stringify($miningState.overallBestPow, null, 2)}
  {:else}
    No PoW results yet.
  {/if}
</pre>

<h2>Result:</h2>
<pre id="result">{$miningState.result}</pre>

<h2>Relay Status:</h2>
<pre id="relayStatus">{$miningState.relayStatus}</pre>



{JSON.stringify($activeRelays)}