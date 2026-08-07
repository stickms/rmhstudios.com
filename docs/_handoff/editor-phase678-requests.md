# Chart editor agent — requests outside its file ownership (phases 6–8)

From the wave implementing phases **6 (waveform, onset ghosts, sections)**,
**7 (the linter and publish gating)** and **8 (timing points and SV)** of
[`../slice-it-chart-editor.md`](../slice-it-chart-editor.md).

Everything below is a change in a file this agent does **not** own, or a place
where the shipped code deliberately deviates from the design doc. Nothing here
is required for the shipped work to function: each item says what the editor
does instead, and what is lost by doing it that way.

---

## 1. `lib/slice-it/beatmap/charter.ts` — export the lane-bias thresholds

**Why.** Promoting an onset ghost has to put the note on the lane the charter
would have chosen, or the single most-used interaction in the editor (§6) puts
notes on the wrong side of the playfield. The rule is
`lowRatio >= LOW_LANE_BIAS → lane 0`, `highRatio >= HIGH_LANE_BIAS → lane 1`,
and both constants are module-private.

**What ships instead.** `suggestLane()` in `lib/slice-it/editor/artefacts.ts`
copies the two values (`0.42` / `0.3`). It deliberately does **not** reproduce
the charter's later passes (anti-jack alternation, same-lane spacing), which are
properties of generating a whole chart and meaningless for one promoted note.

**What is lost.** If the thresholds are ever tuned, a promoted ghost lands on
the lane the generator would no longer choose. Visible, and one drag to fix —
but a `export function suggestLane(lowRatio, highRatio)` in `charter.ts`, called
from both places, removes the drift entirely.

---

## 2. `lib/slice-it/engine.ts` — scroll velocity is an INTEGRAL

**Why.** `lib/slice-it/editor/sv.ts` ships the timing-point/SV model (phase 8)
and the editor can now author SV markers, but the engine still draws every note
at `(note.time - now) * pixelsPerSecond`, so the markers change nothing during
play.

**The thing that must not be got wrong** when the engine adopts them: a note's
position is the integral of scroll velocity up to its time, **not** its distance
multiplied by the SV in force at its own time. With a `0.5×` marker at `t=10`,
the naive version draws a note at `t=10.1` at `10.1 × 0.5 = 5.05` units and one
at `t=9.9` at `9.9` units — the later note nearer than the earlier one. **The
notes swap order**, and the player has no way to know the display is lying.

**What to call.** `buildSvTable(svPoints)` once per chart load, then
`scrollOffset(table, note.time, playhead)` per note; `timeAtScroll()` inverts it
for hit-testing. With no markers the table is the identity, so adopting it costs
existing charts nothing. Tests: `lib/slice-it/editor/__tests__/sv.test.ts`.

---

## 3. `lib/slice-it/api-schemas.ts` — `BeatMapZ` strips the new artefacts

**Why.** `generateBeatmap()` now returns an `artefacts` block (peak envelope,
every detected onset with its `kept` flag, sections — §6). The upload route
stores the analysis object wholesale, so uploads carry it. The **client
backfill** path (`AnalysisBackfillZ` → `patch-analysis`) validates field by
field, and zod strips unknown keys, so a legacy song backfilled from a browser
silently loses all three.

**Suggested shape**, with caps in the same spirit as the existing ones:

```ts
artefacts: z
  .object({
    envelope: z.object({ rate: z.number().min(1).max(1000), data: z.string().max(400_000) }),
    onsets: z
      .array(
        z.object({
          t: z.number().min(0),
          s: z.number().min(0).max(1),
          l: z.number().min(0).max(1),
          h: z.number().min(0).max(1),
          k: z.boolean(),
        }),
      )
      .max(20_000),
    sections: z
      .array(
        z.object({
          start: z.number().min(0),
          end: z.number().min(0),
          label: z.string().max(4),
          energy: z.number().min(0).max(1),
        }),
      )
      .max(64),
  })
  .optional(),
```

**What is lost without it.** Backfilled songs open in the editor with no
waveform and no ghosts. Everything else works; the editor treats missing
artefacts as a normal case (see the "degrades to no waveform" test).

