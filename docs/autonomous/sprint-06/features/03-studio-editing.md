# 03 — Undo, redo and the clipboard in the Studio

Surface: RMH Studio (`/studio`, `components/studio/**`, app tier L8). Wave 2.
Namespace `studio-editing`.

## User story

As someone making a track in RMH Studio, I want Undo and Redo, and to copy, cut,
paste, duplicate and delete clips and notes with the keys the Studio already
shows me, so that I can experiment without fear of losing a good arrangement to
one wrong drag.

## Requirements elicitation

- **What exists (verified):**
  - `lib/studio/keybinds.ts` defines `edit.undo`, `edit.redo`, `edit.copy`,
    `edit.paste`, `edit.cut`, `edit.delete`, `edit.selectAll`,
    `edit.duplicate`, and `pianoRoll.transposeUp/Down`,
    `transposeOctaveUp/Down`, `shiftLeft/Right`; `components/studio/KeybindSettings.tsx`
    lets members rebind them.
  - `lib/studio/hooks/useKeybinds.ts` switches on transport, view, tool, zoom,
    typing keyboard, project save and track mute/solo only: none of the edit or
    piano-roll ids above does anything.
  - State lives in one zustand store, `useStudioStore` (`lib/studio/store.ts`):
    `tracks`, `clips` (by id), `selectedClipIds`, `patterns`, with mutators
    `addClip`, `removeClip`, `updateClip`, `addTrack`, `removeTrack`,
    `updateTrack`, `reorderTracks`, `addPattern`, `updatePattern`, mixer
    setters. Notes are inside MIDI clips (`MidiNote[]`, `lib/studio/types.ts`).
  - Sprint 05 06 added project save, open and sync (`lib/studio/project-session.ts`,
    `project-schema.ts`); `projectDirty` / `markDirty` mark unsaved changes.
- **Decisions:**
  - History covers the **document**: tracks, clips, notes, patterns, mixer
    values, bpm, time signature, loop points. It never covers view state (zoom,
    scroll, active view, open windows), transport, or selection.
  - Snapshot history of the document slice (structural sharing, so a snapshot is
    cheap), 100 steps, cleared on New and Open. Continuous gestures (dragging a
    fader, moving a clip, drawing notes) coalesce into one step: a step is
    committed at gesture end (`pointerup`) or after 400 ms without a change for
    keyboard-driven nudges.
  - Clipboard is in-memory per tab, plus the system clipboard as JSON text with a
    `rmh-studio-clipboard/1` marker so copy and paste work between two Studio
    tabs; pasting anything else is ignored silently.
  - Paste places clips at the playhead on the selected track (or their original
    tracks if those still exist and none is selected); notes paste at the
    playhead within the open MIDI clip in the piano roll.
  - Jam sessions (`lib/studio/jam/*`) are live and shared: Undo is disabled while
    a jam is connected (the button explains why), because rewinding one
    person's copy would fork the session. Remote changes applied while a jam is
    connected go through the same store mutators, so history is cleared when a
    jam connects and again when it disconnects; otherwise Undo after leaving
    would rewind other people's edits.

## Functional requirements

1. FR-1 Undo and Redo work from their keybinds and from Undo / Redo buttons in
   the Studio toolbar (`StudioShell.tsx`), disabled with a tooltip when there is
   nothing to undo, naming the step ("Undo Move clip").
2. FR-2 Every document mutator in the store records a history step with a label
   key; view-only setters do not.
3. FR-3 Copy, Cut, Paste, Delete, Duplicate and Select all act on selected clips
   in the arrangement and on selected notes in the piano roll
   (`components/studio/piano-roll/PianoRollView.tsx`), which gains note
   selection (click, shift-click, marquee) if it has none.
4. FR-4 The piano-roll keybinds transpose (±1, ±12) and shift (± one snap step)
   the selected notes, each as one history step.
5. FR-5 A loaded or new project starts with empty history; saving does not
   clear history but does clear `projectDirty` as today; undoing back to the
   saved state clears `projectDirty` again.
6. FR-6 Keybinds never fire while focus is in a text field (existing behaviour
   kept) and never while a dialog is open.

## Non-functional requirements

- **Performance:** a history step allocates no deep copy (structural sharing via
  immutable updates); 100 steps of a 32-track project stay under 20 MB measured
  in the product test with a synthetic project; Undo of one step renders in one
  frame of the existing views.
- **Correctness:** the audio engine follows the store (as it does for every
  mutation today); Undo of "Delete track" restores everything the store holds for
  the track (its `Track` fields and its clips). Read `lib/studio/project-schema.ts`
  first: whatever the saved project contains is document state, and nothing else
  is.
- **Security:** none beyond today: the clipboard JSON is parsed with the
  project zod schema (`lib/studio/project-schema.ts`) before use, so a crafted
  clipboard cannot inject unknown fields.
- **i18n:** `studio-editing` for the button labels and step names (a fixed map
  of literal `t()` calls, not computed keys).
- **Design:** app tier (L8): the Studio's own toolbar buttons and
  `components/shared/app-theme.css` tokens; no new site-tier styling.
- **Accessibility:** Undo and Redo are buttons with accessible names that
  include the step; a polite live region announces "Undid Move clip".
  Note selection is keyboard reachable (arrow keys move the focused note, space
  toggles selection).

## Data model and API

None (client-only). Files:

- `lib/studio/history.ts` (pure: `createHistory`, `commit`, `undo`, `redo`,
  coalescing, the document slice selector).
- `lib/studio/clipboard.ts` (pure: serialise and parse clips and notes, paste
  placement).
- `lib/studio/edit-commands.ts` (the command handlers `useKeybinds` calls).
- Changes to `lib/studio/store.ts` (history middleware around document
  mutators), `lib/studio/hooks/useKeybinds.ts` (the new cases),
  `components/studio/StudioShell.tsx` (toolbar buttons),
  `components/studio/piano-roll/PianoRollView.tsx` (selection),
  `components/studio/arrangement/ArrangementView.tsx` (gesture end commits).

## Testing requirements

- Product suite `lib/studio/__tests__/history.product.test.ts`: commit, undo,
  redo, redo cleared by a new commit, 100-step cap, coalescing within 400 ms,
  view-only changes not recorded, dirty flag after undo to saved state.
- Product suite `lib/studio/__tests__/clipboard.product.test.ts`: round trip,
  foreign text ignored, schema rejects unknown fields, paste placement at the
  playhead, paste onto a deleted track falls back to the selected track.
- Product suite `lib/studio/__tests__/edit-commands.product.test.ts`: transpose
  and shift bounds (MIDI 0–127, not before beat 0), duplicate places after the
  selection, undo disabled during a jam, history empty after a jam disconnects.

## Acceptance criteria

- [ ] Delete a clip, press the Undo keybind: the clip and its audio return; Redo
      deletes it again.
- [ ] Drag a fader from -6 dB to -12 dB: one Undo restores -6 dB.
- [ ] Copy two clips, move the playhead, Paste: they appear at the playhead.
- [ ] Copy in one Studio tab, paste in another.
- [ ] Rebinding Undo in keybind settings changes the key that undoes.
- [ ] Undo is disabled with an explanation while a jam is connected.

## Out of scope

History that persists across reloads, collaborative undo in jams, undo of
sample imports (samples stay in IndexedDB as today).
