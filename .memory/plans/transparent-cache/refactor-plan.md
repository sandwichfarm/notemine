Transparent Cache: Plan and Design

Purpose
- Capture substantially more Nostr events in the local cache and make it transparent to app/agent code.
- Add a resilient retention mechanism that keeps priority events while bounding storage and work.

Scope
- Client-side cache in GUI (packages/gui) using Turso WASM SQLite via applesauce-sqlite.
- Integrates with existing EventStore/RelayPool plumbing in packages/gui/src/lib/applesauce.ts and cache.ts.
- No changes to core/WASM mining logic (NIP-13 remains unchanged).

Goals
- Ingest: Persist every event the app observes (across timelines, embeds, profiles, reactions, replies, publishing) with low latency and backpressure safety.
- Retention: Tiered budgets by kind and importance; pin user-critical replaceables (0/3/10002), their follows’ 10002, and recent 1/30023; cascade clean-up of reactions/replies to removed roots.
- Transparent: Agents/components continue to use EventStore; cache works behind the scenes. No special usage required.
- Hardened: Handles bursts, duplicates, quota, and multi-tab without corrupting state.
- COI: Treat COI as mandatory (for WebSockets + WASM); enforce in dev and prod.
- Diagnostics: Lightweight, gated logs + simple stats for validation.

Non‑Goals
- No server-side retention changes (relay/internal/retention is separate).
- No new browser storage backend.
- No runtime fallback when COI is missing; the app requires COI (WebSockets and WASM threads).

Current State (observed)
- Cache initializes only when `window.crossOriginIsolated` is true (see packages/gui/src/App.tsx:41). COI is required for WebSockets and WASM.
- Persistence uses `persistEventsToCache` with `batchTime=5000` and `maxBatchSize=100` (packages/gui/src/lib/cache.ts:60) and performs per-event `add` with duplicate suppression.
- `loadCachedEvents` pulls a narrow set of kinds: 1, 30023, 0, 7 (packages/gui/src/lib/cache.ts:102..139). Cached stats also only count these kinds (packages/gui/src/components/CacheStats.tsx).
- EventStore is fed from timeline loaders and ad-hoc requests (e.g., profiles, reactions, replies), but the InfiniteTimeline filters out replies on the initial pull and enforces POW thresholds (packages/gui/src/components/InfiniteTimeline.tsx), limiting how many events ever reach the store in the first place.

Key Gaps (why few notes get cached)
- Misconfigured COI in environments causes the whole app to break (WebSockets) and disables cache.
- Persistence can lag/drop under load if the internal queue grows faster than the 5s/100 flush (unknown behavior of helper under pressure).
- Event ingestion is limited to what the UI asks for; replies and other kinds only flow after specific interactions.
- Load-from-cache is narrow; even if more kinds were persisted, they wouldn’t be surfaced back into the store on boot.

Approach Overview
0) Enforce COI in dev and prod
   - Dev: ensure `VITE_ENABLE_COI=1` so Vite sets `COOP: same-origin` and `COEP: credentialless` (see packages/gui/vite.config.ts). Verify `window.crossOriginIsolated === true` at runtime and fail early with instructions if not.
   - Prod: set headers in the web server (Caddy): `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`. Keep CSP `connect-src` allowing `ws:` and `wss:`. Use `credentialless` to keep cross-origin WebSockets functional.
1) Broaden ingest coverage
   - Subscribe to EventStore’s “all events added” stream and queue for cache persistence (in addition to helper) with small flush interval and unbounded draining until empty.
   - Ensure we add to EventStore whenever we see events (already done across loaders); optionally add a minimal “global listener” wrapper around RelayPool requests to also feed EventStore.
2) Tiered retention policy with budgets
   - P0 pinned: current user’s latest 0/3/10002; follows’ latest 10002.
   - P1 hot content: recent kind 1/30023 by recency window and a total budget; include follows’ latest kind 0 (profiles).
   - P2 support: reactions (7), reposts (6), deletions (5) linked to kept roots; limit standalone lifetimes.
   - P3 other kinds: small TTL and count budgets.
   - Cascading delete: remove reactions/replies when roots are pruned.
