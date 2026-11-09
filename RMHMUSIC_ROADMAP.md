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
