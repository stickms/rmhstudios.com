# Temple of Joy — Patch 2: The Great Expansion

## Overview

This patch doubles all major content categories, adds 5 new Wheel tiers, and fixes every mechanic bug found during a thorough audit. Every line of game logic was cross-referenced against its description.

---

## Part A: Mechanic Audit Findings

### BUG 1 — Counter Resets on Transcendence

**Severity**: High  
**Files**: `actions.ts` → `doTriggerTranscendence`, `makeInitialState`

`doTriggerTranscendence` calls `makeInitialState(overrides)` but does **not** pass the following cumulative counters as overrides, so they reset to 0 every transcendence:

| Counter               | Achievement(s) impacted                                | Description says "total" |
|------------------------|--------------------------------------------------------|--------------------------|
| `totalPlaytime`        | oneHour, tenHours, hundredHours, twoHundredHours, fiveHundredHours, thousandHours | Yes |
| `totalClicks`          | hundredClicks, thousandClicks, tenThousandClicks       | Yes |
| `totalPilgrimages`     | pilgrimageTen                                          | Yes |
| `totalVibeChecks`      | vibeCheckTen                                           | Yes |
| `totalEventsResolved`  | eventsFifty                                            | Yes |
| `epicurusApprovedCount`| epicurusApproved (hidden)                              | Implicit |
| `equippedRelicsHistory`| allRelics                                              | Implicit |

**Fix**: Preserve these in `doTriggerTranscendence` by passing them in the override object.

---

### BUG 2 — `deepRoots` Mismatch Between Transcendence and HPS Preview

**Severity**: Low  
**Files**: `actions.ts` → `doTriggerTranscendence`, `engine.ts` → `computeStartingHPSFromWheel`

`doTriggerTranscendence` grants deepRoots copies to: `moodCandle, napPod, snackBar, sweetTreat, hotTub`  
`computeStartingHPSFromWheel` simulates deepRoots with: `moodCandle, napPod, snackBar, hotTub, massageStudio`

`sweetTreat` vs `massageStudio` mismatch. The transcendence action is authoritative; the preview function is wrong.

**Fix**: Update `computeStartingHPSFromWheel` to use `sweetTreat` instead of `massageStudio`.

---

### BUG 3 — Missing Offering Upgrades for Many Sources

**Severity**: Medium  
**Files**: `upgrades.ts`

The comment says "24 sources × 3 tiers = 72 upgrades" but only the following sources have offering upgrades defined:
- moodCandle, napPod, snackBar, hotTub, massageStudio, sweetTreat, retailTherapy, soundBath, artGallery (9 sources)

Missing offerings for 13 base sources: gratitudeJournal, goonCave, joyCult, spaSanctum, therapy, pleasurePalace, dopamineLab, hedonistMonastery, feastHall, nirvanaResort, eternalParty, heavenOnEarth, blissSingularity

The `computeOfferingMultiplier` function dynamically looks up `${sourceId}Offering${tier}`, so missing definitions simply return multiplier 1.0 (no crash, just no effect).

**Fix**: Add offering upgrades for all 13 missing base sources. Post-prestige sources intentionally excluded (they get boosted via other means).

---

### BUG 4 — `allRelics` Achievement Hardcoded to 20

**Severity**: Low (will break when new relics are added)  
**Files**: `actions.ts` → `doEquipRelic`, `doAuditAchievements`

Both check `newHistory.size >= 20` / `relicHistory.length >= 20`. When we add more relics, this needs to use `RELICS.length`.

**Fix**: Import `RELICS` and use `RELICS.length` instead of magic number 20.

---

### BUG 5 — `fullWheel` Achievement Hardcoded Tier 4 IDs

**Severity**: Low  
**Files**: `actions.ts` → `doPurchaseWheelUpgrade`, `doAuditAchievements`

Hardcoded list: `['templeEternal', 'infiniteWheel', 'nirvanaBlueprint', 'divineMemory', 'autoBuyer2']`. Should instead filter `WHEEL_UPGRADES` by `tier === 4`.

**Fix**: Dynamically compute tier 4 IDs from `WHEEL_UPGRADES`.

---

### VERIFIED WORKING (No Issues Found)

All 20 relics correctly cross-referenced with engine.ts, actions.ts, tick.ts implementations.  
All 30 wheel upgrades correctly cross-referenced with implementation.  
All synergies correctly applied in `computeSynergyMultiplier`.  
All milestones correctly checked against `runHappiness` in tick.ts.  
All event effects correctly applied in `doResolveEvent`.  
`eternalNap` relic correctly implemented in `persistence.ts` → `computeOfflineProgress` (efficiency = 1.0).  
`saintsPatience` wheel correctly implemented (16-hour cap).  
`theLongView` wheel correctly implemented (pow(0.85) diminishing curve, bypasses cap).  
Transcendence threshold formula: `1e13 * 8^prestigeCount` ✓  
Bliss shard formula: `10 + prestigeCount*10 + log10(happiness)` with wheel bonuses ✓  

---

## Part B: New Content

