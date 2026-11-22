# 15 — Describe GIFs

Surface: the post composer, edit-post modal, DM and group composers, and every
place a post's or message's GIF is shown. Wave 6 (a read-path sweep, late).
Namespace `gif-descriptions`.

## User story

As a member who uses a screen reader, I want the GIFs in posts and messages to
be described, so that I know what a reply-with-a-GIF says instead of hearing
"Embedded image" every time.

As a member posting a GIF, I want a sensible description filled in for me that
I can change, so that describing it costs me nothing.

## Requirements elicitation

- **What exists (verified):**
  - `gifUrl String?` on `RMHark`, `ScheduledPost`
    (`prisma/schema/social.prisma`), `ChatMessage`, `ScheduledChatMessage`
    (`prisma/schema/messaging.prisma`); `FeedAnnouncement.gifUrl` is admin
    content (out of scope). No description column anywhere.
  - `components/feed/GifPicker.tsx` has each result's provider `description`
    and uses it as the picker thumbnail's alt, but `onSelect(url)` passes only
    the URL.
  - `components/feed/GifEmbed.tsx` renders every GIF with
    `alt="Embedded image"`; also `FeedMedia.tsx`, `RMHarkCard.tsx`,
    `post-detail/PostArticle.tsx`, `compose/GifAttachment.tsx`.
  - Image descriptions already exist for images (`imageAlts`, sprint 03 19 for
    messages, sprint 05 16 for editing after posting) with a reminder
    (`components/feed/AltTextNotice.tsx`) and read paths in
    `lib/feed/map-feed-item.server.ts`, `app/routes/embed.post.$id.tsx`,
    `app/routes/api/v1/posts.ts`, RSS (`lib/rss.ts`), OG.
- **Decisions:**
  - `gifAlt String? @db.VarChar(500)` beside each in-scope `gifUrl`
    (the same limit as image descriptions — read the image alt limit and use
    it).
  - The picker passes `{ url, description }`; the composer prefills the
    description with the provider's text (trimmed, ≤ the limit) and shows a
    "Describe this GIF" field under the attachment, the way images are
    described. An empty description is allowed (as for images); the alt-text
    reminder setting, when on, treats an undescribed GIF like an undescribed
    image.
  - Rendering: `alt={gifAlt}` when present; when absent, `alt="GIF"` (a word,
    not "Embedded image"), translated. The fallback is a **new key** in
    `gif-descriptions` (e.g. `gif-fallback-alt`), not a new `defaultValue` on
    `feed`'s `embedded-image-alt` (CLAUDE.md i18n rule (a): an edited default
    changes English only). `GifEmbed.tsx` also renders link embeds that are not
    picker GIFs; those keep `embedded-image-alt`. GIFs keep their existing
    autoplay and reveal behaviour.
  - Sprint 05 16's "describe after posting" covers GIFs too: the post menu's
    describe dialog lists the GIF with the images.
  - Developer API: `gifAlt` is added (nullable) next to `gifUrl` in
    `/api/v1/posts*` and `/api/v1/feed` payloads that include `gifUrl` — additive
    only.
  - Scheduled posts and messages carry the description through to the created
    row.

## Functional requirements

1. FR-1 `GifPicker` `onSelect` passes `{ url, description }`; every caller is
   updated (`ComposeBox` via `compose/GifAttachment.tsx`, `EditPostModal.tsx`,
   `conversation/ComposerBar.tsx` / `useDmComposer.ts`,
   `group-chat/GroupComposerBar.tsx` / `useGroupComposer.ts`,
   `chat-plus/useSlashCommands.tsx`; `CommentItem.tsx` and RMHTube's
   `ChatPanel.tsx` insert URLs as text and are left as they are).
2. FR-2 The attachment shows a labelled "Describe this GIF" field prefilled from
   the provider; editing it changes what is saved.
3. FR-3 Post create, post edit, scheduled post create and publish, DM and group
   send, scheduled message send all accept and store `gifAlt` (zod-validated).
4. FR-4 Every GIF render uses the description per Decisions.
5. FR-5 Sprint 05 16's describe-after-posting dialog includes the GIF.
6. FR-6 Every server read path that returns `gifUrl` also returns `gifAlt`, and
   all are listed in `GIF_ALT_READ_PATHS` (`lib/feed/gif-alt.ts`); a gate test
   scans each listed file for `gifAlt` and fails a file that selects `gifUrl`
   without it (the list is found by grepping `gifUrl` in `lib/` and
   `app/routes/`).
7. FR-7 RSS items with a GIF include it as an `<img alt="…">` in the
   description when they include images today; OG images do not change.

## Non-functional requirements

- **Security:** the description is plain text (zod, length, trimmed, control
  characters stripped, as for image alts); never rendered as HTML.
- **Correctness:** editing the GIF in the edit modal resets the description to
  the new GIF's provider text.
- **Performance:** one nullable column per table; no new queries.
- **Privacy:** nothing new to erase or export beyond the row it belongs to
  (posts and messages are handled as today).
- **i18n:** `gif-descriptions`; "GIF" fallback alt translated.
- **Steel:** the field matches the image description field; no new styling.
- **Accessibility:** the field has a visible label and a counter; the fallback
  alt is the word "GIF" so screen readers say what it is.

## Data model and API

- `gifAlt String? @db.VarChar(500)` on `RMHark`, `ScheduledPost`,
  `ChatMessage`, `ScheduledChatMessage`. Migration
  `20261126060200_s06_gif_descriptions` (four `ADD COLUMN`, nullable).
- `lib/feed/gif-alt.ts` (pure: normalise, fallback, `GIF_ALT_READ_PATHS`).
- Changes: the create and edit endpoints for posts
  (`lib/feed/api/rmharks.server.ts`, `rmharks.$id.server.ts`), scheduled posts,
  `lib/messages/send.server.ts` (DM and group), scheduled messages;
  `lib/feed/map-feed-item.server.ts`; `app/routes/embed.post.$id.tsx`;
  `app/routes/api/v1/posts.ts`, `posts/$id.ts`, `feed.ts`; `lib/rss.ts`;
  `lib/feed/alt-text-edit.server.ts` (sprint 05 16) and its dialog; the
  components in FR-1 and FR-4; `lib/api/registry.ts` (the new field).

## Testing requirements

- Main suite `lib/feed/__tests__/gif-alt.test.ts`: create, edit, schedule and
  publish carry the description; a description over the limit is refused;
  sprint 05 16's edit accepts the GIF's description and refuses on someone
  else's post.
- Main suite `lib/feed/__tests__/gif-alt-read-paths.test.ts` (source scan).
- Main suite `lib/messages/__tests__/gif-alt-messages.test.ts`: DM and group
  send store it; scheduled message carries it.
- Product suite `lib/feed/__tests__/gif-alt.product.test.ts`: normalise and
  fallback.
- The composer and conversation characterization tests stay green (update
  snapshots only where the alt text changes, and say so in the commit).

## Acceptance criteria

- [ ] Posting a GIF fills "Describe this GIF" with the provider's text; the
      published post's GIF has that alt in the feed, on the post page and in the
      embed.
- [ ] A GIF without a description is announced as "GIF".
- [ ] A GIF in a DM and a group chat carries its description.
- [ ] `/api/v1/posts/{id}` returns `gifAlt`.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Describing GIFs inside comment text, admin announcement GIFs, generating
descriptions with an AI model.
