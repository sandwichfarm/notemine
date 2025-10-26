# @notemine/wrapper

[![npm](https://img.shields.io/npm/v/@notemine/wrapper)](https://www.npmjs.com/package/@notemine/wrapper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![build](https://github.com/sandwichfarm/notemine/actions/workflows/publish-packages.yml/badge.svg)](https://github.com/sandwichfarm/notemine/actions/workflows/publish-packages.yml)
[![docs](https://github.com/sandwichfarm/notemine/actions/workflows/docs.yml/badge.svg)](https://github.com/sandwichfarm/notemine/actions/workflows/docs.yml)

A TypeScript wrapper for [@notemine/core](../core/README.md) that provides a high-level, user-friendly API for mining Nostr notes with proof-of-work.

## Overview

`@notemine/wrapper` simplifies the process of mining Nostr notes by:
- Managing Web Workers automatically for parallel mining
- Providing RxJS observables for real-time progress tracking
- Bundling WASM as inline base64 within inline workers for hassle-free deployment
- Offering a clean, Promise-based API with TypeScript support
- Tracking mining statistics and performance metrics 

## Features

- **Automatic Worker Management**: Spawns and manages multiple Web Workers based on available CPU cores
- **Real-time Progress Tracking**: RxJS observables for monitoring hash rate, best PoW, and mining progress
- **Pause & Resume**: Pause mining operations and resume from the exact same state
- **State Persistence**: Save and restore mining state across page refreshes or sessions
- **Dynamic Worker Scaling**: Resume mining with a different number of workers
- **Zero Configuration**: Works out of the box with modern bundlers (Vite, Webpack, Rollup, etc.)
- **TypeScript Support**: Fully typed API with comprehensive interfaces
- **Cancellable Operations**: Stop mining at any time with proper cleanup
- **Performance Metrics**: Track hash rates, total hashes, and mining efficiency
- **Framework Agnostic**: Works with React, Vue, Svelte, Angular, or vanilla JavaScript

## Installation

```bash
npm install @notemine/wrapper @notemine/core rxjs
# or
pnpm install @notemine/wrapper @notemine/core rxjs
# or  
yarn add @notemine/wrapper @notemine/core rxjs
```

### Peer Dependencies

- `@notemine/core`: The WASM core mining module
- `rxjs`: For reactive programming patterns

## Basic Usage

```typescript
import { Notemine } from '@notemine/wrapper';

// Create a new miner instance
const notemine = new Notemine({
  content: 'Hello, Nostr!',
  pubkey: 'your-public-key-here',
  difficulty: 21,
  numberOfWorkers: navigator.hardwareConcurrency || 4,
  tags: [['t', 'intro']]
});

// Subscribe to progress updates
const progressSub = notemine.progress$.subscribe(progress => {
  console.log(`Worker ${progress.workerId}: ${progress.hashRate} H/s`);
});

// Subscribe to success event
const successSub = notemine.success$.subscribe(({ result }) => {
  console.log('Mining completed!', result);
  console.log('Event ID:', result.event.id);
});

// Start mining
await notemine.mine();

// Cancel mining if needed
// notemine.cancel();

// Clean up subscriptions
progressSub.unsubscribe();
successSub.unsubscribe();
```

## API Documentation

### Constructor Options

```typescript
interface MinerOptions {
  content?: string;          // The content to include in the mined event
  tags?: string[][];        // Tags for the event
  pubkey?: string;          // Public key for the event
  difficulty?: number;      // Target difficulty (default: 20)
  numberOfWorkers?: number; // Number of workers (default: CPU cores)
  kind?: number;            // Event kind (default: 1)
  debug?: boolean;          // Enable debug logging (default: false)
}
```

### Properties

- `content`: Get/set the event content
- `tags`: Get/set the event tags
- `pubkey`: Get/set the public key
- `difficulty`: Get/set the mining difficulty
- `numberOfWorkers`: Get/set the number of workers
- `totalHashRate`: Get the combined hash rate of all workers

### Methods

#### `mine(): Promise<void>`
Starts the mining process. Throws if pubkey or content is not set.

#### `pause(): void`
Pauses the mining process while preserving the current state (nonces, best PoW, etc.). Workers are terminated but state is maintained for resumption.

#### `resume(workerNonces?: string[]): Promise<void>`
Resumes mining from a paused state. Optionally accepts an array of worker nonces to resume from. If not provided, uses the tracked state from the last pause.

#### `getState(): MiningState`
Returns the current mining state as a serializable object. This can be saved to localStorage, IndexedDB, or any other storage mechanism for later restoration.

#### `restoreState(state: MiningState): void`
Restores the miner to a previously saved state. Must be called before `resume()`. Can be used to resume mining after a page refresh or across sessions.

#### `cancel(): void`
Stops the mining process and terminates all workers. State is not preserved.

#### `stop(): void`
Alias for `cancel()`.

### Observables

```typescript
// Mining state
mining$: BehaviorSubject<boolean>
cancelled$: BehaviorSubject<boolean>
paused$: BehaviorSubject<boolean>

// Results
result$: BehaviorSubject<MinedResult | null>
success$: Observable<SuccessEvent>

// Progress tracking
progress$: Observable<ProgressEvent>
workersPow$: BehaviorSubject<Record<number, BestPowData>>
highestPow$: BehaviorSubject<WorkerPow | null>

// Errors
error$: Observable<ErrorEvent>
cancelledEvent$: Observable<CancelledEvent>

// Worker management
workers$: BehaviorSubject<Worker[]>
```

### Type Definitions

```typescript
interface ProgressEvent {
  workerId: number;
  hashRate?: number;
  bestPowData?: BestPowData;
}

interface BestPowData {
  bestPow: number;
  nonce: string;
  hash: string;
}

interface MinedResult {
  event: any;           // The mined Nostr event
  totalTime: number;    // Total mining time in milliseconds
  hashRate: number;     // Average hash rate achieved
}

interface SuccessEvent {
  result: MinedResult | null;
}

interface ErrorEvent {
  error: any;
  message?: string;
}

interface MiningState {
  event: {
    pubkey: string;
    kind: number;
    tags: string[][];
    content: string;
    created_at: number;
  };
  workerNonces: string[];      // Array of current nonces for each worker
  bestPow: BestPowData | null; // Best proof-of-work found so far
  difficulty: number;          // Target difficulty
  numberOfWorkers: number;     // Number of workers when state was saved
}
```

## Advanced Features

### Debug Mode

Enable detailed console logging for development and troubleshooting:

```typescript
const notemine = new Notemine({
  content: 'Hello, Nostr!',
  pubkey: 'your-public-key-here',
  difficulty: 21,
  debug: true  // Enable debug logging
});
```

Debug output includes:
- **Session Management**: RunId generation for each mining session
- **Worker Progress**: Per-worker nonce updates (rate-limited to every 2s)
- **Hash Rate**: Total hash rate with delta changes (every 1s)
- **Ghost Updates**: Detection and blocking of stale worker messages
- **State Persistence**: Nonce arrays being saved/restored

Example console output:
```
[Notemine] Starting new mining session, runId: f3008079-ef2e-44c7-a282-24e851ccfe0c
[Notemine] Worker 0 currentNonce: 123456
[Notemine] totalHashRate: 6000.50 KH/s (Δ 150.25)
[Notemine] 🚫 GHOST UPDATE BLOCKED - Ignoring message from old session
```

### Protocol v2 - Worker Message Format

The wrapper uses Protocol v2 for communication with workers, which includes:

**Key Features**:
- **RunId Gating**: Each mining session has a unique UUID to prevent ghost updates
- **Current Nonce Tracking**: Workers report their current nonce for accurate resume
- **Backward Compatibility**: Protocol v1 messages (without runId) still work

**Message Structure**:
```typescript
{
  type: 'progress',
  workerId: 0,
  runId: 'uuid-v4-string',     // Session identifier
  currentNonce: '123456',      // Current position for resume
  bestPowData: {
    bestPow: 21,
    nonce: '123456',
    hash: '000000abc...'
  },
  hashRate: 5000
}
```

**Custom Worker Implementation**:
```typescript
// In your custom mine.worker.ts
let sessionRunId: string;

self.onmessage = (e) => {
  const { event, runId, workerId } = e.data;
  sessionRunId = runId;

  // Your mining loop
  while (mining) {
    // ... mining logic ...

    // Send progress with Protocol v2 format
    self.postMessage({
      type: 'progress',
      workerId,
      runId: sessionRunId,           // Include runId
      currentNonce: nonce.toString(), // Include current nonce
      hashRate: calculatedHashRate,
      bestPowData: bestPow ? { bestPow, nonce, hash } : undefined
    });
  }
};
```

### Guarded Persistence

The wrapper implements "guarded persistence" to avoid storing useless default state:

```typescript
// Only real progress is persisted
const state = notemine.getState();

// If mining just started, workerNonces is empty
// state.workerNonces = []  (defaults like ["0", "1", "2"] are filtered out)

// After real progress
// state.workerNonces = ["123456", "789012"]  (actual progress is saved)
```

This prevents cluttering localStorage with meaningless initial state.

### State Persistence Throttling

State updates are automatically throttled to ~500ms to reduce I/O overhead:

```typescript
// Updates are batched and throttled
const notemine = new Notemine({
  /* ... */
  onMiningStateUpdate: (state) => {
    // This callback is called at most every 500ms
    // Instead of 4-8 times per second
    localStorage.setItem('mining-state', JSON.stringify(state));
  }
});
```

### Performance Optimizations

The wrapper includes several performance improvements:

**WASM SIMD**: 15-35% hash rate improvement
```
Baseline: 5.2-5.5 MH/s
With SIMD: 6.0 MH/s sustained, 7.0 MH/s burst
```

**Adaptive Progress Reporting**: Automatically adjusts reporting frequency to maintain ~250ms cadence

**Efficient Cancel**: Workers respond to cancel requests within 100ms typical

### Lifecycle Semantics

Enhanced pause/resume/cancel behavior:

**Grace Period**: Workers get 200ms to respond to cancel before termination

**Idempotent Operations**: Safe to call pause/resume/cancel multiple times

**Progress Gating**: Progress messages are ignored after mining stops (prevents race conditions)

```typescript
// All of these are safe
notemine.pause();
notemine.pause();  // No-op, already paused

notemine.resume();
notemine.resume(); // No-op, already mining
```

## Framework Examples

<details>
<summary>svelte</summary>

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { type Writable, writable } from 'svelte/store';
  import { type ProgressEvent, Notemine } from '@notemine/wrapper';

  const numberOfMiners = 8
  let notemine: Notemine;
  let progress: Writable<ProgressEvent[]> = new writable(new Array(numberOfMiners))
  let success: Writeable<SuccessEvent> = new writable(null)

  onMount(() => {
    notemine = new Notemine({ content: 'Hello, Nostr!', numberOfMiners  });

    const progress$ = miner.progress$.subscribe(progress_ => {
      progress.update( _progress => {
        _progress[progress_.workerId] = progress_
        return _progress
      })
    });

    const success$ = miner.progress$.subscribe(success_ => {
      const {event, totalTime, hashRate}
      success.update( _success => {
        _success = success_
        return _success
      })
      miner.cancel();
    });

    notemine.mine();

    return () => {
      progress$.unsubscribe();
      success$.unsubscribe();
      miner.cancel();
    };
  });
  $: miners = $progress
</script>


<div>
{#each $miners as miner}
<span>Miner #{miner.workerId}: {miner.hashRate}kH/s [Best PoW: ${miner.bestPowData}]
{/each}

{#if($success !== null)}
  <pre>
  {$success.event}
  </pre>
{/if}

</div>
```
</details>



<details>
<summary>react</summary>

```reactjs
  import React, { useEffect } from 'react';
  import { Notemine } from '@notemine/wrapper';

  const MyComponent = () => {
    const notemine = new Notemine({ content: 'Hello, Nostr!' });

    useEffect(() => {
      const subscription = notemine.progress$.subscribe(progress => {
        // Update progress bar or display notemine's progress
      });

      notemine.mine();

      return () => {
        subscription.unsubscribe();
        notemine.cancel();
      };
    }, []);

    return (
      <div>
        {/* Your UI components */}
      </div>
    );
  };

```
</details>

<details>
<summary>vue</summary>

```vue
<template>
  <div>
    <!-- Your UI components -->
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onUnmounted } from 'vue';
import { Notemine } from '@notemine/wrapper';

export default defineComponent({
  name: 'MinerComponent',
  setup() {
    const notemine = new Notemine({ content: 'Hello, Nostr!' });

    onMounted(() => {
      const subscription = notemine.progress$.subscribe(progress => {
        // Update progress bar or display notemine's progress
      });

      notemine.mine();

      onUnmounted(() => {
        subscription.unsubscribe();
        notemine.cancel();
      });
    });

    return {};
  },
});
</script>

```
</details>

<details>
<summary>angular</summary>

```javascript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Notemine } from '@notemine/wrapper';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notemine',
  templateUrl: './notemine.component.html',
})
export class MinerComponent implements OnInit, OnDestroy {
  notemine: Notemine;
  progressSubscription: Subscription;

  ngOnInit() {
    this.notemine = new Notemine({ content: 'Hello, Nostr!' });
    this.progressSubscription = this.notemine.progress$.subscribe(progress => {
      // Update progress bar or display notemine's progress
    });

    this.notemine.mine();
  }

  ngOnDestroy() {
    this.progressSubscription.unsubscribe();
    this.notemine.cancel();
  }
}
```
</details>

## Advanced Usage

### Pause and Resume Mining

```typescript
import { Notemine } from '@notemine/wrapper';

const miner = new Notemine({
  content: 'Mining with pause/resume',
  pubkey: 'your-pubkey-here',
  difficulty: 21,
  numberOfWorkers: 4
});

// Start mining
await miner.mine();

// Pause after some time
setTimeout(() => {
  miner.pause();
  console.log('Mining paused');
}, 10000);

// Resume later
setTimeout(async () => {
  await miner.resume();
  console.log('Mining resumed');
}, 20000);
```

### Persist State Across Page Refreshes

```typescript
import { Notemine } from '@notemine/wrapper';

// Before page refresh - save state
const miner = new Notemine({
  content: 'Persistent mining',
  pubkey: 'your-pubkey-here',
  difficulty: 21
});

await miner.mine();

// User navigates away or refreshes
window.addEventListener('beforeunload', () => {
  miner.pause();
  const state = miner.getState();
  localStorage.setItem('mining_state', JSON.stringify(state));
});

// After page reload - restore state
const savedState = localStorage.getItem('mining_state');
if (savedState) {
  const state = JSON.parse(savedState);

  const miner = new Notemine({
    numberOfWorkers: state.numberOfWorkers
  });

  miner.restoreState(state);
  await miner.resume();

  console.log('Mining resumed from saved state!');
}
```

### Resume with Different Worker Count

```typescript
import { Notemine } from '@notemine/wrapper';

// Start mining with 4 workers
const miner = new Notemine({
  content: 'Scalable mining',
  pubkey: 'your-pubkey-here',
  difficulty: 21,
  numberOfWorkers: 4
});

await miner.mine();

// Pause and get state
miner.pause();
const state = miner.getState();

// Resume with 8 workers - nonces are automatically redistributed
const miner2 = new Notemine({
  numberOfWorkers: 8  // Different worker count!
});

miner2.restoreState(state);
await miner2.resume();

console.log('Mining resumed with 8 workers instead of 4!');
```

### Track Pause/Resume State

```typescript
import { Notemine } from '@notemine/wrapper';

const miner = new Notemine({ content: 'State tracking' });

// Subscribe to pause state
miner.paused$.subscribe(isPaused => {
  console.log(`Mining is ${isPaused ? 'paused' : 'active'}`);

  if (isPaused) {
    // Show resume button in UI
    // Display saved state info
  }
});

// Subscribe to mining state
miner.mining$.subscribe(isMining => {
  console.log(`Mining is ${isMining ? 'running' : 'stopped'}`);
});
```

### Monitoring Mining Progress

```typescript
import { Notemine } from '@notemine/wrapper';
import { combineLatest } from 'rxjs';

const miner = new Notemine({ content: 'Mining demo', difficulty: 25 });

// Combine multiple observables for comprehensive monitoring
combineLatest([
  miner.mining$,
  miner.highestPow$,
  miner.progress$
]).subscribe(([isMining, highestPow, progress]) => {
  if (isMining) {
    console.log('Mining in progress...');
    console.log(`Best PoW so far: ${highestPow?.bestPow || 0}`);
    console.log(`Worker ${progress.workerId} hash rate: ${progress.hashRate} H/s`);
  }
});
```

### Custom Worker Configuration

```typescript
// Use half of available CPU cores
const miner = new Notemine({
  content: 'Optimized mining',
  numberOfWorkers: Math.floor(navigator.hardwareConcurrency / 2)
});

// Monitor individual worker performance
miner.workersPow$.subscribe(workersPow => {
  Object.entries(workersPow).forEach(([workerId, powData]) => {
    console.log(`Worker ${workerId}: Best PoW = ${powData.bestPow}`);
  });
});
```

### Error Handling

```typescript
const miner = new Notemine({ content: 'Error handling demo' });

miner.error$.subscribe(error => {
  console.error('Mining error:', error);
  // Implement retry logic or user notification
});

try {
  await miner.mine();
} catch (error) {
  console.error('Failed to start mining:', error);
}
```

## Building from Source

### Prerequisites

- Node.js 16+
- pnpm (recommended) or npm
- For WASM rebuilding: Rust toolchain and wasm-pack

### Build Steps

```bash
# Clone the repository
git clone https://github.com/sandwichfarm/notemine.git
cd notemine/packages/wrapper

# Install dependencies
pnpm install

# Build the package
pnpm run build

# Run tests
pnpm test
```

### Development Scripts

- `pnpm run clean` - Remove build artifacts
- `pnpm run build` - Build the package with TypeScript declarations
- `pnpm run build:types` - Generate TypeScript declarations only
- `pnpm run dev` - Run development build
- `pnpm test` - Run test suite

## Performance Tips

1. **Worker Count**: More workers don't always mean better performance. Test different configurations for your use case.
2. **Difficulty**: Higher difficulty exponentially increases mining time. Start with lower values for testing.
3. **Browser Considerations**: Performance varies across browsers. Chrome and Firefox typically offer the best WASM performance.
4. **Memory Usage**: Each worker maintains its own WASM instance. Monitor memory usage with many workers.

## Troubleshooting

### Common Issues

1. **"Public key is not set" error**
   - Ensure you set the `pubkey` property before calling `mine()`

2. **Workers not starting**
   - Check browser console for CSP (Content Security Policy) errors
   - Ensure your bundler properly handles Web Workers

3. **Low hash rates**
   - Verify WASM is loading correctly
   - Check if browser throttling is active (background tabs)
   - Consider reducing the number of workers

### Debug Mode

Enable detailed logging by checking the browser console for worker messages:

```typescript
const miner = new Notemine({ content: 'Debug mode' });

// Monitor all worker messages
miner.workers$.subscribe(workers => {
  console.log(`Active workers: ${workers.length}`);
});
```

## Related Packages

- [`@notemine/core`](https://github.com/sandwichfarm/notemine/tree/master/packages/core) - Low-level WASM bindings
- [`@notemine/svelte`](https://github.com/sandwichfarm/notemine/tree/master/packages/svelte) - Svelte integration (planned)
- [`@notemine/reactjs`](https://github.com/sandwichfarm/notemine/tree/master/packages/reactjs) - React integration (planned)

## Demos

- [Vanilla JS Demo](https://github.com/sandwichfarm/notemine/tree/master/demos/vanilla-js-demo) - Basic implementation
- [Svelte Demo](https://github.com/sandwichfarm/notemine/tree/master/demos/svelte-demo) - Svelte + Vite example

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit PRs to the [main repository](https://github.com/sandwichfarm/notemine).

## License

MIT License

See [LICENSE](../../LICENSE) for details.
