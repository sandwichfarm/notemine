Phase 3 — Preferences Page (Queue Ordering)

Purpose
- Provide a spacious, explanatory UI to choose the queue ordering strategy.

Scope
- Preferences page: a new “Queue Ordering” section under Mining or UI.
- Description, examples, and behavior notes.

Contracts
- Preferences adds: `queueOrderingStrategy: 'lowDifficultyFirst' | 'fifo' | 'lifo'` with default `lowDifficultyFirst`.
- Modifying this field updates localStorage and drives both the queue panel selector and queue logic.

UI/UX
- Use a radio group with 3 options and rich descriptions:
  - Low Difficulty First (default)
    • New lower-difficulty jobs jump to the front and preempt the current one.
    • Example: mining POW 38, a new POW 21 is added → POW 21 starts next (preempt).
  - FIFO
    • First in, first out; new jobs go to the end.
    • No automatic preemption.
  - LIFO (Stack)
    • Last in, first out; new jobs go to the front.
    • No automatic preemption.
- Add a brief note: “Manual ordering always works and overrides defaults.”
- Include “Learn more” link to a short tooltip or inline help summarizing preemption rules.

Data Types
- Same as Phase 2.

Control Flow
- On load: show current preference value.
- On change: `updatePreference('queueOrderingStrategy', value)`.
- No auto resort of existing items; the choice affects future additions and default next selection.

Edge Cases
- If the user switches to Low Diff while a high-difficulty job is mining, nothing changes until a new, lower-difficulty item is added or the user manually reorders.

Diagnostics
- Log preference changes only when debug is enabled.

Acceptance
- Strategy choice is visible, clear, and persists across reloads.
- Descriptions explain behavior, including preemption under Low Diff.
- Queue panel selector mirrors the same value.

