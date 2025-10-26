Phase 4 — Logic Integration (Provider + Processor)

Purpose
- Implement deterministic placement and preemption behavior without breaking lifecycle guarantees.

Scope
- Add helpers in `packages/gui/src/lib/queue-ordering.ts`.
- Update `QueueProvider.addToQueue()` to use helpers.
- Ensure `QueueProcessor` preemption remains single-cancel and ghost-safe.

Contracts
- Helpers (pure):
  - `computeInsertionIndex(items: QueueItem[], newItem: QueueItem, strategy: QueueOrderingStrategy): number`
    • lowDifficultyFirst: first index among queued items where `item.difficulty > newItem.difficulty`; else append after last queued.
    • fifo: append after last queued.
    • lifo: insert before first queued (i.e., at the front among queued items).
  - `shouldPreempt(active: QueueItem | null, newItem: QueueItem, strategy: QueueOrderingStrategy): boolean`
    • Return true only for `lowDifficultyFirst` and when `active?.status === 'queued' && newItem.difficulty < active.difficulty`.

- QueueProvider.addToQueue():
  1) Build `newItem` (status `queued`).
  2) Compute `idx = computeInsertionIndex(...)` among queued.
  3) Insert at `idx` within the filtered queued slice, preserving order of non-queued items.
  4) If `shouldPreempt(...)` then set `activeItemId` to the first queued (the newly inserted top) and keep `isProcessing` unchanged.
  5) Flush persistence.

- Manual Reorder Preservation:
  - `reorderItem()` remains manual-first: after reorder, `activeItemId` becomes the first queued item.
  - No background auto-sorting.

Control Flow & Lifecycle
- Preemption: changing `activeItemId` triggers `QueueProcessor` createEffect → detects mismatch with `mining.currentQueueItemId` → calls `stopMining()` → single cancel path → `processNextItem()` starts/resumes new active.
- Resume safety: preempted item keeps `miningState`; wrapper resume correctness is unaffected.
- Single active session: system continues to honor single Notemine instance via `MiningProvider`.

Edge Cases
- Queue paused: preemption updates `activeItemId` but does not start mining.
- Rapid multiple adds: last write wins on `activeItemId`. Items keep their saved states.
- Equal difficulty: no preemption; stable order.

Diagnostics
- Debug logs in addToQueue(): strategy, computed index, active item id change, and preemption reasons.
- No extra logs in hot mining loop.

Acceptance
- Low Diff preempts high-difficulty active item when a lower one is added.
- FIFO appends; LIFO fronts; both do not auto-preempt.
- Manual reorder works across all strategies; next item is the first queued.
- No ghost hash-rate/progress after pause/cancel; only one cancel per preemption.

Build & Workspace
- GUI-only change; core/WASM untouched.
- No need to rebuild core or wrapper; build GUI as usual when validating.

