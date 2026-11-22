# 16 — Brackets you can read as a list

Surface: the tournament page (`/tournaments/$id`, site tier),
`components/tournaments/BracketView.tsx`. Wave 5. Namespace `bracket-list`.

## User story

As a player on a phone, or a player using a screen reader, I want to read a
bracket round by round as a list — who plays whom, the score, what is next
for me — and act on my own match without scrolling a wide tree sideways, so
that following a tournament works on the devices people actually carry.

## Requirements elicitation

- **What exists (verified):**
  - `BracketView.tsx` draws columns of match cards in a horizontally
    scrolling `role="region"` (single elimination) and three such regions for
    double elimination (Winners, Losers, Final, namespace
    `double-elimination`); Swiss standings are separate
    (`components/competitive/SwissStandings.tsx`). Match controls live in the
    cards (`MatchResultControls.tsx`, `MatchSchedule.tsx`,
    `AwardMatchDialog.tsx`, `CheckInPanel.tsx`).
  - Sprint 06's browser pass found "at 390 px a bracket match card's second
    winner button sits partly off-screen inside the bracket's horizontal
    scroll area". Sprint 07's review **fixed that overflow** (commit
    `467084b90`: columns are a fixed `w-56 shrink-0`, the winner buttons
    `flex-1 min-w-0 truncate`). What remains at 390 px is real but different:
    a 224 px column shows one round at a time, so a 16-player bracket is four
    sideways scrolls to read, and the truncated winner buttons cut long
    handles ("Report Ada Lov…"), so on a phone the member can no longer read
    which name a button reports.
  - A tree is read cell by cell by a screen reader with no sense of rounds;
    there is no list alternative (`grep -rln "list view" components/tournaments`
    finds nothing).
- **Decisions:**
  - **Two views**, Bracket and Rounds, switched with `components/ui/tabs.tsx`
    (a segmented control), defaulting to **Rounds below 640 px** and Bracket
    above; the choice is remembered per viewer in `localStorage`
    (`rmh.bracket.view`, with a `lib/device-data/registry.ts` line, try/catch)
    and in the URL `?view=` for sharing.
  - **Rounds view:** one section per round (heading "Round 2 · Quarterfinals",
    using the same round labels as the tree, including the double-elimination
    section titles), each match a row on a rule: the two players (seed,
    handle, check-in mark), the score or "Not played", status words (Ready,
    Live, Waiting for result, Disputed, Done), the agreed time or deadline
    (sprint 07 06) in the reader's locale, and the same controls the card
    offers, laid out to wrap, never overflow. "Your matches" — the viewer's
    own matches — come first in a section of their own when the viewer is an
    entrant.
  - **The tree** stays as it is (sprint 07 fixed its overflow); the only
    change is that each truncated winner button carries the full handle in
    its accessible name ("Report Ada Lovelace won") so the truncation never
    hides it from a screen reader. The Rounds view is where the names are
    read in full: its buttons wrap below the names instead of truncating.
  - **First paint without a stored choice** (server render, no `?view=`): the
    server cannot know the width, so both panels render and a CSS rule
    (`@media (min-width: 640px)`) shows Bracket or Rounds; the tab strip's
    selected tab is set from one `matchMedia` read at mount (no listener).
    With `?view=` or a stored choice only that panel renders. No layout
    flash, no hydration mismatch, and the page is complete without script.
  - Both views render from the same derived data (`lib/tournaments/bracket.ts`
    already computes rounds; a pure `roundsView(…)` adds the ordering and the
    "your matches" split), so they never disagree.
  - Screen readers get headings per round and a list per round; each row's
    accessible name is "Round 2, match 3: Ada against Bo, Ada won 2–1".

## Functional requirements

1. FR-1 The view switch with the default, the remembered choice and `?view=`.
2. FR-2 The Rounds view for single and double elimination (Swiss keeps its
   standings, gaining nothing).
3. FR-3 "Your matches" first for entrants.
4. FR-4 Full handles in the tree's winner-button names; the no-choice first
   paint above.

## Non-functional requirements

- **Accessibility:** headings and lists, controls with names that include
  the match ("Report result for round 2, match 3"); the switch is a labelled
  tab list.
- **Performance:** no extra request; derived from the page's existing data.
- **Steel:** rows on rules (R3), `t-heading` per round, `t-meta` for times and
  seeds, one ink primary per view (the viewer's own "Report result" when it
  exists).
- **i18n:** `bracket-list`; existing `double-elimination` keys reused for the
  section titles.

## Data model and API

- No schema or API change.
- New `lib/tournaments/rounds-view.ts` (pure), `components/tournaments/RoundsView.tsx`,
  `BracketViewSwitch.tsx`.
- Edits: `BracketView.tsx` (full handles in the winner buttons' accessible names; the switch), the page
  `app/routes/_site/tournaments.$id.tsx` (search param), the device-data
  registry.

## Testing requirements

- Product suite `lib/tournaments/__tests__/rounds-view.product.test.ts`:
  order, labels for single and double elimination, "your matches" split, byes.
- Component test `components/tournaments/__tests__/RoundsView.test.tsx`:
  headings, accessible names, controls present for the entrant only.
- Existing: the bracket and match-results tests, `design-consistency`
  (no hand-rolled tab strip), device-data registry test.

## Acceptance criteria

- [ ] At 390 px the page opens in Rounds view with the viewer's own match
      first, and every control is on screen.
- [ ] Switching to Bracket and reloading keeps Bracket; a `?view=rounds` link
      opens Rounds.
- [ ] A screen reader reads each round as a heading and each match as one
      sentence.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Swiss pairings view changes, printing, live updates beyond the page's
existing refresh, bracket images.
