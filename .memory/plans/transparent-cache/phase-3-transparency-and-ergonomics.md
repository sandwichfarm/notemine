Phase 3 — Transparency and Ergonomics

Purpose
- Ensure agents/components benefit “for free” without new concepts or APIs, while allowing optional tuning.

API Surface (minimal and optional)
- Keep existing public calls:
  - `initializeCache`, `loadCachedEvents`, `setupCachePersistence`, `getCacheStats`, `clearCache`, `closeCache`.
- Add optional helpers (with defaults):
  - `configureCacheRetention(config?: Partial<RetentionConfig>)` — override budgets.
  - `pruneCacheNow(reason?: string)` — manually trigger compaction (debug tools only).
  - `forceCacheFlush()` — flush pending ingest buffer immediately (debug/testing).

Integration
- Stay in App bootstrap (packages/gui/src/App.tsx). No provider/consumer changes for agents.
- No new hooks are required; EventStore remains the single source of truth for app state.

Preferences
- Introduce an optional “Enable local cache” and “Debug cache logs” toggle in preferences, default on (only visible when COI available).
- Keep defaults sensible so users don’t need to touch preferences to benefit.

Diagnostics
- Respect existing debug preference (packages/gui/src/lib/debug.ts). All cache logs go through this gate.
- Add a small stats panel (existing CacheStats) that shows extended counts if cache is enabled; show a plain message if COI is disabled.

Acceptance
- Existing UI continues to function with zero code changes by agents.
- Turning debug on shows cache ingest/compaction activity; turning it off silences logs.

