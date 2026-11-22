# 19 · Dice roller (`/tools/dice`)

Category: Everyday. Branch: `autonomous/s01-dice`. Status: shipped in sprint 01.

## User story

As a member running a tabletop session in a group chat or a Space, I want to roll any dice expression fairly and see
every die so that the table trusts the result.

## Requirements elicitation

Who: members of the site (and signed-out visitors, since every tool is public) who would otherwise paste the same data
into an unknown third-party website. Why here: the site already hosts the developer API, RMHCode, RMHStudy, the vibes
platform, communities and group chats; these are the jobs those users do next to them. Constraints from the repository:
Steel design language, `t()` for every string, a public route with its own meta and an OG card, no server round trip for
user data, and no new dependency.

## Specification

### Functional requirements

- **F1.** Parse NdS terms and constants joined by + and −, d% and d20 shorthands, keep/drop (kh, kl, dh, dl) and
  exploding (!).
- **F2.** Limits: 1,000 dice, 10,000 sides, 20 terms, 100 explosions per die.
- **F3.** Show the total, each die (dropped dice struck through and named for screen readers), range and exact average
  where linear.
- **F4.** Presets for common dice; the last twenty rolls listed.

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

- Logic: `lib/toolbox/dice.ts` (pure, strict-island typed).
- UI: `components/toolbox/dice/DiceTool.tsx` inside `ToolFrame`.
- Route: `app/routes/_site/tools/dice.tsx`; catalog entry in `lib/toolbox/catalog.ts`.
- Tests: `lib/toolbox/__tests__/dice.test.ts` in the Toolbox suite (`pnpm test:toolbox`).

## Testing requirements

Unit tests (Toolbox suite) must cover:

- canonical formatting of every form
- malformed and oversized input
- rolls within range and adding up
- keep-highest correctness
- explosion cap and infinite range
- exact average and its absence

Plus: the catalog test (route file exists, sitemap entry), the main suite's OG/sitemap/i18n gates, eslint, `tsc -b`, the
strict island, and an SSR smoke render (HTTP 200 with the tool's heading).

## Acceptance criteria

- [x] 4d6kh3 never keeps the lowest die.
- [x] 2d20kh1 is advantage.
- [x] All functional requirements above work in Day and Night editions at 390px and 1280px.
- [x] No string is hard-coded; `locales/en/toolbox.json` holds every key.
- [x] The route renders server-side without errors and passes `pnpm check:consistency`.
