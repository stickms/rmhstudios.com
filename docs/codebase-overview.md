# Codebase Overview — rmhstudios.com

A single, ambitious web platform: a social feed (RMHarks), ~20 browser games
(several multiplayer/3D), full apps (RMHTube, RMHMusic, RMHType, RMHStudy,
RMHCode, RMHLadder), a blog/news/library system, a coin economy with Stripe
memberships, and a scoped developer API — served by a React SSR tier with Node
realtime hubs (Socket.IO) and a Go worker fleet behind it.

> **Stack of record:** TanStack Start + Vite 8 + React 19 + Nitro SSR. (This
> project is **not** Next.js — earlier revisions of this doc said so; that is
> stale.)

> **Companion docs:** agent guides live at [`/CLAUDE.md`](../CLAUDE.md) and in
> each major directory (`app/`, `components/`, `lib/`, `server/`,
> `go-services/`). Runtime topology & deploy pipeline:
> [`architecture.md`](./architecture.md). Visual system:
> [`design-language.md`](./design-language.md) +
> [`page-consistency.md`](./page-consistency.md). Docs index:
> [`README.md`](./README.md).

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Framework / router | [TanStack Start](https://tanstack.com/start) (file-based routing) on [Vite 8](https://vite.dev) |
| SSR runtime | [Nitro](https://nitro.build) |
| Language | TypeScript (strict) |
| UI | React 19, Tailwind CSS v4, Framer Motion, Radix primitives |
| State / data | Zustand, TanStack React Query |
| DB / ORM | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Better Auth (email/password + Discord/GitHub/Google), Stripe via `@better-auth/stripe` |
| Realtime | Socket.io (Node) hubs; a Go worker fleet (Bazel) for background jobs / status / assets |
| 3D / audio / canvas | React Three Fiber + Rapier, Pixi.js, Howler, Tone.js |
| i18n | i18next / react-i18next — 32 locales, RTL for ar/ur/fa |
| Media / OG | satori + `@resvg/resvg-js` (dynamic OG cards), sharp |

---

## 2. Repository layout

```
app/                TanStack Start routes (file-based)
  routes/
    __root.tsx      Root document: head, theme/locale bootstrap, error + 404 boundaries,
                    client error reporting + Core Web Vitals (RUM), site-wide JSON-LD
    _site.tsx       Pathless layout for the public site (sidebar, mobile nav, <main> landmark)
    _site/          Public pages: feed (index), profiles (u/$userid), messages, explore,
                    search, achievements, ranked, wallet, admin, developer docs, …
    api/            Server routes (~415 files): feed, auth, games, AI, og, rum, client-error, …
    <game>.tsx      Full-screen games/apps (altair, rmhbox, velum2099, slice-it, …)
    sitemap[.]xml.ts  Dynamic sitemap
  globals.css       Theme tokens (7 themes + accent presets; liquid-glass default), reduced-motion gate
  router.tsx        Router config (intent preloading), routeTree.gen.ts (generated)
components/          React components by feature (~860 files); ui/ holds shared primitives
lib/                Utilities, schemas, server helpers (~950 files); seo.ts, schema.ts, rum.ts,
                    client-errors.ts, rate-limit.ts, auth.ts, prisma.server.ts, i18n/
server/             Node service tier (socket-server + rmhmusic, rmhbox, rmhtube, ladder-worker,
                    homes-worker, jobs, nitro/ plugins, shared/) — see §3
go-services/        Go worker fleet: supervisor + status + assets (Bazel + gazelle) — see §4
stores/             Zustand stores (theme, locale, feed, …)
hooks/              Custom hooks (useReducedMotion, useCelebration, useIsMobile, …)
prisma/             schema.prisma (234 models) + migrations
data/               Static JSON (RMHBox content packs, library metadata)
scripts/            One-off scripts (seeding, i18n, OG/icon generation, coverage, …)
public/             Static assets (favicon, manifest, og/icons, robots.txt)
deploy/             Apache vhosts, blue/green hotswap, Postgres/backups, Terraform DNS, runbooks
testing/            Vitest tests (RMHBox phases, game logic, auth)
docs/               This overview, the improvement plan, per-feature design docs, runbooks
locales/            32 locale dirs × 66 namespaces (en is the reference)
```

---

## 3. Runtime & ports (local `pnpm dev`)

`pnpm dev` runs Vite (the SSR app) plus the Node WebSocket servers concurrently.

| Service | Port | Role |
|---|---|---|
| web (Vite/Nitro) | 7005 | React SSR app + API routes |
| socket-server | 7001 | Games realtime hub (Slice It!, Neon Driftway, …) — also hosts rmhmusic |
| rmhtube | 7003 | Watch-together |
| rmhbox | 7676 | Party-game hub |
| ladder-worker | — | RMHLadder job-discovery cron (`lib/rmhladder` pipeline) |
| homes-worker | — | RMHHomes listings-scraper cron (`lib/homes`) |
| jobs | — | Durable async backbone (pg-boss): progression, event reminders, weekly digest |

In production these same Node services serve traffic directly behind Apache —
there is no Go edge/gateway in front of them. See
[`architecture.md`](./architecture.md) for the production picture.

---

## 4. Go microservice fleet (`go-services/`)

The backend service layer has a Go implementation (built with Bazel +
gazelle). **Production today is a hybrid:** Go runs the background workers
(one `supervisor` process), `status`, and `assets`; Node runs the web SSR and
every realtime hub. The old full-Go realtime topology (a `gateway` fronting Go
`gamehub`/`rmhbox`/`rmhtube`/`rmhmusic` hubs with a Redis backplane, plus its
Helm/k3s charts) was **removed in the rewrite** — it never served production.
Details: [`architecture.md`](./architecture.md) and
[`../go-services/CLAUDE.md`](../go-services/CLAUDE.md).

| Service | Port | Role |
|---|---|---|
| `supervisor` | 9090 (metrics) | Runs six background workers as goroutines: discord-bot, recap, doctrine-worker, vibe-worker, bot-worker, streak-saver |
| `status` | 7008 | Standalone health dashboard (`/`, `/api/status`); survives outages |
| `assets` | 7007 | Range-aware S3/R2 asset streaming (`/library` `/music` `/models` `/sprites`) |

```bash
make gazelle        # regenerate Bazel BUILD files after adding Go files
make test           # bazel test //go-services/... (+ vitest)
make build          # bazel build //go-services/cmd/... + frontend bundle
```

In production the Go binaries ship from the root `Dockerfile`'s `go-builder`
stage (`go build ./cmd/...`), not Bazel; Bazel is the CI unit-test gate.

---

## 5. Cross-cutting conventions

- **Routing/data:** routes live in `app/routes`; `routeTree.gen.ts` is generated
  by the TanStack plugin on dev/build — **add a route file, then let a `vite dev`
  or build regenerate the tree** (there is no standalone CLI wired). API routes
  use `createFileRoute('/api/...')({ server: { handlers: { GET, POST } } })`.
- **Server-only code:** `*.server.ts(x)` files are stubbed out of the client
  bundle by a Vite plugin (`vite.config.ts`). Heavy client-only deps (three,
  monaco, pixi, tone, …) are externalized from the Nitro server bundle and
  manually chunked.
- **Head / SEO:** per-route `head()` returns `{ meta, links, scripts }`. Use
  `lib/seo.ts` (`buildMeta`, `buildCanonical`) and `lib/schema.ts` (JSON-LD
  builders). Site-wide Organization/WebSite JSON-LD is emitted from `__root`.
- **Errors & telemetry:** route `errorComponent`/`notFoundComponent` render
  `components/errors/*`; uncaught client errors and Core Web Vitals are beaconed
  to `/api/client-error` and `/api/rum` (see `lib/client-errors.ts`, `lib/rum.ts`).
- **Auth/validation:** `auth` from `lib/auth.ts`; validate API input with zod and
  rate-limit writes/AI/uploads via `lib/rate-limit.ts` (`rateLimit`, `getClientIp`).
- **i18n:** user-facing strings go through `t(...)`. Run `pnpm i18n:coverage` to
  see per-locale key coverage vs. `en`.
- **Theming/motion:** 7 themes (`.style-*` classes: default, light,
  high-contrast, graphite, liquid-glass, nocturne, sepia) plus accent presets,
  over CSS tokens in `globals.css` (`liquid-glass` is the default); a global
  `prefers-reduced-motion` gate is respected there and via the
  `useReducedMotion()` hook.
- **Accessibility:** `eslint-plugin-jsx-a11y` runs at "warn"; native/Radix
  primitives preferred; the site shell exposes a `<main>` landmark + skip link.

---

## 6. Build, test, deploy

```bash
pnpm install
pnpm db:push            # apply schema to a local Postgres
pnpm dev                # Vite + WS servers → http://localhost:7005
pnpm exec tsc --noEmit  # typecheck    pnpm lint    pnpm format
pnpm build              # Vite/Nitro build + esbuild bundles the WS servers
```

- **Web tier:** production is **Docker Compose** on a VPS (not PM2 — that claim
  is stale). Node runs web SSR + the realtime hubs + the ladder/homes/jobs
  workers; a blue/green `deploy/hotswap-web.sh` swaps the web container with a
  health-gated Apache port flip (7005 ⇄ 7015). Apache (behind Cloudflare TLS) is
  the only front door and sets security headers; a Nitro `security-headers`
  plugin adds defense-in-depth response headers. (The Helm/Traefik path was
  removed in the rewrite.)
- **Go tier:** Bazel unit-test gate in `.github/workflows/go-microservices.yml`
  (`bazelisk test --build_tests_only //go-services/...`); the old e2e + `helm
  lint` jobs were removed. Production binaries build via the root `Dockerfile`.
- **CI overall:** `web-ci.yml` gates the frontend (typecheck, lint, vitest,
  `build:frontend`, prod dependency audit); `typecheck-server.yml` and
  `vitest-coverage.yml` add server typecheck + coverage; `codeql.yml` runs SAST;
  `senior-review.yml` is an LLM review gate; plus ~40 granular
  lint/format/security/prisma/i18n workflows and Dependabot. See
  [`architecture.md`](./architecture.md) §4.

---

## 7. Where to look first

| I want to… | Start at |
|---|---|
| Understand the shell / global setup | `app/routes/__root.tsx`, `app/routes/_site.tsx`, `components/Providers.tsx` |
| Add a page | a new file under `app/routes/_site/` |
| Add an API endpoint | a new file under `app/routes/api/` (then regenerate the route tree) |
| Work on the feed | `components/feed/*`, `app/routes/api/rmharks.ts`, `lib/feed/*` |
| Work on a game | `app/routes/<game>.tsx` + `components/<game>/*` + `server/socket-server/*` (or `go-services/`) |
| Change theming | `app/globals.css`, `stores/themeStore.ts` |
| Understand priorities / open work | `docs/website-improvement-plan.md` |
