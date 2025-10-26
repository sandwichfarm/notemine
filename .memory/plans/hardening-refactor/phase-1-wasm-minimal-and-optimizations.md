# Phase 1 — WASM (Core) Minimal + Safe Optimizations

Purpose: keep the core miner minimal, strictly NIP‑13 compliant, and provide the exact progress signals the wrapper needs (current nonces and hash‑rate) without owning lifecycle policy.

## Scope and Constraints

- Conforms to NIP‑13 canonical event hashing (array form):
  - `[0, pubkey, created_at, kind, tags, content]`
  - App signs the event later; core returns mined event with updated nonce tag.
- Single exported function, no lifecycle in WASM:
  - `mine_event(event_json: &str, difficulty: u32, start_nonce: &str, nonce_step: &str, report_progress: JsValue, should_cancel: JsValue) -> JsValue`
- Progress semantics (Protocol v2):
  - On start: `report_progress(0, { currentNonce })`
  - Periodic: `report_progress(hashRate, { currentNonce })` (target ~250ms cadence)
  - On best‑pow: `report_progress(0, { best_pow, nonce, hash, currentNonce })`
- Cancel checks: call `should_cancel()` every `CANCEL_STRIDE` iterations (default 10k), with adaptive backoff (see below).

## Data and Types

- NostrEvent (serde): `{ pubkey, kind, content, tags, id?, created_at? }`
- MinedResult (serde): `{ event, total_time: f64, khs: f64 }`
- Progress payloads (JS objects):
  - `{ currentNonce: string }`
  - `{ best_pow: number, nonce: string, hash: string, currentNonce: string }`

## Algorithm (pseudocode)

```
fn mine_event(event_json, difficulty, start_nonce, nonce_step, report_progress, should_cancel) -> JsValue {
  // 1) Parse and fill event.created_at if missing (unix seconds)
  // 2) Ensure a nonce tag exists (['nonce', "0", difficulty])
  // 3) Pre-serialize immutable JSON parts and set up a fixed-width nonce slot
  // 4) Emit initial progress with currentNonce = start_nonce

  total_hashes = 0
  last_report_time = now()
  best_pow = 0

  for nonce in (start_nonce .. step by nonce_step) {
    // write nonce string into fixed-width slot
    // hash canonical NIP-13 array bytes
    pow = leading_zero_bits(hash)

    if pow > best_pow {
      best_pow = pow
      emit report_progress(0, { best_pow, nonce, hash: hex(hash), currentNonce: nonce })
      if pow >= difficulty { // success
        // construct final event (with tag ['nonce', nonce, difficulty])
        // compute total_time, khs = total_hashes / total_time / 1000
        return MinedResult
      }
    }

    total_hashes += 1

    // Periodic cancel
    if total_hashes % CANCEL_STRIDE == 0 and should_cancel() { return { error: "Mining cancelled" } }

    // Periodic progress
    if total_hashes % REPORT_STRIDE == 0 {
      elapsed = now() - last_report_time
      if elapsed > 0 {
        hash_rate = REPORT_STRIDE / elapsed
        report_progress(hash_rate, { currentNonce: nonce })
        last_report_time = now()
      }
    }
  }
}
```

## Optimizations (safe, default‑on)

- Pre‑serialized JSON with in‑place nonce slot (e.g., 20 chars, left‑padded zeroes) to avoid per‑loop serde.
- Buffer reuse for hash input; avoid allocating new Vec each iteration.
- Hex encoding only for best‑pow and final result (not per iteration).
- Adaptive `REPORT_STRIDE`:
  - Maintain a moving average of elapsed per stride; scale stride to aim for ~250ms between progress callbacks per worker.
- Adaptive cancel stride:
  - After a `should_cancel()==true`, temporarily reduce `CANCEL_STRIDE` for the next second to react more quickly.

## Non‑goals

- No policy for pause/resume/cancel beyond `should_cancel()` checks.
- No worker/thread orchestration; that lives in the wrapper.

## Acceptance

- Produces NIP‑13‑compliant event body with updated `['nonce', nonce, difficulty]`.
- Emits currentNonce at start and on each periodic/best‑pow progress.
- Cancel responds within ≤ 100ms typical (with adaptive stride).
- Benchmarks show no regression; pre‑serialization yields equal or better throughput.
