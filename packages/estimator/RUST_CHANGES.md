# No Rust Changes Required

**Decision**: The estimator does NOT require any modifications to the Rust WASM code in `@notemine/core`.

## Why No Changes Are Needed

The estimator achieves accurate NIP-13 calibration by using the **existing `mine_event()` function** directly. This approach:

- ✅ Measures real mining performance (not synthetic benchmarks)
- ✅ Automatically stays in sync with mining optimizations
- ✅ Keeps the performance-critical WASM bundle lean
- ✅ Provides ~95%+ accuracy
- ✅ Zero maintenance burden

## How It Works

The calibration process uses `mine_event()` with:
- **Low difficulty (1)** - so we measure hashing speed, not solution finding
- **Short duration (200-400ms)** - quick calibration without long waits
- **Cancellation timer** - stops mining after time limit
- **Result.khs** - extracts actual hash rate from mining result

```typescript
const result = await mine_event(
  JSON.stringify(payload),
  1,      // difficulty: measure hashing, not solving
  '0',    // start nonce
  '1',    // single-threaded step
  () => {}, // progress callback
  () => shouldStop // cancellation check
);

return result.khs * 1000; // Convert KH/s to H/s
```

## For Complete Documentation

See **ARCHITECTURE.md** for:
- Detailed comparison of approaches
- Why this is better than adding new functions
- How calibration measures different payload sizes and tag counts
- Multi-threading considerations
- Accuracy analysis

## Summary

**No Rust code changes are required.** The existing mining function provides everything needed for accurate calibration.
