Phase 3 — Event Cache Layer (with EventStore)

Purpose
- Add a persistent, read‑through cache that complements applesauce EventStore without changing external loader contracts. Provide instant UI on reload and fewer relay hits.

Scope
- Introduce a cache adapter that wraps applesauce loaders (timeline, event, address, reactions) and RelayPool requests.
- Persist events and recent filter results in IndexedDB; dedupe into EventStore.

Pipeline
- `eventReq` (GUI loader call)
  ← EventStore (in‑memory indexes)
  ← Cache (IDB: events + filter lists; fast replay)
  ← Relays (applesauce RelayPool websocket streams)

Contracts & APIs
- Loader option shape (non‑breaking additions):
  - `{ enableCache?: boolean; cacheTTL?: number; maxEntries?: number }`
  - Defaults: `enableCache=true`, `cacheTTL=5 * 60_000`, `maxEntries=50_000` (tuneable).
- Filter key: stable string from the filter object plus canonicalized relay set.
- Cache DB: `notemine-events`
  - Stores:
    - `events(id)` — `{ id, json, kind, created_at, relays?: string[], seenAt }`
    - `filters(key)` — `{ key, ids: string[], ts, relaysComplete?: string[] }`

Data Types
- Event record: normalized JSON string for lossless replay into EventStore.
- Filter entry: ordered event ID list for quick read‑through; optional per‑relay completion markers.

Control Flow
1) Loader start → compute `filterKey`.
2) Cache read:
   - Load `filters[filterKey]` if not expired; stream its `events[id]` into the loader (and EventStore), marking them as “cached”.
3) Live query:
   - Call existing applesauce RelayPool/loader. For each incoming event:
     - Dedupe against EventStore by `id`.
     - Append to `filters[filterKey].ids` (de‑duped) and persist event JSON if new.
     - Track relay completion (EOSE) per relay; when all relays complete, set `relaysComplete` for filterKey.
4) Expiration & eviction:
   - Evict oldest filter entries by LRU if `maxEntries` exceeded; TTL expiry check at read time.

Edge Cases
- Multiple overlapping filters: keys must be canonicalized and stable; avoid giant filter blobs by ordering and JSON stable stringify.
- Partial relay completion: UI should still render cached + partial live; mark completion only when all relays EOSE or timeout.
- Storage quota: on quota errors, fall back to memory only; log once.

Diagnostics
- Log (debug): cache hit/miss for filterKey, counts of emitted cached events, per‑relay EOSE and completion times.

Acceptance
- On reload, timelines and profiles render cached content quickly, then reconcile live updates from relays.
- Event duplication is avoided; EventStore indexes remain accurate.
- Cache does not inflate tags across resumes; tag normalization remains the wrapper’s job.

Implementation Notes
- Place the cache adapter alongside GUI applesauce setup (`packages/gui/src/lib/applesauce.ts`).
- Keep the existing applesauce loaders; wrap their Observables with a read‑through prelude and write‑through tap.
- Use applesauce EventStore for in‑memory indices; cache persists only the minimal necessary JSON.
