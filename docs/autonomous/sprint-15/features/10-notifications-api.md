# 10 — Notifications in the developer API that you can mark read, with their notice keys and an unread count

Surface: `/api/v1/me/notifications` (changed, additively), `/api/v1/me/notifications/unread-count`,
`/api/v1/me/notifications/read`, the OpenAPI document, the SDK and the API docs. Wave 5. No UI namespace. Developer
API.

## User story

As a developer building a desktop notifier or a bot for my own account, I want to read my notifications with the key
and parameters of each site notice, get my unread count cheaply, and mark notifications read, so that my client can
show them in my language and clear them the way the site does instead of showing English previews forever unread.

## Requirements elicitation

- **What exists (verified):**
  - `GET /api/v1/me/notifications` (`app/routes/api/v1/me/notifications.ts`, scope `read:notifications`) returns
    `id`, `type`, `entityType`, `entityId`, `preview`, `link`, `read`, `createdAt`, `actor`, newest first.
  - It pages on `createdAt < cursor` alone (`parsePage`, `lib/api/serializers.server.ts`), so two notifications
    created in the same millisecond across a page boundary are skipped, and it has no filter for unread.
  - Since sprint 09 19, a `SYSTEM` notice is stored as a key: `previewKey` and `previewParams` beside the English
    `preview` fallback (`noticeColumns`, `lib/notifications/notice-keys.ts`); the inbox renders the key in the reader's
    language. The API returns only the English `preview`.
  - There is no way to mark a notification read through the API, and no unread count. The site's inbox marks read
    through `setRead(userId, ids, read)` and `markAllRead(userId, filter?)` (`lib/notifications/inbox.server.ts`, called
    by `POST /api/notifications/read`, `lib/preferences/api/notifications.read.server.ts`), both of which keep the
    Redis unread counter right (`adjustNotifUnread`); the badge reads `getUnreadNotificationCount(userId)`
    (`lib/notifications.server.ts`: the Redis counter, falling back to a `count`).
  - Explicit scopes (`explicit: true` in `lib/api/scopes.ts`) stay out of wildcards and the default grant
    (`WILDCARD_SCOPES`, `DEFAULT_SCOPES`, held by `lib/api/__tests__/scopes-explicit.test.ts`).
- **Decisions:**
  - **Additive fields:** each item gains `key` (the notice key, or `null`) and `params` (an object, or `null`). Clients
    that only read `preview` are unchanged.
  - **Paging fix, compatibly:** the cursor becomes `<createdAt ISO>|<id>` and the read orders by
    (`createdAt` desc, `id` desc) with a tuple comparison; a cursor in the old bare-ISO form is still accepted (read as
    `createdAt <` as today), so a client mid-walk is not broken. `nextCursor` is always the new form.
  - **`unread=true`** query filter on the list.
  - **`GET /api/v1/me/notifications/unread-count`** (`read:notifications`): `{ count }` from
    `getUnreadNotificationCount(userId)`, the very function behind the site's badge (no cap of its own; validation
    found the badge applies none).
  - **`POST /api/v1/me/notifications/read`** (new explicit scope `write:notifications`): body either `{ ids: string[] }`
    (1–100 of the owner's own ids; others' ids are ignored, not refused) or `{ before: ISO }` (every unread
    notification created at or before that time); answers `{ updated }`. `ids` go through `setRead(userId, ids, true)`;
    `before` goes through `markAllRead`, which gains an optional `before?: Date` (the site's call passes none and is
    unchanged), so the site's badge counter and the SSE count behave the same.
  - **Idempotent:** marking a read notification read again changes nothing; the endpoint honours `Idempotency-Key`.
  - **Rate limits:** the developer API's own per-key limits; no new limit class.

## Functional requirements

1. FR-1 `lib/api/v1/notifications.server.ts` (new): the list read (cursor parse, both forms; `unread`), the count,
   the mark-read; `lib/api/v1/notifications-schema.ts` (new, zod).
2. FR-2 `app/routes/api/v1/me/notifications.ts` uses it; `app/routes/api/v1/me/notifications/unread-count.ts` and
   `app/routes/api/v1/me/notifications/read.ts` (new route files, `withDeveloperApi`).
3. FR-3 `lib/api/scopes.ts`: `write:notifications` (explicit) under the Wave 0 anchor.
4. FR-4 `lib/api/registry.ts`: the changed entry (new fields, `unread` param, cursor note) and two new entries under
   the anchor; `scripts/generate-sdk.ts` `NULLABLE` entries for `key` and `params` under the anchor (check the field
   names are unused across the SDK first).
5. FR-5 `pnpm sdk:generate`, `pnpm docs:api`; `docs/developer-api/changelog.md` and `docs/developer-api/scopes.md`.

## Non-functional requirements

- **Additive only:** no documented field changes type; `git diff packages/sdk` shows additions only.
- **One shared mark-read:** the v1 write calls `setRead` / `markAllRead` in `lib/notifications/inbox.server.ts`, never a
  second hand-written `updateMany`; `lib/notifications/__tests__/` (the inbox suites) stay green with `before` absent.
- **Query shapes (verify against the schema):** `Notification.previewKey` and `previewParams` are optional (check the
  model in `prisma/schema/messaging.prisma`); `read` is a required boolean (filter `read: false`); the tuple cursor is
  written as `OR: [{ createdAt: { lt } }, { createdAt: lt, id: { lt: id } }]`.
- **Cache:** all three are `private, no-store` (the wrapper's default for `me` routes; check it).

## Testing requirements

- Main suite `lib/api/__tests__/v1-notifications.test.ts` (fakes through `shapeChecked`, bodies through
  `assertJsonSafe`): keys and params present for a keyed notice and `null` for a plain one; both cursor forms; no
  duplicate or gap across a page boundary at equal times; `unread` filter; the count's cap; mark-read by ids (others'
  ids ignored) and by time; the scope required; idempotent repeat.
- `lib/api/__tests__/scopes-explicit.test.ts`, the SDK check, the registry guard of feature 03.

## Acceptance criteria

- [ ] A key with `read:notifications` reads notifications with `key` and `params` and walks every page without a gap.
- [ ] The unread count is the site badge's number (`getUnreadNotificationCount`).
- [ ] A key with `write:notifications` marks notifications read, and the site's inbox shows them read.
- [ ] A key without `write:notifications` gets 403 on the write.

## Out of scope

Deleting notifications, notification preferences through the API, push subscriptions, webhooks for notifications.
