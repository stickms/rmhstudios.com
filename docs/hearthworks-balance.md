# Hearthworks crime and police: balance targets and tuning

The crime route (hustling, guns, heat, the police) was built before it was balanced. This document is the
statement of what it is supposed to feel like, the measurements that say whether it does, and the constants that were
changed to get it there. The harness that produced every number below is in the repo and deterministic: the same
seeds give the same tables.

```bash
pnpm exec tsx scripts/hearthworks/balance.ts                    # everything, 24 seeds, the default 32-tile island
pnpm exec tsx scripts/hearthworks/balance.ts --seeds 8 --size 48
pnpm exec tsx scripts/hearthworks/balance.ts --only guns,fights,hustler,heat,gunman,perf,stuck,economy --out report.json
pnpm exec vitest run features/hearthworks/engine/world/__tests__/balance.test.ts   # the targets that are pinned as tests
```

The harness (`features/hearthworks/engine/world/__tests__/balance-sim.ts`) runs scripted players inside the real `stepWorld` against
the real police: a **farmer** (never breaks the law), **hustlers** (deal in batches, optionally run when hunted), a
**gunman** (buys or is given a gun, closes to its best range, fires at the nearest officer in sight, restocks), plus
fixed scenes: parked-dummy **duels** (shots and time to kill) and pitched **fights** (a squad of N hunts an armed
player). The player walks at the avatar's run speed (3 tiles/s) through the same nav module the police use (2 tiles/s).
Everything that is a number lives in a constant (`world/crime.ts`, `world/police.ts`, `content/weapons.ts`,
`content/items.ts`); nothing is inline.

## The design targets

Sources: the spec (`docs/superpowers/specs/2026-11-04-hearthworks-design.md` §3, §13: "choosing crime brings heat and
run-ins with the police that the player must fight with guns sourced from the CS:GO and HL2 channels") and the owner's
intent as given for this pass. IDs are used in the tests.

### Money: crime is a tempting, risky route

| ID  | Target                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Contraband pays at least 3x what the stall pays for the best legal dish. Legal goods hustled on the street never beat a customer's price by more than 10 % (no laundering).       |
| E2  | A careful dealer, early on, earns about 2-3x what a 7-plot farm does, with no police at all.                                                                                      |
| E3  | The first sale is safe. A deal of up to 3 units never makes the player wanted; 6 units does; there is no bulk discount, so dumping a whole stock calls the police.                |
| E4  | A dump is clearly worse than patience: a player who dumps and gets caught keeps well under two thirds of the take, and earns well under 0.7x per unit of what a careful one does. |
| E5  | Heat decays when the player lies low: from just wanted to calm in about 75 s; from full to nothing in about four minutes.                                                         |

### Police: a real threat that the player can see coming

| ID  | Target                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | The first response is **one Metrocop**, always, however hot the deal was; soldiers only come as reinforcements at heat 75+. It reaches the island within one look at the gates (at most 8 s). |
| P2  | There is time to react: a new arrival forms up for 2 s, and has to walk in from a far shore, so the first shot is never earlier than 2 s after landing (about 6 s after becoming wanted).     |
| P3  | An unarmed player is never shot, only arrested. Standing still is a certain arrest within about 15 s; running gives a real chance to get clean away, but not a guarantee.                     |
| P4  | Fines grow with heat: 25 % of the money carried at heat 40, 40 % at heat 100 (a knock-out costs 18 % and 30 %), never less than a floor and never more than you have.                         |
| P5  | Reinforcements arrive faster the hotter the player (8 s, 6 s, 5 s) and never more than four at once.                                                                                          |
| P6  | Nothing gets stuck: no hunter stands motionless for 20 s with nothing to do; a leaving officer with no route to his gate goes home within seconds.                                            |
| P7  | A tick with four officers hunting stays far inside the 50 ms budget (worst tick on a 96x96 map under a quarter of it).                                                                        |

### Guns: five roles with CS:GO-ish tradeoffs (six guns)

| Gun      | Role                                                             | Price | Rounds to kill a Metrocop (60 hp) | Rounds to kill a Combine (130 hp) |
| -------- | ---------------------------------------------------------------- | ----- | --------------------------------- | --------------------------------- |
| pistol   | cheap and accurate, the first-day buy; weak against groups       | 120   | 5-6                               | 10-13                             |
| smg      | close-range spray: huge rate of fire, wide spread, 8 tiles       | 380   | 9-12 inside 4 tiles, 20 at 8      | 19-27 inside 6 tiles              |
| revolver | slow, hard-hitting, accurate; reach 12                           | 450   | 2 inside 4 tiles, 3 beyond        | 5-6                               |
| shotgun  | point-blank killer, useless past 5.5 tiles                       | 500   | **1** at 2 tiles, 2 at 4          | 3-4 (inside 4 tiles only)         |
| rifle    | the all-rounder: best sustained damage, reach 14, expensive ammo | 1100  | 6-7 (9-10 at long range)          | 13-15                             |
| marksman | the late-game sink: one tap on a Metrocop at any range, reach 22 | 1800  | **1**, anywhere to 22 tiles       | 2 (3 past 15 tiles)               |

Plus: a first gun is affordable on day one (price at most half the starting money); the sniper costs more than four
times the starting money; rounds cost money, per round: pistol < rifle < sniper.

### Fights: a small squad can be beaten, a large one cannot

Squads of N, starting 14 tiles out, against an armed player who closes to his gun's best range and fires (the harness
aims perfectly, so these are an upper bound for a human).

