Phase 2 — Retention and Priority Tiers

Purpose
- Keep the cache bounded and fast while guaranteeing high‑priority data stays available.

Priority Model
- P0 (pin/no-evict):
  - Current user’s latest replaceables: kinds 0, 3, 10002 (exactly one up‑to‑date record per kind).
  - Follows’ latest 10002 (relay lists).
- P1 (hot content):
  - Recent kind 1 (notes) and 30023 (long‑form) with a recency window and a global budget.
  - Follows’ latest kind 0 (profiles) — prefer to keep one current profile per follow.
- P2 (supporting):
  - Reactions (7), reposts (6) linked to kept root events; allow longer TTL when attached to kept roots, shorter otherwise.
- P3 (other):
  - Everything else with small TTLs and conservative count caps.

Default Budgets (initial values)
- Global: `maxTotalEvents = 100_000` (tuned via config)
- P0 pinned: no TTL; latest per pubkey per kind; O(N_users + N_follows)
- Kind 1: keep 50_000 or 14 days, whichever smaller; per‑author cap 1000
- Kind 30023: keep 1_000 or 60 days; per‑author cap 100
- Kind 7 (reactions): keep 30 days if linked to a kept root, else 7 days
- Kind 6 (reposts): keep 30 days if linked to a kept root, else 14 days
- Follows’ kind 0 (profiles): keep latest one per follow; TTL 90 days; counted under P1 budget
- Kinds 0/3/10002 (non‑pinned/non‑follow authors): keep latest only; TTL 90 days as safety

Compaction Algorithm (coarse cadence, e.g., every 10–15 min)
1) Rebuild pinned sets
   - For user pubkey: upsert the single latest 0/3/10002; never delete these.
   - For follows: upsert the single latest 10002 per follow.
2) Enforce per‑kind budgets
   - For kinds with `maxCount`: delete the oldest beyond the limit (order by `created_at` ascending), respecting P0 pins.
   - For kinds with TTL: delete events older than (now − TTL), unless linked to a kept root and policy extends TTL.
3) Cascade deletes
   - For each deleted root (1/30023), delete reactions (7) and replies (1) referencing it.
4) Enforce global `maxTotalEvents`
   - If over budget, evict across P3 → P2 → P1 in that order until under budget (never evict P0).

Implementation Notes
- Use existing `getByFilters`/`removeByFilters` where possible; if API limits expressiveness, fetch IDs to delete in batches and remove by ID (if supported), or by time ranges.
- Maintain small lookup sets of “kept roots” (IDs of retained 1/30023) in memory during a compaction cycle to drive cascades and linked TTL decisions.
- Throttle compaction work and break into small async chunks to keep UI responsive.
 - When building P1, resolve the follow set (kind 3 of current user) and ensure exactly one most‑recent kind 0 per follow is retained; treat these as P1 during eviction.

Control Flow
- On boot: schedule compactor to run after initial load, then at a fixed interval; also expose `pruneCacheNow()` for manual trigger (debug/tools only).
- After publishing user events (0/3/10002), opportunistically upsert pins.

Diagnostics
- With debug enabled, log one‑line compaction summaries: total rows, per‑kind counts, deletes performed, duration.

Acceptance
- P0 items are always present after compaction; never evicted.
- Total rows ≤ `maxTotalEvents` after each compaction.
- Recent timeline (1/30023) remains populated within the configured window.
- Deleting a root causes its dependent reactions/replies to be removed on next compaction.
 - Follows’ current profiles (kind 0) remain present after compaction unless constrained by extreme global budget pressure (evicted last within non‑pinned tiers).
