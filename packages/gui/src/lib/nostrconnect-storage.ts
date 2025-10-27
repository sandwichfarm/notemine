/**
 * Local storage utilities for NostrConnect session persistence
 */

const STORAGE_KEY = 'notemine:nostrconnect';

export interface NostrConnectSession {
  /** The local client secret key (hex) */
  clientSecret: string;
  /** The remote signer's pubkey */
  remotePubkey: string;
  /** The user's pubkey */
  userPubkey: string;
  /** Relays used for communication */
  relays: string[];
  /** The shared secret used for initial connection */
  secret: string;
}

/**
 * Save NostrConnect session to localStorage
 * @param session - NostrConnect session details
 */
export function saveNostrConnectSession(session: NostrConnectSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('[NostrConnectStorage] Failed to save session:', error);
  }
}

/**
 * Load NostrConnect session from localStorage
 * @returns NostrConnect session or null if not found
 */
export function loadNostrConnectSession(): NostrConnectSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as NostrConnectSession;
  } catch (error) {
    console.error('[NostrConnectStorage] Failed to load session:', error);
    return null;
  }
}

/**
 * Check if a persisted NostrConnect session exists
 * @returns true if session exists in storage
 */
export function hasPersistedNostrConnectSession(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Clear persisted NostrConnect session from localStorage
 */
export function clearNostrConnectSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[NostrConnectStorage] Failed to clear session:', error);
  }
}
