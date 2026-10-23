# Plasmatic Jelly — master overhaul plan

Status: approved for implementation, 2026-10-23. Supersedes the Liquid Glass contract
(`docs/liquid-glass-system.md`) once landed. Base: `main` at `3f24c585` (24-slab glass
engine with cards and controls re-admitted, #986).

The five research sections are the detailed specs; this file **wins wherever they
disagree** and assigns the work.

| § | Spec | Scope |
| - | ---- | ----- |
| 01 | [`01-material.md`](01-material.md) | haze, internal flow, plasma tint, rim changes, CSS carriers, tokens, legibility |
| 02 | [`02-soft-body.md`](02-soft-body.md) | envelope bodies (all elements), lattice bodies (shader slabs), neighbour nudge, press/drag cutover |
| 03 | [`03-arcs.md`](03-arcs.md) | ambient + click arcs, Canvas2D overlay, flash ledger, `electricArcs` preference |
| 04 | [`04-coverage-a11y-perf.md`](04-coverage-a11y-perf.md) | coverage tiers, migration of hand-rolled surfaces, budgets, governor, `jellyMotion` preference |
| 05 | [`05-gates-docs-naming.md`](05-gates-docs-naming.md) | gate inventory/rewrites, new gates N1–N12, naming, docs, i18n |

## 1. What Plasmatic Jelly is (one paragraph)

Every surface is a slab of slightly hazy, translucent plasma-jelly. The 3D refracting,
lit, rounded rim of liquid glass stays. Inside, a low-contrast haze is always drifting —
currents, eddies and faint plasma colour at the crests — calm behind text, livelier at
the rim. The jelly is soft: hover plumps and leans it toward the cursor, press squashes
it toward the contact point, release wobbles it back, drag stretches it along the
motion, and a strong release nudges near neighbours by a pixel or two. Jelly is charged:
nearby elements occasionally throw an electric arc across the gap (more often the
closer they are), and every click discharges 1–3 arcs to the nearest neighbours. Text,
hit areas and layout never move beyond the bounded squash.

## 2. Resolved decisions (overrides the section plans)

| # | Question | Decision |
| - | -------- | -------- |
| R1 | Class names | Keep `glass-*` role classes and `.app-glass` (05 §3.1). "Glass" names the role, "jelly" the material. No aliases, no mass rename. |
| R2 | Module home | All new services live in `lib/jelly/`. Rim/haze shader work stays in `lib/liquid/glass/`. 01's `lib/liquid/jelly/flow-carriers.ts` → `lib/jelly/flow-carriers.ts`. |
| R3 | Shared policy file | `lib/jelly/tiers.ts` is the single shared policy (04 P1): `jellyTier()`, `JELLY_BUDGETS`, `jellyOff()`, `jellyMotionLevel()`, `DEGRADED_ROOT_SELECTOR`, `OPT_OUT_SELECTOR`, `JELLY_SELECTOR`, motion-safety bounds. 02's physics policy is renamed `lib/jelly/soft-policy.ts`. There is **no** `lib/jelly/policy.ts` and **no** separate `selectors.ts`. |
| R4 | Event bus | One module, `lib/jelly/bus.ts` (§4.2). 02's `bridge.ts` is folded into it. |
| R5 | Feature flag | **No `data-material` flag.** Everything lands together on this branch; phase-3 flag removal from 01/05 is dropped. |
| R6 | Budgets | 04 §3.1's table is final: rims 24/16/10, ambient haze slots 8/6/4, carriers 24/16/8, Tier E bodies 12/8/6, Tier L lattices 8/6/4 (only while moving), clock 30 Hz. |
| R7 | Idle ("always moving") | The owner's brief says jelly *always* has underlying motion. So: 30 Hz while engaged, **12 Hz floor after 20 s idle, no 120 s freeze**. The clock is 0 only when the tab is hidden, the window is unfocused, nothing jelly is on screen, the tier is degraded, or `jellyMotion = still`. The frame-budget "rest" limit becomes 13 fps; this deliberately reverses the 2026-10-08 audit's 2 fps rest limit and is recorded as such in the commit and the new contract doc. CPU target at rest stays ≤ 250 ms/s on `/`. |
| R8 | WCAG 2.2.2 | `jellyMotion: 'lively' \| 'calm' \| 'still'` (default `lively`) in Settings → Appearance plus a one-tap "Pause ambient motion" in `QuickPanel`. No OS `prefers-reduced-motion` reading (CLAUDE.md §7 stands). |
| R9 | Arcs preference | `electricArcs: 'full' \| 'clicks' \| 'off'` (default `full`). One Prisma migration adds both `jellyMotion` and `electricArcs`. `still` forces arcs off. |
| R10 | Handheld arcs | Ambient arcs on handheld at **half** rate (≤ 1 per 4 s); click arcs 1 bolt. Off under `perf-lite`. |
| R11 | Press layer | `hooks/useFluidPress.ts` is absorbed by `lib/jelly/physics.ts` and deleted (02). `data-fluid-press*` attributes remain accepted aliases. |
| R12 | Neighbours | Bounded nudge (≤ 4 siblings within 24 px, ≤ 1.5 px, `translate` only, never layout, never chains). Arc strikes give the struck element a ≤ 1.5 px impulse. |
| R13 | Arc layer | Canvas2D `.jelly-arc-layer` on `<body>`, not the WebGL renderer (03 §4.2). `--z-arcs: 45`, `--z-arcs-modal: 55`. Excluded from scene capture. Flash ledger ≤ 3 onsets / s site-wide. |
| R14 | Contract doc | `docs/plasmatic-jelly-system.md` (new). `docs/liquid-glass-system.md` gets a "superseded" banner. |
| R15 | Globe | "The Liquid Globe" keeps its name and dough simulation. It gains the plasma palette only via shared material tokens. |
| R16 | Games | Play-fields excluded (`data-jelly-zone="playfield"`), HUD/chrome is jelly. `html[data-game-state="playing"]` zeroes ambient motion and arcs. |

## 3. Visual mechanics summary

| Mechanic | Where it is drawn | Spec |
| -------- | ----------------- | ---- |
| Haze + currents + eddies (shader) | per-surface low-res `.jelly-haze-canvas` (≤ 256 px long side), up to 8 ambient slots, curl-noise flow map + one domain-warp level, plasma only at crests, subsurface rim glow | 01 §2 |
| Rim (3D translucent edge) | existing slab shader + haze veil, plasma inner edge line, plasma cursor bloom, `uDeform` warp from lattice | 01 §2.7, 02 §1.3 |
| Haze (CSS tier) | injected clipped `.jelly-flow` child with 1–2 transform-animated gradient spans; static haze tile floor | 01 §3 |
| Soft body (all) | CSS `translate`/`scale` individual properties; hover plump/lean, press squash, release wobble, drag stretch | 02 §1.2 |
| Soft body (slabs) | 8-node perimeter spring lattice warps the SDF edge in the rim shader; text never moves | 02 §1.3 |
| Arcs | full-viewport Canvas2D overlay; seeded midpoint-displacement bolts with ≤ 3 branches, glow + core strokes, contact glow, 1–3 re-strikes, afterglow | 03 §1, §4 |
| Charge | rim brightens briefly on strike via `pulse(el, k)` | 01 §6 hand-offs |

## 4. Shared interfaces (frozen before wave 1 — every lane codes against these)

### 4.1 `lib/jelly/tiers.ts`

```ts
export type JellyTier = 'full' | 'coarse' | 'handheld' | 'lite' | 'off';
export type JellyMotion = 'lively' | 'calm' | 'still';
export interface JellyBudget {
  rims: number; hazeSlots: number; carriers: number; animatedViewports: number;
  clockHz: number; idleClockHz: number; bodies: number; lattices: number;
  ambientArcMinIntervalMs: number /* Infinity = off */; clickBolts: number;
}
export const JELLY_BUDGETS: Record<JellyTier, JellyBudget>; // values = R6/R10, 04 §3.1
export const FLASH_LEDGER = { maxOnsets: 3, windowMs: 1000 } as const;
export const MOTION_BOUNDS = { maxEdgeTravelPx: 4, maxScaleDelta: 0.03, nudgePx: 1.5, nudgeRadiusPx: 24, nudgeMax: 4 } as const;
export const DEGRADED_ROOT_SELECTOR: string; // '.reduce-transparency,.style-high-contrast,.perf-lite' + forced/print handled via media
export const OPT_OUT_SELECTOR: string;       // '[data-jelly="off"],[data-liquid-material="off"],[data-liquid-glass="off"],[data-liquid-motion="off"],[data-fluid-press="off"],[data-fluid-press="none"]'
export const JELLY_SELECTOR: string;         // every jelly host: role classes, .app-glass, [data-evert], [data-slot=button|input|textarea], [data-sonner-toast], [data-jelly]
export function jellyTier(env?: { doc?: Document; win?: Window }): JellyTier;
export function jellyMotionLevel(doc?: Document): JellyMotion; // reads html[data-jelly-motion], default 'lively'
export function jellyOff(doc?: Document): boolean;            // degraded root, forced-colors, prefers-reduced-transparency, print, hidden
export function jellyMode(env?): { ambient: boolean; arcs: 'full' | 'clicks' | 'off'; deform: 'full' | 'press' | 'off' };
export function onJellyEnvChange(cb: () => void): () => void; // media-query + <html> attribute observer, one instance
```

### 4.2 `lib/jelly/bus.ts`

Tiny synchronous typed emitter, no React.

```ts
export type JellyEvents = {
  'arc:strike': { el: Element; x: number; y: number; nx: number; ny: number; energy: number; kind: 'ambient' | 'click' | 'key' };
  'body:release': { el: Element; x: number; y: number; energy: number }; // physics → arcs (charge) + material pulse
  'drag:start': { el: Element };
  'drag:end': { el: Element };
  'haze:change': { el: Element; on: boolean }; // engine → carriers (data-jelly-haze)
};
export const jellyBus: { on<K>(k: K, fn): () => void; emit<K>(k: K, p: JellyEvents[K]): void };
```

### 4.3 `lib/jelly/registry.ts`

One IntersectionObserver + one ResizeObserver over `JELLY_SELECTOR` (MutationObserver for
adds/removes, batched). `visible(): Entry[]` with cached rects (refreshed on scroll end /
resize, never per pointer event), `ambientSlots(budget)`, `liveSet(budget)`,
`entryFor(el)`. No rAF. Consumers: engine, carriers, physics, arcs.

### 4.4 DOM attributes

`data-jelly="off" | "lite" | "card" | "control"` (mode override), `data-jelly-group`,
`data-jelly-zone="playfield" | "hud"`, `data-jelly-haze="on"` (engine-set),
`html[data-jelly-motion]`, `html[data-electric-arcs]`, `html[data-game-state="playing"]`,
`html[data-scrolling]`.

### 4.5 Tokens (`app/globals.css`, per `.style-*`)

`--site-jelly-haze`, `--site-jelly-haze-strong`, `--site-jelly-plasma-a`,
`--site-jelly-plasma-b`, `--site-jelly-plasma` (strength), `--site-jelly-flow-speed`,
`--site-jelly-quiet` (interior damping), `--site-arc-core`, `--site-arc-glow`,
`--z-arcs`, `--z-arcs-modal`. App tier mirrors as `--app-jelly-*`. High contrast zeroes all.

## 5. Implementation waves and lanes

Rules for every lane (all are Opus agents in the **same working tree**):

- Own only the files listed for your lane. Read anything; edit only your files. If you
  need a change in a file you don't own, write it under "Hand-offs" in your final report.
- Exception: additive one-entry edits to `lib/__tests__/raf-loop-allowlist.test.ts` and
  `scripts/check-consistency.sh` `GATE_TESTS` are allowed for the lane that creates the
  loop/test — re-read right before editing, keep the edit minimal.
- **Do not commit, push, or run `git add`/`git stash`/`git checkout`.** The coordinator
  commits per wave after running `pnpm check:consistency`.
- Validate your own files: `pnpm exec tsc --noEmit` (filter to your files),
  `pnpm exec vitest run <your tests>`, `pnpm exec eslint <your files>`.
- User-facing strings via `t()`; run `pnpm i18n:extract` only in lanes that add strings.
- Follow CLAUDE.md conventions (tokens not raw colours, no `transition-all`, no
  `backdrop-filter`, `defineHandler` for API routes).

### Wave 1 — foundations (parallel)

| Lane | Owns |
| ---- | ---- |
| **W1-A Shared core** | **C** `lib/jelly/{tiers,bus,registry}.ts`, `lib/jelly/governor.ts`, `lib/jelly/__tests__/{tiers,bus,registry,governor}.test.ts`. **M** `lib/__tests__/handheld-tier.test.ts` (scan `lib/jelly/tiers.ts`). |
| **W1-B Preferences** | `jellyMotion` + `electricArcs`: `prisma/schema.prisma` + one migration, `lib/appearance/{prefs,prefs-schema,account-seed}.ts`, `app/routes/api/preferences/appearance.ts`, `stores/themeStore.ts`, `components/Providers.tsx` (applier + fetch only), `app/routes/__root.tsx` (pre-paint stamp), `components/settings/AppearancePanel.tsx`, `components/radial/QuickPanel.tsx`, `locales/en/*` via extract, **C** `lib/__tests__/appearance-jelly-motion.test.ts`, `appearance-electric-arcs.test.ts`. |
| **W1-C Pure math** | **C** `lib/jelly/{envelope,lattice,soft-policy}.ts` + tests (02 WP1); **C** `lib/jelly/arcs/{geometry,bolt,rng,rate,ledger,pairs,timeline}.ts` + tests (03 A1). **M** `lib/fluid.ts`, `lib/motion.ts` (jelly springs), `lib/__tests__/fluid.test.ts`. |
| **W1-D CSS material & tokens** | **M** `app/globals.css` (all jelly + arc + z tokens per theme, imports of `jelly-material.css`, `jelly-arcs.css`, `jelly-coverage.css`), `app/liquid-glass.css`, `components/shared/app-theme.css`; **C** `app/jelly-material.css`, `app/jelly-arcs.css` (layer CSS), `scripts/generate-jelly-haze-tile.mjs`, `public/jelly/haze-tile.webp`, `lib/__tests__/jelly-legibility.test.ts`; **M** `lib/__tests__/filter-cost-budget.test.ts` (SHEETS). Creates an empty-but-valid `app/jelly-coverage.css` stub for W3. |

### Wave 2 — engines & services (parallel, after wave 1 commit)

| Lane | Owns |
| ---- | ---- |
| **W2-A Shader engine** | `lib/liquid/glass/{engine,shader,renderer,policy,scene}.ts`, **C** `lib/liquid/glass/{jelly-glsl,haze-shader}.ts`, `lib/liquid/glass/__tests__/*`. Haze canvases (ambient slots from registry), ambient clock (R7), rim changes, `uDeform` + lattice stepping in the engine frame (02 WP3), `pulse(el,k)`, `haze:change` emit, capture exclusion of `.jelly-arc-layer`/`.jelly-flow`/`.jelly-haze-canvas`, `DEGRADED_ROOT_SELECTOR` import. |
| **W2-B Physics service** | **C** `lib/jelly/{physics,compose}.ts`, `lib/jelly/__tests__/physics.test.ts`, `testing/e2e/jelly-soft-body.mjs`; **D** `hooks/useFluidPress.ts`; **M** `hooks/useFluidDrag.ts`, `hooks/useEvertPoint.ts`, `components/ui/{button,dialog,liquid-tabs,menu}.tsx` (press-layer cutover only), `components/shared/AppShell.tsx`, `components/radial/RadialShell.tsx`, `lib/liquid/hover-css.ts` (docblock/compat). Exposes `installJellyPhysics(doc)` and `lattice(el)` accessor for the engine. |
| **W2-C Arcs** | **C** `lib/jelly/arcs/{scheduler,clicks,renderer,runtime,index}.ts` + tests; `hooks/useCelebration.ts` optional hook-in. |
| **W2-D Integration & carriers** | **C** `lib/jelly/flow-carriers.ts` + test; **M** `hooks/useLiquidInteractions.ts` (mounts registry, carriers, physics, arcs, engine in one idle callback, one teardown), `lib/liquid/runtime.ts` (shared EXCLUDE from tiers), `components/Providers.tsx` **only** the mount/useFluidPress-removal lines (coordinate: W1-B already landed its edits). |

### Wave 3 — coverage, gates, docs (parallel, after wave 2 commit)

| Lane | Owns |
| ---- | ---- |
| **W3-A Primitives** | `app/jelly-coverage.css`; `components/ui/**` except files W2-B touched for press cutover (may still add `data-jelly`/`data-slot` attrs to those); `components/shared/AppToaster.tsx`; `components/Providers.tsx` sonner `classNames` line only. |
| **W3-B Site migration** | **C** `scripts/codemods/jelly-roles.mjs`; hand-rolled surfaces in `components/{rmhcoins,feed,news,library,economy,gifting,replays,homes,site,spaces,share,moderation,calendar}/**`, `app/routes/**`. |
| **W3-C Apps & games** | `components/shared/app-theme.css` adapter rules, app components (`rmhtube,rmhstudy,rmhtype,rmhcalculator,rmhmusic,studio`), `lib/game-capabilities.ts`, game stage/HUD zone attributes, `components/rmhbox/**`, `lib/__tests__/game-viewport-consistency.test.ts`. |
| **W3-D Gates** | `lib/__tests__/*` gate rewrites + N1–N12 (05 §1–2) except files owned above, `scripts/check-consistency.sh`, `.claude/hooks/commit-gate.sh` text, `testing/e2e/{liquid-glass,liquid-glass-engine,ui-stability,frame-budget}.mjs` → bounded/jelly checks, **C** `testing/e2e/jelly-interaction.mjs`, `jelly-coverage.test.ts` ratchet. |
| **W3-E Docs & naming** | **C** `docs/plasmatic-jelly-system.md`, `app/routes/jelly.tsx` (lab) + `app/routes/liquid-glass.tsx` redirect; **M** `docs/liquid-glass-system.md` (banner), `design.md`, `docs/design-language.md`, `docs/page-consistency.md`, `CLAUDE.md`, `AGENTS.md`, `app/CLAUDE.md`, `components/CLAUDE.md`, `lib/CLAUDE.md`, `docs/index.md` (+ `.po` refresh per `scripts/docs-i18n.sh`), i18n key swaps (05 §5). |

### After wave 3

Coordinator: full `pnpm check:consistency --base main`, `pnpm test`, `pnpm build`, a
browser pass (`/`, a feed page, settings, an app, a game; default/light/high-contrast;
phone + desktop width; `jellyMotion` lively/calm/still), then push.

## 6. Risks to watch

- **Perpetual-loop cost.** R7 keeps a 12 Hz floor; the governor (04 §3.3) and the 8-slot
  haze cap are the guardrails. Measure with `testing/e2e/frame-budget.mjs`.
- **Two writers on `scale`/`translate`** (framer-motion, Tailwind, jelly) — 02 §3.4
  compose rules + N11 baseline.
- **`fixed` descendants trapped by transformed hosts** — N4 widened R3 baseline.
- **Legibility** — `jelly-legibility.test.ts` + `--site-jelly-quiet` interior damping.
- **Photosensitivity** — single site-wide flash ledger in `tiers.ts` constants.
