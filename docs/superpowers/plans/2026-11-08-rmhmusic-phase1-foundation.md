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
| C | 7–11 | New home UI, old app retired, docs/catalog. The switch. |

Branch is always `claude/hopeful-bohr-99d1vw`. After a PR merges: `git fetch origin main && git checkout -B claude/hopeful-bohr-99d1vw origin/main` and start the next.

## Global Constraints

- Route stays `/rmhmusic`, catalog id `rmhmusic`, auth-gated, `app-theme rmhmusic-theme`, violet accent `--app-accent` on near-black; read `--app-*` tokens only in new markup.
- All user-facing strings via `t('key', { defaultValue })` in namespace `c-rmhmusic`; **new keys only** (never edit an existing key's wording); run `pnpm i18n:extract`; no `{/* */}` comment directly before a `t()` call.
- All audio through `getAudioContext()` from `@/lib/shared/platform`; never `new AudioContext()`.
- **No new `requestAnimationFrame` loops** (`lib/__tests__/raf-loop-allowlist.test.ts` gate) — poll the mic analyser with a timer.
- Server-only code in `*.server.ts`; API routes only via `defineHandler`; zod-validate input.
- Mobile first: usable at 360px wide, tap targets ≥44px, `.app-page`/`.app-screen` viewport primitives, safe-area insets (components/CLAUDE.md "Full-screen games/apps").
- Tests: colocated `*.test.ts`, only for pure non-obvious logic (docs/testing.md scope). Run `pnpm exec vitest run <path>`.
- Old Prisma tables (`RmhMusic*`, `MusicGuess*`) are **NOT dropped or altered**; existing achievements definitions are left untouched.
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
  - `createSegmenter(): { push(frame: { midi: number; cents: number } | null, time: number): NoteEvent[] }` — emits `on` after **3** consecutive frames of the same `midi`, `off` after **4** consecutive `null` frames or when the note changes (off then new on after 3 stable frames). Source `'mic'`, velocity 0.8.
  - `createMicInput(opts?: { onLevel?: (rms: number) => void }): InputAdapter` — `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`, analyser `fftSize 2048`, **`setInterval` 25 ms** (no rAF); `stop()` releases tracks and timer. `start()` rejects with `Error` whose `name` is `'NotAllowedError'`/`'NotFoundError'` preserved.
  - `isMidiSupported(): boolean`; `createMidiInput(): InputAdapter & { devices(): { id: string; name: string }[]; onDevicesChange(l: () => void): () => void }` — `requestMIDIAccess({ sysex: false })`, listens to `statechange`, re-binds inputs.
  - `createKeyboardInput(opts?: { octaveShift?: number }): InputAdapter` — window `keydown`/`keyup`; ignores `e.repeat`, modifier combos, and targets that are `input`/`textarea`/`select`/contenteditable.
  - `createScreenInput(): InputAdapter & { press(midi: number, velocity?: number): void; release(midi: number): void }`.
  - `createInputHub(adapters: InputAdapter[]): { subscribe(l: NoteListener): () => void; start(source: InputSource): Promise<void>; stop(source: InputSource): void; active(): InputSource[]; lastError(source: InputSource): Error | null }` — fan-in; `start` failure is recorded in `lastError` (and rethrown), other sources unaffected.

- [ ] **Step 1: Write failing tests**: segmenter — 2 frames of 60 emit nothing, 3rd emits one `on` 60; then 4 `null` frames emit one `off`; 60→62 change emits `off` 60 then (after 3 frames) `on` 62; a single stray 61 frame between 60 frames emits nothing extra. Hub — with two fake adapters, listener gets events from both after `start`; `stop('mic')` stops only that adapter; a fake adapter whose `start` rejects sets `lastError` and does not affect the other.
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
- Create: `lib/rmhmusic/learn/schemas.ts`, `lib/rmhmusic/learn/xp.ts`, `lib/rmhmusic/learn/progress.server.ts`, `app/routes/api/rmhmusic/learn/profile.ts`, `app/routes/api/rmhmusic/learn/lesson-complete.ts`
- Test: `lib/rmhmusic/learn/xp.test.ts`

**Interfaces:**
- Prisma: `MusicLearnProfile { id cuid, userId @unique → User (Cascade), instrument String @default("piano"), input String @default("screen"), latencyMs Int @default(0), dailyGoal Int @default(1), updatedAt }` `@@map("music_learn_profile")`; `MusicLearnLessonProgress { id cuid, userId → User (Cascade), lessonId String, stars Int @default(0), bestScore Int @default(0), completedAt DateTime?, updatedAt, @@unique([userId, lessonId]) }` `@@map("music_learn_lesson_progress")`.
- Produces (schemas.ts): `INSTRUMENTS = ['piano','guitar'] as const`; `INPUTS = ['screen','keys','midi','mic'] as const`; zod `profileSchema` (`instrument`, `input` enums, `latencyMs` int −500..500, `dailyGoal` int 1..10) and `lessonCompleteSchema` (`lessonId` string ≤64, `stars` int 0..3, `score` int 0..100).
- Produces (xp.ts): `xpForCompletion(prevStars: number, nextStars: number): number` = `10 × max(0, nextStars − prevStars)`.
- Produces (progress.server.ts): `getProfile(userId): Promise<Profile>` (defaults when none); `saveProfile(userId, input): Promise<Profile>`; `completeLesson(userId, input): Promise<{ stars: number; xpAwarded: number; progress: LessonProgressRow[] }>` — validates `lessonId` against `getLesson` from Task 7's `content/path.ts`… **to avoid a forward dependency, Task 6 defines the lesson id check via an injected `isKnownLesson: (id: string) => boolean` parameter; Task 7 supplies it in the route.** Calls `awardXp` (`lib/xp/engine.server.ts`) only when `xpAwarded > 0`, and `checkIn(userId)` (`lib/streak.server.ts`) on every completion; mirror how `app/routes/api/rmhstudy/*` calls them.
- Routes: `GET /api/rmhmusic/learn/profile` → `{ profile, progress }`; `PUT` same path (rateLimit `'write'`, body `profileSchema`); `POST /api/rmhmusic/learn/lesson-complete` (rateLimit `'write'`, body `lessonCompleteSchema`). All `defineHandler`, auth required.

- [ ] **Step 1: Write failing tests** for `xpForCompletion`: `(0,3)===30`, `(1,3)===20`, `(3,3)===0`, `(2,1)===0`, `(0,0)===0`.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/rmhmusic/learn/xp.test.ts` — FAIL.
- [ ] **Step 3: Implement** `xp.ts`, schemas, Prisma models + migration (additive only), `progress.server.ts` (stars never decrease; `bestScore` is the max; XP computed from stored vs new stars), and the routes. Unknown `lessonId` → 400; signed out → 401 (handled by `defineHandler`).
- [ ] **Step 4: Run** the test — PASS; `pnpm exec prisma validate`; `pnpm exec tsc --noEmit`; `pnpm db:migrate` applies cleanly to a throwaway local Postgres if available (else state in the PR that it was only validated).
- [ ] **Step 5: Commit** `feat(rmhmusic): learner profile and lesson progress`.

**PR B gate:** same as PR A, plus `prisma-validate`/`prisma-migrate-status` CI checks green. Merge, reset branch.

---

## PR C

### Task 7: Path content and learn store

**Files:**
- Create: `lib/rmhmusic/learn/content/path.ts`, `lib/rmhmusic/learn/store.ts`
- Modify: `app/routes/api/rmhmusic/learn/lesson-complete.ts` (pass `isKnownLesson`)
- Test: `lib/rmhmusic/learn/content/path.test.ts`

**Interfaces:**
- Produces (path.ts): `interface Lesson { id: string; unit: string; title: string; summary: string; mode: 'staff-flashcards'|'keyboard-map'|'fretboard'|'rhythm-basics'|'play-note'; available: boolean }`; `PATH: { id: string; title: string; lessons: Lesson[] }[]` — Unit 1 "Meet the staff & the keys" (lessons: what is a staff, treble clef notes, find middle C, keyboard layout / guitar strings & open notes, first note played); Unit 2 "Rhythm basics" (note values, 4/4 vs 3/4, tap the beat). **All lessons `available: false` in Phase 1 except `play-note` "First note played" (`available: true`, completes when the learner plays any detected note) so the loop is end-to-end.** `getLesson(id): Lesson | undefined`; `isKnownLesson(id): boolean`.
- Produces (store.ts): Zustand `useLearnStore` — `{ profile, progress, hub, status: 'idle'|'loading'|'ready'|'error', load(): Promise<void>, setInstrument(i), setInput(i), setLatency(ms), completeLesson(id, stars, score): Promise<void> }`; optimistic update then PUT/POST to the Task 6 routes; creates the hub once (`createInputHub([...])`) lazily on the client only.

- [ ] **Step 1: Write failing tests**: `PATH` lesson ids are unique across all units; every lesson id ≤64 chars; `isKnownLesson('nope')===false`; at least one lesson `available`; every unit has ≥1 lesson.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/rmhmusic/learn/content/path.test.ts` — FAIL.
- [ ] **Step 3: Implement** content (all user-visible text via `t` at render time; content holds ids + English defaults used as `defaultValue`s), the store, and wire `isKnownLesson` into the route.
- [ ] **Step 4: Run** — PASS; `tsc` clean.
- [ ] **Step 5: Commit** `feat(rmhmusic): learning path content and store`.

### Task 8: New home and shell

**Files:**
- Create: `components/rmhmusic/learn/LearnHome.tsx`, `PathUnit.tsx`, `StreakChip.tsx`
- Modify: `app/routes/rmhmusic/index.tsx` (render `LearnHome`), `app/routes/rmhmusic.tsx` (keep auth gate + theme/styles; keep `appRouteHead('rmhmusic')`)

**Interfaces:**
- Consumes: `useLearnStore`, `PATH`, `getStreak`-backed data via an existing client hook (find how `RmhStudy`/header shows streak; reuse, don't add an API).
- Produces: `LearnHome` — header with back-to-builds link (keep the existing labelled exit and its `useBackOrFallback`), streak chip, instrument toggle (piano/guitar — reuse the app-tier segmented control RMHType/RMHStudy settings already use; read `components/shared/app-theme.css` and a sibling's settings UI first, and do not hand-roll one), the unit/lesson list (available lessons are links, unavailable show "Coming soon"), and a "Set up input" button opening Task 9's `InputSetup`.

- [ ] **Step 1:** Implement the screens as a `.app-page` document (scrolls the document on mobile), `--app-*` tokens only, `t()` strings in `c-rmhmusic`; keep `Visualizer`-style dark ground via existing `app-ground`.
- [ ] **Step 2:** Run `pnpm exec tsc --noEmit && pnpm lint` — clean, no new warnings.
- [ ] **Step 3:** Verify visually with the `run` skill: `pnpm dev`, load `/rmhmusic` signed in at **390×844** and **1280×800**; screenshot both (deviceScaleFactor 1); confirm no horizontal scroll and ≥44px targets.
- [ ] **Step 4: Commit** `feat(rmhmusic): learning home`.

### Task 9: Input setup, on-screen keyboard, first lesson

**Files:**
- Create: `components/rmhmusic/learn/InputSetup.tsx`, `OnScreenKeyboard.tsx`, `LatencyCalibration.tsx`, `FirstNoteLesson.tsx`, `app/routes/rmhmusic/lesson.$lessonId.tsx`

**Interfaces:**
- Consumes: `useLearnStore().hub`, `isMidiSupported`, `createScreenInput` handle (expose via store: `screen: ReturnType<typeof createScreenInput>`).
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
