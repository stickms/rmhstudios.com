# Temple of Joy — Patch 1 Plan

## Overview

This document records all planned fixes, content additions, and balance changes before implementation. Each section includes the math and reasoning behind every decision.

---

## 1. Fixes

### 1.1 Prestige → Transcend Terminology

The in-game action is called "Transcendence" and the button says "Transcend." Achievement descriptions still say "Prestige." All prestige achievement names and descriptions are updated to use "transcend" terminology.

| ID | Current Name | New Name | Current Desc | New Desc |
|---|---|---|---|---|
| `firstPrestige` | Enlightenment (Partial) | **First Transcendence** | Prestige for the first time. | Transcend for the first time. |
| `fivePrestige` | The Eternal Return | **Five Cycles** | Prestige 5 times. | Transcend 5 times. |
| `tenPrestige` | Enlightenment (Complete) | **Ten Cycles** | Prestige 10 times. | Transcend 10 times. |
| `twentyPrestige` | The Wheel Master | The Wheel Master *(keep)* | Prestige 20 times. | Transcend 20 times. |
| `thirtyPrestige` | The Spiral | The Spiral *(keep)* | Prestige 30 times. | Transcend 30 times. |
| `fiftyPrestige` | Eternal Pilgrim | Eternal Pilgrim *(keep)* | Prestige 50 times. | Transcend 50 times. |

### 1.2 Wheel Upgrade Implementation Audit

Checking each wheel upgrade against the code to find unimplemented effects:

| Upgrade | Description | Implemented? | Fix Required |
|---|---|---|---|
| `beginnersBliss` | +50 HPS start | ✅ `computeStartingHPSFromWheel` | — |
| `theSecondSmile` | ×2 base HPC | ✅ `computeHPC` | — |
| `emberOfMemory` | Keep 5 upgrades on prestige | ✅ `doTriggerTranscendence` | — |
| `karmicVessel` | Karma persists | ✅ `doTriggerTranscendence` | — |
| `earlyWarmth` | Building costs −5% | ✅ `computeBuildingCost` | — |
| `rememberedJoy` | Start with 60s ×5 HPS | ❌ **Missing** | Add timed buff at transcendence |
| `reincarnatedWealthier` | Start with 1% peak HP | ❌ **Missing** | Add HP bonus in `makeInitialState` override |
| `deepRoots` | Buildings 1–5 start at 5 | ❌ **Partial** (HPS calc only) | Actually set 5 copies in initial buildings |
| `eternalReturn` | Shard formula ×1.25 | ✅ `computeBlissShards` | — |
| `saintsPatience` | Offline cap 16 h | ✅ `computeOfflineProgress` | — |
| `samsarasGift` | +5% HPS/prestige | ✅ `computeTotalHPS` | — |
| `ritualMastery` | Ritual threshold 5, CD halved | ✅ `doClick` | — |
| `theLongView` | Offline uses sqrt formula | ❌ **Missing** | Implement sqrt offline formula in `computeOfflineProgress` |
| `enlightenedClicker` | HPC ×(1+0.1×prestige) | ✅ `computeHPC` | — |
| `theSecondComing` | First 10 min ×10 HPS | ❌ **Missing** | Add 600 s timed buff at transcendence |
| `prophetsMemory` | Keep 20 upgrades | ✅ `doTriggerTranscendence` | — |
| `heavensInfrastructure` | Buildings −10% cost | ✅ `computeBuildingCost` | — |
| `karmicDividend` | Karma ×5 after prestige 3 | ✅ `computeKarmaRate` | — |
| `infiniteWheel` | Shards 1.1× exponent | ✅ `computeBlissShards` | — |
| `nirvanaBlueprint` | Start at 50% peak HPS as HP | ❌ **Missing** | Add happiness = `peakHPS * 0.5 * 60` in initial state |
| `divineMemory` | All upgrades retained | ✅ `doTriggerTranscendence` | — |
| `templeEternal` | ×10 all HPS | ✅ `computeTotalHPS` | — |
| `eternalFoundation` | All buildings start at 5; unlock 1 prestige earlier | ❌ **Missing** | Set all buildings[id] = 5; reduce requiresPrestige in engine |
| `karmicOverflow` | Karma ×10; relic slots +2 | ❌ **Missing** | Add to `computeKarmaRate`; compute max slots dynamically |
| `theRemembering` | Milestones persist across runs | ❌ **Missing** | Pass milestones through in `doTriggerTranscendence` |
| `blissOverdrive` | ×100 HPS for 5 min at run start | ❌ **Missing** | Add 300 s timed buff at transcendence |

