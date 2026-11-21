# 02 · Text statistics (`/tools/text-stats`)

Category: Text. Branch: `autonomous/s01-text-stats`. Status: shipped in sprint 01.

## User story

As a member writing a post, an essay for RMHStudy or a talk, I want to see word, character and sentence counts and
reading time as I type so that I can hit a length limit or a time slot.

## Requirements elicitation

Who: members of the site (and signed-out visitors, since every tool is public) who would otherwise paste the same data
into an unknown third-party website. Why here: the site already hosts the developer API, RMHCode, RMHStudy, the vibes
platform, communities and group chats; these are the jobs those users do next to them. Constraints from the repository:
Steel design language, `t()` for every string, a public route with its own meta and an OG card, no server round trip for
user data, and no new dependency.

## Specification

### Functional requirements

- **F1.** Count words and sentences with Intl.Segmenter in the viewer's locale, so languages without spaces count
  correctly.
- **F2.** Count characters as grapheme clusters, plus characters without spaces, UTF-16 code units and UTF-8 bytes (what
  database and SMS limits count).
- **F3.** Count paragraphs (blank-line separated) and lines.
- **F4.** Estimate reading time at 238 words a minute and speaking time at 150.
- **F5.** Show average word length and the longest word.
- **F6.** List the ten most used words of four letters or more, case-folded, numbers excluded.
- **F7.** Stay responsive on long text by deferring the computation (useDeferredValue).

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

- Logic: `lib/toolbox/text-stats.ts` (pure, strict-island typed).
- UI: `components/toolbox/text-stats/TextStatsTool.tsx` inside `ToolFrame`.
- Route: `app/routes/_site/tools/text-stats.tsx`; catalog entry in `lib/toolbox/catalog.ts`.
- Tests: `lib/toolbox/__tests__/text-stats.test.ts` in the Toolbox suite (`pnpm test:toolbox`).

## Testing requirements

Unit tests (Toolbox suite) must cover:

- zero state
- words/sentences/paragraphs/lines on a sample
- an emoji with a skin-tone modifier is one character but 7 code units and 11 bytes
- Japanese segments into several words
- reading and speaking time
- top-word ranking, tie-break and limit
- duration formatting

Plus: the catalog test (route file exists, sitemap entry), the main suite's OG/sitemap/i18n gates, eslint, `tsc -b`, the
strict island, and an SSR smoke render (HTTP 200 with the tool's heading).

## Acceptance criteria

- [x] Pasting a 10,000-word document keeps typing responsive.
- [x] Counts match a hand count on the sample text.
- [x] An emoji counts as one character.
- [x] All functional requirements above work in Day and Night editions at 390px and 1280px.
- [x] No string is hard-coded; `locales/en/toolbox.json` holds every key.
- [x] The route renders server-side without errors and passes `pnpm check:consistency`.
