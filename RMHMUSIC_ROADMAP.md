# RMH Music — roadmap, work in progress and audit notes

> **For LLMs and auditors:** this is the single place for RMH Music (`/rmhmusic`, the beginner
> piano and guitar learning programme) status, unfinished work, future features, known gaps and
> hand-off steps. Written 2026-11-09 when work was paused for an audit. If this file disagrees
> with the code, the code wins; fix this file. Plans live in `docs/superpowers/plans/`.

## 1. What shipped (in production on `main`)

| PR | What |
| --- | --- |
| Phase 1 | The old Spotify listening-party app was replaced by a learning programme: new home, setup for input (mic / MIDI / computer keys / on-screen keys), first lesson, notebook-paper design (light and dark), animated staff backdrop, new logo and OG card. Old tables dropped (`20261109120000_drop_rmhmusic_legacy`). |
| #1504, #1507 | Cleanup, site knowledge regenerated, RMH Music isolated from the site's jelly/lightning material (`lib/native-material-routes.ts`), OG embed image and `appHubHead` previews. |
| PR D | Reading: staff flashcards with spaced repetition (`lib/rmhmusic/learn/srs/`, table `music_learn_card`), find-middle-C, Practice (`/rmhmusic/practice`). |
| #1525 (PR E) | Fretboard + keyboard note finder, pitch match (3 tries, cents-based points, mic echo guard), interval and chord ear training, play-a-chord. |
| #1526 (PR F) | Metronome, rhythm lessons (note values, 4/4 vs 3/4, tap the beat), shared routed-modes module, catalog text and docs, large-text wrapping on the learn home. |

