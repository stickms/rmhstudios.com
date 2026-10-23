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
(`@prisma/adapter-pg`), Better Auth (Discord/GitHub + passkeys +
Stripe), Socket.io Node hubs, Go microservices built with Bazel, i18next (16
locales, RTL for `ar`/`ur`). Node ≥24.18, pnpm workspace.

## Repository map

| Path           | What                                                                                                                                                                     | Details                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `app/`         | TanStack Start routes: pages, API routes, `globals.css` (the `--site-*` theme tokens), router. `routeTree.gen.ts` is GENERATED — never edit.                             | [`app/CLAUDE.md`](app/CLAUDE.md)                 |
| `components/`  | React components by feature; `ui/` = shared primitives; `feed/PageLayout.tsx` = canonical page wrapper; `shared/` = the full-screen app tier (`--app-*`, `AppShell`).    | [`components/CLAUDE.md`](components/CLAUDE.md)   |
| `lib/`         | Shared logic: auth, prisma, feed, economy, i18n, motion tokens, per-game logic, `.server.ts` server-only modules.                                                        | [`lib/CLAUDE.md`](lib/CLAUDE.md)                 |
| `server/`      | **Node** service tier: web SSR plus socket-server (7001), rmhbox (7676), rmhtube (7003), and the ladder-worker / homes-worker / jobs (pg-boss) workers.                  | [`server/CLAUDE.md`](server/CLAUDE.md)           |
| `go-services/` | **Go** microservice fleet (Bazel + gazelle): `supervisor`, `status`, `assets` run in prod; the gateway + Go hubs were removed (rewrite §5.2).                            | [`go-services/CLAUDE.md`](go-services/CLAUDE.md) |
| `stores/`      | Site-level Zustand stores (theme, locale, feed, user display).                                                                                                           | `lib/CLAUDE.md`                                  |
| `hooks/`       | Shared hooks (`useReducedMotion`, `useCelebration`, `useFeedSSE`, `useFluidDrag`, `useLiquidInteractions`, `useLiquidBackground`, `useReveal`, …).                       | `lib/CLAUDE.md`                                  |
| `prisma/`      | `schema.prisma` (323 models, 71 enums, ~8.9k lines) + migrations.                                                                                                        | `lib/CLAUDE.md`                                  |
| `locales/`     | 16 shipped locales × 67 registered namespaces; `en` is authoritative. (More directories exist on disk than are wired up — see the i18n note below.)                      | `lib/CLAUDE.md` §i18n                            |
| `data/`        | Static JSON (RMHBox content packs, library metadata).                                                                                                                    | —                                                |
| `public/`      | Static assets, `robots.txt`, `manifest.webmanifest`.                                                                                                                     | —                                                |
| `scripts/`     | Seeding, i18n pipeline, OG/icon generation, ladder pipeline, news pipeline, epic build.                                                                                  | `docs/README.md`                                 |
| `deploy/`      | Apache vhosts, blue/green hotswap, DB backups, Terraform (DNS), runbooks.                                                                                                | [`docs/architecture.md`](docs/architecture.md)   |
| `docs/`        | Reference docs, design docs, plans, runbooks — also **published** as a Sphinx/MyST Read the Docs site in 16 languages.                                                   | [`docs/README.md`](docs/README.md)               |
| `testing/`     | RMHBox phase tests (the mission-critical remainder) + the unwired browser smoke. Most other suites are colocated under `lib/`; discovery is a glob, nothing to register. | [`docs/testing.md`](docs/testing.md)             |
| `cli/`         | `rmhcode` CLI (wraps Claude Code; publishes User Builds).                                                                                                                | —                                                |

## Commands

```bash
pnpm install                 # postinstall runs prisma generate
pnpm db:push                 # apply schema to local Postgres (dev)
pnpm dev                     # Vite (7005) + socket/rmhbox/rmhtube hubs + ladder/homes/jobs workers
pnpm exec tsc --noEmit       # typecheck
pnpm lint                    # eslint (jsx-a11y at warn — add no new warnings)
pnpm format                  # prettier
pnpm test                    # main test suite (~20s; mission-critical scope — docs/testing.md)
pnpm test:epic               # epic content-build suite (needs Chromium)
pnpm test:integration        # real flows vs a running app + throwaway Postgres (docs/testing.md §8)
pnpm build                   # vibe-packages → vite build → esbuild 6 server bundles
pnpm i18n:extract            # after adding t() strings
pnpm check:consistency       # THE COMMIT GATE — run before every commit (see below)
make gazelle && make test    # Go: regenerate BUILD files, run Bazel tests
```

