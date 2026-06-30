#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-shot LOCAL full-site i18n translation via DeepSeek.
#
# Translates every non-English locale from the English source of truth (this
# includes the left-nav / sidebar strings, which live in the "feed" namespace),
# then regenerates the per-locale resource bundles. It leaves the result
# UNSTAGED in your working tree for you to review, commit, and push yourself —
# it does NOT create a branch, commit, push, or open a PR. Run it from your
# machine (DeepSeek is reachable there; it is blocked from the Claude Code
# sandbox).
#
#   export DEEPSEEK_API_KEY=sk-...        # or put it in .env
#   bash scripts/translate-i18n-local.sh
#   # or: pnpm run i18n:translate:local
#
# Knobs (env):
#   RMHARK_AI_MODEL   model id (default: deepseek-chat — fast and usually fine for
#                     UI strings; set deepseek-reasoner for max quality but ~3-5x slower)
#   I18N_BATCH        keys per request (default: 40)
#   I18N_CONCURRENCY  batch requests in flight at once (default: 8); raise to go
#                     faster, lower if you hit DeepSeek rate limits
#   I18N_LOCALES      comma-separated subset, e.g. "es,fr,th" (default: all non-en)
#
# Idempotent: only missing/changed keys are translated (already-finished strings
# are skipped, not re-sent), so re-running just fills gaps left by transient API
# errors. Start with I18N_LOCALES to sanity-check output before a full run.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

# Load .env if present so DEEPSEEK_API_KEY can live there.
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${DEEPSEEK_API_KEY:?Set DEEPSEEK_API_KEY (export it or add it to .env)}"
export RMHARK_AI_MODEL="${RMHARK_AI_MODEL:-deepseek-chat}"
export I18N_BATCH="${I18N_BATCH:-40}"
export I18N_CONCURRENCY="${I18N_CONCURRENCY:-16}"

echo ">> Translating non-English locales with ${RMHARK_AI_MODEL} (batch ${I18N_BATCH}, concurrency ${I18N_CONCURRENCY})…"
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
  echo ">> No catalog changes produced — working tree already up to date."; exit 0
fi

echo ">> Done. Catalog changes are left UNSTAGED in your working tree on branch '$(git rev-parse --abbrev-ref HEAD)':"
git status --short -- locales lib/i18n | sed 's/^/   /'
echo ">> Review them, then commit and push to this branch yourself (this script no longer auto-commits or pushes)."