### B1. New Sources (28 → 56)

28 new sources at prices above the current maximum (1e33). All are post-prestige, requiring increasingly high prestige counts.

| # | ID | Name | Icon | baseCost | baseHPS | costMult | reqPrestige | Tagline |
|---|-----|------|------|----------|---------|----------|-------------|---------|
| 29 | dreamWeaver | Dream Weaver | 🌙 | 5e34 | 1.2e32 | 1.14 | 20 | "Weaves joy from sleeping minds." |
| 30 | laughterForge | Laughter Forge | 😂 | 2e36 | 5e33 | 1.14 | 22 | "Happiness is hammered into shape here." |
| 31 | cloudLounge | Cloud Lounge | ☁️ | 8e37 | 2e35 | 1.14 | 24 | "Sit on a cloud. Judge nothing." |
| 32 | goldenHammock | Golden Hammock | 🏅 | 3e39 | 8e36 | 1.13 | 26 | "Suspend disbelief. And your body." |
| 33 | pleasureArchive | Pleasure Archive | 📚 | 1e41 | 3e38 | 1.13 | 28 | "Every good memory, indexed." |
| 34 | infiniteBuffet | Infinite Buffet | 🍱 | 5e42 | 1.5e40 | 1.13 | 30 | "It refills before you finish." |
| 35 | echoGarden | Echo Garden | 🌺 | 2e44 | 6e41 | 1.13 | 32 | "Every flower remembers a laugh." |
| 36 | blissConduit | Bliss Conduit | ⚡ | 8e45 | 2.5e43 | 1.12 | 34 | "Pure joy, no middleman." |
| 37 | seraphStation | Seraph Station | 👼 | 3e47 | 1e45 | 1.12 | 36 | "Angels clock in. Smiles clock out." |
| 38 | paradoxEngine | Paradox Engine | ♾️ | 1.5e49 | 5e46 | 1.12 | 38 | "Powered by contradictions." |
| 39 | memoryPalace | Memory Palace | 🏛️ | 6e50 | 2e48 | 1.12 | 40 | "Every room: your best day." |
| 40 | auroraSpire | Aurora Spire | 🌈 | 2.5e52 | 8e49 | 1.11 | 42 | "The light show never ends." |
| 41 | gravitySpa | Gravity Spa | 🛸 | 1e54 | 3.5e51 | 1.11 | 44 | "Zero-G relaxation." |
| 42 | euterpeHall | Euterpe's Hall | 🎵 | 4e55 | 1.5e53 | 1.11 | 46 | "The muse of music lives here." |
| 43 | ambrosiaTap | Ambrosia Tap | 🍯 | 2e57 | 6e54 | 1.11 | 48 | "Nectar of the gods, on tap." |
| 44 | joySatellite | Joy Satellite | 🛰️ | 8e58 | 2.5e56 | 1.10 | 50 | "Beams happiness from orbit." |
| 45 | elysiumGate | Elysium Gate | 🚪 | 3e60 | 1e58 | 1.10 | 52 | "Step through. Stay forever." |
| 46 | cosmicHamper | Cosmic Hamper | 🧺 | 1.5e62 | 5e59 | 1.10 | 54 | "Packed by the universe itself." |
| 47 | eternitySofa | Eternity Sofa | 🛋️ | 6e63 | 2e61 | 1.10 | 55 | "Sit down. Never need to stand." |
| 48 | nirvanaCore | Nirvana Core | 💎 | 2.5e65 | 8e62 | 1.09 | 56 | "The beating heart of bliss." |
| 49 | transcendenceLab | Transcendence Lab | 🔬 | 1e67 | 3.5e64 | 1.09 | 58 | "Studying happiness. Becoming it." |
| 50 | celestialBath | Celestial Bath | 🌊 | 4e68 | 1.5e66 | 1.09 | 60 | "Water from the cosmic ocean." |
| 51 | euphoriaReactor | Euphoria Reactor | ☢️ | 2e70 | 6e67 | 1.09 | 62 | "Splitting atoms of sadness." |
| 52 | pleasurePlanet | Pleasure Planet | 🪐 | 8e71 | 2.5e69 | 1.08 | 64 | "An entire world of joy." |
| 53 | karmaFountain | Karma Fountain | ⛲ | 3e73 | 1e71 | 1.08 | 66 | "Every coin: a wish granted." |
| 54 | infiniteHug | Infinite Hug | 🤗 | 1.5e75 | 5e72 | 1.08 | 68 | "It never lets go. You never want it to." |
| 55 | joyNova | Joy Nova | 💥 | 6e77 | 2e74 | 1.08 | 70 | "Exploding with happiness." |
| 56 | omegaTemple | Omega Temple | 🏯 | 3e80 | 1e77 | 1.07 | 75 | "The final temple. The first joy." |

### B2. New Upgrades

#### Path Upgrades (one new late-game upgrade per path, plus new paths)

