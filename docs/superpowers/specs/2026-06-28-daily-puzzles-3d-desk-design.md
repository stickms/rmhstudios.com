# Daily Puzzles — 3D "The Daily" Desk Revamp (Sub-project 1: Foundation + Hub)

**Date:** 2026-06-28
**Status:** Design approved, pending spec review

## Summary

Revamp Daily Puzzles from a flat 2D card hub into an immersive 3D scene styled
as **someone's real office desk** with an open newspaper, *THE DAILY*. The
puzzles live *inside* this world: the hub is the newspaper's front page, each
puzzle is a front-page section/clipping you select with Temple-of-Joy-style 3D
buttons, and each game renders **embedded on the newspaper page in perspective**
(via drei `<Html transform>`), re-skinned to look printed on newsprint. The
camera leans in to play a section and leans back out to the front page.

This gives Daily Puzzles a distinct identity — **cool, cerebral, "daily ritual"**
(cool slate + ink, crisp serif, soft daylight) — that contrasts deliberately
with Temple of Joy's warm-gold serene-zen world, while reusing Temple's proven
in-world 3D button toolkit.

## Goals

- A 3D desk world that is unmistakably "Daily Puzzles" and unmistakably a daily
  newspaper ritual.
- Reuse Temple of Joy's `ui3d` 3D button toolkit **without modifying Temple**
  (copy & re-theme into Daily).
- Keep all 6 existing puzzle **mechanics** intact; re-dress them as newsprint
  sections and embed them in the desk scene.
- Preserve existing secondary surfaces: today's progress, leaderboard, past
  puzzles, share.
- Mobile-first and asset-light (no external HDR/model/font downloads), matching
  repo conventions.

## Non-goals (for SP1)

- Rebuilding any puzzle's underlying game logic.
- Re-skinning all 6 games in SP1 — only **one** game is wired end-to-end as the
  proof. The rest are SP2–SP7.
- Touching / re-theming Temple of Joy.

## Decomposition (the whole effort)

Because the user chose "full 3D everything," this is ~7 surfaces. We build the
shared foundation + hub first; each puzzle follows as its own brainstorm → spec
→ plan.

- **SP1 (this spec):** Foundation toolkit + desk world + front-page hub +
  `DeskGameFrame` + **one** game wired end-to-end (proof).
- **SP2–SP7:** Re-skin each remaining puzzle (Alibi, Spectrum, Outcast,
  Chainlink, Impostor, Lights Out) into the desk frame. Each is a lighter
  styling/integration task since mechanics are reused.

## Current state (reference)

- Stack: TanStack Start + TanStack Router (file routes under `app/routes/`),
  React 19, Vite, TypeScript, Tailwind v4, `three@^0.183`,
  `@react-three/fiber@^9`, `@react-three/drei@^10`, `react-i18next`, `zustand`,
  `framer-motion`.
- Daily hub today: `components/daily-puzzles/DailyPuzzleHub.tsx` — flat 2D
  gradient card grid built from a static `GAME_MODE_DEFS` array (id, title,
  emoji, lucide icon, description key, accent gradient, iconColor).
- Games (2D React + Tailwind + framer-motion): `AlibiGame.tsx`,
  `ChainlinkGame.tsx`, `OutcastGame.tsx`, `SpectrumGame.tsx`, `ImpostorGame.tsx`,
  plus `components/lights-out/LightsOutGame.tsx`.
- Logic/data: `lib/daily-puzzles/*` (seed, persistence, share, generators).
- Routes: `app/routes/daily.tsx` (layout segment), `app/routes/daily/index.tsx`
  (hub), `app/routes/daily/<mode>.tsx` (each game). Each route wraps a lazy
  component in `GameErrorBoundary` + `Suspense` w/ `GameLoadingFallback`.
- Temple toolkit to copy from: `components/temple-of-joy/three/ui3d/`
  (`Button3D`, `Label3D`, `Panel3D`, `canvasLabel`, `overlay` =
  CameraOverlay/useOverlaySize), `three/useTap.ts`, `three/glowTexture.ts`,
  `three/SceneEnvironment.tsx`, and the `<Canvas>` setup in
  `three/TempleScene.tsx`. Note: `Button3D` imports `templeAudio` from
  `@/lib/temple-of-joy/audio` — this coupling is removed in the copy.

## Architecture

### A. Toolkit (copy & re-theme) — `components/daily-puzzles/three/`

Copy these primitives in and re-theme defaults from warm-gold → cool-slate:

- `ui3d/Button3D.tsx` — remove `templeAudio` import; replace with an optional
  `onPlaySound?: () => void` prop (default no-op) so the primitive is
  audio-agnostic.
- `ui3d/Label3D.tsx`, `ui3d/Panel3D.tsx`, `ui3d/canvasLabel.ts`,
  `ui3d/overlay.tsx` (CameraOverlay/useOverlaySize), `useTap.ts`,
  `glowTexture.ts`.
- Re-theme: neutral slate slab base, per-puzzle accent emissive, lower bloom,
  cool point lights. Newsprint label font (serif) in `canvasLabel`.

Duplication with Temple is accepted (per decision) to keep Temple zero-risk.

### B. Desk world — `components/daily-puzzles/three/DeskScene.tsx`

