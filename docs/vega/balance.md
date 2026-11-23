# Project Vega: balance

Every number lives in `features/vega/engine/data.ts`. The claims below are asserted by the seeded simulation
`features/vega/engine/__tests__/balance.test.ts` (`pnpm exec vitest run features/vega`), which prints the table. Change
a number, run it, and update this page.

## How the simulation plays

Three scripted players (`features/vega/engine/__tests__/strategies.ts`) play every map with six seeds. They act only in
the build phase, never call a wave early, and place each instrument on the free bench that covers the most corridor,
which is what a careful person does.

- **balanced**: an opening of Synapse, Synapse, Cautery, Suppressor, Centrifuge, Biobank, Defibrillator, Lobotomizer,
  Echo, a revealer per lane before the cloaked Paranoia arrives (wave 9), then upgrades and a rotation of instruments.
- **greedy**: the same, but every other build phase pays the biobanks first (up to four banks, each to tier III).
- **spam**: Synapses only, upgraded as money allows.

## Result (waves cleared, six seeds)

| Map              | balanced (mean, min-max) | greedy       | spam         |
| ---------------- | ------------------------ | ------------ | ------------ |
| Intake Ward      | 35.3 (27-40)             | 19.8 (14-40) | 15.7 (13-18) |
| Specimen Vault   | 30.5 (26-35)             | 22.0 (18-31) | 15.7 (13-18) |
| Surgical Theatre | 37.0 (35-39)             | 35.7 (16-42) | 15.2 (13-18) |

Asserted: on every map balanced > greedy > spam by mean; spam's mean is in 12-20; balanced's mean is at least 24 and
below 40 (containment). So the median player reaches the mid-to-late thirties, containment takes better play than a
script (early calls, targeting, placement around the Surgeon), and a one-instrument board stalls in the teens: it cannot
see the cloaked Paranoia (wave 9 on) and cannot crack the armoured Depression and the wave-15 Specimen.

Greedy is a gamble, not a free win: it either collapses in the teens when the banks have starved the defence of the
Paranoia/Specimen waves (most seeds) or survives that crunch and carries (two Theatre seeds beat balanced). The mean gap
on the Theatre is the smallest (1.3 waves); if a change narrows it further, cut the Biobank's income first.

## The levers and why they are set where they are

| Lever               | Value                                                                                               | Why                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Specimen HP by wave | `(1 + 0.1n) * 1.075^n`, n = wave - 1; x1.045 per wave after 40                                      | Exponential, so late money cannot outscale it (a quadratic let the scripted player reach wave 55+ with a full board)          |
| Bounty by wave      | `1 + 0.005n`                                                                                        | Nearly flat: income grows with the number of specimens, not their HP, so towers must be placed well rather than simply bought |
| Threat budget       | `8 + 3.1 * wave` (boss waves 55%)                                                                   | Count grows linearly; the mix leans on newly catalogued specimens                                                             |
| Bosses              | Patient 700, Surgeon 850, Specimen 1000 base HP; leak 8-9                                           | At 1700+ HP the wave-5 Patient ended every run on the Vault; a boss leak should hurt, not end the run alone                   |
| Dread heals         | 8% every 2 s, at most one dose per interval per specimen                                            | Stacked heals from clumped Dreads made them unkillable (every seed died to them)                                              |
| Maps                | Intake HP x1, Vault x0.7 (path twice as long but its bends spread coverage), Theatre x1 (two lanes) | Each map lands the balanced player in the same band                                                                           |
| Score               | 40 x wave x map (1 / 1.25 / 1.5) x 1.2 clean x 1.25 early; 250 per integrity point at containment   | Waves cleared times multipliers; the theoretical maximum (all perfect, all early, Theatre, to wave 100) is 462,000            |

## Scoring ceilings

`catalog.ts` sets `maxScore` 470,000 (`scoreCeiling()` = 462,000), `maxProgress` 100 (the wave cap), and
`maxScorePerSecond` 400: the fastest legal run, every wave called the moment the previous finished spawning at 2x speed,
scores at most 290 per second of wall time (the test computes it from the quickest spawn mix of 50 seeds per wave). The
score route also refuses any score above `maxScoreThrough(waves cleared, map)`.