**Summary of missing implementations:** 9 wheel upgrades need code added.

**`nirvanaBlueprint` note:** "50% of previous run's peak HPS" should be converted to a happiness *starting amount*, not HPS. We compute: `peakHPS * 60 * 0.5` (roughly 1 minute of income) as a reasonable starting happiness gift.

**`eternalFoundation` prestige unlock note:** Building `requiresPrestige` is checked in `computeIsUpgradeVisible` for upgrades and in TempleOfJoyGame/BuildingsPanel for buildings. We add a `computePrestigeRequirement(building, state)` helper that subtracts 1 if `eternalFoundation` is purchased (floor-clamped at 0).

**`karmicOverflow` relic slot note:** `maxRelicSlots` is static state — on transcendence we add +2 if purchased. We also apply it on first unlock (in `doPurchaseWheelUpgrade`, add maxRelicSlots +2 to state).

---

## 2. New Buildings

### Balance Principle

We use anchor ratio `r₀ = 0.1/15 ≈ 0.006667 HPS/cost` for Mood Candle (step 0), and each subsequent building should be ~5% more cost-efficient than the prior one:

```
ratio(n) = 0.006667 × 1.05^n
target_HPS(n) = baseCost(n) × ratio(n)
```

**Full building balance table (all buildings, new ones marked ✨):**

| Step | Building | baseCost | Ratio | New baseHPS | Old baseHPS |
|---|---|---|---|---|---|
| 0 | Mood Candle | 15 | 0.006667 | 0.1 | 0.1 (anchor) |
| 1 | Nap Pod | 100 | 0.007000 | **0.75** | 0.5 |
| 2 | Snack Bar | 500 | 0.007350 | **4** | 2 |
| 3 ✨ | **Sweet Treat** | 1,600 | 0.007718 | **12** | new |
| 4 | Hot Tub | 2,500 | 0.008104 | **20** | 7 |
| 5 | Massage Studio | 12,000 | 0.008509 | **100** | 25 |
| 6 ✨ | **Retail Therapy** | 30,000 | 0.008934 | **270** | new |
| 7 | Gratitude Journal | 50,000 | 0.009381 | **470** | 80 |
| 8 | Goon Cave | 200,000 | 0.009850 | **2,000** | 250 |
| 9 | Joy Cult | 750,000 | 0.010342 | **7,800** | 700 |
| 10 | Spa Sanctum | 3,000,000 | 0.010860 | **32,500** | 2,000 |
| 11 ✨ | **Sound Bath** | 6,000,000 | 0.011403 | **68,000** | new |
| 12 | Therapy | 15,000,000 | 0.011973 | **180,000** | 5,500 |
| 13 | Pleasure Palace | 80,000,000 | 0.012572 | **1,000,000** | 14,000 |
| 14 | Dopamine Lab | 500,000,000 | 0.013200 | **6,500,000** | 38,000 |
| 15 ✨ | **Art Gallery** | 1,800,000,000 | 0.013860 | **25,000,000** | new |
| 16 | Hedonist Monastery | 3,500,000,000 | 0.014553 | **51,000,000** | 100,000 |
| 17 | Feast Hall | 25,000,000,000 | 0.015281 | **380,000,000** | 280,000 |
| 18 | Nirvana Resort | 200,000,000,000 | 0.016045 | **3,200,000,000** | 750,000 |
| 19 | Eternal Party | 1.8e12 | 0.016847 | **3.0e10** | 2,000,000 |
| 20 | Heaven on Earth | 18e12 | 0.017689 | **3.2e11** | 5,500,000 |
| 21 | Bliss Singularity | 210e12 | 0.018574 | **3.9e12** | 15,000,000 |
| 22 | Zen Garden | 5e15 | 0.019502 | **9.8e13** | 45,000,000 |
| 23 | Euphoria Springs | 8e17 | 0.020477 | **1.64e16** | 200,000,000 |
| 24 | Serenity Engine | 5e20 | 0.021501 | **1.08e19** | 1,000,000,000 |
| 25 | Rapture Cathedral | 1e24 | 0.022576 | **2.26e22** | 6,000,000,000 |
| 26 | Cosmic Jacuzzi | 1e28 | 0.023705 | **2.37e26** | 50,000,000,000 |
| 27 | Omniscient Spa | 1e33 | 0.024890 | **2.49e31** | 500,000,000,000 |

