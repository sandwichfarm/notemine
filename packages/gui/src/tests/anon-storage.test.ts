/**
 * Unit tests for anonymous key storage (anon-storage.ts)
 * Tests localStorage persistence of anonymous user keys
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveAnonKey,
  loadAnonKey,
  hasPersistedAnonKey,
  clearAnonKey,
} from '../lib/anon-storage';

describe('anon-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveAnonKey', () => {
    it('should save Uint8Array as hex string', () => {
      const secret = new Uint8Array([0x01, 0x02, 0x03, 0x0a, 0x0b, 0xff]);
      saveAnonKey(secret);

      const stored = localStorage.getItem('notemine:anonKey');
      expect(stored).toBe('0102030a0bff');
    });

    it('should handle all-zero bytes correctly', () => {
      const secret = new Uint8Array([0x00, 0x00, 0x00]);
      saveAnonKey(secret);

      const stored = localStorage.getItem('notemine:anonKey');
      expect(stored).toBe('000000');
    });

    it('should handle 32-byte secret key', () => {
      const secret = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        secret[i] = i;
      }
      saveAnonKey(secret);

      const stored = localStorage.getItem('notemine:anonKey');
      expect(stored).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should overwrite existing key', () => {
      const secret1 = new Uint8Array([0x01, 0x02]);
      const secret2 = new Uint8Array([0xff, 0xee]);

      saveAnonKey(secret1);
      expect(localStorage.getItem('notemine:anonKey')).toBe('0102');

      saveAnonKey(secret2);
      expect(localStorage.getItem('notemine:anonKey')).toBe('ffee');
    });

    it('should handle empty array', () => {
      const secret = new Uint8Array([]);
      saveAnonKey(secret);

      const stored = localStorage.getItem('notemine:anonKey');
      // Empty array converts to empty string, which is stored
      expect(stored).not.toBeNull();
      expect(stored).toBe('');
    });
  });

  describe('loadAnonKey', () => {
    it('should load hex string as Uint8Array', () => {
      localStorage.setItem('notemine:anonKey', '0102030a0bff');

      const loaded = loadAnonKey();
      expect(loaded).toBeInstanceOf(Uint8Array);
      expect(Array.from(loaded!)).toEqual([0x01, 0x02, 0x03, 0x0a, 0x0b, 0xff]);
    });

    it('should return null when no key exists', () => {
      const loaded = loadAnonKey();
      expect(loaded).toBeNull();
    });

    it('should handle all-zero bytes', () => {
      localStorage.setItem('notemine:anonKey', '000000');

      const loaded = loadAnonKey();
      expect(Array.from(loaded!)).toEqual([0x00, 0x00, 0x00]);
    });

    it('should correctly decode 32-byte key', () => {
      let hex = '';
      for (let i = 0; i < 32; i++) {
        hex += i.toString(16).padStart(2, '0');
      }
      localStorage.setItem('notemine:anonKey', hex);

      const loaded = loadAnonKey();
      expect(loaded).toHaveLength(32);
      for (let i = 0; i < 32; i++) {
        expect(loaded![i]).toBe(i);
      }
    });

    it('should handle empty string', () => {
      localStorage.setItem('notemine:anonKey', '');

      const loaded = loadAnonKey();
      // Empty string results in null (no valid data)
      expect(loaded).toBeNull();
    });

    it('should round-trip save/load correctly', () => {
      const original = new Uint8Array(32);
      crypto.getRandomValues(original);

      saveAnonKey(original);
      const loaded = loadAnonKey();

      expect(loaded).toEqual(original);
    });
  });

  describe('hasPersistedAnonKey', () => {
    it('should return false when no key exists', () => {
      expect(hasPersistedAnonKey()).toBe(false);
    });

    it('should return true when key exists', () => {
      localStorage.setItem('notemine:anonKey', '0102030a0bff');
      expect(hasPersistedAnonKey()).toBe(true);
    });

    it('should return false for empty string', () => {
      localStorage.setItem('notemine:anonKey', '');
      // Empty string is not a valid key, should return false
      expect(hasPersistedAnonKey()).toBe(false);
    });

    it('should return false after clearing', () => {
      localStorage.setItem('notemine:anonKey', '0102030a0bff');
      localStorage.removeItem('notemine:anonKey');
      expect(hasPersistedAnonKey()).toBe(false);
    });
  });

  describe('clearAnonKey', () => {
    it('should remove key from localStorage', () => {
      localStorage.setItem('notemine:anonKey', '0102030a0bff');
      expect(hasPersistedAnonKey()).toBe(true);

      clearAnonKey();
      expect(hasPersistedAnonKey()).toBe(false);
    });

    it('should be safe to call when no key exists', () => {
      expect(() => clearAnonKey()).not.toThrow();
      expect(hasPersistedAnonKey()).toBe(false);
    });

    it('should not affect other localStorage keys', () => {
      localStorage.setItem('notemine:anonKey', '0102');
      localStorage.setItem('other-key', 'value');

      clearAnonKey();

      expect(localStorage.getItem('notemine:anonKey')).toBeNull();
      expect(localStorage.getItem('other-key')).toBe('value');
    });
  });

  describe('security considerations', () => {
    it('should not store plaintext private keys', () => {
      const secret = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      saveAnonKey(secret);

      const stored = localStorage.getItem('notemine:anonKey');
      // Verify it's hex encoded, not raw bytes
      expect(stored).toBe('deadbeef');
      expect(stored).not.toContain(String.fromCharCode(0xde));
    });

    it('should handle special characters in hex without issues', () => {
      const secret = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);
      saveAnonKey(secret);

      const loaded = loadAnonKey();
      expect(loaded).toEqual(secret);
    });
  });
});
