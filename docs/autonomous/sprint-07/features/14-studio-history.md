# 14 — Earlier versions of a Studio project

Surface: RMH Studio's Projects menu (`components/studio/ProjectsMenu.tsx`), a
new "Versions" dialog, the cloud project endpoints. Wave 2. Namespace
`studio-history`. App tier (L8): the Studio keeps its own look.

## User story

As a producer saving my track to my account, I want to go back to how it was
yesterday — before I deleted the bridge and saved over it — and open that
version beside the current one or restore it, so that a save is never the end
of what I had.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 05 06's account sync: `StudioProject` (`prisma/schema/studio.prisma`:
    `data` JSON without audio, `sizeBytes`, `revision` bumped on every save),
    `lib/studio/cloud-projects.server.ts` (`listCloudProjects`,
    `getCloudProject`, `saveCloudProject` with a stale-revision refusal under
    `lockKey(tx, 'studio-projects:' + userId)`, `deleteCloudProject`,
    `exportStudioProjects`), limits in `lib/studio/project-schema.ts`
    (`MAX_CLOUD_PROJECTS = 25`, `MAX_PROJECT_BYTES = 1_048_576`), modules
    `lib/studio/api/studio.projects.server.ts` and
    `studio.projects.$id.server.ts`, UI `ProjectsMenu.tsx`,
    `OpenProjectDialog.tsx`, `ProjectConflictDialog.tsx`, `useProjectSession.ts`.
  - **A save overwrites `data`.** No earlier version is kept anywhere on the
    server; the in-memory undo history (sprint 06 03) ends when the tab closes.
  - Erasure deletes `studioProject` rows (`lib/account/deletion.server.ts`, the
    `s05-06` block).
- **Decisions:**
  - **Before each successful save, the previous `data` is kept** as a
    `StudioProjectRevision` row (project id, revision number, name, data,
    size, saved-at), in the save's transaction, **unless the previous version
    was itself saved less than 10 minutes ago** (autosave and rapid saves would
    otherwise fill the history with near-identical copies). The save that
    starts a new 10-minute window keeps the version it replaces.
  - **Keep the last 20 versions per project**, and at most **20 MB of versions
    per member** in total; the oldest versions beyond either limit are deleted
    in the same transaction (oldest first, across projects for the byte cap).
  - Restoring a version writes it as a **new save** (the current state becomes a
    version first, by the rule above, with the 10-minute rule waived for a
    restore), so a restore can itself be undone.
  - "Open as copy" loads a version into the Studio as a new local project
    ("<name> (version of 12 Nov 14:05)") without touching the cloud copy.
  - Deleting a project deletes its versions. Renaming does not create a version.
  - Versions are private to the owner, as projects are.
  - Missing samples: a version carries the same "samples not on this device"
    list as opening a project does (sprint 05 06's mechanism), never audio.

## Functional requirements

1. FR-1 Version capture in `saveCloudProject` as decided.
2. FR-2 "Versions" in the Projects menu for a cloud project: a dialog listing
   versions newest first with time (locale formatted), size and track count
   (from the stored JSON, computed at capture and stored), with "Restore" and
   "Open as copy" per row; restore is confirmed (the app tier's confirm
   dialog, never a native one) and names the time.
3. FR-3 Restore conflicts: restoring while another device saved since the
   dialog opened follows the existing stale-revision flow
   (`ProjectConflictDialog`).
4. FR-4 An empty state ("No earlier versions yet. Versions are kept when you
   save, at most one every ten minutes.").
5. FR-5 The export includes each project's versions as metadata (revision,
   saved-at, size), not their data (the current data is already exported).

## Non-functional requirements

- **Correctness:** capture, trimming and the save are one transaction under the
  existing `studio-projects:<userId>` lock; the byte cap is computed from
  stored `sizeBytes`, never by reading blobs.
- **Security:** `auth: 'required'`; a version id of another member's project is
  a 404; `rateLimit: 'read'` on the list, `'write'` on restore.
- **Performance:** the list selects metadata only (no `data`); one version's
  data is read only on Restore or Open as copy.
- **Storage:** worst case 20 MB per member; the summary of the sprint states
  the bound.
- **Privacy:** erasure deletes the member's versions explicitly (not relying on
  the cascade from project deletion, which the recording stubs cannot see);
  export as FR-5.
- **App tier (L8):** dialogs use the Studio's own dialog styling and the shared
  `DialogOverlay` (sprint 05's integration fix for the iOS edge contract).
- **i18n:** `studio-history`.

## Data model and API

- `StudioProjectRevision { id String @id @default(cuid()), projectId
  VarChar(64), userId, revision Int, name VarChar(80), data Json, sizeBytes Int,
  trackCount Int, savedAt DateTime }`, `@@unique([projectId, revision])`,
  `@@index([userId, savedAt])`, relation to `StudioProject` (cascade),
  `@@map("studio_project_revision")`. `userId` is a plain column (the erasure
  and the byte cap read by it). Migration `20261127020200_s07_studio_history`.
- `lib/studio/project-history.ts` (pure: `shouldCapture(previousSavedAt, now,
  isRestore)`, limits, `trackCountOf(data)`), `project-history.server.ts`
  (`captureVersion(tx, …)`, `trimVersions(tx, userId, projectId)`,
  `listVersions`, `getVersion`, `restoreVersion`, `studioHistoryErasureOps`,
  `exportStudioHistory`), `project-history.contract.ts`.
- `saveCloudProject` calls `captureVersion` and `trimVersions` inside its
  transaction.
- Modules `lib/studio/api/studio.projects.$id.versions.server.ts` (GET),
  `studio.projects.$id.versions.$versionId.server.ts` (GET data),
  `studio.projects.$id.versions.$versionId.restore.server.ts` (POST
  `{ baseRevision }`).
- UI: `components/studio/ProjectVersionsDialog.tsx`; edits to
  `ProjectsMenu.tsx` and `useProjectSession.ts`.

## Testing requirements

- Main suite `lib/studio/__tests__/studio-history.test.ts`: a save keeps the
  previous version; two saves within 10 minutes keep one; restore waives the
  window and creates a new revision; 21st version trims the oldest; the 20 MB
  cap trims across projects oldest first; another member's version 404;
  stale restore refused with the current revision; delete project deletes
  versions.
- Main suite `lib/account/__tests__/studio-history-erasure.test.ts`.
- Product suite `lib/studio/__tests__/project-history.product.test.ts`.
- Existing tests that must stay green: the sprint 05 studio projects tests
  and `studio-projects-erasure.test.ts`.

## Acceptance criteria

- [ ] Save a project, delete a pattern, save again 15 minutes later: Versions
      lists the earlier one, and Restore brings the pattern back as a new save.
- [ ] "Open as copy" opens the old version locally without changing the cloud copy.
- [ ] Autosaving every minute for an hour keeps about six versions, not sixty.
- [ ] The Studio looks as it did.

## Out of scope

Diffing two versions, naming or pinning versions, versions of local-only
projects, sample audio in versions.
