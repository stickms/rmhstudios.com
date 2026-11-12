# CLAUDE.md — rmhstudios.com

Guidance for coding agents working in this repository. Start here; each major
directory has its own `CLAUDE.md` with depth, and `docs/` holds the reference
docs. `AGENTS.md` mirrors this file for non-Claude tooling.

## What this is

A single web platform: a social feed (RMHarks), 18 browser games (several
multiplayer/3D), 12 full apps (RMHTube, RMHMusic, RMHType, RMHStudy, RMHCode,
RMHLadder, …), a blog/news/library system, a coin economy with Stripe
memberships, and a scoped developer API — served by a React SSR tier with Node
realtime hubs and a Go worker fleet behind it. The catalog in `lib/catalog`
(`games` / `apps`) is the single source of truth for what exists: an entry lives in
`features/<id>/catalog.ts` once its game or app has a feature folder, otherwise under
`lib/catalog/{games,apps}/`.

## Stack of record

**TanStack Start + Vite 8 + React 19 + Nitro SSR.** This is **NOT Next.js**
(some old docs/specs say otherwise — they are stale). TypeScript strict,
Tailwind CSS v4, framer-motion, Zustand + React Query, PostgreSQL + Prisma 7
(`@prisma/adapter-pg`), Better Auth (Discord/GitHub + passkeys +
Stripe), Socket.io Node hubs, Go microservices built with Bazel, i18next (16
locales, RTL for `ar`/`ur`). Node ≥24.18, pnpm workspace.

## Repository map

| Path           | What                                                                                                                                                                     | Details                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `app/`         | TanStack Start routes: pages, API routes, `globals.css` (the `--site-*` theme tokens), router. `routeTree.gen.ts` is GENERATED — never edit.                             | [`app/CLAUDE.md`](app/CLAUDE.md)                 |
| `features/`    | **Feature-sliced code** (redesign A1): one folder per game/app — `feature.ts` manifest, `engine/` (old `lib/<id>`), `ui/` (old `components/<id>`), `server/` (socket handlers, registered by `server/socket-server/features.ts`). Imported as `@features/<id>/...`. Moved so far: `balatro`, `void-breaker`; the rest still live under `lib/<id>` + `components/<id>`. Routes stay thin in `app/routes/`. | [`features/CLAUDE.md`](features/CLAUDE.md)       |
| `components/`  | React components by feature; `ui/` = shared primitives; `feed/PageLayout.tsx` = canonical page wrapper; `shared/` = the full-screen app tier (`--app-*`, `AppShell`).    | [`components/CLAUDE.md`](components/CLAUDE.md)   |
| `lib/`         | Shared logic: auth, prisma, feed, economy, i18n, motion tokens, per-game logic, `.server.ts` server-only modules.                                                        | [`lib/CLAUDE.md`](lib/CLAUDE.md)                 |
| `server/`      | **Node** service tier: web SSR plus socket-server (7001), rmhbox (7676), rmhtube (7003), and the ladder-worker / homes-worker / jobs (pg-boss) workers.                  | [`server/CLAUDE.md`](server/CLAUDE.md)           |
| `go-services/` | **Go** microservice fleet (Bazel + gazelle): `status` and `assets` run in prod; the gateway, Go hubs, workers and supervisor were removed (§5.2, D3).            | [`go-services/CLAUDE.md`](go-services/CLAUDE.md) |
| `stores/`      | Site-level Zustand stores (theme, locale, feed, user display).                                                                                                           | `lib/CLAUDE.md`                                  |
| `hooks/`       | Shared hooks (`useReducedMotion`, `useCelebration`, `useFeedSSE`, `useFluidDrag`, `useLiquidBackground`, `useReveal`, …).                       | `lib/CLAUDE.md`                                  |
| `prisma/`      | `schema/` (one file per domain; model/enum/line counts: `docs/_generated/facts.json`) + migrations.                                                                                                        | `lib/CLAUDE.md`                                  |
| `locales/`     | 16 shipped locales × the registered namespaces (count: `docs/_generated/facts.json`); `en` is authoritative. (More directories exist on disk than are wired up — see the i18n note below.)                      | `lib/CLAUDE.md` §i18n                            |
| `data/`        | Static JSON (RMHBox content packs, library metadata).                                                                                                                    | —                                                |
| `public/`      | Static assets, `robots.txt`, `manifest.webmanifest`.                                                                                                                     | —                                                |
| `scripts/`     | Seeding, i18n pipeline, OG/icon generation, ladder pipeline, news pipeline, epic build.                                                                                  | `docs/README.md`                                 |
| `deploy/`      | Apache vhosts, blue/green hotswap, DB backups, Terraform (DNS), runbooks.                                                                                                | [`docs/architecture.md`](docs/architecture.md)   |
| `docs/`        | Reference docs, design docs, plans, runbooks — also **published** as a Sphinx/MyST Read the Docs site in 16 languages.                                                   | [`docs/README.md`](docs/README.md)               |
| `testing/`     | RMHBox phase tests (the mission-critical remainder) + the unwired browser smoke. Most other suites are colocated under `lib/`; discovery is a glob, nothing to register. | [`docs/testing.md`](docs/testing.md)             |
| `cli/`         | `rmhcode` CLI (wraps Claude Code; publishes User Builds).                                                                                                                | —                                                |

