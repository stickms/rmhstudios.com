# 11 — Dates and numbers in the reader's locale

Surface: every component and route that formats a date, time, number or relative
time (`components/**`, `app/**`, `features/*/ui/**`). Wave 7. No namespace of
its own (the helpers carry no strings; any string touched stays in its
component's namespace).

## User story

As a member reading the site in Arabic, Japanese or French, I want dates, times,
counts and "3 hours ago" written the way my language writes them — not in the
browser's default locale, not in American English inside a translated sentence —
and I want the page not to flash when it hydrates.

## Requirements elicitation

- **What exists (verified):** the site runs in 9 locales with `ar`
  right-to-left. There are **272** calls of `toLocaleString()` /
  `toLocaleDateString()` / `toLocaleTimeString()` with no locale, `undefined`,
  or a hard-coded `'en…'` locale across `components/`, `app/` and `features/`
  (largest: `features/slice-it` 25, `components/feed` 22, `app/routes` 20,
  `components/wallet` 18, `components/admin` 17), and **60** uses of date-fns
  `formatDistanceToNow`, which always writes English ("3 days ago" inside a
  translated sentence). A no-argument `toLocale*` formats in the *browser's*
  locale on the client and the *server's* (`en-US`) during SSR, so the two
  renders differ and React discards the server tree. The right tools exist but
  are used in a minority of places: `formatRelativeTime(at, locale)`
  (`lib/i18n/relative-time.ts`), `components/ui/RelativeTime.tsx`
  (hydration-safe), and `formatDateShort` / `formatCompact`
  (`lib/core/format.ts`) which take a locale.
- **Decisions:** add one small formatting API bound to the active language and
  convert every call site; add a ratchet so the count only falls. Formats keep
  their current shape (same fields shown) — only the locale changes. Times shown
  in a member's own time zone keep passing it. Engine (non-React) code formats
  through pure helpers that take a locale; where an engine has no locale in
  scope it reads `document.documentElement.lang` (set by `lib/i18n/dom.ts`)
  through one helper, `currentDocumentLocale()`.

## Functional requirements

1. FR-1 `hooks/useLocaleFormat.ts` returns `{ locale, date(v, opts?), time(v,
   opts?), dateTime(v, opts?), number(n, opts?), compact(n), relative(v) }`,
   memoised per language, using `Intl` with `i18n.language`.
   `lib/core/format.ts` gains the pure `formatDate(v, locale, opts?)`,
   `formatNumber(n, locale, opts?)` and `currentDocumentLocale()` for non-React
   code.
2. FR-2 Every `toLocale*String` call without an explicit, active-language locale
   in `components/`, `app/` and `features/*/ui/` is replaced by the hook (React)
   or the pure helper with the active locale (non-React), keeping the same
   options.
3. FR-3 Every `formatDistanceToNow` in those trees is replaced by `RelativeTime`
   (rendered text) or `formatRelativeTime(at, locale)` (inside a `t()`
   interpolation). Where the old call used `addSuffix: true`, the replacement
   reads the same ("3 days ago").
4. FR-4 Numbers that are scores, counts or coin amounts use `number()` /
   `compact()`; `ar` therefore shows the locale's digits as `Intl` decides (no
   forced Latin digits).
5. FR-5 The ratchet `lib/__tests__/locale-format-ratchet.test.ts` counts the
   patterns above (and `'en-US'` literals passed to `Intl` or `toLocale*`) per
   top-level directory and fails if any count rises above its recorded baseline;
   the baseline after this feature is at most 15 in total, each remaining site
   listed with a one-line reason (for example, a machine-readable timestamp sent
   to a server).

## Non-functional requirements

- **Performance:** `Intl.DateTimeFormat` / `NumberFormat` instances are cached
  per (locale, options) key in `lib/core/format.ts` (a `Map`, bounded at 200
  entries); no formatter is created per render of a list row.
- **Hydration:** the server and the hydrating client format with the same locale
  (the request's), so text matches; relative times keep using `RelativeTime`'s
  server snapshot.
- **No behaviour change** beyond the locale: no date shown in a different zone,
  no fields added or removed. Do not reformat files (no prettier over
  pre-existing files); change only the call sites.
- **i18n:** no new keys; sentences that embedded an English relative time now
  interpolate a localised one (the key and English default unchanged).
- **Steel:** untouched (no markup or class changes).
- **Accessibility:** `<time dateTime=…>` is kept wherever it exists.

## Data model and API

None.

## Testing requirements

- Product suite `lib/core/__tests__/locale-format.product.test.ts`: helpers
  honour the locale (`ar`, `ja`, `fr`), cache reuse, `currentDocumentLocale()`
  fallback to `en`.
- Main suite `lib/__tests__/locale-format-ratchet.test.ts`: the ratchet itself
  (it is a gate, so it lives in the main suite with the other ratchets; see
  `lib/__tests__/raw-api-fetch-ratchet.test.ts` for the shape).
- Component test `hooks/__tests__/useLocaleFormat.test.tsx`: switching language
  changes output.

## Acceptance criteria

- [ ] In `ar`, the wallet, the feed, admin tables and game result screens show
      Arabic-locale dates and numbers.
- [ ] No "… ago" in English remains on a translated page.
- [ ] The ratchet baseline is ≤ 15 with a reason per entry.
- [ ] No hydration warning about text content on the feed or wallet in
      development.

## Out of scope

Calendar systems other than Gregorian, changing which time zone a page uses,
translating game engines' own canvas text.
