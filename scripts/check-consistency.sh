#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# The commit gate — "does this change still look and behave like the rest of
# the site?"
#
#   pnpm check:consistency              # gate the staged change (what a commit will contain)
#   pnpm check:consistency --fast       # same, minus tsc + docs freshness (what the git/agent hook runs)
#   pnpm check:consistency --working    # gate everything in the working tree vs HEAD, untracked files included
#   pnpm check:consistency --base main  # gate the whole branch vs a base ref
#   pnpm check:consistency --full       # + the complete vitest suite (pre-PR)
#
# It runs three kinds of check, in increasing cost:
#
#   1. A dependency-free scan of the ADDED LINES in the diff. Fast, precise
#      (file:line), and scoped to new code so pre-existing debt never blocks a
#      commit. These mirror rules CI already fails on — no new policy is
#      invented here.
#   2. The executable design/consistency gates (`lib/__tests__/*`), which are
#      the AUTHORITY for rules 1-9 of docs/design-language.md §13. The fast
#      scan is a preview of these, not a replacement.
#   3. The repo-wide quality bar: eslint on changed files, `tsc -b` (pnpm typecheck), and
#      the generated-docs freshness checks that `web-ci.yml` runs.
#
# Anything it cannot verify mechanically is printed as a REVIEW item — the
# human/agent checklist lives in docs/design-language.md §0 (definition of
# done) and docs/page-consistency.md §3.
#
# Exit codes: 0 = gate passed (REVIEW items may still be printed), 1 = blocked by
# a rule, 3 = INCOMPLETE — a step was killed (signal / out of memory) before it
# could answer, which is a fact about the machine and not about the change. The
# ☠ line names the step and the signal (scripts/gate-step.sh).
# Escape hatch: RMH_SKIP_COMMIT_GATE=1 (say why in the commit message).
#
# What it costs (audit OP1; 4 cores / 15 GB, measured 2026-11-12, docs/testing.md
# §"The commit gate's budget"): `--fast` is 7–11 s and about 1 GB peak for a
# docs-only, CSS-only, 3-file or 40-file change. The one step that does not fit
# a 15 GB container is a COLD typecheck of the site project (about 10 GB with
# GOMEMLIMIT; a no-change run is under a second, and a change inside the core or
# engine project is 1 to 2 s since audit AR1 steps 1-2), and `--fast` — what both
# hooks run — never starts it.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 1

# run_step: runs a tool and tells a rule failure (1) from a killed step (2).
# shellcheck source=scripts/gate-step.sh
. scripts/gate-step.sh

SCOPE="staged"
BASE_REF=""
FAST=0
FULL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --staged) SCOPE="staged" ;;
    --working) SCOPE="working" ;;
    --base) SCOPE="base"; BASE_REF="${2:-}"; shift ;;
    --fast) FAST=1 ;;
    --full) FULL=1 ;;
    -h|--help) sed -n '2,39p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'check-consistency: unknown flag %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

if [ "${RMH_SKIP_COMMIT_GATE:-0}" = "1" ]; then
  printf '\033[33m[gate]\033[0m skipped (RMH_SKIP_COMMIT_GATE=1)\n'
  exit 0
fi

bold=$(printf '\033[1m'); red=$(printf '\033[31m'); yel=$(printf '\033[33m')
grn=$(printf '\033[32m'); dim=$(printf '\033[2m'); off=$(printf '\033[0m')

FAILED=0
REVIEWED=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# pass_timed <label> — pass(), with the wall time of the run_step that just ended.
pass_timed() { printf '%s✓%s %s %s(%ss)%s\n' "$grn" "$off" "$1" "$dim" "$GATE_STEP_SECONDS" "$off"; }
fail()   { FAILED=1; printf '%s✗ %s%s\n' "$red" "$1" "$off"; }
warn()   { REVIEWED=1; printf '%s● %s%s\n' "$yel" "$1" "$off"; }
pass()   { printf '%s✓%s %s\n' "$grn" "$off" "$1"; }
skip()   { printf '%s∘ %s (skipped: %s)%s\n' "$dim" "$1" "$2" "$off"; }
step()   { printf '\n%s%s%s\n' "$bold" "$1" "$off"; }

# ── Diff scope ───────────────────────────────────────────────────────────────
case "$SCOPE" in
  staged)  DIFF=(diff --cached) ;;
  working) DIFF=(diff HEAD) ;;
  base)
    [ -n "$BASE_REF" ] || { echo "--base needs a ref" >&2; exit 2; }
    MERGE_BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null || echo "$BASE_REF")
    DIFF=(diff "$MERGE_BASE")
    ;;
esac

