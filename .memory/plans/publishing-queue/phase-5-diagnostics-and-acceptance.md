# Phase 5 – Diagnostics, Persistence Hardening, Acceptance

Purpose
- Ensure robust persistence/recovery, gated diagnostics, and clear acceptance criteria.

Scope
- Logging policy, listener lifecycle, persistence flushing, and end-to-end acceptance scenarios.

Diagnostics
- Gate all logs by Preferences.debugMode.
- Log at coarse cadence: job lifecycle (created, signing attempt/outcome, publishing attempt/outcome), nextAttemptAt, and final states.
- Avoid verbose per-relay spam; summarize outcomes and include counts.

Persistence
- Use createLocalStore in lazy mode; flush on beforeunload, pagehide, and visibilitychange (when document.hidden).
- Ensure added listeners are removed with the exact same function refs on cleanup.
- Flush immediately on critical transitions: job add/remove, status becomes published/failed/cancelled.

Edge Cases
- Cross-session signer availability change (e.g., NIP-46 returns): processor should detect user().signer presence via effect and reprocess eligible jobs.
- Relay configuration changes: optionally expose "Refresh Relays" action to recompute target relays per job (non-blocking enhancement).
- Duplicate jobs: optional hash-based dedupe in provider (phase 1 note) to coalesce within short window.

Tests
- Persistence round-trip: enqueue → refresh → resume processing.
- Backoff convergence: escalating delays with jitter; manual retry short-circuits delay.
- Signing once produces stable id; subsequent publish retries do not re-sign.
- Failure visibility: failed jobs remain visible for manual action; clearing published removes only final successes.

Acceptance
- Mining queue never stalls due to signer/relay outages.
- Publish jobs survive refresh, recover automatically when conditions improve, and provide manual recovery controls.
- Logs are lightweight and gated by user preference; persistence is safe and minimal.

