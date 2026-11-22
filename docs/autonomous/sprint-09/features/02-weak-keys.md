# 02 — Your slow and missed keys in RMHType

Surface: `/rmhtype/progress`, the solo page (`/rmhtype/solo`) and the daily typer (`/rmhtype/daily`). Wave 1. Namespace
`weak-keys`. App tier (L8): RMHType keeps its own look.

## User story

As someone practising typing, I want to see which keys slow me down or trip me up across all my runs — not only the
lessons — and start a short test weighted toward them, so that practice goes where it is needed.

## Requirements elicitation

- **What exists (verified):**
  - `components/rmhtype/TypingStats.tsx` (312 lines: summary, heatmap, worst keys, "practice your worst keys" and
    "clear") and `components/rmhtype/KeyHeatmap.tsx` (343 lines: a heatmap painted in the semantic tokens so the
    colour-vision modes retint it) are imported by nothing (`docs/_generated/knip-report.txt`).
  - The server half is live: `lib/rmhtype/keystats.server.ts` (`recordKeyStats`, `getKeyStats`, `clearKeyStats`,
    increments only, no keystroke order stored — "an ordered keystroke store is a keylog"), the registered endpoints in
    `lib/rmhtype/api/rmhtype.keystats.server.ts` and `rmhtype.practice-test.server.ts`, contracts in
    `lib/rmhtype/keystats.contract.ts`, pure aggregation in `lib/rmhtype/keystats.ts` (`createKeyStatAccumulator`,
    `sanitizeAggregates`, `keyMetrics`, `MIN_ATTEMPTS_FOR_READING = 5`, `HEAT_TOKENS`).
  - Only lessons record (`components/rmhtype/lessons/LessonRunner.tsx:315`, from `typing-run.ts`'s `keyStats`). Solo
    (`RmhTypeSoloPage.tsx`, its own keydown handling) and the daily typer (`daily/DailyTyper.tsx`) never do, so the
    panel would be empty for anyone who does not take lessons.
  - `TypingStats.tsx` loads in a `useEffect` with `api()` (forbidden by `lib/__tests__/useeffect-fetch-ratchet.test.ts`)
    and uses the `c-rmhtype` namespace.
  - `RmhTypeKeyStat` is classified `erase` in the registry and is not in the data export.
- **Decisions:**
  - **Record from solo and daily runs.** On a finished run the client folds its keystrokes into a
    `createKeyStatAccumulator()` as the lessons do and sends one `recordKeyStats` call (fire-and-forget, a failure is
    silent); an abandoned run sends nothing; a custom or practice test records (it is still the member's typing) but
    stays off boards as today (`isLeaderboardEligible`). Multiplayer races are not recorded (out of scope: the socket
    hub owns those runs).
  - **A switch.** "Record key statistics" in RMHType's solo settings (on by default, stored on the device as the other
    solo settings are); off means no call is made from solo, daily or lessons. The panel says what is recorded: "Counts
    per key: how often you pressed it, how often it was wrong, and how long it took. The order of what you typed is
    never stored."
  - **Where it shows.** A "Keys" section on `/rmhtype/progress`, below the existing charts: `TypingStats` with its
    heatmap, rewritten to read through React Query (`useQuery` + `api(getRmhTypeKeyStatsApi, …)`), mutations for clear
    and the practice test; existing strings keep their `c-rmhtype` keys and every new string goes in `weak-keys`.
  - **Practice.** "Practise these keys" builds the weighted test (`/api/rmhtype/practice-test`) and opens it in the solo
    page as a custom test; the result is labelled "Practice, not on the boards".
  - **Export.** `exportRmhTypeKeyStats(userId)` (key, layout, attempts, errors, total ms) under the `s09-02` export
    anchor.

## Functional requirements

1. FR-1 Solo and daily runs fold keystrokes into the accumulator and record once per finished run, honouring the switch
   (lessons honour it too).
2. FR-2 The "Keys" section on the progress page with the heatmap, worst keys, layout picker, clear (through
   `useConfirm`) and the practice test.
3. FR-3 `TypingStats` and `KeyHeatmap` moved onto React Query; no `/api` fetch inside `useEffect`.
4. FR-4 The switch in solo settings, its device-data registry line.
5. FR-5 The export section.

## Non-functional requirements

- **Privacy:** nothing beyond the three counters per key is stored or sent; no keystroke order, no text. The switch is
  honoured before the request is built.
- **Performance:** the accumulator is updated in the existing key handler (no extra listener); one request per finished
  run.
- **Accessibility:** the heatmap's keys carry their numbers as accessible text (the component already labels them; keep
  it); the worst-keys list is the non-colour equivalent.
- **Design:** app tier; `KeyHeatmap`'s semantic-token palette stays (it is what the colour-vision modes retint).

## Data model and API

- No schema change. Edits: `components/rmhtype/RmhTypeSoloPage.tsx`, `components/rmhtype/daily/DailyTyper.tsx`,
  `components/rmhtype/lessons/LessonRunner.tsx` (the switch), `components/rmhtype/ProgressPage.tsx`,
  `components/rmhtype/TypingStats.tsx`, `components/rmhtype/KeyHeatmap.tsx`, the solo settings (beside sprint 08 11's
  "Race my best" switch, `components/rmhtype/GhostControls.tsx`), `lib/rmhtype/rmhtype.queries.ts`,
  `lib/rmhtype/keystats.server.ts` (`exportRmhTypeKeyStats`), `lib/account/export-sprint-09.server.ts` (anchor),
  `lib/device-data/registry.ts`.
- New `lib/rmhtype/record-keystats.ts` (pure: build the request body from an accumulator and the switch).

## Testing requirements

- Product suite `lib/rmhtype/__tests__/record-keystats.product.test.ts`: a finished run gives one body, an abandoned run
  none, the switch off gives none, aggregates are sanitised (`maxKeys`).
- Main suite `lib/rmhtype/__tests__/keystats-export.test.ts`: the export returns only the member's rows and the three
  counters.
- Main suite `components/rmhtype/__tests__/typing-stats.test.tsx` rendered with `react-dom/server`: the empty state, the
  list of worst keys as text.
- `lib/__tests__/useeffect-fetch-ratchet.test.ts` (the count does not rise),
  `components/settings/__tests__/device-registry.test.ts`, `lib/account/__tests__/export-sprint-09.test.ts` stay green.

## Acceptance criteria

- [ ] After three solo runs, `/rmhtype/progress` shows the member's slowest and most-missed keys and a heatmap.
- [ ] "Practise these keys" opens a weighted test in solo; its result is not on the boards.
- [ ] With "Record key statistics" off, a finished run makes no key-stats request.
- [ ] "Clear" empties the section after a confirmation.

## Out of scope

Bigram or sequence statistics (a keylog), multiplayer races, per-day key trends, showing another member's keys.
