# @notemine/estimator

> NIP-13 aware Proof-of-Work time estimator for notemine

Accurately estimates how long it will take to mine a NIP-13 compliant Nostr event based on payload size, tag count, difficulty, and device performance.

## Why Calibration is Required

Mining performance varies dramatically across:
- **Hardware diversity**: Different CPUs, mobile vs desktop, single vs multi-core
- **Payload variability**: Event content size and tag count directly impact hashing cost
- **Browser differences**: JavaScript engine optimizations, WASM performance
- **System load**: Background processes, thermal throttling, power management

**Static estimates are impossible.** This library uses empirical calibration to measure YOUR device's specific performance characteristics.

## Features

- 🎯 **NIP-13 Specific** - Calibrates against actual notemine WASM mining functions
- 📊 **Device Calibration** - Measures real performance, not theoretical estimates
- 📦 **Payload-aware** - Accounts for content size and tag overhead
- 🧵 **Thread-aware** - Models real multi-threading efficiency (not linear scaling)
- 🔄 **Adaptive** - Optional online learning from actual mining results
- 💾 **Persistent** - Cache calibration data across sessions
- 🪶 **Lightweight** - Small bundle, tree-shakeable

## Installation

```bash
pnpm add @notemine/estimator @notemine/core @notemine/wrapper
```

## Quick Start

```typescript
import { calibrateNip13, estimate, formatTime, createLocalStoragePersistence } from '@notemine/estimator';

// 1. Check for existing calibration
const persistence = createLocalStoragePersistence();
let cal = await persistence.load('my-device');

// 2. If uncalibrated, run calibration (1-3 seconds, user-initiated)
if (!cal) {
  console.log('⚠️ Device uncalibrated. Calibrating...');
  cal = await calibrateNip13({
    cpu: navigator.userAgent
    // Note: Currently single-threaded calibration only
    // Multi-threading uses conservative efficiency estimates
  });
  await persistence.save('my-device', cal);
  console.log('✅ Calibration complete!');
}

// 3. Estimate mining time
const result = estimate({
  bytes: 500,       // Content size
  tags: 3,          // Number of tags
  bits: 21,         // Target difficulty
  threads: navigator.hardwareConcurrency || 4,
  cal
});

console.log(`Estimated: ${formatTime(result.timeSec)}`);
console.log(`Hash rate: ${(result.rateHps / 1000).toFixed(1)} KH/s`);
// Output: "Estimated: 2.3s"
//         "Hash rate: 456.2 KH/s"
```

## Uncalibrated State UI Pattern

Show users when calibration is needed:

```typescript
function MiningUI() {
  const [calibration, setCalibration] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);

  useEffect(() => {
    // Load cached calibration on mount
    persistence.load('device-id').then(setCalibration);
  }, []);

  const handleCalibrate = async () => {
    setIsCalibrating(true);
    const cal = await calibrateNip13({ cpu: 'device-id' });
    await persistence.save('device-id', cal);
    setCalibration(cal);
    setIsCalibrating(false);
  };

  if (!calibration) {
    return (
      <div>
        <p>⚠️ Device not calibrated - estimates unavailable</p>
        <button onClick={handleCalibrate} disabled={isCalibrating}>
          {isCalibrating ? 'Calibrating...' : 'Calibrate Now (3 seconds)'}
        </button>
      </div>
    );
  }

  // Show estimates...
  const estimate = estimate({
    bytes: contentLength,
    tags: tagCount,
    bits: difficulty,
    threads: 4,
    cal: calibration
  });

  return <div>Estimated time: {formatTime(estimate.timeSec)}</div>;
}
```

## API

### `calibrateNip13(options?): Promise<Calibration>`

Calibrate the estimator for NIP-13 mining on this device by running actual `mine_event()` with different payload sizes.

**Options:**
- `cpu?: string` - Device identifier for caching (default: `navigator.userAgent`)
- `sizes?: number[]` - Payload sizes to test in bytes (default: `[256, 4096, 16384]`)
- `tagSets?: number[]` - Tag counts to test (default: `[0, 8, 24]`)
- `threadsToTest?: number[]` - Thread counts for efficiency estimates (default: `[1, 2, 4, 8]` filtered by CPU cores)
- `warmupMs?: number` - JIT warmup duration (default: `200`)
- `probe1tMs?: number` - Single-thread probe duration (default: `400`)
- `probeMtMs?: number` - Multi-thread probe duration (default: `250`, currently unused)

**Returns:** `Calibration` - Device-specific performance model with coefficients `a`, `b`, `c` and efficiency factors

**Duration:** ~1-3 seconds (varies by device)

**How it works:**
1. Runs `mine_event()` with difficulty 1 for short bursts
2. Measures actual hash rate from different payload sizes
3. Derives per-byte and per-tag costs from measurements
4. Currently single-threaded - multi-thread efficiency uses conservative estimates

```typescript
const cal = await calibrateNip13({
  cpu: 'macbook-pro-m1',
  sizes: [512, 2048, 8192],  // Custom test sizes
  tagSets: [0, 5, 15],       // Custom tag counts
  warmupMs: 300              // Longer warmup for JIT
});
```

### `estimate(params): EstimateResult`

Estimate mining time for given parameters.

