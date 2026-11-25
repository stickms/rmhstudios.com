# 13 — See which of the people replying to you support you

Surface: the replies under a creator's own post (a "Supporter" mark on replies from their active supporters, seen
only by the creator), the profile editor's Creator section (a switch to hide the marks). Wave 6. Namespace `supporter-marks`. Site tier
(Steel).

## User story

As a creator with paying supporters, I want to see which replies under my posts come from people who support me, so
that I can answer them first, without anyone else learning who supports me.

## Requirements elicitation

- **What exists (verified):**
  - Creator memberships: `CreatorMembership` (`prisma/schema/economy.prisma`: `creatorId`, `supporterId`,
    `expiresAt`, `tierId`, unique `[creatorId, supporterId]`) through Creator Studio (`lib/creator/tiers.server.ts`,
    `components/create/StudioDashboard.tsx`, where a creator already sees their supporters).
  - `getSupporterBadgeMap(viewerIds, creatorId)` in `lib/creator/tiers.server.ts` — "a batched lookup for rendering
    supporter badges next to authors within a creator's own threads without an N+1" — has **no caller**; nor has
    `isSupporterOf`.
  - Replies: `GET /api/rmharks/$id/comment` (`lib/feed/api/rmharks.$id.comment.server.ts`, `auth: 'optional'`), rendered
    by `components/feed/post-detail/ReplyList.tsx` and `components/feed/CommentItem.tsx`.
  - Supporter-only posts (`audience: 'SUPPORTERS'`, `lib/feed/audience.server.ts`) are the other place supporters
    matter.
- **Decisions:**
  - **Who sees it:** only the post's author, when the viewer is the author, on replies to their own post. Nobody else
    — not the supporter, not other repliers — is told who supports whom; the field is absent (not `false`) for every
    other viewer, so a response cannot be compared.
  - **Which replies:** replies whose author holds an active membership of the post's author (`expiresAt` in the
    future), from one `getSupporterBadgeMap` call per page.
  - **The mark:** a word, "Supporter", in `t-meta` after the name (no colour, no icon-only meaning, R1), and the
    reply's accessible name includes it.
  - **A switch:** "Show supporter marks on replies" (default on) in the creator settings section
    (`components/feed/profile-edit/CreatorSection.tsx`), a new `UserProfile.showSupporterMarks Boolean @default(true)`
    beside the profile's other display switches (`showLikes`, `hideCountsOnMine`, …) saved by the profile editor's
    existing update; off, the field is never computed.
  - **Thread replies** (`lib/feed/api/rmharks.thread.server.ts`) are not included this sprint (a thread's replies are
    other posts); recorded as a follow-up.

## Functional requirements

1. FR-1 `lib/creator/supporter-marks.server.ts` (new): `supporterMarksFor(viewerId, post, replyAuthorIds)` →
   `Set<string> | null` (null unless the viewer is the post's author and the switch is on), over
   `getSupporterBadgeMap`.
2. FR-2 `lib/feed/api/rmharks.$id.comment.server.ts` GET: each reply gains `supporter: true` only when in the set.
3. FR-3 Schema: `showSupporterMarks Boolean @default(true)` on `UserProfile` (`prisma/schema/profile.prisma`), migration
   `20261228060300_s14_supporter_marks` (one `ADD COLUMN … NOT NULL DEFAULT true`, a constant default); the profile
   editor's update schema and handler accept it (find them from `CreatorSection.tsx`'s save path).
4. FR-4 UI: `CommentItem.tsx` renders the word; `CreatorSection.tsx` gains the switch (`components/ui/switch.tsx`).

## Non-functional requirements

- **Privacy:** a test proves the field is absent for a signed-out viewer, a supporter, another replier and the
  creator with the switch off.
- **Read paths:** the GET is already in the reply read-path registries (content warnings, quiet counts, GIF
  descriptions); adding a boolean changes none of their classifications — re-run them.
- **Performance:** one extra query per page, only for the author.
- **No shared cache:** the reply `GET` declares no `cache:` today (`auth: 'optional'`, so it is uncached); it must stay
  that way, because the response now differs for the author. Adding a public cache policy to it would let a shared
  cache serve the author's marks to others; `lib/__tests__/api-cache-policy.test.ts` is re-run and the new test
  asserts the response carries `Cache-Control: private` or none.
- **What is and is not revealed:** the creator already sees every supporter by name in Creator Studio
  (`components/create/StudioDashboard.tsx`), so the mark tells the creator nothing new about who pays; it tells nobody
  else anything, and the tier and amount are never in the reply row.

## Data model and API

`UserProfile.showSupporterMarks` (above). Reply rows gain an optional `supporter?: true`.

## Testing requirements

- Main suite `lib/creator/__tests__/supporter-marks.test.ts`: the set for the author; `null` for anyone else and with
  the switch off; expired memberships excluded.
- Main suite `lib/feed/__tests__/reply-supporter-field.test.ts`: the field's presence and absence in the GET.
- `lib/__tests__/migration-safety.test.ts`, `lib/feed/__tests__/quiet-counts.test.ts`, `lib/feed/__tests__/content-warning-read-paths.test.ts`,
  `lib/feed/__tests__/gif-alt-read-paths.test.ts`,
  `components/feed/__tests__/` CommentItem rendering (`renderToStaticMarkup`).

## Acceptance criteria

- [ ] A creator opens their post and sees "Supporter" beside the replies from their active supporters.
- [ ] The same post opened by anyone else shows no mark, and its response carries no `supporter` field.
- [ ] Turning the switch off hides the marks.

## Out of scope

Marks in threads, sorting replies by supporters, marks on other creators' posts, telling supporters they are marked.
