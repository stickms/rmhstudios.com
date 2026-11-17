# Translation catalogs

This branch holds every non-English UI catalog for rmhstudios.com:
`locales/<lng>/<ns>.json` and, beside each, `.sources.<ns>.json`, the English
each translation was made from. `main` holds only English (`locales/en`).

- **Written by** the `i18n-translate` workflow (Actions -> Run workflow), which
  commits here directly. No pull request: nothing on this branch is code.
- **Read by** `pnpm i18n:pull` (`scripts/i18n-pull.sh` on main), which copies
  `locales/` into a checkout. `pnpm dev`, the image builds in `deploy.yml` and
  `candidate-image.yml`, and the translate workflow run it.
- **Fixing a translation by hand:** edit the value here and commit. Keep its
  `.sources` entry as is: a translation whose recorded English still matches
  today's English is never sent to the model again, so the fix stays.
- **Never merge this branch into main**, and never add `locales/en` here.

The parked locales (`PENDING_LOCALES` in `lib/i18n/config.ts`) are kept here
too, so bringing one back only pays for keys added since it was parked.

See `docs/translations.md` on main.
