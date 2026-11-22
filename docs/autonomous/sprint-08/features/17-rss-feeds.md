# 17 — RSS for communities, build releases and game updates

Surface: three new feed routes and an RSS link on the community page
(`/c/$slug`), a build's page (`/builds/$slug`) and a game's updates page
(`/games/$gameId/updates`). Wave 6. Namespace `rss-feeds`.

## User story

As a reader who follows things in a feed reader, I want an RSS feed of a
public community's posts, of a build's releases and of a game's patch notes,
so that I can follow them without an account, a notification or a daily
visit.

## Requirements elicitation

- **What exists (verified):**
  - RSS 2.0 rendering in `lib/rss.ts` (`renderRssFeed`, used by
    `/blog/rss.xml`, `/news/rss.xml`, `/tag/$tag/rss.xml` and
    `/u/$handle/rss.xml`), with item builders in `lib/feed/rss.server.ts`
    (`tagFeedItems`, `userFeedItems`: "a feed has no viewer, so the predicate
    must be the strict public one and must be shared with the user feed").
  - The tag route (`app/routes/tag.$tag.rss[.]xml.ts`) is the pattern:
    validate the param, build items, `Cache-Control: public, max-age=600,
    stale-while-revalidate=3600`. Pages advertise feeds with
    `<link rel="alternate" type="application/rss+xml">` in `head()`
    (`app/routes/_site/news/index.tsx`).
  - No feed exists for a community, a build or a game's updates. Build
    releases are `BuildVersion` rows (`lib/builds/releases.server.ts`, sprint
    04 04); patch notes are listed by `listPatchNotes`
    (`lib/arcade/updates.server.ts`, sprint 03 10).
- **Decisions:**
  - **`/c/$slug/rss.xml`:** the 30 newest posts of a **public** community
    that a signed-out visitor can read on `/c/$slug`: not held, not removed,
    not by a member banned from the community or from the site, audience
    public, not locked behind a price. Content-warned posts carry the warning
    as the item title and no media; posts with a quiz poll show the question
    and options without the answer (sprint 07 19). A private or locked
    community returns 404 (not 403: its existence is not confirmed). The item
    builder lives beside `tagFeedItems` and reuses the strict public
    predicate; the new file joins the read-path registries that list post
    readers (content warnings, GIF descriptions, quiz polls).
  - **The registries by name:** `QUIET_COUNT_READ_PATHS`
    (`lib/feed/quiet-counts.ts`), `CONTENT_WARNING_READ_PATHS` /
    `CONTENT_WARNING_EXEMPT_PATHS` (`lib/feed/content-warning.ts`),
    `GIF_ALT_READ_PATHS` / `GIF_ALT_EXEMPT_PATHS` (`lib/feed/gif-alt.ts`),
    `QUIZ_READ_PATHS` / `QUIZ_NEVER_PATHS` (`lib/feed/quiz-poll.ts`). Each new
    file goes in the read list when it reads the field, or in the exempt /
    never map with its reason (a feed, like `lib/rss.ts`, is a "never" path for
    quiz answers).
  - **`/builds/$slug/rss.xml`:** the 30 newest releases of a build with
    `visibility = PUBLIC` and `publishedAt` set (version, title, notes as
    text, release date, a link to the build page). `UNLISTED` and `PRIVATE`
    builds and unpublished drafts: 404 (an unlisted build is reachable by
    link on the site, but a feed is a subscription and an aggregator would
    surface it). Items carry exactly what the build page shows a signed-out
    visitor — never a download, repo or demo URL of a priced build (`price`
    set), and never a commit hash beyond what the page shows.
  - **`/games/$gameId/updates/rss.xml`:** the game's 30 newest published
    patch notes (guides are not included), from the same query
    `listPatchNotes` runs; an unknown game id (not in `lib/catalog`) is 404.
  - **The page is the oracle.** Each feed lists exactly what its page shows a
    signed-out visitor, no more: the main test builds the page's list and the
    feed's items from one fixture (held, removed, banned author, a member in
    the deletion grace period, a locked post) and asserts the feed's ids are
    a prefix of the page's.
  - Each page gains the `<link rel="alternate">` in `head()` and a small
    "RSS" text link (a navigation word, not underlined; lucide `Rss` icon at
    16 px with the word) — on the community page only for public communities.
  - Route files sit outside the layouts that would wrap them (`c_.$slug…` /
    `games_.$gameId…` un-nesting where TanStack would otherwise nest them under
    a layout); the implementer checks the path answers with a GET in the dev
    server-free route test the tag feed uses.
  - No new sitemap entry (feeds are not pages); if the sitemap coverage test
    sees the route files, they go under the `s08-17 rss-feeds` anchor in
    `EXCLUDED_ROUTES` with the reason `feed`.

## Functional requirements

1. FR-1 The three feeds with validation, 404 rules and caching.
2. FR-2 Item builders sharing the strict public predicates; registries
   updated.
3. FR-3 Autodiscovery links and the visible RSS link on the three pages.

## Non-functional requirements

- **Correctness:** XML escaped by `renderRssFeed`; item links absolute
  (`SITE_URL`); dates RFC 822.
- **Performance:** one indexed query per feed; 10-minute public cache.
- **Privacy:** nothing a signed-out visitor could not see.
- **Steel:** the visible link is a text link with an icon, no badge or box.
- **i18n:** `rss-feeds` for the link text; feed titles and descriptions are
  English like the existing feeds (feeds have no reader locale).

## Data model and API

- No schema or API change.
- New `lib/feed/rss-community.server.ts`, `lib/builds/rss.server.ts`,
  `lib/arcade/updates-rss.server.ts`; routes
  `app/routes/c_.$slug.rss[.]xml.ts` (or the name that resolves to
  `/c/$slug/rss.xml`), `app/routes/builds_.$slug.rss[.]xml.ts`,
  `app/routes/games_.$gameId.updates.rss[.]xml.ts`;
  `components/feed/RssLink.tsx` for the two site pages, and an inline link
  in the steam shell's own style on the game updates page (app tier, L8).
- Edits: `app/routes/_site/c.$slug.tsx`, `app/routes/_site/builds/$slug.tsx`,
  `app/routes/games/_library/$gameId_.updates.tsx` (`head()` and the link).

## Testing requirements

- Main suite `lib/feed/__tests__/rss-community.test.ts`: private community →
  none; held, removed, banned author, locked post excluded; content warning
  replaces content; quiz answer absent.
- Main suite `lib/builds/__tests__/rss.test.ts` and
  `lib/arcade/__tests__/updates-rss.test.ts`.
- Read-path registry tests pass with the new file.
- Existing: `lib/__tests__/rss*.test.ts`, sitemap and OG coverage.

## Acceptance criteria

- [ ] A feed reader subscribes to a public community and gets its posts;
      a private community's feed is a 404.
- [ ] A build's new release appears in its feed within ten minutes.
- [ ] The three pages advertise their feed in `<head>`.
- [ ] The RSS links in Day and Night (site pages) and in the games library's
      own look, 390 px and 1280 px.

## Out of scope

Atom or JSON Feed, full-text media in items, per-member private feeds (the
calendar ICS feed exists), feeds for events.
