# 03 — Drafts and scheduled posts in the developer API

Surface: `/api/v1/me/scheduled*`. Wave 3. No namespace.

## User story

As a member who writes a weekly digest in my own notes tool, I want to push it
to RMH Studios as a scheduled post from a script, see what is queued and move
or cancel it, so that I stop copying text into the composer every Sunday.

## Requirements elicitation

- **What exists (verified):**
  - `ScheduledPost` (`prisma/schema/social.prisma`) is both a draft
    (`scheduledAt` null) and a scheduled post, with images and alt text, a GIF
    and its description, audience, content warning, reply control, community,
    poll JSON and time capsules (`isCapsule`).
  - The site endpoints are `lib/scheduled/api/scheduled.server.ts` (list and
    create; the create counts pending rows against `MAX_PENDING` **without a
    lock**, then inserts), `scheduled.$id.server.ts`,
    `scheduled.$id.publish.server.ts`; validation in
    `lib/scheduled/scheduled-schema.ts`; publication in
    `lib/scheduled/publish.server.ts` (`publishScheduledPost`, which re-checks
    community sanctions and the image-description rule) and the posts-plus
    sweep in `lib/posts-plus/capsules.server.ts` (`publishDueScheduled`),
    registered in `server/jobs/index.ts`.
  - `POST /api/v1/posts` (`app/routes/api/v1/posts.ts`) publishes immediately;
    there is no v1 drafts or schedule endpoint.
- **Decisions:**
  - Scope `read:scheduled` for `GET /api/v1/me/scheduled` (cursor list, filter
    `kind=draft|scheduled|capsule`) and `GET /api/v1/me/scheduled/{id}`;
    scope `write:scheduled` for `POST /api/v1/me/scheduled`,
    `PATCH /api/v1/me/scheduled/{id}`, `DELETE /api/v1/me/scheduled/{id}`
    and `POST /api/v1/me/scheduled/{id}/publish`.
  - The API body is the v1 post body (`content`, `audience`, `replyControl`,
    `contentWarning`, `communityId`, `poll`, `media_ids` from
    `POST /api/v1/images` exactly as `POST /api/v1/posts` takes them, and
    their descriptions) plus `scheduledAt` (absent = draft; must
    be at least 2 minutes and at most 365 days ahead). **Capsules cannot be
    created or edited through the API** (they are a ceremony of the site) and
    are listed read-only.
  - **One create path.** The site's create logic moves into
    `lib/scheduled/create.server.ts` (`createScheduledPost(userId, input)`),
    which takes `lockKey(tx, 'scheduled:<userId>')` around the
    `MAX_PENDING` count and the insert — fixing the race for the site too —
    and keeps the sprint 06 community-sanction refusal. The site route and the
    v1 route both call it; `updateScheduledPost` likewise.
  - **Community posts through the API** follow `POST /api/v1/posts`: a body
    with `communityId` needs `write:scheduled` **and** `write:communities`
    (`403 insufficient_scope` otherwise), and the v1 create and patch run
    `prepareCommunityPost` (`lib/communities/post-gate.server.ts`:
    membership, bans and timeouts, flair, verification, image descriptions,
    AutoMod) at write time. A refusal is the same v1 error the post create
    returns; an outcome that AutoMod would **hold** or **flag** is refused
    with `422 automod_held` ("This post would be held for review; post it
    directly so moderators can review it") because `publishScheduledPost`
    publishes without a hold. The site's scheduled create is unchanged in
    this respect (it never ran AutoMod; recorded as a follow-up, not fixed
    here, so this feature does not change what moderators see from the
    site). Decision by default: a key is the likeliest spam path, so it gets
    the stricter gate.
  - The publish endpoint and the due sweep both use `publishScheduledPost`, so
    every gate applies. A post scheduled into a community that bans the member
    meanwhile stays a draft, and the list says `held: "community_sanction"` or
    `held: "image_descriptions"` (read from the same checks, never stored).
  - `Idempotency-Key` honoured on POST.

## Functional requirements

1. FR-1 The six endpoints, with the v1 error envelope and pagination.
2. FR-2 `createScheduledPost` / `updateScheduledPost` shared with the site;
   the site route's behaviour is unchanged except that the cap is now exact.
3. FR-3 Registry, scopes, `NULLABLE`, SDK and docs regenerated; changelog and
   scopes doc lines.
4. FR-4 Test-mode fixtures.

## Non-functional requirements

- **Correctness:** the cap holds under concurrency (lock); `scheduledAt`
  bounds are checked server-side in UTC.
- **Security:** zod everywhere; images are the key owner's own
  `media_ids` (the same resolution the v1 post create uses); `withDeveloperApi` limits.
- **Privacy:** the key owner's rows only; never another member's drafts.
- **Compatibility:** additive.

## Data model and API

- No schema change.
- `lib/scheduled/create.server.ts`; `lib/api/v1/scheduled-schema.ts`,
  `lib/api/v1/scheduled.server.ts`; route files `app/routes/api/v1/me/scheduled.ts`,
  `me/scheduled/$id.ts`, `me/scheduled/$id/publish.ts`.
- Edits: `lib/scheduled/api/scheduled.server.ts` and `scheduled.$id.server.ts`
  (call the shared functions).

## Testing requirements

- Main suite `lib/scheduled/__tests__/create-lock.test.ts`: lock taken before
  the count; the cap refuses the 51st (or `MAX_PENDING + 1`th) row;
  sanctions refuse.
- Main suite `lib/api/__tests__/v1-scheduled.test.ts`: scopes (a
  `communityId` without `write:communities` is refused); `prepareCommunityPost`
  runs on create and patch and a held outcome is `422 automod_held`; capsules
  refused on create and patch; `scheduledAt` bounds; held reasons; publish
  delegates to `publishScheduledPost`; idempotent retry.
- Existing: `lib/scheduled/__tests__/*`, `lib/posts-plus/__tests__/capsules*`.

## Acceptance criteria

- [ ] A script schedules a post for tomorrow 09:00 UTC; it appears in
      `/drafts` and is published by the sweep.
- [ ] Two concurrent creates at the cap leave exactly `MAX_PENDING` rows.
- [ ] A capsule shows in the API list but cannot be changed through it.
- [ ] SDK and docs list the endpoints.

## Out of scope

Recurring schedules (09 does community threads), media upload through this
endpoint (the existing v1 image endpoint is used first), webhooks on publish.
