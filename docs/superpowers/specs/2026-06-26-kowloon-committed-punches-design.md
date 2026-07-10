# Kowloon Knockout — Animation-Committed Punches — Design Spec

> Date: 2026-06-26. A combat-feel + animation-correctness change to the Kowloon Knockout fighting game, surfaced by browser testing of the Phase 4 skeletal characters. Touches the deterministic combat sim, input, the render snapshot, and the skeletal renderer.

## Problem

After Phase 4 added skeletal Mixamo animations, fighters frequently snap to **T-pose** and punch animations "only play for a second." Root cause is a **timing mismatch**, not a render glitch:

- A punch's sim state lasts `Math.max(4, floor(speed / punchSpeed))` frames ≈ **jab 8 / cross 14 / hook 15 / uppercut 20 frames** (0.13–0.33s at the sim's 60 Hz). The Mixamo clips are ~1 s (~60 frames). So the sim flips back to `idle` after ~15% of the clip; the renderer crossfades out mid-punch, and rapid `idle↔punch` churn produces bind-pose (T-pose) flashes.
- Because the punch window is so short, a new punch can start almost immediately — that is the "spam."
- The same too-short-window issue affects the **hit reaction** (`hit` state = 12 frames ≈ 0.2 s) and KO, so those one-shots also get cut off / T-pose.

## Goal

Make punches **animation-committed**: throwing a punch locks the fighter into it for the punch's full window (no spam), the hit still lands quickly (snappy), a buffered punch fires responsively when the window ends, and every one-shot animation (punch/hit/KO) plays through cleanly without T-posing. The combat sim stays deterministic and identical on both networked clients.

## Design

### 1. Sim — commit window (deterministic)
- New per-punch **commit window** (total frames the fighter stays in `punching`), tunable, preserving the jab < cross < hook < uppercut ordering. Starting values at 60 Hz:
  `PUNCH_COMMIT_FRAMES = { jab: 28, cross: 31, hook: 34, uppercut: 37 }` (≈0.47–0.62 s).
- **Hit stays snappy:** the active hit frame remains early in the window — `hitFrame(punch) = floor(commit * 0.25)` (≈7–9 frames, 0.12–0.15 s startup). The punch *connects* fast; only the recovery/lock is extended. This is what removes spam without making hits feel laggy.
- `startPunch` is unchanged in its guard (only fires from idle/walking/blocking), so it already blocks overlapping punches; the longer window means the lock is now meaningful.
- The `punching` case in `advanceFighterState` ends the state at `punchFrame >= commit` instead of the old short `dur`. `isHitFrame` returns true on `punchFrame === hitFrame`.

### 2. Sim — one-punch input buffer (deterministic)
- New `Fighter.bufferedPunch: PunchType | null`.
- When a punch command arrives while the fighter is mid-`punching` (so `startPunch` would fail), store it in `bufferedPunch` (latest press wins) instead of dropping it.
- When the punch window ends and the fighter returns to `idle`, if `bufferedPunch` is set, immediately `startPunch` it and clear the buffer — the next punch fires on the first idle frame, so it feels responsive, not dropped.
- Cleared on `resetFighter` and whenever consumed.

### 3. Snapshot — `actionProgress`
- A pure shared helper `actionProgress(f: { state; punch; punchFrame; stateFrame }): number` → `[0,1]`, how far through the current one-shot the fighter is:
  - `punching` → `clamp(punchFrame / PUNCH_COMMIT_FRAMES[punch], 0, 1)`
  - `hit` → `clamp(stateFrame / HIT_FRAMES, 0, 1)` (HIT_FRAMES = 12, the existing hit duration)
  - `knockedOut` → `clamp(stateFrame / KO_FRAMES, 0, 1)` (KO_FRAMES = 35, matching the existing StickFighter topple window)
  - everything else → 0 (looping clips ignore it)
- Add `actionProgress: number` to `RenderFighter`, computed via this helper in **both** `getRenderFighters` paths (local-sim and net). Both already carry `state`/`punch`/`punchFrame`/`stateFrame`, so no net-protocol change is needed and the value is identical on host and client.

