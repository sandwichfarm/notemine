# Notemine Refactor Plan (Hardened Architecture)

This plan hardens the miner across core (WASM), wrapper, and app layers while keeping the WASM intentionally minimal and NIP‑13 compliant. It reflects everything learned during debugging (resume correctness, stable event identity, safe state persistence) and scales from simple demos to the full GUI.

## Goals

- Minimal core (WASM):
  - Strict NIP‑13 event shape; no lifecycle policy in the core.
  - Report hash rate and current nonces for UX and correct resume.
- Robust wrapper:
  - Clear lifecycle, safe resume, guarded persistence, and run isolation.
  - Ergonomic API that works for both demos and the GUI.
- App flexibility:
  - Same wrapper powers minimal demos and complex GUI use cases.

## Baseline Contracts (Protocol v2)

- Event (NIP‑13):
  - canonical array serialization: `[0, pubkey, created_at, kind, tags, content]` (sig added by the app).
  - `created_at` is stable for a session; tags are normalized (no duplicates).
- Worker messages (all include `runId`):
  - `initialized`: `{ workerId, runId }`
  - `progress`: `{ workerId, runId, hashRate?, currentNonce?, bestPowData? }`
  - `result`: `{ workerId, runId, data: { event, total_time, khs } }`
  - `error`: `{ workerId, runId, error }`
- Resume state:
  - `{ event: { pubkey, kind, tags, content, created_at }, workerNonces: string[], bestPow?, difficulty, numberOfWorkers }`

## Phase 1 — WASM (Core) Minimal + Safe Optimizations

- API stays minimal:
  - `mine_event(event_json, difficulty, start_nonce, nonce_step, report_progress, should_cancel)`.
- Progress (must include current nonces):
  - On start: `report_progress(0, { currentNonce })`.
  - Periodic: `report_progress(hashRate, { currentNonce })`.
  - Best‑PoW: `report_progress(0, { best_pow, nonce, hash, currentNonce })`.
- Cancel checks: call `should_cancel()` on a fixed stride (e.g., 10k iterations) with an adaptive backoff to react quicker after a cancel/pause request.
- NIP‑13 compliance: hash the canonical event array; write/update the nonce tag in `tags`.
- Optimizations that don’t change semantics:
  - Pre‑serialize event bytes once and update an in‑place fixed‑width nonce slot (e.g., 20 digits) to avoid per‑loop JSON allocs.
  - Reuse buffers; only hex‑encode on best‑pow or final result.
  - Adaptive progress stride to maintain ~250ms cadence per worker (target interval, not exact hash count).
  - Optional (behind feature flag): use Map/array progress payloads to reduce overhead; wrapper remains backward‑compatible.
  - Future (opt‑in): midstate hashing for the constant prefix to reduce total hashing work (guard with tests).

## Phase 2 — Wrapper Refactor

Introduce a small set of focused modules and a clear contract.

- `MinerSession` (new):
  - Owns `runId`, `createdAt`, and options; exposes `mining$`, `paused$`, `success$`, `error$`, `progress$`, `highestPow$`, `workersPow$`.
  - Public API: `mine()`, `pause()`, `resume(workerNonces?)`, `cancel()`, `getState()`, `restoreState(state)`, and computed rates `totalKHs/MHs`.
- `WorkerFarm` (new):
  - Spawns web workers; posts `{ type: 'mine', event, difficulty, id, totalWorkers, workerNonces, runId }`.
  - Supports `{ type: 'cancel', runId }` and ensures clean stop; no messages leak after cancel.
- `StateTracker` (new):
  - Tracks per‑worker `currentNonce`, best‑pow, per‑worker rates, sliding window + EMA totals.
  - Normalizes tags once and enforces stable `created_at` for a session.
  - `getState()` returns stable `created_at` and non‑default nonces; `restoreState()` validates input.
- `runId` gating:
  - Every worker message includes `runId`; the session ignores any message that doesn’t match.
