#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# The commit gate — "does this change still look and behave like the rest of
# the site?"
#
#   pnpm check:consistency              # gate the staged change (what a commit will contain)
#   pnpm check:consistency --fast       # same, minus tsc + docs freshness (what the git/agent hook runs)
#   pnpm check:consistency --working    # gate everything in the working tree vs HEAD
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
#   3. The repo-wide quality bar: eslint on changed files, `tsc --noEmit`, and
#      the generated-docs freshness checks that `web-ci.yml` runs.
#
# Anything it cannot verify mechanically is printed as a REVIEW item — the
# human/agent checklist lives in docs/design-language.md §0 (definition of
# done) and docs/page-consistency.md §3.
#
# Exit codes: 0 = gate passed (REVIEW items may still be printed), 1 = blocked.
# Escape hatch: RMH_SKIP_COMMIT_GATE=1 (say why in the commit message).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 1

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
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

FILES="$TMP/files"
git "${DIFF[@]}" --name-only --diff-filter=ACMR > "$FILES" 2>/dev/null || true

if [ ! -s "$FILES" ] && [ "$SCOPE" = "staged" ]; then
  printf '%s[gate]%s nothing staged — falling back to the working tree.\n' "$dim" "$off"
  DIFF=(diff HEAD)
  git "${DIFF[@]}" --name-only --diff-filter=ACMR > "$FILES" 2>/dev/null || true
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
git "${DIFF[@]}" -U0 --diff-filter=ACMR 2>/dev/null | awk '
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
  awk -v pathre="$1" -v pat="$2" '
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
# design-consistency.test.ts rules 5-7 exempt the full-screen games and the
# `--app-*` apps by design. That exemption list is POLICY and lives in the test;
# it is parsed out here rather than copied so the two can never drift apart.
GATE_TEST="lib/__tests__/design-consistency.test.ts"
# POSIX ERE has no lookahead, so the tier is a two-stage filter: candidate
# paths, minus the exempt ones. If the gate test ever moves or changes shape,
# the candidate set narrows to the unambiguously-site directories rather than
# guessing — a narrower scan misses things the vitest gate still catches; a
# wider one would block commits on files that are exempt by design.
SITE_CANDIDATES='^(components/|app/routes/)'
DIRS=$(awk '/const FULLSCREEN_TIER_DIRS/,/\]\);/' "$GATE_TEST" 2>/dev/null |
  grep -oE "^ *'[a-z0-9-]+'" | tr -d " '" | paste -sd'|' -)
SEGS=$(awk '/const FULLSCREEN_ROUTE_SEGMENTS/,/\]\);/' "$GATE_TEST" 2>/dev/null |
  grep -oE "^ *'[a-z0-9-]+'" | tr -d " '" | paste -sd'|' -)
if [ -n "$DIRS" ] && [ -n "$SEGS" ]; then
  # Unanchored on purpose: it is matched against the scan's indented output.
  SITE_EXEMPT="(components/($DIRS)/|app/routes/($SEGS)[/.]|app/routes/login\.tsx)"
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
step "2. Design language — added lines (docs/design-language.md §13)"
BEFORE=$FAILED

blocking_site "Raw Tailwind palette colour in site UI (§13 rule 5)" \
  'class.*(^|[^A-Za-z0-9:_-])(bg|text|border|ring|from|via|to|fill|stroke|divide|outline|shadow|decoration|placeholder|caret|accent)-(zinc|gray|slate|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9][0-9]+([^A-Za-z0-9_-]|$)' \
  'Every colour comes from the --site-* contract. A domain-fixed palette gets a scoped variable group (--casino-*).'

blocking_site "Hardcoded radius in site UI (§13 rule 6)" \
  'class.*(^|[^A-Za-z0-9:_-])rounded-(sm|md|lg|xl|2xl|3xl)([^A-Za-z0-9_-]|$)' \
  'Use rounded-site / rounded-site-sm. (rounded-full and rounded-none are shapes, not radii — those stay fine.)'

blocking "transition-all (§13 rule 8)" \
  '\.tsx$' \
  'class.*(^|[^A-Za-z0-9_-])transition-all([^A-Za-z0-9_-]|$)' \
  'Name what moves: transition-colors / transition-transform / transition-[a,b]. Animate a transform, not a layout property.'

