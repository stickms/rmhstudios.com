# Font choice and per-device appearance sync — design

Date: 2026-11-23 · Owner request, same day · Status: draft for owner approval

## Intent

The owner finds the site's type (Geist) unpleasant and rough-looking, and wants the site to read like a reading site
(Substack, Medium, Wikipedia). After comparing real-feed renders of fifteen faces, they chose **DM Sans** as the new
default and asked that every face compared be offered as a choice, so readers can set their own main, reading and mono
fonts. They also want appearance to be able to stay per device: a person who turns sync off on one device keeps that
device's look while everything else they own still syncs.

Success: the site paints in DM Sans by default; a reader picks fonts in Settings and the very first frame of every later
page is already in those fonts (no swap, no flash); a visitor never downloads a face they did not choose; a device with
appearance sync off is never changed by another device and never changes them.

## Goals

1. DM Sans (sans) and DM Mono (mono) are the site default, replacing Geist and Geist Mono.
2. Three font settings under Settings → Appearance: **Main font**, **Reading font**, **Mono font**.
3. A per-device **Sync appearance** switch (default on).
4. Only the faces in use are fetched, and the site-tier stylesheet does not grow with the catalogue.
5. Text is drawn with grayscale smoothing (`-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale`).

## Non-goals

- Font size, line height or letter-spacing per font (the existing text-size setting stays the only size control).
- Fonts for games and full-screen apps that set their own faces (Dream Rift, Covid, Elections …): untouched.
- Uploading custom fonts, or any face not in the catalogue below.
- Changing what "appearance" syncs when sync is on, beyond adding the three font fields.

## Anti-goals (a failure even if it works)

- Any visible font swap on load for a reader whose choice is known (account or cookie).
- Every visitor downloading `@font-face` rules or files for fifteen faces.
- A device with sync off being repainted by another device's change, or pushing its own.
- Sync off silently stopping non-appearance settings (notifications, layout, privacy …) from syncing.

## The catalogue

All self-hosted from Fontsource (all verified present on npm, 2026-11-23), Latin and the other subsets kept through
`unicode-range` as `scripts/gen-self-hosted-fonts.ts` already does.

| id | Face | Package | Kind |
|---|---|---|---|
| `dm-sans` | DM Sans | `@fontsource-variable/dm-sans` | sans (default main + reading) |
| `inter` | Inter | `@fontsource-variable/inter` | sans |
| `geist` | Geist | `@fontsource-variable/geist` (installed) | sans |
| `ibm-plex-sans` | IBM Plex Sans | `@fontsource-variable/ibm-plex-sans` | sans |
| `public-sans` | Public Sans | `@fontsource-variable/public-sans` | sans |
| `charter` | Charter (Charis SIL) | `@fontsource/charis-sil` (400, 700, italics) | serif |
| `source-serif-4` | Source Serif 4 | `@fontsource-variable/source-serif-4` | serif |
| `literata` | Literata | `@fontsource-variable/literata` | serif |
| `newsreader` | Newsreader | `@fontsource-variable/newsreader` | serif |
| `lora` | Lora | `@fontsource-variable/lora` | serif |
| `merriweather` | Merriweather | `@fontsource-variable/merriweather` | serif |
| `spectral` | Spectral | `@fontsource/spectral` (installed; 400, 500, 600) | serif |
| `dm-mono` | DM Mono | `@fontsource/dm-mono` (400, 500) | mono (default) |
| `jetbrains-mono` | JetBrains Mono | `@fontsource-variable/jetbrains-mono` | mono |
| `geist-mono` | Geist Mono | `@fontsource-variable/geist-mono` (installed) | mono |
| `ibm-plex-mono` | IBM Plex Mono | `@fontsource/ibm-plex-mono` (400, 500) | mono |

Main and Reading offer the twelve sans and serif faces; Mono offers the four mono faces. Weights used by the site are
400/500/600 (Steel Y1); a static face without 600 (Charis SIL: 400/700) uses its 700 for 600 — the builder maps that in
the generated rules, not in components.

## Where each setting applies

- **Main font** → `--site-font-body` (and `--site-font-display`, which already equals it). Everything inherits it: chrome,
  headings, buttons, names, labels.
- **Reading font** → a new `--site-font-reading`, defaulting to `var(--site-font-body)`, applied by `.t-post` and
  `.t-prose` (`app/styles/steel-type.css`). Default "Same as main font" is an explicit option so the two follow each other
  until a reader splits them.
- **Mono font** → `--site-font-mono` (already used by `.t-meta`).
- **Readable font** (the existing dyslexia setting, `html.readable-font`) keeps overriding main and reading while on.
- The app tier (`components/shared/app-theme.css`) reads the same three variables where it reads the site faces today;
  games that declare their own families keep them.

Each face ships with a metric-matched local fallback (the OPT-17 construction, `scripts/gen-font-metrics.ts`) so text
does not reflow while a chosen face loads on a first visit.

## Approaches considered