Local ports: web 7005 · socket-server 7001 · rmhtube 7003 · rmhbox 7676 ·
status 7008 · assets 7007. Env: see `.env.example`; minimum is
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

**Frontend WebAssembly:** `wasm/` holds the AssemblyScript dough/Peirce kernels;
`lib/wasm/` owns browser/worker loading and fallbacks. Vite compiles them before
dev/build, and `pnpm test` compiles before Vitest. Use `pnpm wasm:build` explicitly
before direct `pnpm exec vitest` runs involving these modules; `pnpm wasm:bench`
compares warm CPU costs with JavaScript. `lib/wasm/generated/` and
`wasm/.generated/` are generated, gitignored outputs. See
[`docs/frontend-webassembly.md`](docs/frontend-webassembly.md) for the source map,
memory contract, asset checks and one-time Apache policy update.

## The commit gate — run this before EVERY commit

This repo's recurring failure mode is not broken code; it is code that works
and looks like it came from a different site. One page hardcodes a radius,
one route skips `defineHandler`, one string never reaches `t()` — each is
invisible alone, and together they are why §5.2, §12 and the CI gates exist.
So consistency is checked at the same moment every time: **the commit.**

```bash
pnpm check:consistency          # gate the staged change (what the commit will contain)
pnpm check:consistency --fast   # design/style gates + eslint only (what the hooks run)
pnpm check:consistency --base main   # gate the whole branch before a PR
pnpm check:consistency:full     # + the complete vitest suite
```

`scripts/check-consistency.sh` runs, in order: a scan of the **added lines**
for the rules CI already fails on (raw palette colours, hardcoded radii,
`transition-all`, dead `tailwindcss-animate` classes, hand-rolled tab strips) ·
the executable gates in `lib/__tests__/` that are the **authority** for
`docs/design-language.md` §13 · eslint on the changed files · `tsc --noEmit` ·
the generated-docs freshness checks. Then it prints the handful of things no
script can check — the three themes, the role-less switcher that is really a
tab strip — because a green gate means you did not regress an enforced rule,
never that the change looks right.

It is wired to fire on its own, so "I forgot" is not a failure mode:

- **Agent sessions:** `.claude/settings.json` runs
  `.claude/hooks/commit-gate.sh` before any Bash `git commit`. A failing gate
  blocks the commit and hands the reasons back to the agent to fix. (Both files
  are checked in on purpose — `.gitignore` keeps the rest of `.claude/` local.
  Claude Code asks you to trust project hooks the first time they run.)
- **Humans:** `pnpm hooks:install` once per clone points `core.hooksPath` at
  `.githooks/`, whose `pre-commit` runs the same gate (skipping it if an agent
  already gated that exact staged tree).

Two rules about the gate itself:

1. **A failing gate is fixed, not bypassed.** `--no-verify` and
   `RMH_SKIP_COMMIT_GATE=1` exist for emergencies and leave a trace — if you
   use one, say why in the commit message.
2. **If a rule is genuinely wrong for your change, change the rule** in the
   same commit (the allowlists in `lib/__tests__/design-consistency.test.ts`
   are documented and one-directional — entries come out, they do not go in),
   and say so in the message. Silently working around a gate is how the
   inconsistency it prevents comes back.

Every commit also carries the smaller invariants: no secrets, no hand-edited
generated files (`app/routeTree.gen.ts`, `lib/i18n/resources.<locale>.ts`), no
new type or lint warnings versus the base branch, and a message that explains
_why_.

## Cross-cutting conventions (the ones agents break most)

1. **Routing:** add files under `app/routes/`; the route tree regenerates on
   dev/build. Pages under `_site/` get the radial shell; top-level routes are
   full-screen (games, login, legal — intentional). Never edit
   `routeTree.gen.ts`.
2. **Server-only code:** `lib/**/*.server.ts` is stubbed out of the client
   bundle by a Vite plugin. Never import `.server` modules from client code.
