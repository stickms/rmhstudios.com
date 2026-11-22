# 05 · JSON formatter (`/tools/json`)

Category: Developer. Branch: `autonomous/s01-json`. Status: shipped in sprint 01.

## User story

As a developer using the RMH Studios developer API or debugging a webhook, I want to paste JSON and see whether it is
valid, where it breaks, and a formatted version so that I can read and fix it quickly.

## Requirements elicitation

Who: members of the site (and signed-out visitors, since every tool is public) who would otherwise paste the same data
into an unknown third-party website. Why here: the site already hosts the developer API, RMHCode, RMHStudy, the vibes
platform, communities and group chats; these are the jobs those users do next to them. Constraints from the repository:
Steel design language, `t()` for every string, a public route with its own meta and an OG card, no server round trip for
user data, and no new dependency.

## Specification

### Functional requirements

- **F1.** Validate with a strict RFC 8259 scanner that reports the first error's line, column and a plain reason the
  same way in every browser.
- **F2.** Refuse documents nested more than 1,000 levels instead of overflowing the stack.
- **F3.** Format with two spaces, four spaces or tabs, or minify; optionally sort object keys recursively.
- **F4.** Show structure: depth, objects, arrays, keys, strings, numbers, booleans, nulls and formatted size in bytes.
- **F5.** Copy the formatted output.

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

- Logic: `lib/toolbox/json.ts` (pure, strict-island typed).
- UI: `components/toolbox/json/JsonTool.tsx` inside `ToolFrame`.
- Route: `app/routes/_site/tools/json.tsx`; catalog entry in `lib/toolbox/catalog.ts`.
- Tests: `lib/toolbox/__tests__/json.test.ts` in the Toolbox suite (`pnpm test:toolbox`).

## Testing requirements

Unit tests (Toolbox suite) must cover:

- acceptance of all valid forms
- agreement with JSON.parse on 13 broken documents
- exact line/column/reason for several errors
- depth guard
- indent, tab, minify, sort
- iterative stats on 5,000 levels

Plus: the catalog test (route file exists, sitemap entry), the main suite's OG/sitemap/i18n gates, eslint, `tsc -b`, the
strict island, and an SSR smoke render (HTTP 200 with the tool's heading).

## Acceptance criteria

- [x] A missing colon on line 3 is reported as line 3 with the column of the offending token.
- [x] Minify then format returns the original layout.
- [x] All functional requirements above work in Day and Night editions at 390px and 1280px.
- [x] No string is hard-coded; `locales/en/toolbox.json` holds every key.
- [x] The route renders server-side without errors and passes `pnpm check:consistency`.
