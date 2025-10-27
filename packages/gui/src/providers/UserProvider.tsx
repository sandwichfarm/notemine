import { createContext, useContext, ParentComponent, createSignal, JSX, onMount } from 'solid-js';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import {
  ExtensionSigner,
  PrivateKeySigner,
  NostrConnectSigner,
} from 'applesauce-signers/signers';
import type { ISigner } from 'applesauce-signers';
import { relayPool } from '../lib/applesauce';
import { Observable } from 'rxjs';
import { debug } from '../lib/debug';
import { saveAnonKey, loadAnonKey, clearAnonKey } from '../lib/anon-storage';

export type AuthMethod = 'anon' | 'extension' | 'privatekey' | 'bunker' | 'nostrconnect';

export interface User {
  isAnon: boolean;
  pubkey: string;
  authMethod: AuthMethod;
  signer?: ISigner;
  // For anon only - direct access to secret key
  secret?: Uint8Array;
  // For anon only - whether key is persisted
  isAnonPersisted?: boolean;
}

interface UserContextType {
  user: () => User | null;
  authAnon: (secret?: Uint8Array, persist?: boolean) => void;
  authExtension: () => Promise<void>;
  authPrivateKey: (keyInput: string) => Promise<void>;
  authBunker: (bunkerUri: string) => Promise<void>;
  authNostrConnect: (connectUri: string) => Promise<void>;
  logout: () => void;
  setAnonPersistence: (persist: boolean, onConfirm?: (action: 'keep' | 'regenerate') => void) => void;
  regenerateAnonKey: (onConfirm?: () => void) => void;
  loadPersistedAnonKey: () => Uint8Array | null;
}

const UserContext = createContext<UserContextType>();

// Setup NostrConnectSigner with relayPool integration
const setupNostrConnectMethods = () => {
  // Subscription method using relayPool
  NostrConnectSigner.subscriptionMethod = (relays, filters) =>
    new Observable((observer) => {
      const subscription = relayPool.req(relays, filters).subscribe({
        next: (value) => observer.next(value),
        error: (err) => observer.error(err),
        complete: () => observer.complete?.(),
      });

      return () => subscription.unsubscribe();
    }) as any;

  // Publish method using relayPool
  NostrConnectSigner.publishMethod = (relays, event) => relayPool.publish(relays, event);
};

