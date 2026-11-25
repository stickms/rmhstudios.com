# 07 — Subscribe to an RMHTube host and hear about their parties

Surface: a scheduled watch party's page and the upcoming list ("Subscribe" on the host), the RMHTube landing ("Hosts you
follow"), the inbox (a notice when a host schedules a party), the data export. Wave 4. Namespace `tube-subscriptions`.
App tier (L8) in RMHTube; the inbox on the site tier.

## User story

As a member who enjoys one host's watch parties, I want to subscribe to them and be told when they schedule the next
one, so that I do not have to check the upcoming list every day.

## Requirements elicitation

- **What exists (verified):**
  - `RmhTubeSubscription` (`prisma/schema/rmhtube.prisma`: `subscriberId`, `channelId`, `@@unique([subscriberId,
    channelId])`, `@@index([channelId])`) and a toggle endpoint `POST /api/rmhtube/subscribe/$channelId`
    (`lib/rmhtube/api/rmhtube.subscribe.$channelId.server.ts`, a bare `defineHandler`, refuses self, no contract). **No
    screen calls it and nothing reads a subscription**: no button, no list, no notice. It checks no block, ban or
    deleted account. The erasure registry classes the model `owner` (the open "a deleted member's follows" decision,
    `lib/account/erasure-follows.server.ts`), and the data export does not list it.
  - Scheduled watch parties (sprint 03 09): `scheduleParty`, `listUpcoming`, `runPartyReminders` in
    `lib/rmhtube/parties.server.ts` (the per-host advisory lock, the party DTO's `host`), the party page
    `components/rmhtube/party/PartyPage.tsx`, the list `components/rmhtube/party/UpcomingParties.tsx`.
  - Durable fan-outs (sprint 08 05): `lib/fanout/run.server.ts`, `FANOUT_KINDS` in `lib/fanout/run.ts`
    (`post-alert`, `event-update`), the reclaimer in `lib/fanout/queue.server.ts`, `FanoutRun.kind` a string.
- **Decisions:**
  - **Subscribe** is a follow of a host for parties only. The toggle becomes a contract (`PUT` to subscribe, `DELETE`
    to unsubscribe, idempotent) through `implement()`, refusing self (`TUBE_SUBSCRIBE_SELF`), a block either way, a
    banned, pending-deletion or erased host (`NOT_FOUND`), and more than 200 subscriptions (`TUBE_SUBSCRIBE_LIMIT`,
    `max`), the cap under `lockKey`.
  - **The notice:** when a host schedules a **public** party, every subscriber is told once ("{{host}} scheduled a
    watch party: {{title}} on {{date}}"), linked to the party page, through a durable fan-out of kind `tube-party`
    (subject: the room id), so a worker restart neither skips nor repeats a batch. Skipped: subscribers blocked either
    way with the host, banned or pending deletion, and anyone who already RSVPd. A party rescheduled or cancelled
    sends nothing new (the existing RSVP updates cover those who said they are going).
  - **Where it shows:** "Subscribe" / "Subscribed" on the party page and on each host line of the upcoming list; the
    RMHTube landing lists "Hosts you follow" (names joined now, `<bdi>`) with an unsubscribe action. A host never sees
    who subscribes; the count is not shown anywhere (quiet by design, as follow lists are private by default).
  - **Export:** the hosts the member subscribes to (names now), as `rmhtubeSubscriptions` under the sprint 13 anchor.
    Erasure stays `owner` (unchanged; the open decision).

## Functional requirements

1. FR-1 `lib/rmhtube/subscriptions.ts` (pure: the cap, the notice params) and `subscriptions.server.ts` (subscribe,
   unsubscribe, list mine, `audienceBatch(hostId, after)` for the fan-out, `exportTubeSubscriptions`); the contract in
   `lib/rmhtube/subscriptions.contract.ts`.
2. FR-2 The endpoint module `lib/rmhtube/api/rmhtube.subscribe.$channelId.server.ts` rewritten on the contract (PUT,
   DELETE); `GET /api/rmhtube/subscriptions` (new module) lists the member's.
3. FR-3 `scheduleParty` queues the `tube-party` fan-out after its transaction commits (only for public parties);
   `tube-party` joins `FANOUT_KINDS`; the runner and its queue are registered under the Wave 0 jobs anchor.
4. FR-4 Notice `tube-party-scheduled` (template, params, preview case, system label) under the Wave 0 notice anchors.
5. FR-5 UI: `components/rmhtube/party/SubscribeButton.tsx` (new) on `PartyPage.tsx` and `UpcomingParties.tsx`; the
   "Hosts you follow" list on the landing (`components/rmhtube/RmhTubeLanding.tsx`).

## Non-functional requirements

- **Privacy:** nobody can list a host's subscribers; no response carries a count.
- **Delivery:** at most one notice per subscriber per party, even across a worker restart (the fan-out's told-ids rule).
- **Notifications** go through `createNotification` with `notice()`, so preferences and quiet hours apply.

## Data model and API

No schema change. `PUT|DELETE /api/rmhtube/subscribe/$channelId` → `{ subscribed }`; `GET /api/rmhtube/subscriptions`
→ `{ hosts: { id, name, handle }[] }`.

## Testing requirements

- Main suite `lib/rmhtube/__tests__/subscriptions.test.ts`: self, blocked, banned and erased hosts refused; the cap
  under the lock; idempotent PUT and DELETE.
- Main suite `lib/rmhtube/__tests__/party-fanout.test.ts`: a public party fans out once to eligible subscribers; a
  private one does not; blocked and already-going members are skipped; a resumed run skips those told.
- `lib/notifications/__tests__/notice-keys.test.ts`, the notice preview ratchet, `notification-labels` test, the
  export test (key `rmhtubeSubscriptions`), the fan-out kind test in `lib/fanout/__tests__/`.

## Acceptance criteria

- [ ] A member subscribes to a host from a party page and sees "Subscribed".
- [ ] When the host schedules a public party, the member gets one notice linking to it.
- [ ] A member the host has blocked cannot subscribe and is never told.
- [ ] The landing lists the hosts the member follows, with an unsubscribe action.

## Out of scope

Subscriber counts, notices for unscheduled rooms going live, e-mail digests of parties.
