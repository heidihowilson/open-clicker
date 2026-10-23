#!/usr/bin/env bash
set -euo pipefail
remote_root="$(cd "$(dirname "$0")/.." && pwd)"
export IDF_TOOLS_PATH="$remote_root/local/espressif-tools"
source "$remote_root/local/bootstrap/bin/activate"
source "$remote_root/local/esp-idf/export.sh"
cd "$remote_root/firmware"
idf.py "$@"