### New Building Definitions

#### Sweet Treat 🧋
- **Name:** Sweet Treat
- **Tagline:** "Brown sugar milk tea, extra boba. You deserve it. You always deserve it."
- **baseCost:** 1,600
- **baseHPS:** 12
- **Position:** Between Snack Bar (500) and Hot Tub (2,500)
- **Unlock:** No special requirement (early game)

#### Retail Therapy 🛍️
- **Name:** Retail Therapy
- **Tagline:** "Studious has a sale. You weren't planning to stop in. You stopped in. The bag was necessary."
- **baseCost:** 30,000
- **baseHPS:** 270
- **Position:** Between Massage Studio (12,000) and Gratitude Journal (50,000)
- **Unlock:** No special requirement

#### Sound Bath 🔔
- **Name:** Sound Bath
- **Tagline:** "The bowls sing. Your nervous system: dissolved. Your bones: grateful."
- **baseCost:** 6,000,000
- **baseHPS:** 68,000
- **Position:** Between Spa Sanctum (3,000,000) and Therapy (15,000,000)
- **Unlock:** No special requirement

#### Art Gallery 🖼️
- **Name:** Art Gallery
- **Tagline:** "You stood in front of a painting for twelve minutes. You don't know what it meant. That was the point."
- **baseCost:** 1,800,000,000
- **baseHPS:** 25,000,000
- **Position:** Between Dopamine Lab (500,000,000) and Hedonist Monastery (3,500,000,000)
- **Unlock:** No special requirement

---

## 3. New Achievements

### Required Content

| ID | Name | Description | Flavor |
|---|---|---|---|
| `bobaAddiction` | Boba Addiction | Buy your first Sweet Treat. | "One cup. That was the deal. The deal was a lie." |
| `studiousHaul` | The Studious Haul | Own 100 Retail Therapy sessions. | "You said you were just browsing. The receipts disagree." |

### Dreamed-Up Content

| ID | Name | Description | Flavor |
|---|---|---|---|
| `soundBathFirst` | The Bowl Rings | Buy your first Sound Bath. | "Everything vibrated. You vibrated. Peak vibe." |
| `artGalleryFirst` | Culture Acquired | Buy your first Art Gallery. | "You said you understood it. You were correct." |
| `tenSweetTreats` | Boba Empire | Own 10 Sweet Treats. | "You have a loyalty card. It is full. You have ten loyalty cards." |
| `artCollector` | Art Collector | Own 100 Art Galleries. | "The curator: you. The collection: unprecedented. The critics: silent." |
| `allNewBuildings` | The Full Temple (Updated) | Own at least 1 of every new building. | "Sweet tea, shopping, sound, and art. A complete life." |

---

## 4. New Upgrades

### Offering Tiers for New Buildings

Each new building gets 3 offering tiers following the existing pattern:
- Tier 1: ×1.5, cost = baseCost × 80, requires owning ≥ 10
- Tier 2: ×2, cost = baseCost × 500, requires owning ≥ 25 + Tier 1
- Tier 3: ×2.5, cost = baseCost × 3,000, requires owning ≥ 50 + Tier 2

**Sweet Treat offerings:**
- Tier 1 (cost 128,000): "The loyalty card filled. You earned this."
- Tier 2 (cost 800,000): "You have become the bubble tea."
- Tier 3 (cost 4,800,000): "Boba: infinite. Sugar crash: transcendent."

