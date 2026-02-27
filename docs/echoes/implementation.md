# ECHOES — Game Design Document

> **Genre:** Vampire Survivors-like Auto-Battler Roguelite
> **Round Duration:** 20 minutes (standard) · 10 minutes (Double Time mode @ 2× speed)
> **Perspective:** Top-down 2D
> **Target:** Balanced for replay, class variety, and escalating challenge

---

## Table of Contents

1. [Core Gameplay Loop](#1-core-gameplay-loop)
2. [Player Stats & Definitions](#2-player-stats--definitions)
3. [Leveling & Upgrade System](#3-leveling--upgrade-system)
4. [Economy & Coin System](#4-economy--coin-system)
5. [Meta-Progression & Permanent Upgrades](#5-meta-progression--permanent-upgrades)
6. [Classes](#6-classes)
7. [Weapons & Evolutions](#7-weapons--evolutions)
8. [Passive Items](#8-passive-items)
9. [Enemies](#9-enemies)
10. [Bosses](#10-bosses)
11. [Wave Timeline](#11-wave-timeline--director-system)
12. [Double Time Mode](#12-double-time-mode)
13. [Difficulty Scaling Formulas](#13-difficulty-scaling-formulas)
14. [Implementation Notes](#14-implementation-notes)

---

## 1. Core Gameplay Loop

The player selects a **class**, spawns on a procedurally-tiled map, and must survive for **20 minutes** against escalating waves of enemies. All weapons fire automatically based on their own cooldown timers. The player's only direct input is **movement** (WASD/joystick).

### Per-Run Flow

```
SELECT CLASS → SPAWN ON MAP → KILL ENEMIES → COLLECT XP GEMS
    → LEVEL UP → CHOOSE 1 OF 3 RANDOM UPGRADES (weapon / passive / ability)
    → SURVIVE BOSS ENCOUNTERS (every 5 min)
    → DEATH or 20:00 SURVIVAL → COIN PAYOUT → META SHOP
```

### On-Map Pickups

| Pickup | Visual | Effect |
|---|---|---|
| XP Gem (small) | Blue diamond | +1 XP |
| XP Gem (medium) | Green diamond | +5 XP |
| XP Gem (large) | Red diamond | +25 XP |
| Coin | Gold circle | +1 Coin (persistent) |
| Food (Chicken) | Drumstick | Heals 20% Max HP |
| Magnet | Magnet icon | Pulls all on-screen XP gems to player |
| Treasure Chest | Gold chest | Drops from bosses. Awards 1–3 random weapon upgrades + 10–25 coins |
| Rosary | Glowing cross | Kills all non-boss enemies on screen |
| Vacuum | Swirl | Pulls ALL map XP gems to player |

Food spawns from destructible environment props (barrels, tombstones, urns) with a **4% base drop rate**, modified by Luck. Coins drop from enemies with a **base 3% rate**, also modified by Luck.

---

## 2. Player Stats & Definitions

Every character has the following stats. Base values vary by class; all can be modified by passive items and level-up upgrades.

| Stat | Abbrev | Description | Global Base |
|---|---|---|---|
| Max HP | `HP` | Total hit points before death | 100 |
| HP Regen | `REGEN` | HP recovered per second | 0.0/s |
| Move Speed | `SPD` | Pixels/second movement rate | 200 |
| Might | `MGT` | Multiplicative damage modifier | 1.0× |
| Attack Speed | `ASPD` | Multiplicative cooldown reduction on weapons | 1.0× |
| Area | `AREA` | Multiplicative size modifier on weapon hitboxes | 1.0× |
| Projectile Count | `PROJ` | Additive bonus projectiles per weapon firing | +0 |
| Projectile Speed | `PSPD` | Multiplicative speed of projectiles | 1.0× |
| Duration | `DUR` | Multiplicative duration of lingering effects | 1.0× |
| Pickup Range | `RANGE` | Radius (px) at which XP/coins are auto-collected | 50 |
| Luck | `LUCK` | Affects drop rates, crit chance, upgrade rarity | 1.0× |
| Armor | `ARM` | Flat damage reduction per hit (min damage = 1) | 0 |
| Cooldown Reduction | `CDR` | Multiplicative reduction on ability cooldowns | 1.0× |
| Revival | `REV` | Number of times player revives at 50% HP on death | 0 |
| Growth | `GRO` | Multiplicative modifier on XP gem value | 1.0× |

### Stat Caps

| Stat | Soft Cap | Hard Cap | Notes |
|---|---|---|---|
| Move Speed | 350 | 500 | Diminishing returns after soft cap (50% efficiency) |
| Might | 3.0× | 5.0× | — |
| Attack Speed | 2.5× | 4.0× | — |
| Area | 3.0× | 5.0× | — |
| Projectile Count | +5 | +8 | Per weapon |
| Armor | 10 | 20 | — |
| CDR | 0.5× | 0.25× | Lower = faster cooldown |
| Revival | — | 3 | — |
| Growth | 3.0× | 5.0× | — |

---

## 3. Leveling & Upgrade System

### XP Curve

XP required per level follows a quadratic curve:

```
XP_required(level) = floor(5 + (level × 3) + (level² × 0.4))
```

| Level | XP Required | Cumulative XP |
|---|---|---|
| 1→2 | 8 | 8 |
| 2→3 | 12 | 20 |
| 3→4 | 17 | 37 |
| 5→6 | 28 | 93 |
| 10→11 | 75 | 428 |
| 15→16 | 140 | 1,118 |
| 20→21 | 221 | 2,283 |
| 25→26 | 318 | 4,073 |
| 30→31 | 431 | 6,638 |

Expected level by game time (with average play):

- **5:00** — Level ~10
- **10:00** — Level ~18
- **15:00** — Level ~25
- **20:00** — Level ~32–35

### Level-Up Choice

On level up, the player is presented **3 random options** (4 with the Luck-based "Extra Choice" meta upgrade). Options are drawn from:

1. **New weapon** (if fewer than 6 weapons held)
2. **Weapon upgrade** (level up an existing weapon, max level 8)
3. **New passive item** (if fewer than 6 passives held)
4. **Passive item upgrade** (level up existing passive, max level 5)
5. **+25 Gold** (always available as a consolation/strategic option)

If a weapon reaches **level 8** and the player holds its required **evolution passive**, the weapon automatically evolves into its **evolved form** (see §7).

### Reroll & Banish

- **Reroll** (unlockable meta upgrade): Re-randomize the 3 choices. Base: 2 rerolls/run. Max: 5.
- **Banish** (unlockable meta upgrade): Remove an option permanently from the run's pool. Base: 2 banishes/run. Max: 5.

---

## 4. Economy & Coin System

Coins are the **persistent currency** that carry between runs. They are spent in the Meta Shop.

### Coin Sources (Per Run)

| Source | Amount | Notes |
|---|---|---|
| Enemy coin drops | 1 each | 3% base drop rate, ×Luck |
| Boss kill | 25 / 50 / 75 / 100 | Bosses at 5/10/15/20 min respectively |
| Treasure chest (boss drop) | 10–25 | Randomized per chest |
| Survival time bonus | 1 per 15 sec survived | Max 80 coins at 20:00 |
| Kill milestone: 500 kills | 10 | One-time per run |
| Kill milestone: 1,500 kills | 25 | One-time per run |
| Kill milestone: 3,000 kills | 50 | One-time per run |
| Kill milestone: 5,000 kills | 100 | One-time per run |
| Full clear (survive 20:00) | 100 | Completion bonus |
| First clear with class | 200 | One-time per class, ever |
| Double Time completion | +50% total | Multiplier on all coins earned |
| Greed stat (meta upgrade) | +10% per level | Max 5 levels = +50% |

### Expected Coin Income

| Scenario | Estimated Coins |
|---|---|
| Death at 5:00, ~200 kills | 30–60 |
| Death at 10:00, ~1,000 kills | 100–180 |
| Death at 15:00, ~2,500 kills | 220–350 |
| Full 20:00 clear, ~5,000 kills | 450–650 |
| Full clear + Double Time + max Greed | 800–1,100 |

---

## 5. Meta-Progression & Permanent Upgrades

### Meta Shop

All upgrades are purchased with persistent coins. Upgrades apply to **all future runs**.

| Upgrade | Levels | Cost Per Level | Effect Per Level |
|---|---|---|---|
| Max HP Up | 5 | 50 / 100 / 200 / 350 / 500 | +10% Max HP |
| HP Regen | 5 | 75 / 150 / 250 / 400 / 600 | +0.2 HP/s |
| Might Up | 5 | 100 / 200 / 350 / 500 / 750 | +5% Might |
| Move Speed Up | 5 | 50 / 100 / 150 / 250 / 400 | +5% Move Speed |
| Pickup Range Up | 5 | 25 / 50 / 100 / 150 / 200 | +20px Pickup Range |
| Growth Up | 5 | 100 / 200 / 350 / 500 / 750 | +8% Growth |
| Greed | 5 | 150 / 300 / 500 / 750 / 1000 | +10% coin gain |
| Luck Up | 5 | 100 / 200 / 350 / 500 / 750 | +10% Luck |
| Armor Up | 3 | 200 / 400 / 700 | +1 Armor |
| Revival | 1 | 1000 | +1 Revival |
| Reroll | 3 | 100 / 250 / 500 | +1 Reroll/run |
| Banish | 3 | 100 / 250 / 500 | +1 Banish/run |
| Extra Choice | 1 | 2000 | +1 level-up option (3→4) |

**Total cost to fully upgrade:** ~16,700 coins (roughly 25–35 full clears, or ~50 medium runs)

### Class Unlocks

| Class | Unlock Condition | Cost |
|---|---|---|
| Knight | Starting class | Free |
| Arcanist | Starting class | Free |
| Ranger | Starting class | Free |
| Plague Doctor | Survive 10 minutes | Free (achievement) |
| Berserker | Kill 3,000 enemies in one run | Free (achievement) |
| Necromancer | Purchase in shop | 1,500 coins |
| Chronomancer | Defeat the 15-minute boss | Free (achievement) |
| Hemomancer | Complete a full 20:00 run | Free (achievement) |

---

## 6. Classes

Each class has **unique base stat modifiers**, a **starting weapon**, and **two class abilities** (one innate from the start, one unlocked at level 10).

### 6.1 Knight

> *A stalwart warrior with balanced stats and strong survivability. Ideal for beginners.*

**Starting Weapon:** Broad Sword (melee sweep)

| Stat | Modifier |
|---|---|
| Max HP | 120 (base +20) |
| Armor | 1 |
| Might | 1.0× |
| Move Speed | 195 |

**Ability 1 — Shield Wall (Innate)**
Every **25 seconds** (affected by CDR), the Knight gains a shield that absorbs the next **30 damage** (scales +10 per player level milestone at 10, 20, 30). Shield lasts **8 seconds** or until broken. Visual: glowing golden barrier around player.

**Ability 2 — Rally Cry (Unlocked at Level 10)**
Every **45 seconds** (affected by CDR), emits a battle shout in a **250px radius** (affected by Area). All enemies in range are **stunned for 1.5 seconds** and take **50 damage** (affected by Might). Additionally, the Knight gains **+15% Move Speed** for **5 seconds**.

---

### 6.2 Arcanist

> *A glass cannon mage who trades durability for devastating magical area attacks.*

**Starting Weapon:** Arcane Bolt (auto-targeting projectile)

| Stat | Modifier |
|---|---|
| Max HP | 80 (base −20) |
| Might | 1.2× |
| Area | 1.15× |
| Move Speed | 190 |
| CDR | 0.9× |

**Ability 1 — Mana Surge (Innate)**
Every **30 seconds**, the Arcanist's next **3 weapon attacks** deal **2× damage** and have **+50% Area**. Visual: purple energy crackling around character, weapon projectiles glow brighter.

**Ability 2 — Arcane Nova (Unlocked at Level 10)**
Every **40 seconds**, unleashes an expanding ring of arcane energy outward from the player. The ring travels **400px** (affected by Area), dealing **80 damage** (affected by Might) to all enemies it passes through and applying a **30% slow for 3 seconds**. Visual: expanding purple shockwave ring.

---

### 6.3 Ranger

> *A swift, evasive fighter who excels at kiting and projectile-based combat.*

**Starting Weapon:** Iron Shortbow (directional arrow volley)

| Stat | Modifier |
|---|---|
| Max HP | 90 |
| Move Speed | 230 |
| Projectile Speed | 1.2× |
| Projectile Count | +1 |
| Pickup Range | 75 |

**Ability 1 — Evasion Roll (Innate)**
Every **20 seconds**, the Ranger automatically **dashes 150px** in their movement direction when an enemy comes within **60px**, gaining **invincibility frames for 0.5 seconds** during the dash. If the player is stationary, dashes away from the nearest enemy. Visual: afterimage trail during dash.

**Ability 2 — Hunter's Mark (Unlocked at Level 10)**
Every **35 seconds**, the **strongest enemy on screen** (highest current HP) is marked for **8 seconds**. Marked enemies take **+40% damage from all sources** and drop **3× XP** on death. If the marked enemy is a boss, the bonus damage is reduced to **+20%**. Visual: red crosshair above target, red tether line from player to target.

---

### 6.4 Plague Doctor

> *A poison specialist who controls space with lingering damage zones. Unlock: Survive 10 minutes.*

**Starting Weapon:** Toxic Flask (lobbed AoE poison pool)

| Stat | Modifier |
|---|---|
| Max HP | 95 |
| Duration | 1.3× |
| Area | 1.1× |
| Move Speed | 185 |
| HP Regen | 0.3/s |

**Ability 1 — Miasma Trail (Innate)**
The Plague Doctor passively leaves a **poison trail** behind them as they move. The trail is **30px wide** (affected by Area), persists for **2 seconds** (affected by Duration), and deals **5 damage/tick** every 0.5 seconds to enemies standing in it (affected by Might). Trail ticks apply a **10% slow** stack, up to 3 stacks (30% slow).

**Ability 2 — Pandemic (Unlocked at Level 10)**
Every **50 seconds**, all currently poisoned enemies (any source) **explode**, dealing **40% of the remaining poison damage** as instant AoE damage in a **100px radius** around them (affected by Area). This explosion can chain — if the AoE kills or poisons new enemies, they also trigger after a **0.3 second delay**, up to **3 chain iterations**. Visual: green bursting particles, chain lightning-style connecting lines.

---

### 6.5 Berserker

> *A high-risk melee fighter who grows stronger the more damage they take. Unlock: Kill 3,000 enemies in one run.*

**Starting Weapon:** War Axe (wide circular cleave)

| Stat | Modifier |
|---|---|
| Max HP | 150 |
| Might | 0.9× (base, but scales up) |
| Move Speed | 205 |
| Armor | 0 |
| HP Regen | 0.5/s |

**Ability 1 — Blood Rage (Innate, Passive)**
The Berserker gains **bonus Might** based on **missing HP percentage**:

```
bonus_might = 0.8 × (1 - current_hp / max_hp)
```

| HP % | Bonus Might | Total Might (with 0.9 base) |
|---|---|---|
| 100% | +0.00× | 0.90× |
| 75% | +0.20× | 1.10× |
| 50% | +0.40× | 1.30× |
| 25% | +0.60× | 1.50× |
| 10% | +0.72× | 1.62× |

Additionally, below **30% HP**, the Berserker gains **+20% Attack Speed** and their eyes glow red.

**Ability 2 — Savage Slam (Unlocked at Level 10)**
Every **30 seconds**, the Berserker leaps to the **densest cluster of enemies** within **300px** and slams down, dealing **120 damage** (affected by Might) in a **180px radius** (affected by Area). Enemies in the inner **60px** are additionally **knocked back 100px** and stunned for **1 second**. The Berserker is invulnerable during the leap (~0.6s). Visual: red energy trail on leap, ground crack impact, shockwave ring.

---

### 6.6 Necromancer

> *A summoner who raises the dead to fight. Lower personal damage, but overwhelming numbers. Unlock: Purchase for 1,500 coins.*

**Starting Weapon:** Soul Siphon (short-range beam that drains enemies)

| Stat | Modifier |
|---|---|
| Max HP | 85 |
| Might | 0.85× |
| Duration | 1.2× |
| Move Speed | 180 |
| CDR | 0.85× |

**Ability 1 — Raise Dead (Innate)**
Every enemy killed has a **25% chance** (affected by Luck) to raise a **skeleton minion** at its death location. Skeletons have **30 HP**, deal **15 damage/hit** (affected by Might) at **1 attack/second**, move at **180 speed**, target the nearest enemy, and last **12 seconds** (affected by Duration). **Maximum 8 active skeletons** (increases to 10 at player level 15, 12 at level 25). Skeletons that kill enemies can trigger further Raise Dead procs.

**Ability 2 — Army of Darkness (Unlocked at Level 10)**
Every **60 seconds**, the Necromancer summons a **bone wall ring** (radius 200px, affected by Area) around themselves. The wall consists of **12 bone pillars**, each with **50 HP**. Enemies that touch a pillar take **25 damage** and are knocked back. The wall lasts **6 seconds** (affected by Duration) or until all pillars are destroyed. While the wall stands, all skeletons inside gain **+50% damage and attack speed**. Visual: circle of ribcage-like bone pillars, green necromantic energy connecting them.

---

### 6.7 Chronomancer

> *A time-bending spellcaster who manipulates enemy speed and cooldowns. Unlock: Defeat the 15-minute boss.*

**Starting Weapon:** Temporal Shard (boomerang projectile that slows on hit)

| Stat | Modifier |
|---|---|
| Max HP | 85 |
| CDR | 0.8× |
| Move Speed | 200 |
| Might | 1.0× |
| Duration | 1.15× |

**Ability 1 — Time Dilation Field (Innate)**
A **150px radius aura** (affected by Area) passively surrounds the Chronomancer. All enemies inside the aura move and attack at **70% speed**. The aura is always active. Visual: subtle clock-like particle ring, enemies inside have a blue-shifted tint.

**Ability 2 — Temporal Rewind (Unlocked at Level 10)**
Every **50 seconds**, the Chronomancer **rewinds 4 seconds** of their own position and HP history. The player teleports to where they were 4 seconds ago with the HP they had at that moment (whichever is higher — current or 4-seconds-ago). During the rewind animation (~0.3s), the player is **invulnerable**. Additionally, all enemies within **200px** of the player's *current* position (before teleporting) are **frozen for 2.5 seconds**. Visual: VHS-rewind distortion effect, clock spinning backward above player, frozen enemies encased in blue crystal.

---

### 6.8 Hemomancer

> *A blood mage who sacrifices HP for power and heals through violence. Unlock: Complete a full 20:00 run.*

**Starting Weapon:** Crimson Whip (medium-range blood lash in facing direction)

| Stat | Modifier |
|---|---|
| Max HP | 110 |
| Might | 1.1× |
| HP Regen | −0.5/s (passive drain) |
| Move Speed | 195 |
| Luck | 1.1× |

**Ability 1 — Sanguine Feast (Innate, Passive)**
All damage dealt by the Hemomancer heals them for **5% of damage dealt** (lifesteal). This is calculated after Might modifiers. Healing is capped at **8 HP per second** to prevent infinite sustain with AoE. The passive HP drain (−0.5/s) creates a tension where the Hemomancer must keep attacking to sustain. Below **50% HP**, lifesteal increases to **8%**.

**Ability 2 — Blood Nova (Unlocked at Level 10)**
Activated every **35 seconds**. The Hemomancer **sacrifices 15% of current HP** and detonates it as a **blood explosion** in a **250px radius** (affected by Area). Damage equals **3× the HP sacrificed** plus **60 base damage** (all affected by Might). Enemies killed by Blood Nova heal the Hemomancer for **5 HP each** (uncapped, ignoring the per-second lifesteal cap). Visual: player pulses red, blood tendrils radiate outward, crimson explosion.

---

## 7. Weapons & Evolutions

Each weapon can be leveled to **8** through level-up selections. At **level 8**, if the player also holds the matching **evolution passive item**, the weapon automatically transforms into its **evolved form** (distinct new weapon with enhanced behavior).

Players can hold a **maximum of 6 weapons** simultaneously.

### Weapon Table

| # | Weapon | Type | Base Damage | Cooldown | Description | Evolution Passive | Evolved Form |
|---|---|---|---|---|---|---|---|
| 1 | Broad Sword | Melee sweep | 20 | 1.2s | 120° frontal arc slash | Gauntlet (+Armor) | Radiant Claymore |
| 2 | Arcane Bolt | Homing projectile | 18 | 1.0s | Fires a seeking bolt at nearest enemy | Tome (+Area) | Arcane Barrage |
| 3 | Iron Shortbow | Directional arrows | 12 | 0.8s | Fires arrows in facing direction | Quiver (+Proj Count) | Storm Bow |
| 4 | Toxic Flask | Lobbed AoE | 8/tick | 3.5s | Lobs flask creating poison pool (2s) | Vial (+Duration) | Plague Bomb |
| 5 | War Axe | Circular cleave | 28 | 1.8s | 360° spin attack around player | War Paint (+Might) | Cataclysm Axe |
| 6 | Soul Siphon | Short beam | 10/tick | Continuous | Drains nearest enemy within 100px | Skull Pendant (+CDR) | Death Ray |
| 7 | Temporal Shard | Boomerang | 15 ×2 | 2.0s | Passes through enemies twice (out+back) | Hourglass (+CDR) | Eternity Loop |
| 8 | Crimson Whip | Directional lash | 22 | 1.4s | Lashes in facing dir, 150px range | Blood Ruby (+Might) | Sanguine Scourge |
| 9 | Holy Water | Ground AoE | 6/tick | 3.0s | Drops damaging pool at player's feet | Sacred Charm (+Duration) | Divine Deluge |
| 10 | Throwing Daggers | Multi-projectile | 8 | 0.6s | Fast small projectiles, random spread | Sharpening Stone (+Proj Speed) | Knife Storm |
| 11 | Lightning Ring | Auto-strike | 25 | 2.5s | Random lightning bolt on nearby enemy | Conductor Coil (+Area) | Thunderstorm |
| 12 | Garlic | Passive aura | 5/tick | 0.5s | Damage aura around player, 80px | Laurel (+Max HP) | Soul Eater |
| 13 | Runic Orbs | Orbital | 14 | Passive | Orbs circle player, damage on contact | Star Map (+Proj Count) | Celestial Guard |
| 14 | Fire Wand | Direct shot | 30 | 1.6s | Fires a fireball in random direction | Ember Ring (+Proj Speed) | Inferno Staff |

### Evolution Details

| Evolved Weapon | Key Enhancement |
|---|---|
| **Radiant Claymore** | 180° arc, +50% damage, emits holy shockwave every 3rd swing dealing AoE |
| **Arcane Barrage** | Fires 3 bolts simultaneously, each explodes on impact for 80px AoE |
| **Storm Bow** | Fires double arrow count, arrows pierce all enemies, leave lightning trails |
| **Plague Bomb** | Pool radius 2×, enemies leaving pool carry poison for 4 additional seconds |
| **Cataclysm Axe** | Spin pulls enemies inward 50px, +80% damage, leaves fire trail on ground |
| **Death Ray** | Range 250px, beam chains to 3 additional enemies, 15% lifesteal |
| **Eternity Loop** | 3 shards orbit continuously, freeze enemies for 0.5s on hit |
| **Sanguine Scourge** | Lash hits all directions, enemies killed explode for 60% of their max HP as AoE |
| **Divine Deluge** | 4 pools drop on random enemy clusters, pools heal player 2HP/tick while standing in them |
| **Knife Storm** | 360° knife burst every 0.4s, knives bounce off enemies once |
| **Thunderstorm** | 3 simultaneous bolts, struck enemies chain to 2 nearby, 0.5s stun |
| **Soul Eater** | 200px aura, converts 1% of aura damage to healing, reduces enemy damage by 20% in range |
| **Celestial Guard** | 5 orbs, orbit speed 2×, orbs emit damaging light beams outward |
| **Inferno Staff** | Fireball explodes into 6 embers on impact, each ember leaves a small fire pool |

### Weapon Level Scaling

Each level (1→8) provides the following per weapon:

- **Damage:** +15% per level (compounding) → Level 8 ≈ 2.66× base
- **Level 2:** +1 base effect (e.g., +1 projectile for bows, +0.5s duration for pools)
- **Level 4:** +1 base effect
- **Level 6:** +1 base effect
- **Level 8:** Evolution (if passive requirement met), otherwise +25% damage spike

---

## 8. Passive Items

Players can hold a **maximum of 6 passive items** simultaneously. Each has 5 upgrade levels via level-up selection. Passives both provide stat bonuses and serve as **evolution catalysts** for weapons.

| # | Passive Item | Stat Bonus Per Level | Max Bonus (Lv 5) | Evolves |
|---|---|---|---|---|
| 1 | Gauntlet | +1 Armor | +5 Armor | Broad Sword |
| 2 | Tome | +8% Area | +40% Area | Arcane Bolt |
| 3 | Quiver | +1 Proj Count | +5 Proj Count | Iron Shortbow |
| 4 | Vial | +10% Duration | +50% Duration | Toxic Flask |
| 5 | War Paint | +5% Might | +25% Might | War Axe |
| 6 | Skull Pendant | +5% CDR | +25% CDR | Soul Siphon |
| 7 | Hourglass | +4% CDR, +4% Duration | +20% CDR, +20% Dur | Temporal Shard |
| 8 | Blood Ruby | +5% Might, +0.1 HP Regen | +25% Might, +0.5 Regen | Crimson Whip |
| 9 | Sacred Charm | +8% Duration, +3 HP | +40% Duration, +15 HP | Holy Water |
| 10 | Sharpening Stone | +10% Proj Speed | +50% Proj Speed | Throwing Daggers |
| 11 | Conductor Coil | +8% Area, +3% Might | +40% Area, +15% Might | Lightning Ring |
| 12 | Laurel | +8% Max HP | +40% Max HP | Garlic |
| 13 | Star Map | +1 Proj Count (at Lv 3 & 5 only) | +2 Proj Count | Runic Orbs |
| 14 | Ember Ring | +10% Proj Speed, +3% Might | +50% Proj Speed, +15% Might | Fire Wand |
| 15 | Swift Boots | +6% Move Speed | +30% Move Speed | — (no evolution) |
| 16 | Magnetic Amulet | +20px Pickup Range | +100px Pickup Range | — |
| 17 | Clover | +8% Luck | +40% Luck | — |
| 18 | XP Tome | +8% Growth | +40% Growth | — |

---

## 9. Enemies

Enemies are organized into **tiers** that progressively unlock as the run progresses. All HP, damage, and speed values are **base values at their spawn-in time** — they are further modified by the **difficulty scaling system** (§13).

### Tier 1 — Fodder (Minute 0:00+)

#### 9.1 Shambler
- **Visual:** Ragged zombie, slow stumble animation
- **HP:** 8
- **Damage:** 5 (contact)
- **Speed:** 80 px/s
- **Behavior:** Walks directly toward player. No special abilities.
- **XP Drop:** 1 (small gem)
- **Design Role:** Bread-and-butter enemy. Appears in massive swarms. Tests AoE clearing.

#### 9.2 Bat
- **Visual:** Small dark bat, erratic flight
- **HP:** 5
- **Damage:** 3 (contact)
- **Speed:** 160 px/s
- **Behavior:** Moves toward player in a **sinusoidal wave pattern** (amplitude 40px, period 1.5s), making them harder to hit with narrow projectiles.
- **XP Drop:** 1
- **Design Role:** Fast but fragile. Punishes players who stand still.

### Tier 2 — Threats (Minute 2:00+)

#### 9.3 Skeleton Warrior
- **Visual:** Armed skeleton with rusty sword
- **HP:** 20
- **Damage:** 10 (contact), attacks every 1.5s when adjacent
- **Speed:** 100 px/s
- **Behavior:** Walks toward player. When within **50px**, stops and performs a **lunging sword strike** (hitbox extends 70px in front for 0.3s). Lunge has a **0.5s windup** (visual: raises sword).
- **XP Drop:** 3 (small gem ×3)
- **Design Role:** First enemy with a melee attack pattern. Teaches players to keep moving.

#### 9.4 Ghost
- **Visual:** Translucent floating specter
- **HP:** 12
- **Damage:** 8 (contact)
- **Speed:** 120 px/s
- **Behavior:** Passes **through other enemies** (no collision). Every **4 seconds**, becomes **intangible for 1.5 seconds** (semi-transparent, immune to damage, still deals contact damage). Player must time attacks.
- **XP Drop:** 3
- **Design Role:** Disrupts dense formations by phasing through. Intermittent invulnerability creates micro-decisions.

### Tier 3 — Elites (Minute 5:00+)

#### 9.5 Werewolf
- **Visual:** Large bipedal wolf, hunched and snarling
- **HP:** 55
- **Damage:** 18 (contact/pounce)
- **Speed:** 90 px/s (walking), 350 px/s (pouncing)
- **Behavior:** Walks toward player. At **200px range**, enters a **1-second crouch** (visual: lowers body, eyes flash) then **pounces** in a straight line toward the player's position at pounce-start. Pounce covers **250px**. After landing, pauses for **0.8 seconds** before resuming walk. Pounce cooldown: **6 seconds**.
- **XP Drop:** 10 (medium gem)
- **Design Role:** Scary burst movement. Crouching telegraph teaches pattern recognition. Punishes stationary play.

#### 9.6 Cultist
- **Visual:** Robed figure with glowing staff
- **HP:** 25
- **Damage:** 12 (projectile)
- **Speed:** 70 px/s
- **Behavior:** **Ranged enemy.** Maintains **200px distance** from player (retreats if closer). Every **3 seconds**, fires a **dark orb projectile** (speed 200 px/s, size 12px) aimed at the player's current position. Orb persists for **3 seconds** or until hitting the player. Orbs pass through other enemies.
- **XP Drop:** 8
- **Design Role:** First ranged threat. Forces player to dodge projectiles while managing melee swarms. Backline priority target.

#### 9.7 Swarm Rat
- **Visual:** Tiny scurrying rat
- **HP:** 3
- **Damage:** 2 (contact)
- **Speed:** 200 px/s
- **Behavior:** Always spawns in packs of **8–12**. Each rat has slightly randomized speed (±20%). They move directly toward the player. Individually trivial but difficult to clear all at once.
- **XP Drop:** 1 each (but the volume compensates)
- **Design Role:** AoE check. If AoE is weak, rats swarm and chip damage adds up. Satisfying to clear with good AoE.

### Tier 4 — Dangerous (Minute 8:00+)

#### 9.8 Witch
- **Visual:** Hovering figure with dark aura
- **HP:** 35
- **Damage:** 0 (does not deal direct damage)
- **Speed:** 90 px/s
- **Behavior:** Stays at **250px range** from player. Every **8 seconds**, casts **Curse** on the player: reduces player Move Speed by **15%** for **4 seconds** (stacks up to 2× from multiple Witches = 30% slow). Every **12 seconds**, casts **Empower** on all enemies within **200px of herself**: empowered enemies gain **+25% speed** and **+20% damage** for **5 seconds** (glowing red aura).
- **XP Drop:** 12 (medium gem)
- **Design Role:** High-priority support enemy. Doesn't threaten directly but makes everything else deadly. Encourages target prioritization.

#### 9.9 Bone Golem
- **Visual:** Hulking skeleton construct, twice normal enemy size
- **HP:** 120
- **Damage:** 20 (contact), 30 (ground slam)
- **Speed:** 60 px/s
- **Behavior:** Slow but tanky. Every **5 seconds**, performs a **ground slam**: stops, raises fists (1s windup), slams creating a **150px radius shockwave** dealing 30 damage and applying **0.5s stun** to the player. During windup, the Golem gains **50% damage reduction**. On death, splits into **3 Skeleton Warriors**.
- **XP Drop:** 20 (large gem)
- **Design Role:** Tank enemy that demands sustained DPS. Ground slam punishes melee-heavy builds. Death-split creates secondary threat.

#### 9.10 Shadow
- **Visual:** Dark humanoid silhouette, flickers
- **HP:** 30
- **Damage:** 15 (contact)
- **Speed:** 140 px/s
- **Behavior:** **Invisible** (fully transparent) until within **150px** of the player, at which point it fades in over **0.3 seconds**. Moves quickly and directly. If it takes damage while invisible, it is revealed immediately. Every **10 seconds** while visible, can **re-cloak** if more than **200px** from the player.
- **XP Drop:** 8
- **Design Role:** Jump-scare enemy. Tests player awareness and punishes tunnel vision. Rewards wide AoE (reveals them before they get close).

### Tier 5 — Nightmare (Minute 12:00+)

#### 9.11 Vampire Noble
- **Visual:** Pale aristocrat in dark cloak, red eyes
- **HP:** 80
- **Damage:** 22 (melee), 15 (bat swarm)
- **Speed:** 130 px/s
- **Behavior:** Walks toward player. At **100px**, performs a rapid 3-hit **claw combo** (each hit 22 damage, 0.2s between hits). Every **8 seconds**, summons a **bat swarm** of 4 bats (same as Tier 1 bats) that target the player. Heals **5 HP per second** passively (lifesteal aura). **Killing the Noble stops the bat spawns.**
- **XP Drop:** 25 (large gem)
- **Design Role:** Mini-boss tier regular enemy. Sustain + adds + burst melee = must prioritize.

#### 9.12 Arcane Construct
- **Visual:** Floating geometric shape (icosahedron) with glowing runes
- **HP:** 60
- **Damage:** 0 (contact), 25 (laser)
- **Speed:** 100 px/s
- **Behavior:** Hovers at **300px** from player. Every **4 seconds**, telegraphs a **laser beam** (red line appears for 1s) then fires a **piercing beam** in a straight line (width 20px, infinite range, lasts 0.5s). The beam deals 25 damage to the player if hit. Rotates targeting — aims at where the player **will be** based on current velocity (leading shots).
- **XP Drop:** 15
- **Design Role:** Advanced ranged threat with predictive aiming. Forces erratic movement or direction changes. Laser telegraph is readable but requires attention during chaotic swarms.

#### 9.13 Plague Bearer
- **Visual:** Bloated green zombie, dripping
- **HP:** 45
- **Damage:** 8 (contact), 4/tick (poison cloud)
- **Speed:** 70 px/s
- **Behavior:** Walks toward player. Leaves a **poison trail** (40px wide, lasts 3 seconds) that deals **4 damage per tick** (2 ticks/second) to the player. On death, **explodes** into a **120px radius poison cloud** lasting **4 seconds** (same damage). Contact damage also applies a **poison DoT** of 3 damage/second for 3 seconds.
- **XP Drop:** 10
- **Design Role:** Zone denial. Players must be aware of death explosions. Melee characters suffer most. Creates lingering hazards.

### Tier 6 — Cataclysm (Minute 16:00+)

#### 9.14 Death Knight
- **Visual:** Armored undead knight with flaming sword, larger than standard
- **HP:** 150
- **Damage:** 35 (melee swing), 20 (shockwave)
- **Speed:** 110 px/s
- **Behavior:** Walks toward player. Melee swing every 2 seconds in a **140° arc**, 100px reach. Every **6 seconds**, plants sword in ground and emits **4 directional shockwaves** (N/S/E/W) each 30px wide, traveling 300px, dealing 20 damage. Has **3 Armor** (flat damage reduction). On death, drops a **Food pickup** (guaranteed).
- **XP Drop:** 25 (large gem)
- **Design Role:** Endgame elite. Demands respect even from well-built characters. Shockwave pattern tests positioning.

#### 9.15 Banshee
- **Visual:** Floating ghostly woman, long flowing hair and tattered dress
- **HP:** 40
- **Damage:** 10 (contact), 0 (scream — debuff only)
- **Speed:** 150 px/s
- **Behavior:** Phases through all enemies (like Ghost). Every **7 seconds**, performs a **Wailing Scream**: all player weapons are **disabled for 2 seconds** (cooldowns freeze, active projectiles remain but no new ones fire). Affects the player if within **400px**. The scream has a **1.5 second windup** (visual: Banshee stops, mouth opens, sound wave rings pulse outward). Killing her during windup cancels the scream.
- **XP Drop:** 12
- **Design Role:** Extremely dangerous support enemy. Weapon disable during swarms = death. **Top priority kill target.** Windup is generous but requires awareness.

#### 9.16 Lich
- **Visual:** Skeletal mage in ornate robes, floating phylactery
- **HP:** 100 + 30 (phylactery)
- **Damage:** 20 (projectile volley)
- **Speed:** 60 px/s
- **Behavior:** Stays at **350px** range. Every **5 seconds**, fires a **fan of 5 projectiles** in a 60° arc toward the player (each projectile: 20 damage, 180 speed). Every **15 seconds**, **resurrects** up to **3 nearby dead enemies** (within 200px) at 50% HP. **Has a phylactery** (small floating orb beside it): the Lich cannot die until its phylactery is destroyed (30 HP, hittable). If the Lich body reaches 0 HP with phylactery alive, it becomes invulnerable and regenerates to 50% HP over **3 seconds**.
- **XP Drop:** 30 (large gem)
- **Design Role:** Ultimate regular enemy. Resurrection ability compounds danger. Phylactery mechanic rewards targeted/precise damage. A run-ender if ignored.

---

## 10. Bosses

Bosses spawn at fixed time intervals. Each boss enters with a **screen-shake**, a **warning indicator** (directional arrow for 3 seconds before spawning at screen edge), and **dramatic audio cue**. All non-boss enemies **continue spawning** during boss fights. Bosses are immune to knockback and stun effects (unless specified).

Boss HP, damage, and speed scale with current difficulty multiplier (§13). Values below are **base values**.

---

### Boss 1 — THE HOLLOW KING (Minute 5:00)

> *An enormous skeletal monarch wreathed in green flame, dragging a massive rusted blade.*

| Stat | Value |
|---|---|
| HP | 800 |
| Speed | 85 px/s |
| Size | 3× standard enemy |
| Armor | 2 |

**Phase 1 (100%–50% HP):**

- **Cleave:** Every **3 seconds**, swings blade in a **180° arc** (range 150px, damage 30). Telegraphed by **0.8s windup** (blade raised, green particles gather).
- **Summon Shambler Guard:** Every **12 seconds**, summons **8 Shamblers** in a circle around himself.
- **Bone Spikes:** Every **8 seconds**, spikes erupt from the ground in a **line** toward the player (5 spikes, each 40px apart, 1 spike/0.2s, damage 20 each). Telegraphed by **ground cracks appearing 0.6s before eruption**.

**Phase 2 (50%–0% HP):**

- Gains **+30% speed** (110 px/s).
- **Cleave** upgraded: now **270° arc**, +10 damage.
- **Death March:** Every **15 seconds**, charges in a **straight line** toward the player at **250 px/s** for up to **400px**, leaving a **trail of bone spikes** behind (persist 3 seconds, 15 damage on contact). Telegraphed: **1.2s** of glowing eyes + directional indicator.
- Stops summoning Shamblers; instead, all enemies on screen gain **+15% speed** while the King is in Phase 2.

**Drop:** Treasure Chest (15–25 coins, 1–2 weapon upgrades), 25 flat coins.

---

### Boss 2 — THE CRIMSON COUNTESS (Minute 10:00)

> *A vampiric matriarch hovering above the ground, surrounded by swirling blood mist.*

| Stat | Value |
|---|---|
| HP | 2,000 |
| Speed | 100 px/s (hover) |
| Size | 2.5× standard enemy |
| Armor | 3 |

**Phase 1 (100%–60% HP):**

- **Blood Lance:** Every **4 seconds**, fires a **blood lance projectile** at the player (speed 280, damage 25, pierces through enemies). Telegraphed: **0.6s** of arm extending, red glow at hand.
- **Bat Cloud:** Every **10 seconds**, releases a **spiral pattern of 12 bats** that expand outward from her position. Bats have **3 HP each**, deal **5 damage** on contact, and home loosely toward the player. They despawn after **5 seconds**.
- **Blood Shield:** She has a **regenerating shield** of 100 HP that restores at **10 HP/second** when she hasn't taken damage for **3 seconds**. Visual: red translucent bubble.

**Phase 2 (60%–25% HP):**

- **Blood Rain:** Every **8 seconds**, rains blood droplets in a **300px radius** area centered on the player's position (drops fall over 1.5s, each droplet deals 10 damage, ~15 droplets). Telegraphed: **1s** of red circle on ground at target area. Droplets heal the Countess **2 HP each** if they hit the player.
- **Blood Lance** now fires **3 lances in a fan** (30° spread).
- Shield regeneration increases to **20 HP/second**.

**Phase 3 (25%–0% HP):**

- **Crimson Fury:** Countess gains **+50% speed**, eyes blaze red. Swoops toward the player every **3 seconds**, dealing **20 contact damage** per pass. Swoop covers **300px** in 0.5s.
- **Blood Rain** becomes **constant** (lower density: ~5 droplets every 2 seconds in a 200px area around player).
- Shield is **removed** — she trades defense for offense.

**Drop:** Treasure Chest (15–25 coins, 2–3 weapon upgrades), 50 flat coins.

---

### Boss 3 — THE ELDER LICH MALACHAR (Minute 15:00)

> *An ancient skeletal sorcerer floating above a runic circle, phylactery orbs spinning around it.*

| Stat | Value |
|---|---|
| HP | 4,500 |
| Speed | 70 px/s (teleporting) |
| Size | 2× standard enemy |
| Armor | 5 |

**Special Mechanic — 3 Phylacteries:**
Malachar has **3 phylactery orbs** orbiting him at different distances (150px, 250px, 350px). Each has **200 HP**. While any phylactery is alive, Malachar takes **50% reduced damage**. Destroying all 3 removes the damage reduction. Phylacteries also fire their own attacks (see below).

**Core Behavior:**
- **Teleport:** Every **6 seconds**, Malachar **teleports** to a random position **300–500px** from the player with a **0.5s fade-out/fade-in**. Leaves a **dark explosion** at departure point (100px radius, 15 damage).
- **Soul Barrage:** Every **3 seconds**, fires **3 homing soul orbs** (speed 150, damage 20 each, tracking for 4 seconds then dissipate). Orbs are destroyable (5 HP each).
- **Mass Resurrection:** Every **20 seconds**, all enemies killed in the last 20 seconds within **500px** are resurrected at **30% HP** (max 15 enemies). Destroying the **inner phylactery** disables this ability.

**Phylactery Behaviors:**
- **Inner Orb (150px orbit):** Enables Mass Resurrection. Fires a **continuous beam** at the player when within 200px (8 damage/tick, 4 ticks/second). Beam is visible as a purple line.
- **Middle Orb (250px orbit):** Every **5 seconds**, creates a **gravity well** at the player's position that pulls the player toward it for **2 seconds** (pull force 60 px/s). Well is 80px radius, visible as a dark purple vortex.
- **Outer Orb (350px orbit):** Every **4 seconds**, fires a **ring of 8 projectiles** outward (damage 12 each, speed 160). Creates a bullet-hell pattern.

**Enrage (below 20% HP):**
- All attack speeds doubled.
- Teleport every **3 seconds**.
- Soul Barrage fires **6 orbs**.
- Any destroyed phylacteries are **resurrected** once at **100 HP** each.

**Drop:** Treasure Chest (20–25 coins, 3 weapon upgrades), 75 flat coins.

---

### Boss 4 — TERMINUS, THE UNDYING (Minute 20:00 — Final Boss)

> *A colossal amalgamation of every fallen enemy — a towering mass of bone, shadow, and screaming faces.*

| Stat | Value |
|---|---|
| HP | 8,000 |
| Speed | 50 px/s (walking) / 300 px/s (charges) |
| Size | 5× standard enemy |
| Armor | 8 |

**Special Mechanic — Adaptive Resistance:**
Terminus tracks the **damage type that has dealt the most damage** to it every **15 seconds** and gains **50% resistance** to that damage type for the next 15 seconds. This encourages weapon diversity. Damage types: Melee, Projectile, AoE, DoT, Summon.

**Phase 1 — The Maw (100%–70% HP):**
- **Crushing Advance:** Walks toward player. Contact deals **40 damage** per hit (due to size, hard to avoid at close range).
- **Consume:** Every **10 seconds**, **inhales** for **2 seconds**, pulling the player toward him (**pull force 120 px/s**) and pulling all XP gems/coins toward him (destroying them). If the player touches Terminus during inhale, takes **60 damage**. Telegraphed: mouth-like cavity on body opens, suction particles appear.
- **Spawn Amalgamation:** Every **8 seconds**, one of Terminus's body-parts detaches and becomes a random **Tier 3–4 enemy**. Up to 5 spawned this way at a time.

**Phase 2 — The Storm (70%–35% HP):**
- **Void Zones:** Every **6 seconds**, slams the ground, creating **3 void zones** at random positions within 400px of the player. Each zone is **100px radius**, deals **15 damage/second**, and lasts **8 seconds**. Max 9 zones active at once. Telegraphed: dark circles appear on ground **1 second** before activating.
- **Tendril Sweep:** Every **5 seconds**, extends **4 tendrils** (each 300px long, 30px wide) that sweep in a **90° rotation** over **1 second**. Tendrils deal **25 damage**. Telegraphed: tendrils slowly extend outward over **0.8s** before sweeping.
- **Adaptive Resistance** now resets every **10 seconds** (faster cycling).

**Phase 3 — The End (35%–0% HP):**
- **All regular enemy spawning stops.** The map goes dark.
- Terminus gains **+100% speed** (100 px/s base).
- **Death Spiral:** Terminus continuously orbits the player at **200px radius**, closing to **100px** over **20 seconds**. Contact damage increased to **50**.
- **Soul Storm:** A permanent vortex of projectiles orbits Terminus (12 projectiles at 250px radius, 15 damage each, rotating at 180°/second). Creates a bullet-hell avoidance pattern.
- **Final Consume:** At **10% HP**, performs one final massive inhale (pull force 200 px/s, 3 seconds). If survived, Terminus staggers for **5 seconds** (takes 2× damage, stops moving).
- **On defeat:** All enemies on screen die. Massive XP/coin explosion. Victory screen triggers.

**Drop:** 100 flat coins, guaranteed **3 Treasure Chests** (each: 25 coins, 2–3 weapon upgrades). Unlocks Hemomancer class if not already unlocked.

---

## 11. Wave Timeline & Director System

The game uses a **Wave Director** that controls spawn rates, enemy composition, and intensity based on elapsed time. Below is the full 20-minute timeline.

### Spawn Budget System

Every second, the director has a **spawn budget** that determines how many "threat points" of enemies can spawn:

```
budget_per_second(t) = 2 + (t_minutes × 1.5) + (t_minutes² × 0.15)
```

| Time | Budget/sec | Approx Enemies/sec |
|---|---|---|
| 0:00 | 2.0 | ~2 Shamblers |
| 2:00 | 5.6 | ~3–4 mixed |
| 5:00 | 13.3 | ~5–8 mixed |
| 8:00 | 23.6 | ~8–12 mixed |
| 10:00 | 32.0 | ~10–16 mixed |
| 12:00 | 42.0 | ~12–20 mixed |
| 15:00 | 58.3 | ~15–25 mixed |
| 18:00 | 78.0 | ~20–35 mixed |
| 20:00 | 92.0 | ~25–40 mixed |

### Enemy Threat Points

| Enemy | Threat Cost |
|---|---|
| Shambler | 1 |
| Bat | 1 |
| Swarm Rat | 0.5 |
| Skeleton Warrior | 2 |
| Ghost | 2 |
| Cultist | 3 |
| Werewolf | 4 |
| Witch | 4 |
| Shadow | 3 |
| Bone Golem | 6 |
| Plague Bearer | 4 |
| Vampire Noble | 7 |
| Arcane Construct | 5 |
| Death Knight | 8 |
| Banshee | 6 |
| Lich | 10 |

### Detailed Wave Timeline

| Time | Event | Enemy Composition |
|---|---|---|
| 0:00–1:00 | **Calm start** | Shamblers only. Low density. Let player acclimate. |
| 1:00–2:00 | **First swarm** | Shamblers + Bats. Bat packs of 3–5 every 10 seconds. |
| 2:00–3:00 | **Tier 2 intro** | Skeleton Warriors begin spawning (1 per 8 seconds). Shamblers increase. |
| 3:00–4:00 | **Ghost arrival** | Ghosts appear (1 per 10 seconds). First mixed groups. |
| 4:00–5:00 | **Pre-boss ramp** | All Tier 1–2 enemies. Density spikes by 30% for 30 seconds before boss. |
| **5:00** | **BOSS: The Hollow King** | Boss spawns. Regular enemies continue at 70% rate. |
| 5:00–6:00 | **Post-boss recovery** | Enemy spawn rate drops to 50% for 30 seconds after boss dies, then resumes. |
| 6:00–7:00 | **Tier 3 intro** | Werewolves (1 per 12s), Cultists (1 per 10s) begin. Swarm Rats debut (pack every 15s). |
| 7:00–8:00 | **Escalation** | All Tier 1–3 active. Bat swarms increase. Cultist pairs start appearing. |
| 8:00–9:00 | **Tier 4 intro** | Witches appear (1 per 20s). Bone Golems (1 per 25s). Shadows (1 per 15s). |
| 9:00–10:00 | **Pre-boss ramp** | Density spikes 40%. Witch+Werewolf combos. Double Bone Golem spawns. |
| **10:00** | **BOSS: The Crimson Countess** | Boss spawns. Regular enemies at 60% rate during fight. |
| 10:00–11:00 | **Post-boss recovery** | Spawn rate drops to 40% for 30 seconds. |
| 11:00–12:00 | **Pressure builds** | All Tier 1–4 active. Multiple Witches at once. Shadow packs of 2–3. |
| 12:00–13:00 | **Tier 5 intro** | Vampire Nobles appear (1 per 30s). Arcane Constructs (1 per 20s). |
| 13:00–14:00 | **Nightmare fuel** | Plague Bearers arrive (1 per 15s). Poison zones dominate the map. |
| 14:00–15:00 | **Pre-boss ramp** | Density spikes 50%. Vampire Noble + Witch combos. Triple Cultist formations. |
| **15:00** | **BOSS: Elder Lich Malachar** | Boss spawns. Regular enemies at 50% rate. |
| 15:00–16:00 | **Post-boss recovery** | Spawn rate drops to 30% for 30 seconds. |
| 16:00–17:00 | **Tier 6 intro** | Death Knights appear (1 per 25s). Banshees (1 per 30s). |
| 17:00–18:00 | **Hellscape** | All enemy types active. Lich appears (1 per 45s). Multiple Banshees possible. |
| 18:00–19:00 | **Maximum pressure** | Spawn budget at near-max. Wave compositions actively target player weaknesses. |
| 19:00–19:50 | **Final crescendo** | Budget at maximum. Every 10 seconds, a "surge" of 30+ Tier 1 enemies + 3–5 Tier 4–5 enemies simultaneously. |
| 19:50–20:00 | **Calm before the storm** | All enemies freeze for 2 seconds. Screen darkens. |
| **20:00** | **BOSS: Terminus, The Undying** | Final boss spawns. Regular enemy spawning resumes at 60% during Phase 1–2, stops in Phase 3. |

### Max Enemies On Screen

To maintain performance, a **hard cap of 300 active enemies** exists. When the cap is reached, new spawns are blocked until existing enemies are killed. Tier 1 enemies are despawned first (farthest from player) to make room for higher-tier spawns.

---

## 12. Double Time Mode

**Unlock Condition:** Complete a full 20:00 run on standard mode with any class.

### Mechanics

- **All game systems run at 2× speed:** enemy spawns, enemy movement, projectile speeds, cooldowns, XP gem values, coin drops, boss timers — everything.
- **Player movement speed is 1.6× normal** (not full 2×, to increase difficulty).
- **Game clock runs at 2× speed:** a "20-minute" run completes in **real-time 10 minutes**.
- **Damage values are unchanged** — the danger comes from density and speed, not raw numbers.
- **All coin rewards are multiplied by 1.5×** at end-of-run payout.

### Balance Considerations

Double Time is intended as a **high-skill farming mode** for experienced players. The primary difficulty increase comes from:

1. Needing to process and react at 2× speed
2. Player movement not fully keeping pace with enemies
3. Boss attack patterns being twice as fast (tighter dodge windows)
4. Level-up choices come faster (less deliberation time)

### Double Time Specific Adjustments

- Boss HP is reduced by **15%** (since the player has less real-time to deal damage)
- Food pickup healing increased to **25% Max HP** (survivability compensation)
- Treasure chest coin range increased to **15–30** (reward incentive)

---

## 13. Difficulty Scaling Formulas

All enemies receive stat scaling based on elapsed time to maintain challenge against the player's growing power.

### HP Scaling

```
enemy_hp(t) = base_hp × (1 + (t_minutes × 0.12) + (t_minutes² × 0.008))
```

| Time | HP Multiplier | Example: Shambler HP |
|---|---|---|
| 0:00 | 1.00× | 8 |
| 5:00 | 1.80× | 14 |
| 10:00 | 3.00× | 24 |
| 15:00 | 4.60× | 37 |
| 20:00 | 6.60× | 53 |

### Damage Scaling

```
enemy_damage(t) = base_damage × (1 + (t_minutes × 0.06))
```

| Time | Damage Multiplier |
|---|---|
| 0:00 | 1.00× |
| 5:00 | 1.30× |
| 10:00 | 1.60× |
| 15:00 | 1.90× |
| 20:00 | 2.20× |

Damage scales more slowly than HP to prevent one-shot deaths and keep the game feeling fair.

### Speed Scaling

```
enemy_speed(t) = base_speed × (1 + (t_minutes × 0.015))
```

| Time | Speed Multiplier |
|---|---|
| 0:00 | 1.00× |
| 10:00 | 1.15× |
| 20:00 | 1.30× |

Speed scaling is gentle — the challenge comes from enemy variety and density, not speed alone.

### XP Gem Value Scaling

Enemies drop proportionally more XP as the game progresses:

```
xp_value(t) = base_xp × (1 + (t_minutes × 0.05))
```

This ensures the player can keep leveling at a reasonable pace even as enemies become harder.

---

## 14. Implementation Notes

### Architecture Recommendations

This document is designed to be consumed by an agentic code editor or an AI-assisted development workflow. Here are structural recommendations.

#### Entity Component System (ECS)

Recommended architecture: use an ECS pattern for enemies, projectiles, and pickups.

```
Components:
  - PositionComponent { x, y }
  - VelocityComponent { vx, vy }
  - HealthComponent { current, max, armor }
  - DamageComponent { amount, type, aoe_radius? }
  - SpriteComponent { texture, animation_state }
  - AIBehaviorComponent { behavior_type, state_machine, params }
  - SpawnTimerComponent { cooldown, elapsed }
  - DropTableComponent { xp, coin_chance, food_chance }
  - StatusEffectComponent { effects: [{ type, duration, magnitude }] }
```

#### Key Systems to Implement

1. **WaveDirector** — Manages spawn budget, enemy composition, and timeline events.
2. **WeaponSystem** — Manages cooldowns, firing patterns, evolution checks. Each weapon type is a strategy/behavior.
3. **EnemyAISystem** — Processes `AIBehaviorComponent`. Use state machines for complex enemies (Werewolf: WALK → CROUCH → POUNCE → RECOVER → WALK).
4. **CollisionSystem** — Broad-phase spatial hashing (cell size ~100px) for O(n) collision checks.
5. **PickupSystem** — XP magnet behavior, pickup range, gem values.
6. **LevelUpSystem** — XP accumulation, option generation, weapon/passive pool management.
7. **BossSystem** — Phase management, attack pattern scheduling, drop handling.
8. **DifficultyScaler** — Applies time-based multipliers to enemy stats on spawn.
9. **MetaProgressionSystem** — Persistent coin storage, upgrade application to base stats.
10. **DoubleTimeManager** — Global time scale multiplier, adjusted player speed, reward multipliers.

#### Spatial Considerations

- **Map size:** Infinite scrolling (procedural tile generation around player). Tile set: graveyard / dark forest / ruined cathedral.
- **Enemy spawn distance:** Between **600px and 900px** from the player (off-screen but not too far).
- **Enemy despawn distance:** Enemies more than **1200px** from the player are despawned and their threat cost refunded to the director.
- **Screen visible area:** ~800×600px centered on player (scale to resolution).

#### State Machines for Complex Enemies

```
WerewolfAI:
  WALK → (range < 200px) → CROUCH [1.0s] → POUNCE [0.3s] → RECOVER [0.8s] → WALK
  WALK → (pounce on cooldown) → WALK (normal chase)

BoneGolemAI:
  WALK → (timer 5s) → SLAM_WINDUP [1.0s] → SLAM [0.2s] → WALK
  ON_DEATH → SPLIT [spawn 3 × SkeletonWarrior at position]

LichAI:
  HOVER → (timer 3s) → SOUL_BARRAGE → HOVER
  HOVER → (timer 15s) → MASS_RESURRECT → HOVER
  ON_BODY_DEATH → CHECK_PHYLACTERY → (alive) → REGENERATE [3s] → HOVER
                                   → (dead) → TRUE_DEATH
```

#### Performance Targets

| Metric | Target |
|---|---|
| Max active entities | 500 (300 enemies + projectiles + pickups) |
| Frame rate | 60 FPS stable |
| Collision checks | < 2ms per frame via spatial hashing |
| Spawn processing | < 0.5ms per frame |

#### Data Format

All enemy, weapon, class, and passive data should be stored in **JSON configuration files** so they can be tuned without code changes:

```
/data/
  enemies.json       -- All enemy definitions, stats, behaviors
  weapons.json       -- Weapon stats, level scaling, evolution map
  passives.json      -- Passive item stats and evolution links
  classes.json       -- Class definitions, stat modifiers, abilities
  bosses.json        -- Boss definitions, phases, attack patterns
  waves.json         -- Wave timeline, spawn compositions
  meta_upgrades.json -- Shop items, costs, effects
  economy.json       -- Coin sources, payout formulas
  scaling.json       -- Difficulty curve parameters
```

---

*End of Game Design Document — v1.0*
