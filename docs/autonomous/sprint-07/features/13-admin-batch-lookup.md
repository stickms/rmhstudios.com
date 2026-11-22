# 13 — Admin lookup: many at once, and e-mail addresses out of the address bar

Surface: `/admin/lookup` and the lookup field on the admin hub. Wave 3.
Namespace `admin-batch-lookup`.

## User story

As an admin looking into a spam wave, I want to paste forty handles, post links
and e-mail addresses from a report at once and see what each one is, its state
and the tool that acts on it, in one table, so that I do not run forty lookups
one by one.

As the site owner, I do not want a member's e-mail address that an admin
searched for to sit in access logs and browser history.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 05 10's lookup: `GET /api/admin/lookup?q=`
    (`lib/admin/api/admin.lookup.server.ts`, `auth: 'admin'`, 60 per minute),
    `runAdminLookup(adminId, raw)` (`lib/admin/lookup.server.ts`: classify,
    plan, resolve per kind, one audit row per lookup that never contains the
    e-mail address), the pure half `lib/admin/lookup.ts` (`classifyLookup`,
    `inputKindOf`, `parseSitePath`, `MAX_LOOKUP_LENGTH`), and the page
    `app/routes/_site/admin/lookup.tsx`, which keeps the query in the URL
    ("so a result can be shared between admins").
  - Sprint 05's summary lists as an owner follow-up: "An e-mail address
    searched with `GET /admin/lookup?q=` lands in access logs and browser
    history."
  - The admin hub's lookup card is under the `s05-10 admin-lookup` anchor in
    `app/routes/_site/admin/index.tsx`.
- **Decisions:**
  - **POST for every lookup.** A new `POST /api/admin/lookup` takes `{ items:
    string[] }` (1–50 items, each ≤ `MAX_LOOKUP_LENGTH`, trimmed, blank lines
    dropped, duplicates collapsed) and returns one result group per item, in
    order. The old GET stays for one release for any open tab but the page
    stops calling it; it is marked deprecated in a comment and refuses inputs
    that classify as an e-mail address with 400 `USE_POST` (so the log leak
    closes now).
  - **The URL never carries an e-mail address.** The page keeps `?q=` for
    shareable non-e-mail lookups (ids, handles, links); when the input is an
    e-mail address, or a batch, the page shows results without writing the
    query to the URL, and its "Copy link" for that result is replaced by "Copy
    results" (plain text). An old link or bookmark that still carries an
    e-mail address in `?q=` is handled once on load: `validateSearch` drops
    any `q` that classifies as an e-mail (so it never reaches the GET), the
    page fills the box with it and replaces the history entry without it
    (`navigate({ search: {}, replace: true })`); the admin presses Look up.
    (The address that already reached an access log cannot be recalled; the
    400 on the GET stops it being answered.)
  - **Batch input:** a textarea ("One per line, up to 50"), parsed client-side
    with the pure `splitLookupInput` (newlines, commas, spaces between items),
    showing "{{n}} items" before submit.
  - **Results:** one row per item on rules — the input (`t-meta`), what it is,
    its state, and the tool links the single lookup already returns; "Not
    found" rows stay in place; an item that is ambiguous lists each match
    indented under it.
  - **Audit:** one audit row per batch with the count and the kinds, never the
    inputs that were e-mail addresses (the single lookup's rule), written with
    `recordAdminActionIn`.
  - Rate limit: the batch counts as its item count against the existing 60 per
    minute per admin (a 50-item batch uses 50).
  - "Copy results" produces a plain-text table the admin can paste into a
    report (input, kind, state, link).

## Functional requirements

1. FR-1 `POST /api/admin/lookup` (batch) via a contract and `implement()`.
2. FR-2 The page sends single and batch lookups by POST; a single non-e-mail
   lookup still writes `?q=`; e-mail and batch lookups do not.
3. FR-3 The batch textarea with item count, the results table, "Copy results"
   (polite "Copied" announcement; `useCopyFallback` where the clipboard is
   unavailable).
4. FR-4 The admin hub's lookup field accepts a pasted list and opens the page
   with it in memory (router state, not the URL).
5. FR-5 GET refuses e-mail inputs with 400 `USE_POST`.

## Non-functional requirements

- **Security:** `auth: 'admin'`; zod for the body; items resolved with bounded
  concurrency (`lib/async-pool.ts`, 5 at a time) so a batch cannot fan out 50
  parallel resolver sets.
- **Privacy:** no e-mail address in any URL, log line, audit row or error
  message; the response is `Cache-Control: no-store`.
- **Performance:** a 50-item batch completes under the same per-kind query
  costs as 50 single lookups, run 5 at a time.
- **Steel:** results are rows on rules with `t-meta` figures (D10 default).
- **i18n:** `admin-batch-lookup` for new strings; existing `admin-lookup`
  strings reused.

## Data model and API

- No schema change.
- `lib/admin/lookup.ts` gains `splitLookupInput` and `MAX_BATCH_ITEMS = 50`;
  `lookup-schema.ts` gains `lookupBatchSchema`; `lookup.contract.ts` gains
  `adminLookupBatchApi`; `lookup.server.ts` gains `runAdminLookupBatch(adminId,
  items)` reusing `runAdminLookup`'s resolvers without writing one audit row
  per item.
- `lib/admin/api/admin.lookup.server.ts` gains POST and the GET e-mail refusal.
- UI: `components/admin/LookupBatch.tsx`, `LookupResultsTable.tsx`; edits to
  `app/routes/_site/admin/lookup.tsx` and the hub's lookup field (under a new
  `s07-13` anchor line beside the s05-10 block).

## Testing requirements

- Main suite `lib/admin/__tests__/admin-batch-lookup.test.ts`: non-admin
  refused; 51 items refused; duplicates collapsed; order kept; one audit row
  per batch without any e-mail address; GET with an e-mail refused 400;
  rate-limit accounting by item count; concurrency bounded (spy on resolvers).
- Product suite `lib/admin/__tests__/lookup-split.product.test.ts`.
- A route/page test: an e-mail lookup does not change `location.search`.
- Existing tests that must stay green: the sprint 05 admin lookup tests.

## Acceptance criteria

- [ ] Pasting 40 mixed items returns 40 rows in order, each with its tools.
- [ ] Looking up an e-mail address leaves no address in the URL, history or
      server access log line (the request line carries no query).
- [ ] A single handle lookup can still be shared by link.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Bulk actions on the results (ban all, etc.), saved lookups, lookup history.
