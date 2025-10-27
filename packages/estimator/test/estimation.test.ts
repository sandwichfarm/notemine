import { describe, it, expect } from 'vitest';
import { estimate, severity } from '../src/estimation.js';
import type { Calibration } from '../src/types.js';

const cal: Calibration = {
  a: 1e-7, // 0.1us base
  b: 5e-10, // 0.5ns per byte
  c: 1e-7, // 0.1us per tag
  eff: { 1: 1, 2: 0.9, 4: 0.8 },
  algo: 'sha256',
  cpu: 'test',
  at: Date.now(),
  version: 1,
};

describe('estimation', () => {
  it('monotonic with bytes and tags', () => {
    const base = estimate({ bytes: 100, tags: 0, bits: 10, threads: 1, cal });
    const moreBytes = estimate({ bytes: 1000, tags: 0, bits: 10, threads: 1, cal });
    const moreTags = estimate({ bytes: 100, tags: 10, bits: 10, threads: 1, cal });
    expect(moreBytes.timeSec).toBeGreaterThan(base.timeSec);
    expect(moreTags.timeSec).toBeGreaterThan(base.timeSec);
  });

  it('faster with more threads subject to efficiency', () => {
    const t1 = estimate({ bytes: 2000, tags: 2, bits: 12, threads: 1, cal }).timeSec;
    const t2 = estimate({ bytes: 2000, tags: 2, bits: 12, threads: 2, cal }).timeSec;
    const t4 = estimate({ bytes: 2000, tags: 2, bits: 12, threads: 4, cal }).timeSec;
    expect(t2).toBeLessThan(t1);
    expect(t4).toBeLessThan(t2);
  });

  it('severity thresholds', () => {
    expect(severity(1).level).toBe('green');
    expect(severity(10).level).toBe('yellow');
    expect(severity(30).level).toBe('orange');
  });
});

