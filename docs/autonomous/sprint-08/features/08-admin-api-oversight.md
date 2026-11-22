# 08 — Developer API oversight for admins

Surface: a new admin page `/admin/api-keys`, the developer API's key check,
and the owner's keys manager (`/developer`). Wave 1. Namespace
`admin-api-oversight`.

## User story

As an admin, when one key is hammering the API, scraping profiles or failing
every request, I want to see which keys use the API most, with their error
and refusal rates, and suspend one with a reason the owner can read, so that I
can stop abuse without banning the member or deleting their key.

As a developer whose key was suspended, I want to see why and when, in my keys
manager, instead of a bare 401.

## Requirements elicitation

- **What exists (verified):**
  - `DeveloperApiKey` (`prisma/schema/developer.prisma`) has `revokedAt`,
    `expiresAt`, `rateLimitPerMinute`, `allowedCidrs`; usage is counted per key
    per UTC day in `ApiUsageDaily` (`requests`, `units`, `clientErrors`,
    `serverErrors`, `lib/api/usage.server.ts`), and IP-allowlist refusals in
    `ApiKeyRefusalDaily` (`lib/api/key-refusals.server.ts`).
  - The key check is `lib/api/developer-auth.server.ts` (revoked, expired,
    deleted owner, subscription tier, active ban).
  - Admins have no view of keys: `grep -rl developerApiKey lib/admin` finds
    only `secure-account.server.ts` (sprint 06 06), which revokes a member's
    keys wholesale. `app/routes/_site/admin/` has no API page.
  - Owners see their own keys, usage and refusals in
    `components/developer/KeysManager.tsx` and `KeyUsage.tsx`.
  - Webhook endpoints carry consecutive failure counts and auto-disable
    (`prisma/schema/developer.prisma`, "Consecutive delivery failures").
- **Decisions:**
  - **The page** (`auth: 'admin'`): rows on rules (D10 default) of active keys
    ordered by units in the last 7 days, each with owner handle, key name and
    prefix + last four (never the hash), scopes, created, last used, requests
    and units (today, 7 days), 4xx and 5xx rates, allowlist refusals (7 days),
    webhook endpoints and how many are auto-disabled, and status (active,
    suspended, expired). Filters: status, "errors above 20%", owner handle
    (the admin lookup's search box pattern, never an e-mail in the URL —
    sprint 07 13). Cursor pagination, 50 a page.
  - **Suspend** (with a required reason, 10–500 characters, `usePrompt`) and
    **Lift suspension**: new columns `suspendedAt`, `suspendReason`. A
    suspended key is refused by `developer-auth.server.ts` with `403
    key_suspended` and the fixed message "This API key was suspended by RMH
    Studios. Its owner can see why on the developer keys page." — placed
    after the revoked/expired checks so a revoked key still reads as invalid.
    **The reason is not in the error body**: a key serves other people's apps
    and bots, whose error logs and users may see the body; the reason is for
    the key's owner only (keys manager and notification). Suspension does not
    revoke, so lifting restores it. The new code joins `lib/api/errors.ts`
    (code and status maps) and `docs/developer-api/errors.md`; the admin cap
    is documented in `docs/developer-api/rate-limits.md`; one changelog bullet
    under the `s08-08` changelog anchor.
  - **Cap**: admins can set an admin rate cap `adminRateLimitPerMinute`
    (1–600) that wins over the owner's `rateLimitPerMinute` when lower; the
    rate limiter in `with-developer-api.server.ts` takes the minimum.
  - **Audit:** every suspend, lift and cap change is recorded with
    `recordAdminActionIn(tx, …)` in the same transaction.
  - **Owner notice:** a `SYSTEM` notification (`entityType`
    `api-key-suspended`, label under the notification-labels anchor; one per
    suspension, none on a cap change; lifting sends `api-key-restored`, a
    second label under the same anchor) and the
    keys manager shows "Suspended {{date}}: {{reason}}" on the key's row, a
    line of text on a rule (D8 default), and a link to the feedback inbox to
    reply.
  - Test-mode keys are listed with a "Test" mark and can be suspended too.

## Functional requirements

1. FR-1 `/admin/api-keys` with the columns, filters and pagination above,
   linked from the admin hub.
2. FR-2 Suspend / lift with reason, audited, notified.
3. FR-3 Admin rate cap, audited.
4. FR-4 The refusal in the key check, and the owner's view of a suspension.

## Non-functional requirements

- **Performance:** the list is two queries — keys page, then the usage and
  refusal aggregates for those key ids (`groupBy` over the existing
  `(keyId, day)` keys) — never an aggregate over the whole usage table. The
  key check reads two more columns on the query it already makes.
- **Security:** `auth: 'admin'`, `rateLimit: 'write'` on mutations; zod on
  every input; the hash, plaintext and allowed CIDRs are never sent to the
  page (CIDRs as a count).
- **Privacy:** owner handle only; no e-mail.
- **Steel:** a titled admin page of rows on rules with `t-meta` figures; one
  ink primary per view (none on the list; "Suspend" in the dialog).
- **i18n:** `admin-api-oversight`; the notification label in `feed`.

## Data model and API

- `DeveloperApiKey.suspendedAt DateTime?`, `suspendReason String?
  @db.VarChar(500)`, `adminRateLimitPerMinute Int?`. Migration
  `20261128010300_s08_admin_api_oversight`.
- `lib/admin/api-keys.ts` (pure: `errorRate`, `effectiveRateLimit`),
  `api-keys-schema.ts`, `api-keys.contract.ts`, `api-keys.server.ts`;
  modules `lib/admin/api/admin.api-keys.server.ts` (GET list) and
  `admin.api-keys.$id.server.ts` (PATCH `{ suspend?: { reason } | null,
  adminRateLimitPerMinute?: number | null }`).
- Page `app/routes/_site/admin/api-keys.tsx`,
  `components/admin/api-keys/ApiKeysTable.tsx`.
- Edits: `lib/api/errors.ts` (`key_suspended` → 403),
  `docs/developer-api/errors.md`, `rate-limits.md` and `changelog.md` (under
  its anchor), `lib/api/developer-auth.server.ts`,
  `lib/api/with-developer-api.server.ts` (minimum of the two caps),
  `lib/developer/keys-list.server.ts` and `components/developer/KeysManager.tsx`
  (the owner's line), `lib/sitemap.ts` (`/admin/api-keys` as `admin`, under
  the anchor), the admin hub (anchor), notification labels (anchor).

## Testing requirements

- Main suite `lib/admin/__tests__/api-keys.test.ts`: admin only; list
  aggregates per page; suspend requires a reason and audits in-transaction;
  lift restores; cap audited.
- Main suite `lib/api/__tests__/developer-auth-suspended.test.ts`: suspended →
  403 `key_suspended`; revoked beats suspended; lifting restores access;
  effective rate limit is the minimum.
- Product suite `lib/admin/__tests__/api-keys.product.test.ts`.
- Existing: `lib/api/__tests__/developer-auth*.test.ts`,
  `notification-labels.test.ts` (new line), sitemap coverage, OG coverage
  (admin pages excluded).

## Acceptance criteria

- [ ] An admin sees the busiest key first, suspends it with a reason, and its
      next request gets `403 key_suspended` (without the reason in the body).
- [ ] The owner gets a notification and sees the reason on the key's row.
- [ ] Lifting the suspension restores the key without a new secret.
- [ ] Every change is in `/admin/audit`.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Automatic suspension, per-endpoint quotas, webhook endpoint suspension by
admins, an appeal workflow beyond the feedback inbox.
