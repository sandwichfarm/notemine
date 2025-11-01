# Relay Publishing Verification Test Plan

## Test Context
This test plan verifies the relay publishing behavior fixes implemented to ensure that replies, reactions, and PoW notes are published to all required relay types.

## Code Changes Analyzed

### 1. QueueProcessor.tsx (Lines 116-186)
**Purpose:** Determines which relays to publish to based on event type

**Key Logic:**
- **Interactions (replies/reactions):** Use `getPublishRelaysForInteraction()`
  - Includes: author's inbox + user's outbox + notemine.io + NIP-66 PoW relays
- **Regular notes:** Use `getPublishRelays()`
  - Includes: notemine.io + NIP-66 PoW relays + user's outbox relays
- **Fallback strategy:** Always ensures at least notemine.io is included
- **Filtering:** Respects user's write-enabled relay settings

### 2. inbox-outbox.ts (Lines 124-147)
**Function:** `getPublishRelaysForInteraction()`

**Implementation:**
```typescript
export async function getPublishRelaysForInteraction(
  authorPubkey: string,
  yourPubkey: string,
  defaultRelay: string,
  powRelays: string[]
): Promise<string[]>
```

**Relay Sources:**
1. Default relay (notemine.io) - Always included
2. NIP-66 PoW relays - From `powRelays` parameter
3. Author's inbox relays - Via `getUserInboxRelays(authorPubkey)`
4. Your outbox relays - Via `getUserOutboxRelays(yourPubkey)`

### 3. nip66.ts (Lines 11-58)
**Function:** `fetchNip66PowRelays()`

**Implementation:**
- Queries NIP-66 discovery relays (`wss://relay.nostr.watch`)
- Filters for kind 30166 events with POW capability
- Returns array of discovered POW relay URLs
- Timeout: EOSE-based (waits for relay to signal end of stream)

## Test Strategy

### Test Categories

#### A. Unit Tests - Relay Selection Logic
Test the relay selection functions in isolation

#### B. Integration Tests - Publishing Flow
Test the complete flow from queue to publishing

#### C. Edge Case Tests - Error Handling
Test fallback behavior when relay discovery fails

#### D. End-to-End Tests - User Scenarios
Test real-world usage patterns

---

## Detailed Test Cases

### A1: Reply Relay Selection
**Objective:** Verify replies are published to all required relay types

**Setup:**
- Mock user with outbox relays: `['wss://user-outbox-1.com', 'wss://user-outbox-2.com']`
- Mock author (reply target) with inbox relays: `['wss://author-inbox-1.com']`
- Mock NIP-66 discovery returning: `['wss://pow-relay-1.com', 'wss://pow-relay-2.com']`
- Default relay: `wss://notemine.io`

**Test:**
```typescript
const relays = await getPublishRelaysForInteraction(
  authorPubkey,
  userPubkey,
  'wss://notemine.io',
  ['wss://pow-relay-1.com', 'wss://pow-relay-2.com']
);
```

**Expected Result:**
```typescript
[
  'wss://notemine.io',              // Default relay
  'wss://pow-relay-1.com',          // NIP-66 relay 1
  'wss://pow-relay-2.com',          // NIP-66 relay 2
  'wss://author-inbox-1.com',       // Author inbox
  'wss://user-outbox-1.com',        // User outbox 1
  'wss://user-outbox-2.com'         // User outbox 2
]
```

**Assertions:**
- ✅ Contains default relay
- ✅ Contains all NIP-66 PoW relays
- ✅ Contains author's inbox relays
- ✅ Contains user's outbox relays
- ✅ No duplicates
- ✅ Minimum 6 relays for this configuration

---

### A2: Reaction Relay Selection
**Objective:** Verify reactions use same logic as replies

**Setup:** Same as A1

**Test:**
```typescript
// Simulate reaction (type: 'reaction')
const queueItem = {
  type: 'reaction',
  tags: [['p', authorPubkey], ['e', eventId]],
  // ... other fields
};
```

**Expected Result:** Same relay list as A1
- Reactions should be treated identically to replies in relay selection

---

### A3: Regular Note (PoW) Relay Selection
**Objective:** Verify regular notes publish to appropriate relays

