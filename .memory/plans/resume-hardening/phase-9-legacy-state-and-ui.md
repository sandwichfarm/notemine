**Purpose**
- Handle legacy/minimal saved state (legacy `bestPow` without `workersPow`) to avoid UI/semantic mismatches.

**Scope**
- Wrapper restore rules and UI derivation of Highest Diff.

**Rules**
- Wrapper restore:
  - If `workersPow` exists and non‑empty ⇒ seed `workersPow$` and set `highestPow$ = max(workersPow)`.
  - If only legacy `bestPow` exists ⇒ do NOT set `highestPow$` immediately; store as `savedBestPow` (internal) and expose via separate observable (optional) or let GUI derive header from workers.
- GUI header derivation:
  - If provider’s `workersBestPow` non‑empty ⇒ header uses `max(workersBestPow)`.
  - Else ⇒ optionally show a subtle “Saved Best” badge with legacy bestPow or keep header blank until current session best appears.

**Edge Cases**
- Empty `workerNonces` + non‑empty `workersPow`: treat as real resume for bests, but workers start from defaults; UI will show header best until new bests arrive.

**Diagnostics**
- Log which path was used to seed Highest Diff (workers map vs legacy) to aid troubleshooting.

**Acceptance**
- After refresh with legacy state, header no longer shows a best that per‑worker cards cannot account for; either derived from map or labeled as saved.
