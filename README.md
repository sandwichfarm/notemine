# @notemine

**notemine** mines nostr notes, is written in rust, targets web and compiles to wasm. Variable difficulty and realtime hashrate. There's some [demos](https://sandwichfarm.github.io/notemine).

## Packages:
- [`@notemine/core`](./packages/core/) - It is in here you find the `rust` source for the moner. Build step generates JS Bindings, type declarations and wasm file via `wasm-bindgen`. The base of all packages in this monorepo.
- [`@notemine/wrapper`](./packages/wrapper/) - A user-friendly wrapper for `@notemine/core` that greatly simplifies usage in modern stacks and deployments with modern bundlers. Provides observables, manages workers, tracks internal state and bundles wasm as _inline base64_ within _inline_ web-workers for hassle-free use in modern apps targeted for the browser.
- _[`@notemine/svelte`](./packages/svelte/)_ [coming soon]  - Library optimized for Svelte that exports stores and components for hassle-free use in svelte projects.
- _[`@notemine/reactjs`](./packages/reactjs/)_ [coming soon] -  Library optimized for ReactJS that exports stores and components for hassle-free use in svelte projects.

## Demos:
- [`@notemine/vanilla-js-demo`](./demos/vanilla-js/) - Demo of Notemine written with vanilla Javascript, HTML and CSS that implements `@notemine/core`. No bundlers.
- [`@notemine/svelte-demo`](./demos/svelte/) - Vanilla JS Demo Ported to Svelte that implements `@notemine/wrapper` (note: future version will implement `@notemine/svelte`) 

## Contrib
`@notemine` monorepo presently uses `yarn workspaces` without any monorepo toolkit (pending). Recommended to use `yarn v2` until monorepo is fully configured.
```
yarn install 
```

Use workspace commands: 
```
yarn workspace @notemine/wrapper ...
```
