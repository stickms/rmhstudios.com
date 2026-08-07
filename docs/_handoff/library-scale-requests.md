# Library-scale wave — requests across file boundaries

From the wave implementing `L14` (a real search ranking), `L15` (artist pages
and per-artist filtering) and `L16` (album and pack authoring) in
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md),
plus the two dangling items it was asked to finish.

Nothing here blocks the branch. Everything shipped works; what follows is what
somebody else has to do for it to work *well*, plus the parts that were
deliberately left out.

---

## 0. The migration has never run against a database

`prisma/migrations/20260807120000_slice_it_library_scale/migration.sql` was
hand-written — there is no Postgres in this environment — and verified only by
comparing it statement-for-statement against
`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
plus `prisma validate` and `prisma generate` agreeing with the schema it claims
to implement. **Review it as SQL, not as generated output**, and run it against a
copy before production.

Three things in it deserve a second look:

1. **`CREATE EXTENSION IF NOT EXISTS pg_trgm`.** The search query uses the `%`
   operator and `similarity()`, both of which come from that extension. Without
   it, every search errors rather than degrading. On a managed Postgres this may
   need to be run by a superuser ahead of the migration.
2. **The generated column.** `searchVector` is
   `GENERATED ALWAYS AS (…) STORED`, which Prisma's schema language cannot
   express — so `prisma migrate diff` renders it as a plain `tsvector` column and
   the two files legitimately differ there. That is the one intentional
   divergence. Adding the column **does rewrite the `Song` table**; everything
   else in the migration is catalogue-only.
3. **The `artistKey` backfill.** It reproduces `artistKeyOf()` from
   `lib/slice-it/artist.ts` in SQL: a `regexp_replace` for the featuring clause,
   a `translate()` for Latin-1 accents, then a strip to alphanumerics. The
   runtime normaliser folds diacritics with NFKD, which covers strictly more
   characters than the `translate()` table, so a row whose artist carries a
   non-Latin-1 diacritic gets a slightly different key from the backfill than it
   will get the next time it is written. That is a handful of rows in the wrong
   group until they are next edited. `lib/slice-it/__tests__/artist.test.ts`
   pins the two character tables against each other so the Latin-1 half cannot
   drift; the rest is documented rather than enforced. The alternative was
   requiring the `unaccent` extension.

## 1. Nothing backfills `densityStrip` for existing rows — `server/jobs`

**Owner:** whoever owns the jobs worker.

`Song.densityStrip` (V8) now exists, is in `songSelect`, rides in every list
response, and is populated on **upload** and on **`patch-analysis`**. It is null
for every song that predates this migration, and a null strip renders as no
strip — which is exactly what `<DensityStrip>` in `SongLibrary.tsx` already did
before, so this degrades rather than breaking.

Filling them in is a sweep, and it belongs in the jobs worker rather than in a
migration because it needs `analysisData` parsed per row and that is a
multi-hundred-kilobyte JSON document each:

```ts
import { songDensityStrip } from '@/lib/slice-it/songs.server';