Where things live: pure logic `lib/rmhmusic/learn/{theory,scoring,srs,content,machines,input,audio}`;
UI `components/rmhmusic/learn/`; lesson path and units `lib/rmhmusic/learn/content/path.ts`
(every `available` lesson's `mode` must be in `content/routing.ts` `ROUTED_MODES`); styles
`components/rmhmusic/rmhmusic.css`; catalog `lib/catalog/apps/rmhmusic.ts`; progress API
`app/routes/api/rmhmusic/learn/`; strings `locales/<lang>/c-rmhmusic.json`.
Architecture rule: every lesson is an explicit `{initial, step}` state machine in `machines/`;
all sound goes through `audio/voice.ts` / `audio/sequence.ts` (lifecycle callbacks `onStart`,
`onNoteStart`, `onAllStarted`).

## 2. Work in progress (uncommitted work was stopped at the user's request)

### Realistic instrument sounds — started, not wired
- Plan (approved by the owner): `docs/superpowers/plans/2026-11-09-rmhmusic-instrument-sounds.md`.
  v1 instruments: **piano** (Salamander Grand V3, CC BY 3.0 — attribution required), **steel-string
  guitar** ("Ella Gitauru", MIT plus one sentence about attributing alterations; the CC0 nylon
  guitar is the stated fallback only if the steel one cannot be built), **violin** and **flute**
  (VSCO 2 Community Edition, CC0). ~1.9 MB total, ≤0.6 MB per learner. Decisions the owner confirmed:
  default sound follows the learner's instrument; no "Mixed" option; credits page
  `/rmhmusic/credits` linked from the Sound dialog (not a footer); chord lessons use only
  piano/guitar (monophonic sounds fall back with one plain sentence).
- Done (committed but **unwired and unimported**, tests pass): `lib/rmhmusic/learn/audio/instruments/`
  — `types.ts`, `catalog.ts`, `zones.ts` (+`zones-data.ts` placeholder), `voice-pool.ts`,
  `load-machine.ts`, `loader.ts`, `chord.ts` with 41 unit tests. They implement zone mapping /
  detune maths, voice stealing, the `idle → loading → ready | failed` loader machine, and chord
  strum/block timing.
- **Not done:** the sampler engine behind `voice.ts` (synth stays the fallback), the build script
  (fetch commit-pinned sources with SHA-256 checks, YIN pitch verification, guitar per-fret pitch
  restore via `asetrate`, mono 64 kbps MP3), the converted audio under
  `public/music/rmhmusic/instruments/`, the nullable `sound` column on `MusicLearnProfile`, the
  Sound dialog, the credits page, wiring into ear / chord / hint / note-finder lessons, and the
  per-instrument release value for the mic echo guard (`RELEASE_MS` in `voice.ts`).
- Nobody has **listened** to any sample. The plan ends with an owner audition step.

### Sight reading game ("Sprint") — planned only, no code
- Plan: `docs/superpowers/plans/2026-11-09-rmhmusic-note-sprint.md`. Timed MIDI reading game:
  levels one note → accidentals → chords → short bars; **Freeplay** (20-prompt runs, personal bests)
  and a **Daily challenge** (one run per UTC day, 6 escalating levels, seeded by date, first
  completed run scored, daily streak). Tasks S1–S6 in the plan. No leaderboard until the owner decides.

## 3. Future features (not started)

- **Phase 3:** tuner and note reader.
- **Phase 4:** sheet music / tab play-along.
- **Phase 5:** more instruments (cello, clarinet, oboe, ukulele, organ, `guitar-nylon`) and choir/voice.
- **Phase 6:** social (friends, shared progress, possibly leaderboards for Sprint).
- Rhythm *reading* beyond four note values; sharps/flats in flashcards (naturals only today);
  descending intervals; minor seconds (the interval table has `second` = major second only).
- Sprint needs `StaffCard` extended for accidentals, stacked chord noteheads and multi-note bars.

## 4. Known gaps, debt and things an audit should check

- **Translations:** every new string in the 15 non-English shipped locales is the English default
  until `pnpm i18n:translate` is run (only the 16 shipped `locales/*/c-rmhmusic.json` were kept
  when extracting; do not commit the thousands of other extractor files).
- **Never tested on real hardware:** microphone + speaker (echo guard timings 250 ms confirm /
  400 ms tail are reasoned), MIDI controllers, Bluetooth output latency (`OUTPUT_LATENCY_MS = 40`
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

### 6.1 Sampler engine (instrument sounds, plan §3 and §6)

Already real and tested: `lib/rmhmusic/learn/audio/instruments/types.ts` (`Instrument`,
`InstrumentMeta`, `Zone`, `ZoneMap`, `PlayOpts`, `NoteHandle`, `INSTRUMENT_IDS`), `catalog.ts`
(per-instrument meta), `zones.ts` (nearest zone + detune maths), `voice-pool.ts`, `load-machine.ts`
(`LoadState`: idle → loading → ready | failed), `loader.ts`, `chord.ts`. Still to write:

```ts
// lib/rmhmusic/learn/audio/instruments/sampler.ts  (NEW)
// One class implementing Instrument over the shared AudioContext from voice.ts.
//  - load(): single-flight; fetch zones JSON + each MP3 (fetch + decodeAudioData, never at page
//    load), drive load-machine events; resolve with the settled state.
//  - play(midi, opts): zone = pickZone(zones, midi) -> AudioBufferSourceNode with
//    playbackRate = 2 ** ((midi - zone.keyCenter) * 100 + zone.tuneCents) / 1200), gain from
//    velocity * 10 ** (zone.gainDb / 20) * busGain / sqrt(opts.chordOf ?? 1), optional one-pole
//    low-pass when meta.softLowpass and velocity < ~0.4; steal the oldest voice via voice-pool
//    when meta.maxVoices is reached (mono => legato handover). stop(when) ramps gain to 0 over
//    meta.releaseMs and disconnects on 'ended'.
//  - A not-ready instrument returns a silent NoteHandle (never throws); callers fall back to synth.
export function createSampler(meta: InstrumentMeta, zones: ZoneMap, ctx: () => AudioContext): Instrument;

// lib/rmhmusic/learn/audio/voice.ts  (EDIT)
//  - PlayOptions gains `instrument?: InstrumentId`; playNote() asks the registry for that
//    instrument, uses it when state === 'ready' && canPlay(midi), else the existing synth.
//  - soundStatus() already allows 'loading' | 'failed'; map the active instrument's LoadState.
//  - soundReleaseMs(opts) returns the instrument's releaseMs (the mic echo guard in
//    input/echo-window.ts and MatchNoteLesson wait this long after a note ends).
//  - A lesson waits at most 2.5 s for 'loading', then uses the synth for the rest of the session
//    (do not flip timbre mid-lesson). Chord lessons: only meta.polyphony === 'chord' instruments.
```

Build script (`scripts/rmhmusic/build-instruments.ts`, NEW) driven by `sources.json`:

```jsonc
{
  "piano": {
    "source": { "url": "https://raw.githubusercontent.com/<repo>/<commit>/<path>", "sha256": "…" },
    "licence": "CC-BY-3.0", "credit": "salamander",
    "zones": [{ "src": "A2v8.flac", "keyCenter": 45, "tuneCents": -12, "gainDb": -1.5 }]
  },
  "guitar": { "source": { "url": "<Google Drive RAR, see plan §2.4>", "sha256": "…" },
              "restorePitch": "asetrate=16000*2^(fret/12)", "layer": "mf" }
}
// Steps: fetch (verify SHA-256, fail on zero-byte files) -> decode -> trim pre-roll -> restore
// pitch where flagged -> measure pitch with lib/rmhmusic/learn/pitch YIN and FAIL if it is not
// within 15 cents of keyCenter (VSCO wind file names are an octave low) -> mono 64 kbps MP3 ->
// write public/music/rmhmusic/instruments/<id>/*.mp3 and generated zones JSON
// (lib/rmhmusic/learn/audio/instruments/zones-data.ts) with durations and SHA-256s.
```

Learner setting, credits and wiring:

```prisma
// prisma/schema.prisma — additive, nullable (null = follow the learner's instrument)
model MusicLearnProfile { /* …existing… */ sound String? @db.VarChar(16) }
```

```ts
// app/routes/api/rmhmusic/learn/profile.ts (EDIT): zod z.enum(INSTRUMENT_IDS).nullable() in the
// body schema, via defineHandler({ rateLimit: 'write', body }, …). Client: store.ts `sound`,
// resolveSound(profile) = profile.sound ?? (profile.instrument === 'guitar' ? 'guitar' : 'piano').
// UI: components/rmhmusic/learn/SoundDialog.tsx — plain text rows (no chips), opened from
// LearnHome; picking one calls load() (prefetch) and plays one note. Credits route
// app/routes/rmhmusic/credits.tsx + lib/rmhmusic/credits.ts (Salamander CC BY 3.0 attribution
// text and the full MIT text for the guitar; plan §2.2). Then pass { instrument } from
// EarLesson / PlayChordLesson / MatchNoteLesson / FindNoteLesson via useNoteSound(enabled, opts).
```

Owner audition after it works (nobody has listened): one note and one interval per instrument,
chords on piano and guitar, the steel guitar's brightness (16 kHz source), Safari/iPhone silent switch.

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
model MusicSprintBest { id String @id @default(cuid()); userId String; level String;
  best Int; bestAvgMs Int; updatedAt DateTime @updatedAt; user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, level]) @@map("music_sprint_best") }
