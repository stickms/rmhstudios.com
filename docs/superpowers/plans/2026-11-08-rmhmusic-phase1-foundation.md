# RMH Music Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the learning programme's foundation — pitch/note maths, pluggable mic/MIDI/keyboard/on-screen input, progress persistence, a new `/rmhmusic` home — and retire the old Spotify listening-party app.

**Architecture:** Pure, client-safe engines in `lib/rmhmusic/learn/` (notes, YIN pitch detector, `NoteEvent` input adapters fanned into one hub); server-only progress in `*.server.ts` behind `defineHandler` routes; UI in `components/rmhmusic/learn/` on the existing `rmhmusic-theme`. Delivered as three PRs so every merge to `main` (which deploys) is safe.

**Tech Stack:** TanStack Start, React 19, Zustand, Prisma 7, zod, vitest, Web Audio / Web MIDI, `tone` (already installed, not needed until Phase 2).

**Spec:** `docs/superpowers/specs/2026-11-08-rmhmusic-learning-design.md` (read it first, and `CLAUDE.md`, `lib/CLAUDE.md`, `components/CLAUDE.md`).

## PR plan

| PR | Tasks | Nature |
|----|-------|--------|
| A | 1–5 | Additive libs + `midi=(self)` header. No user-visible change. |
| B | 6 | Additive Prisma tables + migration + API routes. |
| C | 7–11, 13–16, 12 | New home UI, old app retired, docs/catalog, redesign, art, state machines + performance, cross-browser verification. The switch. |

**Execution order for PR C (owner directives of 2026-11-08 added Tasks 13–16):** 7, 8, 9 (done) → 10 → 11 → 15 → 13 → 14 → 16 → 12. Tasks 13–16 each run alone (shared working tree; the commit gate reads it).

Branch is always `claude/hopeful-bohr-99d1vw`. After a PR merges: `git fetch origin main && git checkout -B claude/hopeful-bohr-99d1vw origin/main` and start the next.

## Global Constraints

