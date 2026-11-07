# Altair "Outpost 13" — phase 2: content, balance and progression

Status: **plan, in progress.** Written 2026-11-07, after phase 1 (the visual identity, the animated menu, one
theme) shipped and the balance bot landed. This is a plan, not a spec of shipped behaviour; each section says
what is measured, what is an estimate, and what is a decision.

## 1. Starting point (measured)

Counts from the data tables (`lib/altair/data/`): **8 classes, 14 weapons (+14 evolutions), 12 passives, 14
catalysts, 16 enemies, 4 bosses** (5:00, 10:00, 15:00, 20:00), **20 meta upgrades costing 34,440 coins in
total**, and one purchasable class (1,500 coins).

`scripts/altair/balance/` plays real deterministic runs headlessly (the same `SoloRun` the browser and the
verifier use). First results, `average` skill, one seed per class (`pnpm exec tsx
scripts/altair/balance/report.ts`):

| Class         | Died at | Kills | Level | Coins |
| ------------- | ------- | ----- | ----- | ----- |
| knight        | 5:52    | 27    | 9     | 140   |
| arcanist      | 5:04    | 1543  | 14    | 144   |
| ranger        | 6:08    | 233   | 11    | 139   |
| plague_doctor | 5:22    | 2846  | 20    | 325   |
| berserker     | 5:07    | 251   | 11    | 155   |
| necromancer   | 5:04    | 2271  | 16    | 172   |
| chronomancer  | 5:04    | 355   | 5     | 16    |
| hemomancer    | 4:54    | 721   | 12    | 56    |

- **The first boss is a wall.** Every class dies at 4:54–6:08, around the Hollow King (`spawnTime: 300`) and
  its 1.5x pre-boss ramp. Nothing reaches the 10:00 boss.
- **The sim reaches its 200-enemy cap by ~90 s**, after which a step costs ~1.7 ms in the sandbox. A full
  20-minute run is 72,000 steps, about 2 minutes of CPU. (An earlier note in the balance-bot PR said this
  could exceed a 120 s replay limit. That was wrong: the solo and co-op verification jobs both run with a
  10-minute timeout; 120 s is only the helper's default. The real limit is throughput: the jobs worker
  replays one run at a time, so a worker verifies about 30 full runs an hour, against a backlog cap of 60.)
- **The bot is a rough stand-in for a player, not a player.** A passive version that only fled died at
  1:31–5:36 with 18–629 kills; engaging while healthy moved that to the numbers above. Use it for relative
  comparisons (same flags, same numbers) and regression catching, not to claim how hard the game is.

## 2. Goals, non-goals, anti-goals

**Goals.** A rebalanced game that has a real difficulty curve instead of a wall at 5:00; characters, weapons,
enemies and bosses that are mechanically distinct and fit the Outpost 13 setting; a progression layer with
enough genuinely different things to unlock that a dedicated player is still finding new ones after ~200
hours; every change measured before and after.

**Non-goals.** No change to account, coin-ledger or leaderboard semantics. No new 3D. No re-skin of the
site's other games.

**Anti-goals (failure even if it "works").** Grind with no new options (stat inflation that makes the game
trivial, so difficulty tiers have to chase it). A rebalance that corrupts or rejects runs in flight. Content
that only the best device can render (mobile and the 200-enemy cap are budgets, not afterthoughts).

## 3. Hard constraints

1. **Determinism and versioning.** A run is proven by replaying its log, so the browser and the server must
   run the same rules. `lib/altair/sim-version.ts` names them: **bump `SIM_VERSION` in the same commit as any
   change to how a run plays out** (balance, behaviour, weapons, classes, spawn tables). Logs carry the
   version they were played on; a mismatch is settled as `unverified` (the existing capped fallback payout,
   once, no penalty) instead of `rejected`. Co-op logs are stamped the same way.
2. **Ids are save data.** Class, weapon, enemy and meta-upgrade ids live in saves, runs and leaderboards.
   Never delete or repurpose one. Re-theming changes **name, art and numbers**, not the id (see 5).
3. **Verification capacity.** Every extra minute of sim or enemy density costs replay CPU. Phase 3 owns
   reducing the per-step cost; until then new modes must not lengthen the 20-minute run.
4. **Sprites come from the CDN** and must be loaded in CORS mode (`lib/altair/engine/sprites/cors-image.ts`);
   a new image loader that skips it blanks the playfield in production.

## 4. How "200 hours" is defined (and what I cannot prove)

