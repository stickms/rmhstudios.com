# 14 — Hide counts

Surface: `/settings/content` (`components/settings/FeedControlsSettings.tsx`),
every post rendering (`components/feed/FeedRow.tsx`, `RMHarkCard.tsx`,
`post-detail/PostArticle.tsx`) and every server path that returns a post's
counts. Wave 4. Namespace `quiet-counts`.

## User story

As a member who posts on RMHarks, I want to hide the like, repost, reply and
view counts on my posts from everyone but me — and, separately, to stop
seeing anyone's counts while I scroll — so that I can post without the
scoreboard, and read without comparing.

## Requirements elicitation

- **What exists (verified):** every post carries `likeCount`, `commentCount`,
  `repostCount` and `viewCount`, mapped in `lib/feed/map-feed-item.server.ts`
  and rendered next to the action buttons. Counts also leave the server
  through the developer API (`app/routes/api/v1/posts*.ts`, `feed.ts`,
  `users/$handle/posts.ts`, `me/bookmarks.ts`), the post OG image
  (`lib/og/post-image.server.tsx`), embeds (`app/routes/embed.post.$id.tsx`)
  and search hits. There is no setting to hide them (`grep` for hide counts
  finds nothing; sprint 02 rejected per-post insights because they exist —
  `InsightsModal` — which this feature keeps for the author).
- **Decisions:** two independent switches on `UserProfile`:
  `hideCountsOnMine` (an author setting, enforced **on the server**: every
  read path returns `null` counts for that author's posts to anyone but the
  author, so nothing leaks through an API or an image) and
  `hideCountsInFeed` (a viewer setting, applied on the client: the viewer's
  own preference about what they see). Ranking, trending and notifications
  keep using the real numbers; the author still sees their counts and
  insights. Buttons stay; only the numbers go. Poll vote totals are not
  "counts" in this sense and stay.

## Functional requirements

1. FR-1 `/settings/content` gains "Hide counts on my posts" and "Hide counts
   while browsing", each a switch with a one-line explanation.
2. FR-2 With "on my posts" on, other viewers see the like, repost, reply and
   view buttons without numbers on that member's posts everywhere: feed, post
   page, profile, search, embeds, the developer API (fields are `null`, and
   the OpenAPI document says so) and the post OG card (drawn without counts).
3. FR-3 With "while browsing" on, the viewer sees no numbers on anyone's
   posts, including their own in the feed (the post page still offers the
   author "View insights").
4. FR-4 Turning either switch off restores the numbers at once.

## Non-functional requirements

- **Security / privacy:** one server helper `redactCounts(item, viewerId)`
  applied in `map-feed-item.server.ts` and in each other serialiser listed
  above; a test walks the list so a new path cannot forget it. The author
  setting is read with the author in the same query as the post (no extra
  round trip per post).
- **Performance:** one boolean joined into the existing author select; no
  new query.
- **Accessibility:** buttons keep accessible names without numbers ("Like",
  not "Like, 12"); with numbers, the count is in the name as today.
- **i18n:** strings in `quiet-counts`.
- **Steel:** no layout shift — the number's slot collapses, the button keeps
  its 36 px target.

## Data model and API

- `UserProfile` gains `hideCountsOnMine Boolean @default(false)` and
  `hideCountsInFeed Boolean @default(false)`. Migration
  `20261124040200_s04_quiet_counts`.
- `lib/feed/quiet-counts.ts` (pure: `redactCounts`, the client's display
  rule), `quiet-counts-schema.ts`, `quiet-counts.contract.ts`,
  `quiet-counts.server.ts` (read and set the two switches).
- Module `lib/feed/api/settings.quiet-counts.server.ts` (`GET`, `PUT`).
- The feed's session payload exposes `hideCountsInFeed` to the client (find
  where feed preferences reach the client, e.g. the feed controls query, and
  add it there rather than a new request).
- The `/api/v1` route files (`withDeveloperApi`) call `redactCounts` with
  the API key's user as the viewer; `lib/api/openapi.ts` marks the count
  fields nullable.

## Testing requirements

- Main suite `lib/feed/__tests__/quiet-counts.test.ts`: every serialiser in
  the list redacts for another viewer and not for the author (a table of the
  functions, so adding a path means adding a row); the OG image input has no
  counts for a hidden author; the setting endpoint changes only the caller.
- Product suite `lib/feed/__tests__/quiet-counts.product.test.ts`: the
  display rule for every combination of the two switches.
- The feed characterization tests (`components/feed/__tests__/*`) stay green.

## Acceptance criteria

- [ ] With "on my posts" on, another account sees no numbers on that member's
      posts in the feed, the post page, the API and the OG image.
- [ ] With "while browsing" on, the viewer sees no numbers anywhere.
- [ ] The author's insights still work.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Hiding follower counts, hiding counts per post, hiding counts on comments.
