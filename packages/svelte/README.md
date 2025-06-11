# @notemine/svelte

[![npm](https://img.shields.io/npm/v/@notemine/svelte)](https://www.npmjs.com/package/@notemine/svelte)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Svelte stores and components for mining Nostr notes with proof-of-work using Notemine.

> **Note**: This package is currently in development. For now, please use [@notemine/wrapper](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper) directly with Svelte.

## Overview

`@notemine/svelte` will provide Svelte-specific stores and components that make it easy to integrate Notemine into your Svelte/SvelteKit applications. It will build upon `@notemine/wrapper` to offer:

- Reactive Svelte stores for mining state
- Pre-built Svelte components
- SvelteKit integration with SSR support
- TypeScript support with Svelte-specific types
- Automatic subscription management

## Planned Features

- **Mining Store**: Reactive store for all mining operations
- **Progress Components**: Customizable mining progress indicators
- **Mining Button**: One-click mining with built-in state
- **Statistics Dashboard**: Real-time mining metrics
- **Worker Monitor**: Individual worker performance tracking
- **SvelteKit Utilities**: Server-side rendering helpers

## Installation (Coming Soon)

```bash
npm install @notemine/svelte @notemine/wrapper @notemine/core rxjs
# or
pnpm install @notemine/svelte @notemine/wrapper @notemine/core rxjs
# or
yarn add @notemine/svelte @notemine/wrapper @notemine/core rxjs
```

## Planned API

### Basic Usage

```svelte
<script>
  import { createMiner } from '@notemine/svelte';
  
  const miner = createMiner({
    content: 'Hello, Nostr!',
    difficulty: 21,
    pubkey: 'your-pubkey-here'
  });
  
  const { mining, progress, result, error } = miner;
</script>

<button on:click={miner.mine} disabled={$mining}>
  {$mining ? 'Mining...' : 'Start Mining'}
</button>

{#if $mining}
  <div>
    <p>Hash Rate: {$progress?.hashRate || 0} H/s</p>
    <p>Best PoW: {$progress?.bestPowData?.bestPow || 0}</p>
    <button on:click={miner.cancel}>Cancel</button>
  </div>
{/if}

{#if $result}
  <div>
    <h3>Mining Complete!</h3>
    <p>Event ID: {$result.event.id}</p>
    <p>Time: {$result.totalTime}ms</p>
  </div>
{/if}

{#if $error}
  <p>Error: {$error.message}</p>
{/if}
```

### Using Components

```svelte
<script>
  import { MiningInterface, MiningProgress, MiningStats } from '@notemine/svelte';
  
  let content = '';
  let pubkey = 'your-pubkey';
</script>

<MiningInterface 
  {content} 
  {pubkey}
  difficulty={21}
  on:success={(e) => console.log('Mined!', e.detail)}
>
  <MiningProgress slot="progress" />
  <MiningStats slot="stats" detailed />
</MiningInterface>
```

### Advanced Store Usage

```svelte
<script>
  import { miningStore } from '@notemine/svelte';
  import { onMount } from 'svelte';
  
  const store = miningStore({
    difficulty: 25,
    numberOfWorkers: 8
  });
  
  onMount(() => {
    // Auto-cleanup handled by the store
    return store.destroy;
  });
  
  $: totalHashRate = $store.workers.reduce(
    (sum, w) => sum + (w.hashRate || 0), 0
  );
</script>

<div>
  <h2>Total Hash Rate: {totalHashRate} H/s</h2>
  
  {#each $store.workers as worker}
    <div>
      Worker {worker.id}: {worker.hashRate || 0} H/s
      (Best PoW: {worker.bestPow || 0})
    </div>
  {/each}
</div>
```

### SvelteKit Integration

```typescript
// +page.server.ts
import { prepareMiningConfig } from '@notemine/svelte/server';

export async function load({ params }) {
  return {
    miningConfig: prepareMiningConfig({
      difficulty: 21,
      content: params.content
    })
  };
}
```

```svelte
<!-- +page.svelte -->
<script>
  import { MiningProvider } from '@notemine/svelte';
  
  export let data;
</script>

<MiningProvider config={data.miningConfig}>
  <!-- Your mining interface -->
</MiningProvider>
```

## Current Alternative: Using @notemine/wrapper with Svelte

Until this package is released, you can use `@notemine/wrapper` directly:

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import { writable, derived } from 'svelte/store';
  import { Notemine } from '@notemine/wrapper';
  
  // Create reactive stores
  const mining = writable(false);
  const progress = writable(null);
  const result = writable(null);
  const error = writable(null);
  
  let miner;
  let subscriptions = [];
  
  onMount(() => {
    miner = new Notemine({
      content: 'Hello from Svelte!',
      difficulty: 21,
      pubkey: 'your-pubkey',
      numberOfWorkers: 4
    });
    
    // Connect observables to stores
    subscriptions = [
      miner.mining$.subscribe(mining.set),
      miner.progress$.subscribe(progress.set),
      miner.result$.subscribe(result.set),
      miner.error$.subscribe(error.set)
    ];
  });
  
  onDestroy(() => {
    subscriptions.forEach(sub => sub.unsubscribe());
    if (miner) miner.cancel();
  });
  
  async function startMining() {
    if (miner) {
      try {
        await miner.mine();
      } catch (err) {
        error.set(err);
      }
    }
  }
  
  function cancelMining() {
    if (miner) miner.cancel();
  }
</script>

<button on:click={startMining} disabled={$mining}>
  {$mining ? 'Mining...' : 'Start Mining'}
</button>

{#if $mining && $progress}
  <div>
    <p>Worker {$progress.workerId}: {$progress.hashRate || 0} H/s</p>
    <button on:click={cancelMining}>Cancel</button>
  </div>
{/if}

{#if $result}
  <div>
    <h3>Success!</h3>
    <p>Event ID: {$result.event.id}</p>
  </div>
{/if}
```

### Creating a Reusable Store

```typescript
// stores/mining.ts
import { writable, derived } from 'svelte/store';
import { Notemine } from '@notemine/wrapper';

export function createMiningStore(options) {
  const miner = new Notemine(options);
  
  const mining = writable(false);
  const progress = writable(null);
  const result = writable(null);
  const error = writable(null);
  
  const subscriptions = [
    miner.mining$.subscribe(mining.set),
    miner.progress$.subscribe(progress.set),
    miner.result$.subscribe(result.set),
    miner.error$.subscribe(error.set)
  ];
  
  return {
    subscribe: mining.subscribe,
    progress: { subscribe: progress.subscribe },
    result: { subscribe: result.subscribe },
    error: { subscribe: error.subscribe },
    mine: () => miner.mine(),
    cancel: () => miner.cancel(),
    destroy: () => {
      subscriptions.forEach(sub => sub.unsubscribe());
      miner.cancel();
    }
  };
}
```

## Roadmap

1. **Phase 1**: Core store implementation
   - Reactive mining store with full wrapper integration
   - Automatic subscription management
   - TypeScript support

2. **Phase 2**: Component library
   - Pre-built Svelte components
   - Customizable themes
   - Animation support

3. **Phase 3**: SvelteKit integration
   - SSR-safe implementations
   - Load function helpers
   - Form action integration

## Demo Application

Check out the [Svelte Demo](https://github.com/sandwichfarm/notemine/tree/master/demos/svelte-demo) for a working example using `@notemine/wrapper` with Svelte.

## Contributing

We welcome contributions! If you're interested in helping develop this package:

1. Check the [main repository](https://github.com/sandwichfarm/notemine) for issues
2. Review the existing Svelte demo for patterns
3. Submit PRs with your improvements

## Related Packages

- [`@notemine/core`](https://github.com/sandwichfarm/notemine/tree/master/packages/core) - Low-level WASM bindings
- [`@notemine/wrapper`](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper) - High-level TypeScript wrapper
- [`@notemine/reactjs`](https://github.com/sandwichfarm/notemine/tree/master/packages/reactjs) - React integration (planned)

## License

MIT License

See [LICENSE](../../LICENSE) for details.