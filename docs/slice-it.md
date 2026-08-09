# Slice It

The rhythm game. Two lanes, two buttons, charts generated from whatever audio a
player uploads, played solo or as an up-to-eight-player race.

This document covers the two parts that are not self-evident from the code: how
a chart gets made, and how a match survives someone's wifi dying.

| Concern         | Lives in                                                           |
| --------------- | ------------------------------------------------------------------ |
| Chart analysis  | `lib/slice-it/beatmap/`                                            |
| Gameplay engine | `lib/slice-it/engine.ts`, `chart.ts`, `scoring.ts`, `constants.ts` |
| Wire protocol   | `lib/slice-it/net/events.ts` (shared), `net/client.ts` (browser)   |
| Lobby server    | `server/socket-server/handlers/slice-it.ts`                        |
| HTTP API        | `app/routes/api/slice-it/**`                                       |
| UI              | `components/slice-it/`                                             |
| Storage         | `lib/slice-it/songs.server.ts` → `lib/storage/s3.server`           |

## Beatmap generation

Runs **server-side, once per song**, in the upload route. A 4-minute track takes
about a second; the 15-minute ceiling takes about four.

```
decode → mono + decimate to 22.05 kHz → STFT (1024, hop 256)
       → log-frequency filterbank (12 bands/octave, 30 Hz – 11 kHz)
       → SuperFlux onset function → adaptive peak picking
       → comb-filtered autocorrelation (tempo) → DP beat tracking (Ellis)
       → quantise to subdivisions of the tracked beat
       → density-budgeted charting, ×4 nested difficulties
```

Three choices in there are worth knowing about, because each fixes a specific way
the previous generator produced charts that felt unrelated to the song.

**SuperFlux, not plain spectral flux.** Flux fires on energy appearing where
there was less before, which is what a note attack sounds like — and also what
vibrato sounds like, since a wobbling violin note moves energy between adjacent
bands continuously. SuperFlux (Böck & Widmer, DAFx-13) compares against a
frequency-max-filtered reference frame at a multi-frame lag, so energy that
merely _moved_ produces no flux. Without it, sustained strings chart as a wall
of notes.

**A tempo prior and a comb filter.** Autocorrelation alone cannot distinguish
85 BPM from 170 — a signal periodic at 0.7s is also periodic at 1.4s. Summing
correlation at 1×, 2×, 3× and 4× a candidate period rewards the one that
explains the whole pattern, and a log-normal prior centred at 125 BPM breaks the
octave ties that remain. This is what stops drum-and-bass being charted at 87
BPM with every note on an off-beat.

**Dynamic-programming beat tracking, not a fixed grid.** A single tempo plus a
phase is right for a metronomic track and wrong for everything else; live
drumming drifts, and a chart that drifts away from the song is unplayable by the
end. Ellis's tracker (2007) maximises `Σ odf(bᵢ) + α·Σ transition(bᵢ − bᵢ₋₁)`
over the whole signal, so a missing kick cannot knock the grid out of phase.

### Charting

Onsets are snapped to `{0, ¼, ⅓, ½, ⅔, ¾}` of the tracked beat, and anything
further than 55 ms (or 18% of a beat) from every subdivision is **dropped** —
those are reverb tails and vocal consonants, and charting them produces notes
the player hears no reason for.

Difficulties are **nested**: Expert is selected from all candidates, Hard from
Expert, Normal from Hard, Easy from Normal. A pattern learned on Normal is still
there on Hard with more between the notes. Each tier has a notes-per-second
budget and spends it on the strongest onsets, weighted by metric position, so a
downbeat outranks a louder off-beat crash.

Lane assignment starts from frequency content — bass-dominant hits to lane 0,
bright hits to lane 1, so the chart's shape tracks the drum pattern — then two
playability rules override it: no more than 2 consecutive notes in one lane, and
a per-tier minimum same-lane gap.

Everything arbitrary is seeded, so re-analysing a song produces the same chart.

### Versioning

`BEATMAP_VERSION` is stamped on every generated chart. Version 1 is the legacy
generator, which wrote no version field at all — hence `analysisVersion ?? 1`.
Songs predating the server-side analyser get charted in the browser by the first
player to open them and the result is posted back to
`/api/slice-it/songs/:id/patch-analysis`, which refuses anything that is not
strictly newer than what it holds.

## Multiplayer

