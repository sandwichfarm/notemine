export const EPS = 1e-12;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function hiresNow(): number {
  if (typeof performance !== 'undefined' && performance.now) return performance.now();
  return Date.now();
}

export function utf8ByteLength(s: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const codePoint = s.charCodeAt(i);
    if (codePoint < 0x80) bytes += 1;
    else if (codePoint < 0x800) bytes += 2;
    else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      i++;
      bytes += 4;
    } else bytes += 3;
  }
  return bytes;
}

export function formatTime(sec: number): string {
  if (sec < 1) return `${Math.round(sec * 1000)}ms`;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

export function attemptsFromBits(bits: number): number {
  return Math.pow(2, bits);
}

export function interpolateEfficiency(eff: Record<number, number>, threads: number): number {
  if (eff[threads] != null) return eff[threads];
  const keys = Object.keys(eff).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return 1;
  let lo = keys[0];
  let hi = keys[keys.length - 1];
  for (const k of keys) {
    if (k <= threads) lo = k;
    if (k >= threads) { hi = k; break; }
  }
  if (lo === hi) return eff[lo];
  const t = (threads - lo) / (hi - lo);
  const v = eff[lo] + (eff[hi] - eff[lo]) * t;
  return clamp(v, 0, 1);
}

export function extrapolateEfficiency(eff: Record<number, number>, threads: number): number {
  const keys = Object.keys(eff).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return 1;
  const tmax = keys[keys.length - 1];
  const emax = eff[tmax];
  if (threads <= tmax) return interpolateEfficiency(eff, threads);
  const k = 0.3;
  const v = emax * (tmax / threads) ** k;
  return clamp(v, 0.2, 1);
}

