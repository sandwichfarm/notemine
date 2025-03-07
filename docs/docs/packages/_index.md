# notemine⛏️ 

**notemine** mines nostr notes, the miner is written in rust, targets web and compiles to wasm. Variable difficulty and realtime hashrate. There's some [demos](https://sandwichfarm.github.io/notemine). There are [low-level js wasm bindings](./packages/core/) and an [easy-to-use typescript wrapper](./packages/wrapper/)

## Packages:
- [`@notemine/rust`](./packages/rust/) - Rust source code for miner and build scripts.
- [`@notemine/core`](./packages/core/) - This package contains the `wasm-bindgen` build artifacts from `@notemine/rust`. This is a low-level interface for the Notemine WASM miner.
- [`@notemine/wrapper`](./packages/wrapper/) - A user-friendly wrapper for `@notemine/core` that greatly simplifies usage in modern stacks and deployments with modern bundlers. Provides observables, manages workers, tracks internal state and bundles wasm as _inline base64_ within _inline_ web-workers for hassle-free use in modern apps targeted for the browser.
- _[`@notemine/svelte`](./packages/svelte/)_ [coming soon]  - Library optimized for Svelte that exports stores and components for hassle-free use in svelte projects.
- _[`@notemine/reactjs`](./packages/reactjs/)_ [coming soon] -  Library optimized for ReactJS that exports stores and components for hassle-free use in svelte projects.

## Demos:
- [`@notemine/vanilla-js-demo`](./demos/vanilla-js-demo/) - Demo of Notemine written with vanilla Javascript, HTML and CSS that implements `@notemine/core`. No bundlers.
- [`@notemine/svelte-demo`](./demos/svelte-demo/) - Vanilla JS Demo Ported to Svelte that implements `@notemine/wrapper` (note: future version will implement `@notemine/svelte`) 

## Forks:
- [`notemine-hw`](https://github.com/plebemineira/notemine_hw) is a fork of `@notemine/rust` ported to a cli application that leverages hardware acceleration

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