The server owns the lobby, the roster, the song, the countdown, the pause and
the results. It does **not** judge rhythm: what is being judged is the alignment
between a player's input and audio playing on their own machine, which no
server-side simulation can see. Live scores are therefore _claims_, broadcast
for the sidebar; the authoritative record is `/api/slice-it/score`, which bounds
a submission against the song's real duration.

### States

```
waiting → loading → countdown → playing → results → waiting
                                    ↕
                                (paused)
```

`loading` has a 90-second ceiling: a client that never reports `slice:loaded` —
a crashed tab, a decode failure — used to hang the lobby with no way out but
everyone leaving. After the timeout the match starts and the straggler
spectates.

### Disconnects

Two grace windows, because the stakes differ:

| Where     | Window | What happens                                       |
| --------- | ------ | -------------------------------------------------- |
| Lobby     | 15s    | Seat held, shown greyed out. Nothing else stops.   |
| Mid-match | 30s    | **The whole room pauses.** Everyone's audio stops. |

Pausing the room is the right trade even though it costs four people time:
carrying on means the returning player comes back to a song 20 seconds further
along than the chart in front of them, which is not a recoverable state.

The client retries continuously throughout (the shared realtime client resets
its backoff on visibility, `online`, focus and bfcache restore), so a recovery
usually lands in the first few seconds. On return, the room resumes after a
3-second re-count so nobody loses a combo to the reconnection. On expiry, the
seat is dropped, the standings record them as `finished: false`, and the rest
play on.

`MAX_MATCH_PAUSES` (3) is the backstop: without it, one flapping connection can
hold a room in a pause loop for the length of the song, because each recovery
restarts the window.

Every timer is server-owned and every deadline crosses the wire as an **absolute
timestamp**, not a duration — two clients with a few seconds of clock skew would
otherwise each count down perfectly and disagree about when the room gave up.

### Seats

Keyed by `userId`, not `socket.id`. A reconnect mints a new socket id; keying on
it meant a two-second blip removed a player permanently, mid-song. The rebind
restores their readiness, their modifiers and the score they had already
reported.

### Modifiers

Per-seat, not lobby-wide — you pick your own difficulty and race someone playing
theirs, with the score multiplier making the comparison meaningful. Multiplayer
clamps two of them (`lib/slice-it/modifiers.ts#forMultiplayer`): speed floors at
1.0x, because a slower chart in a race is a free easy mode and the multiplier
only rewards going faster; and Sudden Death is dropped, because dying at 12
seconds and then watching four minutes of other people playing is not a mode
anyone chose.

## Storage

Audio and covers go to object storage (`lib/storage/s3.server`, which falls back
to local disk when S3 is unconfigured). They previously went to `db/music` on the
web container's own filesystem — and production runs blue/green web containers,
so a song uploaded to blue 404'd from green until the next deploy flipped back.

Rows written before that change hold a bare filename rather than an object key;
`lib/slice-it/songs.server.ts` reads both.

Quotas are global (10 GB) **and** per-account (1 GB). The global-only version
made the library first-come-first-served: one account could fill it and everyone
else's next upload failed citing a limit they had no part in reaching.

Uploads are content-hashed (`Song.contentHash`, unique per uploader) so
re-uploading a file you already own is refused rather than silently duplicated
against both quotas.

## Scoring

`lib/slice-it/scoring.ts` is shared by the engine and the score endpoint, which
is what makes "is this score believable?" answerable at all.

- Judgement windows scale with playback rate (constant _musical_ leniency) and
  shrink to 70% under Strict Timing.
- Points are `base × combo × multiplier`; the multiplier is `difficulty` (a
  factor) plus each active modifier (an addend), so stacking six modifiers is
  worth meaningfully more than one but not six times more.
- Accuracy is `Σ weight / (notes × 100)`, so a full MARVELOUS run is exactly 1.0.

`maxPlausibleScore(duration, modifiers)` is the server's ceiling. It is
deliberately loose — the line between an exceptional run and a number typed into
a `fetch` call, not a simulation. The previous endpoint's only check was "a
number under one billion", which is to say it accepted anything.

## Presentation

The playfield's decoration is deliberately small and deliberately gated. Two
things drive all of it, and neither is a timer:

