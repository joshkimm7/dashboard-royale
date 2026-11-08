#!/usr/bin/env bash
# Builds dist/index.html for Vercel: fetches the pinned official challenge data,
# installs the pinned Python dependencies in a throwaway venv, and runs build_data.py.
set -euo pipefail

DATA_REPO=https://github.com/tamu-datathon-org/dashboard-royale.git
DATA_REV=5f9274bdc3efa6614e6c081becaeadda34c57a32
DATA_DIR=.official-data
VENV=.venv-build

cd "$(dirname "$0")/.."

# Fetch only the pinned revision; the full history is several hundred MB.
if [ "$(git -C "$DATA_DIR" rev-parse HEAD 2>/dev/null || true)" != "$DATA_REV" ]; then
  rm -rf "$DATA_DIR"
  git init --quiet "$DATA_DIR"
  git -C "$DATA_DIR" fetch --quiet --depth 1 "$DATA_REPO" "$DATA_REV"
  git -C "$DATA_DIR" checkout --quiet FETCH_HEAD
fi

# build_data.py needs Python 3.11+, and pandas 2.2.3 only ships wheels up to 3.13.
# Use an installed 3.11-3.13 interpreter, otherwise let uv provide one.
PYTHON=
for candidate in python3.12 python3.13 python3.11 python3; do
  if command -v "$candidate" >/dev/null &&
     "$candidate" -c 'import sys; sys.exit(not (3, 11) <= sys.version_info[:2] <= (3, 13))' 2>/dev/null; then
    PYTHON=$candidate
    break
  fi
done

rm -rf "$VENV"
if [ -n "$PYTHON" ]; then
  echo "Using $("$PYTHON" --version)"
  "$PYTHON" -m venv "$VENV"
  "$VENV/bin/python" -m pip install --quiet --disable-pip-version-check 'pandas==2.2.3' 'numpy==2.3.5'
elif command -v uv >/dev/null; then
  echo "No Python 3.11-3.13 on PATH; creating one with uv"
  uv venv --quiet --python 3.12 "$VENV"
  uv pip install --quiet --python "$VENV/bin/python" 'pandas==2.2.3' 'numpy==2.3.5'
else
  echo "error: need Python 3.11-3.13 or uv to build; neither was found" >&2
  exit 1
fi

mkdir -p dist
"$VENV/bin/python" build_data.py "$DATA_DIR"
test -s dist/index.html
echo "Built dist/index.html ($(du -h dist/index.html | cut -f1))"