## Commands

```bash
pnpm install                 # postinstall runs prisma generate
pnpm db:push                 # apply schema to local Postgres (dev)
pnpm dev                     # Vite (7005) + socket/rmhbox/rmhtube hubs + ladder/homes/jobs workers
pnpm typecheck               # typecheck: `tsc -b` over the core, engine and site projects (a bare `tsc --noEmit` checks nothing)
pnpm lint                    # eslint (jsx-a11y at warn — add no new warnings)
pnpm format                  # prettier
pnpm test                    # main test suite (mission-critical scope — docs/testing.md; time it with `time pnpm test`)
pnpm test:epic               # epic content-build suite (needs Chromium)
pnpm test:integration        # real flows vs a running app + throwaway Postgres (docs/testing.md §8)
pnpm build                   # vibe-packages → islands (vite.islands.config.ts) → vite build → esbuild server bundles
pnpm i18n:extract            # after adding t() strings
pnpm facts:generate          # refresh docs/_generated/facts.json (model/route/test/namespace counts; facts:check gates it)
pnpm check:consistency       # THE COMMIT GATE — run before every commit (see below)
pnpm audit:pages             # real-browser sweep: iOS edge-pinned layers + page-anatomy drift (needs pnpm dev)
make gazelle && make test    # Go: regenerate BUILD files, run Bazel tests
```

Local ports: web 7005 · socket-server 7001 · rmhtube 7003 · rmhbox 7676 ·
status 7008 · assets 7007. Env: see `.env.example`; minimum is
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

## The commit gate — run this before EVERY commit

This repo's recurring failure mode is not broken code; it is code that works
and looks like it came from a different site. One page hardcodes a radius,
one route skips `defineHandler`, one string never reaches `t()` — each is
invisible alone, and together they are why §5.2, §12 and the CI gates exist.
So consistency is checked at the same moment every time: **the commit.**

```bash
pnpm check:consistency          # gate the staged change (what the commit will contain)
pnpm check:consistency --fast   # design/style gates + eslint only (what the hooks run)
pnpm check:consistency --base main   # gate the whole branch before a PR
pnpm check:consistency:full     # + the complete vitest suite
```

`scripts/check-consistency.sh` runs, in order: a scan of the **added lines**
for the rules CI already fails on (hand-rolled tab strips and the like; raw
palette colours, hardcoded radii, `transition-all` and dead `tailwindcss-animate`
classes are eslint `local/no-raw-palette-color`, `local/no-hardcoded-radius`,
`local/no-transition-all`, `local/no-dead-animate-classes`, scoped by
`eslint-local-rules/design-scope.js`) ·
the executable gates in `lib/__tests__/` that are the **authority** for
`design.md` and the Steel plan §17 · eslint on the changed files · `tsc -b` (`pnpm typecheck`) ·
the generated-docs freshness checks. Then it prints the handful of things no
script can check — both editions, the role-less switcher that is really a
tab strip — because a green gate means you did not regress an enforced rule,
never that the change looks right.