| ID  | Target                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | One Metrocop (the first response): every gun wins, at least 90 % of the time. A pistol is hurt by it (median 60-99 hp left).                           |
| F2  | Two Metrocops: any real gun wins at least 90 %; a lone pistol can lose (20-90 %).                                                                      |
| F3  | Three Metrocops: only a rifle or a sniper wins. Four: a rifle is beaten more often than not (at most 70 % wins).                                       |
| F4  | Soldiers: a small gun cannot beat two (at most 10 %); a rifle can, and it is close (30-85 %); nothing wins three (at most 15 %) or four (at most 5 %). |
| F5  | A fight that goes on is lost: after a first deal, nobody but a sniper outlasts three minutes of escalating police (at most 20 % survive).              |

## Results

All tables: the default 32x32 island, 24 seeds, p50 (p10-p90) unless stated. "Before" is the tree at `origin/main`
measured by the same harness; "after" is this change. (`--size 48` is in the sensitivity section.)

### Money and heat

How much a deal heats you (heat points):

| Deal            | Before (cap 8 extras) | After |
| --------------- | --------------------- | ----- |
| 1 tonic         | 14                    | 9     |
| 3 tonics        | 18                    | 23    |
| 6 tonics        | 24                    | 44    |
| 20 tonics       | 30                    | 100   |
| 1 bread (legal) | 8                     | 6     |
| 9 breads        | 24                    | 38    |

