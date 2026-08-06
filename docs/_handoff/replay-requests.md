# Replay wave — requests across file boundaries

Written by the agent that built Slice It replay recording, playback and
verification (`R3`/`R4`/`R8` in
[`docs/plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md)).
Everything below is something the replay feature wants and could not do itself,
because the file belongs to somebody else this wave.

## What shipped, so the requests have context

- `lib/slice-it/engine.ts` records `{t, lane, judgment}` per resolution into
  three pre-sized typed arrays (zero allocation on the frame path), and can be
  driven _by_ such a log instead of by a player (`loadReplay` / `advanceReplay` /
  `seekReplay`).
- `lib/slice-it/replay.ts` maps the engine's six judgements onto the four the
  cross-game schema in `lib/game/replay.ts` defines, and records the modifier
  subset the chart seed is derived from.
- `POST /api/slice-it/replay` stores a log — only for a run that is already a
  stored personal best. `GET` answers "which of these players have one".
- `components/slice-it/ReplayViewer.tsx` plays one back through a real
  `GameEngine`, linked from leaderboard rows.
- `lib/slice-it/verify.server.ts` re-judges a log against the real chart with
  the shared `judge()`, asynchronously.

## 1. `AudioManager` cannot seek — replays go silent after a scrub

**Owner:** whoever owns `lib/audio/AudioManager.ts` (shared: Slice It and
RMHMusic both use the singleton).

`AudioManager` exposes `play()`, `pause()`, `stop()` and `getCurrentTime()`.
`play()` starts from the private `pauseTime`, and there is no public way to set
it. So a replay viewer can start audio at 0 and pause/resume it, but it cannot
follow a scrub: dragging the scrubber to 1:40 leaves the audio at 0:12.

The viewer's current answer is to **stop the audio on the first scrub** and keep
playing silently, with a line of UI saying so. A chart at one position and music
at another is worse than silence, so this is the right compromise — but it is a
compromise.

What would remove it entirely:

```ts
/** Move playback to `seconds`, whether or not it is currently playing. */
public seek(seconds: number): void {
  const wasPlaying = this.isPlaying;
  if (this.source) { try { this.source.stop(); } catch {} this.source = null; }
  this.isPlaying = false;
  this.pauseTime = Math.max(0, Math.min(seconds, this.getDuration()));
  if (wasPlaying) this.play();
}
```

That is the whole change — `play()` already reads `pauseTime` as its offset. The
viewer would then call `audio.seek(t)` inside `scrub()` and drop the
`audioSyncedRef` bookkeeping and the "audio stops after seeking" string with it.

## 2. Verification should run in a worker, not in the web process

**Owner:** whoever owns `server/jobs/` (pg-boss) or `go-services/supervisor/`.

`lib/slice-it/verify.server.ts#scheduleVerification` detaches the re-judge with a
`setTimeout(0)` from the upload handler. Nothing on the request path awaits it
and every failure is swallowed into a log line, so it cannot hurt a submission —
but it also does not survive a deploy mid-verification and cannot retry.

`R8` names the Go supervisor as the home; a pg-boss job is the cheaper one.
Either way the seam is already a single exported function:

```ts
import { verifyStoredReplay } from '@/lib/slice-it/verify.server';
const result = await verifyStoredReplay(replayId); // { ok, score, accuracy, … }
```

Replace the body of `scheduleVerification` with an enqueue and the job handler
with that call. Nothing else in the feature needs to change.

## 3. There is nowhere to record a verification verdict

**Owner:** whoever owns `prisma/schema.prisma`.

`verifyStoredReplay` returns a verdict that currently goes to `console.warn` and
nowhere else, because `GameReplay` has no column for one and the schema is not
this agent's file. The smallest useful addition:

```prisma
model GameReplay {
  // … existing
  /// Chart-aware verification (R8): null = not yet checked, true = the inputs
  /// re-judge to the claimed score against the real notes.
  verified       Boolean?
  verifiedAt     DateTime?
  /// Failure code from `lib/slice-it/verify.server.ts#VerifyFailure`.
  verifyReason   String?   @db.VarChar(32)
  /// The score the re-judge derived, when it disagreed.
  verifiedScore  Int?
}
```

Until that exists, a failed verification is visible only in the logs — which is
enough to find out whether the check is calibrated, and not enough to act on.

Related: `SliceRun.suspicion`/`suspicions` (`R7`) is the obvious place for a
verification failure to land as a code, but the run row and the replay row are
not linked. A `GameReplay.runId` (or a `SliceRun.replayId`) would join them.

## 4. `GameReplay` has no `game`-scoped song column

**Owner:** `prisma/schema.prisma`.

"Which replays exist for this song" is answered today with a Postgres JSON path
filter on `data->>'track'`, narrowed first by `userId IN (…)` so it only ever
scans a page of rows. It is correct and fast enough for a leaderboard page, and
it does not scale to "every replay of this chart, ranked".

If a song-wide replay board is ever wanted, `GameReplay` needs either a generic
`subjectId String? @db.VarChar(64)` (the cross-game framing: the thing the replay
is _of_) with an index on `(game, subjectId, score desc)`, or a GIN index on
`data`. The first is better — the second indexes the whole payload to answer one
question about one key.

## 5. `LeaderboardEntry` deliberately does not carry `replayId`

**Owner:** `lib/slice-it/types.ts` (not this agent's file — noted as a decision,
not a request).

The leaderboard panel asks a second endpoint which of the rows on screen have a
replay, rather than the leaderboard route joining one in. That is on purpose:
`LeaderboardEntry` is also read by the multiplayer sidebar and the results
screen, and a replay is a property of a stored run artefact rather than of a
rank. If a future wave _does_ want it inline, the join is
`GameReplay(game='slice-it', userId, data->>'track' = songId)` and the field
should be `replayId: string | null`.
