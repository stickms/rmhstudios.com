# 08 — Feeds and lists in the developer API

Surface: `/api/v1/me/feeds*`, `/api/v1/feeds/{id}/posts`, scopes `read:feeds` and `write:feeds`, the API docs and SDK.
Wave 1. No namespace (no UI strings).

## User story

As a developer building a reader or a bot for my own account, I want to read my custom feeds, lists and saved searches,
page through a feed's posts as the site shows them, and keep a list's members in sync from a script, so that my client
shows the same curated timelines I made on the site.

## Requirements elicitation

- **What exists (verified):**
  - One model, `CustomFeed` (`prisma/schema/social.prisma`, "A Feed 2026-11-19"), holds four kinds told apart by `kind`:
    `feed` (tags + people + keywords), `list` (a curated set of accounts, members in `CustomFeedMember`), `search` (a
    saved universal search: `query` + `types`), `alert` (a keyword alert: `query` + `anchor`, `notify`). `visibility` is
    `ListVisibility` (`PRIVATE` / `UNLISTED` / `PUBLIC`) beside a legacy `isPublic` flag; "readable by others" is
    `readableByOthers(row)` = `isPublic || visibility !== 'PRIVATE'`, and the API uses that function, never either field
    alone.
  - Every reader goes through `lib/feeds/feeds.server.ts`: `toFeedSource`, `readableByOthers`, `feedMemberIds`,
    `readFeedPage(src, viewerId, { cursor, pageSize })` — which applies the viewer's blocks, mutes and the shared
    visibility predicate — and `setFeedPeople` (a bare delete-and-insert with no cap or checks). Feeds are managed by
    `lib/discovery/feeds.server.ts` behind `lib/discovery/api/feeds*.server.ts`; **lists** by
    `lib/lists/lists.server.ts` (`addMember`, `removeMember`, `MAX_MEMBERS = 500`, `MAX_LISTS = 20` in
    `lib/lists/constants.ts`). The site's `addMember` checks ownership, kind and the cap, and nothing about blocks.
  - The developer API has no feed or list endpoint (`lib/api/scopes.ts` ends at `read:search`); posts are serialised for
    the API by `lib/api/serializers.server.ts`, which is a registered reader in the post read-path registries.
- **Decisions:**
  - **Endpoints (route files under `app/routes/api/v1/`, `withDeveloperApi`):**
    - `GET /api/v1/me/feeds?kind=` — the key owner's feeds of every kind (id, kind, name, description, visibility,
      pinned, tags, keywords, query, types, notify, subscriber count, created and updated), newest first,
      cursor-paginated. `read:feeds`.
    - `GET /api/v1/me/feeds/{id}` — one, with `members` (handles) for a list or feed with people. `read:feeds`; 404 for
      another member's private feed.
    - `GET /api/v1/feeds/{id}/posts?cursor=` — the posts of a feed the key owner owns **or** that is readable by others
      (`readableByOthers`), through `readFeedPage` with the key owner as viewer, serialised by the API serialiser (so
      quiet counts, content warnings, GIF descriptions and quiz reveals apply). `read:feeds` + `read:posts`. A `search`
      or `alert` kind returns 409 `not_a_timeline` (they are queries, not timelines; the search API, sprint 08 14,
      serves them).
    - `PUT /api/v1/me/feeds/{id}/members` — replace a **list's** members (`kind = 'list'`, owned by the key owner) by
      handle, at most `MAX_MEMBERS` (500) handles, through a new `replaceListMembers(ownerId, listId, userIds)` in
      `lib/lists/lists.server.ts` (ownership and kind checked, `setFeedPeople` inside). Handles that resolve to no
      account, to a deleted or banned account, or to a member blocked in either direction are reported per handle
      (`skipped: [{ handle, reason: 'not_found' | 'blocked' }]`) and not added (the API is stricter than the site's
      `addMember`; the site is unchanged). `write:feeds`.
    - Creating, renaming and deleting feeds stay on the site (sprint 07's habit: start with reads and the one write a
      script needs).
  - **Rate limits:** the API's standard read and write classes.
  - **Webhooks:** none.

## Functional requirements

1. FR-1 The four endpoints with zod-validated query and body, keyset pagination, and the error envelope of `/api/v1/**`.
2. FR-2 The two scopes in `lib/api/scopes.ts` (anchor) and `docs/developer-api/scopes.md`.
3. FR-3 Registry entries (`lib/api/registry.ts`, anchor) with examples; SDK and API docs regenerated; `NULLABLE` lines
   for nullable fields.
4. FR-4 The changelog bullets (anchor).
5. FR-5 The new reader file is appended to `CONTENT_WARNING_READ_PATHS`, `QUIET_COUNT_READ_PATHS`, `GIF_ALT_READ_PATHS`
   and `QUIZ_READ_PATHS` (or to each one's exempt map with a reason, if it only delegates to the serialiser).

## Non-functional requirements

- **Security:** every read is scoped to the key owner or `readableByOthers`; a by-link feed is readable by id (as on the
  site); a private feed of another member is 404 (not 403). The members PUT verifies ownership and kind inside the
  handler.
- **Correctness:** additive to the public API; existing paths unchanged.
- **Performance:** `readFeedPage` already pages by keyset; the API page size is at most 50.

## Data model and API

- No schema change. New `lib/api/v1/feeds.server.ts`, `lib/api/v1/feeds-schema.ts`, the four route files. Edits:
  `lib/lists/lists.server.ts` (`replaceListMembers`), `lib/api/scopes.ts`, `lib/api/registry.ts`,
  `scripts/generate-sdk.ts`, `docs/developer-api/{changelog,scopes}.md`, the four read-path registries.

## Testing requirements

- Main suite `lib/api/v1/__tests__/feeds-api.test.ts` (mock Prisma and `lib/feeds/feeds.server.ts`): own feeds listed;
  another member's private feed 404; a public feed's posts readable; a search kind 409; posts go through the serialiser
  (quiet counts honoured for a stranger); an `UNLISTED` list and an `isPublic` legacy row are readable by id; members
  PUT replaces, skips blocked, deleted and banned handles, caps at 500, refuses a non-list and another member's list;
  scopes enforced.
- The four read-path registry tests, `lib/api/__tests__/route-table.test.ts`, the OpenAPI and SDK generation checks
  (`pnpm sdk:generate` leaves no `unknown`).

## Acceptance criteria

- [ ] A key with `read:feeds` lists the owner's feeds and lists.
- [ ] Paging a feed's posts returns the same posts the site's feed page shows the owner, with counts hidden where the
      authors asked.
- [ ] A script replaces a list's members; a blocked handle is reported as skipped.
- [ ] A private feed of someone else is 404.

## Out of scope

Creating or deleting feeds through the API, subscribing to public feeds, saved-search execution (the search API exists),
keyword-alert delivery.