It is wired to fire on its own, so "I forgot" is not a failure mode:

- **Agent sessions:** `.claude/settings.json` runs
  `.claude/hooks/commit-gate.sh` before any Bash `git commit`. A failing gate
  blocks the commit and hands the reasons back to the agent to fix. (Both files
  are checked in on purpose — `.gitignore` keeps the rest of `.claude/` local.
  Claude Code asks you to trust project hooks the first time they run.)
  It gates the checkout the commit happens in (`cd <worktree> && git commit`,
  `git -C <worktree> commit`), with that checkout's own gate script. A command
  that stages and commits in one call (`git add -A && git commit`, `git commit -a`)
  is gated on the whole working tree, untracked files included, because nothing
  is staged yet when the hook runs — stage first and commit separately to gate
  exactly the commit.
- **Humans:** `pnpm hooks:install` once per clone points `core.hooksPath` at
  `.githooks/`, whose `pre-commit` runs the same gate (skipping it if an agent
  already gated that exact staged tree).

The fast gate both hooks run is about 10 s and under 1 GB on a 4-core / 15 GB box
whatever is staged; the one step that does not fit there, a cold whole-repo
`tsc` (about 10 GB; about 3 GB once its `.tsbuildinfo` exists), is not in it. A step that is killed (a signal, the out-of-memory
killer) prints a `☠` line naming the step and the signal and the gate exits 3,
"incomplete" — never the `✗` of a rule failure. Numbers and how to re-measure:
[`docs/testing.md`](docs/testing.md) §"The commit gate's budget".

Two rules about the gate itself:

1. **A failing gate is fixed, not bypassed.** `--no-verify` and
   `RMH_SKIP_COMMIT_GATE=1` exist for emergencies and leave a trace — if you
   use one, say why in the commit message. In an agent session the hatch is
   written in the command (`RMH_SKIP_COMMIT_GATE=1 git commit …`); `--no-verify`
   does not reach the agent hook. "The gate is too slow or runs out of memory" is
   not a reason any more: if a `☠` line says so, name that step and signal.
2. **If a rule is genuinely wrong for your change, change the rule** in the
   same commit (the allowlists in `lib/__tests__/design-consistency.test.ts` and
   `eslint-local-rules/design-scope.js` are documented and one-directional — entries come out, they do not go in),
   and say so in the message. Silently working around a gate is how the
   inconsistency it prevents comes back.

Every commit also carries the smaller invariants: no secrets, no hand-edited
generated files (`app/routeTree.gen.ts`, `lib/i18n/resources.<locale>.ts`), no
new type or lint warnings versus the base branch, and a message that explains
_why_.

## Cross-cutting conventions (the ones agents break most)

1. **Routing:** add files under `app/routes/`; the route tree regenerates on
   dev/build. Pages under `_site/` get the Steel shell (`components/shell/SiteShell.tsx`); top-level routes are
   full-screen (games, login, legal — intentional). Never edit
   `routeTree.gen.ts`.
2. **Server-only code:** `lib/**/*.server.ts` is stubbed out of the client
   bundle by a Vite plugin. Never import `.server` modules from client code.
