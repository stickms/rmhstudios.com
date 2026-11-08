# RMH Music — instrument learning programme (design)

**Date:** 2026-11-08
**Status:** Approach and phase order approved by the owner in conversation; the owner asked to
proceed straight to implementation with subagents, merging PRs along the way. This document is
what the plan is built from.

## Intent

Replace RMH Music (a Spotify listening-party app) with a piano & guitar learning programme.
**Audience: beginners and novices.** Success = after a month they are noticeably more confident
playing and, above all, **reading sheet music** than before. Every feature is judged against
that: if it doesn't move a novice toward reading and playing with confidence, it waits.

## Goals

- A guided **path** (Duolingo-style units) from "what is a staff" to reading and playing simple
  pieces, plus free-practice modes reachable directly.
- Note/chord reading flashcards, pitch and chord ear training, time-signature/rhythm training.
- Tuner / live note reader.
- Play-along with uploaded sheet music (MusicXML/MXL, MIDI, `.mscz`, Guitar Pro) with tempo
  control, instrument selection and pitch/tempo matching.
- **Input is pluggable:** microphone, Web MIDI controller, or on-screen/computer keyboard, all
  feeding the same engine. MIDI is the accurate path (polyphonic, no latency/bleed).
- Instruments: piano and guitar first; later voice/choir, ukulele, bass, violin, drums, then
  recorder/flute and transposing winds.
- **Mobile is first-class** for every feature (design at 360px; large tap targets).
- Reuse site systems: streak (+ streak saver), XP, quests, achievements, battlepass, feed.

## Non-goals / anti-goals

- No Spotify, listening rooms, radio, Guess the Song in the new app.
- No audio-to-score transcription of MP3s, no stem separation (heavy, unreliable).
- No linking to musescore.com (no public API); uploads only, **private to the uploader**
  (copyright) — no public sharing of user-supplied scores.
- Not a polyphonic mic transcriber: mic chord detection is best-effort and labelled so; MIDI is
  the reliable chord path.
- Anti-goal: gamification that rewards tapping fast over learning (no per-answer coin payouts;
  see Economy).

## Constraints (from the repo)

- Keep the existing look: shared full-screen `--app-*` tier, `rmhmusic-theme` violet accent on
  near-black, route stays `/rmhmusic` (theme-excluded), catalog id `rmhmusic`.
- `pnpm check:consistency` before every commit; i18n via `t()` in `c-rmhmusic`; new strings are
  new keys (old wording keys are dead); all audio through `getAudioContext()`; server-only code in
  `*.server.ts`; API routes via `defineHandler`; schema changes carry a migration.
- Test scope is "mission critical" (docs/testing.md): add colocated unit tests only for pure,
  non-obvious logic (pitch→note/cents, MIDI/score parsing, scoring maths, progress rules).
- `Permissions-Policy` currently allows `microphone=(self)` only → add `midi=(self)` and extend
  `lib/__tests__/permissions-policy.test.ts`; needs the Apache vhost update on deploy.
- **A merge to `main` deploys to production.** Each PR must leave the site fully working.

## Approaches considered

1. **Big-bang rewrite in one PR.** Simple to reason about, but enormous, unreviewable and a
   single deploy of everything at once. Rejected.
2. **Phased, additive build behind the existing `/rmhmusic` route (chosen).** Phase 1 swaps the
   app shell and retires the old features; each later phase adds modes to the new app. Every
   merge is shippable; the pitch/input engine built first is reused by all later phases.
3. **Build new app at a new route, swap later.** Safer but leaves two apps and duplicate chrome,
   and the owner wants a replacement, not a sibling. Rejected.

## Architecture

```
lib/rmhmusic/learn/            (pure, client-safe)
  input/        NoteEvent {midi, velocity, t, on|off, source}
                mic.ts (getUserMedia → pitch detector → NoteEvent)
                midi.ts (Web MIDI → NoteEvent)   keyboard.ts (computer keys → NoteEvent)
  pitch/        YIN/MPM detector, freq↔midi↔name, cents
  theory/       notes, intervals, scales, chords, key/time signatures
  content/      path units, lesson + exercise definitions (data-driven, per instrument)
  scoring/      pitch-closeness points, timing windows, accuracy
  audio/        Tone.js playback (samplers, metronome), tempo/transpose
lib/rmhmusic/learn/*.server.ts  progress, SRS state, sheet upload parsing
components/rmhmusic/learn/      path home, flashcards, ear training, rhythm, tuner, player
app/routes/api/rmhmusic/learn/  progress, attempts, uploads  (defineHandler)
prisma: new tables only (MusicLearn*), new-table time-sortable key policy for attempts
```

Engines see only `NoteEvent`s, so mic, MIDI, on-screen and synthetic (test) input are
interchangeable. Instrument is a setting that selects content and fretboard/keyboard views.

## Phases (each = one or more PRs, merged when green)

1. **Foundation.** Input layer (mic/MIDI/keyboard), pitch detector, theory utils, audio helper,
   progress model + API, new shell/home (path skeleton, instrument picker, input picker with
   latency calibration), `midi=(self)` policy. **Retire the old app**: routes, UI, socket
   handler, API routes, achievements/economy/presence/feed/sitemap references, catalog copy.
2. **Training.** Note-reading flashcards (staff, VexFlow, SRS), fretboard trainer, pitch match
   (points by closeness), intervals then chords, time-signature & rhythm (tap/clap-back),
   metronome. First path units populated.
3. **Tuner & note reader.** Chromatic tuner, alternate tunings, live note/pitch trace.
4. **Sheet/tab play-along.** Upload + parse, render, falling-note/wait mode, loop, tempo,
   instrument sound, pitch+tempo matching with mic or MIDI. Library choice (alphaTab vs
   VexFlow/OSMD) decided at the start of this phase with a spike.
5. **More instruments + choir.** Ukulele, bass, voice (range finder, solfège, SATB part mixer),
   violin, drums, recorder/flute, transposing winds.
6. **Social.** Practice heatmap, friend challenges, jam/duet rooms, feed clips, assignments.

## Economy / progression (my call)

Streak, XP, quests and achievements fire from completed lessons and daily goals. **No coins per
answer.** Coins only via existing quest/achievement payouts through `awardCoins()`.

## Retiring the old app (my call — destructive part deferred)

Phase 1 removes all routes, components, socket handler and references. **The old Prisma tables
(`RmhMusic*`, `MusicGuess*`) and any coin/achievement history are NOT dropped** in Phase 1 — a
dropped table can't be restored, and the owner hasn't confirmed what history to keep. A separate
cleanup migration comes later, only on the owner's say-so.

## Left to the builder

Pitch-detector choice and tuning (YIN vs MPM), piano/guitar sound source (samples vs synth,
weighing asset size), VexFlow integration details, SRS algorithm (FSRS-lite is fine), exact path
curriculum text, schema column details.

## Calls I made (flag if wrong)

Route/ids unchanged; no per-answer coins; old tables kept; uploads private; mic chords labelled
best-effort; phase 4 library deferred to a spike; minimal tests per repo test policy; the
separate builder-review step skipped for speed at the owner's request.
