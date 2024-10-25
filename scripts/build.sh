#!/bin/bash
cargo clean
wasm-pack build --target web --release
cp README.npm.md pkg/README.md
node js/post-build.js