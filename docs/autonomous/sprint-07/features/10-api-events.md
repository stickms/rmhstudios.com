# 10 — Events and RSVPs in the developer API

Surface: `/api/v1/events*`, `/api/v1/me/events`, the OpenAPI document, the
generated SDK and the developer docs. Wave 3. No namespace (no UI strings).

## User story

As a member who runs a weekly game night, I want my Discord bot to read my
upcoming events and who is coming, and to let me RSVP from a script, so that
the bot can post "4 going, 1 maybe" without me copying it by hand.

As a member, I want a script to list the events I am going to, so that I can put
them in my own planner.

## Requirements elicitation

- **What exists (verified):**
  - The developer API (`app/routes/api/v1/**`, `withDeveloperApi` and
    `apiOptions` in `lib/api/with-developer-api.server.ts`, scopes in
    `lib/api/scopes.ts`, OpenAPI paths in `lib/api/registry.ts`, SDK from
    `scripts/generate-sdk.ts`, docs from `scripts/generate-api-docs.ts` and the
    hand-written `docs/developer-api/*`) covers posts, feed, users, follows,
    bookmarks, notifications, builds, content, leaderboards, Slice It, games,
    playtime, achievements, personal bests, webhooks and flashcards. **It has
    no events** (`ls app/routes/api/v1` shows none) and no events scope.
  - Sprint 06's README rejected "Events and RSVPs in the developer API" only
    because it would have competed with that sprint's two event features for
    `lib/events.server.ts`; both have shipped.
  - Events: `lib/events.server.ts` (`canViewEvent`, `getEvent`, `listEvents`,
    `listMemberCommunityEvents`, `rsvp`, `unrsvp`), co-hosts (sprint 05 05,
    `lib/events/cohosts.server.ts`), waitlists (sprint 04 02,
    `lib/events/waitlist.server.ts`), occurrences and overrides (sprint 06 10,
    `lib/events/occurrences.server.ts`), updates (sprint 06 11), visibility
    (`EventVisibility`), community events gated by
    `canViewCommunityEvents`.
  - Sprint 06 13 (flashcards in the API) is the worked example for a v1 domain:
    `lib/api/v1/study-schema.ts`, `lib/api/v1/study.server.ts`, keyset cursors,
    a write budget (`writeBudgetExceeded`), additive OpenAPI entries under the
    registry anchor, and `NULLABLE` entries in `scripts/generate-sdk.ts` so no
    SDK field is `unknown`.
