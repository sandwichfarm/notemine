**Purpose**
- Harden resume semantics end-to-end so mining resumes from the latest worker positions with accurate UI, avoiding ghost updates and default-nonce overwrites.

**Scope**
- Core/wrapper/GUI data flow for progress, persistence, and resume.
- Panel display of current nonces, hash rates, and job-scoped Highest Diff.
- Queue interactions and safe persistence throttling.

**Goals**
- Preserve work across refresh; resume from real `currentNonce` per worker.
- Highest Diff reflects “best for this job” (including resumed state), computed from per‑worker bests.
- Show live `currentNonce` per worker (update smoothly, not noisily).
- Robust gating: ignore stale/ghost updates; don’t overwrite saved state with defaults.

**Non‑Goals**
- Performance micro-optimizations in Rust hashing beyond cadence already present.
- Broader UI/UX redesign unrelated to mining.

**High‑Level Phases**
- Phase 1: Protocol and state contracts
- Phase 2: Persistence and resume semantics
- Phase 3: GUI provider integration
- Phase 4: UI panel corrections
- Phase 5: Diagnostics and logging
- Phase 6: Tests and acceptance
- Phase 7: Worker‑count + queue‑ordering interactions
- Phase 8: Remap algorithm for worker‑count changes
- Phase 9: Legacy state compatibility & UI clarity

**Contracts & APIs**
- Wrapper `ProgressEvent` includes `currentNonce?: string` and `hashRate?: number`.
- Wrapper `MiningState` persists `workerNonces` (guarded) and `workersPow?: Record<number, {bestPow, nonce, hash}>`.
- `restoreState(state)` seeds both `workersPow$` and `highestPow$` using persisted data.
- RunId gating: ignore progress without matching `runId` (and optionally ignore missing runId in GUI builds).

**Data Types**
- `ProgressEvent { workerId: number; hashRate?: number; currentNonce?: string; bestPowData?: { bestPow: number; nonce: string; hash: string } }`
- `MiningState { event; workerNonces: string[]; workersPow?: Record<number, BestPowData>; bestPow?: BestPowData | null; difficulty: number; numberOfWorkers: number }`

**Control Flow (Resume)**
- On refresh: GUI loads queue item → wrapper `restoreState(state)` → wrapper seeds per‑worker and overall best → GUI subscribes → `resume(workerNonces?)` starts workers from saved nonces (or redistributed min) → progress updates with `currentNonce`/`hashRate` → GUI throttles persistence (~500ms) and performs a one‑time immediate flush when first real nonces appear.

**Edge Cases**
- Empty `workerNonces` but non‑empty `workersPow` (seed bests; start from defaults).
- Different worker count on resume (redistribute from min nonce).
- Old persisted state without `workersPow` (backward compatible; derive overall from saved `bestPow` if present).
- Stale cached worker (no runId) → ignore progress.

**Diagnostics**
- Debug preference gates logs. Log: chosen worker count, active worker IDs seen, periodic total KH/s, per‑worker nonce samples on persistence.

**Build**
- When touching core/wrapper/GUI: `pnpm -w -r build`

**Acceptance**
- See Phase 6 for concrete, testable criteria per layer.
