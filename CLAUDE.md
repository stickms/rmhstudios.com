# CLAUDE.md — rmhstudios.com

Guidance for coding agents working in this repository. Start here; each major
directory has its own `CLAUDE.md` with depth, and `docs/` holds the reference
docs. `AGENTS.md` mirrors this file for non-Claude tooling.

## What this is

A single web platform: a social feed (RMHarks), 18 browser games (several
multiplayer/3D), 12 full apps (RMHTube, RMHMusic, RMHType, RMHStudy, RMHCode,
RMHLadder, …), a blog/news/library system, a coin economy with Stripe
memberships, and a scoped developer API — served by a React SSR tier with Node
realtime hubs and a Go worker fleet behind it. The catalogs in `lib/games.ts`
and `lib/apps.ts` are the single source of truth for what exists.

## Stack of record

**TanStack Start + Vite 8 + React 19 + Nitro SSR.** This is **NOT Next.js**
(some old docs/specs say otherwise — they are stale). TypeScript strict,
Tailwind CSS v4, framer-motion, Zustand + React Query, PostgreSQL + Prisma 7
(`@prisma/adapter-pg`), Better Auth (Discord/Google/GitHub + passkeys +
Stripe), Socket.io Node hubs, Go microservices built with Bazel, i18next (16
locales, RTL for `ar`/`ur`). Node ≥24.18, pnpm workspace.

## Repository map

| Path           | What                                                                                                                                                                  | Details                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `app/`         | TanStack Start routes: pages, API routes, `globals.css` (the `--site-*` theme tokens), router. `routeTree.gen.ts` is GENERATED — never edit.                          | [`app/CLAUDE.md`](app/CLAUDE.md)                 |
| `components/`  | React components by feature; `ui/` = shared primitives; `feed/PageLayout.tsx` = canonical page wrapper; `shared/` = the full-screen app tier (`--app-*`, `AppShell`). | [`components/CLAUDE.md`](components/CLAUDE.md)   |
| `lib/`         | Shared logic: auth, prisma, feed, economy, i18n, motion tokens, per-game logic, `.server.ts` server-only modules.                                                     | [`lib/CLAUDE.md`](lib/CLAUDE.md)                 |
| `server/`      | **Node** service tier: web SSR plus socket-server (7001), rmhbox (7676), rmhtube (7003), and the ladder-worker / homes-worker / jobs (pg-boss) workers.               | [`server/CLAUDE.md`](server/CLAUDE.md)           |
| `go-services/` | **Go** microservice fleet (Bazel + gazelle): `supervisor`, `status`, `assets` run in prod; the gateway + Go hubs were removed (rewrite §5.2).                         | [`go-services/CLAUDE.md`](go-services/CLAUDE.md) |
| `stores/`      | Site-level Zustand stores (theme, locale, feed, user display).                                                                                                        | `lib/CLAUDE.md`                                  |
| `hooks/`       | Shared hooks (`useReducedMotion`, `useCelebration`, `useFeedSSE`, `useFluidPress`/`useFluidDrag`, `useLiquidBackground`, `useReveal`, …).                             | `lib/CLAUDE.md`                                  |
| `prisma/`      | `schema.prisma` (252 models, 66 enums, ~6k lines) + migrations.                                                                                                       | `lib/CLAUDE.md`                                  |
| `locales/`     | 16 shipped locales × 67 registered namespaces; `en` is authoritative. (More directories exist on disk than are wired up — see the i18n note below.)                   | `lib/CLAUDE.md` §i18n                            |
| `data/`        | Static JSON (RMHBox content packs, library metadata).                                                                                                                 | —                                                |
| `public/`      | Static assets, `robots.txt`, `manifest.webmanifest`.                                                                                                                  | —                                                |
| `scripts/`     | Seeding, i18n pipeline, OG/icon generation, ladder pipeline, news pipeline, epic build.                                                                               | `docs/README.md`                                 |
| `deploy/`      | Apache vhosts, blue/green hotswap, DB backups, Terraform (DNS), runbooks.                                                                                             | [`docs/architecture.md`](docs/architecture.md)   |
| `docs/`        | Reference docs, design docs, plans, runbooks — also **published** as a Sphinx/MyST Read the Docs site in 16 languages.                                                | [`docs/README.md`](docs/README.md)               |
| `testing/`     | RMHBox phase tests + shared fixtures (`factories.ts`) + the unwired browser smoke. Most other suites are colocated under `lib/`; discovery is a glob, nothing to register. | [`docs/testing.md`](docs/testing.md)             |
| `cli/`         | `rmhcode` CLI (wraps Claude Code; publishes User Builds).                                                                                                             | —                                                |