blocking "Dead tailwindcss-animate class (§13 rule 9)" \
  '\.tsx$' \
  'class.*(^|[^A-Za-z0-9:._/-])(animate-(in|out)|fade-(in|out)|zoom-(in|out)|slide-(in-from|out-to)-(top|bottom|left|right)|fill-mode-(both|forwards|backwards|none))([^A-Za-z0-9._/-]|$)' \
  'That plugin is not installed — these compile to zero rules. Use the lib/motion.ts variants (scaleIn / popIn / modalContent).'

blocking "Hand-rolled tab strip (§13 rule 1)" \
  '\.tsx$' \
  'role=("|.)tablist' \
  'Tab strips are <LiquidTabs> (components/ui/liquid-tabs.tsx). The allowlist is closed.'

CAPSULES=$(scan '^(components|app/routes)/.*\.tsx$' 'layoutId[ ]*=[ ]*[{"]' |
  grep -v 'components/ui/liquid-tabs.tsx' || true)
if [ -n "$CAPSULES" ]; then
  fail "Hand-rolled tab capsule (§13 rule 3)"
  printf '%s\n' "$CAPSULES"
  printf '%s    → The flowing capsule belongs to LiquidTabs; do not re-roll a layoutId capsule.%s\n' "$dim" "$off"
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

# Site tier only: a game legitimately reads the pointer as GAMEPLAY input
# (mouse-look, aiming). What was retired is pointer-position styling on the site.
review_site "Pointer-position effect (retired 2026-08-01, §5.1.1)" \
  "(pointermove|mousemove)" \
  'Nothing on a site page reacts to pointer position. Hover is a state, never a coordinate. (Gesture drags via hooks/useFluidDrag are the sanctioned exception.)'

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
    grep -qxF "$f" "$HANDLER_BACKLOG" && continue
    if grep -q 'handlers' "$f" && ! grep -q 'defineHandler' "$f"; then
      fail "API route without defineHandler: $f"
      printf '%s    → Wrap every handler in defineHandler from @/lib/api/handler.server (session → rate limit → zod → try/catch). /api/v1/** uses withDeveloperApi.%s\n' "$dim" "$off"
    fi
  done
fi

if list '^app/routes/(_site/)?[^/]*\.tsx$' | grep -q .; then
  for f in $(list '^app/routes/.*\.tsx$'); do
    [ -f "$f" ] || continue
    case "$f" in *__root.tsx|*route.tsx) continue ;; esac
    if grep -q 'createFileRoute' "$f" && ! grep -q 'head:' "$f"; then
      warn "Route without head(): $f"
      printf '%s    → At minimum head() returns meta: [{ title: "X | RMH Studios" }]; public pages use buildMeta()/buildCanonical() and let it own the og:* block.%s\n' "$dim" "$off"
    fi
  done
fi

if has '^prisma/schema\.prisma$' && ! has '^prisma/migrations/'; then
  warn "schema.prisma changed with no migration in this commit."
  printf '%s    → `pnpm db:push` is dev-only; production runs `prisma migrate deploy`.%s\n' "$dim" "$off"
fi

if has '\.go$' && ! has '(^|/)BUILD\.bazel$'; then
  warn "Go sources changed with no BUILD.bazel update — run `make gazelle`."
fi

[ "$FAILED" = "$BEFORE" ] && pass "no route/handler/string convention failures"

# ── 4. The executable gates ──────────────────────────────────────────────────
step "4. Executable gates (the authority — docs/design-language.md §13)"

if ! command -v pnpm >/dev/null 2>&1; then
  skip "vitest / eslint / tsc" "pnpm not on PATH"
elif [ ! -d node_modules ]; then
  skip "vitest / eslint / tsc" "node_modules missing — run pnpm install"
