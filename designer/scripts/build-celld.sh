#!/usr/bin/env bash
# Build the Designer and assemble the celld deploy directory at designer/.celld/.
# Only the Vite output, worker.js and wrangler.jsonc are published.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"
bun install --frozen-lockfile
bun test test
bun run build
out="$here/.celld"
mkdir -p "$out"
find "$out" -mindepth 1 -delete
cp -R dist "$out/public"
cp celld/worker.js celld/wrangler.jsonc "$out/"
echo "$out"
