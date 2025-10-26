# Phase 8 - E2E GUI Testing Checklist

## Purpose
E2E tests require the full GUI environment with actual WASM workers. These tests should be performed manually in the running application.

## Test Environment Setup
1. Start the GUI development server: `pnpm --filter @notemine/gui dev`
2. Open browser dev console to monitor logs
3. Enable debug mode in preferences for detailed logging

## Queue Auto-Process Tests

### Test 1: Basic Queue Flow
- [ ] Add 3 notes to queue with different difficulties (20, 21, 22)
- [ ] Enable auto-process
- [ ] Verify first item starts mining automatically
- [ ] Verify second item starts after first completes
- [ ] Verify all items complete in order

### Test 2: Queue Pause/Resume
- [ ] Add 2 items to queue
- [ ] Start processing
- [ ] Pause while first item is mining
- [ ] Verify mining stops (hash rate = 0)
- [ ] Click Resume
- [ ] Verify mining continues from last nonce
- [ ] Verify queue continues to next item after completion

### Test 3: Skip Current Item
- [ ] Add item to queue and start mining
- [ ] Wait for bestPow to reach at least 15
- [ ] Click Skip
- [ ] Verify mining stops immediately
- [ ] Verify item marked as "skipped"
- [ ] Click Resume
- [ ] Verify next item in queue starts (not the skipped one)

### Test 4: Clear Completed
- [ ] Complete at least 2 items (or skip them)
- [ ] Verify "Clear Done" button appears
- [ ] Click "Clear Done"
- [ ] Verify completed/failed/skipped items are removed from list
- [ ] Verify active/queued items remain

## Preferences Tests

### Test 5: Disable Resume
- [ ] Start mining an item
- [ ] Note the current nonce (e.g., "123456")
- [ ] Pause mining
- [ ] Go to preferences
- [ ] Disable "Resume Mining" preference
- [ ] Return to queue
- [ ] Resume mining
- [ ] Verify mining starts from nonce "0" (not from previous nonce)

### Test 6: Miner Use All Cores
- [ ] Go to preferences
- [ ] Note current worker count
- [ ] Toggle "Use All Cores"
- [ ] Verify worker count changes to `navigator.hardwareConcurrency`
- [ ] Start mining
- [ ] Verify all workers are active in console logs

### Test 7: Miner Number of Workers
- [ ] Go to preferences
- [ ] Set "Number of Workers" to 2
- [ ] Start mining
- [ ] Verify exactly 2 workers start (check console logs)
- [ ] Change to 4 workers mid-mining
- [ ] Pause and resume
- [ ] Verify nonces are redistributed across 4 workers

## Debug Mode Tests

### Test 8: Debug Logging - runId
- [ ] Enable debug mode
- [ ] Start mining
- [ ] Check console for: `[Notemine] Starting new mining session, runId: <uuid>`
- [ ] Verify runId is a valid UUID format
- [ ] Stop and start mining again
- [ ] Verify new runId is different from previous

### Test 9: Debug Logging - currentNonce
- [ ] Enable debug mode
- [ ] Start mining
- [ ] Verify console shows periodic nonce updates (every ~2s)
- [ ] Format should be: `[Notemine] Worker X currentNonce: <number>`
- [ ] Verify nonces are increasing

### Test 10: Debug Logging - Hash Rate
- [ ] Enable debug mode
- [ ] Start mining with 2+ workers
- [ ] Verify console shows: `[Notemine] totalHashRate: X.XX KH/s (Δ Y.YY)` every ~1s
- [ ] Verify hash rate is reasonable (1-10 MH/s range on modern hardware)

### Test 11: Debug Logging - Ghost Updates
- [ ] Enable debug mode
- [ ] Start mining, note the runId from console
- [ ] Pause mining
- [ ] Start new mining session (new runId)
- [ ] Check for: `[Notemine] 🚫 GHOST UPDATE BLOCKED` messages
- [ ] Verify blocked messages reference the old runId

## Performance Tests

### Test 12: Baseline Throughput
- [ ] Start mining with difficulty 20
- [ ] Let run for 30 seconds
- [ ] Record peak hash rate
- [ ] Verify: >= 5.5 MH/s sustained (with SIMD enabled on modern hardware)
- [ ] Compare with pre-refactor baseline (~5.2 MH/s)

### Test 13: Progress Cadence
- [ ] Start mining
- [ ] Monitor progress bar updates
- [ ] Verify smooth updates approximately every 250ms
- [ ] No stuttering or frozen UI

### Test 14: Cancel Responsiveness
- [ ] Start mining
- [ ] Click Skip button
- [ ] Time how long until mining actually stops
- [ ] Verify: <= 100ms typical
- [ ] Repeat 5 times to ensure consistency

## Resume Fidelity Tests

### Test 15: Resume with Same Worker Count
- [ ] Start mining with 4 workers
- [ ] Let run until nonces are in 500k+ range
- [ ] Pause
- [ ] Verify nonces persisted (check localStorage/debug)
- [ ] Resume
- [ ] Verify mining continues from saved nonces
- [ ] Verify no significant hash rate drop

### Test 16: Resume with Different Worker Count
- [ ] Start mining with 2 workers
- [ ] Let run until nonces are in 100k+ range
- [ ] Pause
- [ ] Change to 4 workers in preferences
- [ ] Resume
- [ ] Verify: All 4 workers get nonces assigned
- [ ] Verify: 2 workers continue from saved nonces
- [ ] Verify: 2 new workers get redistributed ranges
- [ ] Verify: No duplicate nonce ranges

### Test 17: Rapid Pause/Resume (20x)
- [ ] Start mining
- [ ] Rapidly pause and resume 20 times
- [ ] Verify each time:
  - Hash rate recovers within 1 second
  - Progress updates continue smoothly
  - BestPow never decreases
  - No error messages in console

## Integration Tests

### Test 18: Queue + Preferences + Resume
- [ ] Add 3 items to queue
- [ ] Start with 2 workers
- [ ] Let first item mine for 10 seconds
- [ ] Pause
- [ ] Change to 4 workers
- [ ] Disable auto-process
- [ ] Resume
- [ ] Verify first item continues with 4 workers
- [ ] When first completes, manually start second item
- [ ] Verify second item starts with correct preferences

### Test 19: Debug Mode + All Features
- [ ] Enable debug mode
- [ ] Add items to queue
- [ ] Start processing
- [ ] Perform: pause, resume, skip, clear
- [ ] Verify console logs all key events:
  - runId generation
  - Worker nonce updates
  - Hash rate changes
  - Ghost update blocks (if any)
  - State persistence

## Acceptance Criteria

All tests must pass with:
- ✅ No regressions in demos/GUI
- ✅ No error messages in console (except expected worker init errors in test env)
- ✅ Smooth UX with no freezing or stuttering
- ✅ Hash rate >= baseline (5.5 MH/s sustained)
- ✅ Resume works correctly in all scenarios
- ✅ Debug mode provides useful diagnostic information

## Notes
- Tests should be run on multiple browsers (Chrome, Firefox, Safari)
- Test on both desktop and mobile if applicable
- Record any unexpected behavior for investigation
- Performance numbers may vary by hardware; compare relative to baseline on same system
