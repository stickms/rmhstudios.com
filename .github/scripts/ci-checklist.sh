#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# The CI half of the deploy embed's checklist (deploy.yml).
#
# The checks run as PARALLEL jobs (`ci`, `integration`, `build`), so no single
# job knows the others' state — and several jobs editing one Discord message
# would overwrite each other's partial views. Instead the checklist is rendered
# from the GitHub API's view of THIS run's jobs and steps (the source of truth),
# and exactly one process — the `build` job's background watcher — edits the
# message. `deploy-gate` renders it once more for the final red/blue state.
#
# Usage:
#   ci-checklist.sh fields   print {"fields":[…],"state":"running|success|failure"}
#   ci-checklist.sh watch    poll every 10s, edit the embed when the checklist
#                            changes, exit when every check has finished
#                            (or after WATCH_TIMEOUT seconds, default 1800)
#
# Env: GH_TOKEN (actions:read), GITHUB_REPOSITORY, GITHUB_RUN_ID; for `watch`
# also DISCORD_WEBHOOK_URL / DISCORD_MSG_ID / COMMIT_SHORT / COMMIT_MSG /
# COMMIT_AUTHOR / BUILD_START_EPOCH. Best-effort like discord-notify.sh: it
# never fails the job.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Each row: label, job name, step name. A step that never ran because its job
# died earlier takes the job's conclusion, so a failed install cannot leave a
# row spinning forever.
CHECKLIST_JQ='
def row($label; $job; $step):
  ((.jobs | map(select(.name == $job)) | first) // {status: "queued", steps: []}) as $j
  | (($j.steps // []) | map(select(.name == $step)) | first) as $s
  | (if $s and ($s.status == "completed" or $j.status != "completed") then $s
     elif $j.status == "completed" then {status: "completed", conclusion: $j.conclusion}
     else {status: "queued"} end) as $r
  | {label: $label, status: $r.status, conclusion: $r.conclusion,
     secs: (if $r.started_at and $r.completed_at
            then (($r.completed_at | fromdate) - ($r.started_at | fromdate)) else null end)};
def icon:
  if .status != "completed" then (if .status == "in_progress" then "🔄" else "⬜" end)
  elif .conclusion == "success" then "✅"
  elif .conclusion == "skipped" then "⏭️"
  elif .conclusion == "cancelled" then "⏹️"
  else "❌" end;
def dur:
  if .secs == null then ""
  elif .secs >= 60 then " · \(.secs / 60 | floor)m \(.secs % 60 | tostring | if length == 1 then "0" + . else . end)s"
  else " · \(.secs)s" end;
[ row("Typecheck"; "ci"; "Typecheck"),
  row("Lint"; "ci"; "Lint"),
  row("Unit tests"; "ci"; "Test"),
  row("Integration tests"; "integration"; "Integration tests"),
  row("Images built + pushed"; "build"; "Build + push both images (bake, single graph)") ]
| { fields: [{name: "CI", value: (map("\(icon) \(.label)\(dur)") | join("\n"))}],
    state: (if any(.[]; .status == "completed" and .conclusion != "success" and .conclusion != "skipped") then "failure"
            elif all(.[]; .status == "completed") then "success"
            else "running" end) }'

render() {
    gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?per_page=50" 2>/dev/null |
        jq -c "$CHECKLIST_JQ" 2>/dev/null
}

case "${1:-}" in
    fields)
        out=$(render) || out=""
        [ -n "$out" ] || out='{"fields":[],"state":"running"}'
        printf '%s\n' "$out"
        ;;
    watch)
        deadline=$(( $(date +%s) + ${WATCH_TIMEOUT:-1800} ))
        last=""
        while [ "$(date +%s)" -lt "$deadline" ]; do
            out=$(render) || out=""
            if [ -n "$out" ] && [ "$out" != "$last" ]; then
                last="$out"
                state=$(jq -r '.state' <<<"$out")
                elapsed=$(( $(date +%s) - ${BUILD_START_EPOCH:-$(date +%s)} ))
                dur="$(( elapsed / 60 ))m $(( elapsed % 60 ))s"
                case "$state" in
                    success) color=3447003;  title="🔵 [PRODUCTION] Commit ${COMMIT_SHORT:-} — checks passed + images pushed in ${dur}, handing off to the VPS…" ;;
                    failure) color=15158332; title="🔴 [PRODUCTION] Commit ${COMMIT_SHORT:-} — a check failed; nothing will ship" ;;
                    *)       color=16776960; title="🟡 [PRODUCTION] Commit ${COMMIT_SHORT:-} — building + checking…" ;;
                esac
                DISCORD_FIELDS=$(jq -c '.fields' <<<"$out") \
                    bash "$SCRIPT_DIR/discord-notify.sh" edit "$color" "$title" "${COMMIT_MSG:-}" "${COMMIT_AUTHOR:-}" >/dev/null
                [ "$state" != "running" ] && exit 0
            fi
            sleep 10
        done
        echo "ci-checklist: gave up after ${WATCH_TIMEOUT:-1800}s"
        ;;
    *)
        echo "Usage: ci-checklist.sh {fields|watch}" >&2
        ;;
esac
exit 0
