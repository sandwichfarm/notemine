import { createContext, useContext, ParentComponent, createSignal, JSX, onMount } from 'solid-js';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import {
  ExtensionSigner,
  PrivateKeySigner,
  NostrConnectSigner,
} from 'applesauce-signers/signers';
import type { ISigner } from 'applesauce-signers';
import { relayPool } from '../lib/applesauce';
import type { NostrEvent } from 'nostr-tools/core';
import type { Filter } from 'nostr-tools/filter';
import { Observable } from 'rxjs';

export type AuthMethod = 'anon' | 'extension' | 'privatekey' | 'bunker' | 'nostrconnect';

export interface User {
  isAnon: boolean;
  pubkey: string;
  authMethod: AuthMethod;
  signer?: ISigner;
  // For anon only - direct access to secret key
  secret?: Uint8Array;
}

interface UserContextType {
  user: () => User | null;
  authAnon: () => void;
  authExtension: () => Promise<void>;
  authPrivateKey: (keyInput: string) => Promise<void>;
  authBunker: (bunkerUri: string) => Promise<void>;
  authNostrConnect: (connectUri: string) => Promise<void>;
  logout: () => void;
}

const UserContext = createContext<UserContextType>();

// Setup NostrConnectSigner with relayPool integration
const setupNostrConnectMethods = () => {
  // Subscription method using relayPool
  NostrConnectSigner.subscriptionMethod = (filters: Filter[], relays: string[]) => {
    return new Observable<NostrEvent>((observer) => {
      const subscription = relayPool.req(relays, filters).subscribe({
        next: (response) => {
          if (response !== 'EOSE') {
            observer.next(response);
          }
        },
        error: (err) => observer.error(err),
      });

      return () => subscription.unsubscribe();
    });
  };

  // Publish method using relayPool
  NostrConnectSigner.publishMethod = async (event: NostrEvent, relays: string[]) => {
    await relayPool.publish(relays, event);
  };
};

export const UserProvider: ParentComponent = (props): JSX.Element => {
  const [user, setUser] = createSignal<User | null>(null);

  // Setup NostrConnect methods once on mount
  onMount(() => {
    setupNostrConnectMethods();
  });

  const authAnon = () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    setUser({
      isAnon: true,
      pubkey,
      secret,
      authMethod: 'anon',
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
      console.log('[Auth] Connecting to bunker:', bunkerUri);

      // Use NostrConnectSigner.fromBunkerURI to connect
      const signer = await NostrConnectSigner.fromBunkerURI(bunkerUri, {
        permissions: NostrConnectSigner.buildSigningPermissions([0, 1, 3, 6, 7]),
      });

      // Wait for connection and get pubkey
      const pubkey = await signer.getPublicKey();

      console.log('[Auth] Bunker connected, pubkey:', pubkey);

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
      console.log('[Auth] Parsing nostrconnect URI:', connectUri);

      // Parse the nostrconnect:// URI
      const url = new URL(connectUri);
      const clientPubkey = url.hostname || url.pathname.replace('//', '');
      const secret = url.searchParams.get('secret');
      const relays = url.searchParams.getAll('relay');

      if (!secret || !relays.length) {
        throw new Error('Invalid nostrconnect URI: missing secret or relays');
      }

      console.log('[Auth] Creating NostrConnect signer with relays:', relays);

      // Create signer with the provided client pubkey and secret
      const signer = new NostrConnectSigner({
        relays,
        remote: clientPubkey,
        secret,
      });

      // Connect and get pubkey
      const pubkey = await signer.getPublicKey();

      console.log('[Auth] NostrConnect connected, pubkey:', pubkey);

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
