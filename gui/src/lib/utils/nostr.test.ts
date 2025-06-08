import { describe, it, expect } from 'vitest';
import { extractPowDifficulty, calculateDecayScore } from './nostr';
import type { NostrEvent } from '$lib/types';

describe('extractPowDifficulty', () => {
  it('should extract difficulty from nonce tag', () => {
    const event: NostrEvent = {
      id: '000000test',
      pubkey: 'pubkey',
      created_at: 1234567890,
      kind: 1,
      tags: [['nonce', '123456', '21']],
      content: 'test',
      sig: 'sig'
    };

    expect(extractPowDifficulty(event)).toBe(21);
  });

  it('should return 0 if no nonce tag exists', () => {
    const event: NostrEvent = {
      id: 'test',
      pubkey: 'pubkey',
      created_at: 1234567890,
      kind: 1,
      tags: [],
      content: 'test',
      sig: 'sig'
    };

    expect(extractPowDifficulty(event)).toBe(0);
  });

  it('should handle malformed nonce tags', () => {
    const event: NostrEvent = {
      id: 'test',
      pubkey: 'pubkey',
      created_at: 1234567890,
      kind: 1,
      tags: [['nonce', '123456']], // Missing difficulty
      content: 'test',
      sig: 'sig'
    };

    expect(extractPowDifficulty(event)).toBe(0);
  });
});

describe('calculateDecayScore', () => {
  it('should calculate decay score correctly', () => {
    const now = Date.now() / 1000;
    const hourAgo = now - 3600;
    const decayRate = 0.1; // 10% per hour
    const cumulativePow = 10;

    const score = calculateDecayScore(hourAgo, decayRate, cumulativePow);
    
    // Should be approximately 90% of cumulative PoW
    expect(score).toBeCloseTo(9, 1);
  });

  it('should return 0 for very old events', () => {
    const now = Date.now() / 1000;
    const veryOld = now - 86400 * 365; // 1 year ago
    const decayRate = 0.1;
    const cumulativePow = 10;

    const score = calculateDecayScore(veryOld, decayRate, cumulativePow);
    
    expect(score).toBe(0);
  });

  it('should handle zero decay rate', () => {
    const now = Date.now() / 1000;
    const hourAgo = now - 3600;
    const decayRate = 0; // No decay
    const cumulativePow = 10;

    const score = calculateDecayScore(hourAgo, decayRate, cumulativePow);
    
    expect(score).toBe(cumulativePow);
  });

  it('should handle zero cumulative PoW', () => {
    const now = Date.now() / 1000;
    const hourAgo = now - 3600;
    const decayRate = 0.1;
    const cumulativePow = 0;

    const score = calculateDecayScore(hourAgo, decayRate, cumulativePow);
    
    expect(score).toBe(0);
  });
});