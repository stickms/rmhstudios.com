# RMH Music Instrument Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pitched sound in the RMH Music learning programme (ear and chord training, Hear it hints, the note finder's taps, the on-screen and computer keys, flashcard reveals) is played by a recording of a real **piano, steel-string acoustic guitar, violin or flute** instead of the triangle-wave synth in `lib/rmhmusic/learn/audio/voice.ts`. Metronome and calibration clicks stay as they are. The learner picks the sound once; the synth remains the fallback when a sample set cannot be loaded.

**Status:** research done 2026-11-09, nothing implemented. This plan starts **after** the agent currently adding `audio/sequence.ts`, `EarLesson`, `PlayChordLesson` (Phase 2 Tasks 8 and 9) has landed: it touches `voice.ts` (the `PlayOptions.instrument` hook, `soundStatus`, `wakeSound`, `onSoundChange` already exist in the working tree) and `sequence.ts`, and this plan builds on exactly those entry points.

**Spec inputs:** `docs/superpowers/plans/2026-11-09-rmhmusic-phase2-training.md` (the "never advance on a question the learner could not hear" rule, Review Focus 4), `lib/rmhmusic/learn/input/echo-window.ts` (the mic echo guard), `CLAUDE.md` (no work at rest, CSP in `deploy/apache/rmhstudios.conf`, `getAudioContext()` only).

---

## 1. Recommendation (one path)

