# 04 — Export a mix and MIDI from the Studio

Surface: RMH Studio's project menu (`components/studio/ProjectsMenu.tsx`), the
`project.export` keybind, and the Studio challenge entry form
(`components/studio/creative/ChallengePanel.tsx`). App tier (L8). Wave 5.
Namespace `studio-export`.

## User story

As someone who finished a track in RMH Studio, I want to export it as a WAV file
I can play anywhere or enter into a Studio challenge, and to take my melodies to
another program as a MIDI file (or bring a MIDI file in), so that what I make in
the Studio does not stay trapped in the Studio.

## Requirements elicitation

- **What exists (verified):**
  - `project.export` is a bound keybind (`lib/studio/keybinds.ts`) with no
    handler in `lib/studio/hooks/useKeybinds.ts`.
  - The challenge entry form accepts an "Audio bounce (WAV or MP3, up to 8 MB)"
    upload and sniffs WAV, MP3, OGG, WebM and M4A
    (`lib/studio/challenge/shared.ts`); members must render it elsewhere.
  - The engine is Tone.js, imported lazily (`lib/studio/engine/StudioEngine.ts`),
    with a master channel, limiter, analyser and meter. Tone provides
    `Tone.Offline` for faster-than-real-time rendering.
  - Clips are audio, MIDI (`MidiNote[]`) or pattern clips (`lib/studio/types.ts`).
  - `lib/rmhmusic/learn/input/midi-parse.ts` parses live MIDI input messages,
    not Standard MIDI Files.
- **Decisions:**
  - **Export mix:** WAV, 44.1 kHz or 48 kHz (the project's context rate), 16-bit
    or 24-bit PCM, stereo; range "whole song" (first clip start to last clip
    end, plus a 2-second tail) or "loop region". Rendering is offline
    (`Tone.Offline`) on the client; nothing is uploaded.
  - A cap of 10 minutes of audio per export (a 10-minute 48 kHz 24-bit stereo WAV
    is about 173 MB; the cap keeps memory bounded on phones). Longer ranges are
    refused with the reason before rendering starts.
  - Rendering shows progress and can be cancelled; the live transport is stopped
    during a render.
  - **Use in a challenge:** when the challenge panel is open for an active
    challenge, "Export for this challenge" renders 16-bit 44.1 kHz and hands the
    file to the existing upload input if it is within the 8 MB limit (about 47
    seconds of stereo 16-bit audio); otherwise it says the file is too large and
    offers the download. It never bypasses the existing upload checks.
  - **MIDI export:** Standard MIDI File type 1, one track per MIDI or pattern
    track (patterns flattened to notes; drum patterns on channel 10), tempo and
    time signature from the project, 480 ticks per quarter note.
  - **MIDI import:** type 0 and 1 files up to 1 MB; each MIDI track with notes
    becomes a new Studio MIDI track with one clip; the project tempo is offered
    (not forced) from the file's first tempo event. Malformed files are refused
    with a message; the parser never throws past its boundary.

## Functional requirements

1. FR-1 The project menu gains "Export mix…", "Export MIDI" and "Import MIDI…";
   `project.export` opens "Export mix…".
2. FR-2 "Export mix…" is a dialog in the Studio's look: range, sample rate (read
   only, shown), bit depth, file name (defaults to the project name), Render.
   During render: a progress bar, elapsed and estimated time, Cancel. When done
   the browser downloads `<name>.wav`.
3. FR-3 "Export MIDI" downloads `<name>.mid` at once; when the project has no
   MIDI or pattern notes it explains why instead.
4. FR-4 "Import MIDI…" opens a file picker (`accept=".mid,.midi,audio/midi"`),
   parses, shows a summary (tracks, notes, tempo) and "Add N tracks", as one
   history step (03's history).
5. FR-5 In the challenge panel, "Export for this challenge" (FR decisions) sits
   beside the existing upload control.
6. FR-6 Muted tracks are excluded from the mix; solo is honoured as in playback.

## Non-functional requirements

- **Performance:** rendering runs in an `OfflineAudioContext` via `Tone.Offline`
  and does not start a `requestAnimationFrame` loop; progress is reported from
  the render's own callbacks or a coarse timer that stops with the render (the
  rAF allowlist gate must pass). WAV encoding streams into a `Blob` in chunks so
  peak memory is about one copy of the PCM data.
- **Correctness:** the offline graph is built by the same code that builds the
  live graph (refactor rather than duplicate), so the export sounds like
  playback. Vitest runs in Node, which has no `OfflineAudioContext`, so the
  product suite does not render audio: it checks that `render.ts` calls the
  same graph builder the live engine calls (injected Tone stub, recorded
  calls) and that the requested length, rate and channel count reach
  `Tone.Offline`. Sound is checked in the browser pass (a one-bar sine pattern
  exports to a non-silent WAV of the right length), which the acceptance
  criteria list.
- **Security:** nothing leaves the device; MIDI parsing is bounds-checked (every
  read checks remaining length; variable-length quantities capped at 4 bytes;
  at most 64 tracks and 200 000 events).
- **i18n:** `studio-export`.
- **Design:** app tier (L8): the Studio's own dialog and button styles.
- **Accessibility:** the progress bar is a `progressbar` with
  `aria-valuenow`; completion and errors are announced in a polite live region.

## Data model and API

None (client-only). Files:

- `lib/studio/export/wav.ts` (pure: PCM interleave and RIFF header, 16 and
  24 bit), `lib/studio/export/render.ts` (offline render using the shared graph
  builder), `lib/studio/export/range.ts` (pure: song and loop ranges, tail, cap).
- `lib/studio/midi/smf-write.ts`, `smf-read.ts` (pure), `lib/studio/midi/convert.ts`
  (pure: project ↔ SMF tracks, pattern flattening).
- `components/studio/ExportMixDialog.tsx`, `ImportMidiDialog.tsx`; changes to
  `ProjectsMenu.tsx`, `useKeybinds.ts`, `ChallengePanel.tsx`, and the engine's
  graph construction so live and offline share it.

## Testing requirements

- Product suite `lib/studio/__tests__/wav.product.test.ts`: header fields,
  data length, 16- and 24-bit sample encoding and clipping.
- Product suite `lib/studio/__tests__/smf.product.test.ts`: write then read
  round trip; type 0 import; running status; truncated file refused without a
  throw; event and track caps.
- Product suite `lib/studio/__tests__/export-range.product.test.ts`: song range
  with tail, loop range, 10-minute cap, challenge size estimate against 8 MB.
- Product suite `lib/studio/__tests__/convert.product.test.ts`: pattern
  flattening, drum channel 10, tempo and time signature events.
- Product suite `lib/studio/__tests__/render.product.test.ts`: with a Tone stub,
  the offline render uses the shared graph builder and passes the range's
  length, the context rate and two channels; Cancel stops the progress timer.

## Acceptance criteria

- [ ] A 30-second project exports to a WAV that plays in a desktop player and
      sounds like playback.
- [ ] The loop region exports only the loop.
- [ ] A 40-second song can be exported straight into an open challenge's upload;
      a 3-minute one explains it is over 8 MB and offers the download.
- [ ] Export MIDI opens in another program with the right tempo and notes;
      importing that file back adds the same notes.
- [ ] A corrupt `.mid` shows an error and changes nothing.

## Out of scope

MP3 or OGG encoding, stem export, cloud rendering, uploading audio to the
account (sprint 05 rejected sample upload as a storage decision).
