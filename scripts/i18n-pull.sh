#!/usr/bin/env bash
# Copy the non-English catalogs from the `i18n/catalogs` branch into locales/.
#
# main holds only English (locales/en). Every other locale's catalogs, with
# their .sources.<ns>.json records, live on `i18n/catalogs`, which the
# i18n-translate workflow commits to directly (docs/translations.md). Anything
# that builds or serves the site in other languages runs this first:
#   - `pnpm dev` (offline is fine: it keeps whatever is already on disk);
#   - the workflows that build images (deploy.yml, candidate-image.yml) and
#     i18n-translate.yml, where it is strict: with CI set, a failed fetch fails
#     the job instead of shipping a build that is English everywhere.
#
# The copy replaces every non-English directory under locales/, so it also
# removes a locale the branch no longer has. locales/.catalogs-commit records
# which catalogs commit is on disk (the image build prints it).
#
# Env:
#   I18N_CATALOGS_BRANCH   branch to read (default i18n/catalogs)
#   I18N_PULL_STRICT       1 to fail on any error (default: 1 when CI is set)
set -euo pipefail

cd "$(dirname "$0")/.."

branch="${I18N_CATALOGS_BRANCH:-i18n/catalogs}"
ref="refs/remotes/origin/$branch"
strict="${I18N_PULL_STRICT:-${CI:+1}}"

fail() {
  if [ "${strict:-}" = "1" ]; then
    echo "[i18n:pull] ERROR: $1" >&2
    exit 1
  fi
  echo "[i18n:pull] warning: $1 — keeping the catalogs already in locales/ (missing ones fall back to English)." >&2
  exit 0
}

git rev-parse --git-dir > /dev/null 2>&1 || fail "not a git checkout"

if ! git fetch --quiet --no-tags --depth=1 origin "+refs/heads/$branch:$ref" 2> /dev/null; then
  fail "could not fetch $branch from origin"
fi

sha=$(git rev-parse --verify --quiet "$ref^{commit}") || fail "$branch has no commit"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git archive "$sha" locales | tar -x -C "$tmp"
[ -d "$tmp/locales" ] || fail "$branch has no locales/ directory"
if [ -d "$tmp/locales/en" ]; then
  fail "$branch carries locales/en; English lives on main only"
fi

mkdir -p locales
for dir in locales/*/; do
  name=$(basename "$dir")
  [ "$name" = "en" ] || rm -rf "locales/$name"
done
cp -R "$tmp"/locales/. locales/
echo "$sha" > locales/.catalogs-commit

count=$(find "$tmp/locales" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
echo "[i18n:pull] $count locale(s) from $branch @ ${sha:0:12}"
