# Engine / feedback agent — requests outside its file ownership

From the wave implementing `G1, G8, H1, H3, H4, H7, P5, P6` of
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).

Everything below is a change in a file this agent does **not** own. None of it is
required for the shipped work to function — each item is written so the feature
degrades rather than breaks without it, and the degradation is stated.

---

## 1. `components/slice-it/SongDetailsPanel.tsx` — a Health Gauge mod button

**Why.** `Modifiers.healthGauge` is new (`G1`). It is off by default, worth
`MODIFIER_BONUSES.healthGauge` (0.2) on the score multiplier, and is the only
modifier that can end a solo run early. `SongDetailsPanel` is where every other
modifier is toggled, and it is the panel a player is looking at when they choose
how a run should go.

**Change.** One more `ModButton` beside `strictTiming`, around
`SongDetailsPanel.tsx:543`:

```tsx
<ModButton
  active={modifiers.healthGauge}
  onClick={() => setModifiers({ ...modifiers, healthGauge: !modifiers.healthGauge })}
  // Icon suggestion: `HeartPulse` from lucide.
/>
```

**Without it.** The toggle is reachable — this agent put one in the MainMenu
settings drawer ("Gameplay" section), and the setting persists — but it is two
screens away from where a run is configured, which is the wrong place for a
per-run choice.

---

## 2. `components/slice-it/MultiplayerLobby.tsx` — the same toggle for a seat

**Why.** `forMultiplayer()` deliberately does **not** strip `healthGauge`
(see the comment on it in `modifiers.ts`): the engine clamps `failMode` to
`'survive'` for a match, so draining to zero in a race forfeits the bonus and
nothing else. A seat that wants the tension can have it.

**Change.** Add `healthGauge` to the per-seat modifier list around
`MultiplayerLobby.tsx:721` / `:795`, alongside `strictTiming`.

**Without it.** A player can still set the gauge from the menu and it carries
into a lobby (the store is the same), but it is not visible to the room.

---

## 3. `lib/slice-it/api-schemas.ts` — `SliceZ` should accept `quant`

**Why.** `G8` puts `quant` on every note the charter emits (`Slice.quant`, the
beat subdivision, used to colour notes). `SliceZ` is a plain `z.object`, which
**strips** unknown keys — so a chart round-tripping through
`/api/slice-it/songs/$id/patch-analysis` loses its quantisation and comes back
uncoloured.

**Change.** One field:

```ts
const SliceZ = z.object({
  // …
  /** Beat subdivision denominator: 1 on the beat, 2 eighth, 3 triplet, 4 sixteenth. */
  quant: z.number().int().min(1).max(16).optional(),
});
```

**Without it.** Songs analysed on the server (the normal upload path) keep their
`quant` — that route writes the charter's output straight to the row. Only
client-supplied backfill charts lose it, and a note with no `quant` falls back to
its lane colour, which is exactly what every chart generated before this wave
does anyway. So: a silent, partial loss of a new signal, not a break.

---

## 4. `lib/slice-it/useSubmitScore.ts` + `/api/slice-it/score` + `SongLeaderboard` — persist the lamps

**Why.** `H7`. The engine now derives `isFullCombo` / `isPerfect`
(`GameEngine.getRunStats()`), and the results screen shows them. `H8` (clear
lamps in the library) needs them on the leaderboard row, denormalised, so the
badge survives without a join back to a run row that may not exist.

**Change, in three places:**

1. `lib/slice-it/useSubmitScore.ts` — add to `RunSummary` and to
   `useRunSummary()`'s engine block:

   ```ts
   ...(engine ? { isFullCombo: engine.isFullCombo, isPerfect: engine.isPerfect } : {}),
   ```

2. `lib/slice-it/api-schemas.ts` — `ScoreSubmissionZ` gains
   `isFullCombo: z.boolean().default(false)` and `isPerfect: z.boolean().default(false)`.

3. `prisma/schema.prisma` — `model SongLeaderboard` gains
   `isFullCombo Boolean @default(false)` and `isPerfect Boolean @default(false)`,
   written in the `upsert` in `app/routes/api/slice-it/score.ts`.

**Integrity note for whoever does #2.** These two are client-declared and
unverifiable — a full combo is a claim about a histogram the server never sees.
They must stay **decorative**: never let them influence score, ranking or the
plausibility ceiling. `integrity.ts` can cheaply cross-check them (`isPerfect`
implies `accuracy === 1`; `isFullCombo` implies `maxCombo === notesResolved`)
and flag a contradiction, in the same "flag, do not reject" spirit as
`checkTiming`.

**Without it.** The lamps show on the results screen for the run that just
happened and are then forgotten. `H8` is blocked; nothing else is.

---

## 5. `components/slice-it/MatchResults.tsx` — the multiplayer results screen

**Why.** `H3`/`P6` landed on `GameOver.tsx` only. `MatchResults.tsx` is the
other results screen and now shows strictly less: no judgement histogram, no
unstable rate, no offset suggestion, no FC lamp.

**Change.** It already receives (or can receive) the engine the way `GameOver`
does. The four blocks are copy-paste from `GameOver.tsx`; the natural move is to
lift them into a shared `components/slice-it/RunBreakdown.tsx` that takes
`{ stats, timing }` and have both screens render it.

**Without it.** Multiplayer players get the pre-existing results card. No
regression, just an asymmetry.