- **The combo** (`V13`, `lib/slice-it/presentation.ts#comboEnergy`) — a
  saturating curve with no thresholds anywhere, driving the lane rails, the
  vignette, note trails and the receptor glow together. It replaced a
  full-screen colour wash at 50/100/250/500/1000 combo, which was the
  most-complained-about thing in the game.
- **The music** (`V7`, the stage backdrops) — see below.

### Where a backdrop's audio comes from

**Nothing runs an FFT at play time, and there is no `AnalyserNode` on the audio
path.** A visualiser that reads the audio graph is the one thing in this feature
that would actually cost the player frames.

Instead the backdrops sample the **peak envelope the analyser already
persisted**: `analysisData.artefacts.envelope`, a byte-per-sample amplitude
curve at ~200 Hz written by `beatmap/envelope.ts` at upload. It is ~48 KB, it
has been on the wire since the chart editor started drawing its waveform from
it, and `useStartRun` already hands the whole blob to the engine — so a
visualiser costs one extra *consumer* of bytes the client downloaded anyway, and
is sample-accurately in sync with the notes because it came out of the same
analysis pass they did.

`V3`'s 8-band spectrum envelope (`presentation.ts`, `spectrumEnvelope`) is the
richer version of the same idea and is **not** persisted by any pipeline yet.
Nothing needs it: adding it means another ~57 KB per song on the load path, and
one amplitude curve is enough for everything the three backdrops draw.

A song with no stored artefacts — a legacy row nobody has played since the
analyser moved server-side, which `useStartRun` backfills on first play — reads
a level of zero. The backdrop then rides on run state alone: calmer, and honest
about having no audio to show. It does not invent a signal.

### The three treatments

`pulse` (the default) blooms at the judgement line; `bars` scrolls the waveform
along the two outer margins, each bar sampling the moment a note at that
position would be judged, so a loud passage reaches the line exactly when its
notes do; `aurora` drifts two soft bands across the lane axis. All three take
their colours from the player's `lanePalette` — a colour-vision setting outranks
a decoration — and dim and desaturate as the health gauge falls
(`backdropState`).

### Why this is safe to draw behind a rhythm game

1. **It cannot cost a note any contrast.** The backdrop is drawn first; step 1
   of the render then fills each lane trough with the **opaque** `--slice-bg`,
   and a note is `BAR_H` inside a trough of `BAR_H * 1.5`. So every note is read
   against the bare background. Measured across the three backdrops × dark/light
   × the default, deuteranopia and monochrome palettes, sampling the whole note
   band at its worst pixel: note-vs-field contrast is identical with the
   backdrop and without it. The guarantee is inherited from the opaque trough,
   not enforced in the backdrop — a trough that stops being opaque takes it
   away.
2. **Three switches turn it off, and any one of them wins**
   (`backdropVisible`): the player's own setting, `canvasGlowEnabled()` (which
   folds in `prefers-reduced-motion` and `perf-lite`), and `A2`'s Reduced Flash.
   `A7`'s Effect Intensity scales what is left. On a light theme the wash is
   inverted to *shading* rather than glow, so it cannot flatten the pale
   `--slice-rail`.
3. **Each alpha is a constant floor plus a modulated term.** Only the second
   term tracks the music, and it is the one the photosensitivity bound applies
   to: ~12% alpha of a mid-tone gradient peak-to-trough, against `V13`'s
   vignette at 60%. The envelope follower's slow release (0.34 s) damps the
   trough between beats, so a 200 BPM track blurs into one another rather than
   strobing.
4. **Nothing casts a shadow and nothing allocates.** `shadowBlur` is this
   renderer's dominant cost and a blurred full-screen layer would be the most
   expensive op in the frame; every treatment is a gradient fill or one batched
   path. Gradients and the bar scratch live in a cache keyed by size, palette
   and health bucket.

### A timebase bug the backdrops surfaced

`computeEnvelope` used to store the rate it was *asked* for (200 Hz) rather than
the rate its buckets were *built* at. The analysis signal is 22 050 Hz and the
samples-per-bucket rounds 110.25 to 110, so the true rate is 200.4545 and every
reader drifted 0.23%: 6 ms at the start of a track and **half a second** by the
end of a four-minute one. That is the timebase the chart editor's waveform is
drawn against, so its transients slid away from the notes they belong to over
the course of a song. Fixed at the source — the rate has always travelled with
the data, so nothing needs a migration and a stored envelope keeps its old rate
until the song is next analysed.
