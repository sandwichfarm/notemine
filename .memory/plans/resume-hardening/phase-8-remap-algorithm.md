**Purpose**
- Improve start‑nonce redistribution when resuming with a different worker count to minimize re‑hashing old space.

**Scope**
- Worker start‑nonce selection in `mine.worker.ts` when `workerNonces.length !== totalWorkers`.

**Current Behavior**
- Uses `min(savedNonces) + workerId` for all new workers. This can place the whole pool near the minimum, far behind the frontier.

**Proposed Algorithm**
- Compute `minNonce` and `maxNonce` from `savedNonces`.
- Derive `span = maxNonce - minNonce` (guard `span >= totalWorkers`).
- Set `stride = max(1, floor(span / totalWorkers))`.
- For new worker `i` in `[0..totalWorkers-1]`,
  - `startNonce = minNonce + (i * stride)`
  - Preserve nonce parity for lane correctness if required (match `nonce % totalWorkers === i % totalWorkers` by incrementing `startNonce` up to `totalWorkers` steps).

**Benefits**
- Spreads new workers across the prior explored span, keeping them nearer to the overall frontier.
- Greatly reduces visible “workers far behind” after resume with count mismatch.

**Edge Cases**
- `span < totalWorkers`: fall back to round‑robin of sorted savedNonces (map `i -> saved[i % saved.length]`).
- Saved nonces unsorted: sort ascending for stable mapping.

**Diagnostics**
- Log min/max, stride, chosen start nonces for a few workers (debug mode).

**Acceptance**
- In tests where saved worker count differs (e.g., 16 → 8, 8 → 12), new workers’ start nonces are distributed across prior span.
- Measurably less overlap vs. `min + id` baseline.