- Guarded persistence:
  - Throttle (e.g., 500ms) and persist only when nonces are non‑default (`["0".."N-1"]`) and coverage is sufficient (e.g., ≥ 50% workers updated) or best‑pow improves.

## Phase 3 — Worker Protocol v2

- On init: post `progress` with `{ currentNonce: startNonce }` (no hashRate), enabling immediate resume state.
- On periodic/best‑pow: always include `currentNonce` if known.
- Backward compatibility: wrapper tolerates older workers (no `currentNonce`) and never overwrites saved nonces with defaults.

## Phase 4 — Lifecycle Semantics

- `pause()`:
  - Send cancel to workers, mark `paused$`, do not emit `cancelledEvent$`.
  - Stop progress/rate updates; rely on `runId` gating to ignore any late worker messages.
- `cancel()`:
  - Send cancel then terminate workers; mark `mining$` false and emit `cancelledEvent$` once.
- `resume()`:
  - Use saved `created_at` and `workerNonces` (validated); remap nonces if worker count changed.
- `result()`:
  - Terminate workers; emit `success$`; mark `mining$` false.

## Phase 5 — Provider + Queue Integration (GUI)

- MiningProvider:
  - Single active `MinerSession`; enforce that only one session exists at a time.
  - Preferences: `minerUseAllCores`, `minerNumberOfWorkers`, `disableResume`.
  - Do not persist state when nonces are default; throttle and diff‑aware updates from an `onStateChange$` stream, not every progress tick.
- QueueProcessor:
  - Start/resume the active item only; call `cancel()` when items are cleared or the active item changes.
  - Resume guard: start fresh if saved nonces are default or malformed.

## Phase 6 — Diagnostics & Stability

- Wrapper (debug mode):
  - Log `runId`, start nonces per worker, per‑worker `currentNonce` updates, `getState()` nonce samples, and kH/s totals.
- Provider (debug mode):
  - Log chosen workers, `workers$` count, and active worker IDs.
- Protocol negotiation:
  - Workers announce `protocolVersion`; wrapper adapts behavior (e.g., no `currentNonce` → no clobbering on persist).

## Phase 7 — Demos & Compatibility

- Minimal demo:
  - `new Notemine({ content, pubkey, difficulty })` → subscribe to `progress$` and use `totalKHs`; no resume.
- Advanced (GUI):
  - Full lifecycle with queue integration, preferences, diagnostics, and safe persistence.
- Keep backward‑compat: demos continue to work; GUI gets hardened semantics.

## Phase 8 — Tests & Rollout

- Lifecycle:
  - Pause/resume/cancel correctness; no ghost updates after cancel; `runId` gating verified.
- Resume stability:
  - 20× refresh with resume enabled: stable kH/s and prompt progress ticks.
- State integrity:
  - `created_at` stable; tags normalized; no duplicate `miner`/`client`/`e`/`p` tags.
- Backward‑compat:
  - Older worker/core (no `currentNonce`) still mines; wrapper never overwrites nonces with defaults.
- Release:
  - Publish wrapper v2 with protocol v2; core retains minimal API; provide upgrade notes.

## Immediate Fixes (already applied / to preserve)

- Preserve `created_at` across resume; normalize tags to avoid growth between refreshes.
- Workers post start‑of‑run `currentNonce` immediately; core includes `currentNonce` on periodic and best‑pow updates.
- Guard queue persistence: skip updates when nonces are default; prevents clobbering a good resume state.
- Ensure pause/cancel correctness with `runId` gating and soft cancel in workers.

## Notes on Further WASM Optimizations (safe)

- Pre‑serialized JSON with in‑place nonce update is the biggest safe win.
- Adaptive progress stride keeps UX consistent without reducing throughput.
- Early cancel stride backoff improves pause responsiveness without measurable cost.
- Midstate hashing is promising but should be opt‑in and gated by correctness/perf tests.

---

This plan preserves a minimal NIP‑13 core, moves correctness and lifecycle responsibilities into the wrapper, hardens resume semantics, and offers optional WASM micro‑optimizations that do not alter fundamental behavior.
