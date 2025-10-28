# Phase 4 – UI & Operator Controls

Purpose
- Provide visibility into publishing jobs and manual controls to recover from failures without blocking mining.

Scope
- Optional PublishingPanel component; small additions to existing UI (badges/links from mining queue to publishing panel).

Contracts
- UI must not create hidden concurrent processors; publishing processor remains single-active-job.
- Controls must be idempotent: repeated clicks should not duplicate jobs or spawn parallel processing.

UI Elements
- List grouped by status: Pending Sign, Pending Publish, Failed, Published.
- Per-job: Retry Now, Remove, Copy Event (JSON), View Error, Open Relays (optional).
- Global: Pause/Resume autoPublish, Clear Published, Retry All Failed.
- Badges on mining queue items indicating publish status for the related job (optional link to panel).

Control Flow
- Retry Now → sets nextAttemptAt=now and triggers processor (if running).
- Pause/Resume → toggles isProcessing; processor effect responds.
- Clear Published → removes published jobs; non-destructive to mining queue.

Edge Cases
- Multiple jobs for similar content: display job IDs and createdAt for clarity.
- Large job lists: virtualize if needed later; for now, keep list concise and lazy-persisted.

Diagnostics
- Debug mode: show attempts, nextAttemptAt, last error code per job; minimal in production.

Tests
- Manual actions update state correctly and persist across refresh.
- Retry flow results in expected processor activity (observable via debug logs).

Acceptance
- Users can diagnose and recover publish failures without impacting ongoing mining.

