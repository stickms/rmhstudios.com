# Temple of Joy — Content Expansion & Balance Plan

## Target Playtimes
- **First transcendence**: 20–30 hours of active play
- **Full completion** (all achievements, all content): 200+ hours across many transcendences
- **Happiness scale**: gameplay spans from 0 to 1e99+

---

## 1. Current Balance Problems

### 1a. Global HPS Multipliers Compound to ~×2e8
There are 20 upgrades with `globalHPSMultiplier`. Their product is ~×219,000,000.  
With base HPS of 200M from buildings, effective peak HPS exceeds 4e16 — players reach transcendence in minutes, not hours.

### 1b. Per-Building Multipliers Stack to ×4500
Offerings (×2 × ×3 × ×5 = ×30) + path upgrades (×5–×10) + synergies (×4–×15) = thousands of multiplier per building. Combined with global, this makes late-game HPS astronomical.

### 1c. Transcendence Threshold Decreases With Prestige (Broken)
`max(1e8, 1e12 * 0.85^n)` means each prestige *lowers* the threshold. Should increase.

### 1d. Content Ends at ~1e11
Highest building costs 7.5e10. No content extends gameplay toward 1e99. Milestones only go to 1e48. Number formatting only to 1e63.

### 1e. Building ROIs Are Too Uniform (120–375s)
Every building pays for itself in 2–6 minutes. Late buildings should have longer base ROI, compensated by upgrades. This creates a "wall" that upgrades help overcome — a core incremental game loop.

---

## 2. Building Rebalance

### Design Principles
- **Cost step**: ×4–6 between tiers (early) ramping to ×7–10 (late)
- **HPS step**: ×2.5–3.5 between tiers
- **Base ROI**: 150s (tier 1) → 6700s (tier 18), escalating gradually
- **Upgrade compensation**: mid/late buildings feel slow until upgrades accelerate them
- **Post-prestige buildings**: 6 new buildings (tiers 19–24) gated behind `requiresPrestige`

### Pre-Prestige Buildings (1–18)

| # | ID | Cost | Base HPS | ROI (s) |
|---|-----|------|----------|---------|
| 1 | moodCandle | 15 | 0.1 | 150 |
| 2 | napPod | 100 | 0.5 | 200 |
| 3 | snackBar | 500 | 2 | 250 |
| 4 | hotTub | 2,500 | 7 | 357 |
| 5 | massageStudio | 12,000 | 25 | 480 |
| 6 | gratitudeJournal | 50,000 | 80 | 625 |
| 7 | goonCave | 200,000 | 250 | 800 |
| 8 | joyCult | 750,000 | 700 | 1,071 |
| 9 | spaSanctum | 3,000,000 | 2,000 | 1,500 |
| 10 | therapy | 15,000,000 | 5,500 | 2,727 |
| 11 | pleasurePalace | 80,000,000 | 14,000 | 5,714 |
| 12 | dopamineLab | 500,000,000 | 38,000 | 13,158 |
| 13 | hedonistMonastery | 3,500,000,000 | 100,000 | 35,000 |
| 14 | feastHall | 25,000,000,000 | 280,000 | 89,286 |
| 15 | nirvanaResort | 200,000,000,000 | 750,000 | 266,667 |
| 16 | eternalParty | 1,800,000,000,000 | 2,000,000 | 900,000 |
| 17 | heavenOnEarth | 18,000,000,000,000 | 5,500,000 | 3,272,727 |
| 18 | blissSingularity | 210,000,000,000,000 | 15,000,000 | 14,000,000 |

Late buildings have massive base ROI, but with ×50–100 effective multipliers from upgrades/offerings/synergies, actual time-to-ROI drops to manageable 5–30 minutes.

### Post-Prestige Buildings (19–24)

| # | ID | Cost | Base HPS | Prestige Gate |
|---|-----|------|----------|---------------|
| 19 | zenGarden | 5e15 | 45,000,000 | ≥ 1 |
| 20 | euphoriaSprings | 8e17 | 200,000,000 | ≥ 3 |
| 21 | serenityEngine | 5e20 | 1,000,000,000 | ≥ 5 |
| 22 | raptureCathedral | 1e24 | 6,000,000,000 | ≥ 8 |
| 23 | cosmicJacuzzi | 1e28 | 50,000,000,000 | ≥ 12 |
| 24 | omniscientSpa | 1e33 | 500,000,000,000 | ≥ 18 |

---

## 3. Upgrade Rebalance

### Global HPS Multipliers (target total: ~×50–80)
| Old value | New value |
|-----------|-----------|
| ×1.5 | ×1.15 |
| ×2 | ×1.25 |
| ×3 | ×1.5 |
| ×5 | ×2 |
| ×10 | ×3 |

