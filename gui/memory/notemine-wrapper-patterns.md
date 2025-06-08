# @notemine/wrapper Usage Patterns

## Core Concept
**High-level TypeScript wrapper around @notemine/core WASM with RxJS observables**

## Key Features

### 1. Simple API
```typescript
import { Notemine } from '@notemine/wrapper';

const notemine = new Notemine({
  content: "hello world",
  tags: [["t", "introduction"]],
  pubkey: "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f",
  difficulty: 21,
  numberOfWorkers: 7
});

// Can also set properties after initialization
notemine.pubkey = pubkey;

// Start mining
await notemine.mine();
```

### 2. Reactive Observables
```typescript
// Mining progress per worker
notemine.progress$.subscribe(progress => {
  console.log(`Worker ${progress.workerId}: ${progress.hashRate}kH/s`);
});

// Overall best PoW found
notemine.highestPow$.subscribe(pow => {
  console.log(`Best PoW: ${pow.bestPow} (${pow.hash})`);
});

// Per-worker PoW status
notemine.workersPow$.subscribe(workerData => {
  // Object with worker stats
});

// Mining completion
notemine.success$.subscribe(result => {
  const { event, totalTime, hashRate } = result;
  console.log('Mining complete!', event);
});

// Error handling
notemine.error$.subscribe(error => {
  console.error('Mining error:', error);
});

// Cancellation
notemine.cancelled$.subscribe(() => {
  console.log('Mining cancelled');
});
```

### 3. Worker Management
- Multi-threaded mining using Web Workers
- Configurable number of workers (max: navigator.hardwareConcurrency)
- Real-time hash rate reporting
- Automatic load balancing

## Integration Patterns

### Svelte Integration
```typescript
import { writable } from 'svelte/store';
import { onDestroy } from 'svelte';

let notemine: Notemine;
let progressStore = writable([]);
let successStore = writable(null);

// Subscribe to observables
const progressSub = notemine.progress$.subscribe(progress => {
  progressStore.update(arr => {
    arr[progress.workerId] = progress;
    return arr;
  });
});

const successSub = notemine.success$.subscribe(result => {
  successStore.set(result);
  notemine.cancel(); // Stop mining
});

onDestroy(() => {
  progressSub.unsubscribe();
  successSub.unsubscribe();
  notemine.cancel();
});
```

### "Everything is PoW" Implementation
```typescript
class PoWClient {
  private notemine: Notemine | null = null;
  
  async createEvent(content: string, kind: number = 1, difficulty: number = 21) {
    // Calculate difficulty based on content/kind
    const targetDifficulty = this.calculateDifficulty(content, kind);
    
    // Create notemine instance
    this.notemine = new Notemine({
      content,
      kind,
      difficulty: targetDifficulty,
      numberOfWorkers: navigator.hardwareConcurrency
    });
    
    // Mine the event
    return new Promise((resolve, reject) => {
      this.notemine.success$.subscribe(result => {
        resolve(result.event);
      });
      
      this.notemine.error$.subscribe(error => {
        reject(error);
      });
      
      this.notemine.mine();
    });
  }
  
  private calculateDifficulty(content: string, kind: number): number {
    // Smart difficulty calculation
    if (content.includes('@npub')) return 16; // Mentions
    if (content.includes('#[')) return 21;    // Replies
    if (kind === 7) return 16;                // Reactions
    return 24; // Default notes
  }
}
```

## Key Benefits

1. **Web Worker Architecture** - Non-blocking UI during mining
2. **Real-time Progress** - Live updates for hash rates and progress
3. **Flexible Configuration** - Adjustable difficulty and worker count
4. **Observable Pattern** - Reactive programming with RxJS
5. **TypeScript Support** - Full type safety and IntelliSense