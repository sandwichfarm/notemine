import { buildNip13Payload, probeNip13HashRate, initNip13 } from './adapter.js';
import { buildSample } from '../samples.js';
import { clamp, hiresNow } from '../utils.js';
import type { Calibration } from '../types.js';

/**
 * Options for NIP-13 specific calibration
 */
export interface Nip13CalibrateOptions {
  /**
   * Device/CPU identifier for caching calibration results.
   * Defaults to navigator.userAgent if available.
   * @example 'my-device-v1' or navigator.userAgent
   */
  cpu?: string;

  /**
   * URL to worker script for multi-threaded calibration.
   * If not provided, only single-threaded calibration will run.
   */
  workerScriptUrl?: string;

  /**
   * URL to attempt module for workers.
   * Should export attempt() and optionally init() functions.
   */
  attemptModuleUrl?: string;

  /**
   * Payload sizes to test during calibration (in bytes).
   * Default: [256, 4096, 16384] - covers small notes to large articles
   */
  sizes?: number[];

  /**
   * Number of tags to test during calibration.
   * Default: [0, 8, 24] - covers no tags to heavily tagged events
   */
  tagSets?: number[];

  /**
   * Thread counts to benchmark for efficiency measurement.
   * Default: [1, 2, 4, 8] filtered by navigator.hardwareConcurrency
   * @example [1, 2, 4] for a quad-core device
   */
  threadsToTest?: number[];

  /**
   * Warmup duration in milliseconds before calibration.
   * Allows JIT compilation to stabilize.
   * Default: 200ms
   */
  warmupMs?: number;

  /**
   * Duration for single-threaded probe measurements in milliseconds.
   * Default: 400ms
   */
  probe1tMs?: number;

  /**
   * Duration for multi-threaded probe measurements in milliseconds.
   * Default: 250ms
   */
  probeMtMs?: number;
}

/**
 * Calibrates the estimator for NIP-13 proof-of-work mining.
 *
 * Runs actual mine_event() with different payload sizes to measure this device's
 * NIP-13 mining characteristics:
 * - Base overhead per hash attempt (constant a)
 * - Cost per byte of content (coefficient b)
 * - Cost per tag (coefficient c)
 * - Multi-threading efficiency factors (currently single-threaded only)
 *
 * The calibration process takes approximately 1-3 seconds and should be:
 * - Run once per device/browser combination
 * - Cached in localStorage or similar persistence
 * - Re-run if hardware, browser, or performance characteristics change
 *
 * @param opts - Calibration options (all optional)
 * @returns Calibration data to use with estimate()
 *
 * @example
 * ```typescript
 * import { calibrateNip13, createLocalStoragePersistence } from '@notemine/estimator';
 *
 * // Calibrate and save
 * const cal = await calibrateNip13({
 *   cpu: 'my-device-id'
 * });
 *
 * const persistence = createLocalStoragePersistence();
 * await persistence.save('nip13-cal', cal);
 *
 * // Later, load and use
 * const savedCal = await persistence.load('nip13-cal');
 * if (savedCal) {
 *   const result = estimate({
 *     bytes: 1024,
 *     tags: 5,
 *     bits: 21,
 *     threads: 4,
 *     cal: savedCal
 *   });
 * }
 * ```
 */
export async function calibrateNip13(opts: Nip13CalibrateOptions = {}): Promise<Calibration> {
  // Initialize WASM before calibration
  await initNip13();

  // Determine CPU identifier
  const cpu = opts.cpu ||
    (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown');

  // Calibration parameters
  const sizes = opts.sizes ?? [256, 4096, 16384];
  const tagSets = opts.tagSets ?? [0, 8, 24];
  const warmupMs = opts.warmupMs ?? 200;
  const probeMs = opts.probe1tMs ?? 400;

  // Warmup
  const { payload: warmupPayload } = buildSample(sizes[1], tagSets[1], 123, buildNip13Payload);
  await probeNip13HashRate(warmupPayload, warmupMs);

  // Probe different sizes to determine byte cost
  const { payload: p0 } = buildSample(sizes[0], tagSets[0], 123, buildNip13Payload);
  const { payload: p2 } = buildSample(sizes[2], tagSets[0], 123, buildNip13Payload);

  const r0 = await probeNip13HashRate(p0, probeMs);
  const r2 = await probeNip13HashRate(p2, probeMs);

  const t0 = 1 / r0;
  const t2 = 1 / r2;
  const b = Math.max(0, (t2 - t0) / (sizes[2] - sizes[0]));
  const a = Math.max(0, t0 - b * sizes[0]);

  // Probe different tag counts to determine tag cost
  const { payload: pK0 } = buildSample(sizes[1], tagSets[0], 123, buildNip13Payload);
  const { payload: pKh } = buildSample(sizes[1], tagSets[2], 123, buildNip13Payload);

  const rK0 = await probeNip13HashRate(pK0, probeMs);
  const rKh = await probeNip13HashRate(pKh, probeMs);

  const c = Math.max(0, (1 / rKh - 1 / rK0) / Math.max(1, tagSets[2]));

  // Thread efficiency (single-threaded only for now)
  const eff: Record<number, number> = { 1: 1 };

  // TODO: Multi-threaded calibration requires worker setup
  // For now, use conservative efficiency estimates for multi-threading
  const cores = typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency
    ? (navigator as any).hardwareConcurrency as number
    : 4;

  const threadsToTest = opts.threadsToTest ?? [1, 2, 4, 8].filter((t) => t <= cores);
  for (const t of threadsToTest) {
    if (t === 1) continue;
    // Conservative estimate: 0.85 efficiency per doubling
    eff[t] = clamp(Math.pow(0.85, Math.log2(t)), 0.5, 1);
  }

  return {
    a,
    b,
    c,
    eff,
    algo: 'sha256',
    cpu,
    at: Date.now(),
    version: 1,
  };
}