model MusicSprintDaily { id String @id @default(cuid()); userId String; date String @db.VarChar(10);
  score Int; avgMs Int; createdAt DateTime @default(now()); user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, date]) @@map("music_sprint_daily") }
// Server recomputes the date, rejects a second scored daily result (a retried POST returns the stored one).
```

UI: `components/rmhmusic/learn/sprint/*` + `app/routes/rmhmusic/sprint.tsx` (auth-gated like
`practice.tsx`, listed in `EXCLUDED_ROUTES` as `'personal'` in the sitemap test). Needs `StaffCard`
(+ `staff-card-layout.ts`) extended for accidentals, stacked chord noteheads (second-interval
offset) and a bar of notes with a "now" mark; keep `direction="ltr"` on all SVG text and a
fixed-height sheet per level (skeleton equals loaded height). Mic is offered for note / accidental /
bar only; for chords say once that the microphone hears one note at a time and never mark it wrong.

### 6.3 Phase 3 starter (tuner and note reader)

Reuse `lib/rmhmusic/learn/pitch/` (YIN + `centsOff` from `scoring/pitch.ts`) and `input/mic.ts`
(`echoCancellation: false`). A tuner is a pure `tunerStep(state, frame)` machine
(`silent → listening → locked(note, cents)`) with hysteresis so the needle does not flicker; draw a
static dial and update it from the hub's mic events (no rAF at rest; one `drive(fn)` while the
microphone is live and the tab visible). Open question: instrument tuning presets (guitar standard
tuning is `STANDARD_TUNING` in `theory/fretboard.ts`).
