# note⛏️
**notemine** mines nostr notes, is written in rust, and compiles to wasm. Variable difficulty and realtime hashrate. There's a [demo](https://sandwichfarm.github.io/notemine).

If you're looking for a native version of notemine, check out [`notemine-hw`](https://github.com/plebemineira/notemine_hw)

# deps 
```
cargo install wasm-pack
```

# build
```
cargo clean
wasm-pack build --target web --release
```

# run demo
```
cd demo && npx serve 
```

# license
GNU General Public License v3.0

# related
check out [`notemine-js`](https://github.com/sandwichfarm/notemine-js) for an npm module that wraps the `wasm-bindgen` interfaces as observables for use with svelte, react and vue
