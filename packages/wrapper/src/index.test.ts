import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Notemine } from './index.js';
import { Observable } from 'rxjs';

describe('Notemine', () => {
  let miner: Notemine;

  beforeEach(() => {
    miner = new Notemine({
      content: 'Test content',
      pubkey: 'testpublickey',
      difficulty: 20,
      numberOfWorkers: 2,
    });
  });

  it('should initialize with default values', () => {
    expect(miner.mining$.getValue()).toBe(false);
    expect(miner.cancelled$.getValue()).toBe(false);
    expect(miner.result$.getValue()).toBeNull();
  });

  it('should set content', () => {
    miner.content = 'New content';
    expect((miner as any).content).toBe('New content');
  });

  it('should set tags', () => {
    miner.tags = [['tag1', 'value1']];
    expect((miner as any).tags).toEqual(expect.arrayContaining(
      [
        ['tag1', 'value1']
      ]
    ));

  });

  it('should set public key', () => {
    miner.pubkey = 'newpublickey'
    expect((miner as any).pubkey).toBe('newpublickey');
  });

  it('should start mining', () => {
    miner.mine();
    expect(miner.mining$.getValue()).toBe(true);
  });

  it('should cancel mining', () => {
    miner.mine();
    expect(miner.mining$.getValue()).toBe(true);
    miner.cancel();
    expect(miner.mining$.getValue()).toBe(false);
    expect(miner.cancelled$.getValue()).toBe(true);
  });

  it('should emit progress events', (done:any) => {
    const progressSpy = vi.fn();
    const subscription = miner.progress$.subscribe(progressSpy);

    miner.mine();

    // Simulate a progress event
    setTimeout(() => {
      expect(progressSpy).toHaveBeenCalled();
      subscription.unsubscribe();
      miner.cancel();
    }, 100);
  });

  it('should handle mining success', (done: any) => {
    const successSpy = vi.fn();
    miner.success$.subscribe((success) => {
      successSpy(success);
      expect(success.result).toBeDefined();
      expect(miner.mining).toBe(false);
    });

    // Since we cannot actually mine without the WASM and worker setup,
    // we need to simulate a successful mining operation.
    // For this test, you would need to mock the worker and WASM interactions.

    // Simulate success after a short delay
    setTimeout(() => {
      miner['handleWorkerMessage']({
        data: {
          type: 'result',
          data: { event: {}, totalTime: 1.0, hashRate: 1000 },
          workerId: 0,
        },
      } as any);
    }, 100);
  });
});

