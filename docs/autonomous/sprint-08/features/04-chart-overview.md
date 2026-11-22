# 04 — Lint on the notes, and a minimap of the whole song

Surface: the Slice It chart editor (`/slice-it/…/edit`, app tier). Wave 1.
Namespace `chart-overview`.

## User story

As a charter fixing a three-minute chart, I want the notes the linter flagged
to be marked where they sit on the timeline, the inspector to tell me what is
wrong with the selected note and take me to the next one, and a strip under
the toolbar showing the whole song's density so that I can jump to the
crowded chorus, so that I stop scrolling through the timeline looking for the
twelve warnings the lint panel counted.

## Requirements elicitation

- **What exists (verified):**
  - The linter runs in a worker (`features/slice-it/engine/editor/lint.worker.ts`,
    `lint-runner.ts`, `useLint.ts`) and folds its findings into a per-note map
    (`lint.ts`, "a per-note map the timeline can read in its draw loop without
    allocating"); `EditorNote.issues?: LintIssue[]` and `LintIssue.code`
    (`unhittable-jack`, `too-early`, `hold-too-short`, `density-spike`,
    `empty-stretch`, `off-grid`, `nesting-violation`) are in `types.ts`.
  - `LintPanel.tsx` lists counts and gates publishing; nothing draws an issue
    on a note: `Timeline.tsx` ends its note drawing with
    `TODO(phase 7 — §9): note.issues draws a severity ring plus an icon here`,
    and `NoteInspector.tsx` has `TODO(phase 7 — §9): the lint panel lists this
    note's issues here and clicking one seeks the playhead to it`.
  - `ChartEditor.tsx` has `TODO(phase 2 extension — §12.4): the whole-song
    density minimap strip sits below the toolbar`; the layout in
    `docs/slice-it-chart-editor.md` §12.4 draws it. The store has
    `setPlayhead` (`store.ts`).
  - The miss heat tint and aggregate miss rate (§4.4b, `O1`) and the waveform
    column (§6) need data that does not exist; both stay TODOs.
- **Decisions:**
  - **Marks.** Each note with issues gets a ring drawn in the timeline's draw
    loop: severity `error` a solid 2 px ring in `--slice-danger`, `warning` a
    dashed ring in `--slice-warning` (existing `--slice-*` variables in
    `features/slice-it/ui/editor/theme.ts` / the slice theme; add
    `--slice-warning` only if absent, in both light and dark palettes), and a
    small glyph (`!`) beside the head. Severity comes from the shared rule set
    (`engine/beatmap/lint.ts`). No allocation per frame (reuse the per-note
    map), no animation.
  - **Inspector.** With one note selected, the inspector lists its issues
    (a line each: the code's sentence, the severity word) and offers
    "Previous issue" / "Next issue" which select that note and set the
    playhead to it (wrapping, in time order, across the open difficulty).
    The same two commands are in the command stack's non-undoable set and get
    shortcuts `e` (next issue) and `Shift+E` (previous issue). **Not `[` /
    `]`:** those already step the snap division in `ChartEditor.tsx`'s key
    switch (`case '[': case ']':`, `SNAP_DIVISIONS`). The editor's keys are
    its own switch plus `ShortcutSheet.tsx` (the site registry
    `lib/shortcuts/registry.ts` does not hold editor keys); the implementer
    checks `e` is free in that switch, in `Timeline.tsx`'s handlers and in
    `clipboard-keys.ts`, and lists the pair in `ShortcutSheet.tsx`.
  - **Minimap.** A 40 px strip under the toolbar: one bar per second of the
    song (notes per second of the open difficulty, height relative to that
    tier's `NPS_CEILING`), bars above the ceiling drawn in the danger colour,
    ticks where lint errors sit, the visible window as an outlined box. Click
    or drag seeks; Left/Right move by 5 s when the strip is focused; it is a
    `role="slider"` with `aria-valuetext` ("1:42 of 3:05, 7 notes per
    second"). Drawn on a canvas **only when the chart or the view changes**
    (no frame loop; the app tier allows canvases, but nothing runs at rest).
    A text summary (`sr-only`) gives the three densest stretches.
  - Hidden below the `lg` breakpoint, like the inspector column, with the
    summary still available.

## Functional requirements

1. FR-1 Issue rings and glyphs on the timeline for every note with issues.
2. FR-2 Inspector issue list, previous/next issue, `e` and `Shift+E`.
3. FR-3 The density minimap with seek, keyboard and its accessible value.
4. FR-4 The two TODO comments that this resolves are removed; the §4.4b and §6
   TODOs stay.

## Non-functional requirements

- **Performance:** the timeline's frame cost grows by at most one map lookup
  per visible note; the minimap's bins are computed once per lint result
  (memoised on the chart hash), O(n).
- **Accessibility:** rings are not the only signal (the inspector and the
  lint panel carry words); 3:1 contrast for the ring colours against the
  timeline background in both palettes (checked in a test against the
  palette values).
- **Design:** app tier (L8) — `--slice-*` variables, the editor's own
  controls; no site-tier tokens.
- **i18n:** `chart-overview` (inspector lines, button labels, minimap name and
  value text, summary).

## Data model and API

- No schema or API change.
- New `features/slice-it/engine/editor/overview.ts` (pure: `densityBins`,
  `issueOrder`, `nextIssue`, `prevIssue`, `densestStretches`),
  `features/slice-it/ui/editor/DensityMinimap.tsx`,
  `features/slice-it/ui/editor/NoteIssues.tsx`.
- Edits: `Timeline.tsx` (draw), `NoteInspector.tsx`, `ChartEditor.tsx` (mount
  the strip), `ShortcutSheet.tsx`, the editor's key handling.

## Testing requirements

- Product suite `features/slice-it/engine/editor/__tests__/overview.product.test.ts`:
  bins at song edges, ceiling per tier, issue order and wrap, densest
  stretches, empty chart.
- Main suite: none required (no member data); the shortcut registry test
  `lib/__tests__/shortcut-registry.test.ts` stays green with the two new keys.
- Gate tests: `raf-loop-allowlist` (no new rAF), `islands` (if the editor is
  an island entry), `useeffect-fetch-ratchet`.

## Acceptance criteria

- [ ] A chart with a jack faster than the input cooldown shows a solid ring on
      both notes; selecting one lists "Unhittable jack" and `e` goes to the
      next flagged note.
- [ ] Clicking the minimap's tallest bar moves the timeline there.
- [ ] With the chart idle, no canvas redraws (checked in the browser with a
      performance recording).
- [ ] Light and dark editor palettes, 1280 px, and once in `ar`.

## Out of scope

The miss heatmap (O1), the waveform and onset ghosts (§6), lint rule changes,
chart revision restore (§17.2).
