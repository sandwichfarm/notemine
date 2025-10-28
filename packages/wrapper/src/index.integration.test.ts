import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Notemine } from './index.js';
import type { MiningState } from './index.js';

describe('Phase 8 - Integration Tests', () => {
  describe('Lifecycle (mine → pause → resume → result)', () => {
    it('should complete full mine-pause-resume cycle', async () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test content',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      // Start mining
      const minePromise = miner.mine();
      expect(miner.mining$.getValue()).toBe(true);

      // Pause mining
      await miner.pause();
      expect(miner.mining$.getValue()).toBe(false);
      expect(miner.paused$.getValue()).toBe(true);

      // Resume mining
      await miner.resume();
      expect(miner.mining$.getValue()).toBe(true);
      expect(miner.paused$.getValue()).toBe(false);

      // Cancel to clean up
      miner.cancel();
      expect(miner.mining$.getValue()).toBe(false);
      expect(miner.cancelled$.getValue()).toBe(true);
    });

    it('should not accept ghost updates from old runId after cancel', async () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
        debug: true,
      });

      // Start mining and capture the runId
      const promise1 = miner.mine();
      const oldRunId = (miner as any)._runId;
      expect(oldRunId).toBeTruthy();

      // Cancel mining
      miner.cancel();
      expect(miner.mining$.getValue()).toBe(false);

      // Start new mining session - should have new runId
      const promise2 = miner.mine();
      const newRunId = (miner as any)._runId;
      expect(newRunId).toBeTruthy();
      expect(newRunId).not.toBe(oldRunId);

      // Simulate message from old session
      const oldBestPow = miner.highestPow$.getValue();

      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 0,
          runId: oldRunId, // Old session ID
          currentNonce: '999999',
          bestPowData: {
            bestPow: 999, // Should be ignored
            nonce: '999999',
            hash: 'fakehash',
          },
        },
      });

      // Best POW should not have been updated from ghost message
      const newBestPow = miner.highestPow$.getValue();
      expect(newBestPow).toBe(oldBestPow); // Unchanged

      miner.cancel();
    });

    it('should have valid runId throughout mining session', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
      });

      // No runId before mining
      expect((miner as any)._runId).toBeNull();

      // Start mining - should generate runId
      miner.mine();
      const runId1 = (miner as any)._runId;
      expect(runId1).toBeTruthy();
      expect(typeof runId1).toBe('string');
      expect(runId1.length).toBeGreaterThan(20); // UUID format

      // Pause and resume should keep same runId
      miner.pause();
      const runId2 = (miner as any)._runId;
      expect(runId2).toBe(runId1);

      miner.cancel();
    });
  });

  describe('Resume Fidelity', () => {
    it('should preserve nonces across pause/resume', async () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      // Start mining
      miner.mine();
      const runId = (miner as any)._runId;

      // Simulate workers reporting nonces via progress messages (while mining is active)
      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 0,
          runId,
          currentNonce: '123456',
        },
      });

      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 1,
          runId,
          currentNonce: '789012',
        },
      });

      // Verify nonces were captured
      expect((miner as any)._workerNonces.get(0)).toBe('123456');
      expect((miner as any)._workerNonces.get(1)).toBe('789012');

      // Pause
      await miner.pause();

      // Get state - should preserve the nonces
      const state = miner.getState();
      expect(state.workerNonces).toEqual(['123456', '789012']);

      // Create new miner to simulate fresh start
      const miner2 = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      // Restore state and start mining
      miner2.restoreState(state);

      // Verify resumeNonces were set from restored state
      expect((miner2 as any)._resumeNonces).toEqual(['123456', '789012']);

      miner.cancel();
      miner2.cancel();
    });

    it('should maintain monotonically increasing bestPow', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      miner.mine();

      // Simulate increasing POW discoveries
      const bestPows: number[] = [];

      for (let pow = 10; pow <= 25; pow++) {
        (miner as any).handleWorkerMessage({
          data: {
            type: 'progress',
            workerId: 0,
            runId: (miner as any)._runId,
            currentNonce: String(pow * 1000),
            bestPowData: {
              bestPow: pow,
              nonce: String(pow * 1000),
              hash: `hash${pow}`,
            },
          },
        });

        const current = miner.highestPow$.getValue();
        if (current) {
          bestPows.push(current.bestPow);
        }
      }

      // Verify monotonically increasing
      for (let i = 1; i < bestPows.length; i++) {
        expect(bestPows[i]).toBeGreaterThanOrEqual(bestPows[i - 1]);
      }

      miner.cancel();
    });

    it('should handle state persistence and restoration', () => {
      // Create miner and set state
      const miner1 = new Notemine({
        pubkey: 'pubkey1',
        content: 'content1',
        difficulty: 21,
        numberOfWorkers: 2,
      });

      miner1.mine();

      // Set real nonces
      (miner1 as any)._workerNonces.set(0, '100000');
      (miner1 as any)._workerNonces.set(1, '200000');

      // Set per-worker POW data
      miner1.workersPow$.next({
        0: { bestPow: 18, nonce: '100000', hash: 'testhash' },
        1: { bestPow: 16, nonce: '200000', hash: 'testhash2' },
      });

      // Set best POW (should match highest from workersPow)
      (miner1 as any).highestPow$.next({
        workerId: 0,
        bestPow: 18,
        nonce: '100000',
        hash: 'testhash',
      });

      // Get state
      const state = miner1.getState();

      // Create new miner and restore
      const miner2 = new Notemine({
        pubkey: 'different',
        content: 'different',
        difficulty: 15,
        numberOfWorkers: 4, // Different number of workers
      });

      miner2.restoreState(state);

      // Verify restored state
      expect(miner2.pubkey).toBe('pubkey1');
      expect(miner2.content).toBe('content1');
      expect(miner2.difficulty).toBe(21);
      expect((miner2 as any)._resumeNonces).toEqual(['100000', '200000']);

      const bestPow = miner2.highestPow$.getValue();
      expect(bestPow?.bestPow).toBe(18);
      expect(bestPow?.nonce).toBe('100000');
    });
  });

  describe('Worker Count Changes', () => {
    it('should handle redistribution when worker count increases', () => {
      // Save state with 2 workers
      const miner1 = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      miner1.mine();

      // Set nonces for 2 workers
      (miner1 as any)._workerNonces.set(0, '100000');
      (miner1 as any)._workerNonces.set(1, '200000');

      const state = miner1.getState();
      expect(state.workerNonces).toEqual(['100000', '200000']);

      // Restore with 4 workers
      const miner2 = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 4, // More workers
      });

      miner2.restoreState(state);

      // Resume nonces should be preserved
      expect((miner2 as any)._resumeNonces).toEqual(['100000', '200000']);

      // numberOfWorkers is updated
      expect(miner2.numberOfWorkers).toBe(4);
    });

    it('should handle redistribution when worker count decreases', () => {
      // Save state with 4 workers
      const miner1 = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 4,
      });

      miner1.mine();

      // Set nonces for 4 workers
      (miner1 as any)._workerNonces.set(0, '100000');
      (miner1 as any)._workerNonces.set(1, '200000');
      (miner1 as any)._workerNonces.set(2, '300000');
      (miner1 as any)._workerNonces.set(3, '400000');

      const state = miner1.getState();

      // Restore with 2 workers
      const miner2 = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2, // Fewer workers
      });

      miner2.restoreState(state);

      // Resume nonces should have all 4 original nonces
      expect((miner2 as any)._resumeNonces).toEqual(['100000', '200000', '300000', '400000']);

      // numberOfWorkers is updated
      expect(miner2.numberOfWorkers).toBe(2);

      // Note: Actual redistribution happens in the mine() logic
      // The wrapper will redistribute the nonces among fewer workers
    });

    it('should handle nonce redistribution with default and real nonces', () => {
      const miner1 = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 3,
      });

      miner1.mine();

      // Mix of real and default nonces
      (miner1 as any)._workerNonces.set(0, '500000'); // real
      (miner1 as any)._workerNonces.set(1, '1');      // default
      (miner1 as any)._workerNonces.set(2, '700000'); // real

      const state = miner1.getState();

      // Should persist because we have at least one real nonce
      expect(state.workerNonces.length).toBe(3);
      expect(state.workerNonces).toEqual(['500000', '1', '700000']);

      // Restore with different count
      const miner2 = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 4,
      });

      miner2.restoreState(state);
      expect((miner2 as any)._resumeNonces).toEqual(['500000', '1', '700000']);
    });
  });

  describe('RunId Gating Edge Cases', () => {
    it('should accept messages with valid runId', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      miner.mine();
      const currentRunId = (miner as any)._runId;

      // Send valid message
      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 0,
          runId: currentRunId,
          currentNonce: '12345',
          bestPowData: {
            bestPow: 15,
            nonce: '12345',
            hash: 'validhash',
          },
        },
      });

      // Should be accepted
      const bestPow = miner.highestPow$.getValue();
      expect(bestPow?.bestPow).toBe(15);

      miner.cancel();
    });

    it('should reject messages without runId (prevents ghost updates)', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
        numberOfWorkers: 2,
      });

      miner.mine();

      // Send message without runId (stale/cached worker)
      (miner as any).handleWorkerMessage({
        data: {
          type: 'progress',
          workerId: 0,
          // No runId field - should be rejected
          currentNonce: '67890',
          bestPowData: {
            bestPow: 12,
            nonce: '67890',
            hash: 'stalehash',
          },
        },
      });

      // Should be rejected - highestPow should still be null or empty object (initial state)
      const bestPow = miner.highestPow$.getValue();
      expect(bestPow?.bestPow).toBeUndefined();

      miner.cancel();
    });

    it('should generate unique runIds for each session', () => {
      const miner = new Notemine({
        pubkey: 'test',
        content: 'test',
        difficulty: 20,
      });

      const runIds = new Set<string>();

      // Generate multiple mining sessions
      for (let i = 0; i < 5; i++) {
        miner.mine();
        const runId = (miner as any)._runId;
        runIds.add(runId);
        miner.cancel();
      }

      // All runIds should be unique
      expect(runIds.size).toBe(5);
    });
  });
});
