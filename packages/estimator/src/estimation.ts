import { attemptsFromBits as defaultAttempts } from './difficulty.js';
import { EPS, interpolateEfficiency, extrapolateEfficiency } from './utils.js';
import type { Calibration, EstimateParams, EstimateResult } from './types.js';

export function estimate(params: EstimateParams): EstimateResult {
  const { bytes, tags, threads, cal } = params;
  const attempts = params.bits != null ? defaultAttempts(params.bits) : (params.attemptsFn ? params.attemptsFn({ bits: params.bits }) : 0);
  if (!attempts || !isFinite(attempts)) throw new Error('attempts not provided');
  const t1 = cal.a + cal.b * bytes + cal.c * tags;
  const r1 = 1 / Math.max(t1, EPS);
  const E = cal.eff[threads] ?? extrapolateEfficiency(cal.eff, threads);
  const rate = r1 * threads * E;
  const timeSec = attempts / Math.max(rate, EPS);
  return { timeSec, rateHps: rate, details: { t1, E, attempts } };
}

export function severity(sec: number, thresholds = [3, 15, 60, 300]): { level: 'green'|'yellow'|'orange'|'red'|'purple'; label: string } {
  if (sec < thresholds[0]) return { level: 'green', label: 'OK' };
  if (sec < thresholds[1]) return { level: 'yellow', label: 'Caution' };
  if (sec < thresholds[2]) return { level: 'orange', label: 'Warning' };
  if (sec < thresholds[3]) return { level: 'red', label: 'High' };
  return { level: 'purple', label: 'Extreme' };
}

