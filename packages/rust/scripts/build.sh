#!/bin/bash

set -e

function error {
  echo "Error: $1"
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

RUST_DIR="$SCRIPT_DIR/.."
CORE_DIR="$SCRIPT_DIR/../../core"
SCRIPT_UPDATE_PACKAGE="$SCRIPT_DIR/update-package-json.mjs"
README_NPM="$RUST_DIR/README.npm.md"

[ -d "$RUST_DIR" ] || error "Rust directory not found at $RUST_DIR"
[ -d "$CORE_DIR" ] || echo "Core directory not found at $CORE_DIR, so creating it..."
mkdir -p "$CORE_DIR"
[ -f "$SCRIPT_UPDATE_PACKAGE" ] || error "Update package script not found at $SCRIPT_UPDATE_PACKAGE"
[ -f "$README_NPM" ] || error "README.npm.md not found at $README_NPM"

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

cp "$README_NPM" "$RUST_DIR/pkg/README.md"
echo "Copied README.npm.md to pkg/README.md"

if [ -d "$RUST_DIR/dist" ]; then
  rm -rf "$RUST_DIR/dist"
  echo "Removed existing dist directory"
fi

mv "$RUST_DIR/pkg" "$RUST_DIR/dist"
echo "Renamed pkg to dist"

echo "Updating package.json..."

if [ ! -x "$SCRIPT_UPDATE_PACKAGE" ]; then
  chmod +x "$SCRIPT_UPDATE_PACKAGE"
  echo "Set execute permission for update-package-json.mjs"
fi

"$SCRIPT_UPDATE_PACKAGE"
echo "package.json has been successfully updated."

echo "Copying dist to packages/core..."
cp -fr "$RUST_DIR/dist/." "$CORE_DIR"
echo "Copied dist to packages/core"

echo "Build process successfully completed."