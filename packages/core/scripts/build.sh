#!/bin/bash

set -e

function error {
  echo "Error: $1"
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

RUST_DIR="$SCRIPT_DIR/.."

[ -d "$RUST_DIR" ] || error "Rust source not found at $RUST_DIR"

"$SCRIPT_DIR/deps.sh"

command -v cargo >/dev/null 2>&1 || error "cargo is not installed."
command -v wasm-pack >/dev/null 2>&1 || error "wasm-pack is not installed."
command -v node >/dev/null 2>&1 || error "node is not installed."

cd "$RUST_DIR"

echo "Starting build process in $RUST_DIR..."

echo "Cleaning previous builds..."
cargo clean

echo "Building with wasm-pack..."
wasm-pack build --target web --release

[ -d "$RUST_DIR/pkg" ] || error "'pkg' directory not found after wasm-pack build."

echo "Modifying package contents..."

if [ -f "$RUST_DIR/pkg/.gitignore" ]; then
  rm "$RUST_DIR/pkg/.gitignore"
  echo "Removed pkg/.gitignore"
fi

if [ -d "$RUST_DIR/dist" ]; then
  rm -rf "$RUST_DIR/dist"
  echo "Removed existing dist directory"
fi

mv "$RUST_DIR/pkg" "$RUST_DIR/dist"
echo "Renamed pkg to dist"

rm "$RUST_DIR/dist/README.md"
rm "$RUST_DIR/dist/package.json"

echo "Build process successfully completed."