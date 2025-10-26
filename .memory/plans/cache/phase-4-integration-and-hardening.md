Phase 4 — Integration & Hardening

Purpose
- Integrate Phase 1–3 into the app with minimal surface changes, ensuring lifecycle correctness and resilience.

Scope
- Wire the COI headers behind env flags.
- Switch worker init to use wasm cache helper.
- Wrap applesauce loaders with cache adapter, default‑on with safe TTL.

Contracts & APIs
- No breaking changes to public wrapper or GUI APIs.
- New env variables (optional):
  - `VITE_ENABLE_COI` → enable headers in dev.
  - `VITE_CACHE_TTL_MS` → override default cache TTL.
  - `VITE_CACHE_MAX_ENTRIES` → override max entries.

Control Flow & Safety
- Run identifier isolation already enforced by wrapper → keep it.
- Persistence guard (nonces): do not persist when worker nonces are defaults (`["0".."N‑1"]`).
- Throttle persistence of cache write‑through to avoid chattiness (e.g., batch updates every 250–500ms).
- Fallback ladder for wasm cache (IDB → CacheStorage → memory) with single log line noting chosen tier.

Edge Cases
- Browser COI changes mid‑session (rare): treat as non‑COI; worker will keep using active tier until reload.
- Service worker interference: expose `?nocache=1` one‑shot clear (doc only; already recommended in repo guidance).
- Ghost updates: maintain runId guards in miner and ensure loader cache updates are bound to current subscription instance.

Diagnostics
- Add gated logs:
  - Chosen wasm cache tier and timings.
  - Cache hit/miss and EOSE per relay (coarse cadence).
  - Total kH/s summary every 1–2s (existing pattern).

Acceptance
- Mining lifecycle remains predictable: `mine`, `pause`, `resume`, `cancel`, and `result` unchanged.
- No hidden concurrent sessions; on cancel, the queue proceeds.
- Cache reduces startup latency and bandwidth without behavioral regressions.

