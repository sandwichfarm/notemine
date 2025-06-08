<script lang="ts">
  import { keyManager, type SigningMethod, type SigningConfig } from '$lib/services/keys';
  import { onMount } from 'svelte';
  
  export let onSigningMethodSet: (method: SigningMethod) => void = () => {};
  
  let availableMethods: SigningMethod[] = [];
  let currentMethod: SigningMethod = 'private-key';
  let isConnected = false;
  let isConnecting = false;
  let error = '';
  let nostrConnectStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  
  // Form inputs
  let privateKeyInput = '';
  let connectUrlInput = '';
  let encryptedKeyInput = '';
  let passwordInput = '';
  
  onMount(() => {
    keyManager.availableMethods.subscribe(methods => {
      availableMethods = methods;
    });
    
    keyManager.signingMethod.subscribe(method => {
      currentMethod = method;
    });
    
    keyManager.isConnected.subscribe(connected => {
      isConnected = connected;
    });
    
    keyManager.nostrConnectStatus.subscribe(status => {
      nostrConnectStatus = status;
    });
  });
  
  async function setSigningMethod(method: SigningMethod) {
    if (isConnecting) return;
    
    isConnecting = true;
    error = '';
    
    try {
      const config: SigningConfig = { method };
      
      switch (method) {
        case 'anonymous':
          // Anonymous doesn't require additional config
          break;
        case 'private-key':
          if (privateKeyInput) {
            config.privateKey = privateKeyInput;
          }
          break;
        case 'nip-07':
          // NIP-07 doesn't require additional config
          break;
        case 'nostr-connect':
          if (!connectUrlInput) {
            throw new Error('Nostr Connect URL is required');
          }
          config.connectUrl = connectUrlInput;
          break;
        case 'encrypted-key':
          if (!encryptedKeyInput || !passwordInput) {
            throw new Error('Encrypted key and password are required');
          }
          config.encryptedKey = encryptedKeyInput;
          config.password = passwordInput;
          break;
        case 'amber':
          // Amber doesn't require additional config
          break;
      }
      
      await keyManager.setSigningMethod(config);
      onSigningMethodSet(method);
      
    } catch (err) {
      error = err.message;
      console.error('Failed to set signing method:', err);
    } finally {
      isConnecting = false;
    }
  }
  
  function getMethodIcon(method: SigningMethod): string {
    switch (method) {
      case 'anonymous': return '👤';
      case 'private-key': return '🔑';
      case 'nip-07': return '🔌';
      case 'nostr-connect': return '🌐';
      case 'encrypted-key': return '🔐';
      case 'amber': return '📱';
      default: return '❓';
    }
  }
  
  function getMethodName(method: SigningMethod): string {
    switch (method) {
      case 'anonymous': return 'Anonymous (Ephemeral)';
      case 'private-key': return 'Private Key';
      case 'nip-07': return 'Browser Extension (NIP-07)';
      case 'nostr-connect': return 'Nostr Connect';
      case 'encrypted-key': return 'Encrypted Key (NIP-49)';
      case 'amber': return 'Amber Wallet';
      default: return method;
    }
  }
  
  function getMethodDescription(method: SigningMethod): string {
    switch (method) {
      case 'anonymous': return 'Generate a temporary key for testing (not saved)';
      case 'private-key': return 'Sign with your private key stored locally';
      case 'nip-07': 
        if (typeof window !== 'undefined' && window.nostr) {
          return 'Sign with Alby, nos2x, or other browser extensions';
        } else {
          return 'Browser extension not detected. Install Alby, nos2x, or similar.';
        }
      case 'nostr-connect': return 'Connect to a remote signer via NIP-46 (Nostr Connect)';
      case 'encrypted-key': return 'Use a password-encrypted private key (NIP-49)';
      case 'amber': return 'Sign using the Amber Android wallet via clipboard';
      default: return '';
    }
  }
  
  function isMethodAvailable(method: SigningMethod): boolean {
    switch (method) {
      case 'nip-07':
        return typeof window !== 'undefined' && !!window.nostr;
      default:
        return true;
    }
  }