# `--working` means the working tree, and a file nobody has `git add`ed yet is in
# it. `git diff HEAD` only knows tracked paths, so a brand-new route or component
# was invisible to every check below — which is exactly the shape of an agent's
# `git add -A && git commit` (the hook fires before the add; see
# .claude/hooks/commit-gate.sh). A scratch copy of the index with the untracked,
# non-ignored files marked intent-to-add makes them show up as additions without
# touching the real index or writing a single object.
SCRATCH_INDEX=""
if [ "$SCOPE" = "working" ]; then
  REAL_INDEX=$(git rev-parse --git-path index)
  if [ -f "$REAL_INDEX" ] && cp "$REAL_INDEX" "$TMP/index" &&
      GIT_INDEX_FILE="$TMP/index" git add --intent-to-add -- . 2>/dev/null; then
    SCRATCH_INDEX="$TMP/index"
  fi
fi

# gdiff <git-diff flags…> — the scope's diff, through the scratch index if there is one.
gdiff() {
  if [ -n "$SCRATCH_INDEX" ]; then
    GIT_INDEX_FILE="$SCRATCH_INDEX" git "${DIFF[@]}" "$@"
  else
    git "${DIFF[@]}" "$@"
  fi
}

FILES="$TMP/files"
gdiff --name-only --diff-filter=ACMR > "$FILES" 2>/dev/null || true

if [ ! -s "$FILES" ] && [ "$SCOPE" = "staged" ]; then
  printf '%s[gate]%s nothing staged — falling back to the working tree.\n' "$dim" "$off"
  DIFF=(diff HEAD)
  gdiff --name-only --diff-filter=ACMR > "$FILES" 2>/dev/null || true
fi

if [ ! -s "$FILES" ]; then
  printf '%s[gate]%s no changes to check.\n' "$dim" "$off"
  exit 0
fi

has() { grep -qE "$1" "$FILES"; }
list() { grep -E "$1" "$FILES" || true; }

printf '%sCommit gate%s %s(%s scope · %s files)%s\n' \
  "$bold" "$off" "$dim" "$SCOPE" "$(wc -l < "$FILES" | tr -d ' ')" "$off"

# ── Added lines: "path:line:content" for every + line in the diff ────────────
ADDED="$TMP/added"
gdiff -U0 --diff-filter=ACMR 2>/dev/null | awk '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^\+\+\+ /    { file = "";            next }
  /^@@/ {
    if (match($0, /\+[0-9]+/)) { line = substr($0, RSTART + 1, RLENGTH - 1) + 0 }
    next
  }
  /^\+/ { if (file != "") { print file ":" line ":" substr($0, 2); line++ } }
' > "$ADDED" || true

# scan <path-ere> <content-ere> — prints "file:line: content" for added lines
# matching both, skipping comment-only lines (a class-shaped word in prose is a
# comment, not a call site — the same lesson the vitest gates record).
scan() {
  # -v interprets backslash escapes, corrupting regexes such as literal \(.
  # ENVIRON preserves the patterns verbatim in both GNU awk and mawk.
  RMH_SCAN_PATH="$1" RMH_SCAN_PATTERN="$2" awk '
    BEGIN {
      pathre = ENVIRON["RMH_SCAN_PATH"]
      pat = ENVIRON["RMH_SCAN_PATTERN"]
    }
    {
      p1 = index($0, ":"); if (p1 == 0) next
      file = substr($0, 1, p1 - 1)
      rest = substr($0, p1 + 1)
      p2 = index(rest, ":"); if (p2 == 0) next
      lineno = substr(rest, 1, p2 - 1)
      content = substr(rest, p2 + 1)
      if (file !~ pathre) next
      if (content ~ /^[[:space:]]*(\/\/|\*|\/\*)/) next
      if (content ~ pat) printf "  %s:%s %s\n", file, lineno, content
    }
  ' "$ADDED"
}

# blocking <label> <path-ere> <content-ere> <pointer>
blocking() {
  local hits; hits=$(scan "$2" "$3")
  if [ -n "$hits" ]; then
    fail "$1"
    printf '%s\n' "$hits"
    printf '%s    → %s%s\n' "$dim" "$4" "$off"
  fi
}

# review <label> <path-ere> <content-ere> <pointer>
review() {
  local hits; hits=$(scan "$2" "$3")
  if [ -n "$hits" ]; then
    warn "$1"
    printf '%s\n' "$hits"
    printf '%s    → %s%s\n' "$dim" "$4" "$off"
  fi
}

