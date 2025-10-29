# Phase 2 – Processor & Retry/Backoff

Purpose
- Implement background processing of publish jobs with robust signing and publishing phases, automatic retries, and exponential backoff with jitter.

Scope
- A headless component (PublishingProcessor) that reacts to state changes and timers to process one job at a time.
- Signing strategy and relay publishing with per-relay timeouts and success threshold.

Contracts
- Never block mining; publishing is fully decoupled.
- Do not mutate eventTemplate; once signing succeeds, persist and reuse signedEvent (same id/created_at).
- One active job at a time; lock prevents concurrent processing.

APIs (internal)
- processNextJob(): Promise<void>
- computeNextAttempt(currentAttempt: number, baseSeq?: number[]): { delayMs: number, nextAttemptAt: number }
- chooseSigner(user, window.nostr): 'secret' | 'nip46' | 'nip07' | 'none'
- signEvent(eventTemplate, signerChoice): Promise<NostrEvent>
- publishToRelays(signedEvent, relays, opts): Promise<{ anySuccess: boolean, perRelay: Record<string, 'ok'|'error'|'timeout'> }>

Retry/Backoff
- Per-phase counters: attempts.sign, attempts.publish.
- Exponential backoff with jitter; sequence (cap at last): [2000, 5000, 10000, 30000, 60000, 120000, 300000].
- Jitter: multiply by random in [0.5, 1.5].
- Manual retry: set nextAttemptAt=now and reset phase error; do not reset counters unless configured.

Control Flow
1) Select the earliest eligible job by nextAttemptAt, prioritizing statuses in order: 'pending-sign' → 'signed-pending-publish' → others.
2) If status === 'pending-sign':
   - Choose signer: secret → nip46 (user().signer) → nip07 (window.nostr) → none.
   - If none available: set error { phase: 'sign', code: 'SIGNER_UNAVAILABLE' }, schedule backoff, return.
   - Try signing with timeout (e.g., 10–20s). Map errors:
     - User rejection → code 'USER_REJECTED'.
     - Offline/unreachable → 'SIGNER_UNAVAILABLE' or 'TIMEOUT'.
   - On success: set signedEvent, status='signed-pending-publish', attempts.publish=0, nextAttemptAt=now.
3) If status === 'signed-pending-publish':
   - Publish to relays (write-enabled + required default). Each relay with timeout (e.g., 7s) and Promise.allSettled.
   - anySuccess=true if at least one relay confirms.
   - On success: status='published'.
   - On failure: set error { phase: 'publish', code: 'RELAY_UNAVAILABLE'|'TIMEOUT' }, schedule backoff.

Event & Relay Semantics
- Respect event created_at and tags from mining; do not touch nonce tag.
- Always include default POW relay when filtering to write-enabled relays.

Edge Cases
- Bunker (NIP-46) offline: signer unavailable → retry later; when user().signer becomes available, processor resumes automatically.
- NIP-07 disabled: prompt will fail; error recorded; manual retry works after extension is enabled.
- Relays unreachable: treat as publish failure; retry with backoff; consider per-relay throttling (optional enhancement).
- Multiple processors: guard with processing lock at provider scope.

Diagnostics
- Gated by debug preference: log job id, phase, attempts, nextAttemptAt, signer path, relay outcomes.

Tests
- Signing retry paths (unavailable → available) result in success without losing event identity.
- Publishing failure paths converge to success once at least one relay responds.

Acceptance
- A job advances sign → publish automatically with retries and backoff, without blocking mining. Manual retry immediately attempts regardless of backoff.

