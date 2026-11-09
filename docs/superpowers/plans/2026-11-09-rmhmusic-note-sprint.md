# RMH Music — Sight Reading Game (timed reading game, "Sprint")

Requested by the owner 2026-11-09: a sight reading **game**. Notes appear on the
staff and you answer as fast as you can with a MIDI controller. Difficulty levels start with
one note, then accidentals, chords and short bars. Two ways to play: **Freeplay** (pick a level)
and a **Daily challenge** (one fixed run of 5–7 escalating levels, the same for everyone that day).

## Modes

- **Freeplay:** pick any unlocked level and play a 20-prompt run, as often as you like. Keeps
  a personal best per level.
- **Daily challenge:** one run per calendar day (UTC) made of **6 levels in order** — one note,
  more notes across both clefs, accidentals, a triad, an inverted triad, a four-note bar
  (5 prompts each, 30 in all; a 7th level, a two-bar phrase, joins once bars ship — the level
  list is data, 5–7 entries). Prompts come from a **seed derived from the date**, so every
  player gets identical prompts. The first completed run of the day is the scored one (stored
  once per user per date); replays that day are practice and don't overwrite it. A wrong answer
  never ends the run — each prompt just scores 0 — so a finished day always has a result.
  Mic users get the single-note levels only; the chord levels are skipped with one plain sentence
  rather than marked wrong (the run is then scored on fewer levels and says so).
  A completed day extends a **daily streak** (reuse the existing streak machinery if it fits,
  else a small per-user table; decided in S5). No leaderboard.

## Decisions (defaults — change by editing here before the work starts)

- **It is a game, not a lesson.** It lives beside the path (a quiet "Sprint" entry on the
  learn home, route `/rmhmusic/sprint`), is not part of unit progress, and never gates the path.
- **A run is 20 prompts.** Fixed length (not a clock) so runs compare. Each prompt is timed
  from the moment it is drawn to the moment the learner's answer is complete.
- **Levels** (each its own best score):
  1. *One note* — naturals on the clef(s) the learner reads.
  2. *Accidentals* — sharps and flats printed beside the note (no key signatures yet).
  3. *Chords* — triads (root position, then inversions), all notes must sound inside a 600 ms window.
  4. *Short bars* — four notes in order (later: two bars); each note is timed from the previous one.
- **Input:** MIDI is the intended device. Computer keys and on-screen keys work for all levels.
  The microphone works for levels 1, 2 and 4 (one note at a time) and is **not offered** for
  chords — one plain sentence says why, with the existing input switcher. Never mark a mic player
  wrong for a chord.
- **Scoring (pure, tested):** per prompt, `100` at or under a *par* time, falling linearly to
  `0` at `4×par`; a wrong answer scores `0` for that prompt and the prompt ends (no retry —
  speed games must not reward guessing until right). Par per level: one note 1.2 s, accidental 1.6 s,
  chord 2.4 s, bar 2.0 s + 0.7 s per extra note (tuned from real play, constants in one file).
  Run score = mean; stars use the existing `starsFor`. Timing uses the hub event timestamps
  (MIDI `timeStamp`), never `Date.now()` in a handler, so UI latency doesn't pollute it.
- **Persistence:** best score and best average reaction per level, per user, behind the same
  save lifecycle as lessons (`saving/saved/failed/signed-out`). Signed-out players can play;
  the result says plainly that it wasn't saved, with a sign-in link. **No leaderboard** in this
  plan (ask the owner before adding one — it is outward-facing).
- **Look:** notebook paper, a hand-ruled staff, pencil marks. No timers drawn as meters, no
  confetti, no badges, no countdown theatre — a plain "Ready" on the sheet, three quiet beats,
  then the first prompt. Feedback is a pencil tick or a red-pencil cross and the right answer
  pencilled in. Respects the jelly-motion and arc settings; the route is native-material.
- **Explicit machine** (`{initial, step}`, like `session.ts`): `ready → countdown → asking →
  feedback → (asking …) → complete → saving/saved/failed/signed-out`, plus `retry`. Stale
  answers ignored; one `complete` per run; note-offs ignored; a prompt cannot be answered
  before it is drawn (guards against a held key from the previous prompt).

## Tasks

### S1 — Sprint maths and generators (pure)
`lib/rmhmusic/learn/sprint/{levels,generate,scoring}.ts`: level table; seeded prompt
generators for single notes, accidentals, triads/inversions, bars (all inside the clef's
ledger-line limit); `promptPoints(level, ms, correct)`; run summary. Tests first.

Also in S1: `dailySeed(dateUtc: string): number` and `dailyRun(dateUtc)` returning the fixed
level list and prompts (deterministic; same date ⇒ same prompts; tests pin a known date), plus a
`utcDate(now)` helper that is the only place the "day" is decided (server and client both use it;
the server's date is authoritative when saving).

### S2 — The sprint machine (pure)
`lib/rmhmusic/learn/sprint/machine.ts`: the states above; chord window collection; bar
sequencing (per-note time, wrong note ends the prompt); input-source rules. Tests first,
including held-key-from-previous-prompt, double events, chord split across the window, bar
wrong-then-right.

### S3 — Staff rendering for more than one note
Extend `StaffCard` (+ `staff-card-layout.ts`) for accidentals, stacked chord noteheads
(second-interval offsets), and a bar of sequential notes with a "now" mark. Keep `direction="ltr"`
on all text; no layout change between prompts (fixed-height sheet per level).

### S4 — The game screen and route
`components/rmhmusic/learn/sprint/*`, `app/routes/rmhmusic/sprint.tsx` (auth-gated like practice,
excluded from the sitemap as `personal`), skeleton equal to loaded height, level picker as
plain text rows, results sentence. i18n keys via `t()`; no JSX comment before `t()`.

### S5 — Persistence
Prisma models for per-level freeplay bests and per-user-per-date daily results (unique
(userId, date); new migration), `sprint.server.ts`, `defineHandler` API route with zod, rate limit
`write`. The server recomputes the date and rejects a second scored daily result (idempotent: a
retried POST returns the stored one). Save lifecycle as lessons. Daily streak per S-decision above.

### S6 — Verification and ship
Full browser matrix once (Chromium 320/390/1280 × light/dark, 200% text, RTL, Firefox/WebKit
smoke), a real-MIDI-shaped fake (events with timestamps) through the hub, keyboard-only,
signed-out/failed save, then PR, CI green, squash-merge.

## Open questions for the owner (do not block S1–S3)
- Leaderboard or friends' scores later (phase 6 social)? A daily challenge invites it.
- Daily reset at UTC midnight is simplest; per-user local midnight is friendlier but breaks "the same for everyone". Default: UTC, with the next-reset time shown in local time.
- Should bars be sight-reading *rhythm* too (durations), or pitch only for now? (Default: pitch only; rhythm joins when Task 11's rhythm scoring lands.)