New total product ≈ ×60 (from 20 upgrades).

### Per-Building Multipliers
| Old value | New value |
|-----------|-----------|
| ×2 | ×1.5 |
| ×3 | ×2 |
| ×4 | ×2.5 |
| ×5 | ×3 |
| ×6 | ×3.5 |
| ×10 | ×5 |

### HPC Multipliers
Same mapping as building multipliers.

### Idle HPS Multipliers
| Old | New |
|-----|-----|
| ×2 | ×1.5 |
| ×3 | ×2 |

### Offering Multipliers (per building)
| Tier | Old | New | Net per building |
|------|-----|-----|------------------|
| 1 | ×2 | ×1.5 | |
| 2 | ×3 | ×2 | |
| 3 | ×5 | ×2.5 | |
| Total | ×30 | ×7.5 | |

### Upgrade Costs
All upgrade costs multiplied by **5×** to slow acquisition rate. Players will only afford ~60% of upgrades before first transcendence.

---

## 4. Synergy Rebalance

Halve all synergy multipliers:

| Synergy | Old | New |
|---------|-----|-----|
| drowsyEconomy | ×4 | ×2 |
| hedonistRoutine | ×6 | ×3 |
| cultCuisine | ×5 | ×2.5 |
| blissPipeline | ×8 | ×4 |
| philosophersSpa | ×10 | ×5 |
| edensArchitecture | ×12 | ×6 |
| eternalFeast | ×15 | ×7 |

Add 3 new synergies for post-prestige buildings.

---

## 5. Transcendence Formula

**Old**: `max(1e8, 1e12 * 0.85^prestigeCount)` — decreases each prestige (broken)

**New**: `1e13 * 8^prestigeCount`

| Prestige # | Threshold |
|------------|-----------|
| 1st | 1e13 |
| 2nd | 8e13 |
| 3rd | 6.4e14 |
| 5th | 3.3e16 |
| 10th | 1.3e22 |
| 15th | 3.5e27 |
| 20th | 9.2e32 |

Each subsequent prestige requires 8× more lifetime happiness, but wheel upgrades and new buildings make each run proportionally faster.

### Bliss Shard Formula (unchanged)
`floor(sqrt(lifetimeHP / 1e10))` — at 1e13, yields 31 shards. At 1e22, yields 31,623 shards. Scales well.

---

## 6. Milestones Extension (to 1e99)

Current milestones go to 1e48. Extend with one every 3 orders of magnitude from 1e51 to 1e99, with escalating hpsMultiplier bonuses (×1.5 to ×3). This creates a "soft content" layer that rewards continued play even without new buildings.

---

## 7. Number Formatting

Extend TIERS in numbers.ts from 1e63 to 1e99 with themed suffix names.

---

## 8. New Content

### 4 New Relics (late-game)
- **Karma Resonator**: HPS scales +2% per prestige count
- **Lighthouse of Joy**: Pilgrimage duration halved, burst ×3
- **Temporal Comfort**: Offline progress speed ×2
- **Infinite Gratitude**: All offering upgrade costs -30%

### New Achievements
- Building milestones for 200, 500, 1000 counts
- Lifetime happiness at 1e18, 1e24, 1e30, 1e50, 1e75, 1e99
- Prestige counts: 30, 50
- Playtime: 500h, 1000h
- Post-prestige building achievements

### Wheel Tier 5 Upgrades
- **Eternal Foundation**: Start each run with first 10 buildings at 10 copies
- **Karmic Overflow**: Karma rate ×20 after prestige 10
- **The Remembering**: All buildings start at 50% of peak count from previous run
- **Bliss Overdrive**: ×100 HPS for first 30 minutes of each run

---

## 9. Progression Model

### Run 1 (25 hours)
Buildings 1–18, ~60% of upgrades affordable. Reach 1e13 lifetime. Earn ~31 shards.

### Runs 2–4 (15 hours each)
Buy Tier 1–2 wheel upgrades. Unlock buildings 19–20. Reach 1e14–1e16.

### Runs 5–8 (10 hours each)
Tier 3 wheel upgrades. Buildings 21–22. Reach 1e20+.

### Runs 9–15 (8 hours each)
Tier 4 upgrades. Buildings 23–24. Reach 1e30+.

### Runs 16–25+ (6 hours each)
Tier 5 upgrades. Milestones carry to 1e50+. Full wheel purchased.

### Endgame (runs 25+)
Compound milestone multipliers + all relics + all upgrades push toward 1e99.
Total playtime: 200–300+ hours.
