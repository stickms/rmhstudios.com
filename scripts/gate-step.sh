#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run_step — run one tool of the commit gate and say HOW it ended.
#
# Sourced by scripts/check-consistency.sh. A step can end three ways, and the
# gate used to know only two of them:
#
#   0  it ran and passed
#   1  it ran and found something          → a rule failure; fix the change
#   2  it never finished: a signal or the  → NOT a rule failure; the machine
#      out-of-memory killer took it          ran out of something
#
# The third case is why this file exists (audit OP1). An out-of-memory-killed
# `tsc` printed "✗ tsc --noEmit" exactly like a type error, so the reader had
# to guess, and the guess became "the gate does not work here, skip it".
#
# Three shapes of "killed" are recognised, because the tools report it three ways:
#
#   · exit 129..192     the shell's 128+signal (137 SIGKILL, 143 SIGTERM, 134
#                       SIGABRT — which is also how V8 leaves on a full heap).
#                       `pnpm run` passes this through.
#   · exit 1 + a line   `pnpm exec` swallows the signal, exits 1 and prints
#                       "Command was killed with SIGKILL (Forced termination)".
#   · exit 1 + a line   a vitest worker thread or a node process that hit its
#                       heap limit prints an out-of-memory line and exits 1.
#
# The gate's own vitest and eslint steps call `node <bin>` directly rather than
# `pnpm exec`, so for them the first shape is the one that arrives.
# ─────────────────────────────────────────────────────────────────────────────

# Names of the steps that were killed, one per line. The verdict reads it.
GATE_KILLED=""
# Wall-clock seconds of the last step, for the ✓ line.
GATE_STEP_SECONDS=0

# gate_killed_by <exit code> <log file> — prints what killed the step, or nothing.
gate_killed_by() {
  local rc="$1" log="$2" sig
  if [ "$rc" -gt 128 ] && [ "$rc" -le 192 ]; then
    sig=$(kill -l "$((rc - 128))" 2>/dev/null) || sig=""
    if [ -n "$sig" ]; then
      printf 'SIG%s (exit %s)' "${sig#SIG}" "$rc"
    else
      printf 'signal %s (exit %s)' "$((rc - 128))" "$rc"
    fi
    return 0
  fi
  [ "$rc" -ne 0 ] || return 0
  sig=$(grep -aoE 'Command was killed with SIG[A-Z0-9]+' "$log" 2>/dev/null | tail -n 1 | grep -oE 'SIG[A-Z0-9]+$')
  if [ -n "$sig" ]; then
    printf '%s (reported by pnpm; exit %s)' "$sig" "$rc"
    return 0
  fi
  if grep -aqE 'JavaScript heap out of memory|ERR_WORKER_OUT_OF_MEMORY|Worker terminated due to reaching memory limit' "$log" 2>/dev/null; then
    printf 'the JavaScript heap limit (out of memory; exit %s)' "$rc"
  fi
  return 0
}

# run_step <step name> <command…>
# Streams the command's output unchanged and returns 0 / 1 / 2 as above. On 2
# it has already printed the reason and recorded the step in GATE_KILLED.
run_step() {
  local name="$1"; shift
  local log rc cause started=$SECONDS
  log=$(mktemp)
  "$@" 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  GATE_STEP_SECONDS=$((SECONDS - started))
  cause=$(gate_killed_by "$rc" "$log")
  rm -f "$log"
  if [ -n "$cause" ]; then
    GATE_KILLED="${GATE_KILLED}${name}"$'\n'
    printf '\033[1m\033[35m☠ %s — KILLED by %s after %ss\033[0m\n' "$name" "$cause" "$GATE_STEP_SECONDS"
    printf '    → The step did not finish, so this is not a rule failure and there is nothing in the change to fix.\n'
    printf '      SIGKILL is almost always the out-of-memory killer; SIGTERM a timeout or a supervisor.\n'
    printf '      See what else is running (pgrep -fa "vitest|tsc|vite build"), wait for it, and re-run.\n'
    [ -z "${GATE_STEP_HINT:-}" ] || printf '      %s\n' "$GATE_STEP_HINT"
    return 2
  fi
  [ "$rc" -eq 0 ] && return 0
  return 1
}
