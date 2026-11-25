# 10 — Your job search in the developer API

Surface: `/api/v1/me/ladder/applications*`, `/api/v1/me/ladder/own-jobs`, two new scopes, the developer docs, the SDK.
Wave 4. No namespace (the developer API's English JSON and docs). Developer API.

## User story

As a student who keeps a spreadsheet or a script beside my job search, I want to read my RMHLadder applications —
company, title, status, dates and the timeline — and move one to the next stage or add a job I found elsewhere from my
own tools, so that RMHLadder stays the record without copying by hand.

## Requirements elicitation

- **What exists (verified):**
  - No developer API scope reaches RMHLadder: `lib/api/scopes.ts` (`SCOPES`, `WILDCARD_SCOPES`, `READ_SCOPES`,
    `DEFAULT_SCOPES`), `lib/api/registry.ts` (`ENDPOINTS`), `/api/v1/**` route files with `withDeveloperApi`
    (`lib/api/with-developer-api.server.ts`), the OpenAPI document `lib/api/openapi.ts`, the SDK generator
    `scripts/generate-sdk.ts` (`NULLABLE`), `docs/developer-api/scopes.md` and `changelog.md`. Sprint 12 13
    (`app/routes/api/v1/me/characters.ts`, `parties.ts`) is the newest model.
  - The site's writes to reuse: `updateApplication` in `lib/rmhladder/server/actions.ts` (status, dates, notes, and the
    `LadderApplicationEvent` it records), and, from feature 08 (wave 1), `lib/rmhladder/own-jobs.server.ts` (create an
    own job, the cap, `catalogJobWhere`).
  - **An explicit scope can still be a default.** `explicit: true` keeps a scope out of `*` and `write:*`
    (`WILDCARD_SCOPES`), but `READ_SCOPES` (and so `DEFAULT_SCOPES`, a new key's default grant) is every `read` scope,
    explicit or not. No explicit read scope exists yet, so the gap has never mattered.
- **Decisions:**
  - **Scopes:** `read:ladder` (applications, their timelines, own jobs) and `write:ladder` (change an application's
    status, follow-up date, interview dates and notes; add an own job). **Both explicit**: a job search is private and a
    key must name them; neither is in `*`, `read:*`, `write:*` or the default grant. `READ_SCOPES` (or `DEFAULT_SCOPES`)
    excludes explicit scopes, with a test, so `read:ladder` is never granted by default.
  - **Not in the API:** offers and pay figures, resumes, the answer bank, referral names and contact e-mails (the most
    sensitive fields; recorded in the README).
  - **Endpoints:** `GET /api/v1/me/ladder/applications` (cursor on `(updatedAt, id)`, filter by status),
    `GET /api/v1/me/ladder/applications/{id}` (with its events, newest 50), `PATCH /api/v1/me/ladder/applications/{id}`
    (idempotent by `Idempotency-Key` as the API's other writes, the site's `updateApplication`, one event per change),
    `POST /api/v1/me/ladder/own-jobs` (the site's create, the same cap and refusal). A job's fields are the catalogue's
    public ones (title, company, location, remote, link, deadline) or the own job's; nothing about other members.
  - **Rate limits:** the API's write bucket; the site's own `ladder-import`-style caps are not bypassed (the own-job cap
    applies).
  - **Additive only**: new paths, new scopes, new schemas.

## Functional requirements

1. FR-1 `lib/api/scopes.ts`: the two scopes under `// s13-10 api-ladder`; `READ_SCOPES` / `DEFAULT_SCOPES` exclude
   explicit scopes.
2. FR-2 `lib/api/v1/ladder.server.ts` (new): the DTO mappers and reads (the key owner's own applications only; their
   jobs through 08's `ownerOrCatalogJobWhere(userId)`, so a catalogue job or the owner's own job and never another
   member's), calling the site's writes (which apply 08's `assertJobUsable`). The file joins 08's
   `OWNER_JOB_READ_PATHS` (in `lib/rmhladder/own-jobs.ts`; that one-line registry entry is the only edit 10 makes to an
   08 file, and it is additive).
3. FR-3 Route files `app/routes/api/v1/me/ladder/applications.ts`, `applications/$id.ts`, `own-jobs.ts` with
   `withDeveloperApi`; `ENDPOINTS` entries under the anchor in `lib/api/registry.ts`; OpenAPI schemas.
4. FR-4 `scripts/generate-sdk.ts` `NULLABLE` entries for the new nullable fields (checked against the whole SDK);
   `pnpm sdk:generate`, `pnpm docs:api`; `docs/developer-api/scopes.md` and the changelog entry under its anchor.
5. FR-5 The explorer's `DOCUMENTED_GROUPS` (`lib/developer/explorer.ts`) learns the "RMHLadder" group (sprint 12's integration
   fix for `explorer.product.test.ts` is the model).

## Non-functional requirements

- **Privacy:** a response carries only the key owner's own applications (their own notes included), never pay, offers,
  resumes or contacts; a key without
  the scope gets the API's 403 envelope.
- **Compatibility:** no existing field changes type (`git diff packages/sdk`).
- **Consistency:** the API's writes are the site's functions, so the timeline and the insights match.

## Data model and API

No schema change. `LadderApplicationV1 { id, status, appliedDate, followUpDate, interviewDates, notes, updatedAt, job:
{ id, title, company, location, remote, url, deadline, own } }`.

## Testing requirements

- Main suite `lib/api/__tests__/v1-ladder.test.ts`: scope checks (read, write, neither by `*`); own rows only; a PATCH
  records one event and is idempotent; the own-job cap refusal in the API's envelope; no offer or pay field in any
  response.
- Main suite `lib/api/__tests__/scopes-explicit.test.ts`: no explicit scope is in `WILDCARD_SCOPES`, `READ_SCOPES` or
  `DEFAULT_SCOPES`; every non-explicit read scope that was in `DEFAULT_SCOPES` before stays in it (the set is pinned,
  so existing keys and the key form's default keep what they had). `lib/__tests__/developer-api.test.ts`'s
  `DEFAULT_SCOPES` equals `READ_SCOPES` still holds.
- The API registry, OpenAPI and SDK gates (`pnpm sdk:check`), the explorer product test (`lib/developer/__tests__/explorer.product.test.ts`).

## Acceptance criteria

- [ ] A key with `read:ladder` lists the member's applications with their jobs' titles and companies.
- [ ] A key with `write:ladder` moves an application to "interviewing", and the site's timeline shows the change.
- [ ] A key created with the default grant cannot read RMHLadder.
- [ ] No response includes pay, offers, resumes or contacts.

## Out of scope

Offers, resumes, the answer bank, referrals and interview reports in the API; webhooks for application changes.
