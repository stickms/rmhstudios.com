# Harmonic — architecture

How Harmonic sits on the engine. Facts about the engine below were checked against
the code on 2026-10-31 (file:line references are to that base; re-check if they drift).

## 1. Pipeline

```
lib/harmonic-game/levels/h1_whiteout.ts   (LevelSource: brushes, entities, materials — TypeScript)
        │  compileLevel()                  lib/harmonic-game/compiler/
        ▼
in-memory BspFile + MapManifest-shaped material table + procedural textures
        │
        ├─► SpWorld.create({ game: 'hl2', bsp, assets: harmonicAssets })   (simulation, unchanged)
        │       └─ MapCollision(bsp)                                       (traces, unchanged)
        ├─► WorldRenderer({ bsp, manifest, textures: proceduralCache })    (drawing, unchanged)
        └─► EntityRenderer({ models: proceduralModelLibrary })             (entities, unchanged)
                 ▲
lib/harmonic-game/client/harmonic-client.ts   (loadLevel = sp-client.ts's, minus the HTTP package)
components/harmonic-game/HarmonicPlayPage.tsx → components/tf2-game/GameCanvas.tsx
app/routes/harmonic.tsx
```

## 2. Module map (`lib/harmonic-game/`)

| Path         | What                                                                                                                                 | WP          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `CLAUDE.md`  | Agent guide for this directory: points at this plan, the conventions below.                                                          | H0.1        |
| `index.ts`   | Public entry: `HARMONIC_LEVELS`, `compileLevel`, `createHarmonicClient` (re-exports).                                                | H0.1        |
| `levels/`    | One `LevelSource` per chapter + `dev_box.ts`; `index.ts` lists them in order with chapter keys.                                      | H0.4, H4.\* |
| `compiler/`  | `types.ts` (LevelSource DSL), `brush.ts` (planes → convex polygons), `bsp-build.ts` (BspFile), `kd.ts`.                              | H0.2        |
| `assets/`    | `textures.ts` (procedural canvas textures), `materials.ts`, `models/` (procedural three.js models), `harmonic-assets.ts` (SpAssets). | H0.3, H2.4  |
| `sim/`       | Harmonic-only entities and services: weapons, damage, cold, phase layers, enemies, the Tuner.                                        | H1._, H2._  |
| `narrative/` | Dialogue/subtitle runner, radio, chapter flags (Sana helped, Voss spared), endings.                                                  | H3.\*       |
| `audio/`     | WebAudio synthesis: SFX bank, ambient beds, the music layers.                                                                        | H3.3        |
| `client/`    | `harmonic-client.ts`, view model renderer, HUD state adapter, save slots.                                                            | H0.4, H1.4  |

React lives in `components/harmonic-game/`; strings in `locales/en/harmonic.json`.

## 3. The level compiler (H0.2)

### 3.1 Source DSL (`compiler/types.ts`)

```ts
type Vec3 = { x: number; y: number; z: number };        // Source units (inches), Z up
interface Face { material: string; uScale?: number; vScale?: number; uShift?: number; vShift?: number; rotation?: number }
interface BrushSource {
  /** Either an AABB or ≥4 half-space planes (normal·p ≤ dist) for a convex solid. */
  box?: { min: Vec3; max: Vec3 };
  planes?: { normal: Vec3; dist: number }[];
  material: string;                     // default face material
  faces?: Partial<Record<'top'|'bottom'|'north'|'south'|'east'|'west', Face>>; // box overrides
  contents?: 'solid' | 'playerclip' | 'water' | 'window' | 'ladder'; // → CONTENTS_*
  layer?: 'both' | 'past' | 'present';  // phase layers (H2.1); 'both' default
}
interface EntitySource { classname: string; origin?: Vec3; angles?: Vec3; keys?: Record<string, string>;
  /** Brushes owned by this entity (func_door, func_brush, trigger_*): compiled to models[n], key model="*n". */
  brushes?: BrushSource[]; outputs?: string[] /* Source I/O "OnTrigger target,Input,param,delay,times" */ }
interface LevelSource { id: string; title: string; sky?: string; fog?: {...}; world: BrushSource[]; entities: EntitySource[] }
```

Helpers in `compiler/shapes.ts`: `box`, `room` (hollow box with wall thickness and door
gaps), `stairs`, `ramp`, `cylinderish` (n-sided prism), `wedge`. Levels compose these.