**Retail Therapy offerings:**
- Tier 1 (cost 2,400,000): "You blessed the fitting room. It was sacred."
- Tier 2 (cost 15,000,000): "Studious knows your size. It knows your soul."
- Tier 3 (cost 90,000,000): "You own a wing of the store. It is named after you."

**Sound Bath offerings:**
- Tier 1 (cost 480,000,000): "Your cells are tuned. Your molecules: harmonious."
- Tier 2 (cost 3,000,000,000): "The resonance is permanent. Knots: historical."
- Tier 3 (cost 18,000,000,000): "The bowl and the universe sing the same note. You wrote it."

**Art Gallery offerings:**
- Tier 1 (cost 144,000,000,000): "You commissioned a piece. It's about you. Subtly."
- Tier 2 (cost 9e11): "The collection is curated by your subconscious."
- Tier 3 (cost 5.4e12): "The museum is you. You are the museum."

### New Path Upgrades

**Carnal:**
- `bobaProtocol`: "Boba Protocol" (cost 3,200) — Sweet Treat ×2. Requires owning ≥ 1 Sweet Treat. Target: sweetTreat. Flavor: "Brown sugar. Oat milk. Extra everything. Yes."
- `milkTeaAscension`: "Milk Tea Ascension" (cost 48,000) — Sweet Treat ×3. Requires `bobaProtocol`. Target: sweetTreat. Flavor: "Tier 2 boba: cosmological."

**Social:**
- `shoppingWithFriends`: "Shopping With Friends" (cost 60,000) — Retail Therapy ×2. Requires owning ≥ 1 Retail Therapy. Target: retailTherapy. Flavor: "They said it looked amazing. They meant it."
- `studiousRegular`: "Studious Regular" (cost 1,200,000) — Retail Therapy ×3. Requires `shoppingWithFriends`. Target: retailTherapy. Flavor: "They reserved a fitting room. With your name on it."

**Mind:**
- `acousticAlignment`: "Acoustic Alignment" (cost 12,000,000) — Sound Bath ×2. Requires owning ≥ 1 Sound Bath. Target: soundBath. Flavor: "432 Hz. The frequency of truth. You heard it."
- `resonanceTheory`: "Resonance Theory" (cost 180,000,000) — Sound Bath ×3. Requires `acousticAlignment`. Target: soundBath. Flavor: "You can hear buildings thinking. They are content."

**Indulgence:**
- `patronOfTheArts`: "Patron of the Arts" (cost 3,600,000,000) — Art Gallery ×2. Requires owning ≥ 1 Art Gallery. Target: artGallery. Flavor: "Your name is on the wall. In gold. As requested."
- `permanentCollection`: "The Permanent Collection" (cost 54,000,000,000) — Art Gallery ×3. Requires `patronOfTheArts`. Target: artGallery. Flavor: "The permanent collection is mostly vibes. Fine art vibes."

**Additional HPC Upgrade — Late Game:**
- `theBlur` (Spirit, cost 8,000,000,000): "The Blur" — HPC ×5. Flavor: "Your fingers move too fast for the laws of physics to fully track."
- `fingerOlympics` (Mind, cost 75,000,000): "Finger Olympics" — HPC ×3. Flavor: "Certified by: nobody. Verified by: your score."

### Soft-Locking Path Upgrades Behind Building Ownership

All path-specific upgrades that target a named building must require `requiresBuilding: { buildingId: 1 }` to be visible. This prevents players from seeing upgrades for buildings they haven't discovered yet. The following existing upgrades need `requiresBuilding` added:

