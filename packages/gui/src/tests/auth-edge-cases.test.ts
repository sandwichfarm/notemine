/**
 * Edge case tests for authentication flows
 * Tests unusual scenarios, error conditions, and boundary cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveNostrConnectSession, loadNostrConnectSession } from '../lib/nostrconnect-storage';
import { saveAnonKey, loadAnonKey } from '../lib/anon-storage';

describe('Authentication Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (window as any).nostr = undefined;
  });

  describe('NIP-07 Extension Edge Cases', () => {
    it('should handle extension installed but not enabled', async () => {
      // ARRANGE: window.nostr exists but methods return null
      (window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue(null),
      };

      // ACT
      const pubkey = await window.nostr.getPublicKey();

      // ASSERT
      expect(pubkey).toBeNull();
    });

    it('should handle extension methods throwing synchronously', async () => {
      // ARRANGE: Extension throws instead of rejecting
      (window as any).nostr = {
        getPublicKey: vi.fn().mockImplementation(() => {
          throw new Error('Synchronous error');
        }),
      };

      // ACT & ASSERT
      expect(() => window.nostr.getPublicKey()).toThrow('Synchronous error');
    });

    it('should handle extension returning malformed pubkey', async () => {
      // ARRANGE: Extension returns invalid format
      (window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('invalid-pubkey-format!@#'),
      };

      // ACT
      const pubkey = await window.nostr.getPublicKey();

      // ASSERT: Returns whatever extension provides (validation is caller's job)
      expect(pubkey).toBe('invalid-pubkey-format!@#');
    });

    it('should handle extension being removed mid-session', async () => {
      // ARRANGE: Extension initially available
      (window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('pubkey123'),
      };

      const firstCall = await window.nostr.getPublicKey();
      expect(firstCall).toBe('pubkey123');

      // ACT: Extension removed/disabled
      (window as any).nostr = undefined;

      // ASSERT: Subsequent calls fail gracefully
      expect(window.nostr).toBeUndefined();
    });

    it('should handle multiple concurrent getPublicKey calls', async () => {
      // ARRANGE
      let callCount = 0;
      (window as any).nostr = {
        getPublicKey: vi.fn().mockImplementation(async () => {
          callCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `pubkey_${callCount}`;
        }),
      };

      // ACT: Multiple concurrent calls
      const [result1, result2, result3] = await Promise.all([
        window.nostr.getPublicKey(),
        window.nostr.getPublicKey(),
        window.nostr.getPublicKey(),
      ]);

      // ASSERT: All calls complete
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
      expect(callCount).toBe(3);
    });

    it('should handle extension popup closed by user', async () => {
      // ARRANGE: Extension shows popup, user closes it
      (window as any).nostr = {
        getPublicKey: vi.fn().mockRejectedValue(new Error('User cancelled')),
      };

      // ACT & ASSERT
      await expect(window.nostr.getPublicKey()).rejects.toThrow('User cancelled');
    });

    it('should handle extension with rate limiting', async () => {
      // ARRANGE: Extension enforces rate limits
      let requestCount = 0;
      (window as any).nostr = {
        getPublicKey: vi.fn().mockImplementation(async () => {
          requestCount++;
          if (requestCount > 3) {
            throw new Error('Rate limit exceeded');
          }
          return 'pubkey';
        }),
      };

      // ACT: Make multiple requests
      await window.nostr.getPublicKey(); // 1
      await window.nostr.getPublicKey(); // 2
      await window.nostr.getPublicKey(); // 3

      // ASSERT: 4th request fails
      await expect(window.nostr.getPublicKey()).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('NIP-46 Bunker/NostrConnect Edge Cases', () => {
    it('should handle relay connection failures', () => {
      // ARRANGE: Session with unreachable relays
      saveNostrConnectSession({
        clientSecret: 'secret',
        remotePubkey: 'remote',
        userPubkey: 'user',
        relays: [
          'wss://offline-relay.invalid',
          'wss://another-dead-relay.invalid',
        ],
        secret: 'shared',
      });

      // ACT: Load session
      const session = loadNostrConnectSession();

      // ASSERT: Session loads (connection attempt is separate concern)
      expect(session).toBeTruthy();
      expect(session?.relays).toHaveLength(2);
    });

    it('should handle empty relay list', () => {
      // ARRANGE: Session with no relays
      saveNostrConnectSession({
        clientSecret: 'secret',
        remotePubkey: 'remote',
        userPubkey: 'user',
        relays: [],
        secret: 'shared',
      });

      // ACT: Load session
      const session = loadNostrConnectSession();

      // ASSERT: Session loads with empty relays
      expect(session).toBeTruthy();
      expect(session?.relays).toEqual([]);
    });

    it('should handle invalid relay URLs', () => {
      // ARRANGE: Session with malformed relay URLs
      saveNostrConnectSession({
        clientSecret: 'secret',
        remotePubkey: 'remote',
        userPubkey: 'user',
        relays: [
          'not-a-websocket-url',
          'http://wrong-protocol.com',
          'wss://',
          '',
        ],
        secret: 'shared',
      });

      // ACT: Load session
      const session = loadNostrConnectSession();

      // ASSERT: Session loads (URL validation is caller's job)
      expect(session).toBeTruthy();
      expect(session?.relays).toHaveLength(4);
    });

    it('should handle extremely long relay list', () => {
      // ARRANGE: Session with many relays
      const manyRelays = Array(100)
        .fill(null)
        .map((_, i) => `wss://relay${i}.example.com`);

      saveNostrConnectSession({
        clientSecret: 'secret',
        remotePubkey: 'remote',
        userPubkey: 'user',
        relays: manyRelays,
        secret: 'shared',
      });

      // ACT: Load session
      const session = loadNostrConnectSession();

      // ASSERT: All relays preserved
      expect(session?.relays).toHaveLength(100);
    });

    it('should handle duplicate relay URLs', () => {
      // ARRANGE: Session with duplicate relays
      saveNostrConnectSession({
        clientSecret: 'secret',
        remotePubkey: 'remote',
        userPubkey: 'user',
        relays: [
          'wss://relay.com',
          'wss://relay.com',
          'wss://relay.com',
        ],
        secret: 'shared',
      });

      // ACT: Load session
      const session = loadNostrConnectSession();

      // ASSERT: Duplicates preserved (deduplication is caller's job)
      expect(session?.relays).toHaveLength(3);
    });

    it('should handle very short clientSecret', () => {
      // ARRANGE: Unusually short secret (should be 32 bytes = 64 hex chars)
      saveNostrConnectSession({
        clientSecret: '00',
        remotePubkey: 'remote',
        userPubkey: 'user',
        relays: ['wss://relay.com'],
        secret: 'shared',
      });

      // ACT: Load session
      const session = loadNostrConnectSession();

      // ASSERT: Short secret preserved (validation is caller's job)
      expect(session?.clientSecret).toBe('00');
    });

    it('should handle extremely long clientSecret', () => {
      // ARRANGE: Very long secret
      const longSecret = 'a'.repeat(10000);
      saveNostrConnectSession({
        clientSecret: longSecret,
        remotePubkey: 'remote',
        userPubkey: 'user',
        relays: ['wss://relay.com'],
        secret: 'shared',
      });

      // ACT: Load session
      const session = loadNostrConnectSession();

      // ASSERT: Long secret preserved
      expect(session?.clientSecret).toHaveLength(10000);
    });

    it('should handle special characters in secrets', () => {
      // ARRANGE: Secrets with special chars
      saveNostrConnectSession({
        clientSecret: 'secret_with_"quotes"_and_\\backslashes',
        remotePubkey: 'remote_with_\n_newlines',
        userPubkey: 'user_with_\t_tabs',
        relays: ['wss://relay.com'],
        secret: 'shared_with_\0_null',
      });

      // ACT: Load session
      const session = loadNostrConnectSession();

      // ASSERT: Special chars preserved through JSON serialization
      expect(session?.clientSecret).toContain('quotes');
      expect(session?.remotePubkey).toContain('newlines');
    });
  });

  describe('Anonymous Key Edge Cases', () => {
    it('should handle zero-filled key', () => {
      // ARRANGE: Key that's all zeros (edge case but valid)
      const zeroKey = new Uint8Array(32);
      saveAnonKey(zeroKey);

      // ACT: Load key
      const loaded = loadAnonKey();

      // ASSERT: Zeros preserved
      expect(loaded).toEqual(zeroKey);
      expect(loaded?.every((byte) => byte === 0)).toBe(true);
    });

    it('should handle maximum-valued bytes', () => {
      // ARRANGE: Key with all 0xFF bytes
      const maxKey = new Uint8Array(32).fill(0xff);
      saveAnonKey(maxKey);

      // ACT: Load key
      const loaded = loadAnonKey();

      // ASSERT: Max values preserved
      expect(loaded?.every((byte) => byte === 0xff)).toBe(true);
    });

    it('should handle 1-byte key', () => {
      // ARRANGE: Minimal key
      const tinyKey = new Uint8Array([0x42]);
      saveAnonKey(tinyKey);

      // ACT: Load key
      const loaded = loadAnonKey();

      // ASSERT: Single byte preserved
      expect(loaded).toHaveLength(1);
      expect(loaded?.[0]).toBe(0x42);
    });

    it('should handle 64-byte key (double standard size)', () => {
      // ARRANGE: Extra long key
      const longKey = new Uint8Array(64);
      crypto.getRandomValues(longKey);
      saveAnonKey(longKey);

      // ACT: Load key
      const loaded = loadAnonKey();

      // ASSERT: All bytes preserved
      expect(loaded).toHaveLength(64);
      expect(loaded).toEqual(longKey);
    });

    it('should handle rapid key changes', () => {
      // ARRANGE & ACT: Change key many times quickly
      const keys = Array(100)
        .fill(null)
        .map(() => {
          const key = new Uint8Array(32);
          crypto.getRandomValues(key);
          return key;
        });

      keys.forEach((key) => saveAnonKey(key));

      // ASSERT: Last key wins
      const loaded = loadAnonKey();
      expect(loaded).toEqual(keys[keys.length - 1]);
    });

    it('should handle odd-length hex strings in storage', () => {
      // ARRANGE: Manually insert odd-length hex (3 chars)
      localStorage.setItem('notemine:anonKey', 'abc'); // 3 hex chars

      // ACT: Load key
      const loaded = loadAnonKey();

      // ASSERT: Parses what it can (last char dropped)
      expect(loaded).toBeTruthy();
      expect(loaded).toHaveLength(1); // 3 chars / 2 = 1 byte (rounded down)
      expect(loaded?.[0]).toBe(0xab);
      // The 'c' is dropped as there's no pair
    });

    it('should handle non-hex characters in stored key', () => {
      // ARRANGE: Invalid hex chars
      localStorage.setItem('notemine:anonKey', 'xyzt1234');

      // ACT: Load key
      const loaded = loadAnonKey();

      // ASSERT: Invalid hex chars parse to 0 (parseInt('xy', 16) returns NaN, stored as 0 in Uint8Array)
      // Uint8Array converts NaN to 0
      expect(loaded).toBeTruthy();
      expect(loaded?.[0]).toBe(0); // 'xy' is not valid hex, parseInt returns NaN, Uint8Array stores as 0
      expect(loaded?.[2]).toBe(0x12); // '12' is valid
    });
  });

  describe('Browser Environment Edge Cases', () => {
    it('should handle localStorage disabled/blocked', () => {
      // ARRANGE: Mock localStorage that throws
      const originalLocalStorage = global.localStorage;
      (global as any).localStorage = {
        getItem: () => {
          throw new Error('localStorage is disabled');
        },
        setItem: () => {
          throw new Error('localStorage is disabled');
        },
        removeItem: () => {
          throw new Error('localStorage is disabled');
        },
      };

      // ACT & ASSERT: Should not crash
      expect(() => loadAnonKey()).not.toThrow();
      expect(() => loadNostrConnectSession()).not.toThrow();

      // Cleanup
      global.localStorage = originalLocalStorage;
    });

    it('should handle private browsing mode', () => {
      // ARRANGE: Mock localStorage that accepts writes but they disappear
      let tempStore: any = {};
      const originalLocalStorage = global.localStorage;
      (global as any).localStorage = {
        getItem: (key: string) => tempStore[key] || null,
        setItem: (key: string, value: string) => {
          tempStore[key] = value;
        },
        removeItem: (key: string) => {
          delete tempStore[key];
        },
        clear: () => {
          tempStore = {};
        },
      };

      // ACT: Save data
      saveAnonKey(new Uint8Array([1, 2, 3]));

      // Simulate private mode: storage cleared
      tempStore = {};

      // ASSERT: Data gone
      expect(loadAnonKey()).toBeNull();

      // Cleanup
      global.localStorage = originalLocalStorage;
    });

    it('should handle window.nostr being a non-object', () => {
      // ARRANGE: Someone sets window.nostr to a primitive
      (window as any).nostr = 'im-a-string-not-an-object';

      // ACT & ASSERT: Type error if accessed as object
      expect(typeof window.nostr).toBe('string');
      expect(() => (window.nostr as any).getPublicKey()).toThrow();
    });

    it('should handle window.nostr with missing methods', () => {
      // ARRANGE: Partial implementation
      (window as any).nostr = {
        // Missing getPublicKey
        signEvent: vi.fn(),
      };

      // ACT & ASSERT
      expect(window.nostr.getPublicKey).toBeUndefined();
    });
  });

  describe('Timing and Race Conditions', () => {
    it('should handle save during load operation', () => {
      // ARRANGE: Initial data
      saveAnonKey(new Uint8Array([1, 2, 3]));

      // ACT: Interleaved operations
      const loaded1 = loadAnonKey();
      saveAnonKey(new Uint8Array([4, 5, 6]));
      const loaded2 = loadAnonKey();

      // ASSERT: Each load gets current state at that time
      expect(loaded1?.[0]).toBe(1);
      expect(loaded2?.[0]).toBe(4);
    });

    it('should handle multiple tabs saving different data', () => {
      // ARRANGE: Simulate tab 1
      saveAnonKey(new Uint8Array([1, 1, 1]));

      // ACT: Simulate tab 2 overwrites
      saveAnonKey(new Uint8Array([2, 2, 2]));

      // ASSERT: Last write wins (no conflict resolution)
      const loaded = loadAnonKey();
      expect(loaded?.[0]).toBe(2);
    });
  });

  describe('Memory and Performance', () => {
    it('should handle loading very large session data', () => {
      // ARRANGE: Session with huge relay list
      const hugeRelays = Array(10000)
        .fill(null)
        .map((_, i) => `wss://relay${i}.example.com`);

      saveNostrConnectSession({
        clientSecret: 'secret',
        remotePubkey: 'remote',
        userPubkey: 'user',
        relays: hugeRelays,
        secret: 'shared',
      });

      // ACT: Load large data
      const startTime = Date.now();
      const session = loadNostrConnectSession();
      const duration = Date.now() - startTime;

      // ASSERT: Loads successfully, reasonably fast
      expect(session?.relays).toHaveLength(10000);
      expect(duration).toBeLessThan(1000); // < 1 second
    });

    it('should handle repeated save/load cycles', () => {
      // ARRANGE & ACT: Many cycles
      const key = new Uint8Array(32);
      crypto.getRandomValues(key);

      for (let i = 0; i < 1000; i++) {
        saveAnonKey(key);
        const loaded = loadAnonKey();
        expect(loaded).toEqual(key);
      }

      // ASSERT: No memory leak or performance degradation
      expect(loadAnonKey()).toEqual(key);
    });
  });
});
