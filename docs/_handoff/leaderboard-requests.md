# Leaderboard agent — requests outside its file ownership

From the wave implementing `R1, R5, R6, R9, H7 (persistence), H8, X11, X12` and
the guest half of `X10` in
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).

**Item 1 is not like the others.** Every other handoff document in this
directory promises that its items degrade rather than break. Item 1 does not: it
is a **typecheck failure in the tree right now**, in a file this agent is
forbidden to touch, and there is no schema shape that both fixes `R1` and leaves
that call compiling. It is first, it is short, and it should be applied before
this branch merges.

---

## 1. `server/socket-server/handlers/slice-it.ts` — `persistResults` must use the new board key (**BLOCKING**)

**Why.** `R1` re-keys `SongLeaderboard` from `@@unique([songId, userId])` to
`@@unique([songId, difficulty, modPool, userId])`. The old key was one row per
player per song across all four difficulties and every modifier combination —
so a personal best on `normal` overwrote an `expert` record, and an `easy` run
with six modifiers ranked against an `expert` full combo. Fixing that means the
constraint has to go.

`persistResults` addresses a row **by that constraint's generated name**:

```ts
// server/socket-server/handlers/slice-it.ts:936
const existing = await prisma.songLeaderboard.findUnique({
  where: { songId_userId: { songId, userId: standing.userId } },
  select: { id: true, score: true },
});
```

`songId_userId` no longer exists on `SongLeaderboardWhereUniqueInput`, so this
is a type error. It is the **only** one: `difficulty` and `modPool` were given
Prisma-level defaults specifically so the `create` below it still compiles.

There is no way to avoid this from the schema side. Keeping a
`(songId, userId)` unique alongside the new one would re-impose exactly the "one
row per player per song" limit that `R1` exists to remove; naming the new
four-column constraint `songId_userId` does not help either, because Prisma
requires every field of a compound unique input.

**Change** — replace the lookup and the two writes with one upsert on the new
key. `difficulty` and `modPool` come from the seat's own modifier set, which
`persistResults` already has in `standing.modifiers`:

```ts
import { poolOf } from '../../../lib/slice-it/pools';

// … inside the per-standing loop, replacing lines 936-956:
const difficulty = standing.modifiers.difficulty;
const modPool = poolOf(standing.modifiers);
const boardKey = {
  songId_difficulty_modPool_userId: { songId, difficulty, modPool, userId: standing.userId },
};

const existing = await prisma.songLeaderboard.findUnique({
  where: boardKey,
  select: { score: true },
});
if (existing && existing.score >= standing.score) continue;

const data = {
  score: Math.round(standing.score),
  maxCombo: Math.round(standing.maxCombo),
  accuracy: Math.max(0, Math.min(1, standing.accuracy)),
  speedMod: standing.modifiers.speed,
  modifiers: standing.modifiers as unknown as object,
};
await prisma.songLeaderboard.upsert({
  where: boardKey,
  create: { songId, userId: standing.userId, difficulty, modPool, ...data },
  update: { ...data, createdAt: new Date() },
  select: { id: true }, // never return the modifiers blob
});
```

`lib/slice-it/pools.ts` is browser-free and Node-free for exactly this reason —
it is imported by the engine-side UI, by `/api/slice-it/score` and by the
esbuild server bundle, the same contract `constants.ts` follows.

**Also worth doing while in there** (not required, and not a type error):
`persistResults` writes no `SliceRun` row, so a multiplayer run leaves no
history and contributes nothing to `R9`'s clear rate. The `create` is a copy of
the one in `app/routes/api/slice-it/score.ts`; the fields with no multiplayer
equivalent (`timing*`, `suspicion`) are nullable.

**Without it.** `pnpm exec tsc --noEmit` fails with one error, and CI's
`web-ci.yml` typecheck job fails with it. Nothing else in the tree is affected —
the web route, the leaderboard read, the player page and the tests all compile
and pass.

---

## 2. `prisma/migrations/` — a note, not a request: the `Chart` tables had no migration

**Already fixed here**, flagged because it is somebody else's work and they
should know.

`Chart` and `ChartRevision` landed in `prisma/schema.prisma` with the chart
editor (`a50c399a`) and **no migration was written for them**. `pnpm db:push`
creates them, which is why the editor works locally; `prisma migrate deploy` —
which is what `deploy.sh` runs — never would, so on any migrated database the
editor's first write fails with `relation "Chart" does not exist`.

`prisma/migrations/20260806160000_slice_it_chart_tables/` is that missing
migration, written from `prisma migrate diff` so the DDL is exactly what Prisma
would have generated. This wave needed it because `SongLeaderboard.chartId` and
`slice_run.chartId` are foreign keys into `Chart`.

