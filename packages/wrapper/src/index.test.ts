import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Notemine } from './index';
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
