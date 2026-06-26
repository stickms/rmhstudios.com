# "Game" (cookgame) — 3D Model Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every cookgame scene visual (capsule characters, box buildings, cube station markers, flat ground) with cohesive, attractive, procedurally-built models in a muted suburban *Schedule I* style — reusing the Kowloon Knockout rig/material/lighting approach — WITHOUT changing any gameplay, physics, or interaction.

**Architecture:** A new `components/cookgame/models/` module of focused procedural components (palette/material helpers, a reusable `Character` humanoid, a `Building`, a `Lighting` rig, per-station models, instanced street props). Existing world components (`TownScene`, `PlayerController`, `BuyerNPC`, `CookGameGame`) are modified to render these models in place of primitives — keeping every collider, anchor, and store interaction identical.

**Tech Stack:** TypeScript, react-three-fiber, `@react-three/rapier`, `@react-three/drei`, three.js, Zustand (read-only from the world layer), vitest. Build/test via `./node_modules/.bin/*` wrappers.

## Global Constraints

- **Visual-only overhaul.** Do NOT change `lib/cookgame/**` logic, Rapier colliders, interaction anchors (`STATION_POSITIONS`, `BUYER_POSITIONS`, `PLOT_POSITIONS`, `DRYING_POSITION`, `CHEM_POSITION`), `Interactable` ids/radii, or any overlay/HUD/2D UI. The existing **90 `lib/cookgame` vitest tests must stay green** at every task.
- **Procedural only** — no `.glb`/authored assets, no external art packs. Build meshes in code from three.js primitives.
- **Art direction:** muted suburban realism (NOT neon, NOT saturated cartoon); stylized chunky low-poly; **matte** PBR materials (low metalness, mid roughness) from the shared palette; warm daytime sun + soft shadows + soft sky background.
- **Reuse the Kowloon rig:** adapt `components/kowloon-knockout/arena/StickFighter.tsx` (root→body group with torso/head/arms + leg groups; imperative `useFrame` animation; blob shadow; no React state) for the cookgame `Character`.
- **`"use client"` is the first line** of every component file.
- **Performance:** keep poly counts low; **instance** repeated props (fence segments, streetlights) via drei `<Instances>`/instanced meshes; one soft directional shadow + cheap blob shadows under characters; reuse geometries/materials.
- **No DOM test env:** models are not unit-tested. Only `palette.ts`'s pure selector is vitest-tested. Verify visual work via `tsc --noEmit` (cookgame clean), `eslint` (clean), `vite build` (exit 0), and manual.
- **Run tests with** `./node_modules/.bin/vitest run <path>`; pnpm wrappers are blocked. `vite build` regenerates the route tree — revert any `pnpm-workspace.yaml` build-approval noise (`git checkout origin/main -- pnpm-workspace.yaml`), don't commit it.
- **Run `senior-swe-reviewer` before the PR** (studio convention).
- Spec of record: `docs/superpowers/specs/2026-06-26-cookgame-model-overhaul-design.md`.

---

## File Structure

```
components/cookgame/models/
  palette.ts              # CREATE: suburban palette + matte material helpers + CHARACTER_LOOKS + getCharacterLook()
  Lighting.tsx            # CREATE: daytime sun + sky fill + soft shadows + sky background
  Character.tsx           # CREATE: reusable articulated humanoid (Kowloon rig re-skinned), idle/walk
  Building.tsx            # CREATE: parametric building, variant 'house' | 'shop'
  stations/
    SupplierStallModel.tsx  PackagingModel.tsx  MixingBenchModel.tsx   # CREATE (Task 7)
    GrowPlotModel.tsx  DryingRackModel.tsx  ChemStationModel.tsx       # CREATE (Task 8)
  props/
    StreetProps.tsx       # CREATE: instanced fences/hedges/streetlights + trash can (Task 6)
  __tests__/
    palette.test.ts       # CREATE (Task 1)

components/cookgame/
  CookGameGame.tsx        # MODIFY: replace inline lights with <Lighting/> (Task 2)
  world/PlayerController.tsx  # MODIFY: render <Character/> child instead of capsule mesh (Task 4)
  world/TownScene.tsx     # MODIFY: buildings, ground/street, station models, street props (Tasks 5-8)
  npc/BuyerNPC.tsx        # MODIFY: render <Character/> instead of capsule+sphere (Task 4)
```