### 3.2 What the compiler emits (from the engine recon)

- **Collision** (`MapCollision` constructor, `map-collision.ts:266-412` reads only these):
  `planes`, `nodes`, `leafs` (`firstLeafBrush`/`numLeafBrushes`), `leafBrushes`, `brushes`
  (`firstSide`, `numSides`, `contents`), `brushSides` (`planeNum`, `texInfo`, `bevel`),
  `texInfo[].flags` + `texData[].name`, `models[]` (`headNode`, mins/maxs), `entities`,
  `dispInfos: []`. Add the six axial **bevel** planes to every brush (Source's
  `AddBrushBevels`) so box traces are exact at edges.
- **Tree:** a kd-tree over brush AABBs (leaf ≤ 8 brushes, brush listed in every leaf it
  overlaps — traces dedupe via `brushCheck`). Children encode leaves as `-(leaf+1)`;
  `headNode = -1` is a valid single-leaf world for tiny levels and tests. Each brush
  entity's model gets its own subtree (`placeBrushEntities`, `map-collision.ts:416-428`).
- **Render faces** (`world-geometry.ts:265-510`): for every brush side that is not
  `nodraw`, clip the plane against the brush's other planes into a polygon; emit
  `vertexes`, `edges`, `surfEdges`, `faces` (`planeNum`, `side`, `firstEdge`, `numEdges`,
  `texInfo`, `lightOfs = -1`), `texInfo` (`textureVecs` from the face's u/v axes and
  scale), `texData` (`name`, `reflectivity`, `width`, `height`), `models[n].firstFace/
numFaces`, `leafFaces` + `leafs.firstLeafFace/numLeafFaces`, `leafs.cluster = 0`,
  `leafs.area = 0`. Hidden faces (sides fully covered by another brush) may be culled
  later (H5.2); phase 0 draws them.
- **Empty**: `lighting`, `lightingHdr` (empty `Uint8Array`: fullbright via the white-luxel
  path, `lightmap.ts:205,233-281`), `visibility: null` (all visible), `overlays`,
  `staticProps: null`, `cubemaps`, `gameLumps`, `pakfile`.
- **Entities**: `BspEntity[]` built like `formats/keyvalues.ts` builds them
  (`brushModelIndex` from `model "*N"`), plus `entityText` serialised for anything that
  reads the raw lump. Always emit `worldspawn` first.

`compileLevel(src) → { bsp: BspFile; manifest: MapManifest; textures: ProceduralTextureSet; stats }`.
Determinism: same source → byte-identical arrays (tests compare hashes).

## 4. Assets (H0.3, H2.4)

- **Textures:** `assets/textures.ts` draws each material's texture on an `OffscreenCanvas`
  (noise, rust, paint, ice, snow, steel plate, rivets, grating, signage glyphs) from a
  seeded generator; `toBlob('image/webp')` → `blob:` URL. A `TextureCache` whose `url()`
  maps the manifest's `tex/<40hex>.webp` names to those blob URLs (`texture-cache.ts:135-160`
  fetches then `createImageBitmap`) is handed to `WorldRenderer`. The 40-hex id is the
  SHA-1 of the generator recipe JSON, so a recipe change is a new texture.
- **Materials:** `manifest.materials[normalizeMaterialName(name)] = { shader, color, base }`
  (`map-manifest.ts:35-83`). A material with only `color` draws flat, which is the
  phase-0 fallback while canvases generate.
- **Models:** procedural three.js `Object3D` builders in `assets/models/` (characters as
  jointed capsules with a named bone hierarchy, weapons, props). They reach
  `EntityRenderer` through a `ModelLibrary` constructed with an in-memory `index` and a
  stub `loader.loadAsync()` returning `{ scene, animations, parser: { getDependencies } }`
  (`model-asset.ts:303-362`). Animations are `AnimationClip`s built in code.
- **SpAssets:** `harmonic-assets.ts` implements `SpAssets` (`lib/sp-game/assets.ts:67`):
  `model()` returns code-authored `SpModelInfo` (box hulls, sequences by name), `material()`
  maps material names to surface props (`metal`, `ice`, `snow`, `wood`, `glass`).

## 5. Simulation additions (H1, H2)

