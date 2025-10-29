import type { Calibration, WebPersistence } from '../types.js';

const LS_KEY = 'notemine.estimator.calibrations';

function validate(cal: any): cal is Calibration {
  return cal && typeof cal.a === 'number' && typeof cal.b === 'number' && typeof cal.c === 'number' && typeof cal.version === 'number' && typeof cal.algo === 'string' && typeof cal.cpu === 'string' && typeof cal.at === 'number' && cal.eff && typeof cal.eff === 'object';
}

export function createLocalStoragePersistence(): WebPersistence {
  return {
    async load(key: string) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const map = JSON.parse(raw) as Record<string, Calibration>;
        const cal = map[key];
        if (!validate(cal)) return null;
        return cal;
      } catch {
        return null;
      }
    },
    async save(key: string, cal: Calibration) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        const map = raw ? (JSON.parse(raw) as Record<string, Calibration>) : {};
        map[key] = cal;
        localStorage.setItem(LS_KEY, JSON.stringify(map));
      } catch {
      }
    }
  };
}