3. **API routes:** `.ts` files with `server.handlers.{GET,POST,...}`. Wrap every
   handler in `defineHandler` from `@/lib/api/handler.server` — it performs the
   session check → rate limit → zod `safeParse` → try/catch order for you and is
   the only place that order is written down in code:
   `POST: defineHandler({ rateLimit: 'write', body: schema }, async ({ userId, body }) => …)`.
   `auth` defaults to `'required'`; pass `'admin'` / `'optional'` / `'none'` to
   opt out. Admin routes get `auth: 'admin'` instead of a hand-rolled
   `isAdmin` check. The `/api/v1/**` developer API keeps its own richer wrapper
   (`withDeveloperApi`) because it speaks a different error envelope.
4. **Design language:** every color/radius/shadow/font via `--site-*` token
   utilities (`bg-site-surface`, `rounded-site`, …) so every theme works;
   full-screen apps use the parallel `--app-*` contract in
   `components/shared/app-theme.css`. Use `components/ui/` primitives,
   `PageLayout`, `lib/motion.ts` tokens, lucide icons, sonner toasts. Surfaces
   take a **glass elevation class by role** (`.glass-fill` repeated cards ·
   `.glass-pane` singular panels · `.glass-chrome` sticky chrome ·
   `.glass-overlay` floating UI · `.glass-inset` fields), not a hand-rolled
   `bg-site-surface border rounded-site` box — the class is what carries the
   material and what the degradation tiers switch off. The material is
   **Plasmatic Jelly**: hazy translucent slabs with always-on internal motion, a
   retained refracting, lit rim, a soft body under hover/press/drag, and
   electric arcs between nearby surfaces and on click. The role classes keep
   their `glass-*` names ("glass" is the role, "jelly" the material). Haze and
   rims are drawn by `lib/liquid/glass/engine.ts` (one ambient clock, idle floor
   when untouched, 0 when unseen), the soft body by `lib/jelly/physics.ts`, arcs
   by `lib/jelly/arcs/`, all under one policy, `lib/jelly/tiers.ts`.
   **No `backdrop-filter` in any glass role.** Never add per-component pointer
   loops, deformation, arc code, `infinite` keyframes or animated root custom
   properties — components take jelly through role classes and `data-jelly*`
   attributes only. **Layout never changes**: hosts squash within 4px/3% and
   neighbours nudge ≤1.5px. The globe stays a dough simulation (`lib/dough.ts`).
   Its full rules are
   [Design system: Plasmatic Jelly](#design-system-plasmatic-jelly) below; the
   contract is `docs/plasmatic-jelly-system.md`. The statement of the language is
   [`design.md`](design.md) at the root; **before any UI commit** read
   [`docs/design-language.md`](docs/design-language.md) §0 (the definition of
   done) and the checklist in
   [`docs/page-consistency.md`](docs/page-consistency.md). Part of this is
   CI-enforced — `lib/__tests__/design-consistency.test.ts` fails the build on
   hand-rolled tab strips, raw palette colours, hardcoded radii, floating UI
   below L4, `transition-all`, and `tailwindcss-animate` classes (that plugin
   is not installed, so they compile to nothing) — and `pnpm check:consistency`
   is how you find that out **before** you commit rather than in CI.
5. **i18n:** all user-facing strings through `t("key", { defaultValue })`;
   then `pnpm i18n:extract`. English is authoritative. Two silent failure modes
   to know: **(a)** `defaultValue` is only used when a key is MISSING, so
   changing the wording of a shipped string means a NEW key — editing the
   default in place changes English and nothing else; **(b)** a `{/* … */}` JSX
   comment placed immediately before a `t()` call makes `i18next-parser` skip
   that call, so the key never lands in `locales/` and every non-English locale
   silently serves the English default. Put the explanation above the component
   instead, and check `locales/en/<ns>.json` after adding a string. A **new namespace must
   be added to `NAMESPACES` in `lib/i18n/config.ts`** — a JSON file dropped
   into `locales/en/` without that entry is never loaded, and the UI silently
   falls back to its `defaultValue`s.
6. **SEO:** per-route `head()`; `buildMeta`/`buildCanonical` from `@/lib/seo`;
   JSON-LD only via `jsonLdScript()` + builders from `@/lib/schema`. `buildMeta`
   owns the whole Open Graph block — absolute `og:image`, declared dimensions,
   the right `twitter:card` for the image size, and the section-card fallback —
   so don't hand-roll `og:*` tags in a route. Point at a dynamic card with
   `ogCardPath(kind, id)`; cards are rendered by `lib/og/` and documented in
   [`docs/open-graph.md`](docs/open-graph.md).
7. **Accessibility:** Radix/native primitives, focus-visible rings are
   global, skip link exists. Motion follows the shared token scheme; the retired
   reduced-motion setting and OS overrides must not return. The jelly's ambient
   motion and arcs have their own material switches (`jellyMotion`,
   `electricArcs`; WCAG 2.2.2/2.3.1) read only by `lib/jelly/tiers.ts`. Test
   `light` and `high-contrast` themes, and jelly motion `still`.
8. **Security:** zod-validate all input; rate-limit writes/AI/uploads;
   user-supplied URL fetches through `lib/ssrf-guard.server`; CSP/security
   headers live in `deploy/apache/rmhstudios.conf` (the production front door;
   the Helm/Traefik path was removed in the rewrite — design §5.2).
9. **Go code:** config via `pkg/config`, logging via `pkg/log`, sessions
   validated via `pkg/auth` against the shared `session` table. Run
   `make gazelle` after adding files.
10. **Quality bar (from CONTRIBUTING.md):** don't add new type/lint warnings
    relative to the base branch; keep commits focused; never commit secrets.
    Every commit passes `pnpm check:consistency` — see the commit gate above.

## Design system: Plasmatic Jelly

Every UI change must comply with this. It unifies two sources: the overhaul built
on this branch (hazy, always-moving, soft, charged jelly — plan:
`docs/plans/plasmatic-jelly/`) and the owner's #989 spec (dormant plasma, an
RGB-led edge, a liquid-glass lens dent, Coulomb electricity), whose features are
layered **on top**. The implementation contract is
[`docs/plasmatic-jelly-system.md`](docs/plasmatic-jelly-system.md); constants live
in `lib/jelly/tiers.ts` (and the engine modules it names) with CSS tokens in
`app/globals.css` mirroring the ones CSS needs — never re-derive one in a component.

