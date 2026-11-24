# RMH Med Schools: rolling-admissions guidance (roadmap item 5)

## Scope

"Where applying early matters": for a member's own list or tracker cycle, what each school's own admissions page says
about rolling decisions, one row per school and program, with the page's sentence quoted verbatim and a link to the page
with the date it was checked. The data already exists (`MedSchoolAdmissionsPolicy`, one row per school x program, a
curated import of each school's own page); nothing is scraped or stored here.

## Where it lives

A native disclosure under a list (`ui/lists/ListSection.tsx`) and under the tracker's schools
(`ui/tracker/TrackerPage.tsx`), next to "Essay overlap" and opened the same way (the query is enabled only when it is
open). Both sources go through one new owner-only endpoint, because the secondaries read is per school and public, and
the member's schools are private.

- `GET /api/medschools/me/rolling?source=list&list=<id>` or `?source=tracker`. Contract `getMedRollingGuidanceApi`,
  bound with `implement()`, registered with `apiRoute`, `READ_LIMIT`, no `cache`. Query schema is `overlapQuery`'s.
  Another member's list id is a 404, the same body as an unknown one.
- `api/rolling-guidance.server.ts` reads the caller's own list items (or current-cycle applications with their
  milestones), the active schools, and the public policy rows for those schools. `engine/rolling.ts` (pure) orders.

## Decisions

- **Program matching.** A list item's program (`ANY` | `REG` | `PHD`) or a tracker application's (`REG` | `PHD`) picks
  the policy: `PHD` reads only the `PHD` row, `REG` and `ANY` read only the `REG` row, the same mapping as the
  secondaries overlap. A missing row for the program is "the school's page does not say" and is never filled from the
  other program (an MD-PhD item with only a REG fact says the MD-PhD page did not say). The same school twice (MD and
  MD-PhD) is two rows.
- **Order.** Rolling first, then set dates, then unknown. Inside each: a tracker school with no milestone at all (not
  yet submitted) before one with any milestone (a later step implies the application went in); ties and lists keep the
  member's own order (list position, tracker creation order), which the endpoint reads in that order and the sort keeps
  (stable).
- **Wording.** Always "the school says". Rolling: "Rolling: the school says offers are made on a rolling basis."; set
  dates: "Set dates: the school says decisions are made on set dates."; none: "The school's page does not say." (the
  MD-PhD variant names the program). The quote follows as the school's words, then "Source: the school's page, checked
  <date>" with the link underlined. One neutral sentence of context at the top: "At a school with rolling admissions,
  seats can fill as the cycle goes on." No instruction, no ranking by urgency, no exclamation marks.
- **Response.** `{ cycleYear, source, entries[], schoolCount }`; an entry is
  `{ slug, schoolName, program, kind ('rolling' | 'set-dates' | 'unknown'), evidence, url, checkedOn, submitted (boolean for the tracker, null for a list) }`.
  No user id, list name or id, note, item id or position.

## Standing constraints touched

- **Anonymization.** Reads the caller's own rows and public institutional text only; no aggregate, no new stored data,
  nothing shared.
- **Politeness.** No fetch: the school's page is a link, never read here (spec section 7).
- **Design.** Steel: rows on rules, `t-*`, tokens, underlined links in running text, no box, no motion. Presentational
  (`ui/rolling/RollingView.tsx`, `RollingSection.tsx`) so item 11 can restyle.
- **i18n.** `medschools` namespace, defaults on every string.

## What the tests pin

- `engine/rolling.test.ts`: order across kinds, tracker not-yet-submitted first, stable order otherwise, PHD never
  borrows REG and ANY reads REG, a school twice is two rows.
- `api/rolling-guidance.server.test.ts`: list and tracker sources, owner-only (another member's list is `not-found`),
  inactive schools dropped, pinned key sets, no private field on the wire, one policy query.
- `ui/rolling/rolling-view.test.tsx`: wording, quote and dated link, order, closed disclosure on list and tracker.
- Integration (`testing/integration/medschools-private.test.ts`): 401 signed out, never publicly cached, key set, 404
  for another member's list, 400 on a bad source. No existing pinned key list changes (a new endpoint).
