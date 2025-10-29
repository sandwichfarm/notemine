Phase 2 — Queue Panel Quick Selector

Purpose
- Add a compact, frictionless control to switch queue ordering in the queue panel.

Scope
- UI-only: a segmented control or small dropdown in `QueuePanel` header.
- Writes to preferences via `PreferencesProvider.updatePreference('queueOrderingStrategy', ...)`.

Contracts
- Strategies: `lowDifficultyFirst` (default), `fifo`, `lifo`.
- Changing the selector does not re-sort existing items automatically; it affects:
  - Placement of newly queued items.
  - Default “next item” selection when no active item is pinned.
  - Preemption rules when `lowDifficultyFirst`.
- Manual reordering always remains available and takes precedence over default selection.

UI/UX
- Placement: right side of the queue panel header, next to Auto and Pause/Resume.
- Style: 3-option segmented control with tooltips.
  - Low Diff (icon: downwards zigzag or speedometer) → “Prefer lower difficulty (default)”
  - FIFO (icon: queue/list) → “First in, first out”
  - LIFO (icon: stack) → “Last in, first out (stack)”
- Accessibility: keyboard focusable, ARIA labels for each option.
- Link to Preferences page for detailed explanations.

Data Types
- Uses `queueOrderingStrategy` from preferences; values: `'lowDifficultyFirst' | 'fifo' | 'lifo'`.

Control Flow
- On mount: read `preferences().queueOrderingStrategy` and set control state.
- On change: `updatePreference('queueOrderingStrategy', value)`; no reflow/re-sort of items.
- The `QueueProvider` logic picks up the new strategy on subsequent `addToQueue()` calls.

Edge Cases
- No queued items: the control remains enabled.
- Queue paused: changing strategy does not auto-start mining.
- Active mining: strategy change does not preempt by itself; only new item adds can preempt under Low Diff.

Diagnostics
- On change: debug log old→new strategy.

Acceptance
- Selector shows 3 options, persists selection across reloads, and matches Preferences.
- No unexpected reordering occurs on toggle; manual ordering continues to work.

Terminology
- LIFO: Last-In, First-Out (stack). New items appear at the front; no automatic preemption.
