# Kowloon Knockout — Phase 5: Tier Settings + Adaptive FPS Governor — Design Spec

> Date: 2026-06-26. Final phase of the Kowloon Knockout graphics overhaul (see `2026-06-25-kowloon-knockout-graphics-overhaul-design.md`). Builds on merged Phases 0–4. Adds the user-facing control + automatic scaling layer over the existing render tiers.

## Goal

Let players control graphics quality and keep the game smooth on weak machines: a main-menu **Graphics panel** (Auto / Ultra / High / Medium / Low + live FPS), a **downscale-only adaptive FPS governor** (Auto mode only), persistence of the choice, and validation of the mobile / WebGL2 fallback path. No new render features — this is the control/scaling layer over the tiers shipped in Phases 0–4. Combat sim, net, input, and HUD are untouched.

## Current state

- `RenderTierProvider` (in `arena/RenderTierContext.tsx`) lives **inside** the R3F Canvas (it needs `gl` for backend detection) and computes the tier **once** via `useMemo`. Eight render components consume `useRenderTier()` (`{ tier, flags }`) and gate on it.
- `detectTier(caps)` and `TIER_FLAGS` (in `render/tier.ts`) are pure and unit-tested. Detection routes mobile → `low`, WebGL2 → `medium`/`low` (no compute).
- No settings UI, no localStorage. `zustand` 5 is a dependency. The game shell (`KowloonKnockout.tsx`) is a `phase` state machine: menu → select → lobby → match; `MainMenu.tsx` holds the menu buttons.

## Architecture — zustand store bridging DOM menu ↔ in-Canvas tier

The user's quality preference must be readable by both the DOM menus (outside the Canvas) and the in-Canvas tier provider. A module-level **zustand store** is that bridge (chosen over a lifted React context — detection still needs in-Canvas `gl`, which would force two contexts).

- The store holds `preference: 'auto' | RenderTier` (persisted to localStorage) and an ephemeral `fps` (for the readout).
- `RenderTierProvider` becomes runtime-stateful: it reads `preference` + the detected tier (still computed in-Canvas), and the **effective tier** is `preference === 'auto' ? governorTier : preference`. The eight consumers already read `useRenderTier()`, so a tier change propagates automatically via context re-render.
- The **governor** runs in-Canvas (a `useFrame` sampler) only in Auto mode; it lowers `governorTier` on sustained low FPS and publishes live FPS to the store.

## Components & boundaries

### Pure, headlessly-testable core — `lib/kowloon-knockout/render/`
- `governor.ts` — no React/three:
  - a `FrametimeMonitor` (push frame deltas, expose a rolling average over a fixed window);
  - `shouldDownscale(avgMs: number, budgetMs: number): boolean` (avg over budget = struggling);
  - `nextLowerTier(tier: RenderTier): RenderTier` (ultra→high→medium→low, floors at low).
- The governor's "sustained for N frames" hysteresis is part of `FrametimeMonitor`/the decision (a downscale only triggers after the average stays over budget across the whole window, and a cooldown prevents immediate re-trigger). Unit-tested.

### Store — `lib/kowloon-knockout/render/graphicsStore.ts`
- A zustand store (with `persist` middleware → localStorage key `kk-graphics`): `preference: 'auto' | RenderTier`, `setPreference(p)`, `fps: number`, `setFps(n)`. Only `preference` is persisted; `fps` is ephemeral and excluded from persistence.

