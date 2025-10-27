import { describe, it, expect } from 'vitest';
import { calibrate } from '../src/calibration.js';

// Dummy attempt function that simulates sha256 work without crypto
function attempt(payload: any, nonce: number) {
  // Lightweight bit mix that depends on payload length and nonce
  let x = (payload?.len || 0) ^ nonce;
  x ^= (x << 13) | (x >>> 19);
  x = (x * 2654435761) >>> 0;
  return x;
}

function buildPayload(content: Uint8Array, tags: string[]) {
  // Match production shape superficially; estimator treats it as opaque
  return { len: content.length + tags.length * 8 };
}

describe('calibration', () => {
  it('computes non-negative coefficients and efficiency', async () => {
    const cal = await calibrate({ algo: 'sha256', cpu: 'test', buildPayload, attempt });
    expect(cal.a).toBeGreaterThanOrEqual(0);
    expect(cal.b).toBeGreaterThanOrEqual(0);
    expect(cal.c).toBeGreaterThanOrEqual(0);
    expect(cal.eff[1]).toBeDefined();
    expect(cal.algo).toBe('sha256');
  });
});

