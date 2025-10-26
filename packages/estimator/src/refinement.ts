import type { Calibration, EstimateParams } from './types.js';
import { attemptsFromBits as defaultAttempts } from './difficulty.js';
import { clamp, EPS } from './utils.js';

type Input = {
  params: Omit<EstimateParams, 'cal'>;
  cal: Calibration;
  actualTimeSec: number;
  alphaABC?: number;
  alphaEff?: number;
};

export function recordOutcome(input: Input): Calibration {
  const { params, cal, actualTimeSec } = input;
  const alphaABC = input.alphaABC ?? 0.1;
  const alphaEff = input.alphaEff ?? 0.05;
  const attempts = params.bits != null ? defaultAttempts(params.bits) : (params.attemptsFn ? params.attemptsFn({ bits: params.bits }) : 0);
  if (!attempts || !isFinite(attempts)) return cal;
  const rObs = attempts / Math.max(actualTimeSec, EPS);
  const yPred = cal.a + cal.b * params.bytes + cal.c * params.tags;
  const t1Obs = Math.max(EPS, params.threads / Math.max(rObs, EPS));
  const e = t1Obs - yPred;
  const a = clamp(cal.a + alphaABC * e, 0, cal.a * 10 + 1);
  const b = clamp(cal.b + alphaABC * e * (params.bytes > 0 ? 1 / params.bytes : 0), 0, cal.b * 10 + 1);
  const c = clamp(cal.c + alphaABC * e * (params.tags > 0 ? 1 / params.tags : 0), 0, cal.c * 10 + 1);
  const r1 = 1 / Math.max(a + b * params.bytes + c * params.tags, EPS);
  const eObs = clamp(rObs / Math.max(r1 * params.threads, EPS), 0.1, 1);
  const eff = { ...cal.eff, [params.threads]: (1 - alphaEff) * (cal.eff[params.threads] ?? eObs) + alphaEff * eObs };
  return { ...cal, a, b, c, eff, at: Date.now() };
}

