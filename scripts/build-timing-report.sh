#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# build-timing-report.sh — summarize a Docker/BuildKit `--progress=plain` log
# into per-stage wall-clock, so a deploy can answer "what dominates the build:
# the Vite frontend, the Go compile, pnpm install, or image assembly?"
#
# Reads a BuildKit plain-progress log (file arg or stdin) and prints:
#   • per-stage UNCACHED wall-clock (cached steps contribute 0 — they're free)
#   • a frontend/backend/deps/image rollup with percentages
#
# BuildKit attributes each RUN/COPY vertex to a `[stage step/total]` label and
# closes it with `#<id> DONE <secs>s` (or `#<id> CACHED`). Multiple vertices
# share a stage label, so summing their DONE seconds gives the stage's real cost.
#
# Portability: pure POSIX awk — no gawk match()-capture/asort and no external
# `sort`, because the deploy host's awk (busybox/mawk/gawk) is unknown. The
# stage count is tiny (~15), so the in-awk selection sort is free.
#
# Usage:
#   scripts/build-timing-report.sh build.log
#   COMPOSE_BAKE=1 BUILDKIT_PROGRESS=plain docker compose build 2>&1 | scripts/build-timing-report.sh
# ─────────────────────────────────────────────────────────────────────────────
set -eu

awk '
# ── Map vertex id -> stage label, and accumulate DONE seconds per stage ──────
{
  id = $1
  if (substr(id, 1, 1) != "#") next
  idnum = substr(id, 2)

  if ($2 == "DONE") {
    d = $3; sub(/s$/, "", d)          # "142.3s" -> "142.3"
    s = stage[idnum]; if (s == "") s = "(pre-stage)"
    total[s] += (d + 0)
    grand    += (d + 0)
    next
  }
  if ($2 == "CACHED") {
    s = stage[idnum]; if (s != "") cached[s]++
    next
  }

  # A vertex HEADER is "#<id> [<stage> <step>/<total>] <command>", so its bracket
  # is the second whitespace field ($2 starts with "["). A RUN step''s captured
  # stdout is "#<id> <elapsed> <text>" instead — $2 is a timestamp — and that text
  # can itself contain brackets (Vite prints "[vite] ..."). Guarding on $2 avoids
  # misattributing such log lines to a bogus stage.
  if (substr($2, 1, 1) == "[") {
    lb = index($0, "["); rb = index($0, "]")   # first "]" closes the stage label
    if (lb > 0 && rb > lb) {
      label = substr($0, lb + 1, rb - lb - 1)
      sub(/ [0-9]+\/[0-9]+$/, "", label)        # drop the " 6/9" step counter
      stage[idnum] = label
    }
  }
}

# ── Bucket a raw stage name into a coarse frontend/backend/deps/image group ───
function bucket(s) {
  if (s ~ /vite-builder/)                         return "frontend: vite/nitro build"
  if (s ~ /go-builder/)                           return "backend: go compile"
  if (s ~ /server-builder/)                       return "backend: node esbuild bundles"
  if (s ~ /prisma-generate/ || s ~ /prod-deps/ || s ~ /(^|[^a-z])deps([^a-z]|$)/) \
                                                  return "deps: pnpm install + prisma"
  # Bare "web"/"supervisor" are the two bake TARGET names — their vertices are
  # the final `exporting to image` steps, i.e. image assembly.
  if (s ~ /runner/ || s == "web" || s == "supervisor") \
                                                  return "image assembly (runner / runner-full)"
  if (s ~ /internal/ || s == "(pre-stage)")       return "buildkit internal (context/dockerfile)"
  return "other"
}

END {
  n = 0
  for (s in total) keys[++n] = s
  if (n == 0) {
    print "  (no uncached build steps found — fully warm cache, or not a --progress=plain log)"
    exit 0
  }

  # Selection sort stages by total seconds, descending.
  for (i = 1; i <= n; i++) {
    mx = i
    for (j = i + 1; j <= n; j++) if (total[keys[j]] > total[keys[mx]]) mx = j
    t = keys[i]; keys[i] = keys[mx]; keys[mx] = t
  }

  printf "  Per-stage uncached wall-clock (cached steps are free and excluded):\n"
  for (i = 1; i <= n; i++) {
    s = keys[i]
    pct = (grand > 0) ? (100 * total[s] / grand) : 0
    printf "    %8.1fs  %5.1f%%  %s\n", total[s], pct, s
  }

  # Roll per-stage totals up into coarse buckets.
  bn = 0
  for (i = 1; i <= n; i++) {
    b = bucket(keys[i])
    if (!(b in btotal)) bkeys[++bn] = b
    btotal[b] += total[keys[i]]
  }
  for (i = 1; i <= bn; i++) {
    mx = i
    for (j = i + 1; j <= bn; j++) if (btotal[bkeys[j]] > btotal[bkeys[mx]]) mx = j
    t = bkeys[i]; bkeys[i] = bkeys[mx]; bkeys[mx] = t
  }

  printf "  ----------------------------------------------------------------\n"
  printf "  Rollup:\n"
  for (i = 1; i <= bn; i++) {
    b = bkeys[i]
    pct = (grand > 0) ? (100 * btotal[b] / grand) : 0
    printf "    %8.1fs  %5.1f%%  %s\n", btotal[b], pct, b
  }
  printf "  ----------------------------------------------------------------\n"
  printf "  Total measured (uncached) build time: %.1fs\n", grand
}
' "$@"
