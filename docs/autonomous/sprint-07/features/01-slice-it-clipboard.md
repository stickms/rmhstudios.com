# 01 — Copy, paste, mirror and time edits in the Slice It chart editor

Surface: the Slice It chart editor (`/slice-it/edit/$songId`,
`features/slice-it/ui/editor/*`), a full-screen app (L8, its own look). Wave 1.
Namespace `slice-it-clipboard`.

## User story

As someone charting a song in Slice It, I want to copy a phrase and paste it at
the next chorus, mirror it, duplicate a measure, snap a sloppy run to the grid
and insert a beat of silence when I mis-timed an intro, so that charting a
three-minute song is minutes of editing rather than an hour of placing every
note again.

## Requirements elicitation

- **What exists (verified):**
  - The editor's design document lists the operation set
    (`docs/slice-it-chart-editor.md` §5.2): copy/cut/paste (`Ctrl+C/X/V`),
    paste mirrored (`Ctrl+Shift+V`), duplicate (`Ctrl+D`), mirror selection
    (`H`), quantise selection (`Q`), scale timing (`Ctrl+Shift+S`) and
    insert/remove time (`Ctrl+I` / `Ctrl+Shift+I`).
  - None of them is implemented. `features/slice-it/ui/editor/ChartEditor.tsx`
    carries `TODO(phase 2 extension — §5.2): Ctrl+C/X/V, Ctrl+Shift+V (paste
    mirrored), Ctrl+D (duplicate a measure on), Ctrl+I / Ctrl+Shift+I (insert /
    remove time). They are clipboard operations on a selection, which needs a
    clipboard model this shell does not have yet.`
  - The command pattern exists (`features/slice-it/engine/editor/commands.ts`:
    `placeNote`, `deleteNotes`, `moveNotes`, `retypeNotes`, `setDuration`,
    `replaceChartNotes`, `composite`, `bundle`), with the invariant
    `invert(apply(x)) === x` asserted in its test, `clampLane`, `quantizeTime`
    and canonical note order (`compareNotes`, `insertSorted`).
  - The store (`features/slice-it/engine/editor/store.ts`) has `playhead`,
    `snap`/`snapEnabled`, `selectAll`, `undoStack`/`redoStack` (200 deep),
    `timingPoints` and the active difficulty; snapping lives in
    `engine/editor/snap.ts`; the shortcut sheet is
    `ui/editor/ShortcutSheet.tsx`; the nesting invariant between difficulties is
    `engine/editor/nesting.ts`.
  - New note ids come from `engine/editor/uuid.ts`.
