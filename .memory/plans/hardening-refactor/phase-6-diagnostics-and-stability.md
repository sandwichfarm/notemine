# Phase 6 — Diagnostics & Stability

Purpose: provide actionable visibility and safety mechanisms without incurring overhead in production.

## Debug Modes and Toggles

- `preferences().debugMode` gates logging at wrapper/provider layers.
- Optional query param `?nocache=1` in dev clears ServiceWorker/CacheStorage (without touching queue).

## Instrumentation Points

- Wrapper (MinerSession):
  - Log `runId` at start/resume/cancel.
  - Log worker start nonces (first progress with `currentNonce`).
  - Log per‑worker `currentNonce` updates (rate limited, e.g., every 2s per worker).
  - Log `getState().workerNonces` sample on persistence and whether update was skipped or stored.
  - Log `totalHashRate` changes (coarse, e.g., every 1s).

- Provider:
  - Log selected workers `{ hardwareConcurrency, preference, chosen, useAllCores }`.
  - Log `workers$` count and active worker IDs when all have reported at least once.
  - Log errors with context (queue item id, runId, event kind).

## Protocol Negotiation

- Workers may expose `protocolVersion` in `initialized`.
- Wrapper stores it and adjusts behavior:
  - No `currentNonce` support → never persist default nonces; keep previous nonces.
  - Different `bestPowData` shape (Map/array) → normalize in worker before posting.

## Safety Guards

- `runId` gating everywhere to avoid ghost updates.
- `pause()`/`cancel()` are idempotent; subsequent calls early‑return.
- Throttled persistence and default nonce guard to protect resume state integrity.

## Acceptance

- With debug on, logs are sufficient to diagnose lifecycle, worker health, and persistence decisions.
- With debug off, logging is silent and overhead is negligible.
