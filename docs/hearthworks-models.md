# Hearthworks character models

Hearthworks draws every person (the player, customers, farmhands, the police, other players, the wardrobe preview)
through one component, `SkinFigure` (`components/hearthworks/scene/SkinFigure.tsx`). If the skin has a **skinned
glTF model** and it has loaded, the person is that model with real skeletal animation. Otherwise it is the
**procedural figure** (`Figure.tsx`, built from `lib/hearthworks/skins/looks.ts`). The fallback is automatic and
total, so the game is complete with no model files at all.

Models are produced by the Source-engine converter (`scripts/hearthworks/source-import`, separate from this
runtime) and shipped as static files under `public/models/hearthworks/`.

## The contract

`public/models/hearthworks/manifest.json`:

```json
{
  "version": 1,
  "models": {
    "<skinId>": {
      "file": "<skinId>.glb",
      "height": 1.8,
      "yaw": 0,
      "handBone": "<right hand bone name>",
      "bytes": 123456,
      "provenance": "valve-source",
      "clips": { "idle": "<animation name>", "walk": "...", "run": "...", "jump": "...",
                 "fall": "...", "shoot": "...", "reload": "...", "hurt": "...", "death": "...", "interact": "..." }
    }
  }
}
```

- `<skinId>` is a key of `SKINS` in `lib/hearthworks/skins/catalog.ts`. Unknown ids are ignored.
- `file` is a bare file name beside the manifest (`[A-Za-z0-9._-]+.glb`); paths and URLs are rejected.
- `height` is metres standing in the GLB; `yaw` is radians added so the model faces +Z; `handBone` is the right-hand
  bone name or `null`; `provenance` is `valve-source` or `stand-in`.
- `clips` maps a logical clip to an animation name inside the GLB. **`idle` and `walk` are required**; the rest are
  optional (`null`/absent = the model lacks it).
- Optional extension (not required by v1): `hold: { pos?: [x,y,z], rot?: [x,y,z] }` nudges a held prop after it has
  been aligned to the hand (world units, radians).
- The GLB is glTF Y-up, metres, origin at the feet, facing +Z, skinned, and may use `EXT_meshopt_compression`
  (**not Draco**). Textures are treated as sRGB; surfaces are forced matte (metalness ≤ 0.1, roughness ≥ 0.7) to match
  the diorama. Lights and cameras in the file are dropped.

The manifest is validated per entry with zod (`lib/hearthworks/skins/model-manifest.ts`): a bad entry is dropped, a
wrong `version`, a 404 or invalid JSON means "no models". Nothing here ever throws.

## Clip fallbacks

A model that lacks a clip uses the first available in its chain:

| asked for | chain |
| --- | --- |
| `run` | run → walk → idle |
| `walk` | walk → idle |
| `shoot`, `reload`, `interact`, `hurt` | itself → idle (the one-shot is simply skipped: the body keeps doing what it was) |
| `death` | death → hurt → idle (with no clip at all the model topples over) |
| `jump`, `fall` | itself → idle |

A name in the manifest that the GLB does not actually contain counts as missing. A GLB without `idle` or `walk`, or
with nothing skinned in it, is refused and the procedural figure is used.

## How it animates

`lib/hearthworks/skins/animator.ts` (`CharacterAnimator`, one `AnimationMixer` per person) turns a plain mutable
`FigureDrive` (`speed`, `air`, `dead`, `busy`, `triggers`) into action weights. The owner fills the drive every frame:

- **Locomotion:** `locomotionBlend(speed)` from `lib/hearthworks/avatar/controller.ts` gives idle/walk/run weights.
  Walk and run share one stride phase, advanced by `strideCadence(speed)`, so the playback rate follows the ground
  speed (feet do not skate) and the two clips' feet land together while they blend. Weights are smoothed, so a speed
  that jumps does not pop.
- **Air:** `jump` / `fall` replace locomotion while the avatar rises or drops (vertical velocity with hysteresis,
  `airFromVelocity`). Each restarts from its first frame.