**Extended Carnal** (2 new):
| ID | Name | Cost | Effect | Requires |
|----|------|------|--------|----------|
| napMastery4 | Nap Mastery Vol. IV | 5e12 | ×3 napPod HPS | napMastery3, prestige 2 |
| dreamBanquet | The Dream Banquet | 1e16 | ×2 feastHall, sweetTreat, snackBar HPS | michelinExperience, prestige 5 |

**Extended Social** (2 new):
| ID | Name | Cost | Effect | Requires |
|----|------|------|--------|----------|
| legendaryReputation | Legendary Reputation | 5e13 | ×3 joyCult, eternalParty HPS | adoringCrowdEternal, prestige 3 |
| globalFandom | Global Fandom | 2e17 | ×2 global HPS | legendaryReputation, prestige 8 |

**Extended Mind** (2 new):
| ID | Name | Cost | Effect | Requires |
|----|------|------|--------|----------|
| quantumFocus | Quantum Focus | 1e14 | ×5 dopamineLab HPS, +×2 HPC | grandUnifiedTheoryOfFun, prestige 4 |
| omniscientInsight | Omniscient Insight | 5e18 | ×1.5 global HPS | quantumFocus, prestige 10 |

**Extended Spirit** (2 new):
| ID | Name | Cost | Effect | Requires |
|----|------|------|--------|----------|
| cosmicWalk | The Cosmic Walk | 2e14 | ×3 karmaRateMult, +×1.5 global HPS | enlightenmentPartial, prestige 5 |
| absolutePeace | Absolute Peace | 1e19 | ×3 idle HPS, +×2 global HPS | cosmicWalk, prestige 12 |

**Extended Indulgence** (2 new):
| ID | Name | Cost | Effect | Requires |
|----|------|------|--------|----------|
| personalIsland | The Personal Island | 5e14 | ×3 nirvanaResort, pleasurePalace HPS | perfectLifeDrafted, prestige 6 |
| universalLuxury | Universal Luxury | 2e19 | ×2.5 global HPS | personalIsland, prestige 15 |

**Extended Philosophy** (2 new):
| ID | Name | Cost | Effect | Requires |
|----|------|------|--------|----------|
| theGrandSynthesis | The Grand Synthesis | 5e16 | ×5 global HPS, +×3 HPC | meaningOfLifeFound, prestige 10 |
| joyPhilosophiae | Joy Philosophiae | 1e20 | ×3 global HPS, ×4 karma rate | theGrandSynthesis, prestige 20 |

**New Path: Synergy** (8 upgrades, postPrestige) — boosts cross-source effects:
| ID | Name | Cost | Effect |
|----|------|------|--------|
| synergyAwakening | Synergy Awakening | 1e11 | All synergy multipliers ×1.25 (via globalHPSMultiplier) |
| resonantBonds | Resonant Bonds | 5e12 | ×1.5 global HPS |
| harmonyProtocol | Harmony Protocol | 2e14 | ×2 HPC, ×1.25 global HPS |
| symbioticGrowth | Symbiotic Growth | 1e16 | ×2 global HPS |
| crossPollination | Cross-Pollination | 5e17 | ×1.5 karma rate, ×1.5 global HPS |
| unifiedField | The Unified Field | 2e19 | ×3 global HPS |
| convergencePoint | Convergence Point | 1e21 | ×2 HPC, ×2 global HPS |
| theOmegaBond | The Omega Bond | 5e23 | ×5 global HPS |

**Missing Offering Upgrades** — Add tier 1/2/3 offerings for the 13 base sources that lack them:
gratitudeJournal, goonCave, joyCult, spaSanctum, therapy, pleasurePalace, dopamineLab, hedonistMonastery, feastHall, nirvanaResort, eternalParty, heavenOnEarth, blissSingularity

(13 × 3 = 39 new offering upgrades, following the same pattern: tier 1 = baseCost×80, ×1.5; tier 2 = baseCost×500, ×2; tier 3 = baseCost×3000, ×2.5)

**New Source Offering Upgrades** — Add tier 1/2/3 offerings for 6 existing post-prestige sources:
zenGarden, euphoriaSprings, serenityEngine, raptureCathedral, cosmicJacuzzi, omniscientSpa

(6 × 3 = 18 new offering upgrades)

### B3. New Relics (20 → 40)

20 new relics with karma costs above the current max (12000).

