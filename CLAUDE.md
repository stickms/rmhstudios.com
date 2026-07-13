# CLAUDE.md — rmhstudios.com

Guidance for coding agents working in this repository. Start here; each major
directory has its own `CLAUDE.md` with depth, and `docs/` holds the reference
docs. `AGENTS.md` mirrors this file for non-Claude tooling.

## What this is

A single web platform: a social feed (RMHarks), ~20 browser games (several
multiplayer/3D), full apps (RMHTube, RMHMusic, RMHType, RMHStudy, RMHCode,
RMHLadder), a blog/news/library system, a coin economy with Stripe
memberships, and a scoped developer API — served by a React SSR tier with
Node realtime hubs and a Go worker fleet behind it.

## Stack of record

**TanStack Start + Vite 8 + React 19 + Nitro SSR.** This is **NOT Next.js**
(some old docs/specs say otherwise — they are stale). TypeScript strict,
Tailwind CSS v4, framer-motion, Zustand + React Query, PostgreSQL + Prisma 7
(`@prisma/adapter-pg`), Better Auth (Discord/Google/GitHub + passkeys +
Stripe), Socket.io Node hubs, Go microservices built with Bazel, i18next (32
locales, RTL for ar/ur/fa).

## Repository map

| Path | What | Details |
|---|---|---|
| `app/` | TanStack Start routes: pages, API routes, `globals.css` (theme tokens: 3 base + 3 curated themes + accent presets), router. `routeTree.gen.ts` is GENERATED — never edit. | [`app/CLAUDE.md`](app/CLAUDE.md) |
| `components/` | React components by feature; `ui/` = shared primitives; `feed/PageLayout.tsx` = canonical page wrapper. | [`components/CLAUDE.md`](components/CLAUDE.md) |
| `lib/` | Shared logic: auth, prisma, feed, economy, i18n, per-game logic, `.server.ts` server-only modules. | [`lib/CLAUDE.md`](lib/CLAUDE.md) |
| `server/` | **Node** service tier: socket-server (7001), rmhbox (7676), rmhtube (7003), ladder-worker; plus fallback sources for workers now run in Go. | [`server/CLAUDE.md`](server/CLAUDE.md) |
| `go-services/` | **Go** microservice fleet (Bazel + gazelle): supervisor/status/assets run in prod; gateway + hubs are the future topology. | [`go-services/CLAUDE.md`](go-services/CLAUDE.md) |
| `stores/` | Site-level Zustand stores (theme, locale, feed, user display). | `lib/CLAUDE.md` |
| `hooks/` | Shared hooks (`useReducedMotion`, `useCelebration`, `useFeedSSE`, …). | `lib/CLAUDE.md` |
| `prisma/` | `schema.prisma` (~199 models) + migrations. | `lib/CLAUDE.md` |
| `locales/` | 32 locales × 66 namespaces; `en` is authoritative. | `lib/CLAUDE.md` §i18n |
| `data/` | Static JSON (RMHBox content packs, library metadata). | — |
| `public/` | Static assets, `robots.txt`, `manifest.webmanifest`. | — |
| `scripts/` | Seeding, i18n pipeline, OG/icon generation, ladder pipeline, news pipeline, epic build. | `docs/README.md` |
| `deploy/` | Apache vhosts, blue/green hotswap, Helm charts, Terraform, runbooks. | [`docs/architecture.md`](docs/architecture.md) |
| `docs/` | Reference docs, design docs, plans, runbooks. | [`docs/README.md`](docs/README.md) |
| `testing/` | Vitest tests (RMHBox phases). | `lib/CLAUDE.md` §Testing |
| `cli/` | `rmhcode` CLI (wraps Claude Code; publishes User Builds). | — |
| `specs/` | Legacy AI-agent game specs (some stale — see docs/README.md). | — |

## Commands

