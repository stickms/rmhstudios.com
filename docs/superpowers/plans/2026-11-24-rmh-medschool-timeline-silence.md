# RMH Med Schools: personal timeline and silence check (roadmap item 4)

## Scope

On the tracker page (`/rmh-medschool/tracker`), no new route and no new endpoint:

1. **Timeline.** A section under the schools list: the member's own milestones for the selected cycle across every
   school, oldest first, as rows on rules. Each row shows the date, the milestone and school, and the wait since the
   step before it at that school ("Interview invite · Duke · 34 days after Application complete"). Built on the client
   from the `TrackerDto` the page already holds, by `engine/timeline.ts` (`buildTimeline`).
2. **Silence check.** Under each application that is complete with no invite and no closing decision, a line such as "No
   reply yet: 6 weeks since complete. Half of the invites tracked for this school came by week 4, and most by week 9." A
   school with no shared curve says "Not enough shared data for this school yet." and nothing else is compared.

## Decisions

- **Waits (`MEASURED_FROM`).** submitted to complete; complete to secondary received; secondary received to secondary
  submitted; complete to interview invite; a decision (waitlist, rejection, acceptance, hold) from the invite, else from
  complete. A step dated before its anchor has no wait. Withdrawn has none.
- **Quantile definition (`typicalWait`, `engine/stats/km.ts`).** With `F(w) = 1 - S(w)` the stored Kaplan-Meier share
  invited by week `w`, and `maxDay` the curve's last week with at least 10 members at risk: `halfWeek` is the first week
  where `F` reaches 50% of `F(maxDay)`, `mostWeek` the first where it reaches 80%. Steps only exist at multiples of 7,
  so both are whole weeks. Nothing past `maxDay` is read. This is a statement about invites that arrive inside the
  observed range: members never invited, or invited later, are censored in the curve and are not in the share. Null when
  no step lies in range (no guess). The wording says "invites tracked for this school", never "applicants".
- **Where it is computed.** The curve is never sent to the client. `getChances` derives `typical` (`halfWeek`,
  `mostWeek`, `lastWeek`, `basis`) from the one `MedWaitCurve` row it already reads, and `waitingWeeks` (whole weeks
  since the caller's own complete date, with the same `today` as the estimate). Both are added to `ChanceDto`; they
  apply to `estimate`, `beyond` and (`waitingWeeks` only) `thin`. The position (before half, before most, after most,
  past the curve) is decided on the client (`silenceOf`).
- **Q&A.** `mine` carries the same `ChanceDto`, so it gains the two fields; the model still never sees them.

## Standing constraints touched

- **Anonymization / R13.** No new aggregate and no new stored data. The response gains two numbers derived from a curve
  that already needs 20 distinct sharing members, weekly bins and at least 10 at risk; `basis` is floored to 10 and at
  least 20 as before. The caller's own dates are the only dates on the wire, and the anonymity wording is unchanged.
- **Design.** Steel: rows on rules, `t-*` classes, tokens, no box, no motion. Presentational components
  (`ui/tracker/Timeline.tsx`, `SilenceLine.tsx`) so item 11 can restyle them.
- **i18n.** `medschools` namespace, defaults on every string, plural keys for weeks and days.

## What the tests pin

- `engine/timeline.test.ts`: ordering, waits from the right anchor, no wait for a missing or later anchor, the silence
  position at the boundaries (half, most, last week, past it), thin data, inapplicable statuses.
- `engine/stats/km.test.ts` (`typicalWait`): the two quantiles, truncation at `maxDay` with a censored tail, null on
  thin ranges, ordering.
- `api/chances.server.test.ts`: `waitingWeeks` and `typical` for an estimate, thin and invited rows, and the pinned key
  set with no other member's date.
- `ui/tracker/tracker-page.test.tsx`: the timeline rows and waits, the silence wording, thin data, past-range note, no
  check on invited rows, and the page whole while chances load.