- Route stays `/rmhmusic`, catalog id `rmhmusic`, auth-gated, `app-theme rmhmusic-theme`; read `--app-*` tokens only in new markup. **Look (owner, 2026-11-08, supersedes "keep the existing look"): music-inspired notebook-paper / staff-paper scheme with a light paper mode and a dark night-manuscript mode (Task 13).**
- All user-facing strings via `t('key', { defaultValue })` in namespace `c-rmhmusic`; **new keys only** (never edit an existing key's wording); run `pnpm i18n:extract`; no `{/* */}` comment directly before a `t()` call.
- All audio through `getAudioContext()` from `@/lib/shared/platform`; never `new AudioContext()`.
- **No new `requestAnimationFrame` loops** (`lib/__tests__/raf-loop-allowlist.test.ts` gate) — poll the mic analyser with a timer.
- Server-only code in `*.server.ts`; API routes only via `defineHandler`; zod-validate input.
- Mobile first: usable at 360px wide, tap targets ≥44px, `.app-page`/`.app-screen` viewport primitives, safe-area insets (components/CLAUDE.md "Full-screen games/apps").
- Tests: colocated `*.test.ts`, only for pure non-obvious logic (docs/testing.md scope). Run `pnpm exec vitest run <path>`.
- Old Prisma tables (`RmhMusic*`, `MusicGuess*`) are **NOT dropped or altered**; existing achievements definitions are left untouched. (Phase 1 only: the owner approved the drop on 2026-11-09 — `prisma/migrations/20261109120000_drop_rmhmusic_legacy`.)
- Toolchain: run every command with `PATH=/opt/node24/bin:$PATH` (the repo needs Node ≥24.18; the default `node` is v22). Dependencies are already installed.
- Every commit passes `pnpm check:consistency` (a failing gate is fixed, never bypassed). Commit messages end with the two attribution trailer lines from the session reminder.

## Review Focus

1. Mic permission denied / no input device / suspended AudioContext (iOS) → clear message, setup falls back to on-screen keys; never a blank or crashed screen. (Task 4 hub state, Task 9)
2. Web MIDI absent (iOS Safari), no devices, or device unplugged mid-session → feature-detected, message shown, hub keeps working. (Task 4, Task 9)
3. Silence and background noise yield no note (detector returns `null`), never phantom notes. (Task 2, Task 4 segmenter)
4. Low guitar notes (E2 82.41 Hz) and harmonic-rich tones are not octave-misread. (Task 2)
5. Re-POSTing a completed lesson must not farm XP; unknown lesson ids, out-of-range stars and signed-out callers are rejected. (Task 6)
6. Old bookmarks (`/rmhmusic/<roomId>`, `/rmhmusic/player`) redirect to `/rmhmusic` instead of 404; gifting Mixtape search and Playlists keep working after the Spotify route is removed. (Task 10)

---

## PR A

### Task 1: Note maths

**Files:**
- Create: `lib/rmhmusic/learn/pitch/notes.ts`
- Test: `lib/rmhmusic/learn/pitch/notes.test.ts`

**Interfaces:**
- Produces: `freqToMidi(freq: number): number` (fractional, A4=440→69); `midiToFreq(midi: number): number`; `midiToName(midi: number, opts?: { flats?: boolean }): string` (60→`'C4'`); `nameToMidi(name: string): number | null` (accepts `#`/`b`); `nearestNote(freq: number): { midi: number; name: string; cents: number }` (cents in [-50, 50]); `centsBetween(freqA: number, freqB: number): number`.

- [ ] **Step 1: Write failing tests** asserting: `freqToMidi(440)===69`; `midiToFreq(69)===440`; `midiToName(60)==='C4'`, `midiToName(61,{flats:true})==='Db4'`; `nameToMidi('Db4')===61`, `nameToMidi('H9')===null`; `nearestNote(82.41)` → name `'E2'`, `|cents|<1`; `nearestNote(450)` → `'A4'`, cents ≈ 38.9 (±0.1); `centsBetween(440, 880)===1200`.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/rmhmusic/learn/pitch/notes.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the six functions with the standard equal-temperament formulas.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(rmhmusic): note and pitch maths`.

### Task 2: YIN pitch detector

**Files:**
- Create: `lib/rmhmusic/learn/pitch/yin.ts`
- Test: `lib/rmhmusic/learn/pitch/yin.test.ts`

**Interfaces:**
- Produces: `interface PitchResult { freq: number; clarity: number }` (clarity 0..1); `detectPitch(buf: Float32Array, sampleRate: number, opts?: { minFreq?: number; maxFreq?: number; threshold?: number; minRms?: number }): PitchResult | null`. Defaults: `minFreq 60`, `maxFreq 1400`, `threshold 0.15`, `minRms 0.01`.

- [ ] **Step 1: Write failing tests** using synthetic buffers (sampleRate 44100, length 2048, helper `sine(freq, amp)`): detects 82.41, 220, 440, 1046.5 Hz each within 5 cents (use `centsBetween`); a harmonic-rich tone (fundamental 110 Hz plus 2nd at 0.8× and 3rd at 0.6× amplitude) returns ≈110 Hz not 220/330; all-zero buffer → `null`; seeded pseudo-random noise at amplitude 0.3 → `null`; a sine at amplitude 0.005 (below `minRms`) → `null`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** YIN (difference function → cumulative mean normalised difference → first dip below `threshold` → parabolic interpolation); reject when RMS < `minRms` or no dip; clarity = `1 - d'(tau)`. Restrict tau to `[sampleRate/maxFreq, sampleRate/minFreq]`; if the buffer is shorter than 2×tauMax return `null`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(rmhmusic): YIN pitch detector`.

### Task 3: Input events, MIDI parsing, keyboard map

**Files:**
- Create: `lib/rmhmusic/learn/input/events.ts`, `midi-parse.ts`, `keyboard-map.ts`
- Test: `lib/rmhmusic/learn/input/midi-parse.test.ts`, `keyboard-map.test.ts`

**Interfaces:**
- Produces (events.ts): `type InputSource = 'mic'|'midi'|'keys'|'screen'`; `interface NoteEvent { type: 'on'|'off'; midi: number; velocity: number /*0..1*/; time: number /*ms, performance.now clock*/; source: InputSource; cents?: number }`; `type NoteListener = (e: NoteEvent) => void`; `interface InputAdapter { readonly source: InputSource; start(): Promise<void>; stop(): void; subscribe(l: NoteListener): () => void }`.
- Produces (midi-parse.ts): `parseMidiMessage(data: ArrayLike<number>, time: number): NoteEvent | null` (source `'midi'`).
- Produces (keyboard-map.ts): `keyToMidi(code: string, octaveShift?: number): number | null` using `KeyboardEvent.code`; home row `KeyA..KeyK` = C4..C5 white keys layout (`A W S E D F T G Y H U J K` = 60..72).

- [ ] **Step 1: Write failing tests**: `[0x90,60,127]`→on, midi 60, velocity 1; `[0x90,60,0]`→off; `[0x80,60,64]`→off; `[0x91,61,64]` (channel 2)→on 61; `[0xB0,64,127]`, `[0xF8]`, `[]`→`null`. `keyToMidi('KeyA')===60`, `'KeyW'===61`, `'KeyK'===72`, `'KeyQ'===null`, `('KeyA',1)===72`.
- [ ] **Step 2: Run** both files — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(rmhmusic): note event model, MIDI parsing, keyboard map`.

### Task 4: Input adapters and hub

**Files:**
- Create: `lib/rmhmusic/learn/input/mic-segmenter.ts`, `mic.ts`, `midi.ts`, `keyboard.ts`, `screen.ts`, `hub.ts`
- Test: `lib/rmhmusic/learn/input/mic-segmenter.test.ts`, `hub.test.ts`

**Interfaces:**
- Consumes: Task 1 `nearestNote`, Task 2 `detectPitch`, Task 3 types/`parseMidiMessage`/`keyToMidi`, `getAudioContext` from `@/lib/shared/platform`.
- Produces:
  - `createSegmenter(): { push(frame: { midi: number; cents: number } | null, time: number): NoteEvent[] }` — emits `on` after **3** consecutive frames of the same `midi`; emits `off` after **4** consecutive `null` frames; a *different* note only replaces the active one once it has itself been stable for 3 consecutive frames, at which point `off` (old) then `on` (new) are emitted together — a shorter blip of another note, or one stray frame, changes nothing and resets only the candidate count. Source `'mic'`, velocity 0.8.
  - `createMicInput(opts?: { onLevel?: (rms: number) => void }): InputAdapter` — `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`, analyser `fftSize 2048`, **`setInterval` 25 ms** (no rAF); `stop()` releases tracks and timer. `start()` rejects with `Error` whose `name` is `'NotAllowedError'`/`'NotFoundError'` preserved.
  - `isMidiSupported(): boolean`; `createMidiInput(): InputAdapter & { devices(): { id: string; name: string }[]; onDevicesChange(l: () => void): () => void }` — `requestMIDIAccess({ sysex: false })`, listens to `statechange`, re-binds inputs.
  - `createKeyboardInput(opts?: { octaveShift?: number }): InputAdapter` — window `keydown`/`keyup`; ignores `e.repeat`, modifier combos, and targets that are `input`/`textarea`/`select`/contenteditable.
  - `createScreenInput(): InputAdapter & { press(midi: number, velocity?: number): void; release(midi: number): void }`.
  - `createInputHub(adapters: InputAdapter[]): { subscribe(l: NoteListener): () => void; start(source: InputSource): Promise<void>; stop(source: InputSource): void; active(): InputSource[]; lastError(source: InputSource): Error | null }` — fan-in; `start` failure is recorded in `lastError` (and rethrown), other sources unaffected.

- [ ] **Step 1: Write failing tests**: segmenter — 2 frames of 60 emit nothing, 3rd emits one `on` 60; then 4 `null` frames emit one `off`; 60→62 change emits nothing for 2 frames of 62, then `off` 60 + `on` 62 on the 3rd; a single stray 61 frame between 60 frames emits nothing extra. Hub — with two fake adapters, listener gets events from both after `start`; `stop('mic')` stops only that adapter; a fake adapter whose `start` rejects sets `lastError` and does not affect the other.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** all six modules (browser adapters are not unit-tested; keep their logic thin and push decisions into the tested segmenter/parsers).
- [ ] **Step 4: Run** the two test files — expect PASS; `pnpm exec tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(rmhmusic): mic, MIDI, keyboard and on-screen input behind one hub`.

### Task 5: Permissions-Policy `midi`

**Files:**
- Modify: `deploy/apache/rmhstudios.conf:136`, `lib/__tests__/permissions-policy.test.ts`
- Modify (if it lists header features): `deploy/apache/README.md`

**Interfaces:** none.

- [ ] **Step 1:** Read `permissions-policy.test.ts`; extend its feature→call-pattern table so `requestMIDIAccess` requires `midi` in the header (mirror how `getUserMedia`→`microphone` is expressed). Run it — expect FAIL because Task 4 added a caller.
- [ ] **Step 2:** Add `midi=(self)` to the header string on line 136 (keep alphabetical/grouping style; no `*`).
- [ ] **Step 3: Run** `pnpm exec vitest run lib/__tests__/permissions-policy.test.ts` — expect PASS.
- [ ] **Step 4:** Add a one-line note in the PR description that the Apache vhost needs a reload on deploy (see `deploy/apache/README.md`).
- [ ] **Step 5: Commit** `fix(deploy): allow Web MIDI for our own origin`.

**PR A gate:** `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm check:consistency --base main`; push, open PR, wait for CI green, merge, reset branch.

---

## PR B

### Task 6: Progress persistence

**Files:**
- Modify: `prisma/schema.prisma` (add models + back-relations on `User`), create migration `prisma/migrations/<timestamp>_music_learn/migration.sql` via `pnpm db:migrate`
- Create: `lib/rmhmusic/learn/content/path.ts`, `lib/rmhmusic/learn/schemas.ts`, `lib/rmhmusic/learn/xp.ts`, `lib/rmhmusic/learn/progress.server.ts`, `app/routes/api/rmhmusic/learn/profile.ts`, `app/routes/api/rmhmusic/learn/lesson-complete.ts`
- Test: `lib/rmhmusic/learn/xp.test.ts`, `lib/rmhmusic/learn/content/path.test.ts`

**Interfaces:**
- Prisma: `MusicLearnProfile { id cuid, userId @unique → User (Cascade), instrument String @default("piano"), input String @default("screen"), latencyMs Int @default(0), dailyGoal Int @default(1), updatedAt }` `@@map("music_learn_profile")`; `MusicLearnLessonProgress { id cuid, userId → User (Cascade), lessonId String, stars Int @default(0), bestScore Int @default(0), completedAt DateTime?, updatedAt, @@unique([userId, lessonId]) }` `@@map("music_learn_lesson_progress")`.
- Produces (schemas.ts): `INSTRUMENTS = ['piano','guitar'] as const`; `INPUTS = ['screen','keys','midi','mic'] as const`; zod `profileSchema` (`instrument`, `input` enums, `latencyMs` int −500..500, `dailyGoal` int 1..10) and `lessonCompleteSchema` (`lessonId` string ≤64, `stars` int 0..3, `score` int 0..100).
- Produces (xp.ts): `xpForCompletion(prevStars: number, nextStars: number): number` = `10 × max(0, nextStars − prevStars)`.
- Produces (content/path.ts): `interface Lesson { id: string; unit: string; title: string; summary: string; mode: 'staff-flashcards'|'keyboard-map'|'fretboard'|'rhythm-basics'|'play-note'; available: boolean }`; `PATH: { id: string; title: string; lessons: Lesson[] }[]` — Unit 1 "Meet the staff & the keys" (lessons: what is a staff, treble clef notes, find middle C, keyboard layout / guitar strings & open notes, first note played); Unit 2 "Rhythm basics" (note values, 4/4 vs 3/4, tap the beat). **All lessons `available: false` in Phase 1 except `play-note` "First note played" (`available: true`).** Content holds ids + English default strings used as `defaultValue`s at render time. `getLesson(id): Lesson | undefined`; `isKnownLesson(id): boolean`.
- Produces (progress.server.ts): `getProfile(userId): Promise<Profile>` (defaults when none); `saveProfile(userId, input): Promise<Profile>`; `completeLesson(userId, input): Promise<{ stars: number; xpAwarded: number; progress: LessonProgressRow[] }>` — rejects unknown `lessonId` via `isKnownLesson`; calls `awardXp` (`lib/xp/engine.server.ts`) only when `xpAwarded > 0`, and `checkIn(userId)` (`lib/streak.server.ts`) on every completion; mirror how `app/routes/api/rmhstudy/*` calls them.
- Routes: `GET /api/rmhmusic/learn/profile` → `{ profile, progress }`; `PUT` same path (rateLimit `'write'`, body `profileSchema`); `POST /api/rmhmusic/learn/lesson-complete` (rateLimit `'write'`, body `lessonCompleteSchema`). All `defineHandler`, auth required.

- [ ] **Step 1: Write failing tests**: `xpForCompletion`: `(0,3)===30`, `(1,3)===20`, `(3,3)===0`, `(2,1)===0`, `(0,0)===0`; path: lesson ids unique across units and ≤64 chars, `isKnownLesson('nope')===false`, `isKnownLesson('<the play-note lesson id>')===true`, at least one lesson `available`, every unit has ≥1 lesson.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/rmhmusic/learn` — FAIL.
- [ ] **Step 3: Implement** `xp.ts`, schemas, Prisma models + migration (additive only), `progress.server.ts` (stars never decrease; `bestScore` is the max; XP computed from stored vs new stars), and the routes. Unknown `lessonId` → 400; signed out → 401 (handled by `defineHandler`).
- [ ] **Step 4: Run** the test — PASS; `pnpm exec prisma validate`; `pnpm exec tsc --noEmit`; `pnpm db:migrate` applies cleanly to a throwaway local Postgres if available (else state in the PR that it was only validated).
- [ ] **Step 5: Commit** `feat(rmhmusic): learner profile and lesson progress`.

**PR B gate:** same as PR A, plus `prisma-validate`/`prisma-migrate-status` CI checks green. Merge, reset branch.

---

## PR C

### Task 7: Learn store

**Files:**
- Create: `lib/rmhmusic/learn/store.ts`
- Test: none (thin client state over tested parts; verified through Tasks 8–9)

**Interfaces:**
- Consumes: Task 4 `createInputHub`/adapters, Task 6 schemas/routes and `PATH`.
- Produces (store.ts): Zustand `useLearnStore` — `{ profile, progress, hub, screen /*the createScreenInput() handle*/, status: 'idle'|'loading'|'ready'|'error', load(): Promise<void>, setInstrument(i), setInput(i), setLatency(ms), completeLesson(id, stars, score): Promise<void> }`; optimistic update then PUT/POST to the Task 6 routes; creates the hub once (`createInputHub([...])`) lazily on the client only.

- [ ] **Step 1: Implement** the store (optimistic updates, rollback + error status on failed requests; hub and `screen` created once, client-side only, never during SSR).
- [ ] **Step 2:** `tsc --noEmit` and `lint` clean.
- [ ] **Step 3: Commit** `feat(rmhmusic): learn store`.

### Task 8: New home and shell

**Files:**
- Create: `components/rmhmusic/learn/LearnHome.tsx`, `PathUnit.tsx`, `StreakChip.tsx`
- Modify: `app/routes/rmhmusic/index.tsx` (render `LearnHome`), `app/routes/rmhmusic.tsx` (keep auth gate + theme/styles; keep `appRouteHead('rmhmusic')`)

**Interfaces:**
- Consumes: `useLearnStore`, `PATH`, `getStreak`-backed data via an existing client hook (find how `RmhStudy`/header shows streak; reuse, don't add an API).
- Produces: `LearnHome` — header with back-to-builds link (keep the existing labelled exit and its `useBackOrFallback`), streak chip, instrument toggle (piano/guitar — reuse the app-tier segmented control RMHType/RMHStudy settings already use; read `components/shared/app-theme.css` and a sibling's settings UI first, and do not hand-roll one), the unit/lesson list (available lessons are links, unavailable show "Coming soon"). There is no input-setup button yet — Task 9 adds it.

- [ ] **Step 1:** Implement the screens as a `.app-page` document (scrolls the document on mobile), `--app-*` tokens only, `t()` strings in `c-rmhmusic`; keep `Visualizer`-style dark ground via existing `app-ground`.
- [ ] **Step 2:** Run `pnpm exec tsc --noEmit && pnpm lint` — clean, no new warnings.
- [ ] **Step 3:** Verify visually with the `run` skill: `pnpm dev`, load `/rmhmusic` signed in at **390×844** and **1280×800**; screenshot both (deviceScaleFactor 1); confirm no horizontal scroll and ≥44px targets.
- [ ] **Step 4: Commit** `feat(rmhmusic): learning home`.

### Task 9: Input setup, on-screen keyboard, first lesson

**Files:**
- Create: `components/rmhmusic/learn/InputSetup.tsx`, `OnScreenKeyboard.tsx`, `LatencyCalibration.tsx`, `FirstNoteLesson.tsx`, `app/routes/rmhmusic/lesson.$lessonId.tsx`

**Interfaces:**
- Consumes: `useLearnStore().hub`, `isMidiSupported`, `createScreenInput` handle (expose via store: `screen: ReturnType<typeof createScreenInput>`).
- Modify: `components/rmhmusic/learn/LearnHome.tsx` — add a "Set up input" button that opens `InputSetup` in a dialog (use `components/ui` Dialog primitives).
- Produces: `InputSetup` — choose Screen keys / Computer keys / MIDI controller / Microphone; MIDI row shows device list or "Not supported in this browser (iPhone/iPad Safari)"; mic row shows a live level bar and the detected note name + cents; permission/no-device errors from `hub.lastError` shown as plain messages with "Use on-screen keys instead". `LatencyCalibration` — plays 8 clicks via `getAudioContext()`; learner taps/plays along; stores the median offset (ms) via `setLatency`; skippable. `OnScreenKeyboard` — touch/pointer piano of 2 octaves C4–B5, `touch-action: none`, calls `screen.press/release`, labelled with note names. `FirstNoteLesson` — shows an instruction and completes (3 stars) on the first `on` event from any enabled input, then `completeLesson`.

- [ ] **Step 1:** Implement; hub subscriptions are cleaned up on unmount; mic/MIDI start only on explicit user click (user-gesture requirement on iOS).
- [ ] **Step 2:** `tsc` + `lint` clean.
- [ ] **Step 3:** Verify with Playwright at 390×844: on-screen keys press → lesson completes → home shows the lesson done; deny-permission path (stub `getUserMedia` to reject `NotAllowedError`) shows the message and falls back; `navigator.requestMIDIAccess` absent shows "not supported". Screenshot the setup screen.
- [ ] **Step 4: Commit** `feat(rmhmusic): input setup, on-screen keys and first lesson`.

### Task 10: Retire the old app

**Files — delete:** `components/rmhmusic/{ChatPanel,CommentsPanel,GuessPanel,MemberList,MiniPlayer,PlayerBar,RadioJoinCard,RadioPanel,RmhMusicLanding,RmhMusicPlayerPage,RoomBrowser,SearchPanel,SleepTimerButton,TrackCard,Visualizer}.tsx`; `app/routes/rmhmusic/player.tsx`; `app/routes/api/rmhmusic/{guess,track-comments.ts,spotify}`; `app/routes/_site/music-trivia.tsx`; `components/feed/MusicGuessColumn.tsx`; `lib/music-guess.server.ts`; `lib/rmhmusic/{events,socket,spotify-player,store,track-comments,track-comments.server,types,utils,volume,sleep-timer,color-extract,schemas}.ts` and `lib/rmhmusic/__tests__/`; `lib/__tests__/rmhmusic-{volume,sleep-timer}.test.ts`; `server/rmhmusic/`; `server/socket-server/handlers/rmhmusic.ts`.
**Modify:** `server/socket-server/index.ts` (remove import/registration/disconnect hook), `app/routes/_site.tsx:52` (MiniPlayer lazy mount), `app/routes/rmhmusic/$roomId.tsx` (becomes a redirect to `/rmhmusic`), `lib/presence.server.ts`, `lib/presence-types.ts`, `components/feed/FriendsOnlineWidget.tsx`, `components/spaces/SpaceRoom.tsx`, `lib/economy/flows.ts`, `lib/sitemap.ts`, `package.json` (socket-server watch glob), `scripts/perf/socket-bench.mjs`, `scripts/perf/server-routes.json`, `testing/e2e/fouc-routes.mjs`, `lib/media/media-session.ts` (comment), the allowlists/entries in `lib/__tests__/{design-consistency,fouc-contract,game-viewport-consistency,i18n-catalogs,presence-types,raf-loop-allowlist,realtime-auth,stacking-consistency}.test.ts` and `lib/shared/realtime/connect-race.test.ts`, `components/gifting/MixtapeEditor.tsx`, `components/feed/PlaylistsColumn.tsx`.
**Keep:** `lib/rmhmusic/constants.ts` trimmed to what `server/socket-server/handlers/studio-jam.ts` imports (`ROOM_CODE_ALPHABET`, plus `ROOM_CODE_LENGTH` if used); `components/rmhmusic/{rmhmusic.css,RmhMusicStyles.tsx}`; the Prisma schema; `go-services/**`; achievements catalog/icons/groups; `.env.example` Spotify block if anything still reads those vars.

**Interfaces:** none new.

- [ ] **Step 1: Grep first.** Run `grep -rn "rmhmusic\|MusicGuess\|music-guess\|music-trivia" --include=*.ts --include=*.tsx --include=*.mjs --include=*.json . --exclude-dir=node_modules --exclude-dir=locales --exclude-dir=docs` and save the list; every hit must be deleted, rewritten or consciously kept (state each kept one in the PR).
- [ ] **Step 2: Spotify search dependency.** Compare `app/routes/api/rmhmusic/spotify/search.ts` with the existing `/api/spotify/search`; repoint `MixtapeEditor.tsx` at the surviving endpoint (extend it if its response shape differs) so gifting mixtapes keep working. If `PlaylistsColumn` loses its only "add tracks" path, adjust the empty-state copy (new key) and flag it in the PR as DONE_WITH_CONCERNS — do not remove the Playlists feature.
- [ ] **Step 3: Redirects.** `app/routes/rmhmusic/$roomId.tsx` → `beforeLoad` throws `redirect({ to: '/rmhmusic' })`; confirm `/rmhmusic/player` also lands there. Spaces pinned music rooms: render no link for the old kind rather than a dead link.
- [ ] **Step 4: Delete and rewrite** per the lists above; remove entries from test allowlists in the same commit (they fail when stale).
- [ ] **Step 5: Locales.** `pnpm i18n:extract` then `pnpm i18n:resources`; confirm `locales/en/c-rmhmusic.json` contains the new keys and `pnpm i18n:coverage` is not worse than base. Machine translation is skipped (non-English falls back to English defaults); say so in the PR.
- [ ] **Step 6: Verify** `pnpm exec tsc --noEmit && pnpm lint && pnpm test` all green; `pnpm check:consistency --base main` green; `grep` from Step 1 shows only the intended survivors.
- [ ] **Step 7: Commit** `feat(rmhmusic)!: retire the Spotify listening-party app` — body explains tables and achievements are intentionally kept.

### Task 11: Catalog, docs, supersede notices

**Files:**
- Modify: `lib/catalog/apps/rmhmusic.ts` (description/longDescription/tags/cta/gradient kept; new copy: learn piano and guitar — flashcards, ear training, play-along, tuner; tags `['Music','Learning','Piano','Guitar','Beta']`), `data/site-knowledge.json`, `CLAUDE.md` / `AGENTS.md` / `README.md` / `lib/CLAUDE.md` / `server/CLAUDE.md` / `components/CLAUDE.md` mentions of the old Spotify app, `docs/site-reference/apps.md`, `docs/site-reference/api.md`, `docs/site-reference/pages.md`, `docs/rmhmusic/design.md` (add "Superseded by docs/superpowers/specs/2026-11-08-rmhmusic-learning-design.md" banner), `lib/assistant/assistant.server.ts` if its blurb describes the app.

- [ ] **Step 1:** Update each file so no live doc claims RMH Music is a Spotify listening-party app; leave historical plans/audits untouched.
- [ ] **Step 2:** `pnpm check:consistency` (generated-docs freshness included) green.
- [ ] **Step 3: Commit** `docs(rmhmusic): describe the learning programme`.

### Task 12: Ship PR C

- [ ] **Step 1:** Full gate: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm check:consistency --base main`; `pnpm build` once to confirm the server bundles still build after deleting `server/rmhmusic`.
- [ ] **Step 2:** Push, open the PR (mirror the repo PR template headings if present; state: old tables kept, achievements kept, translations pending, Apache reload needed from PR A), wait for CI green.
- [ ] **Step 3:** Merge; reset the branch to `origin/main`; write the Phase 2 plan.


---

## Addendum — owner directives of 2026-11-08 (Tasks 13–16)

Added mid-run by the owner: (1) "a full design and layout redesign … match the game card a bit more, with more animated backgrounds"; (2) "update the game card and banner to better reflect what rmh music is now"; (3) "a new aesthetic music-inspired design scheme (maybe like notebook paper/music staffs/notes/etc)"; (4) "allow for light/dark mode"; (5) "ensure mobile friendliness … support for all major browsers, resolutions … utmost performance and optimization, and look for implicit state machines". Every review finding so far in the input hub, mic adapter, store and lesson screen was an implicit state machine (booleans/counters/maps encoding a lifecycle); Task 15 removes that class of bug.

### Task 15: Explicit state machines and a performance pass (logic layer)

**Files:**
- Create: `lib/rmhmusic/learn/machines/*.ts` (+ colocated `*.test.ts`), one file per machine
- Modify: whatever the audit finds in `lib/rmhmusic/learn/**` and `components/rmhmusic/learn/**` (hub, mic/midi adapters, store, `useLearnInput`, `InputSetup`, `LatencyCalibration`, `FirstNoteLesson`, `LessonScreen`)

**Interfaces:**
- Produces: for each machine a typed `State` union discriminated by `kind`, a typed `Event` union, and a pure exhaustive `transition(state, event): State` (plus, where useful, `effects(prev, next): Effect[]` so side effects stay at the edges). No new dependency (no xstate). Look first for repo precedent (`grep -rn "Machine" components lib | head`, e.g. `handOffMachine` in `components/radial/RadialHub.tsx`) and match it.

- [ ] **Step 1: Audit.** Write `.superpowers`-free notes in the PR description (not a file): list every place where two or more booleans/flags/counters/maps jointly encode a lifecycle — at minimum: hub per-source start/stop/cancel (`starting`, `cancelled`, `started`, stop counters, `errors`); mic/midi adapter `running`/pending/`generation`; store `status`/`error`/`writes`/`queue`/`confirmed`/`loading`; `useLearnInput` start/stop paths; `InputSetup` per-source connection states; `LatencyCalibration` idle/starting/running/done/failed; `FirstNoteLesson` played/saving/saved/failed and the once-guard; `LessonScreen` phases; dialog open/close vs input state.
- [ ] **Step 2: Machines.** Replace each with an explicit machine (impossible states unrepresentable: e.g. `{kind:'starting', cancelRequested:boolean}` instead of two maps). Unit-test every machine with a transition table: each (state, event) pair asserts the next state; add the previously found bugs as named regression cases (stop-start-stop leaves nothing live; a stop during a pending start releases the mic; two note events in one tick complete once; a failed save then Retry completes once; overlapping profile writes serialise and the last intent wins; a `ready` store never refetches; a hidden tab stops the mic and never restarts it).
- [ ] **Step 3: Behaviour preserved.** All existing tests in `lib/rmhmusic/learn/**` pass unchanged or are replaced by equivalent transition-table cases; none deleted without a replacement.
- [ ] **Step 4: Performance — measure first, then optimise, and report numbers.** (a) Pitch detection: measure `detectPitch` per call and CPU share at the 25 ms cadence; reduce cost (decimate the buffer to ~11 kHz before detection, bounded by `maxFreq` 1400 Hz, keeping the existing accuracy tests passing; consider moving detection to an AudioWorklet or Worker only if main-thread cost is still material, and justify). (b) Render pressure: a note event or the level meter must not re-render the whole screen — use store selectors / memo / throttling where measurement shows churn. (c) Bundles: `pnpm build` is too heavy for the sandbox; instead measure with `pnpm exec vite build` only if memory allows, otherwise reason from imports: the lesson and setup screens are lazy chunks, nothing imports Tone.js, no `.server` code in client chunks. (d) Idle CPU: with the mic off and no interaction there is no timer, loop or listener running. (e) Core Web Vitals proxy for `/rmhmusic` and the lesson route in Chromium via Playwright (LCP, CLS, long tasks) using the throwaway harness approach; record before/after.
- [ ] **Step 4b:** the store's skeleton→ready transition and any state-machine refactor must not change first-paint markup or cause a layout shift.
- [ ] **Step 5:** gates green (`pnpm exec vitest run lib/rmhmusic lib/__tests__/raf-loop-allowlist.test.ts`, `docs:site:check`, `docs:api:check`), commit(s) `refactor(rmhmusic): explicit state machines` / `perf(rmhmusic): …`.

### Task 13: Notebook-paper theme (light and dark), layout redesign, animated backdrop

**Files:**
- Modify: `components/rmhmusic/rmhmusic.css` (palette), `components/rmhmusic/learn/{LearnHome,PathUnit,StreakChip,InputSetup,LessonScreen,OnScreenKeyboard,LatencyCalibration,FirstNoteLesson}.tsx`, `app/routes/rmhmusic.tsx` (mode attribute + pre-paint)
- Create: `lib/rmhmusic/learn/backdrop/*.ts` (pure staff-and-notes scene renderer + tests), `components/rmhmusic/learn/PaperBackdrop.tsx` (canvas host), `lib/rmhmusic/learn/mode.ts` (+ test), `components/rmhmusic/learn/ModeToggle.tsx`, `components/rmhmusic/learn/LiveStaff.tsx`
- Modify: `lib/__tests__/raf-loop-allowlist.test.ts` (entry for the backdrop host with its stop conditions)

**Interfaces:**
- Produces: `type Mode = 'light' | 'dark'`; `resolveMode(stored: string | null, prefersDark: boolean): Mode`; a persisted, user-togglable mode that defaults to `prefers-color-scheme` and never flashes the wrong palette (set before first paint; no hydration mismatch — follow `lib/__tests__/fouc-contract.test.ts` and how RMHType/RMHStudy persist their theme; all storage access in try/catch).

- [ ] **Step 1: Direction.** Notebook / staff paper: cream ruled paper with a red-pencil-style margin rule, navy fountain-pen ink, one pen-ink accent; staves, noteheads, clefs and handwritten-feeling annotations as decoration. Dark mode is a "night manuscript": deep ink-navy paper with pale ink and the same accent family. Define BOTH palettes as `--app-*` tokens in `rmhmusic.css` (light default, dark under the mode attribute and via `prefers-color-scheme` when no choice is stored); every text/background pair ≥ 4.5:1 (verify numerically and note the ratios in the PR), focus ring ≥ 3:1; drop the old `--site-*` compatibility aliases if nothing needs them.
- [ ] **Step 2: Layout.** Match the app's catalog card: a hero that reuses the card's banner art and wordmark (`/images/games/banners/rmhmusic.webp`, `/images/games/logos/rmhmusic.webp` through the repo's image component so variants are used), the instrument toggle and streak beside it, then the path as notebook pages (each unit a page with a staff-lined header; lessons as ruled lines with notehead markers; stars as noteheads). Mobile first (360–390 px) and graceful at tablet/desktop widths up to ultrawide; the page scrolls as a document.
- [ ] **Step 3: Phone keyboard.** The on-screen keyboard fits the viewport width on phones (about 1.5 octaves with white keys ≥ 44 px wide and black keys ≥ 24 px), with octave-shift buttons and swipe-to-shift; no scrollbar-only access; chords (multi-touch) still work; desktop keeps two octaves.
- [ ] **Step 4: Live staff.** `LiveStaff`: a small treble-clef staff (SVG) that shows the note just played at its pitch with ledger lines and the note name — the first step towards reading music; used in the first lesson and the setup preview.
- [ ] **Step 5: Animated backdrop.** A canvas of staves with slowly drifting notes that lightly reacts to played notes, following the Kowloon `MenuBackdrop` precedent: pure renderer in `lib/`, fixed-size buffer (never reallocated per frame), `requestAnimationFrame` only while the host is mounted AND the tab is visible AND jelly motion is not 'still' (`jellyMotionLevel` / `data-jelly-motion`), 30 fps (15 fps on the low graphics tier), a CSS paper fallback underneath until the first frame, one frame then stop when still, nothing flashes (WCAG 2.3.1) and nothing moves faster than a slow drift (2.2.2), works in both modes. Add the allowlist entry with the reason.
- [ ] **Step 5b: No flash, no shift (owner, 2026-11-08).** (a) The mode and every palette token are correct in the server-rendered HTML and before first paint — no flash of the wrong mode, no hydration mismatch (pre-paint attribute/script pattern plus `color-scheme`). (b) The paper ground is painted by CSS before any JS; the canvas backdrop is progressive enhancement over a CSS fallback with identical colours. (c) Hero banner and logo reserve their size (intrinsic width/height or aspect-ratio), go through the repo's image component (variants, placeholder), above-the-fold ones eager/priority; no swap-in jump. (d) Fonts: use fonts the app already loads or preload them; any new web font needs a metrics-matched fallback (`size-adjust`) — no FOUT reflow. (e) The skeleton equals the loaded layout (Task 8 made this true; keep it true after the redesign and measure skeleton vs loaded document height at 360/390/768/1280). (f) Streak chip, instrument toggle, N-of-M line, keyboard and octave controls reserve their size. (g) Signed-out visitors: `/rmhmusic` and `/rmhmusic/lesson/*` redirect server-side (`beforeLoad` `redirect` → HTTP redirect, no client flash of app chrome) to `/login` with a `callbackURL` that returns to the same page; after sign-in the return has no flash. Run the repo's own tooling (`lib/__tests__/fouc-contract.test.ts`, `testing/e2e/fouc-routes.mjs`, method in `docs/fouc-audit-2026-10-06.md`) and extend the fixtures for the new routes.
- [ ] **Step 6:** keep every behaviour and test from Tasks 8–9 and 15; gates green (design-consistency, game-viewport, ios-edge, fouc-contract, raf allowlist, i18n); new strings via `t()` with new keys only; commits `feat(rmhmusic): notebook-paper theme in light and dark` etc.

### Task 14: New RMH Music card, banner, logo and icon art

**Files:**
- Replace (same paths, same format and aspect ratio as today): `public/images/games/rmhmusic.webp` (card, 2:3), `public/images/games/banners/rmhmusic.webp` (banner, 3:1), `public/images/games/logos/rmhmusic.webp` (wordmark, transparent), `public/images/games/icons/rmhmusic.webp`
- Modify: `lib/images/variants.gen.ts` (regenerate: `pnpm images:variants`), `lib/catalog/apps/rmhmusic.ts` (copy/tags/gradient if the new art needs them)

**Interfaces:** none.

- [ ] **Step 1:** Look at the current assets first (convert to PNG with sharp to view). They advertise the retired Spotify app (a headphone-wearing man, a player bar, "Listen to Spotify together", "SHARED QUEUES · ROOM CHAT · GUESS THE SONG") and must be replaced.
- [ ] **Step 2:** Render new art from code (HTML/SVG in the preinstalled Chromium via Playwright → screenshot → sharp → webp), in the Task 13 notebook-paper look: cream notebook paper, a staff with noteheads and a treble clef, a piano keyboard strip and a guitar fretboard/chord box, handwritten-style annotations, the script "RMH Music" wordmark (redrawn or kept, must stay legible on both light and dark cards), and a short tagline such as "Learn piano & guitar". No Spotify, no headphones, no player UI. Work at 2× then export at the existing pixel dimensions (read the current files' dimensions first; keep file size in the same ballpark, ≤ 600 KB for the card and banner).
- [ ] **Step 3:** View each result as an image before committing; check the card on the apps page's crop (card is cropped differently from the banner), contrast of any text over paper, and that the logo has a transparent background.
- [ ] **Step 4:** `pnpm images:variants` then `pnpm images:variants:check`; update the catalog copy to describe the new product (learn piano and guitar: reading, ear training, tuner, play-along, MIDI/mic input; remove Spotify/listening-room wording; tags `['Music','Learning','Piano','Guitar','Beta']`); run `pnpm docs:site:check`, `pnpm docs:api:check`; commit `feat(rmhmusic): new card, banner and logo for the learning app`.

### Task 16: Cross-browser, resolution and mobile verification

**Files:** fixes only, wherever the matrix finds problems; a short results table goes in the PR description (not a file).

**Interfaces:** none.

- [ ] **Step 1: Engines.** Use the preinstalled Chromium plus Firefox and WebKit: download them with the CLI of the SAME preinstalled Playwright (do not install another Playwright version; see the environment notes) into its browsers path. If the network or system libraries block a download, report exactly what failed and test what is possible.
- [ ] **Step 2: Matrix.** Chromium × Firefox × WebKit; viewports 320×568, 360×640, 390×844, 412×915, 768×1024, 1024×768, 844×390 (landscape phone), 1280×800, 1920×1080, 2560×1440; touch emulation on the phone sizes; light and dark; RTL (`ar`); jelly motion still; 200% text zoom. For the home, setup dialog, calibration, first lesson (before/after completion) check: no horizontal page scroll, no clipped or overlapping text, white keys ≥ 44 px / black ≥ 24 px, safe-area insets, focus ring visible, backdrop animates and stops when still/hidden, no console errors.
- [ ] **Step 3: Fallbacks.** WebKit and iOS have no Web MIDI → the row says so; denied microphone; suspended AudioContext; no `getUserMedia`; `localStorage` unavailable (mode toggle still works for the session); reduced GPU (canvas fallback).
- [ ] **Step 4: Targets.** Compare the CSS/JS features the new screens use (`color-mix`, `:has`, `@starting-style`, `dvh`/`svh`, container queries, `structuredClone`, `AbortSignal.any`, pointer events, `OffscreenCanvas`) against the repo's browserslist / Vite build target and the last two major versions of Chrome, Firefox and Safari; add a fallback or avoid the feature where it is unsupported.
- [ ] **Step 4b: Flash and shift (owner, 2026-11-08).** For `/rmhmusic` and the lesson route on every engine × viewport cell: cumulative layout shift (a `layout-shift` PerformanceObserver) must be 0.00 signed in with a cold and a warm store, and for a signed-out visit (the server redirect to `/login` and the return after sign-in); capture first-paint versus hydrated screenshots and diff them to prove no FOUC; load once with JavaScript disabled and confirm the server-rendered HTML paints the paper ground, hero and skeleton correctly (nothing unstyled); repeat under CDP network and CPU throttling (slow 3G, 4× CPU) and confirm no reflow; in both light and dark and with a stored and an unstored mode preference. Fix every finding.
- [ ] **Step 5:** Fix what is found (commit per fix) and re-run the affected cells; list in the PR which cells passed, which failed and were fixed, and which could not be tested.

### Task 17: Delete the compatibility shims and dead config for the removed app

Owner directive (2026-11-08): "No need for backwards compatibility or anything, removed features or routes can be deleted."

**Files:** whatever each step below names.

**Interfaces:** none.

- [ ] **Step 1: Redirect shims.** Delete `app/routes/rmhmusic/$roomId.tsx` and `app/routes/_site/music-trivia.tsx` (old URLs simply 404 now). Regenerate `app/routeTree.gen.ts` with the repo's generator (additions/removals only, Register block intact), remove their entries from `lib/sitemap.ts`, `lib/__tests__/fouc-contract.test.ts` and `testing/e2e/fouc-routes.mjs`, regenerate `docs/site-reference/*` (`pnpm docs:site`). Confirm `/rmhmusic/lesson/$lessonId` and `/rmhmusic` still resolve.
- [ ] **Step 2: Spaces.** Remove the legacy `music_room` pin kind everywhere (types, validation, `SpaceRoom` label-only rendering, API, socket rehydrate path and the comments about it). Database rows are not touched.
- [ ] **Step 3: Music playlists.** If `kind: 'music'` playlists existed only for the removed app (check `Playlist`/`PlaylistItem` usage, the Library "Create" button, `PlaylistsColumn` copy and the `playlists-empty-desc-rmhtube` key from Task 10), remove the ability to create them and the UI that mentions them; keep the database enum. Report what you found and decided.
- [ ] **Step 4: Constants.** Move `ROOM_CODE_ALPHABET` (and `ROOM_CODE_LENGTH` if used) from `lib/rmhmusic/constants.ts` into studio-jam's own library next to its handler's other code, update the import in `server/socket-server/handlers/studio-jam.ts`, delete `lib/rmhmusic/constants.ts`.
- [ ] **Step 5: Locale keys.** Prune the dead `c-rmhmusic` keys: run `pnpm i18n:extract`, keep ONLY the changes to `locales/*/c-rmhmusic.json` (revert every other locale file it rewrites), and apply the same prune to `locales/*/.sources.c-rmhmusic.json` if those files track keys; verify `lib/__tests__/i18n-catalogs.test.ts` and `i18n-default-drift.test.ts`.
- [ ] **Step 6: Spotify config.** In `deploy/apache/rmhstudios.conf` remove the CSP hosts that only the removed Spotify Web Playback needed (keep `open.spotify.com` in `frame-src` if `ProfileSongEmbed` embeds it; keep whatever else still uses Spotify — check `grep -rn -i spotify app components lib server`), fix the comments; keep `.env.example` Spotify variables if `/api/spotify/search` still reads them. Note in the PR that the Apache vhost needs a reload.
- [ ] **Step 7: Achievements.** Delete the definitions, icons and group entries for `game.rmhmusic.host_room` and `game.first_music_guess` ONLY if the achievements code handles unknown ids in existing user rows safely (read `lib/achievements/*` and how earned rows are rendered/counted); otherwise keep them and say why.
- [ ] **Step 8: Go.** Remove the `RmhMusicRoom` struct in `go-services/pkg/db/models.go` and the RMHmusic strings in `go-services/cmd/status` / `internal/status` (and their tests) ONLY if a Go toolchain is available to run `go build ./... && go vet ./... && go test ./...` in `go-services` (check `which go`; Bazel files need `make gazelle` only when files are added/removed, not here); otherwise leave Go untouched and report it.
- [ ] **Step 9: Retired docs.** Delete `docs/rmhmusic/` (the retired Spotify design), `docs/plans/2026-03-02-rmhmusic.md`, and `docs/go-migration/sections/11-rmhmusic.html` plus its entry in `docs/go-migration/build/sections.json` ONLY if the Sphinx/docs build config tolerates it (read `docs/index.md`, `docs/conf.py` or the docs workflow); update `docs/index.md` and `docs/README.md` globs/rows accordingly. Leave dated audits and runbooks alone.
- [ ] **Step 10: NOT in this task.** Do not drop database tables or touch `prisma/schema.prisma`/migrations (needs the owner's explicit confirmation).
- [ ] **Step 11:** gates green (`pnpm docs:site:check`, `pnpm docs:api:check`, the sitemap/fouc/i18n/design/raf tests that your deletions touch, `lib/__tests__/test-discovery.test.ts`); commits `chore(rmhmusic): delete the compatibility shims for the retired app`, etc.
