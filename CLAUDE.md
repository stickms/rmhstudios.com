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
| `hooks/`       | Shared hooks (`useReducedMotion`, `useCelebration`, `useFeedSSE`, `useGlassLight`, `usePointerParallax`, …).                                                          | `lib/CLAUDE.md`                                  |
| `prisma/`      | `schema.prisma` (252 models, 66 enums, ~6k lines) + migrations.                                                                                                       | `lib/CLAUDE.md`                                  |
| `locales/`     | 16 shipped locales × 67 registered namespaces; `en` is authoritative. (More directories exist on disk than are wired up — see the i18n note below.)                   | `lib/CLAUDE.md` §i18n                            |
| `data/`        | Static JSON (RMHBox content packs, library metadata).                                                                                                                 | —                                                |
| `public/`      | Static assets, `robots.txt`, `manifest.webmanifest`.                                                                                                                  | —                                                |
| `scripts/`     | Seeding, i18n pipeline, OG/icon generation, ladder pipeline, news pipeline, epic build.                                                                               | `docs/README.md`                                 |
| `deploy/`      | Apache vhosts, blue/green hotswap, DB backups, Terraform (DNS), runbooks.                                                                                             | [`docs/architecture.md`](docs/architecture.md)   |
| `docs/`        | Reference docs, design docs, plans, runbooks — also **published** as a Sphinx/MyST Read the Docs site in 16 languages.                                                | [`docs/README.md`](docs/README.md)               |
| `testing/`     | Vitest tests (RMHBox phases). Most other suites are colocated under `lib/`.                                                                                           | `lib/CLAUDE.md` §Testing                         |
| `cli/`         | `rmhcode` CLI (wraps Claude Code; publishes User Builds).                                                                                                             | —                                                |

## Commands

```bash
pnpm install                 # postinstall runs prisma generate
pnpm db:push                 # apply schema to local Postgres (dev)
pnpm dev                     # Vite (7005) + socket/rmhbox/rmhtube hubs + ladder/homes/jobs workers
pnpm exec tsc --noEmit       # typecheck
pnpm lint                    # eslint (jsx-a11y at warn — add no new warnings)
pnpm format                  # prettier
pnpm exec vitest run         # main test suite (includes the UI consistency gate)
pnpm build                   # vibe-packages → vite build → esbuild 6 server bundles
pnpm i18n:extract            # after adding t() strings
make gazelle && make test    # Go: regenerate BUILD files, run Bazel tests
```

Local ports: web 7005 · socket-server 7001 · rmhtube 7003 · rmhbox 7676 ·
status 7008 · assets 7007. Env: see `.env.example`; minimum is
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

## Cross-cutting conventions (the ones agents break most)

1. **Routing:** add files under `app/routes/`; the route tree regenerates on
   dev/build. Pages under `_site/` get the radial shell; top-level routes are
   full-screen (games, login, legal — intentional). Never edit
   `routeTree.gen.ts`.
2. **Server-only code:** `lib/**/*.server.ts` is stubbed out of the client
   bundle by a Vite plugin. Never import `.server` modules from client code.
3. **API routes:** `.ts` files with `server.handlers.{GET,POST,...}`. Order:
   session check (`auth.api.getSession({ headers: request.headers })`) →
   `rateLimit(getClientIp(request), …)` → zod `safeParse` →
   `Response.json(...)`. Admin = `(session.user as any).isAdmin`.
4. **Design language:** every color/radius/shadow/font via `--site-*` token
   utilities (`bg-site-surface`, `rounded-site`, …) so every theme works;
   full-screen apps use the parallel `--app-*` contract in
   `components/shared/app-theme.css`. Use `components/ui/` primitives,
   `PageLayout`, `lib/motion.ts` tokens, lucide icons, sonner toasts. **Before
   any UI commit** read [`docs/design-language.md`](docs/design-language.md)
   §0 (the definition of done) and the checklist in
   [`docs/page-consistency.md`](docs/page-consistency.md). Part of this is
   CI-enforced — `lib/__tests__/design-consistency.test.ts` fails the build on
   hand-rolled tab strips and stray active-underline markers.
5. **i18n:** all user-facing strings through `t("key", { defaultValue })`;
   then `pnpm i18n:extract`. English is authoritative. A **new namespace must
   be added to `NAMESPACES` in `lib/i18n/config.ts`** — a JSON file dropped
   into `locales/en/` without that entry is never loaded, and the UI silently
   falls back to its `defaultValue`s.
6. **SEO:** per-route `head()`; `buildMeta`/`buildCanonical` from `@/lib/seo`;
   JSON-LD only via `jsonLdScript()` + builders from `@/lib/schema`.
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

CI is 10 workflows: `web-ci.yml` (typecheck, lint, tests, build, production
dependency audit), `go-microservices.yml` (Bazel test), `senior-review.yml`
(LLM review gate), `deploy.yml`, `synthetic-perf.yml`, `i18n-translate.yml`,
and the build/deploy guards `build-vibe-packages`, `compose-validate`,
`prisma-validate`, `prisma-migrate-status`. Run the core checks locally before
opening a pull request.

## Trust order for conflicting information

Code > `docker-compose.yml` + `deploy.sh` (runtime truth) > root README /
this file > `docs/codebase-overview.md` > older docs. Docs known to be stale
are flagged in [`docs/README.md`](docs/README.md). Notably: anything claiming
Next.js, PM2, or a repo-root `specs/` directory (deleted) is outdated.
