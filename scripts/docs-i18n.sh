#!/usr/bin/env bash
#
# Documentation translation pipeline (Sphinx gettext).
#
#   scripts/docs-i18n.sh extract       # .pot files from the English sources
#   scripts/docs-i18n.sh update        # create/refresh the translated pages' .po files
#   scripts/docs-i18n.sh build <lang>  # build one translated site locally
#   scripts/docs-i18n.sh stats         # translated/untranslated counts per locale
#
# LOCALES mirrors LOCALES in lib/i18n/config.ts; `en` is the source language and
# has no catalog of its own.
#
# TRANSLATED is the subset of pages we maintain translations for. It is a subset
# on purpose: `docs/` also holds ~190 dated internal design docs, plans and
# audits, and machine-translating those would add ~40k msgstr entries that churn
# every time a plan is edited and that nobody reads in translation. Anything not
# listed here still builds in every language — untranslated strings fall back to
# English per-string, so a partially translated site is coherent, not broken.
# To start translating a new page, add its docname here and re-run `update`.
#
# Requires the docs toolchain: pip install -r docs/requirements.txt sphinx-intl
set -euo pipefail

cd "$(dirname "$0")/.."

LOCALES=(zh ar hi es fr pt ru de ja ko it id vi tr ur)

TRANSLATED=(
  index
  developer-api/index
  developer-api/authentication
  developer-api/scopes
  developer-api/rate-limits
  developer-api/errors
  developer-api/pagination
  developer-api/idempotency
  developer-api/webhooks
  developer-api/changelog
  site-reference/index
)

POT_DIR="docs/_build/gettext"
POT_SUBSET="docs/_build/gettext-subset"

case "${1:-}" in
  extract)
    python -m sphinx -b gettext docs "$POT_DIR" -q
    echo "Extracted $(find "$POT_DIR" -name '*.pot' | wc -l) catalogs to $POT_DIR"
    ;;

  update)
    [ -d "$POT_DIR" ] || { echo "Run 'extract' first." >&2; exit 1; }
    # Stage only the pages we maintain translations for, so `sphinx-intl update`
    # doesn't create a .po for all ~200 documents in every one of 15 locales.
    rm -rf "$POT_SUBSET"
    for doc in "${TRANSLATED[@]}"; do
      mkdir -p "$POT_SUBSET/$(dirname "$doc")"
      cp "$POT_DIR/$doc.pot" "$POT_SUBSET/$doc.pot"
    done
    # sphinx-intl merges new and changed strings into existing .po files,
    # marking changed ones fuzzy rather than silently dropping a translation.
    args=()
    for l in "${LOCALES[@]}"; do args+=(-l "$l"); done
    python -m sphinx_intl update -p "$POT_SUBSET" -d docs/locale "${args[@]}"
    echo "Updated ${#TRANSLATED[@]} pages × ${#LOCALES[@]} locales under docs/locale/"
    ;;

  build)
    lang="${2:?usage: docs-i18n.sh build <lang>}"
    python -m sphinx -b html -D language="$lang" docs "docs/_build/html-$lang"
    echo "Built docs/_build/html-$lang"
    ;;

  stats)
    python -m sphinx_intl stat -d docs/locale
    ;;

  *)
    sed -n '3,19p' "$0"
    exit 1
    ;;
esac
