# 06 — API key restrictions: allowed addresses and a lower rate limit

Surface: `/developer` keys manager (`components/developer/KeysManager.tsx`) and
every `/api/v1/**` request. Wave 5. Namespace `key-restrictions`.

## User story

As a developer who runs a bot or a server against the RMH Studios API, I want
to restrict a key to the addresses my server uses and give it a lower request
limit than my tier allows — so that a leaked key is useless from anywhere else
and a runaway script cannot burn my whole quota.

## Requirements elicitation

- **What exists (verified):** `DeveloperApiKey`
  (`prisma/schema/developer.prisma`) has scopes, expiry, revocation, test mode,
  `lastUsedAt`; keys can be rotated (`lib/developer/keys.contract.ts`).
  `authenticateApiKey` in `lib/api/developer-auth.server.ts` checks revoked and
  expired keys; the wrapper `lib/api/with-developer-api.server.ts` applies a
  per-IP gate (300 a minute), a tier-scaled per-key limit and a daily cost
  budget, and answers in the v1 error envelope (`lib/api/errors.ts`). **No
  restriction by source address exists** (no `allowedIps`, CIDR or allowlist
  code anywhere), and the per-key limit cannot be lowered.
- **Decisions:** an optional list of up to 20 IPv4/IPv6 addresses or CIDR
  ranges per key; an empty list means "any address" (today's behaviour). The
  client address is the one `getClientIp` already trusts (the site's proxy
  chain), so the restriction cannot be bypassed with a forged header beyond
  what the rate limiter already accepts. A refused request answers
  `403 ip_not_allowed` in the v1 envelope and does **not** count against the
  key's quota, but it is recorded (count and last refused address prefix) so
  the owner can see a leak. An optional per-key limit (requests per minute,
  1 to the tier's limit) replaces the tier limit when lower. Both are editable
  after creation; changes apply within the auth cache's lifetime (check
  whether `authenticateApiKey` caches; if it does, invalidate on update).

## Functional requirements

1. FR-1 The create-key form and each key's settings gain "Allowed addresses"
   (a textarea, one address or range per line, validated as typed with the
   error on the line) and "Requests per minute" (a number, blank for the tier
   default, with the tier's maximum shown).
2. FR-2 A request with a key that has a non-empty list and a client address
   outside every entry is refused with `403 ip_not_allowed` before scope and
   rate checks; test-mode keys follow the same rule.
3. FR-3 The per-key limit, when set, is used by the per-minute limiter and
   shown in the `X-RateLimit-Limit` header.
4. FR-4 Each key shows "Refused requests: N in the last 7 days, last from
   203.0.113.x" (IPv4 last octet and IPv6 last 80 bits masked) so a leak is
   visible.
5. FR-5 The OpenAPI document (`lib/api/openapi.ts`) and the developer docs list
   `ip_not_allowed` among the errors.
6. FR-6 The key list shows a "Restricted" label on keys with an allowlist.

## Non-functional requirements

- **Security:** parsing is strict (no hostnames, no wildcards, prefix length
  bounded: IPv4 /8–/32, IPv6 /16–/128) so a typo cannot open a key to the
  world; `0.0.0.0/0` and `::/0` are rejected with a message to leave the list
  empty instead. IPv4-mapped IPv6 client addresses are normalised before
  matching. Refusals are counted per key per day in a small table, never with
  the full address.
- **Performance:** matching is pure and in memory (at most 20 entries, parsed
  once per key load); no extra query on the hot path beyond the existing key
  lookup (the columns are added to its `select`). The refusal counter is an
  upsert fired without awaiting the response.
- **Accessibility:** the textarea has a label, a description of the format and
  per-line errors linked with `aria-describedby`.
- **i18n:** strings in `key-restrictions`; the API error message stays English
  (the envelope is a machine interface, like the existing errors).
- **Steel:** rows on rules in the key settings; one primary (Save) per form.

## Data model and API

- `DeveloperApiKey` gains `allowedCidrs String[] @default([])` and
  `rateLimitPerMinute Int?`. New model `ApiKeyRefusalDaily { keyId, day
  String @db.VarChar(10), count Int @default(0), lastPrefix String?
  @db.VarChar(64), @@id([keyId, day]), @@map("api_key_refusal_daily") }` with
  cascade on the key.
- Migration `20261123050100_s03_api_key_restrictions`.
- Pure `lib/api/ip-allowlist.ts` (`parseCidr`, `parseAllowlist`,
  `ipAllowed(ip, entries)`, `maskAddress`), used by the schema, the UI and the
  wrapper.
- `lib/developer/keys-schema.ts` and `keys.contract.ts`: create and PATCH
  bodies gain the two fields; `developer.keys.$id.server.ts` accepts them;
  `developer.keys.$id.usage.server.ts` returns the refusal summary.
- `authenticateApiKey` selects the columns; `withDeveloperApi` checks the
  allowlist right after authentication and uses `rateLimitPerMinute`.

## Testing requirements

- Main suite `lib/api/__tests__/key-ip-allowlist.test.ts`: a restricted key is
  refused from outside and allowed from inside (IPv4, IPv6, mapped IPv4); the
  refused request does not consume the per-key limit; `0.0.0.0/0` is rejected
  on save; another member cannot edit the key; the lower limit applies and is
  in the header.
- Product suite `lib/api/__tests__/ip-allowlist.product.test.ts`: CIDR parsing
  edge cases, masking.

## Acceptance criteria

- [ ] A key restricted to one address works from it and answers
      `403 ip_not_allowed` elsewhere.
- [ ] Refused requests appear on the key with a masked address.
- [ ] A key limited to 10 a minute is refused on the 11th request with the
      usual 429.
- [ ] Existing keys behave as before.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Referrer restrictions (the API is server-to-server), per-endpoint limits,
OAuth.