### 4. Render — sync one-shots to the sim
- In `SkeletalFighter`, for **one-shot** clips (`!CLIPS[clip].loop` → punches, hit, ko), drive the action's time directly from the sim instead of letting it free-run: each frame, `action.time = rf.actionProgress * action.getClip().duration`. The clip becomes a pure function of sim progress, so it always plays fully across the window and **can never T-pose or get cut off**. Keep the action playing/weighted while its clip key is active.
- **Looping** clips (idle/walk/block/stunned/dance) keep the existing crossfade.
- **Harden the crossfade** so there is never a bind-pose gap: when switching clips, fade the new action in over its `fade` while the previous fades out, ensuring the incoming action has weight before the outgoing reaches zero (e.g. via `crossFadeFrom`/explicit weight handling), so no frame shows the unweighted bind pose.

## Components & files

- `lib/kowloon-knockout/game/combat/punches.ts` — add `PUNCH_COMMIT_FRAMES` + `punchHitFrame`; the commit/hit frame source of truth. (Pure, unit-tested.)
- `lib/kowloon-knockout/game/fighters/fighter.ts` — `punching` advance uses commit window; `isHitFrame` uses `punchHitFrame`; consume `bufferedPunch` on →idle; clear in `resetFighter`.
- `lib/kowloon-knockout/game/fighters/types.ts` — add `bufferedPunch` to `Fighter`.
- `lib/kowloon-knockout/game/world.ts` — buffer the punch command when the fighter is busy (instead of dropping).
- `lib/kowloon-knockout/game/combat/actionProgress.ts` (new, pure, unit-tested) — the `actionProgress` helper + the `HIT_FRAMES`/`KO_FRAMES` constants it needs (importing `PUNCH_COMMIT_FRAMES`). Lives with combat because it depends on combat timing and is consumed by the net/session layer; the renderer never imports it.
- `lib/kowloon-knockout/net/session.ts` — add `actionProgress` to `RenderFighter` and compute it via the helper in both `getRenderFighters` paths.
- `components/kowloon-knockout/arena/SkeletalFighter.tsx` — one-shot clips driven by the `rf.actionProgress` snapshot field (no helper import); crossfade hardening.

## Testing

- **UNIT (Vitest, node):**
  - `punches.ts` — commit ordering (jab<cross<hook<uppercut), hit frame within window and snappy.
  - `actionProgress.ts` — punching/hit/ko progress, clamping at 0 and 1, loops → 0.
  - Input buffer (a small pure test driving `startPunch`/advance over the window with a buffered press → the buffered punch fires on the first idle frame and the buffer clears).
- **RUN-OBSERVE (deferred to user):** punches read as full, weighty, committed animations; no T-pose; mashing no longer produces extra punches; a press during a punch fires once on recovery; hit/KO reactions play fully. Frame numbers are tuning constants — adjust during sign-off.
- Per project workflow: a `senior-swe-reviewer` pass before the PR — **especially important here because this is deterministic netcode** (a timing divergence would desync the two players).

## Out of scope / tradeoffs

- **Class punch-speed differentiation is flattened for v1.** The old `calculatePunchSpeed` scaled the window by the fighter's `punchSpeed`/`moveSpeed` stats; the new commit window is a fixed per-punch table (animations are the same clip for all classes). Damage/range/knockback/stamina stats still differentiate classes. If desired, the commit window can later be lightly scaled by `punchSpeed` — `actionProgress` already handles any total, so the render sync is unaffected.
- **No netcode protocol change.** `actionProgress` is derived from fields already in the snapshot; nothing new is serialized.
- Not changing block/stun durations, damage, stamina, AI, or combos beyond what the commit window implies.

## Risks & mitigations

- **Determinism / desync:** the commit window, hit frame, and buffer logic run inside the authoritative sim and must be pure and identical on both clients. Mitigation: all timing logic is pure constants/functions with unit tests; `actionProgress` is computed from already-synced fields via one shared helper; senior-swe-reviewer pass before merge.
- **Feel:** the window lengths are a balance lever. Mitigation: they are named tunable constants; the user signs off on feel in-browser and can adjust without touching logic.
- **Buffer abuse:** buffering the latest press during the whole window could feel like it queues stale inputs. Mitigation: latest-press-wins single-slot buffer; if it feels off, narrow buffering to the recovery portion (after `hitFrame`) — a one-line change.
