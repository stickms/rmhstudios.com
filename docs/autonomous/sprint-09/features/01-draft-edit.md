# 01 — Edit a draft or scheduled post

Surface: the drafts page (`/drafts`, `components/feed/DraftsColumn.tsx`), an edit dialog on each row, the site's
`PATCH /api/scheduled/$id`. Wave 5. Namespace `draft-edit`.

## User story

As a member who scheduled a post for tomorrow morning, I want to fix a typo, move it to the afternoon, change who can
see it, or add the image description a community asks for, without discarding the post and writing it again, so that a
scheduled post is something I can still change until it goes out.

## Requirements elicitation

- **What exists (verified against the sprint 08 tip):**
  - The server half is complete and has no page: `updateScheduledApi` (`lib/scheduled/scheduled.contract.ts`,
    `PATCH /api/scheduled/$id`, `implement()` in `lib/scheduled/api/scheduled.$id.server.ts`, rate limit `write`) calls
    `updateScheduledPost` (`lib/scheduled/create.server.ts`), which the developer API (`/api/v1/me/scheduled/{id}`,
    sprint 08 03) also uses: owner check (404 for another member's row), `409 published` for a published row,
    `409 capsule_sealed` for a time capsule (Z7), `400 past` for a time that is not in the future, re-runs the community
    refusal (`communityRefusal`: membership, sanctions, image descriptions) only when a field a community judges
    changes, and writes with a compare-and-set (`publishedId: null, isCapsule: false`) so a publish racing the edit
    wins.
  - `updateScheduledApi` has **no client caller** (`grep -rn updateScheduledApi components app features` finds nothing).
    The drafts page offers only "Publish now" and "Discard" (`DraftsColumn.tsx`: `publishScheduledApi`,
    `discardScheduledApi`).
  - The site's body schema `patchScheduledSchema` (`lib/scheduled/scheduled-schema.ts`) accepts only `content`,
    `audience`, `unlockPrice` and `scheduledAt`; `UpdateScheduledInput` also takes `imageAlts`, `contentWarning` and
    `isSensitive`.
  - Sprint 09 11 (wave 2) tells the author when a scheduled community post was refused (no longer a member, an image
    without a description) and shows the reason on the draft's row; today the only remedy is to discard it.
  - `components/ui/schedule-control.tsx` is the composer's date-and-time control; `components/ui/dialog.tsx` is the
    overlay; `useConfirm` the confirmation.
- **Decisions:**
  - **What can be edited:** the text, the scheduled time (change it, or "Keep as draft" which clears it), the audience
    (public, followers, private), the content warning, and each attached image's description. Images, the GIF, the poll,
    the community and the unlock price are shown read-only with "To change this, discard the draft and write it again"
    (they carry upload claims, pricing and a community re-gate the dialog does not need to own). A time capsule has no
    "Edit" (it is sealed).
  - **Schema:** `patchScheduledSchema` gains `imageAlts` (array, each at most the composer's description length, at most
    the post's image count), `contentWarning` (string or `null`, the composer's bound) and `isSensitive`; all optional.
    `updateScheduledPost` already handles them.
  - **Dialog:** "Edit" on each draft and scheduled row opens a dialog (`components/ui/dialog.tsx`, the overlay surface,
    S6) with a text field (the composer's character count), the schedule control, the audience choice, the
    content-warning field and one description field per image (beside a 64 px thumbnail, `--site-bg-subtle`
    placeholder). One ink primary, "Save". Saving sends only the fields that changed. Closing with unsaved changes asks
    through `useConfirm` ("Discard your changes?").
  - **Errors** are shown in the dialog as one line under the field they concern, from the response's code: `past` ("Pick
    a time in the future"), `alt_text` ("This community needs a description for every image"), `published` ("This post
    has already been published" — the row then leaves the list), `not_found`; a community refusal shows its own message.
  - **After saving** the list reloads (as publish and discard do) and the row shows the new time; 11's reason line
    disappears once the draft is publishable (11 computes it from the notice; an edited draft that was refused is
    retried on the next due pass, as 11 specifies).
- **No change** to the publisher, the developer API or the composer.

## Functional requirements

1. FR-1 `patchScheduledSchema` accepts `imageAlts`, `contentWarning` and `isSensitive` (bounded as the composer's create
   schema bounds them).
2. FR-2 `components/feed/DraftEditDialog.tsx`: the fields above, prefilled from the row, sending only changed fields
   through `api(updateScheduledApi, { params: { id }, body })`.
3. FR-3 "Edit" on every draft and scheduled row in `DraftsColumn.tsx` except time capsules (which the list already
   excludes); the row keeps "Publish now" and "Discard".
4. FR-4 The error lines and the unsaved-changes confirmation.

## Non-functional requirements

- **Security:** ownership, capsule sealing and the community re-gate stay in `updateScheduledPost` (no client-side
  trust); the rate limit is the endpoint's existing `write` policy.
- **Correctness:** a dialog opened on a row that is published meanwhile gets `409 published` and closes with that line;
  an unchanged save sends no request.
- **Design:** Steel: an overlay (`--site-surface`, 1px border, 8px radius, the overlay shadow, no blur, scrim
  `--site-bg` at 80 %); controls 36 px (44 px on touch); `t-label` field labels; one ink primary; no tinted error box
  (D8 stays open) — errors are `--site-danger` text lines.
- **Accessibility:** the dialog is the shared primitive (focus trap, Escape, labelled by its title "Edit post"); every
  field has a visible label; the error line is tied to its field with `aria-describedby`.
- **i18n:** every string in `draft-edit`; times through the site's locale formatter; nothing computed into a key.

## Data model and API

- No schema change, no new endpoint. New `components/feed/DraftEditDialog.tsx` and `components/feed/draft-edit.ts`
  (pure: the changed-fields diff and the error-code-to-message map). Edits: `lib/scheduled/scheduled-schema.ts`
  (`patchScheduledSchema`), `components/feed/DraftsColumn.tsx` (the "Edit" button and the dialog).
- Not exported, not in the erasure registry (no new data).

## Testing requirements

- Product suite `components/feed/__tests__/draft-edit.product.test.ts`: the diff sends only changed fields (text, time,
  clearing the time, audience, warning, one description); an unchanged form sends nothing; each error code maps to its
  line.
- Main suite `lib/scheduled/__tests__/patch-scheduled-schema.test.ts`: the new fields accept their bounds and reject
  over-long descriptions and more descriptions than images.
- Main suite `components/feed/__tests__/draft-edit-dialog.test.tsx` (rendered with `react-dom/server`): fields prefilled
  from a row; read-only notes for images and poll; a capsule row offers no "Edit".
- Existing `lib/scheduled/__tests__/*` stay green; `lib/__tests__/raw-api-fetch-ratchet.test.ts` and
  `lib/__tests__/useeffect-fetch-ratchet.test.ts` do not rise.

## Acceptance criteria

- [ ] A member edits a scheduled post's text and moves it two hours later; the row shows the new time and the post goes
      out at it with the new text.
- [ ] Choosing a time in the past shows "Pick a time in the future" and saves nothing.
- [ ] A community draft refused for a missing image description gets the description in the dialog and publishes on the
      next due pass.
- [ ] "Keep as draft" moves a scheduled post into the drafts list.

## Out of scope

Replacing images, the GIF or the poll; moving a draft to another community; editing a published post (the post's own
edit exists); editing time capsules; the developer API (it already edits).
