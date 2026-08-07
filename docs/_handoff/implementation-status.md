# Slice It implementation status

Final status for [`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).

## Totals

| State | Count |
| --- | --- |
| **shipped** | 155 |
| **held for design** | 2 |
| **blocked externally** | 5 |
| **total** | 162 |

## Held for design (2)

These were implemented or specified and then deliberately not shipped. Both are
recorded rather than quietly dropped, because in each case the *reason* is the
useful artefact.

| ID | Idea | Why it is held |
| --- | --- | --- |
| `G3` | Chords as a first-class chart element | Implemented, then **reverted**. It broke `beatmap.test.ts`'s assertion of a GLOBAL minimum gap across all notes regardless of lane — a chord is two notes at gap zero — and that assertion predates this branch. It also contradicts `G12` ("low sound ⇒ lane 0") and perturbs `G14`'s density comparisons. Weakening a pre-existing contract to land a feature is the wrong trade; the analysis is in [`note-vocab-requests.md`](note-vocab-requests.md). Landing it needs the charter's min-gap invariant re-specified as **per-lane**, which is a decision about what the charter guarantees, not a bug fix. |
| `G13` | Combo tiers with mechanical weight | A breaking change to scoring. Every score in `SongLeaderboard` was set under the current curve, so changing it invalidates every existing record — and unlike `R1`'s re-keying, there is no migration that preserves comparability. It needs a product decision about wiping or segregating the boards. |

## Blocked externally (5)

Nothing in this repository can complete these.

| ID | Idea | What it needs |
| --- | --- | --- |
| `C4` | Stem separation for melody-aware charts | A source-separation model and a GPU-class worker. Neither exists in the fleet. |
| `L11` | An RMHMusic bridge | RMHMusic's own schema and storage decisions. The sketch's reference-don't-copy `rmhMusicTrackId` depends on facts about that app that cannot be established from here. |
| `N11` | Tournaments | The platform-wide Tournaments Hub proposed in the 2026-07-15 cross-system doc, which does not exist. Slice It! would be its first client. |
| `V9` | Results replays as clips | A clip encoder. There is none. |
| `X9` | Slice It! as a Discord Activity | Cannot be exercised without a live Discord client. The gateway (`X8`) and the identity/guest path (`X10`) both shipped; this is the part that needs the real thing to test against. |

## Standing caveats

Read these before deploying.

1. **The migrations have never run against Postgres.** There is no database in
   the environment this branch was authored in. Every migration was verified
   statement-for-statement against
   `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
   which is the strongest check available without one, and each carries a header
   saying so. Review them as SQL and run them against a copy first.
2. **`R2`'s skill rating stays at 0 until a moderator promotes a chart.** The
   ranked pool is reachable (`/admin/slice-it`) and the qualification gate is
   automatic, but `ranked` is only ever set by a human — by design (`R10`).
3. **`S3`'s dan ladder ships empty.** `DAN_COURSES` is `[]` on purpose: seeding
   it from whatever happened to be in the library would define a certification
   by an accident of timing. It needs a moderator to choose the setlists, and
   once published a course's chart list must never change.
4. **`O4` stores one encode, not one per client.** Opus, with
   `SLICE_AUDIO_CODEC=aac` as the escape hatch. The exposure is Safari before
   17, which cannot play Ogg Opus through `decodeAudioData`.
5. **The Go fleet is untouched.** Every worker added here (`O3`'s charting,
   `C8`'s regeneration sweep) runs in the Node `jobs` service, which is where
   pg-boss lives.
