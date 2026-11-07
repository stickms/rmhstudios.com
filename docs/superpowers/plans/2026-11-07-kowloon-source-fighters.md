# Kowloon Source Fighters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Selectable Source-engine fighter models (TF2/CS:GO/HL2/Portal from R2) with authored boxing animations, and no more stick-figure overriding the animated Y-Bot.

**Architecture:** A pure roster module + bone maps + authored pose library build `AnimationClip`s on any Source skeleton from rest-pose offsets. A `SourceFighter` renderer loads GLBs through the existing Tf2GLTFLoader and `modelFrame`. The chosen model id rides on seats through the store, net protocol and socket handler.

**Tech Stack:** React 19, @react-three/fiber, three, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-kowloon-source-fighters-design.md`

## Global Constraints
- Render-only: no change to `lib/kowloon-knockout/game/**` sim or balance.
- Never import `.server` modules from client code; user-facing strings via `t()` with `defaultValue`.
- `pnpm exec tsc --noEmit` and `pnpm test <paths>` pass; CI is not a gate for this work (owner instruction).

## Review Focus
- Unknown/forged model id from a peer → coerced to the default (`sanitizeFighterModelId`).
- Model absent from R2 → hidden from picker; a seat that still names it falls back to Y-Bot, not stick.
- Skeleton missing some bones (no fingers/jaw) → clips skip them, never throw.
- Bone order/case differences (`ValveBiped.Bip01_R_UpperArm` vs `bip_upperArm_R`) → resolved case-insensitively.
- Load failure → retried once, then `StickFighter`; low tier never forces `StickFighter`.

## Tasks
### PR 1 — Stop the override + roster
- [ ] `lib/kowloon-knockout/render/fighter/models.ts`: `FighterModelId`, `FIGHTER_MODELS`, `DEFAULT_FIGHTER_MODEL='ybot'`, `sanitizeFighterModelId(raw: unknown): FighterModelId`, `availableFighterModels(avail)`; test in `models.test.ts`.
- [ ] `Fighter.tsx`: low tier and Suspense show Y-Bot/none, stick only after a real failure (one retry); extract the decision into pure `chooseFighterView` with tests.
### PR 2 — Source rig + clips
- [ ] `boneMaps.ts` (`JOINTS`, `resolveRig`), `sourcePoses.ts`, `sourceClips.ts` (`buildSourceClips`), tests on fixture skeletons.
- [ ] `SourceFighter.tsx` + roster loading hook `useFighterRoster`.
### PR 3 — Picker + multiplayer
- [ ] Store `selectedModel` (persisted), `SeatConfig.modelId`, `RenderFighter.modelId`, protocol/lobby/match seats, socket handler validation, CharacterSelect picker, preview uses real fighter, i18n keys.
