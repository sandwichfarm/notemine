#!/bin/bash
cargo clean
wasm-pack build --target web --release
mv README.npm.md pkg/README.md