---

## 4. Upload-time validation (`C11`) — call the shared linter

**Why.** §9 says the linter is shared with upload-time validation so a
hand-authored chart and a generated one are held to the same standard. The rules
are in `lib/slice-it/beatmap/lint.ts` — pure, no editor types, no DOM — for
exactly this reason, and the editor and the chart API already both import them.

**What to call.** `lintNotes({ difficulty, notes, duration, beats })` and reject
on `hasBlockingErrors(findings)`. The one thing to preserve is the split:
**errors block, warnings do not**. An error means the chart is broken (a jack
inside the engine's own `INPUT_COOLDOWN_MS`, a hold shorter than its release
window); a warning is a taste question.

**Where it is already wired.** `PATCH /api/slice-it/charts/$id` refuses a write
to a **non-draft** chart with errors (422 + the issue list), and `POST` on the
same route — the publish transition — refuses to publish one. Drafts are exempt:
a draft is a work in progress by definition, and an autosave that refuses to
save half-finished work is an autosave that loses it.

---

## 5. `prisma/schema.prisma` — nothing requested, deliberately

The artefacts live in the existing `Song.analysisData` JSON, not a new column.
Sizes, measured rather than guessed, for a 4-minute track:

| Artefact    | Size                                              |
| ----------- | ------------------------------------------------- |
| envelope    | 48 000 bytes → **~64 KB** base64 (200 samples/s, one byte each) |
| onsets      | ~1500 × ~34 bytes → **~50 KB** (one-character keys, rounded) |
| sections    | **< 1 KB**                                        |
| spectrogram | ~40 MB — **which is why it is not persisted**     |

A test asserts the envelope stays under 70 KB for a 4-minute track, so this
budget fails loudly rather than drifting.

---

## 6. Deviations from the design doc, recorded

1. **Publish is `POST /api/slice-it/charts/$id`, not `.../$id/publish`.**
   `routeTree.gen.ts` is generated by the Vite plugin and must not be
   hand-edited, so a new route **file** does not typecheck until a dev server or
   a build has regenerated the tree — it is a build-order dependency, while a
   new **method** on an existing route is not. If someone regenerates the tree,
   splitting it back out is a five-minute change.
2. **The waveform and ghosts are drawn inside the timeline canvas**, not in the
   flanking strips §6 sketches. A second canvas is a second surface to size, a
   second DPR to clamp, and a second draw loop that has to stay in lockstep with
   this one's scroll — the waveform would lag the notes by a frame during a
   drag. No new `requestAnimationFrame` loop was added, so the rAF allowlist is
   unchanged.
3. **The lint worker falls back to running inline.** No `Worker` constructor
   (SSR, an old webview, a CSP that forbids worker scripts) must degrade to a
   linted chart on the main thread, never to an unlinted one: an editor that
   silently stops gating publish is worse than one that stutters. `flush()` —
   what the publish button calls — is always synchronous and inline, because
   "ask the worker and hope" is how a blocked chart gets published.
4. **Timing/SV edits do not go through the command stack.** Undo operates on
   notes; a timing map that could be undone independently of the notes snapped
   to it is a chart that silently comes apart. Extending `Command` to cover the
   timing map is a real improvement and a bigger change than this phase.
5. **The `timing` tool has no canvas interaction yet** — selecting it opens the
   timing/SV panel in the rail, and dragging a marker on the timeline is still
   to do. The panel anchors both kinds of marker to the playhead, which is the
   interaction that actually matters (you scrub to the bar where the tempo
   changes and press Add).
6. **The off-grid rule uses the editor's own definition of on-grid**, not the
   charter's. `quantizationOf()` in `snap.ts` buckets a note by the finest of
   `{1,2,3,4,6,8}` it lands within 0.02 of a beat of and calls anything else
   off-grid — the note the timeline already draws grey. The charter's 55 ms
   snap tolerance is right for a *quantiser* and makes the *lint rule*
   unreachable above ~85 BPM, because at those tempos no position in a beat is
   more than 42 ms from some subdivision of it. A rule that cannot fire is worse
   than no rule: it reads as passing.
