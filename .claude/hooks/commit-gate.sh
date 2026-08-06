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
# Escape hatch (the agent must say why in the commit message):
#   RMH_SKIP_COMMIT_GATE=1 git commit …
set -uo pipefail

payload=$(cat)

# Only `git commit` is gated. `git commit-graph`, `git commit-tree` and reading
# the string in some other command are not commits.
case "$payload" in
  *"git commit-graph"*|*"git commit-tree"*) exit 0 ;;
  *"git commit"*) ;;
  *) exit 0 ;;
esac

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
GATE="$ROOT/scripts/check-consistency.sh"
[ -f "$GATE" ] || exit 0

# Colour codes are noise in a hook message — strip them, keep the exit status.
output=$(cd "$ROOT" && bash "$GATE" --staged --fast 2>&1; printf '\n__STATUS__%s' "$?")
status=${output##*__STATUS__}
output=$(printf '%s' "${output%__STATUS__*}" | sed $'s/\033\\[[0-9;]*m//g')

if [ "$status" -ne 0 ]; then
  {
    printf 'The commit gate blocked this commit — the staged change is not consistent with the site yet.\n\n'
    printf '%s\n\n' "$output"
    printf 'Fix the ✗ items, then commit again. The rules and their rationale are in\n'
    printf 'docs/design-language.md (§0 definition of done, §13 what is enforced) and\n'
    printf 'docs/page-consistency.md §3. If a rule is genuinely wrong for this change,\n'
    printf 'change the rule in the same commit and say so in the message — do not reach\n'
    printf 'for --no-verify or RMH_SKIP_COMMIT_GATE.\n'
  } >&2
  exit 2
fi

# Passed: stamp the staged tree so .githooks/pre-commit doesn't re-run it.
if [ -d "$ROOT/.git" ]; then
  (cd "$ROOT" && git diff --cached | sha1sum | cut -d' ' -f1 > .git/rmh-commit-gate-ok) 2>/dev/null || true
fi

# Review items (●) are advisory but worth surfacing: they are the parts of the
# checklist no script can answer.
if printf '%s' "$output" | grep -q '●'; then
  printf 'Commit gate passed with review items — confirm these hold before you commit:\n%s\n' \
    "$(printf '%s' "$output" | grep '●')" >&2
fi
exit 0
