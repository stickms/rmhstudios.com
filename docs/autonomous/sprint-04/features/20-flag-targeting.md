# 20 — Feature flag targeting and history

Surface: `/admin/flags` (`app/routes/_site/admin/flags.tsx`), the flag API
(`lib/admin/api/admin.flags.server.ts`) and the evaluator (`lib/flags/`).
Wave 6. Namespace `flag-targeting`.

## User story

As a site admin shipping something behind a flag, I want to turn it on for
named members (the testers, myself) before any percentage, keep it off for
named members who hit a problem, check how the flag resolves for one member
and why, and see who changed the flag and when — so that a rollout can start
with people who agreed to try it and be explained when someone asks "why do I
see this?".

## Requirements elicitation

- **What exists (verified):** `FeatureFlag { key, enabled, rolloutPercent,
  description, updatedBy }` (`prisma/schema/developer.prisma`). The
  evaluator (`lib/flags/evaluate.ts`) is enabled → percentage bucket of
  `(key, userId)`, anonymous callers only at 100%; `lib/flags/flags.server.ts`
  caches the table for 15 s per process (`load()` selects `key`, `enabled`,
  `rolloutPercent`) and `invalidateFlags()` clears it locally. The admin API
  upserts and deletes flags and logs `flag.upsert` / `flag.delete` with
  `targetType: 'feature_flag'` (`logAdminAction`), but the admin page shows no
  history, and **there is no per-member targeting**: the only way to let one
  tester see a flag is a percentage that also includes strangers.
- **Decisions:** two lists per flag, at most 200 ids each: `allowUserIds`
  (always on while the flag is enabled) and `denyUserIds` (always off).
  Evaluation order: not enabled → off; denied → off; allowed → on;
  anonymous → on only at 100%; otherwise the bucket. A disabled flag is off
  for everyone, allow list included (the kill switch stays a kill switch).
  Lists hold user ids, added by handle in the UI, and **never leave the
  server**: `evaluateAllFlags` returns booleans only, and the evaluator types
  separate the stored record from what a client sees. History reads the
  admin audit log; list changes are logged with the handles added and
  removed.

## Functional requirements

1. FR-1 Each flag row on `/admin/flags` opens a "Targeting" panel: "Always on
   for" and "Always off for", each a list of members (avatar, name, handle,
   Remove) with an "Add by handle" field using the existing user search.
2. FR-2 "Check a member": enter a handle, see the result and the reason
   ("On: in the allow list", "Off: flag disabled", "On: bucket 37 < 50%").
3. FR-3 "History": the flag's audit entries newest first (who, what, when),
   20 per page.
4. FR-4 Changes apply in this process immediately and in others within the
   existing 15 s cache TTL, as today; the panel says so.
5. FR-5 Deleting a flag deletes its lists with it (same row).

## Non-functional requirements

- **Security:** every endpoint `auth: 'admin'`; zod: handles resolved to ids
  server-side, at most 200 per list, a member cannot be in both lists (adding
  to one removes from the other); rate limit `write`. The client bundle never
  receives the lists (a test asserts the client-facing shape has no list
  fields).
- **Correctness:** `evaluateFlag` stays pure and client-safe; the cache loads
  the two list columns server-side only; an admin edit calls
  `invalidateFlags()` as today.
- **Privacy:** erasure (anchor `s04-20`) removes the member's id from every
  flag's lists with one `$executeRaw` `UPDATE "feature_flag" SET
  "allowUserIds" = array_remove("allowUserIds", $1), "denyUserIds" =
  array_remove("denyUserIds", $1)` — real table and quoted column names,
  asserted in a test, smoke-tested at integration.
- **Performance:** list membership is a `Set` built once per cache load.
- **Accessibility:** lists are lists with labelled Remove buttons; the check
  result is text in a polite live region.
- **i18n:** strings in `flag-targeting`.
- **Steel:** the panel is rows on rules inside the existing admin layout; the
  reason is `t-meta`.

## Data model and API

- `FeatureFlag` gains `allowUserIds String[] @default([])` and `denyUserIds
  String[] @default([])`. Migration `20261124060200_s04_flag_targeting`.
- `lib/flags/evaluate.ts`: `evaluateFlag` takes an optional targeting part
  and returns the boolean; a new `explainFlag` returns `{ on, reason }` for
  the check tool; the cache in `flags.server.ts` loads the lists.
- `lib/flags/targeting.ts` (pure: list edits, the both-lists rule),
  `targeting-schema.ts`, `targeting.contract.ts`, `targeting.server.ts`.
- Modules `lib/admin/api/admin.flags.$key.targeting.server.ts` (`GET`, `PUT`
  lists), `admin.flags.$key.check.server.ts` (`GET ?handle=`),
  `admin.flags.$key.history.server.ts` (`GET ?cursor=`). Check the route
  table rule for a `$key` param beside the existing static `/api/admin/flags`.
- `components/admin/FlagTargeting.tsx` used by `admin/flags.tsx`.

## Testing requirements

- Main suite `lib/flags/__tests__/flag-targeting.test.ts`: evaluation order
  for every case; disabled beats allow; the client shape has no lists; a
  non-admin gets 403; the erasure SQL names the real table and columns.
- Product suite `lib/flags/__tests__/targeting.product.test.ts`: list edits,
  the both-lists rule, `explainFlag` reasons.
- The existing flag tests (`lib/flags/__tests__/`) stay green.

## Acceptance criteria

- [ ] A flag at 0% with one member in "Always on" is on for that member only.
- [ ] "Check a member" explains the result.
- [ ] The history shows the list changes with handles.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Targeting by role, community or country; scheduled flag changes; flag
dependencies.
