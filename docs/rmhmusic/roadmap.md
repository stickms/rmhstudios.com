# RMH Music — roadmap, work in progress and audit notes

> **For LLMs and auditors:** this is the single place for RMH Music (`/rmhmusic`, the beginner
> piano and guitar learning programme) status, unfinished work, future features, known gaps and
> hand-off steps. Written 2026-11-09 when work was paused for an audit; last updated 2026-11-15
> (Phase 3, the tuner). If this file disagrees
> with the code, the code wins; fix this file. Plans live in `docs/superpowers/plans/`.

## 1. What shipped (in production on `main`)

| PR | What |
| --- | --- |
| Phase 1 | The old Spotify listening-party app was replaced by a learning programme: new home, setup for input (mic / MIDI / computer keys / on-screen keys), first lesson, notebook-paper design (light and dark), animated staff backdrop, new logo and OG card. Old tables dropped (`20261109120000_drop_rmhmusic_legacy`). |
| #1504, #1507 | Cleanup, site knowledge regenerated, RMH Music isolated from the site's jelly/lightning material (`lib/native-material-routes.ts`), OG embed image and `appHubHead` previews. |
| PR D | Reading: staff flashcards with spaced repetition (`lib/rmhmusic/learn/srs/`, table `music_learn_card`), find-middle-C, Practice (`/rmhmusic/practice`). |
| #1525 (PR E) | Fretboard + keyboard note finder, pitch match (3 tries, cents-based points, mic echo guard), interval and chord ear training, play-a-chord. |
| #1526 (PR F) | Metronome, rhythm lessons (note values, 4/4 vs 3/4, tap the beat), shared routed-modes module, catalog text and docs, large-text wrapping on the learn home. |
| #1651 | Realistic instrument sounds (piano, steel-string guitar, violin, flute samples; Sound setting and dialog; `/rmhmusic/credits`) and the sight reading game "Sprint" (`/rmhmusic/sprint`: Freeplay and the Daily challenge, bests and daily rows `MusicSprintBest` / `MusicSprintDaily`). Details in §2.1 and §2.2. |

