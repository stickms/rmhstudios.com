#!/usr/bin/env bash
# Toolchain bootstrap + guard for the Bazel build system.
#   scripts/preflight.sh           # full bootstrap (install missing)
#   scripts/preflight.sh --guard   # fast check; install cheap, hard-fail on heavy
#
# `go` is intentionally NOT required — rules_go provides a hermetic Go SDK.
set -euo pipefail

GUARD=0
[ "${1:-}" = "--guard" ] && GUARD=1
OS="$(uname -s)"
have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '\033[1;36m[preflight]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[preflight]\033[0m %s\n' "$*" >&2; exit 1; }

pkg_install() {
  case "$OS" in
    Darwin) have brew || die "Homebrew required: https://brew.sh"; brew install "$1" ;;
    Linux)
      if have apt-get; then sudo apt-get update -y && sudo apt-get install -y "$1"
      elif have apk; then sudo apk add --no-cache "$1"
      else die "No supported package manager (apt/apk) found"; fi ;;
    *) die "Unsupported OS: $OS" ;;
  esac
}

# bazelisk — the one true entrypoint (pins Bazel via .bazelversion).
if ! have bazelisk && ! have bazel; then
  say "installing bazelisk"
  case "$OS" in
    Darwin) pkg_install bazelisk ;;
    # apt/apk don't carry bazelisk; npm is the reliable cross-distro path.
    Linux) have npm && npm install -g @bazel/bazelisk || pkg_install bazelisk ;;
  esac
fi

# node — required for the frontend leaf. Heavy runtime: install on bootstrap,
# guide on guard.
if ! have node; then
  [ "$GUARD" = 1 ] && die "node missing — install Node 24 LTS then re-run (e.g. 'brew install node@24')"
  pkg_install node
fi

# pnpm via corepack (ships with node).
if ! have pnpm; then
  say "enabling pnpm via corepack"
  corepack enable pnpm || die "corepack enable failed — install pnpm manually"
fi

# helm — only needed at deploy.
if ! have helm; then
  if [ "$GUARD" = 1 ]; then
    say "helm missing (only needed for 'make prod')"
  else
    pkg_install helm
  fi
fi

# docker — daemon cannot be auto-provisioned; hard-fail with guidance.
have docker || die "docker missing — install Docker Desktop / Engine, then re-run"
docker info >/dev/null 2>&1 || die "docker daemon not running — start Docker, then re-run"

say "toolchain OK"
