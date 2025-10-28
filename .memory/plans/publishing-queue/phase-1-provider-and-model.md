# Phase 1 – Provider & Data Model

Purpose
- Introduce a PublishingProvider to own publishing job state, persistence, and public controls.
- Define data types and invariants to keep event semantics intact and the system resilient.

Scope
- New context provider + state shape + lazy localStorage persistence + basic methods (add, remove, retry, pause/resume, clear).

Contracts
- Created jobs must carry an immutable event template from mining (stable created_at, normalized tags) until signed.
- Once signed, reuse the signed event for all subsequent publish attempts (do not re-sign unless explicitly requested).
- Only one active job is processed at a time (determinism/simple recovery).

APIs (Context)
- publishState(): { items: PublishJob[], isProcessing: boolean, autoPublish: boolean, activeJobId: string | null }
- addPublishJob(input): string
- removePublishJob(id): void
- retryPublishJob(id): void // bypasses nextAttemptAt
- pausePublishing(): void
- resumePublishing(): void
- clearPublished(): void
- toggleAutoPublish(): void

Data Types
- PublishJob
  - id: string
  - status: 'pending-sign' | 'signed-pending-publish' | 'published' | 'failed' | 'cancelled'
  - eventTemplate: NostrEvent-like (unsigned, includes nonce tag + created_at from mining)
  - signedEvent?: NostrEvent (set once signing succeeds; reused for publish retries)
  - relays: string[] // chosen at creation (write-enabled + required default)
  - attempts: { sign: number; publish: number }
  - nextAttemptAt: number // epoch ms for backoff scheduler
  - error?: { phase: 'sign' | 'publish'; code: string; message: string }
  - meta: { sourceQueueItemId?: string; kind: number; difficulty: number; type: 'note' | 'reply' | 'reaction' | 'profile' }
  - createdAt: number; updatedAt: number

Control Flow
- addPublishJob():
  - Construct job with status 'pending-sign', attempts zeroed, nextAttemptAt=now.
  - Choose relays via current write-enabled set; always include default POW relay if needed.
  - Persist (lazy mode + explicit flush on critical ops).
- removePublishJob(): remove by id; if active, processor will move on.
- retryPublishJob(): set nextAttemptAt=now; if paused, no-op; else processor will pick it up.
- pausePublishing()/resumePublishing(): flips isProcessing; resume triggers processor.
- clearPublished(): remove jobs with status 'published'.

Edge Cases
- Duplicate job creation: guard by hashing eventTemplate JSON and coalescing duplicates within a short window (optional phase 5 enhancement).
- Large job list: keep O(n) operations minimal; avoid excessive flushes (lazy + flush on pagehide/beforeunload/visibilitychange).
- Versioning: include schemaVersion (implicit; can be added in phase 5 if necessary).

Diagnostics
- Log (debug mode only): job added/removed, state transitions, critical errors.

Tests
- Add/remove/clear lifecycle verifies persistence and invariants.
- Pause/resume maintains isProcessing persisted across refresh.

Acceptance
- Jobs can be enqueued, seen after refresh, and controlled via pause/resume and retry without interfering with mining.

