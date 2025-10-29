Phase 1 — Baseline Ingest & Load Expansion

Purpose
- Persist “everything we see” with low latency and expand what we reload from cache to make it immediately useful.

Scope
- packages/gui/src/lib/cache.ts, packages/gui/src/App.tsx, packages/gui/src/components/CacheStats.tsx
- No external package changes required; prefer additive changes and tuned parameters.

Design
- Ingest
  - Keep `persistEventsToCache` but tune to `batchTime ~ 1000ms`, `maxBatchSize ~ 1000` and add a drain loop: if more than `maxBatchSize` present, continue flushing until empty.
  - Add a direct EventStore subscription (catch‑all): subscribe to the global “event added” stream (or equivalent) and enqueue to the same buffer used above. This ensures any event that makes it into EventStore is persisted without relying on helper semantics.
  - Ensure all areas that already add to EventStore (timeline, reactions, replies, profile loads, embeds, publishing) benefit transparently.

- Load from cache
  - Expand `loadCachedEvents` to include the following kinds with sensible limits:
    - 1 (notes): 2000
    - 30023 (long‑form): 200
    - 0 (metadata): 2000
    - 3 (contacts/follows): 1000
    - 6 (reposts): 500
    - 7 (reactions): 2000
    - 10002 (relays lists): 2000 (higher priority for current user + follows in Phase 2)
  - Add small dedupe in the main EventStore add loop (already handled by EventStore) and ignore errors.

- Stats
  - Extend `getCacheStats()` to report counts for 1/0/3/6/7/30023/10002 and total.
  - Keep UI unchanged; CacheStats will automatically show a larger total when invoked.

- COI enforcement (required)
  - Dev: require `VITE_ENABLE_COI=1` so Vite serves with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`.
  - Prod: serve the SPA with the same headers (Caddy/nginx). Keep CSP `connect-src` permitting `ws:` and `wss:`.
  - At runtime, assert `window.crossOriginIsolated === true`; if false, block with instructions until headers are fixed.

Control Flow
- App boot → initializeCache → loadCachedEvents → setupCachePersistence (tuned) → subscribe to EventStore add stream → enqueue → periodic flush until empty.

Edge Cases
- Bursts larger than `maxBatchSize`: drain loop prevents drops; batch more times until queue is empty.
- Duplicate events: rely on UNIQUE constraint; log only non‑duplicate errors.

Diagnostics
- When debug enabled: log batch sizes, queue depth on each tick, and flush durations at most once per second.

Acceptance
- After normal browsing, CacheStats shows materially larger totals than before (kinds 1/7/0/3/6/30023/10002 populated).
- Under load (e.g., infinite scroll), no fatal errors, and persisted count continues to grow with time.
- On reload, timeline/profile pages render with cached data before network completes.