**Canonical anchors (unchanged — read from `world/TownScene.tsx`):** `STATION_POSITIONS = { supplier:[-8,0,-3], mixing:[6,0,-3], packaging:[9,0,-3] }`, `PLOT_POSITIONS = [[-4,0,-8],[0,0,-8],[4,0,-8]]`, `DRYING_POSITION = [-9,0,2]`, `CHEM_POSITION = [12,0,-3]`, `BUYER_POSITIONS = { doug:[-6,0,8], kim:[0,0,10], pablo:[7,0,8] }`. Buildings currently: lab `[8,1.5,-6]` size `[6,3,4]`, supplier shop `[-8,1.5,-6]` size `[5,3,4]`. Boundary walls at ±20. Ground 40×40.

---

## Task 1: Palette + material foundation

**Files:**
- Create: `components/cookgame/models/palette.ts`
- Test: `components/cookgame/models/__tests__/palette.test.ts`

**Interfaces:**
- Produces:
  - `PALETTE` — named suburban colors (asphalt, sidewalk, grass, stucco, sidingA/B, roof, wood, metal, foliage, soil, sky tones).
  - `matteMaterialProps(color: string): { color: string; roughness: number; metalness: number }` — matte PBR (roughness ~0.85, metalness ~0.05).
  - `CharacterLook` interface `{ id: string; skin: string; hair: string; top: string; bottom: string; shoes: string; accent: string; cap: boolean }`.
  - `CHARACTER_LOOKS: Record<string, CharacterLook>` with at least `player`, `doug`, `kim`, `pablo` (distinct).
  - `getCharacterLook(id: string): CharacterLook` — returns the look for `id`, falling back to `CHARACTER_LOOKS.player` for unknown ids.

This is the one file with a pure, testable selector — TDD it.

- [ ] **Step 1: Write the failing test**

```ts
// components/cookgame/models/__tests__/palette.test.ts
import { describe, it, expect } from 'vitest';
import { CHARACTER_LOOKS, getCharacterLook, matteMaterialProps, PALETTE } from '../palette';

describe('palette', () => {
  it('matteMaterialProps is matte (low metalness, mid/high roughness)', () => {
    const m = matteMaterialProps('#abcabc');
    expect(m.color).toBe('#abcabc');
    expect(m.metalness).toBeLessThanOrEqual(0.1);
    expect(m.roughness).toBeGreaterThanOrEqual(0.6);
  });
  it('has distinct looks for player and the three buyers', () => {
    for (const id of ['player', 'doug', 'kim', 'pablo']) {
      expect(CHARACTER_LOOKS[id], id).toBeDefined();
    }
    const tops = ['doug', 'kim', 'pablo'].map((id) => CHARACTER_LOOKS[id].top);
    expect(new Set(tops).size).toBe(3); // visually distinct
  });
  it('getCharacterLook falls back to player for unknown ids', () => {
    expect(getCharacterLook('nope')).toBe(CHARACTER_LOOKS.player);
    expect(getCharacterLook('doug')).toBe(CHARACTER_LOOKS.doug);
  });
  it('PALETTE exposes the core scene colors', () => {
    for (const k of ['asphalt', 'sidewalk', 'grass', 'stucco', 'roof', 'soil', 'foliage']) {
      expect(PALETTE[k as keyof typeof PALETTE], k).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `./node_modules/.bin/vitest run components/cookgame/models/__tests__/palette.test.ts`
Expected: FAIL — cannot resolve `../palette`.

> Note: this test lives under `components/`, not `lib/`. Add `'components/cookgame/models/__tests__/**/*.test.ts'` to the `test.include` array in `vitest.config.ts` so it runs (mirror the existing `lib/cookgame/__tests__` glob entry).

- [ ] **Step 3: Implement `palette.ts`** (matte helper + palette + looks). Example shape — choose tasteful muted suburban hex values:

```ts
// components/cookgame/models/palette.ts
export const PALETTE = {
  asphalt: '#3f4146', sidewalk: '#9a9690', grass: '#6f8f4e',
  stucco: '#cdbfa6', sidingA: '#8a9aa3', sidingB: '#b0a48f', roof: '#5c4633',
  wood: '#7a5a3a', metal: '#8d9499', foliage: '#4d7a43', soil: '#4a3727',
  skyTop: '#9ec7e8', skyBottom: '#dce9f2',
} as const;

