# 10 — Report an RMHTube room or watch party

Surface: an RMHTube room's header and a scheduled watch party's page ("Report this room"), the admin report queue,
Your reports, the hub (a room a moderator closes ends for everyone in it). Wave 4. Namespace `tube-room-reports`.
App tier (L8) in RMHTube; the queue and Your reports on the site tier.

## User story

As a member who finds a public watch party with an abusive name or description, or a room playing something it
should not, I want to report the room itself, not one chat message, so that a moderator can close it and keep it
from being scheduled again.

## Requirements elicitation

- **What exists (verified):**
  - `RmhTubeRoom` (`prisma/schema/rmhtube.prisma`) carries member text other members see: `name`, `description`, and
    for a scheduled party `scheduledFor`; public rooms and parties are listed (`listUpcoming`, `getParty` in
    `lib/rmhtube/parties.server.ts`, the landing `components/rmhtube/RmhTubeLanding.tsx`, the list
    `components/rmhtube/party/UpcomingParties.tsx`, the page `components/rmhtube/party/PartyPage.tsx`).
  - A room message can be reported (sprint 13 06, type `tube-chat`, `lib/rmhtube/chat-reports.server.ts`, with a
    takedown that tells the hub over Redis on `CHAT_REMOVED_CHANNEL`, `lib/rmhtube/events.ts`); **the room cannot**.
  - A host closes their own party with `cancelParty` (`closedAt`, a conditional `updateMany`, notices to the members
    going); the hub loads a room only while `closedAt` is null (`RoomManager.loadRoomFromDb`,
    `server/rmhtube/room-manager.ts`). Nothing stops a host from scheduling the same text again.
- **Decisions:**
  - **Type:** `tube-room` (the room code), removable, in `MEMBER_ITEM_REPORT_TYPES`; eligible when the room exists, is
    not already moderated, is public or the reporter is a member of it (`RmhTubeRoomMember`), and the reporter is not
    its host; the owner is the host. A private room a member was never in answers as missing.
  - **Takedown:** stamps a new `moderatedAt` and `closedAt` (if open) in one conditional update, notifies the members
    going with the existing `party-cancelled` notice, and publishes the room code on a new `ROOM_CLOSED_CHANNEL`; the
    hub ends the room (every socket gets `room:closed` with reason `moderator` and leaves) and refuses to load it
    again. A moderated room is in no list, its party page answers "This room was closed by a moderator", and
    `updateParty` refuses it with `CONTENT_REMOVED_BY_MODERATOR`.
  - **Repeat text:** scheduling a party, or renaming one with `updateParty`, to a name equal to a room of the same
    host moderated in the last 30 days is refused with `TUBE_ROOM_NAME_REMOVED` ("A moderator removed a room with this
    name. Choose another"), compared after trimming and lower-casing (`normalizeRoomName` in the pure
    `lib/rmhtube/room-reports.ts`). Live rooms carry a name too (`RoomManager.createRoom` persists `room.name`
    through `persistRoomCreate`), so the hub applies the same rule: `C2S.ROOM_CREATE` with such a name answers the
    hub's existing error event and creates nothing, reading `{ hostId, moderatedAt: { gte: 30 days ago } }` names
    through the hub's own Prisma client (`getPrismaClient()`), never the web tier.
  - **Previews:** the queue shows the room's name, description (280 characters), host, public or private, and the
    scheduled time.
  - **Entry points:** "Report this room" in the room header's menu (`components/rmhtube/RmhTubeHeader.tsx`) and on the
    party page, for any signed-in member but the host.

## Functional requirements

1. FR-1 Schema: `moderatedAt DateTime?` on `RmhTubeRoom`; migration `20261228040100_s14_tube_room_reports` (a nullable
   column, no index).
2. FR-2 `lib/rmhtube/room-reports.server.ts` (new): `roomReportAuthor`, `roomReportable`, `takeDownRoom`,
   `roomPreviews`, `recentlyModeratedName(hostId, name)`.
3. FR-3 `lib/rmhtube/events.ts`: `ROOM_CLOSED_CHANNEL` and the `room:closed` event with a `moderator` reason;
   `server/rmhtube/room-manager.ts` subscribes (the chat handler's `redisSubscribe` is the model), ends the room,
   skips a moderated room in `loadRoomFromDb` and in `restoreRoomsFromDb` (both read `closedAt: null`; add
   `moderatedAt: null`), and refuses a removed name in `createRoom` (above).
4. FR-4 `lib/rmhtube/parties.server.ts`: every list and read filters `moderatedAt: null` for others;
   `scheduleParty` checks `recentlyModeratedName`; `updateParty` refuses a moderated room.
5. FR-5 Report path under `s14-10 tube-room-reports` in every anchored report file.
6. FR-6 UI: the two report items; the client's room screen handles `room:closed` with the moderator sentence.
7. FR-7 Refusal code `TUBE_ROOM_NAME_REMOVED` under the Wave 0 anchor.

## Non-functional requirements

- **Every read path:** the landing, the upcoming list, the party page, the calendar export of a party
  (`partyForCalendar`) and the developer API's `rmhtube/parties` (`lib/api/v1/rmhtube.server.ts`) leave a moderated
  room out; a test lists them (`TUBE_ROOM_READ_PATHS` in `lib/rmhtube/room-reports.ts`, new, with a source scan).
- **Hub:** the hub's subscription is idempotent (a second message for a closed room is a no-op) and the hub never
  calls the web tier (it reads the row through its own Prisma client). The hub's live public list
  (`RoomManager`'s public-rooms answer, built from memory) cannot show a moderated room because the room is ended in
  memory on the channel message; a hub restart cannot bring it back because both loaders filter `moderatedAt: null`.
- **Concurrency:** the takedown's conditional `updateMany` (`moderatedAt: null` in the `where`) means two moderators
  resolving at once stamp the room once and send one set of notices (the second sees `count: 0` and does nothing).
- **Query shapes (verify against the schema):** `closedAt` and `scheduledFor` are optional; the takedown is
  `updateMany({ where: { id, moderatedAt: null }, data: { moderatedAt: now, closedAt: … } })` — keep an existing
  `closedAt` (two writes, or read first; never overwrite an earlier close time).

## Data model and API

One nullable column. Reports through `POST /api/moderation/report`.

## Testing requirements

- Main suite `lib/rmhtube/__tests__/room-reports.test.ts`: eligibility (host, private non-member, already moderated),
  takedown (stamps, notices, Redis publish faked), repeat-name refusal within 30 days.
- Main suite `server/rmhtube/__tests__/room-closed.test.ts`: the hub ends the room on the channel message, refuses to
  load or restore it again, and refuses `room:create` with a name moderated for that host in the last 30 days.
- Main suite `lib/rmhtube/__tests__/room-read-paths.test.ts`: the source scan.
- `lib/moderation/__tests__/music-reports.test.ts`, `lib/__tests__/migration-safety.test.ts`,
  `lib/__tests__/server-bundle-copies.test.ts`.

## Acceptance criteria

- [ ] A member reports a public party from its page; the queue shows its name, description and host.
- [ ] "Resolve & remove" closes the party: members in the room are told it was closed by a moderator, members going
      are notified, and it leaves the upcoming list and the developer API.
- [ ] The host cannot edit it back or reschedule a party with the same name for 30 days.

## Out of scope

Reporting a queued video, banning a host from RMHTube, community-moderator handling of rooms.