| Upgrade | Target | Add requiresBuilding |
|---|---|---|
| `artisanalCheese` | snackBar | `{ snackBar: 1 }` |
| `napMastery1` | napPod | `{ napPod: 1 }` |
| `theFeastProtocol` | feastHall | `{ feastHall: 1 }` |
| `hotSpringRevelation` | hotTub, spaSanctum | `{ hotTub: 1 }` |
| `michelinExperience` | feastHall | `{ feastHall: 1 }` |
| `groupChatResponds` | gratitudeJournal | `{ gratitudeJournal: 1 }` |
| `crowdGoesWild` | joyCult | `{ joyCult: 1 }` |
| `lifeOfTheParty` | joyCult | `{ joyCult: 1 }` |
| `validationProfessional` | therapy | `{ therapy: 1 }` |
| `fanBaseModest` | joyCult, eternalParty | `{ joyCult: 1 }` |
| `unconditionalAcceptance` | joyCult, eternalParty, therapy, gratitudeJournal | `{ joyCult: 1 }` |
| `adoringCrowdEternal` | eternalParty | `{ eternalParty: 1 }` |
| `bookThatGetsYou` | gratitudeJournal | `{ gratitudeJournal: 1 }` |
| `suddenUnderstanding` | dopamineLab | `{ dopamineLab: 1 }` |
| `finishingCreativeProject` | dopamineLab | `{ dopamineLab: 1 }` |
| `deepWorkActually` | dopamineLab | `{ dopamineLab: 1 }` |
| `rabbitHoleAcademic` | dopamineLab, gratitudeJournal, therapy | `{ dopamineLab: 1 }` |
| `pilgrimsRest` | hedonistMonastery | `{ hedonistMonastery: 1 }` |
| `nirvanaAdjacent` | hedonistMonastery, nirvanaResort, spaSanctum, gratitudeJournal | `{ hedonistMonastery: 1 }` |
| `vacationThatFixed` | nirvanaResort | `{ nirvanaResort: 1 }` |
| `customEverything` | pleasurePalace | `{ pleasurePalace: 1 }` |
| `thePenthouse` | pleasurePalace | `{ pleasurePalace: 1 }` |
| `chefsTablePermanent` | feastHall, snackBar | `{ feastHall: 1 }` |
| `personalMasseuse` | massageStudio | `{ massageStudio: 1 }` |
| `firstClassExistence` | pleasurePalace, nirvanaResort, blissSingularity | `{ pleasurePalace: 1 }` |
| `perfectLifeDrafted` | global | — (no change) |

---

## 5. New Relics

The following 4 new relics are added (all non-post-prestige for accessibility):

| ID | Name | karmaCost | Description | Flavor |
|---|---|---|---|---|
| `bubbleTeaCard` | Bubble Tea Loyalty Card | 80 | Sweet Treat HPS ×3. | *"Tenth cup free. You have lost count of how many free cups you've received."* |
| `cozyPlaylist` | The Playlist (Correct) | 200 | Clicking also adds to idle HPS for 5 s. HPS ×1.15. | *"Every song was right. In order. Nobody knows how."* |
| `zenBell` | The Zen Bell | 450 | Each Vibe Check buff lasts 2× longer. +1 karma/s base. | *"One strike. Reverberates forever."* |
| `nappingCat` | The Napping Cat | 130 | Pilgrimage duration −50%. Pilgrimage burst ×2. | *"It knows. It naps anyway. This is the lesson."* |

**Implementation notes:**
- `bubbleTeaCard`: Applied in `computeBuildingHPS` — if `activeRelics.includes('bubbleTeaCard')` and `buildingId === 'sweetTreat'`, multiply by 3.
- `cozyPlaylist`: Applied in `computeTotalHPS` — if relic active, add flat bonus of `hps * 0.15` (the ×1.15 part) and in tick.ts, record last-click time for 5 s idle reset bonus (not HPS formula change — this is the ×1.15 global already covers the always-on part; the 5 s idle click benefit is implemented as: clicking resets idle timer normally, which already benefits idleHPSMultiplier).
- `zenBell`: In `doPassVibeCheck`, apply ×2 duration; in `computeKarmaRate`, add flat +1 if relic active.
- `nappingCat`: In `doTriggerPilgrimage`, set pilgrimage timer to 60 s (instead of 120 s); in `computePilgrimageBurst`, multiply by 2.

**RelicId type update required:** Add `'bubbleTeaCard' | 'cozyPlaylist' | 'zenBell' | 'nappingCat'` to the union.

---

## 6. New Wheel Upgrades

### Auto-Purchase (3 tiers, each requires previous)

