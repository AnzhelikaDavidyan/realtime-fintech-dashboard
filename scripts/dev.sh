#!/usr/bin/env bash
# One-command local start: right Node version, Rust on PATH, dependencies installed, dev server.
cd "$(dirname "$0")/.."

# Node from .nvmrc. nvm is a shell function, so load it into this shell first.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use --silent 2>/dev/null || nvm install || exit 1
else
  echo "nvm not found; using Node $(node --version). Expected the version in .nvmrc." >&2
fi

set -e

# Homebrew's rustup is keg-only, so cargo isn't linked into /opt/homebrew/bin.
if ! command -v cargo >/dev/null; then
  for dir in "$HOME/.cargo/bin" /opt/homebrew/opt/rustup/bin /usr/local/opt/rustup/bin; do
    [ -x "$dir/cargo" ] && export PATH="$dir:$PATH" && break
  done
fi
if ! command -v cargo >/dev/null; then
  echo "cargo not found. Install Rust with rustup (see README, Prerequisites)." >&2
  exit 1
fi

# Reinstall only when package-lock.json changed since the last install.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci
fi

exec npm start