I cannot play 200 hours, and I will not claim the game "has 200 hours" because a number says so. What can be
built and checked is the **economy and the number of distinct unlocks**; the felt length depends on real
players, which is why section 7 asks for data.

**Economy model.** Time to finish the meta tree is

```
hours ≈ (total tree cost ÷ average payout per run) × (minutes per run ÷ 60)
```

At ~3 full runs an hour (20 minutes each), 200 hours is ~600 runs. If an average run pays ~600 coins, the
whole tree should cost **~360,000 coins** (today: 34,440). The payout, the tree cost and the unlock pacing
are set from measured numbers (the bot now; real verified-run data when available), not guessed once and
left. Payout grows with difficulty tier so a player who pushes harder is paid for it.

**Distinct things to unlock** (the part that is not grind), in the order I plan to build them:

- **Heat** (difficulty tiers): each tier adds enemy modifiers and a payout bonus; chosen per run, server-
  validated against what the account has cleared. This is the main long-term loop and the cheapest to add.
- **Class mastery**: per-class levels that unlock alternate starting weapons and passive slots, so every
  class has a reason to be played repeatedly.
- **Sectors**: different maps and enemy mixes of the same 20-minute length (never longer; see constraint 3).
- **Codex and contracts**: collection and rotating objectives, for variety rather than raw hours.

## 5. Content plan

- **Roster.** Keep the 8 ids; give each a sci-fi identity and a more distinct kit. Working names (my call,
  open to change): knight → Vanguard (riot shield), arcanist → Arcwright (EM bolts), ranger → Surveyor
  (long-range scout), plague_doctor → Biotech, berserker → Breacher, necromancer → Echo-Binder (it commands
  Echoes, which fits the card), chronomancer → Dilator, hemomancer → Hemosurgeon. New classes come after
  the 8 are re-done, not before.
- **Enemies.** Re-cast the 16 as Echoes, drones and station anomalies, with roles that play differently
  (swarmers, shooters, chargers, shielded, summoners, suiciders) instead of fantasy re-skins. Ids stay.
- **Bosses.** The four bosses get readable telegraphs, phases and an arena mechanic each. The Hollow King
  (the 5:00 wall) goes first, using the bot to tune it.
- **Weapons and passives.** Re-theme all 14, and rework the weakest evolutions; new weapons only where a
  gap in play styles is measured.
- **Art.** Original sprites, authored as text frames (`lib/altair/menu/menu-sprites.ts` is the first), in the
  card palette with the allegiance colour code (cyan allies, magenta hostiles, amber loot and hazards). No
  free top-down sci-fi pack with a clear licence was found, so art is generated and original.

## 6. Order of work

Each step is its own pull request, merged after CI is green; any step that changes the sim bumps
`SIM_VERSION`.

1. **Version stamp** (this PR): `SIM_VERSION`, logs stamped, stale logs settled as `unverified`.
2. **Heat**: the tier model, server validation, payout scaling, and the bot gates for it.
3. **The 5:00 wall**: rework the Hollow King and the early curve; tune against the bot.
4. **Classes, two or three per PR**: new names, art and abilities, balanced with the bot.
5. **Enemy roster and the other bosses**, with their sprites.
6. **Economy pass**: tree cost, payout and pacing to the model in section 4.
7. **Class mastery and sectors.**

**Measured gates** (bot, fixed seeds, before/after in each PR): no class regresses its median time; a skilled
bot (`expert`) can clear the 20:00 boss on some seeds with the strongest class and a `novice` bot cannot
clear the first boss on most; no class is more than ~2x another's median result without a stated reason.
These are starting targets, to be revised once the bot is calibrated against real play.

## 7. What I need from the owner

Real players' results are the only way to calibrate the bot and the payout model. `altair_solo_run` stores
the verified replay numbers (`result`, `steps`, `coinsCredited`) for every run. **An export of the
distribution of verified `result.gameTime` and `coinsCredited` per `classId` (percentiles are enough, no
user identities) would let me calibrate the bot to real play.** Without it, difficulty targets stay
relative to the bot.

## 8. Risks

- The bot is not a human; real play differs. Mitigation: calibrate with section 7 data, and keep gates
  relative.
- 200 hours is a design target, not something I can verify without playtesters.
- Verification throughput (one replay at a time per worker) limits how heavy runs can get before phase 3.
- A class re-theme must not break saves: ids stay, and every rename is covered by the id rule above.
