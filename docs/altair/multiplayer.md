# ALTAIR — Multiplayer Integration Document

> **Companion to:** Game Design Document v1.0
> **Mode:** Co-op PvE (2–4 players)
> **Networking Model:** Client-authoritative with host validation (peer-to-peer) or dedicated server
> **Philosophy:** Drop-in fun. Everyone keeps their own progression. No penalties, no splits, no friction.

---

## Table of Contents

1. [Multiplayer Philosophy](#1-multiplayer-philosophy)
2. [Session & Lobby System](#2-session--lobby-system)
3. [Economy — Individual Progression](#3-economy--individual-progression)
4. [Player Scaling & Difficulty](#4-player-scaling--difficulty)
5. [XP & Leveling](#5-xp--leveling)
6. [Pickup Behavior](#6-pickup-behavior)
7. [Revival & Death](#7-revival--death)
8. [Class Synergies & Interaction Rules](#8-class-synergies--interaction-rules)
9. [Boss Encounter Adjustments](#9-boss-encounter-adjustments)
10. [Wave Director Multiplayer Tuning](#10-wave-director-multiplayer-tuning)
11. [Camera & Viewport](#11-camera--viewport)
12. [UI & HUD](#12-ui--hud)
13. [Communication Systems](#13-communication-systems)
14. [Double Time Mode (Multiplayer)](#14-double-time-mode-multiplayer)
15. [Anti-Grief & Edge Cases](#15-anti-grief--edge-cases)
16. [Networking Architecture](#16-networking-architecture)
17. [Implementation Notes](#17-implementation-notes)

---

## 1. Multiplayer Philosophy

The guiding design principle is **"play together for fun."** Multiplayer should feel like inviting a friend to sit on the couch next to you — no negotiation over loot, no arguing about who gets what, no feeling like you're losing out by not playing solo.

### Core Tenets

1. **Individual economies.** Every player earns their own coins, keeps their own meta-progression, and unlocks their own classes independently. Nothing is shared, split, or competed for.
2. **Additive, not divisive.** Multiplayer should feel like a strict upgrade to the experience — more chaos, more fun, more satisfying combos. Never a downgrade.
3. **Zero friction.** No mandatory roles, no team composition requirements, no "you need a healer." Any combination of classes should be viable.
4. **No carry obligation.** A new player with no meta upgrades should not feel like a burden alongside a maxed-out veteran. Scaling handles this.
5. **Drop-in, drop-out.** Players can join mid-run and leave without crashing the session. The game adapts in real time.

---

## 2. Session & Lobby System

### Lobby Creation

| Setting | Options | Default |
|---|---|---|
| Max players | 2 / 3 / 4 | 4 |
| Visibility | Public / Friends Only / Private (code) | Friends Only |
| Double Time | On / Off | Off |
| Drop-in allowed | Yes / No | Yes |
| Drop-in window | First 5 min / First 10 min / Anytime | First 10 min |

### Session Flow

```
HOST creates lobby → Selects settings → Shares invite code or opens to friends
GUESTS join lobby → Everyone selects class (duplicates allowed)
HOST starts run → All players spawn at center of map
    → 20-minute timer begins
    → Run ends on TIMER EXPIRY or ALL PLAYERS DEAD
    → Individual payout screens → Return to lobby
```

### Duplicate Classes

Players may pick the same class. There is no restriction. Two Necromancers flooding the screen with skeletons is a feature, not a bug. Each player's abilities and weapons are fully independent.

### Mid-Run Join (Drop-In)

When a player joins mid-run:

- They spawn at the **host player's position** with a **3-second invulnerability shield**.
- Their level is set to the **average level of all current players minus 2** (minimum level 1). This prevents them from being dead weight but doesn't give them a free ride.
- They receive **randomized weapons/passives** appropriate to their level (the game auto-selects as if they had leveled up, favoring their class's starting weapon upgrades).
- They inherit the current **difficulty scaling** — no grace period on enemy stats.
- Their coin/XP tracking begins from the moment they join. Survival time bonus counts only from their join time.

### Mid-Run Leave (Drop-Out)

When a player leaves mid-run:

- Their character simply **fades out and disappears** (no death animation, no XP piñata).
- Enemy scaling adjusts downward over the next **15 seconds** (smooth transition, not instant).
- The leaving player receives their **coins earned up to that point**, calculated and saved server-side at the moment of disconnect.
- Remaining players continue normally.
- If the **host** leaves, host migration occurs (next player by join order becomes host). If host migration fails, all players receive their current coin totals and the run ends.

---

## 3. Economy — Individual Progression

This is the most important section. Every economic system is **per-player and independent**.

### Coin Earning — Per Player

Each player has their own coin counter. Coins are **not pooled, not split, and not shared**.

| Source | Behavior in Multiplayer |
|---|---|
| Enemy coin drops | When an enemy dies, it drops a coin pickup. **Any player** can collect it, but the coin is awarded **only to the player who picks it up**. Coins are first-come-first-served physical pickups on the map. |
| Boss kill coins | Awarded to **all living players equally**. Each player gets the full boss coin reward (25/50/75/100). No splitting. |
| Treasure chests | Boss treasure chests are **duplicated per player**. Each boss drops one chest per living player. Each player can only open their own chest. |
| Survival time bonus | Tracked **individually**. Each player earns 1 coin per 15 seconds they are personally alive. Dead players stop earning until revived. |
| Kill milestones | Tracked on a **shared kill counter**. When the team hits 500/1,500/3,000/5,000 kills, **all living players** receive the milestone bonus. |
| Full clear bonus | Awarded to **all players who are alive at 20:00** (100 coins each). Dead players who were revived and are alive at 20:00 still qualify. |
| First class clear | Tracked **per player, per class**. A player gets their 200-coin first-clear bonus the first time they complete 20:00 with a given class, regardless of whether they've done it in solo or multiplayer. |
| Double Time bonus | The 1.5× multiplier applies to each player's **individual total**. |
| Greed meta upgrade | Applies to each player's **own Greed level**. A player with Greed Lv 3 gets +30% on their personal coins, regardless of teammates' Greed levels. |

### Why Not Split Coins?

Splitting coins would make multiplayer feel punishing compared to solo. A 4-player run is harder (more enemies), takes the same time, and requires coordination. Splitting rewards would make solo strictly more efficient, which kills the incentive to play together. By giving each player their own full economy, multiplayer becomes a viable (and more fun) alternative to solo grinding.

### Coin Drop Rate Adjustment

To prevent 4-player runs from being dramatically more lucrative than solo (since 4 players can cover more ground collecting coins), the base coin **drop rate** from enemies is slightly reduced per additional player:

| Player Count | Coin Drop Rate |
|---|---|
| 1 (solo) | 3.0% |
| 2 | 2.5% |
| 3 | 2.2% |
| 4 | 2.0% |

This keeps per-player coin income from map drops roughly equivalent to solo. Boss coins and milestone coins are unaffected (those are the "multiplayer bonus" for dealing with harder content).

### Meta-Progression Independence

Each player's meta shop, unlocks, and permanent upgrades are entirely their own. If Player A has max Greed and Player B has no upgrades, they simply have different personal modifiers. No player's meta-progression affects another player's game.

### Class Unlock Triggers in Multiplayer

Achievement-based class unlocks can be earned in multiplayer:

| Class | Unlock Condition | Multiplayer Rule |
|---|---|---|
| Plague Doctor | Survive 10 minutes | Player must personally be alive at 10:00 |
| Berserker | Kill 3,000 enemies in one run | **Shared** kill counter — all players get credit |
| Chronomancer | Defeat the 15-minute boss | All living players at time of boss death get credit |
| Hemomancer | Complete a full 20:00 run | Player must be alive at 20:00 |
| Necromancer | Purchase (1,500 coins) | Per-player shop purchase |

---

## 4. Player Scaling & Difficulty

The game must remain challenging and fun regardless of player count. The difficulty system scales **dynamically** based on the number of currently-alive players.

### Enemy Stat Scaling

All enemy stats receive a multiplier based on player count:

```
hp_multiplier(n) = 1 + ((n - 1) × 0.65)
damage_multiplier(n) = 1 + ((n - 1) × 0.10)
```

| Players | HP Multiplier | Damage Multiplier |
|---|---|---|
| 1 | 1.00× | 1.00× |
| 2 | 1.65× | 1.10× |
| 3 | 2.30× | 1.20× |
| 4 | 2.95× | 1.30× |

HP scales aggressively to ensure enemies don't melt instantly under 4 players' combined DPS. Damage scales gently so that individual players don't feel overwhelmed — the difficulty comes from volume and HP sponges, not from getting one-shot.

### Dynamic Adjustment on Player Death/Leave

When a player dies or disconnects, the scaling **smoothly reduces** over **15 seconds** (linear interpolation to the new player-count values). This prevents jarring difficulty spikes or drops.

When a dead player is **revived**, scaling smoothly increases back up over **10 seconds**.

### Spawn Budget Scaling

The Wave Director's spawn budget (§11 of GDD) is also multiplied:

```
budget_multiplier(n) = 1 + ((n - 1) × 0.50)
```

| Players | Spawn Budget Multiplier |
|---|---|
| 1 | 1.00× |
| 2 | 1.50× |
| 3 | 2.00× |
| 4 | 2.50× |

More players = more enemies on screen = more chaos. This is the fun part.

### Max Enemies On Screen

The per-player-count hard cap adjusts:

| Players | Max Enemies |
|---|---|
| 1 | 300 |
| 2 | 400 |
| 3 | 475 |
| 4 | 550 |

---

## 5. XP & Leveling

### Individual XP Pools

Each player has their own XP total and level. Players level up independently and make their own upgrade choices.

### XP Gem Collection

XP gems dropped by enemies are **shared pickups with individual credit**:

- When an enemy dies, it drops XP gems as normal.
- **Any player** can collect the gem by moving within their pickup range.
- The collecting player receives the **full XP value**. Other players receive nothing from that gem.
- Gems are first-come-first-served.

This creates a natural incentive to stay near the action rather than hiding at the edge of the map. Players who contribute to fights are rewarded with proximity to XP drops.

### XP Compensation for Distance

To prevent a player who is kiting far from the group from falling hopelessly behind on XP, a passive **XP trickle** is applied:

```
trickle_xp_per_second = 0.5 × average_team_level
```

This ensures no player falls more than ~3–4 levels behind the group average, even if they're not picking up many gems directly. The trickle is small enough that active collection is always preferable.

### Level-Up Timing

When a player levels up, the game does **not pause** for other players. Only the leveling player sees the upgrade selection screen, overlaid on their view. Their character continues to exist in the world and **can still take damage** during selection — this incentivizes quick choices and finding safe spots before leveling. A **10-second auto-select timer** triggers if no choice is made (selects a random option).

---

## 6. Pickup Behavior

### Pickup Types & Rules

| Pickup | Behavior |
|---|---|
| **XP Gems** | First player to reach pickup range collects. Full value to collector. Gem disappears for all. |
| **Coins** | First player to reach pickup range collects. Full value to collector. Coin disappears for all. |
| **Food (Chicken)** | **Per-player duplication.** When food spawns, it spawns one copy per living player. Each copy is only visible to and collectible by its assigned player. This prevents fights over healing. |
| **Magnet** | Collector gets all on-screen XP gems pulled to them. Other players are unaffected. |
| **Vacuum** | **All players benefit.** All map gems are pulled to the **nearest player** to each gem. |
| **Rosary** | Collector triggers the effect. All on-screen non-boss enemies die. XP gems from the mass kill are physical drops collectible by anyone. |
| **Treasure Chest** | Per-player copies from bosses (see §3). Environmental chests are first-come-first-served, but weapon upgrades only apply to the opener. |

### Pickup Range Visualization

In multiplayer, each player's pickup range is shown as a subtle **colored circle** matching their player indicator color (P1: blue, P2: red, P3: green, P4: yellow). This is off by default and togglable in settings.

---

## 7. Revival & Death

### Death State

When a player reaches 0 HP (after exhausting any Revival charges from meta upgrades):

- They enter a **downed state** for **15 seconds**.
- Their character collapses in place with a **ghostly tether** visible to all players, showing distance and direction.
- A **countdown timer** appears above their body visible to all.
- Downed players cannot move, attack, or collect pickups.
- Enemies **ignore** downed players (no corpse camping).

### Revival Mechanic

Any living player can revive a downed teammate:

- Move within **80px** of the downed player.
- A **circular progress bar** fills over **3 seconds** of proximity (the reviver can still move within 80px and their weapons still fire, but leaving 80px range resets progress).
- On successful revival, the downed player is restored to **40% Max HP** with **2 seconds of invulnerability**.
- The reviver receives a **+10% Might buff for 15 seconds** ("Heroic Rescue" buff) as a reward for the risky play.

### Permanent Death

If the 15-second downed timer expires without revival:

- The player is **permanently dead** for the rest of the run.
- Their character disappears from the map.
- They enter **spectator mode** — free camera following any living player (tab to switch).
- They continue earning **survival time coins** at **50% rate** (1 coin per 30 seconds instead of 15).
- They still receive **boss kill coins and milestone bonuses** if the team earns them.
- They receive the **full clear bonus** only if at least one teammate survives to 20:00 — they get a reduced **50-coin "carried" bonus** instead of the normal 100.

### Total Party Kill (TPK)

If all players are simultaneously in downed state or dead:

- The run immediately ends.
- All players receive their earned coins up to that point.
- No full-clear or completion bonus.

### Revival Charges (Meta Upgrade)

The Revival meta upgrade works per-player in multiplayer. If a player has a Revival charge, it is consumed **before** entering the downed state (they auto-revive at 50% HP as in solo). The downed state only occurs when all personal Revival charges are spent.

---

## 8. Class Synergies & Interaction Rules

While no class combination is required, certain classes create **emergent synergies** in multiplayer. These are not coded as special interactions — they arise naturally from overlapping mechanics.

### Passive Aura Interactions

| Class | Aura/Effect | Multiplayer Interaction |
|---|---|---|
| Chronomancer | Time Dilation Field (70% enemy slow in 150px) | If multiple Chronomancers overlap auras, the slow **does not stack** (cap: 70%). But it covers more map area. |
| Plague Doctor | Miasma Trail (poison trail behind movement) | Multiple Plague Doctors leave independent trails. More coverage = more area denial. Trails from different players stack damage. |
| Necromancer | Raise Dead (skeleton summons) | Each Necromancer has their own summon cap (8/10/12). Two Necromancers can have up to 16–24 skeletons total. |
| Garlic users | Damage aura | Aura damage from different players **stacks fully**. Two garlic users = 2× aura DPS in overlap zone. |

### Ability Interactions

| Ability | Multiplayer Rule |
|---|---|
| Knight — Rally Cry (stun) | Affects enemies for all players. Two Knights can chain stuns with offset timing. Stun duration does not stack but can be refreshed. |
| Ranger — Hunter's Mark | Only one Mark can be active on a given enemy at a time. If two Rangers mark different enemies, both marks are active. If both mark the same enemy, the newer mark refreshes the duration. Damage bonus does not stack. |
| Berserker — Savage Slam | Stun and knockback affect enemies for all players. Multiple Berserkers slamming the same area don't stack stuns but can chain them. |
| Necromancer — Army of Darkness | Bone wall buffs only the casting Necromancer's skeletons. Other Necromancers' skeletons inside the wall are unaffected. |
| Chronomancer — Temporal Rewind | Only affects the casting player's position/HP. The freeze effect on enemies benefits all players. |
| Hemomancer — Blood Nova | AoE damages enemies for all players' benefit. HP sacrifice and lifesteal healing only affects the caster. |

### Emergent Synergy Examples

These aren't coded — they emerge from the rules above. Good for marketing or tooltip hints.

**"The Fortress" (Knight + Chronomancer):** Knight's Rally Cry stuns enemies while Chronomancer's Time Dilation makes everything crawl. The team has massive breathing room.

**"The Plague Swarm" (Plague Doctor + Necromancer):** Skeletons wade through poison trails, tanking enemies in toxic zones. Pandemic chains trigger on enemies softened by skeletons.

**"The Glass Cannon Battery" (2× Arcanist):** Double Arcane Nova coverage, double Mana Surge uptime. Enemies melt but both players are fragile. High risk, high reward.

**"Blood Brothers" (Hemomancer + Berserker):** Both thrive at low HP. Hemomancer's lifesteal sustains through the drain while Berserker's Blood Rage turns damage taken into DPS. They naturally play in the danger zone together.

**"The Immortal Line" (Knight + Hemomancer + Ranger):** Knight tanks and stuns, Hemomancer sustains through violence, Ranger marks priority targets for the team. Classic RPG trinity emerging from independent systems.

---

## 9. Boss Encounter Adjustments

Bosses in multiplayer are scaled and given additional mechanics to remain threatening against multiple players.

### Boss HP Scaling

Bosses use a steeper HP multiplier than regular enemies:

```
boss_hp_multiplier(n) = 1 + ((n - 1) × 0.80)
```

| Players | Boss HP Multiplier | Hollow King HP | Terminus HP |
|---|---|---|---|
| 1 | 1.00× | 800 | 8,000 |
| 2 | 1.80× | 1,440 | 14,400 |
| 3 | 2.60× | 2,080 | 20,800 |
| 4 | 3.40× | 2,720 | 27,200 |

### Boss Damage & Speed

Unchanged from solo values. Bosses are already threatening to individual players; adding more HP and more players to dodge attacks is sufficient difficulty increase.

### Boss Aggro System

Bosses use a **soft aggro** system rather than hard-targeting one player:

- **Primary Target:** The player who has dealt the most damage to the boss in the last **5 seconds**. The boss directs its main attacks (melee swings, charges) at this player.
- **Secondary Targeting:** Ranged and AoE attacks (projectiles, ground slams, summons) target **random players** or the **nearest player**, depending on the attack.
- **Aggro Swap:** If the primary target moves more than **500px** from the boss, aggro transfers to the nearest player.
- **Split Targeting:** Some boss abilities specifically target multiple players (noted below).

### Per-Boss Multiplayer Adjustments

#### The Hollow King (5:00)

- **Bone Spikes** now fire at **each player simultaneously** (one spike line per player).
- **Summon Shambler Guard** spawns 8 × (player count) Shamblers.
- **Phase 2 — Death March** targets the **farthest player** from the boss instead of the primary aggro target (punishes backline positioning).

#### The Crimson Countess (10:00)

- **Blood Lance** fires at a **different player each volley** (round-robin targeting).
- **Blood Rain** drops on **two player positions simultaneously** (in 3–4 player games, alternates which two).
- **Blood Shield** regeneration rate scales: `10 × player_count` HP/second in Phase 1, `20 × player_count` in Phase 2. This prevents the shield from being trivially overwhelmed by multi-player DPS.
- **Phase 3 — Crimson Fury** swoops target **random living player each swoop**.

#### Elder Lich Malachar (15:00)

- **Phylactery HP** scales: `200 × player_count` per phylactery.
- **Soul Barrage** fires orb sets at **each player independently** (3 orbs per player per volley).
- **Mass Resurrection** cap increases to `15 × player_count` enemies.
- **Gravity Well** (middle phylactery) targets a **different player** each activation.
- **Enrage** phylactery resurrection occurs once **per phylactery, per player** (i.e., more players = more total phylactery lives).

#### Terminus, The Undying (20:00)

- **Adaptive Resistance** now tracks damage types **per player** and applies resistance to the **most common type across all players**. This encourages diverse class/weapon picks.
- **Phase 1 — Consume** pull affects **all players** equally. Pull force scales down slightly: `120 / sqrt(player_count)` px/s. Still dangerous, but one player can't be singled out.
- **Spawn Amalgamation** rate: one detachment per **8 / player_count** seconds (more players = faster spawn rate, minimum 2 seconds).
- **Phase 2 — Void Zones** count scales: `3 × player_count` zones per slam (max 12). Places zones near each player.
- **Phase 2 — Tendril Sweep** fires `4 + player_count` tendrils.
- **Phase 3 — Death Spiral** orbits the **centroid** of all living players' positions, forcing them to stay grouped or scatter (both have tradeoffs).
- **Phase 3 — Final Consume** pull force unchanged but affects all players. If **any** player survives it, Terminus staggers (team-coordination moment).

---

## 10. Wave Director Multiplayer Tuning

### Spawn Distribution

In solo, all enemies converge on one player. In multiplayer, the Director **distributes spawns** around all living players:

- **60% of spawns** target the player with the **highest threat** (most recent damage dealt).
- **40% of spawns** are distributed evenly among other players.
- Every **30 seconds**, threat rankings are recalculated.

This ensures no player is entirely ignored (boring) or entirely overwhelmed (frustrating) while rewarding aggressive play with more action.

### Spawn Distance

Enemy spawn distance from each targeted player remains **600–900px**. Enemies spawn off-screen relative to the **nearest player**, not a fixed camera position.

### Elite & Special Spawns

The Director ensures high-tier enemies are distributed:

- **Witches** preferentially spawn near the player with the **lowest DPS** (to debuff the weakest link).
- **Banshees** spawn equidistant from **all players** (maximum disruption).
- **Shadows** spawn near the player who has been **stationary the longest** (punish idle/AFK).
- **Liches** spawn near the player with **the most active summons/lingering effects** (thematic rivalry).

### Surge Events

In the 19:00–19:50 final crescendo, surge events spawn enemies in **equal waves around all players simultaneously** rather than concentrating on one player. The intent is for the final minute to be a team survival challenge where everyone is under equal pressure.

---

## 11. Camera & Viewport

### Camera Modes

The game supports two camera approaches depending on platform.

#### Shared Screen (Local Co-op)

For couch co-op on the same screen:

- Camera centers on the **midpoint of all players**.
- **Dynamic zoom:** Camera zooms out as players spread apart. Maximum zoom-out at **1,500px** player spread (showing roughly 2.5× the normal view area). Beyond 1,500px, a **soft tether** pulls the farthest player toward the group (3% of distance per frame, gentle rubber-banding).
- **Edge indicators** show off-screen enemy direction and distance when zoomed in.
- If all players are within **300px**, camera behaves identically to solo (centered on midpoint, normal zoom).

#### Independent Cameras (Online Co-op)

For online play:

- Each player has their **own camera** centered on their character, identical to solo.
- **Teammate indicators:** Small colored arrows on the screen edge point toward off-screen teammates, with distance shown in meters.
- **Minimap** (top-right corner, 150×150px) shows all player positions as colored dots, boss position as a skull icon, and a 2,000px radius of enemy density as a heat overlay.

---

## 12. UI & HUD

### Player Identification

Each player is assigned a consistent color used across all UI:

| Slot | Color | Hex |
|---|---|---|
| P1 (Host) | Blue | `#4A9EFF` |
| P2 | Red | `#FF4A4A` |
| P3 | Green | `#4AFF7A` |
| P4 | Yellow | `#FFD84A` |

A **colored outline** (2px, 60% opacity) tints each player's character sprite. This is subtle enough to not obscure art but clear enough to identify at a glance.

### HUD Layout (Per Player)

```
┌─────────────────────────────────────────────────┐
│ [P1 HP BAR]  [P2 HP BAR]  [P3 HP BAR]  [P4 HP] │  ← Top: Team HP bars
│                                                   │
│ [Minimap]                          [Kill Counter] │
│                                    [Timer 12:34]  │
│                                                   │
│                    GAME AREA                       │
│                                                   │
│                                                   │
│ [Own Weapons 1-6]            [Own Passives 1-6]   │  ← Bottom: Personal loadout
│ [Own HP detail]  [Own Level: 14]  [Own Coins: 87] │
└─────────────────────────────────────────────────┘
```

### Teammate HP Bars

Other players' HP bars are shown at the top of the screen as **compact colored bars**:

- Show: Player name, class icon, current HP/max HP, and a small status icon (normal / downed / buffed).
- Downed players' bars turn gray and pulse with the revival countdown timer.
- Clicking/hovering a teammate's bar (PC) or holding a shoulder button (gamepad) briefly highlights that player with a **pillar of light** visible through walls/enemies.

### Damage Numbers

Each player's damage numbers are tinted with their player color. This helps attribute who is doing what in chaotic fights. Toggleable in settings for visual clarity.

### Kill Feed

A small **shared kill feed** in the top-right (below minimap) shows boss damage milestones and significant events:

```
[P2 Ranger] Hunter's Marked Elder Lich Malachar
[P1 Knight] destroyed Malachar's Inner Phylactery
[P3 Necromancer] has 12 active skeletons
[BOSS] Elder Lich Malachar — 50% HP
[P4 Hemomancer] DOWNED! 15s to revive
```

This feed shows the last 4 events and fades after 5 seconds. It is informational only — no spam from routine kills.

---

## 13. Communication Systems

### Ping System

A lightweight **contextual ping** system (single button press, no menus):

| Input | Context | Result |
|---|---|---|
| Ping on empty ground | General | "Over here!" marker (player color circle, 5s duration) |
| Ping on enemy | Target | "Focus this!" marker (crosshair on enemy, 5s, visible to all) |
| Ping on boss | Target | "Attack boss!" marker (skull crosshair, persistent until boss dies) |
| Ping on downed ally | Help | "Help!" marker (exclamation point, pulses until revived or dead) |
| Ping on pickup | Item | "Grab this!" marker (arrow pointing at pickup, 5s) |
| Double-tap ping | Danger | "Danger!" marker (red triangle, 5s, with screen-edge indicator for all) |

Pings appear on the minimap and as screen-edge indicators. Maximum **3 pings per player** in a **5-second window** to prevent spam.

### Quick Chat (Optional)

Predefined messages selectable via radial menu (hold ping button). No custom text to prevent toxicity:

- "Nice!"
- "Help!"
- "Spread out!"
- "Group up!"
- "Focus boss!"
- "I'll revive you!"
- "Watch out!"
- "GG!"

Messages appear as small floating text above the sending player's character for **3 seconds**.

### Voice Chat

Optional, off by default. Push-to-talk recommended. Volume per-player adjustable. Standard implementation — no special design considerations beyond a mute button.

---

## 14. Double Time Mode (Multiplayer)

Double Time in multiplayer follows the same rules as solo (2× game speed, 1.6× player movement, 10 real-time minutes) with these additions:

- **Revival timer** is halved to **7.5 seconds** (it runs at 2× speed in game-time, but the real-time window is tighter).
- **Revival channel time** remains **3 real-time seconds** (not affected by game speed — this is an intentional mercy since the reviver still needs to position and track their teammate).
- **Level-up auto-select timer** reduced to **5 seconds** (real-time).
- **Coin multiplier** is **1.5×** per player (same as solo — no additional multiplayer bonus, as the increased difficulty is already reflected in the multiplayer scaling).
- **Drop-in window** is halved: "First 5 min" option becomes first 2:30, "First 10 min" becomes first 5:00.

---

## 15. Anti-Grief & Edge Cases

### AFK Detection

If a player has not provided **any movement input** for **30 seconds**:

- They are flagged as AFK.
- They stop earning survival time coins.
- After **60 seconds** of no input, they are automatically disconnected with coins earned up to the AFK flag moment.
- Their character is removed, scaling adjusts.

### Intentional Dying

No penalty beyond lost personal coins. A player who repeatedly dies and gets revived doesn't affect teammates' economies. The revival system self-balances: reviving a bad player costs the reviver positional risk and time.

### Screen Camping / Hiding

The spawn system already targets all players individually (§10), so hiding far from the group still draws enemies. Additionally, the XP trickle is much lower than active collection, so a camper falls behind in levels and becomes naturally weaker.

### Boss Cheese Prevention

Bosses have a **leash range of 2,000px** from the nearest player. If all players move beyond 2,000px, the boss teleports to the nearest player. Bosses cannot be permanently kited off-screen.

### Friendly Fire

There is **no friendly fire** under any circumstances. Player AoE, projectiles, and abilities never damage teammates. Healing effects from pickups and abilities only affect the source player (no cross-player healing unless a future support class is added).

---

## 16. Networking Architecture

### Recommended Model: Client-Authoritative with Host Validation

For indie scope and simplicity:

```
HOST (Player 1)                    CLIENTS (Players 2-4)
┌───────────────────┐              ┌───────────────────┐
│ Runs full game sim │◄────────────│ Sends inputs only  │
│ Enemy AI           │────────────►│ Receives state     │
│ Spawn director     │             │ Predicts movement  │
│ Collision          │             │ Interpolates       │
│ Boss logic         │             │ Renders            │
│ Pickup spawning    │             │                    │
│ Coin tracking      │             │                    │
└───────────────────┘              └───────────────────┘
```

### Authority Split

| System | Authority | Rationale |
|---|---|---|
| Enemy AI & spawning | Host | Single source of truth for all enemy behavior |
| Player movement | Each client (own character) | Responsive feel; host validates bounds |
| Weapon firing | Each client triggers; host validates hits | Responsive feel with cheat prevention |
| Pickup collection | Host | Prevents double-collection race conditions |
| XP/Coin awards | Host | Authoritative economy prevents duplication |
| Level-up choices | Each client | Only affects own character |
| Boss phases/HP | Host | Single source of truth |
| Revival progress | Host | Prevents race conditions |

### Tick Rate & Bandwidth

| Parameter | Value |
|---|---|
| Server tick rate | 20 Hz (50ms) |
| Client prediction | Enabled for own movement |
| Entity interpolation | 100ms buffer (2 ticks) |
| State snapshot size | ~2 KB per tick (300 enemies × position/hp = ~1.8 KB + player states) |
| Bandwidth per client | ~40 KB/s downstream, ~2 KB/s upstream |

### Sync Priority

Not all entities need to sync at the same rate:

| Entity Type | Sync Rate | Notes |
|---|---|---|
| Player positions | Every tick (20 Hz) | Critical for accuracy |
| Player HP/status | On change + every 1s | Event-driven with heartbeat |
| Enemy positions | 10 Hz (every other tick) | Interpolated on client |
| Enemy HP | On change only | Event-driven |
| Projectiles (player) | Spawned on client, validated on host | No continuous sync |
| Projectiles (enemy) | Spawned on host, broadcast to clients | Interpolated |
| Pickups | Spawn event + collection event | No continuous position sync needed |
| Boss state | Every tick | Critical for phase sync |

### Rollback & Desync Handling

Given the genre (cooperative, not competitive), strict rollback is not required. Instead:

- If a client detects position desync > 50px from host state, **snap-correct with interpolation** (smooth teleport over 200ms).
- If pickup collection conflicts (two clients claim the same coin), **host decides** (first valid request processed).
- If the connection drops for > 5 seconds, the client is disconnected and the drop-out protocol (§2) triggers.

### Dedicated Server Option

For a more robust release, the host logic can be extracted to a dedicated server. The architecture above maps cleanly — replace "Host" with "Server" and make Player 1 a regular client. This eliminates host advantage and prevents the host-leave migration issue.

---

## 17. Implementation Notes

### Additional Data Files for Multiplayer

Extend the GDD's proposed `/data/` directory with:

```
/data/
  multiplayer/
    scaling.json          -- Player-count multipliers for HP, damage, spawns
    boss_scaling.json     -- Per-boss multiplayer adjustments and targeting rules
    spawn_distribution.json -- Threat-based spawn targeting weights
    revival.json          -- Down timer, revival channel time, HP restore values
    economy_mp.json       -- Coin drop rate adjustments per player count
    camera.json           -- Zoom limits, tether distances, indicator settings
    ping_system.json      -- Ping types, cooldowns, visual properties
    quick_chat.json       -- Message list, display duration
```

### Key Multiplayer Systems to Implement

| System | Priority | Description |
|---|---|---|
| **LobbyManager** | P0 | Session creation, join/leave, class selection, ready state, settings |
| **NetworkSyncManager** | P0 | Entity state replication, tick management, interpolation buffer |
| **PlayerTracker** | P0 | Per-player HP, XP, coins, level, loadout — all independent instances |
| **MultiplayerDirector** | P0 | Extended WaveDirector with player-count scaling and threat distribution |
| **RevivalSystem** | P0 | Down state, proximity channel, timer, spectator transition |
| **PickupAuthority** | P0 | Host-authoritative pickup collection, per-player food duplication |
| **BossAggro** | P1 | Threat table, target swapping, per-boss multiplayer attack routing |
| **PingSystem** | P1 | Contextual ping detection, broadcast, screen-edge indicators |
| **CameraController** | P1 | Shared-screen zoom/tether (local) and independent cameras (online) |
| **DropInManager** | P1 | Mid-run join: level catch-up, auto-loadout, spawn positioning |
| **HostMigration** | P2 | State serialization, authority transfer, reconnection |
| **SpectatorMode** | P2 | Free camera, player-follow tabs, minimal HUD |
| **QuickChat** | P2 | Radial menu, message broadcast, floating text display |
| **AFKDetector** | P2 | Input tracking, flag timer, auto-disconnect |

### Entity Changes for Multiplayer

The ECS from the GDD needs these additions:

```
New Components:
  - OwnerComponent { player_id }              -- Who owns this entity (weapon projectiles, summons)
  - NetworkIdComponent { net_id }             -- Unique ID for network sync
  - InterpolationComponent { buffer[] }       -- Position buffer for smooth remote entity rendering
  - ThreatComponent { threat_per_player[] }   -- Boss aggro tracking
  - PickupClaimComponent { claimed_by? }      -- Host-authoritative pickup ownership
  - RevivalComponent { down_timer, channel_progress, reviver_id? }
  - SpectatorComponent { following_player_id } -- For dead players in spectator mode

Modified Components:
  - HealthComponent: add { revival_charges, is_downed, down_timer }
  - DropTableComponent: add { coin_drop_rate_override }  -- For player-count adjustment
  - AIBehaviorComponent: add { target_player_id }       -- For distributed targeting
```

### Testing Priorities

| Test Case | Why It Matters |
|---|---|
| 4-player boss fight at 20:00 with max enemies | Performance ceiling — worst-case entity count |
| Player disconnect during boss phase transition | State consistency after host migration |
| Two players claim same coin simultaneously | Economy integrity |
| Drop-in at minute 19:00 | Edge case: auto-loadout quality, immediate difficulty |
| All players downed simultaneously | TPK detection timing, no race conditions |
| Chronomancer + Plague Doctor aura overlap | Status effect stacking correctness |
| AFK player for full run duration | Scaling should drop, AFK kick should trigger |
| Solo player in 4-player lobby (3 disconnect) | Smooth scaling from 4→1 player over 15 seconds |
| Revival during boss Consume (pull) ability | Revival channel interrupted? Physics interactions? |
| 4× Necromancer skeleton count stress test | 48 skeletons + 550 enemies = ~600 entities |

---

*End of Multiplayer Integration Document — v1.0*