- **Decisions:**
  - Two new scopes: `read:events` ("Read events you can see and your RSVPs")
    and `write:events` ("RSVP to events and cancel your RSVP"). Creating,
    editing or cancelling events stays in the site (hosting is a
    moderation-relevant act).
  - Endpoints:
    - `GET /api/v1/events?from&to&community&cursor` — events the key's owner
      can see (exactly `canViewEvent`'s rule), upcoming by default, repeating
      events expanded into occurrences within the window (max 31 days per
      request) with overrides applied (sprint 06 10).
    - `GET /api/v1/events/$id` — one event with its next occurrences (up to 10),
      counts (going, maybe, waitlisted), the host and co-hosts, and the
      latest five updates (sprint 06 11).
    - `GET /api/v1/events/$id/attendees?occurrence&cursor` — people going and
      maybe for one occurrence, **only when the key's owner is the host or a
      co-host**; others get counts only, through the event endpoint. Hosts see
      the same people and fields the site's host view shows them (handle,
      display name, status), nothing more; this is a guest list, not a follow
      list, so follow-list privacy does not apply.
    - `GET /api/v1/me/events?from&to&cursor` — events the owner has answered
      going or maybe, per occurrence.
    - `PUT /api/v1/events/$id/rsvp` `{ status: going|maybe, occurrence?,
      everyTime? }` and `DELETE /api/v1/events/$id/rsvp?occurrence` — through
      `rsvp`/`unrsvp`, so capacity, the waitlist, blocks and bans are the site's
      rules; a full event answers `{ status: "waitlisted" }`.
  - Blocks: `canViewEvent` (`lib/events.server.ts` ~l.340-352) checks
    `DRAFT` and `PRIVATE` visibility and does **not** consider blocks; the
    site lists a blocked host's public events today. The API matches the site
    exactly and changes nothing (the open owner decision about blocked
    members RSVPing to a blocker's events stands). The RSVP write goes
    through `rsvp`, so whatever it refuses, the API refuses.
  - **Wildcard keys:** `read:*`, `write:*` and `*` keys satisfy the new
    scopes, as `lib/api/scopes.ts` documents for every scope; the changelog
    entry says so in one sentence so owners of wildcard keys know.
  - **Owner-only:** every endpoint acts as the key's owner and returns only
    what that member sees on the site; no endpoint takes a `userId`.
  - Webhooks are not added (a host's bot polls; an RSVP webhook would push
    attendee identities to a third-party URL, which is a separate consent
    question).
  - Times are ISO 8601 UTC with the event's time zone (`recurTz`) beside them.

## Functional requirements

1. FR-1 The five endpoints above, each `withDeveloperApi` with its scope,
   key restrictions (sprint 03 06) and rate limits as the other v1 routes.
2. FR-2 Keyset pagination (`cursor`, `nextCursor`) as in the flashcards API.
3. FR-3 Writes honour `Idempotency-Key` as the other v1 writes do
   (`docs/developer-api/idempotency.md`).
4. FR-4 OpenAPI entries with examples under the `s07-10 api-events` registry
   anchor; the two scopes in `lib/api/scopes.ts`; `NULLABLE` entries for every
   nullable field (`endsAt`, `venue`, `capacity`, `communityId`,
   `occurrence`, `note`); regenerated SDK and docs.
5. FR-5 `docs/developer-api/endpoints` and `scopes.md` and `changelog.md`
   describe the additions.

## Non-functional requirements

- **Additive only:** no change to an existing v1 path, field or scope.
- **Privacy:** private and community events follow the site's visibility rules
  exactly; attendee lists only for hosts and co-hosts; banned owners' keys are
  already refused by `withDeveloperApi`.
- **Read paths:** the new event routes join `OCCURRENCE_READ_PATHS`
  (`lib/events/occurrences.ts`, sprint 06 10) so its source-scan test holds that
  they apply overrides; if sprint 06 11 has a registry for updates, the event
  endpoint joins it too.
- **Performance:** occurrence expansion reuses the site's expansion code (find
  it via `lib/calendar/feed-entries.ts` or `lib/events/occurrences.server.ts`;
  do not write a second one); the window cap bounds it.
- **Correctness:** the RSVP write runs the site's `rsvp` function unchanged;
  the response is the resulting state.
- **Security:** zod validation of every query parameter (`from`/`to` ISO,
  window ≤ 31 days, `occurrence` ISO instant); a per-key write budget as in
  the flashcards API.

## Data model and API

- No schema change.
- `lib/api/v1/events-schema.ts`, `lib/api/v1/events.server.ts`
  (`listEventsForKey`, `getEventForKey`, `listAttendeesForKey`,
  `listMyEventsForKey`, `rsvpForKey`, `unrsvpForKey`, serialisers).
- Route files `app/routes/api/v1/events.ts`, `events/$id.ts`,
  `events/$id/attendees.ts`, `events/$id/rsvp.ts`, `me/events.ts`.
- `lib/api/scopes.ts` (two scopes), `lib/api/registry.ts` (under the anchor),
  `scripts/generate-sdk.ts` (`NULLABLE`, under its anchor), regenerated SDK and
  docs (`pnpm sdk:generate`, `pnpm docs:api`; `pnpm docs:site` is
  integration's).

## Testing requirements

- Main suite `lib/api/v1/__tests__/events-api.test.ts`: scope required for each
  route; private event invisible to a non-guest; community event needs
  membership as on the site; attendees only for host and co-host; RSVP through
  the site path (capacity → waitlisted; banned refused); idempotent RSVP replay;
  window cap; cursor paging; overrides applied to occurrences.
- The OpenAPI/registry tests that already exist (find them under
  `lib/api/__tests__`) pass with the new paths; an SDK test asserting no new
  field is typed `unknown`, if one exists (sprint 06 13 added it; run it).
- Gate tests: route table, api handler adoption (v1 routes stay route files).

## Acceptance criteria

- [ ] A key with `read:events` lists the owner's upcoming events, including the
      next three dates of a weekly event with one moved date shown moved.
- [ ] The host's key reads who is going; a guest's key gets counts only.
- [ ] `PUT …/rsvp` on a full event returns waitlisted, exactly as the site would.
- [ ] The SDK has typed methods for the five endpoints and no `unknown` fields.
- [ ] No existing endpoint's output changed.

## Out of scope

Creating, editing or cancelling events through the API, event webhooks,
iCalendar output (the personal calendar feed exists), community events for
communities the owner is not in.
