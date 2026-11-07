# Kowloon Knockout — Source-engine fighter models (design)

Status: approved by the owner in conversation, 2026-11-07. Small-change design.

## Intent
Let players fight as Source-engine characters (TF2, CS:GO, HL2, Portal) whose
converted GLBs already live in R2, and stop the animated Y-Bot being replaced by
the procedural low-poly `StickFighter`.

## Goals
- A fighter-model roster (Y-Bot default + Source models), filtered to what R2 has.
- A Model picker on character select; the preview renders the real model.
- Choice persisted locally and carried per seat in multiplayer (server-validated).
- Boxing animations (jab/cross/hook/uppercut/block/hit/stunned/ko) authored as
  rest-pose bone-offset clips on Source skeletons; native idle/walk used when the
  model provides them.
- `StickFighter` only when a model genuinely cannot load.

## Non-goals / anti-goals
- No runtime Mixamo→Source retargeting. No new R2 uploads or converter changes.
- No change to sim, hit detection or balance — render-only.
- Must not make the default Y-Bot experience worse.

## Approaches considered
1. **Authored bone-offset clips per skeleton family (chosen).** Small data library,
   bone map per family, offsets from rest pose sidestep rest-pose mismatch.
2. Offline-baked GLB clips uploaded to R2 — needs tooling/write access, same result.
3. Runtime Mixamo retarget — distorts limbs where rest poses differ.

## Design
- `lib/kowloon-knockout/render/fighter/models.ts`: roster, ids, `isFighterModelId`,
  default; URL builders against `/api/<game>-game/assets/...` / tf2 model routes.
- `.../boneMaps.ts`: logical humanoid joints → bone names per family
  (`tf2`, `valvebiped` for HL2/Portal, `csgo`), resolved case-insensitively.
- `.../sourceClips.ts`: pure pose library → `THREE.AnimationClip`s on a resolved rig.
- `SkeletalFighter` takes a model id; Y-Bot path unchanged; Source path builds
  clips from the pose library.
- `Fighter.tsx`: no stick fallback on low tier or during Suspense; retry then stick on real failure.
- `FighterPreview3D` uses the real fighter component.
- Store + net protocol + socket handler carry/validate `model` per seat.

## Left to the builder / known limits
- R2 contents and exact HL2/Portal/CS:GO bone names can't be inspected from the
  build sandbox; bone maps follow the converter's conventions and are tested on
  fixture skeletons. Roster entries absent from R2 are hidden at runtime.
