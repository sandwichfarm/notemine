Cache Layer and WASM Caching Plan (Overview)

Purpose
- Add a reliable caching layer that integrates cleanly with existing applesauce EventStore + RelayPool flow, and enable applesauce/wasm caching without breaking development workflows.
- Ensure the solution is fault tolerant, cross‑browser mindful, and minimizes refactors to the current, functional app.

Top‑Level Goals
- Enable WASM caching for the miner with robust fallbacks.
- Preserve WebSocket functionality in development while enabling cross‑origin isolation (COI) where required for optimal caching/performance.
- Introduce a cache layer that complements EventStore and RelayPool without changing public APIs.
- Maintain NIP‑13 semantics and existing wrapper responsibilities (lifecycle, resume, diagnostics).

Scope
- GUI (Vite) server headers + runtime detection to support COOP/COEP in a dev‑friendly way.
- Wrapper/worker changes to initialize wasm with caching (IDB compiled‑module cache when COI is available; CacheStorage/bytes fallback otherwise).
- Event caching that plays nicely with EventStore (cache in front of relays, preserve EOSE semantics, dedupe, persistence).
- No wholesale refactor; minimize changes to public contracts.

Architecture Summary
- Headers/COI: Use COOP: same‑origin + COEP: credentialless by default (prod), opt‑in toggle for dev. This preserves cross‑origin WebSockets and avoids CORP breakage during development.
- WASM caching (worker):
  - Primary: IndexedDB store for compiled WebAssembly.Module keyed by content hash (requires crossOriginIsolated).
  - Fallback: CacheStorage of raw wasm bytes + instantiate/compile with browser code cache; key by content hash + version.
  - Last resort: in‑memory cache for session.
- Event cache (between EventStore and relays):
  - Read‑through: Emit from cache immediately, then merge/dedupe with live relay results.
  - Write‑through on new relay events; respect EOSE and per‑relay completeness.
  - TTL + LRU eviction; compat with EventStore’s indexing.
- Integration: Preserve existing applesauce loader APIs; expose a small options object (enableCache, cacheTTL, maxEntries) with safe defaults.

Key Contracts & APIs (high‑level)
- GUI headers: vite.config adds `server.headers` and `preview.headers` for COOP/COEP; env flag `VITE_ENABLE_COI` controls dev on/off.
- Worker wasm init: `initWasmWithCache(bytes, { dbName, moduleKey, allowUnisolatedCache }) => Promise<void>`
- Cache layer options (GUI loaders): `{ enableCache?: boolean; cacheTTL?: number; maxEntries?: number; }`

Data Types (high‑level)
- Wasm cache keys: `{ moduleKey: string; version: string; hash: string }`
- Event cache entries: `{ id: string; kind: number; created_at: number; json: string; relays?: string[]; seenAt?: number }`
- Filter key: stable JSON of applesauce filter + ordered relay set.

Control Flow (high‑level)
1) GUI starts with COI headers (prod default; dev gated) → `crossOriginIsolated` detection at runtime.
2) Worker `initWasmWithCache` tries IDB compiled‑module if COI; else falls back to CacheStorage → bytes.
3) When GUI creates a timeline/address/event loader, cache is consulted first for the filter; results are emitted; live relay results stream in and are merged/deduped; cache updates.
4) Progress and persistence continue to follow wrapper responsibilities (currentNonce/hashRate, runId isolation, throttle persistence).

Edge Cases to Handle
- COEP:credentialless unsupported browser → fallback to require‑corp (prod) or disable COI (dev), disable compiled‑module cache.
- IDB blocked/quota → fallback to CacheStorage → memory.
- Service Worker caching interference in dev → gated clear switch `?nocache=1` (one‑shot) already documented in repo guidance.
- Relay flakiness / partial EOSE → cache emits partial results; loader tracks per‑relay EOSE to know completeness.

Diagnostics
- Gate logs under debug preference: headers mode, crossOriginIsolated status, wasm cache mode (IDB/CacheStorage/memory), cache hits/misses, relay completion stats, periodic kH/s.

Acceptance
- Dev: HMR + Nostr WebSockets remain functional with `VITE_ENABLE_COI` on; wasm compiles once and is reused on reload.
- Prod: First run compiles wasm then subsequent loads reuse compiled module; timelines show cached events instantly, then merge with live relay results; no ghost updates; tags and created_at preserved per NIP‑13.

Phases
- Phase 1: Headers & COI strategy
- Phase 2: WASM caching in worker
- Phase 3: Event cache layer integrating with EventStore/RelayPool
- Phase 4: Integration hardening & fault‑tolerance
- Phase 5: Rollout, ops, acceptance

