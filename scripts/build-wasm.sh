#!/usr/bin/env bash
# Builds the Rust engine (rust/wasm) into rust/wasm/pkg, the opencut-wasm
# package the web app imports. Needs the wasm32-unknown-unknown target and
# wasm-bindgen-cli matching the wasm-bindgen version in Cargo.lock.
set -euo pipefail
cd "$(dirname "$0")/.."

cargo build -p opencut-wasm --target wasm32-unknown-unknown --release
rm -rf rust/wasm/pkg
wasm-bindgen --target bundler --out-dir rust/wasm/pkg --out-name opencut_wasm \
  target/wasm32-unknown-unknown/release/opencut_wasm.wasm

if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -O rust/wasm/pkg/opencut_wasm_bg.wasm -o rust/wasm/pkg/opencut_wasm_bg.wasm
fi

version=$(sed -n 's/^version = "\(.*\)"/\1/p' rust/wasm/Cargo.toml | head -1)
cat > rust/wasm/pkg/package.json <<JSON
{
  "name": "opencut-wasm",
  "type": "module",
  "description": "FrameFlow engine compiled to WebAssembly (built from rust/wasm)",
  "version": "${version}",
  "license": "MIT",
  "files": ["opencut_wasm_bg.wasm", "opencut_wasm.js", "opencut_wasm_bg.js", "opencut_wasm.d.ts"],
  "main": "opencut_wasm.js",
  "types": "opencut_wasm.d.ts",
  "sideEffects": ["./opencut_wasm.js", "./snippets/*"]
}
JSON
echo "Built rust/wasm/pkg (opencut-wasm ${version})"
