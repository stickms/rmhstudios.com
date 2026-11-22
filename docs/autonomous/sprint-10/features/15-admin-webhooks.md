# 15 — Webhook oversight for admins

Surface: `/admin/webhooks` (new), the admin hub, the owner's webhooks console (`/developer/webhooks`), notifications.
Wave 4. Namespace `admin-webhooks`. Site tier (Steel).

## User story

As an admin, I want to see every webhook endpoint that is failing, slow or sending to a suspicious destination, read its
recent deliveries, and switch one off with a reason the owner can read, so that a broken or abusive endpoint stops
costing the delivery queue without my editing the database.

## Requirements elicitation

- **What exists (verified):**
  - `WebhookEndpoint` (`prisma/schema/developer.prisma`: `url`, `events`, `enabled`, `failureCount`, `lastDeliveryAt`,
    secrets) and `WebhookDelivery` (`status`, `attempts`, `responseStatus`, `error`, `durationMs`, indexed
    `[endpointId, createdAt desc]` and `[status, nextAttemptAt]`).
  - Delivery: `lib/webhooks/emit.server.ts` signs and sends, counts failures, and sets `enabled: false` after
    `AUTO_DISABLE_FAILURES = 20` consecutive failures. `enabled` is also written by the owner
    (`lib/developer/webhooks.server.ts`), by secure-account (`lib/admin/secure-account.server.ts`) and by the deletion
    hold (`lib/account/deletion-hold.server.ts`, sprint 09 14).
  - Admin oversight exists for API keys only (sprint 08 08: `/admin/api-keys`, `lib/admin/api-keys.server.ts`
    `listApiKeys` / `changeApiKey`, suspension with a reason the owner sees in
    `components/developer/KeySuspendedLine.tsx`). Nothing lets an admin see or stop webhooks; an owner can re-enable an
    endpoint the moment anyone disables it.
- **Decisions:**
  - **The list** (`/admin/webhooks`): endpoints filtered by "Failing" (`failureCount > 0`), "Auto-disabled", "Disabled
    by admin", "All", and by owner handle or URL host; each row: owner, host, events, status, failure count, last
    delivery, deliveries and failure rate in the last 24 hours, median duration — figures in `t-meta`. Rows on rules, no
    boxes (D10 stays open).
  - **Detail:** the last 50 deliveries (event, status, response status, duration, error text truncated to 200
    characters); **never** the secret, the payload body or the signature.
  - **The URL is redacted (validation pass 2).** A webhook URL is often itself a credential (a chat service's incoming
    webhook carries its token in the path; others put a key in the query). Admin views show the scheme, the host and the
    first path segment only, then "…" (`redactWebhookUrl` in `lib/admin/webhooks.ts`, pure: no query string, no
    fragment, no userinfo, no further segments); the full URL never leaves the server on an admin path. The error text
    is the receiver's response and may echo the URL, so it is passed through the same redaction (any substring equal to
    the endpoint's full URL or path is replaced) before truncation.
  - **Auto-disabled** is `enabled = false` with `failureCount ≥ AUTO_DISABLE_FAILURES` and no admin disable; "Disabled
    by admin" is `adminDisabledAt` set; an endpoint the owner turned off is neither.
  - **Admin disable:** with a required reason (up to 300 characters) the owner reads; stored as `adminDisabledAt`,
    `adminDisabledReason`, `adminDisabledById`. While set, the owner's "Enable" is refused with the reason, delivery
    skips the endpoint, and pending deliveries are cancelled. "Lift" clears it and leaves the endpoint disabled for the
    owner to re-enable (so it does not burst a backlog).
  - **Audit:** every disable and lift through `recordAdminActionIn(tx, …)` in the same transaction.
  - **Notice:** the owner gets a `SYSTEM` notice through a `notice()` key, "An admin turned off your webhook to <host>:
    <reason>", and the console shows the line in place of the switch.
  - **Interplay:** secure-account and the deletion hold keep writing `enabled`; neither clears an admin disable, and
    lifting an admin disable never re-enables an endpoint they disabled.

## Functional requirements

1. FR-1 Three nullable columns on `WebhookEndpoint`.
2. FR-2 `lib/admin/webhooks.server.ts`: `listWebhooks(filters)` (keyset, the 24-hour figures in one grouped query over
   `webhook_delivery` by `[endpointId, createdAt]`), `getWebhookDetail`, `adminDisableWebhook`, `liftWebhookDisable`.
3. FR-3 Registered admin endpoints (contracts + `implement()`, `auth: 'admin'`).
4. FR-4 `/admin/webhooks` page, the admin hub entry (anchor), sitemap entry (anchor).
5. FR-5 `emit.server.ts` skips an admin-disabled endpoint; `lib/developer/webhooks.server.ts` refuses the owner's enable
   with `code: 'admin_disabled'` and the reason; `components/developer/WebhooksConsole.tsx` shows the line.
6. FR-6 The notice key, label and their tests.

## Non-functional requirements

- **Security:** no secret, payload, signature or unredacted URL leaves the server on any admin path (asserted by a test
  on the serialised rows, including an error text that echoes the URL); admin-only routes and server functions guarded
  inside their handlers.
- **Performance:** the 24-hour figures use the existing `[endpointId, createdAt]` index; page size 50.
- **Design:** rows on rules with `t-meta` figures; the disable dialog is the standard dialog with one primary.

## Data model and API

- `prisma/schema/developer.prisma` (`WebhookEndpoint`): `adminDisabledAt DateTime?`,
  `adminDisabledReason String? @db.VarChar(300)`, `adminDisabledById String?`. Migration
  `20261130040300_s10_admin_webhooks`.
- New `lib/admin/webhooks.ts` (pure: filters, figures), `webhooks-schema.ts`, `webhooks.contract.ts`,
  `webhooks.server.ts`, `lib/admin/api/admin.webhooks*.server.ts`, `app/routes/_site/admin/webhooks.tsx`,
  `components/admin/WebhooksAdmin.tsx`.
- Edits: `lib/webhooks/emit.server.ts`, `lib/developer/webhooks.server.ts`, `components/developer/WebhooksConsole.tsx`
  (and `WebhookDetail.tsx`), the anchored files (admin hub, sitemap, notice keys and previews, labels and test,
  `user-text.ts`).

## Testing requirements

- Main suite `lib/admin/__tests__/admin-webhooks.test.ts`: non-admin refused; rows never carry `secret`,
  `previousSecret` or `payload`; disable writes the audit row in the same transaction, cancels pending deliveries and
  notifies; the owner's enable is refused while disabled; lift leaves `enabled` false; secure-account does not clear the
  admin disable.
- Main suite `lib/webhooks/__tests__/emit-admin-disabled.test.ts`: delivery skips an admin-disabled endpoint.
- Product suite `lib/admin/__tests__/webhook-figures.product.test.ts`: failure rate and median; `redactWebhookUrl` (path
  tokens, query keys, userinfo and fragments removed; an IDN host kept).
- Admin route guards (server-fn guard ratchet), sitemap coverage, notice-key and labels tests.

## Acceptance criteria

- [ ] `/admin/webhooks?filter=failing` lists endpoints with failures and their 24-hour figures.
- [ ] An admin turns one off with a reason; the owner sees the reason in their console and cannot switch it on.
- [ ] Lifting it leaves it off until the owner turns it on.
- [ ] No admin view shows a secret, a payload or a webhook URL beyond its host and first path segment.

## Out of scope

Editing an owner's endpoint, replaying deliveries as an admin, rate-limiting endpoints per host, webhook analytics for
owners.
