# 11 — Communities in the developer API

Surface: `/api/v1/communities*`, `/api/v1/me/communities`, `POST
/api/v1/posts` (a new optional field), the OpenAPI document, SDK and docs.
Wave 5. No namespace.

## User story

As a moderator of a community, I want my bot to read the community's newest
posts and rules, so that it can mirror announcements to our Discord.

As a member, I want my script to post into a community I belong to, under the
same rules as the site, so that my weekly "what are you playing" thread posts
itself.

## Requirements elicitation

- **What exists (verified):**
  - The developer API has no communities (`grep -rl communit
    app/routes/api/v1` finds only `communityId` echoed in post payloads) and no
    communities scope (`lib/api/scopes.ts`). `POST /api/v1/posts`
    (`app/routes/api/v1/posts.ts`) creates posts on the owner's timeline only.
  - The site's community post path (`lib/feed/api/rmharks.server.ts`) checks
    membership, then `gateCommunityContent` (`lib/communities/gate.server.ts`:
    verification level, flair requirement, bans and timeouts from sprint 06 01,
    AutoMod with allow / deny / hold / remove outcomes, and — after feature 16
    in Wave 2 — the community's image-description requirement), then logs
    removals (`logRemoved`).
  - Reading: `lib/communities/detail.server.ts`, `directory.server.ts`,
    `rules.server.ts` (`listRules`), the community feed
    (`lib/communities/api/communities.$slug.feed.server.ts`), privacy
    (`Community.isPrivate`, `lib/communities/access.server.ts`), and the
    read-path rules for posts (`lib/feed/map-feed-item.server.ts`: quiet counts,
    content warnings, GIF descriptions, hidden and removed posts).
  - Sprint 06 13 and this sprint's 10 are the worked examples for a v1 domain.
- **Decisions:**
  - Two new scopes: `read:communities` ("Read communities you can see, their
    rules and posts, and your memberships") and `write:communities` ("Post
    into communities you are a member of"). A `POST /api/v1/posts` with a
    `communityId` needs **both** `write:posts` and `write:communities`;
    without `communityId` only `write:posts`, as today. Reason (changed in
    validation): `write:posts` is documented as posting to the member's own
    timeline, and existing keys must not silently gain the power to post
    into communities — that would widen an existing scope, not add one.
    Wildcard keys (`write:*`, `*`) satisfy it, as for every scope; the
    changelog says so. Joining and leaving stay on the site (joining can
    require agreement to rules, sprint 03 13).
  - Endpoints:
    - `GET /api/v1/me/communities` — the owner's memberships with role and
      joined date.
    - `GET /api/v1/communities/$slug` — name, description, member count,
      privacy, posting requirements, flairs, whether the owner is a member.
      A private community the owner is not in is a 404.
    - `GET /api/v1/communities/$slug/rules` — the rules as the site shows them.
    - `GET /api/v1/communities/$slug/posts?cursor&flair` — the community feed as
      the site's community feed returns it to the owner (same visibility, same
      removed/held handling, same mapping through `map-feed-item.server.ts` and
      the same serializer `/api/v1/feed` uses), newest first.
    - `POST /api/v1/posts` gains optional `communityId` (and `flairId`): when
      present, the route runs **the same membership check and
      `gateCommunityContent` call the site's create path runs** — extracted into
      one shared function `prepareCommunityPost` so the two cannot drift — and
      maps the outcomes: deny → 403/400 with the gate's code; hold → 202
      `{ status: "held" }` (the post waits in the mod queue as on the site);
      remove → 422 with the rule name; allow → 201 as today.
  - Community moderation (mod queue, bans, notes, mod log) is not in the API.
  - Rate limits: posting into a community counts against the existing post
    write budget; the community's own slow-mode or posting limits apply because
    the gate applies them.

## Functional requirements

1. FR-1 The four read endpoints and the `POST /api/v1/posts` extension, each
   `withDeveloperApi` with its scope, key restrictions (sprint 03 06) and the
   v1 read/write rate limits, as the other v1 routes.
2. FR-2 `prepareCommunityPost` in `lib/communities/post-gate.server.ts`, used by
   both `lib/feed/api/rmharks.server.ts` and the v1 route; the site's
   behaviour is unchanged (its existing tests pass).
3. FR-3 OpenAPI entries under the `s07-11 api-communities` anchor; the two scopes;
   `NULLABLE` entries (`description`, `flairId`, `bannerUrl`, …);
   regenerated SDK and docs; changelog.
4. FR-4 Keyset pagination and `Idempotency-Key` on the write as elsewhere.

## Non-functional requirements

- **Additive only:** `communityId` and `flairId` are optional; a request
  without them behaves byte-for-byte as before.
- **Privacy:** every read applies the site's visibility rule for the owner;
  member lists are not exposed; banned or timed-out members are refused at
  post time with the gate's code and `endsAt`.
- **Read paths:** the community posts endpoint is added to every read-path
  registry that lists `/api/v1/feed` (quiet counts `QUIET_COUNT_READ_PATHS`,
  content warnings, GIF descriptions, ban enforcement `BAN_ENFORCEMENT_PATHS`
  from sprint 06 01, and any other registry whose test lists v1 feed routes —
  run each registry test and add the route where it asks).
- **Security:** zod on every input; `communityId` must be a community the owner
  is a member of; flair must belong to that community; a key without
  `write:communities` sending `communityId` gets the standard
  `insufficient_scope` 403 before any gate runs (test).
- **Owner-only:** every endpoint acts as the key's owner; no endpoint takes a
  `userId` or lists members.
- **Performance:** the posts endpoint reuses the site's community feed query
  (no second implementation).

## Data model and API

- No schema change.
- `lib/communities/post-gate.server.ts` (`prepareCommunityPost`), with the site
  create path switched to it.
- `lib/api/v1/communities-schema.ts`, `lib/api/v1/communities.server.ts`.
- Route files `app/routes/api/v1/communities/$slug.ts`, `$slug/rules.ts`,
  `$slug/posts.ts`, `app/routes/api/v1/me/communities.ts`; edit
  `app/routes/api/v1/posts.ts` (POST).
- `lib/api/scopes.ts`, `lib/api/registry.ts` (anchor; plus the two optional
  fields on the create-post body, in place), `scripts/generate-sdk.ts`
  (`NULLABLE` anchor), regenerated SDK and API docs.

## Testing requirements

- Main suite `lib/api/v1/__tests__/communities-api.test.ts`: scope required;
  private community 404 for a non-member; posts endpoint hides removed and held
  posts as the site does; post into a community without membership 403; a
  timed-out member gets the gate's code and `endsAt`; AutoMod hold → 202 and
  the post is in the mod queue; remove → 422; allow → 201; a post with no
  `communityId` unchanged; a `write:posts`-only key with `communityId` →
  403 `insufficient_scope` and nothing written; a `write:*` key succeeds.
- `lib/communities/__tests__/post-gate.test.ts`: the shared function gives the
  site and the API the same outcome for the same input.
- Existing tests that must stay green: the site's community post tests, the
  community bans tests, the v1 posts tests.
- Gate tests: route table, the read-path registry tests named above.

## Acceptance criteria

- [ ] A member's key reads a community's rules and newest posts.
- [ ] A key posts into the community; a held post waits in the mod queue and
      the API says `held`.
- [ ] A member under a community timeout is refused by the API with the end time.
- [ ] A private community is invisible to a non-member's key.
- [ ] No existing endpoint's output changed.

## Out of scope

Joining and leaving through the API, moderation endpoints, community webhooks,
creating communities.
