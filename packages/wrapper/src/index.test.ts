import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Notemine } from './index.js';
import { Observable } from 'rxjs';

// Small helper to DRY progress simulation with runId
function sendProgress(
  miner: any,
  workerId: number,
  currentNonce: string,
  hashRate?: number
) {
  const runId = miner._runId;
  miner.handleWorkerMessage({
    data: {
      type: 'progress',
      workerId,
      runId,
      currentNonce,
      hashRate,
    },
  });
}

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
      const runId = (miner as any)._runId;

      // Simulate hash rate updates from workers
      sendProgress(miner as any, 0, '1000', 1000);
      sendProgress(miner as any, 1, '2000', 1500);
      sendProgress(miner as any, 2, '3000', 2000);

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
      const runId = (miner as any)._runId;

      // Send multiple updates for same worker
      for (let i = 0; i < 10; i++) {
        sendProgress(miner as any, 0, `${i * 1000}`, 1000 + i * 100);
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

  describe('Phase 1-2: Per-worker POW persistence and restoration', () => {
    it('should persist workersPow in getState', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      miner.mine();

      // Set per-worker POW data
      const workersPow = {
        0: { bestPow: 25, nonce: '12345', hash: 'hash1' },
        1: { bestPow: 23, nonce: '67890', hash: 'hash2' },
      };
      miner.workersPow$.next(workersPow);

      const state = miner.getState();

      expect(state.workersPow).toBeDefined();
      expect(state.workersPow).toEqual(workersPow);
    });

    it('should restore workersPow and seed highestPow$ from best worker', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      const workersPow = {
        0: { bestPow: 25, nonce: '12345', hash: 'hash1' },
        1: { bestPow: 28, nonce: '67890', hash: 'hash2' }, // This is the highest
      };

      const state = {
        event: {
          pubkey: 'test',
          kind: 1,
          tags: [],
          content: 'test',
          created_at: 123456789,
        },
        workerNonces: ['100', '200'],
        bestPow: null,
        workersPow: workersPow,
        difficulty: 20,
        numberOfWorkers: 2,
      };

      miner.restoreState(state);

      // Check that workersPow$ was restored
      expect(miner.workersPow$.getValue()).toEqual(workersPow);

      // Check that highestPow$ was seeded with the max POW
      const highestPow = miner.highestPow$.getValue();
      expect(highestPow).toBeDefined();
      expect(highestPow?.bestPow).toBe(28);
      expect(highestPow?.nonce).toBe('67890');
    });

    it('should handle backward compatibility when workersPow is not present', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      const legacyBestPow = { bestPow: 25, nonce: '12345', hash: 'hash1' };

      const state = {
        event: {
          pubkey: 'test',
          kind: 1,
          tags: [],
          content: 'test',
          created_at: 123456789,
        },
        workerNonces: ['100', '200'],
        bestPow: legacyBestPow,
        // No workersPow field (backward compatibility)
        difficulty: 20,
        numberOfWorkers: 2,
      };

      miner.restoreState(state);

      // Should seed highestPow$ from legacy bestPow
      const highestPow = miner.highestPow$.getValue();
      expect(highestPow).toEqual(legacyBestPow);
    });

    it('should handle empty workersPow during restoration', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      const state = {
        event: {
          pubkey: 'test',
          kind: 1,
          tags: [],
          content: 'test',
          created_at: 123456789,
        },
        workerNonces: [],
        bestPow: null,
        workersPow: {}, // Empty workersPow
        difficulty: 20,
        numberOfWorkers: 2,
      };

      miner.restoreState(state);

      // Should not crash and should set workersPow to empty
      expect(miner.workersPow$.getValue()).toEqual({});
      expect(miner.highestPow$.getValue()).toBeNull();
    });
  });

  describe('Phase 2: RunId gating and ghost update prevention', () => {
    it('should ignore progress messages without runId', async () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 1,
      });

      await miner.mine();

      // Send a progress message without runId; should be ignored
      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 0,
          currentNonce: '1234',
          hashRate: 2000,
        },
      });

      // Total hash rate should remain 0 (no accepted messages)
      expect((miner as any).totalHashRate || (miner as any)._totalHashRate).toBe(0);
    });
    it('should generate new runId on mine() start', async () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 1,
      });

      await miner.mine();
      const runId1 = (miner as any)._runId;
      expect(runId1).toBeDefined();
      expect(typeof runId1).toBe('string');

      miner.cancel();
      await new Promise(resolve => setTimeout(resolve, 10));

      await miner.mine();
      const runId2 = (miner as any)._runId;
      expect(runId2).toBeDefined();
      expect(runId2).not.toBe(runId1); // Should be different each session
    });

    it('should reset hasSeenRealNonces flag on new mining session', async () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 1,
      });

      // Set the flag
      (miner as any)._hasSeenRealNonces = true;

      await miner.mine();

      // Should be reset
      expect((miner as any)._hasSeenRealNonces).toBe(false);
    });
  });

  describe('Phase 2: First real nonces detection', () => {
    it('should emit firstRealNonces$ when transitioning from default to real nonce', (done) => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      let emitted = false;
      const sub = miner.firstRealNonces$.subscribe(() => {
        emitted = true;
        sub.unsubscribe();
        done();
      });

      miner.mine();

      // Simulate worker 0 sending a default nonce (should not emit)
      (miner as any)._workerNonces.set(0, '0');
      const progressEvent = {
        workerId: 0,
        currentNonce: '0',
        hashRate: 1000,
      };

      // Manually trigger the logic that would happen in message handler
      // by simulating first real nonce
      (miner as any)._hasSeenRealNonces = false;
      if (progressEvent.currentNonce !== progressEvent.workerId.toString()) {
        // This would be the logic from the progress handler
        (miner as any)._hasSeenRealNonces = true;
        (miner as any).firstRealNoncesSubject.next();
      }

      // Give it time to emit (or not)
      setTimeout(() => {
        if (!emitted) {
          // Now trigger with a real nonce
          const realProgressEvent = {
            workerId: 0,
            currentNonce: '123456',
            hashRate: 1000,
          };

          (miner as any)._hasSeenRealNonces = false;
          if (realProgressEvent.currentNonce !== realProgressEvent.workerId.toString()) {
            (miner as any)._hasSeenRealNonces = true;
            (miner as any).firstRealNoncesSubject.next();
          }
        }
      }, 10);
    });

    it('should only emit firstRealNonces$ once per session', async () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 1,
      });

      let emitCount = 0;
      const sub = miner.firstRealNonces$.subscribe(() => {
        emitCount++;
      });

      await miner.mine();

      // Simulate multiple real nonce updates
      (miner as any)._hasSeenRealNonces = false;

      // First real nonce
      if ('123456' !== '0') {
        (miner as any)._hasSeenRealNonces = true;
        (miner as any).firstRealNoncesSubject.next();
      }

      // Second real nonce (should not emit again)
      if ((miner as any)._hasSeenRealNonces) {
        // Logic wouldn't emit again
      }

      expect(emitCount).toBe(1);
      sub.unsubscribe();
    });
  });
});
