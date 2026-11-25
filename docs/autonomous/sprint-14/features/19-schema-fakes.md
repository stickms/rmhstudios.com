# 19 — Test doubles that know the schema

Surface: the test suites (a query-shape checker for Prisma fakes and a JSON-safety check for responses), adopted by
the shared fake database and by the three sprint 13 tests whose fakes hid runtime failures; every later sprint 14
brief requires it. Wave 1. No namespace (no UI).

## User story

As an implementer whose unit tests use a fake database, I want the fake to reject a query Postgres would reject — a
field the model does not have, a `not: null` on a required column, `nulls` ordering on a required column — and a
response that cannot be serialised, so that my green tests mean the code runs.

## Requirements elicitation

- **What exists (verified):**
  - Main-suite tests never touch a database: they mock `@/lib/prisma.server` with `vi.mock` or use a fake such as
    `lib/economy/__tests__/fake-db.ts`; erasure tests use recording Proxies (`lib/account/__tests__/*-erasure.test.ts`).
    None of them knows the schema, so any argument object passes.
  - Sprint 13's integration (`docs/autonomous/sprint-13/summary.md`, "Fixes made at integration" and "Ladder calendar")
    found four runtime failures that green tests had pinned:
    - `collectContributions` filtered `accuracy: { not: null }` and ordered with `nulls: 'last'` on the required
      `SliceRun.accuracy` (Prisma rejects both at run time); its test (`features/slice-it/engine/__tests__/
      rating-contributions.test.ts`) asserted the invalid arguments;
    - a replayed prediction sale returned the ledger's `BigInt` `amount` in `Response.json`, which throws
      (`lib/predictions/__tests__/sell.test.ts`);
    - the ladder calendar read selected `job.updatedAt`, a column `LadderJob` does not have, through a nested select
      tsc did not catch (`lib/rmhladder/__tests__/calendar-entries.product.test.ts` and the calendar feed tests).
  - The Prisma client exposes a **slim** data model at run time: `Prisma.dmmf.datamodel.models` (609 models). Checked
    in the worktree with `node -e "require('@prisma/client').Prisma.dmmf…"`: each field carries only `name`, `kind`
    (`scalar`, `object`, `enum`), `type` and, for relations, `relationName`. **It has no `isRequired` and no
    `isList`** (`SliceRun.accuracy` reads `{"name":"accuracy","kind":"scalar","type":"Float"}`; `LadderJob.skills`, a
    `String[]`, reads as `String`), so the runtime model cannot tell an optional column from a required one — the one
    fact the `null` rules need. Optionality and list-ness are in the schema source (`prisma/schema/**/*.prisma`:
    `Type?`, `Type[]`), which `lib/account/__tests__/erasure-coverage.test.ts` already parses with `node:fs`.
- **Decisions:**
  - **A checker:** `lib/db/query-shape.ts` (new, test-time only, imports `Prisma` from `@prisma/client`):
    `queryShapeProblems(model, operation, args)` → `string[]` and `assertQueryShape(...)` (throws with every
    problem). It checks, recursively through relation fields:
    - every key of `where`, `select`, `include`, `orderBy`, `distinct`, `cursor` and `groupBy`'s `by` names a field of
      the model (relation filters `some`, `every`, `none`, `is`, `isNot` recurse into the related model; `AND`, `OR`,
      `NOT` recurse into the same model);
    - a filter that compares with `null` (`{ not: null }`, `{ equals: null }`, `field: null`) or an `orderBy`
      `{ sort, nulls }` is on an **optional** scalar;
    - a nested `select` / `include` only names fields of the related model, and `select` and `include` are not both
      given at one level;
    - `data` of `create`, `update`, `upsert` (`create` / `update`) and `createMany` names only fields of the model
      (nested writes recurse);
    - unknown operations and unknown models are problems.
    It does not type-check values beyond `null` (tsc does that).
  - **A fake wrapper:** `shapeChecked(fake)` returns a Proxy over any fake client (`prisma.<model>.<op>(args)` and
    `tx.<model>.<op>` inside `$transaction(fn)`) that runs `assertQueryShape` before delegating; `$queryRaw` and
    `$executeRaw` pass through unchecked (raw SQL is smoke-tested by integration).
  - **A JSON check:** `assertJsonSafe(value)` throws on a `BigInt`, a function, a `Symbol`, a cycle or a non-finite
    number anywhere in a value (what `Response.json` would throw on or silently corrupt), with the path to the bad
    value.
  - **Adoption now:** `lib/economy/__tests__/fake-db.ts` is wrapped (so every economy test checks shapes); the three
    sprint 13 tests above are changed to check the real query shapes and to `assertJsonSafe` the sale's response body;
    a test proves each of the four sprint 13 bugs would now fail.
  - **Adoption later:** every sprint 14 brief from wave 2 on requires new fakes to go through `shapeChecked`
    (`plan.md` §Implementer rules). Existing tests are not rewritten wholesale.

