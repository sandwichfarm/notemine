Phase 5 — Rollout and Ops

Purpose
- Safely ship the cache upgrades and provide a smooth path to enablement.

Rollout
- COI: mandatory in both dev and prod.
  - Dev: set `VITE_ENABLE_COI=1` (Vite already emits `COOP: same-origin` and `COEP: credentialless`).
  - Prod: add these headers at the edge; for Caddy, set in the site’s `header` block.
- Feature/Gate: you may keep a UI toggle to enable/disable “local cache”, but it does not remove the COI requirement.
- Incremental: Phase 1 (ingest/load) lands first; monitor; then Phase 2 (retention). Keep ability to toggle retention separately if needed.
- Tuning: adjust batch sizes and budgets based on observed storage and performance.

Operational Guidance
- Build: no changes to workspace build; GUI picks up cache code.
- Dev: require `VITE_ENABLE_COI=1` when running the dev server so `window.crossOriginIsolated` is true and both WebSockets and WASM threads work.
- Prod (Caddy): ensure headers
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: credentialless`
  - CSP `connect-src` includes `ws:` and `wss:` (already present) and any relay origins in use.
- Dev cache: when testing GUI, use `?nocache=1` once to clear SW/CacheStorage if needed (per AGENTS.md). Do not clear the mining queue by default.
- Validation: use CacheStats UI and debug logs to confirm ingest and compaction; verify kinds distribution grows.

Acceptance
- Enabling the cache on COI-enabled environments yields materially faster warm loads (notes, metadata visible before network).
- No regressions when the cache is disabled.
