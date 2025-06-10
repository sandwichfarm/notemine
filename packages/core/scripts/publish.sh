#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
PACKAGE_DIR="$SCRIPT_DIR/.."

# Build first
echo "Building package..."
"$SCRIPT_DIR/build.sh"

# Publish from package root (where package.json is)
cd "$PACKAGE_DIR"
echo "Publishing package..."
npm publish --access=public