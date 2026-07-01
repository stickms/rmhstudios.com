# Codebase Overview — rmhstudios.com

A single, ambitious web platform: a social feed, ~20 browser games (several
multiplayer/3D), full apps (RMHTube, RMHMusic, RMHType, RMHStudy, RMHCode), a
blog/research system, a coin economy, and a scoped developer API — served by a
React SSR tier with a fleet of Go realtime microservices behind it.

> **Stack of record:** TanStack Start + Vite 8 + React 19 + Nitro SSR. (This
> project is **not** Next.js — earlier revisions of this doc said so; that is
> stale.)

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
| Realtime | Socket.io (Node) + a Go microservice fleet (Bazel) |
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
    api/            Server routes (~316 files): feed, auth, games, AI, og, rum, client-error, …
    <game>.tsx      Full-screen games/apps (altair, rmhbox, velum2099, slice-it, …)
    sitemap[.]xml.ts  Dynamic sitemap
  globals.css       Theme tokens (20+ themes), High-Contrast theme, reduced-motion gate
  router.tsx        Router config (intent preloading), routeTree.gen.ts (generated)
components/          React components by feature (~778 files); ui/ holds shared primitives
lib/                Utilities, schemas, server helpers (~748 files); seo.ts, schema.ts, rum.ts,
                    client-errors.ts, rate-limit.ts, auth.ts, prisma.server.ts, i18n/
server/             Node service entrypoints (socket-server, rmhbox, rmhtube, rmhmusic, shared/)
go-services/        Go port of the backend fleet (Bazel + gazelle) — see §4
stores/             Zustand stores (theme, locale, feed, …)
hooks/              Custom hooks (useReducedMotion, useCelebration, useIsMobile, …)
prisma/             schema.prisma + migrations
data/               Static game data (JSON)
scripts/            One-off scripts (seeding, i18n, OG/icon generation, coverage, …)
public/             Static assets (favicon, manifest, og/icons, robots.txt)
deploy/             Apache vhosts, Helm chart (Traefik), Docker bases, runbooks
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
| socket-server | 7001 | Games realtime hub (Slice It!, Neon Driftway, …) |
| rmhmusic | 7002 | Collaborative listening |
| rmhtube | 7003 | Watch-together |
| rmhbox | 7676 | Party-game hub |

In production these are fronted by the Go **gateway** (§4).

---

## 4. Go microservice fleet (`go-services/`)

The backend service layer is ported to Go (built with Bazel + gazelle). The
React SSR `web` tier stays on Node; everything behind it has a Go equivalent.
The Node services are preserved as reversible fallbacks.

| Service | Port | Role |
|---|---|---|
| `gateway` | 7005 | Edge/BFF: reverse-proxies the SSR app + hubs, validates sessions into trusted headers, `/health` + `/metrics` |
| `gamehub` | 7001 | Games realtime hub |
| `rmhmusic` | 7002 | Collaborative listening hub |
| `rmhtube` | 7003 | Watch-together hub |
| `rmhbox` | 7676 | Party-game hub |
| `assets` | 7007 | Range-aware S3/R2 asset streaming (`/library` `/music` `/models` `/sprites`) |
| `status` | 7008 | Standalone health dashboard; survives outages |
| `supervisor` | 9090 | Runs background workers (discord-bot, recap, doctrine, vibe, bot) as goroutines |

```bash
cd go-services
bazel run //:gazelle              # regenerate BUILD files after adding Go files
bazel test //go-services/...      # run all Go tests
bazel build //go-services/images/...
```

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
- **Theming/motion:** 20+ themes as `.style-*` classes over CSS tokens in
  `globals.css`; a global `prefers-reduced-motion` gate is respected there and via
  the `useReducedMotion()` hook.
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

- **Web tier:** production runs the Nitro server + WS servers under PM2; a
  blue-green `deploy/hotswap-web.sh` swaps the web container with a health-gated
  flip. Apache (behind Cloudflare TLS) sets security headers today; the Helm
  path fronts everything with the Go **gateway** via Traefik, and a Traefik
  middleware replicates those headers.
- **Go tier:** Bazel build/test + a Postgres-backed e2e + `helm lint`, all in
  `.github/workflows/go-microservices.yml`.
- **CI overall:** Go microservices workflow + an LLM `senior-review` gate +
  Dependabot. (A dedicated frontend typecheck/lint/build gate is recommended —
  see `docs/website-improvement-plan.md`.)

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
