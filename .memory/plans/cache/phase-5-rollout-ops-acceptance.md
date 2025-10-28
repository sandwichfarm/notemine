Phase 5 — Rollout, Ops, Acceptance

Purpose
- Define deployment toggles, validation steps, and acceptance criteria for a hardened release.

Scope
- Rollout headers and caching progressively; verify on a matrix of browsers/environments.

Operations & Toggles
- Env:
  - Dev: `VITE_ENABLE_COI=0` by default; enable per‑developer once verified locally.
  - Prod: `VITE_ENABLE_COI=1` default; can disable to mitigate unforeseen issues.
  - Cache tuning: `VITE_CACHE_TTL_MS`, `VITE_CACHE_MAX_ENTRIES`.
- Build: always use `pnpm -w -r build` when touching core/wrapper.
- GUI dev cache clear (optional): append `?nocache=1` once to clear SW/CacheStorage.

Validation Checklist
- Dev
  - HMR works with `VITE_ENABLE_COI=1`.
  - Nostr relay WebSockets connect and stream as before.
  - On reload, wasm initializes faster (cache hit visible in logs).
- Prod
  - First session compiles wasm; subsequent open shows cache hit path.
  - Timeline/profile loads show cached items instantly, then merge deduped live results.
  - Per‑relay EOSE tracked correctly; no ghost updates after pause/cancel.
  - NIP‑13 invariants preserved (stable created_at; normalized tags; resume nonces respected).

Diagnostics & Observability
- Enable “debug mode” preference to surface:
  - Header mode + crossOriginIsolated status.
  - Wasm cache tier and hit/miss counters.
  - Event cache hit/miss; per‑relay completion counts.
  - Total kH/s summaries.

Acceptance Criteria
- No broken WebSocket flows in dev or prod.
- Wasm caching demonstrably reduces cold‑start after first run.
- Event cache reduces network chatter and pop‑in without duplication.
- No regressions in mining lifecycle or queue behavior.

Fallback Plan
- If COI issues surface in production, flip `VITE_ENABLE_COI=0` and rely on bytes cache tier.
- If IDB quota errors are frequent, reduce TTL/max entries or temporarily disable persistent event cache.