else
  GATE_TESTS=(
    lib/__tests__/design-consistency.test.ts
    lib/__tests__/stacking-consistency.test.ts
    lib/__tests__/motion-pop-spring.test.ts
    lib/__tests__/game-viewport-consistency.test.ts
    lib/__tests__/filter-cost-budget.test.ts
    lib/__tests__/theme-tokens.test.ts
    lib/__tests__/appearance-contrast.test.ts
    lib/__tests__/color-vision-a11y.test.ts
    lib/__tests__/responsive-layout-contract.test.ts
    lib/__tests__/portal-token-scope.test.ts
    lib/__tests__/raf-loop-allowlist.test.ts
    lib/__tests__/performance-guardrails.test.ts
    lib/__tests__/api-handler-adoption.test.ts
    lib/__tests__/i18n-catalogs.test.ts
    lib/__tests__/i18n-config.test.ts
    lib/__tests__/game-registry-consistency.test.ts
    lib/__tests__/server-bundle-copies.test.ts
    lib/__tests__/test-discovery.test.ts
  )
  if [ "$FULL" = 1 ]; then
    if pnpm test; then pass "full vitest suite"; else fail "vitest suite"; fi
  else
    if pnpm exec vitest run "${GATE_TESTS[@]}"; then
      pass "consistency gates"
    else
      fail "consistency gates — see the failures above"
      printf '%s    → Each failing rule prints the offending file:line plus its pointer into docs/design-language.md.%s\n' "$dim" "$off"
    fi
  fi

  LINTABLE="$TMP/lintable"
  list '\.(ts|tsx|js|jsx|mjs)$' | grep -vE '^(app/routeTree\.gen\.ts|lib/i18n/resources\.)' > "$LINTABLE" || true
  if [ -s "$LINTABLE" ]; then
    mkdir -p .cache/eslint
    # shellcheck disable=SC2046
    if pnpm exec eslint --cache --cache-location .cache/eslint/eslintcache \
        --cache-strategy content $(tr '\n' ' ' < "$LINTABLE"); then
      pass "eslint (changed files)"
    else
      fail "eslint — the bar is no NEW errors or warnings versus the base branch"
    fi
  else
    skip "eslint" "no lintable files changed"
  fi

  if [ "$FAST" = 1 ]; then
    skip "tsc --noEmit" "--fast"
    skip "docs freshness" "--fast"
  else
    if has '\.(ts|tsx)$'; then
      mkdir -p .cache/tsc
      # `pnpm run typecheck`, never bare `tsc`. Two packages in this workspace
      # ship a `tsc` bin — `typescript` (5.9, the module typescript-eslint
      # imports) and `typescript-native` (7.x, the Go compiler) — so
      # node_modules/.bin/tsc is whichever pnpm linked last. The script pins the
      # native one by path, and its .tsbuildinfo is a separate file because the
      # two compilers' formats are not interchangeable.
      if pnpm run typecheck; then
        pass "tsc --noEmit"
      else
        fail "tsc --noEmit"
      fi
    else
      skip "tsc --noEmit" "no TypeScript changed"
    fi

    if has '^(lib/api/registry\.ts|lib/games\.ts|lib/apps\.ts|app/routes/)'; then
      if pnpm run docs:api:check && pnpm run docs:site:check; then
        pass "generated docs are current"
      else
        fail "generated docs are stale — run pnpm docs:api && pnpm docs:site"
      fi
    else
      skip "docs freshness" "registry/catalog/routes untouched"
    fi

    # A new game's art dropped into public/images/** without regenerating
    # lib/images/variants.gen.ts does not break anything — it silently serves
    # the full-size master, which is exactly the 2 MB /games page the
    # 2026-08-09 loading audit was about. Failing loudly here is the only way
    # that stays fixed.
    if has '^(public/images/|lib/images/variants\.gen\.ts$)'; then
      if pnpm run images:variants:check; then
        pass "image variant manifest is current"
      else
        fail "image variants are stale — run pnpm images:variants"
      fi
    else
      skip "image variants" "public/images untouched"
    fi
  fi
fi

# ── 5. What no script can check ──────────────────────────────────────────────
step "5. Look at it (nothing below is automatable)"
if has '\.(tsx|css)$'; then
  cat <<'EOF'
  ● Three shipped themes × two widths: default (Daylight), .style-graphite
    (Midnight), .style-high-contrast — at a phone width and a desktop width,
    once with reduced motion on.  (design-language.md §0.9)
  ● A role-less switcher that marks its active slot some other way (an accent
    pill, a segmented control, a flex-1 button row with an active tint) is
    still a tab strip and still belongs on <LiquidTabs>. The gate cannot see
    those; you can.
  ● Reused a primitive rather than a second copy of one? (§0.3)
  ● Keyboard path + focus ring visible on the surface it lands on, in
    high contrast too. (§0.8)
EOF
  REVIEWED=1
else
  pass "no UI in this change"
fi

# ── Verdict ──────────────────────────────────────────────────────────────────
printf '\n'
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
