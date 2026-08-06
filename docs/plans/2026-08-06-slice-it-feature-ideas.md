# Slice It! — feature & update ideas (2026-08-06)

**152 numbered ideas** for the rhythm game, drawn from what the genre's
reference implementations do and Slice It! does not: osu!/osu!mania, StepMania
& DDR, Beatmania IIDX, Sound Voltex, Etterna & Quaver, Beat Saber, Clone Hero,
Taiko no Tatsujin, Muse Dash, Arcaea, Cytus, Friday Night Funkin', Rhythm
Doctor, A Dance of Fire and Ice, Rocksmith, Crypt of the NecroDancer, Guitar
Hero and Groove Coaster.

This is a **catalogue, not a roadmap.** Nothing here is scheduled. The
numbering is stable so an agent can be pointed at `R3` or `G11` and know
exactly what it means without re-deriving anything.

Every entry was checked against the code first. The **Gap** line is a
verifiable fact about specific files as of this date — if a Gap line is wrong,
the idea is wrong, and the fix is to delete the entry rather than build it.

---

## §0 — How to read this

| Field         | Meaning                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| **Gap**       | What is true in the repo today. Names the file that proves the feature is missing. |
| **Build**     | The change, concretely enough to start from.                                       |
| **Prior art** | Which rhythm game already does this, so the design question is "which variant".    |
| **Touches**   | Files and directories the work lands in.                                           |
| **Size**      | `S` ≤ 2 days · `M` ≤ 2 weeks · `L` > 2 weeks                                       |

### Section index

| §   | IDs      | Theme                                            |
| --- | -------- | ------------------------------------------------ |
| 1   | `G1–G14` | Note vocabulary and the core loop                |
| 2   | `C1–C12` | Charting and the beatmap pipeline                |
| 3   | `P1–P10` | Practice, training and improvement               |
| 4   | `A1–A10` | Accessibility and comfort                        |
| 5   | `H1–H10` | HUD, feedback and the results screen             |
| 6   | `M1–M10` | Modifiers and mutators                           |
| 7   | `S1–S12` | Solo game modes                                  |
| 8   | `N1–N12` | Multiplayer and competitive play                 |
| 9   | `R1–R10` | Ranking, scoring integrity and replays           |
| 10  | `L1–L12` | The song library and creator tools               |
| 11  | `X1–X10` | Platform integration (economy, social, profile)  |
| 12  | `V1–V12` | Presentation, cosmetics and identity             |
| 13  | `I1–I10` | Input, hardware and device support               |
| 14  | `O1–O8`  | Telemetry, content operations and infrastructure |

### Conventions every idea assumes

Not restated per entry — these are the repo's rules
([`/CLAUDE.md`](../../CLAUDE.md)), and an idea that violates one is wrong:

