# RMH Music Phase 5: more instrument sounds, and voice as a learner instrument

> Written 2026-11-15 on `claude/hopeful-bohr-99d1vw` (HEAD = `main` after #1654, the songs). Roadmap:
> `docs/rmhmusic/roadmap.md` §3 Phase 5. Builds on the instrument-sounds plan
> (`2026-11-09-rmhmusic-instrument-sounds.md`, "the sounds plan") and its engine in
> `lib/rmhmusic/learn/audio/instruments/`. Tests first for every pure module (see each fail, then
> pass). Commit per step with explicit paths through the gate hook.

## 0. Scope

**A. Sounds.** Cello, clarinet and oboe (VSCO 2 CE, CC0), the nylon-string guitar (FreePats, CC0)
and, only where the licence read from the downloaded files is clean for a commercial site, the
ukulele and an organ. Each ≤ 0.6 MB (600,000 bytes), exact bytes recorded. The engine, its LRU of
two decoded instruments, the 2.5 s sound session and the synth fallback are unchanged.

**B. Voice.** `voice` joins `piano | guitar` as the learner's instrument, with a vocal range. Voice
learners sing into the microphone; lessons that accept other inputs still do. A voice path reuses
the existing modes plus one variant (interval singing). No chord-playing lessons. Hints play
through the chosen sound (default for voice: the piano); there is no "voice" timbre.

**C. Docs.** Roadmap §1/§2/§3, facts, site docs, route table only if routes change (they do not).

## 1. Sources and licences (verified from the downloaded files, 2026-11-15)

| Sound | Source (pinned) | Licence as read | Verdict |
| --- | --- | --- | --- |
| Cello | `sgossner/VSCO-2-CE@440300901d` `Strings/Cello Section/susvib/*_v3_1.wav` (a cello section, sustain with vibrato, loud layer) | repo `LICENSE`: CC0 1.0 Universal; `Readme.txt`: "use these samples for ANY purpose", asks credit and that the samples not be sold as such | **use** (same terms as the shipped violin and flute) |
| Clarinet | same repo, `Woodwinds/Clarinet/susLong/*_v2_rr1_sum.wav` | as above | **use** |
| Oboe | same repo, `Woodwinds/Oboe/Sus/*_v3_Main.wav` | as above | **use** |
| Nylon guitar | FreePats "Spanish Classical Guitar" 2019-06-18, `SpanishClassicalGuitar-SFZ+FLAC-20190618.7z` from `freepats.zenvoid.org` | `cc0.txt` (CC0 1.0 legal code) and `readme.txt` ("Published under the terms of Creative Commons CC0 public domain dedication") inside the archive; the page says the same | **use** |
| Ukulele | FreePats "Ukulele" 2026-08-11 (tenor, Flight Fireball, Mateusz Dąbrowski), `Ukulele-SFZ+FLAC-20260811.7z` from the `freepats/ukulele1` GitHub release | `LICENSE.txt` (CC0 1.0 legal code) and `README.txt` (CC0) inside the archive; the page says the same. One member (`chuck.wav`, a percussive sample we do not use) fails its CRC in `unar`; the 13 pitched FLACs extract whole | **use** |
| Organ | `sgossner/VCSL@c1ea7bcc3c` `Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet/NT5_Man3Quiet_*_rr1.wav`, the quiet stop on manual III, from C3 up (Simon Dalzell / Ivy Audio; the build's YIN found the loud `Loud/Rode_Man3Open_*` stop ambiguous between octaves, so it was dropped — §2 of the roadmap has the shipped zones) | repo `LICENSE`: CC0 1.0; `README.md`: "under a Creative Commons 0 license … even make commercial software, no royalties, no credit, no special terms"; the folder's `Info.txt`: "Bearer is granted right to redistribute … Credit to both original author and Versilian Studios is encouraged" | **use, credited** (credit is encouraged, not required; nothing share-alike, non-commercial or restricted). Flag for counsel with the other CC0 claims (roadmap §4). The VSCO 2 CE copy (`Keys/Organ`) carries the same `Info.txt` and sits under that repo's CC0; VCSL is preferred because its README states the commercial terms in words |

Rejected or not used: VSCO "Upright Piano" (not needed); anything SA/NC (none chosen).

Traps carried over from the sounds plan: VSCO wind file names are an octave below the sounding
pitch (check every new VSCO folder, including the cello, by YIN, never by name); the build fails on
a measured pitch ≥ 0.35 st from the key centre and on a residual > 10 cents after `tuneCents`.

## 2. Zones and budget (to be confirmed by the build; exact bytes go in the roadmap)

64 kbps mono MP3 ≈ 8,000 B/s. Zones are a third apart (piano-style, `maxShift` 2) or a whole tone
(`maxShift` 1).

| Id | Zones (sounding) | Duration | Polyphony / voices | Range |
| --- | --- | --- | --- | --- |
| `cello` | 13, a third apart, from C2 | 3.5 s | mono / 1 | 36–77 |
| `clarinet` | 11, D3 … F♯6 | 3.5 s | mono / 1 | 50–90 |
| `oboe` | 9, A♯3 … F6 | 3.5 s | mono / 1 | 58–91 |
| `guitar-nylon` | about 22, every two semitones E2 … C6 | 3 s | chord / 8, strum 14 ms | 40–84 |
| `ukulele` | 13, whole tones C4 … C6 | 2.5 s (the uke decays by then) | chord / 4, strum 16 ms | 60–85 |
| `organ` | 13, a minor third apart, C3 … C6 (the quiet stop; shipped) | 3.5 s | chord / 8, block | 48–86 |

## 3. Engine and setting changes (A)

- `types.ts`: `INSTRUMENT_IDS` gains `cello`, `clarinet`, `oboe`, `guitar-nylon`, `ukulele`, `organ`
  (ids ≤ 16 chars: the `sound` column is `VarChar(16)`); `CreditId` gains `freepats-guitar`,
  `freepats-ukulele`, `vcsl-organ`. `catalog.ts`: one meta each (range, polyphony, voices,
  `releaseMs`, `strumMs`, `maxShift`). A test pins: every id has a catalog entry, a label, a
  credit, built zones, bytes ≤ 600,000 per instrument; mono sounds have `maxVoices` 1;
  `playsChords` is true for nylon guitar, ukulele and organ only among the new ones.
- `SOUND_FAMILIES` (catalog): keyboards (piano, organ), plucked strings (acoustic guitar, nylon
  guitar, ukulele), bowed strings (violin, cello), winds (flute, clarinet, oboe). `SoundDialog`
  stays ONE radio group (one Tab stop, arrows across every row), with a `t-label`-style heading per
  family (`role="group"` + `aria-labelledby`); the list scrolls inside the dialog on a phone.
- `credits.ts` gains three paragraphs (VSCO's work line names the new instruments); `CREDITS.txt` is
  regenerated by `--credits`; the credits page lists them by `CREDIT_ORDER`.
- `build-instruments.ts`: `IDS` from the sources file's keys (not a second list); archives handled
  by `unar` whatever their format (RAR5 or 7z); a zone may give `startS` to skip a noisy pre-roll.
- `defaultSoundFor(instrument)`: guitar → guitar, piano and voice → piano.

## 4. Voice (B)

### 4.1 Model

- `schemas.ts`: `INSTRUMENTS = ['piano', 'guitar', 'voice']`; `VOICE_RANGES = ['soprano', 'alto',
  'tenor', 'bass']`; `profileSchema.voiceRange` = `z.enum(VOICE_RANGES).nullable().optional()`
  (absent leaves the stored value). Prisma: `MusicLearnProfile.voiceRange String? @db.VarChar(16)`,
  migration `20261115200000_music_learn_voice_range` (`ALTER TABLE … ADD COLUMN`, additive only).
  `instrument` is already a plain string column, so `voice` needs no migration.
- `lib/rmhmusic/learn/voice/range.ts` (strict island, pure): each range's comfortable compass and
  how it reads.

  | Range | Sounding compass | Staff |
  | --- | --- | --- |
  | soprano | C4–G5 (60–79) | treble |
  | alto | A3–D5 (57–74; A3 is the lowest note the staff card draws) | treble |
  | tenor | C3–G4 (48–67) | treble with the small 8 (written an octave up, like guitar) |
  | bass (baritone or bass) | G2–C4 (43–60) | bass |

  `voiceReading(range)` → `{ clef, octaveClef, writtenShift }`; `voiceStaff(midi, range)`;
  `rangeNaturals(range)`; `foldIntoRange(midi, range)` (whole octaves). A stored null range reads as
  `alto` until the learner picks one (the dialog asks at once).

### 4.2 Choosing voice

- LearnHome's instrument tabs gain **Voice** (lucide `MicVocal`); the heading says "Learn to sing".
- Choosing Voice saves `instrument: 'voice'` and the input `mic`, and opens "Set up input". For a voice
  learner that dialog starts with **Your voice**: a radio group of the four ranges (each row: name and
  its compass, e.g. "Alto, A3 to D5"), the same radio-keys pattern as the Sound dialog, then the
  existing input chooser (MIDI, keys and on-screen keys stay available).

### 4.3 The voice path (`VOICE_PATH` in `content/path.ts`; `pathFor(instrument)`)

Lesson ids are new and stored forever; `isKnownLesson` covers both paths.

1. **Read your staff** — `voice-staff-notes` (`staff-flashcards`, deck `voice-range`: naturals of
   the range on its staff; tenor written an octave up with the 8; bass on the bass staff) and
   `voice-first-note` (`play-note`, "Sing your first note").
2. **Sing it back** — `voice-match-five` (match-note: the range's lowest five naturals) and
   `voice-match-range` (match-note: every natural of the range). Staff by range; the mic is graded
   in cents at the sounding pitch (an octave off is wrong, as for every match).
3. **Sing intervals** — new mode `sing-interval`: `voice-interval-steps` (second, third) and
   `voice-interval-leaps` (third, fifth, octave). Each question: the staff shows the first note and
   the line names the interval ("Sing a third above C4"); Hear it plays the first note then the
   second; the learner sings the second (match-note machine, up to three tries). Root and target
   both inside the range. The match-note machine gains `Target.from` and its `play` effect carries it.
4. **Rhythm basics** — the existing unit (shared ids, shared progress).

No `keyboard-map`, `fretboard`, `ear-chord` or `play-chord` lesson is on the voice path.

### 4.4 Elsewhere

- **Sprint:** voice gets the single-note levels (note, accidental, bar); chord levels are not listed.
  `forInstrument(p, 'voice', range)` moves a prompt by whole octaves into the range and onto the
  range's staff (tenor written an octave up with the 8); `promptMidis` sounds it. The daily run uses
  the same seed; its chord prompts are skipped for voice as they are for the microphone today.
- **Songs:** `songForRange(song, range)` (`songs/transpose.ts`, pure): the song as written if it fits
  the range's written compass, else moved by whole octaves, else into the nearest key (C, G, D, A,
  F, B♭, E♭) whose transposition fits, every note respelled by letter (a diatonic shift of the key's
  tonic letter plus the semitones), never a double sharp or flat. Versions gain `voice-treble`,
  `voice-tenor` (the 8, sounds an octave down) and `voice-bass` (bass clef); the layout and the score
  view take the clef from the version; key signatures for the new keys on both staves.
- **Tuner:** unchanged; a voice learner gets the chromatic preset.
- Sound: hints play through the learner's chosen sound; `defaultSoundFor('voice')` is the piano.

## 5. Verification

Unit tests for every pure module. Audio measured offline per new zone by the build (YIN within
10 cents after `tuneCents`, onset, peak, no clipping), plus a chord render check (three zones summed
with the engine's 1/√n trim, peak under 0 dBFS) for the chord sounds. Nobody can listen here. One
Chromium smoke (dev server + throwaway Postgres): the Sound dialog's new rows by keyboard, one lesson
per new sound plays its samples, an alto learner through onboarding, a staff lesson in the right
clef, pitch match with a fake mic, interval singing, a song transposed into the range; 390 and 1280
in Day and Night; CLS 0. `pnpm typecheck` OOMs in this container: a scoped check instead.