**Identity: silent, sleek, frontier AI.** Calm, never busy. Near-black void
(`--site-bg`), graphite (`--site-surface-opaque`), white ink, and ONE electric
accent (`--site-accent`), which is also the plasma colour (the haze's second plasma
hue only ever appears inside the gel, never as UI colour). No gradients on the
ground, no neon or glowing type, no sci-fi illustration (robots, brains, circuits,
sparkles). Copy is short and literal ("Deploy model", "Latency 42 ms"); eyebrows
and data are Geist Mono, everything else Geist. One ink-gel primary action
(`<Button variant="signal">`) per view.

**The material, in physical layers (all drawn by shared services):**

1. **Gel:** hazy and translucent, darkening slightly toward its base
   (`--gel-body` → `--gel-depth`); the primary action is ink gel (`--gel-ink`,
   `--on-ink`).
2. **Haze, always moving:** a slow low-contrast flow inside every surface —
   currents, eddies, faint plasma at the crests — calm behind text (interior
   damped by `--site-jelly-quiet`, ≤12px/s, features ≥120px). Shader haze on the
   ambient slots, transform-only `.jelly-flow` carriers elsewhere.
3. **Plasma, inside and dormant:** a core and filaments clipped inside the gel,
   invisible at rest. Hover wakes it to `--plasma-wake`; press, focus and clicks
   brighten it; a click's charge rings through it (`--pulse-speed`,
   `--pulse-tau`). Plasma never draws an outline.
4. **Edge refraction, smooth and RGB-led:** the refracting, lit rim, with a soft
   band just inside it (`--gel-bevel`) carrying a distinct red/green/blue split
   (`--gel-disperse-r/-g/-b`, red toward the top-left light, blue away). The RGB
   split leads; white is secondary. Plus a 1px Fresnel edge (`--gel-fresnel`).
5. **No broad gloss band or glint across the face.** Shine lives at the edges
   and in the dent.

**Physics (one soft-body service, `lib/jelly/physics.ts`; constants are tokens):**

- **Soft under the hand.** Hover plumps a card and leans it toward the pointer
  (controls dent slightly); press squashes toward the contact point conserving
  area; release wobbles back and settles to exact rest (~1.2s), then sleeps.
  Hosts move within 4px/3% and content follows the gel by at most
  `--jelly-content-strain` (4%); hit areas never move; layout never changes.
- **Press = liquid-glass dent.** A smooth, creaseless Gaussian bowl sinks under
  the pointer (`--jelly-dent-depth`, damped by `--jelly-dent-damping`), the
  outline indents and the far side bulges. The dent is a lens: content beneath
  refracts through it (`--jelly-lens-strength`), split into R/G/B
  (`--jelly-lens-dispersion`), with a soft rim glow and a specular **light dot**
  (`--gel-specular`) on its far slope. **Drag and the dent slides with the
  pointer**; dragging off the element stretches the gel (rubber band from
  `lib/fluid.ts`). Release eases everything back.
