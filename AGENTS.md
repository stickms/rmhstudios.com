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
- **Design language — Radial Plasmatic Jelly:** a radial shell (still ring
  backdrop and aurora, top bar, and a central RMH hub that blooms into the
  **liquid globe** you turn to navigate) wrapping content rendered in the
  Plasmatic Jelly material. All colors/radii/shadows/fonts via `--site-*` Tailwind utilities
  (`bg-site-surface`, `rounded-site`, …); surfaces take a **glass elevation
  class by role** (`.glass-fill` / `.glass-pane` / `.glass-chrome` /
  `.glass-overlay` / `.glass-inset`) rather than a hand-rolled equivalent box;
  use `components/ui/` primitives and `components/feed/PageLayout.tsx`.
  **Jelly:** the role classes keep their `glass-*` names; the haze and rim
  (`lib/liquid/glass/engine.ts`, one ambient clock that idles to a floor and
  stops when unseen), the soft body (`lib/jelly/physics.ts`) and the electric
  arcs (`lib/jelly/arcs/`) are document services under one policy
  (`lib/jelly/tiers.ts`). No `backdrop-filter`; no component-level pointer
  loops, deformation, arc code, `infinite` keyframes or animated custom
  properties on `<html>` — components take jelly through role classes and
  `data-jelly*` attributes only; layout never changes (hosts squash ≤4px/3%,
  neighbours nudge ≤1.5px). Ambient motion and arcs have their own material
  switches (`jellyMotion`, `electricArcs`; WCAG 2.2.2/2.3.1) read only by
  `lib/jelly/tiers.ts`; the retired reduced-motion setting does not return. See
  `docs/plasmatic-jelly-system.md`. On top of that, the owner's #989 layers add
  dormant plasma that wakes on hover and brightens on press, an RGB-led edge with a
  Fresnel line, a liquid-glass lens dent with a light dot that slides with the
  pointer on press, and Coulomb-law charge between neighbours; the full rules are
  the "Design system: Plasmatic Jelly" section of `CLAUDE.md`. Full-screen apps use the parallel
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

## The commit gate (the one habit that keeps the site consistent)

**Run `pnpm check:consistency` before every commit.** One command
(`scripts/check-consistency.sh`) scans the added lines for the rules CI fails
on, runs the executable design gates in `lib/__tests__/`, lints the changed
files, typechecks, checks the generated docs are current, and then prints the
few things no script can check.

```bash
pnpm check:consistency               # the staged change
pnpm check:consistency --fast        # design/style gates + eslint (what the hooks run)
pnpm check:consistency --base main   # the whole branch, before a PR
pnpm check:consistency:full          # + the full vitest suite
```

It also fires automatically: `.claude/settings.json` gates `git commit` in
Claude Code sessions via `.claude/hooks/commit-gate.sh`, and `pnpm
hooks:install` points git's `core.hooksPath` at `.githooks/` for everyone else.
If your tooling honours neither, run the command by hand — the site's
consistency is the point, not the mechanism.

A failing gate is **fixed, not bypassed**. If a rule is genuinely wrong for the
change, change the rule in the same commit and say so in the message.

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
| The commit gate (script)           | [`scripts/check-consistency.sh`](./scripts/check-consistency.sh) |
| RMH Capital leadership (canon)     | [`docs/people.md`](./docs/people.md)                           |
| Docs index (incl. stale-doc flags) | [`docs/README.md`](./docs/README.md)                           |
| Contribution rules                 | [`CONTRIBUTING.md`](./CONTRIBUTING.md)                         |

## Key commands

The globe's dough simulation and Peirce projection bake use AssemblyScript
WebAssembly kernels with JavaScript fallbacks. Vite and `pnpm test` compile them
automatically; use `pnpm wasm:build` before direct Vitest runs and `pnpm wasm:bench`
for CPU comparisons. Build/deployment details and the Apache CSP prerequisite:
[`docs/frontend-webassembly.md`](./docs/frontend-webassembly.md).

```bash
pnpm install && pnpm db:push && pnpm dev   # run locally → http://localhost:7005
pnpm check:consistency                     # the commit gate — before EVERY commit
pnpm exec tsc --noEmit && pnpm lint        # gated by web-ci.yml — run them before pushing
pnpm test                                  # tests — a hard gate in web-ci.yml
make gazelle && make test                  # Go fleet (Bazel)
```
