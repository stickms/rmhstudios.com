# 15 — Blocks and reports in Rideshare

Surface: `/rideshare/drive` (open requests), `/rideshare/ride` (the active trip and ride history: "Report this trip"),
the trip chat, `/admin/reports`, "Your reports". Wave 2. Namespace `rideshare-safety`. Site tier (Steel).

## User story

As a rider, I never want to be matched with a driver I have blocked, or who has blocked me, and I want to report a trip
that went wrong — a rude message, an unsafe drive — so that a moderator looks at it. As a driver, I want the same.

## Requirements elicitation

- **What exists (verified):**
  - Rides: `Ride`, `RideMessage`, `RideshareDriver`, `RideSavedPlace` (`prisma/schema/rideshare.prisma`). Drivers list
    open requests (`GET /api/rideshare/rides?scope=available` in `lib/rideshare/api/rideshare.rides.server.ts`: any
    `REQUESTED` ride, or `SCHEDULED` within the lead window, not their own) and accept one with a compare-and-set
    (`action === 'accept'` in `lib/rideshare/api/rideshare.rides.$id.server.ts`); rider and driver chat during the trip
    (`rideshare.rides.$id.messages.server.ts`, `components/rideshare/RideChat.tsx`) and rate it after
    (`rideshare.rides.$id.rate.server.ts`).
  - **None of these reads `UserBlock`.** A blocked driver sees the blocker's request, can accept it, and the two can
    message each other through the trip chat.
  - **There is no report path for a trip:** `REPORT_ENTITY_TYPES` (`lib/moderation/report-constants.ts`) has no ride
    type; the trip screens (`components/rideshare/ActiveRidePanel.tsx`, the history in
    `app/routes/_site/rideshare/ride.tsx`) offer only ratings and tips.
  - The rideshare routes answer refusals with plain English strings ("You must be an approved driver.", "Not your
    ride."), outside the error taxonomy (`lib/errors/codes.ts`, `refusalBody`), so they read in English everywhere.
- **Decisions:**
  - **Blocks:** a ride whose rider is blocked either way with the viewing driver is not in that driver's available list
    (in the query, so a page stays full); accepting it is refused (`RIDE_BLOCKED`, "You cannot ride with this member",
    one sentence whoever blocked whom); a block made **during** an accepted or in-progress trip does not cancel it (the
    trip may be under way) but closes the chat for both (`RIDE_CHAT_CLOSED` on send, the same code as a finished
    trip's chat, so the sender cannot tell a block from an ended trip) and the trip screen says "Chat is off for this
    trip". A banned driver cannot accept (the existing approval check plus `bannedUntil`). The block set is the site's
    existing access-control read, `getBlockedAuthorIds(userId)` (`lib/moderation.server.ts`: both directions, cached
    about 30 s and invalidated on block; a failed lookup fails the request rather than allowing it); no new block
    helper is written.
  - **Report a trip:** report type `ride`, entity id the ride id; only the rider or the driver may report it, about the
    other party, once the ride was accepted, up to 30 days after it ended. The moderator sees the trip's times, its
    route summary (pickup and drop-off labels, never coordinates), the two parties and the trip's chat messages (the
    trip chat is the evidence; a moderation read path). Not removable (there is nothing to take down); the decision
    acts on the account through the existing account tools.
  - **Refusals:** every refusal in the five rideshare ride routes (`rideshare.rides.server.ts`, `rideshare.rides.$id.server.ts`,
    `…$id.messages.server.ts`, `…$id.rate.server.ts`, `…$id.sync.server.ts`) moves to `refusalBody()` with existing codes where one
    says the same (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`) and new codes where none does
    (`RIDE_BLOCKED`, `RIDE_DRIVER_NOT_APPROVED`, `RIDE_NOT_READY`, `RIDE_CLOSED`, `RIDE_CHAT_CLOSED`); the screens render them with
    `useRefusalText` (they use no `serverError(` today; none is added).

## Functional requirements

1. FR-1 `lib/rideshare/safety.server.ts` (new): `rideReportAuthor(rideId, reporterId)` (party and window checks),
   `ridePreview(ids)` (times, place labels, parties, chat), and `rideChatClosed(ride, viewerId)`; blocks are read with
   `getBlockedAuthorIds` (`lib/moderation.server.ts`).
2. FR-2 `rideshare.rides.server.ts` (available list excludes blocked riders in the query), `rideshare.rides.$id.server.ts`
   (accept refuses a blocked pair or a banned driver), `rideshare.rides.$id.messages.server.ts` (send refuses a blocked
   pair); the ride DTO says `chatClosed`.
3. FR-3 Report type `ride` under the Wave 0 anchors in `report-constants.ts` (not in `REMOVABLE_REPORT_ENTITY_TYPES`),
   `moderation.report.server.ts` (`resolveTargetUser` → the other party; eligibility), `triage.server.ts`
   (`previewsFor`), `my-reports.server.ts` and `MyReportsPanel.tsx`.
4. FR-4 UI: "Report this trip" in `ActiveRidePanel.tsx` and on each history row of `ride.tsx` (opening
   `components/moderation/ReportDialog.tsx`); "Chat is off for this trip" in `RideChat.tsx`; refusals through
   `useRefusalText`.
5. FR-5 Codes under `// s13-15 rideshare-safety` in `lib/errors/codes.ts` and `components/errors/refusal-sentence.ts`,
   keys in `locales/en/errors.json`.

## Non-functional requirements

- **Safety:** a blocked pair can never be newly matched; a report can only be made by a party to the ride.
- **Privacy:** the moderator's preview carries place labels, never coordinates or saved places; no other ride is read.
- **Design (Steel):** the report item is a menu row; no new colours; the "Chat is off" line is text on a rule (D8 open).

## Data model and API

No schema change. Report type `ride`. The ride DTO gains `chatClosed: boolean`.

## Testing requirements

- Main suite `lib/rideshare/__tests__/ride-blocks.test.ts`: the available list hides a blocked rider (both directions);
  accepting is refused; a block mid-trip closes chat both ways and leaves the trip; a banned driver cannot accept.
- Main suite `lib/rideshare/__tests__/ride-reports.test.ts`: only the parties may report, about the other; the 30-day
  window; the preview has labels and chat, no coordinates.
- The error-code catalogue, the `serverError(` ratchet, `lib/moderation/__tests__/` report tests, field names.

## Acceptance criteria

- [ ] A driver whom a rider has blocked never sees that rider's request.
- [ ] A rider reports a finished trip and sees it under "Your reports"; the admin sees the trip's chat.
- [ ] Blocking during a trip turns its chat off for both.
- [ ] A refusal on the rideshare pages reads in the member's language (its code's key).

## Out of scope

Emergency features, trip sharing with contacts, refunds, automatic suspension on reports.
