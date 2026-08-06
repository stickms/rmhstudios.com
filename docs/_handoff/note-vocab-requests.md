# Note-vocabulary agent — requests outside its file ownership

From the wave implementing `G5` (judged hold releases), `A9` (adjustable
judgement windows) and `M6` (perfect-or-die) in
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).
`G7` (chart-native mines) was in scope but not reached — see §4.

Everything in §1 is a correctness risk, not a nice-to-have: it can reject a
legitimate run. §2-3 are cosmetic/completeness gaps that degrade gracefully.

---

## 1. `notesResolved` can now exceed `chartNotes` for an honest LN run — `app/routes/api/slice-it/score.ts`, `lib/slice-it/integrity.ts`

**What changed.** Before G5, a hold's release was scored but never counted:
`submitRelease` touched `score` only. After G5 it is judged through the same
`judge()`/`pointsFor()` path as a tap and **counts as its own entry** in
`notesResolved`, `hitPoints` and the judgement histogram — the entire point,
per the brief, was to stop the tail being invisible to accuracy. A chart with
`k` LONG notes now produces up to `2k` judged entries from those notes alone
(head + release), not `k`.

`engine.ts` accounts for this on the client: `loadMap` now sizes `totalNotes`
as `scorableNoteCount(slices) + (count of LONG notes with a duration)`, so the
HUD's "misses left for grade X" denominator stays correct. That fix is local
to `engine.ts`, which this agent owns.

**What is not fixed, and cannot be from this agent's files.**
`checkConsistency` in `lib/slice-it/integrity.ts` (not owned) rejects a
submission outright when:

```ts
notesResolved > chartNotes * 1.05 + 8   // → { reject: true, suspicions: ['notes_exceed_chart'] }
```

`chartNotes` comes from `chartNoteCount()` in `app/routes/api/slice-it/score.ts`
(not owned — `app/routes/**` is out of bounds for this agent), which is
`analysis.slices.length` for the played difficulty — a **head-only** count,
unchanged by G5.

Concretely: a chart with 100 notes, 30 of them LONG, played flawlessly now
reports `notesResolved = 130`. `chartNotes = 100`. `130 > 100 * 1.05 + 8 =
113`, so `notes_exceed_chart` fires and the score is **rejected** (422), not
merely flagged — this is one of the checks documented as "reject outright" in
`integrity.ts`'s own module comment, on the theory that "an honest client
cannot produce a contradiction." An honest G5 client now can, through no fault
of its own.

**The fix**, in a file this agent does not own:

```ts
// app/routes/api/slice-it/score.ts
function chartNoteCount(analysis: unknown, difficulty: Difficulty | undefined): number | undefined {
  const slices = /* ...existing lookup... */;
  if (!Array.isArray(slices)) return undefined;
  // G5: a LONG note with a duration produces a second judged entry (its
  // release), so the ceiling `checkConsistency` compares `notesResolved`
  // against has to count it too, or every honest LN-chart run trips
  // `notes_exceed_chart`.
  const holds = slices.filter((s) => s?.type === 'LONG' && !!s?.duration).length;
  return slices.length + holds;
}
```

Same shape as `engine.ts`'s `totalNotes` fix, so the two stay in step by
construction rather than by two agents independently guessing the same number.

