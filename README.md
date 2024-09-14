# ⛏️ notemine
A wasm miner for nostr events. Variable difficulty and realtime hashrate. See web [demo](https://sandwichfarm.github.io/notemine-wasm) or build it yourself.

# deps 
```
cargo install wasm-pack
```

# build
```
cargo clean
RUSTFLAGS="-C target-feature=+simd128" wasm-pack build --target web --release
```

# use demo
```
cd demo && npx serve 
```

# license
GNU General Public License v3.0