3. **API routes:** `.ts` files with `server.handlers.{GET,POST,...}`. Wrap every
   handler in `defineHandler` from `@/lib/api/handler.server` — it performs the
   session check → rate limit → zod `safeParse` → try/catch order for you and is
   the only place that order is written down in code:
   `POST: defineHandler({ rateLimit: 'write', body: schema }, async ({ userId, body }) => …)`.
   `auth` defaults to `'required'`; pass `'admin'` / `'optional'` / `'none'` to
   opt out. Admin routes get `auth: 'admin'` instead of a hand-rolled
   `isAdmin` check. The `/api/v1/**` developer API keeps its own richer wrapper
   (`withDeveloperApi`) because it speaks a different error envelope.
   **Typed contracts (redesign C1):** declare an endpoint once with `endpoint<{ body; res }>()({ method, path })`
   in a client-safe `*.contract.ts` (types via `import type` from the zod schemas, so no zod ships), bind it
   on the server with `implement(contract, options, handler)` from `@/lib/api/implement.server` (it IS
   `defineHandler`, plus compile-time checks that the schemas and return match the contract), and call it from
   the client with `api(contract, input)` from `@/lib/contract/client`. New code does not add raw
   `fetch('/api/…')` strings — `lib/__tests__/raw-api-fetch-ratchet.test.ts` only lets that count fall.
   Worked example: `lib/playtime/playtime.contract.ts`.
   **Registered endpoints (third-pass audit AR3):** an endpoint whose handlers all go through the wrapper
   (`implement()` for a contract, `defineHandler()` where there is none yet) is not a file under `app/routes/api`. It is
   a `*.server.ts` module in its domain's `api/` folder (`lib/<domain>/api/<path.with.dots>.server.ts`,
   `features/<id>/api/…`, or `lib/api/routes/…` when no domain owns it) that exports
   `route = apiRoute('/api/…', { GET: implement(…) })` from `@/lib/api/route.server`.
   `pnpm api:routes` regenerates the static list `lib/api/route-table.server.ts`, and the one dispatcher
   `app/routes/api/$.ts` serves it. A new endpoint is written with a contract and `implement()`; the bare
   `defineHandler` modules are the ones that moved without one. What stays a route file: a handler written without the
   wrapper, a splat, a stream or SSE response, `/api/auth/$`, `/api/v1/**`. A static path leaves the router only together
   with the `$param` sibling that would otherwise answer it; `lib/api/__tests__/route-table.test.ts` holds that, holds
   that every registered path and method has exactly one wrapped handler, and holds that every contract resolves to
   exactly one handler. Tooling that needs "every API handler source" reads
   `lib/api/route-sources.ts`, never a walk of `app/routes/api`.
4. **Design language:** **Steel** — [`design.md`](design.md) is the short statement;
   the single source for every value and rule is
   [`docs/plans/2026-11-11-steel-design-implementation.md`](docs/plans/2026-11-11-steel-design-implementation.md)
   (cite its rule IDs: R1, T3, S6, K10…). Every color/radius/font via `--site-*`
   token utilities (`bg-site-bg`, `border-site-border`, `text-site-text-muted`,
   `rounded-site`, …) — only the section-2 tokens exist, and the `local/no-raw-palette-color`
   and `local/no-hardcoded-radius` rules fail anything else; full-screen apps use the
   parallel `--app-*` contract in `components/shared/app-theme.css`. **Flat first (R1):** no
   gradient, blur, glow, shadow or translucency anywhere on the site tier except the three
   chrome elements (the globe, the toggle thumb, the slider thumb; R2). **Rules before
   boxes (R3):** separate things with a 1px rule or with space; a bordered box is a control
   or a picture. One ink primary button per view (R4). Type is the seven `t-*` classes
   (`t-title`, `t-heading`, `t-body`, `t-post`, `t-prose`, `t-label`, `t-meta`;
   `app/styles/steel-type.css`), weights 400/500/600, no letterspaced capitals. Use
   `components/ui/` primitives, `PageLayout`, lucide icons, sonner toasts. Surface roles are
   `surface-overlay` (the only raised surface), `surface-field`, `surface-chrome` and
   `surface-press` (`app/styles/steel-surfaces.css`, S6); a `_site` page writes no
   `surface-card` or `surface-panel` at all, because a group of content is rows on rules, and
   those two names remain only on full-screen games and apps (L8), where
   `components/shared/app-theme.css` draws them as the app tier's panels. **Before any UI
   commit** read [`design.md`](design.md), [`docs/design-language.md`](docs/design-language.md) §0
   and [`docs/page-consistency.md`](docs/page-consistency.md). Part of this is
   CI-enforced — `lib/__tests__/steel-tokens.test.ts`, `steel-flat.test.ts` and
   `design-consistency.test.ts` (hand-rolled tab strips, floating UI below the overlay tier)
   plus the eslint rules `local/no-transition-all` and `local/no-dead-animate-classes` — and
   `pnpm check:consistency` is how you find that out **before** you commit rather than in CI.
   `docs/plasmatic-jelly-design-language.md` and `docs/plasmatic-jelly-system.md` describe the deleted
   material and are historical.