- **One-shots:** `shoot`, `reload`, `hurt`, `interact` play once on top and fade out; a newer one interrupts the
  older. They come from world events (`components/hearthworks/scene/figure-events.ts`: your shots, reloads, wounds
  and chores; an officer's shots and wounds). `busy` (a farmhand working) keeps replaying `interact`.
- **Death:** plays once and holds its last frame (a downed player; a fallen officer lies where it fell for a few
  seconds).
- All envelopes are exponential approaches, so a state flipped mid-blend turns around from where it is.
- Held props (the sidearm) ride `handBone`, rotated by the inverse of the bone's own rotation so they sit upright and
  point forward whatever the converter's bone axes are; without a hand bone they hang at the hip.

**Size:** a model is scaled so its `height` equals the procedural figure's height (`figureWorldHeight` in
`lib/hearthworks/skins/figure-scale.ts`, ≈ 0.38 world units × the skin's `look.height`), keeping the contract of a
person ≈ 0.4 tile and a door 0.44. Change `FIGURE_SCALE` there, not in a model.

## Who is a model, who is procedural

One registry per scene (`FigureRegistry`, mounted as `FigureSystem` in `Scene.tsx`) holds every person and is advanced
by **one** `useFrame` for the whole crowd. Every few ticks per second it ranks people by distance to the camera focus
(`planBudget`, `figure-budget.ts`):

| tier | what | default |
| --- | --- | --- |
| full | mixer updates every frame | nearest 24 |
| slow | mixer updates every 0.1 s | next 16 |
| frozen | holds its last pose (off-screen, or past the slow ring) | up to 48 models in all |
| proc | procedural figure | everyone beyond |

The player's own avatar and the wardrobe preview are *pinned*: always a full-rate model. A model at the edge keeps its
place for a few ranks of hysteresis so the edge does not flicker. A person is only downloaded when it earns a model.

Memory: one GLB per skin is loaded once; each person is a `SkeletonUtils.clone` that shares geometry, materials and
textures and owns only its skeleton. Templates are reference counted and evicted least-recently-used past 10 models /
48 MB (`model-loader.ts`); instances dispose their skeleton and mixer on unmount. At most two downloads run at once,
the player's own skin jumps the queue.

Models are **not** used (procedural everywhere) when the site is in its low-performance tier (`html.perf-lite`), when
`navigator.deviceMemory` ≤ 2, when `localStorage['hw-models'] === 'off'`, after a lost WebGL context, for a skin whose
model threw while rendering (an error boundary marks it bad for the visit), and for anyone past the budget.

## Adding a skin

1. Add the skin to `lib/hearthworks/skins/catalog.ts` (and a stand-in look in `looks.ts`) if it is new.
2. Convert the model to a GLB meeting the contract and put `<skinId>.glb` in `public/models/hearthworks/`.
3. Add its entry to `manifest.json` with at least `idle` and `walk`. Add `run`, `jump`, `fall`, `shoot`, `reload`,
   `hurt`, `death`, `interact` as the source has them; anything missing falls back as above.
4. If a held prop sits wrongly in the hand, set `hold.pos` / `hold.rot` for that entry.
5. Look at it: wardrobe preview (idle → walk → run turntable), then the third-person view with the shot, hurt and
   death events.

## Testing

Unit tests (`lib/hearthworks/skins/__tests__/`) build a small skinned, animated character **in code**
(`fixture-model.ts`; `fixture-glb.ts` exports it with `GLTFExporter` so the real GLTFLoader path is tested). No Valve
content is committed. They cover manifest validation, clip fallback, the blend weights and playback rates, one-shots,
death, mixer disposal, the budget and registry, motion estimation for other players, and model loading, cloning and
cache eviction. For a browser check, serve a standalone Vite page that mounts `Scene`/`SkinPreview` with the fixture
GLBs and a manifest in its public dir, and screenshot with Playwright + swiftshader.
