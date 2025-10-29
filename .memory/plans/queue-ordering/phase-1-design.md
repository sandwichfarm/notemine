Phase 1 — Design and Contracts

Purpose
- Specify data shapes, rules, and decision helpers for queue ordering and preemption.

Scope
- Preferences: add `queueOrderingStrategy` with default `lowDifficultyFirst`.
- Queue logic: centralized helpers for insertion and preemption.

APIs / Contracts
- PreferencesProvider
  - Adds `queueOrderingStrategy: QueueOrderingStrategy` (persisted). Default: `lowDifficultyFirst`.

- QueueProvider
  - Uses helpers to determine where to insert a new queued item and whether to preempt the active item.
  - On preempt: sets `activeItemId` to new top-of-queue item; does NOT call `stopMining` directly.
  - Keeps `getNextQueuedItem()` returning the first queued item to honor manual ordering.

Data Types
- `type QueueOrderingStrategy = 'lowDifficultyFirst' | 'fifo' | 'lifo'`.

Helpers (pure functions; place in `packages/gui/src/lib/queue-ordering.ts`)
- `computeInsertionIndex(items, newItem, strategy): number`
  - lowDifficultyFirst: insert before the first queued item whose `difficulty` > `newItem.difficulty`; otherwise after the last queued item.
  - fifo: insert after the last queued item.
  - lifo: insert before the first queued item (front of the queued slice).

- `shouldPreempt(activeItem, newItem, strategy): boolean`
  - true iff strategy is `lowDifficultyFirst` AND `activeItem.status === 'queued'` AND `newItem.difficulty < activeItem.difficulty`.

Control Flow (addToQueue)
1) Build `newItem` with status `queued` and timestamp.
2) Compute insertion index via strategy.
3) Insert `newItem` into the list immutably.
4) If `shouldPreempt(...)` and queue is processing, set `activeItemId` to the first queued item (the new one at index 0).
5) Persist immediately (flush).

Edge Cases
- Queue paused: insertion/preemption sets active id but does not start mining.
- Existing items manually ordered remain as-is; strategy applies to new additions and default next selection only.
- Disabled resume: preemption still works; the preempted item preserves any saved state for later.

Diagnostics
- Add debug logs for: computed index, chosen strategy, and preemption decisions.

Acceptance
- See overview acceptance; add end-to-end manual QA script in Phase 5.
