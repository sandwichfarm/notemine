**Purpose**
- Provide lightweight, gated diagnostics to troubleshoot resume correctness without noisy logs.

**Scope**
- Wrapper + GUI diagnostics tied to a debug preference.

**Contracts**
- Debug mode reads a preference and is non-reactive in hot paths to avoid overhead.
- Log at coarse cadence (~1s) for total KH/s; rate-limit per‑worker nonce logs (~2s/worker).
- Log persistence samples when writing state (nonce count and a few samples, not full arrays).

**APIs**
- None public; toggled via preferences and wrapper constructor `debug`.

**Control Flow**
- Wrapper logs: session start with runId, ghost gating rejections, periodic KH/s, per‑worker nonce samples.
- GUI logs: worker IDs seen, state updates saved (throttled), queue item IDs.

**Edge Cases**
- Ensure logs don’t duplicate when resuming; clear previous intervals on pause/cancel.

**Acceptance**
- With debug on, logs provide enough context to verify: resume source, worker starts, nonces advancing, state saves, and no ghost updates.

