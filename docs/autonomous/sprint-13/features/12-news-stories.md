# 12 — News stories you can browse and follow

Surface: `/news/stories` (new index), each story page (`/news/stories/$slug`: "Follow this story", an RSS link), an
article's story line, the inbox (a notice when a story gains an article), `/news/stories/$slug/rss.xml`. Wave 5.
Namespace `news-stories`. Site tier (Steel).

## User story

As a reader of the site's news, I want to find the running stories the editors keep (a dated timeline of related
articles), follow one, and hear when a new article joins it, so that I can keep up with a story without checking the
news page every day.

## Requirements elicitation

- **What exists (verified):**
  - Stories: `NewsStory` (`slug`, `title`, `summary`) and `NewsStoryArticle` (an article by slug in at most one story),
    `prisma/schema/library.prisma`; the reads and admin writes in `lib/reading/stories.server.ts` (`getStoryForArticle`,
    `getStoryPage`, `linkArticle`, `unlinkArticle`, the admin list and suggestions), the admin routes
    `lib/reading/api/admin.reading.stories*.server.ts`, the page `app/routes/_site/news/stories/$slug.tsx`, and the
    article's link to its story (`app/routes/_site/news/$slug.tsx`).
  - **There is no index of stories:** `listPublicStories` exists and is **never called**, and it would list a story with
    no published article (its comment says "with at least one published article"; its query does not filter).
  - `lib/sitemap.ts` has `'/news/stories/$slug': null` ("linked from each member article"); the news RSS is
    `app/routes/news.rss[.]xml.ts` with `lib/rss.ts`; section OG cards in `lib/og/static-cards.ts` and
    `lib/og/static-card-index.ts`; following Logs and News exists (sprint 02 18) but not a story.
  - Articles arrive `PUBLISHED` from the news wire (`lib/news-wire/ingest.server.ts`), so a link made by an admin is
    to a published article in practice.
- **Decisions:**
  - **Index:** `/news/stories` lists stories that have at least one published article, by their newest article's date,
    30 a page, each with its title, summary and article count; a public page with its own section card and in the
    sitemap's static routes.
  - **Follow:** signed-in members follow a story (`NewsStoryFollow(storyId, userId)`, at most 200 follows,
    `NEWS_STORY_FOLLOW_LIMIT`, `max`, under `lockKey`). When an admin links a **published** article to a story, every
    follower is told once ("{{story}}: {{title}}"), linked to the article, through a durable fan-out of kind
    `news-story-article` (`lib/fanout/run.server.ts`, subject `<storyId>:<articleSlug>`) queued after the link commits,
    so a worker restart neither skips nor repeats a batch (the plan's rule: the durable fan-out carries every large
    notice batch; an in-request loop is not used whatever the follower count). Skipped: banned, pending-deletion and
    erased followers. Re-linking an article that was linked before sends nothing new (the run's subject is the same and
    a finished run is not restarted). An unlink sends nothing.
  - **RSS:** `/news/stories/$slug/rss.xml`, the story's published articles newest first, through `lib/rss.ts` (control
    characters stripped as every feed does).
  - **The article line:** an article that belongs to a story shows "Part of {{story}}" with a follow toggle beside it.
  - **Erasure:** a member's follows are erased. Registry `NewsStoryFollow` (`erase`).
  - **Export:** the stories the member follows, as `newsStoryFollows` under the sprint 13 anchor.

## Functional requirements

1. FR-1 Migration `20261220050100_s13_news_stories`: `CREATE TABLE "news_story_follow"` (`"storyId"`, `"userId"`,
   `"createdAt"`, primary key `("storyId", "userId")`, index on `"userId"`, foreign keys cascading).
2. FR-2 `lib/reading/stories.server.ts`: `listPublicStories` filters to stories with a published article and pages by
   the newest article; `follow`, `unfollow`, `isFollowing`; `linkArticle` notifies followers after it commits.
   `lib/reading/story-follows.server.ts` (new): the fan-out's audience batches and runner, its queue and worker, the
   export and the erasure ops; `news-story-article` joins `FANOUT_KINDS` (`lib/fanout/run.ts`) and `reclaimJob`
   (`lib/fanout/queue.server.ts`) learns its queue; the worker is registered under `// s13-12 news-stories` in
   `server/jobs/index.ts`.
3. FR-3 Endpoints (registered modules, contract `lib/reading/stories.contract.ts`): `GET /api/news/stories`,
   `PUT|DELETE /api/news/stories/$slug/follow` (`rateLimit: 'write'`).
4. FR-4 Pages: `app/routes/_site/news/stories/index.tsx` (`head()` with `buildMeta`, its static card), the follow toggle
   on the story page and the article's story line; `app/routes/news.stories.$slug.rss[.]xml.ts`.
5. FR-5 Notice `news-story-article` under the Wave 0 notice anchors; `/news/stories` under the sitemap's static anchor;
   the static card under `lib/og/static-cards.ts`.

## Non-functional requirements

- **SEO:** the index unfurls as itself (its own title, description and card; `lib/__tests__/og-page-coverage.test.ts`).
- **Delivery:** one notice per follower per article: the fan-out's told-ids rule across restarts, and one run per
  `(story, article)` subject.
- **Design (Steel):** the index is rows on rules; the follow toggle is a secondary button; no primary on the index.

## Data model and API

`NewsStoryFollow { storyId, userId, createdAt }` (`@@id([storyId, userId])`, `@@index([userId])`,
`@@map("news_story_follow")`). `GET /api/news/stories?cursor=` → `{ stories, nextCursor }`.

## Testing requirements

- Main suite `lib/reading/__tests__/story-follows.test.ts`: follow, unfollow, the cap under the lock; linking a
  published article queues one fan-out run that tells each follower once (a resumed run skips those told); unlinking
  notifies nobody; a banned or pending-deletion follower is skipped; the fan-out kind test in `lib/fanout/__tests__/`.
- Product suite `lib/reading/__tests__/stories-index.product.test.ts`: ordering by newest article and the
  published-only rule (pure helper).
- `app` RSS test `lib/reading/__tests__/story-rss.test.ts`: the feed's items and escaping.
- Main suite `lib/account/__tests__/story-follows-erasure.test.ts`; the export test (key `newsStoryFollows`); sitemap
  coverage and sections (`lib/__tests__/sitemap-sections.test.ts`'s `prismaMock` learns the model if read); OG page
  coverage; notice keys, preview ratchet, notification labels.

## Acceptance criteria

- [ ] `/news/stories` lists the stories with published articles, newest activity first, and unfurls with its own card.
- [ ] A member follows a story and, when an admin links a new article, gets one notice linking to it.
- [ ] The story's RSS feed lists its articles.
- [ ] A story with no published article is not listed.

## Out of scope

Member-made stories, e-mail digests of stories, following an article's discussion.
