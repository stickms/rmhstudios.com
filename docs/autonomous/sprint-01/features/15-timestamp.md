# 15 · Timestamp converter (`/tools/timestamp`)

Category: Dates and time. Branch: `autonomous/s01-timestamp`. Status: shipped in sprint 01.

## User story

As a developer reading logs or API responses, I want to turn a Unix timestamp into a date (and back) without guessing
whether it is seconds or milliseconds.

## Requirements elicitation

Who: members of the site (and signed-out visitors, since every tool is public) who would otherwise paste the same data
into an unknown third-party website. Why here: the site already hosts the developer API, RMHCode, RMHStudy, the vibes
platform, communities and group chats; these are the jobs those users do next to them. Constraints from the repository:
Steel design language, `t()` for every string, a public route with its own meta and an OG card, no server round trip for
user data, and no new dependency.

## Specification

### Functional requirements

- **F1.** Read numbers as seconds, milliseconds, microseconds or nanoseconds by length, or a fixed unit; negative and
  fractional values allowed.
- **F2.** Read any date string Date.parse accepts.
- **F3.** Show UTC ISO 8601, the viewer's local time, relative time, Unix seconds and milliseconds (copyable), day of
  year and ISO week.
- **F4.** A Now button fills the current time.
- **F5.** Render clock- and zone-dependent rows only after hydration.

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

- Logic: `lib/toolbox/timestamp.ts` (pure, strict-island typed).
- UI: `components/toolbox/timestamp/TimestampTool.tsx` inside `ToolFrame`.
- Route: `app/routes/_site/tools/timestamp.tsx`; catalog entry in `lib/toolbox/catalog.ts`.
- Tests: `lib/toolbox/__tests__/timestamp.test.ts` in the Toolbox suite (`pnpm test:toolbox`).

## Testing requirements

Unit tests (Toolbox suite) must cover:

- unit guessing for all four lengths
- fixed units, negatives and fractions
- date strings
- empty, invalid and out-of-range
- day of year and ISO week edge cases
- flooring before 1970
- relative units

Plus: the catalog test (route file exists, sitemap entry), the main suite's OG/sitemap/i18n gates, eslint, `tsc -b`, the
strict island, and an SSR smoke render (HTTP 200 with the tool's heading).

## Acceptance criteria

- [x] 1700000000 reads as 2023-11-14T22:13:20Z.
- [x] Pasting milliseconds needs no unit choice.
- [x] All functional requirements above work in Day and Night editions at 390px and 1280px.
- [x] No string is hard-coded; `locales/en/toolbox.json` holds every key.
- [x] The route renders server-side without errors and passes `pnpm check:consistency`.
