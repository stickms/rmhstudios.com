# 06 — Studio projects: save, open, sync

Surface: the RMH Studio DAW (`/studio`, `components/studio/StudioShell.tsx`
toolbar, `lib/studio/store.ts`, `lib/studio/project-store.ts`). Full-screen app
tier (L8: its own `--app-*` look). Wave 1. Namespace `studio-projects`.

## User story

As a musician using RMH Studio, I want to save my project, come back to it
tomorrow, keep several projects, and open them on my other computer — so that an
hour of work is not lost when I close the tab.

## Requirements elicitation

- **What exists (verified):** `lib/studio/project-store.ts` has IndexedDB
  helpers (`saveProject`, `loadProject`, `deleteProject`, `listProjects`) for a
  `projects` object store, but **nothing in the Studio UI calls them**: the only
  caller is the jam client (`lib/studio/jam/client.ts`). The store
  (`lib/studio/store.ts`) persists only `settings` (`partialize`), and exposes
  `newProject()` and `setProject()`. Closing the tab loses the project. Samples
  (audio buffers) live in IndexedDB through `SampleManager` and are referenced
  by `bufferId` from audio clips.
- **Decisions:** (1) local projects: a Projects menu in the toolbar with New,
  Open…, Save, Save as, Rename, Delete, plus autosave to IndexedDB every 30 s of
  idle after a change and on `pagehide`; (2) cloud projects for signed-in
  members: "Save to account" uploads the project JSON (no audio: user samples
  stay on the device; bundled samples resolve by id everywhere); at most 25
  cloud projects and 1 MB of JSON each; (3) conflicts are last-writer-wins with
  a version check — a save whose base `revision` is stale is refused with "This
  project changed on another device" and the choice to overwrite or open the
  newer copy. Signed-out members get local projects only.

## Functional requirements

1. FR-1 The toolbar gains a Projects menu (`components/ui/menu.tsx` primitives
   styled by the app tier): New project, Open…, Save (Ctrl/Cmd+S, added to the
   Studio keybinds in `lib/studio/keybinds.ts`), Save as…, Rename…, Delete…, and
   for signed-in members Save to account / Open from account.
2. FR-2 Open… lists local projects (name, last saved, relative time) and, when
   signed in, cloud projects (name, last saved, size, "On this device too" when
   a local copy has the same id). Each row opens the project.
3. FR-3 The project name and a saved state ("Saved", "Unsaved changes",
   "Saving…") show in the toolbar. Closing the tab with unsaved changes sets the
   browser's own `beforeunload` warning (that is not `window.confirm`, which
   sprint 04's native-dialog ratchet forbids); New and Open with unsaved changes
   ask through `useConfirm`.
4. FR-4 Autosave writes the local copy 30 s after the last change and on
   `pagehide`; it never uploads to the account on its own (the member chooses
   Save to account; afterwards Save updates both).
5. FR-5 Opening a cloud project with audio clips whose `bufferId` is missing on
   this device shows "3 samples are not on this device" and keeps the clips
   silent rather than failing.
6. FR-6 Deleting a cloud project asks for confirmation (`useConfirm`) and
   removes it from the account; the local copy is kept unless also deleted.

## Non-functional requirements

- **Correctness:** the 25-project cap is checked and the row inserted in a
  transaction after `lockKey(tx, 'studio-projects:' + userId)`. Updates are a
  conditional `updateMany({ where: { id, userId, revision } })` that increments
  `revision`; zero rows updated is a 409 with the current revision.
- **Security:** endpoints `auth: 'required'`, `rateLimit: 'write'` on writes,
  zod-validated (name 1–80 chars; data a JSON object whose serialised size is ≤
  1 MB, checked on the raw body length before parsing as well); a member only
  ever reads or writes their own rows. The project JSON is validated
  structurally (`lib/studio/project-schema.ts`: tracks/clips/patterns arrays and
  numbers within ranges) so a crafted upload cannot crash the editor of the same
  member on another device.
- **Performance:** the list endpoint never selects `data` (store `sizeBytes`);
  opening fetches one row. Autosave serialises off the input path (in a
  `setTimeout`, not `requestAnimationFrame`).
- **Privacy:** erasure deletes cloud projects; export includes their names,
  sizes and data.
- **i18n:** `studio-projects`; relative times via the site helper
  `formatRelativeTime` (`lib/i18n/relative-time.ts`).
- **Design:** the Studio is a full-screen app (L8): use `--app-*` tokens from
  `components/shared/app-theme.css` and the Studio's existing toolbar styles; no
  new site-tier CSS.
- **Accessibility:** menu items are Radix menu items with shortcuts announced;
  the Open dialog is a labelled list; save state is a polite live region.

## Data model and API

- New file `prisma/schema/studio.prisma`: `StudioProject { id String @id (the
  client's project id, ≤ 64 chars), userId, name VarChar(80), data Json,
  sizeBytes Int, revision Int @default(1), createdAt, updatedAt @updatedAt }`,
  `@@index([userId, updatedAt(sort: Desc)])`, `@@map("studio_project")`;
  back-relation on `User` under the auth anchor. Migration
  `20261125010100_s05_studio_projects`. Primary key collisions across members
  are refused (an id owned by another member is 409, never overwritten).
- `lib/studio/cloud-projects.server.ts` (`listCloudProjects`, `getCloudProject`,
  `saveCloudProject`, `deleteCloudProject`, `exportStudioProjects`);
  `lib/studio/project-schema.ts` (zod); `lib/studio/project-session.ts` (pure:
  dirty tracking, autosave scheduling decision, missing-sample count).
- Contract `lib/studio/projects.contract.ts`; modules
  `lib/studio/api/studio.projects.server.ts` (GET list, POST create),
  `studio.projects.$id.server.ts` (GET, PUT `{ name, data, baseRevision }`,
  DELETE).

## Testing requirements

- Main suite `lib/studio/__tests__/cloud-projects.test.ts`: the cap under the
  lock; a stale `baseRevision` is 409; another member's id is 409 and untouched;
  payload over 1 MB is 413; a malformed project is 400; list never selects
  `data`.
- Main suite `lib/account/__tests__/studio-projects-erasure.test.ts`.
- Product suite `lib/studio/__tests__/project-session.product.test.ts`: dirty
  tracking, autosave timing decisions, missing-sample counting, schema
  acceptance of a real `newProject()` value.

## Acceptance criteria

- [ ] A project saved locally reopens after a reload, with the same tracks and
      clips.
- [ ] A project saved to the account opens on another browser signed in as the
      same member.
- [ ] Saving from two tabs: the second is told the project changed and can
      choose.
- [ ] The 26th cloud project is refused with a clear message.
- [ ] Studio's own look, 390 px and 1280 px, `ar`.

## Out of scope

Uploading user samples to the account, sharing projects, collaborative editing
(the jam feature exists), version history.
