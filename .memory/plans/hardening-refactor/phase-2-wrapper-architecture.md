# Phase 2 — Wrapper Architecture (MinerSession, WorkerFarm, StateTracker)

Purpose: move lifecycle, state, and ergonomics into the wrapper without changing the minimal core.

## Module Overview

- MinerSession (public facade)
- WorkerFarm (internal workers orchestrator)
- StateTracker (internal state + metrics)
- Protocol types (shared message/state schemas)

## TypeScript APIs

```ts
// Public types
export interface MinerOptions {
  content: string;
  pubkey: string;
  difficulty: number;
  numberOfWorkers?: number;
  tags?: string[][];
  kind?: number;
  debug?: boolean;
}

export interface MiningState {
  event: { pubkey: string; kind: number; tags: string[][]; content: string; created_at: number };
  workerNonces: string[];
  bestPow?: { bestPow: number; nonce: string; hash: string } | null;
  difficulty: number;
  numberOfWorkers: number;
}

export class MinerSession {
  constructor(opts: MinerOptions)
  mine(): Promise<void>
  pause(): void
  resume(workerNonces?: string[]): Promise<void>
  cancel(): void
  getState(): MiningState
  restoreState(state: MiningState): void

  // Observables
  mining$: BehaviorSubject<boolean>
  paused$: BehaviorSubject<boolean>
  success$: BehaviorSubject<MinedResult | null>
  error$: Observable<{ error: any }>
  progress$: Observable<{ workerId: number; hashRate?: number; bestPowData?: BestPowData }>
  workersPow$: BehaviorSubject<Record<number, BestPowData>>
  highestPow$: BehaviorSubject<WorkerPow | null>

  // Metrics
  get totalHashRate(): number // kH/s
}
```

## Core Concepts

- runId gating
  - A UUID/v4 string generated per session start/resume.
  - Included in every worker `postMessage` and in every worker message.
  - All handlers ignore messages whose `runId` doesn’t match, preventing ghost updates after cancel/pause.

- Stable event identity
  - `created_at` is captured at first `prepareEvent()` and stored; reused in `getState()`/`restoreState()`.
  - Tags are normalized (dedupe by content), default tags enforced exactly once.

- Guarded persistence
  - Compute `defaults = ["0".."N-1"]` and never persist when `workerNonces === defaults`.
  - Throttle persistence (e.g., 500ms) and persist only when:
    - ≥ 50% workers reported non-default `currentNonce`, or
    - `highestPow` improves.

## WorkerFarm

Responsibilities:
- Create N workers; for i in 0..N-1 post `{ type: 'mine', event, difficulty, id: i, totalWorkers: N, workerNonces, runId }`.
- Cancel path: `{ type: 'cancel', runId }` to each worker, then terminate after a short grace period.
- Emits `initialized`, `progress`, `result`, `error` messages upstream (with runId).

Edge cases:
- If worker count changes between runs (resume), remap nonces:
  - When saved nonces length !== N, use min(saved) + i (monotone reassignment) or keep original per-index when exact length matches.

## StateTracker

Data structures:
- `workerNonces: Map<number,string>`
- `workerRates: Map<number, number[]>` (sliding window)
- `workerMaxRates: Map<number, number>`
- `highestPow: BehaviorSubject<WorkerPow|null>`
- `workersPow: BehaviorSubject<Record<number,BestPowData>>`

Hash-rate aggregation:
- Sliding window of the last ~10 entries per worker.
- EMA smoothing (alpha ~ 0.3) optional; refresh total ≤ every 250ms.
- `totalHashRate` exported in kH/s.

Tag normalization:
- `normalizeTags(tags: string[][]): string[][]`
  - Deduplicate arrays by joined key (e.g., join with `\u001F`).
  - Ensure default tags exist exactly once (e.g., `["miner","notemine"]`).

## Control Flow

- mine():
  1) Ensure not already mining.
  2) Reset transient state; generate runId.
  3) Initialize WorkerFarm; store `created_at` if unset.
  4) Begin emitting progress via runId-gated handler.

- pause():
  1) Send cancel to workers; mark paused$; ignore late messages via runId gating.

- resume(workerNonces?):
  1) If provided, use; else derive from `StateTracker.workerNonces`.
  2) Start new runId; initialize WorkerFarm with resume nonces.

- cancel():
  1) Send cancel; terminate; mark mining$ false; emit cancelledEvent$.

## Invariants

- No progress/rate update applies across runId boundaries.
- `created_at` is stable in a session and persisted in state.
- Tags never balloon across resumes.
- Queue persistence never overwrites good state with default nonces.

## Acceptance

- All progress events include runId and are correctly gated.
- Pause/cancel reliably stop all updates (no ghost updates); resume restarts cleanly from saved nonces.
- `getState()` returns realistic nonces when available and preserves `created_at`.
