Repository Agent Guide

Purpose
- Help agents work safely and effectively in this repo.
- Encourage clear planning, correct builds, and robust changes.

Planning and Design
- Before coding, write a short phase‑oriented plan (low‑level design). Store it under `.memory/plans/<project-name>/` (one directory per project or sprint).
- Use concise, structured docs that specify: goals, scope, contracts, APIs, data types, control flow, edge cases, diagnostics, tests, and acceptance.
- Keep the core/WASM minimal and standards‑compliant (NIP‑13). Put lifecycle, state, and ergonomics in the wrapper and app layers.

Build and Workspace
- Always build the whole workspace when changing core or wrapper:
  - `pnpm -w -r build`
- GUI depends on local workspace packages; ensure deps use `workspace:^` so local changes are picked up.
- When testing the GUI, if dev caching is suspected, start the dev server fresh. In development you can optionally use `?nocache=1` in the URL to clear Service Worker/CacheStorage once. Do not clear the mining queue by default.

Mining Semantics (must‑haves)
- NIP‑13 event hashing only; the core should not own lifecycle policy.
- Progress signals must include `currentNonce` (for resume) and `hashRate` (for UX). The wrapper must not overwrite saved state with default nonces.
- `created_at` must remain stable for a mining session and be preserved across resume.
- Tags must be normalized: dedupe by content; ensure default tags exist exactly once.

Wrapper Responsibilities
- Manage lifecycle: `mine`, `pause`, `resume`, `cancel`, and `result` with predictable behavior.
- Isolate sessions using a run identifier; ignore messages from old runs (prevents ghost updates).
- Track per‑worker nonces and aggregate rates; expose Observables for progress, bestPow, and results.
- Guard persistence: throttle updates and skip persisting when worker nonces match defaults (`["0".."N-1"]`).

GUI and Queue
- Use a single active miner session via the provider. Do not spawn hidden concurrent sessions.
- Persist mining state safely (see wrapper responsibilities). Respect preferences (e.g., number of workers, resume policy, debug mode).
- On clear/stop/skip, call cancel exactly once and allow the queue to proceed.

Diagnostics
- Prefer lightweight, gated logs (enable via a debug preference). Log chosen workers, worker counts, active worker IDs, nonce samples on persistence, and total kH/s at a coarse cadence.

Coding Guidelines
- Keep changes minimal and focused; do not introduce unrelated refactors.
- Follow existing style; avoid one‑letter identifiers; no license/header churn.
- Prefer small, composable modules with clear contracts.
- Add tests where practical; prioritize lifecycle, persistence, and resume correctness.

Tooling in this environment
- Use `apply_patch` for file edits. Do not run destructive commands.
- When searching or listing files, prefer `rg` for speed.
- Read files in chunks ≤ 250 lines to avoid truncation.
- When you must run a build, build the entire workspace as noted above.

Common Pitfalls to Avoid
- Forgetting to rebuild core/wrapper and GUI together → changes not reflected.
- Overwriting saved mining state with default nonces → progressive slowdown on resume.
- Letting messages from a previous run update current state → ghost hash‑rate/progress after pause/cancel.
- Inflating tags across resumes → larger event payloads and worse throughput.

Planning Format Usage
- Maintain phase‑oriented plans in `.memory/plans/<project-name>/`. Use a top‑level overview (e.g., `refactor-plan.md`) and phase docs (e.g., `phase-1-*.md`, `phase-2-*.md`, etc.).
- Each plan should include: purpose, scope, contracts, APIs, data types, control flow, edge cases, diagnostics, and acceptance.
- Keep these docs living and concise; update them as you learn during implementation. When starting a new project/sprint, create a new `<project-name>` directory.
