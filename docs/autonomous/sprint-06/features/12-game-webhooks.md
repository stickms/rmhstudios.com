# 12 — Webhooks for personal bests and achievements

Surface: the developer webhooks console (`/developer/webhooks`), the webhook
catalog, and two developer API reads. Wave 3. Namespace `game-webhooks` (console
strings only; catalog descriptions stay English data in `lib/webhooks/events.ts`
as today).

## User story

As a member who streams or runs a Discord server, I want my overlay or bot to be
told the moment I set a new personal best or unlock an achievement on RMH
Studios, so that the moment is celebrated live without me copying anything.

## Requirements elicitation

- **What exists (verified):**
  - The webhook catalog `WEBHOOK_EVENTS` (`lib/webhooks/events.ts`) has seven
    social events; emission is `emitWebhookEvent(userId, event, data)`
    (`lib/webhooks/emit.server.ts`), which fans out to the member's enabled
    endpoints subscribed to that event, signs the payload
    (`lib/webhooks/signature.ts`) and retries through `webhooks.retry`.
  - Scopes (`lib/api/scopes.ts`) include `read:games`; webhook management needs
    `manage:webhooks`. The OpenAPI document is built from `lib/api/registry.ts`
    (`lib/api/openapi.ts`).
  - Achievements unlock through two paths in `lib/achievements/engine.server.ts`,
    `grantAchievement` (one-shot) and `progressAchievement` (incremental), each
    with a conditional `updateMany(... unlockedAt: null)` claim, and both call
    the private `rewardUnlock` only when their claim succeeded.
  - Personal bests are recorded by `recordPersonalBest(db, input)`
    (`lib/game/personal-bests.server.ts`, sprint 05 04), which already returns
    `true` only when a row was written (the unique key makes a retry a no-op).
    It takes a `db` client and must not emit; its caller is `submitGameScore`
    (`lib/game/submit.server.ts`).
  - `/api/v1/me/achievements` exists (`app/routes/api/v1/me/achievements.ts`);
    nothing lists personal bests in the developer API.
- **Decisions:**
  - New events `personal_best.created` (data: `gameId`, `gameTitle`, `score`,
    `previousScore` or null, `achievedAt` — exactly what a `GamePersonalBest`
    row and the catalog hold; no board, unit or replay fields, which the record
    does not carry) and `achievement.unlocked` (data: `achievementId`, `name`,
    `gameId` or null, `unlockedAt`; only fields the achievement definition
    already has).
  - Emitted only for the member's own endpoints (webhooks are per-owner today);
    never for someone else's activity.
  - **Leaderboard privacy (sprint 05 01) does not suppress the member's own
    webhooks:** the member chose to subscribe their own endpoint; the payload
    never includes rank, which would reveal other players.
  - Emitted after the database write commits, `void`ed with its own `catch`, so
    a webhook failure never fails a score submission.
  - `GET /api/v1/me/personal-bests` (scope `read:games`): the member's current
    personal bests per game, with optional `gameId` and `since` filters, cursor
    paginated like the other `me/*` lists.
  - Additive only: no existing event, field or endpoint changes.

## Functional requirements

1. FR-1 `WEBHOOK_EVENTS` gains the two events with descriptions; the console's
   event picker lists them (read the picker first; if it is one flat list, add
   a "Games" group heading for the two new events).
2. FR-2 `submitGameScore` emits `personal_best.created` when
   `recordPersonalBest` returned `true`, after the write.
3. FR-3 `rewardUnlock` emits `achievement.unlocked`, so both
   `grantAchievement` and `progressAchievement` unlocks are covered exactly
   once.
4. FR-4 The console's "Send test event" can send a sample of either event
   (sample payloads in `lib/webhooks/samples.ts`, clearly marked
   `"test": true`).
5. FR-5 `GET /api/v1/me/personal-bests` per Decisions, documented in the
   registry with request and response examples; the developer docs page lists
   the two new webhook events with example payloads.
6. FR-6 Webhook payload shapes are declared once as zod schemas in
   `lib/webhooks/game-events.ts` and used by the emitter, the samples and the
   OpenAPI registry, so the three cannot drift.

## Non-functional requirements

- **Performance:** emission adds one indexed lookup of the member's subscribed
  endpoints (the emitter already does this); members with no endpoints cost one
  `count` that the emitter short-circuits.
- **Security:** the v1 route uses `withDeveloperApi` with `read:games`; zod for
  `gameId`, `since`, `cursor`, `limit` (≤ 100). Payloads contain only the
  member's own data and public game metadata.
- **Correctness:** a personal best and its webhook are emitted at most once per
  recorded best (the `recordPersonalBest` result is the source of truth).
- **i18n:** `game-webhooks` for any new console strings.
- **Steel:** the console's existing layout; the new heading is a `t-label`.
- **Developer API:** additive only; the OpenAPI snapshot test is updated by
  integration (`pnpm docs:api`).

## Data model and API

No schema change.

- `lib/webhooks/events.ts` (two entries), `lib/webhooks/game-events.ts`
  (schemas, builders), `lib/webhooks/samples.ts` (or the existing sample site,
  if the test-event flow keeps samples elsewhere — find it and extend it).
- `lib/game/submit.server.ts` (emission after `recordPersonalBest` returns
  `true`), `lib/achievements/engine.server.ts` (emission in `rewardUnlock`),
  `app/routes/api/v1/me/personal-bests.ts` (new route file with
  `withDeveloperApi`), `lib/api/registry.ts` entries.

## Testing requirements

- Main suite `lib/webhooks/__tests__/game-webhooks.test.ts`: a new best emits
  once and a non-best emits nothing; a repeated grant emits once; an
  incremental achievement reaching its target emits once; emission
  failure does not throw into the caller; payloads parse with their schemas and
  carry no rank.
- Main suite `lib/api/__tests__/v1-personal-bests.test.ts`: scope required,
  another member's data never returned, filters and cursor.
- Product suite `lib/webhooks/__tests__/game-events.product.test.ts`: builders
  and samples match the schemas.
- The existing developer API and webhook tests stay green.

## Acceptance criteria

- [ ] A member subscribes an endpoint to `personal_best.created`, beats their
      best in a game, and the endpoint receives one signed event with the new
      and previous score.
- [ ] Unlocking an achievement delivers `achievement.unlocked` once.
- [ ] `GET /api/v1/me/personal-bests` returns their bests with a `read:games`
      key and 403s without it.
- [ ] The webhooks console lists both events and sends a test of each.

## Out of scope

Events about other members, rank-change events, game session start/end events.