- Any value both a client and the server could disagree about (a hit window, a
  modifier's score weight, a lobby cap) belongs in
  [`lib/slice-it/constants.ts`](../../lib/slice-it/constants.ts), which is
  imported verbatim by the esbuild server bundle and must stay free of browser
  and Node imports.
- API routes wrap in `defineHandler` from `@/lib/api/handler.server`.
- Anything touching Prisma / `node:*` / secrets lives in a `*.server.ts` file.
- Every user-facing string goes through `t("key", { defaultValue })`, then
  `pnpm i18n:extract`. Slice It!'s namespace is `r-slice-it`; it is already in
  `NAMESPACES`, so no registry change is needed for strings added to it.
- Slice It! is one of the games with a **bespoke visual identity** — it uses
  the scoped `--slice-*` palette on a `.slice-theme` wrapper, not the site
  tokens. New in-game surfaces follow that palette; new _site_ surfaces (a
  chart hub page under `_site/`) follow `--site-*` and the glass elevation
  classes.
- Wire events go in [`lib/slice-it/net/events.ts`](../../lib/slice-it/net/events.ts)
  with a zod schema on both directions; the handler tests in
  `lib/slice-it/__tests__/` are the contract.
- Scoring changes touch `lib/slice-it/scoring.ts`, which is shared by the
  engine **and** `/api/slice-it/score`. Changing one side alone makes every
  submission implausible.

---

## §0.1 — What already exists (do not re-propose)

Checked in the code on 2026-08-06. Anything here is shipped:

**Gameplay.** Two lanes; seven note types (`STANDARD`, `MOVING`, `LONG`,
`SILENT`, `SPEED`, `BOMB`, `SWITCH`); six judgements (`MARVELOUS` → `MISS`)
with rate-scaled windows; combo-multiplied scoring; hold ticks and a hold
release bonus; letter grades SS→F by accuracy; four nested difficulties;
eight modifiers (invisible, speed 0.5–2.0×, sudden death, bombs, switching,
spin, strict timing, one track); pause; per-lane input debounce.

**Charting.** Full server-side analysis per song — SuperFlux onsets,
comb-filtered autocorrelation tempo with a log-normal prior, Ellis DP beat
tracking, subdivision quantisation with a 55 ms drop threshold, density-budgeted
nested difficulties, frequency-driven lane assignment with playability
overrides, seeded and reproducible, versioned by `BEATMAP_VERSION`.

**Multiplayer.** 8-player lobbies, join codes, quickplay, public lobby browse,
chat, kick, ready-up, rematch, per-seat modifiers with a multiplayer clamp,
server-owned timers as absolute timestamps, two disconnect grace windows, a
room-wide pause with a 3-pause cap and a re-count on resume, seats keyed by
`userId`.

**Library & platform.** Uploads with content-hash dedupe, 50 MB / 15-minute
ceilings, global 10 GB + per-account 1 GB quotas, object storage with a local
fallback, server-side search and sort, likes, comments, play counts, per-song
leaderboards with cursor paging and a self-row, a global career board, score
plausibility bounds, three achievements, one arcade quest, Arcade Pass result
reporting, keybind/volume/hit-sound/offset settings with a calibration screen,
gamepad support, and a canvas-2D glow degradation tier.

---

## §1 — Note vocabulary and the core loop (`G1–G14`)

The chart language is seven note types on two lanes. Everything below adds
either a new thing to hit or a new reason the existing things read differently.

### G1 — A health gauge, and therefore a fail state

**Gap.** `lib/slice-it/engine.ts:480` publishes `health: 100` as a literal.
The field exists on the wire (`ScoreReport.health` in `net/events.ts`) and is
rendered by the multiplayer sidebar, but nothing ever moves it. The only way
to fail a run is Sudden Death, which ends it on the first miss.

**Build.** A gauge in the engine: misses drain, hits recover, `BAD` is roughly
neutral. Make it a **gauge type**, not one curve, because the genre has
settled on several with different meanings — `normal` (fail below 0),
`survival` (steeper drain, no recovery ceiling), `groove` (must finish above a
threshold, cannot fail mid-song), and `no-fail`. Add `gaugeType` to
`Modifiers`, a `MODIFIER_BONUSES` entry for the strict ones, and a fail
transition to `GameStatus`.

**Prior art.** IIDX groove gauge (normal/hard/ex-hard/assisted), DDR life bar,
osu! HP drain, Beat Saber energy.
**Touches.** `lib/slice-it/engine.ts`, `constants.ts`, `types.ts`,
`modifiers.ts`, `scoring.ts`, `components/slice-it/HUD.tsx`. **Size.** M

### G2 — Four-key and six-key lane modes

**Gap.** Two lanes is hard-coded everywhere: `Slice.lane` is documented as
"0 = top/left, 1 = bottom/right", the charter alternates between exactly two,
`Keybinds` has `lane1`/`lane2`, and `GameCanvas` has two gamepad button sets.

**Build.** Make lane count a chart property (`BeatMap.keys: 2 | 4 | 6`) and
generate 4K alongside 2K from the same onset list — the charter's frequency
banding already produces the information a 4-lane assignment needs, it is
currently collapsed into a binary. Keybinds become an array; the canvas lays
out N columns. 2K stays the default and every existing chart keeps working.

**Prior art.** osu!mania (4K/7K), Quaver, Etterna, DDR (4 panels).
**Touches.** `lib/slice-it/beatmap/charter.ts`, `types.ts`, `store.ts`,
`components/slice-it/GameCanvas.tsx`. **Size.** L

### G3 — Chords as a first-class chart element

**Gap.** The charter enforces "no more than 2 consecutive notes in one lane"
and a per-tier minimum same-lane gap, but nothing deliberately places two
notes on the _same timestamp in different lanes_. Simultaneous hits happen by
accident, not by design, and the engine's per-lane `INPUT_COOLDOWN_MS`
debounce was written for single notes.

**Build.** A chord pass in the charter that promotes strong onsets (kick +
crash together, downbeats above a percussive-energy threshold) to two-lane
hits, budgeted separately from the note-density budget. Judge a chord as one
unit with a small inter-hand tolerance so a 12 ms spread is not a `GREAT` and
a `MARVELOUS`.

**Prior art.** Every 4K game; IIDX chord charts; Clone Hero.
**Touches.** `lib/slice-it/beatmap/charter.ts`, `engine.ts`. **Size.** M

### G4 — Directional slices

**Gap.** A "slice" is a keypress. `SliceType` has no direction, and touch
input resolves to a lane, not a gesture — which leaves the game's own name
describing something it does not simulate.

**Build.** An optional `direction` on `Slice` (`up`/`down`/`left`/`right`),
rendered as an arrow on the note and satisfied by a swipe on touch, a stick
flick on gamepad, or a second modifier key on keyboard. Gate it behind a chart
flag so it is opt-in per chart and never breaks a keyboard-only player.

**Prior art.** Beat Saber cut direction, Muse Dash, Groove Coaster, Taiko
don/ka.
**Touches.** `types.ts`, `constants.ts`, `engine.ts`, `GameCanvas.tsx`.
**Size.** L

### G5 — Judged hold releases

**Gap.** `HOLD_RELEASE_POINTS` is a flat 100 for releasing inside the window
(`constants.ts:83`). Release timing is binary — you either got the bonus or
you did not — so long notes contribute no accuracy signal and there is nothing
to improve at.

**Build.** Run the release through `judge()` like a tap, with its own (wider)
window scale, and fold the result into the accuracy denominator. Add a
`holdRelease` accuracy weight so an LN chart's accuracy is comparable to a
tap chart's.

**Prior art.** osu!mania LN release judgement, Etterna, IIDX charge notes.
**Touches.** `scoring.ts`, `constants.ts`, `engine.ts`. **Size.** S

### G6 — Rolls and repeat notes

**Gap.** Sustained energy — a drum fill, a cymbal swell — either charts as a
run of taps or gets dropped by the 55 ms quantisation filter. There is no note
that means "keep hitting".

**Build.** A `ROLL` type with a duration and a hit-count target, scored on
hits-per-second inside the window rather than on individual timing. The onset
detector already produces the density signal to place them: a region where the
flux stays above the adaptive threshold for longer than a beat is exactly a
roll.

**Prior art.** Taiko drumrolls, DDR rolls, IIDX, StepMania `Roll` notes.
**Touches.** `lib/slice-it/beatmap/charter.ts`, `constants.ts`, `engine.ts`.
**Size.** M

### G7 — Chart-native mines

**Gap.** `BOMB` exists but only as a **modifier** — `BOMB_CONVERSION_RATE`
converts 5% of eligible notes at runtime (`constants.ts:90`). The charter never
places one deliberately, so a bomb never lands anywhere musically meaningful;
it lands on a note that happened to be eligible.

**Build.** Place mines in the charter at rests the chart wants you to _not_
hit — the gap after a phrase end, the off-beat inside a syncopated run. Keep
the modifier as a density multiplier over chart-native mines rather than as
the only source of them.

**Prior art.** DDR mines, StepMania, Beat Saber bombs.
**Touches.** `lib/slice-it/beatmap/charter.ts`. **Size.** S

### G8 — Quantisation colouring

**Gap.** Every note renders identically. `charter.ts` snaps onsets to
`{0, ¼, ⅓, ½, ⅔, ¾}` of the beat and then **throws the subdivision away** — it
is the single highest-value piece of information the analyser produces for
readability, and it never reaches the player.

**Build.** Keep the snapped subdivision on `Slice` and colour the note by it:
quarter notes one colour, eighths another, triplets a third, sixteenths a
fourth. This is the change that makes a dense chart readable at a glance, and
it is nearly free — the data already exists one function earlier.

**Prior art.** StepMania note colours (the genre standard), Etterna, Quaver.
**Touches.** `lib/slice-it/beatmap/charter.ts`, `types.ts`,
`components/slice-it/GameCanvas.tsx`. **Size.** S

### G9 — Scroll speed as a player setting

**Gap.** There is no scroll-speed setting anywhere — not in `store.ts`, not in
`MainMenu`'s settings panel. Note approach speed is whatever the renderer
does, which means a 90 BPM chart and a 175 BPM chart are read at wildly
different visual densities and the player cannot correct for it.

**Build.** A persisted `scrollSpeed` in the store with two modes: **constant
rate** (notes always travel at N screen-heights per second regardless of BPM —
the modern default) and **BPM-locked** (speed scales with tempo, preserving
the beat-to-distance relationship). Purely visual; it must not touch scoring
or the leaderboard.

**Prior art.** Universal. osu!mania scroll speed, StepMania `x-mod`/`c-mod`,
IIDX green number, Clone Hero highway speed.
**Touches.** `lib/slice-it/store.ts`, `components/slice-it/MainMenu.tsx`,
`GameCanvas.tsx`. **Size.** S

### G10 — Scroll-velocity gimmicks

**Gap.** `SliceType.SPEED` carries a `speedMultiplier` on a single note. There
is no timeline of scroll-velocity changes, so a chart cannot slow down for a
breakdown or accelerate into a drop.

**Build.** An `svPoints: { time, multiplier }[]` array on `BeatMap`, applied as
a piecewise-constant multiplier on the note-position integral. Generate a
conservative default from the analyser's own section energy (see C6) and let
manual charts (C1) author them.

**Prior art.** osu!mania SV, Quaver, IIDX soflan, Arcaea.
**Touches.** `types.ts`, `chart.ts`, `GameCanvas.tsx`. **Size.** M

### G11 — Downscroll, upscroll and playfield layout

**Gap.** The playfield orientation is fixed by the renderer. Lane 0 is
documented as "top/left" and lane 1 as "bottom/right" — a single hard-coded
geometry.

**Build.** A `playfield` setting: scroll direction (down/up/left/right),
judgement-line position as a percentage of the field, and playfield width. All
persisted, all visual-only. Downscroll versus upscroll is the single most
common preference argument in the genre and costs almost nothing to support.

**Prior art.** osu!mania, Quaver, Etterna, FNF (upscroll by default).
**Touches.** `lib/slice-it/store.ts`, `GameCanvas.tsx`, `MainMenu.tsx`.
**Size.** M

### G12 — Note-attack sound feedback (key sounds)

**Gap.** `hitSound` is a single global sample chosen in settings and played
per hit (`engine.ts:430`). Every note in every song sounds the same.

**Build.** Optional per-note sound assignment derived from the note's own
frequency band — the charter already computes bass-dominant versus
bright-dominant to assign lanes, so it can assign a low/mid/high sample from
the same signal. A chart then _sounds_ like the drum pattern it is charting.

**Prior art.** IIDX/BMS key sounds, Taiko don/ka pitch, Rhythm Doctor.
**Touches.** `lib/slice-it/beatmap/charter.ts`, `engine.ts`,
`lib/audio/AudioManager`. **Size.** M

### G13 — Combo tiers with mechanical weight

**Gap.** Combo multiplies score linearly and without bound
(`pointsFor(result, combo, multiplier)` in `scoring.ts:71`), so a 400-note
chart's last note is worth 400× its first. Score is dominated by chart length
rather than by performance.

**Build.** Cap the combo multiplier at a tier ceiling (e.g. ×1 → ×8 in steps at
10/25/50/100 combo) and rebalance base points upward to compensate. This makes
scores comparable across songs of different lengths, which is the precondition
for a meaningful global ranking (R2). **Breaking change** — needs a scored
migration plan or a new board generation, and `maxPlausibleScore` recalculated.

**Prior art.** DDR/ITG combo tiers, Beat Saber's ×1–×8, Guitar Hero streak
multiplier.
**Touches.** `scoring.ts`, `constants.ts`, `app/routes/api/slice-it/score.ts`.
**Size.** M

### G14 — Section-aware note density

**Gap.** The density budget in `charter.ts` is a single notes-per-second
target per difficulty spread over the whole track. A quiet intro and a
maximal chorus get the same budget, so intros are over-charted and drops are
under-charted.

**Build.** Spend the budget proportionally to per-section onset energy (using
C6's section boundaries), with a floor so a quiet section is never empty and a
ceiling so a drop never exceeds the tier's readable density.

**Prior art.** Every hand-charted game; osu! star-rating-aware spread guidelines.
**Touches.** `lib/slice-it/beatmap/charter.ts`. **Size.** M

---

## §2 — Charting and the beatmap pipeline (`C1–C12`)

The analyser is the strongest part of the game. These are the things it cannot
do because nothing above it exists.

### C1 — A chart editor

**Gap.** Charts are generated and never edited. There is no editor, no manual
note placement, and `patch-analysis` is the only write path — and it only
accepts a strictly-newer _generated_ analysis.

**Build.** A `/slice-it/edit/$songId` surface: waveform, beat grid, note
placement, per-difficulty tabs, playtest-in-place. Store hand-edits as a
separate `Chart` row rather than overwriting `Song.analysisData`, so
regeneration never destroys human work. This is the single change that
converts the game from a toy into a platform — every entry in §10 gets better
when charts have authors.

**Prior art.** osu! editor, StepMania/ArrowVortex, Quaver editor, Moonscraper.
**Touches.** new `app/routes/slice-it/edit.$songId.tsx`,
`components/slice-it/editor/`, `prisma/schema.prisma`. **Size.** L

### C2 — Multiple charts per song

**Gap.** `Song.analysisData` is one JSON blob holding one generated chart set.
One song has exactly one interpretation, forever.

**Build.** A `Chart` model (`songId`, `authorId`, `keys`, `difficulty`,
`data`, `isGenerated`, `status`) with `Song.analysisData` kept as the
generated fallback. The song details panel gains a chart picker; leaderboards
key on `chartId` (see R1).

**Prior art.** osu! beatmap sets, StepMania packs, Clone Hero alternate charts.
**Touches.** `prisma/schema.prisma`, `lib/slice-it/songs.server.ts`,
`components/slice-it/SongDetailsPanel.tsx`. **Size.** L

### C3 — A computed difficulty rating

**Gap.** Difficulty is one of four names. Two `expert` charts can be an order
of magnitude apart in actual difficulty, and the library's sort options
(`recent`, `popular`, `liked`, `title`, `duration` — `SONG_SORTS`) offer no way
to find something at your level.

**Build.** A numeric rating computed at analysis time from the chart itself:
peak and sustained NPS, jack density (same lane repeated), burst length,
hold overlap, and the subdivision mix from G8. Store it on the chart, expose it
as a sort and a filter, and show it on the card. Even a rough number beats four
buckets.

**Prior art.** osu! star rating, Etterna MSD, Quaver difficulty, IIDX level +
clear-rate tables.
**Touches.** `lib/slice-it/beatmap/charter.ts`, new `lib/slice-it/rating.ts`,
`prisma/schema.prisma`, `SongLibrary.tsx`. **Size.** M

### C4 — Stem separation for melody-aware charts

**Gap.** The analyser charts the mixed signal. Lane assignment splits by
frequency band, which approximates "drums versus everything else" and fails
whenever a bassline and a kick occupy the same band.

**Build.** A Go worker step under `go-services/supervisor` that runs source
separation (Demucs or an ONNX equivalent) and hands the charter four stems.
Drums drive the rhythm skeleton, vocals and lead drive the melodic notes,
which is what makes a chart feel like it is charting _the song_ rather than
the mix.

**Prior art.** Rock Band/Clone Hero per-instrument charts, Rocksmith, Beat
Saber community auto-mappers.
**Touches.** `go-services/supervisor/`, `lib/slice-it/beatmap/`. **Size.** L

### C5 — Section detection

**Gap.** The analyser produces onsets, a tempo and a beat grid. It has no
notion of structure — intro, verse, chorus, drop, outro — so nothing
downstream can reason about "the chorus".

**Build.** Self-similarity matrix over the existing log-frequency filterbank
output (the spectrogram is already computed in `spectrum.ts`), with novelty
peak-picking for boundaries. Store `sections: { start, end, label, energy }[]`
on the chart. Feeds G14, P2, H6, L7 and V3.

**Prior art.** osu! kiai time, Guitar Hero star power phrases, DDR freeze
sections.
**Touches.** `lib/slice-it/beatmap/spectrum.ts`, new
`lib/slice-it/beatmap/sections.ts`. **Size.** M

### C6 — A real timing map instead of one BPM

**Gap.** `BeatMap.bpm` is a single number and `Song.bpm` is a single nullable
float. The DP beat tracker already produces a full beat sequence that handles
drift — and then the result is collapsed to one average tempo.

**Build.** Persist the beat sequence as `timingPoints: { time, bpm, meter }[]`.
Everything that currently divides by a global BPM (subdivision snapping, the
metronome in P4, the editor grid in C1) becomes correct on tracks with tempo
changes, which today are silently charted against an average that fits neither
half.

**Prior art.** osu! timing points, StepMania BPM changes, Clone Hero sync
track.
**Touches.** `lib/slice-it/beatmap/tempo.ts`, `index.ts`, `types.ts`.
**Size.** M

### C7 — Preview points

**Gap.** The library plays nothing. `SongLibrary.tsx` renders cards with
metadata; the only way to hear a track is to start a run.

**Build.** A `previewStart` on the song, defaulted to the highest-energy
section boundary from C5, and a 20-second preview streamed from the existing
`/api/slice-it/songs/stream/$id` with a range request. Hover-to-preview in the
library, auto-preview in the details panel.

**Prior art.** osu! song select previews, Beat Saber, Muse Dash.
**Touches.** `lib/slice-it/beatmap/`, `components/slice-it/SongLibrary.tsx`.
**Size.** S

### C8 — Chart regeneration on demand

**Gap.** `BEATMAP_VERSION` gates charts and `patch-analysis` accepts strictly
newer versions — but the only thing that produces a newer chart is a player
opening a legacy song in a browser. Songs charted by version N stay at version
N forever once the client-side path stops applying.

**Build.** A "regenerate chart" action for the uploader and for admins, and a
backfill job in the Go supervisor that re-analyses songs below the current
`BEATMAP_VERSION` at a rate limit. Keep the old chart until the new one
validates, and keep leaderboards attached to the chart version they were set
on (R1).

**Prior art.** osu! ranking criteria re-checks; Beat Saber map re-uploads.
**Touches.** `go-services/supervisor/`, `app/routes/api/slice-it/songs/$id/`.
**Size.** M

### C9 — Import external chart formats

**Gap.** Every chart in the game is generated by our own analyser. There is no
import path, so decades of existing community charting is unreachable.

**Build.** Parsers for `.sm`/`.ssc` (StepMania), `.osu` (osu!mania) and
`.chart` (Clone Hero) that map onto our `Slice` model, behind an
uploader-supplied audio file. Import is a **conversion**, so mark converted
charts as such and keep them out of the ranked pool (R10) unless verified.

**Prior art.** Quaver imports osu!; Etterna imports osu!/SM; Clone Hero imports
Guitar Hero.
**Touches.** new `lib/slice-it/import/`, `app/routes/api/slice-it/songs/upload.ts`.
**Size.** L

### C10 — Uploader density override

**Gap.** The uploader has no influence on their chart. Density budgets are
per-tier constants in the charter; if the analyser over-charts a sparse
ambient track, the uploader's only recourse is to delete it.

**Build.** A `densityBias` (−2…+2) and a `laneBias` on the song, applied as
multipliers to the tier budgets, with a live re-chart preview. Cheap to build,
and it converts the most common upload complaint into a slider.

**Prior art.** Beat Saber auto-mapper settings, Audiosurf difficulty presets.
**Touches.** `lib/slice-it/beatmap/charter.ts`, `SongDetailsPanel.tsx`.
**Size.** S

### C11 — Chart linting

**Gap.** Nothing checks a generated chart for playability before it reaches a
player. The only playability rules are the two inline constraints in the lane
assigner (max 2 consecutive same-lane, per-tier minimum gap).

**Build.** A lint pass over the finished chart: unhittable jacks (same lane
faster than `INPUT_COOLDOWN_MS`), notes inside the first 2 seconds before the
player can react, holds shorter than their own release window, density spikes
above the tier ceiling, and empty stretches longer than 8 seconds. Surface
failures to the uploader and refuse to publish `expert` on a chart that fails.

**Prior art.** osu! AiMod, Quaver's map validator, ArrowVortex checks.
**Touches.** new `lib/slice-it/beatmap/lint.ts`, upload route. **Size.** S

### C12 — Deterministic chart hashing

**Gap.** `Song.contentHash` hashes the **audio**, per uploader. Nothing
identifies a _chart_, so two players cannot prove they played the same notes,
and a leaderboard cannot tell that a regeneration changed the chart underneath
it.

**Build.** A stable `chartHash` (SHA-256 over the canonicalised note list plus
`BEATMAP_VERSION`), stored on the chart and recorded on every leaderboard row
and replay. Prerequisite for R1, R3 and R10.

**Prior art.** osu! beatmap MD5, Etterna chart keys, StepMania GrooveStats
hashes.
**Touches.** `lib/slice-it/beatmap/index.ts`, `prisma/schema.prisma`,
`score.ts`. **Size.** S

---

## §3 — Practice, training and improvement (`P1–P10`)

Slice It! today has exactly one way to interact with a chart: play it from the
start at full speed. There is no seek, no loop, no slow-down that counts, and
no way to see _why_ you missed.

### P1 — Practice mode

**Gap.** No seek and no loop exist anywhere in the engine — `start()`,
`pause()`, `resume()` and `reset()` are the whole transport
(`lib/slice-it/engine.ts`). Speed below 1.0× is supported but hard-rejected by
the score route (`RANKED_MIN_SPEED`), which is correct for ranking and means
slow practice has no home.

**Build.** A practice mode with a seek bar, A/B loop markers, a speed slider
that goes to 0.5× without complaint, and an explicit "unranked" banner. Nothing
submits. Add `mode: 'ranked' | 'practice'` to the run rather than trying to
make the score route lenient.

**Prior art.** osu! practice/test play, StepMania practice mode, Clone Hero
practice, Rocksmith.
**Touches.** `lib/slice-it/engine.ts`, `useStartRun.ts`, `GameCanvas.tsx`.
**Size.** M

### P2 — Failed-section drilling

**Gap.** Nothing records _where_ in a chart you missed. `RunStats` keeps a
judgement histogram and totals; the timestamps are discarded at the end of the
run.

**Build.** Keep per-note results with timestamps for the last run, bucket them
by section (C5), and offer "drill the worst section" — a loop over that
section at a chosen speed that ratchets up as accuracy improves.

**Prior art.** Rocksmith Riff Repeater (the canonical implementation), Clone
Hero practice, Yousician.
**Touches.** `engine.ts`, `components/slice-it/GameOver.tsx`. **Size.** M

### P3 — Autoplay

**Gap.** There is no way to watch a chart played correctly. A player who
cannot read a pattern has no reference, and there is no way to demo the game
on the landing surface.

**Build.** An autoplay run — the engine resolves each note as `MARVELOUS` at
its exact time — usable both as an in-menu "watch" button and as an attract
loop behind the main menu. Autoplay runs never submit; enforce that at the
engine boundary, not in the UI.

**Prior art.** osu! auto mod, StepMania autoplay, IIDX autoplay demo.
**Touches.** `lib/slice-it/engine.ts`. **Size.** S

### P4 — Assist tick and metronome

**Gap.** The only audio feedback is `hitSound` on a successful hit. A player
who is systematically early hears nothing that tells them so.

**Build.** Two independent toggles: a **metronome** on the beat grid (needs
C6's timing map to be right on tempo-changing tracks) and an **assist tick**
that plays on every note's exact time regardless of whether you hit it. Both
are learning tools; both should be unranked-optional rather than banned,
following the genre's split.

**Prior art.** osu! nightcore/metronome, StepMania assist tick, DDR.
**Touches.** `engine.ts`, `store.ts`, `MainMenu.tsx`. **Size.** S

### P5 — Automatic offset calibration

**Gap.** `CalibrationScreen.tsx` exists and `audioOffset` is persisted (±500 ms),
but calibration is a manual slider — the player guesses, plays, and guesses
again. Nothing measures their actual mean error.

**Build.** After any run, compute the mean signed timing error across hits. If
it is consistently offset by more than ~8 ms across enough notes, offer a
one-tap "apply suggested offset (−14 ms)". This is the highest-value
quality-of-life change in the whole document: a mis-set offset makes a good
player feel bad and they usually never find out why.

**Prior art.** osu! offset wizard, Etterna auto-calibration, Quaver.
**Touches.** `engine.ts`, `GameOver.tsx`, `store.ts`. **Size.** S

### P6 — Timing error statistics

**Gap.** `RunStats.judgements` is a histogram of six buckets. It cannot
distinguish "consistently 30 ms early" from "randomly ±30 ms", which are
opposite problems with opposite fixes.

**Build.** Track mean error and standard deviation (the genre calls the latter
**unstable rate**, ×10 of the standard deviation in ms). Show both on the
results screen with a hit-distribution plot. Also the strongest anti-cheat
signal available without replays — see R7.

**Prior art.** osu! unstable rate (the reference), Etterna, Quaver.
**Touches.** `engine.ts`, `types.ts`, `GameOver.tsx`. **Size.** S

### P7 — Adaptive difficulty warm-up

**Gap.** Difficulty is chosen once, per run, from four names. Nothing responds
to how the player is actually doing.

**Build.** A warm-up session mode: start at the player's last-cleared tier,
step up on a clean clear, step down on a fail, across a queue of songs. Uses
C3's numeric rating to pick the next chart rather than the four buckets.

**Prior art.** Crypt of the NecroDancer's progression, Muse Dash's course
mode, adaptive Rocksmith.
**Touches.** new `lib/slice-it/session.ts`, `MainMenu.tsx`. **Size.** M

### P8 — A weakness profile

**Gap.** Nothing is aggregated across runs. `Player.totalScore` and
`gamesPlayed` are the only career state; there is no record of what a player is
good or bad at.

**Build.** Classify each note by pattern type at chart time (jack, trill,
stream, chord, hold, burst) and aggregate per-player accuracy per type across
runs. Show it as a profile radar and use it to recommend charts that target
the weakest axis.

**Prior art.** Etterna's skillset breakdown (jumpstream/handstream/jacks/…),
osu!'s pp-per-skill decomposition.
**Touches.** `prisma/schema.prisma`, `lib/slice-it/rating.ts`, profile UI.
**Size.** L

### P9 — Race your own personal best

**Gap.** The leaderboard shows a number after the fact. During a run there is
no reference point at all — you cannot tell mid-song whether you are ahead of
your PB.

**Build.** A pace bar: the score curve of your previous best on this chart,
sampled every second and stored alongside the leaderboard row, drawn as a
ghost line against your live score. Reuses the multiplayer sidebar's existing
live-score rendering with a synthetic opponent.

**Prior art.** Beat Saber score ghost, Trackmania-style ghosts, DDR EX score
pace.
**Touches.** `prisma/schema.prisma`, `MultiplayerSidebar.tsx`, `HUD.tsx`.
**Size.** M

### P10 — A tutorial

**Gap.** A new player's first screen is a song library and a settings panel
with keybinds, two volume sliders, a hit-sound picker and a calibration
button. Nothing explains a `MARVELOUS`, a hold, a bomb or a lane.

**Build.** A short scripted chart on a bundled track that introduces one
mechanic at a time with on-screen prompts, ending in the calibration screen so
offset gets set before the first real run. Gate the achievement
`game.slice_it.first_play` behind finishing it or skipping it explicitly.

**Prior art.** Every rhythm game ships one; Rhythm Doctor's is the best in
class.
**Touches.** new `components/slice-it/Tutorial.tsx`, `data/`. **Size.** M

---

## §4 — Accessibility and comfort (`A1–A10`)

`lib/game-capabilities.ts:173` declares Slice It!'s `accessibility` array as
**empty** and its descriptors as `['flashing', 'user-content']`. That is an
accurate self-assessment, and it is the gap.

### A1 — No-fail and assist modes

**Gap.** With G1 there is a fail state; without it there is only Sudden Death.
Either way there is no assist tier — no way for a player who cannot clear a
chart to see the end of it.

**Build.** `noFail` (never ends early) and `assist` (0.75× speed with full
visuals), both explicitly unranked and both surfaced in the modifier panel
rather than hidden in settings. Set `accessibility: ['assist-mode']` in
`game-capabilities.ts` when it lands.

**Prior art.** IIDX assisted clear, DDR no-recover off, Celeste-style assist
framing.
**Touches.** `modifiers.ts`, `constants.ts`, `lib/game-capabilities.ts`.
**Size.** S

### A2 — A photosensitivity mode

**Gap.** The game declares `descriptors: ['flashing']` and offers nothing to
turn the flashing off. `canvasGlowEnabled()` degrades blur for _performance_
(`lib/render/canvas2d-fx.ts`), which is a different axis — a fast machine
still gets the full flash.

**Build.** A `reducedFlash` setting that caps luminance delta per frame,
disables the combo-milestone flashes and the hit-burst particles, and forces
the spin modifier off. Respect `prefers-reduced-motion` as the default value,
and honour it independently of the performance tier.

**Prior art.** WCAG 2.3.1; Beat Saber's reduced-debris option; Muse Dash's
effect toggles.
**Touches.** `GameCanvas.tsx`, `store.ts`, `hooks/useReducedMotion`.
**Size.** S

### A3 — Colour-blind-safe lane palettes

**Gap.** `GameCanvas.tsx:26` hard-codes `lane1: '#3b82f6'` (blue) and
`lane2: '#f472b6'` (pink), with bombs at `#ef4444` (red). Blue/pink is fine;
red bombs against pink notes is a deuteranopia problem, and the palette is not
configurable.

**Build.** Three or four named lane palettes validated against protanopia,
deuteranopia and tritanopia simulation, selectable in settings, plus a shape
differentiator on bombs so colour is never the only channel carrying "do not
hit this".

**Prior art.** osu! skinning, Beat Saber colour schemes, DDR arrow colours.
**Touches.** `GameCanvas.tsx`, `slice-it.css`, `store.ts`. **Size.** S

### A4 — Deaf and hard-of-hearing support

**Gap.** The entire feedback loop is audio. Hit confirmation is a sample
(`engine.ts:430`); there is no visual beat reference.

**Build.** A visual metronome (a pulse on the judgement line on each beat from
C6's timing map), a stronger visual hit confirmation, and an optional
waveform/spectrum strip so the music is visible. Also makes the game playable
with the sound off, which is a much larger audience than the accessibility
framing suggests.

**Prior art.** Beat Saber's beat indicators; accessibility patches for DDR
cabinets.
**Touches.** `GameCanvas.tsx`, `HUD.tsx`. **Size.** M

### A5 — One-handed play as a supported configuration

**Gap.** `oneTrack` collapses both lanes onto one — mechanically exactly what a
one-handed player needs — and it is filed as a _challenge modifier_ worth
`+0.15` score multiplier (`MODIFIER_BONUSES.oneTrack`), which frames it as a
handicap you take on for credit.

**Build.** Keep the modifier, and add an accessibility framing that presents
the same mechanic without the challenge language, alongside single-key
keybinds and a touch layout with one large target. Score handling stays as-is;
this is a presentation and discovery change.

**Prior art.** One-handed modes in Beat Saber; the AbleGamers guidance.
**Touches.** `MainMenu.tsx`, i18n strings, `game-capabilities.ts`. **Size.** S

### A6 — Automatic output-latency detection

**Gap.** `audioOffset` is a manual ±500 ms slider. Bluetooth headphones add
100–300 ms and the player has no way to know that is what is wrong.

**Build.** Read `AudioContext.outputLatency` / `baseLatency` through
`getAudioContext()` in `lib/shared/platform.ts` and pre-seed the offset from
it, with a warning when the detected latency is large enough that a wired
device is worth suggesting. Combine with P5's measured offset for the residual.

**Prior art.** osu! device latency compensation; Rock Band's calibration.
**Touches.** `lib/shared/platform.ts`, `CalibrationScreen.tsx`. **Size.** S

### A7 — Motion sensitivity controls

**Gap.** The `spin` modifier rotates the entire playfield, and the only global
control is the site-wide reduced-motion hook — which the modifier does not
consult.

**Build.** Make `spin` respect `useReducedMotion` by refusing to enable (with
an explanation, not a silent no-op), and add per-effect intensity sliders for
rotation, shake and particle volume.

**Prior art.** Genre-wide "no video/no effects" toggles.
**Touches.** `GameCanvas.tsx`, `modifiers.ts`. **Size.** S

### A8 — Haptic hit feedback

**Gap.** `lib/shared/platform.ts` wraps haptics and the game never calls it.
On mobile, hits produce no tactile confirmation at all.

**Build.** A short vibration on hit, scaled by judgement, with an intensity
setting and an off switch. On gamepad, the same signal through the Gamepad
haptics API (see I2).

**Prior art.** Arcade cabinet feedback; mobile rhythm games (Cytus, Arcaea,
Phigros).
**Touches.** `engine.ts`, `lib/shared/platform.ts`. **Size.** S

### A9 — Adjustable judgement windows

**Gap.** `HIT_WINDOWS` is fixed, scaled only by rate and by
`STRICT_TIMING_FACTOR` (0.7). There is a way to make the game harder and no
way to make it easier.

**Build.** A `LENIENT_TIMING_FACTOR` (e.g. 1.4) as an unranked modifier — the
mirror of Strict Timing — plus per-judgement window display in settings so
players understand what the windows actually are. Unranked because widened
windows are not comparable, not because they are illegitimate.

**Prior art.** osu! OD/easy mod, StepMania timing windows, IIDX easy gauge.
**Touches.** `constants.ts`, `scoring.ts`, `modifiers.ts`. **Size.** S

### A10 — Chart content warnings

**Gap.** Uploads carry title, artist, album, description and a cover. Nothing
declares strobing visuals, loud dynamic range or explicit lyrics, and the
game-level `flashing` descriptor is all-or-nothing.

**Build.** Uploader-declared flags plus an automatic loudness/strobe estimate
from the analysis pass, shown on the card and honoured by A2's reduced-flash
mode (which can pre-emptively engage on flagged charts).

**Prior art.** Steam content descriptors; Beat Saber map flags.
**Touches.** `prisma/schema.prisma`, upload route, `SongLibrary.tsx`.
**Size.** S

---

## §5 — HUD, feedback and results (`H1–H10`)

### H1 — An early/late hit-error bar

**Gap.** The engine computes a signed delta to judge a hit and then throws the
sign away — `judge()` takes `Math.abs(deltaSeconds)` (`scoring.ts:61`). The
player is told _how good_ the hit was and never _which direction_ it was off.

**Build.** A hit-error bar under the judgement line: a tick per hit at its
signed offset, fading over ~2 seconds, with a moving average marker. This is
the fastest possible feedback loop for timing and it is close to free — the
delta already exists at the call site.

**Prior art.** osu! hit error bar, Etterna, Quaver, IIDX timing display.
**Touches.** `engine.ts`, `GameCanvas.tsx`. **Size.** S

### H2 — Distinct combo-break feedback

**Gap.** A miss produces a text popup through `pushFeedback`. Breaking a
300-combo and missing the first note of the song look and sound identical.

**Build.** A combo-break sound, a brief desaturation of the playfield, and a
larger visual for breaking a long combo. Respect A2's reduced-flash setting.

**Prior art.** IIDX/DDR combo-break sound, osu! combobreak.wav.
**Touches.** `engine.ts`, `GameCanvas.tsx`. **Size.** S

### H3 — A real results screen

**Gap.** `GameOver.tsx` is 133 lines showing score, multiplier, max combo,
accuracy and a grade. `RunStats.judgements` — the histogram the engine already
keeps, documented in `types.ts:76` as being "for the results screen" — is not
rendered.

**Build.** Show the judgement histogram, the timing distribution from P6, the
delta against your previous best, the accuracy-over-time curve, per-section
accuracy from C5, and the grade with the next threshold. This is where a
player decides whether to retry, and right now it gives them five numbers.

**Prior art.** osu! results screen, IIDX result graph, Etterna's eval screen.
**Touches.** `components/slice-it/GameOver.tsx`. **Size.** M

### H4 — Live grade and accuracy pace

**Gap.** `HUD.tsx` renders score, speed and a combo counter (above 5×) — and
**no accuracy at all**, despite the engine tracking it continuously and the
grade being defined purely by it. A player has no idea what grade they are on
course for until the results screen.

**Build.** Live accuracy, a live grade indicator (current accuracy → current
grade), and a "misses remaining for grade X" readout. Cheap, and it changes how
the last third of a chart is played.

**Prior art.** osu! live grade, DDR live score, Beat Saber rank display.
**Touches.** `HUD.tsx`, `engine.ts`. **Size.** S

### H5 — A song progress bar with structure

**Gap.** There is no progress indication during a run at all.

**Build.** A thin progress bar with section markers from C5 and a marker at
the point where your previous best run ended (if it failed). Doubles as the
seek surface in practice mode (P1).

**Prior art.** osu! song progress, Clone Hero, Muse Dash.
**Touches.** `HUD.tsx`. **Size.** S

### H6 — Quick restart and skip

**Gap.** Restarting means returning to the menu, reselecting the song and
waiting for the countdown; there is no hotkey and no way to skip a long intro.

**Build.** A hold-to-restart key (hold prevents accidental mid-run restarts),
and a skip button during any lead-in longer than ~5 seconds that jumps to
2 seconds before the first note. Both disabled in multiplayer.

**Prior art.** osu! `\`` retry and skip button, Clone Hero, Etterna.
**Touches.** `GameCanvas.tsx`, `engine.ts`. **Size.** S

### H7 — Full-combo and perfect indicators

**Gap.** Nothing marks an in-progress full combo. The player finds out at the
results screen.

**Build.** A subtle persistent FC indicator while no note has been missed, a
distinct one for all-`MARVELOUS`, and an end-of-run celebration for each
(reuse `hooks/useCelebration`). Record `isFullCombo` and `isPerfect` on the
leaderboard row so the badge survives into the board.

**Prior art.** DDR/ITG FC lamps, IIDX clear lamps, osu! SS.
**Touches.** `engine.ts`, `HUD.tsx`, `prisma/schema.prisma`. **Size.** S

### H8 — Clear lamps in the library

**Gap.** `SliceSong` carries `userPlays` — the count of your plays and nothing
about how they went. Your own library gives no sense of what you have
conquered.

**Build.** A per-chart lamp on every card: failed / cleared / full combo /
perfect, in the genre's standard escalation. Derived from the leaderboard row
plus H7's flags. It is the single most motivating piece of UI in the genre and
it is a join away.

**Prior art.** IIDX clear lamps (the canonical version), DDR score lamps,
Etterna.
**Touches.** `songs.server.ts`, `types.ts`, `SongLibrary.tsx`. **Size.** S

### H9 — Judgement popup customisation

**Gap.** `pushFeedback` renders a fixed text popup at a fixed place with a
fixed style. On dense charts it is visual noise obscuring the notes behind it.

**Build.** Settings for judgement-popup position, size, opacity and which
judgements are shown at all (many players hide everything above `GREAT`), plus
a combo-counter position option.

**Prior art.** osu! skinning, StepMania themes, Quaver's HUD editor.
**Touches.** `store.ts`, `GameCanvas.tsx`, `MainMenu.tsx`. **Size.** S

### H10 — A shareable results card

**Gap.** `app/routes/api/og/replay/$id.ts:17` already special-cases
`game === 'slice-it'` for an OG card, but nothing in the game produces the
replay record that card renders from, so the path is unreachable from
gameplay.

**Build.** Write a run summary (chart, score, accuracy, grade, judgement
counts, mods) on submission and point the existing OG card at it, with a share
button on the results screen that posts to the feed (X5) or copies a link.

**Prior art.** osu! score screenshots, Beat Saber ScoreSaber cards, Wrapped-style
share cards.
**Touches.** `score.ts`, `lib/og/`, `GameOver.tsx`. **Size.** S

---

## §6 — Modifiers and mutators (`M1–M10`)

Eight modifiers exist. The genre's standard pool has roughly twenty, and the
missing ones are mostly the _readable_ ones — the mods people actually use to
practise rather than to show off.

### M1 — Mirror

**Gap.** No lane transform of any kind exists. `oneTrack` collapses lanes and
`switching` moves individual notes, but the chart's left-right structure is
immutable.

**Build.** `mirror` — swap lane 0 and lane 1 across the whole chart. Zero
difficulty change, so it takes **no score bonus**; its value is that it turns
every chart into a second chart for practice and breaks memorised muscle
patterns.

**Prior art.** IIDX MIRROR, DDR mirror, osu!mania mirror, StepMania.
**Touches.** `lib/slice-it/chart.ts`, `modifiers.ts`. **Size.** S

### M2 — Random and S-Random

**Gap.** Same as M1 — no permutation exists. `switching` converts 15% of notes
to lane-changers (`SWITCH_CONVERSION_RATE`), which is a different mechanic:
it changes what a note _does_, not which lane the chart uses.

**Build.** `random` (a seeded lane permutation applied per chart — meaningful
at 4K from G2, degenerate at 2K where it equals mirror-or-nothing) and
`sRandom` (per-note randomisation, which does change difficulty and takes a
bonus). Seed from the run so the chart is reproducible in a replay.

**Prior art.** IIDX RANDOM/S-RANDOM/R-RANDOM — the deepest modifier system in
the genre.
**Touches.** `chart.ts`, `modifiers.ts`, `constants.ts`. **Size.** S
(depends on G2 to be interesting)

### M3 — A family of visibility mods

**Gap.** `invisible` is one thing: notes fade out before the hit line. The
genre has four distinct visibility mods and they train different skills.

**Build.** Split into `fadeOut` (current behaviour — notes vanish near the
line, trains internal rhythm), `fadeIn` (notes appear late, trains reading
speed), `flashlight` (only a window around the line is lit) and `laneCover`
(an adjustable curtain from the top, the practical one — it is how players
tune effective reading distance). Keep `invisible` as an alias for `fadeOut`
so persisted settings survive.

**Prior art.** IIDX SUDDEN+/HIDDEN+/lane cover, osu! HD/FL, DDR appearance
options.
**Touches.** `modifiers.ts`, `constants.ts`, `GameCanvas.tsx`. **Size.** M

### M4 — Chart-level double time

**Gap.** `speed` changes the audio playback rate, which changes the pitch and
compresses the chart uniformly. There is no way to make a chart _denser_
without making the song faster.

**Build.** A `doubleTime` mutator that regenerates the chart from the existing
onset list at double density (it selects from the same candidate pool the
nested difficulties draw from, so this is a budget change, not new analysis)
while the audio plays at 1.0×. Pairs with pitch-preserving playback (I6) for
the speed mods that remain.

**Prior art.** osu! DT/NC versus HR; Etterna rates versus higher difficulties.
**Touches.** `lib/slice-it/beatmap/charter.ts`, `chart.ts`, `modifiers.ts`.
**Size.** M

### M5 — Holds as taps

**Gap.** `LONG` notes require sustained input, which is a genuine barrier for
some switch and adaptive controllers and for anyone playing on a phone
one-handed.

**Build.** A `tapHolds` accessibility modifier that converts `LONG` to a tap at
its head and drops the tail. Unranked (it removes notes from the accuracy
denominator), and grouped with A1's assist family rather than the challenge
mods.

**Prior art.** osu!mania NoLN converts; accessibility patches across the genre.
**Touches.** `chart.ts`, `modifiers.ts`. **Size.** S

### M6 — Perfect-or-die

**Gap.** `suddenDeath` ends the run on a miss. There is no tier above it, and
top players clear Sudden Death routinely.

**Build.** `perfectionist` — anything below `PERFECT` ends the run. Slots
above Sudden Death in the same exclusion group, with a correspondingly large
bonus. Trivial to implement on top of the existing sudden-death branch and it
gives the top of the skill curve somewhere to go.

**Prior art.** osu! Perfect mod, DDR Marvelous-only challenge.
**Touches.** `modifiers.ts`, `engine.ts`, `constants.ts`. **Size.** S

### M7 — Modifier presets

**Gap.** Eight toggles and a speed slider are set individually, every session,
and persisted as one blob (`store.ts` persists `modifiers`). Switching between
"my practice setup" and "my ranked setup" means re-toggling everything.

**Build.** Named presets saved locally, with a couple of stock ones
("Ranked default", "Practice", "Challenge"). One-click apply from the song
details panel and from the multiplayer lobby's per-seat modifier panel.

**Prior art.** osu! mod presets, Beat Saber modifier profiles.
**Touches.** `store.ts`, `MainMenu.tsx`, `MultiplayerLobby.tsx`. **Size.** S

### M8 — A weekly modifier roulette

**Gap.** `MODIFIER_BONUSES` makes stacking rewarding, so the leaderboard
converges on one optimal stack per player and the other combinations are never
seen.

**Build.** A weekly rotating **fixed** modifier set applied to one featured
chart, with its own board. Everyone plays the same unusual configuration, which
is the only way most of these mods ever get used.

**Prior art.** IIDX/SDVX weekly courses, osu! mod-specific tournaments,
Destiny-style weekly modifiers.
**Touches.** ties into S1 and X4. **Size.** M

### M9 — Rebalanced modifier economics

**Gap.** Bonuses are additive constants chosen by hand
(`MODIFIER_BONUSES`: invisible 0.20, strictTiming 0.25, the rest 0.15) with no
data behind them. `SPEED_BONUS_PER_X` is 0.5 per extra 1.0× rate — so 2.0×
speed is worth +0.5, less than invisible plus bombs, despite being far harder.

**Build.** Once P6 and O1 exist, recompute each modifier's bonus from its
measured effect on accuracy across the population, and document the derivation
in `constants.ts` next to the numbers. Any change invalidates existing
comparisons, so it belongs with G13 in one scored migration.

**Prior art.** osu!'s repeated pp reworks; Etterna's MSD revisions.
**Touches.** `constants.ts`, `docs/slice-it.md`. **Size.** M

### M10 — Per-chart modifier legality

**Gap.** Every modifier is legal on every chart. `forMultiplayer()` is the
only restriction, and it is global rather than per-chart.

**Build.** Let a chart declare mods that break it — `spin` on a chart whose
readability depends on lane position, `oneTrack` on a chart built around
chords (G3). Declared, not enforced silently: the UI greys them out with a
reason.

**Prior art.** osu! unranked mod combinations; Beat Saber's per-map
requirements.
**Touches.** `types.ts`, `modifiers.ts`, `MainMenu.tsx`. **Size.** S

---

## §7 — Solo game modes (`S1–S12`)

The solo loop is: pick song, play song, see score. Everything below is a
different reason to press play.

### S1 — A Slice It! daily challenge

**Gap.** `lib/quests/arcade.ts:123` has one Slice It! arcade challenge —
"Score 5,000" — which any chart satisfies. There is no fixed song, no fixed
modifier set, no single-attempt rule and no separate board.

**Build.** One chart per day chosen deterministically from the date (so it is
identical for everyone and needs no coordination), with a fixed modifier set,
one ranked attempt, and its own daily board that resets. Feeds the existing
Arcade Pass through `reportGameResult` rather than replacing it.

**Prior art.** osu! daily challenge, Beat Saber daily, Wordle-style dailies.
**Touches.** `lib/quests/arcade.ts`, new `lib/slice-it/daily.server.ts`,
`prisma/schema.prisma`. **Size.** M

### S2 — Courses

**Gap.** A run is one song. There is no way to chain charts, and no state that
survives between them.

**Build.** A course: 3–5 charts played back to back on **one shared health
gauge** (G1), scored cumulatively, with no retries between songs. The gauge
carrying across songs is what makes it a distinct mode rather than a playlist.

**Prior art.** DDR Nonstop/Challenge courses, IIDX Dan courses, SDVX skill
analyser — the genre's canonical progression structure.
**Touches.** new `lib/slice-it/course.ts`, `prisma/schema.prisma`,
`MainMenu.tsx`. **Size.** L

### S3 — A skill-certification ladder

**Gap.** There is no notion of a player's level. `Player.totalScore` measures
volume played, not ability, and the four difficulty names are per-chart rather
than per-player.

**Build.** Dan-style certification: fixed courses (S2) at ascending tiers,
pass or fail on the gauge, awarding a persistent badge shown on the profile and
in multiplayer lobbies. Uses C3's numeric rating to keep tiers honest across
charts.

**Prior art.** IIDX Dan (kaiden), DDR grades, SDVX skill analyser.
**Touches.** S2's models, profile showcase, `lib/achievements/`. **Size.** L

### S4 — Endless survival

**Gap.** No mode has an end condition other than the song ending.

**Build.** Auto-queued charts of ascending rating on one gauge that drains
faster over time, scored on how far you get. The queue draws on C3's rating so
the escalation is smooth rather than random.

**Prior art.** Muse Dash endless, Cytus survival, NecroDancer's daily runs.
**Touches.** `lib/slice-it/session.ts` (from P7), `MainMenu.tsx`. **Size.** M

### S5 — A campaign

**Gap.** There is no single-player structure at all — no unlocks, no
progression, no reason to play chart B after chart A.

**Build.** A curated arc over bundled tracks, week-by-week, each stage gated
on a clear condition (clear, then FC, then FC with a modifier). Unlocks
cosmetics (V6) rather than charts, so the library stays fully open.

**Prior art.** Friday Night Funkin' weeks, Muse Dash's chapters, Guitar Hero's
career.
**Touches.** new `lib/slice-it/campaign.ts`, `data/`, `prisma/schema.prisma`.
**Size.** L

### S6 — Per-chart missions

**Gap.** Every chart offers exactly one goal: a higher number. There is
nothing to chase on a chart you have already maxed.

**Build.** Three generated objectives per chart, derived from the chart's own
shape — "FC the chorus" (needs C5), "no `GOOD` or worse in the second half",
"clear with Strict Timing". Completion state per player, coins on first
completion via `awardCoins`.

**Prior art.** Beat Saber campaign missions, Rocksmith challenges, Arcaea's
per-chart goals.
**Touches.** `prisma/schema.prisma`, `score.ts`, `SongDetailsPanel.tsx`.
**Size.** M

### S7 — A boss-chart mode

**Gap.** Nothing in the game presents a chart as an opponent.

**Build.** Face a scripted "boss" score line — the pace bar from P9 with a
target curve instead of your PB — that escalates through the chart and has to
be beaten section by section. Lose the section, lose gauge.

**Prior art.** Friday Night Funkin' opponent structure, Taiko's boss songs,
Everhood.
**Touches.** P9's infrastructure, `engine.ts`. **Size.** M

### S8 — Setlists and playlists

**Gap.** The library sorts and searches (`SONG_SORTS`) and nothing collects.
There is no favourites list, no queue, no user-made grouping. Note that
`SongLike` exists — likes are a signal, not a collection surface.

**Build.** User-made ordered setlists of charts, private or shared, playable
end to end, and a "play liked songs" shortcut off the existing likes.
Shareable via URL, which makes them the low-effort version of S2.

**Prior art.** StepMania packs, osu! collections, Beat Saber playlists (the
single most-used community feature).
**Touches.** `prisma/schema.prisma`, `SongLibrary.tsx`, new API routes.
**Size.** M

### S9 — Random and roulette selection

**Gap.** Song selection is search, sort and scroll. Nothing picks for you.

**Build.** A random button with constraints (difficulty range from C3, duration
range, unplayed-only, liked-only), plus a "roulette" that also randomises
modifiers. One of the cheapest features in this document and a real answer to
choice paralysis in a large library.

**Prior art.** IIDX/DDR random select, osu! random (`F2`), Muse Dash.
**Touches.** `SongLibrary.tsx`, `app/routes/api/slice-it/songs.ts`. **Size.** S

### S10 — Score attack with tiered targets

**Gap.** Grades are pure accuracy thresholds (`GRADE_THRESHOLDS`, SS at 1.0
down to F). They are the same on every chart and say nothing about how you
compare to what is achievable _on this chart_.

**Build.** Per-chart target tiers derived from the population's actual score
distribution (from the leaderboard), so "top 10% on this chart" is a visible,
chaseable goal alongside the absolute grade.

**Prior art.** Arcaea/Cytus grade goals, GrooveStats percentile ranks.
**Touches.** `lib/slice-it/rating.ts`, `Leaderboard.tsx`. **Size.** M

### S11 — Marathon mode

**Gap.** `MAX_SONG_DURATION_SEC` caps a track at 15 minutes and every run is
one track.

**Build.** A continuous session that chains charts with no menu return —
crossfaded, scored cumulatively, ending when you stop. Distinct from S2 in
that nothing is gated: it is the "put it on and play" mode.

**Prior art.** DDR Nonstop, StepMania marathon charts, Audiosurf playlists.
**Touches.** `engine.ts`, `useStartRun.ts`. **Size.** M

### S12 — Time attack

**Gap.** No mode is bounded by wall-clock time, so no session has a
predictable length — which is what a player with ten minutes actually wants.

**Build.** "Play as many charts as you can in N minutes", scored on cumulative
accuracy, with the clock paused between charts. Fits the platform's existing
session-length metadata (`sessionMinutes: [3, 20]` in
`lib/game-capabilities.ts`).

**Prior art.** Arcade credit structures; Muse Dash's time trials.
**Touches.** `lib/slice-it/session.ts`, `MainMenu.tsx`. **Size.** M

---

## §8 — Multiplayer and competitive play (`N1–N12`)

The lobby server is the most carefully built part of the codebase — server-owned
timers, absolute timestamps, seats keyed by `userId`, two grace windows, a
pause cap. It supports exactly one mode: everyone plays the same song and the
highest score wins.

### N1 — Spectating

**Gap.** `MAX_LOBBY_PLAYERS` is 8 and there is no ninth role. A player who
arrives during a match either waits in `waiting` or cannot join. The load
timeout already produces spectators implicitly ("after the timeout the match
starts and the straggler spectates") — but a spectator has no view.

**Build.** An explicit spectator seat that receives the `slice:scores` stream
(already broadcast every `SCORE_TICK_MS`) without occupying a player slot, with
a scoreboard view. The wire data for this already exists; what is missing is a
role and a renderer.

**Prior art.** osu! multiplayer spectating, Beat Saber spectator mode, every
competitive title.
**Touches.** `server/socket-server/handlers/slice-it.ts`, `net/events.ts`,
`MultiplayerSidebar.tsx`. **Size.** M

### N2 — Teams

**Gap.** `FinalStanding` and the live-score broadcast are flat lists of
individuals. There is no grouping concept anywhere in the lobby model.

**Build.** A `team` field on the seat, team totals in the standings, and a
team-balance control for the host. Cheapest genuinely new mode available given
the existing infrastructure — the scoring is a sum.

**Prior art.** osu! team vs, DDR team battle, Beat Saber multiplayer.
**Touches.** `net/events.ts`, socket handler, `MultiplayerLobby.tsx`.
**Size.** M

### N3 — Co-op

**Gap.** Every player plays the whole chart. Nothing splits a chart between
players.

**Build.** Two players, one chart, alternating sections (or lane 0 to one
player and lane 1 to the other, which is trivially derivable from the existing
chart). One shared score and one shared gauge, so it is genuinely cooperative.

**Prior art.** Rock Band, Taiko 2-player, DDR doubles/couples.
**Touches.** `chart.ts`, socket handler. **Size.** L

### N4 — Attack mode

**Gap.** Players in a lobby cannot affect each other at all. The only
interaction is watching a number.

**Build.** Earn charges on combo milestones and spend them to apply a
short-lived modifier to an opponent — a brief lane cover, a speed bump, a
judgement-popup blackout. All effects must be **visual and time-boxed**;
nothing that changes their chart, because their score has to stay comparable.
Its own mode, never mixed with ranked play.

**Prior art.** DDR Battle mode, Taiko's versus mode, Tetris garbage, Mario
Kart items.
**Touches.** `net/events.ts`, socket handler, `engine.ts`. **Size.** L

### N5 — Elimination

**Gap.** Every player in a match plays to the end regardless of standing.
`MatchResults` publishes final standings and that is the entire competitive
structure.

**Build.** Last-place elimination at fixed checkpoints (25%, 50%, 75% of the
chart), with eliminated players dropping to spectator (N1). Turns a 4-minute
race into a tightening one, and reuses the pause/resume state machine
unchanged.

**Prior art.** Tetris 99, Fall Guys rounds, osu! knockout tournaments.
**Touches.** socket handler, `net/events.ts`. **Size.** M

### N6 — Skill-based matchmaking

**Gap.** `slice:quickplay` joins any lobby with room. `lib/ranked/elo.ts` and
`lib/ranked/engine.server.ts` exist on the platform and Slice It! does not use
them.

**Build.** An Elo rating per player updated from head-to-head match results,
with quickplay matching within a rating band that widens over time. The rating
system is already written; this is wiring plus a band policy.

**Prior art.** osu! multiplayer ranked, competitive matchmaking generally.
**Touches.** `lib/ranked/`, socket handler, `MatchResults.tsx`. **Size.** M

### N7 — Song voting

**Gap.** `slice:song` is host-only — one player picks and everyone plays it.
On a rematch (`slice:rematch`) the host picks again.

**Build.** A vote mode the host can enable: each player nominates, the lobby
votes, ties break randomly. RMHMusic already has a vote-to-skip pattern to
follow for the UI shape.

**Prior art.** osu! multiplayer playlists, Jackbox-style lobby voting.
**Touches.** socket handler, `net/events.ts`, `MultiplayerLobby.tsx`.
**Size.** M

### N8 — Lobby queues and host rotation

**Gap.** One song at a time, chosen by one host. If the host leaves, the lobby
needs a new one (handled), but the queue concept does not exist.

**Build.** A persistent lobby queue that survives matches, plus a rotating
"picker" role so everyone gets a turn. Turns a lobby from a single match into a
session, which is what keeps eight people in a room.

**Prior art.** osu! multiplayer playlist mode, Rocket League-style rotation.
**Touches.** socket handler, `MultiplayerLobby.tsx`. **Size.** M

### N9 — Invite links and friend lobbies

**Gap.** Joining requires typing a 6-character code (`LOBBY_CODE_LENGTH`) or
browsing public lobbies. There is no link, no invite and no friends
integration despite the platform having a friends system.

**Build.** `/slice-it?lobby=ABC123` deep links that join on load, an invite
button that copies the link or sends it as a DM through the existing messaging
system, and a "friends are playing" row in the menu.

**Prior art.** Universal. Steam invites, Discord invites.
**Touches.** `app/routes/slice-it/index.tsx`, `net/client.ts`,
`lib/messages.server.ts`. **Size.** S

### N10 — Async ghost races

**Gap.** Multiplayer requires everyone present at the same time, and it is the
only competitive mode.

**Build.** Race a stored score curve (P9's data) from a friend or a
leaderboard entry, presented in the same sidebar as a live opponent. All the
rendering exists; what is missing is a source of curves and a menu entry.

**Prior art.** Trackmania ghosts, Beat Saber ScoreSaber comparisons, Mario
Kart staff ghosts.
**Touches.** P9's models, `MultiplayerSidebar.tsx`. **Size.** M

### N11 — Tournaments

**Gap.** `docs/plans/2026-07-15-cross-system-feature-ideas.md` proposes a
platform-wide Tournaments Hub; Slice It! has no bracket, no scheduling and no
qualifier concept.

**Build.** Slice It! as the first tournament-hub client: qualifier stage
(async, fixed chart pool, best of N), then seeded brackets played in lobbies
the tournament creates. The lobby server already handles everything a match
needs — what is missing is the layer that decides who plays whom.

**Prior art.** osu! World Cup, Beat Saber tournaments, the entire FGC bracket
model.
**Touches.** platform tournament models, socket handler. **Size.** L

### N12 — Rejoin a match in progress

**Gap.** `MATCH_DISCONNECT_GRACE_MS` (30 s) pauses the room; on expiry the seat
drops and the player is recorded as `finished: false` with no way back in.
Similarly, a player who exceeds `LOAD_TIMEOUT_MS` (90 s) is left out entirely.

**Build.** Let a returning player rejoin mid-song as a spectator (N1) with
their partial score preserved in the standings, and — for a return inside the
first ~20% of the chart — offer a restart-from-current-position seat that
scores only the remainder, clearly marked as partial. Keeps the room's timing
guarantees intact because nothing about the other seats changes.

**Prior art.** Reconnect-to-match in competitive shooters; osu! multiplayer
rejoin.
**Touches.** socket handler, `net/events.ts`. **Size.** M

---

## §9 — Ranking, integrity and replays (`R1–R10`)

### R1 — Split the leaderboard by chart and mod pool

**Gap.** This is the most significant correctness gap in the document.
`SongLeaderboard` is unique on `(songId, userId)` and ordered by `score desc`
— **one row per player per song, across all four difficulties and all
modifier combinations.** `calculateScoreMultiplier` partly compensates
(`expert` is 1.5× and mods add), but the practical result is that the board
mixes an `easy` run with six modifiers against an `expert` full combo, and
setting a high score on `normal` overwrites your `expert` record.

**Build.** Key the board on `(chartId, difficulty, modPool, userId)` where
`modPool` is a small canonical enum (`none` / `standard` / `challenge`)
rather than the full modifier cross-product, and default the UI to a single
difficulty with a picker. Requires C12's `chartHash` to survive regeneration.
Existing rows migrate into the pool their stored `modifiers` JSON implies.

**Prior art.** osu! per-difficulty per-mod boards, IIDX per-chart boards,
StepMania/GrooveStats.
**Touches.** `prisma/schema.prisma`, `score.ts`, `leaderboard.ts`,
`Leaderboard.tsx`. **Size.** M

### R2 — A global skill rating

**Gap.** The global board sums `Player.totalScore` across every run
(`score.ts` increments it on every submission). It ranks **volume played**, not
skill — a player who grinds easy charts outranks a better player who does not.

**Build.** A weighted skill number: take each player's best performance per
chart, weight by the chart's computed rating (C3) and the run's accuracy, and
sum with a geometric decay over the ranked list so the top ~50 scores
dominate. Keep `totalScore` as a separate "lifetime" stat.

**Prior art.** osu! performance points (the reference implementation, decay
included), Etterna player rating, ScoreSaber PP.
**Touches.** new `lib/slice-it/rating.server.ts`, `prisma/schema.prisma`,
`leaderboard.ts`. **Size.** L

### R3 — Actually record replays

**Gap.** `lib/game/replay.ts` defines a complete Slice It! replay schema
(`SLICE_IT_VERSION = 'si-1'`, an input log with `t`/`lane`/`judgment`, a
`verifySliceIt` re-simulation and a registry entry) — and **nothing in
`lib/slice-it/` or `components/slice-it/` references it.** The verifier is
written; the game never produces its input.

**Build.** Have the engine append `{t, lane, judgment}` on every resolution
and submit the log alongside the score. The comment in `replay.ts:125` names
the limitation honestly ("whether the judgments themselves are honest against
the track... requires the beat-map") — which R8 closes.

**Prior art.** Universal. osu! `.osr`, StepMania replays, Beat Saber.
**Touches.** `lib/slice-it/engine.ts`, `useSubmitScore.ts`, `score.ts`.
**Size.** M

### R4 — Watch replays

**Gap.** Follows from R3: with no replays recorded, there is nothing to watch,
and the OG replay card route (`app/routes/api/og/replay/$id.ts`) renders for a
record gameplay never creates.

**Build.** Replay playback through the existing engine in autoplay mode (P3)
driven by the input log instead of the chart, with scrubbing. Link from every
leaderboard row. This is how players learn from better players, and it makes
the leaderboard auditable by humans as well as by R8.

**Prior art.** osu! replay viewing from every score, Beat Saber replays.
**Touches.** `engine.ts`, new `components/slice-it/ReplayViewer.tsx`.
**Size.** M

### R5 — Leaderboard scopes

**Gap.** `/api/slice-it/leaderboard` filters on `songId` or returns the global
career board. There is no friends filter, no country filter and no time window
— so on a popular chart, everyone outside the top page sees a list of
strangers.

**Build.** `scope=global|friends|country` and `window=all|month|week` as query
params on the existing route, reusing the platform's follow graph for
`friends`. The cursor paging and self-row logic already handle the rest.

**Prior art.** osu! country/friend rankings, ScoreSaber, GrooveStats.
**Touches.** `app/routes/api/slice-it/leaderboard.ts`, `Leaderboard.tsx`.
**Size.** S

### R6 — Score history

**Gap.** `SongLeaderboard` keeps only your best — the upsert overwrites
`score`, `maxCombo`, `accuracy` and `createdAt` when `isNewBest`
(`score.ts`). Every previous attempt is destroyed, so no progress over time is
visible anywhere.

**Build.** An append-only `SliceRun` table (time-sortable PK per the repo's
new-table policy) holding every submitted run, with `SongLeaderboard` becoming
a materialised "best" pointer into it. Enables progress graphs, P9's pace
curves, R7's anomaly detection and O1's chart telemetry — all of which are
currently impossible because the data is deleted.

**Prior art.** osu! score history, Etterna's per-chart history graph.
**Touches.** `prisma/schema.prisma`, `score.ts`. **Size.** M

### R7 — Statistical anti-cheat

**Gap.** `maxPlausibleScore` is the only integrity check and it is
deliberately loose — its own comment calls it "the line between an exceptional
run and a number typed into a fetch call". A bot playing at superhuman
consistency passes it easily.

**Build.** With P6's timing statistics and R6's history: flag runs whose
unstable rate is implausibly low, whose hit distribution is unnaturally
symmetric, or whose improvement over the player's own history is
discontinuous. Flag for review rather than reject — the existing
`console.warn` on rejection is the right instinct, applied to a much better
signal.

**Prior art.** osu!'s statistical detection, ScoreSaber's replay analysis.
**Touches.** new `lib/slice-it/integrity.server.ts`, `score.ts`,
`lib/admin-review.server.ts`. **Size.** M

### R8 — Server-side replay verification

**Gap.** `verifySliceIt` in `lib/game/replay.ts` re-simulates the score from
the input log but has no access to the chart, so it cannot check that the
claimed judgements match the notes. It validates internal consistency only.

**Build.** With the chart in hand (server-side, from `Song.analysisData` or
C2's `Chart` row) and `chartHash` from C12, re-judge each input against the
real note times using the shared `judge()` function and confirm the score
exactly. Run it asynchronously in the Go supervisor for top-N scores rather
than inline, so submission latency is unaffected.

**Prior art.** GrooveStats verification, ScoreSaber replay checks.
**Touches.** `lib/game/replay.ts`, `go-services/supervisor/`. **Size.** L

### R9 — First clear and clear rate

**Gap.** `Song.plays` counts starts. Nothing records whether a run was
_completed_, so a chart nobody can finish looks identical to an easy one.

**Build.** Record clear/fail on every run (needs G1's gauge to make "fail"
meaningful), show clear rate on the chart card, and credit the first clear of
a newly uploaded chart with a permanent badge.

**Prior art.** IIDX clear rates, osu! "first place" on new maps, speedrun
first-clear culture.
**Touches.** `score.ts`, `songs.server.ts`, `SongLibrary.tsx`. **Size.** S

### R10 — A ranked chart pool

**Gap.** Every uploaded chart feeds the same global career total. A player can
upload a 15-minute track that charts into a huge note count and farm
`Player.totalScore` from it — the plausibility bound scales _with duration_,
so it does not stop this.

**Build.** A `status` on charts (`unranked` → `qualified` → `ranked`), gated on
C11's lint pass, a minimum play count and admin or community review. Only
`ranked` charts contribute to R2's global rating; everything else keeps its
own per-chart board. This is the structural fix for the farming problem, and
it is why every mature rhythm game has a ranking process.

**Prior art.** osu!'s ranked/loved/graveyard tiers, Quaver's ranked queue,
ScoreSaber's ranked maps.
**Touches.** `prisma/schema.prisma`, `score.ts`, admin surfaces. **Size.** L

---

## §10 — The library and creator tools (`L1–L12`)

### L1 — Genres and tags

**Gap.** A song has title, artist, album, description and cover. Browse is
search plus five sorts (`SONG_SORTS`). There is no genre, no tag, no BPM
filter and no difficulty filter — so a library of a thousand charts is
navigable only by remembering a name.

**Build.** A curated genre enum plus free-form tags, with faceted browse
(genre, BPM range, duration, difficulty rating from C3, clear lamp from H8).
The 08-04 competitive-gaps doc proposes faceted browse platform-wide; this is
the same idea at chart granularity.

**Prior art.** osu! genre/language/tag search, Beat Saber's BeatSaver filters.
**Touches.** `prisma/schema.prisma`, `app/routes/api/slice-it/songs.ts`,
`SongLibrary.tsx`. **Size.** M

### L2 — Curated shelves

**Gap.** The library's default sort is `recent`. New uploads dominate the
first page permanently and good older charts are unreachable without search.

**Build.** Editorial rows on the library screen — staff picks, this week's
featured, hidden gems (high accuracy-per-play, low play count), recently
ranked (R10). The `isPublic` + `createdAt desc` index already exists; these are
different queries over it.

**Prior art.** osu! featured artists and spotlights, Beat Saber curator picks.
**Touches.** `songs.server.ts`, `SongLibrary.tsx`. **Size.** M

### L3 — Chart reviews

**Gap.** `SongRating` exists in `prisma/schema.prisma` and is explicitly marked
**dead**: "DEAD (rewrite R0-T7): zero code references. Drop scheduled R1-T3; do
not add writers." Comments exist and are untimestamped prose.

**Build.** Do not revive `SongRating` as-is — the schema comment is a standing
instruction. Instead, if chart quality feedback is wanted, design it around
what a rhythm game actually needs: rate the **chart** (does it fit the song?)
separately from the **song**, on charts you have cleared, and let the signal
feed L2's shelves and R10's ranking queue.

**Prior art.** BeatSaver ratings, osu! mapper feedback / modding.
**Touches.** `prisma/schema.prisma` (new model, per the drop instruction),
`SongDetailsPanel.tsx`. **Size.** M

### L4 — Follow uploaders

**Gap.** `SliceSong.uploader` carries id, name and image and the UI shows
them. There is no way to follow, and no notification when someone whose charts
you like uploads another.

**Build.** Reuse the platform follow graph, add an "uploads" notification type
through `lib/notifications.server.ts`, and add an uploader page listing their
charts with aggregate stats.

**Prior art.** BeatSaver mapper follows, osu! mapper subscriptions.
**Touches.** `lib/notifications.server.ts`, new uploader route. **Size.** S

### L5 — Timestamped comments

**Gap.** `SongComment` is `{songId, userId, content}` — prose attached to a
song with no position in it.

**Build.** An optional `atSeconds` that renders as a marker on the chart
preview and jumps playback there. Turns the comment list from a guestbook into
chart feedback ("the transition at 1:42 charts the wrong instrument").

**Prior art.** SoundCloud timed comments, osu! modding timestamps (`00:01:42`
as a first-class syntax).
**Touches.** `prisma/schema.prisma`, `SongComments.tsx`. **Size.** S

### L6 — An uploader dashboard

**Gap.** `SliceSong` exposes `plays`, `likeCount`, `scoreCount` and
`commentCount` per song. There is no aggregate view, no trend and no sense of
how a chart is actually playing.

**Build.** A dashboard for your own uploads: plays over time, clear rate (R9),
accuracy distribution, the miss heatmap from O1, and which difficulty people
actually pick. The miss heatmap in particular tells an uploader that their
chart has a bad bar in it, which nothing currently can.

**Prior art.** BeatSaver mapper stats, osu! mapper dashboards, YouTube
Studio-style analytics.
**Touches.** new route, `songs.server.ts`. **Size.** M

### L7 — Waveform scrubbing in the details panel

**Gap.** `SongDetailsPanel.tsx` shows metadata, tempo, duration, difficulty,
plays and likes as numbers. You cannot hear or see the track before committing
to a run.

**Build.** A waveform rendered from the analysis pass (the spectrogram is
already computed and discarded), with section colouring from C5, note density
overlaid per difficulty, and click-to-preview. Density-over-time is the single
most useful pre-play signal in the genre.

**Prior art.** Audiosurf's track preview, osu! song select's density graph,
Etterna.
**Touches.** `lib/slice-it/beatmap/`, `SongDetailsPanel.tsx`. **Size.** M

### L8 — Metadata autofill

**Gap.** Title and artist are typed by the uploader; the analyser reads the
audio, not the tags. Duplicate uploads of the same track under three spellings
are three unrelated library entries.

**Build.** Parse ID3/Vorbis tags from the uploaded file first, then optionally
match against an external metadata service through
`lib/ssrf-guard.server#safeFetch` (which is mandatory for user-influenced
fetches). Normalise artist names so search works.

**Prior art.** MusicBrainz/AcoustID; every music app.
**Touches.** `app/routes/api/slice-it/songs/upload.ts`,
`lib/ssrf-guard.server.ts`. **Size.** M

### L9 — Reporting and takedowns

**Gap.** Uploads are user-supplied audio (`descriptors: ['user-content']`) and
there is no report path in `components/slice-it/`. Moderation exists platform-wide
(`lib/moderation.server.ts`) and the game does not reach it.

**Build.** A report action on every chart (copyright, mislabelled, offensive),
routed to the existing moderation queue, plus an uploader-visible strike state
and a takedown flow that preserves leaderboard integrity by tombstoning rather
than deleting.

**Prior art.** BeatSaver DMCA handling, osu! DMCA takedowns, SoundCloud.
**Touches.** `lib/moderation.server.ts`, `SongDetailsPanel.tsx`. **Size.** M

### L10 — Chart packs

**Gap.** Charts are individual rows. There is no bundle, which is how the
genre has distributed content for twenty years.

**Build.** A pack model grouping charts with a title, art and a curator, as
the unit of discovery in L2's shelves and the unit of play in S2's courses.
Uploading a pack is one flow rather than N.

**Prior art.** StepMania packs (the canonical format), osu! beatmap packs,
Beat Saber playlists.
**Touches.** `prisma/schema.prisma`, `SongLibrary.tsx`. **Size.** M

### L11 — An RMHMusic bridge

**Gap.** The platform has RMHMusic — a whole music app with its own library —
and Slice It! maintains a completely separate `Song` table with its own
storage prefixes (`slice-it/audio/`). A track in one is invisible to the other.

**Build.** "Play this in Slice It!" from RMHMusic, analysing on demand and
caching the chart. One upload, two apps, one storage bill — and it doubles
Slice It!'s library on day one.

**Prior art.** Audiosurf/Beat Hazard reading your local library; Spotify-linked
rhythm games.
**Touches.** `lib/rmhmusic/`, `lib/slice-it/songs.server.ts`. **Size.** L

### L12 — Storage lifecycle

**Gap.** Quotas are hard ceilings — 10 GB global, 1 GB per account
(`TOTAL_STORAGE_LIMIT_BYTES`, `PER_USER_STORAGE_LIMIT_BYTES`). When the global
cap is hit, uploads stop for everyone; there is no eviction, no tiering and no
audit of what is actually being played.

**Build.** Transcode uploads to a compact format at ingest (O4), move charts
with no plays in N months to cold storage while keeping the row and the chart
(which is small) hot, and surface a storage dashboard to admins before the cap
is reached rather than after.

**Prior art.** Standard media lifecycle policy; BeatSaver's archival tiers.
**Touches.** `lib/storage/s3.server.ts`, `go-services/supervisor/`. **Size.** M

---

## §11 — Platform integration (`X1–X10`)

Slice It! is the platform's most feature-complete game and one of its least
integrated. Three achievements, one quest, and no economy participation at all.

### X1 — More than three achievements

**Gap.** `lib/achievements/catalog.ts` has exactly three Slice It! entries:
`first_play` (bronze), `upload` (silver) and `full_combo` (gold). Nothing for
grades, accuracy, modifiers, multiplayer, streaks or the library.

**Build.** A proper ladder — first S rank, first SS, an FC on `expert`, a clear
with four modifiers, a full-combo on a chart above rating N (C3), 100 charts
played, a multiplayer win streak, a chart of yours cleared by 50 people. The
catalog is a flat array with a `group` field already set to `'Slice It!'`, so
this is data.

**Prior art.** Steam achievement ladders; osu! medals.
**Touches.** `lib/achievements/catalog.ts`, `score.ts`. **Size.** S

### X2 — More arcade challenges

**Gap.** `lib/quests/arcade.ts:123` has one: "Score 5,000 in Slice It!" —
satisfied by any chart at any difficulty, so it is a participation trophy.

**Build.** A rotation using the metrics the game already computes: accuracy
above X, a full combo, a clear with a specific modifier, N charts in a day,
beat your own PB. `reportGameResult` already carries `score`, `won` and
`cleared`; extend the payload with `accuracy` and `isFullCombo` so challenges
can address them.

**Prior art.** Daily/weekly challenge rotations across the genre.
**Touches.** `lib/quests/arcade.ts`, `lib/game/results.server.ts`. **Size.** S

### X3 — Economy participation

**Gap.** `/api/slice-it/score` calls `recordGamePlay` and `reportGameResult`
and never calls `awardCoins`. Slice It! is the platform's deepest game and it
mints nothing.

**Build.** Coins on first clear of a chart, on a new personal best, and on
multiplayer wins — all through `awardCoins()` (the only correct path, per
`lib/CLAUDE.md`) with per-day caps so grinding a short chart is not a faucet.
Spend them on V6's cosmetics, which gives the sink the same home as the source.

**Prior art.** Arcade credit loops; osu!'s cosmetic-free model is the
counterexample worth considering.
**Touches.** `app/routes/api/slice-it/score.ts`, `lib/coins.server.ts`.
**Size.** S

### X4 — Battle pass integration

**Gap.** `lib/battlepass/` exists and Slice It! contributes nothing to it.

**Build.** Chart-play XP with weighted contribution by difficulty and
accuracy, plus Slice It!-specific pass rewards (note skins, lane palettes, hit
sounds from V1/V2). Seasonal chart pools tie the pass to the library.

**Prior art.** Season passes generally; Beat Saber's music packs as seasonal
content.
**Touches.** `lib/battlepass/`, `lib/xp/engine.server.ts`. **Size.** M

### X5 — Post runs to the feed

**Gap.** A remarkable run — a first SS, a chart nobody had cleared — is
visible to nobody. The platform is built around a social feed and Slice It!
never posts to it.

**Build.** An opt-in "share run" on the results screen producing a feed post
with H10's card, plus automatic posts for genuinely rare events (first clear
of a chart, a top-10 global score) with a per-user frequency cap. Opt-in by
default off, because automatic bragging posts are how a feed gets muted.

**Prior art.** Strava-style activity posts; osu! score feeds.
**Touches.** `lib/feed/`, `GameOver.tsx`, `score.ts`. **Size.** M

### X6 — A profile showcase module

**Gap.** `components/profile/ProfileShowcase.tsx` exists as a modular
showcase system and Slice It! has no module in it, despite having the richest
per-player stats of any game on the platform.

**Build.** A card showing skill rating (R2), clear lamps by difficulty,
favourite chart, best accuracy, total charts cleared, and the Dan badge from
S3. Reuses the showcase's existing slot mechanism.

**Prior art.** osu! profile pages, IIDX player cards.
**Touches.** `components/profile/ProfileShowcase.tsx`, `lib/slice-it/`.
**Size.** S

### X7 — Wrapped and recap

**Gap.** `lib/wrapped/` and `lib/ai/recap.server.ts` exist; Slice It! feeds
neither. It has per-play data going back to the first upload and contributes
nothing to the year-in-review.

**Build.** Slice It! sections in Wrapped — minutes played, top charts, accuracy
curve over the year, hardest clear, the chart you retried most (needs R6's
history). Add a weekly recap line for players with activity.

**Prior art.** Spotify Wrapped; osu!'s year-in-review pages.
**Touches.** `lib/wrapped/`, `lib/ai/recap.server.ts`. **Size.** S

### X8 — A Discord Activity

**Gap.** `components/lights-out/LightsOutDiscordActivity.tsx` proves the
platform can ship a Discord Activity, and Lights Out is a far simpler game
than Slice It!. The Go supervisor also runs a `discord-bot`.

**Build.** Slice It! as a Discord Activity — the multiplayer lobby is exactly
the shape Activities are for (a small group, a shared session, voice already
running). Audio latency in the Activity iframe is the risk and needs measuring
before committing.

**Prior art.** Discord Activities generally; the existing Lights Out
implementation is the template.
**Touches.** new `components/slice-it/SliceItDiscordActivity.tsx`,
`server/socket-server/`. **Size.** L

### X9 — Developer API endpoints

**Gap.** The platform has a scoped developer API (`/api/v1/**` with
`withDeveloperApi`). Slice It! exposes nothing through it — no scores, no
leaderboards, no chart metadata.

**Build.** Read endpoints for chart metadata, leaderboards and a player's own
scores, scoped to a `slice-it:read` permission. Enables community stat sites,
which is a load-bearing part of every rhythm game's ecosystem.

**Prior art.** osu! API v2 (which the entire community tooling ecosystem is
built on), ScoreSaber's API.
**Touches.** `app/routes/api/v1/`, `lib/webhooks/`. **Size.** M

### X10 — Streaks

**Gap.** `lib/streak.server.ts` exists and `reportGameResult` bumps an arcade
streak — but there is no Slice It!-specific practice streak, which is the
metric that actually correlates with improvement in a skill game.

**Build.** A daily practice streak (any ranked run counts), with the
`streak-saver` Go worker already in the fleet handling the grace logic, and a
visible counter on the main menu.

**Prior art.** Duolingo-style streaks; Rocksmith's practice tracking.
**Touches.** `lib/streak.server.ts`, `MainMenu.tsx`. **Size.** S

---

## §12 — Presentation, cosmetics and identity (`V1–V12`)

The game has a strong, deliberate look — a neumorphic `--slice-*` palette on a
`.slice-theme` wrapper, with a light and a dark variant. It has no
customisation whatsoever, which in this genre is unusual: skinning is a
defining feature of the category.

### V1 — Note and playfield skins

**Gap.** Colours are hard-coded in `GameCanvas.tsx:26` (`COLORS`) and read from
CSS variables for the theme. There is no skin concept.

**Build.** A skin as a JSON descriptor — note shapes, colours per lane and per
subdivision (G8), judgement-line style, hit-burst style, background treatment —
resolved at run start into the same structure `readTheme()` already produces.
Ship four or five; sell more (X3).

**Prior art.** osu! skinning is the deepest example in gaming; StepMania
noteskins; Clone Hero highways.
**Touches.** `GameCanvas.tsx`, `slice-it.css`, new `lib/slice-it/skins.ts`.
**Size.** M

### V2 — Custom hit sounds

**Gap.** `hitSound` is a string naming a file under
`/music/slice-it/sounds/` (`engine.ts:430`) — a fixed list.

**Build.** More stock sounds, per-judgement variants (a distinct `MARVELOUS`
tick is a real feedback channel), and — for members — uploaded samples through
the existing upload validation path with a tight size cap.

**Prior art.** osu! hitsound sets, StepMania, IIDX key sounds.
**Touches.** `store.ts`, `engine.ts`, upload route. **Size.** S

### V3 — A reactive background

**Gap.** The playfield sits on a flat `--slice-bg`. The analyser computes a
full STFT and log-frequency filterbank per song and discards the spectrogram
after charting.

**Build.** Persist a downsampled spectrum envelope with the chart (a few
kilobytes) and drive a background visualiser from it — no runtime FFT, no
audio-thread cost, perfectly synced because it comes from the same analysis
the notes did. Must degrade with `canvasGlowEnabled()` and A2's reduced-flash
setting.

**Prior art.** Audiosurf, Beat Hazard, Cytus backgrounds, Muse Dash.
**Touches.** `lib/slice-it/beatmap/spectrum.ts`, `GameCanvas.tsx`. **Size.** M

### V4 — Cover-derived palettes

**Gap.** `coverUrl` is decorative. Every chart looks identical in play
regardless of the music.

**Build.** Extract two or three dominant colours from the cover at upload
(the cover is already processed and resized to 1024px WebP) and offer a
"match the cover" lane palette. Must still pass A3's colour-blind validation,
so clamp to a safe hue separation rather than using raw extracted colours.

**Prior art.** Spotify's dynamic colour; Muse Dash's per-song theming.
**Touches.** upload route, `GameCanvas.tsx`. **Size.** S

### V5 — Combo milestones

**Gap.** Combo is a number that increments. Nothing marks 100, 250 or 500.

**Build.** Escalating visual and audio treatment at milestones — a palette
shift, a background intensity step, an optional announcer sample — all
respecting A2. The genre's oldest retention mechanic and it costs one counter
comparison.

**Prior art.** DDR/IIDX combo effects, Guitar Hero star power, Taiko's
gauge-full state.
**Touches.** `GameCanvas.tsx`, `engine.ts`. **Size.** S

### V6 — Cosmetic unlocks

**Gap.** Nothing in the game is unlockable. There is no reward for playing
beyond the number.

**Build.** Skins (V1), hit sounds (V2), lane palettes (A3) and results-card
frames (H10) as unlocks from achievements (X1), the battle pass (X4) and coins
(X3). Keep every gameplay-affecting setting free — cosmetics only, never
readability.

**Prior art.** Battle-pass cosmetics generally; Beat Saber's sabers.
**Touches.** `lib/shop/`, `lib/slice-it/skins.ts`. **Size.** M

### V7 — Stage backdrops

**Gap.** One background per theme (light/dark), site-wide.

**Build.** Selectable animated backdrops that react to the gauge (G1) and the
combo state — dimming as you approach failure, intensifying at high combo.
Feedback disguised as decoration, which is the best kind.

**Prior art.** IIDX/SDVX backgrounds, FNF stages, Taiko's dancers.
**Touches.** `GameCanvas.tsx`. **Size.** M

### V8 — Chart preview animation on cards

**Gap.** Library cards are static — cover, title, artist, counts.

**Build.** A tiny animated note-density strip on hover, generated from the
chart (which the list response deliberately excludes for payload reasons — so
send a precomputed 64-value density array instead, not the chart). Communicates
"this chart is a wall of streams" in half a second.

**Prior art.** osu! song select preview, Steam's video previews.
**Touches.** `songs.server.ts`, `SongLibrary.tsx`. **Size.** S

### V9 — Results replays as clips

**Gap.** H10 produces a static card. Nothing captures the run itself.

**Build.** With R3's replays, render a short clip of the best 10 seconds
(highest combo density) as an animated share asset. Ties into the
clips-from-replays idea in the 08-04 competitive-gaps doc.

**Prior art.** Beat Saber clip sharing, osu! replay clips on social media.
**Touches.** `lib/og/`, R3/R4's infrastructure. **Size.** L

### V10 — Lane cover customisation

**Gap.** Nothing occludes the playfield, so a player who reads better with a
shorter approach distance has no way to get one (M3 introduces the mechanic;
this is its tuning surface).

**Build.** Draggable lane cover with a persisted height, a numeric readout of
the resulting reaction window in milliseconds (the genre's "green number"),
and a live preview. The numeric readout is what makes it a tool rather than a
curtain.

**Prior art.** IIDX green number / lane cover — one of the most-used features
in the genre.
**Touches.** `GameCanvas.tsx`, `store.ts`. **Size.** S

### V11 — Seasonal presentation

**Gap.** The game looks the same every day of the year.

**Build.** Light seasonal skinning tied to the platform's live-ops calendar —
menu treatment, a seasonal chart shelf (L2), a seasonal skin (V1) in the pass
(X4). Cosmetic only, always disableable.

**Prior art.** Seasonal events across every live game.
**Touches.** `slice-it.css`, `MainMenu.tsx`. **Size.** S

### V12 — A dedicated game hub page

**Gap.** `/slice-it` goes straight into the full-screen game (top-level route,
no `_site/` shell) and `lib/catalog/games/slice-it.ts` is the only public-facing
description of it. There is no page to link to, no SEO surface and nothing for
someone not signed in — and the catalog entry sets `authGate: true`, so an
anonymous visitor gets a gate rather than a pitch.

**Build.** A `_site/` hub at `/games/slice-it` with the radial shell: what the
game is, top charts, recent records, featured uploaders, and the link into
play. Uses `buildMeta` and `jsonLdScript` per the SEO conventions, with
`ogCardPath` for the card.

**Prior art.** Steam store pages; osu!'s beatmap listing pages as the SEO
surface for the game.
**Touches.** new `app/routes/_site/games/slice-it.tsx`, `lib/seo.ts`.
**Size.** M

---

## §13 — Input, hardware and devices (`I1–I10`)

`lib/game-capabilities.ts:173` records Slice It! as supporting keyboard, touch
and gamepad, and its comment notes it is "the only game wired to a gamepad
today". That is a real strength; it is also the whole of it.

### I1 — A full remapping surface

**Gap.** `Keybinds` is `{lane1, lane2}` — two keys, one binding each. Gamepad
mapping is a hard-coded array in `GameCanvas.tsx:57`
(`GAMEPAD_LANE0_BUTTONS`, `GAMEPAD_LANE1_BUTTONS`).

**Build.** Multiple bindings per lane (players routinely alternate two keys on
one lane for fast jacks — currently impossible), gamepad remapping in the UI,
separate bindings for pause/restart/skip, and named profiles. Needs a
`store.ts` migration to `version: 3` following the existing v1→v2 pattern.

**Prior art.** Universal. StepMania's input mapping, osu!'s per-mode keys.
**Touches.** `lib/slice-it/store.ts`, `MainMenu.tsx`, `GameCanvas.tsx`.
**Size.** M

### I2 — Gamepad haptics

**Gap.** The gamepad is polled for buttons only. No rumble on hit, no
feedback on miss.

**Build.** Judgement-scaled rumble through the Gamepad haptics API, with an
intensity setting. Same signal path as A8's mobile haptics.

**Prior art.** Console rhythm games generally; Rock Band peripherals.
**Touches.** `GameCanvas.tsx`, `lib/shared/platform.ts`. **Size.** S

### I3 — MIDI controllers

**Gap.** Input is keyboard, touch and gamepad. There is no Web MIDI path, so
electronic drum kits, launchpads and MIDI keyboards — devices whose owners are
exactly this game's audience — cannot play it.

**Build.** Web MIDI as a fourth input source: note-on to lane mapping with a
learn-mode binding UI. Small implementation, distinctive result, and it makes
the game genuinely playable on an e-drum kit.

**Prior art.** Clone Hero's MIDI drum support, Rocksmith's real-instrument
input, Taiko drum controllers.
**Touches.** new `lib/slice-it/input/midi.ts`, `GameCanvas.tsx`. **Size.** M

### I4 — Touch layout customisation

**Gap.** Touch is declared supported and the playfield geometry is fixed, so
touch targets are wherever the two lanes happen to render — which on a
landscape phone is not where thumbs are.

**Build.** Configurable touch zones (size, position, opacity), a split layout
for landscape, and a visible-on-touch overlay. `sessionMinutes: [3, 20]` says
this is a mobile-length game; it should be a mobile-shaped one.

**Prior art.** Every mobile rhythm game — Cytus, Arcaea, Phigros, Muse Dash.
**Touches.** `GameCanvas.tsx`, `store.ts`. **Size.** M

### I5 — An input latency test

**Gap.** `CalibrationScreen.tsx` calibrates **audio** offset. Input latency —
polling rate, browser event lag, display latency — is a separate quantity and
nothing measures it.

**Build.** A visual-only calibration pass (tap when the marker crosses the
line, no audio), yielding a separate `inputOffset`. Audio and visual offsets
being one number is a known source of "the game feels wrong and calibrating
does not help".

**Prior art.** osu! separate offsets, StepMania's global offset versus visual
delay, Rock Band's two-stage calibration.
**Touches.** `CalibrationScreen.tsx`, `store.ts`, `engine.ts`. **Size.** S

### I6 — Low-latency audio and pitch preservation

**Gap.** Speed changes are playback-rate changes, which shift pitch — a 1.5×
run is audibly wrong. Audio goes through `lib/audio/AudioManager` with no
device selection and no explicit latency hint.

**Build.** Pitch-preserving time-stretch for rate mods (or an explicit
"nightcore" toggle for players who want the pitch shift), an output device
picker, and `latencyHint: 'interactive'` on the context created by
`getAudioContext()`. Never call `new AudioContext()` directly — `lib/CLAUDE.md`
is explicit about that.

**Prior art.** osu! DT versus NC (pitch-shifted versus not), Etterna rates
with pitch preservation.
**Touches.** `lib/audio/AudioManager`, `lib/shared/platform.ts`. **Size.** M

### I7 — Dance pad and arcade controller mapping

**Gap.** Gamepad buttons map to two lanes. Arcade controllers and dance pads
enumerate as gamepads with unusual button layouts and get whatever the
hard-coded arrays give them.

**Build.** Device profiles keyed by gamepad ID, with community-contributable
mappings, plus a "hold to bind" flow for unknown devices. Depends on I1's
remapping surface.

**Prior art.** StepMania's pad support, IIDX controller profiles.
**Touches.** `GameCanvas.tsx`, `store.ts`. **Size.** M

### I8 — Local two-player

**Gap.** Multiplayer is networked only — `MIN_VERSUS_PLAYERS` is 2 and every
seat is a socket.

**Build.** Split-keyboard local versus on one machine and one screen: two
keybind sets, two score displays, one chart. No server involvement, and it is
the mode that gets people into a rhythm game in the first place.

**Prior art.** Arcade cabinets are two-player by default; DDR doubles,
Taiko 2P.
**Touches.** `engine.ts` (two instances), `GameCanvas.tsx`. **Size.** M

### I9 — Keyboard ghosting guidance

**Gap.** Nothing warns a player that their keyboard cannot register their
chosen key combination — a real hardware limit on membrane keyboards that
manifests as "the game dropped my input" and reads as a bug.

**Build.** A detection pass in the keybind UI (ask for simultaneous presses,
report whether all registered) with a warning and suggested alternate
bindings.

**Prior art.** StepMania's key test, fighting-game input displays.
**Touches.** `MainMenu.tsx`. **Size.** S

### I10 — Session guards

**Gap.** A run is a canvas in a browser tab. Nothing holds the wake lock,
nothing prevents an accidental back-navigation mid-chart, and nothing enters
fullscreen — despite `lib/shared/platform.ts` wrapping wake lock and
fullscreen already.

**Build.** Acquire the wake lock and (optionally) fullscreen at run start,
release on finish, and guard navigation during a run with a confirm — matching
the care the multiplayer handler already takes about not losing someone's run.

**Prior art.** Standard practice in browser games.
**Touches.** `GameCanvas.tsx`, `lib/shared/platform.ts`. **Size.** S

---

## §14 — Telemetry, content operations and infrastructure (`O1–O8`)

### O1 — Per-chart miss heatmaps

**Gap.** Nothing records where in a chart players fail. `SongLeaderboard`
keeps a final score; `RunStats` keeps totals. A chart with one unplayable bar
is indistinguishable from a hard chart.

**Build.** Aggregate per-note miss rates across runs (needs R6's history) into
a heatmap over the chart timeline. Surfaces to the uploader (L6), to the
player as a warning, and to the analyser team as the ground truth for whether
the charter is placing notes people can hit — which is currently unknown.

**Prior art.** osu! map fail-point graphs (shown right on the beatmap page),
Guitar Hero's difficulty telemetry.
**Touches.** `prisma/schema.prisma`, new aggregate job. **Size.** M

### O2 — Automatic bad-chart detection

**Gap.** A chart that generates badly — the tempo tracker locking onto half
time, a 55 ms filter dropping most of the song — ships silently. There is no
signal that anything is wrong except players not playing it.

**Build.** Flag charts whose clear rate (R9) is near zero, whose miss heatmap
(O1) has a spike unexplained by density, or whose accuracy distribution is
bimodal, and queue them for regeneration (C8) or review.

**Prior art.** Content moderation heuristics; osu!'s quality-assurance team as
the manual version.
**Touches.** `go-services/supervisor/`, admin surfaces. **Size.** M

### O3 — Analysis in the worker fleet

**Gap.** Beatmap generation runs **inline in the upload route** — the doc
notes a 4-minute track takes about a second and the 15-minute ceiling about
four. Four seconds of CPU-bound work in the web tier blocks an SSR worker, and
the ceiling is enforced partly because of it.

**Build.** Move analysis to a queued job (pg-boss is already the platform's
job system, and `go-services/supervisor` already runs the background fleet),
returning the upload immediately with a "charting…" state. Removes the
duration ceiling's real constraint and takes the spike out of the web tier.

**Prior art.** Standard media-processing architecture.
**Touches.** `app/routes/api/slice-it/songs/upload.ts`, `server/jobs/`.
**Size.** M

### O4 — Transcode on ingest

**Gap.** Uploaded audio is stored as supplied, up to `AUDIO_MAX_BYTES`
(50 MB). A player on a phone downloads a 40 MB WAV to play a 3-minute chart,
and the 10 GB global quota fills with unoptimised files.

**Build.** Transcode to Opus (and a compatibility AAC) at ingest, keep the
original only if storage allows, and serve by client capability. Typically a
5–10× size reduction, which is a 5–10× effective increase in the global quota
and a large reduction in time-to-play on mobile.

**Prior art.** Every streaming service; BeatSaver's ogg standard.
**Touches.** upload route, `lib/storage/s3.server.ts`, O3's worker. **Size.** M

### O5 — Preload before the countdown

**Gap.** `LOAD_TIMEOUT_MS` is 90 seconds because "a cold cache on a weak phone
genuinely takes tens of seconds" — the constant is a workaround for the fact
that nothing starts fetching until the match does.

**Build.** Prefetch audio and chart when a player selects a song in the lobby
(before ready-up), report real progress through the existing `slice:loading`
event, and shrink the timeout once the data says it can shrink. The lobby
already knows the song well before the match starts.

**Prior art.** Standard preloading; osu!'s background beatmap downloads.
**Touches.** `MultiplayerLobby.tsx`, `net/client.ts`, `constants.ts`.
**Size.** S

### O6 — Frame-timing telemetry

**Gap.** The 07-30 performance audit measured this game's canvas cost with an
external probe (`scripts/perf/canvas2d-probe.mjs`) and shipped
`canvasGlowEnabled()` as the mitigation. The game itself reports no frame
timing from real players, so the tier's effectiveness in the field is unknown.

**Build.** Sample frame times during runs and beacon percentiles (p50/p95/p99)
with device class and glow tier through the existing `lib/rum.ts` path. In a
rhythm game a frame-time spike is a missed note, so this is a correctness
metric, not just a performance one.

**Prior art.** Standard game telemetry.
**Touches.** `GameCanvas.tsx`, `lib/rum.ts`. **Size.** S

### O7 — Ship one difficulty, not four

**Gap.** `app/routes/api/slice-it/songs/$id.ts:31` selects the whole
`analysisData` blob, and `BeatMap.slices` is `Record<Difficulty, Slice[]>` —
so the single-song read delivers **all four difficulty charts** and the client
throws three away in `resolveSlices()`. The list response already excludes the
chart for exactly this reason ("hundreds of kilobytes"), and the difficulties
are _nested_ (Easy ⊂ Normal ⊂ Hard ⊂ Expert), so most of what ships is the
same notes four times.

**Build.** Take the difficulty as a query parameter and return only that
variant; or store the chart as Expert plus three index sets naming which notes
survive into each tier, which is how the nesting is generated in the first
place. Either cuts the pre-match download substantially on the exact path
`LOAD_TIMEOUT_MS` (90 s) exists to accommodate.

**Prior art.** Per-difficulty chart files are the norm — `.osu` files are one
difficulty each; StepMania's single-file `.sm` is the exception people
complain about.
**Touches.** `app/routes/api/slice-it/songs/$id.ts`,
`lib/slice-it/songs.server.ts`, `chart.ts`, `useStartRun.ts`. **Size.** M

### O8 — An admin content dashboard

**Gap.** Storage totals, quota headroom, upload rates, chart-version
distribution and analysis failures are computable and surfaced nowhere. The
first signal that the 10 GB cap is close is uploads failing.

**Build.** An admin panel: storage by uploader, songs below the current
`BEATMAP_VERSION`, analysis failure log, upload rate over time, and orphaned
objects in storage. Pairs with L12's lifecycle policy — you cannot run a
lifecycle without a view.

**Prior art.** Standard operations dashboards.
**Touches.** admin routes, `lib/slice-it/songs.server.ts`. **Size.** M

---

## §15 — If you only do fifteen

Ordered by value per unit of work, given the code as it stands. Most of these
are small because the data already exists and is being thrown away.

| #   | ID   | Why it is first                                                                                       |
| --- | ---- | ----------------------------------------------------------------------------------------------------- |
| 1   | `R1` | The leaderboard currently mixes difficulties and modifiers into one row per player. It is wrong now.  |
| 2   | `H1` | The signed timing delta is computed and discarded. An error bar is the genre's core feedback loop.    |
| 3   | `G8` | The charter computes each note's subdivision and throws it away. Colouring it makes charts readable.  |
| 4   | `P5` | A mis-set offset silently ruins the game and players never diagnose it. The data to fix it is free.   |
| 5   | `G9` | No scroll-speed setting exists, so chart readability is hostage to the song's BPM.                    |
| 6   | `H3` | `RunStats.judgements` is documented as being "for the results screen" and is not shown there.         |
| 7   | `G1` | `health: 100` is a literal. There is no gauge, so most of §7's modes have nothing to build on.        |
| 8   | `H8` | Clear lamps are one join away and are the genre's strongest retention mechanic.                       |
| 9   | `R6` | Every run except your best is deleted on submission. Nine other ideas need that history.              |
| 10  | `R3` | The replay schema and verifier are already written in `lib/game/replay.ts` and nothing feeds them.    |
| 11  | `P1` | There is no seek and no loop. Practice is impossible, which caps how good anyone gets.                |
| 12  | `C3` | Four difficulty names cannot order a large library. A numeric rating unlocks browse, matchmaking, R2. |
| 13  | `O7` | Every pre-match download ships four difficulty charts so the client can discard three.                |
| 14  | `X3` | The platform's deepest game participates in none of its economy.                                      |
| 15  | `M1` | Mirror is a two-line lane swap that doubles the practice value of every chart.                        |

---

## §16 — Prior art index

Which game to look at when designing each idea. Useful when the question is
"which variant of this feature", which is almost always the real question.

| Reference                  | What it is worth copying                                                             | Ideas                                         |
| -------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| **osu! / osu!mania**       | Error bar, unstable rate, offset wizard, pp, replays, ranked queue, skinning, API v2 | `H1` `P5` `P6` `R2` `R3` `R4` `R10` `V1` `X9` |
| **StepMania / DDR**        | Quantisation colours, packs, mines, courses, note skins, pad input, timing windows   | `G8` `G7` `L10` `S2` `V1` `I7` `A9`           |
| **Beatmania IIDX**         | Groove gauge, clear lamps, RANDOM family, lane cover/green number, Dan certification | `G1` `H8` `M2` `M3` `V10` `S3`                |
| **Etterna / Quaver**       | Skillset decomposition, chart keys, rates with pitch preservation, HUD editing       | `P8` `C12` `I6` `H9`                          |
| **Beat Saber**             | Directional cuts, playlists, score ghosts, modifier economy, clip sharing            | `G4` `S8` `P9` `M9` `V9`                      |
| **Clone Hero / GH**        | Chart imports, practice mode, MIDI drums, star-power phrasing, highway speed         | `C9` `P1` `I3` `C5` `G9`                      |
| **Rocksmith**              | Riff Repeater, adaptive difficulty, real-instrument input                            | `P2` `P7` `I3`                                |
| **Taiko no Tatsujun**      | Drumrolls, don/ka pitch, two-player local, boss songs                                | `G6` `G12` `I8` `S7`                          |
| **Muse Dash / Arcaea**     | Endless mode, per-chart goals, mobile touch layout, per-song theming                 | `S4` `S10` `I4` `V4`                          |
| **Friday Night Funkin'**   | Week campaign structure, opponent-as-chart, upscroll convention                      | `S5` `S7` `G11`                               |
| **Audiosurf**              | Track preview and density visualisation, reactive backgrounds                        | `L7` `V3`                                     |
| **Tetris 99 / BR**         | Checkpoint elimination in a many-player race                                         | `N5`                                          |
| **ScoreSaber / BeatSaver** | Ranked map pools, mapper follows, replay verification, archival tiers                | `R10` `L4` `R8` `L12`                         |

---

## §17 — Deliberately not proposed

Checked and excluded, so nobody re-derives them:

- **A charting rewrite.** The analyser is the best-engineered part of this
  game and `docs/slice-it.md` documents why each choice was made. Everything in
  §2 builds on it; nothing replaces it.
- **Changes to the multiplayer state machine's timing model.** Server-owned
  absolute deadlines, seats keyed by `userId`, the two grace windows and the
  pause cap are all deliberate and documented. New modes ride on it as-is.
- **Loosening `maxPlausibleScore`.** It is loose by design. R7 and R8 are the
  right way to tighten integrity; widening the bound is not.
- **Reviving `SongRating`.** The schema marks it dead with a drop scheduled
  and "do not add writers". `L3` proposes a new model, deliberately.
- **Per-frame writes to `<html>` custom properties, or anything cursor-tracked.**
  Retired platform-wide on 2026-08-01.
- **Lowering `RANKED_MIN_SPEED`.** Slow runs should exist (`P1`) and should not
  be ranked. Those are the same decision, not a conflict.
- **Cross-game features already specced elsewhere** — tournaments hub,
  spectating as a platform primitive, wagers, prediction markets, user-content
  classification. `N11` and `N1` reference the platform work rather than
  re-specifying it; see `docs/plans/2026-07-15`, `2026-07-19` and `2026-08-04`.