// Phase 8 Unit Tests
describe('Phase 8 - Unit Tests', () => {
  describe('Tag Normalization', () => {
    it('should remove duplicate tags', () => {
      const miner = new Notemine({
        pubkey: 'test',
        difficulty: 20,
        tags: [
          ['tag1', 'value1'],
          ['tag1', 'value1'], // duplicate
          ['tag2', 'value2'],
        ],
      });

      const tags = miner.tags;

      // Should only have 3 tags: default 'miner' tag + 2 unique tags
      expect(tags.length).toBe(3);

      // Check that tag1/value1 appears exactly once (besides default tag)
      const tag1Count = tags.filter(t => t[0] === 'tag1' && t[1] === 'value1').length;
      expect(tag1Count).toBe(1);
    });

    it('should ensure default miner tag is present exactly once', () => {
      const miner1 = new Notemine({
        pubkey: 'test',
        difficulty: 20,
        tags: [['miner', 'notemine']],
      });

      const tags1 = miner1.tags;
      const minerTags1 = tags1.filter(t => t[0] === 'miner' && t[1] === 'notemine');
      expect(minerTags1.length).toBe(1);

      // Try to add the default tag again
      miner1.tags = [['miner', 'notemine']];
      const tags2 = miner1.tags;
      const minerTags2 = tags2.filter(t => t[0] === 'miner' && t[1] === 'notemine');
      expect(minerTags2.length).toBe(1);
    });

    it('should handle empty and invalid tags', () => {
      const miner = new Notemine({
        pubkey: 'test',
        difficulty: 20,
        tags: [
          [],  // empty array
          ['tag1'],  // valid single element
          ['tag2', 'value2'], // valid pair
        ],
      });

      const tags = miner.tags;

      // Empty array should be filtered out
      expect(tags.every(t => t.length > 0)).toBe(true);

      // Should have default miner tag + tag1 + tag2
      expect(tags.length).toBe(3);
    });
  });

  describe('created_at Stability', () => {
    it('should preserve created_at across getState/restoreState', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test content',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      // Manually set created_at
      const fixedTimestamp = 1234567890;
      (miner as any)._createdAt = fixedTimestamp;

      // Get state
      const state1 = miner.getState();
      expect(state1.event.created_at).toBe(fixedTimestamp);

      // Create new miner and restore
      const miner2 = new Notemine({
        pubkey: 'different',
        content: 'different content',
        difficulty: 25,
        numberOfWorkers: 4,
      });

      miner2.restoreState(state1);

      // created_at should be preserved
      expect((miner2 as any)._createdAt).toBe(fixedTimestamp);

      // Get state again - should still be the same
      const state2 = miner2.getState();
      expect(state2.event.created_at).toBe(fixedTimestamp);
    });

    it('should use current timestamp if created_at is not set', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test content',
        difficulty: 20,
      });

      // Don't set _createdAt
      const before = Math.floor(Date.now() / 1000);
      const state = miner.getState();
      const after = Math.floor(Date.now() / 1000);

      // Should be within reasonable range
      expect(state.event.created_at).toBeGreaterThanOrEqual(before);
      expect(state.event.created_at).toBeLessThanOrEqual(after);
    });
  });

  describe('Hash-rate Aggregator', () => {
    it('should aggregate hash rates from multiple workers', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 4,
      });

      // Start mining to initialize
      miner.mine();

      // Simulate hash rate updates from workers
      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 0,
          data: { currentNonce: '1000' },
          hashRate: 1000,
        },
      });

      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 1,
          data: { currentNonce: '2000' },
          hashRate: 1500,
        },
      });

      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 2,
          data: { currentNonce: '3000' },
          hashRate: 2000,
        },
      });

      // Total should be sum of all worker rates
      const totalHashRate = (miner as any)._totalHashRate;
      expect(totalHashRate).toBeGreaterThan(0);
      expect(totalHashRate).toBeLessThanOrEqual(1000 + 1500 + 2000);
    });

    it('should produce sane totals with sliding window', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      miner.mine();

      // Send multiple updates for same worker
      for (let i = 0; i < 10; i++) {
        (miner as any).handleWorkerMessage({
          data: {
            type: 'progress',
            workerId: 0,
            data: { currentNonce: `${i * 1000}` },
            hashRate: 1000 + i * 100, // Gradually increasing rate
          },
        });
      }

      const totalHashRate = (miner as any)._totalHashRate;

      // Should have a reasonable rate (not NaN, not negative, not extremely high)
      expect(totalHashRate).toBeGreaterThan(0);
      expect(totalHashRate).toBeLessThan(100000); // Sanity check: less than 100 MH/s
      expect(Number.isFinite(totalHashRate)).toBe(true);
    });

    it('should handle zero and missing hash rates gracefully', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      miner.mine();

      // Send update with zero hash rate
      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 0,
          data: { currentNonce: '1000' },
          hashRate: 0,
        },
      });

      // Send update without hash rate
      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 1,
          data: { currentNonce: '2000' },
        },
      });

      const totalHashRate = (miner as any)._totalHashRate;

      // Should not crash and should be a valid number
      expect(Number.isFinite(totalHashRate)).toBe(true);
      expect(totalHashRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Guarded Persistence', () => {
    it('should not persist default nonce arrays', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 4,
      });

      // Get state without any mining (all nonces are defaults: "0", "1", "2", "3")
      const state = miner.getState();

      // Should return empty nonce array for default nonces
      expect(state.workerNonces).toEqual([]);
    });

    it('should persist real nonces', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      miner.mine();

      // Simulate real nonces from workers
      (miner as any)._workerNonces.set(0, '123456789');
      (miner as any)._workerNonces.set(1, '987654321');

      const state = miner.getState();

      // Should persist real nonces
      expect(state.workerNonces).toEqual(['123456789', '987654321']);
    });

    it('should persist mixed real and default nonces', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 3,
      });

      miner.mine();

      // Worker 0 has real nonce, workers 1 and 2 have defaults
      (miner as any)._workerNonces.set(0, '123456789');
      (miner as any)._workerNonces.set(1, '1'); // default
      (miner as any)._workerNonces.set(2, '2'); // default

      const state = miner.getState();

      // Should persist all nonces because at least one is real
      expect(state.workerNonces.length).toBe(3);
      expect(state.workerNonces[0]).toBe('123456789');
    });
  });
});
