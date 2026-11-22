# 12 — Webhooks for your builds, events, reading and tournaments

Surface: developer webhooks (`lib/webhooks/`, the endpoint form in
`/developer/webhooks`). Wave 4. Namespace `webhook-activity` (the four picker
group headings).

## User story

As a member who keeps a personal dashboard (a notes vault, a habit tracker, a
Discord channel of my own), I want a webhook when I publish a build release,
answer an event, finish a book, save a highlight or play a tournament match,
so that my own activity arrives where I keep it without polling.

## Requirements elicitation

- **What exists (verified):**
  - `lib/webhooks/events.ts` defines `WEBHOOK_EVENTS`: seven social events
    about the owner's own actions (`post.created`, `post.deleted`,
    `follow.created`, `follow.deleted`, `like.created`, `comment.created`,
    `bookmark.created`) and two in the `games` group (`personal_best.created`,
    `achievement.unlocked`, sprint 06 12); `emitWebhookEvent(userId, event,
    data)` in `lib/webhooks/emit.server.ts` queues deliveries with signatures
    (`signature.ts`) and retries (`jobs.server.ts`); game events go through
    `game-emit.server.ts`.
  - The endpoint form groups events (`components/developer/webhooks/EndpointFormDialog.tsx`:
    ungrouped, then "Games").
  - Emit points that exist and have no webhook: build releases
    (`lib/builds/releases.server.ts`, `buildVersion.create`), RSVPs
    (`rsvp` in `lib/events.server.ts`), finished books
    (`lib/reading/shelves.server.ts`, `finishedAt`), highlights
    (`createHighlight` in `lib/reading/highlights.server.ts`) and match
    settlement (`settleMatch` in `lib/tournaments/tournament.server.ts`).
  - Sprint 07 rejected webhooks for RSVPs **to a host's events** and for
    highlights because they push other members' identities or private notes
    to third parties.
- **Decisions:**
  - **Only the owner's own actions, and nothing about anyone else.** Five
    events in four groups:
    - `build.released` (group `builds`): `{ buildSlug, version, title,
      releasedAt }` — the owner's build.
    - `event.rsvp_changed` (group `events`): `{ eventId, occurrenceAt,
      status: 'going' | 'maybe' | 'not_going' | 'waitlisted' }` — the owner's
      own answer, never other attendees.
    - `reading.finished` (group `reading`): `{ docKind, docKey, title,
      finishedAt }`.
    - `highlight.created` (group `reading`): `{ highlightId, docKind, docKey,
      createdAt }` — **without** the highlighted text or the note (a script
      that wants them reads `/api/v1/me/highlights/{id}` with its scope; sprint
      07 12).
    - `tournament.match_settled` (group `tournaments`): `{ tournamentId,
      matchId, round, result: 'won' | 'lost', settledAt }` — sent to **each
      player's own endpoints**, with no opponent identity. Emitted in
      `settleMatch` **after** its `db.$transaction(…)` resolves and only when
      that call settled the match (`settled: true`), so the five callers
      (walkover, claims, confirm, decide, report) need no change and a
      rolled-back settle emits nothing; a bye (`source: 'bye'`, one entrant)
      emits nothing. Entrants map to members through the entrant rows read
      after the commit.
  - Emitted **after commit**, best-effort, through `emitWebhookEvent`, so a
    failed queue never fails the member's action (the existing contract).
    Each emit point gets one line calling a small `emitActivity` helper.
  - An event a member's endpoint has not subscribed to is not delivered (the
    existing filter); `*` subscribers get the new events — **this is a
    behaviour change for existing `*` endpoints** and goes in the changelog
    with a date.
  - The form gains three group headings (Builds, Events, Reading,
    Tournaments — four) through `webhook-activity`; the docs list each event
    with its payload.

## Functional requirements

1. FR-1 Five event definitions with groups and descriptions.
2. FR-2 Emits at the five points, after commit.
3. FR-3 The endpoint form's groups.
4. FR-4 `docs/developer-api/webhooks.md` payload reference and a dated
   `changelog.md` entry; `pnpm docs:api` and `pnpm sdk:generate` if the
   webhook event list is in the generated output.

## Non-functional requirements

- **Privacy:** payload allowlists, asserted by a test that fails if a payload
  gains a key; no other member's id, handle or text in any payload.
- **Reliability:** emits never throw into the caller; one emit per action
  (an RSVP that does not change status emits nothing).
- **Performance:** one indexed read of the owner's matching endpoints per
  emit (the existing path).
- **Compatibility:** additive event names; the dated note for `*`.
- **i18n:** `webhook-activity` for the four headings only.

## Data model and API

- No schema change.
- `lib/webhooks/activity-events.ts` (the five definitions and payload
  builders, pure), `lib/webhooks/activity-emit.server.ts` (`emitActivity`).
- Edits: `lib/webhooks/events.ts` (spread the five in), `lib/builds/releases.server.ts`,
  `lib/events.server.ts` (`rsvp`), `lib/reading/shelves.server.ts`,
  `lib/reading/highlights.server.ts`, `lib/tournaments/tournament.server.ts`
  (`settleMatch`, both players), `EndpointFormDialog.tsx`, the webhooks docs.

## Testing requirements

- Main suite `lib/webhooks/__tests__/activity-events.test.ts`: each payload's
  exact key set; no other member's data; emit after commit (a failed emit
  leaves the action done); unchanged RSVP emits nothing; settle emits one
  event per player with the right result.
- Existing: `lib/webhooks/__tests__/*`, `lib/builds/__tests__/releases*`,
  `lib/events/__tests__/*rsvp*`, `lib/tournaments/__tests__/*settle*`.

## Acceptance criteria

- [ ] An endpoint subscribed to `reading.finished` receives a signed delivery
      when its owner shelves a book as read.
- [ ] A settled match sends `won` to the winner's endpoint and `lost` to the
      loser's, neither naming the other.
- [ ] The form shows the four new groups; the docs list the payloads.

## Out of scope

Events about other members (new follower, RSVP to my event, comment on my
post), study and typing events, per-event payload versioning.
