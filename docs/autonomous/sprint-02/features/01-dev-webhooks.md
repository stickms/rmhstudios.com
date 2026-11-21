# 01 — Webhooks console

Surface: developer platform (`/developer`). Wave 1. Namespace `dev-webhooks`.

## User story

As a developer building on the RMH Studios API, I want to register, inspect and
debug my webhook endpoints from the developer page — see every delivery, why it
failed, send a test event, redeliver one, and rotate a leaked secret without
dropping events — so that I do not have to script against `/api/v1/webhooks`
with an API key just to find out why my integration went quiet.

## Requirements elicitation

- **Who:** members with a developer key (`/developer`). Webhooks are one of the
  developer API's two push surfaces; the other is polling.
- **What exists (verified):** `WebhookEndpoint` and `WebhookDelivery`
  (`prisma/schema/developer.prisma`); emit, retry and signing in `lib/webhooks/`
  (`emit.server.ts`, `jobs.server.ts`, `signature.ts`, `events.ts`); management
  only through the API-key routes `app/routes/api/v1/webhooks.ts` and
  `.../webhooks/$id.ts`. The developer page
  (`app/routes/_site/developer/index.tsx`) has keys, usage, recipes and badges,
  and **no webhook UI at all**. Deliveries are stored with status, attempts,
  response status and error, but nothing shows them to the owner.
- **Pain:** an endpoint that fails five times auto-disables
  (`AUTO_DISABLE_FAILURES`) and the owner is never shown that it did or why.
  There is no test event, no redelivery, and rotating a secret means deleting
  the endpoint and losing its history.
- **Decisions:** the console uses the member's **session** (site endpoints under
  `/api/developer/webhooks/**`), not an API key, the same way the keys manager
  does. The v1 API is unchanged except that both now share one limits module.
  Rotation keeps the old secret valid for 24 hours and signs with both, the
  standard zero-downtime pattern; the overlap is not configurable.

## Functional requirements

1. FR-1 List the member's endpoints (URL, description, events, enabled, failure
   count, last delivery, health derived from the last 20 deliveries).
2. FR-2 Create an endpoint: URL (validated by `validateWebhookUrl`), events
   picked from `WEBHOOK_EVENTS` (or `*`), description. The secret is shown
   **once** with a copy button and a warning; it is never returned again.
3. FR-3 Edit URL, events, description; enable or disable; delete with a
   confirmation that names the URL.
4. FR-4 Endpoint detail: deliveries newest first, 25 per page, filter by status
   (all, delivered, pending, failed) and event; each row shows event, status,
   HTTP status, attempts, duration, time; expanding a row shows the JSON payload
   (pretty, `dir="ltr"`) and the error text.
5. FR-5 Send a test event: a `ping` event delivered to this endpoint only,
   whatever events it subscribes to, recorded as a normal delivery.
6. FR-6 Redeliver: any delivered or failed delivery can be sent again as a
   **new** delivery row that points at the original (`redeliveryOfId`); the
   original is never mutated.
7. FR-7 Rotate secret: a new secret is generated and shown once; the previous
   secret stays valid for 24 hours, during which every delivery carries two
   `v1=` signatures (`X-RMH-Signature: t=…,v1=<new>,v1=<old>`). The console
   shows when the old one expires.
8. FR-8 Re-enable an auto-disabled endpoint resets `failureCount` to 0 and says
   why it was disabled (last error).
9. FR-9 Record `durationMs` for each attempt so the console can show latency.

## Non-functional requirements

- **Security:** every endpoint is owner-only; a foreign id answers 404, never
  403 (no existence oracle). The secret appears only in the create and rotate
  responses. Delivery still goes through `safeFetch` (unchanged). Writes use
  `rateLimit: 'write'`; test pings and redeliveries share a bespoke bucket of 10
  per minute per user. Endpoint cap stays 10 per member.
- **Performance:** the list is one query plus one grouped health query; the
  delivery list uses the existing `(endpointId, createdAt desc)` index with
  keyset pagination. No polling: a Refresh button re-fetches.
- **Accessibility:** the delivery list is a list of rows with a disclosure
  button per row (`aria-expanded`); status is text plus icon, never colour
  alone; the secret field is a read-only input with a labelled copy button.
- **i18n:** all strings in `dev-webhooks`; event names and JSON stay
  untranslated and `dir="ltr"`.
- **Steel:** `PageLayout`; rows on rules (R3); one ink primary per view (Create,
  or Save in the editor); dialogs are the overlay surface; `t-meta` for
  timestamps and counts; no shadows except the overlay's.

## Data model and API

- `WebhookEndpoint`: add `previousSecret String? @db.VarChar(128)`,
  `previousSecretExpiresAt DateTime?`.
- `WebhookDelivery`: add `durationMs Int?`, `redeliveryOfId String?` (no FK; the
  original may be pruned).
- Migration `20261122010000_s02_webhook_console` (additive only).
- Contracts in `lib/developer/webhooks.contract.ts`; zod in
  `lib/developer/webhooks-schema.ts`; logic in
  `lib/developer/webhooks.server.ts`.
- Endpoints (registered modules, `implement()`):
  `GET/POST /api/developer/webhooks`,
  `GET/PATCH/DELETE /api/developer/webhooks/$id` (GET takes `status`, `event`,
  `cursor`), `POST /api/developer/webhooks/$id/rotate`,
  `POST /api/developer/webhooks/$id/test`,
  `POST /api/developer/webhooks/deliveries/$id/redeliver`.
- `lib/webhooks/limits.ts`: `MAX_WEBHOOK_ENDPOINTS`, `SECRET_OVERLAP_MS`; the v1
  route imports the cap from there.
- `lib/webhooks/signature.ts`: a pure
  `signatureHeader(secrets, timestamp, body)` used by `emit.server.ts`, and
  `verifyWebhookSignature` accepting any `v1=` in the header.
- Route `/developer/webhooks` (`app/routes/_site/developer/webhooks.tsx`),
  `EXCLUDED_ROUTES` `'personal'`; linked from the developer index.

## Testing requirements

- Main suite (secrets and ownership are mission-critical):
  `lib/developer/__tests__/webhooks.server.test.ts` — foreign id is 404; list
  and detail never include `secret` or `previousSecret`; rotation moves the
  secret into `previousSecret` with a 24 h expiry; redelivery creates a new row
  with `redeliveryOfId`; the cap of 10 holds.
- Main suite: `lib/webhooks/__tests__/signature.test.ts` (extend if present) —
  the header carries both signatures in the overlap, one after it, and
  verification accepts either.
- Product suite: none needed beyond the above.

## Acceptance criteria

- [ ] A member with no endpoints sees an empty state with one Create button.
- [ ] Creating an endpoint shows its secret once; reloading never shows it.
- [ ] Send test event produces a `ping` delivery visible in the list within one
      refresh, with HTTP status and duration.
- [ ] A failed delivery can be redelivered; the new row links to the original.
- [ ] After Rotate, a receiver verifying with either secret accepts deliveries
      for 24 hours; after that only the new one.
- [ ] An auto-disabled endpoint says so with its last error and can be
      re-enabled.
- [ ] Day and Night, 390 px and 1280 px, and `ar` render without overflow.

## Out of scope

Custom headers, per-endpoint retry policies, response body capture (privacy and
storage), and changes to the v1 API surface beyond sharing the limits module.