3) Compactor and safety
   - Idle/background compactor enforces budgets at coarse cadence (e.g., every 10–15 minutes and on boot/idle).
   - Duplicate-safe inserts; throttled deletes; handle quota errors gracefully by tightening budgets.
4) Transparency + ergonomics
   - Keep the same initialize/load/persist API; add optional configure + prune-now calls with sensible defaults.
   - Keep diagnostics gated by existing debug preference.

Contracts / APIs (proposed extensions)
- `initializeCache(): Promise<AsyncEventStore>` (existing)
- `loadCachedEvents(mainEventStore, opts?): Promise<number>` (extend kinds loaded and limits)
- `setupCachePersistence(mainEventStore, opts?): void` (tune batching, add drain-until-empty loop)
- `configureCacheRetention(config: RetentionConfig): void` (set budgets; optional)
- `pruneCacheNow(reason?: string): Promise<void>` (trigger compaction)
- `getCacheStats(): Promise<CacheStats>` (extend counts: 1/0/3/6/7/30023/10002/total)
- `closeCache(): Promise<void>` (existing)

Data Types (proposed)
- `RetentionConfig`
  - `maxTotalEvents` (e.g., 100k default)
  - `kinds: { [kind: number]: { ttlDays?: number; maxCount?: number; perAuthorMax?: number; pinAuthors?: string[] } }`
  - `pin: { userPubkey: string; followsPubkeys: string[] }`
  - Defaults pin current user 0/3/10002 and follows 10002.
- `CacheStats`
  - counts by kind and total; optionally bytes if feasible.

Control Flow
- Boot (packages/gui/src/App.tsx)
  1) Assert COI (fail fast with clear guidance if not). `initializeCache()` → `loadCachedEvents(eventStore)`
  2) `setupCachePersistence(eventStore, { batchTime: 1000, maxBatchSize: 1000, drain: true })`
  3) `configureCacheRetention(defaults)` → schedule first compaction in ~1 minute
- Ingest
  - Subscribe to EventStore’s add stream; enqueue events → periodic flush with backpressure until queue empty
  - Keep the existing helper as a fallback; ensure no double-writes via idempotent add
- Retention
  - On interval and at boot, run compaction:
    - Ensure pinned replaceables present and deduped (latest per pubkey per kind)
    - Enforce budgets per kind and global max; delete oldest beyond thresholds
    - Cascade delete reactions (7) and replies (1) of pruned roots
- Diagnostics
  - When debug on: log batch sizes, queue depth, compaction actions, and summary stats at coarse cadence

Edge Cases
- COI disabled/missing headers: treat as fatal misconfiguration; show blocking UI with short instructions for dev (set `VITE_ENABLE_COI=1`) and prod (enable COOP/COEP headers). Do not start the app.
- Storage quota errors: reduce budgets and retry compaction; disable ingest temporarily if persistent
- Bursty traffic: backpressure queue drains across multiple ticks; drops nothing; duplicates ignored by UNIQUE constraint
- Multi-tab: optional leader-election to run compactor in one tab; ingest can remain per-tab since writes are idempotent

Acceptance
- Ingest coverage: ≥95% of events added to EventStore are persisted within 30s under normal load; no fatal errors
- Retention: total rows remains within `maxTotalEvents`; P0 items always present; P1 recent content maintained for the target window
- Reload: `loadCachedEvents` yields visibly populated timeline/profile data immediately (no relay calls needed to render last state)
- Diagnostics: with debug on, stats show non-zero counts across more kinds, and compaction logs appear at expected cadence

Phases
- Phase 1: Baseline ingest & load expansion
- Phase 2: Retention and priority tiers
- Phase 3: Transparency and ergonomics
- Phase 4: Resilience and diagnostics
- Phase 5: Rollout and ops