**Not urgent, but related and also outside this agent's files:**
`scoreCeilingFor` in `integrity.ts` still adds `HOLD_RELEASE_POINTS * n` as a
flat "releases" term on top of the combo/accuracy-based ceiling. It is
harmless — purely additive, so it only loosens an already-loose bound, never
tightens one — but it is now redundant: a release's real payout is already
inside the `byCombo`/`byAccuracy` envelope the same way a tap's is, since both
go through `pointsFor` identically. Deleting that one line would tighten the
anti-cheat ceiling without touching correctness. `HOLD_RELEASE_POINTS` itself
is kept exported from `constants.ts` (this agent's file) specifically so this
line keeps compiling either way — see the constant's doc comment.

---

## 2. Two new modifiers, no pool classification — `lib/slice-it/pools.ts`

Not owned by this agent. `Modifiers.lenientTiming` and `Modifiers.perfectionist`
are both new; neither is in `pools.ts`'s `CHALLENGE_MODIFIERS`, and
`poolOfStoredRow` (the hand-mirrored copy of the SQL `CASE` in
`prisma/migrations/20260806160500_slice_it_leaderboard_rekey/migration.sql`)
does not know about `perfectionist` at all. Nothing breaks — a run with either
flag still lands *somewhere* (see below) — but neither lands where its own
design says it should.

**`lenientTiming` should join `CHALLENGE_MODIFIERS`.** The array's own doc
comment is "what the player can see, **or how tight the judgement windows
are**" and already includes `strictTiming` for exactly that second reason. A
widened window is the same kind of incomparable as a narrowed one. Without
this, `poolOf`'s generic `activeModifierKeys`-based fallback sorts a lenient
run into `standard` — comparable with a stock-window run, which is the thing
`CHALLENGE_MODIFIERS` exists to prevent.

```ts
// lib/slice-it/pools.ts
export const CHALLENGE_MODIFIERS = [
  'invisible', 'spin', 'strictTiming', 'oneTrack', 'switching', 'bombs',
  'lenientTiming',
] as const satisfies readonly (keyof Modifiers)[];
```

`EMPTY_MODIFIERS` in the same file does not need touching — both new fields
are optional on `Modifiers`, and `activeModifierKeys` already treats an absent
key as falsy.

**`perfectionist` should join `poolOfStoredRow`'s `standard` branch, beside
`suddenDeath`.** `poolOf` (the live path) already gets this right for free —
`perfectionist` is not in `CHALLENGE_MODIFIERS`, so it falls through to the
generic `activeModifierKeys` check and lands in `standard`, exactly like
`suddenDeath`, since `activeModifierKeys` (owned by this agent, already
updated) lists it. `poolOfStoredRow` is the **separate, hand-written mirror**
used for the historical backfill and is not derived from
`activeModifierKeys`, so it needs the line added explicitly, and the SQL
migration's `CASE` needs the matching change — the file's own comment says
"Change one, change the other."

```ts
// lib/slice-it/pools.ts, poolOfStoredRow
if (
  modifiers.suddenDeath === true ||
  modifiers.perfectionist === true ||   // ← add
  modifiers.healthGauge === true ||
  speedColumn !== 1 ||
  speedJson !== 1
) {
  return 'standard';
}
```

Until this lands, a historical `perfectionist` row backfilled from that SQL
(not the live `poolOf` path) would be misclassified as `none` — mixed with
completely clean runs despite carrying the largest single-modifier bonus in
the game. `lib/slice-it/__tests__/pools.test.ts` already pins `poolOf` and
`poolOfStoredRow` together case by case; add a case for `perfectionist` there
when this lands.

---

## 3. `suddenDeath` has no engine effect — found, not fixed

`Modifiers.suddenDeath` is documented ("One miss ends the run"), scored
nowhere (`MODIFIER_BONUSES` has no entry for it, and never has), and enforced
nowhere in `engine.ts` — there is no code path in the engine, before this
wave or after it, that ends a run because `modifiers.suddenDeath` is true. The
M6 brief's sketch assumed a `checkFailConditions` already existed with "one
branch beside the existing sudden-death check"; there was no existing check to
put a branch beside.

**What this wave built instead:** `checkFailConditions` in `engine.ts` (owned)
implements only the `perfectionist` branch — the modifier this wave was
actually asked to add. The M6 exclusion itself (`applyExclusions` dropping
`suddenDeath` when `perfectionist` is also set) is implemented and tested at
the *data* level regardless of whether `suddenDeath` does anything at
runtime, so wiring up Sudden Death later needs no change to the exclusion —
only a second branch in `checkFailConditions`:

```ts
// lib/slice-it/engine.ts, checkFailConditions — the shape it would take
if (modifiers.suddenDeath && result === 'MISS') this.fail('suddenDeath');
```

plus a `MODIFIER_BONUSES.suddenDeath` entry (`constants.ts`) sized below
`perfectionist`'s, and a `'suddenDeath'` arm added to `RunStats['failReason']`
and `GameOver.tsx`'s message switch (both this agent's files, and both
one-line additions once the above lands). Left alone this wave because
implementing a modifier nobody on this task assigned is a bigger, separate
change than "make two fail-conditions mutually exclusive," and doing it
half-attentively would be worse than flagging it precisely.