| # | ID | Name | Description | Flavor | karmaCost |
|---|-----|------|-------------|--------|-----------|
| 21 | crystalBall | Crystal Ball | Vibe Check appears 30% faster. | "It sees your vibes before you feel them." | 350 |
| 22 | goldenPen | The Golden Pen | +20% permanent HPS per event resolved (additive, capped at +100%). | "Every word you write becomes true." | 900 |
| 23 | perpetualTeapot | Perpetual Teapot | ×2 Snack Bar, Sweet Treat, Feast Hall HPS. | "It never empties. It never cools." | 500 |
| 24 | astronomersLens | Astronomer's Lens | Milestones unlock 1 tier earlier (threshold ÷10). | "You see farther. The universe notices." | 2500 |
| 25 | silkRobe | The Silk Robe | ×2 idle HPS bonus. Stacks with Laurel Crown. | "Comfort so profound it generates karma." | 700 |
| 26 | luckyCoin | Lucky Coin | Events always give ×1.5 effect values. | "Heads: you win. Tails: also you." | 1500 |
| 27 | eternalQuill | Eternal Quill | Offerings last 50% longer. | "Contracts written in eternity's ink." | 3500 |
| 28 | mirrorOfTruth | Mirror of Truth | ×2 Gratitude Journal, Therapy HPS. | "Shows what matters. Hides what doesn't." | 600 |
| 29 | celestialCompass | Celestial Compass | Pilgrimage cooldown reduced 50%. | "Points to joy. Always." | 1800 |
| 30 | gardenersGlove | Gardener's Glove | ×5 Zen Garden HPS. ×2 Echo Garden HPS. | "Everything you touch grows." | 4000 |
| 31 | starChart | Star Chart | +3% HPS per prestige count (stacks with infiniteGratitude). | "Every cycle mapped. Every path remembered." | 8000 |
| 32 | ancientHourglass | Ancient Hourglass | Sacred Ledger ramp speed doubled (×0.2/min instead of ×0.1/min). | "Time runs differently here. Better." | 5000 |
| 33 | jestersCrown | Jester's Crown | Ritual burst ×1.5. Click achievements count ×2. | "Foolishness is its own reward." | 2200 |
| 34 | soulLantern | Soul Lantern | HPS-per-source bonus: each source type adds +0.5% HPS per copy owned. | "One light. Infinite reflections." | 15000 |
| 35 | cosmicTeaCup | Cosmic Tea Cup | ×3 Ambrosia Tap, Celestial Bath HPS. | "The cup runneth over. Cosmically." | 20000 |
| 36 | infinityScarf | Infinity Scarf | Each equipped relic adds +5% global HPS (×1.05 per relic). | "Fashion meets infinity. Infinity wins." | 10000 |
| 37 | pilgrimsStaff | Pilgrim's Staff | Pilgrimage burst ×3. Duration −25%. | "The staff carried them. They never knew." | 7000 |
| 38 | dreamCatcher | Dream Catcher | ×4 Dream Weaver HPS. ×2 Memory Palace HPS. | "Catches dreams. Releases joy." | 25000 |
| 39 | alchemistsFlask | Alchemist's Flask | Bliss Shard yield +20%. | "Turns prestige into gold." | 30000 |
| 40 | omegaRelic | The Omega Relic | ×3 all multipliers (replaces philosophersStone if both equipped). | "The last relic. The sum of all joy." | 100000 |

### B4. Wheel Expansion (5 tiers → 10 tiers)

Rebalance existing shard costs for smoother ramp, then add tiers 6–10.

**Existing Tier Shard Cost Adjustments** (smoother curve):

| Tier | Old Range | New Range |
|------|-----------|-----------|
| 1 | 1–3 | 1–3 (unchanged) |
| 2 | 7–15 | 5–12 |
| 3 | 35–80 | 25–60 |
| 4 | 200–400 | 150–350 |
| 5 | 1500–8000 | 800–4000 |

**Tier 6** (shard cost: 5,000–12,000):
| ID | Name | Description | Cost | Requires |
|----|------|-------------|------|----------|
| celestialMemory | Celestial Memory | Ember of Memory keeps 10 upgrades instead of 5. | 5000 | eternalFoundation, theRemembering |
| perpetualMomentum | Perpetual Momentum | Prestige Momentum extends to first 10 minutes. | 6000 | prestigeMomentum, blissOverdrive |
| karmicResonance | Karmic Resonance | Karma rate ×25. | 8000 | karmicOverflow, karmicDividend |
| holyInfrastructure | Holy Infrastructure | All source costs −25%. | 10000 | heavensInfrastructure, eternalFoundation |
| sacredAutomation | Sacred Automation | Auto-buyer runs every 10s instead of 30s. | 12000 | autoBuyer3, eternalFoundation |

**Tier 7** (shard cost: 15,000–40,000):
| ID | Name | Description | Cost | Requires |
|----|------|-------------|------|----------|
| theThirdEye | The Third Eye | Reveals hidden achievement progress bars. ×2 karma rate. | 15000 | celestialMemory, karmicResonance |
| singularityEngine | Singularity Engine | ×50 all HPS. | 25000 | perpetualMomentum, holyInfrastructure |
| relicMastery | Relic Mastery | +3 relic slots. | 30000 | karmicResonance, sacredAutomation |
| cosmicDividend | Cosmic Dividend | Each prestige grants +10 base bliss shards instead of +10. | 35000 | holyInfrastructure, perpetualMomentum |
| ascendedClicker | Ascended Clicker | HPC ×(1 + 0.25 × prestige count). Replaces enlightenedClicker. | 40000 | sacredAutomation, perpetualMomentum |