1. **Per-face stylesheets loaded on demand, the server told the choice (chosen).** The main sheet keeps only the default
   faces; each other face is its own small generated stylesheet. The server renders the chosen faces' `<link
   rel=stylesheet>` and the Latin `woff2` preload in `<head>` and stamps the choice on `<html>`, so the first frame is
   already right. Trade-off: a cookie and a little head logic.
2. **Every face's `@font-face` in the main sheet.** Simplest; browsers still fetch only used files. Rejected: every visitor
   pays fifteen faces of rules, against Steel B5 (the site-tier CSS shrinks every phase) and the owner's "only load fonts
   we use".
3. **Client-only injection from the pre-paint script.** No cookie. Rejected: a script-inserted stylesheet is not
   render-blocking, so a reader with a non-default face sees DM Sans and then a swap on every page.

## How it works (approach 1)

**Storage.** Device: `localStorage` keys `rmh-font-main`, `rmh-font-reading`, `rmh-font-mono` (font ids; absent = default),
`rmh-appearance-sync` (`'0'` = off; absent = on) and `rmh-appearance-changed-at` (ms epoch of the device's last
appearance change). Mirror: one cookie `rmh-fonts` = `main.reading.mono` ids (only written when any is non-default;
`SameSite=Lax`, one year, not `HttpOnly` so the client can write it). Account: three nullable columns on
`AppearancePreference` (`fontMain`, `fontReading`, `fontMono`, `VarChar(32)`) and an `updatedAt DateTime @updatedAt`.
Migration via `pnpm db:migrate` (deploys run `migrate deploy`).

**First paint.** In the `__root.tsx` loader the server picks the fonts: the account's when the session has an
`AppearancePreference` row and the request does not say sync is off, else the `rmh-fonts` cookie, else the defaults. It
emits, for each non-default face in use, `<link rel="stylesheet" href="<that face's sheet>">` and the Latin `woff2`
preload, and `data-font-main / data-font-reading / data-font-mono` on `<html>`. Those attributes select the variable
values (`html[data-font-main='inter'] { --site-font-body: 'Inter', 'Inter Fallback', … }`) in one small generated rules
file in the site sheet — ids and stacks only, no `@font-face`. Geist's unconditional preload in `__root.tsx` goes; DM
Sans's Latin file is preloaded only when it is in use.

The server cannot read `localStorage`, so the sync switch is also mirrored into the cookie world: `rmh-appearance-sync=0`
is a cookie too, so the server skips the account seed for that device. (The existing account seed in
`lib/appearance/account-seed.ts` and the pre-paint theme step must honour the same flag.)

**Pre-paint fallback.** If `localStorage` names fonts the server did not render (cookie cleared, first load after a
change on a device whose cookie write failed), the pre-paint script sets the `data-font-*` attributes and appends the
missing `<link>`s; the page may show the default face for that one load. It then rewrites the cookie so the next request
is right.

**Changing a font.** The settings picker writes `localStorage`, the cookie and `rmh-appearance-changed-at`, sets the
attribute and appends the sheet (it is already cached if the picker previewed it), and, if sync is on, PUTs the account
like every other appearance field.

**Settings UI.** Settings → Appearance gets a "Fonts" group: three pickers, each option drawn in its own face (the picker
loads the candidate sheets only while it is open — this is the one place several faces are fetched), "Same as main font"
first in Reading. Built from `components/ui/` primitives and `t()` strings, Steel rules (rows on rules, one primary).
A "Sync appearance across devices" toggle sits at the top of Appearance with one line of help: "Off: this device keeps
its own theme, fonts and display settings." Signed out, the toggle is hidden (there is nothing to sync with).

## Appearance sync

Appearance fields: theme (`style`), main/reading/mono font, text size (`fontScale`), density, readable font, colour-vision
mode, globe motion (`jellyMotion`). Nothing else changes: every other preference keeps syncing whatever this switch says.

- **Sync on (default).** Today's behaviour: the server seeds the account's values into the device before paint, the idle
  sync in `components/Providers.tsx` reconciles, and every change on the device is PUT to the account.
- **Sync off (per device).** The device neither pulls (no server seed, no idle GET applied) nor pushes (no PUT on change).
  Other devices are unaffected and keep syncing with the account.
- **Turning it back on: most recent wins.** Compare the device's `rmh-appearance-changed-at` with the account row's
  `updatedAt`. If the device is newer, PUT the device's values (the account now holds them and other syncing devices
  follow); if the account is newer, apply the account's values to the device. Equal or unknown device time → the account
  wins (today's rule).

## Constraints

- Steel plan and `design.md` state "Geist and Geist Mono only"; this is an owner decision of 2026-11-23 that supersedes
  it. Update `design.md` §Type, the plan's section 3 and section 13 (fonts), `CLAUDE.md` "Identity"/"Performance", and the
  tests that pin Geist (`lib/__tests__/steel-tokens.test.ts`, any font/preload test, `fonts:check`).
- B5 bundle budget (`scripts/check-bundle-budget.ts`) must pass: the site sheet gains only the id→stack rules and the
  default faces' `@font-face`; Geist's rules leave it.
- `lib/appearance/prefs.ts` stays zod-free; schema in `prefs-schema.ts`. The pre-paint script is regenerated with
  `pnpm prepaint:build`, never hand-edited.
- Every string through `t()`; check Day and Night at 390px and 1280px and once in `ar` (Arabic has no glyphs in most of
  these faces and falls through to the OS face, as today).

## Left to the builder

The exact generated file layout for the per-face sheets, the fallback metrics run per face, the picker's component
shape within the Steel rules, and test coverage (at minimum: server font selection precedence, the sync-on/off/turn-on
merge, that a default visitor's HTML links no extra font sheet, and that the site-tier CSS contains no non-default
`@font-face`).
