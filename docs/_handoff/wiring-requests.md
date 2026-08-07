# Wiring agent — requests outside its file ownership

From the wave that made `R2`/`R10` reachable (an admin surface for the ranked
pool, and a rater that runs on chart save), shipped `G7` (chart-native mines),
and gave the leaderboard rekey's `CASE` a follow-up migration for
`perfectionist` / `lenientTiming`.

What landed and what it means is in the report; this file is only the four
things that need a file this agent did not own, plus one decision (§5) worth
recording so nobody re-opens it. **None of them is a typecheck
failure and none blocks the branch.** Each degrades to "correct but stale" or
"correct but unreachable".

---

## 1. The skill-rating sweep after a promote or a demote — `server/jobs`

Now that `/admin/slice-it` exists, `promoteToRanked()` and `demote()` actually
get called, which makes the deferred sweep in `rating-requests.md` §3 a live
gap rather than a hypothetical one.

Promoting a chart does not recompute the skill rating of players who already
hold a score on it, and demoting does not remove it. They pick it up on their
next new best (`scheduleSkillRecompute` from the score route), so ratings after
a moderator's decision are **stale rather than wrong**, and self-healing. But
the whole point of promoting a chart is that people have already played it, so
"stale until their next new best" is the normal case, not the edge case.

```ts
// server/jobs — after a rank transition, or on a schedule
const holders = await prisma.songLeaderboard.findMany({
  where: { chartId, modPool: 'none' },
  select: { userId: true },
});
for (const { userId } of holders) await recomputeSkillRating(userId);
```

It belongs in a job and not in the request that flips the flag: it is unbounded
in the number of players, and the moderator is waiting on an HTTP response.

`recomputeSkillRating` is exported from `lib/slice-it/rating.server.ts`. The
same worker is the right home for the `rerateStaleCharts()` loop (same handoff,
§2) — loop until it returns 0 — which is the only thing that makes bumping
`RATING_VERSION` mean anything.

---

## 2. `RANK_STATUSES` has earned its move to `constants.ts`

`rating-requests.md` §4 said these should move "the moment a client surface
_branches_ on the value". `app/routes/_site/admin/slice-it.tsx` branches on it
three ways — a tab per state, a per-state badge tone, and which of the two
action buttons is enabled — so the trigger has fired.

Today that page carries its own copy:

```ts
type RankStatus = 'unranked' | 'qualified' | 'ranked';
```

which is the exact duplication `constants.ts` exists to prevent. It is a page a
handful of admins see, and the drift it can cause is a badge that renders a
state name it does not recognise, so this is small — but it is real, and it is
one move plus a re-export:

```ts
// lib/slice-it/constants.ts — beside DIFFICULTIES and MOD_POOLS
export const RANK_STATUSES = ['unranked', 'qualified', 'ranked'] as const;
export type RankStatus = (typeof RANK_STATUSES)[number];
```

`ranking.server.ts` then imports them from there instead of declaring them, and
the admin page imports the type instead of retyping it. No behaviour change.

The same page also hard-codes `QUALIFY_MIN_PLAYERS` / `QUALIFY_MIN_PLAYS` /
`QUALIFY_MIN_CLEAR_RATE` as display-only constants, for a stronger reason:
those live in a `.server` module a client component cannot import at all. They
are labelled as copies at their definition and **nothing branches on them** —
the server decides eligibility and the page renders `evidence.blockers` — so a
drift shows a stale target beside a correct verdict. Moving them to
`constants.ts` alongside the statuses would close that too.

---

## 3. The library difficulty sort is still unreachable — `constants.ts` / `songs.server.ts`

Unchanged from `rating-requests.md` §1, and now more visible: `Chart.rating` is
no longer null on every row, because the create and the save both call
`rateAndStoreChart()` and `syncSongChartRating()` keeps `Song.chartRating` in
step. The column is populated; nothing can sort by it.

`SONG_SORTS` needs `'difficulty'` and the query needs the arm — with
`nulls: 'last'`, which is the whole subtlety, since a song with no rated chart
is not a trivially easy song and Postgres sorts NULLs FIRST on DESC. The exact
two lines are in that handoff and have not changed.

`ratingBand()` / `RATING_BANDS` in `rating.ts` are still uncalled, and a rating
band ("something around 12") is the request a player actually has.

---

## 4. Two consumers of the note list should learn about G7 mines

Chart-native mines are `BOMB` slices stored in the chart with a
`CHART_MINE_ID_PREFIX` (`'mine:'`) on their `id`. `applyChartModifiers` in
`chart.ts` strips them when `modifiers.bombs` is off, so a player who did not
opt in never sees one — that is the whole safety property and it is tested in
`lib/slice-it/__tests__/chart-mines.test.ts`.

Two files outside this agent's ownership read note lists directly and will
count a mine as a note. **Both are cosmetic**, and both were checked:

- `app/routes/api/slice-it/score.ts` — `judgedEvents()` counts a `BOMB` as one
  judgement when sizing the anti-cheat ceiling. That only ever **loosens** an
  upper bound, so it cannot reject an honest run; it is very slightly slacker
  than it could be. (This file _is_ in this agent's ownership and was left
  alone deliberately: tightening an anti-cheat bound is not a change to make as
  a side effect of a charting feature.)
- Any surface that prints "N notes" from `slices.length` rather than from
  `ChartResult.noteCounts` or `scorableNoteCount()` will over-count by the
  number of mines. `noteCounts` is already mines-excluded, and
  `scorableNoteCount()` in `chart.ts` is the function for the general case.
  `components/slice-it/SongLibrary.tsx` and the editor's note-count readouts
  are the places to check.

Nothing here changes a score, a rating or a leaderboard position.

---

## 5. One thing that is deliberate, not an oversight

**The follow-up migration re-runs the backfill; it does not edit the applied
one.** `prisma/migrations/20260806180000_slice_it_pool_flags_backfill/` fixes
the two flags the rekey migration's `CASE` did not know about, rather than
editing `20260806160500_slice_it_leaderboard_rekey/migration.sql` in place. The
rekey has not run anywhere yet, so editing it would have worked — the reasoning
for not doing it is in the new migration's own header, and the short version is
that "has it run anywhere?" is a claim about every database that exists and
cannot be checked from inside the repository.

If you are about to hand-edit an applied migration for some other reason: the
`_prisma_migrations` checksum is why you cannot, and a second migration that is
a no-op on a fresh database is almost always the same change with none of the
risk.