5. **i18n:** all user-facing strings through `t("key", { defaultValue })`;
   then `pnpm i18n:extract`. English is authoritative. Two silent failure modes
   to know: **(a)** `defaultValue` is only used when a key is MISSING, so
   changing the wording of a shipped string means a NEW key — editing the
   default in place changes English and nothing else; **(b)** a `{/* … */}` JSX
   comment placed immediately before a `t()` call makes `i18next-parser` skip
   that call, so the key never lands in `locales/` and every non-English locale
   silently serves the English default. Put the explanation above the component
   instead, and check `locales/en/<ns>.json` after adding a string. A **new namespace must
   be added to `NAMESPACES` in `lib/i18n/config.ts`** — a JSON file dropped
   into `locales/en/` without that entry is never loaded, and the UI silently
   falls back to its `defaultValue`s.
6. **SEO:** per-route `head()`; `buildMeta`/`buildCanonical` from `@/lib/seo`;
   JSON-LD only via `jsonLdScript()` + builders from `@/lib/schema`. `buildMeta`
   owns the whole Open Graph block — absolute `og:image`, declared dimensions,
   the right `twitter:card` for the image size, and the section-card fallback —
   so don't hand-roll `og:*` tags in a route. Point at a dynamic card with
   `ogCardPath(kind, id)`; cards are rendered by `lib/og/` and documented in
   [`docs/open-graph.md`](docs/open-graph.md).
7. **Accessibility:** Radix/native primitives, skip link exists, and the focus ring is
   global and fixed (K10): `outline: 2px solid var(--site-text); outline-offset: 2px`. Motion
   is a response to input and ends within 360 ms (R5, section 11); the retired
   reduced-motion setting and OS overrides must not return (the plan's M7 is the one
   reduced-motion rule). Every text pair holds 4.5:1 (A1). Test both editions — Day
   (`style-default`) and Night (`style-graphite`) — at 390px and 1280px, and once in `ar`.
8. **Security:** zod-validate all input; rate-limit writes/AI/uploads;
   user-supplied URL fetches through `lib/ssrf-guard.server`; CSP/security
   headers live in `deploy/apache/rmhstudios.conf` (the production front door;
   the Helm/Traefik path was removed in the rewrite — design §5.2).
9. **Go code:** config via `pkg/config`, logging via `pkg/log`. Go validates
   no user sessions (`status`/`assets` take no user traffic). Run
   `make gazelle` after adding files.
10. **Quality bar (from CONTRIBUTING.md):** don't add new type/lint warnings
    relative to the base branch; keep commits focused; never commit secrets.
    Every commit passes `pnpm check:consistency` — see the commit gate above.
11. **Strict islands:** `tsconfig.strict.json` turns on `noUncheckedIndexedAccess`,
    `exactOptionalPropertyTypes`, `noImplicitOverride` and `noFallthroughCasesInSwitch`
    for a list of small, owned modules (`pnpm typecheck:strict`, run in CI). A new
    top-level module joins the island's `include`; the list only grows. Escape hatches
    (`any`, `@ts-ignore`, `@ts-nocheck`…) are count-ratcheted down in
    `lib/__tests__/ts-escape-hatch-ratchet.test.ts`; the 26 `@ts-nocheck` files are
    `components/velum2099/game/` and must not grow.
