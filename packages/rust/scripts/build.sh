#!/bin/bash
cargo clean
wasm-pack build --target web --release
cp README.npm.md pkg/README.md
mv pkg dist
cp dist ../core