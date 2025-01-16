# notemine⛏️ 

**notemine** mines nostr notes, is written in rust, targets web and compiles to wasm. Variable difficulty and realtime hashrate. There's some [demos](https://sandwichfarm.github.io/notemine).

## Packages:
- [`@notemine/rust`](./packages/core/) - Rust source code for miner and build scripts.
- [`@notemine/core`](./packages/core/) - This package contains the `wasm-bindgen` build artifacts from `@notemine/rust`. This is a low-level interface for the Notemine WASM miner.
- [`@notemine/wrapper`](./packages/wrapper/) - A user-friendly wrapper for `@notemine/core` that greatly simplifies usage in modern stacks and deployments with modern bundlers. Provides observables, manages workers, tracks internal state and bundles wasm as _inline base64_ within _inline_ web-workers for hassle-free use in modern apps targeted for the browser.
- _[`@notemine/svelte`](./packages/svelte-demo/)_ [coming soon]  - Library optimized for Svelte that exports stores and components for hassle-free use in svelte projects.
- _[`@notemine/reactjs`](./packages/reactjs/)_ [coming soon] -  Library optimized for ReactJS that exports stores and components for hassle-free use in svelte projects.

## Demos:
- [`@notemine/vanilla-js-demo`](./demos/vanilla-js-demo/) - Demo of Notemine written with vanilla Javascript, HTML and CSS that implements `@notemine/core`. No bundlers.
- [`@notemine/svelte-demo`](./demos/svelte/) - Vanilla JS Demo Ported to Svelte that implements `@notemine/wrapper` (note: future version will implement `@notemine/svelte`) 

## Contrib
`@notemine` monorepo presently uses `pnpm workspaces` without any monorepo toolkit (pending). Recommended to use `pnpm v2` until monorepo is fully configured.
```
pnpm install 
```

Use workspace commands: 
```
pnpm workspace @notemine/wrapper ...
```
