# Phase 3 – Integration (Mining → Publishing Handoff)

Purpose
- After mining completes, enqueue a publish job and immediately proceed with the mining queue, without inline signing/publishing.

Scope
- Minimal changes in QueueProcessor to hand off the mined event to PublishingProvider.

Contracts
- Mining item is marked completed from a mining perspective once the publish job is created.
- Publishing status is tracked separately (pending, published, failed) and visible in the PublishingPanel.

API Touchpoints
- QueueProcessor: import usePublishing(), call addPublishJob() with mapped data.
- Derive relays via existing helpers (getPublishRelaysForInteraction or getPublishRelays + write-enabled filter + default POW relay inclusion).

Data Mapping
- From minedEvent (unsigned, with nonce tag and stable created_at) build eventTemplate for PublishJob.
- meta: { sourceQueueItemId, kind, difficulty, type }.

Control Flow
- On mining success (minedEvent):
  - Build relays list using current settings.
  - publishing.addPublishJob({ eventTemplate: minedEvent, meta, relays }).
  - updateItemStatus(nextItem.id, 'completed'); setActiveItem(null).
  - If autoProcess: continue to next mining item (unchanged behavior).

Edge Cases
- If publishing.addPublishJob throws (should not): mark mining item failed with error context; log; do not block queue.
- Mining resumed after pause should follow same handoff path.

Diagnostics
- Log handoff details in debug mode (job id, queue item id, kind, relay count).

Tests
- Mining success enqueues publish job and advances mining queue without delay.
- Refresh mid-handoff: publish job persists and will process later.

Acceptance
- Seamless mining→publishing handoff; mining queue never waits on sign/publish.

