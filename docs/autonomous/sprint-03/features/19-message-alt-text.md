# 19 — Image descriptions in messages

Surface: the DM and group-chat composers and message rows
(`components/feed/conversation/*`, `components/feed/group-chat/*`), and the
chat-plus thread sheet. Wave 4. Namespace `message-alt-text`. Depends on 12
(both extend the send path it extracts into `lib/messages/send.server.ts`).

## User story

As a member who uses a screen reader, I want the images people send me in
messages to have descriptions — and as a sender, I want to add one as easily as
on a post, with the same "require descriptions" setting — so that images in
conversations are not a blank "image" to me.

## Requirements elicitation

- **What exists (verified):** posts carry `RMHark.imageAlts` alongside
  `imageUrls`, the composer has an alt-text editor and a "Require image
  descriptions" setting (`components/settings/RequireAltTextSetting.tsx`,
  `lib/feed/alt-text.server.ts` with `altTextViolation`,
  `components/feed/AltTextNotice.tsx` with `useRequireAltText`). Messages
  carry `ChatMessage.imageUrls` (up to 4 of the sender's feed images,
  `prisma/schema/messaging.prisma`) but **no descriptions**: the send schemas
  and endpoints take no alt text, and rows render images with an empty or
  generic `alt`. This fails WCAG 2.2 SC 1.1.1 for every image in a chat.
- **Decisions:** `ChatMessage.imageAlts String[]` parallel to `imageUrls`
  (same convention as posts: same length, empty string = no description).
  The composer offers the same per-image description editor as the post
  composer (reuse its component if it is separable; otherwise extract the
  shared part into `components/feed/AltTextEditor.tsx` and use it in both).
  The member's existing "Require image descriptions" setting applies to
  messages too, enforced on the server with `altTextViolation`. The sender
  can add or change a description after sending (within the existing edit
  window rules, `lib/messages/edit-policy.ts`, but descriptions stay editable
  for 24 hours because fixing accessibility should not be blocked). Forwarded
  messages keep their descriptions. Scheduled messages (12) carry them too.

## Functional requirements

1. FR-1 Each pending image in both composers has "Add description" (and shows
   "Description added" when set), opening a dialog with a textarea (≤ 1,000
   characters) and the image preview.
2. FR-2 With "Require image descriptions" on, Send is blocked with a notice
   naming the images that lack one, as on posts; the server refuses the same
   message with a `422` and a code the composer understands.
3. FR-3 Message rows render each image with its description as `alt` (and an
   "ALT" badge button that shows the description to sighted members, as posts
   do); images without one get `alt=""` plus a visually hidden "Image without
   description" so the image is still announced.
4. FR-4 The sender's message menu has "Edit descriptions" for 24 hours after
   sending; edits emit the existing message-edited realtime event.
5. FR-5 Forwarding a message copies its descriptions; scheduled messages
   store and send them.
6. FR-6 The developer API and the account export include `imageAlts` where
   they include `imageUrls` for messages (check both).

## Non-functional requirements

- **Security:** descriptions are zod-bounded, stored and rendered as text;
  only the sender can edit them; the arrays' lengths must match `imageUrls`
  (refused otherwise).
- **Compatibility:** the column defaults to `{}`; old rows render as "without
  description"; the previous release ignores the column.
- **Performance:** no extra request: descriptions travel with the message.
- **Accessibility:** this feature's point — test with a screen reader in the
  brief's checklist: the composer's dialog is labelled, focus returns to the
  image's button on close, the badge button names itself ("Show description
  of image 2").
- **i18n:** strings in `message-alt-text`; reuse the post composer's
  description strings by key where they are the same words.
- **Steel:** the badge is a small text button with a 1px border (a control),
  not a coloured chip; the dialog is an overlay.

## Data model and API

- `ChatMessage.imageAlts String[] @default([])`; if
  `ScheduledChatMessage` (12) exists, it gains the same column.
- Migration `20261123040000_s03_message_alt_text`.
- `lib/messages/messages-schema.ts` and the group send schema: optional
  `imageAlts` (array of ≤ 1,000-character strings, length = `imageUrls`).
- `lib/messages/send.server.ts` (from 12): stores the descriptions and runs
  `altTextViolation`.
- `lib/messages/api/messages.$conversationId.alt.server.ts` (PATCH a sent
  message's descriptions; a module for groups or a shared one keyed by
  message id — follow how edit is routed in
  `messages.$conversationId.edit.server.ts`).
- Serializers that send `imageUrls` to the client (`lib/messages/message-
  view.ts`, `lib/group-chat/serialize.server.ts`, `lib/messages.server.ts`)
  add `imageAlts`.

## Testing requirements

- Main suite `lib/messages/__tests__/message-alt-text.test.ts`: mismatched
  lengths refused; the require setting refuses a message without descriptions
  and accepts one with; only the sender can edit, and only for 24 hours;
  forwarding copies them.
- Component test `components/feed/__tests__/message-image-alt.test.tsx`: an
  image renders its description as `alt`; one without gets the hidden label.
- The two characterization tests of the conversation views must still pass.

## Acceptance criteria

- [ ] An image sent with a description is read out by a screen reader with
      that description.
- [ ] With the require setting on, sending an undescribed image is blocked in
      the composer and refused by the server.
- [ ] A description can be added after sending.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

AI-generated descriptions (a cost decision), descriptions for GIFs (the GIF
picker's titles are used as today), voice-note transcripts.

## As built (review addendum)

- `ChatMessage.altsEditedAt` (nullable, same migration) is stamped by a description edit and read by `listMutationsSince`, so a reconnecting client catches up on alt-only edits (`editedAt` stays put on purpose: no "edited" marker).
