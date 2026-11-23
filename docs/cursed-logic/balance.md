# Cursed Logic: balance

Every number is in `features/cursed-logic/engine/data.ts`. The claims below are asserted by
`features/cursed-logic/engine/__tests__/balance.test.ts`, a seeded simulation that drives the real run code
(`engine/run.ts`) with scripted players (`engine/sim.ts`). Same seeds, same numbers; if a number in `data.ts`
changes and the test fails, re-measure with the test and update this page.

Measured 2026-11-23 (160 runs per row, seeds 1000-1159, no pacts, minigames on at a 60% success rate).

## The players

- **reader**: what a strong human converges on. Knows each Protocol's habits and how far its tells can be trusted
  (Bayes over the Protocol's distribution, the tell's honesty and the glitch), and picks the stance and command with
  the best expected value for the round. An upper bound on skill, not a typical player.
- **believer**: the same, but takes every tell at face value.
- **striker** / **turtle**: always Strike / always Block. **random**: a random stance and command.

## Runs

| Player   | Runs cleared | Mean duels won (of 9) | Best score |
| -------- | ------------ | --------------------- | ---------- |
| reader   | 64%          | 7.3                   | 48,710     |
| believer | 51%          | 6.9                   | 49,965     |
| striker  | 3%           | 1.8                   | 46,280     |
| random   | 0%           | 0.4                   | 2,990      |
| turtle   | 0%           | 0.0                   | 0          |
| reader, all four pacts | 2% | 2.3                 | 98,865     |

Claims (asserted): the reader clears between 50% and 90% of runs; reader > believer > striker + 30 points; striker
under 15%; random clears none and averages under 1.5 duels; always-Block wins essentially nothing; all four pacts
are a real handicap; no simulated run reaches the score ceiling (138,364, under the catalog's 150,000).

Why these shapes: Protocols hit harder than you (3 against your 2), so racing them loses; Block blunts a Strike to 1
and leaves the striker Overextended, so mashing Strike loses; but a Block wastes a turn against a Prepare, so
turtling loses. Integrity carries across the nine duels (a 2-point patch between them, a 5-point Patch in the shop),
which is what makes reading well pay off over a run rather than in a single duel.

## Protocols (duel win rate / mean rounds, sector 3 bonuses, starting at 10 Integrity)

| Protocol    | Tells honest | reader      | believer    | random     |
| ----------- | ------------ | ----------- | ----------- | ---------- |
| WARDEN.exe  | 85%          | 97.5% / 6.4 | 98.1% / 6.5 | 5.0% / 10.0 |
| MIMIC.dll   | 75%          | 90.6% / 5.6 | 88.8% / 5.8 | 9.4% / 11.9 |
| BERSERK.sys | 80%          | 83.1% / 5.8 | 83.8% / 6.0 | 1.3% / 6.9 |
| LIAR.bat    | 15%          | 80.0% / 5.9 | 66.9% / 6.6 | 5.0% / 8.8 |
| LEECH.so    | 70%          | 86.3% / 6.4 | 90.0% / 6.9 | 0.0% / 8.2 |
| ORACLE.ko   | 60%          | 95.6% / 6.7 | 91.3% / 7.3 | 5.0% / 8.5 |
| NULL//ROOT  | 55%          | 45.0% / 9.5 | 36.9% / 9.7 | 0.0% / 7.0 |

Claims (asserted): trusting every tell costs at least 5 points against the Liar (13 measured) and at most 5 against
the Warden; NULL//ROOT is the hardest duel in the roster and still winnable (over 30%). The Liar's honesty is below
25% on purpose: at 25% a tell carries no information, below it the tell points away from the real move, so a
player who has learned the Liar reads it backwards.

## Stances (forced every round, duel win rate vs Berserk, Liar, Leech and Oracle in sector 3, 400 duels each)

| Stance   | Win  | Stance   | Win  | Stance   | Win  |
| -------- | ---- | -------- | ---- | -------- | ---- |
| Commit   | 82.2% | Counter | 81.4% | Resist  | 73.9% |
| Guard    | 75.0% | Recover | 78.3% | Reckless | 73.4% |
| Read     | 73.3% | Scan    | 81.4% | Surge   | 73.3% |
| Pressure | 79.1% | Harvest | 82.7% | Bastion | 72.7% |

Claims (asserted): all twelve within 12 points of each other (10.0 measured), each between 60% and 92%; and,
alternating any two of them (all 66 pairs, vs Liar, Leech and Oracle), every pair within 12 points of the pairs'
mean.

What changed to get there: the old game had 18 stances, six of them duplicates of another's effect (Break was
Pressure, Deflect was Guard, Endure was Resist, Bulk and Focus were weaker Counter and Harvest, Steady only mattered on
an overdraw); they were folded in. Then: Surge (heal on any hit) won 100% of forced duels, so it heals only on an
unprimed hit of 3 or more; Read + Surge (prepare safely, then a primed heal-hit) won 98% as a pair, which the
"unprimed" rule also closed; Resist became a trade (take 1 less, Strike 1 less); Commit +2, Reckless +3 (take +1),
Pressure 3 chip, Read and Scan each return 1 Charge.

## Score

Per duel won: 1,000 x sector, + 60 per Integrity left, + 400 x sector if flawless, + 75 per round under 10. Beating
NULL//ROOT: + 8,000. Times the pact multiplier (1 + 0.25 chaos + 0.5 glass + 0.2 edges + 0.3 silence, at most
2.25). The ceiling for a claimed number of duels (`maxScoreFor`) assumes every duel flawless, at the 23-Integrity
ceiling, in one round; the score route refuses a run whose score is above it for the duels and pacts it claims.