# ── The site-tier path filter, read from the CI gate itself ──────────────────
# The site-tier rules exempt the full-screen games and the `--app-*` apps by
# design. That exemption list is POLICY and lives in eslint-local-rules/design-scope.js
# (the same file eslint.config.mjs scopes its class-string rules from); it is
# parsed out here rather than copied so the two can never drift apart.
GATE_TEST="eslint-local-rules/design-scope.js"
# POSIX ERE has no lookahead, so the tier is a two-stage filter: candidate
# paths, minus the exempt ones. If the gate test ever moves or changes shape,
# the candidate set narrows to the unambiguously-site directories rather than
# guessing — a narrower scan misses things the vitest gate still catches; a
# wider one would block commits on files that are exempt by design.
SITE_CANDIDATES='^(components/|features/[^/]+/ui/|app/routes/)'
DIRS=$(awk '/const FULLSCREEN_TIER_DIRS/,/\]\);/' "$GATE_TEST" 2>/dev/null |
  grep -oE "^ *'[a-z0-9-]+'" | tr -d " '" | paste -sd'|' -)
SEGS=$(awk '/const FULLSCREEN_ROUTE_SEGMENTS/,/\]\);/' "$GATE_TEST" 2>/dev/null |
  grep -oE "^ *'[a-z0-9-]+'" | tr -d " '" | paste -sd'|' -)
if [ -n "$DIRS" ] && [ -n "$SEGS" ]; then
  # Unanchored on purpose: it is matched against the scan's indented output.
  SITE_EXEMPT="((components|features)/($DIRS)/|app/routes/($SEGS)[/.]|app/routes/login\.tsx)"
else
  SITE_CANDIDATES='^(components/(ui|feed|site|errors|admin|moderation|developer|security)/|app/routes/_site/)'
  SITE_EXEMPT='__never__'
fi

# scan_site <content-ere> — site-tier files only (candidates minus exempt).
scan_site() {
  scan "$SITE_CANDIDATES" "$1" | grep -vE "^  ($SITE_EXEMPT)" || true
}
blocking_site() {
  local hits; hits=$(scan_site "$2")
  if [ -n "$hits" ]; then
    fail "$1"
    printf '%s\n' "$hits"
    printf '%s    → %s%s\n' "$dim" "$3" "$off"
  fi
}
review_site() {
  local hits; hits=$(scan_site "$2")
  if [ -n "$hits" ]; then
    warn "$1"
    printf '%s\n' "$hits"
    printf '%s    → %s%s\n' "$dim" "$3" "$off"
  fi
}

# ── 1. Never-commit-this ─────────────────────────────────────────────────────
step "1. Generated + never-commit files"
BEFORE=$FAILED
NOTED=$REVIEWED

# Generated files are CHECKED IN, so their presence in a commit is normal — a
# route change regenerates routeTree.gen.ts. What is never OK is hand-editing
# one, which no diff can prove, so this is a question rather than a verdict.
if list '^(app/routeTree\.gen\.ts|lib/i18n/resources\.[a-z-]+\.ts)$' | grep -q .; then
  warn "A generated file is in this change — confirm it was regenerated, not hand-edited."
  list '^(app/routeTree\.gen\.ts|lib/i18n/resources\.[a-z-]+\.ts)$' | sed 's/^/  /'
  printf '%s    → routeTree.gen.ts comes from `pnpm dev`/`pnpm build`; resources.<locale>.ts from `pnpm i18n:resources`.%s\n' "$dim" "$off"
fi

if list '(^|/)\.env($|\.)|(^|/)(id_rsa|\.pem)$' | grep -qv '\.env\.example'; then
  fail "Looks like an environment/secret file is staged. Never commit secrets."
  list '(^|/)\.env($|\.)|(^|/)(id_rsa|\.pem)$' | grep -v '\.env\.example' | sed 's/^/  /'
fi
[ "$FAILED" = "$BEFORE" ] && [ "$REVIEWED" = "$NOTED" ] &&
  pass "no generated or secret files in the change"

# ── 2. Design language (added lines) ─────────────────────────────────────────
step "2. Design language — added lines (design.md; docs/plans/2026-11-11-steel-design-implementation.md)"
BEFORE=$FAILED

# Raw palette colours (§13 rule 5), hardcoded radii (rule 6), `transition-all` (rule 8) and dead
# tailwindcss-animate classes (rule 9) are eslint rules now — local/no-raw-palette-color,
# local/no-hardcoded-radius, local/no-transition-all, local/no-dead-animate-classes — so the
# eslint step below gates them, scoped by eslint-local-rules/design-scope.js.

