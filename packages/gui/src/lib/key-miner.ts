import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { getPubkeyPowDifficulty } from './pow';

const DEFAULT_CHUNK_SIZE = 250;

const nowHighRes = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const scheduleNext = (cb: FrameRequestCallback) => {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(nowHighRes()), 16);
};

export interface KeyMiningProgress {
  attempts: number;
  elapsedMs: number;
  bestPow?: number;
}

export interface KeyMiningResult extends KeyMiningProgress {
  secret: Uint8Array;
  pubkey: string;
  powScore: number;
  startedAt: number;
  durationMs: number;
}

export interface KeyMiningOptions {
  difficulty?: number;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: KeyMiningProgress) => void;
}

export const mineKeyWithDifficulty = async (
  opts: KeyMiningOptions = {}
): Promise<KeyMiningResult> => {
  const difficulty = Math.max(1, opts.difficulty || 2);
  const chunkSize = Math.max(1, opts.chunkSize || DEFAULT_CHUNK_SIZE);
  const startedAt = nowHighRes();
  const wallClockStart = Date.now();
  let attempts = 0;
  let disposed = false;
  let bestPow = 0;

  return new Promise<KeyMiningResult>((resolve, reject) => {
    const handleAbort = () => {
      disposed = true;
      reject(new DOMException('Key mining aborted', 'AbortError'));
    };

    if (opts.signal?.aborted) {
      return handleAbort();
    }

    opts.signal?.addEventListener('abort', handleAbort, { once: true });

    const finalize = (result: KeyMiningResult) => {
      if (disposed) return;
      disposed = true;
      opts.signal?.removeEventListener('abort', handleAbort);
      resolve(result);
    };

    const handleError = (error: unknown) => {
      if (disposed) return;
      disposed = true;
      opts.signal?.removeEventListener('abort', handleAbort);
      reject(error);
    };

    const processChunk = () => {
      if (disposed) return;
      try {
        for (let i = 0; i < chunkSize; i++) {
          if (opts.signal?.aborted) {
            handleAbort();
            return;
          }
          attempts++;
          const secret = generateSecretKey();
          const pubkey = getPublicKey(secret);
          const powScore = getPubkeyPowDifficulty(pubkey);
          if (powScore > bestPow) {
            bestPow = powScore;
          }
          if (powScore >= difficulty) {
            const durationMs = nowHighRes() - startedAt;
            const finalBest = Math.max(bestPow, powScore);
            opts.onProgress?.({
              attempts,
              elapsedMs: durationMs,
              bestPow: finalBest,
            });
            finalize({
              secret,
              pubkey,
              powScore,
              attempts,
              elapsedMs: durationMs,
              startedAt: wallClockStart,
              durationMs,
              bestPow: finalBest,
            });
            return;
          }
        }

        const elapsedMs = nowHighRes() - startedAt;
        opts.onProgress?.({
          attempts,
          elapsedMs,
          bestPow,
        });
        scheduleNext(() => processChunk());
      } catch (error) {
        handleError(error);
      }
    };

    processChunk();
  });
};