12. **TypeScript projects (third-pass audit AR1 steps 1-2, AR4):** the root `tsconfig.json` holds the
    compiler options and no files; `pnpm typecheck` is `tsc -b` over three projects, each with its own
    build info under `.cache/tsc`. `tsconfig.core.json` (`lib/core`, `lib/contract`, `lib/shared`,
    `lib/http.ts`, `lib/url.ts`, `lib/network-quality.ts`, `lib/display-scale.ts`) imports nothing else;
    `tsconfig.engine.json` (the Source-engine port: `lib/tf2-game`, `lib/sp-game`, `lib/csgo-game`,
    `lib/tf2-hud`, `lib/tf2-loadout`, minus their `*.server.ts` side) imports itself and core;
    `tsconfig.site.json` is everything else and sees the other two through their declarations. Import
    specifiers did not change (`@/lib/core/...` still). A core or engine file that imports a site module
    fails `tsc` (TS6307) and `lib/__tests__/tsconfig-projects.test.ts`, which also holds that every
    source file is in exactly one project: a new `*.server.ts` inside an engine directory is a site file
    and goes in `tsconfig.site.json`'s `files`, and so does a test that imports one (name it
    `*.server.test.ts`, or add it to `tsconfig.engine.json`'s `exclude` as well). What the engine needs from the
    site, the site registers (`components/tf2-game/register-session.ts`). The engine project's tests run
    in `pnpm test:tf2`, not in `pnpm test`.

## Design system: Steel

Every UI change must comply with this. It is the owner's approved direction of 2026-11-11,
specified exactly in
[`docs/plans/2026-11-11-steel-design-implementation.md`](docs/plans/2026-11-11-steel-design-implementation.md)
and summarised in [`design.md`](design.md). It replaces Plasmatic Jelly and the Broadsheet
brief, whose documents are historical. **Values are exact: do not round, substitute or
improve them. Section 18 of the plan lists decisions that are still open — do not resolve
them by assumption; ask.**

**Identity: a professional tool that happens to have one remarkable object in it.** A
flat, neutral page in one typeface (Geist; Geist Mono for timestamps, counts and small
data), divided by hairline rules. Two editions, Day (`:root`, `.style-default`) and Night
(`.style-graphite`), one set of `--site-*` names. No accent colour: the accent is the ink.
Content hangs on the spine, a 1px vertical line (arrives in phase 4). Copy is short and
literal; no exclamation marks, no emoji in site chrome, a verb or a verb and a noun on a
button; every string through `t()`.

**The five rules** (cite the ID): **R1** flat first, solid token colours, no gradient,
blur, glow or translucency outside the chrome; **R2** chrome in exactly three places — the
navigation globe, the toggle thumb, the slider thumb — and nothing else is chrome (not
buttons, bars, cards, avatars or icons); **R3** rules before boxes; **R4** one ink primary
per view; **R5** nothing moves at rest (no idle animation, frame loop, canvas, worker or
observer for decoration; motion is a response to input and ends within 360 ms).

**Tokens (plan section 2; `app/globals/tokens-themes.css`; pinned by
`lib/__tests__/steel-tokens.test.ts`).** `--site-bg` (page), `--site-surface` (controls and
overlays only), `--site-bg-subtle` (hover fill, picture placeholder; `--site-surface-hover`
is the same value), `--site-border` (every rule and control border), `--site-text` (ink),
`--site-text-muted`, `--site-accent` (= ink) and `--site-accent-fg`, `--site-danger`,
`--site-success`, radii `--site-radius` 8px and `--site-radius-sm` 4px (`--site-control-radius`
8px), and `--chrome-flat` / `--chrome-1`…`-6` for the chrome. **Deleted (T3, Appendix A):**
every glass, jelly, arc and shadow token, `--site-surface-opaque` (use `--site-surface`),
`--site-border-bright` (use `--site-text`), `--site-text-dim` (use `--site-text-muted`),
`--site-accent-dim` (use `--site-bg-subtle`); there are no shadow tokens (T4: the only
shadows are the globe's and an overlay's, `0 8px 24px rgba(0,0,0,.12)`, Night `.5`).
`lib/__tests__/steel-flat.test.ts` fails on any reference. Do not introduce a lighter grey
for text (T1).

