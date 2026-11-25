# 07 — Report a Slice It song, or a comment on one

Surface: Slice It's song details (a "Report song" item) and each song comment (a "Report" item), the admin report
queue (previews and "Resolve & remove"), Your reports. Wave 1. Namespace `slice-reports`. App tier (L8) in Slice It;
the queue and Your reports on the site tier.

## User story

As a player browsing Slice It's library, I want to report a song that is someone else's music or abusive, or a
comment that harasses the uploader, so that a moderator looks at it; and as a moderator I want to take either down
from the queue.

## Requirements elicitation

- **What exists (verified):**
  - `song` has been a report type since L9 (`REPORT_ENTITY_TYPES` in `lib/moderation/report-constants.ts`, the comment
    calls uploads "the one category of content on the site most likely to attract a copyright claim"), and the report
    route resolves its owner (`case 'song'` in `lib/moderation/api/moderation.report.server.ts`). **No screen files
    one**: nothing in `features/slice-it/ui/` opens `components/moderation/ReportDialog.tsx`. `song` is not in
    `REMOVABLE_REPORT_ENTITY_TYPES`, so a moderator cannot take it down from the queue.
  - A takedown exists for admins: `takeDownSong(songId, reason)` (`features/slice-it/engine/library.server.ts`:
    tombstones the row with `takenDownAt`, `isPublic: false`, keeps charts and scores, deletes the audio object) behind
    `features/slice-it/api/slice-it.admin.takedown.server.ts`.
  - Song comments (`SongComment`, `prisma/schema/games/slice-it.prisma`: `songId`, `userId`, `content`, `atSeconds`)
    are public on the song (`GET /api/slice-it/songs/$id/comments`, `features/slice-it/api/
    slice-it.songs.$id.comments.server.ts`); the author, the uploader or an admin can delete one; nobody can report
    one. UI: `features/slice-it/ui/SongComments.tsx` inside `SongDetailsPanel.tsx`.
  - The report path is anchored per feature (sprint 13): report constants, the report route's
    `resolveTargetUser`, `takedownReportedContent` and `previewsFor` in `lib/moderation/triage.server.ts`,
    `lib/moderation/my-reports.server.ts`, `components/moderation/MyReportsPanel.tsx`, and (new this sprint)
    `components/feed/report-kind-label.ts`; `lib/moderation/__tests__/music-reports.test.ts` holds that every
    removable type has a takedown branch.
- **Decisions:**
  - **Song reports:** "Report song" in the song details' menu for any signed-in player but the uploader, for a public,
    not taken-down song; it files the existing `song` type through `ReportDialog`. `song` becomes removable: "Resolve &
    remove" calls `takeDownSong(songId, 'Removed after a report')`, which is final (the audio object is deleted, as the
    admin takedown already does).
  - **Comment reports:** a new type `song-comment` (the `SongComment` id), removable; eligible when the comment exists,
    its song is public and not taken down, and the reporter is not its author; the owner is the comment's author. A
    takedown deletes the row (the same delete the author can do).
  - **Previews:** the queue shows a song's title and artist and its uploader, and a comment's text (cut to 280
    characters) with the song's title; neither shows the audio.
  - **Your reports and labels:** `song-comment` gets its `kind-song-comment` and `gone-song-comment` labels in
    `MyReportsPanel.tsx` and in `report-kind-label.ts` (`song` already has `kind-song`; it gains `gone-song`).
  - **Admin link:** `entityLink` (`components/admin/reports/ReportList.tsx`) is not extended (Slice It has no song URL
    outside the game); the preview carries the song id for the existing Slice It admin page.

## Functional requirements

1. FR-1 `features/slice-it/engine/song-reports.server.ts` (new): `songCommentAuthor`, `songCommentReportable`,
   `songReportable`, `takeDownSongComment`, `songReportPreviews`.
2. FR-2 Report path, each under `s14-07 slice-reports`: `'song-comment'` in `REPORT_ENTITY_TYPES`; `'song'` and
   `'song-comment'` in `REMOVABLE_REPORT_ENTITY_TYPES`; the `song-comment` case in `resolveTargetUser` and the
   eligibility checks for both types in the report route; the two takedown branches and the preview block in
   `triage.server.ts`; the my-reports and panel and label entries.
3. FR-3 UI: `features/slice-it/ui/SongDetailsPanel.tsx` gains "Report song"; `features/slice-it/ui/SongComments.tsx`
   gains "Report" on others' comments; both open `ReportDialog` lazily (it pulls zod).

## Non-functional requirements

- **Safety:** a report never reveals whether a private or taken-down song exists (the same refusal as a missing one).
- **Finality:** the song takedown is irreversible by design; the queue's confirm says so ("This deletes the song's
  audio. It cannot be undone").
- **Bundle:** the dialog is lazy-loaded; the game's island entry does not grow by more than the menu items.

## Data model and API

No schema change. Reports go through `POST /api/moderation/report` as every type does.

## Testing requirements

- Main suite `features/slice-it/engine/__tests__/song-reports.test.ts`: eligibility (own comment, private song,
  taken-down song refused), owner resolution, takedown of each type, previews.
- `lib/moderation/__tests__/music-reports.test.ts` (both types have takedown branches), `lib/moderation/__tests__/member-reports.test.ts` and
  `report-triage.test.ts`, `lib/__tests__/user-text-direction.test.ts`, the i18n gates.

## Acceptance criteria

- [ ] A player reports someone else's song from its details, and the report appears in the queue with the title,
      artist and uploader.
- [ ] "Resolve & remove" on that report takes the song down; it leaves every shelf and its scores stay.
- [ ] A player reports a comment on a song, and removing it deletes the comment.
- [ ] Neither report item appears on the player's own song or comment.

## Out of scope

Chart reviews (`ChartReview`, keyed by two ids) and published charts, telling the uploader before a takedown, a
counter-notice flow.