---

## 4. `G7` — chart-native mines — deferred, and not safely splittable

Scope order was G5, A9, M6, then G7 "only if turn remains"; turn ran out
first, but it is also worth recording that G7 could not have been finished
alone even with more time: **it needs a `chart.ts` change, and that file is
this agent's explicit do-not-touch.**

`placeMines()` (the sketch's function) belongs in `beatmap/charter.ts` (owned,
untouched) and would insert new `BOMB` slices into the stored chart at
generation/upload time, at rest positions between existing notes. But
`applyChartModifiers` in `chart.ts` (not owned) is what makes `BOMB` an
*opt-in* note type today — it only converts existing notes to `BOMB` when
`modifiers.bombs` is true, at play time:

```ts
// lib/slice-it/chart.ts, applyChartModifiers — current runtime gate
if (modifiers.bombs) {
  out = out.map((slice) => {
    if (slice.type === 'SWITCH' || slice.type === 'LONG') return slice;
    if (random() >= BOMB_CONVERSION_RATE) return slice;
    return { ...slice, type: 'BOMB' as const, duration: undefined };
  });
}
```

A charter-placed `BOMB` slice is a **new note at a new timestamp**, not a
converted existing one, so this gate does not see it and cannot filter it out.
Baking mines into the stored chart in `charter.ts` alone — the only half of
G7 this agent could touch — would make every player hit unavoidable bombs on
every run of that chart, including everyone who never turned the `bombs`
modifier on. That is not a smaller version of G7; it is a regression the
modifier was specifically written to prevent (bombs are supposed to be a
choice). So nothing was written for this rather than writing an unsafe half.

**What G7 actually needs, once picked up:** `placeMines()` in `charter.ts`
generating candidate mine slots (not necessarily typed `BOMB` yet — maybe a
`mineCandidate: boolean` flag on the `Slice`, or a parallel list returned
alongside the difficulty's notes), and a change to `chart.ts`'s
`applyChartModifiers` so that when `modifiers.bombs` is on, it draws from
those candidates (using `BOMB_CONVERSION_RATE` as the density multiplier the
brief asks for) instead of — or in addition to — converting arbitrary
eligible notes. Both halves have to land together.

---

## 5. UI reachability — deliberate, not an oversight

`perfectionist` and `lenientTiming` both get toggles in `MainMenu.tsx`'s
Settings drawer (owned by this agent), in the same "opt-in risk" group as
Health Gauge. They do **not** get toggles in `SongDetailsPanel.tsx`'s per-song
modifier picker, where `suddenDeath`/`strictTiming`/`bombs`/etc. live — that
file is explicitly out of this agent's ownership this wave. Both toggles are
fully wired end to end (store → engine → score route) from Settings; adding a
second entry point in the per-song panel, for discoverability parity with
`suddenDeath`, is a UI-only follow-up for whoever owns that file.

Same story for badges: `MultiplayerLobby.tsx`'s per-modifier icon table and
`Leaderboard.tsx`'s modifier chips (neither owned) don't know about either new
field yet, so a lobby seat or a leaderboard row running either modifier shows
no badge for it. Cosmetic, not a correctness issue — `activeModifierKeys`
(this agent's file) already lists both, so any surface that reads it directly
already picks them up; it's specifically the two hand-rolled tables that need
a new row each.
