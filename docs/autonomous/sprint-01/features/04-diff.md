# 04 · Text diff (`/tools/diff`)

Category: Text. Branch: `autonomous/s01-diff`. Status: shipped in sprint 01.

## User story

As a member editing a document, a config or a translation, I want to compare two versions line by line so that I can see
exactly what changed and share the change as a patch.

## Requirements elicitation

Who: members of the site (and signed-out visitors, since every tool is public) who would otherwise paste the same data
into an unknown third-party website. Why here: the site already hosts the developer API, RMHCode, RMHStudy, the vibes
platform, communities and group chats; these are the jobs those users do next to them. Constraints from the repository:
Steel design language, `t()` for every string, a public route with its own meta and an OG card, no server round trip for
user data, and no new dependency.

## Specification

### Functional requirements

- **F1.** Diff lines with the Myers O(ND) algorithm, so large mostly-equal texts compare quickly.
- **F2.** Options to ignore whitespace and to ignore case.
- **F3.** Show a summary (added, removed, unchanged) and every line with old and new line numbers and a + or − sign;
  added and removed lines carry screen-reader words, not colour alone.
- **F4.** Draw at most 3,000 lines and say so; the unified diff always holds everything.
- **F5.** Copy the result as a unified diff (diff -u format with three lines of context).

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

- Logic: `lib/toolbox/diff.ts` (pure, strict-island typed).
- UI: `components/toolbox/diff/DiffTool.tsx` inside `ToolFrame`.
- Route: `app/routes/_site/tools/diff.tsx`; catalog entry in `lib/toolbox/catalog.ts`.
- Tests: `lib/toolbox/__tests__/diff.test.ts` in the Toolbox suite (`pnpm test:toolbox`).

## Testing requirements

Unit tests (Toolbox suite) must cover:

- equal texts, empty sides
- the minimal edit count on the Myers paper example
- both sides rebuilt from the script for 50 random pairs
- line numbering
- whitespace/case options
- a 20,000-line pair with one change in under two seconds
- line-ending normalisation
- unified hunks, empty output, insertion at the start

Plus: the catalog test (route file exists, sitemap entry), the main suite's OG/sitemap/i18n gates, eslint, `tsc -b`, the
strict island, and an SSR smoke render (HTTP 200 with the tool's heading).

## Acceptance criteria

- [x] A one-line change in a 20,000-line paste shows one removed and one added line.
- [x] The copied patch applies with git apply.
- [x] All functional requirements above work in Day and Night editions at 390px and 1280px.
- [x] No string is hard-coded; `locales/en/toolbox.json` holds every key.
- [x] The route renders server-side without errors and passes `pnpm check:consistency`.