---

## 3. `app/routes/api/slice-it/songs.ts` + `songs/$id.ts` — join the lamps (`H8`)

**Why.** `lampOf()`, the `Lamp` type, `SliceSong.lamp` and `SliceSong.lampByDifficulty`
all shipped, and `toSliceSong` derives the lamp from `row.scores` whenever that
relation is present. It is never present, because **the viewer-scoped joins are
inline at the two route call sites**, not in `songSelect`:

```ts
// app/routes/api/slice-it/songs.ts:87
...(userId
  ? {
      likes: { where: { userId }, select: { id: true } },
      songPlays: { where: { userId }, select: { count: true } },
    }
  : {}),
```

`songSelect` is a static object and cannot name the viewer, so the lamp join
could not be added to it. The idea sketch (`H8`) assumes the likes/plays joins
live in `songSelect` — they do not, and that is the whole reason this is a
handoff item rather than a line of shipped code.

**Change.** `lib/slice-it/songs.server.ts` exports `viewerSongJoins(viewerId)`,
which returns the same two joins plus the third. It is a drop-in replacement for
the block above, in both files:

```ts
select: { ...songSelect, ...viewerSongJoins(userId) },
```

It returns `{}` for an anonymous viewer, so the ternary goes away too. The
`scores` join is bounded by construction — one row per `(difficulty, modPool)`
the viewer has played, so at most twelve per song — and selects four scalar
columns.

**Without it.** `song.lamp` is `'none'` on every song for every viewer, which is
also the honest answer ("we did not ask"). Nothing renders a lamp yet either —
`components/slice-it/SongLibrary.tsx` is outside this wave — so today the loss is
invisible. It is the data half of `H8` that is blocked, not a broken feature.

---

## 4. `lib/slice-it/useSubmitScore.ts` — send the lamps and the clear flag

**Why.** `H7`/`R9`. `ScoreSubmissionZ` now accepts `isFullCombo`, `isPerfect`
and `cleared`, `SliceRun` and `SongLeaderboard` both store them, and
`lampOf` turns them into the library's clear lamp. The engine derives all three
(`GameEngine.isFullCombo` / `isPerfect`, and `RunStats.failed`) and
`useSubmitScore` sends none of them, so every stored run currently reports the
schema defaults: `cleared: true`, both lamps false. Every lamp in the game is
therefore `'cleared'` until this lands.

**Change.** In `useRunSummary()`'s engine block, and on `RunSummary`:

```ts
...(engine
  ? {
      notesResolved: engine.getState().notesResolved,
      isFullCombo: engine.isFullCombo,
      isPerfect: engine.isPerfect,
      // `failed` is the gauge ending the run early (G1); everything else that
      // reaches this code path reached the end of the song.
      cleared: !engine.getState().failed,
    }
  : {}),
```

**Integrity note, and it is the important half of this item.** These three are
**client-declared and unverifiable** — a full combo is a claim about a judgement
histogram the server never sees. They are decorative by construction in the
route: nothing reads them before it has finished deciding whether the run is a
new best, and they touch no score, no rank, no reward and not the plausibility
ceiling. Keep it that way. `integrity.ts` could cheaply cross-check them
(`isPerfect` implies `accuracy === 1`; `isFullCombo` implies
`maxCombo === notesResolved`) and flag a contradiction in the same
"flag, do not reject" spirit as `checkTiming` — that would be a good addition and
it is a change to a file this wave does not own.

**Without it.** Lamps are stored, and they all say the same thing.

---

## 5. `lib/slice-it/useSubmitScore.ts` — surface the guest response

**Why.** `X10`. `/api/slice-it/score` accepts `auth: 'optional'` now and answers
a guest with `{ success: true, ranked: false, stored: false, score, accuracy,
grade }` — computed, shown, discarded, with no `SliceRun`, no `SongLeaderboard`
row, no `Player` row and no `User` row. `SubmitResult` has no way to express
"accepted but not stored": `status: 'ok'` and `status: 'unranked'` both mean
something else, so a guest currently reads as a normal successful submission and
the results screen offers them nothing.

**Change.** A fourth status:

```ts
export interface SubmitResult {
  status: 'idle' | 'submitting' | 'ok' | 'guest' | 'unranked' | 'failed';
  // …
}

// in `submit`, on the ok path:
setResult({
  status: body.stored === false ? 'guest' : 'ok',
  isNewBest: Boolean(body.isNewBest),
  previousBest: body.previousBest ?? null,
});
```

