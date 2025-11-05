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
import {
  saveSession,
  loadSession,
  clearSession,
  isSessionStale,
  migrateOldNostrConnectSession,
  type ExtensionSession,
  type NostrConnectSession as UnifiedNostrConnectSession,
  type BunkerSession,
} from '../lib/session-storage';

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
  authExtension: (saveToSession?: boolean) => Promise<void>;
  authPrivateKey: (keyInput: string) => Promise<void>;
  authBunker: (bunkerUri: string, saveToSession?: boolean) => Promise<void>;
  authNostrConnect: (signer: ISigner, pubkey: string) => Promise<void>;
  restoreNostrConnectSession: () => Promise<void>;
  restoreSession: () => Promise<{ success: boolean; method?: string; error?: string }>;
  fetchUserData: (pubkey: string) => Promise<void>;
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

  const authExtension = async (saveToSession: boolean = true) => {
    try {
      const signer = new ExtensionSigner();
      const pubkey = await signer.getPublicKey();

      setUser({
        isAnon: false,
        pubkey,
        signer,
        authMethod: 'extension',
      });

      // Save session for auto-restore on next visit
      if (saveToSession) {
        const session: ExtensionSession = {
          authMethod: 'extension',
          pubkey,
          timestamp: Date.now(),
        };
        saveSession(session);
      }

      // Fetch user data including relay list
      await fetchUserData(pubkey);
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

      // Fetch user data including relay list
      await fetchUserData(pubkey);
    } catch (error) {
      console.error('[Auth] Private key auth failed:', error);
      throw error;
    }
  };

  const authBunker = async (bunkerUri: string, saveToSession: boolean = true) => {
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

      // Save session for auto-restore on next visit
      if (saveToSession) {
        const session: BunkerSession = {
          authMethod: 'bunker',
          pubkey,
          timestamp: Date.now(),
          bunkerUri,
        };
        saveSession(session);
      }

      // Fetch user data including relay list
      await fetchUserData(pubkey);
    } catch (error) {
      console.error('[Auth] Bunker auth failed:', error);
      throw error;
    }
  };

  const authNostrConnect = async (signer: ISigner, pubkey: string) => {
    try {
      debug('[Auth] NostrConnect authentication with pubkey:', pubkey);

      setUser({
        isAnon: false,
        pubkey,
        signer,
        authMethod: 'nostrconnect',
      });

      // Save session data (already handled in LoginModal when signer is created)
      // The session is saved by saveNostrConnectSession in LoginModal before calling this function

      // Fetch user data including relay list
      await fetchUserData(pubkey);
    } catch (error) {
      console.error('[Auth] NostrConnect auth failed:', error);
      throw error;
    }
  };

  const restoreNostrConnectSession = async () => {
    try {
      const { loadNostrConnectSession } = await import('../lib/nostrconnect-storage');
      const session = loadNostrConnectSession();

      if (!session) {
        debug('[Auth] No persisted NostrConnect session found');
        return;
      }

      debug('[Auth] Restoring NostrConnect session');

      // Convert hex client secret back to Uint8Array
      const clientSecret = new Uint8Array(session.clientSecret.length / 2);
      for (let i = 0; i < session.clientSecret.length; i += 2) {
        clientSecret[i / 2] = parseInt(session.clientSecret.substring(i, i + 2), 16);
      }

      // Create PrivateKeySigner from the stored client secret
      const clientSigner = new PrivateKeySigner(clientSecret);

      // Create NostrConnectSigner with the restored session
      const signer = new NostrConnectSigner({
        relays: session.relays,
        remote: session.remotePubkey,
        secret: session.secret,
        signer: clientSigner,
        pubkey: session.userPubkey,
      });

      // Open connection
      await signer.open();

      debug('[Auth] NostrConnect session restored, pubkey:', session.userPubkey);

      setUser({
        isAnon: false,
        pubkey: session.userPubkey,
        signer,
        authMethod: 'nostrconnect',
      });

      // Fetch user data including relay list
      await fetchUserData(session.userPubkey);
    } catch (error) {
      console.error('[Auth] Failed to restore NostrConnect session:', error);
      // Clear invalid session
      const { clearNostrConnectSession } = await import('../lib/nostrconnect-storage');
      clearNostrConnectSession();
    }
  };

  // Fetch user profile data (kind 0, 3, 10002) after authentication
  const fetchUserData = async (pubkey: string) => {
    try {
      debug('[Auth] Fetching user data for:', pubkey);

      // Import the necessary functions
      const {
        relayPool,
        eventStore,
        PROFILE_RELAYS,
        getUserInboxRelays,
        getUserOutboxRelays,
      } = await import('../lib/applesauce');

      // Ensure PROFILE_RELAYS are connected
      debug('[Auth] Connecting to profile relays:', PROFILE_RELAYS);
      PROFILE_RELAYS.forEach(url => {
        relayPool.relay(url);
      });

      // Fetch all three kinds in a single subscription
      const filter = {
        kinds: [0, 3, 10002],
        authors: [pubkey],
      };

      debug('[Auth] Fetching kind 0, 3, 10002 from profile relays');

      const subscription = relayPool.req(PROFILE_RELAYS, filter).subscribe({
        next: (response) => {
          if (response !== 'EOSE') {
            if (response.kind === 0) {
              eventStore.add(response);
              debug('[Auth] Stored kind 0 event');
            } else if (response.kind === 3) {
              eventStore.add(response);
              debug('[Auth] Stored kind 3 event');
            } else if (response.kind === 10002) {
              eventStore.add(response);
              debug('[Auth] Stored kind 10002 event');

              // Trigger relay list population (updates signals)
              debug('[Auth] Triggering NIP-65 relay list population');
              getUserInboxRelays(pubkey).catch(err =>
                console.error('[Auth] Failed to get inbox relays:', err)
              );
              getUserOutboxRelays(pubkey).catch(err =>
                console.error('[Auth] Failed to get outbox relays:', err)
              );
            }
          }
        },
        error: (err) => {
          console.error('[Auth] Subscription error:', err);
        },
        complete: () => {
          debug('[Auth] Profile data fetch complete');
        },
      });

      // Clean up subscription after timeout
      setTimeout(() => {
        subscription.unsubscribe();
      }, 5000);

      // Also trigger relay fetch immediately (in case data is already in cache)
      debug('[Auth] Triggering immediate relay list check from cache');
      getUserInboxRelays(pubkey).catch(err =>
        console.error('[Auth] Failed to get inbox relays:', err)
      );
      getUserOutboxRelays(pubkey).catch(err =>
        console.error('[Auth] Failed to get outbox relays:', err)
      );
    } catch (error) {
      console.error('[Auth] Failed to fetch user data:', error);
      // Non-fatal error, continue with authentication
    }
  };

  /**
   * Restore user session with signer health check
   * Attempts to restore the most recent session and verifies signer availability
   * @returns Result object with success status and details
   */
  const restoreSession = async (): Promise<{ success: boolean; method?: string; error?: string }> => {
    try {
      // Migrate old NostrConnect sessions first
      migrateOldNostrConnectSession();

      // Load the most recent session
      const session = loadSession();

      if (!session) {
        debug('[Auth] No persisted session found');
        return { success: false, error: 'No persisted session found' };
      }

      // Check if session is stale (older than 30 days)
      if (isSessionStale(session)) {
        debug('[Auth] Session is stale, clearing');
        clearSession(session.authMethod);
        return { success: false, error: 'Session expired (stale)' };
      }

      debug('[Auth] Attempting to restore session:', {
        method: session.authMethod,
        pubkey: session.pubkey,
        age: Date.now() - session.timestamp
      });

      // Restore based on auth method
      switch (session.authMethod) {
        case 'extension': {
          try {
            // Health check: Try to get public key from extension
            const signer = new ExtensionSigner();
            const pubkey = await signer.getPublicKey();

            // Verify it matches stored session
            if (pubkey !== session.pubkey) {
              debug('[Auth] Extension pubkey mismatch, clearing session');
              clearSession('extension');
              return { success: false, error: 'Extension signer pubkey mismatch' };
            }

            // Success! Restore session without saving again
            await authExtension(false);
            debug('[Auth] Extension session restored successfully');
            return { success: true, method: 'extension' };
          } catch (error: any) {
            debug('[Auth] Extension health check failed:', error.message);
            clearSession('extension');
            return { success: false, error: `Extension unavailable: ${error.message}` };
          }
        }

        case 'nostrconnect': {
          try {
            const ncSession = session as UnifiedNostrConnectSession;

            // Convert hex client secret back to Uint8Array
            const clientSecret = new Uint8Array(ncSession.clientSecret.length / 2);
            for (let i = 0; i < ncSession.clientSecret.length; i += 2) {
              clientSecret[i / 2] = parseInt(ncSession.clientSecret.substring(i, i + 2), 16);
            }

            // Create PrivateKeySigner from the stored client secret
            const clientSigner = new PrivateKeySigner(clientSecret);

            // Create NostrConnectSigner with the restored session
            const signer = new NostrConnectSigner({
              relays: ncSession.relays,
              remote: ncSession.remotePubkey,
              secret: ncSession.secret,
              signer: clientSigner,
              pubkey: ncSession.pubkey,
            });

            // Open connection with timeout
            const openTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Connection timeout')), 10000)
            );

            await Promise.race([signer.open(), openTimeout]);

            // Health check: Try to get public key
            const healthTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Health check timeout')), 5000)
            );

            const pubkey = await Promise.race([
              signer.getPublicKey(),
              healthTimeout
            ]) as string;

            // Verify it matches stored session
            if (pubkey !== ncSession.pubkey) {
              debug('[Auth] NostrConnect pubkey mismatch, clearing session');
              signer.close();
              clearSession('nostrconnect');
              return { success: false, error: 'NostrConnect signer pubkey mismatch' };
            }

            // Success! Complete authentication
            setUser({
              isAnon: false,
              pubkey: ncSession.pubkey,
              signer,
              authMethod: 'nostrconnect',
            });

            await fetchUserData(ncSession.pubkey);
            debug('[Auth] NostrConnect session restored successfully');
            return { success: true, method: 'nostrconnect' };
          } catch (error: any) {
            debug('[Auth] NostrConnect health check failed:', error.message);
            clearSession('nostrconnect');
            return { success: false, error: `NostrConnect unavailable: ${error.message}` };
          }
        }

        case 'bunker': {
          try {
            const bunkerSession = session as BunkerSession;

            // Attempt to reconnect to bunker with timeout
            const connectTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Bunker connection timeout')), 10000)
            );

            const signer = await Promise.race([
              NostrConnectSigner.fromBunkerURI(bunkerSession.bunkerUri, {
                permissions: NostrConnectSigner.buildSigningPermissions([0, 1, 3, 6, 7]),
              }),
              connectTimeout
            ]) as NostrConnectSigner;

            // Health check: Try to get public key
            const healthTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Health check timeout')), 5000)
            );

            const pubkey = await Promise.race([
              signer.getPublicKey(),
              healthTimeout
            ]) as string;

            // Verify it matches stored session
            if (pubkey !== bunkerSession.pubkey) {
              debug('[Auth] Bunker pubkey mismatch, clearing session');
              clearSession('bunker');
              return { success: false, error: 'Bunker signer pubkey mismatch' };
            }

            // Success! Complete authentication without saving again
            setUser({
              isAnon: false,
              pubkey: bunkerSession.pubkey,
              signer,
              authMethod: 'bunker',
            });

            await fetchUserData(bunkerSession.pubkey);
            debug('[Auth] Bunker session restored successfully');
            return { success: true, method: 'bunker' };
          } catch (error: any) {
            debug('[Auth] Bunker health check failed:', error.message);
            clearSession('bunker');
            return { success: false, error: `Bunker unavailable: ${error.message}` };
          }
        }

        default: {
          return { success: false, error: `Unknown auth method: ${(session as any).authMethod}` };
        }
      }
    } catch (error: any) {
      console.error('[Auth] Session restoration failed:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  };

  const logout = async () => {
    const currentUser = user();

    // PHASE 1: Cancel active mining session (exactly once) before any state changes
    try {
      // Check if MiningContext is available via dynamic import to avoid circular dependencies
      const { useMining } = await import('./MiningProvider');
      const miningContext = useMining();

      // Cancel mining if active
      if (miningContext.miningState().mining) {
        debug('[Auth] Cancelling active mining session before logout');
        miningContext.stopMining();
      }
    } catch (error) {
      debug('[Auth] Unable to access MiningProvider, continuing logout:', error);
      // Non-fatal: continue with logout even if we can't cancel mining
    }

    // Clear appropriate session storage
    if (currentUser?.authMethod === 'nostrconnect') {
      clearSession('nostrconnect');

      // Close the signer connection
      if (currentUser.signer && 'close' in currentUser.signer) {
        (currentUser.signer as NostrConnectSigner).close();
      }
    } else if (currentUser?.authMethod === 'extension') {
      clearSession('extension');
    } else if (currentUser?.authMethod === 'bunker') {
      clearSession('bunker');

      // Close the signer connection
      if (currentUser.signer && 'close' in currentUser.signer) {
        (currentUser.signer as NostrConnectSigner).close();
      }
    }

    // PHASE 1: Single-tick transition to anonymous mode
    // Don't set to null - transition directly to anon to avoid limbo state
    debug('[Auth] Transitioning to anonymous mode');
    authAnon();
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
        restoreNostrConnectSession,
        restoreSession,
        fetchUserData,
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
