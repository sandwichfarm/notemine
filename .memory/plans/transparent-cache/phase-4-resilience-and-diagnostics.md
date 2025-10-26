Phase 4 — Resilience and Diagnostics

Purpose
- Harden the cache against environmental and runtime issues; add light observability.

Resilience
- COI Required: assert COI at startup; if missing, show a blocking banner with fix instructions (dev: set `VITE_ENABLE_COI=1`; prod: add COOP/COEP headers). Do not continue without COI, since WebSockets and WASM will fail.
- Quota/Storage Errors: on error, back off ingest (pause writes), run compaction with tightened budgets, then resume; if still failing, disable cache for the session with a debug log.
- Multi‑Tab: optional leader‑election (e.g., BroadcastChannel) so only one tab runs the compactor. Writes remain idempotent so multi‑writer is safe, but compaction becomes single‑writer.
- Burst Protection: ingest buffer drains across multiple ticks; measure flush durations; cap per‑tick work to maintain responsiveness.

Diagnostics
- Metrics (debug‑only):
  - lastFlushDurationMs, pendingQueueDepth, rowsWritten, rowsDeleted, totalRows
  - compactionRuns, compactionDurationMs, prunedByKind
- Logging cadence: at most once per second for ingest summaries; once per compaction cycle for retention summaries.

Acceptance
- Under heavy scrolling/network activity, UI remains responsive; no unbounded growth; logs show backpressure draining.
- Quota errors are handled without crashes; cache disables gracefully when unrecoverable.
