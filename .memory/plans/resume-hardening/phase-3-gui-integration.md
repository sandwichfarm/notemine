**Purpose**
- Make the provider capture and persist live resume data and expose correctly keyed, job-scoped metrics to the UI.

**Scope**
- `packages/gui/src/providers/MiningProvider.tsx`

**Contracts**
- Maintain `workersCurrentNonces: Record<number,string>` based on wrapper `progress$`.
- Maintain `workersHashRates: Record<number,number>` keyed by workerId (not index).
- Maintain `workersBestPow: Record<number, BestPowData>` or a stable array tagged with workerId.
- Compute/display Highest Diff as max over `workersBestPow` (job-scoped) or rely on wrapper’s seeded `highestPow$` when present.

**APIs**
- No public API change; internal state extended with `workersCurrentNonces`.

**Control Flow**
- Subscribe to `progress$` and update `workersCurrentNonces[workerId]` and `workersHashRates[workerId]`.
- Throttle persistence to ~500ms and perform a one-time immediate save when `workerNonces` first becomes non-empty (transition from defaults).
- On resume with queue item:
  - Call `restoreState(state)`; after subscribing, call `resume(state.workerNonces)` and keep a single active session.

**Edge Cases**
- Resume disabled preference → start fresh with preferences/params; skip `restoreState`.
- Missing `workersPow` in state → show Highest Diff from wrapper’s `highestPow$` only; per‑worker list fills as new bests arrive.

**Diagnostics**
- Debug: log worker IDs seen, nonces persisted (sample), and KH/s at coarse cadence.

**Acceptance**
- At high difficulty, per‑worker “Nonce” advances smoothly in panel (driven by `currentNonce`), even when bestPow doesn’t change.
- On refresh, per‑worker bests and highest diff appear immediately when saved.

