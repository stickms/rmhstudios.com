# Altair - Game Balance Reference

Complete reference of all game stats, systems, and balance values.

---

## Table of Contents

- [Classes & Abilities](#classes--abilities)
- [Weapons](#weapons)
- [Evolved Weapons](#evolved-weapons)
- [Passive Items](#passive-items)
- [Enemies](#enemies)
- [Bosses](#bosses)
- [Wave Timeline](#wave-timeline)
- [Difficulty Scaling](#difficulty-scaling)
- [Player Stats & Caps](#player-stats--caps)
- [Level-Up & XP System](#level-up--xp-system)
- [Pickup System](#pickup-system)
- [Meta Shop & Upgrades](#meta-shop--upgrades)
- [Class Unlocks](#class-unlocks)
- [Multiplayer Scaling](#multiplayer-scaling)

---

## Classes & Abilities

### Knight (Easy, Starting)

| Stat | Value |
|------|-------|
| Starting Weapon | Broad Sword |
| Max HP | 120 |
| HP Regen | 0 |
| Move Speed | 195 |
| Might | 1.0 |
| Attack Speed | 1.0 |
| Area | 1.0 |
| Proj Count | 0 |
| Proj Speed | 1.0 |
| Duration | 1.0 |
| Pickup Range | 50 |
| Luck | 1.0 |
| Armor | 1 |
| CDR | 1.0 |
| Revival | 0 |
| Growth | 1.0 |

**Ability 1 - Shield Wall** (25s CD, Level 1)
- Grants shield absorbing 30 damage (+10 per player level milestone at 10, 20, 30)
- Shield lasts 8 seconds or until broken
- Affected by CDR

**Ability 2 - Rally Cry** (45s CD, Level 10)
- Battle shout in 250px radius (affected by Area)
- Stuns enemies for 1.5 seconds
- Deals 50 damage (affected by Might)
- Knight gains +15% Move Speed for 5 seconds

---

### Arcanist (Medium, Starting)

| Stat | Value |
|------|-------|
| Starting Weapon | Arcane Bolt |
| Max HP | 80 |
| HP Regen | 0 |
| Move Speed | 190 |
| Might | 1.2 |
| Attack Speed | 1.0 |
| Area | 1.15 |
| Proj Count | 0 |
| Proj Speed | 1.0 |
| Duration | 1.0 |
| Pickup Range | 50 |
| Luck | 1.0 |
| Armor | 0 |
| CDR | 0.9 |
| Revival | 0 |
| Growth | 1.0 |

**Ability 1 - Mana Surge** (30s CD, Level 1)
- Next 3 weapon attacks deal 2x damage
- +50% Area
- Not affected by CDR timing

**Ability 2 - Arcane Nova** (40s CD, Level 10)
- Expanding ring of arcane energy (400px, affected by Area)
- 80 damage (affected by Might)
- Applies 30% slow for 3 seconds

---

### Ranger (Medium, Starting)

| Stat | Value |
|------|-------|
| Starting Weapon | Iron Shortbow |
| Max HP | 90 |
| HP Regen | 0 |
| Move Speed | 230 |
| Might | 1.0 |
| Attack Speed | 1.0 |
| Area | 1.0 |
| Proj Count | 1 |
| Proj Speed | 1.2 |
| Duration | 1.0 |
| Pickup Range | 75 |
| Luck | 1.0 |
| Armor | 0 |
| CDR | 1.0 |
| Revival | 0 |
| Growth | 1.0 |

**Ability 1 - Evasion Roll** (20s CD, Level 1)
- Auto-dashes 150px when enemy within 60px
- 0.5 seconds of invincibility frames
- If stationary, dashes away from nearest enemy

**Ability 2 - Hunter's Mark** (35s CD, Level 10)
- Marks strongest enemy on screen (highest current HP) for 8 seconds
- Marked enemies take +40% damage from all sources (+20% on bosses)
- Drop 3x XP

---

### Plague Doctor (Medium, Unlock: Survive 10 minutes)

| Stat | Value |
|------|-------|
| Starting Weapon | Toxic Flask |
| Max HP | 95 |
| HP Regen | 0.3 |
| Move Speed | 185 |
| Might | 1.0 |
| Attack Speed | 1.0 |
| Area | 1.1 |
| Proj Count | 0 |
| Proj Speed | 1.0 |
| Duration | 1.3 |
| Pickup Range | 50 |
| Luck | 1.0 |
| Armor | 0 |
| CDR | 1.0 |
| Revival | 0 |
| Growth | 1.0 |

**Ability 1 - Miasma Trail** (Passive, Level 1)
- Leaves poison trail (30px wide, affected by Area)
- Persists for 2 seconds (affected by Duration)
- 5 damage per tick every 0.5s (affected by Might)
- Applies 10% slow per stack, up to 3 stacks (30% max)

**Ability 2 - Pandemic** (50s CD, Level 10)
- All poisoned enemies explode
- 40% of remaining poison damage as instant AoE in 100px radius (affected by Area)
- Chains up to 3 iterations with 0.3s delay

---

### Berserker (Hard, Unlock: Kill 3,000 enemies in one run)

| Stat | Value |
|------|-------|
| Starting Weapon | War Axe |
| Max HP | 150 |
| HP Regen | 0.5 |
| Move Speed | 205 |
| Might | 0.9 |
| Attack Speed | 1.0 |
| Area | 1.0 |
| Proj Count | 0 |
| Proj Speed | 1.0 |
| Duration | 1.0 |
| Pickup Range | 50 |
| Luck | 1.0 |
| Armor | 0 |
| CDR | 1.0 |
| Revival | 0 |
| Growth | 1.0 |

**Ability 1 - Blood Rage** (Passive, Level 1)
- Gains bonus Might based on missing HP: `bonus = 0.8 * (1 - currentHp / maxHp)`
- 100% HP = +0.00x | 50% HP = +0.40x | 25% HP = +0.60x
- Below 30% HP: also gains +20% Attack Speed

**Ability 2 - Savage Slam** (30s CD, Level 10)
- Leaps to densest enemy cluster within 300px
- 120 damage (affected by Might), 180px radius (affected by Area)
- Inner 60px: enemies knocked back 100px and stunned 1s
- Invulnerable during leap (~0.6s)

---

### Necromancer (Hard, Unlock: Purchase for 1,500 coins)

| Stat | Value |
|------|-------|
| Starting Weapon | Soul Siphon |
| Max HP | 85 |
| HP Regen | 0 |
| Move Speed | 180 |
| Might | 0.85 |
| Attack Speed | 1.0 |
| Area | 1.0 |
| Proj Count | 0 |
| Proj Speed | 1.0 |
| Duration | 1.2 |
| Pickup Range | 50 |
| Luck | 1.0 |
| Armor | 0 |
| CDR | 0.85 |
| Revival | 0 |
| Growth | 1.0 |

**Ability 1 - Raise Dead** (Passive, Level 1)
- 25% chance per kill (affected by Luck) to raise skeleton minion
- Skeleton: 30 HP, 15 damage/hit (affected by Might), 1 atk/s, 180 speed, 12s duration (affected by Duration)
- Max 8 skeletons (10 at lvl 15, 12 at lvl 25)

**Ability 2 - Army of Darkness** (60s CD, Level 10)
- Summons bone wall ring (200px radius, affected by Area)
- 12 bone pillars (50 HP each), enemies touching them take 25 damage + knockback
- Lasts 6 seconds (affected by Duration)
- Skeletons inside gain +50% damage and attack speed

---

### Chronomancer (Hard, Unlock: Defeat the 15-minute boss)

| Stat | Value |
|------|-------|
| Starting Weapon | Temporal Shard |
| Max HP | 85 |
| HP Regen | 0 |
| Move Speed | 200 |
| Might | 1.0 |
| Attack Speed | 1.0 |
| Area | 1.0 |
| Proj Count | 0 |
| Proj Speed | 1.0 |
| Duration | 1.15 |
| Pickup Range | 50 |
| Luck | 1.0 |
| Armor | 0 |
| CDR | 0.8 |
| Revival | 0 |
| Growth | 1.0 |

**Ability 1 - Time Dilation Field** (Passive, Level 1)
- 150px radius aura (affected by Area), always active
- All enemies inside move and attack at 70% speed

**Ability 2 - Temporal Rewind** (50s CD, Level 10)
- Rewinds 4 seconds of position and HP history
- Teleports to previous position with whichever HP is higher
- Invulnerable during rewind (~0.3s)
- All enemies within 200px frozen for 2.5 seconds

---

### Hemomancer (Hard, Unlock: Complete a full 20:00 run)

| Stat | Value |
|------|-------|
| Starting Weapon | Crimson Whip |
| Max HP | 110 |
| HP Regen | -0.5 (passive drain) |
| Move Speed | 195 |
| Might | 1.1 |
| Attack Speed | 1.0 |
| Area | 1.0 |
| Proj Count | 0 |
| Proj Speed | 1.0 |
| Duration | 1.0 |
| Pickup Range | 50 |
| Luck | 1.1 |
| Armor | 0 |
| CDR | 1.0 |
| Revival | 0 |
| Growth | 1.0 |

**Ability 1 - Sanguine Feast** (Passive, Level 1)
- All damage dealt heals for 5% (lifesteal, after Might modifiers)
- Healing capped at 8 HP/s
- Below 50% HP: lifesteal increases to 8%

**Ability 2 - Blood Nova** (35s CD, Level 10)
- Sacrifices 15% of current HP
- Blood explosion in 250px radius (affected by Area)
- Damage = 3x HP sacrificed + 60 base (affected by Might)
- Enemies killed heal Hemomancer for 5 HP each (uncapped)

---

## Weapons

### Weapon Scaling Formula
- Damage: +15% per level (compounding) — Level 8 ~ 2.66x base
- Levels 2, 4, 6: +1 base effect (e.g., +1 projectile, +0.5s duration)
- Level 8: Evolution (if passive requirement met), otherwise +25% damage
- Damage formula: `baseDamage * Math.pow(1.15, level - 1) * might`
- Cooldown formula: `baseCooldown * cdr / attackSpeed`

| # | Weapon | Type | Base Damage | Base Cooldown | Special | Evolves Into | Required Passive |
|---|--------|------|-------------|---------------|---------|--------------|------------------|
| 1 | Broad Sword | melee_sweep | 20 | 1.2s | — | Radiant Claymore | Gauntlet |
| 2 | Arcane Bolt | homing | 18 | 1.0s | — | Arcane Barrage | Tome |
| 3 | Iron Shortbow | directional | 12 | 0.8s | — | Storm Bow | Quiver |
| 4 | Toxic Flask | lobbed_aoe | 8 | 3.5s | Pool: 2s, 8 dmg/tick | Plague Bomb | Vial |
| 5 | War Axe | circular_cleave | 28 | 1.8s | 360-degree | Cataclysm Axe | War Paint |
| 6 | Soul Siphon | beam | 10 | 0 (continuous) | Range: 100px, 10 dmg/tick | Death Ray | Skull Pendant |
| 7 | Temporal Shard | boomerang | 15 | 2.0s | Hits enemies twice (out+back) | Eternity Loop | Hourglass |
| 8 | Crimson Whip | lash | 22 | 1.4s | Range: 150px | Sanguine Scourge | Blood Ruby |
| 9 | Holy Water | ground_aoe | 6 | 3.0s | 6 dmg/tick | Divine Deluge | Sacred Charm |
| 10 | Throwing Daggers | multi_projectile | 8 | 0.6s | Random spread | Knife Storm | Sharpening Stone |
| 11 | Lightning Ring | auto_strike | 25 | 2.5s | Random bolt to nearby enemy | Thunderstorm | Conductor Coil |
| 12 | Garlic | aura | 5 | 0.5s | 80px radius, 5 dmg/tick | Soul Eater | Laurel |
| 13 | Runic Orbs | orbital | 14 | 0 (continuous) | Orbs circle player | Celestial Guard | Star Map |
| 14 | Fire Wand | direct_shot | 30 | 1.6s | Fireball random direction | Inferno Staff | Ember Ring |

---

## Evolved Weapons

| # | Evolved Weapon | Base Weapon | Base Damage | Cooldown | Special Effects |
|---|----------------|-------------|-------------|----------|-----------------|
| 1 | Radiant Claymore | Broad Sword | 30 | 1.2s | 180-degree arc, +50% damage, holy shockwave AoE every 3rd swing |
| 2 | Arcane Barrage | Arcane Bolt | 18 | 1.0s | Fires 3 bolts simultaneously, each explodes for 80px AoE on impact |
| 3 | Storm Bow | Iron Shortbow | 12 | 0.8s | Double arrow count, pierce all enemies, leave lightning trails |
| 4 | Plague Bomb | Toxic Flask | 8 | 3.5s | Pool radius doubled, enemies leaving carry poison for 4 more seconds |
| 5 | Cataclysm Axe | War Axe | 50 | 1.8s | Spin pulls enemies inward 50px, +80% damage, fire trail on ground |
| 6 | Death Ray | Soul Siphon | 10 | 0 | Range: 250px, chains to 3 enemies, 15% lifesteal |
| 7 | Eternity Loop | Temporal Shard | 15 | 2.0s | 3 shards orbit continuously, freeze enemies 0.5s on hit |
| 8 | Sanguine Scourge | Crimson Whip | 22 | 1.4s | Hits all directions, killed enemies explode for 60% max HP as AoE |
| 9 | Divine Deluge | Holy Water | 6 | 3.0s | 4 pools on random enemy clusters, heal player 2 HP/tick while standing in them |
| 10 | Knife Storm | Throwing Daggers | 8 | 0.4s | 360-degree burst every 0.4s, knives bounce off enemies once |
| 11 | Thunderstorm | Lightning Ring | 25 | 2.5s | 3 simultaneous bolts, chain to 2 nearby enemies, 0.5s stun |
| 12 | Soul Eater | Garlic | 5 | 0.5s | 200px aura, 1% of aura dmg heals, -20% enemy damage in range |
| 13 | Celestial Guard | Runic Orbs | 14 | 0 | 5 orbs, orbit speed doubled, orbs emit damaging light beams outward |
| 14 | Inferno Staff | Fire Wand | 30 | 1.6s | Fireball explodes into 6 embers, each leaves a small fire pool |

---

## Passive Items

Max 6 passives per run. Each has 5 levels.

| # | Passive | Effect Per Level | Evolves | Max Benefit |
|---|---------|-----------------|---------|-------------|
| 1 | Gauntlet | +1 Armor | Broad Sword | +5 Armor |
| 2 | Tome | +8% Area | Arcane Bolt | +40% Area |
| 3 | Quiver | +1 Projectile Count | Iron Shortbow | +5 Proj Count |
| 4 | Vial | +10% Duration | Toxic Flask | +50% Duration |
| 5 | War Paint | +5% Might | War Axe | +25% Might |
| 6 | Skull Pendant | +5% CDR | Soul Siphon | +25% CDR |
| 7 | Hourglass | +4% CDR, +4% Duration | Temporal Shard | +20% CDR, +20% Duration |
| 8 | Blood Ruby | +5% Might, +0.1 HP Regen | Crimson Whip | +25% Might, +0.5 HP Regen |
| 9 | Sacred Charm | +8% Duration, +3 HP | Holy Water | +40% Duration, +15 HP |
| 10 | Sharpening Stone | +10% Proj Speed | Throwing Daggers | +50% Proj Speed |
| 11 | Conductor Coil | +8% Area, +3% Might | Lightning Ring | +40% Area, +15% Might |
| 12 | Laurel | +8% Max HP | Garlic | +40% Max HP |
| 13 | Star Map | +1 Proj Count at lvls 3 & 5 | Runic Orbs | +2 Proj Count |
| 14 | Ember Ring | +10% Proj Speed, +3% Might | Fire Wand | +50% Proj Speed, +15% Might |
| 15 | Swift Boots | +6% Move Speed | None | +30% Move Speed |
| 16 | Magnetic Amulet | +20px Pickup Range | None | +100px Pickup Range |
| 17 | Clover | +8% Luck | None | +40% Luck |
| 18 | XP Tome | +8% Growth | None | +40% Growth |

---

## Enemies

### Tier 1 (0:00+)

| Enemy | HP | Damage | Speed | XP | Threat | Behavior | Shape/Size | Special |
|-------|-----|--------|-------|-----|--------|----------|------------|---------|
| Shambler | 8 | 10 | 80 | 1 | 1 | direct_chase | circle, r12 | — |
| Bat | 5 | 8 | 160 | 1 | 1 | sinusoidal | triangle, r8 | Wave: amplitude 40, period 1.5s |

### Tier 2 (2:00+)

| Enemy | HP | Damage | Speed | XP | Threat | Behavior | Shape/Size | Special |
|-------|-----|--------|-------|-----|--------|----------|------------|---------|
| Skeleton Warrior | 20 | 15 | 100 | 3 | 2 | melee_lunger | square, r14 | Lunge: 50px range, 70px reach, 0.3s dur, 0.5s windup, 1.5s atk interval |
| Ghost | 12 | 12 | 120 | 3 | 2 | phaser | diamond, r12 | Phase: 4s CD, 1.5s immune (still deals contact dmg) |

### Tier 3 (5:00+)

| Enemy | HP | Damage | Speed | XP | Threat | Behavior | Shape/Size | Special |
|-------|-----|--------|-------|-----|--------|----------|------------|---------|
| Werewolf | 55 | 18 | 90 | 10 | 4 | pouncer | pentagon, r18 | Pounce: 200px range, 350px/s speed, 250px dist, 1s crouch, 0.8s landing, 6s CD |
| Cultist | 25 | 12 | 70 | 8 | 3 | ranged_kiter | diamond, r12 | Preferred range: 200px, proj 200px/s, 12px size, 3s lifespan, 3s fire CD |
| Swarm Rat | 3 | 2 | 200 | 1 | 0.5 | swarm | circle, r6 | Spawns in packs of 8-12, speed variance +/-20% |

### Tier 4 (8:00+)

| Enemy | HP | Damage | Speed | XP | Threat | Behavior | Shape/Size | Special |
|-------|-----|--------|-------|-----|--------|----------|------------|---------|
| Witch | 35 | 0 | 90 | 12 | 4 | support_caster | diamond, r14 | Curse (8s CD): -15% speed 4s, 2x stack. Empower (12s CD): +25% speed, +20% dmg to allies in 200px for 5s |
| Bone Golem | 120 | 20 | 60 | 20 | 6 | tank_slammer | hexagon, r24 | Slam: 5s CD, 1s windup (50% DR), 150px shockwave, 30 dmg, 0.5s stun. Splits into 3 Skeleton Warriors on death |
| Shadow | 30 | 15 | 140 | 8 | 3 | stealth | circle, r12 | Invisible until 150px (0.3s fade). Damage reveals. Re-cloaks every 10s when >200px away |

### Tier 5 (12:00+)

| Enemy | HP | Damage | Speed | XP | Threat | Behavior | Shape/Size | Special |
|-------|-----|--------|-------|-----|--------|----------|------------|---------|
| Vampire Noble | 80 | 22 | 130 | 25 | 7 | elite_melee | pentagon, r16 | 3-hit claw combo at 100px (22 dmg each, 0.2s between). Summons 4 bats every 8s. Passive 5 HP/s lifesteal |
| Arcane Construct | 60 | 25 | 100 | 15 | 5 | elite_ranged | hexagon, r16 | Hovers at 300px. Every 4s: 1s telegraph then piercing laser (20px wide, infinite range, 0.5s dur, 25 dmg). Leading shots |
| Plague Bearer | 45 | 8 | 70 | 10 | 4 | zone_denier | circle, r16 | 40px poison trail (3s dur, 4 dmg/tick, 2 ticks/s). Death: 120px poison cloud 4s. Contact: 3 dmg/s DoT 3s |

### Tier 6 (16:00+)

| Enemy | HP | Damage | Speed | XP | Threat | Behavior | Shape/Size | Special |
|-------|-----|--------|-------|-----|--------|----------|------------|---------|
| Death Knight | 150 | 35 | 110 | 25 | 8 | heavy_melee | star, r20 | Swing: 2s CD, 140-deg arc, 100px. Shockwaves: 6s CD, 4 directions (N/S/E/W), 30px wide, 300px range, 20 dmg. Armor 3, drops Food |
| Banshee | 40 | 10 | 150 | 12 | 6 | disabler | diamond, r14 | Phases through enemies. Wailing Scream: 7s CD, 1.5s windup, disables player weapons 2s in 400px. Kill during windup cancels |
| Lich | 100 | 20 | 60 | 30 | 10 | necro_caster | star, r16 | Stays at 350px. Fan: 5s CD, 5 projs in 60-deg arc, 20 dmg, 180 speed. Resurrect: 15s CD, up to 3 dead enemies at 50% HP. Phylactery: 30 HP, regens 50% over 3s |

---

## Bosses

### Boss 1 — The Hollow King (5:00)

| Stat | Value |
|------|-------|
| HP | 800 |
| Speed | 85 |
| Size | 3x |
| Armor | 2 |
| Drops | 25 coins, 15-25 chest coins, 1-2 weapon upgrades |

**Phase 1:**
- **Cleave** (3s CD): 180-deg arc, 150px range, 30 damage, 0.8s windup
- **Summon Shambler Guard** (12s CD): 8 Shamblers in circle
- **Bone Spikes** (8s CD): 5 spikes 40px apart, 0.2s intervals, 0.6s telegraph, 20 damage

**Phase 2 (50% HP):**
- **Cleave Enhanced** (3s CD): 270-deg arc, 40 damage
- **Death March** (15s CD): Charges at 250px/s for 400px max, bone spike trail (3s persist, 15 dmg), 1.2s telegraph
- Modifiers: +30% speed, +15% all enemy speed

---

### Boss 2 — The Crimson Countess (10:00)

| Stat | Value |
|------|-------|
| HP | 2,000 |
| Speed | 100 |
| Size | 2.5x |
| Armor | 3 |
| Drops | 50 coins, 15-25 chest coins, 2-3 weapon upgrades |

**Phase 1:**
- **Blood Lance** (4s CD): Projectile at 280px/s, pierces, 25 damage, 0.6s telegraph
- **Bat Cloud** (10s CD): 12 bats (3 HP each), 5s lifespan, loose homing, 5 damage
- Shield: 100 HP, regens 10 HP/s after 3s delay

**Phase 2 (60% HP):**
- **Blood Lance Fan** (4s CD): 3 lances in 30-deg spread, 25 damage each
- **Blood Rain** (8s CD): ~15 droplets over 1.5s in 300px radius, 1s telegraph, 10 damage, heals boss 2 HP if hits player
- Shield regen: 20 HP/s after 3s delay

**Phase 3 (25% HP):**
- **Crimson Fury** (3s CD): Swoops 300px in 0.5s, 20 damage
- **Blood Rain Constant** (2s CD): 5 droplets per 2s in 200px radius, 10 damage
- +50% speed, shield removed

---

### Boss 3 — Elder Lich Malachar (15:00)

| Stat | Value |
|------|-------|
| HP | 4,500 |
| Speed | 70 |
| Size | 2x |
| Armor | 5 |
| Drops | 75 coins, 20-25 chest coins, 3 weapon upgrades |

**Main Phase:**
- **Teleport** (6s CD): 300-500px away, 0.5s fade, dark explosion at departure (100px radius, 15 damage)
- **Soul Barrage** (3s CD): 3 homing soul orbs, 150px/s, track 4s, 5 HP each (destroyable), 20 damage per orb
- **Mass Resurrection** (20s CD): Up to 15 enemies at 30% HP within 500px (disabled if inner phylactery destroyed)

**Phylacteries (3):**
- Inner: 200 HP, 150px orbit, 32 DPS beam within 200px range
- Middle: 200 HP, 250px orbit, gravity well (5s CD, 2s dur, 60px/s pull, 80px radius)
- Outer: 200 HP, 350px orbit, ring of 8 projectiles (4s CD, 12 dmg each, 160px/s)

**Enrage (20% HP):**
- All attacks doubled in speed
- Teleport every 3s
- Soul Barrage: 6 orbs
- Mass Resurrection CD halved to 10s
- Resurrected phylactery: 100 HP

---

### Boss 4 — Terminus, The Undying (20:00) — FINAL BOSS

| Stat | Value |
|------|-------|
| HP | 8,000 |
| Speed | 50 |
| Size | 5x |
| Armor | 8 |
| Drops | 100 coins, 25 chest coins, 2-3 weapon upgrades |

**Phase 1 — The Maw:**
- **Crushing Advance** (continuous): Contact deals 40 damage per hit
- **Consume** (10s CD): 2s inhale, pulls player at 120px/s, destroys XP/coins, contact 60 damage
- **Spawn Amalgamation** (8s CD): Detaches body part as random Tier 3-4 enemy, max 5 spawned

**Phase 2 — The Storm (70% HP):**
- **Void Zones** (6s CD): 3 zones at random 400px positions, 100px radius, 15 DPS, 8s duration, max 9 active, 1s telegraph
- **Tendril Sweep** (5s CD): 4 tendrils (300px long, 30px wide), 90-deg sweep over 1s, 25 damage, 0.8s telegraph
- Adaptive resistance: every 10s gains 50% DR to most-used damage type

**Phase 3 — The End (35% HP):**
- **Death Spiral** (continuous): Orbits player at 200px, closes to 100px over 20s, 50 damage
- **Soul Storm** (continuous): 12 projectiles orbiting at 250px, rotating 180 deg/s, 15 damage
- **Final Consume** (at 10% HP): 3s inhale, 200px/s pull. If survived: staggers 5s (2x damage, stops moving)
- Regular enemy spawning stops (60% to 0%)

---

## Wave Timeline

### Minutes 0:00–5:00
| Time | Enemies | Spawn Rate |
|------|---------|------------|
| 0:00–1:00 | Shamblers only | 1.0x |
| 1:00–2:00 | Shamblers + Bats | 1.0x |
| 2:00–3:00 | + Skeleton Warriors | 1.0x |
| 3:00–4:00 | + Ghosts | 1.0x |
| 4:00–5:00 | Pre-boss ramp | 1.3x |
| **5:00** | **BOSS: The Hollow King** | — |

### Minutes 5:00–10:00
| Time | Enemies | Spawn Rate |
|------|---------|------------|
| 5:00–5:30 | Post-boss recovery | 0.5x |
| 5:30–6:00 | + Werewolves, Cultists, Swarm Rats (Tier 3) | 1.0x |
| 6:00–7:00 | All Tier 1-3 | 1.0x |
| 7:00–8:00 | + Witches, Bone Golems, Shadows (Tier 4) | 1.0x |
| 8:00–10:00 | Pre-boss ramp | 1.4x |
| **10:00** | **BOSS: The Crimson Countess** | — |

### Minutes 10:00–15:00
| Time | Enemies | Spawn Rate |
|------|---------|------------|
| 10:00–10:30 | Post-boss recovery | 0.4x |
| 10:30–12:00 | All Tier 1-4 | 1.0x |
| 12:00–13:00 | + Vampire Nobles, Arcane Constructs (Tier 5) | 1.0x |
| 13:00–14:00 | + Plague Bearers | 1.0x |
| 14:00–15:00 | Pre-boss ramp | 1.5x |
| **15:00** | **BOSS: Elder Lich Malachar** | — |

### Minutes 15:00–20:00
| Time | Enemies | Spawn Rate |
|------|---------|------------|
| 15:00–15:30 | Post-boss recovery | 0.3x |
| 15:30–17:00 | + Death Knights, Banshees (Tier 6) | 1.0x |
| 17:00–18:00 | + Liches | 1.0x |
| 18:00–19:00 | Maximum pressure | 1.0x |
| 19:00–19:50 | Final crescendo: surge every 10s (30+ Tier 1 + 3-5 Tier 4-5) | 1.0x |
| 19:50–20:00 | Calm before the storm (0x spawn, enemies freeze 2s, screen darkens) | 0x |
| **20:00** | **BOSS: Terminus, The Undying** | — |

**Max Active Enemies:** 300

---

## Difficulty Scaling

### HP Scaling (Quadratic)

Formula: `1 + timeMinutes * 0.12 + timeMinutes^2 * 0.008`

| Time | Multiplier |
|------|-----------|
| 0:00 | 1.00x |
| 5:00 | 1.80x |
| 10:00 | 3.00x |
| 15:00 | 4.60x |
| 20:00 | 6.60x |

### Damage Scaling (Linear)

Formula: `1 + timeMinutes * 0.06`

| Time | Multiplier |
|------|-----------|
| 0:00 | 1.00x |
| 5:00 | 1.30x |
| 10:00 | 1.60x |
| 15:00 | 1.90x |
| 20:00 | 2.20x |

### Speed Scaling (Gentle Linear)

Formula: `1 + timeMinutes * 0.015`

| Time | Multiplier |
|------|-----------|
| 0:00 | 1.00x |
| 10:00 | 1.15x |
| 20:00 | 1.30x |

### XP Scaling

Formula: `1 + timeMinutes * 0.05`

| Time | Multiplier |
|------|-----------|
| 0:00 | 1.00x |
| 10:00 | 1.50x |
| 20:00 | 2.00x |

### Spawn Budget (Threat Points Per Second)

Formula: `2 + timeMinutes * 1.5 + timeMinutes^2 * 0.15`

| Time | Threat/sec |
|------|-----------|
| 0:00 | 2.0 |
| 2:00 | 5.6 |
| 5:00 | 13.3 |
| 8:00 | 23.6 |
| 10:00 | 32.0 |
| 12:00 | 42.0 |
| 15:00 | 58.3 |
| 18:00 | 78.0 |
| 20:00 | 92.0 |

---

## Player Stats & Caps

### Base Stats (Global Default)

| Stat | Default | Soft Cap | Hard Cap |
|------|---------|----------|----------|
| Max HP | 100 | — | — |
| HP Regen | 0 HP/s | — | — |
| Move Speed | 200 px/s | 350 | 500 |
| Might | 1.0x | 3.0x | 5.0x |
| Attack Speed | 1.0x | 2.5x | 4.0x |
| Area | 1.0x | 3.0x | 5.0x |
| Proj Count | 0 | 5 | 8 |
| Proj Speed | 1.0x | — | — |
| Duration | 1.0x | — | — |
| Pickup Range | 50 px | — | — |
| Luck | 1.0x | — | — |
| Armor | 0 | 10 | 20 |
| CDR | 1.0x | 0.5x | 0.25x |
| Revival | 0 | — | 3 |
| Growth | 1.0x | 3.0x | 5.0x |

> After soft cap, scaling becomes logarithmic. Hard caps are absolute maximums.

---

## Level-Up & XP System

### XP Required Per Level

Formula: `5 + level * 3 + level^2 * 0.4`

| Level | XP Required |
|-------|-------------|
| 1 → 2 | 9 |
| 2 → 3 | 16 |
| 5 → 6 | 40 |
| 10 → 11 | 95 |
| 20 → 21 | 245 |

### Level-Up Constants

| Setting | Value |
|---------|-------|
| Max weapons per run | 6 |
| Max passives per run | 6 |
| Max weapon level | 8 |
| Max passive level | 5 |
| Gold per level-up choice | 25 coins |
| Choices per level-up | 3 (4 with Extra Choice) |
| Base rerolls | 2 |
| Base banishes | 2 |

---

## Pickup System

### XP Gem Values

| Gem | XP Value |
|-----|----------|
| Small | 1 |
| Medium | 5 |
| Large | 25 |

### Drop Chances (per enemy death)

| Pickup | Chance | Effect |
|--------|--------|--------|
| Coin | 3% x Luck | Currency |
| Food | 2% x Luck | Heals 20% max HP |
| Magnet | 0.5% | Attracts all pickups at 400px/s |
| Vacuum | 0.2% | Collects all on-screen pickups |
| Rosary | 0.1% | Kills all on-screen enemies |
| Chest | 0.1% | Contains upgrades |
| Clock | 0.3% | 5s slow to all nearby enemies |
| Shield Orb | 0.2% | Grants 30 HP shield |
| Bomb | 0.2% | 200px radius, 50 damage |

---

## Meta Shop & Upgrades

**Currency:** Coins (persistent across runs)

### Coin Earning Sources

| Source | Amount |
|--------|--------|
| Enemy drops | 3% chance x Luck (~1 coin each) |
| Boss: Hollow King (5:00) | 25 coins + 15-25 chest |
| Boss: Crimson Countess (10:00) | 50 coins + 15-25 chest |
| Boss: Elder Lich Malachar (15:00) | 75 coins + 20-25 chest |
| Boss: Terminus (20:00) | 100 coins + 25 chest |
| Treasure chests | 10 + (minutes x 2) coins |
| Survival bonus | 1 coin per 15 seconds |
| 500 kills milestone | 10 coins |
| 1,500 kills milestone | 25 coins |
| 3,000 kills milestone | 50 coins |
| 5,000 kills milestone | 100 coins |
| Full 20:00 completion | 100 coins |
| First clear per class | 200 coins (one-time) |

### Coin Calculation Formula

```
subtotal = enemyDrops + bossKills + chests + survivalBonus + milestones + completionBonus + firstClearBonus
final = floor(subtotal x greedMultiplier x doubleTimeMultiplier)

greedMultiplier = 1 + (greedLevel x 0.1)
doubleTimeMultiplier = doubleTime ? 1.5 : 1.0
```

### Meta Upgrades (13 Total)

**Total cost to max everything: ~16,700 coins**

| # | Upgrade | Max Lvl | Cost Per Level | Total Cost | Effect Per Level | Max Benefit |
|---|---------|---------|----------------|------------|------------------|-------------|
| 1 | Max HP Up | 5 | 50, 100, 200, 350, 500 | 1,200 | +10% Max HP | +50% Max HP |
| 2 | HP Regen | 5 | 75, 150, 250, 400, 600 | 1,475 | +0.2 HP/s | +1.0 HP/s |
| 3 | Might Up | 5 | 100, 200, 350, 500, 750 | 1,900 | +5% Might | +25% Might |
| 4 | Move Speed Up | 5 | 50, 100, 150, 250, 400 | 950 | +5% Move Speed | +25% Move Speed |
| 5 | Pickup Range Up | 5 | 25, 50, 100, 150, 200 | 525 | +20px Range | +100px Range |
| 6 | Growth Up | 5 | 100, 200, 350, 500, 750 | 1,900 | +8% Growth | +40% Growth |
| 7 | Greed | 5 | 150, 300, 500, 750, 1,000 | 2,700 | +10% Coin Gain | +50% Coin Gain |
| 8 | Luck Up | 5 | 100, 200, 350, 500, 750 | 1,900 | +10% Luck | +50% Luck |
| 9 | Armor Up | 3 | 200, 400, 700 | 1,300 | +1 Armor | +3 Armor |
| 10 | Revival | 1 | 1,000 | 1,000 | +1 Revival | 1 free revive per run |
| 11 | Reroll | 3 | 100, 250, 500 | 850 | +1 Reroll/run | 5 total (base 2 + 3) |
| 12 | Banish | 3 | 100, 250, 500 | 850 | +1 Banish/run | 5 total (base 2 + 3) |
| 13 | Extra Choice | 1 | 2,000 | 2,000 | +1 Level-up option | 4 choices (from 3) |

### Special Unlocks

| Unlock | Condition | Cost |
|--------|-----------|------|
| Double Time Mode | Complete a full 20:00 run | Free |
| Double Time Effect | 2x game speed, 1.5x coin multiplier | — |

---

## Class Unlocks

| Class | Difficulty | Unlock Condition |
|-------|-----------|------------------|
| Knight | Easy | Starting (free) |
| Arcanist | Medium | Starting (free) |
| Ranger | Medium | Starting (free) |
| Plague Doctor | Medium | Survive 10 minutes |
| Berserker | Hard | Kill 3,000 enemies in one run |
| Necromancer | Hard | Purchase for 1,500 coins |
| Chronomancer | Hard | Defeat the 15-minute boss |
| Hemomancer | Hard | Complete a full 20:00 run |

---

## Multiplayer Scaling

### Enemy Scaling by Player Count

| Stat | Formula | 1P | 2P | 3P | 4P |
|------|---------|-----|-----|-----|-----|
| Enemy HP | 1 + (n-1) x 0.65 | 1.00x | 1.65x | 2.30x | 2.95x |
| Enemy Damage | 1 + (n-1) x 0.10 | 1.00x | 1.10x | 1.20x | 1.30x |
| Spawn Budget | 1 + (n-1) x 0.50 | 1.00x | 1.50x | 2.00x | 2.50x |
| Boss HP | 1 + (n-1) x 0.80 | 1.00x | 1.80x | 2.60x | 3.40x |
| Max Enemies | — | 300 | 400 | 475 | 550 |
| Coin Drop Rate | — | 3.0% | 2.5% | 2.2% | 2.0% |

### Revival System (Multiplayer)

| Setting | Value |
|---------|-------|
| Down timer | 15s (7.5s in Double Time) |
| Channel range | 80px proximity |
| Channel duration | 3s (real-time) |
| Restored HP | 40% of max |
| Post-revive invuln | 2s |
| Heroic Rescue buff | +10% Might for reviver, 15s |

### Other Multiplayer Constants

| Setting | Value |
|---------|-------|
| XP Trickle (distant players) | 0.5 x avg team level per second |
| AFK flag time | 30s no input |
| AFK kick time | 60s no input |
| Drop-in invuln | 3s |
| Drop-in level | avg team level - 2 (min 1) |
| Spectator coin rate | 1 per 30s (vs 15s alive) |
| Boss leash range | 2,000px |
| Scaling decrease (player leaves) | 15s transition |
| Scaling increase (player joins) | 10s transition |

---

## Engine Constants

| Constant | Value |
|----------|-------|
| Player radius | 12px |
| Position history duration | 4.0s (Chronomancer rewind) |
| Camera lerp speed | 5.0 |
| Minimap range | 2,000 world units |