Where things live: pure logic `lib/rmhmusic/learn/{theory,scoring,srs,content,machines,input,audio,sprint,tuner}`;
UI `components/rmhmusic/learn/`; lesson path and units `lib/rmhmusic/learn/content/path.ts`
(every `available` lesson's `mode` must be in `content/routing.ts` `ROUTED_MODES`); styles
`components/rmhmusic/rmhmusic.css`; catalog `lib/catalog/apps/rmhmusic.ts`; progress API
`app/routes/api/rmhmusic/learn/`; strings `locales/<lang>/c-rmhmusic.json`.
Architecture rule: every lesson is an explicit `{initial, step}` state machine in `machines/`;
all sound goes through `audio/voice.ts` / `audio/sequence.ts` (lifecycle callbacks `onStart`,
`onNoteStart`, `onAllStarted`).

## 2. Recent work

### 2.0 Tuner and note reader (Phase 3) — built on `claude/hopeful-bohr-99d1vw`, not yet merged

- Plan: `docs/superpowers/plans/2026-11-15-rmhmusic-phase3-tuner.md`. Route `/rmhmusic/tuner`
  (auth-gated, sitemap `'auth-gated'`, a sign-in return path), the sanctioned `<Tabs>` for **Tune**
  and **Read notes**, a quiet "Tuner" link beside "Sight reading" at the foot of the learn home.
- **Tuner:** the pure machine `lib/rmhmusic/learn/tuner/machine.ts` (strict island):
  `silent → listening → locked(target, cents)`, level (RMS 0.01) and clarity (0.9) floors, the
  median of the last 9 voiced frames, hysteresis (another target must be 0.4 semitone nearer, for
  4 frames once locked), in tune = ±5 cents held 300 ms (left at 8 cents), silent after a 400 ms
  gap. Presets: any note (chromatic) and guitar strings (`STANDARD_TUNING`; the reading is folded
  by octaves onto each string, so an octave of a string is that string with the folded cents;
  "Tune up / Tune down / In tune", and "Not near a string" naming the note heard when more than
  100 cents from every string). The median is the lower one (never the mean of two notes); the
  advice has hysteresis at the band edge (5 in, 8 out); a reference tone mutes the reading until
  it ends plus `ECHO_TAIL_MS` (400 ms). Frames come from the mic adapter's own 25 ms poll
  (`createMicInput({ onFrame })` → store `subscribeMicFrames`): no `requestAnimationFrame`, nothing
  while the mic is off or the page hidden. The dial (`components/rmhmusic/learn/tuner/TunePanel.tsx`)
  is a static SVG with one needle written straight to the DOM; React renders on a new note, advice
  or phase only; the live region says the note and the advice ("A2: Tune up") once per change
  and keeps its last words through silence. Reference
  tones (A4, or each guitar string) play through the learner's sound. Without the microphone the
  tab says it needs it and offers to switch.
- **Note reader** (`ReadPanel.tsx`, placement `tuner/read.ts`): any input's note-on is written on
  the low card (piano treble from C4 / bass below; guitar an octave up with the small 8) with its
  name and octave, the mic's cents and the last five notes (kept across the tabs); notes off the
  card are named and said to be too high or too low on their own staff. Guitar notes above written
  C6 (sounding C♯5 and up, the high E string's 10th fret on) show "Too high": the card has two
  ledger lines over the staff.
- **Smoke (2026-11-15, Chromium only, dev server + throwaway Postgres, fake mic: an oscillator in a
  fake `getUserMedia` stream through the real YIN pipeline):** 440 Hz locks A4 at 0 cents (the
  rounded readout, so within ±0.5) and says In tune, steady for 2 s (one name, one advice, one
  live-region change); 435 Hz says Tune up at −20 cents; 446 Hz Tune down +23; guitar preset (the
  default for a guitar learner): 108.73 Hz → A2 Tune up −20, 110 Hz → A2 In tune, 435 Hz → A2 Tune
  up −20 (A4 folded onto the A string), 176.6 Hz → "F3", Not near a string; pressing Play A2 says
  Listening… until the tone and its echo tail end, then A2 In tune again; ±10 cents 5 Hz vibrato on 440 Hz: A4 / In tune in all 160 samples over 4 s; hiding the page
  stops the mic and the reading; the reader writes MIDI C4, C♯4 (sharp), G2 (bass staff), F♯6
  (too high) and computer-key notes, and the mic's E4 at +7 cents; 390 and 1280 in Day and Night:
  no horizontal scroll, CLS 0 (fixed during the smoke: re-centred text lines), skeleton height
  equals loaded height, 0 rAF callbacks at rest and 0 while the mic is live; at 320 the six string
  buttons are 44 px and the home's Sight reading / Tuner links sit on one row apart from the Sound
  button. Screenshots looked at: notebook paper, no chips or badges.
- **Review fixes (2026-11-15, after a read-only review):** string folding and "Not near a string",
  the reference-tone mute, spoken advice, lower median, advice hysteresis, the reader's clef for
  notes off the card, the reader's history across tabs, and a mic frame fan-out that isolates a
  throwing listener; re-checked in Chromium at 390 (CLS 0, skeleton = loaded height, 0 rAF at rest).
- **Not done:** Firefox / WebKit / iOS Safari, 200 % text, RTL with real strings (strings are
  English until `pnpm i18n:translate`), a real microphone and instrument (thresholds are reasoned
  and tested on synthetic tones only), alternate guitar tunings or other instruments' presets, the
  shared `<Tabs>` is 40 px tall without a coarse pointer (the primitive's own rule;
  44 px on touch), `pnpm typecheck` on a bigger machine (scoped `tsc` passed).

### 2.1 Realistic instrument sounds — shipped in #1651
- Plan (approved by the owner): `docs/superpowers/plans/2026-11-09-rmhmusic-instrument-sounds.md`.
  v1 instruments: **piano** (Salamander Grand V3, CC BY 3.0 — attribution required), **steel-string
  guitar** ("Ella Gitauru", MIT plus one sentence about attributing alterations; the CC0 nylon
  guitar was NOT needed: the steel guitar built), **violin** and **flute** (VSCO 2 Community
  Edition, CC0). Decisions the owner confirmed: default sound follows the learner's instrument; no
  "Mixed" option; credits page `/rmhmusic/credits` linked from the Sound dialog (not a footer);
  chord lessons use only piano/guitar (violin/flute fall back with one plain sentence in the dialog).
- **Built (merged in #1651):**
  - Samples: `public/music/rmhmusic/instruments/<id>/<midi>.mp3`, 66 zones, mono 44.1 kHz CBR 64 kbps,
    **1,933,035 bytes** (piano 565,476 · guitar 593,874 · violin 489,285 · flute 284,400). Built by
    `scripts/rmhmusic/build-instruments.ts` from `scripts/rmhmusic/sources.json` (commit-pinned
    URLs + SHA-256, guitar RAR from the author's Google Drive; per-fret pitch restore with
    `asetrate`; loudness baked in; bit-exact, re-runs give identical files; YIN on every encoded
    file fails the build at ≥0.35 st). Generated `zones-data.ts`; `assets.test.ts` holds files to it.
  - Engine: `instruments/sampler.ts` (the `Instrument`), `instruments/engine.ts` (registry, master
    gain + compressor, the lesson **sound session**: `loading` for at most `LOAD_WAIT_MS` 2.5 s, then
    the samples, or the synth for the rest of that session), wired into `voice.ts` / `sequence.ts`
    (`PlayOptions.instrument`, chord trim 1/√n, guitar strum). `soundReleaseMs` = the longer of the
    instrument's and the synth's release (the echo guard). Metronome clicks stay the synth click.
  - Setting: nullable `MusicLearnProfile.sound` (migration `20261115160000_music_learn_sound`),
    `profileSchema.sound` (zod enum of `INSTRUMENT_IDS`, optional so old clients leave it alone),
    store `setSound`, `resolveSound` / `chordSoundFor` in `catalog.ts`; `SoundDialog` from LearnHome;
    `/rmhmusic/credits` (`SoundCredits`, full Ella MIT text, Salamander attribution); every pitched
    lesson (ear, chord, match, find/fretboard, flashcards, first note, Practice) gets `{ instrument }`.
  - Smoke after merging the Sprint (2026-11-15, Chromium, 390/1280 × Day/Night): one ear lesson
    per instrument played its samples (sampler spied, YIN on the master tap heard the asked
    pitches), the Sound dialog by keyboard picks and stores a sound and links the credits, and the
    merged LearnHome shows both the Sound button and the Sight reading link without crowding at
    320/390/1280 (no overlap, no horizontal scroll, CLS 0).
- **Not done / still open:** the owner's **audition** (nobody has listened to any sample; checks
  were YIN pitch, onset and peak on decoded/rendered audio only); Safari / iPhone (silent switch
  mutes Web Audio; decoding MP3 on iOS) never tried; ear questions are moved by octaves into the
  sound's range (`fitToRange`), but a note the learner taps or is asked to match outside the
  sound's range (e.g. a C3 key with the flute) plays on the synth for that note (plan §5.2 range
  plumbing into the generators not done); the 2.5 s wait counts from when the audio context runs;
  the R2 sync re-versions `public/music` (games' music URLs change once); no second piano velocity
  layer; no offline cache. The full `tsc -b` could not run in the agent container (OOM-killed);
  a scoped check of the changed files passed — run `pnpm typecheck` once on a bigger machine.

### 2.2 Sight reading game ("Sprint") — shipped in #1651 (S1–S5 built, S6 smoke run in Chromium)
- Plan: `docs/superpowers/plans/2026-11-09-rmhmusic-note-sprint.md`. Timed MIDI reading game:
  levels one note → accidentals → chords → short bars; **Freeplay** (20-prompt runs, personal bests)
  and a **Daily challenge** (one run per UTC day, 6 escalating levels, seeded by date, the first
  started run scored, daily streak). No leaderboard until the owner decides.
- Built: `lib/rmhmusic/learn/sprint/` (levels and pars, seeded generators, `dailyRun`/`utcDate`,
  scoring, the `{initial, step}` machine), `sheetLayout` + `SprintSheet` (accidentals, stacked
  chords, bars with a now mark), `components/rmhmusic/learn/sprint/` and `/rmhmusic/sprint`, and a
  "Sight reading" link at the foot of the learn home. MIDI must play the written pitch for notes,
  accidentals and bars; chords count their pitch classes in any octave on every input (by design);
  the computer keys, on-screen keys and microphone count any octave (the hint says which). Guitar
  reads the treble staff only (octave clef, low card); the daily run deals the same prompts to
  everyone and draws a bass prompt an octave up on treble for guitar. The input is locked during a run.
- **S5 persistence (built):** `MusicSprintBest` (per user per level: best score and, independently,
  fastest average) and `MusicSprintDaily` (per user per UTC date: score, avgMs, played, skipped,
  the recomputed per-prompt results), migration `20261115170000_music_sprint`. Endpoints are
  contracts (`sprint/sprint.contract.ts`) bound with `implement()` in
  `lib/rmhmusic/api/rmhmusic.sprint*.server.ts`: `GET /api/rmhmusic/sprint?date=` (bests, the
  date's state `open`/`started`/`scored`, streak), `POST …/freeplay`, `POST …/daily`,
  `POST …/daily-start`. The rules are pure in `sprint/record.ts`: the dealt date is accepted only
  for today or for yesterday within 10 minutes of UTC midnight and never relabelled; every
  prompt's points are recomputed from its time with the game's `promptPoints` (client points and
  summary ignored; lengths, level order, kinds and skips checked); the daily row is filled once
  (`UPDATE … WHERE score IS NULL`), a second run answers `already-scored`, an identical retried POST
  answers `saved`. **Started tracking:** a scored daily run writes its row when Start is pressed,
  so an abandoned run reads `started` and later runs that day are practice (the start is best
  effort; the save makes the row itself). The server cannot know which notes were played, so this
  keeps an honest client honest; it is not anti-cheat. `createApiSaver` is the screen's saver;
  picker rows say each level's best as a plain sentence; the Daily challenge says where today
  stands and the run of days played (streak from scored dates, today or yesterday back).
- **S6 smoke (2026-11-15, Chromium only, dev server + throwaway Postgres):** picker skeleton equals
  loaded height at 320/390/1280 in Day and Night (fixed: the placeholder now wraps like the hints);
  a freeplay run on the computer keys reached and played by keyboard only (any octave), saved, best
  shown on return, focus back on the row; MIDI through a fake hub: one note at the exact pitch (an
  octave-off answer is wrong), triads graded when the window closes; the microphone lists the chord
  levels as unplayable with one sentence; the daily run records its start, saves once, a second run
  says practice, an abandoned start makes the next run practice; failed save → Try again → saved;
  session ended mid-run → "Not saved: sign in again" with a Sign in link; no layout move between
  ready, asking and the result; CLS 0 (fixed: the centred count/caption lines were re-centred text);
  the prompt image is named by kind and staff only while asking; focus lands on the end action
  (fixed: it was lost while saving). Screenshots looked at: notebook paper, no chips or badges.
- Not yet: the rest of S6's matrix (Firefox/WebKit, 200% text, RTL, a real MIDI keyboard, iOS);
  the mic learner's picker placeholder is still 20px shorter at 390 (the placeholder cannot know
  the input before the profile loads, and the mic sentence wraps); a new best is not called out in
  the result (it says "Saved."); level unlocking (every level is open); `pnpm typecheck` on a bigger
  machine (the container OOM-kills `tsc -b`; scoped checks passed).

## 3. Future features

- **Phase 3:** tuner and note reader — **built** (§2.0); left: the browser/device matrix and a
  real-microphone check listed there, alternate tunings and other instruments' presets.
- **Phase 4:** sheet music / tab play-along.
- **Phase 5:** more instruments (cello, clarinet, oboe, ukulele, organ, `guitar-nylon`) and choir/voice.
- **Phase 6:** social (friends, shared progress, possibly leaderboards for Sprint).
- Rhythm *reading* beyond four note values; sharps/flats in flashcards (naturals only today);
  descending intervals; minor seconds (the interval table has `second` = major second only).

## 4. Known gaps, debt and things an audit should check

- **Translations:** every new string in the 15 non-English shipped locales is the English default
  until `pnpm i18n:translate` is run (only the 16 shipped `locales/*/c-rmhmusic.json` were kept
  when extracting; do not commit the thousands of other extractor files).
- **Never tested on real hardware:** microphone + speaker (echo guard timings 250 ms confirm /
  400 ms tail are reasoned; the tuner's level/clarity floors, median window and hysteresis were
  tuned on synthetic tones only), MIDI controllers, Bluetooth output latency (`OUTPUT_LATENCY_MS = 40`
  default for uncalibrated devices), a real iPhone / Mac Safari (silent switch, audio interruption).
- **Verification gaps:** the full 320 px / 200 % text / RTL / Firefox / WebKit matrix was run on
  PR E's lessons only partly (Firefox/WebKit smoke on the learn home and note finder; RTL only the
  find-note lessons and learn home) and **not** for the ear, chord and rhythm lessons. RTL with real
  Arabic strings was not seen (placeholders are English).
- **Layout:** at 200 % text on 320 px the sheets grow past their 1x-sized skeletons (chord lesson
  non-input CLS 0.135; learn home +24 px once the Practice link appears). Accepted trade-off:
  showing all text beats zero shift; revertible (`7f5b4f8de`, `ce8ebfac4`).
- **Accepted behaviours:** one mic note-on = one try in pitch match (a scoop up to the note costs a
  try); `isKnownCardId` accepts unshipped bass deck ids; a lost-POST retry can double-review a card;
  `second` interval is major only.
- **Library:** the old Library "Music" section was turned into video-only "Playlists", not removed
  — ask the owner where video playlists should live.
- **Ops (owner, by hand):** the Apache vhost must be hand-installed (copy conf, `configtest`,
  graceful reload; verify `Permissions-Policy` allows `midi` and the CSP with curl). Not automated
  by deploy.
- **Licences to confirm with counsel before launching sounds:** the guitar's MIT+sentence terms and
  the CC0 claims resting on repository LICENSE files for VSCO. Not legal advice.
- **Test hygiene:** `build-site-knowledge.ts` has no `--check`; component tests run in node without a
  DOM (logic is extracted into pure helpers to be testable); `pnpm check:consistency --fast` is what
  the commit hook runs, the full gate was run on the PR E branch only.

## 5. How the work was done (for the audit)

Subagent-driven development: plan → implementer (tests first) → read-only reviewer → fix round →
browser pass (Playwright harness in the session scratchpad, not in the repo) → PR → CI → squash
merge. SDD ledger: `.superpowers/sdd/2026-11-09-rmhmusic-phase2-training/` (briefs, reports,
review diffs). Plans: `docs/superpowers/plans/2026-11-09-rmhmusic-*.md`. Commit-gate hook:
`.claude/hooks/commit-gate.sh` → `pnpm check:consistency --fast`.

## 6. Implementation stubs (sketches for whoever picks this up)

These are design sketches in plain TypeScript/SQL/JSON, **not compiled and not in the code tree**.
Check them against the real files named in each heading before using them; where they differ,
the code and the two plan files win. Task order for each feature is in its plan.

### 6.1 Sampler engine (instrument sounds, plan §3 and §6) — implemented

The sketches that were here are now code; read the files, not a sketch:
`lib/rmhmusic/learn/audio/instruments/` (`sampler.ts`, `engine.ts`, `catalog.ts` with
`resolveSound` / `chordSoundFor`, `credits.ts`, generated `zones-data.ts`), `audio/voice.ts`,
`audio/sequence.ts`, `scripts/rmhmusic/build-instruments.ts` + `sources.json`,
`components/rmhmusic/learn/SoundDialog.tsx`, `SoundCredits.tsx`, `app/routes/rmhmusic/credits.tsx`.
Rebuild the samples: `pnpm exec tsx scripts/rmhmusic/build-instruments.ts [piano guitar violin flute]`
(needs `ffmpeg` with libmp3lame and `unar`; `RMHMUSIC_ARCHIVE_DIR` may point at an already
downloaded `BJAM 5.26.04.rar`). Next steps if wanted: pass the instrument's `range` into the
question generators of the match / find lessons (plan §5.2), a "Change sound" link in the ear sound row, a second Salamander
velocity layer (+0.53 MB), an offline cache.

### 6.2 Sight reading game — Sprint (plan: `2026-11-09-rmhmusic-note-sprint.md`)

```ts
// lib/rmhmusic/learn/sprint/levels.ts
export type SprintLevel = 'note' | 'accidental' | 'chord' | 'bar';
export interface SprintPrompt {
  level: SprintLevel;
  notes: readonly number[];   // sounding MIDI; 1 for note/accidental, 3 for chord, 4 in order for bar
  clef: 'treble' | 'bass';
}
export const PAR_MS: Record<SprintLevel, number> = { note: 1200, accidental: 1600, chord: 2400, bar: 2000 };
// bar par = 2000 + 700 * (notes.length - 1)

// lib/rmhmusic/learn/sprint/scoring.ts
// promptPoints(level, elapsedMs, correct, noteCount?) -> 0..100: 100 at or under par, linear to 0
// at 4x par, 0 if wrong. runScore = mean; stars via starsFor().

// lib/rmhmusic/learn/sprint/generate.ts
// makePrompt(level, rand: () => number, opts): SprintPrompt   // seeded, inside ledger-line limit
// dailySeed(utcDate: string): number                          // e.g. FNV-1a of "2026-11-09"
// dailyRun(utcDate): readonly SprintPrompt[]                  // 6 levels x 5 prompts, escalating
// utcDate(now: number): string                                // the ONLY place "the day" is decided

// lib/rmhmusic/learn/sprint/machine.ts — explicit {initial, step}, like machines/match-note.ts
export type SprintState =
  | { kind: 'ready' } | { kind: 'countdown'; beat: 0 | 1 | 2 }
  | { kind: 'asking'; index: number; shownAt: number; got: readonly number[] }
  | { kind: 'feedback'; index: number; correct: boolean }
  | { kind: 'complete'; points: readonly number[] }
  | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed' } | { kind: 'signed-out' };
// Events: start, tick, shown{at}, note{midi, time}, next, complete{outcome}, retry.
// Rules: a prompt cannot be answered before it is drawn; note-offs and held keys from the previous
// prompt are ignored; chord = pitch classes inside a 600 ms window (reuse input/chord-window.ts);
// bar = notes in order, per-note time from the previous note; a wrong note ends the prompt (no
// retry); exactly one `complete` per run; times come from NoteEvent.time, never Date.now().
```

```prisma
// As built (prisma/schema/rmhmusic.prisma): MusicSprintBest { userId, level, bestScore, bestAvgMs?,
// updatedAt; @@unique([userId, level]) } and MusicSprintDaily { userId, date VarChar(10), score?,
// avgMs?, played?, skipped?, results Json?, scoredAt?, createdAt; @@unique([userId, date]) } — a
// daily row with score NULL is a started run. Rules: lib/rmhmusic/learn/sprint/record.ts.
```

UI: `components/rmhmusic/learn/sprint/*` + `app/routes/rmhmusic/sprint.tsx` (auth-gated like
`practice.tsx`, listed in `EXCLUDED_ROUTES` as `'personal'` in the sitemap test). Needs `StaffCard`
(+ `staff-card-layout.ts`) extended for accidentals, stacked chord noteheads (second-interval
offset) and a bar of notes with a "now" mark; keep `direction="ltr"` on all SVG text and a
fixed-height sheet per level (skeleton equals loaded height). Mic is offered for note / accidental /
bar only; for chords say once that the microphone hears one note at a time and never mark it wrong.

### 6.3 Phase 3 (tuner and note reader) — implemented

The sketch that was here is now code; read the files: `lib/rmhmusic/learn/tuner/{machine,read}.ts`,
`lib/rmhmusic/learn/input/mic.ts` (`onFrame`), `lib/rmhmusic/learn/store.ts` (`subscribeMicFrames`),
`components/rmhmusic/learn/tuner/`, `app/routes/rmhmusic/tuner.tsx`. Possible next steps: tuning
presets beyond guitar standard (drop D, ukulele, violin), a "tune by ear" mode (reading while the
reference tone sounds, which the mute now prevents; it would need echo cancellation), and a calibration offset (A4 = 442 Hz).
