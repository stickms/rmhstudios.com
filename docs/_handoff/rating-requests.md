# Rating agent — requests outside its file ownership

From the wave implementing `C3` (a computed difficulty rating), `R2` (a global
skill rating) and `R10` (a ranked chart pool) in
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).

Everything here **degrades rather than breaks**. Nothing in this document is a
typecheck failure and nothing blocks the branch. What it does mean is that three
of the features are inert until somebody picks these up: charts are rated but
nothing rates them on save, the library cannot sort by the rating it stores, and
no chart is in the ranked pool because nothing calls the promotion.

---

## 0. The weights are uncalibrated, and this is the calibration procedure

Not a request to another agent — a request to whoever ships this to production.

Every constant in `lib/slice-it/rating.ts` (five feature weights, three ratio
scalars, the compression exponent, the 20-point ceiling) and the two in the
skill weighting (`SKILL_DECAY = 0.95`, `SKILL_ACCURACY_EXPONENT = 12`) was
chosen by judgement about what makes a chart hard. **None of it is fitted to
anything.** There is no clear-rate data in the repository and no way to produce
any until `R9` lands.

Expect the first pass to be wrong in the direction every rating system in the
genre was first wrong: over-rating dense-but-easy patterns, under-rating
technical ones.

The procedure, once `R9` gives per-chart clear rates:

1. Take charts with ≥200 runs from ≥50 distinct accounts (the sample the R10
   gate already collects — `evaluateQualification` reads exactly these).
2. Regress observed clear rate against `rateChart()`'s output. A calibrated
   rating is monotone in clear rate; the residuals name the mis-weighted
   feature.
3. Fit the five weights; leave the compression exponent alone until the weights
   are stable, because the two trade off against each other and moving both at
   once makes neither identifiable.
4. **Bump `RATING_VERSION`** and run `rerateStaleCharts()` to convergence. That
   is what the column is for. Skipping it leaves a library holding two
   incompatible scales in one sortable column.

Until then, a rating is a rough ordering within a library, not a claim that a
12.4 is 1.1× a 11.3. The UI should not present it as more than that.

---

## 1. The library sort — `songs.server.ts` and `constants.ts` (C3)

**What exists.** `Song.chartRating` is a new denormalised column: the highest
rating among a song's `public` charts, maintained by `syncSongChartRating()` in
`lib/slice-it/rating.server.ts`, with an index on
`("isPublic", "chartRating" DESC)` sized for exactly this query.

**What is missing.** `SONG_SORTS` lives in `lib/slice-it/constants.ts` and the
query that consumes it is in `lib/slice-it/songs.server.ts` — both outside this
agent's ownership. So the column is populated and unreachable: C3's stated gap
is that the library "offers no way to find something at your level", and that is
still true.

The change is two lines plus the null handling:

```ts
// lib/slice-it/constants.ts
export const SONG_SORTS = ['recent', 'popular', 'liked', 'title', 'duration', 'difficulty'] as const;

// lib/slice-it/songs.server.ts — wherever the sort switch lives
case 'difficulty':
  // NULLS LAST is the whole subtlety. A song with no rated chart is not a
  // trivially easy song, and Postgres sorts NULLs FIRST on DESC by default —
  // which would put every unrated song at the top of "hardest first".
  return [{ chartRating: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
```

`LIBRARY_SORTS` in `library-filters.ts` derives from `SONG_SORTS`, and
`lib/slice-it/__tests__/library-filters.test.ts` asserts the two agree — so that
file needs nothing, but it will fail until the query supports the new value.

**Also worth having:** a rating badge on the song card and a rating-band filter.
`ratingBand()` and `RATING_BANDS` in `rating.ts` exist for this and have no
caller. Bands rather than the raw number, because "something around 12" is a
real request and "exactly 12.4" is not.

---

## 2. Nothing calls the rater on save — `charts/$id.ts`, `charts.ts` (C3)

`rateAndStoreChart(chartId)` writes `rating`, `ratingVersion` and `ratedAt` and
then refreshes the song's denormalised value. **Nothing calls it** except
`promoteToRanked()`, which is itself uncalled (§4). So `Chart.rating` is null on
every row and the library sort in §1 would sort an empty column.

It should be called wherever a chart's notes change: the chart PATCH in
`app/routes/api/slice-it/charts/$id.ts`, the create in `charts.ts`, and the
generated seed in `lib/slice-it/editor/seed.server.ts`. All three are outside
this agent's ownership.

```ts
import { rateAndStoreChart } from '@/lib/slice-it/rating.server';
// after the notes are written, before the response:
await rateAndStoreChart(chart.id);
```

