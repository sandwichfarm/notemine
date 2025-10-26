Phase 5 — Diagnostics, Tests, and Acceptance

Purpose
- Verify correctness, avoid regressions, and confirm UX behavior under debug gating.

Scope
- Add unit tests for helpers.
- Add gated logs for strategy changes and insert/preempt decisions.
- Manual QA scenarios for end-to-end confidence.

Diagnostics
- Respect global debug flag; keep logs minimal and informative:
  - On strategy change: old → new.
  - On addToQueue: strategy, computed index, isPreempt, active change.
  - On QueueProcessor selection: chosen item id and difficulty (coarse cadence only).

Tests (Unit)
- Location: `packages/gui/src/lib/queue-ordering.test.ts`.
- Focus on pure helpers (no DOM):
  1) computeInsertionIndex — lowDifficultyFirst inserts before higher difficulty; ties append among equals.
  2) computeInsertionIndex — fifo appends after last queued; lifo inserts before first queued.
  3) shouldPreempt — only when strategy is lowDifficultyFirst and `newItem.difficulty < active.difficulty`.
  4) Stability when no queued items, when active is null, and when all items are non-queued.

Tests (Integration – light)
- Simulate addToQueue under different strategies; verify resulting order of queued items and `activeItemId` decisions.
- Simulate preemption: ensure that setting `activeItemId` triggers stop/start without duplicate cancels (observe state transitions via mocks in isolation if possible).

Manual QA
- Default Low Diff
  - Start mining a high-difficulty item (e.g., POW 38).
  - Add a lower-difficulty item (e.g., POW 21). Expect:
    • New item inserted at front.
    • Active switches to new id; mining of the old item stops once; new job starts.
  - Add another low item while paused; resume; confirm order and behavior.

- FIFO
  - Add 3 items; ensure append order is preserved and no preemption occurs.
  - Manually reorder; confirm that next item is the first queued and order remains stable.

- LIFO
  - Add 3 items; ensure each new item goes to the front but does not preempt automatically.

- Preferences vs Panel
  - Change in Preferences reflects in panel selector and vice versa.
  - Persist across reloads.

Acceptance Checklist
- Preemption works only in Low Diff; immediate and single-cancel.
- Manual ordering works for all strategies without hidden re-sorts.
- Preferences and quick selector stay in sync; choices persist.
- No ghost updates or lost mining state on preemption/resume.