Money per unit (street price = base x markup): before, markup 2.5x on everything (bread 40 sold on the street for 100,
2.5x the stall and 1.7x a customer; tonic 70 sold for 175). After, markup 1.6x (bread 64, below a customer's 60 + 10 %),
tonic 100 sold for 160 = 3.5x the best legal dish at the stall (stew 46) and 6.2x its ingredients (26).

Scenarios, 5 minutes (stock is tonics; "net" is cash change; confiscated stock is extra):

| Scenario (policy)                                  | Version | Wanted? / police                   | Arrested or downed   | Net cash               | Stock lost |
| -------------------------------------------------- | ------- | ---------------------------------- | -------------------- | ---------------------- | ---------- |
| Dump 20 at once, stand still                       | before  | never wanted (heat 30), 0 officers | 0 %                  | 3500 (100 %)           | 0          |
|                                                    | after   | wanted at once, 2.1 officers       | 100 % at 12 s        | 1835 (57 %)            | 0          |
| Dump 20, then run                                  | before  | never wanted                       | 0 %                  | 3500                   | 0          |
|                                                    | after   | 3.0 officers                       | 88 % (first at 26 s) | 1905 (p50)             | 0          |
| One deal of 6, stand still                         | before  | never wanted (heat 24)             | 0 %                  | 1050                   | 0          |
|                                                    | after   | 1 Metrocop                         | 100 % at 13 s        | 649 (68 % of 960)      | 0          |
| One deal of 6, then run                            | before  | never wanted                       | 0 %                  | 1050                   | 0          |
|                                                    | after   | 1 Metrocop                         | 54 % (first at 45 s) | 756                    | 0          |
| Binge: 4 at a time every 2 s from 40, stand        | before  | 4 officers in 10 s                 | 100 % at 14 s        | 4120                   | 840        |
|                                                    | after   | 2.3 officers                       | 100 % at 13 s        | 2568                   | 1200       |
| Binge, then run when hunted                        | before  | 2 officers                         | 67 %                 | 2930                   | 1400       |
|                                                    | after   | 1.9 officers                       | 63 %                 | 961 (p10-p90 834-3200) | 3200       |
| Careful: 3 at a time, deal only if heat stays < 36 | before  | (old formula: 5250, 0 police)      | 0 %                  | 5250                   | 0          |
|                                                    | after   | 0 officers                         | 0 %                  | 2880                   | 0          |
| Farmer (7 tomato plots + stall, no crime)          | -       | 0 officers                         | -                    | 253/min (176-253)      | -          |

The careful dealer's 2880 over five minutes is 576 a minute, 2.3x the farm and with no risk as long as the discipline
holds, whereas the dumper nets 92 per tonic against the careful dealer's 160. Before, the dump was the best strategy
and the police were unreachable by anything but a 4-tonic binge.

Heat decay (nobody about; the same rule applies when someone is):

| Start heat | To below wanted (before / after) | To calm, below 15 | To zero       |
| ---------- | -------------------------------- | ----------------- | ------------- |
| 45         | 12 s / 15 s                      | 62 s / 78 s       | 90 s / 113 s  |
| 70         | 62 s / 78 s                      | 112 s / 140 s     | 140 s / 175 s |
| 100        | 122 s / 153 s                    | 172 s / 215 s     | 200 s / 250 s |

### The police response

| Metric (deal of 6, stand still / deal of 6, run)       | Before          | After                                           |
| ------------------------------------------------------ | --------------- | ----------------------------------------------- |
| Heat reached                                           | never wanted    | 44                                              |
| Wanted -> first officer ashore                         | 1.9 s (binger)  | 3.5 s (1.4-7.5), at most 8 s                    |
| First officer -> formed up and within reach of his gun | 1.1 s (0-3.5)   | 2.5 s (2.0-4.3) / 7.2 s (5.1-12.3) when running |
| First kind of officer at heat 100                      | Combine soldier | Metrocop                                        |
| Officers when binging to heat 100                      | 4 inside 10 s   | 1, 2, 3 ... at 8 s, 6 s, 5 s apart              |

### Time to kill

Metrocop (60 hp), median seconds / shots:

| gun (price after) | 2 tiles     | 4        | 6        | 8        | 11       | 15 / 20 |
| ----------------- | ----------- | -------- | -------- | -------- | -------- | ------- |
| pistol 120        | 1.3 / 5     | 1.3 / 5  | 1.6 / 6  | 1.6 / 6  | out      | out     |
| revolver 450      | 0.8 / 2     | 0.8 / 2  | 1.4 / 3  | 1.4 / 3  | 1.4 / 3  | out     |
| smg 380           | 0.8 / 9     | 0.9 / 10 | 1.1 / 12 | 1.9 / 20 | out      | out     |
| shotgun 500       | **0.1 / 1** | 0.9 / 2  | out      | out      | out      | out     |
| rifle 1100        | 0.8 / 6     | 0.8 / 6  | 0.9 / 7  | 0.9 / 7  | 1.4 / 10 | out     |
| marksman 1800     | **0.1 / 1** | 0.1 / 1  | 0.1 / 1  | 0.1 / 1  | 0.1 / 1  | 0.1 / 1 |

Before: revolver 0.8 s everywhere to 8 tiles (as good as the rifle for half the price), SMG 5.8 s / 36 shots at 8 tiles,
shotgun 0.9 s / 2 at 2 tiles and 2.8 s / 4 at 4, sniper 1.3 s / 2 shots.

Combine soldier (130 hp; was 120), median seconds / shots at 4 tiles: pistol 3.0 / 11, revolver 2.9 / 5, smg 2.1 / 22,
shotgun 2.8 / 4, rifle 1.9 / 13, marksman 1.9 / 2 (3.6 / 3 from 15 tiles). Before: 2.8 / 10, 2.1 / 4, 2.4 / 24,
8.4 / 7, 1.6 / 11, 2.5 / 3.

### Fights (win rate / median health left)

| Squad (standing at 14 tiles)   | pistol     | revolver    | smg        | shotgun    | rifle       | marksman    |
| ------------------------------ | ---------- | ----------- | ---------- | ---------- | ----------- | ----------- |
| 1 Metrocop, before             | 100 % / 77 | 100 % / 85  | 100 % / 67 | 67 % / 26  | 100 % / 93  | 100 % / 100 |
| 1 Metrocop, **after**          | 100 % / 84 | 100 % / 100 | 100 % / 90 | 100 % / 70 | 100 % / 100 | 100 % / 100 |
| 2 Metrocops, before            | 46 % / 0   | 100 % / 53  | 8 % / 0    | 0 %        | 83 % / 78   | 100 % / 85  |
| 2 Metrocops, **after**         | 67 % / 28  | 100 % / 65  | 100 % / 62 | 96 % / 32  | 100 % / 92  | 100 % / 100 |
| 3 Metrocops, before            | 0 %        | 0 %         | 0 %        | 0 %        | 88 % / 52   | 4 %         |
| 3 Metrocops, **after**         | 0 %        | 0 %         | 0 %        | 0 %        | 100 % / 66  | 100 % / 85  |
| 4 Metrocops, before            | 0 %        | 0 %         | 0 %        | 0 %        | 75 % / 8    | 0 %         |
| 4 Metrocops, **after**         | 0 %        | 0 %         | 0 %        | 0 %        | 42 % / 0    | 100 % / 41  |
| 1 Combine, before              | 100 % / 40 | 100 % / 76  | 100 % / 27 | 46 %       | 100 % / 88  | 100 % / 88  |
| 1 Combine, **after**           | 100 % / 28 | 100 % / 76  | 100 % / 65 | 100 % / 47 | 100 % / 86  | 100 % / 77  |
| 2 Combine, before              | 0 %        | 8 %         | 0 %        | 0 %        | 96 % / 46   | 46 %        |
| 2 Combine, **after**           | 0 %        | 0 %         | 0 %        | 0 %        | 58 % / 4    | 38 %        |
| 3 or 4 Combine, before / after | 0 % / 0 %  | 0 % / 0 %   | 0 % / 0 %  | 0 % / 0 %  | 0 % / 0 %   | 0 % / 0 %   |

Fighting on from a first deal (heat 45 start, heat does what it does, 3 minute cap): knock-out comes at
16-22 s before for every gun and 36-41 s after (pistol 36, revolver 38, smg 38, shotgun 38, rifle 41); the sniper
alone survives 3 minutes 58 % of the time, killing about 24 officers.

### Guns, before and after

| Gun      | Change                                                                                                                    | Why                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| pistol   | ammo 15 -> 24                                                                                                             | A round now costs 2, not 1.25: a fight is not free.                                            |
| revolver | damage 38 -> 34                                                                                                           | It two-shot a Metrocop at 12 tiles for half the rifle's price; now 2 near, 3 far.              |
| smg      | damage 7 -> 8, spread 0.09 -> 0.07, falloff 0.6 -> 0.5, ammo 30 -> 45                                                     | It could not kill a Metrocop at 8 tiles (5.8 s); now it owns the first 6 tiles.                |
| shotgun  | pellet damage 7 -> 10, falloff 0.8 -> 0.55                                                                                | It never killed anything: now one blast at 2 tiles, two at 4. Still useless past 5.5.          |
| rifle    | damage 12 -> 11, price 900 -> 1100, ammo 60 -> 90                                                                         | It was the best gun at every range and every squad size. Still the best all-round, at a price. |
| marksman | damage 55 -> 70, fire interval 24 -> 36 ticks, reload 64 -> 70, spread 0.008 -> 0.012, price 1300 -> 1800, ammo 70 -> 150 | One tap on a Metrocop at any range (it needed 2), 1.8 s between shots, the late-game sink.     |
| Metrocop | damage x0.8 -> x0.85                                                                                                      |                                                                                                |
| Combine  | hp 120 -> 130, damage x0.65 -> x0.9, fire interval x4 -> x3.5                                                             | They were pushovers: a soldier shot like a Metrocop with more hp.                              |

### Performance

| Map   | Officers | Mean tick | Worst tick (before / after) |
| ----- | -------- | --------- | --------------------------- |
| 48x48 | 4        | 61 us     | 4.6 ms / 2.6 ms             |
| 96x96 | 4        | 201 us    | 15.0 ms / 11.5 ms           |

The worst tick is one route search (3500-tile cap); the search budget was 2 a tick, now 1 (four officers re-plan at
most every 10 ticks, so one is enough). The cost per officer is about 15 us on 48x48 and 50 us on 96x96. The budget is
50 ms.

### Island size

The default island is 32 tiles; the city layer may grow it. At 48x48 (24 seeds), a standing player has 6.3 s (5.0-7.8)
between the first officer landing and him being formed up within reach of his gun (2.5 s at 32); a runner is arrested
21 % of the time after a deal of 6, 63 % after a dump, 33 % when binging until the law shows up (54 %, 88 % and 63 %
at 32); a dump still nets about 58 % of its take; the careful dealer is never wanted. No stuck hunters at 32, 48 or 64
(216 runs, 687 officers). A bigger island makes the police arrive later and escape easier; none of the targets above
breaks, but if the city layer grows the island a lot the response may want a faster pace or a closer gate.

## What changed (constants and code)

| Where                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `world/crime.ts`      | `HUSTLE_MARKUP` 2.5 -> 1.6. Heat per deal is now `HUSTLE_HEAT_DEAL` (2) + per unit (`HUSTLE_HEAT_PER_UNIT` 4 legal, `..._CONTRABAND` 7) with no cap; the old "+2 per extra, up to 8" gave a 20-unit dump 30 heat. `HEAT_DECAY_TICKS` 40 -> 50. `HIT_HEAT` 3 -> 1, `KILL_HEAT` 30 -> 20 (a kill no longer jumps one rung and a half). Fines: arrest 15 % + 0.25 % per heat, knock-out 10 % + 0.2 % per heat, floor 30 (`arrestFine`, `downedFine`). Regen delay 100 -> 60, `REGEN_TICKS` 10 -> 8.                                                           |
| `world/police.ts`     | Reinforcement cadence by heat (`responseTicks`: 160 / 120 / 100 ticks; was one look every 60). The first officer is a Metrocop. Gates are the farthest quarter of the shore tiles from which the player can be reached (one flood fill, `reachesTarget`). Min gate distance 10 -> 18 (scaled down to 40 % of the map). New arrivals form up for 40 ticks (was 10). One route search per tick (was 2). One officer per look. Officers' bullets only find the target and other wanted players. A leaving officer with no route goes after 4 failed searches. |
| `world/ballistics.ts` | A sight line no longer squeezes through the corner where two walls meet diagonally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `content/items.ts`    | `mystery-tonic` 70 -> 100, `alley-stew` 60 -> 90 (street price 160 / 144 at 1.6x).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `content/weapons.ts`  | The gun and officer changes in the table above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Bugs the harness found

1. **Dumping was free (heat capped at 30).** Heat per deal capped its per-unit part at 8 extra units, so a 20-tonic
   dump made 30 heat, below the wanted line of 40, for 3500 coins and no police. The best strategy by far was the
   least risky. Fixed (E3, E4); pinned in `balance.test.ts`.
2. **Laundering legal goods.** A 2.5x street markup on everything made hustling bread the best way to sell bread, for
   8 heat. Fixed with the 1.6x markup and heat in proportion to the deal (E1).
3. **Stuck leaving officers.** A leaving officer who had dropped down a ledge (one-way) could not walk back to his
   gate and stood for the full minute-long timeout. Found as "1 stuck hunter" in the binge-and-run runs; fixed, pinned.
4. **Bullets hit bystanders.** An officer's shot was resolved against every player standing in the line, wanted or not.
   Fixed (only the target and other wanted players); pinned.
5. **Shots squeezed through diagonal walls.** `sightLine` let a bullet pass between two buildings (or ledges) that touch
   at a corner (48 leaking pairs on a line of 21 cottages; movement already forbade cutting that corner). Fixed; pinned.
6. **Thresholds judged after the tick's cooling.** Heat sitting exactly on a step was decremented in the same tick the
   gates were looked at, so a player pinned at 60 was treated as 59 and never got his second officer. The gates are now
   looked at before cooling.
7. **Police could be sent to gates they could not walk from.** With the farthest-gates change a random gate was often on a
   cut-off shore, so a search that cannot succeed ran up to five times (3500 tiles each) and the squad never arrived.
   Gates are now flood-filled from the player in the officers' direction of travel, which also made the "cut off by
   water" case cheap.
8. **Negative and fractional values.** Heat decay and fines are clamped (`Math.max(0, ...)`, fine at most the money held);
   the fuzz test checks money, health, heat and ammo stay in range through 6,000 random commands.
9. **Checked and found sound:** reloading cannot create ammo (rounds conserved, equip cancels a reload without refunding
   it), a shot cannot go through a ledge, a friendly shot never hits another officer, unarmed players are never shot,
   heat does decay, the same seed gives the same outcome (byte-identical world and log).

## What this cannot tell us

The harness aims perfectly (hitscan, no reaction time), never uses cover, never strafes, and a "melee" of one player is
a scripted policy. A human playtest is needed for:

- how the shotgun and SMG feel with cover and corners (the harness is open ground, where they are weakest);
- whether the sniper is still too strong against trickling reinforcements (it is the one gun that survives a long fight,
  58 % for three minutes in open ground; ammo at 30 coins a round and the 1800 price are the only brakes);
- whether 3 s on the clock before the first shot is enough on a 32-tile island, and whether 2 s forming up reads as
  "they are coming" or "they appeared"; whether escape on foot feels fair (the scripted runner is caught 54 % of the time);
- aim difficulty with a mouse or a thumb (hit radius 0.4 tile; spread is generous for the SMG);
- whether 2.5 s per heat point is a pace players notice in the HUD, and whether the Armory's hustle button should show
  the heat a sale will make (the HUD can call `hustleHeat(item, qty)`);
- the pacing of the foraging half of the crime route (herbs and mushrooms at 30 s per tile, the kitchen): the harness
  starts with stock, so 576 coins a minute is a ceiling for a player who has it, not a measurement of how fast they get it;
- multiplayer: heat and police are per-player here, and the sim was only run with one player at a time.
