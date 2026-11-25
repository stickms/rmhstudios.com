# 09 — Read a book together in a community

Surface: `/c/$slug/read/$id` (a read-along's page, new), the community page's "Reading together" line, the mod tools'
"Start a read-along", the inbox (a part opens), the library reader (opened at the part's first page). Wave 6. Namespace
`read-alongs`. Site tier (Steel).

## User story

As a member of a community that likes books, I want our moderators to pick a book from the library and set a pace, a
part a week, with a discussion thread that opens for each part behind a spoiler warning, so that we read the same book
together and talk about each part without spoiling it for people who are behind.

## Requirements elicitation

- **What exists (verified):**
  - The library: `LibraryDocument` (`prisma/schema/library.prisma`) with `slug`, `title`, `pages`, `format` (PDF or
    EPUB) and `toc` ("chapter → page"), read in the library reader, which syncs each reader's place by page
    (`lib/library/reader-sync.ts`).
  - Recurring community threads (sprint 08 09, `lib/communities/recurring.server.ts`): a moderator's template is posted
    on a schedule by the jobs worker through `prepareCommunityPost` (membership, bans, AutoMod, image descriptions),
    pausing with a reason (`author_not_moderator`, `author_sanctioned`, `held_by_automod`, `gate_refused`) when the gate
    refuses; sprint 09 11 made every scheduled post go through the same gate once.
  - Content warnings (sprint 06 16): a post's `contentWarning` (`prisma/schema/social.prisma`, up to 80 characters)
    hides the post behind its warning on every read path (`CONTENT_WARNING_READ_PATHS`, `lib/feed/content-warning.ts`).
  - Community events (sprint 10 07) and the mod log (`lib/communities/modlog.ts`, public actions listed in
    `PUBLIC_MOD_ACTIONS`).
  - Nothing ties a book to a community, and nothing schedules reading.
- **Decisions:**
  - **Starting one:** a moderator picks a library book the community can read (any book listed in the library and not
    hidden), a start date, a weekday and time in a time zone (the recurring threads' fields), and the parts: by default
    from the book's `toc` grouped into 2–20 parts of roughly equal pages, or equal page ranges when there is no `toc`;
    each part's label and page range can be edited before starting. At most 2 active read-alongs per community.
  - **Each part opens on its date:** the jobs worker posts the part's thread as the moderator who started the
    read-along, through `prepareCommunityPost`, with `contentWarning` "Spoilers: <part label>" and a body naming the
    book, the part and its pages and linking to the read-along page. A refused gate pauses the read-along with the same
    reasons recurring threads use; moderators see the reason and resume. The thread is an ordinary community post:
    replies, reports, AutoMod and bans already apply.
  - **Readers:** a member "Joins" (and can leave). Joining asks nothing else; "Tell me when a part opens" is on by
    default and sends a notice (`notice('read-along-part-open', …)`) to joined readers when the part's thread is posted.
    "I've finished this part" marks the reader's progress (their own; the page shows each joined reader's last finished
    part only to members of the community). Community bans and timeouts refuse joining (`BAN_ENFORCEMENT_PATHS`).
  - **The page** lists the book (with "Open in the library" at the part's first page), the parts with their dates, each
    opened part's thread link, the joined readers, and the reader's own progress. It shows no reply or like count (none
    is read; quiet counts stay out of it).
  - **Private communities:** the page answers like every community page (`page-access.server.ts`); an unknown id and a
    hidden one answer alike.
  - **Mod log:** `read_along_started` and `read_along_cancelled`, in the public log like events.
  - **Cancelling** stops future parts; posted threads stay. A finished read-along stays readable.
  - **Erasure:** reader rows are erased. A read-along the member started passes to the community's owner, paused (the
    recurring threads' rule, `CommunityRecurringThread` in the registry), so the community keeps its schedule; when the
    member owned the community, or it has no owner, the read-along is cancelled and its unposted parts deleted:
    `deidentify` with that reason. **Export:** the read-alongs the member started and their reader rows.

## Functional requirements

1. FR-1 Models `ReadAlong`, `ReadAlongPart`, `ReadAlongReader`; the two-active cap under
   `lockKey(tx, 'read-alongs:<communityId>')`; at most 2,000 joined readers per read-along.
2. FR-2 `lib/communities/read-along.ts` (pure): parts from a `toc` or a page count, the next part's time from the
   weekday, minute and time zone (with `lib/calendar/tz.ts`), validation.
3. FR-3 `lib/communities/read-along.server.ts`: start (moderators), edit parts before the first opens, cancel, resume,
   join, leave, mark a part, read the page, post a due part (claimed by compare-and-set on `postedAt IS NULL`).
4. FR-4 A job `communities.read-along-parts` every 5 minutes: claims due parts (batches of 50), posts them, then sends
   the notices in batches through `lib/async-pool.ts`, claimed once per part by `notifiedAt`.
5. FR-5 Registered endpoints with contracts in `lib/communities/read-along.contract.ts`; writes `rateLimit: 'write'`.
6. FR-6 Pages and components: `app/routes/_site/c.$slug_.read.$id.tsx`, `components/communities/ReadAlongPage.tsx`,
   `ReadAlongStart.tsx` (in the mod tools), the "Reading together" line on the community page.
7. FR-7 Mod-log actions and their labels, the notice key and its label and preview, erasure, export and sitemap under
   the anchors.

## Non-functional requirements

- **Safety:** every part's thread passes the same gate as a member's post; nothing posts while the community bans the
  starter or AutoMod holds the text.
- **Performance:** the page reads one read-along with its parts and readers (at most 2,000) in two queries.
- **Accessibility:** dates in the reader's locale and time zone; every control labelled; member names in `<bdi>`.

## Data model and API

- In `prisma/schema/communities.prisma`: `ReadAlong` (`@@map("read_along")`: `id`, `communityId` → `Community`
  (cascade), `createdById` → `User` (relation `ReadAlongsStarted`), `docSlug` `@db.VarChar(200)`, `bookTitle`
  `@db.VarChar(200)`, `weekday Int`, `minuteOfDay Int`, `timeZone` `@db.VarChar(64)`, `status` `@db.VarChar(12)`
  (`active | paused | cancelled | done`), `pausedReason` `@db.VarChar(32)?`, `createdAt`, `updatedAt`,
  `@@index([communityId, status])`); `ReadAlongPart` (`@@map("read_along_part")`: `id`, `readAlongId` (cascade),
  `position Int`, `label` `@db.VarChar(80)`, `startPage Int`, `endPage Int`, `opensAt DateTime`, `postId String?`,
  `postedAt DateTime?`, `notifiedAt DateTime?`, `@@unique([readAlongId, position])`, `@@index([postedAt, opensAt])`);
  `ReadAlongReader` (`@@map("read_along_reader")`: `readAlongId` (cascade), `userId` → `User` (relation
  `ReadAlongReaders`), `notify Boolean @default(true)`, `lastPartDone Int @default(0)`, `joinedAt`,
  `@@id([readAlongId, userId])`, `@@index([userId])`). Migration `20261201060100_s11_read_alongs`.
- Erasure registry: `ReadAlong` `deidentify`, `ReadAlongPart` `cascade` (parent `ReadAlong`), `ReadAlongReader` `erase`.

## Testing requirements

- Product suite `lib/communities/__tests__/read-along.product.test.ts`: parts from a `toc` (grouping, labels, page
  ranges contiguous) and from a page count; next opening across a daylight-saving change.
- Main suite `lib/communities/__tests__/read-along.test.ts`: moderators only start; the two-active cap under the lock; a
  due part posts once under two concurrent job runs; a refused gate pauses with the reason; the post carries the spoiler
  warning; bans refuse joining; a private community's read-along answers a non-member 404; notices only to joined
  readers with `notify` on, once per part.
- Main suite `lib/account/__tests__/read-alongs-erasure.test.ts`: reader rows erased; a started read-along passes to the
  owner, paused.
- Ban-enforcement registry, notice-key catalogue and preview ratchet, notification-label test, sitemap and OG coverage,
  route table, user-text direction.

## Acceptance criteria

- [ ] A moderator starts a read-along of a library book in four weekly parts; on the first date a thread appears in the
      community behind "Spoilers: Part 1".
- [ ] A joined reader gets one notice when the part opens and can mark it finished.
- [ ] A member banned from the community cannot join.
- [ ] When AutoMod holds a part's text, the read-along pauses and the moderators see why.

## Out of scope

Books outside the library, reading progress read automatically from the reader's synced place (a later step: the member
marks parts), voice or video discussions, read-alongs outside communities.
