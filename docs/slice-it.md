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