// Batched, because loading every chart in the library at once is exactly the
// thing `songSelect` excludes `analysisData` to avoid.
for (const song of await prisma.song.findMany({
  where: { densityStrip: { equals: Prisma.DbNull }, analysisData: { not: Prisma.DbNull } },
  select: { id: true, analysisData: true, duration: true },
  take: 50,
})) {
  const strip = songDensityStrip(song.analysisData as never, song.duration);
  if (strip) await prisma.song.update({ where: { id: song.id }, data: { densityStrip: strip } });
}
```

The chart editor's save path (`app/routes/api/slice-it/charts/$id.ts`) is the
third place a chart's notes change and the only one this wave did not own. A
strip written at upload and never updated after an edit is a strip that
describes the chart as it was uploaded. Same one-liner as above, after the notes
are written.

## 2. The chart editor should set `artistKey` if it ever writes `artist`

**Owner:** whoever owns the song metadata PATCH
(`app/routes/api/slice-it/songs/$id.ts`).

`Song.artistKey` is written by the upload route and backfilled by the migration.
If any other path writes `Song.artist` — the "edit track info" panel does — it
**must** write `artistKey` in the same update, or renaming an artist silently
leaves the song on the old artist's page:

```ts
import { artistKeyOf } from '@/lib/slice-it/artist';
data: { artist, artistKey: artistKeyOf(artist) }
```

`artistKeyOf` is client-safe and has no dependencies. This is a one-line change
and it is the only way the column can go stale.

## 3. `ChartPackItem` is keyed on `songId`, not `chartId` — a deliberate deviation

The `L16` sketch keys pack items on `chartId`. They are keyed on `songId` here,
with `chartId` kept as an optional pin, because of the album path: a multi-track
upload creates `Song` rows and **no `Chart` rows at all** — charts are authored
later in the editor, and a generated chart lives in `Song.analysisData`, which is
not a `Chart` row either. Keying on `chartId` would have made every auto-created
album pack empty on the day it was created.

Whoever builds `S2` (courses) on top of packs should know that a course wanting
"this specific difficulty" sets `chartId` and reads it; a pack meaning "this
song, whichever chart you like" leaves it null. Both are expressible; only the
first needs the editor.

## 4. There is no public/SEO artist page

`L15` sketches two routes: `app/routes/slice-it/artist.$key.tsx` (in-game,
`.slice-theme`) and `app/routes/_site/games/slice-it/artist.$key.tsx` (public,
`--site-*` glass, its own `head()` and JSON-LD). Only the first was built. The
second is a page under `_site/`, which is a different ownership area and a
different design contract, and the API it would need
(`GET /api/slice-it/songs/artist/$key`) already exists and is `auth: 'optional'`,
so it is a view over data that is already served.

## 5. Two `c-game` i18n keys fall back to their `defaultValue`

`sort-difficulty` (the library's new "Hardest" sort option) and `add-to-pack`
(the song details panel's pack button) are rendered through the `c-game`
namespace, and this wave was scoped to `locales/en/r-slice-it.json` only. They
render correctly in English from their `defaultValue`s and serve English in
every other locale until `pnpm i18n:extract` runs. The 44 keys this wave owns
are in `locales/en/r-slice-it.json`.

## 6. What the wave finished from earlier handoffs

- **`docs/_handoff/rating-requests.md` §1 — the difficulty sort.** Done.
  `SONG_SORTS` in `lib/slice-it/constants.ts` gained `'difficulty'`, the
  `ORDER_BY` map in `app/routes/api/slice-it/songs.ts` maps it to
  `{ chartRating: { sort: dir, nulls: 'last' } }`, and the grid's sort dropdown
  offers it. The rest of that document is untouched: **nothing still calls
  `rateAndStoreChart()` on save (§2)**, so `Chart.rating` is null on every row
  and `Song.chartRating` with it — the sort is correct and sorts an empty
  column until §2 lands. The rating badge on the card renders only when the
  value is non-null, so it is invisible rather than wrong in the meantime.
- **`docs/_handoff/presentation-requests.md` §4 — `densityStrip`.** Done via
  option (a), the persisted column. See §1 above for the backfill that is still
  outstanding.

## 7. Search behaviour worth knowing before tuning it

- **Recall is three ORed arms**: the `tsvector` match, trigram similarity, and
  the original `ILIKE '%…%'`. The third is kept deliberately — it guarantees
  that nothing that used to be findable stops being findable, and the trigram
  index makes it indexable, so it is now cheaper than it was before. If you
  tighten recall, that arm is the one to think hardest about removing.
- **Popularity is `ln(1 + plays) * 0.15`, not `plays`.** With raw plays the
  most-played track in the library wins every query it appears in at all. If the
  library ever gets a track with six-figure plays, check this constant before
  concluding the ranking is broken.
- **A non-relevance sort still filters with the old substring predicate**, not
  with the full-text recall. That is on purpose: if the two disagreed about what
  matched, the result *set* would change when you clicked a column header, which
  is a worse bug than an unindexed scan.
- **The weights are unfitted.** Same caveat as the C3 rating: `3 / 1 / 0.15` and
  the `0.25` trigram threshold were chosen by judgement. They are in
  `SEARCH_TUNING` in `lib/slice-it/library-query.server.ts` so that a future
  calibration has one place to change.