# The one exemption mirrors TABLIST_ALLOW in design-consistency.test.ts: the TF2 HUD Editor is
# deliberately outside the site design and ships its own flat TfTabs.
TABLISTS=$(scan '\.tsx$' 'role=("|.)tablist' | grep -v 'components/tf2-hud/TfTabs.tsx' || true)
if [ -n "$TABLISTS" ]; then
  fail "Hand-rolled tab strip (§13 rule 1)"
  printf '%s\n' "$TABLISTS"
  printf '%s    → Tab strips are <Tabs> (components/ui/tabs.tsx). The allowlist is closed.%s\n' "$dim" "$off"
fi

CAPSULES=$(scan '^(components|app/routes)/.*\.tsx$' 'layoutId[ ]*=[ ]*[{"]' |
  grep -v 'components/ui/tabs.tsx' || true)
if [ -n "$CAPSULES" ]; then
  fail "Hand-rolled tab capsule (§13 rule 3)"
  printf '%s\n' "$CAPSULES"
  printf '%s    → The flowing capsule belongs to Tabs; do not re-roll a layoutId capsule.%s\n' "$dim" "$off"
fi

review_site "Duration literal instead of a motion token" \
  'class.*(^|[^A-Za-z0-9_-])duration-(75|100|150|200|300|500|700|1000)([^A-Za-z0-9_-]|$)' \
  'Prefer duration-site / duration-site-fast / duration-site-slow (they follow --site-transition-speed). Anything the user drags is a spring (APPLE_SPRING), not a duration.'

review_site "text-white / text-black on a themed surface" \
  'class.*(^|[^A-Za-z0-9:_-])text-(white|black)([^A-Za-z0-9_-]|$)' \
  'Ink tracks its surface: bg-site-accent → text-site-accent-fg. Hardcoded ink survives today accent and breaks the next one.'

review_site "Hex colour literal" \
  '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]([^0-9a-fA-F]|$)' \
  'Site UI reads colour from --site-* tokens; a fixed-palette domain gets its own scoped variable group.'

# Steel R5: nothing moves at rest, and the only pointer listener a decoration may have is the chrome renderer's one
# passive `pointermove` (docs/plans/2026-11-11-steel-design-implementation.md V10). Games and gesture hooks retain their
# own input semantics.
review_site "Pointer-position effect (Steel R5, V10)" \
  "(pointermove|mousemove)" \
  'Decoration does not follow the pointer except the chrome renderer (lib/chrome, one passive listener). No per-card listeners, animated gradient centres or inherited root writes. Gesture/gameplay input remains local.'

# Steel R1/R2/B2: the site tier is flat. Added lines only; steel-flat.test.ts is the authority for CSS.
review_site "Gradient, blur, glow or mask in a class (Steel R1, B2)" \
  'class.*(^|[^A-Za-z0-9:_-])(backdrop-blur|blur-|bg-gradient-|bg-linear-|bg-radial-|bg-conic-|mix-blend-|drop-shadow|shadow-(sm|md|lg|xl|2xl|inner))' \
  'Steel has no gradient, blur, glow, blend or shadow on content: surfaces are solid colours from the section-2 tokens, an overlay is the one raised surface (docs/plans/2026-11-11-steel-design-implementation.md S5). Chrome lives in steel-chrome.css and globe-nav.css only (phases 2 and 3).'

# Preview of the vitest gate (site-infinite-animation N3, design-consistency N11), scoped to added lines.
# site-infinite-animation N3 pins the frozen list of loops that may remain and stays the authority.
n3_hits=$(scan '^(app/([^/]*|globals/[^/]*)|components/(ui|feed|site|shell)/.*)\.css$' \
  '(animation[^:;]*:[^;]*infinite|animation-iteration-count:[[:space:]]*infinite)' || true)
if [ -n "$n3_hits" ]; then
  fail "Perpetual CSS animation (N3)"
  printf '%s\n' "$n3_hits"
  printf '%s    → %s%s\n' "$dim" 'A free-standing infinite keyframe never stops (hidden tab, offscreen, degraded tiers); Steel R5 says nothing moves at rest — lib/__tests__/site-infinite-animation.test.ts.' "$off"
fi

review_site "Framer gesture transform on a site surface (N11)" \
  'while(Hover|Tap)[[:space:]]*=[[:space:]]*\{[^}]*(scale|[^a-z]x|[^a-z]y)[[:space:]]*:' \
  'Steel M6: no hover lifts, springs or press squash (docs/plans/2026-11-11-steel-design-implementation.md section 11).'

review "Per-frame write to a root custom property" \
  '^(components|app|hooks|lib)/.*\.tsx?$' \
  'documentElement\.style\.setProperty' \
  'Root custom properties are inherited by the whole document — one write per frame is a whole-document restyle per frame. Write to the element that reads it.'

review_site "Hand-rolled primitive" \
  '(window\.(confirm|alert|prompt)\(|navigator\.clipboard\.writeText|from .react-icons)' \
  'Use useConfirm() / <CopyButton> / lucide-react — see docs/page-consistency.md §5.'

