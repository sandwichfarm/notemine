# Publishing Queue – Plan (Overview)

Purpose
- Decouple mining from signing/publishing so mining never blocks when signers or relays are unavailable (e.g., NIP-46 bunker offline, NIP-07 disabled).
- Persist publish jobs with robust retry/backoff and manual controls, ensuring fault tolerance and recoverability.

Scope
- GUI-level publishing queue: provider + processor + optional panel.
- Handoff from Mining Queue after mining completes.
- Signing paths (anon secret, NIP-46, NIP-07) and publishing to configured write-enabled relays.
- Persistence via lazy localStorage and graceful recovery on refresh.

Non-Goals
- Changes to WASM/core NIP-13 logic.
- Changes to mining wrapper beyond handoff integration.
- Multi-tenant batching or out-of-order dedup across users.

Constraints & Must-Haves
- Preserve NIP-13 semantics: created_at stable, tags normalized, do not mutate mined payload post-handoff.
- Single active miner session via existing provider; publishing queue must not spawn miners.
- Guard persistence; throttle/logs behind debug preference.
- Respect write-enabled relays; always include default POW relay when required.

High-Level Design
1) Provider + Model: New PublishingProvider managing PublishJob state, persistence (lazy), and controls.
2) Processor + Retry: PublishingProcessor performing signing then publishing with exponential backoff + jitter and per-phase attempt counters.
3) Integration: QueueProcessor enqueues publish jobs after mining completion and proceeds immediately to next mining item.
4) UI/Controls: Optional PublishingPanel for visibility and manual retry/pause/remove.
5) Diagnostics/Acceptance: Lightweight, gated logs; acceptance scenarios and tests.

Phases
1. Provider & Data Model
2. Processor & Retry/Backoff
3. Integration (Mining → Publishing handoff)
4. UI & Operator Controls
5. Diagnostics, Persistence Hardening, Acceptance

Risks
- Duplicated processing if multiple processors mount: mitigate with single active job lock.
- Re-signing altering id: prevent by persisting signed event once signing succeeds; reuse for publish retries.
- User expectation on "completed": clarify mining completed vs publishing pending in UI.

Acceptance (End-to-End)
- Mining continues regardless of signer/relay availability.
- Publish jobs persist across refresh and resume automatically.
- Automatic retries with backoff; manual retry works and bypasses wait.
- At least one relay success marks job published; failures are visible and recoverable.

