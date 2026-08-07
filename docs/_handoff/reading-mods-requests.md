# Reading & visibility settings agent — notes and requests outside its file ownership

From the wave implementing `G9, G11, M1, M3, V10` of
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).

Shipped: `G9` (scroll speed), `M1` (Mirror), `M3` (the visibility family),
`V10` (lane cover + ms readout). `G11` (playfield layout) was **not**
attempted — see §3. Nothing below blocks what shipped; each item is a
"nice to have that lives outside this agent's file ownership."

---

## 1. Mirror (`M1`) is a global setting, not a per-run modifier — by design, not by omission

**Why it's not in `SongDetailsPanel.tsx`.** The doc's sketch adds `applyMirror`
to the chart-rewriting pass in `chart.ts`, the same pass Bombs/Switching/One
Track go through. That pass runs inside `GameEngine.loadMap` — `engine.ts`,
owned elsewhere this wave — so this agent could not wire a real chart-level
swap without either editing `engine.ts` or `types.ts` (also off-limits: adding
a `mirror` field to `Modifiers` needs it). Both were out of reach.

**What shipped instead.** `applyMirror(slices, keys)` exists in `chart.ts`
exactly as sketched, tested, and unused by the live game. The actual mirror a
player experiences is an equivalent transform applied at the render/input
boundary in `GameCanvas.tsx`: `mirrorLane()` flips both which visual position
a note is drawn at and which engine lane a keypress targets. Composing an
involution with itself reproduces exactly what swapping the chart would have
looked like, without touching the engine's judged copy of the chart at all.
The setting lives in `store.ts` (`mirror: boolean`, a plain player preference,
not part of `Modifiers`) with its toggle in `MainMenu.tsx`'s "Gameplay"
section, next to Health Gauge and Rhythm Colours.

**The gap this leaves.** Mirror is a standing preference ("on until you turn
it off") rather than a per-song choice made alongside Bombs/Switching/Speed in
`SongDetailsPanel.tsx`, where every other modifier lives. It is also NOT part
of the `Modifiers` object a score submission carries — which is correct given
it earns no bonus (nothing in `MODIFIER_BONUSES` for it, deliberately) and
`SongLibrary.tsx`/`Leaderboard.tsx` badges (`activeModifierKeys` in
`modifiers.ts`) will not show a "MIRROR" badge on a run, the way they show
`invisible`/`bombs`/etc.

**If someone wants the per-song placement.** One more `ModButton` in
`SongDetailsPanel.tsx` beside `oneTrack` (~line 567), reading/writing
`useSliceItStore`'s `mirror`/`setMirror` directly (not `modifiers`/
`setModifiers` — it is a different piece of state on purpose, see above).
Cosmetic-only change; the store contract does not need to move for it.

---

## 2. `applyMirror` is a live target for `engine.ts`, whenever that agent has room

**Why.** The reference transform in `chart.ts` is exactly what
`GameEngine.loadMap` would need to fold into its existing
`prepareChart(map, modifiers)` call — one more `if` alongside the doc's other
Modifiers-shaped chart rewrites, EXCEPT mirror is not a `Modifiers` field (see
§1), so it would read from the store directly the way `loadMap` already reads
`store.modifiers`:

```ts
// lib/slice-it/engine.ts, inside loadMap, after `const modifiers = store.modifiers;`
const prepared = prepareChart(map, modifiers);
this.slices = (store.mirror && !modifiers.oneTrack ? applyMirror(prepared, 2) : prepared)
  .sort((a, b) => a.time - b.time);
```

**Without it.** Nothing breaks — the render/input-boundary flip in
`GameCanvas.tsx` is fully equivalent for a player. The only reason to make this
change is if a later feature needs the engine's OWN `getSlices()` to already
reflect mirrored lanes (a replay recorder, a spectator view, an anti-cheat
check that reads `this.slices` directly) — none of which exist yet.

---

## 3. `G11` — playfield layout: deferred, not attempted

**Why deferred.** Lowest priority in this agent's scope ("only if turn
remains"), and it did not remain: `G9`/`M1`/`M3`/`V10` alone touched most of
`GameCanvas.tsx`'s render loop (`LANE_POS`, `toCanvas`, `scrollPos`, the
per-slice lane math) closely enough that stacking a fourth geometry change
(direction, judgement-line position, playfield width) on top in the same pass
risked shipping all five half-verified instead of four solid.

**What's still true about the Gap.** Orientation is still hard-coded by
`isMobileV` (`h > w`): portrait always scrolls top-to-bottom with lanes
left/right, landscape always scrolls right-to-left with lanes top/bottom.
There is still no `playfield` setting.

**A plan for whoever picks it up**, consistent with what this agent learned
about the render loop's actual geometry:

1. **Don't rotate the canvas** the way the doc's `applyOrientation` sketch
   does (`ctx.rotate` + a quarter-turn). This game's canvas already draws text
   (feedback popups, judgement numbers, the audio-offset HUD) and rotating the
   whole context rotates the text with it — readable at 0°/180°, sideways at
   90°/270°. Store handedness/axis-swap as data instead:

   ```ts
   // Generalises today's isMobileV special case into the same four numbers
   // G9/M3/V10 already read off `runState` — no new getState() call sites.
   type Axis = { vertical: boolean; sign: 1 | -1 }; // sign: which way is "toward the line"
   function axisFor(direction: PlayfieldDirection, isMobileV: boolean): Axis { ... }
   ```

   Then `toCanvas`/`scrollPos`/`LANE_POS` become functions of `Axis` instead of
   the literal `isMobileV` boolean — the ONE place per the doc's own framing
   ("one transform... not four code paths"), just expressed as data flowing
   through the existing helpers rather than a context transform wrapping them.

2. **Judgement-line position** (`linePosition: number`) is the least risky of
   the three — it only changes what `CURSOR_MAIN` is computed from
   (`isMobileV ? h * 0.85 : w * 0.15` today), not any lane math. Land this
   alone first if there's only room for one piece of `G11`.

3. **Playfield width** interacts with `LANE_POS`'s hardcoded `0.3`/`0.7` split
   (and `isOneTrack`'s `0.5`) — narrowing it means moving those two fractions
   inward symmetrically, which also has to move the neumorphic track
   rendering (`BAR_H`, the `LANE_POS.forEach` trough draw) and the touch
   button hit targets (laid out in JSX, not canvas) together, or the visual
   lanes and the pressable buttons drift apart on a touch device.

4. **Whatever ships, gate the value behind the SAME `MIN`/`MAX` constant
   pattern** this wave used for `scrollSpeed`/`laneCoverHeight` in
   `constants.ts`, and add the new fields to `store.ts`'s v4→v5 migration —
   not v4, which this wave already shipped.
