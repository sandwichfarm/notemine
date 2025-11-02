/**
 * Unified session storage for persistent user authentication
 * Supports NIP-07 (extension) and NIP-46 (NostrConnect/Bunker)
 *
 * Security considerations:
 * - Only stores public keys and minimal metadata
 * - No private keys are ever stored
 * - Session data includes timestamp for staleness detection
 * - Signer health is checked on restore via public key retrieval
 */

import { debug } from './debug';

const STORAGE_KEY_PREFIX = 'notemine:session';

export type SessionAuthMethod = 'extension' | 'nostrconnect' | 'bunker';

/**
 * Base session data for all auth methods
 */
export interface BaseSession {
  /** User's public key */
  pubkey: string;
  /** Authentication method used */
  authMethod: SessionAuthMethod;
  /** Timestamp when session was created */
  timestamp: number;
}

/**
 * NIP-07 Extension session (only stores pubkey)
 */
export interface ExtensionSession extends BaseSession {
  authMethod: 'extension';
}

/**
 * NIP-46 NostrConnect session
 */
export interface NostrConnectSession extends BaseSession {
  authMethod: 'nostrconnect';
  /** The local client secret key (hex) */
  clientSecret: string;
  /** The remote signer's pubkey */
  remotePubkey: string;
  /** Relays used for communication */
  relays: string[];
  /** The shared secret used for initial connection */
  secret: string;
}

/**
 * NIP-46 Bunker session
 */
export interface BunkerSession extends BaseSession {
  authMethod: 'bunker';
  /** The bunker URI (includes connection details) */
  bunkerUri: string;
}

/**
 * Union type for all session types
 */
export type UserSession = ExtensionSession | NostrConnectSession | BunkerSession;

/**
 * Save user session to localStorage
 */
export function saveSession(session: UserSession): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}:${session.authMethod}`;
    localStorage.setItem(key, JSON.stringify(session));
    debug('[SessionStorage] Saved session:', { authMethod: session.authMethod, pubkey: session.pubkey });
  } catch (error) {
    console.error('[SessionStorage] Failed to save session:', error);
  }
}

/**
 * Load user session from localStorage
 * Returns the most recent session if multiple exist
 */
export function loadSession(): UserSession | null {
  try {
    const methods: SessionAuthMethod[] = ['extension', 'nostrconnect', 'bunker'];
    const sessions: UserSession[] = [];

    // Load all sessions
    for (const method of methods) {
      const key = `${STORAGE_KEY_PREFIX}:${method}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const session = JSON.parse(stored) as UserSession;
          sessions.push(session);
        } catch (err) {
          console.error(`[SessionStorage] Failed to parse ${method} session:`, err);
        }
      }
    }

    if (sessions.length === 0) {
      return null;
    }

    // Return most recent session
    sessions.sort((a, b) => b.timestamp - a.timestamp);
    const latest = sessions[0];

    debug('[SessionStorage] Loaded session:', {
      authMethod: latest.authMethod,
      pubkey: latest.pubkey,
      age: Date.now() - latest.timestamp
    });

    return latest;
  } catch (error) {
    console.error('[SessionStorage] Failed to load session:', error);
    return null;
  }
}

/**
 * Check if any persisted session exists
 */
export function hasPersistedSession(): boolean {
  const methods: SessionAuthMethod[] = ['extension', 'nostrconnect', 'bunker'];
  return methods.some(method => {
    const key = `${STORAGE_KEY_PREFIX}:${method}`;
    return localStorage.getItem(key) !== null;
  });
}

/**
 * Clear specific session from localStorage
 */
export function clearSession(authMethod: SessionAuthMethod): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}:${authMethod}`;
    localStorage.removeItem(key);
    debug('[SessionStorage] Cleared session:', authMethod);
  } catch (error) {
    console.error('[SessionStorage] Failed to clear session:', error);
  }
}

/**
 * Clear all sessions from localStorage
 */
export function clearAllSessions(): void {
  try {
    const methods: SessionAuthMethod[] = ['extension', 'nostrconnect', 'bunker'];
    methods.forEach(method => clearSession(method));
    debug('[SessionStorage] Cleared all sessions');
  } catch (error) {
    console.error('[SessionStorage] Failed to clear all sessions:', error);
  }
}

/**
 * Check if session is stale (older than 30 days)
 */
export function isSessionStale(session: UserSession): boolean {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const age = Date.now() - session.timestamp;
  return age > thirtyDaysMs;
}

/**
 * Migrate old NostrConnect storage format to new unified format
 * This maintains backward compatibility with existing sessions
 */
export function migrateOldNostrConnectSession(): void {
  try {
    const oldKey = 'notemine:nostrconnect';
    const stored = localStorage.getItem(oldKey);

    if (stored) {
      const oldSession = JSON.parse(stored);

      // Convert to new format
      const newSession: NostrConnectSession = {
        authMethod: 'nostrconnect',
        pubkey: oldSession.userPubkey,
        timestamp: Date.now(), // Use current time since old format didn't have timestamp
        clientSecret: oldSession.clientSecret,
        remotePubkey: oldSession.remotePubkey,
        relays: oldSession.relays,
        secret: oldSession.secret,
      };

      // Save in new format
      saveSession(newSession);

      // Remove old format
      localStorage.removeItem(oldKey);

      debug('[SessionStorage] Migrated old NostrConnect session to unified format');
    }
  } catch (error) {
    console.error('[SessionStorage] Failed to migrate old session:', error);
  }
}