- `<Canvas>` reusing Temple's adaptive setup: `dpr` 1.0–1.5, `PerformanceMonitor`
  → setDpr, `AdaptiveDpr`/`AdaptiveEvents`, `powerPreference:'high-performance'`,
  `touchAction:'none'`. Camera positioned looking down at the desk; OrbitControls
  with clamped distance/polar angles, `enablePan={false}`, damping.
- `DeskEnvironment` (re-themed `SceneEnvironment`): cool daylight key light posed
  as the **desk lamp**, soft fill, locally-baked drei `<Environment>` of
  `<Lightformer>`s, `<ContactShadows>`. No external assets.
- Procedural props (primitives / `RoundedBox`, asset-light): desk surface, **desk
  lamp**, coffee cup + ring stains, pencils, paperclips, sticky notes.
- Hero prop: **open newspaper** — a page plane with a newsprint `CanvasTexture`
  (extend `canvasLabel`/a new `newsprintTexture.ts`): masthead "THE DAILY",
  today's date, "No. <puzzle#>", column rules, halftone-dot filler art.

### C. Front-page hub — `components/daily-puzzles/three/FrontPage.tsx`

- Maps `GAME_MODE_DEFS` → **front-page clippings**: each a headline box on the
  newspaper (title + accent + a "SOLVED" ink-stamp overlay when completed),
  laid out like newspaper columns.
- Selection via `useTap` (tap selects, drag orbits the desk).
- Selecting a clipping calls navigation (`/daily/<id>`) and **leans the camera**
  toward that section.
- Progress is read from existing `lib/daily-puzzles/persistence` to drive the
  SOLVED stamps and the masthead progress stamp.

### D. Embedded games — `components/daily-puzzles/three/DeskGameFrame.tsx`

- A shared frame placing a drei `<Html transform occlude>` panel onto the
  newspaper page plane in perspective, so the live game UI looks **printed on the
  page**.
- The **existing game React component** renders inside, wrapped in a newsprint
  CSS theme (ink-on-paper, serif, column rules, halftone accents). New theme
  lives in a scoped stylesheet/Tailwind classes; the game's logic/props are
  unchanged.
- Camera leans in on mount, leans back to front page on "back".

### E. Persistent desk via the layout route (key decision — approved)

Hoist the desk scene into the **`daily` layout route** (`app/routes/daily.tsx`)
so the `<Canvas>`/desk **persists** across hub ↔ game. The child routes
(`index` + `<mode>`) drive *which clipping is focused* and *which game `<Html>`
is mounted*, rather than each route booting its own Canvas.

- A small shared store (zustand, mirroring Temple's pattern) or router state
  holds `{ focusedMode | null }`; the desk camera + which `DeskGameFrame` mounts
  derive from it + the active route.
- Route wrappers keep `GameErrorBoundary` + `Suspense` + `GameLoadingFallback`;
  the heavy game components stay `lazy`-loaded inside `DeskGameFrame`.
- This is the change that makes lean-in/out seamless and sells "integrated with
  the desk."

### F. Secondary surfaces (re-homed)

- **Progress** → ink "X / 6 SOLVED" stamp on the masthead.
- **Leaderboard** → a pinned sticky note / clipboard prop on the desk.
- **Past puzzles** → a stack of back-issues.
- **Share** → a "tear out & share" action (wraps existing `share.ts`).

These reuse existing data/API (`app/routes/api/daily-puzzles/*`,
`lib/daily-puzzles/*`); only presentation changes.

## Data flow

- `GAME_MODE_DEFS` (move/extend into a shared `lib/daily-puzzles/modes.ts` if
  cleaner) → `FrontPage` clippings.
- `lib/daily-puzzles/seed` → date / puzzle number on the masthead.
- `lib/daily-puzzles/persistence` → SOLVED stamps + progress.
- Existing API routes power leaderboard/results/score unchanged.
- Router/zustand `focusedMode` → desk camera target + mounted `DeskGameFrame`.

## Visual identity

Cool slate + ink; crisp serif; soft daylight from the desk lamp; low bloom.
Per-puzzle accent colors pop against the neutral world. Deliberate contrast with
Temple of Joy's warm-gold zen world.

## Testing / verification

- Repo verification commands per `memory/verify-commands.md` (pnpm wrappers
  blocked → use `./node_modules/.bin/*`; no DOM test env; route-tree regen
  quirk). Typecheck + build are the primary gates.
- Manual browser sign-off (the repo convention for 3D features): desk renders;
  drag orbits / tap selects (useTap); camera leans in/out; one game plays
  embedded on the page; progress stamp + SOLVED stamps reflect persistence;
  mobile DPR adapts.
- Run the senior-swe-reviewer agent before any PR (per Kowloon workflow prefs).

## Risks / mitigations

- **drei `<Html transform>` perspective + interaction** is the trickiest piece
  (pointer events, occlusion, DPR, readability). Mitigation: SP1 wires exactly
  one game end-to-end to prove the frame before scaling to all six.
- **Persistent layout route** changes route wrappers. Mitigation: keep error
  boundary + suspense; gate game mounting; test hub↔game↔hub navigation.
- **Toolkit duplication** could drift from Temple. Accepted per decision; keep
  the Daily copy self-contained.

## Open items for SP1 implementation

- Pick the proof game (recommend **Lights Out** or **Spectrum** — simplest grid
  UIs to embed and re-skin).
- Decide store (zustand vs router state) for `focusedMode` during planning.