**Setup:**
- Mock user with outbox relays: `['wss://user-outbox-1.com']`
- Mock NIP-66 discovery returning: `['wss://pow-relay-1.com']`
- Default relay: `wss://notemine.io`

**Test:**
```typescript
const queueItem = {
  type: 'note',
  difficulty: 21,
  // ... other fields
};

// Should use regular getPublishRelays() logic
const outboxRelays = await getUserOutboxRelays(userPubkey);
const relays = getPublishRelays(outboxRelays);
```

**Expected Result:**
```typescript
[
  'wss://notemine.io',              // Immutable PoW relay
  'wss://pow-relay-1.com',          // NIP-66 relay
  'wss://user-outbox-1.com'         // User outbox
]
```

**Assertions:**
- ✅ Contains immutable relay (notemine.io)
- ✅ Contains NIP-66 PoW relays
- ✅ Contains user's outbox relays
- ✅ No author inbox relays (not an interaction)

---

### B1: NIP-66 Relay Discovery
**Objective:** Verify PoW relay discovery from NIP-66 network

**Setup:**
- Live connection to `wss://relay.nostr.watch`
- Query for kind 30166 events with POW capability

**Test:**
```typescript
const powRelays = await fetchNip66PowRelays();
```

**Expected Result:**
- Returns array of relay URLs
- Each URL is valid WebSocket URL (wss:// or ws://)
- Array length > 0 (assuming network is functioning)

**Assertions:**
- ✅ Returns array
- ✅ All entries are valid URLs
- ✅ All entries start with 'wss://' or 'ws://'
- ✅ No duplicate entries
- ✅ Completes within reasonable timeout (5 seconds)

**Edge Cases:**
- Network timeout - should resolve with empty array or cached results
- Malformed events - should be silently ignored
- Invalid URLs - should be filtered out

---

### B2: User Outbox Relay Discovery
**Objective:** Verify user's outbox relays are discovered from NIP-65

**Setup:**
- Mock or real user with kind 10002 relay list event
- Event should have tags: `['r', 'wss://relay.com', 'write']`

**Test:**
```typescript
const outboxRelays = await getUserOutboxRelays(userPubkey);
```

**Expected Result:**
- Returns array of relay URLs marked for writing
- Filters out read-only relays

**Assertions:**
- ✅ Returns array
- ✅ All entries have 'write' capability
- ✅ Returns empty array if no kind 10002 event found (graceful fallback)
- ✅ Completes within timeout (3 seconds per implementation)

---

### B3: Author Inbox Relay Discovery
**Objective:** Verify author's inbox relays are discovered from NIP-65

**Setup:**
- Mock or real author with kind 10002 relay list event
- Event should have tags: `['r', 'wss://relay.com', 'read']`

**Test:**
```typescript
const inboxRelays = await getUserInboxRelays(authorPubkey);
```

**Expected Result:**
- Returns array of relay URLs marked for reading
- Filters out write-only relays

**Assertions:**
- ✅ Returns array
- ✅ All entries have 'read' capability
- ✅ Returns default relays if no kind 10002 event found
- ✅ Completes within timeout (3 seconds per implementation)

---

### C1: Relay Discovery Failure - Interaction
**Objective:** Verify graceful fallback when relay discovery fails

**Setup:**
- Mock `getPublishRelaysForInteraction()` to throw error
- Ensure fallback logic activates

**Test:**
```typescript
// Simulate network failure
mockGetPublishRelaysForInteraction.mockRejectedValue(new Error('Network timeout'));

// Should fall back to: default relay + user outbox
```

**Expected Result:**
```typescript
[
  'wss://notemine.io',              // Default relay (always)
  'wss://user-outbox-1.com'         // User outbox (from fallback)
]
```

**Assertions:**
- ✅ Never throws error to caller
- ✅ Always includes default relay
- ✅ Includes user outbox if discoverable
- ✅ Sets `relayDiscoveryError` flag in publish job metadata
- ✅ Warning logged to console

---

### C2: Complete Relay Discovery Failure
**Objective:** Verify ultimate fallback when everything fails

**Setup:**
- All relay discovery functions throw errors
- Even outbox relay discovery fails

**Test:**
```typescript
// Simulate complete failure
mockGetPublishRelaysForInteraction.mockRejectedValue(new Error('Complete failure'));
mockGetUserOutboxRelays.mockRejectedValue(new Error('Outbox failure'));
```

**Expected Result:**
```typescript
['wss://notemine.io']  // Minimal fallback
```

**Assertions:**
- ✅ Never throws error to caller
- ✅ Always publishes to at least default relay
- ✅ Event is never lost (always queued for publishing)
- ✅ Error logged with context
- ✅ Publish job metadata contains error details

---

### C3: Empty Relay List After Filtering
**Objective:** Verify behavior when all relays are filtered out by user settings

**Setup:**
- Mock relay selection returns 6 relays
- Mock user settings mark all except notemine.io as write-disabled

**Test:**
```typescript
const allRelays = [
  'wss://notemine.io',
  'wss://pow-relay-1.com',
  'wss://author-inbox.com',
  'wss://user-outbox.com'
];

const writeEnabledRelays = ['wss://notemine.io'];  // Only default enabled
const filtered = allRelays.filter(url =>
  url === defaultRelay || writeEnabledRelays.includes(url)
);
```

**Expected Result:**
```typescript
['wss://notemine.io']  // Default relay always included
```

**Assertions:**
- ✅ Default relay never filtered out
- ✅ At least one relay always included
- ✅ Respects user's write-disabled settings

---

### D1: End-to-End Reply Flow
**Objective:** Test complete flow from reply composition to publish

**Scenario:**
1. User views a note from another user
2. Clicks "Reply"
3. Types reply content
4. Submits to mining queue
5. PoW mining completes
6. Event is published to all relay types

**Expected Behavior:**
- ✅ Reply added to queue with correct tags
- ✅ Mining completes successfully
- ✅ Relay list includes:
  - notemine.io (immutable PoW relay)
  - NIP-66 discovered PoW relays
  - Author's inbox relays
  - User's outbox relays
- ✅ Publish job created with all relays
- ✅ Event signed and published
- ✅ Success confirmation shown to user

---

### D2: End-to-End Reaction Flow
**Objective:** Test complete flow from reaction to publish

**Scenario:**
1. User views a note
2. Clicks heart/like button
3. Reaction added to queue
4. PoW mining completes
5. Event is published to all relay types

**Expected Behavior:**
- ✅ Reaction added to queue with correct tags (kind 7)
- ✅ Mining completes with appropriate difficulty
- ✅ Same relay list as replies (interaction model)
- ✅ Publish job created
- ✅ Event signed and published
- ✅ UI updates to show reaction confirmation

---

### D3: Relay Hint Preservation
**Objective:** Verify relay hints from parent event are preserved

**Setup:**
- Parent event has relay hint in 'e' tag: `['e', eventId, 'wss://original-relay.com']`
- User creates reply to this event

**Expected Behavior:**
- ✅ Reply includes relay hint in tags
- ✅ Relay hint format: `['e', parentId, 'wss://original-relay.com', 'reply']`
- ✅ Root event relay hint preserved if threading
- ✅ Relay hints in 'p' tags also preserved

---

## Test Implementation Notes

### Mocking Strategy

**Mock NIP-66 Discovery:**
```typescript
jest.mock('../lib/nip66', () => ({
  fetchNip66PowRelays: jest.fn(() =>
    Promise.resolve(['wss://pow-relay-1.com', 'wss://pow-relay-2.com'])
  )
}));
```

**Mock User Relays:**
```typescript
jest.mock('../lib/applesauce', () => ({
  getUserOutboxRelays: jest.fn(() =>
    Promise.resolve(['wss://user-outbox.com'])
  ),
  getUserInboxRelays: jest.fn(() =>
    Promise.resolve(['wss://author-inbox.com'])
  ),
  DEFAULT_POW_RELAY: 'wss://notemine.io'
}));
```

### Test Data

**Sample Queue Item (Reply):**
```typescript
const replyQueueItem: QueueItem = {
  id: 'test-reply-1',
  type: 'reply',
  content: 'Test reply content',
  pubkey: 'user-pubkey-hex',
  difficulty: 21,
  tags: [
    ['e', 'parent-event-id', 'wss://hint.com', 'reply'],
    ['p', 'author-pubkey-hex', 'wss://hint.com'],
    ['client', 'notemine.io']
  ],
  kind: 1,
  status: 'queued',
  createdAt: Date.now(),
  metadata: {
    targetEventId: 'parent-event-id',
    targetAuthor: 'author-pubkey-hex'
  }
};
```

**Sample Queue Item (Reaction):**
```typescript
const reactionQueueItem: QueueItem = {
  id: 'test-reaction-1',
  type: 'reaction',
  content: '+',
  pubkey: 'user-pubkey-hex',
  difficulty: 18,
  tags: [
    ['e', 'target-event-id'],
    ['p', 'author-pubkey-hex'],
    ['client', 'notemine.io']
  ],
  kind: 7,
  status: 'queued',
  createdAt: Date.now(),
  metadata: {
    targetEventId: 'target-event-id',
    targetAuthor: 'author-pubkey-hex'
  }
};
```

---

## Coverage Requirements

### Code Coverage Targets
- **Line Coverage:** > 90%
- **Branch Coverage:** > 85%
- **Function Coverage:** > 90%

### Critical Paths to Cover
1. ✅ Reply relay selection (interaction path)
2. ✅ Reaction relay selection (interaction path)
3. ✅ Regular note relay selection
4. ✅ NIP-66 relay discovery success
5. ✅ NIP-66 relay discovery failure
6. ✅ User relay discovery success
7. ✅ User relay discovery failure
8. ✅ Complete relay discovery failure (ultimate fallback)
9. ✅ Relay filtering by write-enabled settings
10. ✅ Empty relay list after filtering (force default)

---

## Identified Issues and Recommendations

### Issue 1: No Timeout on NIP-66 Discovery
**Location:** `nip66.ts:11-58`

**Current Implementation:**
```typescript
// Waits for EOSE, no maximum timeout
oneose() {
  resolve(relayArray);
}
```

**Risk:** Could hang indefinitely if relay never sends EOSE

**Recommendation:**
```typescript
export async function fetchNip66PowRelays(): Promise<string[]> {
  return Promise.race([
    actualDiscovery(),
    new Promise<string[]>(resolve => setTimeout(() => resolve([]), 5000))
  ]);
}
```

---

### Issue 2: No Caching of NIP-66 Results
**Location:** `nip66.ts`

**Current:** Every publish operation triggers new NIP-66 discovery

**Impact:**
- Unnecessary network requests
- Slower publish times
- Higher bandwidth usage

**Recommendation:**
```typescript
let cachedPowRelays: string[] | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchNip66PowRelays(): Promise<string[]> {
  const now = Date.now();
  if (cachedPowRelays && (now - lastFetch) < CACHE_TTL) {
    return cachedPowRelays;
  }

  const relays = await actualFetch();
  cachedPowRelays = relays;
  lastFetch = now;
  return relays;
}
```

---

### Issue 3: Potential Race Condition in Queue Processing
**Location:** `QueueProcessor.tsx:129-171`

**Current:** Async relay discovery during queue processing

**Risk:** If queue is paused/stopped during discovery, stale data might be used

**Recommendation:**
- Check queue state after async operations complete
- Abort publish if queue was stopped
- Add cancellation token pattern

---

### Issue 4: No Validation of Discovered Relay URLs
**Location:** `nip66.ts:41`

**Current:**
```typescript
const relayUrl = new URL(dTag[1]).toString();
```

**Risk:** Malformed URLs could crash the application

**Recommendation:**
```typescript
try {
  const url = new URL(dTag[1]);
  if (url.protocol === 'wss:' || url.protocol === 'ws:') {
    relays.add(url.toString());
  }
} catch (e) {
  debug('[NIP-66] Invalid relay URL:', dTag[1]);
}
```

---

## Performance Considerations

### Relay Discovery Performance

**Current Timing:**
- NIP-66 discovery: ~2-5 seconds (depends on relay response)
- User inbox discovery: ~1-3 seconds (with 3s timeout)
- User outbox discovery: ~1-3 seconds (with 3s timeout)

**Total worst case:** ~11 seconds per publish

**Optimization Opportunities:**
1. ✅ Cache NIP-66 results (5-10 minute TTL)
2. ✅ Cache user relay lists (update on kind 10002 events)
3. ✅ Parallel relay discovery instead of sequential
4. ✅ Pre-fetch relay lists on app load
5. ✅ Use indexed DB for persistent cache

---

## Security Considerations

### Relay Trust
- ✅ Verify all relay URLs use secure WebSocket (wss://)
- ✅ Validate relay URLs are well-formed
- ✅ Implement relay reputation/blocklist system
- ✅ Monitor for malicious relay injection

### User Privacy
- ✅ Publishing to multiple relays reveals user's social graph
- ✅ Consider privacy mode that limits relay diversity
- ✅ Allow users to opt-out of certain relay types

---

## Test Execution Plan

### Phase 1: Unit Tests (Week 1)
- Implement relay selection logic tests
- Mock all external dependencies
- Achieve >90% code coverage
- **Estimated time:** 8-12 hours

### Phase 2: Integration Tests (Week 2)
- Test complete publishing flow
- Use test relays for real network interactions
- Verify error handling and fallbacks
- **Estimated time:** 12-16 hours

### Phase 3: E2E Tests (Week 3)
- Playwright or Cypress for UI interactions
- Test real user scenarios
- Performance benchmarking
- **Estimated time:** 16-20 hours

### Phase 4: Performance & Security (Week 4)
- Load testing with multiple concurrent publishes
- Security audit of relay discovery
- Optimization based on metrics
- **Estimated time:** 8-12 hours

---

## Success Criteria

### Functional Requirements
- ✅ Replies publish to all 4 relay types
- ✅ Reactions publish to all 4 relay types
- ✅ Regular notes publish to appropriate relays
- ✅ Relay hints are preserved
- ✅ Fallback mechanism never loses events
- ✅ User preferences are respected

### Non-Functional Requirements
- ✅ Relay discovery completes in <5 seconds
- ✅ No memory leaks from relay connections
- ✅ Graceful degradation on network failures
- ✅ Clear error messages for users
- ✅ Comprehensive logging for debugging

### Quality Metrics
- ✅ Test coverage >90%
- ✅ Zero critical bugs
- ✅ Performance within acceptable range
- ✅ Code review approved
- ✅ Documentation complete

---

## Appendix: Relay Types Summary

### 1. Immutable PoW Relay
- **URL:** `wss://notemine.io`
- **Purpose:** Permanent storage of PoW events
- **Usage:** ALL events (replies, reactions, notes)
- **Filtering:** Never filtered out (always published)

### 2. NIP-66 PoW Relays
- **Discovery:** Query kind 30166 from `wss://relay.nostr.watch`
- **Purpose:** Specialized PoW event storage and relay
- **Usage:** ALL events with PoW
- **Filtering:** Respects user's write-enabled settings

### 3. Author Inbox Relays (NIP-65)
- **Discovery:** Query kind 10002 for target author, filter read relays
- **Purpose:** Ensure author sees interactions
- **Usage:** Replies and reactions ONLY
- **Filtering:** Respects user's write-enabled settings

### 4. User Outbox Relays (NIP-65)
- **Discovery:** Query kind 10002 for current user, filter write relays
- **Purpose:** Ensure user's content is discoverable
- **Usage:** ALL events
- **Filtering:** Respects user's write-enabled settings

---

## Test Execution Checklist

### Before Running Tests
- [ ] Install test dependencies (`npm install --save-dev jest @testing-library/solid`)
- [ ] Set up test environment configuration
- [ ] Create mock relay server for integration tests
- [ ] Configure test database or use in-memory storage
- [ ] Set up code coverage tooling

### Running Tests
- [ ] Run unit tests: `npm test -- --coverage`
- [ ] Run integration tests: `npm run test:integration`
- [ ] Run E2E tests: `npm run test:e2e`
- [ ] Generate coverage report: `npm run coverage`
- [ ] Review coverage gaps and add tests

### After Tests
- [ ] Review all test failures
- [ ] Document any known issues
- [ ] Update test plan based on findings
- [ ] Create bug reports for failures
- [ ] Update implementation if needed

---

**Last Updated:** 2025-11-01
**Test Plan Version:** 1.0
**Reviewer:** Tester Agent (Hive Mind Collective)
