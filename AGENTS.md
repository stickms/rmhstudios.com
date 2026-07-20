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
- **Design language:** all colors/radii/shadows/fonts via `--site-*` Tailwind
  utilities (`bg-site-surface`, `rounded-site`, …); use `components/ui/`
  primitives and `components/feed/PageLayout.tsx`. The theme system depends on this.
  Reference: `docs/design-language.md` + checklist in
  `docs/page-consistency.md`.
- **i18n:** every user-facing string through `t("key", { defaultValue })`,
  then `pnpm i18n:extract`.
- **API routes:** session via `auth.api.getSession({ headers })` → rate limit
  via `lib/rate-limit` → zod validation → `Response.json`. Details in
  `app/CLAUDE.md`.
- **Go services:** config via `pkg/config`, logging via `pkg/log`; run
  `make gazelle` after adding `.go` files. Details in `go-services/CLAUDE.md`.
- **Quality bar:** `pnpm exec tsc --noEmit` and `pnpm lint` must introduce no
  new warnings; never commit secrets.

## Directory guides

| Area                               | Guide                                                    |
| ---------------------------------- | -------------------------------------------------------- |
| Whole repo (start here)            | [`CLAUDE.md`](./CLAUDE.md)                               |
| Routes, pages, API endpoints       | [`app/CLAUDE.md`](./app/CLAUDE.md)                       |
| React components & UI primitives   | [`components/CLAUDE.md`](./components/CLAUDE.md)         |
| Shared logic, auth, prisma, i18n   | [`lib/CLAUDE.md`](./lib/CLAUDE.md)                       |
| Node realtime hubs & workers       | [`server/CLAUDE.md`](./server/CLAUDE.md)                 |
| Go microservice fleet              | [`go-services/CLAUDE.md`](./go-services/CLAUDE.md)       |
| Runtime topology & deploy pipeline | [`docs/architecture.md`](./docs/architecture.md)         |
| Design language (themes, tokens)   | [`docs/design-language.md`](./docs/design-language.md)   |
| New-page consistency checklist     | [`docs/page-consistency.md`](./docs/page-consistency.md) |
| Docs index (incl. stale-doc flags) | [`docs/README.md`](./docs/README.md)                     |
| Contribution rules                 | [`CONTRIBUTING.md`](./CONTRIBUTING.md)                   |

## Key commands

```bash
pnpm install && pnpm db:push && pnpm dev   # run locally → http://localhost:7005
pnpm exec tsc --noEmit && pnpm lint        # gated by web-ci.yml — run them before pushing
pnpm exec vitest run                       # tests (also run in web-ci.yml + vitest-coverage.yml)
make gazelle && make test                  # Go fleet (Bazel)
```
