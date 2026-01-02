#!/bin/bash
# Build XEdDSA WASM module for local development
# Requires: Rust toolchain, wasm-pack

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
XEDDSA_DIR="$PROJECT_ROOT/src/lib/xeddsa-wasm"

echo "Building XEdDSA WASM module..."

# Check for required tools
if ! command -v wasm-pack &> /dev/null; then
    echo "wasm-pack not found. Installing..."
    cargo install wasm-pack
fi

if ! rustup target list --installed | grep -q wasm32-unknown-unknown; then
    echo "Adding wasm32 target..."
    rustup target add wasm32-unknown-unknown
fi

# Build WASM
cd "$XEDDSA_DIR"
wasm-pack build --target web --out-dir pkg

echo "XEdDSA WASM build complete!"
echo "Output: $XEDDSA_DIR/pkg/"