**Tier 8** (shard cost: 50,000–120,000):
| ID | Name | Description | Cost | Requires |
|----|------|-------------|------|----------|
| eternalFlame | Eternal Flame | Start each run with 10% of previous peak happiness. | 50000 | singularityEngine, theThirdEye |
| prophecyComplete | Prophecy Complete | All upgrades AND all offering upgrades retained. | 70000 | cosmicDividend, relicMastery |
| nirvanaEngine | Nirvana Engine | ×500 all HPS. | 90000 | singularityEngine, ascendedClicker |
| pilgrimsEnlightenment | Pilgrim's Enlightenment | Pilgrimage burst ×10. No cooldown. | 100000 | relicMastery, cosmicDividend |
| omegaAutomation | Omega Automation | Auto-buyer runs every 5s. Cascade buys max of all sources. | 120000 | ascendedClicker, sacredAutomation |

**Tier 9** (shard cost: 150,000–400,000):
| ID | Name | Description | Cost | Requires |
|----|------|-------------|------|----------|
| dimensionalRift | Dimensional Rift | ×5,000 all HPS. | 200000 | eternalFlame, nirvanaEngine |
| karmicAscension | Karmic Ascension | Karma rate ×100. All relics cost 50% less. | 250000 | pilgrimsEnlightenment, prophecyComplete |
| temporalLoop | Temporal Loop | All timed buffs last ×3 longer. Events arrive 2× faster. | 300000 | eternalFlame, prophecyComplete |
| celestialArchitect | Celestial Architect | All source costs −50%. Sources start at level 25. | 350000 | dimensionalRift, omegaAutomation |
| blissInfinity | Bliss Infinity | Start each run with 50% of previous peak happiness. | 400000 | dimensionalRift, karmicAscension |

**Tier 10** (shard cost: 500,000–2,000,000):
| ID | Name | Description | Cost | Requires |
|----|------|-------------|------|----------|
| theGrandDesign | The Grand Design | ×100,000 all HPS. All multipliers squared. | 750000 | celestialArchitect, blissInfinity |
| infiniteWheel2 | The Infinite Wheel II | Shard yield ×2.0. | 500000 | temporalLoop, blissInfinity |
| omegaMemory | Omega Memory | Everything retained on prestige (all sources, all upgrades, all karma, all milestones). | 1000000 | prophecyComplete, theGrandDesign |
| theLastSmile | The Last Smile | ×1,000,000 HPS. Click generates 1 minute of HPS income. | 1500000 | theGrandDesign, infiniteWheel2 |
| templeComplete | Temple Complete | Grants achievement "The Temple Is Complete." +10% HPS per achievement earned. | 2000000 | omegaMemory, theLastSmile |

### B5. New Synergies (10 → 20)

10 new synergies for the new source tiers:

| ID | Name | Requirements | Targets | Mult |
|----|------|-------------|---------|------|
| dreamFeast | The Dream Feast | dreamWeaver: 25, infiniteBuffet: 25 | dreamWeaver, infiniteBuffet | 4 |
| laughterGarden | Laughter Garden | laughterForge: 50, echoGarden: 25 | laughterForge, echoGarden | 5 |
| celestialBond | Celestial Bond | seraphStation: 25, celestialBath: 25 | seraphStation, celestialBath | 6 |
| paradoxMemory | Paradox & Memory | paradoxEngine: 25, memoryPalace: 25 | paradoxEngine, memoryPalace | 7 |
| gravitySymphony | Gravity Symphony | gravitySpa: 50, euterpeHall: 25 | gravitySpa, euterpeHall | 5 |
| ambrosialRain | Ambrosial Rain | ambrosiaTap: 25, karmaFountain: 25 | ambrosiaTap, karmaFountain | 8 |
| orbitalHug | Orbital Hug | joySatellite: 25, infiniteHug: 25 | joySatellite, infiniteHug | 6 |
| elysiumNova | Elysium Nova | elysiumGate: 25, joyNova: 25 | elysiumGate, joyNova | 10 |
| eternityCore | Eternity Core | eternitySofa: 50, nirvanaCore: 25 | eternitySofa, nirvanaCore | 8 |
| omegaFusion | Omega Fusion | omegaTemple: 10, transcendenceLab: 25 | omegaTemple, transcendenceLab | 15 |

### B6. New Milestones (37 → 55)

Extend milestones beyond 1e99 to 1e153:

| ID | Threshold | Label | hpsMultiplier |
|----|-----------|-------|---------------|
| ms_1e102 | 1e102 | Eternal Warmth | 3.0 |
| ms_1e105 | 1e105 | Infinite Laughter | 3.5 |
| ms_1e108 | 1e108 | Boundless Grace | 3.5 |
| ms_1e111 | 1e111 | The Grand Exhale II | 4.0 |
| ms_1e114 | 1e114 | Celestial Overflow | 4.0 |
| ms_1e117 | 1e117 | Paradise Cascade | 4.5 |
| ms_1e120 | 1e120 | The Warmth Beyond | 4.5 |
| ms_1e123 | 1e123 | Cosmic Gratitude | 5.0 |
| ms_1e126 | 1e126 | Joy Supernova | 5.0 |
| ms_1e129 | 1e129 | The Final Sigh | 6.0 |
| ms_1e132 | 1e132 | Beyond Omega | 6.0 |
| ms_1e135 | 1e135 | Pleasure Dimension | 7.0 |
| ms_1e138 | 1e138 | The Infinite Temple | 8.0 |
| ms_1e141 | 1e141 | Bliss Omnipresent | 9.0 |
| ms_1e144 | 1e144 | Joy Absolute | 10.0 |
| ms_1e147 | 1e147 | The Warm Universe | 15.0 |
| ms_1e150 | 1e150 | Temple Beyond Time | 20.0 |
| ms_1e153 | 1e153 | Omega Joy | 50.0 |

