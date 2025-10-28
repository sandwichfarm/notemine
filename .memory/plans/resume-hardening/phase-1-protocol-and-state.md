**Purpose**
- Align core→worker→wrapper progress messages and wrapper contracts to support accurate resume and UI.

**Scope**
- Confirm core progress payloads; extend wrapper event surface without changing core hashing logic.

**Contracts**
- Wrapper `progress$` forwards `currentNonce` from workers alongside `hashRate` and `bestPowData`.
- Wrapper `MiningState` gains optional `workersPow` to seed per‑worker bests at restore time.
- RunId must match for all accepted progress; optionally reject messages missing runId.

**APIs**
- `Notemine.progress$`: emits `{ workerId, hashRate?, currentNonce?, bestPowData? }`.
- `Notemine.getState()`: returns `{ workerNonces, workersPow?, bestPow?, ... }` with guarded nonces.
- `Notemine.restoreState(state)`: seeds `workersPow$`, derives `highestPow$` from it if needed, and primes `_resumeNonces`.

**Data Types**
- `workersPow$`: `BehaviorSubject<Record<number, BestPowData>>` remains; initialize from restored state when present.

**Control Flow**
- Worker posts immediate and periodic progress with `currentNonce` (unchanged in core).
- Wrapper stores `_workerNonces` on every progress, emits `currentNonce` via `progress$`.
- On `restoreState`, seed `workersPow$` and `highestPow$` from saved state.
- On `mine()`, clear previous bests when no resume info present (see Phase 2).

**Edge Cases**
- Bests restored without nonces (OK). Bests only affect display; resumption comes from nonces.
- Missing runId in progress (block to prevent ghost updates).

**Diagnostics**
- Debug: log reception of `currentNonce` (rate-limited), and show gating decisions for runId.

**Acceptance**
- Wrapper `progress$` emits `currentNonce` consistently across workers.
- `restoreState` sets per‑worker and overall bests before workers start.
- Ghost progress (wrong/missing runId) does not change any state.

