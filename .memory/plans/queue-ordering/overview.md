Queue Ordering Strategies — Plan Overview

Purpose
- Introduce flexible queue ordering strategies for mining jobs.
- Default to “Prefer Low Difficulty” with preemptive behavior for faster UX.
- Preserve manual ordering capabilities across all strategies.

Goals
- Add strategies: Low Difficulty First (default), FIFO, and LIFO.
- Quick selector in the queue panel; detailed control in Preferences with explanations.
- Preempt active job when a much lower difficulty job is added (per spec example).
- Keep lifecycle predictable: single active miner session, safe pause/cancel, and state persistence.

Scope
- GUI-only changes: preferences, queue provider, queue processor integration, and UI.
- No changes to core/WASM; wrapper lifecycle remains unchanged.

Non-Goals
- Continuous auto-sorting of existing items behind the user’s back.
- Changing mining state throttle or worker management.

Key Principles
- Manual ordering always works and is never overridden by background resorting.
- Strategy applies to: new item placement, next-item selection defaults, and preemption rules.
- Safe preemption: update active item id first; let QueueProcessor stop the old run once it detects the change (no double-cancel).

Contracts (short)
- Preferences adds: `queueOrderingStrategy` with default `lowDifficultyFirst`.
- addToQueue() places new items according to strategy.
- For `lowDifficultyFirst`, if a new item’s difficulty is lower than the currently active queued item’s difficulty, it is inserted at the top and becomes active (preempt).
- Manual reorder remains available at all times; reorders set the active job to the first queued item.
- getNextQueuedItem() keeps returning the first queued item to honor manual ordering.

Data Types
- `type QueueOrderingStrategy = 'lowDifficultyFirst' | 'fifo' | 'lifo'`.
- Preferences model adds `queueOrderingStrategy`.

Control Flow
- Add new item: compute insertion index based on current strategy; optionally preempt.
- When active item changes: QueueProcessor observes it, cancels once, then starts/resumes the new active.
- When toggling strategy: do not retroactively reorder existing items; strategy affects future additions and default next selection.

Edge Cases
- Queue paused: allow insertion/preemption of active id without starting mining.
- Multiple rapid additions: stable insertion ordering; don’t thrash mining—preempt only if active changes.
- Active item removed or completed: next selection is first queued item in current list.
- Saved state/persistence: preserved for preempted items; do not overwrite with default nonces.

Diagnostics
- Gated debug logs: insertion decisions, preemption reason, chosen next item id/difficulty, and kH/s summary already present in MiningProvider.

Testing Strategy
- Pure function tests for insertion/preemption logic (`computeInsertionIndex` and `shouldPreempt`).
- Manual QA script for UI flows (panel selector, preferences toggle, manual reordering, preemption while mining).

Acceptance Criteria (high-level)
- Default strategy preempts a higher-difficulty active job when a lower-difficulty job is queued.
- Manual ordering is respected for all strategies.
- Strategy is switchable via queue panel and preferences; selections persist across reloads.
- No ghost updates after pause/cancel; exactly one cancel per preemption.

Terminology
- LIFO: Last-In, First-Out (stack semantics). New items go to the front; no automatic preemption.