### Render layer — `components/kowloon-knockout/`
- `arena/RenderTierContext.tsx` *(refactor)* — tier becomes state. The provider owns `governorTier` (a `useState`, init = detected tier) as the single source of tier authority, and reads `preference` from the store. The context value is `{ tier, flags, detectedTier, preference, downscale }` where `tier = preference === 'auto' ? governorTier : preference`, `flags = TIER_FLAGS[tier]`, and `downscale()` lowers `governorTier` by one step (`nextLowerTier`). Existing consumers still read `{ tier, flags }` (added fields are additive). Keep the detection logic; just make the output mutable.
- `arena/Governor.tsx` *(new, in-Canvas, mounted in `Arena3D`)* — reads `{ preference, downscale }` from `useRenderTier()`. When `preference === 'auto'`, each frame push the delta into the `FrametimeMonitor` and publish the smoothed FPS to the store; if `shouldDownscale` and not at floor, call `downscale()` (with a cooldown so it steps at most once per window). Renders nothing. (`governorTier` resets to the detected tier when the provider remounts — i.e. per match/session — so Auto re-evaluates fresh.)
- `GraphicsSettings.tsx` *(new, DOM)* — the panel: a 5-way preset selector bound to `store.preference`, and a live FPS readout from `store.fps`. Styled with the existing neon menu CSS; touch-friendly (large tap targets).
- `MainMenu.tsx` *(modify)* — add a "Graphics" button that toggles the `GraphicsSettings` panel (same expand pattern as the existing Controls/Combos panels).

## Data flow

1. Panel writes `preference` → store → persisted to localStorage.
2. In-Canvas `RenderTierProvider` reads `preference` + detected tier → effective tier as context state → the eight consumers re-render and re-gate automatically.
3. In Auto, `Governor` samples frametime each frame, lowers `governorTier` on sustained low FPS (never raises), and publishes FPS for the readout.
4. Manual pick (`Ultra`…`Low`) → effective tier = that pick, governor inert (no sampling-driven changes).
5. On next load, the persisted `preference` is restored; Auto re-evaluates from the freshly detected tier.

## Mobile / WebGL2 validation

Detection already routes mobile → `low` and WebGL2 → `medium`/`low` (compute layers gated off). Scope here is small + RUN-OBSERVE:
- `GraphicsSettings` must be touch-usable (large targets, no hover-only affordances).
- Confirm: mobile renders `low` and the panel works by touch; forced WebGL2 stays on the CPU/non-compute paths with no crash; the governor no-ops at `low` (`nextLowerTier('low') === 'low'`).

## Testing

- **UNIT (Vitest, node):** `governor.ts` — `FrametimeMonitor` rolling average; `shouldDownscale` true only when the average exceeds budget across the window (with the cooldown/hysteresis); `nextLowerTier` steps down and floors at `low`. The store's `setPreference` reducer (state updates; `fps` excluded from persisted shape). Run `node_modules/.bin/vitest run lib/kowloon-knockout/render`.
- **RUN-OBSERVE (user):** the panel changes quality live (post pipeline rebuilds, particle layers remount, fighters re-dispatch); Auto visibly downscales on a struggling machine and never oscillates (downscale-only); preference persists across reload; mobile + forced-WebGL2 paths render and the panel is usable.
- Per project workflow: a `senior-swe-reviewer` pass before the PR.

## Risks & mitigations

- **Runtime tier change cost / pop.** Changing the effective tier rebuilds the post pipeline (`PostFx`), remounts particle layers, and re-dispatches fighters. This is the same machinery that runs at mount, but mid-session it causes a visible one-frame pop. Mitigation: the governor steps at most one level with a cooldown, so pops are rare and isolated; manual changes are user-initiated.
- **Governor oscillation.** Avoided by design (downscale-only). The only state that ever raises tier is an explicit manual pick or a new session.
- **Hook-order / context-shape change.** `RenderTierProvider` gains state; all consumers read the same `{ tier, flags }` shape (plus new optional fields), so they are unaffected. Mitigation: keep the existing return keys; add fields, don't rename.
- **Persistence SSR/JSON safety.** zustand `persist` reads localStorage on the client only; the store is created client-side (the game is `'use client'`). Mitigation: guard for `typeof window` per zustand's standard persist setup; persist only `preference`.

## Out of scope

- Per-setting toggles (individual bloom/shadow/particle switches) — preset tiers only.
- In-match pause/settings overlay (menu-only this phase; a possible later add).
- Any new render technique or change to `TIER_FLAGS` values / `detectTier` logic.
- Changes to sim, net, input, HUD.
