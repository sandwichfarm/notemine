Phase 2 — WASM Caching (Worker)

Purpose
- Speed up startup and repeated sessions by caching the miner’s wasm. Use the strongest available tier with safe fallbacks.

Scope
- Prefer using applesauce’s wasm caching facade if available (e.g., a helper that stores compiled modules); otherwise, extend `packages/wrapper/src/mine.worker.ts` to initialize wasm via `initWasmWithCache`.
- Add a small utility (inline or module) to hash bytes, probe IDB support for `WebAssembly.Module` structured clone, and manage CacheStorage fallback.

Contracts & APIs
- If available: use applesauce cache API (signature TBD by package), mapping to the tiers below.
- Otherwise: `initWasmWithCache(wasmBytes: ArrayBuffer | Uint8Array, opts?: { dbName?: string; moduleKey?: string; allowUnisolatedCache?: boolean }): Promise<void>`
  - moduleKey default: content hash (SHA‑256) + version.
  - Behavior:
    - If `crossOriginIsolated && wasmModuleCloneSupported()` → IDB compiled‑module cache.
    - Else if `allowUnisolatedCache !== false` → CacheStorage raw bytes under `cache://wasm/<moduleKey>`.
    - Else → no persistence; compile per session.

Data Types
- Cache record (IDB): `{ key: string; module: WebAssembly.Module; ts: number }`
- Cache record (CacheStorage): `Response` of wasm bytes; key is URL namespace string derived from moduleKey.

Control Flow
1) Compute `hash` of bytes → `moduleKey` (e.g., `notemine-wasm:<hash>`).
2) Try IDB path when COI available:
   - Open `indexedDB.open('notemine-cache', 1)` with object store `wasmModules(key)`.
   - `get(moduleKey)` → if found, `WebAssembly.instantiate(module, imports)` via `initWasm` wrapper.
   - If not found, `compile(wasmBytes)`, `put({ key, module, ts })`, then init.
3) Else try CacheStorage path:
   - `caches.open('notemine-wasm')`; put `new Response(wasmBytes, { headers: { 'Content-Type': 'application/wasm' }})` under a synthetic `Request` URL derived from moduleKey.
   - On next run, fetch from cache; pass bytes to `initWasm`.
4) Else directly call `initWasm(wasmBytes)`.

Edge Cases
- IDB blocked/quota/transaction errors → fall back to CacheStorage.
- CacheStorage unavailable (very old browsers/blocked) → fall back to memory.
- Inlined wasm (no URL) is fine: we compute hash from the bytes and still cache.
- Different versions: moduleKey hash changes → safe parallel cache entries; optional cleanup policy by LRU later.

Diagnostics
- Log (debug): chosen tier (IDB/CacheStorage/memory), cache hit/miss, compile timings.

Acceptance
- First load compiles; subsequent reloads reuse cached compiled module when COI available.
- On non‑COI browsers, bytes cache reduces download/compile overhead; no regressions.

Implementation Notes
- Start minimally: implement Tier 1 (IDB) and Tier 2 (CacheStorage) in the worker to avoid changes to bundling.
- Keep API surface small and local to worker; `index.ts` remains unchanged except for calling code path.
- Key by wasm content hash to avoid stale module reuse.