All in `lib/harmonic-game/sim/`, registered with `registerSp(ctor, classname)`
(`lib/sp-game/entities/base.ts:27`). The engine's existing entities do the scripting:
`trigger_*`, `func_door*`, `func_brush`, `logic_relay/auto/timer/case/branch`,
`math_counter`, `point_template`, `env_fade/shake`, `game_text`, `ambient_generic` —
all available today and driven by `outputs` in the level source.

- **Combat (H1.1–H1.3):** `HarmonicCombat` service attached to the world: hitscan via
  `world.mapCollision.traceLine` + entity hit tests, `DamageInfo` from
  `tf2-game/sim/damage`, `SpPlayer.takeDamage` for the player. Weapons are `harmonic_weapon_*`
  entities the player picks up; inventory + switching read `cmd.weaponSelect` (present on
  the command, unused by SP today).
- **Cold (H1.2):** player exposure meter; drains outdoors (`trigger_harmonic_exposure`
  volumes mark shelter/outdoor), refills in shelters and near heaters; at zero it ticks
  health.
- **Phase layers (H2.1):** every entity and brush entity has a `layer`; the world has a
  `currentLayer` for the player. Brushes of the other layer are `func_brush` models
  toggled non-solid and drawn as a translucent ghost when the player "listens". Shifting
  a tagged object flips its layer. Enemies out of layer ignore damage.
- **AI (H2.2–H2.3):** a small state-machine brain per enemy (`idle → alert → engage →
search`), line-of-sight with traceLine, movement with the engine's `SpPlayer`-style
  ground movement or straight-line steering on authored `path_corner` / `info_node`
  graphs (A\* over `info_node` links; `lib/sp-game/ai/actor.ts` is the base).
- **Hooks into SpWorld:** if a needed hook does not exist, add an **optional, additive**
  hook to `SpWorld` (e.g. `onTick?: (w) => void` in `SpWorldInit`) in the WP that needs it,
  documented in `docs/tf2-game.md`, with a test proving HL2/Portal behaviour is unchanged.

## 6. Narrative (H3)

- `narrative/script.ts`: chapter scripts as data — `{ id, trigger: 'output' | 'enter',
lines: [{ speaker, key, defaultValue, durationMs }], then?: Output[] }`, fired by an
  `harmonic_dialogue` point entity's `Start` input so levels drive them with plain I/O.
- Subtitles render in the HUD. Every line is `t('harmonic:ch4.workshop.03', { defaultValue })`;
  keys are stable forever (changing a shipped English line = new key, repo `CLAUDE.md` §5a).
- Chapter flags (`sanaHelped`, `vossSpared`, `ending`) live in the save; endings read them.

## 7. Client and UI (H0.4, H1.4, H6)

- `client/harmonic-client.ts` follows `sp-client.ts` `loadLevel` (`sp-client.ts:230-300`)
  but builds `{ bsp, manifest }` with `compileLevel` instead of `loadMapPackageForClient`,
  uses the procedural `TextureCache` and `ModelLibrary`, and adds the Harmonic HUD
  state. It mounts through `components/tf2-game/GameCanvas.tsx` like HL2 does.
- `components/harmonic-game/HarmonicPlayPage.tsx`: main menu (New game, Continue, Chapters,
  Options, Credits), loading screen, pause menu, HUD (health, cold, ammo, Tuner charge,
  subtitles). `AppShell` + `--app-*` tokens; one signal button per view.
- Saves: per-chapter start + flags in `localStorage` (`client/save.ts`, modelled on
  `lib/tf2-game/client/sp-save.ts`, its own key prefix `harmonic:`).

## 8. Tests

- Suite: `pnpm test:tf2` — `vitest.tf2.config.ts` gets `'lib/harmonic-game/**/*.test.ts'` (H0.1).
- Headless worlds: `SpWorld.create({ game: 'hl2', mapName, bsp, assets })` runs in Node
  (Rapier compat inlines its wasm); drive it with `Driver` from
  `lib/sp-game/sp-driver.test-support.ts`. Every level gets a smoke test: compiles,
  player spawns on ground, scripted path is walkable (`Driver.walkTo`), no stuck spots at
  spawns, every output target exists.
- The compiler gets exact tests: a box room's planes/brushes/sides; trace hits at known
  fractions; `pointContents`; brush entity models; determinism hash.
- Browser checks (not in CI): `scripts/harmonic/play-smoke.ts` (H0.4) — Playwright opens
  `/harmonic`, starts the dev level, screenshots.
