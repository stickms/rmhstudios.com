#!/usr/bin/env bash
# Record one version from components/site-history/archive-versions.json into <outdir>/<id>.warc.gz.
#
#   scripts/site-archive/archive-version.sh <id> <outdir> [port]
#
# Builds and serves the version's commit (serve-version.sh), browses it with record.mjs, then stops the server
# and removes the worktree. Run from a checkout with full history and the current dependencies installed (for
# Playwright). Prints the recorder's JSON summary on success.
set -uo pipefail
ID=$1
OUT=$2
PORT=${3:-7140}
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
# Outside the repo: a worktree nested in it would be taken by pnpm for part of the current workspace.
WORK=${ARCHIVE_WORKDIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/site-archive}/$ID
mkdir -p "$OUT" "$(dirname "$WORK")"

VERSIONS=$REPO/components/site-history/archive-versions.json
field() { node -e "const v=require('$VERSIONS').versions.find(x=>x.id==='$ID'); if(!v){process.exit(3)} const f=v['$1']; process.stdout.write(f===undefined?'':String(f))"; }
COMMIT=$(field commit) || { echo "unknown version $ID" >&2; exit 2; }
ENTRY=$(field path)
AUTH=$(field auth)
LINKS=$(field links)
CLICKS=$(field clicks)
PATHS=$(field paths)

cleanup() {
  [ -f "$WORK/server.pid" ] && kill -- "-$(cat "$WORK/server.pid")" 2>/dev/null
  git -C "$REPO" worktree remove --force "$WORK" 2>/dev/null || rm -rf "$WORK"
}
trap cleanup EXIT

"$HERE/serve-version.sh" "$COMMIT" "$PORT" "$WORK" "$HERE/seeds/$ID.sql" || exit 1

# Dismiss first-run modals (language chooser, cookie notice, welcome, what's new) the way a returning visitor
# would have: every localStorage key of that kind the commit's code reads is set before any page script runs.
INIT=$WORK/archive-init.js
{
  printf 'try{'
  grep -rhoE "['\"\`]rmh-[a-z0-9-]*(seen|picked|dismiss|consent|onboard|welcome|whatsnew|tour|intro)[a-z0-9-]*['\"\`]" \
    "$WORK"/components "$WORK"/lib "$WORK"/app "$WORK"/hooks "$WORK"/stores 2>/dev/null | tr -d "'\"\`" | sort -u |
    while read -r k; do
      case $k in *consent*) v=essential ;; *dismissed*) v='[]' ;; *) v=1 ;; esac
      printf "localStorage.setItem('%s','%s');" "$k" "$v"
    done
  if [ -f "$WORK/lib/whats-new.ts" ]; then
    grep -oE "^\s+id: '[a-z0-9-]+'" "$WORK/lib/whats-new.ts" | grep -oE "'[^']+'" | tr -d "'" |
      while read -r r; do printf "localStorage.setItem('rmh-whatsnew-seen-%s-v1','1');" "$r"; done
  fi
  printf "localStorage.setItem('rmh-freemonth-snooze',String(Date.now()+9e10));}catch(e){}"
} >"$INIT"

SECRET=$(grep -E '^BETTER_AUTH_SECRET=' "$WORK/.env" | cut -d= -f2-)
ARGS=(--port "$PORT" --entry "$ENTRY" --out "$OUT/$ID.warc.gz" --links "${LINKS:-6}" --init "$INIT")
[ "$AUTH" = "true" ] && ARGS+=(--session site-archive-demo-session-token --secret "$SECRET")
[ -n "$CLICKS" ] && ARGS+=(--clicks "$CLICKS")
[ -n "$PATHS" ] && ARGS+=(--paths "$PATHS")
node "$HERE/record.mjs" "${ARGS[@]}"