| Sound | Source (exact) | Licence | Zones / bytes after conversion |
|-------|----------------|---------|--------------------------------|
| **Piano** | Salamander Grand Piano V3 (Yamaha C5) by Alexander Holm, via `github.com/sfzinstruments/SalamanderGrandPiano`, velocity layer `v8` of 16, the **Retuned** table | **CC BY 3.0 Unported** (attribution required) | 21 zones C2 to C7, about **0.53 MB** |
| **Guitar (steel-string acoustic)** | **"Ella Gitauru" 5.26.04** by Malaclypse the Younger (a Fender DG8S dreadnought, bronze 12-53 strings, dynamic layer `mf`), part of the free "Blue Jeans and Moonbeams" package listed in the sfzinstruments catalogue under Guitars | **MIT** (the author's text adds one sentence: distributed alterations must be attributed to whoever made them; see §2.2) | 20 zones E2 to F#5, **0.59 MB** (measured) |
| **Violin** | VS Chamber Orchestra: Community Edition (VSCO 2 CE) "Solo Violin / Arco Vib", forte layer, `github.com/sgossner/VSCO-2-CE` | **CC0 1.0** | 15 zones G3 to C7, about **0.49 MB** |
| **Flute** | VSCO 2 CE "Flute / susNV" (sustained, no vibrato), the only wind in v1 | **CC0 1.0** | 10 zones, about **0.29 MB** |

* **Total about 1.9 MB for all four; the most any one learner downloads is the one instrument they chose (0.29 to 0.59 MB).** The budget was 1.5 MB per instrument; the largest uses 40% of it.
* **Format: mono MP3, 44.1 kHz, CBR 64 kbps, one sample per zone, pitch-shifted at most 1 semitone (piano, guitar) or 2 semitones (violin, flute).** One file format for every browser, so there is no codec sniffing (reasons in §2.3).
* **Where the bytes live:** the converted MP3s are committed under `public/music/rmhmusic/instruments/<id>/` (1.9 MB in git, against a 582 MB pack already), reach the browser through `asset()` from `lib/storage/asset.ts` (versioned, `immutable`, served from `cdn.rmhstudios.com` by the existing R2 sync). **No change to Apache, CSP, Docker, deploy.sh or the Go assets service.** The FLAC/WAV sources are never committed: a build script downloads them from pinned commits, checks their SHA-256, and writes the MP3s and the zone maps (§2.4).
* **Engine:** one `Instrument` interface, a sampler built on `AudioBufferSourceNode` + `playbackRate`, one shared `AudioContext` (`getAudioContext()`), one master compressor, a voice pool. `voice.ts` stays the single entry; the synth is the fallback behind it.
* **Loading:** an explicit state machine per instrument, `idle -> loading -> ready | failed`; nothing is fetched until a lesson route or the Sound picker asks; a lesson waits at most 2.5 s on a plain sentence, then falls back to the synth **for the rest of that session** so the timbre never flips mid-lesson.
* **Setting:** one new nullable column on `MusicLearnProfile`, `sound`; null means "follow the instrument" (piano learner: piano, guitar learner: steel-string acoustic guitar).
* **Chords:** only piano and guitar play chords (block chord, strummed chord). Violin and flute are for single notes and intervals; the chord lessons always use the learner's polyphonic sound (§5.3).
* **Guitar fallback, if the owner does not accept the MIT wording or the Google Drive source:** keep the **FreePats nylon-string Spanish classical guitar** (CC0, 20 zones E2 to C6, 0.42 MB, fully measured) as "the acoustic guitar". It is acoustic too, but it is a nylon classical guitar and sounds like one. **Nothing in this plan silently chooses it**; §2.1 carries the full comparison and the one-line switch (`sources.json` entry, `catalog` id).

Alternatives rejected, with evidence, are in §2.1 and §2.2.

---

## 2. Decisions with evidence

### 2.1 Sample source

**What I could fetch from this sandbox (honest report).**

| Thing | Result |
|-------|--------|
| `sfzinstruments.github.io` catalogue (index, pianos, guitars, strings, orchestra, woodwinds, keyboards, folk, and instrument detail pages) | **fetched, read** (HTTP 200, licence/size/format columns parsed) |
| `raw.githubusercontent.com/sfzinstruments/*`, `sgossner/*` (README, LICENSE, data files, **binary samples**) | **fetched**; a Salamander FLAC and a VSCO WAV came back byte-identical (SHA-256 equal) to the same files read through git |
| `git clone --filter=blob:none` of `sfzinstruments/SalamanderGrandPiano`, `sfzinstruments/karoryfer-bigcat.cello`, `sgossner/VSCO-2-CE`, `sgossner/vcsl` | **worked** (tree listings of 668, 535, 3187 and 4282 files respectively; single blobs fetched on demand). `github.com/sfzinstruments` HTML pages, `api.github.com/orgs/...`, `codeload.github.com` archives are **blocked** by the session proxy |
| `freepats.zenvoid.org` pages and the `.7z` banks (nylon guitar 4.5 MiB, ukulele 2.3 MiB) | **fetched and extracted** (py7zr, in a scratch dir); the ukulele archive extracted only partly (a py7zr LZMA limitation), which does not matter now |
| **Steel-string guitar search (second round):** `freepats.zenvoid.org` steel-string page and licence page, the Malaclypse "catalog" Google Doc (text and HTML export), the **241,545,374-byte `BJAM 5.26.04.rar`** from `drive.usercontent.google.com`, `apt-get install unar` for RAR5 | **all worked.** The RAR downloaded in full (size equals the server's `content-length`; SHA-256 `7604ab82eb9e04ac829e264a60487fb15b497f51de5f194f20f5df832edf7482`). `unar` extracted the Ella samples I needed but failed on 40 of 1,935 entries (16 `.ogg` files of the acoustic set came out empty), none of the 20 files used below |
| `tonejs.github.io/audio/salamander/*.mp3` (30 files) | fetched, **1,993,763 bytes total** |
| `gleitz.github.io/midi-js-soundfonts` (the soundfont-player / MIDI.js files), `registry.npmjs.org/smplr`, `danigb.github.io/samples` | fetched |
| `webaudiofontdata.surikov.net` (WebAudioFont) | **refused by the egress proxy**; not evaluated |
| Philharmonia, Sonatina contents | not fetched (see below) |
| `cdn.rmhstudios.com` response headers | fetched (see §2.5) |
| Encoding: `ffmpeg` with libmp3lame, libopus, aac, libvorbis in the sandbox; real **Chrome 153** (`/usr/bin/google-chrome`, driven by the repo's `playwright-core`) decoding the encoded files with `decodeAudioData` | done; numbers below |
| Firefox and WebKit decoding, any real iPhone/iPad Safari, **listening to any of the audio** | **not done.** The sandbox has no Firefox/WebKit, and nobody here can hear the files. Quality statements below come from the catalogue/readme descriptions, file properties and sizes, not from listening |

**The sfzinstruments catalogue, judged for this programme.** It lists 22 pianos, 11 guitars, 11 string and 10 woodwind entries. For a commercial site only CC0 and CC-BY are clean; CC-BY-SA (share-alike) and any NC licence are not (flagged below).

| Need | Best in the catalogue | Licence (exact, from the catalogue) | Verdict |
|------|-----------------------|-------------------------------------|---------|
| Piano | **Salamander Grand Piano**, Alexander Holm, 394+ MB, 16 velocity layers, WAV 16/24-bit (FLAC in the repo) | CC-BY-3.0 | **Chosen.** Best quality-to-licence ratio; sampled every minor third (30 zones, A0 to C8) |
| Piano alternatives | Splendid Grand Piano (AKAI, "Public Domain", 77 MB, 4 layers); VCSL "Grand Piano, Steinway B" (CC0, inside the 680 MB VCSL Keys); Headroom Piano (CC-BY-4.0, 156 MB FLAC, 5 layers) | PD / CC0 / CC-BY-4.0 | Splendid: the public-domain claim rests on one README sentence ("released as public domain in early 2000 by Akai"), no licence file (its `LICENSE` is a 404). **VCSL Steinway B is the no-attribution fallback** (CC0 stated in the repo `LICENSE` and README); I did not audition or measure it |
| Piano rejected | LivingRoom Upright (CC-BY-SA-4.0: share-alike), jRhodes3c/3d (CC-BY-NC), Maestro Concert Grand ("Custom"), Church Steinway (no licence listed), Ivy Audio in 162 (none listed), Estate Grand LE (none listed), Accurate-Salamander (CC-BY, 1.6 GB: better tuning, far too heavy to process here) | | not usable or not worth it |
| Guitar | Only electrics are CC0 (Karoryfer Black_And_Green, Emilyguitar [an Epiphone SG: I read its page], Shinyguitar), or "Custom"-licensed multi-hundred-MB sets (Unreal Instruments, "Standard Guitar" is an electric), or commercial. **The one acoustic is "Blue Jeans And Moonbeams" by Malaclypse the Younger**, listed as **MIT**: it bundles a Strat-type electric and **"Ella Gitauru", a steel-string acoustic** | MIT | **Steel-string: see the dedicated comparison below** |
| Guitar, steel-string comparison | (a) **Ella Gitauru 5.26.04** (MIT; Fender DG8S dreadnought, Elixir Nanoweb 80/20 bronze 12-53; four velocity layers mp/mf/f/ff; strings 6E, 5A, 4D, 2B sampled at frets 0, 1, 3, 5 ... 19; the package is a 231 MB RAR of Ogg Vorbis files, linked from the author's Google Doc, not GitHub); (b) **FreePats "FSS Steel-String Acoustic Guitar"** (an FS Seagull steel-string from FlameStudios, 2.7 MiB small or 13 MiB WAV): **GPL v3-or-later "with a special exception"** (the FreePats exception covers compositions that mix the sounds, not shipping the sound files inside an app) and FreePats' own licence page says GPL is deprecated for new contributions; (c) Karoryfer / Unreal electrics, Kay banjo (GPL) | MIT / GPL-3 + exception | **(a) chosen, with a flag**; (b) rejected as custom-restricted. A third condition worth knowing: **the licence text is in the author's user guide inside the package** (the PDF carries a full MIT boilerplate plus the line "all alterations which are distributed are to be attributed to the person or organization making them"); the RAR has no `LICENSE` file in what `unar` extracted. If the owner wants a plain repository licence file, use the nylon fallback |
| Guitar, nylon fallback | **FreePats "Spanish Classical Guitar" 2019-06-18**: 48 chromatic mono 44.1 kHz FLAC samples, G1 to C6, plain CC0 (`cc0.txt` ships in the bank), 4.5 MiB | CC0 | **Kept as the fallback**: measured 421,962 B for E2 to C6 every two semitones |
| Violin | Only `String Cyborgs` (CC0, but a processed synth made of cello/bass samples) and commercial Karoryfer violins. **VS Chamber Orchestra: Community Edition** (CC0, 2.3 GB, the repo `sgossner/VSCO-2-CE`) contains a solo violin | CC0-1.0 | **Chosen** |
| Cello | Bigcat Cello (Karoryfer, CC0, 126 MB, 479 samples, close-miked, no vibrato, every minor third) | CC0-1.0 | Held for later, not in scope |
| Flute | Ixox Flute (CC-BY-4.0, 10.7 MB, an SFZ port of a VSTi with soundfont sources); VSCO 2 CE flute (CC0) | | VSCO flute chosen: CC0 and same pipeline as the violin |
| Other winds and reeds | VSCO 2 CE clarinet (`susLong`) and oboe (`Sus`), CC0, the same pipeline as the flute; MTG Solo Sax (CC-BY-4.0, 110 MB), Karoryfer Weresax / Bear Sax (CC0), VCSL Tenor Saxophone and Saxello (CC0) | | **Not in v1** (owner decision: flute is the only wind). Clarinet and oboe are a `sources.json` entry each when wanted; I measured their per-zone MP3 size at 28.5 KB (about 0.3 MB each) |
| Organ, ukulele | VCSL pipe organ (CC0; its `Info.txt` also says "Credit to both original author and Versilian Studios is encouraged", so credit anyway); FreePats ukulele (CC0, tenor, C4 to C6, 2.3 MiB) | | Later; ukulele zones were measured at about 0.2 MB |
| Orchestral bundles | Sonatina Symphonic Orchestra (listed as "CC Sampling Plus 1.0", which in my reading forbids redistributing the samples as such); Virtual Playing Orchestra (no licence listed) | | Rejected on licence |

**Other sources compared.**

* **Tone.js hosted Salamander** (`tonejs.github.io/audio/salamander`): 30 MP3s, 1.99 MB, one velocity layer. Rejected: a third-party host not in our CSP `connect-src`, over the byte target, and it is the **natural-tuning** set. The upstream `Data/tune_ret.txt` shows the natural samples are off by up to 38 cents (zones C2 to C7 need from -9 to -17 cents), which matters in an app that teaches pitch.
* **smplr** (MIT, npm 0.16.1) and **soundfont-player / MIDI.js soundfonts**: these are loaders, not sample sets; smplr fetches at runtime from `danigb.github.io`, `smpldsnds.github.io` and `gleitz.github.io`, none in our CSP, none ours to keep alive. Its own loader picks `ogg` with an `m4a` fallback (`findFirstSupportedFormat(["ogg","m4a"])`), a useful data point for §2.3. The gleitz soundfonts are **base64 JS files**: nylon guitar 1.73 MB, piano 2.31 MB, flute 2.79 MB, violin 2.83 MB (all over budget), and their README states **FluidR3_GM: CC BY 3.0, MusyngKite: CC BY-SA 3.0** (share-alike, rejected), FatBoy: CC BY-SA 3.0. Rejected.
* **WebAudioFont**: host blocked in this sandbox, licences mixed across its derived fonts; not evaluated.
* **Philharmonia sample library**: not fetched; its terms are bespoke (not an open licence), so rejected without further work.
* **Writing our own recordings**: out of scope.

**Why SFZ is the catalogue but not our format.** The catalogue is a list of instruments in the SFZ format. SFZ is an editor/sampler format with hundreds of opcodes, and the Salamander and Splendid remaps use ARIA extensions that a small parser cannot honour. We do **not** parse SFZ at runtime and we do **not** ship a general SFZ parser. We need a handful of facts per zone (key centre, which file, tuning cents, start offset, how long to keep, an optional playback-rate restore), and they are all in plain places:

* Salamander: `Data/region.txt` (30 regions, `pitch_keycenter`, file name) + `Data/tune_ret.txt` (30 cents values) + `Data/vel_08.txt` (per-zone start offsets in samples, 694 to 1771 at 48 kHz, i.e. 14 to 37 ms of silence to trim);
* Ella Gitauru (steel guitar): the file name carries string, dynamic and fret (`6E-mf05.ogg`), and the author's `Ella G5/includes/Note 6E05.sfz` shows the rule: `pitch_keycenter=40` (the open string) with the sample played on key 45. **The Ogg files are stored at the open-string pitch** (16 kHz mono Vorbis; each fret was recorded at its real pitch and slowed down to the string's pitch, which is why a file is 11 to 18 s long), so a zone is baked with `asetrate = 16000 * 2^(fret/12)` followed by a resample to 44.1 kHz. That restores the real recorded note, at its real length and brightness, and removes any runtime pitch shift beyond our usual 1 semitone;
* FreePats nylon guitar (fallback): 48 `<region>` entries, one `pitch_keycenter` + `sample=` each, no tuning;
* VSCO: the **file names** carry the note (`LLVln_ArcoVib_A4_f.wav`), but see trap 1.

So the build script (§6, Task 5) is a **declarative `sources.json` that lists, per instrument, the files to take**, plus a 40-line extractor for the two Salamander tables. It is worth writing; a general SFZ-to-JSON converter is not.

**Three traps found while checking samples (all change the design).**

1. **VSCO flute file names are an octave low.** I measured the fundamental (ffmpeg + autocorrelation) of `LDFlute_susNV_A4_v1_1.wav` = 882 Hz (MIDI 81, i.e. A5) and `LDFlute_susNV_C4_v1_1.wav` = 525 Hz (MIDI 72, C5); the VSCO clarinet and oboe samples I probed show the same octave offset. The violin files are correct (`A4_f` = 441 Hz, `C5_f` = 525 Hz). So names are **not** trusted: the build script detects each zone's pitch (with the repo's own YIN in `lib/rmhmusic/learn/pitch/`, run through a node script) and fails if it differs from the zone map by more than 35 cents or by a whole octave; the zone map's key centre is the **measured** one. The autocorrelation I used has about 45 cents of resolution, so I make no claim about tuning offsets; YIN with interpolation does the real measurement and stores `tuneCents`.
2. **Salamander tuning.** Use the Retuned table (`Data/tune_ret.txt`), baked into each zone as `tuneCents` (e.g. C4 -6, A4 -4, C7 -17). The README says both tunings are in the SFZ selectable by keyswitch; we ship one.
3. **Ella Gitauru's files are not at the pitch their names suggest.** I ran the repo's own YIN (`lib/rmhmusic/learn/pitch/yin.ts` through `tsx`) on every non-empty `mf` file of the four sampled strings: every fret of a string measures the **open-string pitch** (6E: 40.06 to 40.08 for frets 0 to 13; 5A: 45.04 to 45.06; 4D: 50.00; 2B: 59.01 to 59.02), because the files are stored at that pitch (see above). After baking with `asetrate = 16000 * 2^(fret/12)` the same YIN check on the 20 **decoded MP3s** reads: **worst error 8 cents** (6E zones +6 to +8 cents, everything from MIDI 51 up within 2 cents), onset under 1.1 ms for all 20, so no start offset needs trimming. That is an unusually well-tuned guitar for a pitch-training app and needs no `tuneCents` table. The build script runs this same check for every instrument and fails above 35 cents.

### 2.2 Licence compatibility and attribution

Everything is usable on a commercial site. Salamander (CC BY 3.0) and Ella Gitauru (MIT) carry conditions.

| Set | Licence text checked | Obligation |
|-----|----------------------|------------|
| Salamander | repo `LICENSE` is the CC BY 3.0 Unported legal code; README states "licensed under a Creative Commons Attribution 3.0 Unported License"; origin `archive.org/details/SalamanderGrandPianoV3` | credit the author, title and URI, name the licence, and say the work was **adapted** (BY 3.0 4(b)) |
| Ella Gitauru (steel guitar) | The "Blue Jeans and Moonbeams v5" user guide (a PDF inside the package, `documentation/`) and the author's catalogue document: "MIT License ... Permission is hereby granted, free of charge ... **The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. Additionally, all alterations which are distributed are to be attributed to the person or organization making them.**" It adds: "There is ABSOLUTELY NO REQUIREMENT to provide credit when using the instrument to make sound. You are only required to provide the boilerplate license if distributing the instrument itself or pieces of." The sfzinstruments catalogue lists it as MIT | We **distribute pieces of** the samples (converted MP3s) to browsers, so the MIT notice must be shown, and our conversion is an **alteration** we attribute to ourselves. This is "MIT with one extra sentence", not a plain MIT: the owner decides whether that counts as custom-restricted. No copyright year or `LICENSE` file exists in the package; the holder is "Malaclypse the Younger" (mal2fnord@gmail.com in the guide) |
| FreePats nylon guitar (fallback only) | `readme.txt` and `cc0.txt` in the bank; page says "Creative Commons CC0 1.0 public domain dedication" | none (we would credit anyway) |
| VSCO 2 CE | repo `LICENSE` is "CC0 1.0 Universal"; the catalogue lists CC0-1.0; `README.txt` says the set "is provided and designed for the creation of personal sample libraries for all purposes, both educational and commercial" | none (we credit anyway) |

Not every folder of a CC0 repository carries a separate statement (VSCO's organ and upright-piano folders add an `Info.txt` asking for credit). The violin and the flute have none. If counsel wants certainty, the paper trail is the repo LICENSE and Versilian's published statement; get that confirmed before launch. This is not legal advice.

**Attribution text (exact, to ship on the credits page and in `docs/`):**

> **Piano:** "Salamander Grand Piano V3" by Alexander Holm, licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Original: https://archive.org/details/SalamanderGrandPianoV3, SFZ mapping by kinwie (sfzinstruments). Changes made: selected notes, tuning-corrected, trimmed, converted to mono MP3.
>
> **Guitar:** "Ella Gitauru" (version 5.26.04, a Fender DG8S steel-string acoustic guitar) from "Blue Jeans and Moonbeams" by Malaclypse the Younger, MIT License. Source: the sfzinstruments catalogue entry "Blue Jeans And Moonbeams" (https://sfzinstruments.github.io/guitars/). Altered by RMH Studios: selected notes, restored to their recorded pitch, trimmed, converted to mono MP3. The MIT License text is reproduced in full on the credits page ("Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software") ... Additionally, all alterations which are distributed are to be attributed to the person or organization making them. THE SOFTWARE IS PROVIDED "AS IS" ..."; the credits page carries the whole text, copied from the author's user guide).
>
> **Violin and flute:** "VS Chamber Orchestra: Community Edition" (VSCO 2 CE) by Versilian Studios LLC, CC0 1.0. Recorded by Sam Gossner and Simon Dalzell. https://github.com/sgossner/VSCO-2-CE. Trimmed and converted to mono MP3.

**Where it goes.** A new route `app/routes/rmhmusic/credits.tsx` (plain page, `.app-page`, link text "Sound credits" in the Sound picker dialog and in the app's footer-free nav, **not** a footer line, because the Phase 2 look rules ban footer text). The credits data lives in `lib/rmhmusic/learn/audio/instruments/credits.ts` (one source for the page, the docs and the build script's check that every shipped instrument has a credit). Add a line to `docs/` (`docs/site-reference` is generated; the hand-written app page gets a paragraph) and to `CONTRIBUTING`-style asset notes if one exists.

### 2.3 Format, size, Safari

* `caniuse-lite` in this repo's `node_modules` (the data our own browserslist uses): **MP3 is "supported" in Chrome, Firefox, Edge, Safari and iOS Safari for every current version; Ogg Vorbis likewise on current versions; Opus is "supported" on iOS Safari 18.4+ and only "partial" on desktop Safari (the note text is not shipped in `caniuse-lite`, so I cannot say which container); AAC is "partial" on Firefox** (depends on the operating system's codecs).
* Real Chrome 153 decoded all of them with `decodeAudioData` and, importantly, **the decoded onset equals the source's onset** (13.3 ms, where the source piano starts), so encoder delay metadata is honoured for MP3, AAC and Opus in Chrome. Firefox and Safari are unverified (Task 10 verifies; real-device Safari is the owner's). The baked steel-guitar zones (`40.mp3`, `59.mp3`, `78.mp3`) were also decoded in Chrome 153: 44.1 kHz mono, 4.0 s / 3.5 s / 3.5 s, onset 1.1 ms / 0 / 0.
* Measured size of one piano zone, C4 layer 8, 3.5 s mono with a 0.8 s fade: **MP3 64 kbps = 28,465 B; AAC 64 kbps = 29,699 B; Opus 48 kbps = 23,630 B; Opus 32 kbps = 15,917 B.** Opus is 17% smaller at similar quality, a saving of 0.1 MB per instrument that does not matter at 0.5 MB.
* **Decision: MP3 only.** It decodes everywhere without sniffing and the byte budget has 3x headroom. Opus-in-Ogg is the likely future optimisation once real-device Safari support is certain; the zone-map shape does not change (only the extension).
* **Memory:** `decodeAudioData` returns float32 PCM at the context rate. One 3.5 s mono zone is 603 KB; one instrument is about 6 MB (flute), 10.6 MB (violin), 11.4 MB (piano), 12.9 MB (steel guitar: 6 zones of 4 s, 14 of 3.5 s). Keep at most two instruments decoded (LRU), so under 25 MB. Decoding is on demand, never at page load.
* **Decode time (Chrome 153, desktop, this sandbox):** 20 ms to 300 ms per zone, 0.9 s for the very first (context warm-up). Phones are not measured; hence the 2.5 s wait limit in §3.

### 2.4 Repo vs assets service vs CDN

| Option | Verdict |
|--------|---------|
| **Commit encoded MP3s to `public/music/rmhmusic/instruments/`** and let the existing pipeline carry them | **Chosen.** `scripts/sync-static-assets-to-r2.mjs` already mirrors `public/{music,models,sprites}` to R2 and uploads with `Cache-Control: public, max-age=31536000, immutable` under `/static/<sha256-of-dir>/music/...`; `lib/storage/asset.ts` adds that prefix; `public/` is already 328 MB in git. Cost: 1.9 MB. In dev with no `VITE_CDN_BASE_URL`, paths stay relative and load from `public/`. |
| Dedicated `samples` dir added to `STATIC_ASSET_DIRS` | Rejected for now: needs the same list edited in `scripts/static-asset-versions.mjs` and `scripts/sync-static-assets-to-r2.mjs`, plus Dockerfile label and test updates, to stop a games-music edit re-versioning the samples. Re-downloading 0.5 MB once is cheaper than touching deploy machinery. Revisit if the sample set grows past about 20 MB. |
| Git LFS | Rejected: no LFS in this repo (`.gitattributes` has none) and 1.9 MB does not warrant it. |
| Build-time fetch of the finished MP3s from elsewhere | Rejected: the sources are fetched once, by a developer, to *produce* the MP3s (below); production never depends on a third-party host. |
| The Go `assets` service (port 7007) | Not relevant: it streams `/library /music /models /sprites` out of the bucket for the Apache path and is "off the main user path under Compose"; the browser gets these files from R2 directly. |
| Committing the FLAC/WAV sources | Rejected: tens to hundreds of MB (the Ella RAR alone is 241 MB). They are fetched by `scripts/rmhmusic-samples/build.ts` from **commit-pinned `raw.githubusercontent.com` URLs** (Salamander, VSCO 2 CE) and, for the steel guitar, **the author's Google Drive link** (`drive.usercontent.google.com/download?id=1ekz211jPZlSYQTrBlYdWaIvhYKVpDZKX&export=download&confirm=t`, file `BJAM 5.26.04.rar`, SHA-256 `7604ab82...7482` as above), each checked against a SHA-256 in `sources.json`, cached under a gitignored `.cache/`, and used only on a developer's machine (needs `ffmpeg` with libmp3lame, and `unar` or `unrar` for the RAR5 archive; not part of CI). The script fails on any zero-byte extracted file (`unar` produced 16 of them in the acoustic folder, none used). A Google Drive link can rot; the committed MP3s are the product, so rot only blocks a rebuild, and the fallback is the author's re-upload or the nylon guitar. |
| Re-encoding churn | Every re-encode adds ~1.9 MB to git history. The encode settings are frozen in `sources.json`; the script is deterministic (fixed ffmpeg flags, `-fflags +bitexact`), and a test fails if committed MP3s no longer match the manifest hash. |

### 2.5 Delivery facts checked (CSP, CORS, caching, service worker)

* **CSP** (`deploy/apache/rmhstudios.conf`, line ~204): `connect-src 'self' blob: https://cdn.rmhstudios.com ...` already allows `fetch()` of CDN files (that is how `lib/tf2-game/audio/engine.ts` fetches and decodes game audio). We use `fetch` + `decodeAudioData`, **not** `<audio>`, so `media-src` is irrelevant. No `worker-src`, `wasm`, Permissions-Policy or Apache change. **No hand deploy step for the owner**, other than the post-deploy `curl -I` in Task 10.
* **CORS on the CDN** (live `curl -I`): `https://cdn.rmhstudios.com/music/altair/1.mp3` answers `access-control-allow-origin` **only for `https://rmhstudios.com` and `https://www.rmhstudios.com`** (`vary: Origin`); `http://localhost:7005`, a `*.discordsays.com` origin and a random origin get no header. Consequences: the browser `fetch` fails on those origins, so the loader must treat a CORS failure exactly like a network failure (state `failed`, reason `cors`, synth fallback), and local dev must run with no CDN (it does by default) or the failure path is what you will hear. Preview deployments on other origins also fall back to the synth.
* **Caching:** versioned URLs are `immutable` for a year (sync script, `STATIC_ASSET_VERSIONS` set). The unversioned path I probed showed `cache-control: public, max-age=86400, stale-while-revalidate=604800` and `cf-cache-status: DYNAMIC`. After the first deploy, `curl -I` one versioned sample URL and confirm `immutable` and that Cloudflare caches it (Task 10).
* **Service worker** (`public/sw.js`): caches only `/assets/*` hashed build files and images; cross-origin and everything else is untouched. So samples rely on the HTTP cache (immutable, so repeat visits cost nothing); **offline means the synth fallback**. An optional later step is `caches.open('rmh-samples-v1')` inside the loader to make samples work offline; not in this plan.
* **Performance rule** ("a page at rest runs no rAF/workers"): nothing here runs at rest. The loader runs only on demand; the engine has no timers except scheduled `AudioBufferSourceNode` starts; no `requestAnimationFrame`, no worker, no canvas.

---

## 3. Engine and loading design

### 3.1 Files

All under `lib/rmhmusic/learn/audio/instruments/` (client-safe, nothing `.server`):

| File | Kind | Content |
|------|------|---------|
| `types.ts` | types | `InstrumentId`, `InstrumentMeta`, `Instrument`, `PlayOpts`, `NoteHandle`, `Zone`, `ZoneMap` |
| `catalog.ts` | data | one `InstrumentMeta` per instrument (range, polyphony, release, strum, bus gain, credit id, label key) and `defaultSoundFor(instrument)` |
| `zones-data.ts` | **generated**, committed | zone maps (`file`, `keyCenter`, `tuneCents`, `gainDb`, `startOffsetS`, `durationS`), header says generated, never hand-edit |
| `zones.ts` | pure | nearest zone, `playbackRate`, velocity curves, `coverage` |
| `voice-pool.ts` | pure | polyphony cap, stealing, mono legato rule |
| `load-machine.ts` | pure | the loading state machine (§3.3) |
| `chord.ts` | pure | strum offsets, guitar voicings, per-voice chord gain |
| `credits.ts` | data | the attribution text per credit id |
| `loader.ts` | browser | `fetch` + `decodeAudioData`, concurrency limit, retries |
| `sampler.ts` | browser | an `Instrument` backed by buffers |
| `engine.ts` | browser | shared master chain, registry, the synth bridge, `soundReady` |

### 3.2 The `Instrument` interface

```ts
export type InstrumentId = 'piano' | 'guitar' | 'violin' | 'flute';
// Extensible: a new instrument (cello, clarinet, oboe, sax, ukulele, organ, or the nylon guitar as
// 'guitar-nylon') is a new id, a catalog entry, a sources.json entry, a zones-data entry and files.
// 'guitar' means the steel-string acoustic; the Zod enum in schemas.ts is built from INSTRUMENT_IDS.

/** How many notes it can sound at once, which decides what it may be asked to play. */
export type Polyphony = 'chord' | 'double-stop' | 'mono';

export interface InstrumentMeta {
  id: InstrumentId;
  labelKey: string;                       // i18n key, c-rmhmusic
  range: readonly [low: number, high: number]; // SOUNDING MIDI range it can play
  polyphony: Polyphony;
  maxVoices: number;                      // piano 12, guitar 8, violin 2, flute 1
  releaseMs: number;                      // audible time after stop(), for the mic echo guard
  maxHoldMs: number;                      // a held note fades by this age (the sample runs out)
  strumMs: number;                        // 0: block chord; steel guitar 12: ms between strings
  busGain: number;                        // per-instrument trim into the master chain
  credit: 'salamander' | 'ella-gitauru' | 'vsco'; // (+ 'freepats-guitar' if the nylon fallback is chosen)
}

export interface PlayOpts {
  velocity?: number;   // 0..1
  when?: number;       // AudioContext time, seconds; default now
  duration?: number;   // seconds before an automatic release; default: until stop()
}

export interface NoteHandle {
  stop(when?: number): void;  // release (idempotent)
  readonly done: Promise<void>; // resolves when the note is silent and its nodes are disconnected
}

export interface Instrument extends InstrumentMeta {
  readonly state: LoadState;                       // from load-machine.ts
  load(opts?: { priority?: 'user' | 'prefetch' }): Promise<LoadState>; // single-flight
  canPlay(midi: number): boolean;                  // inside range and covered by a zone
  play(midi: number, opts?: PlayOpts): NoteHandle; // a silent no-op handle if not ready
  playChord(midis: readonly number[], opts?: PlayOpts & { style?: 'block' | 'strum' }): NoteHandle;
  stopAll(): void;
  dispose(): void;                                 // free decoded buffers, state -> idle
}
```

`voice.ts` keeps its exports (`playNote`, `RELEASE_MS` renamed in use to `soundReleaseMs()`, `MAX_VOICES`, `soundStatus`, `wakeSound`, `onSoundChange`) and the `PlayOptions.instrument` field already added in the working tree. `playNote(midi, { velocity, instrument })` resolves `instrument` through `engine.ts`: ready sampler plays, otherwise the existing triangle synth plays **only if the session has been resolved to synth** (§3.4); a note requested from an instrument that is still loading and not yet resolved is dropped with `NoteHandle` no-op and the caller's `soundReady` gate (below) is what prevents that from being reachable in a lesson.

### 3.3 Loading state machine (pure, TDD)

`load-machine.ts` follows the repo's `{ initial, step }` shape (`machines/runner.ts`).

```
State  = { kind: 'idle' }
       | { kind: 'loading'; done: number; total: number; startedAt: number; slow: boolean }
       | { kind: 'ready'; degraded: boolean }            // degraded: some zones missing, coverage still holds
       | { kind: 'failed'; reason: 'network' | 'cors' | 'decode' | 'coverage' | 'unsupported'; attempts: number; at: number }
Event  = { type: 'request'; now: number; user: boolean }
       | { type: 'zone-ok' } | { type: 'zone-failed'; reason }
       | { type: 'tick'; now: number }                    // marks slow after SLOW_MS
       | { type: 'settled'; coverageOk: boolean }         // all zone attempts finished
       | { type: 'dispose' }
Effect = { type: 'fetch-zones' } | { type: 'free-buffers' }
```

Rules (each a test): `request` in `idle` -> `loading` + `fetch-zones`; `request` in `loading` or `ready` is a no-op (single flight); `request` in `failed` retries only when `user` is true or `now - at >= RETRY_AFTER_MS` (60 s) and `attempts < 3`; `zone-ok` counts; `settled` with `coverageOk` -> `ready` (degraded if any zone failed), without -> `failed{coverage}` or the recorded reason; `tick` after `SLOW_MS = 2500` sets `slow` but never leaves `loading`; `dispose` in `ready` -> `idle` + `free-buffers`, in `loading` is ignored (let it finish; the bytes are small and cached); a stale `zone-ok` after `dispose` is ignored. `coverageOk` comes from `zones.coverage(zoneMap, loadedKeys, range, maxShift)`: every integer MIDI note in `meta.range` must have a loaded zone within the instrument's allowed shift.

Per-zone retry (inside `loader.ts`, not the machine): 2 retries at 400 ms then 1.2 s for network errors; `decodeAudioData` rejections are not retried; a CORS failure is not retried (it is deterministic).

### 3.4 The learner never answers a question they could not hear

The Phase 2 rule is: the ear machine advances to answerable only after a `played` event. This plan keeps that and adds exactly one decision, **wait up to `LOAD_WAIT_MS = 2500`, then fall back to the synth for the rest of the session, say so once.**

* `engine.soundReady(id, { waitMs = LOAD_WAIT_MS }): Promise<SoundChoice>` where `SoundChoice = { kind: 'instrument'; id } | { kind: 'synth'; reason: 'timeout' | 'failed' | 'unsupported' }`. If the instrument is `ready` it resolves immediately. If `loading` it resolves when ready or at `waitMs`, whichever is first; `idle` starts the load (`user: true`) then waits; `failed` resolves `synth` at once.
* **Sticky:** `engine.ts` remembers the answer per lesson session (`beginSoundSession()` called by a lesson on mount) so a question is never voiced by a different timbre than the previous one in the same attempt. If the samples arrive late, the *next* lesson attempt uses them.
* The lesson (EarLesson, MatchNoteLesson, the note finder) calls `soundReady` before sending its `replay`/`hear` event. While it waits the same fixed-height sound line the lessons already have says (new keys, `c-rmhmusic`): **"Loading the {{instrument}} sound."** and answers stay disabled, exactly like a suspended audio context today. On `synth` it says once: **"Couldn't load the {{instrument}} sound. Playing a simple tone."**, then proceeds; `played` fires when the synth note starts, so the machine never advances unheard.
* Out of range is not a loading problem: question generators take the instrument's `range` (§5.2) so a violin is never asked for a C2. For the on-screen keys, a tapped key outside the instrument's range sounds on the synth for that note only (a single wrong-timbre note is better than silence; rare, so it gets no copy).

### 3.5 Preloading policy

* **Nothing loads at page load, on the RMH Music home, or in `LearnHome`.** Entering a lesson route whose mode makes pitched sound (`ear-interval`, `ear-chord`, `match-note`, `fretboard`, `play-note`, `staff-flashcards`) calls `instrument.load({ priority: 'prefetch' })` for the learner's sound in a route `useEffect`, deferred with `whenIdle` from `lib/shared/platform.ts` (2 s timeout) so it never competes with first paint.
* Picking a sound in the Sound dialog calls `load({ priority: 'user' })` and the option's "Hear it" button plays C4 (or the instrument's nearest note) through it: choosing an instrument is its own load test.
* Skip prefetch when `navigator.connection?.saveData` is true; the lesson then loads on its first `soundReady`.
* Concurrency: 4 parallel `fetch` + `decodeAudioData` per instrument, one instrument loading at a time (a second request queues).
* The `AudioContext` must exist to decode (`decodeAudioData` is a context method). `getAudioContext()` creates it but it stays `suspended` until a gesture; decoding works while suspended, playing does not. `wakeSound()`/`resumeAudio` stay the gesture path, unchanged. iOS: nothing extra beyond today's resume-in-the-tap; the **ringer/silent switch mutes Web Audio on iOS Safari** (known platform behaviour, not verified here); the existing "Sound isn't playing" sentence cannot detect it. Listed under verification and open questions.

### 3.6 Playing: pitch, gain, polyphony, release

* **Nearest zone and pitch shift:** pure `nearestZone(zones, midi)` picks the zone with the smallest `|midi - keyCenter|`; a tie goes to the zone above (shifting down keeps the timbre darker and less thin than shifting up). Reject when the distance exceeds `maxShift` (piano, guitar 1; violin, flute 2). `playbackRate = 2 ** ((midi - keyCenter) / 12 + tuneCents / 1200)`. Use `playbackRate`, not `AudioBufferSourceNode.detune` (older Safari lacks `detune`). A sample plays from `startOffsetS` (the trimmed pre-roll), so attack is immediate.
* **Gain staging:** the build normalises every zone to the same loudness (RMS over the first second to -23 dBFS, peak limited to -3 dBFS) and stores `gainDb`, so zones differ by under 1 dB without runtime guessing. Runtime: `source -> voice gain (velocity curve x chord gain) -> instrument bus (busGain) -> master (0.8) -> DynamicsCompressorNode (threshold -12 dB, knee 12, ratio 6, attack 3 ms, release 150 ms) -> destination`. Chord gain is `1 / sqrt(n)` over the `n` voices that start together, so a six-string strum is -7.8 dB per string and a triad -4.8 dB. The compressor is the safety net, not the plan. The synth keeps its own `PEAK = 0.18` path to `destination`, unchanged.
* **Velocity:** `velocityGain(v) = 0.2 + 0.8 * v ** 1.6` (v clamped 0.05 to 1). Piano also darkens soft notes with a one-pole low-pass on the voice: cutoff `700 + 11000 * v ** 1.5` Hz. One recorded layer (Salamander `v8` of 16) is enough because the programme sounds its own notes at a near-fixed velocity (screen taps send 0.8; MIDI keyboards have their own sound and are never sounded). A second layer is a byte-budget option, +0.53 MB, deliberately not built.
* **Voice pool** (`voice-pool.ts`, pure): `maxVoices` per instrument. When full, steal the oldest voice **already in release**, then the oldest held voice. `mono` instruments (`maxVoices` 1): a new note releases the previous one with a 70 ms legato release and starts at once (no overlapping sustain, no click: the new note has a 4 ms gain ramp). The exported `MAX_VOICES` (used by `useNoteSound`) becomes `12`, the largest.
* **Release and the mic echo guard:** `stop()` ramps the voice gain to zero over the instrument's `releaseMs` (piano 300, steel guitar 200, violin 250, flute 150), regardless of how long the sample would naturally ring. Bronze strings ring far longer than the synth, but the guitar's 200 ms is a gain ramp we apply on `stop()`, not the string's decay, so the steel guitar needs no longer value than the nylon one would. So the **audible time after release is a constant we control**, and `echo-window.ts` gets it from `soundReleaseMs()` = `max(releaseMs)` of the active sound (a function in `voice.ts`, replacing the literal `RELEASE_MS` that `MatchNoteLesson` passes to `createEchoGuard`). `ECHO_TAIL_MS` (400) and `REPLAY_CONFIRM_MS` (250) are unchanged; Task 10 includes a browser check that a released note's RMS is under -60 dBFS within `releaseMs` + 50 ms. A held note that outlasts its sample fades out at the end of the sample (`maxHoldMs` is per zone, derived at build time as the zone's `durationS` minus its final fade: piano 2.7 s, or 1.7 s above C6; steel guitar 3.5 s for the six zones below MIDI 52 and 3.0 s above; violin 3.5 s; flute 3.0 s); lessons hold notes for 0.7 to 1.5 s, so this is a cap, not a feature.
* **Hint length vs echo window:** `MatchNoteLesson` calls `guard.hint(now, HEAR_MS = 900)`. A sampled note has its loudest energy in the first 300 ms and a longer natural decay than the synth; because `hint` registers the full window and the guard adds the 400 ms tail, nothing changes, but the lesson must stop the hint with `release()` at `HEAR_MS` (it does) so `releaseMs` bounds the audible tail.

---

## 4. The learner setting

* **Name and storage:** "Sound" (UI), `sound` (code). Add a nullable column `sound VARCHAR(24)` to `MusicLearnProfile` (`prisma/schema.prisma`, one additive migration `prisma/migrations/2026110920xxxx_music_learn_sound/migration.sql`: `ALTER TABLE "music_learn_profile" ADD COLUMN "sound" VARCHAR(24);`). `null` means "follow the instrument": `defaultSoundFor('piano') = 'piano'`, `defaultSoundFor('guitar') = 'guitar'` (the steel-string acoustic; if the owner takes the nylon fallback, the same id keeps meaning "the guitar" and only the samples behind it change). Violin and flute are only reachable by explicit choice, because `INSTRUMENTS` (the learner's own instrument) stays `piano | guitar`.
* **Schema and store:** extend `profileSchema` with `sound: z.enum(INSTRUMENT_IDS).nullable().optional()` (optional so an older tab's PUT, which omits it, does not wipe the choice: `saveProfile` writes `sound` only when the key is present); `Profile`/`DEFAULT_PROFILE`/`toProfile` gain it; `learn-data.ts` already types changes generically by `ProfileKey`, so `setSound(id | null)` in `store.ts` is `change({ key: 'sound', value })` beside `setInstrument`. Signed-out learners keep the choice in memory for the session (the store already runs lessons without saving); nothing goes to `localStorage` for it.
* **Where it lives in the UI:** a "Sound" text button next to the instrument picker in `LearnHome` (the control around line 168) opening a small dialog like `InputSetup`: a radio list of the four sounds, each with a "Hear it" text button, and a "Sound credits" link to `/rmhmusic/credits`. Four options might fit a segmented control at 360 px, but the list is built for more (cello, clarinet, ... are expected), so it is a list from the start. No eyebrows, badges or chips (Phase 2 look rules). A lesson's existing sound line may carry a "Change sound" text link later (optional, Task 9).
* **Honoured by:** ear intervals, ear chords (polyphonic sounds only, §5.3), the Hear it hint in the pitch match, the note finder/fretboard taps, the on-screen and computer keys (`useNoteSound`), flashcard reveals, the first-note lesson. **Neutral synth, unchanged:** the timing check's clicks, the metronome and tap-the-beat clicks, the 3/4-vs-4/4 patterns (they are rhythm, not pitch).
* One timbre trains one timbre. A "Mixed" option (a different instrument each question) is a real pedagogical choice and an open question for the owner; the interface supports it (a per-question `InstrumentId`).

---

## 5. Realism details that matter for training

### 5.1 Pitch correctness

* The engine plays **sounding** MIDI numbers, the same numbers the hub reports (`STANDARD_TUNING = [40,45,50,55,59,64]` in `theory/fretboard.ts`). The steel-guitar zones are baked to sounding pitch (the `40` zone is the open low E; its YIN reading is 40.08); the written-an-octave-higher convention (`writtenMidi`) is a display concern only and the engine never transposes. A test pins `play(40)` on the guitar to the zone with key centre 40 and `rate = 1`. The fretboard lessons only reach MIDI 69 (fret 5 of the high E), well inside the 40 to 78 zones.
* Every shipped zone's key centre and cents come from the build's YIN measurement (§2.1 trap 1); a committed manifest test checks `|measured - keyCenter| < 0.35 semitone`.

### 5.2 Instrument ranges feed the question generators

A violin cannot play C3 and a flute cannot play C2. `InstrumentMeta.range` is the playable sounding range (violin 55 to 96 with 55 to 88 used by lessons, flute 60 to 96, steel guitar **40 to 79** (the highest zone is F#5 = 78, plus one semitone of shift), piano 36 to 96 inside Salamander's wider zones). `makeQuestion` in `machines/ear.ts` already takes a root range (C3 to C5, both notes within C2 to C6); extend it with an optional `range` argument that clamps the pool. The lesson passes `catalog[sound].range`. A pure test: for each instrument, 200 seeded questions all satisfy `canPlay`.

### 5.3 Chords, and why violin and flute do not play them

* **Piano: block chord.** All notes start on the same `when`. No humanise (the lesson tests chord quality and a clean simultaneous onset is the cleanest cue).
* **Guitar: strummed chord.** A down-strum, low string first, `strumMs = 12` between strings (a six-string strum spans 60 ms), a deterministic +-3 ms humanise from a seeded `rand`, velocity falling 1.0 to 0.85 from bass to treble. Why 12 and not the 14 ms that suited a fingered nylon guitar: a flat-pick strum on bronze strings is quicker, and a steel guitar's bright, long-ringing notes make a wider onset spread read as an arpeggio rather than one chord, which is the wrong cue for chord-quality training. 60 ms is still clearly a strum and stays well inside the 80 ms where listeners hear one event. Pure `strumOffsets(n, strumMs, rand)` in `chord.ts`.
* **Guitar voicings** (`guitarVoicing(root, quality) -> sounding MIDI[]`, pure). The ear lessons ask for a root (C3 to C5) and a quality (major, minor, diminished, augmented), and the answer is judged on pitch classes, so any voicing is acceptable **if it contains exactly those pitch classes**. Use: (1) an open-chord table when it matches: C `x32010 = [48,52,55,60,64]`, D `xx0232 = [50,57,62,66]`, E `022100 = [40,47,52,56,59,64]`, G `320003 = [43,47,50,55,59,67]`, A `x02220 = [45,52,57,61,64]`, Em `022000 = [40,47,52,55,59,64]`, Am `x02210 = [45,52,57,60,64]`, Dm `xx0231 = [50,57,62,65]` (each computed from `STANDARD_TUNING` + frets and checked in a test); (2) otherwise a spread voicing that is always playable as a barre shape: intervals `[0,7,12,16]` major, `[0,7,12,15]` minor, `[0,6,12,15]` diminished, `[0,8,12,16]` augmented above a bass note folded into E2 to E3 (MIDI 40 to 52), so every note stays within E2 to F#5 (MIDI 40 to 78, the sampled steel-guitar range; the highest spread note is 52 + 16 = 68). Tests: `chordQuality(guitarVoicing(r, q)) === q` for all roots and qualities; the lowest note is never below 40 and the highest never above 78. Because zones are 1 to 2 semitones apart and every note is sounded at its true pitch, an open-position chord keeps its real open-string character (the open strings are the unshifted 40, 45, 50, 59 zones).
* **Mono and double-stop sounds do not play triads.** A single flute sounds one note; stacking three recordings of it would be a synthesised organ, not a flute, and would teach the wrong timbre for chord quality. A violin can sound two notes (a double stop) but a rolled triad from single-note recordings with vibrato is a chorus effect. **Decision: chord ear training and the play-a-chord lesson use only `polyphony: 'chord'` sounds (piano, guitar).** If the learner's chosen sound is monophonic, those lessons use their instrument's default sound (`defaultSoundFor(profile.instrument)`) and say one plain sentence in the sound line: **"Chords use the {{instrument}}. Notes and intervals use your {{sound}}."** The Sound dialog marks nothing; the sentence appears only where it applies.
* **Which lessons suit which sound:** piano and guitar: everything. Violin: single notes, melodic intervals, and harmonic intervals (two simultaneous notes, `double-stop`), not triads. Flute (a monophonic wind): single notes and **melodic** intervals only (two notes in sequence, which is already how `ear-interval` plays them with `sequence.ts`); a harmonic (simultaneous) interval is not offered, because one flute cannot play it, and a "block of stacked flute voices" is rejected for the reason above. Melodies (a future lesson) suit all four. Any clarinet, oboe or saxophone added later follows the flute's rules (`polyphony: 'mono'`).

### 5.4 Attack and release character

* **Piano:** immediate attack (the build trims Salamander's per-zone pre-roll, 694 to 1771 samples at 48 kHz, as in its `offset` table), release 300 ms like a damper falling. No pedal, no hammer-noise or string-resonance layers (they are separate Salamander sample sets we do not ship).
* **Guitar (steel-string):** the plucked transient is in the sample; release 200 ms stands for a hand damping the strings. Use the `mf` layer only: the author's guide says the `f` and `ff` samples have a pitch glide baked in (they start sharp and settle), which is wrong for a pitch-training tone. The samples are stored as 16 kHz Vorbis at the open-string pitch, so the baked low zones (frets 0 to 3) have no content above about 8 kHz, while higher frets regain bandwidth when restored; the author also high-shelved the samples. Expect a slightly dull low E and a bright high string, and no palm mute, harmonics or hammer-on (they exist in the package and are not used).
* **Violin:** the VSCO "Arco Vib" notes are bowed sustains with vibrato (the only arco set in the folder; there is no non-vibrato violin). That is realistic and fine for interval training at musical pitch; the only unnatural thing is pitch-shifting vibrato by up to 2 semitones (rate changes by under 12%). The samples have their own bow attack; the engine adds only a 4 ms anti-click ramp and a 250 ms release. Legato in a melody is the mono rule (70 ms overlap-free handover); true sampled legato does not exist in the set and is not faked.
* **Flute:** a sustain with a natural breath attack (the no-vibrato `susNV` set is used deliberately, so pitch is clear); 150 ms release; monophonic handover as for the violin. Holds longer than the 3.0 s sample fade out.

---

## 6. Tasks

Pure parts are test-first and live in vitest like the rest of `lib/rmhmusic/learn/`. Browser parts are verified in a real browser. Every commit passes `pnpm check:consistency`; trailers as in the Phase 2 plan.

| PR | Tasks | Nature |
|----|-------|--------|
| G | 1 to 7 | Engine and assets; the synth is still the default, so shipping G changes no sound. |
| H | 8 to 10 | The setting, the credits page, lesson wiring, verification and docs. One additive migration. |

### Task 1: Zone maths (pure)

**Files:** create `lib/rmhmusic/learn/audio/instruments/zones.ts`, test `zones.test.ts`.

**Interfaces:** `interface Zone { file: string; keyCenter: number; tuneCents: number; gainDb: number; startOffsetS: number; durationS: number }`; `nearestZone(zones: readonly Zone[], midi: number, maxShift: number): { zone: Zone; rate: number } | null`; `playbackRate(midi, zone): number`; `velocityGain(v: number): number`; `velocityCutoffHz(v: number): number`; `coverage(zones, loaded: ReadonlySet<string>, range, maxShift): boolean`.

- [ ] **Step 1: Failing tests.** `nearestZone` picks the closest key centre; a tie goes to the zone above; returns null beyond `maxShift`; `playbackRate(60, {keyCenter: 60, tuneCents: 0})` is exactly 1; `playbackRate(61, {keyCenter: 60, tuneCents: -6})` is `2 ** (1/12 - 6/1200)`; an octave up is 2; `velocityGain` is monotone, `velocityGain(0)` and `velocityGain(1)` are finite (0.2 + floor, 1.0), NaN input returns the default; `coverage` is false when one note in range has no loaded zone within the shift, true after that zone loads; `coverage` with the Salamander zone list (every 3 semitones, shift 1) over 36 to 96 is true, with shift 0 is false.
- [ ] **Step 2: FAIL, Step 3: implement, Step 4: PASS.** Commit `feat(rmhmusic): zone maths for sampled instruments`.

### Task 2: Voice pool (pure)

**Files:** create `voice-pool.ts`, test `voice-pool.test.ts`.

**Interfaces:** `createVoicePool(max: number, mono: boolean): { start(id: number, at: number): { release: number[] }; release(id: number, at: number): void; ended(id: number): void; readonly size: number }` (it only decides **which ids to release**; the sampler owns the nodes).

- [ ] **Step 1: Failing tests.** At the cap the oldest voice already in release is stolen first, else the oldest held; `mono` releases the previous voice on every start; `release` twice is a no-op; `ended` removes the voice; starting the same id twice does not duplicate; 1000 random start/release/end operations never exceed `max` held voices and never throw.
- [ ] **Step 2 to 4.** Commit `feat(rmhmusic): a voice pool for sampled instruments`.

### Task 3: Loading state machine (pure)

**Files:** create `load-machine.ts`, test `load-machine.test.ts`. Interfaces and rules exactly as §3.3.

- [ ] **Step 1: Failing tests,** one per rule in §3.3: single-flight; `failed` retried only for `user` or after 60 s and under 3 attempts; `slow` set by `tick` after 2500 ms without leaving `loading`; `settled` coverage and degraded; a stale `zone-ok` after `dispose` ignored; `dispose` while loading ignored; every state reachable and no event throws in any state (a table-driven sweep of all state x event pairs).
- [ ] **Step 2 to 4.** Commit `feat(rmhmusic): the loading state machine for instrument sounds`.

### Task 4: Chords (pure)

**Files:** create `chord.ts`, test `chord.test.ts`.

**Interfaces:** `strumOffsets(n, strumMs, rand): number[]` (seconds, ascending, first is 0); `chordGain(n): number` (`1/sqrt(n)`); `guitarVoicing(root: number, quality: ChordQuality): number[]`; `OPEN_VOICINGS`. Consumes `ChordQuality`, `chordQuality` from `../../theory/chords`, `STANDARD_TUNING` from `../../theory/fretboard`.

- [ ] **Step 1: Failing tests.** Offsets ascend and are deterministic for a seeded `rand`, humanise stays within +-3 ms, total span for six strings is under 100 ms; `chordGain(1)=1`, `chordGain(4)=0.5`; each `OPEN_VOICINGS` entry equals the string/fret arithmetic and `chordQuality` of it is the intended quality; for every root 36 to 72 and every quality, `guitarVoicing` has exactly the chord's pitch classes, lowest note in 40 to 52, highest at most 78 (the top sampled steel-guitar zone).
- [ ] **Step 2 to 4.** Commit `feat(rmhmusic): chord strumming and guitar voicings`.

### Task 5: The sample build script, the committed assets, the zone maps

**Files:** create `scripts/rmhmusic-samples/sources.json`, `scripts/rmhmusic-samples/build.ts`, `lib/rmhmusic/learn/audio/instruments/zones-data.ts` (generated), `lib/rmhmusic/learn/audio/instruments/catalog.ts`, `credits.ts`, the MP3s under `public/music/rmhmusic/instruments/{piano,guitar,violin,flute}/`; modify `.gitignore` (`scripts/rmhmusic-samples/.cache/`); test `lib/rmhmusic/learn/audio/instruments/assets.test.ts`.

**What `sources.json` pins, per instrument:** the source URL of every file (commit-pinned `raw.githubusercontent.com` for Salamander at `3382bf9496bba2486f5ab0de55a264d1dfc38404`, VSCO 2 CE at `440300901dfe9275fd84e0b7763af1f8443ae62e`; the steel guitar's Google Drive RAR, whose id and SHA-256 are in §2.4), its SHA-256, the zone it becomes, the trim (`durationS` 3.5 s, 2.5 s for Salamander above C6, 4.0 s for violin and for the six steel-guitar zones below MIDI 52 and 3.5 s above, 3.5 s flute), a 0.5 to 0.8 s final fade, `maxShift`, and for the steel guitar a per-zone `restore` (`{ sourceRate: 16000, fret }`, baked with `asetrate = sourceRate * 2^(fret/12)` then `aresample=44100`). **The 20 steel-guitar zones (key centre: file) are 40: `6E-mf00`, 43: `6E-mf03`, 45: `5A-mf00`, 47: `6E-mf07`, 49: `6E-mf09`, 51: `4D-mf01`, 53: `4D-mf03`, 55: `4D-mf05`, 57: `4D-mf07`, 59: `2B-mf00`, 61: `4D-mf11`, 63: `4D-mf13`, 65: `4D-mf15`, 66: `2B-mf07`, 68: `2B-mf09`, 70: `2B-mf11`, 72: `2B-mf13`, 74: `2B-mf15`, 76: `2B-mf17`, 78: `2B-mf19`** (the lowest fret that gives the pitch is taken, which favours the thicker string; I built exactly this set: 594,374 bytes).

**What `build.ts` does:** download to `.cache/` if missing; verify SHA-256 (fail on mismatch); for each zone: `ffmpeg` trim from `startOffsetS`, fade, mono, 44.1 kHz, `libmp3lame -b:a 64k -fflags +bitexact`; for the steel guitar first apply the `restore` bake (`asetrate`, then `aresample=44100`); measure RMS and pitch (YIN, the repo's `pitch/` module via `tsx`) on the **decoded output MP3** (so it checks what ships); fail on |pitch - keyCenter| >= 0.35 semitone or any octave error; compute `gainDb`; store the Salamander cents from `Data/tune_ret.txt`; write the MP3 and `zones-data.ts` (sorted, with a "generated" header and each MP3's SHA-256). Requires `ffmpeg` with libmp3lame on the developer's machine (and `unar` or `unrar` for the guitar's RAR5); it is not run in CI. I ran the equivalent of this pipeline by hand for the steel guitar in the research (script and numbers in §2.1 trap 3 and §7); the Salamander, violin and flute zones were measured per-file but not all baked.

- [ ] **Step 1: Failing test (`assets.test.ts`),** reading the committed files with `node:fs`: every `zones-data.ts` file exists under `public/music/rmhmusic/instruments/`, its SHA-256 matches, no file is over 40 KB, each instrument directory is under 650 KB and all together under 2.1 MB, every `catalog` entry has a `credits` entry, `keyCenter` values are inside the instrument's `range` plus its `maxShift`, and `coverage` over the declared range is true with shift = `maxShift`.
- [ ] **Step 2: FAIL. Step 3:** write the script, run it once (needs the network and `ffmpeg`), review `git diff --stat` (expect about 1.9 MB), commit assets and generated data together. **Step 3b: audition** (owner): play one note and one melodic interval per instrument from the committed MP3s (a local page or `ffplay`) before Task 6 starts; the decision whether the steel-guitar choice stands (versus the nylon fallback) is made here, on the sound as well as the licence. **Step 4: PASS.** Commit `feat(rmhmusic): converted samples for four instruments, with a reproducible build`. The commit message says why the binaries are committed (1.9 MB, immutable) and where the sources are.

### Task 6: Browser engine (loader, sampler, engine)

**Files:** create `loader.ts`, `sampler.ts`, `engine.ts`, `types.ts`; modify `lib/rmhmusic/learn/audio/voice.ts` (route `playNote` through `engine.ts`, keep the synth as `playSynth`, export `soundReleaseMs()`, `MAX_VOICES = 12`), `audio/sequence.ts` (pass `instrument`, add a chord helper that calls `playChord`); test `sampler.test.ts` with a fake `AudioContext` (as `clicks.test.ts` does) and `engine.test.ts` for `soundReady`.

- [ ] **Step 1: Failing tests** against fakes: `load()` drives the machine (fake `fetch` and `decodeAudioData`); 4 fetches in flight at most; a rejected fetch retries twice then reports `network`; a thrown `TypeError` from a cross-origin fetch maps to `cors`; `play(60)` on a ready sampler creates one source with `playbackRate` 1 and starts at `startOffsetS`; `stop()` ramps the gain to 0 over `releaseMs` and is idempotent; `playChord` with `strum` starts sources `strumMs` apart in order; `soundReady` resolves `instrument` immediately when ready, `synth/timeout` after `waitMs` with fake timers, `synth/failed` at once when failed, and is sticky within a session; `dispose` disconnects nodes and drops the buffers; out-of-range `play` returns a no-op handle.
- [ ] **Step 2 to 4.** Use `getAudioContext()` only; no `new AudioContext`; no rAF; no timers at rest. Browser pass in Chromium: load each of the four, play 20 notes and a chord, `console` clean, no CSP or CORS errors on the production origin. Commit `feat(rmhmusic): a sampled instrument engine behind voice.ts`.

### Task 7: Make the lessons ask `soundReady`

**Files:** modify `components/rmhmusic/learn/EarLesson.tsx`, `PlayChordLesson.tsx`, `MatchNoteLesson.tsx`, `FindNoteLesson.tsx`/`FretboardView.tsx`, `FirstNoteLesson.tsx`, `FlashcardLesson.tsx`, `useLearnInput.ts` (`useNoteSound`), `machines/ear.ts` (the `range` argument), `locales/*/c-rmhmusic.json` (via `pnpm i18n:extract`, new keys only).

- [ ] **Step 1: Failing tests** for `ear.ts` (`range` clamps every question for each instrument's range), and for a small pure helper `soundLine(state, sticky)` that chooses the sentence (loading / fell back / chords-use-piano / none).
- [ ] **Step 2 to 4.** Each lesson calls `beginSoundSession()` on mount, awaits `soundReady` before its replay/hear, shows the sentences from §3.4 in its existing fixed-height line (no layout shift; the line box already exists), and `MatchNoteLesson` passes `soundReleaseMs()` to `createEchoGuard`. `useNoteSound` passes `{ velocity, instrument }`. Chord lessons pick the polyphonic sound (§5.3). Look rules: no badge, no chip, no emoji, copy short and literal. Browser pass at 390 x 844 and 1280 x 800, both themes, with a throttled network (Fast 3G) to see the "Loading" sentence and the 2.5 s fall back, and offline to see the failed path; layout-shift observer reads 0. Commit `feat(rmhmusic): lessons wait for the chosen sound, or fall back to the tone`. Ship PR G.

### Task 8: The setting

**Files:** `prisma/schema.prisma` (`sound String? @db.VarChar(24)`), `prisma/migrations/2026110920xxxx_music_learn_sound/migration.sql`, `lib/rmhmusic/learn/schemas.ts`, `progress.server.ts`, `machines/learn-data.ts`, `store.ts` (`setSound`), `components/rmhmusic/learn/SoundSetup.tsx`, `LearnHome.tsx`, `app/routes/rmhmusic/credits.tsx`; tests `schemas.test.ts`, `progress.server.test.ts`, `learn-data.test.ts`.

- [ ] **Step 1: Failing tests.** `profileSchema` accepts `sound: null`, an id, and a missing key; rejects an unknown id; `saveProfile` without `sound` leaves the stored value alone, with `sound: null` clears it; `toProfile` returns `sound: null` for an old row; `learn-data` change of `sound` rides a PUT like `instrument`; `defaultSoundFor('guitar')` is `guitar`.
- [ ] **Step 2 to 4.** `pnpm exec prisma validate`, `pnpm exec prisma format --check`, the repo's additive-migration check if present. `SoundSetup` lists the four sounds with "Hear it", a "Sound credits" link, 44 px targets, focus returns to the Sound button on close. The credits page renders `credits.ts`. Commit `feat(rmhmusic): choose the sound you train with`.

### Task 9: Optional polish (only if wanted)

A "Change sound" link in the ear lesson's sound line; a second Salamander velocity layer (+0.53 MB); the offline cache (`caches.open('rmh-samples-v1')`); a "Mixed" sound. Each is its own commit; none is needed for the owner's request.

### Task 10: Verification and close-out

- [ ] Decode check in **Chromium** (done once in research: Chrome 153 decodes the MP3s with onsets equal to the source), **Firefox** and **WebKit** via Playwright (`pnpm exec playwright install firefox webkit` where the network allows): a script loads each instrument, asserts `decodeAudioData` succeeds for every zone, the decoded duration is within 20 ms of the manifest's `durationS`, and the first sample above 5% of peak is within 5 ms of Chromium's. Not verifiable from this sandbox (no Firefox/WebKit installed); **a real iPhone and a real Mac Safari pass is the owner's** (silent switch, `interrupted` context after a call, background/foreground, decode time on a 2-3 year old phone).
- [ ] No work at rest: the Performance panel on a lesson route before any sound shows no `fetch` of samples, no audio decoding, no rAF from this code; after the sound is ready and the learner is idle, still none (the existing audit `pnpm audit:pages` plus a manual trace).
- [ ] CLS 0 across ask, loading sentence, fall back, ready (the layout-shift observer from the Phase 2 browser passes).
- [ ] Echo guard: with the real samples, play a piano C4 and a violin G4 through `MatchNoteLesson`'s hint path, release, and assert the output RMS is below -60 dBFS within `soundReleaseMs() + 50 ms` (OfflineAudioContext or an `AnalyserNode` read in the browser pass).
- [ ] After the first production deploy: `curl -I` one versioned sample URL: `cache-control` has `immutable`, `access-control-allow-origin: https://rmhstudios.com`, `cf-cache-status: HIT` on the second request. If the status stays `DYNAMIC`, add a Cloudflare cache rule for `cdn.rmhstudios.com/static/*` (the owner's hand step; nothing in this repo).
- [ ] Docs: a section in `docs/` for the programme (instruments, licence table, how to add an instrument: sources.json entry + catalog + `pnpm exec tsx scripts/rmhmusic-samples/build.ts` + credit), `lib/CLAUDE.md` rmhmusic line (audio: samples), `data/site-knowledge.json` via `scripts/build-site-knowledge.ts`. `pnpm check:consistency`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- [ ] Ship PR H.

---

## 7. Byte budget and risks

| Instrument | Zones | Per zone | Total | Measured or estimated |
|------------|-------|----------|-------|-----------------------|
| Piano (Salamander `v8`) | 21 (12 x 3.5 s, 9 x 2.5 s) | 28.5 KB / 20.5 KB | **~0.53 MB** | per-zone sizes measured (C4 28,465 B, C6 20,524 B); total computed |
| Guitar (Ella Gitauru, steel string, `mf`) | 20 (6 x 4 s, 14 x 3.5 s) | 32.6 KB / 28.5 KB | **0.59 MB** (594,374 B) | **measured**: the 20 zones were baked, encoded and decoded; YIN worst error 8 cents (nylon fallback: 421,962 B for 20 zones) |
| Violin (VSCO `Arco Vib` f) | 15 | 32.6 KB | **~0.49 MB** | per-zone measured (4 s A4: 32,644 B); total computed |
| Flute (VSCO susNV) | 10 | 28.6 KB | **~0.29 MB** | per-zone measured (3.5 s A4: 28,633 B) |
| **All four** | 66 | | **~1.9 MB** (0.53 + 0.59 + 0.49 + 0.29 = 1.90) in git and on R2 | |

Largest single download for one learner: 0.59 MB (steel guitar), inside the "about 0.6 MB" target and 40% of the 1.5 MB budget. Adding clarinet and oboe later would be about +0.3 MB each. Decoded memory: 6 to 12 MB per instrument, two at most resident.

**Risks and how the plan treats them**

1. **Licence provenance of CC0 sets** (§2.2): get counsel to confirm the Versilian statement; the piano (CC BY 3.0) and the steel guitar (MIT notice plus the author's alteration-attribution sentence) are the attribution-bound sets, and the credits page is part of Task 8. The guitar's licence text lives only in the author's user guide and catalogue document inside a Google Drive RAR, not in a repository `LICENSE` file; if that is not firm enough for the owner, the CC0 nylon fallback has a plain `cc0.txt`.
2. **Safari/Firefox decode and encoder delay** are unverified here: Task 10, and the format can change to AAC or Opus per browser without changing the zone maps.
3. **CORS on the CDN is origin-allowlisted** (§2.5): preview deployments, localhost with a CDN set, and Discord origins fall back to the synth by design.
4. **Sound quality by ear is unverified.** The catalogue's descriptions and the file properties are encouraging (Salamander 16 layers and minor-third sampling; VSCO "sample cutting by Elan Hickler", close-miked solo recordings), but no one has listened to the converted files. Task 5's Step 3b is an audition by the owner of one note and one interval per instrument, before anything is wired. For the steel guitar in particular: the source is 16 kHz Vorbis restored by a rate change, high-shelved by the author, with Elixir coated strings, so the low strings may sound duller than a real dreadnought; the check I could run (pitch, onset, decode) passed, but brightness is a listening question.
5. **Violin timbre vs vibrato:** the violin is a vibrato set. If the owner finds that distracting for interval training, the alternative is the Bigcat cello (no vibrato, but a cello) or a different bowed source; the interface does not change.
6. **Gaps in my verification:** I did not audition any audio, did not decode in Firefox/WebKit, did not test on a phone, did not measure the VCSL Steinway B (the CC0 piano fallback), organ, ukulele (sizes only) or cello, and did not read the Accurate-Salamander project.

---

## 8. Open questions for the owner

1. **Instrument list:** are piano, steel-string guitar, violin and flute right for v1? Each addition is about 0.3 to 0.5 MB, one `sources.json` entry and one catalog entry. Pre-measured candidates: clarinet and oboe (VSCO 2 CE, CC0, ~0.3 MB each, ready to add), cello (Bigcat, CC0), ukulele (FreePats, CC0, ~0.2 MB), pipe organ (VCSL or FreePats, CC0), saxophone (VCSL tenor, CC0).
1a. **Steel-string guitar: accept the licence and the source?** Ella Gitauru is MIT with one added sentence (alterations we distribute must be attributed to whoever made them, which our credits line does), its licence text is in the author's guide inside a 241 MB Google Drive RAR rather than a repository, and the audio is 16 kHz Vorbis restored by a rate change. If any of that is unacceptable, the fallback is the CC0 FreePats nylon-string classical guitar (0.42 MB, plain licence file), kept as "the acoustic guitar" (it is acoustic too, but it is a nylon classical guitar). Which?
2. **Byte budget:** 0.59 MB for the largest instrument (budget 1.5 MB). Spend more on quality (a second piano velocity layer, +0.53 MB; 96 kbps instead of 64, +50%)? Or less (Opus later, -17%)?
3. **Attribution:** is a credits page at `/rmhmusic/credits` (linked from the Sound dialog, no footer) enough for the Salamander CC BY 3.0 requirement, or does the site's legal pages need a line too? Or prefer the no-attribution CC0 VCSL Steinway B (needs an audition and a measure first)?
4. **A "Mixed" sound** (a different instrument each question) for ear training?
5. **Default for learners who never open Sound:** follow the instrument (piano, steel-string guitar) as planned?
6. **iOS silent switch:** acceptable that a muted iPhone looks like "sound is on but nothing plays", as it does today with the synth? (A silent `<audio>` workaround exists and is deliberately not planned.)
7. **Sequencing:** this plan starts after the Task 8 and 9 agent lands; confirm no one else is editing `voice.ts` or `sequence.ts` at that point.
