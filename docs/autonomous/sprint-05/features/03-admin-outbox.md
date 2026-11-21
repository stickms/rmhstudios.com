# 03 — Outbox dead letters

Surface: a new admin page `/admin/outbox`, linked from the admin hub. Wave 4.
Namespace `admin-outbox`.

## User story

As a site operator, I want to see outbox events that gave up — a webhook
delivery, a mention notification, an e-mail — read why, and send them again once
the cause is fixed, so that a receiver's six-hour outage does not silently lose
every event it missed.

## Requirements elicitation

- **What exists (verified):** the transactional outbox
  (`lib/outbox/outbox.server.ts`, model `OutboxEvent` in
  `prisma/schema/developer.prisma`, table `outbox_event`) retries each event on
  a seven-step backoff (`BACKOFF_MS`, `MAX_ATTEMPTS = 7`) and then sets
  `deadAt`, keeping the row "for inspection". Nothing inspects it: the on-call
  checker only reads the oldest pending age (`lib/oncall/checks.server.ts`).
  There is no way to re-send a dead event.
- **Decisions:** the page lists pending (overdue) and dead events by topic; an
  admin can requeue dead events (clear `deadAt`, reset `attempts` to 0, set
  `nextAttempt = now()`, keep `lastError` until the next attempt overwrites it)
  or discard them (delete). Requeue relies on the receiver-side idempotency the
  outbox already requires (`lib/api/idempotency.server.ts`). Every action is
  audited. Bulk by topic is capped at 500 rows per action.

## Functional requirements

1. FR-1 `/admin/outbox` shows a summary per topic: pending (due now), pending
   (scheduled later), dead, delivered in the last 24 h, oldest pending age.
   Topics with dead events come first.
2. FR-2 Opening a topic lists its dead events (default) or pending events (tabs,
   `components/ui/tabs.tsx`), 50 per page, newest first, keyset on `id`: id,
   created, attempts, last error (first line), dead time.
3. FR-3 An event's detail shows its payload JSON (truncated at 8 KB) and its
   full last error.
4. FR-4 Requeue one, requeue selected (≤ 100), "Requeue all dead in this topic"
   (≤ 500, with the count shown in the confirm dialog), and Discard one /
   selected. All confirm through `useConfirm`.
5. FR-5 Each action writes `logAdminAction` (`outbox.requeue` /
   `outbox.discard`, target type `outbox_event`, ids or `topic:<name>` and the
   count).

## Non-functional requirements

- **Correctness:** requeue is a conditional `updateMany` (`where: { id: { in },
  deadAt: { not: null }, deliveredAt: null }`), so an event that a drain
  re-delivered meanwhile is untouched; the response reports how many changed.
  "Requeue all" selects ids under the cap first, then updates by those ids.
- **Security:** `auth: 'admin'` on every endpoint; topics validated against
  `^[a-z0-9._:-]{1,80}$`; ids are bigint strings in one comma list; payloads
  (which carry member ids and webhook bodies) are shown to admins only and never
  logged.
- **Performance:** the summary is one `groupBy` on `topic` over rows that are
  not delivered, plus a delivered-last-24h count using
  `@@index([topic, createdAt])`; lists use the existing indexes. No polling.
- **i18n / Steel / a11y:** as 02 (rows on rules, mono counts, danger colour only
  for non-zero dead counts, labelled checkboxes).

## Data model and API

No schema change. Contract `lib/admin/outbox.contract.ts`; modules
`lib/admin/api/admin.outbox.server.ts` (GET summary),
`admin.outbox.events.server.ts` (GET `?topic=&state=dead|pending&after=`),
`admin.outbox.events.$id.server.ts` (GET), `admin.outbox.actions.server.ts`
(POST `{ action: 'requeue'|'discard', ids?: string, topic?: string, allDead?:
boolean }`). Logic in `lib/admin/outbox-admin.server.ts`, pure shaping in
`lib/admin/outbox-admin.ts`. Reuse 02's `JsonBlock` / truncation helper if it
exists by then (02 merges in wave 2).

## Testing requirements

- Main suite `lib/admin/__tests__/admin-outbox.test.ts`: 403 for non-admins;
  requeue updates only dead, undelivered rows and resets attempts and
  `nextAttempt`; "requeue all" caps at 500; discard deletes only dead rows;
  audit rows written; topic validation.
- Product suite `lib/admin/__tests__/admin-outbox.product.test.ts`: summary
  ordering and age formatting.

## Acceptance criteria

- [ ] An admin sees dead events per topic and can read the payload and error.
- [ ] Requeueing a dead event makes the drain deliver it again; the audit log
      records it.
- [ ] An event delivered between listing and requeue is not touched.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Editing payloads, changing the backoff, webhook endpoint management (exists for
developers in `/developer/webhooks`).

## As built

- Shipped as specified: summary (`groupBy` x4 over the existing indexes), tabbed dead/pending keyset lists
  (50, `id desc`, cursor serialised as a string, so no `BigInt` reaches `JSON.stringify`), payload via
  `toJsonField` (`redactSecrets` + `truncateJson`, 8 KB), requeue/discard one, selected (<= 100) and "all
  dead in topic" (<= 500, oldest first). Every endpoint is `auth: 'admin'`; there are no server functions.
- Concurrency: the ids are picked and acted on inside one transaction, and the `updateMany` / `deleteMany`
  repeat `deadAt: { not: null }, deliveredAt: null`, so a row delivered or requeued in between is skipped;
  `affected` vs `requested` reports it. The audit row (`recordAdminActionIn`) is in the same transaction.
- Requeue semantics verified against the drain (`lib/outbox/outbox.server.ts`): the drain claims
  `deliveredAt: null, deadAt: null, nextAttempt <= now` with a CAS on `nextAttempt`, so `deadAt: null`,
  `attempts: 0`, `nextAttempt: now` makes the event due on the next tick with a full seven-step budget and
  it cannot be re-dead-lettered early. `lastError` is kept and cleared on success.
- Risk: redelivery is at-least-once. A requeued event may already have reached its receiver before it was
  declared dead (for example a timeout after a successful write), so each topic's consumer must be
  idempotent (`lib/api/idempotency.server.ts`). The console does not know which topics are.
- The audit `detail` is capped at 500 characters by `recordAdminActionIn`, so a 100-id action records the
  leading ids only; the full set is in `targetId` as first id plus the count.
