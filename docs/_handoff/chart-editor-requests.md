# Chart editor agent — requests outside its file ownership

From the wave implementing phases 1–3 of
[`../slice-it-chart-editor.md`](../slice-it-chart-editor.md) (`C1`).

Everything below is a change in a file this agent does **not** own, or a place
where the shipped code deliberately deviates from the design doc. Nothing here is
required for the shipped work to function: each item states what the editor does
instead, and what is lost.

---

## 1. `lib/slice-it/types.ts` — promote `TimingPoint` and `SvPoint`

**Why.** The design doc's `snap.ts` imports `TimingPoint` from
`@/lib/slice-it/types`, and §11's `ChartPatchZ` bounds a `timingPoints` array. No
such type exists: every chart today is one constant BPM (`Song.bpm`), so nothing
in the game has ever needed one. They are a shared contract the moment `C6`
(timing points) or `G10` (SV) lands, because the **engine** will have to read the
same map the editor writes.

**Change.** Move these two declarations out of
`lib/slice-it/editor/types.ts` into `lib/slice-it/types.ts` and re-export:

```ts
/** A tempo marker. Charts with none fall back to the song's single `bpm`. */
export interface TimingPoint {
  /** Seconds from the start of the track. */
  time: number;
  bpm: number;
  /** Beats per measure. 4 unless a chart says otherwise. */
  meter: number;
}

/** A scroll-velocity marker (G10). */
export interface SvPoint {
  time: number;
  multiplier: number;
}
```

**Without it.** They live in `lib/slice-it/editor/types.ts` and the editor is the
only consumer, which is true today. The cost is that when the engine grows tempo
support it will either import from an `editor/` module or declare a second,
drifting copy.

---

## 2. `prisma/schema.prisma` — `uuid_generate_v7()` is not installed

**Deviation, already shipped.** §1.1 asks for
`@default(dbgenerated("uuid_generate_v7()"))` on `Chart.id`. That function does
not exist in this database (the schema's one precedent, `SignalForgePlayer`, uses
`gen_random_uuid()`), and creating it needs a hand-written SQL migration — which
is outside this agent's ownership and would fail `prisma migrate deploy` on the
first deploy that ran before the function existed.

**What shipped instead.** The column is
`@default(dbgenerated("gen_random_uuid()")) @db.Uuid`, and the **value** is minted
application-side by `uuidv7()` in `lib/slice-it/editor/uuid.ts` — an RFC 9562
UUIDv7, so the insert locality the new-table PK policy (`lib/CLAUDE.md`
§Database) is after is preserved. The column default is only a fallback for a row
inserted without one.

**If you want the doc's version.** Add a migration that creates the function,
then change the default. Nothing else has to move.

---

## 3. `prisma/schema.prisma` + `app/routes/api/slice-it/score.ts` — the
`SongLeaderboard` chart pointer (`R1` / `C12`)

**Not shipped, deliberately.** §1.1 also gives `SongLeaderboard` a `chartId`,
`chartHash`, `difficulty` and `modPool`, and replaces its
`@@unique([songId, userId])` with `@@unique([chartId, difficulty, modPool, userId])`.
That unique constraint is named `songId_userId` and is used by name in the score
submission path, which this agent does not own — changing the schema without
changing the route would break every score write in the tree the moment another
agent's branch merged.

**Change, when `R1` is scheduled.** Apply §1.1's `SongLeaderboard` block and the
`scores SongLeaderboard[]` back-relation on `Chart` (currently omitted from the
model for the same reason), then update the upsert in the score route.

**Without it.** Charts have identity (`chartHash` is computed and stored on every
write) but leaderboard rows do not yet carry it, so an edit is not yet visible on
the board. That is exactly today's behaviour, so nothing regresses.

---

## 4. `lib/slice-it/editor/hash.ts` → `hash.server.ts`

