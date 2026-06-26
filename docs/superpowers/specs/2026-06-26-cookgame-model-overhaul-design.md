# "Game" (cookgame) — 3D Model Overhaul — Design

> **Status:** Approved for spec. Slots BEFORE Phase 3 (gameplay phases deferred until this ships).
> **Display title:** "Game" · **Internal slug:** `cookgame`.
> **Engine:** react-three-fiber + Rapier, reusing the **Kowloon Knockout** procedural model/material/lighting approach.

## 1. Goal & Motivation

The current cookgame visuals are crude programmer-art primitives — a capsule player, capsule
buyers, flat box buildings, colored-cube station markers, a flat ground plane. They read as a
prototype, not a game. This overhaul replaces **all** scene visuals with a cohesive, attractive,
stylized-realistic **suburban look inspired by Steam's _Schedule I_**, built **procedurally** in
code (no `.glb` asset pipeline) by reusing and re-skinning the proven Kowloon Knockout rig and
material/lighting helpers.

This is a **visual overhaul only**. It is explicitly NOT a gameplay change.

## 2. Hard Guardrails (non-negotiable)

The overhaul swaps the *meshes* that existing components render. It must NOT change:
- **Gameplay / store logic** (`lib/cookgame/**`) — the 90 vitest tests stay green, untouched.
- **Rapier physics** — colliders for ground, buildings, and boundary walls keep their current
  shapes/positions so movement and collision are identical.
- **Interaction anchors** — `STATION_POSITIONS`, `BUYER_POSITIONS`, `PLOT_POSITIONS`,
  `DRYING_POSITION`, `CHEM_POSITION` and all `Interactable` ids/radii are unchanged; new station
  models sit ON these anchors.
- **Overlays / HUD / DOM UI** — the 2D overlay layer is out of scope; this is the 3D scene only.

If a visual change would require moving an anchor or altering a collider, the collider stays and
the visual is built around it.

## 3. Art Direction

Grounded, **muted suburban realism** (NOT the neon Kowloon arena palette, NOT saturated cartoon):
- Daytime block: asphalt street, concrete sidewalk, patchy grass/lawn, beige/stucco and muted
  siding on buildings, warm sunlight with soft shadows and a soft sky-gradient background.
- Stylized **chunky low-poly** geometry with clean readable silhouettes; **matte** PBR materials
  (low metalness, mid roughness) — re-tuned from Kowloon's slightly-metallic neon helper.
- Characters are human-ish (more human than the Kowloon stick fighter) in casual streetwear.

## 4. Architecture

A new self-contained module `components/cookgame/models/`, each file one focused responsibility,
consumed by the existing world components. Mirrors how Kowloon isolates `StickFighter`, `materials`,
and `Lighting`.

```
components/cookgame/models/
  palette.ts            # PURE-ish: suburban color palette + matte PBR material-prop helpers
                        #   + named CHARACTER_LOOKS (appearance configs). One source of truth.
  Character.tsx         # reusable articulated humanoid (Kowloon StickFighter rig, re-skinned),
                        #   appearance-config driven; idle + walk animation via imperative useFrame
  Building.tsx          # parametric building (walls/roof/door/windows/trim); variants house|shop
  Lighting.tsx          # daytime suburban lighting rig (key sun + sky fill + soft shadows + sky bg)
  stations/
    MixingBenchModel.tsx
    GrowPlotModel.tsx       # STAGE-AWARE: plant mesh reflects empty|seedling|vegetative|flowering
    DryingRackModel.tsx
    ChemStationModel.tsx
    PackagingModel.tsx
    SupplierStallModel.tsx
  props/
    StreetProps.tsx         # fences/hedges, streetlight, trash can, (optional) parked car —
                            #   instanced where repeated
```

Consumers (existing files, MODIFIED to render the new models in place of primitives):
- `world/TownScene.tsx` — buildings, ground/street/sidewalk, station prop models, street dressing,
  `<Lighting/>` (anchors + colliders unchanged).
- `world/PlayerController.tsx` — render `<Character/>` instead of the capsule mesh (physics body
  unchanged; the capsule collider stays, only the visual child swaps).
- `npc/BuyerNPC.tsx` — render `<Character/>` instead of capsule+sphere; pass each buyer's look.
- `CookGameGame.tsx` — its top-level `<ambientLight>/<directionalLight>` move into `<Lighting/>`.

### 4.1 Character rig (reuse)

Adapt `components/kowloon-knockout/arena/StickFighter.tsx`: root group → body group (torso, head,
arms) + separate leg groups, blob shadow, imperative `useFrame` animation, no React state.
Changes for cookgame:
- **Appearance config** (`CharacterLook`): body/clothing/skin/accent colors + optional cap, so one
  rig renders the player and every buyer distinctly (driven by `palette.CHARACTER_LOOKS`).
- **Animation states reduced** to `idle` and `walking` (drop boxing guard/punch/block/KO). The
  player controller derives the state from horizontal velocity; buyers are `idle` with a subtle
  bob (optional one-shot "deal" nod is allowed but YAGNI by default).
- Re-skin: streetwear silhouette (jacket/hoodie torso, legs as pants, simple shoes, head with
  optional cap) instead of the headband fighter.

### 4.2 Stage-aware grow plot

`GrowPlotModel` is a **pure view**: it takes the plot's `stage` (`empty|seedling|vegetative|
flowering`) as a **prop** and renders a planter box whose plant mesh grows with the stage — making
the Phase 2 grow state legible at a glance. A thin consumer in `TownScene` subscribes to the store
(`useCookgameStore((s) => s.inventory.plots[i].stage)`) and passes it down; the model itself never
reads or mutates the store. (This is the one place the overhaul adds a store *read* to the world
layer — it adds no writes and no logic.)

## 5. Performance

- Keep per-model triangle counts low (stylized low-poly); reuse geometries/materials.
- **Instance** repeated street props (fence segments, streetlights) via `<Instances>`/instanced
  meshes rather than N separate meshes.
- Characters animate imperatively (refs + `useFrame`), no per-frame React state — matching the
  Kowloon pattern that runs four fighters cheaply; cookgame has ≤ ~5 characters.
- Shadows: a single soft directional shadow + cheap blob shadows under characters (not per-prop
  shadow casting everywhere).

## 6. Testing & Verification

- **No DOM test env** → models are not unit-tested. `palette.ts` may expose a tiny pure selector
  (e.g. look-by-id) that *can* be vitest-tested, but keep logic minimal — this is art, not logic.
- **Gates:** existing `./node_modules/.bin/vitest run lib/cookgame` stays **green** (we touch no
  logic); `tsc --noEmit` clean for cookgame; `eslint` clean; `vite build` exit 0.
- **Manual:** load `/cookgame`, walk the block — confirm characters animate (idle/walk), buildings
  & stations read clearly, grow-plot plants reflect stage, lighting/shadows look cohesive, and all
  interactions (Press-E at every station/buyer) still fire at the same anchors.
- Run `senior-swe-reviewer` before the PR (studio convention).

## 7. Out of Scope

- Any gameplay/economy/store change; any overlay/HUD/2D-UI restyle.
- Authored `.glb` assets / external art packs / texture-painting pipelines (procedural only).
- Day–night cycle and time-of-day lighting changes (that's Phase 3 — this ships a single daytime
  look that Phase 3 can later animate).
- Mobile controls, post-processing stacks beyond basic soft shadows (can be a later polish pass).
- New gameplay phases (3–6) remain deferred until this overhaul ships.
