# Phase 4 — Lifecycle Semantics (pause, cancel, resume, result)

Purpose: define precise, observable lifecycle semantics so the miner behaves predictably across all UIs.

## Definitions

- mining: session is active, workers are hashing.
- paused: session is suspended; workers canceled, state preserved; no progress updates.
- canceled: session aborted; workers terminated, no further updates; one canceled event emitted.
- result: success; workers terminated; mined result published; one success event emitted.

## API Behaviors

### mine()
- Preconditions: not already mining.
- Actions:
  - Generate `runId`, clear transient state, ensure `created_at` is set, initialize WorkerFarm.
  - Subscribe to worker messages gated by `runId`.

### pause()
- Actions:
  - Post `{ type: 'cancel', runId }` to each worker (soft cancel).
  - Do NOT terminate immediately; allow workers to exit.
  - Set `paused$ = true`, `mining$ = false`; stop emitting rate/progress.
  - Ignore late messages via `runId` gating.

### resume(workerNonces?)
- Actions:
  - If `workerNonces` provided, use; else derive from `StateTracker.workerNonces`.
  - Start a new `runId`; initialize WorkerFarm with resume nonces.
  - Keep `created_at` and normalized tags from prior state.

### cancel()
- Actions:
  - Post `{ type: 'cancel', runId }`, then terminate workers.
  - Set `mining$ = false`; emit `cancelledEvent$` once; stop updates.

### result()
- Actions:
  - On first `result` from any worker (runId‑validated), terminate all workers.
  - Emit `success$` with the mined result; `mining$ = false`.

## Correctness Guards

- runId gating: every handler discards messages whose `runId` doesn’t match the active session.
- Idempotency: pause() and cancel() are idempotent; multiple calls are safe.
- Single session: MinerSession ensures exactly one active session; Provider enforces singleton.

## Timeouts and Grace Periods

- Soft cancel grace: allow up to ~200ms for workers to exit cleanly; then terminate if still alive.
- Max session time (optional safety): configurable timeout that triggers cancel.

## Acceptance

- No hash‑rate/progress emissions while paused or after cancel/result.
- No ghost updates after cancel (verified via runId gating).
- Resume reuses `created_at` and correct nonces; rate/progress resume promptly.
