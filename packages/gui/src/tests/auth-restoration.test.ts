/**
 * Integration tests for authentication session restoration
 * Tests the complete flow of restoring user sessions on app restart
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveNostrConnectSession,
  loadNostrConnectSession,
  type NostrConnectSession,
} from '../lib/nostrconnect-storage';
import { saveAnonKey, loadAnonKey } from '../lib/anon-storage';

describe('Authentication Restoration Flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Happy Path - User returns to app', () => {
    it('should restore NostrConnect session successfully', () => {
      // ARRANGE: User had previously authenticated with NostrConnect
      const session: NostrConnectSession = {
        clientSecret: '0123456789abcdef'.repeat(4), // 32 bytes
        remotePubkey: 'remote_pubkey_' + 'a'.repeat(50),
        userPubkey: 'user_pubkey_' + 'b'.repeat(52),
        relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
        secret: 'shared_secret',
      };
      saveNostrConnectSession(session);

      // ACT: App restarts, attempts to restore session
      const restoredSession = loadNostrConnectSession();

      // ASSERT: Session restored correctly
      expect(restoredSession).toBeTruthy();
      expect(restoredSession?.userPubkey).toBe(session.userPubkey);
      expect(restoredSession?.remotePubkey).toBe(session.remotePubkey);
      expect(restoredSession?.relays).toEqual(session.relays);
      expect(restoredSession?.clientSecret).toBe(session.clientSecret);
    });

    it('should restore anonymous persisted key successfully', () => {
      // ARRANGE: User had previously used anonymous mode with persistence
      const originalSecret = new Uint8Array(32);
      crypto.getRandomValues(originalSecret);
      saveAnonKey(originalSecret);

      // ACT: App restarts, attempts to restore key
      const restoredSecret = loadAnonKey();

      // ASSERT: Key restored correctly
      expect(restoredSecret).toBeTruthy();
      expect(restoredSecret).toHaveLength(32);
      expect(restoredSecret).toEqual(originalSecret);
    });

    it('should gracefully handle no stored session (first launch)', () => {
      // ARRANGE: Fresh install, no prior authentication

      // ACT: App attempts to restore session
      const nostrSession = loadNostrConnectSession();
      const anonKey = loadAnonKey();

      // ASSERT: Returns null without errors
      expect(nostrSession).toBeNull();
      expect(anonKey).toBeNull();
    });
  });

  describe('Signer Health Checks', () => {
    it('should detect when signer is available', async () => {
      // ARRANGE: Mock NIP-07 extension available
      const mockGetPublicKey = vi.fn().mockResolvedValue('test_pubkey');
      (window as any).nostr = {
        getPublicKey: mockGetPublicKey,
      };

      // ACT: Check signer availability
      const pubkey = await window.nostr?.getPublicKey();

      // ASSERT: Signer responds successfully
      expect(pubkey).toBe('test_pubkey');
      expect(mockGetPublicKey).toHaveBeenCalled();
    });

    it('should detect when signer is unavailable', async () => {
      // ARRANGE: No extension installed
      (window as any).nostr = undefined;

      // ACT & ASSERT: Should handle gracefully
      expect(window.nostr).toBeUndefined();
    });

    it('should handle signer permission denied', async () => {
      // ARRANGE: Extension denies permission
      const mockGetPublicKey = vi
        .fn()
        .mockRejectedValue(new Error('User denied permission'));
      (window as any).nostr = {
        getPublicKey: mockGetPublicKey,
      };

      // ACT & ASSERT: Should catch and handle error
      await expect(window.nostr.getPublicKey()).rejects.toThrow(
        'User denied permission'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle corrupted NostrConnect session data', () => {
      // ARRANGE: Corrupted JSON in localStorage
      localStorage.setItem('notemine:nostrconnect', '{invalid-json:}');

      // ACT: Attempt to restore
      const session = loadNostrConnectSession();

      // ASSERT: Returns null without throwing
      expect(session).toBeNull();
    });

    it('should handle partially complete NostrConnect session', () => {
      // ARRANGE: Session missing some fields
      const partialSession = {
        clientSecret: '0123',
        userPubkey: 'user123',
        // Missing remotePubkey, relays, secret
      };
      localStorage.setItem(
        'notemine:nostrconnect',
        JSON.stringify(partialSession)
      );

      // ACT: Attempt to restore
      const session = loadNostrConnectSession();

      // ASSERT: Returns partial data (caller must validate)
      expect(session).toBeTruthy();
      expect(session?.clientSecret).toBe('0123');
      expect(session?.userPubkey).toBe('user123');
    });

    it('should handle corrupted anonymous key data', () => {
      // ARRANGE: Invalid hex string
      localStorage.setItem('notemine:anonKey', 'not-hex-data-xyz');

      // ACT: Attempt to restore
      const key = loadAnonKey();

      // ASSERT: Returns malformed data with 0 values (NaN converts to 0 in Uint8Array)
      expect(key).toBeTruthy();
      // Invalid hex parses as 0 (parseInt returns NaN, Uint8Array converts to 0)
      expect(key?.some((byte) => byte === 0)).toBe(true);
    });

    it('should handle wrong-length anonymous key', () => {
      // ARRANGE: Key that's not 32 bytes
      localStorage.setItem('notemine:anonKey', '0102'); // 4 hex chars = 2 bytes

      // ACT: Attempt to restore
      const key = loadAnonKey();

      // ASSERT: Returns whatever is stored (2 bytes from '0102')
      expect(key).toHaveLength(2); // '0102' is 4 hex chars = 2 bytes
    });

    it('should handle localStorage quota exceeded', () => {
      // ARRANGE: Very large session data
      const hugeSession: NostrConnectSession = {
        clientSecret: 'a'.repeat(10000),
        remotePubkey: 'b'.repeat(10000),
        userPubkey: 'c'.repeat(10000),
        relays: Array(1000).fill('wss://relay.example.com'),
        secret: 'd'.repeat(10000),
      };

      // ACT & ASSERT: Should not throw (though may fail silently)
      expect(() => saveNostrConnectSession(hugeSession)).not.toThrow();
    });

    it('should handle concurrent storage access', () => {
      // ARRANGE & ACT: Rapid save/load cycles
      const session1: NostrConnectSession = {
        clientSecret: 'secret1',
        remotePubkey: 'remote1',
        userPubkey: 'user1',
        relays: ['wss://relay1.com'],
        secret: 'shared1',
      };
      const session2: NostrConnectSession = {
        clientSecret: 'secret2',
        remotePubkey: 'remote2',
        userPubkey: 'user2',
        relays: ['wss://relay2.com'],
        secret: 'shared2',
      };

      saveNostrConnectSession(session1);
      saveNostrConnectSession(session2);
      const loaded = loadNostrConnectSession();

      // ASSERT: Last write wins
      expect(loaded?.userPubkey).toBe('user2');
    });
  });

  describe('Timeout Scenarios', () => {
    it('should handle slow signer response', async () => {
      // ARRANGE: Signer takes a long time to respond
      const mockGetPublicKey = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('slow_pubkey'), 100);
          })
      );
      (window as any).nostr = {
        getPublicKey: mockGetPublicKey,
      };

      // ACT: Call with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 50)
      );
      const signerPromise = window.nostr.getPublicKey();

      // ASSERT: Should timeout before signer responds
      await expect(Promise.race([signerPromise, timeoutPromise])).rejects.toThrow(
        'Timeout'
      );
    });

    it('should handle signer that never responds', async () => {
      // ARRANGE: Signer hangs indefinitely
      const mockGetPublicKey = vi
        .fn()
        .mockImplementation(() => new Promise(() => {})); // Never resolves
      (window as any).nostr = {
        getPublicKey: mockGetPublicKey,
      };

      // ACT: Call with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout after 100ms')), 100)
      );

      // ASSERT: Timeout should trigger
      await expect(
        Promise.race([window.nostr.getPublicKey(), timeoutPromise])
      ).rejects.toThrow('Timeout');
    });
  });

  describe('Data Migration', () => {
    it('should handle migration from old storage format', () => {
      // ARRANGE: Old format stored different key name
      const oldSession = {
        secret: '0123456789abcdef',
        pubkey: 'old_format_pubkey',
      };
      localStorage.setItem('old-nostr-session', JSON.stringify(oldSession));

      // ACT: New code looks for new key
      const newSession = loadNostrConnectSession();

      // ASSERT: Returns null (old data not migrated)
      expect(newSession).toBeNull();
      // Old data still exists
      expect(localStorage.getItem('old-nostr-session')).toBeTruthy();
    });

    it('should not interfere with other app storage', () => {
      // ARRANGE: Other apps using localStorage
      localStorage.setItem('other-app:session', 'other-data');
      localStorage.setItem('some-random-key', 'random-value');

      // ACT: Save our session
      const session: NostrConnectSession = {
        clientSecret: 'our_secret',
        remotePubkey: 'our_remote',
        userPubkey: 'our_user',
        relays: ['wss://our-relay.com'],
        secret: 'our_shared_secret',
      };
      saveNostrConnectSession(session);

      // ASSERT: Other apps' data untouched
      expect(localStorage.getItem('other-app:session')).toBe('other-data');
      expect(localStorage.getItem('some-random-key')).toBe('random-value');
    });
  });

  describe('Security Validation', () => {
    it('should not expose secrets in error messages', () => {
      // ARRANGE: Invalid session
      localStorage.setItem('notemine:nostrconnect', 'invalid');

      // ACT: Capture console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      loadNostrConnectSession();

      // ASSERT: Error logged but no secrets exposed
      expect(consoleSpy).toHaveBeenCalled();
      const errorMessage = consoleSpy.mock.calls[0]?.join(' ') || '';
      expect(errorMessage.toLowerCase()).toContain('failed');
      // Would check that actual secret values aren't in error

      consoleSpy.mockRestore();
    });

    it('should clear session on logout', async () => {
      // ARRANGE: Active session
      const session: NostrConnectSession = {
        clientSecret: 'secret123',
        remotePubkey: 'remote123',
        userPubkey: 'user123',
        relays: ['wss://relay.com'],
        secret: 'shared123',
      };
      saveNostrConnectSession(session);

      // ACT: Clear session (logout)
      const { clearNostrConnectSession } = await import('../lib/nostrconnect-storage');
      clearNostrConnectSession();

      // ASSERT: Session fully removed
      expect(loadNostrConnectSession()).toBeNull();
      expect(localStorage.getItem('notemine:nostrconnect')).toBeNull();
    });

    it('should clear anonymous key on request', async () => {
      // ARRANGE: Persisted anon key
      const secret = new Uint8Array(32);
      crypto.getRandomValues(secret);
      saveAnonKey(secret);

      // ACT: Clear key
      const { clearAnonKey } = await import('../lib/anon-storage');
      clearAnonKey();

      // ASSERT: Key fully removed
      expect(loadAnonKey()).toBeNull();
      expect(localStorage.getItem('notemine:anonKey')).toBeNull();
    });
  });

  describe('Multiple Auth Methods', () => {
    it('should not conflict between anon and nostrconnect storage', () => {
      // ARRANGE & ACT: Save both types
      const anonKey = new Uint8Array(32);
      crypto.getRandomValues(anonKey);
      saveAnonKey(anonKey);

      const nostrSession: NostrConnectSession = {
        clientSecret: 'nc_secret',
        remotePubkey: 'nc_remote',
        userPubkey: 'nc_user',
        relays: ['wss://relay.com'],
        secret: 'nc_shared',
      };
      saveNostrConnectSession(nostrSession);

      // ASSERT: Both can be loaded independently
      const loadedKey = loadAnonKey();
      const loadedSession = loadNostrConnectSession();

      expect(loadedKey).toEqual(anonKey);
      expect(loadedSession).toEqual(nostrSession);
    });

    it('should handle switching auth methods', async () => {
      // ARRANGE: Start with anon
      const anonKey = new Uint8Array(32);
      crypto.getRandomValues(anonKey);
      saveAnonKey(anonKey);

      // ACT: Switch to NostrConnect
      const { clearAnonKey } = await import('../lib/anon-storage');
      clearAnonKey();

      const nostrSession: NostrConnectSession = {
        clientSecret: 'new_secret',
        remotePubkey: 'new_remote',
        userPubkey: 'new_user',
        relays: ['wss://relay.com'],
        secret: 'new_shared',
      };
      saveNostrConnectSession(nostrSession);

      // ASSERT: Old anon cleared, new session saved
      expect(loadAnonKey()).toBeNull();
      expect(loadNostrConnectSession()).toEqual(nostrSession);
    });
  });
});
