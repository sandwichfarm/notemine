> Note: You most likely want to use [`@notemine/wrapper`](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper)

# @notemine/core

[![npm](https://img.shields.io/npm/v/@notemine/core)](https://www.npmjs.com/package/@notemine/core)
[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Low-level WASM bindings for Notemine - a high-performance Nostr note miner written in Rust and compiled to WebAssembly.

## Overview

`@notemine/core` provides direct access to the underlying WASM mining functionality. It offers fine-grained control over the mining process, making it suitable for advanced use cases or when building custom mining solutions.

For most applications, we recommend using [`@notemine/wrapper`](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper) which provides a more user-friendly API with worker management and observables.

## Features

- High-performance Rust implementation compiled to WASM
- Direct control over mining parameters
- Progress reporting with hash rate calculations
- Cancellable mining operations
- Customizable nonce ranges for distributed mining
- Full TypeScript support

## Installation

```bash
npm install @notemine/core
# or
pnpm install @notemine/core
# or
yarn add @notemine/core
```

## Basic Usage

```javascript
import init, { mine_event } from '@notemine/core';

// Initialize the WASM module
await init();

// Prepare the event to mine
const event = {
  pubkey: "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f",
  kind: 1,
  tags: [],
  content: "hello world",
  // created_at is optional - will use current timestamp if not provided
};

const difficulty = 21;
const startNonce = "0";
const nonceStep = "1";

// Progress callback
function reportProgress(hashRate, bestPowData) {
  if (hashRate) {
    console.log(`Hash rate: ${hashRate} H/s`);
  }
  if (bestPowData) {
    console.log('Best PoW found:', bestPowData);
  }
}

// Cancellation callback
let shouldStop = false;
function shouldCancel() {
  return shouldStop;
}

// Start mining (synchronous operation)
const minedResult = mine_event(
  JSON.stringify(event),
  difficulty,
  startNonce,
  nonceStep,
  reportProgress,
  shouldCancel
);

console.log('Mining result:', minedResult);
```

## API Documentation

### `init(options?)`

Initializes the WASM module. Must be called before using any other functions.

**Parameters:**
- `options` (optional): Initialization options for the WASM module

**Returns:** `Promise<void>`

### `mine_event(event_json, difficulty, start_nonce_str, nonce_step_str, report_progress, should_cancel)`

Mines a Nostr event to meet the specified proof-of-work difficulty.

**Parameters:**
- `event_json` (string): JSON string of the event to mine. Must include `pubkey`, `kind`, `tags`, and `content`
- `difficulty` (number): Target difficulty (number of leading zero bits required)
- `start_nonce_str` (string): Starting nonce value as a string
- `nonce_step_str` (string): Nonce increment step as a string
- `report_progress` (function): Callback function for progress updates
  - Called with `(hashRate?: number, bestPowData?: object)`
  - `bestPowData` contains: `{ best_pow: number, nonce: string, hash: string, currentNonce: string }`
  - `currentNonce` is the current nonce being tested (useful for pause/resume)
- `should_cancel` (function): Callback that returns `boolean` to cancel mining

**Returns:** `MinedResult | { error: string }`

### Types

```typescript
interface NostrEvent {
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at?: number;
  id?: string;
}

interface MinedResult {
  event: NostrEvent;    // The mined event with id and nonce tag
  total_time: number;   // Total mining time in seconds
  khs: number;         // Mining rate in kilohashes per second
}

interface BestPowData {
  best_pow: number;     // Best proof-of-work found so far
  nonce: string;        // Nonce that achieved this PoW
  hash: string;         // Hash that achieved this PoW
  currentNonce: string; // Current nonce being tested (for state tracking)
}
```

## Advanced Usage

### Distributed Mining

You can distribute mining across multiple workers by using different nonce ranges:

```javascript
// Worker 1
mine_event(event, difficulty, "0", "2", reportProgress, shouldCancel);

// Worker 2  
mine_event(event, difficulty, "1", "2", reportProgress, shouldCancel);
```

### Custom Progress Tracking

```javascript
let lastReportTime = Date.now();
let totalHashes = 0;

function reportProgress(hashRate, bestPowData) {
  if (hashRate) {
    totalHashes += hashRate * ((Date.now() - lastReportTime) / 1000);
    lastReportTime = Date.now();
    
    console.log(`Current rate: ${(hashRate / 1000).toFixed(2)} kH/s`);
    console.log(`Total hashes: ${(totalHashes / 1000000).toFixed(2)}M`);
  }
  
  if (bestPowData) {
    console.log(`New best PoW: ${bestPowData.best_pow} (nonce: ${bestPowData.nonce})`);
  }
}
```

### Graceful Cancellation

```javascript
let mining = true;

// Set up cancellation handler
process.on('SIGINT', () => {
  console.log('Stopping miner...');
  mining = false;
});

function shouldCancel() {
  return !mining;
}

// Mine with cancellation support
const result = mine_event(event, difficulty, "0", "1", reportProgress, shouldCancel);

if (result.error === "Mining cancelled.") {
  console.log('Mining was cancelled');
} else {
  console.log('Mining completed:', result);
}
```

## Building from Source

### Prerequisites

- Rust toolchain (install from [rustup.rs](https://rustup.rs/))
- wasm-pack: `cargo install wasm-pack`
- Node.js 16+ and pnpm

### Build Steps

```bash
# Clone the repository
git clone https://github.com/sandwichfarm/notemine.git
cd notemine/packages/core

# Install dependencies
pnpm install

# Build the WASM module
pnpm run build

# Run tests
cargo test
```

### Development Scripts

- `pnpm run build` - Build the WASM module and TypeScript bindings
- `pnpm run publish:rust` - Publish the Rust crate to crates.io
- `pnpm run publish:js` - Publish the npm package

## Performance Considerations

- The mining operation is CPU-intensive and will block the thread
- For browser environments, use Web Workers to avoid blocking the UI
- Consider using `@notemine/wrapper` which handles worker management automatically
- Hash rates vary based on device capabilities and browser WASM optimizations

## Browser Compatibility

Requires browsers with WebAssembly support:
- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 79+

## Related Packages

- [`@notemine/wrapper`](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper) - High-level wrapper with worker management and observables
- [`@notemine/svelte`](https://github.com/sandwichfarm/notemine/tree/master/packages/svelte) - Svelte integration (planned)
- [`@notemine/reactjs`](https://github.com/sandwichfarm/notemine/tree/master/packages/reactjs) - React integration (planned)

## Demos

- [Vanilla JS Demo](https://github.com/sandwichfarm/notemine/tree/master/demos/vanilla-js-demo) - Pure JavaScript implementation
- [Svelte Demo](https://github.com/sandwichfarm/notemine/tree/master/demos/svelte-demo) - Svelte + Vite implementation

## License

GNU General Public License v3.0

See [LICENSE](./LICENSE) for details.