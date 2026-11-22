# 12 · Number base converter (`/tools/base`)

Category: Numbers and money. Branch: `autonomous/s01-base`. Status: shipped in sprint 01.

## User story

As a student or developer reading a register dump, a colour or a permission mask, I want to convert numbers between
bases exactly, including signed fixed-width views, so that I can read what the bits mean.

## Requirements elicitation

Who: members of the site (and signed-out visitors, since every tool is public) who would otherwise paste the same data
into an unknown third-party website. Why here: the site already hosts the developer API, RMHCode, RMHStudy, the vibes
platform, communities and group chats; these are the jobs those users do next to them. Constraints from the repository:
Steel design language, `t()` for every string, a public route with its own meta and an OG card, no server round trip for
user data, and no new dependency.

## Specification

### Functional requirements

- **F1.** Parse whole numbers in any base 2–36 with sign, 0x/0o/0b prefixes and _ , or space separators, with BigInt
  precision.
- **F2.** Name the first bad digit.
- **F3.** Show binary, octal, decimal and hex (grouped) plus any chosen base, each copyable, and the bits needed.
- **F4.** Show 8/16/32/64-bit views: two's-complement pattern, hex, unsigned and signed readings, or that it does not
  fit.

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

- Logic: `lib/toolbox/base.ts` (pure, strict-island typed).
- UI: `components/toolbox/base/BaseTool.tsx` inside `ToolFrame`.
- Route: `app/routes/_site/tools/base.tsx`; catalog entry in `lib/toolbox/catalog.ts`.
- Tests: `lib/toolbox/__tests__/base.test.ts` in the Toolbox suite (`pnpm test:toolbox`).

## Testing requirements

Unit tests (Toolbox suite) must cover:

- prefixes, signs, separators
- precision past 2^53
- bad digits and empty input
- grouping
- two's complement and signed readings
- fit checks
- bit length

Plus: the catalog test (route file exists, sitemap entry), the main suite's OG/sitemap/i18n gates, eslint, `tsc -b`, the
strict island, and an SSR smoke render (HTTP 200 with the tool's heading).

## Acceptance criteria

- [x] -1 shows ff and 255 in the 8-bit view.
- [x] 18446744073709551615 converts exactly.
- [x] All functional requirements above work in Day and Night editions at 390px and 1280px.
- [x] No string is hard-coded; `locales/en/toolbox.json` holds every key.
- [x] The route renders server-side without errors and passes `pnpm check:consistency`.
