# 17 — Community oversight for admins

Surface: `/admin/communities` (new), the admin hub, the community page (a line for its moderators), every place that
lists communities for discovery. Wave 6. Namespace `admin-communities`. Site tier (Steel).

## User story

As an admin, I want one list of communities with the signals that need my attention — open reports, moderators who have
gone quiet, sudden growth — and, for one that is being used to spam or harass, a way to take it out of discovery while
its moderators sort it out, so that I can act on a community without deleting it or editing the database.

## Requirements elicitation

- **What exists (verified):**
  - Communities have per-community moderation (bans, notes, AutoMod, mod queue, mod log, handover) under
    `lib/communities/`, and admins can take over an ownerless community
    (`components/communities/AdminOwnedCommunities.tsx`, sprint 04 17). `/admin` has no community page
    (`app/routes/_site/admin/index.tsx`).
  - Discovery readers that list communities to people who are not members: `listCommunities`
    (`lib/communities/directory.server.ts`), `lib/explore.server.ts`, the related rail
    (`lib/communities/sisters.server.ts`), a game's communities (`lib/games/detail.server.ts`) and the sitemap
    (`lib/sitemap.server.ts`). The community search is `listCommunities`' `q`
    (`lib/communities/api/communities.server.ts`); universal search (`lib/search/universal.server.ts`) filters posts by
    community but lists no communities.
  - Reports on a community's posts are `ContentReport` rows (`entityType` `rmhark`), with the post's `communityId`.
- **Decisions:**
  - **The list:** communities with members, posts in the last 7 days, open reports on its posts, open mod-queue items,
    the last moderator action (from the mod log) and growth (members joined in 7 days vs the previous 7); filters
    "Reports open", "No moderator action in 30 days", "Growing fast" (joins doubled and at least 50), "Out of
    discovery", "All"; search by name or slug. Rows on rules with `t-meta` figures (D10 stays open).
  - **Detail:** moderators and their last action, the last 20 mod-log entries, open reports with links to
    `/admin/reports`.
  - **Out of discovery** (`delistedAt`, `delistedReason`, `delistedById`): with a required reason, the community stops
    appearing in every discovery reader (a `DISCOVERY_READ_PATHS` list with a source-scan test) and its posts stop
    appearing in Explore; members, the community page, its feed, links and notifications are unchanged. Its moderators
    see one line on the community page, "This community is out of discovery: <reason>", and get one notice. "Return to
    discovery" clears it. Both audited with `recordAdminActionIn`.
  - **No new powers over members:** no freeze, archive or deletion (archiving was rejected in sprint 06 as an owner call
    on what happens to members).

## Functional requirements

1. FR-1 Three nullable columns on `Community`.
2. FR-2 `lib/admin/communities.server.ts`: list (keyset, figures from grouped queries), detail, delist, return.
3. FR-3 Registered admin endpoints with contracts; `/admin/communities` page; admin hub and sitemap entries (anchors).
4. FR-4 `discoverableCommunityWhere` (pure, Prisma-where shaped) adopted by every `DISCOVERY_READ_PATHS` reader;
   Explore's post rail excludes delisted communities' posts.
5. FR-5 The moderators' line on `/c/$slug` and the notice key with its label.

## Non-functional requirements

- **Security:** admin-only routes and server functions, guarded in their handlers; the reason is plain text.
- **Performance:** figures come from indexed grouped queries over a page of 50 communities; no per-row query loop.
- **Design:** rows on rules; the line on the community page is text on a rule, not a tinted box (D8 stays open).

## Data model and API

- `prisma/schema/communities.prisma` (`Community`): `delistedAt DateTime?`, `delistedReason String? @db.VarChar(300)`,
  `delistedById String?`. Migration `20261130060200_s10_admin_communities`.
- New `lib/communities/discovery.ts` (`discoverableCommunityWhere`, `DISCOVERY_READ_PATHS`),
  `lib/admin/communities{,.contract,-schema,.server}.ts`, `lib/admin/api/admin.communities*.server.ts`,
  `app/routes/_site/admin/communities.tsx`, `components/admin/CommunitiesAdmin.tsx`.
- Edits: the discovery readers listed above, `components/communities/CommunityPlusBody.tsx` (the line), the anchored
  files (admin hub, sitemap, notice keys and previews, labels and test, `user-text.ts`).

## Testing requirements

- Main suite `lib/admin/__tests__/admin-communities.test.ts`: non-admin refused; delist writes the audit row and
  notifies moderators; return clears it; the figures for a page come from grouped queries (one call each).
- Main suite `lib/communities/__tests__/discovery-read-paths.test.ts`: every listed reader uses
  `discoverableCommunityWhere`; a delisted community is absent from the directory, Explore, the related rail, a game's
  communities and the sitemap, and present on its own page and for its members.
- Server-fn guard ratchet, sitemap coverage, notice-key and labels tests.

## Acceptance criteria

- [ ] `/admin/communities?filter=reports` lists communities with open reports and their figures.
- [ ] Taking a community out of discovery removes it from the directory and Explore, and its moderators see why.
- [ ] Members still read and post as before.
- [ ] Returning it restores discovery.

## Out of scope

Freezing, archiving or deleting communities, removing moderators, admin posts into a community, public notices of a
delisting.
