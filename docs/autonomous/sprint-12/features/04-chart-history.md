# 04 — Earlier versions of a Slice It chart

Surface: the Slice It chart editor's toolbar ("Versions"), a versions panel, "Save a version" with a name. Wave 6.
Namespace `chart-history`. App tier (L8).

## User story

As a member writing a Slice It chart, I want to see the versions the editor has been saving, name the one I like, and
bring an earlier one back when an edit went wrong, so that an hour of charting is never lost to one bad change.

## Requirements elicitation

- **What exists (verified):**
  - Every save writes a `ChartRevision` row (`prisma/schema/games/slice-it.prisma`: `id BigInt`, `chartId`, `notes
    Json` — the whole note list, `kind` `'autosave' | 'manual' | 'publish'`, `label String? @db.VarChar(120)`,
    `createdAt`; `@@index([chartId, createdAt(sort: Desc)])`; no `@@map`, so the table is `"ChartRevision"`). The
    editor autosaves every 20 seconds while dirty (`features/slice-it/ui/editor/ChartEditor.tsx`), through the PATCH in
    `features/slice-it/api/slice-it.charts.$id.server.ts`, which lints a non-draft chart before saving and accepts an
    optional `kind` (`RevisionKindZ`, `features/slice-it/engine/editor/api-schemas.ts`) but no label.
  - `GET /api/slice-it/charts/$id/revisions` (`features/slice-it/api/slice-it.charts.$id.revisions.server.ts`,
    `listChartRevisionsApi` in `features/slice-it/engine/charts.contract.ts`, `listRevisions` in
    `features/slice-it/engine/editor/api-client.ts`) lists up to 50 revisions' metadata (the note count from
    `jsonb_array_length`). **Nothing in the UI calls it**, and the file's own TODO says restoring "is a POST this route
    deliberately does not have yet", pending what restoring onto a published chart means for its leaderboard.
  - The editor's undo stack (`features/slice-it/engine/editor/store.ts`: `apply`, `undo`, `HISTORY_LIMIT`) makes any
    change one undoable command.
  - Nothing prunes revisions: an editor open for an hour writes up to 180 autosave rows of up to ~90 KB each.
- **Decisions:**
  - **Restore is an edit, not a server write.** "Restore" fetches one revision's notes and applies them in the editor as
    one undoable command ("Restore version from 14:05"). The member sees it, can undo it, and the existing save path
    saves it — with the existing lint for a published chart. So restoring adds no new rule for published charts and
    their boards: it is exactly as allowed as making the same edit by hand, which answers the TODO without deciding the
    leaderboard question (the open "publish" design stays where it is).
  - **Versions panel:** the newest 50 versions of this difficulty's chart, grouped by day in the member's locale, each
    with its kind ("Autosave", "Saved version", "Published"), its name if any, the time and the note count; "Preview"
    draws it read-only in the timeline's ghost layer (the existing preview-before-apply drawing) and "Restore".
  - **Save a version:** a name of up to 120 characters; written as `kind: 'manual'` with that label. The PATCH body
    gains an optional `label` (only with `manual`).
  - **Retention:** a nightly job keeps every `manual` and `publish` revision, the newest 30 autosaves per chart, and one
    autosave per day for the last 30 days; the rest are deleted in batches of 1,000 (`slice-it.revision-prune`).
  - **Who:** the chart's author only, answered exactly as the list answers today: an unknown chart is 404 and another
    member's chart is 403 (`Not yours`, `slice-it.charts.$id.revisions.server.ts`); a revision id that does not
    belong to this chart is 404.

## Functional requirements

1. FR-1 `GET /api/slice-it/charts/$id/revisions/$revisionId` (the notes of one revision; author only), as a sibling of
   the existing list endpoint, with its contract in `charts.contract.ts`.
2. FR-2 The PATCH accepts `label` with `kind: 'manual'` (zod: 1–120 characters after trimming; refused otherwise with
   `INVALID_INPUT`).
3. FR-3 `features/slice-it/engine/editor/restore.ts` (pure): a `Command` that replaces one difficulty's notes and
   inverts to the notes it replaced; the editor store applies it through `apply`.
4. FR-4 UI: `features/slice-it/ui/editor/VersionsPanel.tsx` opened from `Toolbar.tsx`; "Save a version" through
   `usePrompt`; preview in the timeline's existing ghost drawing; restore shows a toast with "Undo".
5. FR-5 `features/slice-it/engine/revision-prune.server.ts` and the job `slice-it.revision-prune` (daily) registered
   under the Wave 0 jobs anchor; the delete is raw SQL over `"ChartRevision"` with quoted columns, after selecting ids
   to keep.
6. FR-6 Refusal: `CHART_REVISION_GONE` ("That version is no longer kept") when a revision was pruned between the list
   and the click.

## Non-functional requirements

- **Integrity:** restore never writes without the member saving; a published chart's lint still applies.
- **Performance:** the list never selects `notes`; one revision's notes are fetched only on Preview or Restore.
- **Accessibility:** the panel is a dialog of rows; restore and undo are announced by the toast.

## Data model and API

No schema change (`label` and `kind` exist). `GET /api/slice-it/charts/$id/revisions/$revisionId` →
`{ id, kind, label, createdAt, notes }`.

## Testing requirements

- Main suite `features/slice-it/api/__tests__/chart-revisions.server.test.ts`: an unknown chart is 404, another
  member's chart is 403 (as the list), a revision of a different chart under this chart's path is 404; the label
  rules.
- Product suite `features/slice-it/engine/editor/__tests__/restore.product.test.ts`: apply then undo returns the exact
  previous notes; restoring the current notes is a no-op command.
- Main suite `features/slice-it/engine/__tests__/revision-prune.test.ts`: what is kept (manual, publish, newest 30, one
  a day for 30 days) and the raw SQL's table and column names.
- Gates: route table, jobs registrations, raw-SQL name assertions, feature manifests.

## Acceptance criteria

- [ ] After an hour of editing, "Versions" lists the autosaves and a named version; restoring one puts its notes in the
      timeline and "Undo" takes them out again.
- [ ] Restoring onto a published chart with a lint error is refused at save, as the same hand edit would be.
- [ ] The nightly job leaves named and published versions untouched.

## Out of scope

Comparing two versions note by note, versions of timing points separately, restoring another member's chart.