### B7. New Events (22 → 36)

14 new events — 4 blessings, 6 choice, 4 philosophical:

**Blessings**:
| ID | Title | Effect |
|----|-------|--------|
| unexpectedCompliment | The Unexpected Compliment | ×4 HPS for 5 min |
| perfectSilence | Perfect Silence | ×2.5 HPS for 15 min |
| starsFell | The Stars Fell (Gently) | happinessBonus: 20 |
| longWeekend | The Long Weekend | ×3 HPS for 10 min |

**Choices**:
| ID | Title | Choice A | Choice B |
|----|-------|----------|----------|
| inheritanceQuestion | The Inheritance | "Spend it all" → happinessBonus: 25, ×5 HPS 30 min | "Invest wisely" → permanentHPSPercent: 0.20 |
| gardenOrCastle | Garden or Castle | "The Garden" → ×3 HPS 4 hours | "The Castle" → ×8 HPS 1 hour |
| newHobby | The New Hobby | "Go deep" → ×2 HPS 8 hours | "Stay casual" → permanentHPCPercent: 0.10, karmaBonus: 15 |
| cosmicOffer | Cosmic Offer | "Accept the power" → ×10 HPS 30 min | "Decline gracefully" → karmaBonus: 75 |
| oldPhotograph | The Old Photograph | "Remember fondly" → happinessBonus: 12, karmaBonus: 10 | "Move forward" → permanentHPSPercent: 0.08 |
| midnightSnack | The Midnight Snack | "Indulge fully" → ×6 HPS 2 hours | "Save it for tomorrow" → karmaBonus: 20, permanentHPSPercent: 0.05 |

**Philosophical**:
| ID | Title | Body | Choice A | Choice B |
|----|-------|------|----------|----------|
| nietzscheArrives | Nietzsche Arrives | "He stares at the sources. 'Eternal recurrence,' he mutters." | "Embrace the eternal" → permanentHPSPercent: 0.15, karmaBonus: 20 | "Create your own meaning" → ×5 HPS 1 hour, karmaBonus: 30 |
| buddhaVisit | The Buddha Sits Down | "'Attachment is the root of suffering,' he says gently." | "Let go" → karmaBonus: 60 | "Hold on tighter" → happinessBonus: 18 |
| sartreQuestion | Sartre's Question | "'You are condemned to be free,' he says. 'Choose.'" | "Choose authentically" → permanentHPSPercent: 0.12, permanentHPCPercent: 0.08 | "Choose pleasure" → ×7 HPS 45 min |
| senecaAdvice | Seneca's Advice | "'No person is free who is not master of themselves.'" | "Practice self-mastery" → karmaBonus: 40, karmaRateMultiplier via permanentHPSPercent: 0.10 | "Master the temple" → ×4 HPS 2 hours |

### B8. New Achievements (65 → 130)

65 new achievements:

**New Source Milestones**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| twoThousandOfOne | Mass Production | Own 2,000 of any one source. | "We're going to need a bigger temple." |
| fiveThousandOfOne | Industrial Complex | Own 5,000 of any one source. | "At this point, it's an economy." |
| tenThousandOfOne | Monoculture | Own 10,000 of any one source. | "An obsession of architectural proportions." |
| dreamWeaverUnlock | Sweet Dreams | Unlock the Dream Weaver. | "Weaving begins." |
| paradoxEngineUnlock | Paradox Achieved | Unlock the Paradox Engine. | "Logic: optional." |
| omegaTempleUnlock | The Final Temple | Unlock the Omega Temple. | "You built God's house. God was impressed." |
| allNewSources | The Expansion | Own at least 1 of every new source. | "The new world: explored." |
| fiftyOfEach | Devoted Architect | Own 50 of every source. | "Every source, fifty deep." |
| hundredOfEach | The Completionist | Own 100 of every source. | "Maximalism: achieved." |

**New Clicking**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| hundredThousandClicks | Carpal Tunnel Warning | Click 100,000 times total. | "Your mouse has filed a complaint." |
| millionClicks | The Million Click Club | Click 1,000,000 times total. | "Gold-plated mouse pad earned." |
| ritualMasterAch | Ritual Master | Trigger 100 Rituals. | "The pattern is second nature." |