## Commands

```bash
pnpm install                 # postinstall runs prisma generate
pnpm db:push                 # apply schema to local Postgres (dev)
pnpm dev                     # Vite (7005) + socket/rmhbox/rmhtube hubs + ladder/homes/jobs workers
pnpm exec tsc --noEmit       # typecheck
pnpm lint                    # eslint (jsx-a11y at warn — add no new warnings)
pnpm format                  # prettier
pnpm test                    # main test suite (~37s; includes the UI consistency gate)
pnpm test:epic               # epic content-build suite (needs Chromium)
pnpm build                   # vibe-packages → vite build → esbuild 6 server bundles
pnpm i18n:extract            # after adding t() strings
pnpm check:consistency       # THE COMMIT GATE — run before every commit (see below)
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
for the rules CI already fails on (raw palette colours, hardcoded radii,
`transition-all`, dead `tailwindcss-animate` classes, hand-rolled tab strips) ·
the executable gates in `lib/__tests__/` that are the **authority** for
`docs/design-language.md` §13 · eslint on the changed files · `tsc --noEmit` ·
the generated-docs freshness checks. Then it prints the handful of things no
script can check — the three themes, the role-less switcher that is really a
tab strip — because a green gate means you did not regress an enforced rule,
never that the change looks right.

It is wired to fire on its own, so "I forgot" is not a failure mode:

- **Agent sessions:** `.claude/settings.json` runs
  `.claude/hooks/commit-gate.sh` before any Bash `git commit`. A failing gate
  blocks the commit and hands the reasons back to the agent to fix. (Both files
  are checked in on purpose — `.gitignore` keeps the rest of `.claude/` local.
  Claude Code asks you to trust project hooks the first time they run.)
- **Humans:** `pnpm hooks:install` once per clone points `core.hooksPath` at
  `.githooks/`, whose `pre-commit` runs the same gate (skipping it if an agent
  already gated that exact staged tree).

Two rules about the gate itself:

1. **A failing gate is fixed, not bypassed.** `--no-verify` and
   `RMH_SKIP_COMMIT_GATE=1` exist for emergencies and leave a trace — if you
   use one, say why in the commit message.
2. **If a rule is genuinely wrong for your change, change the rule** in the
   same commit (the allowlists in `lib/__tests__/design-consistency.test.ts`
   are documented and one-directional — entries come out, they do not go in),
   and say so in the message. Silently working around a gate is how the
   inconsistency it prevents comes back.

Every commit also carries the smaller invariants: no secrets, no hand-edited
generated files (`app/routeTree.gen.ts`, `lib/i18n/resources.<locale>.ts`), no
new type or lint warnings versus the base branch, and a message that explains
*why*.

## Cross-cutting conventions (the ones agents break most)

1. **Routing:** add files under `app/routes/`; the route tree regenerates on
   dev/build. Pages under `_site/` get the radial shell; top-level routes are
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
4. **Design language:** every color/radius/shadow/font via `--site-*` token
   utilities (`bg-site-surface`, `rounded-site`, …) so every theme works;
   full-screen apps use the parallel `--app-*` contract in
   `components/shared/app-theme.css`. Use `components/ui/` primitives,
   `PageLayout`, `lib/motion.ts` tokens, lucide icons, sonner toasts. Surfaces
   take a **glass elevation class by role** (`.glass-fill` repeated cards ·
   `.glass-pane` singular panels · `.glass-chrome` sticky chrome ·
   `.glass-overlay` floating UI · `.glass-inset` fields), not a hand-rolled
   `bg-site-surface border rounded-site` box — the class is what carries the
   material and what the degradation tiers switch off. **Nothing tracks the
   cursor** (retired 2026-08-01) and nothing writes a custom property to
   `<html>` per frame. The statement of the language is
   [`design.md`](design.md) at the root; **before any UI commit** read
   [`docs/design-language.md`](docs/design-language.md) §0 (the definition of
   done) and the checklist in
   [`docs/page-consistency.md`](docs/page-consistency.md). Part of this is
   CI-enforced — `lib/__tests__/design-consistency.test.ts` fails the build on
   hand-rolled tab strips, raw palette colours, hardcoded radii, floating UI
   below L4, `transition-all`, and `tailwindcss-animate` classes (that plugin
   is not installed, so they compile to nothing) — and `pnpm check:consistency`
   is how you find that out **before** you commit rather than in CI.
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
7. **Accessibility:** Radix/native primitives, focus-visible rings are
   global, skip link exists, respect `useReducedMotion`. Test `light` and
   `high-contrast` themes.
8. **Security:** zod-validate all input; rate-limit writes/AI/uploads;
   user-supplied URL fetches through `lib/ssrf-guard.server`; CSP/security
   headers live in `deploy/apache/rmhstudios.conf` (the production front door;
   the Helm/Traefik path was removed in the rewrite — design §5.2).
9. **Go code:** config via `pkg/config`, logging via `pkg/log`, sessions
   validated via `pkg/auth` against the shared `session` table. Run
   `make gazelle` after adding files.
10. **Quality bar (from CONTRIBUTING.md):** don't add new type/lint warnings
    relative to the base branch; keep commits focused; never commit secrets.
    Every commit passes `pnpm check:consistency` — see the commit gate above.

## Runtime & deploy reality (summary — details in docs/architecture.md)

Production is Docker Compose on a VPS behind Apache/Cloudflare — **hybrid
runtime**: Node runs web SSR + all realtime hubs + the ladder/homes/jobs
workers; **Go** runs the six background workers as one `supervisor` process
(`doctrine-worker`, `vibe-worker`, `recap`, `discord-bot`, `bot-worker`,
`streak-saver`), plus `status` and `assets`. The old full-Go gateway/hub
topology (and its Helm/k3s charts) was **removed** in the rewrite — the Node
hubs are the realtime tier.

Deploys: push to `main` → GitHub Actions builds the two images (native ARM64)
from one Dockerfile + pushes them to GHCR → an HMAC-signed request wakes the VPS
webhook listener (`webhook-server.cjs`) → `./deploy.sh production <sha>` pulls
those images → prisma migrate → blue/green web hotswap (port 7005/7015 flip).

CI is 11 workflows: `web-ci.yml` (typecheck, lint, tests, build, production
dependency audit — **all blocking**), `epic-tests.yml` (the epic content-build
suite, path-filtered to `scripts/epic/**`), `go-microservices.yml` (Bazel test),
`senior-review.yml` (LLM review gate), `deploy.yml`, `synthetic-perf.yml`,
`i18n-translate.yml`, and the build/deploy guards `build-vibe-packages`,
`compose-validate`, `prisma-validate`, `prisma-migrate-status`. Run the core
checks locally before opening a pull request. Which suite runs where, and why
the deploy's own test step is advisory while the PR's is not:
[`docs/testing.md`](docs/testing.md) §CI.

## Trust order for conflicting information

Code > `docker-compose.yml` + `deploy.sh` (runtime truth) > root README /
this file > `docs/codebase-overview.md` > older docs. Docs known to be stale
are flagged in [`docs/README.md`](docs/README.md). Notably: anything claiming
Next.js, PM2, or a repo-root `specs/` directory (deleted) is outdated.