export function matteMaterialProps(color: string) {
  return { color, roughness: 0.85, metalness: 0.05 };
}

export interface CharacterLook {
  id: string; skin: string; hair: string; top: string; bottom: string; shoes: string; accent: string; cap: boolean;
}

export const CHARACTER_LOOKS: Record<string, CharacterLook> = {
  player: { id: 'player', skin: '#c79a73', hair: '#2b2118', top: '#3b6e4f', bottom: '#2f3540', shoes: '#1c1c1c', accent: '#d8a657', cap: true },
  doug:   { id: 'doug',   skin: '#caa17d', hair: '#6b4a2b', top: '#9c4a3b', bottom: '#41434a', shoes: '#2a2a2a', accent: '#e0c08a', cap: false },
  kim:    { id: 'kim',    skin: '#b98a64', hair: '#1f1a16', top: '#5566a8', bottom: '#33363d', shoes: '#3a2f2a', accent: '#d2d6dd', cap: false },
  pablo:  { id: 'pablo',  skin: '#a9794f', hair: '#11100e', top: '#6f5aa0', bottom: '#2b2e34', shoes: '#222', accent: '#caa84e', cap: true },
};

export function getCharacterLook(id: string): CharacterLook {
  return CHARACTER_LOOKS[id] ?? CHARACTER_LOOKS.player;
}
```

(The exact hexes are art — the values above are a muted starting point; keep them tasteful and suburban.)

- [ ] **Step 4: Run; expect pass**

Run: `./node_modules/.bin/vitest run components/cookgame/models/__tests__/palette.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Confirm no regression + commit**

Run: `./node_modules/.bin/vitest run lib/cookgame components/cookgame` → all green (90 logic + 4 palette).
```bash
git add components/cookgame/models/palette.ts components/cookgame/models/__tests__/palette.test.ts vitest.config.ts
git commit -m "feat(cookgame): suburban palette + matte material + character looks"
```

---

## Task 2: Daytime lighting rig

**Files:**
- Create: `components/cookgame/models/Lighting.tsx`
- Modify: `components/cookgame/CookGameGame.tsx`

**Interfaces:**
- Consumes: `palette` (sky tones).
- Produces: `<Lighting/>` — a warm key `directionalLight` (castShadow, tuned shadow camera bounds covering the ~40×40 town), a soft `ambientLight`/`hemisphereLight` fill using sky/ground tones, and a sky background (drei `<Sky>` OR a `color`/gradient via `scene.background`). No props needed for v1.

**Reference:** read `components/kowloon-knockout/arena/Lighting.tsx` for the rig pattern; re-tune from neon to warm daytime.

- [ ] **Step 1: Implement `Lighting.tsx`**

`"use client"`. Render: `<hemisphereLight>` (sky `PALETTE.skyTop`, ground `PALETTE.grass`, intensity ~0.6); a key `<directionalLight position={[12,18,8]} intensity={1.4} castShadow>` with `shadow-mapSize` 2048 and an orthographic shadow camera sized to cover ±22 in X/Z (`shadow-camera-left/right/top/bottom`, near/far). Add a soft `<ambientLight intensity={0.25} />`. For the sky, use drei `<Sky sunPosition={[12,18,8]} />` (already a dependency) OR set a gradient background — pick one and keep it cheap.

- [ ] **Step 2: Wire into `CookGameGame.tsx`**

Remove the inline `<ambientLight intensity={0.6} />` and `<directionalLight .../>` from `CookGameGame.tsx` and render `<Lighting/>` in their place (inside `<Canvas>`, outside `<Physics>` is fine). Keep `shadows` on the `<Canvas>`.

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/models/Lighting.tsx components/cookgame/CookGameGame.tsx` → clean.
Manual: `/cookgame` renders with warm daytime light + soft shadows + sky (no black/void background).

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/models/Lighting.tsx components/cookgame/CookGameGame.tsx
git commit -m "feat(cookgame): daytime suburban lighting rig + sky"
```

---

## Task 3: Character humanoid

**Files:**
- Create: `components/cookgame/models/Character.tsx`