**New Happiness Milestones**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| happiness1e108 | Happiness: Celestial | Earn 1e108 lifetime Happiness. | "The heavens run on this." |
| happiness1e120 | Happiness: Dimensional | Earn 1e120 lifetime Happiness. | "Other dimensions felt that." |
| happiness1e135 | Happiness: Incomprehensible | Earn 1e135 lifetime Happiness. | "Math broke. Joy remains." |
| happiness1e150 | Happiness: Omega | Earn 1e150 lifetime Happiness. | "The final number." |

**New Prestige**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| seventyFivePrestige | The Eternal Cycle | Transcend 75 times. | "The wheel is you. You are the wheel." |
| hundredPrestige | Centennial | Transcend 100 times. | "Triple digits of transcendence." |
| twoHundredPrestige | The Infinite Spiral | Transcend 200 times. | "Each turn: warmer than the last." |

**New Mechanics**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| pilgrimageTwentyFive | The Devoted Walker | Complete 25 Pilgrimages. | "The path knows you by name." |
| pilgrimageFifty | The Eternal Pilgrim | Complete 50 Pilgrimages. | "You walk. The temple walks with you." |
| vibeCheckTwentyFive | Vibe: Legendary | Pass 25 Vibe Checks. | "Your vibes are canonized." |
| vibeCheckFifty | Vibe: Eternal | Pass 50 Vibe Checks. | "The universe vibrates at your frequency." |
| eventsHundred | A Century of Moments | Resolve 100 events total. | "Every moment: chosen." |
| eventsTwoHundred | Life Fully Lived | Resolve 200 events total. | "No moment wasted." |
| dailyOfferingTen | The Faithful | Complete 10 offerings. | "The tithe: consistent." |

**New Karma & Relics**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| thousandKarma | Karmic Mastery | Earn 1,000 Karma. | "The universe sends a thank-you note." |
| tenThousandKarma | Karmic Overflow | Hold 10,000 Karma at once. | "So much good energy it's visible." |
| hundredThousandKarma | Karmic Singularity | Hold 100,000 Karma at once. | "A black hole of good vibes." |
| tenRelics | Relic Collector | Equip 10 unique relics (cumulative). | "The collection grows." |
| twentyRelics | Master Collector | Equip 20 unique relics (cumulative). | "Every relic tells a story." |
| thirtyRelics | Legendary Collector | Equip 30 unique relics (cumulative). | "Museums are jealous." |
| allNewRelics | The Grand Collection | Unlock all relics. | "Every power. Every story. Yours." |

**New Wheel**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| wheelTier6Complete | Tier 6 Master | Purchase all Tier 6 Wheel upgrades. | "The wheel deepens." |
| wheelTier8Complete | Tier 8 Master | Purchase all Tier 8 Wheel upgrades. | "You can feel infinity turning." |
| wheelTier10Complete | The Complete Wheel | Purchase all Tier 10 Wheel upgrades. | "The wheel: complete. The journey: eternal." |

**New Playtime**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| twoThousandHours | The Eternal Student | Play for 2,000 hours total. | "This is more than a hobby. It's a calling." |
| fiveThousandHours | Life's Work | Play for 5,000 hours total. | "You have given more time to joy than most give to anything." |

**New Hidden/Funny**:
| ID | Name | Description | Flavor | Hidden |
|----|------|-------------|--------|--------|
| clickDuringPilgrimage | Oops | Click during a Pilgrimage. | "You had ONE job: do nothing." | true |
| tenBuffsActive | Buff Hoarder | Have 10+ active buffs simultaneously. | "Your HPS bar needs a scrollbar." | true |
| transcendUnderMinute | Speed Run | Transcend in under 1 minute. | "They said it couldn't be done. It took 47 seconds." | true |
| neverIdle | The Restless | Never trigger idle status in a 30-minute session. | "Idle? You don't know the word." | true |
| allPhilosFrugal | Philosopher King | Choose the frugal option in 10 philosophical events. | "Epicurus would weep with pride." | true |
| omegaRelicEquipped | The Omega Relic | Equip the Omega Relic. | "The circle closes." | true |
| hundredPrestigeHidden | Triple Digits | Reach 100 prestiges. | "You've been here before. 99 times, in fact." | true |
| millionBlissShards | Shard Millionaire | Accumulate 1,000,000 bliss shards. | "The shards form a palace of their own." | true |
| maxSynergyCount | Full Synergy | Activate all synergies simultaneously. | "Everything connects. Everything resonates." | true |
| firstDayStreak | Day One | Play on consecutive days for the first time. | "You came back. The temple noticed." | true |

**New Bliss Shard Achievements**:
| ID | Name | Description | Flavor |
|----|------|-------------|--------|
| hundredShards | Shard Collector | Accumulate 100 bliss shards. | "A modest fortune in crystallized transcendence." |
| thousandShards | Shard Hoarder | Accumulate 1,000 bliss shards. | "They glitter with purpose." |
| tenThousandShards | Shard Baron | Accumulate 10,000 bliss shards. | "You could pave a road with these." |

---

## Part C: Implementation Plan

### C1. Type Updates (`types.ts`)

