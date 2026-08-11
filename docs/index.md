# rmhstudios.com

A single web platform: a social feed (RMHarks), ~20 browser games (several
multiplayer/3D), full apps (RMHTube, RMHMusic, RMHType, RMHStudy, RMHCode,
RMHLadder), a blog/news/library system, a coin economy with Stripe
memberships, and a scoped developer API — served by a React SSR tier with
Node realtime hubs and a Go worker fleet behind it.

This site is the rendered form of the repository's `docs/` tree. The Markdown
files are the source of truth and are written for both humans and coding
agents; nothing here is generated from code.

## Stack of record

**TanStack Start + Vite 8 + React 19 + Nitro SSR.** This is **not** Next.js —
some older design docs say otherwise and are flagged as stale below.
TypeScript strict, Tailwind CSS v4, framer-motion, Zustand + React Query,
PostgreSQL + Prisma 7, Better Auth (Discord/Google/GitHub + passkeys +
Stripe), Socket.io Node hubs, Go microservices built with Bazel, i18next
(16 locales, RTL for `ar`/`ur`).

## Start here

- {doc}`site-reference/index` — what the platform consists of, area by area,
  plus a generated inventory of every route, game and app.
- {doc}`developer-api/index` — the public REST API: guides and a generated
  endpoint reference.
- {doc}`codebase-overview` — canonical code-layout overview: stack, repo
  layout, conventions, and where to look first.
- {doc}`architecture` — runtime topology and the deploy pipeline: what runs
  where in production, images, CI, ports, auth across tiers.
- {doc}`design-language` — the visual system (**Radial Avant-Garde Glass**):
  the `--site-*` token contract, themes, primitives, motion, accessibility.
- {doc}`testing` — the test suites (Vitest main + epic, Go Bazel) and which
  CI workflows gate them.
- {doc}`README` — the full annotated map of `docs/`, including freshness
  flags for every directory.

## Trust order for conflicting information

Code > `docker-compose.yml` + `deploy.sh` (runtime truth) > root `CLAUDE.md`
and the per-directory `CLAUDE.md` files > the reference docs below > dated
design docs and plans. Those dated documents are historical snapshots: they
describe intent at the time of writing, not necessarily the current code.
Anything claiming Next.js or PM2 is out of date.

```{toctree}
:caption: Reference
:maxdepth: 1
:hidden:

README
site-reference/index
developer-api/index
codebase-overview
architecture
testing
performance-slo
design-language
page-consistency
people
adsense
albums-storage
coins
translations
```

```{toctree}
:caption: Operations
:maxdepth: 1
:hidden:
:glob:

runbooks/**
rmhladder-operations
go-migration/go-backend-and-bazel
misc/**
opti/**
```

```{toctree}
:caption: Audits
:maxdepth: 1
:hidden:

loading-audit-2026-08-11/index
loading-audit-2026-08-11/01-measurements
loading-audit-2026-08-11/02-critical-path
loading-audit-2026-08-11/03-api-caching
loading-audit-2026-08-11/04-database
loading-audit-2026-08-11/05-server-edge-fonts
loading-audit-2026-08-11/06-backlog
ui-audit-2026-08-01
ui-audit-2026-07-28
performance-audit-2026-07-17
scalability-audit-2026-07-17
ci-speed-audit-2026-07-17
security-audit-2026-07-13
security-audit-2026-07-12
mobile-friendliness-audit
```

```{toctree}
:caption: Plans & design snapshots
:maxdepth: 1
:hidden:
:glob:

full-rewrite-design-2026-07-18
optimization-ideas-2026-08-05
website-improvement-plan
plans/**
feed/**
superpowers/**
```

```{toctree}
:caption: Apps & games
:maxdepth: 1
:hidden:
:glob:

rmhbox/**
altair/**
rmhmusic/**
rmhtube/**
rmhvibe/**
signal-forge/**
temple-of-joy/**
void-breaker/**
daily-puzzles/**
rmhpoetry/**
alex-tamagotchi/**
```