**Type (section 3; `app/styles/steel-type.css`).** `t-title` 28/1.1 600 -0.025em ·
`t-heading` 17/1.3 600 -0.01em · `t-body` 14/1.45 400 · `t-post` 15/1.5 400 · `t-prose`
16/1.6 400 · `t-label` 13/1.3 600 muted · `t-meta` 12/1.3 mono 400 muted. Weights 400, 500
(controls), 600, never 700 or above (Y1); no letterspaced capitals (Y2); links inside
running text are underlined, navigation words are not (Y3).

**Surfaces (section 5).** Content sits directly on `--site-bg`; a list is rows on
`border-bottom: 1px solid var(--site-border)`; columns are divided by a 1px vertical rule;
pictures and placeholders are `--site-bg-subtle` with a 1px border and 8px radius. An
overlay (menu, dialog, popover) is the only raised surface: `--site-surface`, 1px border,
8px radius, the overlay shadow, **no backdrop blur**; the scrim behind a dialog is
`--site-bg` at 80%. Controls (section 6) are 8px radius, 1px border, 500 weight, 14px
text, 36px high (44px on touch). **No `backdrop-filter`, `filter`, gradient, `mix-blend-mode`
or `mask` on any site-tier element (B2)** — `steel-flat.test.ts` enforces the first three, with a
named, shrinking baseline of files that later phases rewrite. No `corner-shape` squircle on
the site tier (plain 8px and 4px arcs); the games and apps keep theirs inside `html.app-route`.

**Focus (K10):** `outline: 2px solid var(--site-text); outline-offset: 2px` on every
focusable element, text fields included. **Motion (section 11):** hover and press fills 90
ms, tab underline and toggle slide 140 ms, chrome activation 280 ms, globe 360 ms, overlay
160 ms opacity with no scale or slide; nothing else animates — no page entrances, list
staggers, hover lifts, springs, parallax or shimmer. Route changes swap content with no
transition.

**What phase 6 deleted (plan 15.3).** The radial shell and the liquid globe (`components/radial/`),
the eversion (`lib/eversion/`), the jelly runtime (`lib/jelly/`, `lib/liquid/`), the WebAssembly
kernels (`wasm/`, `lib/wasm/`), the glass/jelly/arc stylesheets, the page entrances
(`lib/page-transition.ts`, the `u-reveal` and `page-enter` rules) and the settings that only
configured them (electric arcs, navigation transition, eversion level, always-evert, desktop
navigation mode) are gone. Do not bring them back, and do not add a consumer of what is left.
**Kept on purpose (owner, G5a):** `lib/dough.ts`, `lib/fluid.ts` and `lib/trackball.ts`, the
physics the chrome globe (`lib/globe/`, `lib/chrome/`, `components/shell/`) runs on. The globe's
idle drift is the one ambient motion; the "Globe motion: On / Still" setting (Appearance) stamps
`html[data-jelly-motion='still']`, which `lib/globe/view.ts` and the games' ambient canvases read
(`motionStill()` in `lib/appearance/prefs.ts`). Phase 7 removed the dead names (`data-jelly*`
other than `data-jelly-motion`, `u-reveal`, the `Reveal` wrappers) and renamed the `glass-*` role
classes to the S6 `surface-*` names. The user-theme and
accent-preset systems (`lib/themes`, `lib/appearance.ts`) still write `--site-*` overrides;
whether they survive two fixed editions is an owner decision.

**Layout (plan section 9):** phone one column and the globe the only fixed
element; desktop sidebar 220px · content · margin 320px, capped at 1240px. Full-screen games and apps are outside the shell and keep their own
look (L8): `components/shared/app-theme.css` carries the literal palette the app tier read
from the old site tokens, so a change to a site token never moves an app.

