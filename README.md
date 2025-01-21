# notemine⛏️ 

**notemine** mines nostr notes, the miner is written in rust, targets web and compiles to wasm. Variable difficulty and realtime hashrate. There's some [demos](https://sandwichfarm.github.io/notemine). There are [low-level js wasm bindings](./packages/core/) and an [easy-to-use typescript wrapper](./packages/wrapper/)

## Packages
- `@notemine/core` [`git`](https://github.com/sandwichfarm/notemine/tree/master/packages/core) [npm](https://www.npmjs.com/package/@notemine/core) - Low-level js bindings and interface for Notemine WASM.
- `@notemine/wrapper` [`git`](https://github.com/sandwichfarm/notemine/tree/master/packages/wrapper) [`npm`](https://www.npmjs.com/package/@notemine/wrapper) - A user-friendly wrapper for `@notemine/core` that greatly simplifies usage in modern stacks and deployments with modern bundlers. Provides observables, manages workers, tracks internal state and bundles wasm as _inline base64_ within _inline_ web-workers for hassle-free use in modern apps targeted for the browser.

## Demos
- `@notemine/vanilla-js-demo` [`git`](https://github.com/sandwichfarm/notemine/tree/master/demos/vanilla-js-demo) is a demo written with HTML, Vanilla JS and CSS, with no bundlers, that implements `@notemine/core`
- `@notemine/svelte-demo` [`git`](https://github.com/sandwichfarm/notemine/tree/master/demos/svelte-demo) is a demo built with `svelte` and `vite` that implements `@notemine/wrapper`

## Planned
- _`@notemine/svelte`_ Module that extends `@notemine/wrapper`, optimized for Svelte that exports stores and components for hassle-free use in svelte projects.
- _`@notemine/reactjs`_ Module that extends `@notemine/wrapper`, optimized for ReactJS that exports stores and components for hassle-free use in svelte projects.

## Forks:
- [`notemine-hw`](https://github.com/plebemineira/notemine_hw) is a fork of `@notemine/core` ported to a cli application that leverages hardware acceleration

## Build
Will build all packages.
```
pnpm install 
```

Install without building all packages
```
pnpm install --ignore-scripts
```

Use workspace commands: 
```
pnpm --filter @notemine/wrapper ...
```
