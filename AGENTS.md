# AGENTS.md — rmhstudios.com

> Instructions for AI coding agents (Copilot, Cursor, Codex, Claude, etc.).
> The canonical, maintained version of this guidance is
> [`CLAUDE.md`](./CLAUDE.md) — read that first. This file is a summary plus
> the pointers; if the two ever disagree, `CLAUDE.md` wins.

## Non-negotiables

- **Stack:** TanStack Start + Vite 8 + React 19 + Nitro SSR. **NOT Next.js**
  — any doc or spec claiming Next.js is stale.
- **Never edit** `app/routeTree.gen.ts` (generated) or the auto-generated
  `lib/i18n/resources.<locale>.ts` files.
- **Server-only modules** are `lib/**/*.server.ts` — a Vite plugin strips
  them from the client bundle. Never import them from client code.
- **Design language — Radial Avant-Garde Glass:** a radial shell (ring backdrop,
  drifting aurora, top bar, and a central RMH hub that blooms into the **liquid
  globe** you turn to navigate) wrapping content rendered in the Liquid Glass
  material. All colors/radii/shadows/fonts via `--site-*` Tailwind utilities
  (`bg-site-surface`, `rounded-site`, …); surfaces take a **glass elevation
  class by role** (`.glass-fill` / `.glass-pane` / `.glass-chrome` /
  `.glass-overlay` / `.glass-inset`) rather than a hand-rolled equivalent box;
  use `components/ui/` primitives and `components/feed/PageLayout.tsx`.
  **Nothing tracks the cursor** (retired 2026-08-01) and nothing writes a
  custom property to `<html>` per frame. Full-screen apps use the parallel
  `--app-*` contract (`components/shared/app-theme.css` + `AppShell`). The
  statement of the language is `design.md` at the root; read
  `docs/design-language.md` §0 before a UI commit; checklist in
  `docs/page-consistency.md`. Part of it is CI-enforced
  (`lib/__tests__/design-consistency.test.ts`).
- **i18n:** every user-facing string through `t("key", { defaultValue })`,
  then `pnpm i18n:extract`. A new namespace JSON must also be registered in
  `NAMESPACES` (`lib/i18n/config.ts`) or it is never loaded.
- **API routes:** wrap handlers in `defineHandler` from
  `@/lib/api/handler.server`, which runs session → rate limit → zod validation
  → try/catch in that order. Don't hand-roll the preamble. Details in
  `app/CLAUDE.md`.
- **Go services:** config via `pkg/config`, logging via `pkg/log`; run
  `make gazelle` after adding `.go` files. Details in `go-services/CLAUDE.md`.
- **Quality bar:** `pnpm exec tsc --noEmit` and `pnpm lint` must introduce no
  new warnings; never commit secrets.

## Directory guides

| Area                               | Guide                                                          |
| ---------------------------------- | -------------------------------------------------------------- |
| Whole repo (start here)            | [`CLAUDE.md`](./CLAUDE.md)                                     |
| Routes, pages, API endpoints       | [`app/CLAUDE.md`](./app/CLAUDE.md)                             |
| React components & UI primitives   | [`components/CLAUDE.md`](./components/CLAUDE.md)               |
| Shared logic, auth, prisma, i18n   | [`lib/CLAUDE.md`](./lib/CLAUDE.md)                             |
| Node realtime hubs & workers       | [`server/CLAUDE.md`](./server/CLAUDE.md)                       |
| Go microservice fleet              | [`go-services/CLAUDE.md`](./go-services/CLAUDE.md)             |
| Runtime topology & deploy pipeline | [`docs/architecture.md`](./docs/architecture.md)               |
| Design language — the statement    | [`design.md`](./design.md)                                     |
| Design language (themes, tokens)   | [`docs/design-language.md`](./docs/design-language.md)         |
| The radial shell + liquid globe    | [`components/radial/README.md`](./components/radial/README.md) |
| New-page consistency checklist     | [`docs/page-consistency.md`](./docs/page-consistency.md)       |
| RMH Capital leadership (canon)     | [`docs/people.md`](./docs/people.md)                           |
| Docs index (incl. stale-doc flags) | [`docs/README.md`](./docs/README.md)                           |
| Contribution rules                 | [`CONTRIBUTING.md`](./CONTRIBUTING.md)                         |

## Key commands

```bash
pnpm install && pnpm db:push && pnpm dev   # run locally → http://localhost:7005
pnpm exec tsc --noEmit && pnpm lint        # gated by web-ci.yml — run them before pushing
pnpm exec vitest run                       # tests (also run in web-ci.yml)
make gazelle && make test                  # Go fleet (Bazel)
```