**iOS Safari bars (never bring the coloured bands back):** iOS 26 Safari fills the
strips behind its status bar and floating tab bar from any `position: fixed` / sticky
layer at a screen edge, as one flat band. So: no `theme-color` on iOS, no full-viewport
fixed decoration (hide it on `html.ios-webkit`; the root carries the flat `--site-bg`
ground), and nothing pinned flush to the top or bottom (the phone shell has no fixed header, and
the docked globe floats 18px off the bottom edge). `lib/__tests__/ios-edge-contract.test.ts`
asserts the invariants and ratchets any new edge-pinned layer; `pnpm audit:pages` finds the
rest in a real browser. Both are described in
[`docs/page-consistency.md`](docs/page-consistency.md) §"How consistency is enforced".

**Performance (plan section 13).** The shell renders complete with scripting off; the only
script attached to it is the chrome renderer, loaded at idle. The site tier creates exactly
one WebGL context (the chrome renderer) and no worker, `MutationObserver` or decorative
`ResizeObserver`, and no `requestAnimationFrame` callback is pending at rest (B3). Fonts are
Geist and Geist Mono only, self-hosted. **The site-tier CSS gets smaller in every phase (B5):**
the ledger in section 17 of the plan records the built `site-tier-*.css` and the critical-path
JavaScript for `/` before phase 1 and after each phase; `pnpm -s exec tsx
scripts/check-bundle-budget.ts` must pass.  The one ambient clock is the chrome globe's idle drift (a 15 Hz tick, 7 on
handhelds), bounded by `testing/e2e/steel-rest.mjs`.

## Runtime & deploy reality (summary — details in docs/architecture.md)

Production is Docker Compose on a VPS behind Apache/Cloudflare — **hybrid
runtime**: Node runs web SSR + all realtime hubs + the ladder/homes/jobs
workers, and the `jobs` worker also hosts the Discord bot (`server/discord-bot/`,
on whenever a bot token is set); **Go** runs only `status` and `assets`. Every
Go worker (streak-saver, recap, doctrine, RMHark bot, vibe thumbnails, the
Discord bot) was ported to `jobs` and the Go copies, the `supervisor` that ran
them and its container are deleted (D3; `deploy.sh` removes a leftover
supervisor container before `up`, so two bots never share the token; the slim
Node image carries Chromium for the thumbnails). The old full-Go gateway/hub
topology (and its Helm/k3s charts) was **removed** in the rewrite — the Node
hubs are the realtime tier.

Deploys: push to `main` → GitHub Actions builds the two images (native ARM64)
from one Dockerfile + pushes them to GHCR → an HMAC-signed request wakes the VPS
webhook listener (`webhook-server.cjs`) → `./deploy.sh production <sha>` pulls
those images → prisma migrate → blue/green web hotswap (port 7005/7015 flip).

Core CI workflows include `web-ci.yml` (typecheck, lint, tests, build, production
dependency audit, integration suite — **all blocking**), `epic-tests.yml` (the epic content-build
suite, path-filtered to `scripts/epic/**`), `go-microservices.yml` (Bazel test),
`senior-review.yml` (LLM review gate), `deploy.yml`, `synthetic-perf.yml`, `candidate-image.yml` (native image smoke),
`build-cache.yml` (independent reusable-stage maintenance),
and the build/deploy guards `build-vibe-packages`,
`compose-validate`, `prisma` (validate + migrate-status jobs). Run the core
checks locally before opening a pull request. Which suite runs where, and what
gates a deploy:
[`docs/testing.md`](docs/testing.md) §CI.

## Trust order for conflicting information

Code > `docker-compose.yml` + `deploy.sh` (runtime truth) > root README /
this file > `docs/codebase-overview.md` > older docs. Docs known to be stale
are flagged in [`docs/README.md`](docs/README.md). Notably: anything claiming
Next.js, PM2, or a repo-root `specs/` directory (deleted) is outdated.
