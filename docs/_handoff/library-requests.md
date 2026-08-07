# Library / lookup agent — requests outside its file ownership

From the wave implementing `L13, L17, L18, S9` of
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).

Everything below is a change in a file this agent does **not** own. Nothing
here blocks the shipped work — each item is written so the feature degrades
rather than breaks without it, and the degradation is stated.

---

## 1. `prisma/schema.prisma` — an index for the recently-played shelf (L17)

**Why.** `SongPlay` already records `{songId, userId, count, lastPlayedAt}` on
every play, and the new `shelf=recent` branch on
`app/routes/api/slice-it/songs.ts` reads it as
`prisma.songPlay.findMany({ where: { userId }, orderBy: { lastPlayedAt: 'desc' }, take: 12 })`.
The model currently carries only `@@unique([songId, userId])`, so that query is
an unindexed sort over every row the viewer has ever played.

**Change.** One index, on `model SongPlay`:

```prisma
model SongPlay {
  id           String   @id @default(cuid())
  songId       String
  userId       String
  count        Int      @default(1)
  lastPlayedAt DateTime @default(now())

  song Song @relation(fields: [songId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([songId, userId])
  @@index([userId, lastPlayedAt(sort: Desc)])
}
```

**Without it.** The query is correct today — it returns the right 12 rows in
the right order — just an unindexed per-user scan. For any one player's play
history (bounded by how many distinct songs they have ever played) that scan
stays cheap; it only becomes a real cost at a row count this table is not near
yet. No client-visible behavior changes either way; this is purely a "when it
starts to matter, the fix is already written" note.

---

## 2. `lib/slice-it/constants.ts` — not requested

`SONG_SORTS` did **not** need widening for this wave. `L13`'s four extra sort
keys (`artist`, `bpm`, `plays`, `yourScore`) and `S9`'s random-selection
constraints are defined entirely in the new
[`lib/slice-it/library-filters.ts`](../../lib/slice-it/library-filters.ts)
(`LIBRARY_SORTS = [...SONG_SORTS, ...LIBRARY_EXTRA_SORTS]`) and mapped onto real
`ORDER BY` clauses inside `app/routes/api/slice-it/songs.ts`, per the "define
your extra sort keys in your own module and map them in the route" guidance.
Recorded here only so a later wave doesn't wonder whether this was missed —
it wasn't, it was deliberately worked around.