**Parameters:**
- `bytes: number` - Content size in UTF-8 bytes
- `tags: number` - Number of tags
- `bits: number` - Target difficulty (leading zero bits)
- `threads: number` - Worker thread count
- `cal: Calibration` - Calibration data from `calibrateNip13()`

**Returns:**
```typescript
{
  timeSec: number;     // Estimated time in seconds
  rateHps: number;     // Hash rate (hashes/second)
  details: {
    t1: number;        // Time per attempt (single-thread)
    E: number;         // Thread efficiency factor (0-1)
    attempts: number;  // Total attempts needed (2^bits)
  }
}
```

### `severity(sec, thresholds?): { level, label }`

Categorize estimate for UI display.

```typescript
const { level, label } = severity(estimateResult.timeSec);
// level: 'green' | 'yellow' | 'orange' | 'red' | 'purple'
// label: 'OK' | 'Caution' | 'Warning' | 'High' | 'Extreme'
```

**Default thresholds:** `[3, 15, 60, 300]` seconds

### `recordOutcome(input): Calibration`

Refine calibration based on actual mining results (optional online learning).

```typescript
const startTime = performance.now();
// ... perform actual mining ...
const actualTimeSec = (performance.now() - startTime) / 1000;

const refinedCal = recordOutcome({
  params: { bytes, tags, bits, threads, cal },
  cal,
  actualTimeSec,
  alphaABC: 0.1,   // Learning rate for coefficients
  alphaEff: 0.05   // Learning rate for efficiency
});

await persistence.save('device-id', refinedCal);
```

### Persistence

#### `createLocalStoragePersistence(): WebPersistence`

```typescript
const persistence = createLocalStoragePersistence();

// Save
await persistence.save('device-key', calibration);

// Load
const cal = await persistence.load('device-key'); // null if not found
```

### Utilities

```typescript
formatTime(0.5)   // "500ms"
formatTime(5)     // "5s"
formatTime(5.2)   // "5.2s"
formatTime(125)   // "2m05s"

utf8ByteLength('Hello')     // 5
utf8ByteLength('😀')       // 4

attemptsFromBits(10)  // 1024
attemptsFromBits(20)  // 1048576
```

## How Calibration Works

### 1. Performance Model

The estimator uses a linear model for single-thread attempt time:

```
t₁ = a + b·bytes + c·tags
```

Where:
- `a` = base overhead per attempt (independent of payload)
- `b` = cost per byte of content
- `c` = cost per tag

### 2. Multi-threading

Real-world thread scaling is modeled with efficiency factors:

```
rate(threads) = (1/t₁) · threads · E(threads)
```

Where `E(threads)` is measured efficiency (0-1) accounting for:
- Thread coordination overhead
- Memory bandwidth limits
- CPU cache contention
- Context switching

### 3. Efficiency Extrapolation

For unmeasured thread counts:

```
E(t) = E(tₘₐₓ) · (tₘₐₓ / t)^0.3    for t > tₘₐₓ
```

Power-law decay models diminishing returns at higher thread counts.

## NIP-13 Integration

This library uses **real notemine mining** for calibration by calling `mine_event()` directly:

1. Imports `@notemine/core` WASM module
2. Runs actual `mine_event()` with low difficulty (1) for short bursts (200-400ms)
3. Measures real SHA256 hashing performance including all overhead
4. Captures actual hash rate from mining results (`result.khs`)
5. No Rust changes needed - uses existing production mining function

**Not a generic estimator** - specifically calibrated against notemine's actual NIP-13 implementation.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed explanation of why this approach is more accurate than synthetic benchmarks.

## Current Limitations & TODOs

### ⚠️ Known Issues

**1. Single-threaded calibration only**
   - Multi-threaded calibration not yet implemented
   - Efficiency factors use conservative estimates (0.85^log2(threads))
   - Real-world efficiency varies by CPU architecture and system load
   - **Future:** Could use @notemine/wrapper's worker pool for real multi-thread measurement

**2. Test environment**
   - WASM tests skipped in Node.js/vitest (WASM loading not supported)
   - Calibration works in browser but not unit tests
   - **TODO:** Set up Playwright/e2e tests for browser-based WASM integration

### 📋 Future Improvements

- [ ] Multi-threaded calibration using @notemine/wrapper's worker pool
- [ ] Browser-based e2e test suite with Playwright
- [ ] Calibration presets for common devices (reduce first-run time)
- [ ] Telemetry for tracking estimate accuracy in production
- [ ] Confidence intervals/error bounds on estimates
- [ ] Auto-recalibration detection (detect performance drift)
- [ ] Progressive calibration (quick initial + refined background calibration)

## Architecture

```
@notemine/estimator
├── Core (generic)
│   ├── calibration.ts    - Generic calibration engine
│   ├── estimation.ts     - Time estimation math
│   ├── refinement.ts     - Online learning
│   └── utils.ts          - Helper functions
└── NIP-13 (specific)
    ├── adapter.ts        - NIP-13 payload building, mine_event() wrapper
    └── calibrate.ts      - NIP-13 calibration using real mining
```

## See Also

- [NIP-13 Specification](https://github.com/nostr-protocol/nips/blob/master/13.md)
- [@notemine/core](../core) - WASM mining engine
- [@notemine/wrapper](../wrapper) - TypeScript mining wrapper

## License

MIT