[ "$FAILED" = "$BEFORE" ] && pass "no new design-language violations in added lines"

# ── 3. i18n / SEO / API conventions (added lines) ────────────────────────────
step "3. Strings, routes and handlers"
BEFORE=$FAILED

review "t() without a defaultValue" \
  '^(components|app)/.*\.tsx?$' \
  "[^A-Za-z0-9_]t\((\"|')[^\"']+(\"|')[ ]*\)" \
  'Always t("key", { defaultValue: "…" }) — and remember changing shipped wording means a NEW key, not an edited default.'

if scan '^(components|app)/.*\.tsx?$' '[^A-Za-z0-9_]t\(' | grep -q .; then
  if ! has '^locales/en/.*\.json$'; then
    warn "New t() calls, but no locales/en/*.json change in this commit."
    printf '%s    → Run `pnpm i18n:extract` and check locales/en/<ns>.json. A new namespace must also be added to NAMESPACES in lib/i18n/config.ts or it is never loaded.%s\n' "$dim" "$off"
  fi
  if scan '^(components|app)/.*\.tsx$' '\{/\*' | grep -q .; then
    warn "JSX comment near new strings — a {/* … */} immediately before a t() call makes i18next-parser skip it."
    printf '%s    → Put the explanation above the component, then verify the key landed in locales/en/.%s\n' "$dim" "$off"
  fi
fi

# The adoption backlog lives in lib/__tests__/api-handler-adoption.test.ts and
# is one-directional (entries may only be removed). Read it rather than copy it,
# so touching a route that is still on the backlog doesn't block an unrelated
# commit — the vitest gate still holds the line on NEW routes.
HANDLER_BACKLOG="$TMP/handler-backlog"
grep -oE "'app/routes/api/[^']+'" lib/__tests__/api-handler-adoption.test.ts 2>/dev/null |
  tr -d "'" | sort -u > "$HANDLER_BACKLOG" || true