</script>

<div class="space-y-6">
  <div class="text-center">
    <h2 class="text-xl font-semibold text-white mb-2">Choose Your Signing Method</h2>
    <p class="text-neutral-400 text-sm">
      Select how you want to sign your Nostr events
    </p>
  </div>
  
  {#if error}
    <div class="bg-red-900/20 border border-red-800 rounded-lg p-3">
      <p class="text-red-400 text-sm">{error}</p>
    </div>
  {/if}
  
  <div class="space-y-3">
    {#each availableMethods as method}
      {@const methodAvailable = isMethodAvailable(method)}
      <div class="border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors {!methodAvailable ? 'opacity-60' : ''}">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-3">
            <span class="text-2xl {!methodAvailable ? 'grayscale' : ''}">{getMethodIcon(method)}</span>
            <div>
              <h3 class="text-white font-medium flex items-center gap-2">
                {getMethodName(method)}
                {#if !methodAvailable}
                  <span class="text-red-400 text-xs">(Unavailable)</span>
                {/if}
              </h3>
              <p class="text-neutral-400 text-xs {!methodAvailable ? 'text-red-400' : ''}">{getMethodDescription(method)}</p>
            </div>
          </div>
          
          {#if currentMethod === method && isConnected}
            <span class="bg-green-900/30 text-green-400 px-2 py-1 rounded text-xs">Connected</span>
          {:else if method === 'nostr-connect' && nostrConnectStatus === 'connecting'}
            <span class="bg-yellow-900/30 text-yellow-400 px-2 py-1 rounded text-xs">Connecting...</span>
          {:else if method === 'nostr-connect' && nostrConnectStatus === 'error'}
            <span class="bg-red-900/30 text-red-400 px-2 py-1 rounded text-xs">Error</span>
          {/if}
        </div>
        
        <!-- Method-specific inputs -->
        {#if method === 'private-key'}
          <div class="mt-3 space-y-2">
            <input
              type="password"
              bind:value={privateKeyInput}
              placeholder="nsec1... or hex private key"
              class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-orange-600"
            />
          </div>
        {:else if method === 'encrypted-key'}
          <div class="mt-3 space-y-2">
            <input
              type="text"
              bind:value={encryptedKeyInput}
              placeholder="ncryptsec1... (NIP-49 encrypted key)"
              class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-orange-600"
            />
            <input
              type="password"
              bind:value={passwordInput}
              placeholder="Password"
              class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-orange-600"
            />
          </div>
        {:else if method === 'nostr-connect'}
          <div class="mt-3 space-y-2">
            <input
              type="text"
              bind:value={connectUrlInput}
              placeholder="nostrconnect://pubkey@relay1&relay2 or bunker://pubkey?relay=wss://..."
              class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-orange-600"
            />
            <p class="text-xs text-neutral-500">
              Enter a NostrConnect URL from your signing device or Nostr wallet that supports NIP-46 remote signing.
            </p>
          </div>
        {/if}
        
        <button
          on:click={() => setSigningMethod(method)}
          disabled={isConnecting || (currentMethod === method && isConnected) || !methodAvailable}
          class="w-full mt-3 py-2 px-4 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {#if !methodAvailable}
            {#if method === 'nip-07'}
              Install Browser Extension
            {:else}
              Unavailable
            {/if}
          {:else if isConnecting}
            Connecting...
          {:else if currentMethod === method && isConnected}
            Connected
          {:else}
            Connect with {getMethodName(method)}
          {/if}
        </button>
      </div>
    {/each}
  </div>
  
  {#if isConnected}
    <div class="pt-4 border-t border-neutral-800">
      <button
        on:click={() => keyManager.disconnect()}
        class="w-full py-2 px-4 bg-neutral-800 text-neutral-400 rounded hover:bg-neutral-700 transition-colors text-sm"
      >
        Disconnect Current Method
      </button>
    </div>
  {/if}
</div>