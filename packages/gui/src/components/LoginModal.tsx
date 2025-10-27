import { Component, createSignal, Show, onCleanup } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { QRCodeSVG } from 'solid-qr-code';
import { NostrConnectSigner } from 'applesauce-signers/signers';
import { saveNostrConnectSession } from '../lib/nostrconnect-storage';
import { debug } from '../lib/debug';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthTab = 'extension' | 'privatekey' | 'bunker' | 'nostrconnect';

export const LoginModal: Component<LoginModalProps> = (props) => {
  const { authExtension, authPrivateKey, authBunker, authNostrConnect } = useUser();

  const [activeTab, setActiveTab] = createSignal<AuthTab>('extension');
  const [privateKeyInput, setPrivateKeyInput] = createSignal('');
  const [bunkerUriInput, setBunkerUriInput] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = createSignal<string>('');
  const [nostrConnectSigner, setNostrConnectSigner] = createSignal<NostrConnectSigner | null>(null);
  const [nostrConnectStatus, setNostrConnectStatus] = createSignal<'waiting' | 'connected' | 'success'>('waiting');

  // Generate nostrconnect URI when tab is activated
  const generateNostrConnectUri = async () => {
    try {
      // Reset state
      setNostrConnectStatus('waiting');
      setError(null);

      // Create a new signer for this connection
      const signer = new NostrConnectSigner({
        relays: [
          'wss://relay.damus.io',
          'wss://relay.primal.net',
          'wss://nos.lol',
        ],
      });

      // Store the signer instance
      setNostrConnectSigner(signer);

      // Get the nostrconnect URI with metadata
      const uri = signer.getNostrConnectURI({
        name: 'notemine.io',
        url: 'https://notemine.io',
        permissions: NostrConnectSigner.buildSigningPermissions([0, 1, 3, 6, 7]),
      });

      setNostrConnectUri(uri);

      // Wait for remote signer to connect
      debug('[LoginModal] Waiting for remote signer to connect...');

      // Call waitForSigner in the background
      waitForRemoteConnection(signer);
    } catch (err) {
      console.error('[LoginModal] Failed to generate nostrconnect URI:', err);
      setError('Failed to generate connection URI');
    }
  };

  // Wait for remote signer to connect and complete authentication
  const waitForRemoteConnection = async (signer: NostrConnectSigner) => {
    try {
      // Wait for the remote signer to connect
      await signer.waitForSigner();

      debug('[LoginModal] Remote signer connected!');
      setNostrConnectStatus('connected');

      // Get the user's pubkey
      const pubkey = await signer.getPublicKey();
      debug('[LoginModal] Got pubkey from remote signer:', pubkey);

      // Save connection details to localStorage
      const session = {
        clientSecret: Array.from(signer.signer.key)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        remotePubkey: signer.remote!,
        userPubkey: pubkey,
        relays: signer.relays,
        secret: signer.secret,
      };
      saveNostrConnectSession(session);

      // Complete authentication
      await authNostrConnect(signer, pubkey);

      setNostrConnectStatus('success');

      // Close modal after a brief delay to show success message
      setTimeout(() => {
        props.onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[LoginModal] Failed to connect:', err);
      if (err.message !== 'Aborted') {
        setError(err.message || 'Failed to connect to remote signer');
      }
      setNostrConnectStatus('waiting');
    }
  };

  const handleExtensionAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      await authExtension();
      props.onClose();
    } catch (err: any) {
      setError(err.message || 'Browser extension not found or denied access');
    } finally {
      setLoading(false);
    }
  };

  const handlePrivateKeyAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const keyInput = privateKeyInput().trim();
      if (!keyInput) {
        throw new Error('Please enter a private key');
      }
      await authPrivateKey(keyInput);
      props.onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid private key');
    } finally {
      setLoading(false);
    }
  };

  const handleBunkerAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const bunkerUri = bunkerUriInput().trim();
      if (!bunkerUri) {
        throw new Error('Please enter a bunker URI');
      }
      if (!bunkerUri.startsWith('bunker://')) {
        throw new Error('Invalid bunker URI format. Must start with bunker://');
      }
      await authBunker(bunkerUri);
      props.onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect to bunker');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: AuthTab) => {
    setActiveTab(tab);
    setError(null);

    // Cleanup previous nostrconnect signer if switching away
    if (tab !== 'nostrconnect') {
      const signer = nostrConnectSigner();
      if (signer) {
        signer.close();
        setNostrConnectSigner(null);
      }
    }

    // Generate nostrconnect URI when switching to that tab
    if (tab === 'nostrconnect' && !nostrConnectUri()) {
      generateNostrConnectUri();
    }
  };

  // Cleanup on unmount
  onCleanup(() => {
    const signer = nostrConnectSigner();
    if (signer) {
      signer.close();
    }
  });

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={props.onClose}
      >
        <div
          class="card max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="border-b border-border p-6">
            <div class="flex items-center justify-between">
              <h2 class="text-2xl font-bold">Sign In</h2>
              <button
                onClick={props.onClose}
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p class="text-text-secondary mt-2">
              Choose your preferred authentication method
            </p>
          </div>

          {/* Tabs */}
          <div class="flex border-b border-border overflow-x-auto">
            <button
              class="px-6 py-3 font-medium transition-colors border-b-2"
              classList={{
                'border-accent text-accent': activeTab() === 'extension',
                'border-transparent text-text-secondary hover:text-text-primary': activeTab() !== 'extension',
              }}
              onClick={() => handleTabChange('extension')}
            >
              Browser Extension
            </button>
            <button
              class="px-6 py-3 font-medium transition-colors border-b-2"
              classList={{
                'border-accent text-accent': activeTab() === 'privatekey',
                'border-transparent text-text-secondary hover:text-text-primary': activeTab() !== 'privatekey',
              }}
              onClick={() => handleTabChange('privatekey')}
            >
              Private Key
            </button>
            <button
              class="px-6 py-3 font-medium transition-colors border-b-2"
              classList={{
                'border-accent text-accent': activeTab() === 'bunker',
                'border-transparent text-text-secondary hover:text-text-primary': activeTab() !== 'bunker',
              }}
              onClick={() => handleTabChange('bunker')}
            >
              Bunker
            </button>
            <button
              class="px-6 py-3 font-medium transition-colors border-b-2"
              classList={{
                'border-accent text-accent': activeTab() === 'nostrconnect',
                'border-transparent text-text-secondary hover:text-text-primary': activeTab() !== 'nostrconnect',
              }}
              onClick={() => handleTabChange('nostrconnect')}
            >
              QR Code
            </button>
          </div>

          {/* Content */}
          <div class="p-6">
            {/* Error Message */}
            <Show when={error()}>
              <div class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                {error()}
              </div>
            </Show>

            {/* NIP-07 Extension */}
            <Show when={activeTab() === 'extension'}>
              <div class="space-y-4">
                <div class="p-4 bg-accent/10 border border-accent/20 rounded-lg">
                  <h3 class="font-bold mb-2">NIP-07 Browser Extension</h3>
                  <p class="text-sm text-text-secondary mb-3">
                    Sign in using a Nostr browser extension like Alby, nos2x, or Flamingo.
                  </p>
                  <ul class="text-sm text-text-secondary space-y-1 list-disc list-inside">
                    <li>Most secure method</li>
                    <li>Keys never leave the extension</li>
                    <li>One-click signing</li>
                  </ul>
                </div>

                <button
                  onClick={handleExtensionAuth}
                  disabled={loading()}
                  class="btn-primary w-full"
                >
                  <Show when={!loading()} fallback="Connecting...">
                    Connect Extension
                  </Show>
                </button>
              </div>
            </Show>

            {/* Private Key */}
            <Show when={activeTab() === 'privatekey'}>
              <div class="space-y-4">
                <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <h3 class="font-bold mb-2 text-red-500">Security Warning</h3>
                  <p class="text-sm text-text-secondary">
                    Pasting your private key (nsec or hex) into websites is unsafe and not recommended.
                    Your key could be compromised. Use a browser extension or Nostr Connect instead.
                  </p>
                </div>

                <div>
                  <label class="block text-sm font-medium mb-2">
                    Private Key (nsec or hex)
                  </label>
                  <input
                    type="password"
                    value={privateKeyInput()}
                    onInput={(e) => setPrivateKeyInput(e.currentTarget.value)}
                    placeholder="nsec1... or hex string"
                    class="w-full px-4 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                  />
                </div>

                <button
                  onClick={handlePrivateKeyAuth}
                  disabled={loading() || !privateKeyInput().trim()}
                  class="btn-primary w-full"
                >
                  <Show when={!loading()} fallback="Signing in...">
                    Sign In with Private Key
                  </Show>
                </button>
              </div>
            </Show>

            {/* Bunker */}
            <Show when={activeTab() === 'bunker'}>
              <div class="space-y-4">
                <div class="p-4 bg-accent/10 border border-accent/20 rounded-lg">
                  <h3 class="font-bold mb-2">NIP-46 Bunker</h3>
                  <p class="text-sm text-text-secondary mb-3">
                    Connect to a remote signing service using a bunker:// URI.
                  </p>
                  <ul class="text-sm text-text-secondary space-y-1 list-disc list-inside">
                    <li>Keys stored on remote server</li>
                    <li>Sign from multiple devices</li>
                    <li>Requires bunker URI from your provider</li>
                  </ul>
                </div>

                <div>
                  <label class="block text-sm font-medium mb-2">
                    Bunker URI
                  </label>
                  <input
                    type="text"
                    value={bunkerUriInput()}
                    onInput={(e) => setBunkerUriInput(e.currentTarget.value)}
                    placeholder="bunker://pubkey?relay=wss://..."
                    class="w-full px-4 py-2 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                  />
                </div>

                <button
                  onClick={handleBunkerAuth}
                  disabled={loading() || !bunkerUriInput().trim()}
                  class="btn-primary w-full"
                >
                  <Show when={!loading()} fallback="Connecting...">
                    Connect to Bunker
                  </Show>
                </button>
              </div>
            </Show>

            {/* Nostr Connect QR Code */}
            <Show when={activeTab() === 'nostrconnect'}>
              <div class="space-y-4">
                <div class="p-4 bg-accent/10 border border-accent/20 rounded-lg">
                  <h3 class="font-bold mb-2">Nostr Connect (QR Code)</h3>
                  <p class="text-sm text-text-secondary">
                    Scan this QR code with a compatible Nostr app (like Amber or other NIP-46 signers)
                    to connect remotely.
                  </p>
                </div>

                <Show when={nostrConnectUri()}>
                  <div class="flex flex-col items-center space-y-4">
                    {/* QR Code */}
                    <div class="p-4 bg-white rounded-lg">
                      <QRCodeSVG
                        value={nostrConnectUri()}
                        width={256}
                        height={256}
                        backgroundColor="#ffffff"
                        backgroundAlpha={1}
                        foregroundColor="#000000"
                        foregroundAlpha={1}
                        level="medium"
                      />
                    </div>

                    {/* URI Display */}
                    <div class="w-full">
                      <label class="block text-sm font-medium mb-2">
                        Connection URI
                      </label>
                      <div class="p-3 bg-bg-secondary dark:bg-bg-tertiary border border-border rounded-lg">
                        <code class="text-xs break-all">{nostrConnectUri()}</code>
                      </div>
                    </div>

                    {/* Connection Status */}
                    <div class="text-center">
                      <Show when={nostrConnectStatus() === 'waiting'}>
                        <div class="flex items-center justify-center space-x-2 text-text-secondary">
                          <div class="animate-spin h-4 w-4 border-2 border-accent border-t-transparent rounded-full"></div>
                          <p class="text-sm">Waiting for connection from your signer app...</p>
                        </div>
                      </Show>
                      <Show when={nostrConnectStatus() === 'connected'}>
                        <div class="flex items-center justify-center space-x-2 text-accent">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <p class="text-sm font-medium">Connected! Completing authentication...</p>
                        </div>
                      </Show>
                      <Show when={nostrConnectStatus() === 'success'}>
                        <div class="flex items-center justify-center space-x-2 text-green-500">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <p class="text-sm font-medium">Successfully authenticated!</p>
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>

                <button
                  onClick={generateNostrConnectUri}
                  class="btn-secondary w-full"
                  disabled={nostrConnectStatus() === 'connected' || nostrConnectStatus() === 'success'}
                >
                  Generate New QR Code
                </button>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