## Functional requirements

1. FR-1 `lib/db/query-shape.ts` (new): the checker, `shapeChecked`, `assertJsonSafe`, and a model map built once per
   process by parsing `prisma/schema/**/*.prisma` (each field: name, type, `kind` — a model name is a relation, an
   `enum` name an enum, anything else a scalar — `optional` from `?`, `list` from `[]`; `@relation` fields recurse
   into their target). `Prisma.dmmf.datamodel.models` is read only to cross-check: a test asserts the parsed map and
   the runtime model agree on every model's and field's name, so a parser bug cannot hide behind a fake.
2. FR-2 `lib/db/__tests__/query-shape.test.ts` (new): each rule, with real models (`SliceRun.accuracy` required,
   `LadderJob` without `updatedAt`, an optional column accepting `not: null`, relation filters, groupBy `by`), the
   parsed map agreeing with `Prisma.dmmf` on names, and `LadderJob.skills` parsed as a list.
3. FR-3 `lib/db/__tests__/sprint-13-regressions.test.ts` (new): the four sprint 13 failures reproduced as shapes and
   values, each rejected.
4. FR-4 Adoption: `lib/economy/__tests__/fake-db.ts`; `features/slice-it/engine/__tests__/rating-contributions.test.ts`;
   `lib/predictions/__tests__/sell.test.ts`; the ladder calendar test that covers the read sprint 13 fixed.
5. FR-5 `lib/__tests__/test-discovery.test.ts` and `tsconfig.site.json` placement: the module is a site file used only
   by tests (it is not imported by any product code; a source scan in FR-2 asserts that).

## Non-functional requirements

- **Speed:** building the model map once per process (parsing about 600 models is a few tens of milliseconds); a check
  is a few microseconds; the economy suite's run time grows by less than 5%.
- **No production import:** nothing under `app/`, `components/`, `features/*/ui` or a `*.server.ts` imports it (the
  FR-2 scan); it reads the schema with `node:fs`, which only a test process can do.
- **Honest scope:** the checker does not replace the integration suite's real-Postgres smoke tests; `plan.md` keeps
  those for every new query.

## Data model and API

None.

## Testing requirements

As FR-2 and FR-3, plus the adopted suites staying green: `lib/economy/__tests__/`,
`features/slice-it/engine/__tests__/rating-contributions.test.ts`, `lib/predictions/__tests__/`,
`lib/rmhladder/__tests__/calendar-*.test.ts`; and `lib/__tests__/ts-escape-hatch-ratchet.test.ts` (the Proxy is typed
without `any`).

## Acceptance criteria

- [ ] A fake call `sliceRun.findMany({ where: { accuracy: { not: null } } })` through `shapeChecked` throws, naming the
      model, the field and the rule.
- [ ] `ladderJob.findMany({ select: { updatedAt: true } })` throws; `{ select: { lastSeenAt: true } }` passes.
- [ ] `assertJsonSafe({ proceeds: 5n })` throws with the path `proceeds`.
- [ ] The economy suite runs through the checker and stays green.

## Out of scope

Checking value types, checking raw SQL, generating fakes from the schema, rewriting existing tests beyond the four
named.
