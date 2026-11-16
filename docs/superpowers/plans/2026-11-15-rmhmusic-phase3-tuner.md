# RMH Music Phase 3 — tuner and note reader

Date: 2026-11-15. Roadmap: `docs/rmhmusic/roadmap.md` §3 and §6.3. Branch
`claude/hopeful-bohr-99d1vw` (after PR #1651).

## Decisions

- **One route, two tabs.** `/rmhmusic/tuner` (auth-gated by the `rmhmusic` layout like Practice and
  Sight reading; sitemap `EXCLUDED_ROUTES` `'auth-gated'`; added to the sign-in return-path
  allowlist). The sanctioned `<Tabs>` switches **Tune** and **Read notes**. The page is the
  lessons' `Shell` (back link, title, Change input). A quiet "Tuner" text link sits beside "Sight
  reading" at the foot of the learn home (not in the Sound row).
- **The tuner is a pure machine** in `lib/rmhmusic/learn/tuner/machine.ts`, `{ initial, step }`
  like `machines/*.ts`, in the strict island (`tsconfig.strict.json`). Input: one mic frame
  `{ time, freq | null, clarity, rms }`. States `silent → listening → locked(target, cents)`:
  - a frame counts only above a level floor (RMS 0.01, the detector's own) and a clarity floor
    (0.9);
  - the reading is the **median of the last 9 voiced frames** (~225 ms at the mic's 25 ms poll),
    in fractional MIDI, so one octave-slip frame or a slight vibrato does not move it;
  - **lock** after 3 frames agree on the nearest target; **hysteresis**: a target (the listening
    candidate or the locked one) changes only when the reading is at least 0.4 semitone nearer
    another target — and, once locked, for 4 frames running (chromatic: 70 cents off the locked
    note) — so the name never flickers between neighbours;
  - **in tune** = within ±5 cents for 300 ms; once in tune it stays until 8 cents off;
  - a gap of 400 ms of unvoiced frames returns to `silent` (a plucked string's decay holds the
    reading meanwhile).
  - Presets: `chromatic` (every semitone is a target) and `guitar` (the six strings of
    `STANDARD_TUNING`, E2 A2 D3 G3 B3 E4): the nearest string is the target and the advice is
    "Tune up" / "Tune down" / "In tune" against it (chromatic gives the same advice against the
    nearest note).
- **Frames reach the screen without a frame loop.** `input/mic.ts` gains `onFrame` (called from
  its existing 25 ms analyser poll, a timer, only while the mic runs); the store fans it out as
  `subscribeMicFrames`. The dial writes its one needle (`transform` attribute) and the cents text
  straight to the DOM; React re-renders only when the note, the advice or the phase changes. No
  `requestAnimationFrame` (the repo's rAF allowlist stays as it is); the mic stops when the tab is
  hidden (`useInputRelease`), so nothing runs then either.
- **Dial:** a static SVG scale −50…+50 cents (ticks every 10, `direction="ltr"` text), one needle;
  the note name, the advice and the cents in fixed-height lines; an `sr-only` polite live region
  announces the locked note (and "in tune") once per change.
- **Reference tone:** chromatic: A4; guitar: one button per string. Played through the learner's
  sound (`voice.ts` `playNote` with `resolveSound(profile)`, one sound session for the page),
  released after 2 s.
- **Inputs:** the tuner needs the microphone. With the mic chosen and not running, the lesson's
  `DeviceRegion` (the input chooser, with its plain error sentences for blocked / missing mic)
  fills the input region; with MIDI or keys the tuner tab says it needs the microphone and offers
  to switch to it (the input's error sentences if that fails). The note reader works on every
  input.
- **Note reader:** every note-on is written on the taller low card (`SprintSheet`, one note) —
  piano: treble from C4, bass below; guitar: treble an octave up with the small 8 — with its
  name and octave, the cents (microphone only), and the last five notes as plain text. A note the
  card cannot reach says so in a plain sentence instead of being drawn at the wrong place.
  Placement is pure (`tuner/read.ts`).

## Tasks

1. `tuner/machine.ts` + tests (TDD), `tuner/read.ts` + tests; strict island entry.
2. `mic.ts` `onFrame` + test; store `subscribeMicFrames`.
3. `TunerScreen` / `TunePanel` / `ReadPanel` (`components/rmhmusic/learn/tuner/`), the route,
   LearnHome link, sitemap, return path (+ test), route tree.
4. Strings via `t()`, `pnpm i18n:extract`, keep only the 16 shipped `c-rmhmusic.json`.
5. Roadmap §1–§4.

## Verification

- Unit: machine (silence, floors, lock, median, hysteresis, vibrato, in-tune hold and exit, guitar
  advice, presets), reader placement, mic `onFrame`, return path.
- Scoped `tsc` over the changed files and the strict island (`pnpm typecheck` OOMs in the agent
  container).
- One Chromium smoke (fake mic: an `OscillatorNode` in a fake `getUserMedia` stream through the
  real YIN pipeline): 440 Hz locks A4 within ±1 cent and says in tune; 435 Hz says tune up (A4,
  chromatic); 108.73 Hz in guitar mode says tune up against A2; a 440 Hz tone with ±10 cent 5 Hz
  vibrato never changes the note; note reader writes MIDI and keys notes; 390 / 1280 × Day / Night;
  CLS 0; no rAF callbacks at rest.

## Status (2026-11-15)

Built and smoked as planned (results in the roadmap §2). Not done: the matrix beyond Chromium
(Firefox, WebKit, iOS Safari, 200 % text, RTL with real strings), a real microphone and a real
instrument, `pnpm typecheck` on a bigger machine.
