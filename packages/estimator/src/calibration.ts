import { buildSample } from './samples.js';
import { EPS, hiresNow, clamp } from './utils.js';
import { WebWorkerPool } from './threads/webPool.js';
import type { Calibration, CalibrateOptions } from './types.js';

async function probeRate1T(bytes: number, tags: number, durationMs: number, seed: number, opts: CalibrateOptions): Promise<number> {
  const { payload } = buildSample(bytes, tags, seed, opts.buildPayload);
  const attempt = opts.attempt;
  if (!attempt) throw new Error('attempt function required for main-thread probe');
  const start = hiresNow();
  let attempts = 0;
  const end = start + durationMs;
  let nonce = 0;
  const batch = 1024;
  while (hiresNow() < end) {
    for (let i = 0; i < batch; i++) { attempt(payload, nonce++); attempts++; }
  }
  const elapsed = (hiresNow() - start) / 1000;
  return attempts / Math.max(elapsed, EPS);
}

async function probeRateMT(bytes: number, tags: number, durationMs: number, seed: number, threads: number, opts: CalibrateOptions): Promise<number> {
  if (!opts.workerScriptUrl || !opts.attemptModuleUrl) return probeRate1T(bytes, tags, durationMs, seed, opts);
  const { payload } = buildSample(bytes, tags, seed, opts.buildPayload);
  const pool = new WebWorkerPool({ threads, workerUrl: opts.workerScriptUrl, attemptModuleUrl: opts.attemptModuleUrl });
  try {
    const rate = await pool.probe(payload, durationMs);
    await pool.destroy();
    return rate;
  } finally {
    await pool.destroy();
  }
}

export async function calibrate(opts: CalibrateOptions): Promise<Calibration> {
  const sizes = opts.sizes ?? [256, 4096, 16384];
  const tagSets = opts.tagSets ?? [0, 8, 24];
  const warmupMs = opts.warmupMs ?? 200;
  const probe1tMs = opts.probe1tMs ?? 400;
  const probeMtMs = opts.probeMtMs ?? 250;
  await probeRate1T(sizes[1], tagSets[1], warmupMs, 123, opts);

  const r0 = await probeRate1T(sizes[0], tagSets[0], probe1tMs, 123, opts);
  const r2 = await probeRate1T(sizes[2], tagSets[0], probe1tMs, 123, opts);
  const t0 = 1 / r0;
  const t2 = 1 / r2;
  const b = Math.max(0, (t2 - t0) / (sizes[2] - sizes[0]));
  const a = Math.max(0, t0 - b * sizes[0]);

  const rK0 = await probeRate1T(sizes[1], tagSets[0], probe1tMs, 123, opts);
  const rKh = await probeRate1T(sizes[1], tagSets[2], probe1tMs, 123, opts);
  const c = Math.max(0, (1 / rKh - 1 / rK0) / Math.max(1, tagSets[2]));

  const eff: Record<number, number> = {};
  const cores = typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency ? (navigator as any).hardwareConcurrency as number : 4;
  const candidates = opts.threadsToTest ?? [1, 2, 4, 8].filter((t) => t <= cores);
  const r1_mid = await probeRate1T(sizes[1], tagSets[1], probe1tMs, 123, opts);
  eff[1] = 1;
  for (const t of candidates) {
    const rt = await probeRateMT(sizes[1], tagSets[1], probeMtMs, 123, t, opts);
    const e = clamp(rt / (r1_mid * t), 0, 1);
    eff[t] = e;
  }

  const algo: 'sha256' = (opts.algo ?? 'sha256');
  return { a, b, c, eff, algo, cpu: opts.cpu, at: Date.now(), version: 1 };
}