1. Expand `SourceId` union with all 28 new source IDs
2. Expand `RelicId` union with all 20 new relic IDs
3. Expand `WheelTier` from `1|2|3|4|5` to `1|2|3|4|5|6|7|8|9|10`
4. Add `totalRituals: number` to GameState (for ritual achievement tracking)
5. Add `totalOfferings: number` to GameState (for offering achievement tracking)
6. Add `totalRituals` and `totalOfferings` to SaveData

### C2. Data File Updates

1. **sources.ts**: Add 28 new source definitions
2. **upgrades.ts**: Add 12 path-extension upgrades, 8 synergy-path upgrades, 39 missing offerings, 18 post-prestige offerings
3. **relics.ts**: Add 20 new relic definitions
4. **wheel.ts**: Adjust existing shard costs, add 25 new wheel upgrades (5 per tier, tiers 6–10)
5. **synergies.ts**: Add 10 new synergy definitions
6. **milestones.ts**: Add 18 new milestones
7. **events.ts**: Add 14 new events
8. **achievements.ts**: Add 65 new achievement definitions

### C3. Engine Updates (`engine.ts`)

1. Add new relic effects in `computeSourceHPS`: perpetualTeapot, mirrorOfTruth, gardenersGlove, dreamCatcher, cosmicTeaCup
2. Add new relic effects in `computeTotalHPS`: silkRobe (×2 idle), crystalBall (via vibe timer), ancientHourglass (sacred ledger ×2 speed), soulLantern (per-source %), infinityScarf (per-relic %), starChart (+3% per prestige), omegaRelic (×3 all, replaces philosophersStone)
3. Add new relic effects in `computeKarmaRate`: (none needed — handled by existing patterns)
4. Add new wheel effects: holyInfrastructure (−25%), celestialArchitect (−50%), singularityEngine (×50), nirvanaEngine (×500), dimensionalRift (×5000), theGrandDesign (×100000), ascendedClicker, etc.
5. Update `computeBlissShards` for `alchemistsFlask` relic (+20%) and `infiniteWheel2` wheel (×2.0)
6. Update `computeStartingHPSFromWheel` to fix deepRoots mismatch (Bug 2)
7. Add `goldenPen` relic effect tracking (requires event count)
8. Add `astronomersLens` relic effect (milestone threshold ÷10)

### C4. Action Updates (`actions.ts`)

1. **Fix Bug 1**: Preserve all cumulative counters in `doTriggerTranscendence` overrides
2. **Fix Bug 4**: Use `RELICS.length` instead of `20` for allRelics achievement
3. **Fix Bug 5**: Dynamically compute tier 4 IDs for fullWheel achievement
4. Add `totalRituals` increment in `doClick` when ritual triggers
5. Add `totalOfferings` increment in `doMakeOffering`
6. Add new source-specific achievements in `doBuySource`
7. Add new prestige achievements in `doTriggerTranscendence`
8. Add new wheel achievements in `doPurchaseWheelUpgrade`
9. Add new relic achievements
10. Add `luckyCoin` relic effect in `doResolveEvent` (×1.5 effects)
11. Add `eternalQuill` relic effect in `doMakeOffering` (×1.5 duration)
12. Handle new wheel tier transcendence effects: celestialArchitect (start at 25), blissInfinity (50% peak), omegaMemory (retain everything), eternalFlame (10% peak), celestialMemory (keep 10 upgrades), etc.
13. Update `doAuditAchievements` with all new achievement conditions

### C5. Tick Updates (`tick.ts`)

1. Add new achievement checks for extended playtime, happiness, karma thresholds
2. Add new pilgrimage/vibe/event count achievements
3. Add `sacredAutomation` effect (10s interval) and `omegaAutomation` (5s interval)
4. Add `temporalLoop` effect (buffs ×3 duration, events ×2 speed)
5. Add `crystalBall` relic vibe timer adjustment (30% faster)
6. Update `perpetualMomentum` (10 min instead of 3 min)
7. Add hidden achievement checks (clickDuringPilgrimage, tenBuffsActive, neverIdle)

### C6. Persistence Updates (`persistence.ts`)

1. Add `totalRituals` and `totalOfferings` to `stateToSaveData` and `saveDataToState`

### C7. UI Updates

1. `WheelOfSamsara.tsx`: Support tiers 6–10 layout
2. Various UI components may need no changes if they dynamically read from data arrays

---

## Part D: Implementation Order

1. Fix Bug 1 (counter resets) — critical, affects all achievement tracking
2. Fix Bug 2 (deepRoots mismatch)
3. Fix Bug 4 & 5 (hardcoded magic numbers)
4. Update types.ts (new SourceIds, RelicIds, WheelTier, totalRituals, totalOfferings)
5. Add all new data (sources, upgrades, relics, wheel, synergies, milestones, events, achievements)
6. Update engine.ts (new relic/wheel effects)
7. Update actions.ts (new achievements, wheel effects, relic effects)
8. Update tick.ts (new achievements, timer modifications)
9. Update persistence.ts (new fields)
10. Compile check + lint
