# Chart editor agent — requests outside its file ownership (phases 4 & 5)

From the wave implementing **playtest** (§10) and **auto-generate** (§8) of
[`../slice-it-chart-editor.md`](../slice-it-chart-editor.md). Companion to
[`chart-editor-requests.md`](chart-editor-requests.md), which covers phases 1–3.

Everything below is a change in a file this agent does **not** own. Nothing here
is required for the shipped work to function: each item states what the editor
does instead, and what that costs.

---

## 1. `lib/slice-it/engine.ts` — `new GameEngine({ submitting: false })`

**Why.** §10 writes the playtest engine as
`new GameEngine({ submitting: false })`, "a flag that makes that structural
rather than a convention: a run started in the editor must not be able to reach
the leaderboard." `GameEngine`'s constructor takes no arguments, and the file is
owned by another agent this wave.

**Change.** An optional constructor argument, stored on the instance, that makes
`getRunStats()` / `getTimingSummary()` (the two reads a submission is built from)
throw — or return null — for a non-submitting run.

**What the editor does instead.** Three layers in
`lib/slice-it/editor/playtest.ts`, none of which needs the engine to change:

1. The map is minted with an `editor:` id and `assertSubmittable(mapId)` throws
   on one.
2. `PlaytestSession` holds its engine in a `#private` field — unreachable at
   runtime, not merely `private` in the type system — and exposes no score,
   accuracy, combo or run token. `runSummary()` exists only to throw.
3. No run token is ever minted, so `/api/slice-it/score` would reject a
   hand-built submission server-side (`run-token.server.ts`).

**What is lost.** Nothing today. The value of the engine-side flag is that it
would keep the guarantee if some _future_ caller constructs an engine for the
editor without going through `PlaytestSession`.

---

## 2. `lib/audio/AudioManager.ts` — `seek(seconds)`

**Why.** Playtest plays **from the playhead**, never from the start of the song
(§10) — an author fixing a bar at 2:40 must not sit through 2:40 of audio. The
A/B loop needs the same thing on every wrap. `AudioManager` can `play`, `pause`
and `stop`, but its playback offset (`pauseTime`) is private and only `pause()`
writes it. The replay viewer hit this first and gave up audio entirely — see the
"Replay playback" note in `engine.ts` and
[`replay-requests.md`](replay-requests.md).

**Change.** Two lines:

```ts
/** Move the playback position. Takes effect on the next `play()`. */
public seek(seconds: number) {
  const was = this.isPlaying;
  this.stop();
  this.pauseTime = Math.max(0, seconds);
  if (was) this.play();
}
```

**What the editor does instead.** `seekAudio()` in `playtest.ts` calls `stop()`
(so the manager's own bookkeeping is at a known zero) and then writes
`pauseTime` through a one-field structural cast. It works, and it is the only
private-field reach in the editor tree.

**What is lost.** The cast breaks silently if the field is renamed. A `seek`
method would also let the replay viewer play audio, which is the larger win.

---

## 3. `lib/slice-it/beatmap/charter.ts` — a density parameter on `buildCharts`

**Why.** §8's `GenerateOptions` carries `densityBias: -2…+2` ("the C10 density
bias; 0 is the generator's own budget"). `buildCharts(notes, duration, seed)`
takes no such knob; its per-tier budget is `targetNps × duration` inside
`selectTier`.

**Change.** An options argument — `buildCharts(notes, duration, seed, { densityScale })`
— multiplying the budget in `selectTier`, defaulting to 1.

**What the editor does instead.** `regenerate()` scales the **duration** it hands
the charter (`duration × densityFactor(bias)`), which is the same arithmetic the
budget performs, because `duration` is used for nothing else in that call path.

**What is lost.** Clarity, and robustness: the day `duration` acquires a second
meaning inside `buildCharts` (a fade-out window, an end-of-chart guard), the
editor's density slider silently changes meaning with it.

---

## 4. `lib/slice-it/beatmap/index.ts` — persist the onset pool, not just the chart

**Why.** §8.2 says the editor re-charts in the browser "from cached analysis
artefacts", and §6 (phase 6) wants the rejected onset candidates for the
onset-ghost strip. `Song.analysisData` stores the _output_ charts and the beat
grid, but not the quantised onset pool the charter selected from.

**Change.** Add the pool (time, strength, lowRatio, highRatio, sustain per onset)
to the stored analysis blob, behind the existing `analysisVersion` bump.

**What the editor does instead.** `lib/slice-it/editor/artefacts.ts` reconstructs
a pool from the **Expert** chart in `analysisData` (Expert is the densest tier and
every other tier is derived from it), assigning each note a strength from its
stored quantisation and a lane bias from the lane the generator chose, then runs
the real `quantizeOnsets` over it.

**What is lost.** Onsets the generator _rejected_ cannot come back. In practice
that caps what "+1 / +2 density" can do: the slider thins reliably and only
thickens up to the density the original analysis already reached. It is also why
the panel shows "re-charting from the existing Expert chart" for songs with no
stored analysis at all.

---

## 5. `locales/*` — the 32 non-English catalogues

English keys for both phases were added to `locales/en/r-slice-it.json`
(`editor-generate-*`, `editor-playtest-*`, `editor-shortcut-playtest*`).
`pnpm i18n:extract` was **not** run, per the wave's instructions — it rewrites
every locale globally. The orchestrator mirrors these keys.
