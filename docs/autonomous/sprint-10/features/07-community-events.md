# 07 — Events on a community's page

Surface: `/c/$slug` (a new Events tab), the event composer, the community's mod panel. Wave 2. Namespace
`community-events`. Site tier (Steel).

## User story

As a member of a community, I want to see its upcoming events on the community's own page and answer them there, and as
a moderator I want to host an event for the community from that page, so that a community's game nights and meet-ups
live where its members already are.

## Requirements elicitation

- **What exists (verified):**
  - The backend is complete: `Event.owner = COMMUNITY` with `communityId` (`prisma/schema/events.prisma`); `createEvent`
    (`lib/events.server.ts`) checks the host is a moderator of the community (`canModerate`, else `FORBIDDEN`);
    `listEvents({ scope: 'community', communityId })` lists a community's upcoming public events after
    `canViewCommunityEvents` (members only for a private community); RSVPs refuse a banned or timed-out member
    (`activeSanction`, `BAN_ENFORCEMENT_PATHS`); `GET /api/events?scope=community&communityId=` serves it
    (`lib/calendar/api/events.server.ts`).
  - **No page reaches it.** `components/events/EventComposer.tsx` takes a `communityId` prop that no caller passes
    (`EventsColumn.tsx` and `EventCard.tsx` render it without one), so no moderator can create a community event from
    the site; nothing calls `scope=community`; the community page's tabs
    (`components/communities/CommunityPlusBody.tsx`: posts, fame, challenge, census, top, mod) have no events. Community
    events reach members only through the global "Communities" tab of `/events` (`listMemberCommunityEvents`), for
    communities they joined.
- **Decisions:**
  - **An "Events" tab** on `/c/$slug`, after Posts, listing upcoming events (soonest first, the same `EventCard` with
    RSVP, waitlist and co-hosts) and, below a rule, "Past events" (the last 20, read-only). A private community's tab
    shows to members only, as its posts do. Deep link `?tab=events`.
  - **Hosting.** Moderators see "Host an event" (the existing composer with `communityId`); a member who is not a
    moderator sees nothing extra. The new endpoint re-checks the moderator role server-side through `createEvent`'s
    existing `canModerate` check (the button is a convenience, not the gate). Cancelling stays the host's
    (`cancelEvent(id, hostId)`); another moderator cannot cancel a colleague's event this sprint. The community's mod
    log records "Event hosted" and "Event cancelled" (two new mod-log actions with labels).
  - **Announcing.** A new community event appears in the community feed as nothing (no automatic post); members who
    turned on post alerts for the community (sprint 05 17) are not alerted either — events have their own RSVP
    reminders. Recorded as a decision to avoid a second notification path.
  - **No count in the tab label (validation pass 2).** A count would cost an events query on every community page view,
    against "the tab loads only when opened"; the label is "Events" and the panel says how many are coming.
  - **SEO:** the tab is the community page; no new route, no new card.

## Functional requirements

1. FR-1 `listCommunityPastEvents(communityId, viewerId, limit)` in `lib/events.server.ts` (same visibility as the
   upcoming list, ended events, newest first).
2. FR-2 A registered endpoint `GET /api/communities/$slug/events?when=upcoming|past` (contract + `implement()`,
   `auth: 'optional'`, `rateLimit: 'read'`, the query zod-validated) resolving the slug and delegating to `listEvents` /
   the past list; a slug that does not exist and a private community the viewer is not in both answer an empty list with
   the same shape (no existence oracle). It adds a past list and slug resolution, which
   `GET /api/events?scope=community` (a route file) does not have; that route is unchanged.
3. FR-3 The Events tab in `CommunityPlusBody.tsx` (React Query, arrival fade, empty and loading states), and
   `?tab=events` read through the route's `validateSearch` (the tab is `useState('posts')` today).
4. FR-4 "Host an event" for moderators, passing `communityId` to `EventComposer`; the composer shows the community's
   name as the host line when set.
5. FR-5 Mod-log actions `event_hosted` and `event_cancelled` (`lib/communities/modlog.ts`: in
   `MOD_ACTIONS_BY_GROUP.content` and, since a community's events are public within it, in `PUBLIC_MOD_ACTIONS`, as
   sprint 09's pin actions are) written in `createEvent` / `cancelEvent` when the event is a community's, with their
   labels. `lib/events.server.ts` writes no mod-log row today.

## Non-functional requirements

- **Privacy:** a private community's events are never returned to a non-member (the existing check, asserted again on
  the new endpoint); a banned member sees the tab but RSVP refuses them with the existing sanction text.
- **Performance:** the tab loads only when opened; one request.
- **Design:** rows on rules; one primary ("Host an event") for moderators, none for others.

## Data model and API

- No schema change. New `lib/communities/events.contract.ts`, `lib/communities/api/communities.$slug.events.server.ts`,
  `components/communities/CommunityEventsPanel.tsx`.
- Edits: `components/communities/CommunityPlusBody.tsx` (tab and panel), `components/events/EventComposer.tsx` (host
  line), `lib/events.server.ts` (past list, mod-log writes), `lib/communities/modlog.ts` and its labels,
  `components/communities/ModLog.tsx` if labels live there.

## Testing requirements

- Main suite `lib/communities/__tests__/community-events.test.ts` (mock Prisma): a private community's events are empty
  for a non-member and for signed out; a public one lists upcoming then past; drafts never appear; creating as a
  non-moderator stays `FORBIDDEN`; a community event's creation and cancellation write mod-log rows.
- `components/communities/__tests__/community-events-panel.test.tsx` (`renderToStaticMarkup`): empty state, the host
  button for moderators only.
- Ban enforcement (`BAN_ENFORCEMENT_PATHS` unchanged, RSVP still refused), route table, `useEffect` ratchet, the tab
  strip uses `components/ui/tabs.tsx` (design consistency).

## Acceptance criteria

- [ ] A moderator hosts an event from the community page; it appears in the Events tab and in `/events`.
- [ ] A member answers "Going" from the tab.
- [ ] A signed-out visitor to a private community sees no events; a public community's tab shows them.
- [ ] The community's mod log shows "Event hosted".

## Out of scope

Automatic announcement posts, discussion threads on events, a community calendar feed (the personal ICS feed carries
answered events), events for non-moderators to propose.
