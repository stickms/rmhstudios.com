# 12 — Host your events through the developer API

Surface: `POST /api/v1/events`, `PATCH /api/v1/events/{id}`, `POST /api/v1/events/{id}/cancel`,
`GET|POST /api/v1/events/{id}/updates`, scope `manage:events`, the API docs and SDK. Wave 1. No namespace (no UI
strings).

## User story

As a developer who runs a community's game nights from a script or a bot, I want to create, edit and cancel the events I
host and post updates to the people coming, through the API, so that our schedule stays in one place and attendees get
the same updates and reminders as on the site.

## Requirements elicitation

- **What exists (verified):**
  - The site's writes: `createEvent`, `updateEvent`, `cancelEvent` (`lib/events.server.ts`, `CreateEventInput`:
    `hostId`, `communityId`, `title`, `description`, `startsAt`, `endsAt`, `venueKind`, `venueRef`, `capacity`,
    `recurrence`, `visibility`; a community event requires a moderator, `EventError` codes `FORBIDDEN`, `INVALID_DATES`,
    `INVALID_VENUE_URL`, `CAPACITY_FULL`, `CANCELED`, `INVALID_RECURRENCE`), host updates (`postUpdate`, `listUpdates`,
    `deleteUpdate` in `lib/events/updates.server.ts`, with the durable fan-out of sprint 08 05), co-hosts
    (`lib/events/cohosts.server.ts`) and occurrence overrides (`setOverride`).
  - The API reads events and RSVPs only (sprint 07 10): `lib/api/v1/events.server.ts` (`listEventsForKey`,
    `getEventForKey`, `listAttendeesForKey`, `rsvpForKey`, `unrsvpForKey`, `writeBudgetExceeded`, `readBody`), routes
    `app/routes/api/v1/events.ts`, `events/$id.ts`, `events/$id/attendees.ts`, `events/$id/rsvp.ts`; scopes
    `read:events` and `write:events` ("RSVP to events and cancel your RSVP", `lib/api/scopes.ts`).
- **Decisions:**
  - **A new scope `manage:events`** ("Create, edit and cancel events you host, and post updates to the people coming").
    `write:events` keeps its meaning (an existing key must not gain hosting power); a key with `manage:*` or `*` gains
    it, as the scope rules state for every new `manage` scope — said in the changelog.
  - **Endpoints** (route files, `withDeveloperApi`, the key owner as host):
    - `POST /api/v1/events` — create; body mirrors `CreateEventInput` in snake case (`community` as a slug, resolved
      server-side), `visibility` `public | private`. 201 with the event as `GET /api/v1/events/{id}` returns it.
    - `PATCH /api/v1/events/{id}` — edit fields the host or a co-host may edit on the site (`updateEvent`'s rules).
    - `POST /api/v1/events/{id}/cancel` — cancel (`cancelEvent`); 409 `already_canceled`.
    - `GET /api/v1/events/{id}/updates` — the host updates (as attendees see them, `read:events`), and
      `POST /api/v1/events/{id}/updates` — post one (`manage:events`), which fans out exactly as on the site.
    - Occurrence overrides (skip or move one date) and co-host invitations stay on the site.
  - **Errors** map each `EventError` to a v1 error code (`forbidden`, `invalid_dates`, `invalid_venue_url`,
    `invalid_recurrence`, `canceled`), `404` for an event the key owner cannot see, `403 not_host` for one they see but
    do not host.
  - **Rate limits:** the write class plus the site's own event-create limit (10 a minute) applied to the key owner.
  - **Webhooks:** none added (sprint 08 12's `event.rsvp_changed` already exists for hosts).

## Functional requirements

1. FR-1 The five handlers with zod-validated bodies and the `/api/v1/**` error envelope; every new error code is added
   to `ERROR_TYPES` and the status map in `lib/api/errors.ts` (an unknown code falls back to `api_error`).
2. FR-2 `createEventForKey`, `updateEventForKey`, `cancelEventForKey`, `listUpdatesForKey`, `postUpdateForKey` in
   `lib/api/v1/events.server.ts` (additions; existing functions unchanged), each calling the site function.
3. FR-3 The scope (anchor) and `docs/developer-api/scopes.md`; registry entries with examples (anchor); `NULLABLE` lines
   for nullable fields (anchor); SDK and API docs regenerated; changelog bullets (anchor).

## Non-functional requirements

- **Security:** the host check is the site's; a community event still requires a moderator; a banned member's key is
  refused by the existing key checks; nothing accepts a host id from the body.
- **Correctness:** additive; existing v1 paths and fields unchanged; the SDK diff changes no existing field (check the
  `NULLABLE` names you add against existing fields).

## Data model and API

- No schema change. New route files `app/routes/api/v1/events/$id/cancel.ts`, `app/routes/api/v1/events/$id/updates.ts`;
  edits to `app/routes/api/v1/events.ts` (POST) and `events/$id.ts` (PATCH); `lib/api/v1/events-schema.ts` (bodies),
  `lib/api/v1/events.server.ts`, `lib/api/scopes.ts`, `lib/api/registry.ts`, `scripts/generate-sdk.ts`,
  `docs/developer-api/{changelog,scopes}.md`.

## Testing requirements

- Main suite `lib/api/v1/__tests__/events-host-api.test.ts` (mock the site functions and Prisma): create as host; a
  community event by a non-moderator is `forbidden`; edit by a non-host is `not_host`; an invisible event is 404; cancel
  twice is 409; posting an update calls `postUpdate` and the fan-out enqueue; `write:events` alone cannot create;
  `manage:events` can.
- Route table (v1 route files), API handler adoption, the OpenAPI and SDK generation checks (no `unknown`), the scopes
  docs test.

## Acceptance criteria

- [ ] A key with `manage:events` creates an event that appears on `/events` and in the host's calendar feed.
- [ ] A script posts an update and attendees receive it as on the site.
- [ ] A key with only `write:events` gets 403 `insufficient_scope` on create.
- [ ] The SDK has typed methods for the five calls.

## Out of scope

Co-host invitations, occurrence overrides, deleting events, attendee messaging beyond updates, new webhooks.