**Deviation, already shipped.** §2 names the file `hash.ts`. It uses
`node:crypto`, and `lib/CLAUDE.md`'s first rule is that anything touching `node:*`
carries the `.server` suffix so the Vite plugin can stub it out of the client
bundle. Nothing in the browser needs it — the server re-derives the hash on every
write precisely so a client cannot claim an unedited chart's identity.

**Without it.** Nothing; this is the repo rule winning over the doc's path.

---

## 5. `app/routes/slice-it/index.tsx` (or `components/slice-it/SongDetailsPanel.tsx`) — an entry point

**Why.** `/slice-it/edit/$songId` exists and works, and nothing links to it. The
natural place is the song details panel, next to the play button, shown only when
`song.isOwner` — that matches the authorisation the API enforces (item 6).

**Change.** One link:

```tsx
{song.isOwner && (
  <Link to="/slice-it/edit/$songId" params={{ songId: song.id }}>
    {t('edit-chart', { defaultValue: 'Edit chart' })}
  </Link>
)}
```

**Without it.** The editor is reachable only by typing the URL.

---

## 6. Product call — who may author a chart (§17.1)

**What shipped.** `POST /api/slice-it/charts` allows the song's **uploader** (and
an admin) to seed and own charts. That is the conservative reading of the
analogous decision the 08-06 security pass made for `patch-analysis`.

**The open question.** §17.1 proposes that anyone may author an *alternate* chart
(`C2`) while the uploader's stays default. That is a policy choice with
moderation consequences (`L9`) and is not this agent's to make. When it is made,
the only change needed is `mayAuthor()` in `app/routes/api/slice-it/charts.ts` —
the `Chart` model is already keyed by `(songId, authorId, difficulty, keys, name)`
and carries a `status`, so multiple authors per song are already representable.

---

## 7. `lib/slice-it/beatmap/index.ts` — persist the analysis artefacts (phase 6)

**Why.** §6 wants the waveform envelope, the **rejected** onset candidates and the
section boundaries kept with the chart. The analyser computes all three and
discards them, and the rejected onsets are the highest-value part of the editor
that does not exist yet: "the generator missed the snare on the second bar"
becomes one click on a ghost instead of a manual placement.

**Change.** Add `AnalysisArtefacts` to the generator's result as §6 specifies and
store it (a separate column or a nested key on `analysisData` — but note §0.1: a
regeneration must still be free to overwrite `analysisData` wholesale, so a
separate column is safer).

**Without it.** Phase 6 cannot start. Phases 1–3 do not need it.

---

## 8. `lib/slice-it/engine.ts` — a non-submitting construction flag (phase 4)

**Why.** §10: playtest is `GameEngine` on the edited chart, and "a run started in
the editor must not be able to reach the leaderboard" — structurally, not by
convention. The doc's sketch is `new GameEngine({ submitting: false })`.

**Change.** Accept an options object with a `submitting` flag (default true) and
make the score-submission path a no-op when it is false.

**Without it.** Phase 4 either cannot start or has to rely on the editor simply
never calling `useSubmitScore`, which is the convention the doc explicitly says is
not good enough.

---

## 9. `vitest.config.ts` — one line, already applied

`'lib/slice-it/editor/__tests__/**/*.test.ts'` was added next to the existing
`lib/slice-it/__tests__` entry, as §15 requires. Flagged here only because the
file is shared: that is the sole edit made to it.

---

## 10. `app/routeTree.gen.ts` — regenerated

Four new route files (`slice-it/edit.$songId`, `api/slice-it/charts`,
`api/slice-it/charts/$id`, `api/slice-it/charts/$id/revisions`) mean the generated
route tree had to be regenerated, or `createFileRoute('/slice-it/edit/$songId')`
does not typecheck. It was regenerated with `@tanstack/router-generator`'s
programmatic API against the whole `app/routes` tree, so the diff also contains
whatever other route files existed in the tree at that moment (it picked up
`app/routes/discord/index.tsx`). The file is generated and deterministic — any
agent that reruns dev/build produces the same content — but it is worth knowing
the diff is not all this agent's.
