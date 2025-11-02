/**
 * Unit tests for NostrConnect session storage (nostrconnect-storage.ts)
 * Tests NIP-46 session persistence for remote signers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveNostrConnectSession,
  loadNostrConnectSession,
  hasPersistedNostrConnectSession,
  clearNostrConnectSession,
  type NostrConnectSession,
} from '../lib/nostrconnect-storage';

describe('nostrconnect-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const createMockSession = (): NostrConnectSession => ({
    clientSecret: '0102030a0bff' + '00'.repeat(26), // 32 bytes as hex
    remotePubkey: 'remote_' + 'a'.repeat(56),
    userPubkey: 'user_' + 'b'.repeat(58),
    relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
    secret: 'shared_secret_' + 'c'.repeat(16),
  });

  describe('saveNostrConnectSession', () => {
    it('should save session to localStorage', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);

      const stored = localStorage.getItem('notemine:nostrconnect');
      expect(stored).toBeDefined();
      expect(stored).not.toBeNull();
    });

    it('should serialize all session fields', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);

      const stored = JSON.parse(localStorage.getItem('notemine:nostrconnect')!);
      expect(stored.clientSecret).toBe(session.clientSecret);
      expect(stored.remotePubkey).toBe(session.remotePubkey);
      expect(stored.userPubkey).toBe(session.userPubkey);
      expect(stored.relays).toEqual(session.relays);
      expect(stored.secret).toBe(session.secret);
    });

    it('should overwrite existing session', () => {
      const session1 = createMockSession();
      const session2 = {
        ...createMockSession(),
        userPubkey: 'different_user',
      };

      saveNostrConnectSession(session1);
      saveNostrConnectSession(session2);

      const loaded = loadNostrConnectSession();
      expect(loaded?.userPubkey).toBe('different_user');
    });

    it('should handle empty relay list', () => {
      const session = { ...createMockSession(), relays: [] };
      saveNostrConnectSession(session);

      const loaded = loadNostrConnectSession();
      expect(loaded?.relays).toEqual([]);
    });

    it('should handle multiple relays', () => {
      const session = {
        ...createMockSession(),
        relays: [
          'wss://relay1.com',
          'wss://relay2.com',
          'wss://relay3.com',
          'wss://relay4.com',
        ],
      };
      saveNostrConnectSession(session);

      const loaded = loadNostrConnectSession();
      expect(loaded?.relays).toHaveLength(4);
    });
  });

  describe('loadNostrConnectSession', () => {
    it('should load session from localStorage', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);

      const loaded = loadNostrConnectSession();
      expect(loaded).toEqual(session);
    });

    it('should return null when no session exists', () => {
      const loaded = loadNostrConnectSession();
      expect(loaded).toBeNull();
    });

    it('should handle corrupted JSON gracefully', () => {
      localStorage.setItem('notemine:nostrconnect', 'invalid{json');

      const loaded = loadNostrConnectSession();
      expect(loaded).toBeNull();
    });

    it('should handle empty string', () => {
      localStorage.setItem('notemine:nostrconnect', '');

      const loaded = loadNostrConnectSession();
      expect(loaded).toBeNull();
    });

    it('should handle missing fields gracefully', () => {
      const partial = {
        clientSecret: '0102',
        remotePubkey: 'remote',
        // Missing other fields
      };
      localStorage.setItem('notemine:nostrconnect', JSON.stringify(partial));

      const loaded = loadNostrConnectSession();
      expect(loaded).toBeDefined();
      expect(loaded?.clientSecret).toBe('0102');
      expect(loaded?.remotePubkey).toBe('remote');
    });
  });

  describe('hasPersistedNostrConnectSession', () => {
    it('should return false when no session exists', () => {
      expect(hasPersistedNostrConnectSession()).toBe(false);
    });

    it('should return true when session exists', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);

      expect(hasPersistedNostrConnectSession()).toBe(true);
    });

    it('should return true even for corrupted data', () => {
      localStorage.setItem('notemine:nostrconnect', 'corrupted');
      expect(hasPersistedNostrConnectSession()).toBe(true);
    });

    it('should return false after clearing', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);
      clearNostrConnectSession();

      expect(hasPersistedNostrConnectSession()).toBe(false);
    });
  });

  describe('clearNostrConnectSession', () => {
    it('should remove session from localStorage', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);

      clearNostrConnectSession();
      expect(hasPersistedNostrConnectSession()).toBe(false);
    });

    it('should be safe to call when no session exists', () => {
      expect(() => clearNostrConnectSession()).not.toThrow();
    });

    it('should not affect other localStorage keys', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);
      localStorage.setItem('other-key', 'value');

      clearNostrConnectSession();

      expect(localStorage.getItem('notemine:nostrconnect')).toBeNull();
      expect(localStorage.getItem('other-key')).toBe('value');
    });
  });

  describe('session integrity', () => {
    it('should preserve exact hex format of clientSecret', () => {
      const session = createMockSession();
      const originalSecret = session.clientSecret;

      saveNostrConnectSession(session);
      const loaded = loadNostrConnectSession();

      expect(loaded?.clientSecret).toBe(originalSecret);
      expect(loaded?.clientSecret).toHaveLength(originalSecret.length);
    });

    it('should preserve relay URLs exactly', () => {
      const session = {
        ...createMockSession(),
        relays: [
          'wss://relay.example.com:443',
          'wss://relay.test.com/path?query=1',
        ],
      };

      saveNostrConnectSession(session);
      const loaded = loadNostrConnectSession();

      expect(loaded?.relays).toEqual(session.relays);
    });

    it('should round-trip session data correctly', () => {
      const session = createMockSession();

      saveNostrConnectSession(session);
      const loaded = loadNostrConnectSession();

      expect(loaded).toEqual(session);
    });
  });

  describe('security considerations', () => {
    it('should store sensitive data in localStorage (not secure, but functional)', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);

      const stored = localStorage.getItem('notemine:nostrconnect');
      const parsed = JSON.parse(stored!);

      // Verify sensitive data is present (this is by design, localStorage is the mechanism)
      expect(parsed.clientSecret).toBeDefined();
      expect(parsed.secret).toBeDefined();
    });

    it('should not expose raw binary data', () => {
      const session = createMockSession();
      saveNostrConnectSession(session);

      const stored = localStorage.getItem('notemine:nostrconnect');
      // Should be valid JSON, not binary
      expect(() => JSON.parse(stored!)).not.toThrow();
    });

    it('should handle special characters in pubkeys', () => {
      const session = {
        ...createMockSession(),
        userPubkey: 'test_pubkey_with_"quotes"_and_\\backslashes',
      };

      saveNostrConnectSession(session);
      const loaded = loadNostrConnectSession();

      expect(loaded?.userPubkey).toBe(session.userPubkey);
    });
  });
});
