import initWasm, { mine_event } from '@notemine/core';
//@ts-ignore: wasm import
import wasm from '@notemine/core/wasm';

/**
 * NIP-13 compatible event structure
 */
export interface Nip13Event {
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/**
 * Build a NIP-13 compatible event payload from content and tags.
 * Used during calibration to measure realistic NIP-13 mining performance.
 *
 * @param content - UTF-8 encoded content bytes
 * @param tags - Array of tag strings
 * @returns NIP-13 event structure
 */
export function buildNip13Payload(content: Uint8Array, tags: string[]): Nip13Event {
  const decoder = new TextDecoder();
  const contentStr = decoder.decode(content);

  // Convert simple tag strings to NIP-13 tag arrays
  // For calibration, we use simple 't' tags
  const tagArray = tags.map(t => ['t', t]);

  return {
    pubkey: '0'.repeat(64), // Dummy pubkey for calibration (32 bytes hex = 64 chars)
    kind: 1,
    content: contentStr,
    tags: tagArray,
    created_at: Math.floor(Date.now() / 1000)
  };
}

let wasmInitialized = false;

/**
 * Initialize the NIP-13 WASM module.
 * Must be called before calibration.
 * Safe to call multiple times (idempotent).
 */
export async function initNip13(): Promise<void> {
  if (!wasmInitialized) {
    await initWasm(wasm);
    wasmInitialized = true;
  }
}

/**
 * Probe hash rate by running actual NIP-13 mining for a short duration.
 *
 * This uses the real mine_event() function with low difficulty to measure
 * actual mining performance including SHA256 hashing overhead.
 *
 * @param payload - NIP-13 event structure
 * @param durationMs - How long to run the probe (milliseconds)
 * @returns Hash rate in hashes per second
 */
export async function probeNip13HashRate(
  payload: Nip13Event,
  durationMs: number
): Promise<number> {
  const eventJson = JSON.stringify(payload);

  // Use difficulty 1 so we measure hashing, not solution finding
  const difficulty = 1;

  // Cancellation after duration
  let shouldStop = false;
  const stopTimer = setTimeout(() => { shouldStop = true; }, durationMs);

  try {
    const startTime = performance.now();

    // Run actual mining - this is what we're calibrating!
    const result = await mine_event(
      eventJson,
      difficulty,
      '0',  // start nonce
      '1',  // nonce step (single-threaded)
      () => {}, // progress callback (not needed)
      () => shouldStop // cancellation check
    );

    const elapsedSec = (performance.now() - startTime) / 1000;

    // Extract total hashes from result
    // mine_event returns { event, total_time, khs }
    const khs = result.khs || 0;
    return khs * 1000; // Convert KH/s to H/s
  } finally {
    clearTimeout(stopTimer);
  }
}