if list '^app/routes/api/.*\.ts$' | grep -q .; then
  for f in $(list '^app/routes/api/.*\.ts$'); do
    [ -f "$f" ] || continue
    case "$f" in app/routes/api/v1/*) continue ;; esac
    # The dispatcher for registered endpoints: it hands the request to a module that is
    # checked below, and wraps nothing itself.
    [ "$f" = 'app/routes/api/$.ts' ] && continue
    grep -qxF "$f" "$HANDLER_BACKLOG" && continue
    if grep -q 'handlers' "$f" && ! grep -qE 'defineHandler|implement\.server' "$f"; then
      fail "API route without defineHandler: $f"
      printf '%s    → Wrap every handler in defineHandler from @/lib/api/handler.server (session → rate limit → zod → try/catch). /api/v1/** uses withDeveloperApi.%s\n' "$dim" "$off"
    fi
  done
fi

# A registered endpoint (`export const route = apiRoute(…)`, served by app/routes/api/$.ts)
# binds every handler through the wrapper: implement() for a typed contract, defineHandler()
# where there is no contract yet. A handler written without it stays a route file. The vitest
# gate lib/api/__tests__/route-table.test.ts checks every one; this names a changed one early.
if list '^(lib|features)/.*\.server\.ts$' | grep -q .; then
  for f in $(list '^(lib|features)/.*\.server\.ts$'); do
    [ -f "$f" ] || continue
    grep -q '^export const route = apiRoute(' "$f" || continue
    if ! grep -qE 'defineHandler|implement\.server' "$f"; then
      fail "registered API endpoint without defineHandler or implement(): $f"
      printf '%s    → A registered endpoint wraps every handler: implement() from @/lib/api/implement.server for a contract, defineHandler from @/lib/api/handler.server otherwise. A handler written without the wrapper is a route file under app/routes/api.%s\n' "$dim" "$off"
    fi
  done
fi

if list '^app/routes/(_site/)?[^/]*\.tsx$' | grep -q .; then
  for f in $(list '^app/routes/.*\.tsx$'); do
    [ -f "$f" ] || continue
    case "$f" in *__root.tsx|*route.tsx) continue ;; esac
    # An island route (redesign B1) is a document handler; its head is rendered by renderIslandDocument.
    if grep -q 'createFileRoute' "$f" && ! grep -qE 'head:|renderIslandDocument\(' "$f"; then
      warn "Route without head(): $f"
      printf '%s    → At minimum head() returns meta: [{ title: "X | RMH Studios" }]; public pages use buildMeta()/buildCanonical() and let it own the og:* block.%s\n' "$dim" "$off"
    fi
  done
fi

if has '^prisma/schema/.*\.prisma$' && ! has '^prisma/migrations/'; then
  warn "prisma/schema/ changed with no migration in this commit."
  printf '%s    → `pnpm db:push` is dev-only; production runs `prisma migrate deploy`.%s\n' "$dim" "$off"
fi

if has '\.go$' && ! has '(^|/)BUILD\.bazel$'; then
  warn "Go sources changed with no BUILD.bazel update — run `make gazelle`."
fi

[ "$FAILED" = "$BEFORE" ] && pass "no route/handler/string convention failures"

# ── 4. The executable gates ──────────────────────────────────────────────────
step "4. Executable gates (the authority — docs/design-language.md §13)"

# Every tool below goes through run_step (scripts/gate-step.sh), so "the step was
# killed" and "the step found something" are never the same line.
#
# The vitest and eslint steps start `node <bin>` rather than `pnpm exec <bin>`:
# pnpm exec turns a child's SIGKILL into a plain exit 1, and it costs about half
# a second per start for nothing.
#
# The fast path is NOT scoped down to "the gates that match the staged paths".
# That was measured before it was decided (audit OP1): all 28 gate files run in
# 7–9 s and under 1 GB whatever is staged, so a path→gate map would buy a few
# seconds and cost a hand-maintained list that has to be right for every gate
# that reads the tree by glob — the kind of list vitest.config.ts already records
# failing silently. Every gate runs on every commit; only the worker count is
# capped, so the step's memory does not grow with the machine's core count.
VITEST=(node node_modules/vitest/vitest.mjs)
ESLINT=(node node_modules/eslint/bin/eslint.js)
FAST_GATE_WORKERS=3

if ! command -v pnpm >/dev/null 2>&1; then
  warn "vitest / eslint / tsc did NOT run — pnpm is not on PATH. The scans above are a preview, not the gate."
elif [ ! -d node_modules ]; then
  warn "vitest / eslint / tsc did NOT run — node_modules is missing. Run pnpm install; the scans above are a preview, not the gate."
else
  GATE_TESTS=(
    lib/__tests__/design-consistency.test.ts
    lib/__tests__/stacking-consistency.test.ts
    lib/__tests__/motion-pop-spring.test.ts
    lib/__tests__/game-viewport-consistency.test.ts
    lib/__tests__/filter-cost-budget.test.ts
    lib/__tests__/static-backdrop.test.ts
    lib/__tests__/route-css-imports.test.ts
    lib/__tests__/theme-tokens.test.ts
    lib/__tests__/appearance-contrast.test.ts
    lib/__tests__/color-vision-a11y.test.ts
    lib/__tests__/responsive-layout-contract.test.ts
    lib/__tests__/raf-loop-allowlist.test.ts
    lib/__tests__/performance-guardrails.test.ts
    lib/__tests__/api-handler-adoption.test.ts
    lib/api/__tests__/route-match.test.ts
    lib/api/__tests__/route-table.test.ts
    lib/__tests__/discord-sdk-security.test.ts
    lib/__tests__/i18n-catalogs.test.ts
    lib/__tests__/i18n-config.test.ts
    lib/__tests__/i18n-default-drift.test.ts
    lib/__tests__/game-registry-consistency.test.ts
    lib/__tests__/server-bundle-copies.test.ts
    lib/__tests__/test-discovery.test.ts
    lib/__tests__/fouc-contract.test.ts
    lib/__tests__/handheld-tier.test.ts
    lib/__tests__/steel-flat.test.ts
    lib/__tests__/steel-tokens.test.ts
    lib/__tests__/site-infinite-animation.test.ts
    lib/__tests__/doc-pointers.test.ts
    lib/__tests__/appearance-jelly-motion.test.ts
  )
  if [ "$FULL" = 1 ]; then
    run_step "full vitest suite" pnpm test
    case $? in
      0) pass_timed "full vitest suite" ;;
      1) fail "vitest suite" ;;
    esac
  else
    GATE_RUN=("${VITEST[@]}" run)
    [ "$FAST" = 1 ] && GATE_RUN+=("--maxWorkers=$FAST_GATE_WORKERS")
    run_step "consistency gates (vitest, ${#GATE_TESTS[@]} files)" "${GATE_RUN[@]}" "${GATE_TESTS[@]}"
    case $? in
      0) pass_timed "consistency gates" ;;
      1)
        fail "consistency gates — see the failures above"
        printf '%s    → Each failing rule prints the offending file:line plus its pointer into docs/design-language.md.%s\n' "$dim" "$off"
        ;;
    esac
  fi

  LINTABLE="$TMP/lintable"
  list '\.(ts|tsx|js|jsx|mjs)$' | grep -vE '^(app/routeTree\.gen\.ts|lib/i18n/resources\.)' > "$LINTABLE" || true
  if [ -s "$LINTABLE" ]; then
    mkdir -p .cache/eslint
    # Bound each invocation so a large merge also works within Windows' command
    # line limit. NUL-delimited paths retain spaces; every batch must pass.
    # xargs answers 123 when a batch fails and 125 when one is killed by a signal,
    # which would hide the signal from run_step — so each batch reports its own
    # status on a marker line and the wrapper returns the worst one.
    eslint_batches() {
      tr '\n' '\0' < "$LINTABLE" | xargs -0 -n 40 bash -c '
        "$@"; rc=$?
        [ "$rc" -eq 0 ] || printf "__eslint_batch_exit__ %s\n" "$rc" >&3
        exit 0
      ' _ "${ESLINT[@]}" --cache --cache-location .cache/eslint/eslintcache \
        --cache-strategy content 3> "$TMP/eslint-exits"
      [ -s "$TMP/eslint-exits" ] || return 0
      local worst
      worst=$(sort -k2 -n -r "$TMP/eslint-exits" | head -n 1 | cut -d' ' -f2)
      return "$worst"
    }
    run_step "eslint ($(wc -l < "$LINTABLE" | tr -d ' ') changed files)" eslint_batches
    case $? in
      0) pass_timed "eslint (changed files)" ;;
      1) fail "eslint — the bar is no NEW errors or warnings versus the base branch" ;;
    esac
  else
    skip "eslint" "no lintable files changed"
  fi

  if [ "$FAST" = 1 ]; then
    skip "tsc -b" "--fast"
    skip "docs freshness" "--fast"
  else
    if has '(\.(ts|tsx)|^tsconfig[^/]*\.json)$'; then
      mkdir -p .cache/tsc
      # `pnpm run typecheck`, never bare `tsc`. Two packages in this workspace
      # ship a `tsc` bin — `typescript` (6.x, the module typescript-eslint
      # imports) and `typescript-native` (7.x, the Go compiler) — so
      # node_modules/.bin/tsc is whichever pnpm linked last. The script pins the
      # native one by path. It is `tsc -b` over the three projects the root
      # tsconfig.json lists (core, engine, site; audit AR1), each with its own
      # .tsbuildinfo under .cache/tsc, so a project whose inputs did not change is
      # not loaded at all.
      GATE_STEP_HINT='A cold typecheck of the site project peaks near 10 GB (docs/testing.md, "The commit gate'"'"'s budget"); nothing else heavy can run beside it.'
      run_step "tsc -b" pnpm run typecheck
      case $? in
        0) pass_timed "tsc -b" ;;
        1) fail "tsc -b" ;;
      esac
      GATE_STEP_HINT=""
    else
      skip "tsc -b" "no TypeScript changed"
    fi

    # `/api/[^/]+\.server\.ts`: a registered API endpoint (lib/api/route-sources.ts), which
    # docs/site-reference/api.md and the facts count like a route file.
    if has '^(lib/api/(registry|openapi)\.ts|lib/games\.ts|lib/apps\.ts|app/routes/|(lib|features)/.*/api/[^/]+\.server\.ts$|lib/api/routes/|lib/api/route-)'; then
      docs_checks() { pnpm run docs:api:check && pnpm run docs:site:check && pnpm run sdk:check; }
      run_step "docs freshness" docs_checks
      case $? in
        0) pass_timed "generated docs are current" ;;
        1) fail "generated docs are stale — run pnpm docs:api && pnpm docs:site && pnpm sdk:generate" ;;
      esac
    else
      skip "docs freshness" "registry/catalog/routes untouched"
    fi

    # lib/prepaint/generated.ts is the ONE inline pre-paint script (and its CSP
    # hash), bundled from lib/prepaint/*.ts and the small modules those steps
    # import. A stale copy ships the old logic to every document.
    if has '^(lib/prepaint/|lib/access/prefs\.ts|lib/appearance\.ts|lib/cookie-consent\.ts|lib/delight/season\.ts|lib/i18n/config\.ts|lib/native-material-routes\.ts|scripts/build-prepaint\.ts)'; then
      run_step "prepaint:check" pnpm run prepaint:check
      case $? in
        0) pass_timed "pre-paint script is current" ;;
        1) fail "lib/prepaint/generated.ts is stale — run pnpm prepaint:build and stage it" ;;
      esac
    else
      skip "pre-paint freshness" "lib/prepaint untouched"
    fi

    # docs/_generated/facts.json holds the counts (models, routes, tests, css, ...)
    # that CLAUDE.md and the living docs point at. Only the paths that feed those
    # counts (or the file itself) can make it stale.
    if has '^(prisma/|app/routes/|(lib|features)/.*/api/[^/]+\.server\.ts$|lib/api/routes/|components/.*\.tsx$|.*\.css$|.*\.test\.tsx?$|\.github/workflows/|lib/i18n/config\.ts|scripts/gen-repo-facts\.ts|docs/_generated/)'; then
      run_step "facts:check" pnpm run facts:check
      case $? in
        0) pass_timed "docs/_generated/facts.json is current" ;;
        1) fail "facts.json is stale — run pnpm facts:generate and stage it" ;;
      esac
    else
      skip "facts freshness" "no counted paths touched"
    fi

    # A new game's art dropped into public/images/** without regenerating
    # lib/images/variants.gen.ts does not break anything — it silently serves
    # the full-size master, which is exactly the 2 MB /games page the
    # 2026-08-09 loading audit was about. Failing loudly here is the only way
    # that stays fixed.
    if has '^(public/images/|lib/images/variants\.gen\.ts$)'; then
      run_step "images:variants:check" pnpm run images:variants:check
      case $? in
        0) pass_timed "image variant manifest is current" ;;
        1) fail "image variants are stale — run pnpm images:variants" ;;
      esac
    else
      skip "image variants" "public/images untouched"
    fi

    # app/fonts/*.css is generated from the Fontsource packages with
    # `font-display: optional` rewritten in. A Fontsource bump that renames or
    # re-subsets a file would leave those rules pointing at nothing — every
    # display face silently falling back — so a change to either side regenerates.
    if has '^(package\.json|pnpm-lock\.yaml|app/fonts/|scripts/gen-self-hosted-fonts\.ts$)'; then
      run_step "fonts:check" pnpm run fonts:check
      case $? in
        0) pass_timed "self-hosted font stylesheets are current" ;;
        1) fail "app/fonts is stale — run pnpm fonts:generate" ;;
      esac
    else
      skip "self-hosted fonts" "fonts and their packages untouched"
    fi
  fi