It is cheap — one O(n) pass over the note list plus two updates — and it is
idempotent, so calling it more often than necessary costs a write and nothing
else. The editor already rates live on the client via `rateChart()` from
`rating.ts`; this is what makes the stored number agree with the one on screen.

A periodic `rerateStaleCharts()` in the jobs worker (`server/jobs`) is the other
half, and the only thing that makes bumping `RATING_VERSION` meaningful. Loop
until it returns 0.

---

## 3. There is no admin surface for the ranked pool (R10)

`promoteToRanked(chartId, moderatorId)` and `demote(chartId, moderatorId)` in
`lib/slice-it/ranking.server.ts` are the two human decisions in R10, and they
have **no caller**. Qualification is automatic and already wired — the score
route calls `evaluateQualification()` on every submission — so charts will
accumulate in `qualified` and stop there. Until somebody promotes one, no chart
is `ranked`, so every `Player.skillRating` stays 0 and the global board falls
through to its `totalScore` tie-break. That is a deliberately graceful
degradation (§5), not a bug, but it does mean R2 is dormant.

What is needed is a moderator route — `auth: 'admin'` per the `defineHandler`
convention — listing `rankStatus: 'qualified'` charts with their
`QualificationReport`, and calling the two functions. Both are safe to expose
directly: `promoteToRanked` refuses anything not already `qualified`, so a
moderator cannot rank a chart that has never been played or that does not lint.

**The back-fill is the part to think about.** Promoting a chart does not
recompute the skill rating of players who already hold scores on it; they pick
it up on their next new best. Demoting does not remove it either. Both need a
sweep:

```ts
const holders = await prisma.songLeaderboard.findMany({
  where: { chartId, modPool: 'none' },
  select: { userId: true },
});
for (const { userId } of holders) await recomputeSkillRating(userId);
```

That belongs in the jobs worker, not in the request that flips the flag — it is
unbounded in the number of players. Until it exists, ratings after a
promote/demote are stale rather than wrong, and self-heal on the next best.

---

## 4. `RANK_STATUSES` may want to move to `constants.ts`

`RANK_STATUSES` / `isRankStatus` / `toRankStatus` live in `ranking.server.ts`,
which is outside the shared client/server contract, because **today the client
has no opinion about a rank status**: it never sends one, never validates one,
and only renders one as a string the API handed it. The rule for `constants.ts`
is "anything a client and the server could disagree about", and they cannot
disagree when only one of them decides.

The moment a client surface _branches_ on the value — a "Ranked" badge with
per-state styling, a library filter, an editor banner — they should move to
`constants.ts` beside `DIFFICULTIES`, exactly as `MOD_POOLS` did. That file is
outside this agent's ownership, which is why they are not there already.
`ranking.server.ts` importing them from `constants.ts` afterwards is a one-line
change and no behaviour change.

---

## 5. Two things that are deliberate, not oversights

**The global board still shows everybody.** It is
`ORDER BY "skillRating" DESC, "totalScore" DESC` over `WHERE "totalScore" > 0`,
not `WHERE "skillRating" > 0`. On the day this ships no chart is ranked, so
every skill rating is 0 and the board falls through to the old ordering
byte-for-byte. As charts enter the pool it becomes a skill board player by
player. Filtering on `skillRating > 0` would have shipped an empty global
leaderboard.

**Only `modPool: 'none'` runs feed the skill rating.** The weighting multiplies
a chart's rating by a run's accuracy, and the chart's rating describes the chart
_as written_, computed from note timings at 1.0×. Pairing it with an accuracy
achieved at 1.5× speed is arithmetic over two different charts. The clean
extension is to re-rate at the run's speed (scale every note time by `1/speed`
and re-run `rateChart`) and price the reading modifiers separately — that is a
second thing to calibrate, and shipping it on a guess would put modifier runs
into the ranking untested. Speed-modded runs currently contribute nothing, which
under-counts some real players; it does not over-count anybody.

---

## 6. The migration has never run against a database

`prisma/migrations/20260806170000_slice_it_rating_and_ranked_pool/migration.sql`
was hand-written — there is no Postgres in this environment — and verified only
by `prisma validate` and `prisma generate` agreeing with the schema it claims to
implement. **Review it as SQL, not as generated output**, and run it against a
copy before production. It is `IF NOT EXISTS` throughout and every added
`DEFAULT` is a constant (catalogue-only on PG 11+), so it should be a no-op on
an environment already patched by `db push` and should not rewrite a table.

The one statement worth a second look is the `UPDATE "Chart" … WHERE status =
'ranked'`, which moves any pre-existing combined-status row onto the new
`rankStatus` axis. It is expected to affect zero rows.
