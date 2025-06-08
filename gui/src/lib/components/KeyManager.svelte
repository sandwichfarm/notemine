<script lang="ts">
  import { keyManager, type SigningMethod } from '$lib/services/keys';
  import { onMount } from 'svelte';
  import SigningMethodPicker from './SigningMethodPicker.svelte';
  
  let showKeyManager = false;
  let privateKey = '';
  let publicKey = '';
  let isGenerating = false;
  let showPrivateKey = false;
  let mode: 'generate' | 'import' | 'connect' = 'connect';
  let currentSigningMethod: SigningMethod = 'private-key';
  let isConnected = false;
  
  onMount(() => {
    // Check if we already have keys
    publicKey = keyManager.getPublicKey() || '';
    
    // Subscribe to signing method changes
    keyManager.signingMethod.subscribe(method => {
      currentSigningMethod = method;
    });
    
    keyManager.isConnected.subscribe(connected => {
      isConnected = connected;
      if (connected) {
        // Update public key when connected
        keyManager.getPublicKeyFromSigner().then(pk => {
          if (pk) publicKey = pk;
        });
      }
    });
  });
  
  function onSigningMethodSet(method: SigningMethod) {
    currentSigningMethod = method;
    showKeyManager = false;
  }
  
  async function generateNewKeys() {
    isGenerating = true;
    try {
      const keys = await keyManager.generateKeys();
      privateKey = keys.privateKey;
      publicKey = keys.publicKey;
      showPrivateKey = true;
    } catch (error) {
      console.error('Failed to generate keys:', error);
    } finally {
      isGenerating = false;
    }
  }
  
  async function importKeys() {
    if (!privateKey.trim()) return;
    
    try {
      const keys = await keyManager.importPrivateKey(privateKey);
      publicKey = keys.publicKey;
      privateKey = '';
      showPrivateKey = false;
      showKeyManager = false;
    } catch (error) {
      console.error('Failed to import keys:', error);
      alert('Invalid private key format');
    }
  }
  
  function clearKeys() {
    if (confirm('Are you sure you want to clear your keys? This cannot be undone.')) {
      keyManager.clearKeys();
      privateKey = '';
      publicKey = '';
      showPrivateKey = false;
    }
  }
  
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
</script>

<div class="fixed top-4 right-4 z-50">
  {#if publicKey && !showKeyManager}
    <button
      on:click={() => showKeyManager = true}
      class="bg-transparent text-green-400 px-2 py-1 text-xs font-mono border border-green-400 hover:bg-green-400 hover:text-black transition-all"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
      <span>{publicKey.slice(0, 8)}...</span>
      <span class="text-xs opacity-75">({currentSigningMethod})</span>
    </button>
  {/if}
  
  {#if !publicKey && !showKeyManager}
    <button
      on:click={() => showKeyManager = true}
      class="bg-orange-500 text-black px-3 py-1.5 text-xs font-mono animate-pulse hover:bg-orange-400 transition-all"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
      INIT_KEYS
    </button>
  {/if}
</div>

{#if showKeyManager}
  <div class="fixed inset-0 bg-black text-green-400 z-50 flex flex-col font-mono">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-green-400/20">
      <h1 class="text-lg font-mono text-green-400">KEY_MANAGEMENT</h1>
      <button
        on:click={() => showKeyManager = false}
        class="text-green-400 hover:text-orange-400 transition-colors text-xl"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    
    <!-- Content Area -->
    <div class="flex-1 p-6 overflow-y-auto flex items-center justify-center">
      <div class="max-w-2xl w-full space-y-6">
        {#if !publicKey || !isConnected}
        <div class="space-y-4">
          <div class="flex gap-1 mb-4">
            <button
              on:click={() => mode = 'connect'}
              class="flex-1 py-1.5 px-2 transition-all text-xs font-mono {mode === 'connect' ? 'bg-green-400 text-black' : 'bg-transparent text-green-400 border border-green-400'}"
            >
              Connect
            </button>
            <button
              on:click={() => mode = 'generate'}
              class="flex-1 py-1.5 px-2 transition-all text-xs font-mono {mode === 'generate' ? 'bg-green-400 text-black' : 'bg-transparent text-green-400 border border-green-400'}"
            >
              Generate
            </button>
            <button
              on:click={() => mode = 'import'}
              class="flex-1 py-1.5 px-2 transition-all text-xs font-mono {mode === 'import' ? 'bg-green-400 text-black' : 'bg-transparent text-green-400 border border-green-400'}"
            >
              Import
            </button>
          </div>
          
          {#if mode === 'connect'}
            <SigningMethodPicker {onSigningMethodSet} />
          {:else if mode === 'generate'}
            <div class="space-y-4">
              <p class="text-neutral-400 text-sm">
                Generate a new Nostr keypair. Make sure to save your private key securely!
              </p>
              <button
                on:click={generateNewKeys}
                disabled={isGenerating}
                class="w-full py-3 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate New Keys'}
              </button>
            </div>
          {:else}
            <div class="space-y-4">
              <p class="text-neutral-400 text-sm">
                Import your existing Nostr private key (nsec or hex format).
              </p>
              <input
                type="password"
                bind:value={privateKey}
                placeholder="nsec1... or hex private key"
                class="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600"
              />
              <button
                on:click={importKeys}
                disabled={!privateKey.trim()}
                class="w-full py-3 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import Keys
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <div class="space-y-4">
          <div>
            <label class="text-neutral-400 text-sm mb-1 block">Public Key</label>
            <div class="flex gap-2">
              <input
                type="text"
                value={publicKey}
                readonly
                class="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white font-mono text-sm"
              />
              <button
                on:click={() => copyToClipboard(publicKey)}
                class="px-3 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
          
          {#if showPrivateKey && privateKey}
            <div>
              <label class="text-neutral-400 text-sm mb-1 block">Private Key (Save this securely!)</label>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={privateKey}
                  readonly
                  class="flex-1 px-4 py-2 bg-red-900/20 border border-red-800 rounded-lg text-red-400 font-mono text-sm"
                />
                <button
                  on:click={() => copyToClipboard(privateKey)}
                  class="px-3 py-2 bg-red-800 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <p class="text-red-400 text-xs mt-2">
                ⚠️ Never share your private key with anyone!
              </p>
            </div>
          {/if}
          
          <div class="pt-4 border-t border-neutral-800">
            <button
              on:click={clearKeys}
              class="w-full py-2 px-4 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors"
            >
              Clear Keys
            </button>
          </div>
        </div>
      {/if}
      </div>
    </div>
  </div>
{/if}