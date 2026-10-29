#!/usr/bin/env bash
# Build the router image and run every layout through it. Needs Docker (grove has it).
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -q -f router/Dockerfile -t open-clicker-router:test .
docker run --rm -e ONLY="${ONLY:-}" -v /tmp/open-clicker-selftest:/tmp/selftest open-clicker-router:test bun router/selftest.ts /tmp/selftest
