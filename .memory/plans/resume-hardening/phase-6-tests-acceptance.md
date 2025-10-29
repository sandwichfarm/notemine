**Purpose**
- Define validation and acceptance criteria across wrapper and GUI.

**Scope**
- Wrapper unit/integration tests; GUI manual verification path.

**Contracts**
- Wrapper resumes from provided worker nonces and redistributes on worker-count change.
- Wrapper progress emits `currentNonce` and `hashRate`; state persistence respects guarded rules.
- GUI shows job-scoped Highest Diff and live currentNonce per worker; persists nonces at ~500ms with one-time immediate save on first real nonces.

**Tests (Wrapper)**
- getState returns `workerNonces: []` when only defaults observed; returns non-empty after first `currentNonce != default` per worker.
- restoreState seeds `workersPow$` and sets `highestPow$` (max of map) when `workersPow` provided.
- mine() clears bests when neither `_resumeNonces` nor restored `workersPow` is present.
- RunId gating: progress with wrong or missing runId does not mutate state.

**Manual Checks (GUI)**
- Start mining at high difficulty; observe per-worker “Nonce” increments smoothly while bests change rarely.
- Pause, refresh, resume: per-worker bests (if saved) and Highest Diff appear immediately; currentNonce resumes near last saved positions.
- Resume with empty nonces (and no workersPow): Highest Diff is cleared and workers start from defaults.

**Acceptance**
- All wrapper tests pass locally.
- In GUI, resume repeatedly at high difficulty without noticeable redo of work; no ghost updates observed; panel displays remain consistent.

**Build**
- Validate via `pnpm -w -r build` after wrapper changes; restart dev server to avoid caching; optionally use `?nocache=1` once in dev.

