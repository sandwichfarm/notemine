Purpose
- Investigate why the GUI achieves ~50% the hash rate of the Svelte demo on the same machine and thread count.

Scope
- Compare behavior of the GUI vs Svelte demo around mining lifecycle, worker setup, progress/timing, and background workload.
- Identify GUI background activity competing for CPU and verify impact on miner throughput.

Contracts / APIs
- Core: @notemine/core WASM `mine_event(event_json, difficulty, start_nonce, nonce_step, report_progress, should_cancel)`
- Wrapper: @notemine/wrapper `Notemine` class, observables: `progress$`, `highestPow$`, `success$`; metrics: `totalHashRate` (kH/s).
- GUI: MiningProvider uses wrapper; QueueProcessor may persist mining state periodically.

Data Types
- Progress: { workerId: number, hashRate?: number (H/s), bestPowData?, currentNonce? }
- Wrapper totalHashRate: number (kH/s) = sum(avg per-worker H/s)/1000
- Preferences: minerNumberOfWorkers, minerUseAllCores, debugMode, disableResume

Control Flow (high level)
1) GUI App mounts → AppInit fetches NIP-66 relays and connects to relay pool; background loaders run.
2) MiningProvider.startMining creates Notemine with chosenWorkers from preferences; subscribes to progress/highestPow; optional 500ms state persistence timer only when resuming via QueueProcessor.
3) Workers (WASM) target ~250ms progress cadence; wrapper aggregates per‑worker rates.

Edge Cases
- Debug logging enabled (GUI or wrapper) can degrade throughput.
- Default workers in GUI leave one core free unless user sets Use All Cores or moves the slider.
- Service Worker / dev cache can serve stale worker/wasm.

Diagnostics
- Verify active background workload: relay connections, timeline/loader activity, periodic timers.
- Add a lightweight perf mode (query param `?perf=1`) to skip relay discovery/connection for isolation tests.
- Confirm identical worker counts and difficulty in both apps.
- Compare reported totalHashRate (kH/s) in the same browser/session with/without perf mode.

Acceptance
- Root cause hypothesis established with code references and isolation path to validate.
- Provide remediation options: disable background work during mining, expose toggle, or defer relay processing until idle.
