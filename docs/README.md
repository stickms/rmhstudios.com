# docs/ — Index

Map of everything under `docs/`, with freshness flags so agents and humans
know what to trust. Agent-facing guides live at the repo root
([`CLAUDE.md`](../CLAUDE.md), [`AGENTS.md`](../AGENTS.md)) and in each major
directory's `CLAUDE.md`.

**Trust order for conflicts:** code > `docker-compose.yml`/`deploy.sh` >
root `CLAUDE.md` / directory `CLAUDE.md`s > the reference docs below > dated
design docs/plans (historical snapshots — they describe intent at the time of
writing, not necessarily the current code).

## Reference docs (keep current)

| Doc | Contents |
|---|---|
| [`codebase-overview.md`](./codebase-overview.md) | Canonical code-layout overview: stack, repo layout, conventions, where to look first |
| [`architecture.md`](./architecture.md) | Runtime topology + deploy pipeline: what runs where in production, images, CI, ports, auth across tiers |
| [`design-language.md`](./design-language.md) | The visual system: `--site-*` token contract, themes + accent presets, primitives, typography, motion, a11y |
| [`page-consistency.md`](./page-consistency.md) | Checklist + recipes for building pages that look native |
| [`developer-api.md`](./developer-api.md) | Scoped public developer API summary (canonical spec is in-app at `/developer/docs`) |
| [`albums-storage.md`](./albums-storage.md) | Albums storage architecture (DB + R2/S3) |
| [`coins.md`](./coins.md) | Coin economy design (implementation plan, largely shipped) |

## Operations

| Location | Contents |
|---|---|
| [`runbooks/`](./runbooks/) | **Current operational runbooks**: Go runtime cutover (2026-06-22), Go fleet steady-state deploy (2026-06-23), assets/CDN cutover. Follow these for deploy/rollback work. |
| [`go-migration/`](./go-migration/) | The Go+Bazel migration book: [`go-backend-and-bazel.md`](./go-migration/go-backend-and-bazel.md) is the **authoritative Go operator runbook**; the PDF/HTML sections are the rendered design doc (written at the original 9-service scope — the fleet has grown since). |
| [`misc/`](./misc/) | Security audits/reports (`SECURITY.md` is the current upload-security reference) + the UI redesign vision doc |
| [`opti/`](./opti/) | Optimization/build-speed audits and plans (mostly executed) |

## Plans & specs (dated snapshots — check dates before trusting)

| Location | Contents |
|---|---|
| [`plans/2026-07-14-liquid-glass-ui-redesign.md`](./plans/2026-07-14-liquid-glass-ui-redesign.md) | **Sitewide Liquid Glass redesign** design doc (2026-07-14): glass as the material system — tokens, elevation tiers, realism/reactivity/performance specs, per-page coverage incl. library/studio/shop/admin, phased rollout |
| [`superpowers/`](./superpowers/) | The main archive of dated design specs + implementation plans (~75 files, `plans/` + `specs/`), plus the reusable [`i18n-extraction-guide.md`](./superpowers/i18n-extraction-guide.md) |
| [`plans/`](./plans/) | Older dated plan/design pairs (dream-rift, rmhmusic, rmhcode CLI, terraform/helm migration, farming sim) |
| [`website-improvement-plan.md`](./website-improvement-plan.md) | Cross-cutting audit + phased roadmap (2026-06-30) |
| [`mobile-friendliness-audit.md`](./mobile-friendliness-audit.md) | Mobile audit — findings implemented 2026-06-29 (historical) |
| [`feed/`](./feed/) | Feed/timeline scaling plan |

## Per-feature docs

| Location | Feature |
|---|---|
| [`rmhbox/`](./rmhbox/) | RMHBox party games — largest doc set: `info.md` (agent-facing codebase reference — keep in sync when changing RMHBox), design specs, phase plans |
| [`altair/`](./altair/) | Altair strategy game — implementation, multiplayer, balance patch history |
| [`rmhmusic/`](./rmhmusic/), [`rmhtube/`](./rmhtube/), [`rmhvibe/`](./rmhvibe/), [`rmhtech/`](./rmhtech/) | App design docs (rmhtube `features.md` is a 2025 roadmap — historical) |
| [`signal-forge/`](./signal-forge/), [`temple-of-joy/`](./temple-of-joy/), [`void-breaker/`](./void-breaker/), [`daily-puzzles/`](./daily-puzzles/), [`rmhpoetry/`](./rmhpoetry/) | Game design docs |
| [`alex-tamagotchi/`](./alex-tamagotchi/) | Alex, the Discord tamagotchi pet (now implemented in `go-services/internal/discordbot`) |
| [`textbook/`](./textbook/), [`indonesia-history/`](./indonesia-history/) | Generated book projects (architecture textbook; Library content) — content artifacts, not code docs |

## ⚠️ Known-stale docs (do not trust these claims)

These predate the Next.js → TanStack Start migration and/or the Go cutover:

- `void-breaker/specs.md` — claims "Next.js + TypeScript + Node.js"
- `temple-of-joy/game-design.md` — claims "Web (Next.js, browser-first)"
- `../specs/vega.md` (repo-root `specs/`) — targets a "Next.js environment"
- `rmhtube/features.md` — 2025 roadmap for a now-shipped app
- Older design docs in `rmhbox/`, `plans/`, `misc/`, and the textbook chapters
  mention Next.js in historical context — the routes/stack described there
  map to `app/routes/` + TanStack Start today
- `../go-services/README.md` + `FOUNDATION.md` — describe the pre-Bazel
  9-service world; see `go-services/CLAUDE.md` and
  `go-migration/go-backend-and-bazel.md` instead
- Anything claiming production runs PM2 — production is Docker Compose with a
  blue/green web hotswap (see `architecture.md`)
