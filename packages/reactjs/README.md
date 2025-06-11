# @notemine/reactjs

[![npm](https://img.shields.io/npm/v/@notemine/reactjs)](https://www.npmjs.com/package/@notemine/reactjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

React hooks and components for mining Nostr notes with proof-of-work using Notemine.

> **Note**: This package is currently in development. For now, please use [@notemine/wrapper](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper) directly with React.

## Overview

`@notemine/reactjs` will provide React-specific hooks and components that make it easy to integrate Notemine into your React applications. It will build upon `@notemine/wrapper` to offer:

- Custom React hooks for mining operations
- Pre-built UI components for mining progress
- Automatic cleanup and lifecycle management
- TypeScript support with React-specific types

## Planned Features

- **useMining Hook**: Main hook for mining operations with automatic cleanup
- **MiningProgress Component**: Customizable progress indicator
- **MiningStats Component**: Real-time mining statistics display
- **MiningButton Component**: One-click mining with built-in state management
- **Context Provider**: Share mining state across components
- **SSR Support**: Server-side rendering compatibility

## Installation (Coming Soon)

```bash
npm install @notemine/reactjs @notemine/wrapper @notemine/core rxjs
# or
pnpm install @notemine/reactjs @notemine/wrapper @notemine/core rxjs
# or
yarn add @notemine/reactjs @notemine/wrapper @notemine/core rxjs
```

## Planned API

### Basic Usage

```tsx
import { useMining, MiningProgress } from '@notemine/reactjs';

function MyComponent() {
  const {
    mine,
    cancel,
    mining,
    progress,
    result,
    error
  } = useMining({
    content: 'Hello, Nostr!',
    difficulty: 21,
    pubkey: 'your-pubkey-here'
  });

  return (
    <div>
      <button onClick={mine} disabled={mining}>
        {mining ? 'Mining...' : 'Start Mining'}
      </button>
      
      {mining && (
        <>
          <MiningProgress progress={progress} />
          <button onClick={cancel}>Cancel</button>
        </>
      )}
      
      {result && (
        <div>
          <h3>Mining Complete!</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      
      {error && (
        <div>Error: {error.message}</div>
      )}
    </div>
  );
}
```

### Advanced Usage with Context

```tsx
import { MiningProvider, useMiningContext } from '@notemine/reactjs';

function App() {
  return (
    <MiningProvider
      defaultOptions={{
        difficulty: 21,
        numberOfWorkers: 4
      }}
    >
      <MiningInterface />
    </MiningProvider>
  );
}

function MiningInterface() {
  const { mine, mining, stats } = useMiningContext();
  
  return (
    <div>
      <h2>Total Hash Rate: {stats.totalHashRate} H/s</h2>
      <button onClick={() => mine({ content: 'New note' })}>
        Mine New Note
      </button>
    </div>
  );
}
```

### Custom Components

```tsx
import { MiningStats, MiningWorkers } from '@notemine/reactjs';

function MiningDashboard() {
  const { mining, workers, stats } = useMining();
  
  return (
    <div>
      <MiningStats 
        stats={stats}
        showDetails
        refreshInterval={100}
      />
      
      <MiningWorkers 
        workers={workers}
        showIndividualStats
      />
    </div>
  );
}
```

## Current Alternative: Using @notemine/wrapper with React

Until this package is released, you can use `@notemine/wrapper` directly:

```tsx
import React, { useEffect, useState, useRef } from 'react';
import { Notemine } from '@notemine/wrapper';

function useMining(options) {
  const [mining, setMining] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const minerRef = useRef(null);

  useEffect(() => {
    minerRef.current = new Notemine(options);
    
    const subscriptions = [
      minerRef.current.mining$.subscribe(setMining),
      minerRef.current.progress$.subscribe(setProgress),
      minerRef.current.result$.subscribe(setResult),
      minerRef.current.error$.subscribe(setError)
    ];

    return () => {
      subscriptions.forEach(sub => sub.unsubscribe());
      if (minerRef.current) {
        minerRef.current.cancel();
      }
    };
  }, []);

  const mine = async () => {
    if (minerRef.current) {
      try {
        await minerRef.current.mine();
      } catch (err) {
        setError(err);
      }
    }
  };

  const cancel = () => {
    if (minerRef.current) {
      minerRef.current.cancel();
    }
  };

  return { mine, cancel, mining, progress, result, error };
}

// Usage
function MyComponent() {
  const { mine, cancel, mining, progress, result } = useMining({
    content: 'Hello from React!',
    difficulty: 21,
    pubkey: 'your-pubkey'
  });

  return (
    <div>
      <button onClick={mine} disabled={mining}>
        {mining ? 'Mining...' : 'Start Mining'}
      </button>
      {mining && (
        <div>
          <p>Progress: {progress?.hashRate || 0} H/s</p>
          <button onClick={cancel}>Cancel</button>
        </div>
      )}
      {result && <p>Success! Event ID: {result.event.id}</p>}
    </div>
  );
}
```

## Roadmap

1. **Phase 1**: Core hooks implementation
   - `useMining` hook with full feature parity with wrapper
   - Automatic cleanup and error handling
   - TypeScript definitions

2. **Phase 2**: Component library
   - Pre-built UI components
   - Customizable themes
   - Accessibility support

3. **Phase 3**: Advanced features
   - Mining pool support
   - Persistent mining state
   - Performance optimizations

## Contributing

We welcome contributions! If you're interested in helping develop this package, please:

1. Check the [main repository](https://github.com/sandwichfarm/notemine) for issues
2. Join the discussion in our community channels
3. Submit PRs with your improvements

## Related Packages

- [`@notemine/core`](https://github.com/sandwichfarm/notemine/tree/master/packages/core) - Low-level WASM bindings
- [`@notemine/wrapper`](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper) - High-level TypeScript wrapper
- [`@notemine/svelte`](https://github.com/sandwichfarm/notemine/tree/master/packages/svelte) - Svelte integration (planned)

## License

MIT License

See [LICENSE](../../LICENSE) for details.