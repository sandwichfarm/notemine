import { Component, Show, createSignal, onCleanup } from 'solid-js';
import { useUser } from '../providers/UserProvider';
import { QRCodeSVG, ErrorCorrectionLevel } from 'solid-qr-code';
import { NostrConnectSigner } from 'applesauce-signers/signers';
import { saveSession, type NostrConnectSession } from '../lib/session-storage';

type AuthTab = 'extension' | 'nostrconnect' | 'bunker';

interface LoginExperienceProps {
  onClose: () => void;
  onSuccess?: () => void;
  showCloseButton?: boolean;
}

const LoginExperience: Component<LoginExperienceProps> = (props) => {
  const { authExtension, authBunker, authNostrConnect } = useUser();

  const [activeTab, setActiveTab] = createSignal<AuthTab>('extension');
  const [bunkerUriInput, setBunkerUriInput] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = createSignal('');
  const [nostrConnectSigner, setNostrConnectSigner] = createSignal<NostrConnectSigner | null>(null);
  const [nostrConnectStatus, setNostrConnectStatus] = createSignal<'waiting' | 'connected' | 'success'>('waiting');

  const complete = () => {
    if (props.onSuccess) props.onSuccess();
    else props.onClose();
  };

  const generateNostrConnectUri = async () => {
    try {
      setNostrConnectStatus('waiting');
      setError(null);
      const signer = new NostrConnectSigner({
        relays: [
          'wss://relay.damus.io',
          'wss://relay.primal.net',
          'wss://nos.lol',
        ],
      });
      setNostrConnectSigner(signer);
      const uri = signer.getNostrConnectURI({
        name: 'notemine.io',
        url: 'https://notemine.io',
        permissions: NostrConnectSigner.buildSigningPermissions([0, 1, 3, 6, 7]),
      });
      setNostrConnectUri(uri);
      waitForRemoteConnection(signer);
    } catch (err) {
      console.error('[Login] Failed to generate nostrconnect URI:', err);
      setError('Failed to generate connection URI');
    }
  };

  const waitForRemoteConnection = async (signer: NostrConnectSigner) => {
    try {
      await signer.waitForSigner();
      setNostrConnectStatus('connected');
      const pubkey = await signer.getPublicKey();
      const session: NostrConnectSession = {
        authMethod: 'nostrconnect',
        pubkey,
        timestamp: Date.now(),
        clientSecret: Array.from(signer.signer.key).map((b) => b.toString(16).padStart(2, '0')).join(''),
        remotePubkey: signer.remote!,
        relays: signer.relays,
        secret: signer.secret,
      };
      saveSession(session);
      await authNostrConnect(signer, pubkey);
      setNostrConnectStatus('success');
      setTimeout(() => complete(), 1500);
    } catch (err: any) {
      console.error('[Login] Failed to connect:', err);
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
      complete();
    } catch (err: any) {
      setError(err.message || 'Browser extension not found or denied access');
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
      complete();
    } catch (err: any) {
      setError(err.message || 'Failed to connect to bunker');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: AuthTab) => {
    setActiveTab(tab);
    setError(null);
    if (tab !== 'nostrconnect') {
      nostrConnectSigner()?.close();
      setNostrConnectSigner(null);
    }
    if (tab === 'nostrconnect' && !nostrConnectUri()) {
      generateNostrConnectUri();
    }
  };

  onCleanup(() => {
    nostrConnectSigner()?.close();
  });

  return (
    <div class="card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold">Sign In</h2>
            <p class="text-text-secondary text-sm mt-1">
              Connect your preferred signing method to mine and publish
            </p>
          </div>
          <Show when={props.showCloseButton}>
            <button
              onClick={props.onClose}
              class="text-text-secondary hover:text-text-primary"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </Show>
        </div>
      </div>

      <div class="px-6 py-1">
        <div class="flex flex-wrap gap-1">
          <button
            class={`button basic small tab ${activeTab() === 'extension' ? 'tab-active' : ''}`}
            onClick={() => handleTabChange('extension')}
          >
            Browser Extension
          </button>
          <button
            class={`button basic small tab ${activeTab() === 'nostrconnect' ? 'tab-active' : ''}`}
            onClick={() => handleTabChange('nostrconnect')}
          >
            Nostr Connect
          </button>
          <button
            class={`button basic small tab ${activeTab() === 'bunker' ? 'tab-active' : ''}`}
            onClick={() => handleTabChange('bunker')}
          >
            Bunker URI
          </button>
          {/* <button
            class={`button basic small tab ${activeTab() === 'privatekey' ? 'tab-active' : ''}`}
            onClick={() => handleTabChange('privatekey')}
          >
            Private Key
          </button> */}
        </div>
      </div>

      <div class="p-6 space-y-6">
        <Show when={error()}>
          <div class="bg-red-500/10 border border-red-500/30 text-red-500 text-sm px-4 py-3 rounded">
            {error()}
          </div>
        </Show>

        <Show when={activeTab() === 'extension'}>
          <div class="space-y-4">
            <p class="text-text-secondary text-sm">
              Use a NIP-07 compatible browser extension (e.g. Alby, Nos2x, X-Nostr) to authenticate.
            </p>
            <button
              class="button dangerous w-full"
              disabled={loading()}
              onClick={handleExtensionAuth}
            >
              {loading() ? 'Connecting…' : 'Connect Extension'}
            </button>
          </div>
        </Show>

        <Show when={activeTab() === 'nostrconnect'}>
          <div class="space-y-4 text-center">
            <p class="text-text-secondary text-sm">
              Scan this QR code with a mobile signer that supports Nostr Connect.
            </p>
            <Show when={nostrConnectUri()}>
              {(uri) => (
                <div class="inline-block p-6 bg-white rounded-2xl shadow">
                  <QRCodeSVG
                    value={uri()}
                    width={260}
                    height={260}
                    backgroundColor="#ffffff"
                    backgroundAlpha={1}
                    foregroundColor="#000000"
                    foregroundAlpha={1}
                    level={ErrorCorrectionLevel.MEDIUM}
                  />
                </div>
              )}
            </Show>
            <p class="text-xs text-text-secondary">
              Status: {nostrConnectStatus() === 'waiting' && 'Waiting for connection'}
              {nostrConnectStatus() === 'connected' && 'Connected – awaiting approval'}
              {nostrConnectStatus() === 'success' && 'Authenticated!'}
            </p>
            <button class="btn btn-secondary" onClick={generateNostrConnectUri}>
              Refresh QR
            </button>
          </div>
        </Show>

        <Show when={activeTab() === 'bunker'}>
          <div class="space-y-4">
            <input
              type="text"
              placeholder="bunker://..."
              class="input w-full"
              value={bunkerUriInput()}
              onInput={(e) => setBunkerUriInput(e.currentTarget.value)}
            />
            <button class="btn w-full" disabled={loading()} onClick={handleBunkerAuth}>
              {loading() ? 'Connecting…' : 'Connect Bunker'}
            </button>
          </div>
        </Show>

        {/* <Show when={activeTab() === 'privatekey'}>
          <div class="space-y-4">
            <input
              type="password"
              placeholder="nsec..."
              class="input w-full"
              value={privateKeyInput()}
              onInput={(e) => setPrivateKeyInput(e.currentTarget.value)}
            />
            <button class="btn w-full" disabled={loading()} onClick={handlePrivateKeyAuth}>
              {loading() ? 'Signing in…' : 'Sign In with Private Key'}
            </button>
          </div>
        </Show> */}
      </div>
    </div>
  );
};

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: Component<LoginModalProps> = (props) => {
  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={props.onClose}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <LoginExperience onClose={props.onClose} onSuccess={props.onClose} showCloseButton />
        </div>
      </div>
    </Show>
  );
};

export const LoginPanel: Component<{ onBack: () => void; onSuccess?: () => void }> = (props) => {
  return (
    <div class="space-y-4">
      <button class="btn w-fit text-sm" onClick={props.onBack}>
        ← Back
      </button>
      <LoginExperience onClose={props.onBack} onSuccess={props.onSuccess} />
    </div>
  );
};