fi

# ── 5. What no script can check ──────────────────────────────────────────────
step "5. Look at it (nothing below is automatable)"
if has '\.(tsx|css)$'; then
  cat <<'EOF'
  ● Both editions × two widths: Day (default, .style-default) and Night (.style-graphite),
    at 390px and at 1280px; once in `ar` for the mirrored layout.
    (docs/plans/2026-11-11-steel-design-implementation.md §12 A6)
  ● Flat? Solid token colours only: no gradient, blur, glow, shadow (an overlay's
    one shadow aside), no translucent surface, no card. Rules and space, not boxes
    (R1, R3). One ink primary per view (R4).
  ● Does anything move at rest? Nothing may. Hover and press fills 90 ms, the rest
    per section 11, and none after the response ends (R5).
  ● A role-less switcher that marks its active slot some other way (an accent
    pill, a segmented control, a flex-1 button row with an active tint) is
    still a tab strip and still belongs on <Tabs>. The gate cannot see
    those; you can.
  ● Reused a primitive rather than a second copy of one? (§0.3)
  ● Keyboard path + focus ring (2px ink, K10) visible on the surface it lands on, in
    both editions. (§0.8)
EOF
  REVIEWED=1
else
  pass "no UI in this change"
fi

# ── Verdict ──────────────────────────────────────────────────────────────────
printf '\n'
if [ -n "$GATE_KILLED" ]; then
  # Said first and exited differently: a killed step proves nothing about the
  # change, in either direction, and "fix the ✗ items" would be the wrong advice.
  printf '%s%sGate incomplete.%s These steps were killed before they could answer:\n' "$bold" "$red" "$off"
  printf '%s' "$GATE_KILLED" | sed 's/^/  ☠ /'
  if [ "$FAILED" = 1 ]; then
    printf 'The ✗ items above are real rule failures and still need fixing.\n'
  fi
  printf 'A killed step is the machine, not the change: free the memory and re-run. If it cannot run here at all,\n'
  printf 'skip with RMH_SKIP_COMMIT_GATE=1 and name the step and the signal in the commit message.\n'
  exit 3
fi
if [ "$FAILED" = 1 ]; then
  printf '%s%sGate failed.%s Fix the ✗ items above, then re-run. Do not commit past this with --no-verify;\n' "$bold" "$red" "$off"
  printf 'if a rule is genuinely wrong for this change, change the rule (and say so in the commit message).\n'
  exit 1
fi
if [ "$REVIEWED" = 1 ]; then
  printf '%s%sGate passed with review items.%s Answer the ● lines before you commit.\n' "$bold" "$yel" "$off"
else
  printf '%s%sGate passed.%s\n' "$bold" "$grn" "$off"
fi
exit 0
