# 17 — RMHLadder offer comparison

Surface: `/rmhladder/offers` (new tab in the RMHLadder shell) and the pipeline
card of an application at Offer (`components/rmhladder/PipelineLadder.tsx`).
Wave 1. Namespace `ladder-offers`.

## User story

As a job seeker using RMHLadder who has one or more offers, I want to record
each offer's pay, bonus, equity, sign-on, location, remote policy, time off and
deadline, and compare them side by side with a first-year and a yearly total —
so that I can decide on the numbers and not miss a deadline.

## Requirements elicitation

- **What exists (verified):** `LadderApplication` tracks status
  (`not_applied` … `offer`, `withdrawn`), dates, notes, `followUpDate` and
  `outcome` (`prisma/schema/rmhladder.prisma`); the pipeline page
  (`app/routes/_site/rmhladder/pipeline.tsx`, `PipelineLadder.tsx`) moves
  applications through stages; `LadderJob` carries the posting's pay range
  (`lib/rmhladder/pay.ts`, `PayBadge.tsx`). **An offer itself — the
  compensation actually offered — has nowhere to live** (no offer model, no
  comparison: no `offerCompar*`, `compareOffers` or salary comparison code
  anywhere), so members keep it in notes or a spreadsheet.
- **Decisions:** one `LadderOffer` per application (an application reaches
  Offer once; a revised offer is an edit, with the previous numbers kept in a
  small `revisions` JSON array so "they raised it from …" is visible).
  Amounts are stored in minor units with an ISO currency; comparison converts
  nothing (offers in different currencies are compared within each currency
  and the page says so — no exchange-rate service). Totals: first year =
  base + target bonus + sign-on + equity per year; yearly (after year one) =
  base + bonus + equity per year. Equity is entered as a total grant value and
  a vesting length in years (equity per year = grant ÷ years), with a free
  text note for cliffs and refreshers. Deadline reminders reuse the existing
  follow-up mechanism (`followUpDate` and the RMHLadder calendar/alerts
  path) rather than a new job: `followUpDate` feeds the RMHLadder alerts
  dispatch (`lib/rmhladder/alerts/dispatch.server.ts`) and the calendar feed
  (`rmhladder.calendar.server.ts`).

## Functional requirements

1. FR-1 Moving an application to Offer opens "Record the offer" (also
   reachable from the card later): base salary, pay period (year, month,
   hour; hourly asks for hours per week), currency, target bonus (amount or
   % of base), sign-on, equity grant value and vesting years, equity note,
   location, remote policy (on-site, hybrid, remote), paid time off days,
   start date, deadline, notes.
2. FR-2 `/rmhladder/offers` lists every offer as a column (up to 6 side by
   side on wide screens; stacked on phones) with each field as a row and the
   computed first-year and yearly totals; the highest total in each currency
   is marked "Highest" in text.
3. FR-3 Editing an offer that changes any amount stores the previous amounts in
   `revisions` with the date; the offer shows "Revised on …, base was …".
4. FR-4 Setting a deadline sets the application's `followUpDate` to the day
   before (unless the member set an earlier one), so the existing reminders
   fire.
5. FR-5 Decide: "Accept" sets the application's outcome and status as the
   pipeline does today and offers to withdraw the other open applications
   (checkbox list, nothing withdrawn without a tick); "Decline" sets the
   offer's state to declined.
6. FR-6 The posting's advertised pay range is shown under the base salary for
   comparison when the job has one.
7. FR-7 Export the comparison as CSV.

## Non-functional requirements

- **Security:** owner-only through the application's `userId`; amounts are
  non-negative integers bounded to 10^12 minor units; currency from the
  ISO 4217 list in `Intl.supportedValuesOf('currency')` (validated server-side
  against a static list).
- **Privacy:** offers are personal; deleted with the account
  (`anonymizeAccount` already deletes applications — add offers before them),
  included in RMHLadder's own export
  (`lib/rmhladder/api/rmhladder.export.server.ts`) and in the account export
  (`exportLadderOffers`, wired by integration).
- **Performance:** at most 50 offers per member; the page reads them with their
  applications and jobs in one query.
- **Accessibility:** the comparison is a real table with row and column
  headers (offer company as column header); money through
  `Intl.NumberFormat` with the currency; "Highest" is text, not colour.
- **i18n:** strings in `ladder-offers`; numbers and currencies localised.
- **Steel (site tier):** RMHLadder is under `_site`, so tokens, `t-*` type,
  rows on rules; the table has 1px rules, no zebra fills; Save is the one
  primary in the form.

## Data model and API

- New model `LadderOffer { id String @id @default(cuid()), userId,
  applicationId String @unique, currency String @db.VarChar(3), basePay
  BigInt, payPeriod String @db.VarChar(6), hoursPerWeek Int?, bonusAmount
  BigInt?, bonusPercent Int?, signOn BigInt?, equityGrant BigInt?,
  equityYears Int?, equityNote String? @db.VarChar(300), location String?
  @db.VarChar(120), remote String? @db.VarChar(8), ptoDays Int?, startDate
  DateTime?, deadline DateTime?, notes String? @db.VarChar(2000), state
  String @default("open") @db.VarChar(10), revisions Json @default("[]"),
  createdAt, updatedAt, @@index([userId]), @@map("ladder_offer") }` with
  cascades to the user and the application.
- Migration `20261123010200_s03_ladder_offers`.
- `lib/rmhladder/offers.ts` (pure: annualise, totals, highest per currency,
  revision diff, CSV), `lib/rmhladder/offers.server.ts`,
  `offers-schema.ts`, `offers.contract.ts`.
- Modules `lib/rmhladder/api/rmhladder.offers.server.ts` (GET list, POST),
  `rmhladder.offers.$id.server.ts` (PATCH, DELETE),
  `rmhladder.offers.$id.decide.server.ts` (POST accept/decline).
- Route `app/routes/_site/rmhladder/offers.tsx`; a tab in
  `components/rmhladder/RmhLadderShell.tsx`; the record dialog from
  `PipelineLadder.tsx`. `EXCLUDED_ROUTES` (personal page) in `lib/sitemap.ts`
  next to the other RMHLadder entries.

## Testing requirements

- Main suite `lib/rmhladder/__tests__/offers.test.ts`: another member's
  application or offer is 404; accept withdraws only the ticked applications;
  a revision is stored when an amount changes and not when only notes change;
  deadline sets `followUpDate` correctly.
- Main suite `lib/account/__tests__/ladder-offers-erasure.test.ts`.
- Product suite `lib/rmhladder/__tests__/offers.product.test.ts`: hourly and
  monthly annualisation, bonus percent, equity per year, highest per currency,
  CSV escaping.

## Acceptance criteria

- [ ] Two offers in the same currency compare side by side with first-year
      and yearly totals.
- [ ] Revising an offer shows the previous base.
- [ ] A deadline produces the usual follow-up reminder the day before.
- [ ] Accepting offers to withdraw the others and withdraws only those ticked.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Currency conversion, tax estimates, cost-of-living adjustment, negotiating
advice (the AI prep sheet exists).
