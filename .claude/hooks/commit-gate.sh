#!/usr/bin/env bash
# PreToolUse(Bash) hook — the commit gate for agent sessions.
#
# Wired up in `.claude/settings.json`. It watches for a `git commit` about to
# run and holds it until `scripts/check-consistency.sh` is happy, so an agent
# cannot commit UI that drifts from the design language, an API route that
# skips `defineHandler`, or a string that never reached `t()`.
#
#   exit 0 → the commit proceeds
#   exit 2 → the commit is BLOCKED and stderr comes back to the agent as the
#            reason, which is what makes it fix the change and retry
#
# Deliberately narrow: every other Bash command passes straight through.
#
# It gates the checkout the commit HAPPENS in, with that checkout's own gate
# script. It used to gate `$CLAUDE_PROJECT_DIR` whatever the command said, so a
# commit made in a git worktree (`cd /path/to/worktree && git commit`, or
# `git -C … commit`, which the old substring match did not even see) was either
# not checked at all or checked against the main checkout's unrelated tree
# (audit OP1). `commit-gate-parse.mjs` reads the command and answers, per
# commit: where, whether the command stages for itself, and whether it carries
# the escape hatch.
#
# Escape hatch, written in the command so it leaves a trace in the transcript
# (the agent must also say why in the commit message):
#   RMH_SKIP_COMMIT_GATE=1 git commit …
set -uo pipefail

payload=$(cat)

# Cheap pre-filter: the overwhelming majority of Bash calls never mention a commit.
case "$payload" in
  *commit*) ;;
  *) exit 0 ;;
esac

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
commits=$(printf '%s' "$payload" | node "$HERE/commit-gate-parse.mjs") || {
  # A hook that cannot read its input must not wave commits through unseen.
  printf 'commit-gate: could not parse the hook payload, so the commit was not gated.\n' >&2
  exit 2
}
[ -n "$commits" ] || exit 0

strip_colour() { sed $'s/\033\\[[0-9;]*m//g'; }

# One line per commit: <skip 0|1> TAB <stages 0|1> TAB <directory>
while IFS=$'\t' read -r skip stages dir; do
  [ -n "$dir" ] || continue
  ROOT=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || continue
  GATE="$ROOT/scripts/check-consistency.sh"
  # Not this repository (or a checkout from before the gate existed): not ours to judge.
  [ -f "$GATE" ] || continue

  if [ "$skip" = 1 ]; then
    printf 'Commit gate skipped for %s (RMH_SKIP_COMMIT_GATE=1) — the commit message must say why.\n' "$ROOT" >&2
    continue
  fi

  # A command that stages and commits in one call (`git add -A && git commit`,
  # `git commit -a`) has not staged anything yet when this hook runs, so the
  # staged tree is not what the commit will contain. Gate the working tree
  # instead — tracked changes plus untracked files, a superset of the commit.
  if [ "$stages" = 1 ]; then scope=--working; else scope=--staged; fi

  # </dev/null: this loop reads the commit list on stdin, and the gate's tools must not.
  output=$(cd "$ROOT" && bash "$GATE" "$scope" --fast 2>&1 </dev/null; printf '\n__STATUS__%s' "$?")
  status=${output##*__STATUS__}
  # Colour codes are noise in a hook message — strip them, keep the exit status.
  output=$(printf '%s' "${output%__STATUS__*}" | strip_colour)

  if [ "$status" -ne 0 ]; then
    {
      if [ "$status" -eq 3 ]; then
        printf 'The commit gate could not finish in %s — a step was KILLED (see the ☠ line). This is the\n' "$ROOT"
        printf 'machine, not the change: nothing below says the staged change is wrong.\n\n'
      else
        printf 'The commit gate blocked this commit in %s — the change is not consistent with the site yet.\n\n' "$ROOT"
      fi
      printf '%s\n\n' "$output"
      if [ "$scope" = --working ]; then
        printf 'This command stages and commits in one call, so the gate checked the WHOLE working tree\n'
        printf '(untracked files included). To gate exactly what the commit contains, stage first and\n'
        printf 'commit in a separate command.\n\n'
      fi
      if [ "$status" -eq 3 ]; then
        printf 'Wait for whatever else is using the memory and commit again. If the step cannot run on this\n'
        printf 'machine at all, RMH_SKIP_COMMIT_GATE=1 git commit … is the escape hatch — name the step and the\n'
        printf 'signal in the commit message.\n'
      else
        printf 'Fix the ✗ items, then commit again. The rules and their rationale are in\n'
        printf 'design.md and docs/plans/2026-11-11-steel-design-implementation.md (the five rules\n'
        printf 'R1 to R5, the tokens in section 2, the gates in section 17); the old material is\n'
        printf 'historical (docs/plasmatic-jelly-design-language.md, docs/plasmatic-jelly-system.md). If a rule\n'
        printf 'is genuinely wrong for this change,\n'
        printf 'change the rule in the same commit and say so in the message — do not reach\n'
        printf 'for --no-verify or RMH_SKIP_COMMIT_GATE.\n'
      fi
    } >&2
    exit 2
  fi

  # Passed on the exact staged tree: stamp it so .githooks/pre-commit doesn't
  # re-run it. `--git-path`, because in a worktree `.git` is a file, not a directory.
  if [ "$scope" = --staged ]; then
    (cd "$ROOT" && git diff --cached | sha1sum | cut -d' ' -f1 > "$(git rev-parse --git-path rmh-commit-gate-ok)") 2>/dev/null || true
  fi

  # Review items (●) are advisory but worth surfacing: they are the parts of the
  # checklist no script can answer.
  if printf '%s' "$output" | grep -q '●'; then
    printf 'Commit gate passed with review items — confirm these hold before you commit:\n%s\n' \
      "$(printf '%s' "$output" | grep '●')" >&2
  fi
done <<COMMITS
$commits
COMMITS
exit 0
