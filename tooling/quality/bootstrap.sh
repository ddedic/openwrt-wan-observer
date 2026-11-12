#!/bin/sh
set -eu

task_root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
quality_venv="$task_root/.local/quality-venv"
if [ ! -x "$quality_venv/bin/python" ]; then
  python3 -m venv "$quality_venv"
fi
if ! "$quality_venv/bin/python" -m pip --version >/dev/null 2>&1; then
  "$quality_venv/bin/python" -m ensurepip
fi
"$quality_venv/bin/python" -m pip install --disable-pip-version-check --require-hashes --only-binary=:all: -r "$task_root/tooling/quality/requirements.txt"

local_luacheck="$task_root/.local/quality-lua/bin/luacheck"
if [ -x "$local_luacheck" ] && "$local_luacheck" --version | grep -q '^Luacheck: 1.2.0$'; then
  printf '%s\n' 'Using project-local Luacheck 1.2.0'
elif [ ! -x "$local_luacheck" ] && command -v luacheck >/dev/null 2>&1 && luacheck --version | grep -q '^Luacheck: 1.2.0$'; then
  printf '%s\n' 'Using Luacheck 1.2.0 from PATH'
else
  if ! command -v luarocks >/dev/null 2>&1; then
    printf '%s\n' 'Install LuaRocks (brew install luarocks; or apt install luarocks liblua5.1-0-dev), then rerun npm run setup:quality.' >&2
    exit 1
  fi
  luarocks --tree "$task_root/.local/quality-lua" install luacheck 1.2.0-1
fi
"$quality_venv/bin/ruff" --version
"$quality_venv/bin/shellcheck" --version
"$quality_venv/bin/shfmt" --version
"$task_root/node_modules/.bin/stylua" --version
