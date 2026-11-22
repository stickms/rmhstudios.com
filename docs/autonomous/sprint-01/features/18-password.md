# 18 · Password generator (`/tools/password`)

Category: Everyday. Branch: `autonomous/s01-password`. Status: shipped in sprint 01.

## User story

As a member securing an account (here or anywhere), I want a strong random password or a memorable passphrase made on my
device, and an honest strength estimate, so that I stop reusing weak passwords.

## Requirements elicitation

Who: members of the site (and signed-out visitors, since every tool is public) who would otherwise paste the same data
into an unknown third-party website. Why here: the site already hosts the developer API, RMHCode, RMHStudy, the vibes
platform, communities and group chats; these are the jobs those users do next to them. Constraints from the repository:
Steel design language, `t()` for every string, a public route with its own meta and an OG card, no server round trip for
user data, and no new dependency.

## Specification

### Functional requirements

- **F1.** Passwords: length 4–128, lower/upper/digits/symbols, leave out look-alikes, at least one of each chosen set,
  shuffled.
- **F2.** Passphrases: 3–12 words from a 738-word list, separator, capitals, optional digit.
- **F3.** crypto.getRandomValues with rejection sampling; exact entropy shown with a rating.
- **F4.** Generate only in the browser after hydration.
- **F5.** Strength check of a typed password on the device (password field), with warnings for common passwords,
  repeats, sequences and short lengths; nothing is stored or sent.

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

- Logic: `lib/toolbox/password.ts` (pure, strict-island typed).
- UI: `components/toolbox/password/PasswordTool.tsx` inside `ToolFrame`.
- Route: `app/routes/_site/tools/password.tsx`; catalog entry in `lib/toolbox/catalog.ts`.
- Tests: `lib/toolbox/__tests__/password.test.ts` in the Toolbox suite (`pnpm test:toolbox`).

## Testing requirements

Unit tests (Toolbox suite) must cover:

- length and every chosen set present over 49 seeds
- look-alikes and unchosen sets absent
- empty selection and length clamps
- entropy
- word list size, uniqueness and shape
- passphrase shape and digit
- common, repeated, sequential and short warnings
- rating thresholds

Plus: the catalog test (route file exists, sitemap entry), the main suite's OG/sitemap/i18n gates, eslint, `tsc -b`, the
strict island, and an SSR smoke render (HTTP 200 with the tool's heading).

## Acceptance criteria

- [x] A 20-character four-set password reports about 128 bits.
- [x] 'password1' is rated very weak.
- [x] All functional requirements above work in Day and Night editions at 390px and 1280px.
- [x] No string is hard-coded; `locales/en/toolbox.json` holds every key.
- [x] The route renders server-side without errors and passes `pnpm check:consistency`.
