**Purpose**
- Prevent resume regressions caused by queue ordering, preemption, and worker‑count drift between sessions.

**Scope**
- Resume worker‑count policy, queue reorder persistence, validation + diagnostics.

**Goals**
- Default to saved `numberOfWorkers` on resume (clamped), unless user explicitly overrides.
- Persist queue state immediately on manual reorder to avoid stale active item/order on refresh.
- Add diagnostics to make resume decisions transparent (saved vs chosen workers, min/max nonces, preemption).

**Contracts**
- `resume(queueItem)`: Use `queueItem.miningState.numberOfWorkers` when present; clamp to `1..hardwareConcurrency`.
- Preferences override: A dedicated preference (e.g., `resumeUseSavedWorkers=false|true`) controls whether to prefer saved count or user prefs; default true.
- `QueueProvider.reorderItem`: Calls `flushQueue()` after setState.

**Control Flow**
- QueueProcessor detects active item → calls `resumeMining(queueItem)`.
- MiningProvider chooses workers: if `resumeUseSavedWorkers` then use saved count; else prefs.
- Wrapper resumes with matching worker count ⇒ avoids remap/min regression.

**Edge Cases**
- Saved `numberOfWorkers` > hardware concurrency ⇒ clamp and log.
- Missing saved `numberOfWorkers` ⇒ fall back to preferences.
- User explicit “use all cores” setting ⇒ override saved count.

**Diagnostics**
- Log on resume: saved vs chosen workers, `workerNonces.length`, min/max nonces, and whether remap will occur.

**Acceptance**
- Resuming the same job after long runs shows workers starting near prior frontiers (no “far behind”).
- Manual reorder + refresh keeps the intended active item and ordering.
