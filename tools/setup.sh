#!/usr/bin/env bash
set -eo pipefail
remote_root="$(cd "$(dirname "$0")/.." && pwd)"
command -v uv >/dev/null || { echo 'Install uv before running this setup script.'; exit 1; }
mkdir -p "$remote_root/local"
if [ ! -d "$remote_root/local/esp-idf" ]; then
  git clone --branch v6.1 --depth 1 --shallow-submodules --recursive https://github.com/espressif/esp-idf.git "$remote_root/local/esp-idf"
fi
remote_sdk_commit="$(git -C "$remote_root/local/esp-idf" rev-parse HEAD)"
if [ "$remote_sdk_commit" != fff9895c82d744c7237be8847347bdd1b07c6643 ]; then
  echo 'Unexpected ESP-IDF checkout. Expected the recorded v6.1 commit; leaving it unchanged.'
  exit 1
fi
if [ ! -d "$remote_root/local/bootstrap" ]; then
  uv venv --python 3.12 --seed "$remote_root/local/bootstrap"
fi
uv pip install --python "$remote_root/local/bootstrap/bin/python" cmake ninja
source "$remote_root/local/bootstrap/bin/activate"
export IDF_TOOLS_PATH="$remote_root/local/espressif-tools"
cd "$remote_root/local/esp-idf"
./install.sh esp32c6
