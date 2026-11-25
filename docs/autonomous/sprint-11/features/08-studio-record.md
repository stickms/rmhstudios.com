# 08 — Record what you play into the Studio

Surface: RMH Studio (`/studio`): the transport's record button, armed tracks, the Studio settings (count-in, quantize,
input latency, MIDI input), the piano roll. Wave 5. Namespace `studio-record`. App tier (L8).

## User story

As someone making music in the Studio, I want to arm a track, press record and play notes on my computer keyboard or a
MIDI keyboard, so that what I play lands in a clip in time with the beat, instead of my having to draw every note in the
piano roll by hand.

## Requirements elicitation

- **What exists (verified):**
  - **The record button records nothing.** `StudioShell.tsx` draws a record toggle and `useKeybinds.ts` binds
    `transport.record`; both call `setIsRecording`, which only flips `isRecording` in `lib/studio/store.ts`. Nothing
    reads that flag to capture notes (`grep isRecording` finds only the store, the keybind and the button).
  - **Tracks can be armed:** `Track.armed` (`lib/studio/types.ts`, `project-schema.ts`) is toggled by the track header's
    arm button (`TrackHeader.tsx`, `store.ts` `trackPatch(..., { armed })`), and nothing reads it either.
  - **The typing keyboard plays notes:** `useKeybinds.ts` maps keys through `TYPING_KEYBOARD_MAP` to MIDI notes at
    `typingKeyboardOctave` and calls `onNoteOn` / `onNoteOff` with `settings.typingKeyboardVelocity`.
  - MIDI clips hold `MidiNote { id, pitch, startBeat, durationBeats, velocity }` relative to the clip start; the
    transport (`lib/studio/engine/TransportController.ts`) wraps Tone.Transport; the playhead is the store's
    `currentBeat` (`setCurrentBeat`, fed by `lib/studio/hooks/useTransport.ts`), a display value: the recorder reads the
    transport's own clock at each event instead.
  - Web MIDI is allowed by the site's `Permissions-Policy` (`midi=(self)`, `deploy/apache/rmhstudios.conf`), and RMH
    Music already reads a MIDI controller (`lib/rmhmusic/learn/input/midi.ts`); the Studio does not.
  - Edits are undoable through the Studio history (`lib/studio/history.ts`, `edit-commands.ts`, sprint 06 03).
- **Decisions:**
  - **Recording a take:** with one or more MIDI or instrument tracks armed, pressing record (button or keybind) starts a
    one-bar count-in (the transport's existing metronome clicks it; "No count-in" is a setting), then plays the
    transport from the playhead and captures every note-on/note-off from the typing keyboard and the chosen MIDI input.
    Pressing record again or stop ends the take.
  - **The take becomes one new MIDI clip on each armed track,** from the bar where recording started to the bar after
    the last note; a take with no notes makes no clip. Existing clips are never changed (no merge, no replace). The
    whole take is one history entry ("Record take"), so one undo removes it.
  - **Timing:** a note's start and length are converted from transport seconds to beats at the tempo; the input latency
    setting (0–200 ms, default 0) is subtracted; quantize on stop: Off, 1/4, 1/8, 1/16 (default Off). A note still held
    at the end is closed there.
  - **Velocity:** from the MIDI message; the typing keyboard uses its existing velocity setting.
  - **MIDI input:** a new `lib/studio/midi/live-input.ts` asks for Web MIDI access only when the member chooses "Use a
    MIDI keyboard" (never on load), lists inputs and keeps the chosen input's name in the Studio settings (already
    persisted with the other settings, so no new storage key). The RMH Music module is not imported (it is built for
    that app's input hub).
  - **Audio tracks** cannot be armed for recording (audio recording would need microphone capture and sample storage,
    which is the open sample decision); arming one says "Recording is for MIDI tracks".
  - **Monitoring:** notes sound through the armed track's instrument while recording, as the typing keyboard already
    plays the selected instrument.

## Functional requirements

1. FR-1 `lib/studio/record.ts` (pure): a take recorder fed timestamped note-on/off events and the tempo map, returning
   notes in beats; quantize; latency offset; closing held notes.
2. FR-2 `lib/studio/midi/live-input.ts`: request access on demand, list inputs, subscribe to one, map messages to
   note-on/off (running status, note-on velocity 0 as note-off), unsubscribe.
3. FR-3 `lib/studio/hooks/useRecording.ts`: arms the count-in, starts the transport, feeds the recorder from the typing
   keyboard and MIDI, and commits one history command creating the clips.
4. FR-4 Settings: count-in on/off, quantize, input latency, MIDI input, as `StudioSettings` fields with values in
   `DEFAULT_SETTINGS` (`lib/studio/constants.ts`); `store.ts` persists `settings` already (its `partialize`), so a saved
   settings object without the new fields must load with their defaults (merge on rehydrate). The controls sit in a
   "Recording" popover beside the record button.
5. FR-5 The record button shows its state in text for assistive technology ("Recording", "Count-in") and is disabled
   with a reason when no MIDI track is armed.

## Non-functional requirements

- **Timing accuracy:** within one audio frame of the transport clock for typing-keyboard events, plus the latency
  setting.
- **Privacy:** no MIDI access is requested until the member asks; nothing recorded leaves the device unless the member
  saves the project to their account.
- **Accessibility:** every new control is labelled; state changes are announced politely.

## Data model and API

- No schema change, no endpoint. Recorded clips are ordinary MIDI clips in the project JSON.
- New `lib/studio/record.ts`, `lib/studio/midi/live-input.ts`, `lib/studio/hooks/useRecording.ts`. Edits
  `lib/studio/store.ts`, `lib/studio/constants.ts`, `lib/studio/hooks/useKeybinds.ts` (feed note events to the
  recorder), `lib/studio/types.ts` (settings fields only), `components/studio/StudioShell.tsx` (the record button and
  the new `components/studio/RecordingPopover.tsx`), `components/studio/arrangement/TrackHeader.tsx` (the audio-track
  line).

## Testing requirements

- Product suite `lib/studio/__tests__/record.product.test.ts`: seconds to beats at two tempi, latency offset, quantize
  at each grid, held notes closed, no-notes take returns nothing, clip bounds rounded to bars.
- Product suite `lib/studio/__tests__/midi-live-input.product.test.ts`: message parsing (note-on, note-off, velocity 0,
  running status, other channels' messages kept, system messages ignored).
- Main suite `lib/studio/__tests__/recording-history.test.ts`: a take is one undoable command; undo removes every clip
  it made; no existing clip changes.
- Permissions-policy test (a new `requestMIDIAccess` call site), escape-hatch ratchet, rAF allowlist (the recorder uses
  the transport clock, no animation frame).

## Acceptance criteria

- [ ] With a synth track armed, a member records eight bars from the computer keyboard and sees a clip of what they
      played, starting at the bar where they pressed record.
- [ ] With quantize 1/16, a slightly early note lands on the grid.
- [ ] One undo removes the take.
- [ ] The browser asks for MIDI access only after "Use a MIDI keyboard".

## Out of scope

Audio recording, loop recording with takes stacked, punch-in and punch-out, step recording.