export const UserProvider: ParentComponent = (props): JSX.Element => {
  const [user, setUser] = createSignal<User | null>(null);

  // Setup NostrConnect methods once on mount
  onMount(() => {
    setupNostrConnectMethods();
  });

  const authAnon = (secret?: Uint8Array, persist: boolean = false) => {
    const finalSecret = secret || generateSecretKey();
    const pubkey = getPublicKey(finalSecret);

    // Save to localStorage if persist is true
    if (persist) {
      saveAnonKey(finalSecret);
    }

    setUser({
      isAnon: true,
      pubkey,
      secret: finalSecret,
      authMethod: 'anon',
      isAnonPersisted: persist,
    });
  };

  const authExtension = async () => {
    try {
      const signer = new ExtensionSigner();
      const pubkey = await signer.getPublicKey();

      setUser({
        isAnon: false,
        pubkey,
        signer,
        authMethod: 'extension',
      });
    } catch (error) {
      console.error('[Auth] Extension auth failed:', error);
      throw error;
    }
  };

  const authPrivateKey = async (keyInput: string) => {
    try {
      const signer = PrivateKeySigner.fromKey(keyInput);
      const pubkey = await signer.getPublicKey();

      setUser({
        isAnon: false,
        pubkey,
        signer,
        authMethod: 'privatekey',
      });
    } catch (error) {
      console.error('[Auth] Private key auth failed:', error);
      throw error;
    }
  };

  const authBunker = async (bunkerUri: string) => {
    try {
      debug('[Auth] Connecting to bunker:', bunkerUri);

      // Use NostrConnectSigner.fromBunkerURI to connect
      const signer = await NostrConnectSigner.fromBunkerURI(bunkerUri, {
        permissions: NostrConnectSigner.buildSigningPermissions([0, 1, 3, 6, 7]),
      });

      // Wait for connection and get pubkey
      const pubkey = await signer.getPublicKey();

      debug('[Auth] Bunker connected, pubkey:', pubkey);

      setUser({
        isAnon: false,
        pubkey,
        signer,
        authMethod: 'bunker',
      });
    } catch (error) {
      console.error('[Auth] Bunker auth failed:', error);
      throw error;
    }
  };

  const authNostrConnect = async (connectUri: string) => {
    try {
      debug('[Auth] Parsing nostrconnect URI:', connectUri);

      // Parse the nostrconnect:// URI
      const url = new URL(connectUri);
      const clientPubkey = url.hostname || url.pathname.replace('//', '');
      const secret = url.searchParams.get('secret');
      const relays = url.searchParams.getAll('relay');

      if (!secret || !relays.length) {
        throw new Error('Invalid nostrconnect URI: missing secret or relays');
      }

      debug('[Auth] Creating NostrConnect signer with relays:', relays);

      // Create signer with the provided client pubkey and secret
      const signer = new NostrConnectSigner({
        relays,
        remote: clientPubkey,
        secret,
      });

      // Connect and get pubkey
      const pubkey = await signer.getPublicKey();

      debug('[Auth] NostrConnect connected, pubkey:', pubkey);

      setUser({
        isAnon: false,
        pubkey,
        signer,
        authMethod: 'nostrconnect',
      });
    } catch (error) {
      console.error('[Auth] NostrConnect auth failed:', error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
  };

  /**
   * Toggle anonymous key persistence
   * @param persist - Whether to persist the key
   * @param onConfirm - Callback for when disabling persistence (action: 'keep' or 'regenerate')
   */
  const setAnonPersistence = (persist: boolean, onConfirm?: (action: 'keep' | 'regenerate') => void) => {
    const currentUser = user();
    if (!currentUser || !currentUser.isAnon || !currentUser.secret) {
      return;
    }

    if (persist) {
      // Enable persistence: save current key
      saveAnonKey(currentUser.secret);
      setUser({
        ...currentUser,
        isAnonPersisted: true,
      });
    } else {
      // Disable persistence: ask user what to do via callback
      if (onConfirm) {
        onConfirm('keep'); // Caller will handle the confirmation dialog
      } else {
        // No callback, just clear storage and keep current key
        clearAnonKey();
        setUser({
          ...currentUser,
          isAnonPersisted: false,
        });
      }
    }
  };

  /**
   * Handle confirmation result when disabling persistence
   * @param action - 'keep' current key or 'regenerate' new key
   */
  // @ts-expect-error - Function reserved for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handlePersistenceDisableConfirm = (action: 'keep' | 'regenerate') => {
    const currentUser = user();
    if (!currentUser || !currentUser.isAnon) return;

    clearAnonKey();

    if (action === 'regenerate') {
      // Generate new ephemeral key
      authAnon(undefined, false);
    } else {
      // Keep current key, just mark as not persisted
      setUser({
        ...currentUser,
        isAnonPersisted: false,
      });
    }
  };

  /**
   * Regenerate anonymous key (keeps persistence setting)
   * @param onConfirm - Confirmation callback before regenerating
   */
  const regenerateAnonKey = (onConfirm?: () => void) => {
    const currentUser = user();
    if (!currentUser || !currentUser.isAnon) return;

    if (onConfirm) {
      // Caller will handle confirmation dialog
      onConfirm();
    } else {
      // No confirmation needed, regenerate immediately
      const wasPersisted = currentUser.isAnonPersisted;
      authAnon(undefined, wasPersisted);
    }
  };

  /**
   * Handle confirmation result for key regeneration
   */
  // @ts-expect-error - Function reserved for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleRegenerateConfirm = () => {
    const currentUser = user();
    if (!currentUser || !currentUser.isAnon) return;

    const wasPersisted = currentUser.isAnonPersisted;
    authAnon(undefined, wasPersisted);
  };

  /**
   * Load persisted anonymous key from localStorage
   * @returns Uint8Array secret key or null if not found
   */
  const loadPersistedAnonKey = (): Uint8Array | null => {
    return loadAnonKey();
  };

  return (
    <UserContext.Provider
      value={{
        user,
        authAnon,
        authExtension,
        authPrivateKey,
        authBunker,
        authNostrConnect,
        logout,
        setAnonPersistence,
        regenerateAnonKey,
        loadPersistedAnonKey,
      }}
    >
      {props.children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
};