| ID | Name | Tier | shardCost | requires | Description |
|---|---|---|---|---|---|
| `autoBuyer1` | The Lazy Pilgrim | 3 | 60 | `deepRoots`, `reincarnatedWealthier` | Every 30 s, buys 1 of the most expensive building you can afford. |
| `autoBuyer2` | Bulk Enlightenment | 4 | 200 | `autoBuyer1`, `heavensInfrastructure` | Every 30 s, buys max of the most expensive building you can afford. |
| `autoBuyer3` | Automatic Temple | 5 | 1,500 | `autoBuyer2`, `eternalFoundation` | Every 30 s, buys max of the most expensive affordable building, then max of the next, and so on until nothing is affordable. |

**Implementation:** `autoBuyTimer: number` added to `GameState` and `SaveData`. In `applyTick`, decrement timer; on expiry, find the most expensive affordable building, run the appropriate buy logic, reset timer to 30 s.

### Additional Interesting Upgrades

| ID | Name | Tier | shardCost | requires | Description |
|---|---|---|---|---|---|
| `karmaTithe` | Karma Tithe | 2 | 12 | `karmicVessel` | Each building owned also generates +0.001 karma/s passively. |
| `ritualAmplification` | Ritual Amplification | 3 | 50 | `ritualMastery`, `enlightenedClicker` | Ritual burst multiplier doubled (×7 → ×14 HPC). |
| `livingTemple` | The Living Temple | 2 | 10 | `theSecondSmile` | Clicking generates +1 karma per click (not just HPC). |
| `prestigeMomentum` | Prestige Momentum | 3 | 60 | `samsarasGift`, `deepRoots` | First 3 minutes of each run: ×3 all happiness earned. |

**Implementation notes:**
- `karmaTithe`: In `computeKarmaRate`, add `0.001 × totalBuildingCount` if wheel purchased.
- `ritualAmplification`: In `doClick`, change burst multiplier from 7 to 14 if purchased.
- `livingTemple`: In `doClick`, add `+1` karma if purchased.
- `prestigeMomentum`: In `applyTick`, if `totalPlaytime < 180` and wheel purchased, multiply `happinessGained` by 3.

---

## 7. HPC Balance Analysis

**Current max HPC calculation (all upgrades + wheel):**

Base = 1; hpcBonuses (flat): perfectTemperature +5, rememberedBirthday +10 → sum = 15
HPC multipliers (stacked): 1.5 (notifications37) × 1.5 (warmBreadAtLast) × 2 (winningArgumentOnline) × 2.5 (unnecessaryPurchase) × 2.5 (complimentThatLanded) × 4 (viralMoment) × 2 (deepWorkActually) × 1.5 (manifestingWorked) × 1.5 (hedonisticImperative) × 2 (paradoxResolved) × 2.5 (meaningOfLifeFound) = **≈ 2,250×**

```
HPC_base = (1 + 15) × 2250 = 36,000
× theSecondSmile (×2)           = 72,000
× enlightenedClicker (prestige 20, ×3) = 216,000  
× permanentHPCBonus (10% events)       ≈ 237,600
```

With new `fingerOlympics` (×3) + `theBlur` (×5):
```
× 3 × 5 = 15× additional
≈ 237,600 × 15 = 3,564,000
```

**Passive HPS benchmark at mid-game (no upgrades, 50 of each pre-spaSanctum building):**

With rebalanced values and 50 of each (steps 0–9):
```
50×(0.1 + 0.75 + 4 + 12 + 20 + 100 + 270 + 470 + 2000 + 7800) = 50 × 10,747.85 ≈ 537,000 HPS
```

Clicking at 5/s with base HPC ~36,000 (pre-new upgrades):
```
Click HPS = 5 × 36,000 = 180,000 (≈ 33% of passive — meaningful ✓)
```

At late game with `fingerOlympics` + `theBlur`, HPC ~3,564,000, clicking at 5/s:
```
Click HPS = 5 × 3,564,000 = 17,820,000
```

Late-game passive HPS with all buildings × 50 (rough sum including new buildings, no upgrades):
```
≈ 50 × (all building HPS summed) ≈ billions
```

At billions of passive HPS, 17M click HPS is small (~0.001%). To compensate, upgrade multipliers (×10+ global from templeEternal, etc.) apply to both equally. The HPC from `ritualAmplification` (×14) + `enlightenedClicker` (×4 at prestige 30) can push clicking to a much more competitive level at high-prestige play.

