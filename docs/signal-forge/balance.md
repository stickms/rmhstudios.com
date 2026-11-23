# Signal Forge balance (v2 rework, 2026-11-23)

Every tunable number lives in `features/signal-forge/engine/balance.ts`; card, enemy, relic and event numbers in
`engine/data/`. The claims below are asserted by `engine/__tests__/balance.test.ts` (seeded, 120 runs per band), so a
change that breaks one fails the suite. Update this table when you retune.

## The rhythm layer, in numbers

| Thing | Value | Why |
|---|---|---|
| On-phrase multiplier | Perfect x1.5, Good x1.25, Late x1, Steady x1.25 | Steady equals Good: the accessible mode is never worse than average timing |
| Heat per on-phrase card | Perfect 2, else 1 | Timing feeds the Burst as well as the hit |
| Beat windows (timed) | Perfect +/-85 ms, Good +/-170 ms; 80/90/100 BPM by act | Generous at 80 BPM (750 ms beat); relics widen them |
| Phrase length | 3, 3, 4 by act | Act 3 asks for longer lines |
| Forge Burst | 5 + 2 per Heat to every enemy, spends Heat | The payoff for finishing a phrase; AoE so it answers swarms |
| Vent | 3 Block per Heat, once a turn, spends Heat | The decision: bank Heat for a Burst or survive now |
| Static | +1 per off-phrase card; overload at 4 adds a Glitch | Playing off the phrase is allowed, not free |

## Card-power budget

Power prices a card's effects in damage points (1 energy is about 6; draw 4; Weak/Vulnerable 2.5 a stack; Bleed 1.5
a stack; x1.6 for AoE; a wildcard waveform +3; situational effects at a typical value: 4 Heat, 2 Static, 2 cards
played, 8 Block). Budget = cost x 6 + 4 + rarity bonus (common 0, uncommon 3, rare 7), x1.45 for Exhaust cards.
Every non-starter card must sit between 0.7 and 1.3 of its budget; starters are below the common budget so every
reward is an upgrade.

| Rarity | Cards | Mean power / budget | Lowest | Highest |
|---|---|---|---|---|
| Starter | 5 | 0.70 | 0.50 Sine Guard | 1.00 Noise Spark |
| Common | 38 | 0.96 | 0.80 Bandsaw | 1.25 Forge Tap |
| Uncommon | 41 | 0.91 | 0.72 Distortion | 1.15 Coolant Flood |
| Rare | 27 | 0.96 | 0.73 Anvil Heart | 1.27 Perfect Pitch |

(Anvil Heart's permanent Strength and Distortion's AoE Vulnerable are under-priced by the formula on purpose: their
value grows with fight length.)

## Simulated win rates (seeded, 120 runs each)

Agents play whole runs through the same `dispatch` the UI uses (`engine/sim.ts`). The random agent plays random legal
moves; the greedy agent values cards by power per energy, prefers on-phrase plays and finishing the phrase, vents when
the incoming hit needs it, routes for rest and elites by HP, and buys relics then removals.

| Agent | Ascension | Mode | Win rate | Avg floor (of 24) | Asserted band |
|---|---|---|---|---|---|
| Random | 0 | Steady | 0% | 5.7 | win <= 2%, floor < 9 |
| Greedy | 0 | Steady | 35.0% | 20.9 | 20% to 45% |
| Greedy | 5 | Steady | 9.2% | 18.5 | below A0 |
| Greedy | 10 | Steady | 3.3% | 14.8 | below A5, <= 15% |
| Greedy, 60% Perfect | 0 | Timed | 46.7% | 22.5 | >= Steady + 5 points |
| Greedy, 10% Perfect | 0 | Timed | 29.2% | 20.5 | within 10 points of Steady |

Reading: choices matter (random never wins), the ladder climbs (each Ascension band is harder), timing is a real
skill reward (good timing is worth about 12 points), and Steady mode is a fair way to play (it sits between sloppy
and skilled timing). The bot is deliberately simple; a human who reads intents and builds around a waveform should do
better than 35% at A0.

Where it was tuned: the first pass had the greedy agent at 2% (act 2 and 3 bosses and the Iron Choir elite were walls).
Boss HP came down (act 1: 150/140 to 132/124, act 2: 230/215 to 175/170, act 3: 330/350 to 220/235), their big hits by
about 20%, and the Null Sentinel lost one armor.

## Score

Node points x act (fight 100, elite 350, boss 1200) + capped skill (4 per Perfect up to 600, 20 per Burst up to 150) +
5000 for a win, all x (1 + 0.15 x Ascension). `maxPossibleScore()` = 80,750 (every node an elite, every cap, A10);
the catalog ceiling is 100,000 and the highest simulated score was 42,600 (A10). A full run is 24 floors
(`scoring.maxProgress`).