- **Decisions:**
  - **The clipboard is the editor's own, in memory, per tab.** It holds notes
    with times relative to the earliest copied note, their lanes, types and
    durations, and the source `keys` count. It is not the system clipboard
    (a chart is not text another program can use, and reading the system
    clipboard prompts for permission). It survives switching difficulty, so a
    phrase charted on Expert can be pasted into Hard.
  - **Paste lands at the playhead, snapped** (when snap is on) and keeps
    relative timing. Pasting into a chart with fewer keys clamps lanes with
    `clampLane` (the doc's §5.3 reason: wrapping turns a chord into a jack
    silently) and says how many notes were clamped in the status line.
  - Pasted notes replace nothing: a pasted note landing exactly on an existing
    note in the same lane (same time to the millisecond) is skipped, and the
    status line says how many were skipped.
  - **Mirror** maps lane `l` to `keys - 1 - l`, in place (`H`) or at paste
    (`Ctrl+Shift+V`).
  - **Duplicate** copies the selection and pastes it one measure after the
    selection's first note, using the timing point in force there
    (`timingPoints`), not a fixed BPM.
  - **Quantise** snaps each selected note's time (and a hold's tail) to the
    current snap division; notes that would collide after snapping keep the
    earlier one and the status line says how many merged.
  - **Scale timing** opens a small dialog (50–200 %, step 1 %) and stretches the
    selection about its first note.
  - **Insert time / remove time** shift every note at or after the playhead, on
    **every difficulty** (a song's timing is shared), by one snap unit at the
    playhead's tempo; removing time first deletes notes inside the removed span
    and says how many. Timing and SV points after the playhead shift with them.
  - Every operation is **one undo step** (a `composite` or a new command),
    including insert/remove time across four difficulties.
  - Pasted and duplicated notes are the author's (`auto: false`, §7.3).
  - The nesting invariant is not bypassed: after any operation on a lower
    difficulty the existing nesting check runs exactly as after a manual edit.

## Functional requirements

1. FR-1 `Ctrl+C`, `Ctrl+X`, `Ctrl+V`, `Ctrl+Shift+V`, `Ctrl+D`, `H`, `Q`,
   `Ctrl+Shift+S`, `Ctrl+I`, `Ctrl+Shift+I` work as above when the timeline has
   focus; with no selection, copy/cut/mirror/quantise/scale/duplicate do nothing
   and the status line says "Select notes first".
2. FR-2 The toolbar's edit menu (or a new "Edit" menu if none exists) lists the
   same operations with their bindings, disabled when they cannot run, so every
   operation is reachable without a keyboard.
3. FR-3 The shortcut sheet lists the new bindings; the keybind table honours
   macOS `Meta` the same way the existing `Ctrl+Z`/`Ctrl+S` handling does.
4. FR-4 Each operation announces its result through the editor's existing
   status/live region ("Pasted 12 notes", "Mirrored 8 notes", "Inserted 1/4
   beat at 1:02.350; 214 notes moved").
5. FR-5 Paste selects the pasted notes so they can be moved at once.
6. FR-6 Scale timing's dialog has a number field and Apply/Cancel; Enter
   applies; it is the editor's dialog component, not a native prompt.

## Non-functional requirements

- **Correctness:** every new command satisfies `invert(apply(x)) === x`
  including array order; insert/remove time inverts exactly, including the
  notes it deleted and the timing points it moved.
- **Performance:** paste, mirror and quantise of 1,000 notes complete in one
  frame budget (under 16 ms on the test fixture); insert time on a
  4 × 1,200-note song is one pass per difficulty (`O(n)`), never `O(n²)`.
- **No server change.** Saving is the existing autosave; the chart hash
  changes as for any edit.
- **App tier (L8):** the editor keeps its own look; no `--site-*` tokens are
  introduced into it, and nothing animates at rest.
- **Accessibility:** menu items are buttons with accessible names and the
  binding in `aria-keyshortcuts`; the status line is `aria-live="polite"`.
- **i18n:** `slice-it-clipboard`; engine code returns codes and counts, the UI
  translates.

## Data model and API

None. New pure module `features/slice-it/engine/editor/clipboard.ts`
(`copySelection`, `pasteAt`, `mirrorLanes`, `quantizeSelection`,
`scaleSelection`, `insertTime`, `removeTime`, each returning a `Command` plus a
result summary), new command kinds added to `CommandKind` in `commands.ts`
(`paste`, `mirror`, `quantize`, `scale`, `shift-time`), store actions in
`store.ts` (`copy`, `cut`, `paste`, `duplicate`, `mirror`, `quantize`,
`scaleTiming`, `insertTime`, `removeTime`, and the `clipboard` field), key
handling in `ChartEditor.tsx` (replacing the TODO), menu entries in
`Toolbar.tsx`, the bindings in `ShortcutSheet.tsx`, a `ScaleTimingDialog.tsx`.

## Testing requirements

- Product suite `features/slice-it/engine/editor/__tests__/clipboard.product.test.ts`:
  relative timing kept; paste at playhead with and without snap; lane clamping
  from 6 keys into 4 and its count; duplicate one measure on across a tempo
  change; quantise collisions; scale 50 % and 200 %; insert and remove time on
  four difficulties with timing and SV points; skipped duplicates.
- Extend `features/slice-it/engine/editor/__tests__/commands.test.ts` (or the
  file that asserts the invariant) so every new command kind is in the
  exhaustive `invert(apply(x))` loop.
- A component test for the key handler: each binding dispatches its action;
  `Meta` on macOS; nothing fires while a text field or dialog has focus.

## Acceptance criteria

- [ ] Copy eight bars on Expert, switch to Hard, paste at the playhead: the
      notes appear at the playhead with the same spacing, selected.
- [ ] `Ctrl+Shift+V` pastes the phrase mirrored; `H` mirrors a selection in place.
- [ ] Insert time at the intro shifts every note on all four difficulties, and
      one `Ctrl+Z` puts every one back.
- [ ] Quantise snaps a hand-placed run to 1/4; colliding notes are reported.
- [ ] Every operation is reachable from the menu without a keyboard.
- [ ] The editor looks as it did, in both themes the app supports.

## Out of scope

The system clipboard, sharing a phrase between songs or members, a phrase
library, changing timing points themselves (phase 8 of the editor plan),
collaborative editing (§17 question 4).