Then `MatchResults.tsx` / `GameOver.tsx` can render the "playing as a guest —
link an account to keep this" prompt `X10` describes. (`MatchResults.tsx` is in
this wave's ownership and is ready for it; `GameOver.tsx` is not.)

**Without it.** A guest sees a normal results card with no indication their score
went nowhere — which is worse than the pre-wave behaviour, where the client
skipped the request entirely and there was nothing to misread.

---

## 6. `components/slice-it/SongLibrary.tsx` — draw the lamp

**Why.** `H8`'s render half. Once item 3 lands, `song.lamp` is one of
`'none' | 'failed' | 'cleared' | 'fc' | 'perfect'` and
`song.lampByDifficulty` breaks it out per tier.

**Change.** A dot on each card, using the genre's colours — the same map
`app/routes/slice-it/player.$handle.tsx` already uses:

```ts
const LAMP_COLORS: Record<Lamp, string> = {
  none: 'transparent',
  failed: '#ef4444',
  cleared: '#22c55e',
  fc: '#3b82f6',
  perfect: '#eab308',
};
```

Fixed hex rather than `--slice-*` tokens on purpose, for the same reason
`JUDGEMENT_COLORS` in `constants.ts` is fixed: a lamp is a piece of *vocabulary*
a player learns, and blue has to mean full combo in both themes or it means
nothing.

**Without it.** The lamp is in the payload and nothing draws it.

---

## 7. `lib/slice-it/net/events.ts` — a handle on the wire (`X11`)

**Why.** Every leaderboard row links to `/slice-it/player/$handle` using
`LeaderboardEntry.handle`, which the API resolves server-side. The multiplayer
surfaces cannot: `FinalStanding` and `LobbyPlayer` carry `userId` and a display
name and no handle.

**What shipped instead.** `playerProfile()` accepts **a handle or a user id** —
both branches are indexed, so it is one index probe or two — and
`MatchResults.tsx` / `MultiplayerSidebar.tsx` link by `userId`. The page emits
the *handle* form as its canonical, so only one of the two URLs is ever indexed.

**Change, if you want the tidier version.** Add `handle: string | null` to
`LobbyPlayer` and `FinalStanding` (and their zod schemas), populated from the
same session lookup that already fills `name` and `avatarUrl` in the hub's
`identity()`. Then both components link by handle like the leaderboard does and
the id fallback in `playerProfile` can go.

**Without it.** Nothing — the links work. This is a cleanliness item.

---

## 8. Product call — what `scope=country` should actually mean (`R5`)

**Not a change; a decision that is not this agent's to make.**

`R5`'s sketch is `user: { country: await countryOf(userId) }`. **The platform has
no country.** `User` has no such column and `UserProfile.location` is free text
(`VarChar(100)`) that a user types themself — "Rochester", "NY", "rochester, ny"
and "🌎" are all valid values of it today.

**What shipped.** `scope=country` matches `UserProfile.location`
case-insensitively against the caller's own, and the UI labels the filter "My
area" rather than a country. A caller with no location set gets an empty board
and `scopeUnavailable: 'no-location'`, which the panel renders as "Add a location
to your profile to see a board for your area" — deliberately not a silent
fallback to the global board, which looks identical to a working country board
and is not one.

**The open question.** If country boards are meant to be real — flags, per-country
#1s, the thing osu! and ScoreSaber do — they need a real, normalised country,
which means either an ISO-3166 field on `User` with a picker in profile settings,
or geo-IP at signup. Both are product decisions with privacy weight. Adding a
`User.country` column that nothing populates would have been a worse
approximation wearing a better name, so it was not added.

---

## 9. Deployment note — the blue/green window on the re-key migration

Flagged here rather than only in the migration header, because the person who
runs the deploy is not necessarily the person who reads SQL.

`deploy.sh` runs `prisma migrate deploy` and **then** hot-swaps the web tier, so
for the length of the swap the old code talks to the new schema. Dropping
`SongLeaderboard_songId_userId_key` is the statement that matters: the old score
route and the old `persistResults` both address a row by that pair, and Prisma's
`upsert` compiles to `INSERT ... ON CONFLICT` naming the constraint. **During the
swap, both write paths fail.**

That is survivable — both are best-effort writes (the hub catches and logs
`slice_results_persist_failed`; the route returns a 500 the client already treats
as "score not saved") — so the failure mode is a handful of scores lost during a
swap that takes seconds. Deploy it when the game is quiet.

The usual two-deploy dance does not apply: the old constraint is precisely what
forbids the second row per player that this change exists to allow, so the new
code cannot run beside it.
