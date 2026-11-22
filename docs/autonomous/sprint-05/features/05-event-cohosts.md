# 05 — Event co-hosts

Surface: member-hosted events — the event card and its host controls
(`components/events/EventCard.tsx`, `EventComposer.tsx`, sprint 04's
`WaitlistPanel.tsx`), `lib/events.server.ts`, notifications. Wave 3. Namespace
`event-cohosts`.

## User story

As a member running an event, I want to add one or more co-hosts who can edit
the details and look after the guest list and waitlist with me, and as a co-host
I want to accept or decline that role — so that an event does not stall when its
one host is away.

## Requirements elicitation

- **What exists (verified):** `Event` (`prisma/schema/events.prisma`) has one
  `hostId` (USER events) and, for repeating events, `rotatingHostIds` (who hosts
  a given occurrence; informational, no rights). Every management check is
  `event.hostId === actorId`: `updateEvent`, `cancelEvent`
  (`lib/events.server.ts`), and sprint 04's waitlist (`assertHostOrAdmin` in
  `lib/events/waitlist.server.ts`). There is no co-host concept anywhere
  (`grep -ri cohost` finds nothing).
- **Decisions:** at most 5 co-hosts per event. The host invites; the invitee
  accepts or declines from the notification or the event card (an unaccepted
  co-host has no rights and is not shown publicly). A co-host may edit the
  event's details (title, description, time, venue, capacity), read the guest
  list, read and trim the waitlist, and leave the role. Only the host may cancel
  the event, invite or remove co-hosts. Community events: a co-host must be a
  member of the community. Blocks in either direction between host and invitee
  refuse the invite; a banned invitee is refused. Platform events are out of
  scope.

## Functional requirements

1. FR-1 The host's controls on an event gain "Co-hosts": a member search (the
   existing mention search, `lib/feed/mention-search.server.ts`) to invite, the
   list with each person's state (Invited / Co-host) and Remove.
2. FR-2 The invitee gets a notification ("{{name}} invited you to co-host
   {{event}}", `SYSTEM`, `entityType: 'event_cohost'`, link to the event) and
   sees Accept / Decline on the event card while invited.
3. FR-3 Accepted co-hosts appear on the event card and page: "Hosted by A with B
   and C".
4. FR-4 A co-host can edit the event (the composer in edit mode), see the guest
   list and use the waitlist panel exactly as the host; they can "Step down".
5. FR-5 The host is notified when an invite is accepted. Removing a co-host or
   stepping down notifies nobody.
6. FR-6 Inviting a sixth, a blocked pair, a banned member, a non-member of the
   community, or the host themself is refused with a specific message.

## Non-functional requirements

- **Correctness:** the cap is checked and the invite inserted in one transaction
  after `lockKey(tx, 'event-cohost:' + eventId)`
  (`lib/db/advisory-lock.server.ts`).
- **Security:** one helper, `canManageEvent(event, actorId)` in
  `lib/events/cohosts.server.ts`, returns `'host' | 'cohost' | null`, and
  replaces the `hostId === actorId` checks in `updateEvent` and sprint 04's
  `assertHostOrAdmin` (cancel stays host-only). Every endpoint zod-validates its
  input and goes through `implement()`. A co-host's edit still runs
  `updateEvent`'s existing validation and its capacity promotion (sprint 04).
- **Privacy:** pending invites are visible only to the host and the invitee.
  Erasure deletes the member's co-host rows (both as invitee and, through the
  event cascade, as host).
- **i18n:** `event-cohosts`; the "with B and C" list via `Intl.ListFormat` with
  the active locale.
- **Steel:** co-host list is rows on rules; Accept is the view's one ink primary
  on an invited card, Decline secondary.
- **Accessibility:** search results are a listbox with keyboard selection (reuse
  the mention-search UI pattern); state changes announced in a polite live
  region.

## Data model and API

- `EventCohost { eventId, userId, status VarChar(9) ('invited'|'accepted'),
  invitedAt, respondedAt? }`, `@@id([eventId, userId])`,
  `@@index([userId, status])`, relations to `Event` (cascade) and `User`,
  `@@map("event_cohost")`. Migration `20261125030000_s05_event_cohosts`.
- `lib/events/cohosts.server.ts`: `canManageEvent`, `inviteCohost`,
  `respondToCohostInvite`, `removeCohost`, `listCohosts`, `cohostErasureOps`.
  `EventDTO` (summarise in `lib/events.server.ts`) gains
  `cohosts: { id, name, handle, image }[]` (accepted only) and
  `viewerRole: 'host'|'cohost'|'invited'|null`.
- Contract `lib/events/cohosts.contract.ts`; module
  `lib/events/api/events.$id.cohosts.server.ts` (GET list for managers, POST
  invite `{ userId }`, DELETE `?userId=`),
  `events.$id.cohosts.respond.server.ts` (POST `{ accept: boolean }`).
- Notification label `event_cohost` → "Events" in
  `components/feed/notification-labels.ts` under the anchor, with its test line.

## Testing requirements

- Main suite `lib/events/__tests__/event-cohosts.test.ts`: invite cap under the
  lock; block either way refused; banned refused; non-member of the community
  refused; an invited (unaccepted) co-host cannot edit; an accepted co-host can
  edit and read the waitlist but cannot cancel or invite; stepping down removes
  rights.
- Main suite `lib/account/__tests__/event-cohosts-erasure.test.ts`.
- Product suite `lib/events/__tests__/cohosts.product.test.ts`: the role
  resolution and the "hosted by" list shaping.

## Acceptance criteria

- [ ] A host invites a member; after they accept, they can edit the event and
      manage the waitlist.
- [ ] A co-host cannot cancel the event or add co-hosts.
- [ ] A sixth invite, a blocked pair and a banned member are refused.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Co-hosts for platform events, transferring the host role, per-occurrence
co-hosts for repeating events (co-hosts apply to the whole series).
