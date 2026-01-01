#!/bin/bash
# Build FROST WASM module
# Requires: Rust, wasm-pack, wasm32-unknown-unknown target

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FROST_WASM_DIR="$PROJECT_ROOT/src/lib/frost-wasm"

echo "=== FROST WASM Build Script ==="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v rustc &> /dev/null; then
    echo "ERROR: Rust is not installed."
    echo "Install from: https://rustup.rs/"
    exit 1
fi

if ! command -v wasm-pack &> /dev/null; then
    echo "ERROR: wasm-pack is not installed."
    echo "Install with: cargo install wasm-pack"
    exit 1
fi

if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
    echo "Adding wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

echo "Prerequisites OK"
echo ""

# Build WASM
echo "Building WASM module..."
cd "$FROST_WASM_DIR"

wasm-pack build --target web --out-dir pkg

echo ""
echo "=== Build Complete ==="
echo "Output: $FROST_WASM_DIR/pkg/"
echo ""
echo "Files:"
ls -la pkg/

echo ""
echo "The WASM module is ready to use!"
echo "The Next.js app will automatically load it from src/lib/frost-wasm/pkg/"
