# 06 · CSV and JSON converter (`/tools/csv`)

Category: Developer. Branch: `autonomous/s01-csv`. Status: shipped in sprint 01.

## User story

As a member exporting data from a spreadsheet or moving API output into one, I want to convert CSV to JSON and back
without uploading the file anywhere.

## Requirements elicitation

Who: members of the site (and signed-out visitors, since every tool is public) who would otherwise paste the same data
into an unknown third-party website. Why here: the site already hosts the developer API, RMHCode, RMHStudy, the vibes
platform, communities and group chats; these are the jobs those users do next to them. Constraints from the repository:
Steel design language, `t()` for every string, a public route with its own meta and an OG card, no server round trip for
user data, and no new dependency.

## Specification

### Functional requirements

- **F1.** Parse RFC 4180 CSV plus common variants: quoted delimiters, doubled quotes, line breaks in quotes, CRLF or LF,
  a byte-order mark.
- **F2.** Detect comma, semicolon, tab or pipe, or let the user choose; show which was detected.
- **F3.** Report an unterminated quote with the line it opened on.
- **F4.** CSV to JSON: an array of objects keyed by the header (duplicate and blank names renamed) or an array of
  arrays; optionally read numbers, booleans and empty cells as null, keeping values like 007 and very long digit strings
  as text.
- **F5.** JSON to CSV: the union of keys in first-seen order as the header, nested values as JSON text, quoting only
  fields that need it.
- **F6.** Preview the first 20 rows as a table.
- **F7.** The direction switch is the shared Tabs strip.

### Non-functional requirements

- **Privacy and security.** Everything runs in the browser; no input is sent to the server, logged or stored, except
  where a requirement above names local storage. Randomness, where used, is `crypto.getRandomValues` through
  `lib/toolbox/random.ts` (rejection-sampled), never `Math.random()`.
- **Performance.** Pure functions with no dependency; work proportional to the input, bounded by explicit limits;
  expensive recomputation deferred with `useDeferredValue` where input is long. Nothing animates or polls at rest (Steel
  R5); no worker, observer or animation frame.
- **Accessibility.** Every control is labelled (`Label`/`aria-label`), results that change are in an `aria-live` region,
  errors use `role="alert"`, state is never conveyed by colour alone, focus ring is the global K10 outline, and tab
  switchers use the shared `Tabs` (roving keyboard).
- **Design system (Steel).** `ToolFrame` (PageLayout), rows on 1px rules (R3), `--site-*` token utilities only, `t-*`
  type classes, at most one ink primary button per view (R4), no gradient, blur, shadow or translucency (R1).
- **i18n.** All strings through `t()` in the `toolbox` namespace with literal defaults; numbers and dates through `Intl`
  in the active locale; layouts survive RTL (`ar`).
- **SSR.** Output that depends on the clock, the viewer's time zone or randomness renders only after hydration, so
  server and client agree.
- **SEO.** `definePage` gives the route its own title, description and canonical; it unfurls with the `/tools` section
  card; it is listed in the sitemap from the catalog.

### Implementation

- Logic: `lib/toolbox/csv.ts` (pure, strict-island typed).
- UI: `components/toolbox/csv/CsvTool.tsx` inside `ToolFrame`.
- Route: `app/routes/_site/tools/csv.tsx`; catalog entry in `lib/toolbox/catalog.ts`.
- Tests: `lib/toolbox/__tests__/csv.test.ts` in the Toolbox suite (`pnpm test:toolbox`).

## Testing requirements

Unit tests (Toolbox suite) must cover:

- quoted fields, doubled quotes, embedded line breaks
- empty fields, blank lines, BOM
- unterminated quote line
- delimiter detection
- write/parse round trip
- header renaming
- type inference and safe-integer guard
- JSON to rows and errors

Plus: the catalog test (route file exists, sitemap entry), the main suite's OG/sitemap/i18n gates, eslint, `tsc -b`, the
strict island, and an SSR smoke render (HTTP 200 with the tool's heading).

## Acceptance criteria

- [x] A semicolon-separated export from a European spreadsheet converts without choosing the delimiter.
- [x] JSON→CSV→JSON preserves the data.
- [x] All functional requirements above work in Day and Night editions at 390px and 1280px.
- [x] No string is hard-coded; `locales/en/toolbox.json` holds every key.
- [x] The route renders server-side without errors and passes `pnpm check:consistency`.
