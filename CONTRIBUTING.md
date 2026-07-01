# Contributing to rmhstudios.com

Thanks for working on this project. This guide covers the essentials; see
`docs/codebase-overview.md` for the architecture and `docs/website-improvement-plan.md`
for the current priorities.

## Prerequisites

- **Node.js** 20+ and **pnpm** (required — this is a pnpm workspace).
- A running **PostgreSQL** instance.
- Copy `.env.example` → `.env` and fill in at least the minimum from
  `.env.example.minimum`.

## Getting started

```bash
pnpm install
pnpm db:push          # apply the Prisma schema to your local DB
pnpm dev              # Vite SSR app + WebSocket servers → http://localhost:7005
```

## Before you open a PR

```bash
pnpm exec tsc --noEmit   # typecheck — don't add new errors vs. the base branch
pnpm lint                # ESLint (incl. jsx-a11y at "warn")
pnpm format              # Prettier (optional but appreciated for files you touch)
```

> The repo currently carries a baseline of pre-existing type/lint warnings. The
> bar for a PR is **don't add new ones** in the files you change — not to fix the
> whole backlog.

## Conventions

- **Routing.** Add routes as files under `app/routes/`. After adding an **API**
  route (`app/routes/api/*`), the router tree (`app/routeTree.gen.ts`) must be
  regenerated — running `pnpm dev` or a build does this. API routes use
  `createFileRoute('/api/…')({ server: { handlers: { GET, POST } } })`.
- **Server-only code** goes in `*.server.ts(x)` so it's stubbed out of the client
  bundle.
- **SEO.** New public pages should set a unique title/description via `head()` and
  a canonical (`lib/seo.ts`), plus JSON-LD for content pages (`lib/schema.ts`).
- **Errors.** Handle user-facing failures — routes can set `errorComponent` /
  `notFoundComponent` (`components/errors/*`). Client errors auto-report to
  `/api/client-error`.
- **API input** is validated with zod and rate-limited (`lib/rate-limit.ts`) where
  it writes, uploads, or costs money (AI).
- **i18n.** User-facing strings use `t(...)`, never hardcoded English. Check
  coverage with `pnpm i18n:coverage`.
- **Accessibility.** Prefer native/Radix elements; interactive UI must be
  keyboard-operable and labeled; honor `prefers-reduced-motion` (there's a global
  CSS gate and a `useReducedMotion()` hook).
- **Security headers / CSP** are set in two places — the Apache vhost
  (`deploy/apache/rmhstudios.conf`) and the Helm/Traefik middleware. Change both.

## Commits & PRs

- Keep commits focused; write a clear message explaining *why*.
- The PR template (`.github/pull_request_template.md`) has a checklist — fill it in.
- Don't commit secrets. `.env` is gitignored; keep it that way.

## Go services

The Go fleet in `go-services/` is built and tested with Bazel:

```bash
cd go-services
bazel run //:gazelle            # regenerate BUILD files after adding Go files
bazel test //go-services/...    # run all Go tests
```
