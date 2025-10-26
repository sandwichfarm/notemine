**Purpose**
- Ensure saved state reflects real progress and restore semantics produce predictable resume positions and correct bests.

**Scope**
- Wrapper `getState`, `restoreState`, `mine`, and `resume` behaviors.

**Contracts**
- Guard persistence: if all nonces are defaults (`["0".."N-1"]`), persist `workerNonces: []`.
- Persist `workersPow?` to reflect per‑worker bests at save time.
- On `restoreState`:
  - Set `_resumeNonces = state.workerNonces` (may be empty).
  - Seed `workersPow$` with `state.workersPow` if present; set `highestPow$` as max of that map if `state.bestPow` absent.
- On `mine()` clearing rule:
  - Clear previous bests/maps if no resume info is present: when `_resumeNonces` is `undefined` or has length `0` AND no `workersPow` was restored.

**APIs**
- No new public methods; only data surfaces extended.

**Control Flow**
- Save path: GUI throttles `getState()` (~500ms) and performs a one‑time immediate write on first transition from default→real nonces.
- Restore path: immediately seed per‑worker/overall bests; launch workers with `_resumeNonces` if available; otherwise start from defaults and redistribute on worker count change.

**Edge Cases**
- `workerNonces: []`, `workersPow: {}` → treat as fresh: clear bests before new run.
- Mixed versions: states without `workersPow` remain valid; only `bestPow` is used.

**Diagnostics**
- Debug: log `getState()` length of nonces and whether first real nonces trigger immediate save; log resume redistribution when worker count differs.

**Acceptance**
- Fresh run after restore with no resume info shows blank per‑worker bests and no preserved Highest Diff.
- Restore with resume info shows seeded per‑worker bests and Highest Diff before workers start producing new bests.