- **Neighbours:** a strong release nudges at most 4 neighbours ≤1.5px, transform
  only, never chaining.
- **Electricity (`lib/jelly/arcs/`):** charged neighbours attract by Coulomb's law
  (equal and opposite, within the nudge bound; resting bodies pass it to their
  support). Ambient arcs strike between nearby surfaces, more often the closer
  they are; a gap below `--arc-breakdown-gap` × (1 + 1.5q) breaks down after
  `--arc-formative-lag`. Every click deposits charge that rings through the gel
  and jumps to a neighbour in reach with half the charge, plus 1–3 click arcs.
  One flash ledger caps every flash at ≤3 onsets/s site-wide (WCAG 2.3.1); arcs
  never land on fields, overlays or toasts.
- **Never fake a law:** no keyframe wobble, `@keyframes` glow, `transition:
  transform` on a body, untriggered flicker, ripple, or a second spring formula.
  The only sanctioned keyframes are the `.jelly-flow` haze drift. A new behaviour
  is a new force in the services with a constant for every number.

**Layout:** bodies sit at least `--space-4` (16px) apart. Leave `--jelly-margin`
(16px) unclipped round every body; no `overflow: hidden` directly around one.
Cards `--site-radius`, controls `--site-radius-sm`. Game play-fields are
`data-jelly-zone="playfield"` (excluded); ambient motion and arcs stop while a
game is playing.

**Accessibility and degradation stay central** (`lib/jelly/tiers.ts`): high
contrast, forced colors, reduced transparency and `perf-lite` switch the jelly
off and render opaque `--site-surface-opaque` with a solid edge (press feedback
stays); components never branch on them. Users control the material with
`jellyMotion` (Lively / Calm / Still — Still stops all ambient motion, WCAG
2.2.2; also one tap from the top bar) and `electricArcs` (Full / Clicks / Off).
The retired reduced-motion setting and OS overrides do not return. Text holds
4.5:1 on gel, over haze and over plasma in every theme; the focus ring is
`--focus-ring`, solid 2px, never the plasma glow. Plasma, haze, arcs and the lens
are `aria-hidden` decoration, never the only signal of state. Where a browser
will not apply SVG filters to HTML, the lens simply does not refract; rim and
indent remain.

**Performance:** one frame driver (`lib/jelly/frame.ts` — one
`requestAnimationFrame`; services register through `drive(fn)`), one window
pointer listener fan-out, one overlay canvas (arcs only). The ambient clock runs
30 Hz engaged, a 12 Hz floor when idle, and 0 when the tab is hidden or
unfocused, nothing is on screen, the tier is degraded, or Jelly motion is Still.
Budgets per tier in `JELLY_BUDGETS` (desktop: 24 rims, 8 haze slots, 24 carriers,
12 bodies — never above `--jelly-body-budget` (24)), with a downscale-only
governor. Rects are read in scroll/resize/activation, never per frame or pointer
event; nothing writes custom properties to `<html>` per frame. The only filters
are the lens and refraction blurs inside a moving body's own SVG, active only
while it moves; never a filter or `backdrop-filter` on a full-viewport layer.

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

CI is 11 workflows: `web-ci.yml` (typecheck, lint, tests, build, production
dependency audit, integration suite — **all blocking**), `epic-tests.yml` (the epic content-build
suite, path-filtered to `scripts/epic/**`), `go-microservices.yml` (Bazel test),
`senior-review.yml` (LLM review gate), `deploy.yml`, `synthetic-perf.yml`,
`i18n-translate.yml`, and the build/deploy guards `build-vibe-packages`,
`compose-validate`, `prisma-validate`, `prisma-migrate-status`. Run the core
checks locally before opening a pull request. Which suite runs where, and what
gates a deploy:
[`docs/testing.md`](docs/testing.md) §CI.

## Trust order for conflicting information

Code > `docker-compose.yml` + `deploy.sh` (runtime truth) > root README /
this file > `docs/codebase-overview.md` > older docs. Docs known to be stale
are flagged in [`docs/README.md`](docs/README.md). Notably: anything claiming
Next.js, PM2, or a repo-root `specs/` directory (deleted) is outdated.