**Conclusion:** Add `fingerOlympics` (×3, cost 75M) and `theBlur` (×5, cost 8B) as path upgrades (mind and spirit respectively). Also add `ritualAmplification` wheel upgrade.

---

## 8. Bliss Shard Economy Analysis

**First transcendence (threshold 1e13):**
```
shards = floor(sqrt(1e13 / 1e11)) = floor(sqrt(100)) = 10 shards
```
Tier 1 total cost: 1+1+1+2+2+3 = **10 shards exactly**. 

**Subsequent transcendences:**
- Run 2 threshold: 8e13 → `floor(sqrt(800))` = 28 shards;  accumulated = 38
- Run 3 threshold: 6.4e14 → `floor(sqrt(6400))` = 80; accumulated = 118
- Tier 2 total cost: 7+8+10+12+15+15 = 67 shards — affordable after run 3 ✓
- Tier 3 total cost: 35+45+55+65+70+80 = 350 shards — needs several more runs

**New wheel upgrades affect costs:**
- `livingTemple` T2: 10 shards, `karmaTithe` T2: 12 shards, `prestigeMomentum` T3: 60 — all manageable
- New `autoBuyer1` T3: 60 shards — accessible after ~run 4-5 ✓
- New `autoBuyer2` T4: 200 shards — ~run 5-6 ✓
- New `autoBuyer3` T5: 1,500 shards — late game ✓
- New `ritualAmplification` T3: 50 shards ✓

Shard economy does not greatly exceed shop costs at any tier. ✓

---

## 9. Implementation Checklist

1. **types.ts**: Add 4 new `BuildingId` values; add 4 new `RelicId` values; add `autoBuyTimer` to `GameState` and `SaveData`.
2. **buildings.ts**: Add 4 new buildings; update `INITIAL_BUILDINGS`; rebalance all existing `baseHPS` values per table above.
3. **relics.ts**: Add 4 new `RelicDef` entries.
4. **upgrades.ts**: Add offering tiers for 4 new buildings; add 8 new path upgrades; add `requiresBuilding` to soft-lock ~25 existing path upgrades.
5. **wheel.ts**: Add 7 new `WheelUpgradeDef` entries (`autoBuyer1/2/3`, `karmaTithe`, `ritualAmplification`, `livingTemple`, `prestigeMomentum`).
6. **achievements.ts**: Add 7 new achievements (`bobaAddiction`, `studiousHaul`, `soundBathFirst`, `artGalleryFirst`, `tenSweetTreats`, `artCollector`, `allNewBuildings`); update prestige achievement names/descriptions.
7. **engine.ts**: Add `computePrestigeRequirement` helper; apply new relic effects (`zenBell` karma rate, `nappingCat` pilgrimage, `bubbleTeaCard` building multiplier, `cozyPlaylist` global); apply `karmaTithe` in `computeKarmaRate`; apply `karmicOverflow` karma ×10 in `computeKarmaRate`.
8. **actions.ts**: Implement missing wheel effects in `doTriggerTranscendence` (`rememberedJoy`, `reincarnatedWealthier`, `deepRoots` actual buildings, `theSecondComing`, `nirvanaBlueprint`, `eternalFoundation`, `karmicOverflow` slots, `theRemembering`, `blissOverdrive`); implement `livingTemple` click karma; implement `ritualAmplification` burst; update `doPurchaseWheelUpgrade` for new upgrades; update `computeMaxAffordable` usage in `allPostPrestige` check to include all new post-prestige buildings; wire all new building achievement triggers; implement `nappingCat` relic in `doTriggerPilgrimage`.
9. **tick.ts**: Implement auto-buy timer logic; implement `karmaTithe` in karma rate (via `computeKarmaRate` which handles it); implement `prestigeMomentum` early-game ×3; wire new achievement IDs.
10. **persistence.ts**: Add `autoBuyTimer` to `stateToSaveData` / `saveDataToState`; implement `theLongView` sqrt formula in `computeOfflineProgress`.
11. **store.ts**: Initialize `autoBuyTimer` in `createInitialState`.
