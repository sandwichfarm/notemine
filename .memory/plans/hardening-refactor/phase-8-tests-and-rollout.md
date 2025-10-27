# Phase 8 — Tests & Rollout

Purpose: validate correctness, stability, and performance; roll out safely with clear upgrade guidance.

## Test Plan

### Unit
- Tag normalization: no duplicates; default tag present exactly once.
- created_at stability: unchanged across getState/restoreState/resume.
- Hash‑rate aggregator: sliding window/EMA produce sane totals under synthetic inputs.

### Integration
- Lifecycle: mine → pause → resume → result; no ghost updates after pause/cancel (runId gating).
- Resume fidelity: 20× refresh with resume enabled maintains steady kH/s and prompt progress ticks; bestPow monotonically improves.
- Guarded persistence: default nonce arrays do not overwrite good state; real nonces do.
- Worker count change: resume redistributes nonces sanely when N changes.

### E2E (GUI)
- Queue auto‑process with mix of start/resume; clear/skip correctly cancels miner.
- Preferences: `disableResume`, `minerUseAllCores`, `minerNumberOfWorkers` behave as intended.
- Debug mode emits expected logs at key milestones.

### Performance
- Baseline throughput equal or better than pre‑refactor.
- Progress cadence ~250ms per worker under steady state.
- Cancel responsiveness ≤ 100ms typical.

## Rollout

- Versioning
  - Wrapper v2 (Protocol v2). Core API unchanged; progress payload extended.
- Migration notes
  - If integrating directly with workers: include `runId` in all messages and emit initial `{ currentNonce }`.
  - If relying on queue persistence: ensure you guard against default nonce arrays when updating state.
- Documentation
  - Update README and demos to reflect v2 protocol and lifecycle (pause/resume/cancel).
  - Add diagnostics guide for Debug Mode.

## Acceptance

- All tests pass; no regressions in demos/GUI.
- Clear migration and documentation published.
- Incremental release with the ability to revert if unexpected regressions appear.
