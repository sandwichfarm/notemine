Phase 1 — Headers & COI Strategy

Purpose
- Enable cross‑origin isolation in a way that does not break localhost dev websockets or applesauce relay usage, and supports wasm caching where possible.

Scope
- Add COOP/COEP headers in GUI dev and preview servers via Vite config, gated by an env flag.
- Provide runtime detection and graceful degradation when COI isn’t possible.

Contracts & APIs
- Env flag: `VITE_ENABLE_COI` (default: false in dev, true in prod builds).
- Headers when enabled:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: credentialless`
- Runtime: `window.crossOriginIsolated === true` → enables compiled‑module caching and multithread (if applicable).

Data Types
- None beyond booleans/flags.

Control Flow
1) Vite dev/preview loads with headers only when `VITE_ENABLE_COI=1`.
2) App boots and checks `crossOriginIsolated`.
3) Worker init selects wasm cache tier based on detection.

Edge Cases
- Browsers without COEP:credentialless support: prod builds may switch to `COEP: require-corp` if allowed by asset mix; dev should disable COI to keep iteration smooth.
- Assets from third‑party origins (fonts/images): with credentialless, these load without credentials; prefer `crossorigin="anonymous"` for fonts as needed. Avoid fetch with credentials to cross‑origin assets while using credentialless.
- WebSockets: unaffected by COEP; if a browser regression occurs, set `VITE_ENABLE_COI=0` locally without changing code.

Diagnostics
- On app start (debug mode): log header mode (credentialless/require-corp/disabled) and `crossOriginIsolated`.

Acceptance
- Local dev: HMR + applesauce relay WebSockets keep working with `VITE_ENABLE_COI=1`.
- Prod: COI enabled by default; no subresource breakage; wasm cache Tier 1 becomes available.

Implementation Notes (Vite)
- Edit `packages/gui/vite.config.ts`:
  - Read `VITE_ENABLE_COI`.
  - If enabled, set `server.headers` and `preview.headers` for COOP/COEP credentialless.
- Keep opt‑out easy for dev with `.env.local`.