**Interfaces:**
- Consumes: `palette` (`getCharacterLook`, `matteMaterialProps`), `CharacterLook`.
- Produces: `<Character lookId="player" moving={false} facing={0} />`
  - `lookId: string` — resolves via `getCharacterLook`.
  - `moving?: boolean` — drives walk vs idle animation.
  - `facing?: number` — yaw (radians) the body turns toward (consumer passes movement heading; default 0).
  - Renders an articulated humanoid sized so it stands ~1.7 units tall, **feet at local y=0** (so the consumer can place it at ground level). Imperative `useFrame` animation: idle = subtle bob + arm sway; walking = leg swing + slight body bob. No React state; refs only. Includes a soft blob shadow at the feet.

**Reference (adapt, don't copy verbatim):** `components/kowloon-knockout/arena/StickFighter.tsx` — same rig skeleton (root → `body` group [torso/head/arms] + `lLeg`/`rLeg` groups + blob shadow), same imperative `useFrame` damping pattern. Differences: drive from props (`moving`/`facing`), not a frames-ref; reduce states to idle/walking; re-skin with `CharacterLook` colors (jacket/hoodie torso, pants legs, shoes, head + optional cap) using `matteMaterialProps`; remove headband/nameplate/boxing poses.

- [ ] **Step 1: Implement `Character.tsx`**

Build the rig per the reference. Key behaviors:
- Resolve `const look = getCharacterLook(lookId)` once.
- `useFrame((state) => { ... })`: lerp `root.rotation.y` toward `facing`; if `moving`, swing `lLeg`/`rLeg` rotation.x by `Math.sin(t*9)` and bob the body; else idle bob (`Math.sin(t*2)*0.02`) + gentle arm sway. Use the StickFighter damping approach.
- Geometry: legs as tapered cylinders (pants color `look.bottom`) ending in shoe boxes (`look.shoes`); torso a slightly tapered cylinder/box (`look.top`) with an accent collar/zip (`look.accent`); head a sphere (`look.skin`) with hair cap (`look.hair`) and, if `look.cap`, a small cap (brim box + dome). Arms as cylinders (`look.top`) with hand spheres (`look.skin`). Feet at y=0; total height ~1.7.
- Blob shadow: `<mesh rotation={[-Math.PI/2,0,0]} position={[0,0.02,0]}><circleGeometry args={[0.4,16]}/><meshBasicMaterial color="#000" transparent opacity={0.3}/></mesh>`.

- [ ] **Step 2: Verify (in isolation)**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/models/Character.tsx` → clean.
(Visual check happens in Task 4 once it's mounted.)

- [ ] **Step 3: Commit**

```bash
git add components/cookgame/models/Character.tsx
git commit -m "feat(cookgame): reusable procedural Character (Kowloon rig re-skinned)"
```

---

## Task 4: Swap capsules → Character (player + buyers)

**Files:**
- Modify: `components/cookgame/world/PlayerController.tsx`
- Modify: `components/cookgame/npc/BuyerNPC.tsx`

**Interfaces:**
- Consumes: `<Character/>` (Task 3).

**Guardrail:** physics body, `CapsuleCollider`, all movement/store writes stay. Only the **visual child mesh** changes.

- [ ] **Step 1: Player**

In `PlayerController.tsx`, replace the visual capsule `<mesh><capsuleGeometry/>…</mesh>` (the child of the `RigidBody`, NOT the `CapsuleCollider`) with `<Character lookId="player" moving={...} facing={...} />`. The `RigidBody` origin is at the capsule center (~1.1 up); `Character` feet are at local y=0, so wrap it to offset feet to the body's base: `<group position={[0,-1.1,0]}><Character .../></group>` (match the existing capsule half-height). Drive `moving` from horizontal speed (`Math.hypot(vx,vz) > 0.1`) and `facing` from `Math.atan2(vx, vz)` using the velocity the controller already computes in `useFrame` (store these in refs and read them; do not add React state). If clean prop-threading from inside `useFrame` is awkward, keep a `useRef` for `{moving,facing}` and pass a tiny state via `useState` updated at most a few times/sec — but prefer the ref + reading pattern that avoids per-frame React renders.

- [ ] **Step 2: Buyers**

In `BuyerNPC.tsx`, replace the capsule-body + sphere-head meshes with `<Character lookId={buyerId} moving={false} facing={Math.PI} />` (buyers face roughly toward the street/player spawn). Keep the `<Interactable id={buyerId} position={position} />` exactly as-is. Place the character at the same world `position` (feet at y=0 on the ground — adjust the group so feet rest on the plane).

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK` → OK.
Run: `./node_modules/.bin/eslint components/cookgame/world/PlayerController.tsx components/cookgame/npc/BuyerNPC.tsx` → clean.
Manual: player is now a walking humanoid (legs swing when moving, idle bob when still, body turns to face movement); the three buyers are distinct standing humanoids; Press-E still works at each buyer (interaction unchanged).

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/world/PlayerController.tsx components/cookgame/npc/BuyerNPC.tsx
git commit -m "feat(cookgame): replace capsules with articulated Characters (player + buyers)"
```

---

## Task 5: Buildings

**Files:**
- Create: `components/cookgame/models/Building.tsx`
- Modify: `components/cookgame/world/TownScene.tsx`

**Interfaces:**
- Consumes: `palette`.
- Produces: `<Building variant="house"|"shop" position={[x,y,z]} size={[w,h,d]} rotation?={[...]} />` — a composed building (walls + pitched/flat roof + door + windows + trim), feet at the model's base. Pure visual; takes NO collider (the existing fixed-collider `RigidBody` in TownScene provides physics).

- [ ] **Step 1: Implement `Building.tsx`**

`"use client"`. Compose from boxes/prisms using `matteMaterialProps`:
- `house` (the lab/property): siding walls (`PALETTE.sidingA`), a pitched roof (two slanted boxes or a triangular-prism via a rotated box / `cylinderGeometry` 3-sided), a door (`PALETTE.wood`), 2–3 windows (`PALETTE.metal`/glass-ish with slight emissive or just a darker pane), trim. Size from `size` prop.
- `shop` (supplier): flat/parapet roof, a storefront face with a wider window and a signboard band (`PALETTE.accent`-ish), `stucco` walls. Size from `size` prop.
Center the model so it fills `size`; base at y=0 (consumer positions it).

- [ ] **Step 2: Wire into TownScene**

In `TownScene.tsx`, the lab + supplier are currently fixed-collider `RigidBody`s wrapping a single `<mesh><boxGeometry/></mesh>`. Keep each `RigidBody` + its cuboid collider, but replace the visual `<mesh>` child with the matching `<Building variant=... size=... />` sized to the existing collider box (lab `[6,3,4]` at `[8,1.5,-6]` → house; supplier `[5,3,4]` at `[-8,1.5,-6]` → shop). Ensure the Building's base aligns with the collider box (the collider is centered at y=1.5 with height 3, so the box spans y 0–3; position the Building so it visually fills that). Optionally make boundary walls read as fences/hedges later (Task 6) — leave the wall colliders here.

- [ ] **Step 3: Verify**

`tsc` grep cookgame → OK; `eslint` the two files → clean.
Manual: the lab looks like a small house and the supplier like a corner store; the player still collides with them exactly as before (can't walk through).

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/models/Building.tsx components/cookgame/world/TownScene.tsx
git commit -m "feat(cookgame): parametric house/shop buildings"
```

---

## Task 6: Ground, street & instanced street props

**Files:**
- Create: `components/cookgame/models/props/StreetProps.tsx`
- Modify: `components/cookgame/world/TownScene.tsx`

**Interfaces:**
- Consumes: `palette`.
- Produces: `<StreetProps/>` — instanced set dressing positioned around the block: a perimeter of fence/hedge segments just inside the boundary walls, a few streetlights, 1–2 trash cans. Uses drei `<Instances>`/instanced meshes for the repeated fence/streetlight geometry (one draw call each). Purely decorative — no colliders (boundary walls already block the player).

- [ ] **Step 1: Upgrade ground/street in TownScene**

Replace the flat `#1f2937` ground material with `PALETTE.grass`; keep the ground `RigidBody` + collider. Replace the decorative street strip with an `asphalt`-colored road plus a thin `sidewalk` border and simple dashed center-line (small light boxes or a texture-free striped set of thin planes). Keep everything at/under y≈0.02 to avoid z-fighting; these are visual only.

- [ ] **Step 2: Implement `StreetProps.tsx`**

`"use client"`. Use drei `<Instances>` for fence posts/panels around the ~±19 perimeter (inside the walls) and for streetlights at a few corners; add 1–2 trash-can meshes near buildings. Keep instance counts modest (a few dozen total). Matte materials from palette (`wood`/`metal`/`foliage`).

- [ ] **Step 3: Mount + verify**

Render `<StreetProps/>` inside the `TownScene` group. `tsc` grep cookgame → OK; `eslint` both files → clean. `vite build` → exit 0 (revert any pnpm-workspace.yaml noise).
Manual: the block reads as a lived-in suburban street (grass, road with markings, perimeter fence/hedge, streetlights); framerate stays smooth; player still bounded by the (now fence-dressed) walls.

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/models/props/StreetProps.tsx components/cookgame/world/TownScene.tsx
git commit -m "feat(cookgame): suburban ground/street + instanced street props"
```

---

## Task 7: Station models — supplier, mixing bench, packaging

**Files:**
- Create: `components/cookgame/models/stations/SupplierStallModel.tsx`
- Create: `components/cookgame/models/stations/MixingBenchModel.tsx`
- Create: `components/cookgame/models/stations/PackagingModel.tsx`
- Modify: `components/cookgame/world/TownScene.tsx`

**Interfaces:**
- Consumes: `palette`.
- Produces three components, each a self-contained prop ~1–1.5 units, base at y=0, no props needed beyond optional `position`/`rotation` (consumer places them on the existing anchors). Pure visual; the existing `Interactable`s (mounted in `CookGameGame`) already cover interaction at these anchors.

- [ ] **Step 1: Implement the three models**

- `SupplierStallModel` (anchor `STATION_POSITIONS.supplier`): a market stall / shop counter — counter box (`wood`), a striped awning (a tilted box, accent stripes), a couple of crate/box props and shelf with small goods.
- `MixingBenchModel` (anchor `STATION_POSITIONS.mixing`): a workbench (`wood` top, `metal` legs) with a mixing apparatus on top — a bowl/mortar shape (cylinder + sphere) and a few small jars (`accent`-tinted). Abstract, satirical, no real apparatus.
- `PackagingModel` (anchor `STATION_POSITIONS.packaging`): a table with a small scale (box + arm), a roll/stack of baggies (small flat boxes), and a tape dispenser blob.

Each from boxes/cylinders/spheres with `matteMaterialProps`.

- [ ] **Step 2: Wire into TownScene**

Replace the three colored cube station markers (the green/magenta/amber `<mesh>` boxes at the supplier/mixing/packaging anchors) with the corresponding models at the SAME anchor positions. Do not touch the `Interactable`s in `CookGameGame`.

- [ ] **Step 3: Verify**

`tsc` grep cookgame → OK; `eslint` the new + TownScene files → clean.
Manual: walking to each station shows a recognizable prop (stall / bench / packing table) instead of a cube; Press-E opens the correct overlay at each.

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/models/stations/SupplierStallModel.tsx components/cookgame/models/stations/MixingBenchModel.tsx components/cookgame/models/stations/PackagingModel.tsx components/cookgame/world/TownScene.tsx
git commit -m "feat(cookgame): supplier stall, mixing bench, packaging station models"
```

---

## Task 8: Station models — grow plots (stage-aware), drying rack, chem station

**Files:**
- Create: `components/cookgame/models/stations/GrowPlotModel.tsx`
- Create: `components/cookgame/models/stations/DryingRackModel.tsx`
- Create: `components/cookgame/models/stations/ChemStationModel.tsx`
- Modify: `components/cookgame/world/TownScene.tsx`

**Interfaces:**
- Consumes: `palette`, `types` (`GrowStage`), `useCookgameStore` (read-only, for plot stage).
- Produces:
  - `<GrowPlotModel stage={GrowStage} position={...} />` — **pure view**: a planter box (`wood`) full of `soil`, with a plant mesh that scales with `stage`: `empty` → bare soil; `seedling` → tiny sprout; `vegetative` → bushier mid plant; `flowering` → full leafy plant with buds (small `accent`/`foliage` spheres). Reads NOTHING from the store itself.
  - `<DryingRackModel position={...} />` — a frame (`wood`/`metal`) with a few hanging bundles.
  - `<ChemStationModel position={...} />` — a lab bench with abstract glassware (a flask = cone via `coneGeometry`/cylinder, a beaker = short cylinder, a stand) tinted with slight `accent` translucency. Satirical/abstract; no real chemistry depicted.

- [ ] **Step 1: Implement the three models**

Build per the interfaces above with `matteMaterialProps`. For `GrowPlotModel`, switch on `stage` to choose the plant submesh (keep four clear visual tiers).

- [ ] **Step 2: Wire into TownScene (stage-aware plots)**

The three grow-plot markers are currently static cubes at `PLOT_POSITIONS`. Replace each with a small store-subscribed wrapper so the plant reflects live stage:

```tsx
function PlotVisual({ index, position }: { index: number; position: [number,number,number] }) {
  const stage = useCookgameStore((s) => s.inventory.plots[index]?.stage ?? 'empty');
  return <GrowPlotModel stage={stage} position={position} />;
}
// ...render {PLOT_POSITIONS.map((p,i) => <PlotVisual key={i} index={i} position={p} />)}
```

Replace the drying-rack and chem-station cube markers with `<DryingRackModel position={DRYING_POSITION}/>` and `<ChemStationModel position={CHEM_POSITION}/>`. Leave the `Interactable`s in `CookGameGame` untouched. (`TownScene` will now import `useCookgameStore` — that's the single allowed world-layer store *read*, no writes.)

- [ ] **Step 3: Verify**

`tsc` grep cookgame → OK; `eslint` the new + TownScene files → clean.
Manual: plant a plot and tend it — the plot's plant visibly grows through seedling→veg→flower and resets on harvest; drying rack and chem station read as proper props; all Press-E interactions unchanged.

- [ ] **Step 4: Commit**

```bash
git add components/cookgame/models/stations/GrowPlotModel.tsx components/cookgame/models/stations/DryingRackModel.tsx components/cookgame/models/stations/ChemStationModel.tsx components/cookgame/world/TownScene.tsx
git commit -m "feat(cookgame): stage-aware grow plots, drying rack, chem station models"
```

---

## Task 9: Full-scene verification & polish

**Files:**
- Modify: any cookgame world file (only if a wiring/visual gap surfaces)

- [ ] **Step 1: Full gates**

Run, expecting all green:
```bash
./node_modules/.bin/vitest run lib/cookgame components/cookgame   # 90 logic + 4 palette, all pass
./node_modules/.bin/tsc -p tsconfig.json --noEmit 2>&1 | grep -i cookgame || echo OK
./node_modules/.bin/eslint components/cookgame lib/cookgame
./node_modules/.bin/vite build   # exit 0; revert pnpm-workspace.yaml noise, don't commit it
```

- [ ] **Step 2: Manual end-to-end walkthrough**

On `/cookgame`: walk the block (humanoid animates), confirm cohesive daytime suburban look (house + shop buildings, road/sidewalk/grass, fences/streetlights, soft shadows, sky). Visit every station — supplier/mixing/packaging/grow×3/drying/chem all show proper models and open the right overlay on E. Plant→tend a plot and watch the plant grow through stages. Sell to a buyer. Confirm nothing about pricing/heat/save/interaction changed.

- [ ] **Step 3: Performance sanity**

Confirm smooth framerate with all models + instanced props on screen. If a prop is heavy, reduce its instance count / segments. Note (don't silently cap) any reduction.

- [ ] **Step 4: Senior review (studio convention — before PR)**

Dispatch the `senior-swe-reviewer` agent on the branch diff; address findings.

- [ ] **Step 5: Commit any polish**

```bash
git add components/cookgame
git commit -m "fix(cookgame): model overhaul end-to-end polish"
```

---

## Self-Review Notes (coverage vs spec)

- Spec §2 guardrails (visual-only, anchors/colliders/logic unchanged) → enforced in every task (Tasks 4/5/7/8 explicitly keep colliders + `Interactable`s; logic untouched; gates re-run the 90 tests).
- Spec §3 art direction (muted suburban, matte) → Task 1 palette + applied everywhere.
- Spec §4 architecture/files → Tasks 1 (palette), 2 (Lighting), 3 (Character), 5 (Building), 6 (props), 7–8 (stations); consumers modified in Tasks 2/4/5/6/7/8.
- Spec §4.1 character rig reuse → Task 3 (adapts Kowloon StickFighter). §4.2 stage-aware grow plot (pure view + store-subscribed wrapper) → Task 8.
- Spec §5 performance (instancing, low poly, blob shadows) → Tasks 3 (blob shadow), 6 (instances), 9 (perf sanity).
- Spec §6 testing (palette unit test; gates; manual) → Task 1 test, verify steps in every task, Task 9 full gates + senior review.
- Pure logic untouched → no `lib/cookgame` changes anywhere; 90 tests stay green.
- Deferred (spec §7): day–night cycle (Phase 3), authored GLB, mobile, heavy post-processing, gameplay phases 3–6.
```
