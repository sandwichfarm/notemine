# note⛏️
**notemine** mines nostr notes, is written in rust, targets web and compiles to wasm. Variable difficulty and realtime hashrate. There's a [demo](https://sandwichfarm.github.io/notemine).

# related
- [`notemine-js`](https://github.com/sandwichfarm/notemine-js) is an npm module that wraps this package with observables for use with modern stacks.
- [`notemine-hw`](https://github.com/plebemineira/notemine_hw) is a fork ported to a cli application that leverages hardware acceleration

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

