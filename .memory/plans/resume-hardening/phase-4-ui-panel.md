**Purpose**
- Correct MiningPanel rendering to reflect real worker IDs, current nonces, and job-scoped Highest Diff.

**Scope**
- `packages/gui/src/components/MiningPanel.tsx`

**Contracts**
- Render per‑worker cards by `workerId` (not array index) and read matching `workersHashRates[workerId]`.
- Display `currentNonce` (from provider) rather than `bestPowData.nonce`.
- Highest Diff: display job-scoped highest from provider (derived or from wrapper’s seeded `highestPow$`).

**APIs**
- No new props; consumes provider’s extended state.

**Control Flow**
- Sort `workerId`s for stable layout; map each to card using keyed data.

**Edge Cases**
- When no workersPow yet, show KH/s only. When no currentNonce yet, show N/A.

**Diagnostics**
- Optional debug badge to indicate “Resumed” when state was restored.

**Acceptance**
- Cards’ Miner # labels match real worker IDs; KH/s and nonces align per worker.
- Highest Diff in header matches max displayed across workers when present.

