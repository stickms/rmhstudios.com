# 07 — Share a Studio project, and open a copy

Surface: RMH Studio (`/studio`): the Projects menu ("Share a copy", "Shared links"), the open-a-copy dialog reached by
`/studio?share=<token>`, the report dialog. Wave 3. Namespace `studio-share`. App tier (L8).

## User story

As someone making beats in the Studio, I want to send a friend a link to a copy of my project, so that they can open it,
hear how I built it and make their own version, without my later edits reaching them or their edits reaching me.

## Requirements elicitation

- **What exists (verified):**
  - Cloud projects (`StudioProject`, `prisma/schema/studio.prisma`): a member's project JSON without audio ("user
    samples stay on the device"), saved by revision, with earlier versions (`StudioProjectRevision`, sprint 07 14).
    `lib/studio/cloud-projects.server.ts` reads and writes them for their owner only.
  - The project JSON (`lib/studio/project-schema.ts`, types in `lib/studio/types.ts`): tracks, MIDI clips with notes,
    pattern clips, automation, and audio clips whose `bufferId` names a decoded sample in the device's `SampleManager`
    cache. **There is no built-in sample library with ids:** every `bufferId` is a `crypto.randomUUID()` minted by
    `SampleManager.importFile` (`lib/studio/samples/SampleManager.ts`) for a file the member imported on that device,
    and `SAMPLE_PACKS` (`lib/studio/samples/sample-packs.ts`) is metadata with empty URLs. So every audio clip names one
    of the member's own device samples ("uploading Studio samples" is an open owner decision, so it never leaves the
    device), and an audio clip's `name` may be that sample's file name. `countMissingSamples`
    (`lib/studio/project-session.ts`) already treats an empty `bufferId` as "no sample yet".
  - Studio challenges export a mix (`ExportForChallenge.tsx`); nothing shares a project.
- **Decisions:**
  - **A share is a snapshot.** "Share a copy" on a cloud project stores a copy of its JSON at that moment with a token
    of 128 random bits (`randomBytes(16).toString('base64url')`, 22 characters, from `node:crypto`; never `Math.random`
    or a cuid), the project's name and its track count. Later edits do not change it; the owner can make a new one. Up
    to 20 live shares per member (`lockKey(tx, 'studio-shares:<userId>')`); the snapshot obeys the project size cap.
  - **Samples:** **every** audio clip is kept in the copy with an empty `bufferId` and an empty `name` (the clip stays,
    silent, and the Studio labels it "Sample not included") and counted, so neither a device sample id nor a sample's
    file name ever appears in the share. Before creating it the owner is told how many clips that is. Track names, clip
    names of MIDI and pattern clips and the project name are the owner's own words and are shared as written.
  - **Opening:** `/studio?share=<token>` opens a dialog in the Studio: the name, the sharer's display name, tracks, "N
    clips need a sample", and "Open a copy". The copy becomes a new project on this device (a fresh project id); a
    signed-in member can then "Save to account" as with any project. Signed-out visitors can open a copy on the device.
    A revoked, removed or unknown token shows "This link no longer works" (one 404 for all three, so a token cannot be
    probed). Once the dialog has read the token, the Studio removes `?share=` from the address bar
    (`history.replaceState`), so the link is not left in the history of a shared computer.
  - **Managing:** "Shared links" lists the member's shares (name, created, opened count) with "Copy link" and "Stop
    sharing" (revoke). A revoke clears the share's `data` at once and keeps the row for the list (no job is added).
  - **Moderation:** report entity `studio-share` (the name is member text); removable: takedown revokes.
  - **Opened count:** incremented once per opening member per share (signed in) or per open (signed out), not shown to
    others.
  - **Erasure:** the member's shares are deleted (`erase`): a share is a link to their work, not something others built
    on, and the copies already opened live on the openers' devices. **Export:** shares (name, created, revoked, opened
    count; not the token).
  - **SEO:** no new route; `/studio` keeps its card. A share URL is a query on `/studio`, so the token is never in a
    sitemap.

## Functional requirements

1. FR-1 Model `StudioProjectShare`; the cap under the lock.
2. FR-2 `lib/studio/share.ts` (pure): `sanitizeForShare(project)` returning the copy (every audio clip's `bufferId` and
   `name` emptied) and the missing count; `copyFromShare(data)` minting fresh project, track and clip ids. The server
   runs `sanitizeForShare` itself on the stored cloud project; it never trusts a client-sanitised copy.
3. FR-3 `lib/studio/share.server.ts` and registered endpoints with contracts in `lib/studio/share.contract.ts`: create
   (owner of the cloud project, from the server's copy of it), list mine, revoke (owner only), read by token
   (`auth: 'optional'`, `rateLimit: { limit: 30, windowMs: 60_000 }`, `Cache-Control: private, no-store`).
4. FR-4 UI: `components/studio/ShareProjectDialog.tsx`, `SharedLinksDialog.tsx`, `OpenSharedDialog.tsx`; entries in
   `ProjectsMenu.tsx`; `StudioAppShell.tsx` reads `?share=`.
5. FR-5 Report entity, erasure operations, registry entry and export section under the anchors.

## Non-functional requirements

- **Privacy:** the token is the only way to a share; there is no listing of other members' shares and no endpoint takes
  a share id; the read returns the sharer's display name and nothing else about them (no user id, handle, e-mail or
  project id).
- **Safety:** the read re-validates the snapshot through `project-schema.ts` before the client loads it.
- **Accessibility:** dialogs are the shared overlay; every count is text.

## Data model and API

- `StudioProjectShare` (`@@map("studio_project_share")`: `id`, `token` `@unique @db.VarChar(32)`, `userId` → `User`
  (relation `StudioProjectShares`), `projectId` `@db.VarChar(64)` (plain column: the project may be deleted later),
  `name` `@db.VarChar(80)`, `data Json?` (null once revoked), `sizeBytes Int`, `trackCount Int`, `missingSamples Int`,
  `openCount Int @default(0)`, `revokedAt DateTime?`, `createdAt`, `@@index([userId, createdAt])`) in
  `prisma/schema/studio.prisma`. Migration `20261201030200_s11_studio_share`.
- Erasure registry: `erase`.

## Testing requirements

- Product suite `lib/studio/__tests__/share.product.test.ts`: every audio clip's `bufferId` and `name` emptied and
  counted, MIDI and pattern clips untouched, no device sample id or sample name anywhere in the output (string search
  over the serialised copy), fresh ids on copy, schema-valid output.
- Main suite `lib/studio/__tests__/share.test.ts`: only the cloud project's owner shares it; the cap under the lock;
  revoke clears `data`; a revoked, hidden or unknown token reads the same 404; the token is 22 base64url characters from
  `randomBytes(16)`; the server sanitises the stored project (a client copy is ignored); the read returns no user id,
  e-mail or project id.
- Main suite `lib/account/__tests__/studio-share-erasure.test.ts`.
- Report coverage, route table, `useEffect` ratchet, zod-off-hot-routes (the Studio route).

## Acceptance criteria

- [ ] A member shares a project with a drum pattern and one clip of their own sample; the dialog warns "1 clip needs a
      sample".
- [ ] A friend opens the link, gets a copy with the pattern and a silent, labelled clip, and edits it without changing
      the original.
- [ ] "Stop sharing" makes the link say it no longer works.

## Out of scope

Sharing samples, collaborative editing, a public gallery of shared projects, remix credits.
