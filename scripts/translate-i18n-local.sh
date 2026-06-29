#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-shot LOCAL full-site i18n translation via DeepSeek.
#
# Translates every non-English locale from the English source of truth, then
# regenerates the per-locale resource bundles, commits the result to a new
# branch, pushes it, and opens a PR. Run it from your machine (DeepSeek is
# reachable there; it is blocked from the Claude Code sandbox).
#
#   export DEEPSEEK_API_KEY=sk-...        # or put it in .env
#   bash scripts/translate-i18n-local.sh
#   # or: pnpm run i18n:translate:local
#
# Knobs (env):
#   RMHARK_AI_MODEL   model id (default: deepseek-reasoner; deepseek-chat is much
#                     faster and usually fine)
#   I18N_BATCH        keys per request (default: 40)
#   I18N_LOCALES      comma-separated subset, e.g. "es,fr,th" (default: all non-en)
#
# Idempotent: only missing/changed keys are translated, so re-running fills any
# gaps left by transient API errors. Reasoner is thorough but slow — a full run
# across all 31 locales is long; start with I18N_LOCALES to sanity-check output.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

# Load .env if present so DEEPSEEK_API_KEY can live there.
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${DEEPSEEK_API_KEY:?Set DEEPSEEK_API_KEY (export it or add it to .env)}"
export RMHARK_AI_MODEL="${RMHARK_AI_MODEL:-deepseek-reasoner}"
export I18N_BATCH="${I18N_BATCH:-40}"

echo ">> Translating non-English locales with ${RMHARK_AI_MODEL} (batch ${I18N_BATCH})…"
# Two passes: the second fills any keys a transient API error skipped on the
# first (the script is idempotent, so an already-translated key is a cheap skip).
pnpm exec tsx scripts/translate-locales.ts
pnpm exec tsx scripts/translate-locales.ts

echo ">> Regenerating per-locale resource bundles…"
pnpm exec tsx scripts/gen-i18n-resources.ts

echo ">> Catalog completeness (locale/namespace files missing keys vs English):"
node -e '
const fs=require("fs");
const NS=fs.readdirSync("locales/en").filter(f=>f.endsWith(".json")&&!f.startsWith(".")).map(f=>f.slice(0,-5));
const enK={}; for(const n of NS) enK[n]=Object.keys(JSON.parse(fs.readFileSync(`locales/en/${n}.json`,"utf8")));
let incomplete=0, ok=0;
for(const l of fs.readdirSync("locales").filter(d=>d!=="en"&&!d.includes("."))){
  for(const n of NS){const p=`locales/${l}/${n}.json`; if(!fs.existsSync(p))continue;
    const t=Object.keys(JSON.parse(fs.readFileSync(p,"utf8")));
    if(enK[n].some(k=>!t.includes(k))){incomplete++; if(incomplete<=20)console.log("  incomplete:",`${l}/${n}`);} else ok++; }}
console.log(`  complete: ${ok} | incomplete: ${incomplete}`);
if(incomplete>0) console.log("  → re-run this script to fill the gaps before merging.");
'

if [ -z "$(git status --porcelain -- locales lib/i18n)" ]; then
  echo ">> No catalog changes produced — nothing to commit."; exit 0
fi

BRANCH="i18n/deepseek-translation-$(date +%Y%m%d-%H%M%S)"
echo ">> Committing to ${BRANCH} and pushing…"
git checkout -b "$BRANCH"
git add locales lib/i18n
git commit -m "chore(i18n): full DeepSeek (${RMHARK_AI_MODEL}) translation of all locales"
git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --base main --head "$BRANCH" --fill && echo ">> PR opened." \
    || echo ">> Pushed ${BRANCH}; open a PR from the URL above."
else
  echo ">> Pushed ${BRANCH}. Install the gh CLI or open a PR from the URL above."
fi