```bash
pnpm install                 # postinstall runs prisma generate
pnpm db:push                 # apply schema to local Postgres (dev)
pnpm dev                     # Vite (7005) + socket/rmhbox/rmhtube hubs + ladder-worker
pnpm exec tsc --noEmit       # typecheck
pnpm lint                    # eslint (jsx-a11y at warn — add no new warnings)
pnpm format                  # prettier
pnpm exec vitest run         # main test suite
pnpm build                   # vibe-packages → vite build → esbuild 4 server bundles
pnpm i18n:extract            # after adding t() strings
make gazelle && make test    # Go: regenerate BUILD files, run Bazel tests
```

Local ports: web 7005 · socket-server 7001 · rmhtube 7003 · rmhbox 7676 ·
status 7008 · assets 7007. Env: see `.env.example`; minimum is
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

## Cross-cutting conventions (the ones agents break most)

1. **Routing:** add files under `app/routes/`; the route tree regenerates on
   dev/build. Pages under `_site/` get the sidebar shell; top-level routes
   are full-screen (games, login, legal — intentional). Never edit
   `routeTree.gen.ts`.
2. **Server-only code:** `lib/**/*.server.ts` is stubbed out of the client
   bundle by a Vite plugin. Never import `.server` modules from client code.
3. **API routes:** `.ts` files with `server.handlers.{GET,POST,...}`. Order:
   session check (`auth.api.getSession({ headers: request.headers })`) →
   `rateLimit(getClientIp(request), …)` → zod `safeParse` →
   `Response.json(...)`. Admin = `(session.user as any).isAdmin`.
4. **Design language:** every color/radius/shadow/font via `--site-*` token
   utilities (`bg-site-surface`, `rounded-site`, …) so every theme works.
   Use `components/ui/` primitives, `PageLayout`, lucide icons, sonner
   toasts. See [`docs/design-language.md`](docs/design-language.md) and the
   checklist in [`docs/page-consistency.md`](docs/page-consistency.md).
5. **i18n:** all user-facing strings through `t("key", { defaultValue })`;
   then `pnpm i18n:extract`. English is authoritative.
6. **SEO:** per-route `head()`; `buildMeta`/`buildCanonical` from `@/lib/seo`;
   JSON-LD only via `jsonLdScript()` + builders from `@/lib/schema`.
7. **Accessibility:** Radix/native primitives, focus-visible rings are
   global, skip link exists, respect `useReducedMotion`. Test `light` and
   `high-contrast` themes.
8. **Security:** zod-validate all input; rate-limit writes/AI/uploads;
   user-supplied URL fetches through `lib/ssrf-guard.server`; CSP/security
   headers must change in BOTH `deploy/apache/rmhstudios.conf` and the Helm
   Traefik middleware.
9. **Go code:** config via `pkg/config`, logging via `pkg/log`, sessions
   validated via `pkg/auth` against the shared `session` table. Run
   `make gazelle` after adding files.
10. **Quality bar (from CONTRIBUTING.md):** don't add new type/lint warnings
    relative to the base branch; keep commits focused; never commit secrets.

## Runtime & deploy reality (summary — details in docs/architecture.md)

Production is Docker Compose on a VPS behind Apache/Cloudflare — **hybrid
runtime**: Node runs web SSR + all realtime hubs + ladder-worker; **Go** runs
the five background workers (as one `supervisor` process), `status`, and
`assets`. The Go gateway/hub topology exists (Helm/k3s) but is not the
production request path. Deploys: push to `main` → GitHub Actions SSHes to
the VPS → `./deploy.sh production` → two images built from one Dockerfile →
prisma migrate → blue/green web hotswap (port 7005/7015 flip). CI:
`go-microservices.yml` (Bazel + e2e + helm), `web-ci.yml` (typecheck, lint,
tests, build, and production dependency audit), `codeql.yml` (JS/TS + Go SAST),
and `senior-review.yml` (LLM review gate). Run the same checks locally before
opening a pull request.

## Trust order for conflicting information

Code > `docker-compose.yml` + `deploy.sh` (runtime truth) > root README /
this file > `docs/codebase-overview.md` > older docs. Docs known to be stale
are flagged in [`docs/README.md`](docs/README.md). Notably: anything claiming
Next.js or PM2 is outdated.
