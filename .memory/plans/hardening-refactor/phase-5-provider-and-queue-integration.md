# Phase 5 — Provider + Queue Integration (GUI)

Purpose: integrate MinerSession into the GUI with correct lifecycle, preferences, and safe queue persistence.

## Components

- MiningProvider (singleton session owner)
- QueueProcessor (auto-processing of queued items)
- Preferences (workers, resume policy, debug)

## MiningProvider API

```ts
interface MiningContextType {
  miningState: () => {
    mining: boolean;
    hashRate: number; // kH/s
    overallBestPow: number | null;
    workersBestPow: BestPowData[];
    workersHashRates: Record<number, number>; // H/s per worker
    result: NostrEvent | null;
    error: string | null;
  };
  startMining(options: MiningOptions, queueItemId?: string, onStateUpdate?: (state: MiningState) => void): Promise<NostrEvent|null>;
  pauseMining(): void;
  resumeMining(queueItemOrNonces?: any, onStateUpdate?: (state: MiningState) => void): Promise<NostrEvent|null>;
  stopMining(): void; // cancel
  getMiningState(): MiningState | null;
  restoreMiningState(state: MiningState): void;
}
```

## Preferences

- `minerNumberOfWorkers`: default N‑1 (leave one core free).
- `minerUseAllCores`: when true, use all cores and hide the slider.
- `disableResume`: start fresh instead of resume (debug/testing switch).
- `debugMode`: enables detailed logs.

## Start/Resume Flow

1) Choose `numberOfWorkers` = explicit option > preference > default; clamp to hardware.
2) Create `MinerSession` with normalized tags and stable `created_at`.
3) Subscribe to progress/highestPow/workersPow.
4) onStateUpdate throttle (e.g., 500ms), and guard:
   - Compute defaults `['0'..'N-1']`; if `workerNonces` equals defaults, skip persistence to avoid overwriting good state.
5) On success, resolve with event; on error, reject and set error state.

## QueueProcessor

- When processing:
  - If `disableResume` on → call `startMining` with item params; else
  - If `item.miningState` exists → call `resumeMining(item, onStateUpdate)`, otherwise start fresh.
- On clear/stop/skip current:
  - Call `stopMining()` (cancel) to end session; allow QueueProcessor to move on.
- Resume guard (fallback): if saved nonces are default or coverage < threshold, start fresh.

## Debug Logging

- Log worker selection `{ hardwareConcurrency, preference, chosen }`.
- Log `workers$` count and active worker IDs in progress.
- Log `getState().workerNonces` sample and persistence decisions (skipped vs persisted).

## Acceptance

- Only one session active at any time; pause/cancel stop progress reliably.
- Queue persistence never clobbers good state; resumes maintain stable kH/s across refreshes.
- Preferences cleanly influence thread count and resume policy.
