# 16 — Say what a content warning is for

Surface: the post composer and edit modal, and every place a post with a
content warning is shown. Wave 7 (a read-path sweep, last). Namespace
`content-warnings`.

## User story

As a member posting spoilers or a photo some people would rather not see, I want
to say what the warning is for — "Spoilers: Dune Part Two", "Injury photo" — so
that readers can decide before they reveal it.

As a reader, I want to see that reason on the covered post and to reveal it with
one action, so that a warning protects me without hiding everything behind the
same blank label.

## Requirements elicitation

- **What exists (verified):**
  - `RMHark.isSensitive Boolean` ("media/text hidden behind a click-to-reveal
    overlay", `prisma/schema/social.prisma`); `ScheduledPost.isSensitive` too.
  - The composer toggles it (`components/feed/compose/ComposeMenu.tsx`,
    `ContentWarningPill` in `compose/ComposeChips.tsx`, `compose-state.ts`);
    the card covers media with `SensitiveMedia` (`components/feed/RMHarkCard.tsx`);
    `map-feed-item.server.ts` returns `isSensitive`; OG cards respect it
    (`lib/og/post-visibility.ts`). `/api/v1/posts*` does not expose it.
  - Settings > Content (`app/routes/_site/settings/content.tsx`) holds reader
    preferences such as quiet counts (sprint 04) and repost mutes (sprint 05).
- **Decisions:**
  - `contentWarning String? @db.VarChar(80)` on `RMHark` and `ScheduledPost`.
    Setting a reason implies `isSensitive = true`; clearing the warning clears
    both. A warning without a reason stays valid (today's behaviour).
  - With a reason, the post's **text** is covered too (the reason is shown in
    its place with "Show post"); without a reason, only media is covered, as
    today. This is the author's choice made explicit, so existing posts do not
    change.
  - The reason is shown wherever the covered post is: feed, post page, profile,
    community, search results, embeds (`embed.post.$id.tsx`), RSS (the item
    description becomes "Content warning: <reason>" and the text is omitted),
    notifications previews (the preview shows the reason instead of the text),
    and OG (the card shows the reason instead of the text, through
    `post-visibility.ts`).
  - Reader preference in Settings > Content: "Posts with content warnings":
    "Cover them" (default) or "Show them" (reveals everywhere for this reader;
    the reason still shows as a label). Stored per member.
  - Developer API: `/api/v1/posts*` and `/api/v1/feed` gain `sensitive`
    (boolean) and `contentWarning` (string or null) — additive. Text is still
    returned (API clients decide how to show it).
  - The reason is plain text, 1–80 characters, no line breaks.

## Functional requirements

1. FR-1 Choosing "Content warning" in the composer shows a "What is it for?"
   field (optional) beside the pill; the pill shows the reason.
2. FR-2 The edit modal edits the reason (as it edits other post fields; the
   edit history records it as for content).
3. FR-3 A covered post shows the reason on a rule in place of the text and
   media with "Show post"; revealing is per post per page view (no
   persistence), and "Hide" covers it again.
4. FR-4 The reader preference per Decisions changes the default on every surface
   that covers posts.
5. FR-5 Every server path that returns a post's text to someone other than its
   author applies `applyContentWarning(post, viewerPref)` and is listed in
   `CONTENT_WARNING_READ_PATHS` (`lib/feed/content-warning.ts`); a gate test
   holds the list against the source, covering at least the feed, post page
   loader, profile and community feeds, search, embeds, RSS, notification
   previews, OG and `/api/v1/**` (which passes the text through but adds the
   fields).
6. FR-6 Scheduled posts carry the reason to the published post.

## Non-functional requirements

- **Security:** zod for the reason; rendered as text; never interpreted.
- **Correctness:** covering is a presentation rule; server paths never drop the
  text for the viewer who can reveal it, except RSS, notification previews and
  OG, which cannot be revealed and so omit it.
- **Performance:** one column; the preference is read with the viewer's other
  content settings (no extra query on the feed path — add it to the existing
  settings read).
- **Privacy:** nothing new to erase; the preference is exported with the other
  content settings.
- **i18n:** `content-warnings`; "Content warning: {{reason}}" in RSS uses the
  site's default locale (RSS has no reader locale), translated through the
  server-side catalog loader that RSS already uses for its strings — check
  `lib/rss.ts` and follow it.
- **Steel:** the covered state is a line of text on a rule with a button, not a
  blurred or tinted box (R1, B2: no `filter`/blur); one secondary button.
- **Accessibility:** "Show post" is a button with `aria-expanded` and controls
  the covered region's id; the reason is read before the button.

## Data model and API

- `RMHark.contentWarning`, `ScheduledPost.contentWarning` (`VarChar(80)`,
  nullable); the reader preference as `UserProfile.showContentWarnings Boolean
  @default(false)` (or wherever Settings > Content stores its preferences —
  follow that file). Migration `20261126070000_s06_content_warnings`.
- `lib/feed/content-warning.ts` (pure: normalise, `applyContentWarning`,
  `CONTENT_WARNING_READ_PATHS`), `content-warning-schema.ts`.
- Changes: post create, edit and scheduled endpoints (`lib/feed/api/rmharks.server.ts`,
  `rmharks.$id.server.ts`, scheduled post publish); `map-feed-item.server.ts`;
  embeds; `lib/rss.ts`; notification preview builder; `lib/og/post-visibility.ts`;
  `app/routes/api/v1/posts.ts`, `posts/$id.ts`, `feed.ts`, `users/$handle/posts.ts`;
  `lib/api/registry.ts`; `components/feed/RMHarkCard.tsx`, `SensitiveMedia`,
  `post-detail/PostArticle.tsx`, `compose/ComposeChips.tsx`,
  `compose/compose-state.ts`, `EditPostModal.tsx`;
  `app/routes/_site/settings/content.tsx` (one section).

## Testing requirements

- Main suite `lib/feed/__tests__/content-warnings.test.ts`: a reason implies
  sensitive; clearing clears both; over-long or multi-line refused; RSS,
  notification preview and OG omit the text of a post with a reason; the API
  returns both fields; scheduled publish carries the reason.
- Main suite `lib/feed/__tests__/content-warning-read-paths.test.ts` (source
  scan).
- Product suite `lib/feed/__tests__/content-warning.product.test.ts`:
  `applyContentWarning` for author, reader with each preference, no reason.
- The composer and post detail characterization tests stay green (snapshot
  changes named in the commit).

## Acceptance criteria

- [ ] A member posts with the warning "Spoilers: Dune Part Two"; followers see
      that line and "Show post" instead of the text and image.
- [ ] Existing sensitive posts without a reason look exactly as before.
- [ ] A reader who chose "Show them" sees the post with the reason as a label.
- [ ] The post's RSS item and link preview show the reason, not the text.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Automatic warnings, warnings on comments or messages, filtering posts by
warning words (muted words exist).
