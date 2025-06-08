import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  calculateCumulativePow, 
  calculateEventDecayScore,
  getEventOpacity,
  shouldEventBeVisible
} from './decay-engine';
import type { NostrEvent } from '$lib/types';

describe('Decay Engine', () => {
  const mockEvent: NostrEvent = {
    id: 'test1',
    pubkey: 'pubkey1',
    created_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    kind: 1,
    tags: [['nonce', '123', '20']],
    content: 'test',
    sig: 'sig'
  };

  const mockReply: NostrEvent = {
    id: 'reply1',
    pubkey: 'pubkey2',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [['nonce', '456', '18'], ['e', 'test1', '', 'reply']],
    content: 'reply',
    sig: 'sig'
  };

  const mockMention: NostrEvent = {
    id: 'mention1',
    pubkey: 'pubkey3',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [['nonce', '789', '19'], ['e', 'test1', '', 'mention']],
    content: 'mention',
    sig: 'sig'
  };

  describe('calculateCumulativePow', () => {
    it('should calculate base PoW correctly', () => {
      const pow = calculateCumulativePow(mockEvent);
      expect(pow).toBe(20); // Base difficulty from nonce tag
    });

    it('should include reply PoW with bonus', () => {
      const pow = calculateCumulativePow(mockEvent, [mockReply]);
      expect(pow).toBeGreaterThan(20); // Should include reply's PoW with bonus
    });

    it('should include mention PoW with bonus', () => {
      const pow = calculateCumulativePow(mockEvent, [], [mockMention]);
      expect(pow).toBeGreaterThan(20); // Should include mention's PoW with bonus
    });

    it('should accumulate multiple replies and mentions', () => {
      const pow = calculateCumulativePow(mockEvent, [mockReply], [mockMention]);
      expect(pow).toBeGreaterThan(20 + 18 + 19); // Should be greater than sum due to bonuses
    });
  });

  describe('calculateEventDecayScore', () => {
    it('should calculate decay score for recent event', () => {
      const recentEvent = {
        ...mockEvent,
        created_at: Math.floor(Date.now() / 1000) - 60 // 1 minute ago
      };
      const score = calculateEventDecayScore(recentEvent, 20);
      
      expect(score).toBeCloseTo(20, 1); // Should be close to cumulative PoW
    });

    it('should decay score for older events', () => {
      const oldEvent = {
        ...mockEvent,
        created_at: Math.floor(Date.now() / 1000) - 86400 // 24 hours ago
      };
      const score = calculateEventDecayScore(oldEvent, 20);
      
      expect(score).toBeLessThan(20); // Should be significantly less due to decay
    });

    it('should use custom decay settings', () => {
      const settings = {
        decayRate: 0.5, // 50% per hour - very fast decay
        zapWeight: 1,
        powWeight: 1,
        mentionPowBonus: 5
      };
      
      const score = calculateEventDecayScore(mockEvent, 20, settings);
      expect(score).toBeLessThan(10); // Should decay significantly with 50% per hour
    });
  });

  describe('shouldEventBeVisible', () => {
    it('should show events with high decay score', () => {
      const visible = shouldEventBeVisible(mockEvent, 10);
      expect(visible).toBe(true);
    });

    it('should hide events with very low decay score', () => {
      const visible = shouldEventBeVisible(mockEvent, 0.001);
      expect(visible).toBe(false);
    });

    it('should respect custom visibility threshold', () => {
      const visible = shouldEventBeVisible(mockEvent, 5, 10);
      expect(visible).toBe(false); // Score of 5 is below threshold of 10
    });
  });

  describe('getEventOpacity', () => {
    it('should return full opacity for high scores', () => {
      const opacity = getEventOpacity(150);
      expect(opacity).toBe(1);
    });

    it('should return minimum opacity for very low scores', () => {
      const opacity = getEventOpacity(1);
      expect(opacity).toBe(0.2);
    });

    it('should scale opacity between min and max', () => {
      const opacity = getEventOpacity(50);
      expect(opacity).toBeGreaterThan(0.2);
      expect(opacity).toBeLessThan(1);
    });

    it('should respect custom max opacity', () => {
      const opacity = getEventOpacity(200, 0.8);
      expect(opacity).toBe(0.8);
    });
  });
});