# Signal Forge: Comprehensive Design Improvements

## Table of Contents
1. [Core Systems Analysis](#core-systems-analysis)
2. [Card Synergy Systems](#card-synergy-systems)
3. [Balance & Economy](#balance--economy)
4. [New Mechanics Proposals](#new-mechanics-proposals)
5. [Enemy Design Philosophy](#enemy-design-philosophy)
6. [Relic Ecosystem](#relic-ecosystem)
7. [Meta-Progression](#meta-progression)

---

## Core Systems Analysis

### 1. Draw/Discard/Hand Management System

**Current State:**
- Fixed hand size of 5 (modifiable by relics)
- Draw up to hand size each turn
- Simple discard pile that reshuffles when deck is empty
- No hand manipulation beyond "draw N cards"

**Issues:**
- Hand size is relatively static throughout a run
- No meaningful decisions around discarding
- Deck cycling is predictable and lacks tension
- No way to "fish" for specific cards mid-combat

**Proposed Improvements:**

#### A. Dynamic Hand Size Mechanics
1. **Overload System**: Allow drawing beyond hand size at a cost
   - Pay 1 energy to draw 1 extra card this turn (discarded at end of turn)
   - Creates tension between card advantage and resource management
   - Synergizes with "end of turn" effects

2. **Hand Compression**: Cards that benefit from small hand sizes
   - "Precision Strike": Deal 8 + (5 - current hand size) × 3 damage
   - "Focused Defense": Gain 6 + (5 - current hand size) × 2 shield
   - Creates archetype where you want to play out your hand quickly

3. **Hand Expansion**: Cards that benefit from large hand sizes
   - "Signal Cascade": Deal 2 damage per card in hand to all enemies
   - "Buffer Overflow": Gain 1 shield per card in hand at start of turn
   - Creates archetype where you want to hold cards

#### B. Discard Pile Interaction
1. **Graveyard Play**: Cards that interact with discard pile
   - "Echo Chamber": Play a card from discard pile at 50% effectiveness (Exhaust)
   - "Rewind Protocol": Shuffle 3 cards from discard into deck, draw 1
   - "Discard Surge": Deal 1 damage per card in discard pile (max 20)

2. **Discard Pile Manipulation**
   - "Selective Retrieval": Choose a card from discard, add to hand
   - "Purge Weak": Remove up to 2 cards from discard permanently
   - "Discard Mine": Next card drawn from reshuffled discard deals +5 damage

3. **Exile Zone**: New zone for removed cards
   - Some cards exile instead of being discarded (stronger than exhaust)
   - "Recall from Void": Retrieve specific exiled cards for powerful effects
   - "Void Echo": Exiled cards still trigger "when discarded" effects once

#### C. Deck Manipulation Mid-Combat
1. **Top-Deck Control**
   - "Prescient Signal": Look at top 3 cards, rearrange them
   - "Bury Deep": Put a card from hand on bottom of deck
   - "Surface Scan": Look at next card to be drawn, may shuffle if you don't want it

2. **Deck Thinning In-Combat**
   - "Emergency Purge": Exhaust a card from hand, draw 2 (costs 2 energy)
   - "Streamline": At start of turn, may exhaust a card in hand to draw 1
   - Creates micro-decisions about deck composition during combat

### 2. Shield System

**Current State:**
- Shield resets to 0 each turn (unless Sine Loom relic)
- Simple damage absorption
- No interaction with other systems beyond basic blocking

**Issues:**
- Shield feels temporary and low-impact
- No strategic planning around shield timing
- Sine Loom is binary (either shield persists or it doesn't)
- No differentiation between shield types

**Proposed Improvements:**

#### A. Shield Type Diversity
1. **Temporary Shield** (current default)
   - Resets each turn
   - Quick to apply, low cost

2. **Persistent Shield**
   - Doesn't reset between turns
   - Harder to generate (costs more, requires specific cards)
   - "Barrier Protocol": Gain 5 persistent shield (cost 2)

3. **Reactive Shield**
   - Triggers effects when damaged
   - "Thorned Barrier": Gain 6 shield, deal 3 damage when hit
   - "Feedback Shield": Gain 8 shield, draw 1 when it breaks
   - "Charged Plating": Gain 7 shield, gain 1 energy when it absorbs 7+ damage

4. **Overcharge Shield**
   - Shield above max HP becomes temporary bonus damage
   - If shield exceeds 30, excess converts to +1 damage per card this turn
   - "Capacitor Guard": Gain 15 shield. If shield > 25, deal 10 damage to all enemies.

#### B. Shield Scaling & Timing
1. **Shield Multipliers**
   - "Amplified Sine": Next shield card played this turn gives +50% shield
   - "Compound Layer": Each shield card played increases next shield card by +2
   - "Shield Storm": If you gain 15+ shield this turn, gain +3 shield for each card played

2. **End-Turn Shield Effects**
   - "Residual Charge": At end of turn, deal damage equal to 25% of remaining shield
   - "Shield Battery": At end of turn, convert 5 shield into 1 energy next turn
   - "Crystallize": At end of turn, if shield > 15, make 5 shield persistent

3. **Shield Breaking Mechanics**
   - Enemies with "Pierce": Ignore X shield
   - "Shatter Weakness": If shield breaks this turn, take 5 extra damage from next attack
   - "Fragile Shield": Gain 20 shield, but if any damage gets through, lose all shield

#### C. Shield Synergies
1. **Damage-from-Shield Archetype**
   - "Concussive Wave": Deal damage equal to 50% of current shield
   - "Shield Slam": Lose all shield, deal damage equal to 150% of lost shield
   - "Redirection Field": When hit, deal damage equal to 30% of shield to attacker

2. **Shield-Tempo Interaction**
   - "Defensive Tempo": Gain +1 tempo when you gain 10+ shield in one turn
   - "Shielded Assault": Your attacks deal +1 damage per 5 shield you have
   - "Tempo Barrier": Spend 3 tempo, gain 12 shield

### 3. Waveform Pattern System

**Current State:**
- Match 2-3 waveform sequence for Forge Burst (+12 damage)
- Wildcard slots (★) accept any waveform
- Sequence resets each turn
- Binary: either you match or you don't

**Issues:**
- Pattern matching feels same-y every turn
- No partial rewards for near-matches
- Wildcard is too simple (just a freebie)
- No strategy around sequence building beyond "play in order"

**Proposed Improvements:**

#### A. Partial Pattern Rewards
1. **Graduated Matching**
   - 1 match: +3 damage
   - 2 matches: +8 damage (cumulative: 11)
   - 3 matches (full): +12 damage (cumulative: 23)
   - Rewards attempting patterns even when you can't complete them

2. **Pattern Streaks**
   - Completing patterns on consecutive turns grants stacking bonuses
   - Turn 1 complete: +12 damage
   - Turn 2 complete: +15 damage
   - Turn 3 complete: +18 damage
   - Resets when pattern is broken, encourages consistency

3. **Overmatch Bonus**
   - If you play cards beyond the pattern requirement, gain small bonuses
   - Each extra card in pattern: +2 damage per card
   - "Extended Pattern: Pulse-Sine-Saw-Pulse" = +12 (match) + 2 (4th card) = +14

#### B. Pattern Complexity
1. **Multi-Pattern System**
   - Multiple active patterns simultaneously
   - Primary Pattern: Pulse-Sine-Saw (+12 damage)
   - Secondary Pattern: Saw-Saw (+6 damage, +1 draw)
   - Tertiary Pattern: Any-Any-Any-Any (+3 tempo)
   - Creates interesting optimization puzzles

2. **Pattern Modifiers**
   - **Inverted Pattern**: Matching pattern in reverse order gives different bonus
   - **Scattered Pattern**: Match in any order for reduced bonus (+8 instead of +12)
   - **Exact Pattern**: Must match exactly, no extra cards allowed, for enhanced bonus (+18)

3. **Dynamic Patterns**
   - Patterns change mid-combat based on actions
   - "Flux Protocol": Each time you complete a pattern, last symbol rotates
   - "Adaptive Sequence": Pattern shifts after taking damage
   - "Harmonic Shift": Pattern changes if you play 3+ of same waveform

#### C. Waveform-Specific Mechanics
1. **Pulse Mechanics**
   - "Chain Lightning": Each Pulse card played increases next Pulse by +2
   - "Pulse Resonance": If you play 3+ Pulse cards, deal 8 AOE at end of turn
   - "First Strike": First Pulse each combat deals double damage

2. **Sine Mechanics**
   - "Wave Interference": Sine cards alternate between offense and defense
     - 1st Sine: Shield only
     - 2nd Sine: +3 damage to all Sine cards
     - 3rd Sine: Shield only
   - "Harmonic Balance": If you have equal Pulse and Sine in discard, draw 2

3. **Saw Mechanics**
   - "Bleeding Signal": Saw cards apply "Bleed" debuff (2 damage per turn)
   - "Saw Momentum": Each Saw increases cost of next Saw by 1, but damage by +4
   - "Recursive Cut": Saw cards deal +2 damage for each Saw in discard

4. **Noise Mechanics**
   - "Static Buildup": Noise cards generate +1 Static but deal +3 damage per Static
   - "Chaotic Burst": Noise cards have random effects (roll from effect table)
   - "Noise Cascade": Each Noise card makes next card cost 1 less

### 4. Static & Glitch System

**Current State:**
- Static accumulates from duplicate waveform types
- At threshold (default 4), injects Glitch card into discard
- Glitch cards are bad (unplayable or damage self)
- Static can be reduced by specific cards or relics

**Issues:**
- Static feels purely punitive
- No decision-making around Static management
- Glitch cards are uniformly bad (no upside)
- Static threshold is fixed, creating predictable timing

**Proposed Improvements:**

#### A. Static as Resource
1. **High Static Benefits**
   - "Static Discharge": Deal 3 damage per Static, then reset Static to 0
   - "Overload": Your cards cost 1 less for each 2 Static you have
   - "Controlled Chaos": At max Static, gain +1 energy per turn but inject Glitch each turn
   - Creates risk/reward around maintaining high Static

2. **Static Threshold Variance**
   - Different Glitch cards injected at different thresholds
   - Threshold 4: Inject "Minor Glitch" (cost 1, no effect, exhaust)
   - Threshold 8: Inject "Major Glitch" (cost 2, deal 5 self damage, draw 1, exhaust)
   - Threshold 12: Inject "Critical Glitch" (cost 3, lose 10 HP, deal 20 AOE, exhaust)
   - Higher Static = more dangerous but also more powerful

3. **Static Decay**
   - Lose 1 Static per turn if below threshold
   - Creates natural ebb and flow
   - Encourages burst turns with high Static

#### B. Enhanced Glitch Cards
1. **Glitch Transformation**
   - "Debugger": Transform a Glitch card into a random common card
   - "Patch Protocol": Glitch cards in hand give +3 damage to next attack
   - "Corruption Embrace": Glitch cards cost 0 but inject another Glitch when played

2. **Positive Glitch Cards** (rare)
   - "Lucky Error": Cost 0, draw 2, deal 8 damage (is Glitch type)
   - "Beneficial Bug": Cost 1, gain 12 shield, add another copy to hand (is Glitch type)
   - Not all Glitches are bad, requires Static management archetype

3. **Glitch Synergy Relic**
   - "Entropy Harvester": Gain 2 currency whenever a Glitch is injected
   - "Chaos Engine": Glitch cards cost 0 and draw 1
   - "Error Handler": First Glitch played each combat deals 15 AOE

#### C. Interactive Static Mechanics
1. **Enemy Static Interaction**
   - Some enemies gain benefits from YOUR Static
   - "Static Feeder": Heals 3 HP per Static you have at end of turn
   - "Interference Field": Reduces your damage by 1 per Static
   - Creates pressure to manage Static actively

2. **Static Transfer**
   - "Relay Fault": Transfer 2 Static to target enemy (they take 5 damage)
   - "Shared Corruption": Equal Static between you and all enemies
   - "Static Bomb": Deal damage equal to Static × 3, gain 2 Static

3. **Static Zones**
   - **Low Static** (0-3): Normal gameplay
   - **Medium Static** (4-7): Glitch risk, small bonuses available
   - **High Static** (8-11): High risk, high reward effects enabled
   - **Critical Static** (12+): Dangerous but extremely powerful

### 5. Tempo System

**Current State:**
- Gain +1 tempo per card played (some cards give bonus)
- Max tempo is 6
- Resets each turn
- Only mentioned utility: "max tempo effects" from Tempo Amp relic

**Issues:**
- Tempo doesn't DO anything inherently
- Max tempo isn't rewarding enough
- No decision-making around tempo spending
- Feels like combo counter without payoff

**Proposed Improvements:**

#### A. Tempo as Spendable Resource
1. **Tempo Costs**
   - "Tempo Strike": Spend 2 tempo, deal 12 damage
   - "Tempo Shield": Spend 3 tempo, gain 18 shield
   - "Tempo Draw": Spend 4 tempo, draw 3 cards
   - Makes tempo a currency you actively manage

2. **Banked Tempo**
   - "Store Tempo": End turn with tempo, carry over 50% to next turn (rounded down)
   - Max banked tempo: 3
   - Creates strategic choice: spend now or save for later

3. **Tempo Conversion**
   - "Tempo to Energy": Spend 5 tempo, gain 2 energy
   - "Tempo to Damage": Each tempo adds +2 damage to all attacks this turn
   - "Tempo to Defense": Each tempo adds +3 shield to all defense this turn

#### B. Tempo Thresholds
1. **Threshold Bonuses**
   - Tempo 2-3: Cards cost 1 less this turn
   - Tempo 4-5: Draw 1 card
   - Tempo 6 (max): All your cards Echo this turn
   - Makes tempo milestones exciting

2. **Break Points**
   - "Tempo Spike": If you reach tempo 6, deal 10 AOE damage
   - "Momentum Shift": If you go from 0 to 4+ tempo in one turn, gain 1 energy
   - "Tempo Crash": If you play 0 cards after reaching tempo 4+, deal 15 self damage

#### C. Tempo Archetypes
1. **Tempo Rush** (play many cheap cards)
   - "Blitz Protocol": Cards that cost 0 or 1 give +2 tempo instead of +1
   - "Rapid Fire": If tempo is 5+, your 0-cost cards deal +8 damage
   - "Swarm Logic": For each card above 3 played this turn, deal 3 damage

2. **Tempo Control** (strategic tempo spending)
   - "Measured Response": If you play exactly 3 cards, gain 1 energy
   - "Paced Assault": Cards cost 1 less if tempo is exactly 3
   - "Control Matrix": Spend 2 tempo at start of turn to draw 2

3. **Tempo Bomb** (all-in on max tempo)
   - "Overload Finale": If tempo is 6, this deals 30 damage (cost 2)
   - "Tempo Explosion": At tempo 6, your next card triggers twice
   - "Critical Mass": At tempo 6, gain 1 energy and draw 2

### 6. Energy System

**Current State:**
- 3 energy per turn (can be increased by relics)
- Standard "mana" resource
- No interaction with other systems

**Issues:**
- Very standard, no unique identity
- No dynamic energy generation
- No opportunity cost decisions
- Relic dependent for scaling

**Proposed Improvements:**

#### A. Dynamic Energy Generation
1. **Conditional Energy**
   - "Surge Capacitor": Gain 1 energy if you have 15+ shield
   - "Reactive Core": Gain 1 energy when you take damage
   - "Victory Rush": Gain 1 energy when you kill an enemy
   - Makes energy less fixed per turn

2. **Energy Banking**
   - Unused energy converts to "banked energy" at 50% rate
   - Max banked energy: 2
   - "Power Reserve": Spend 3 banked energy to gain 2 energy this turn
   - Rewards efficient turns

3. **Energy Burst**
   - "Overcharge Turn": Once per combat, gain +3 energy this turn
   - "Energy Loan": Gain 2 energy now, -1 energy next 2 turns
   - "Mana Flare": Draw 3 cards, gain 2 energy, take 5 damage

#### B. Alternative Resource Systems
1. **Charge System** (coexists with energy)
   - Some cards cost "Charge" instead of energy
   - Gain charge by playing energy cards
   - "Charge Attack": Costs 2 Charge, deal 15 damage
   - "Pulse Generator": Costs 1 energy, gain 2 Charge

2. **Heat System**
   - Playing cards generates Heat
   - High Heat enables powerful effects
   - Too much Heat causes damage
   - "Thermal Strike": Deal 10 + (Heat × 2) damage
   - "Cooling System": Reduce Heat by 5, gain 8 shield

#### C. Energy Manipulation
1. **Cost Reduction Stacking**
   - "Efficiency Module": Next card costs 2 less
   - "Cost Chain": Each card played makes next card cost 1 less (up to 3)
   - "Free Play": Next card costs 0

2. **Cost Increase Tradeoffs**
   - "Empowered Strike": Costs 3 more, but deals triple damage
   - "Sacrifice Protocol": Pay 2 extra energy, this card doesn't exhaust
   - "Overclocked System": All cards cost +1 but deal +5 damage

---

## Card Synergy Systems

### 1. Keyword Interaction Matrix

**Current Keywords:** Echo, AOE, Exhaust, Sustain, Wildcard, Stabilize, Leech, Glitch, Draw

**Proposed Keyword Interactions:**

#### A. Echo Synergies
1. **Echo Amplification**
   - "Double Echo": Echo cards repeat at 100% instead of 50%
   - "Echo Cascade": Each Echo card increases next Echo card by +3 damage/shield
   - "Resonant Echo": If you play 2+ Echo cards, gain +2 tempo

2. **Echo + Other Keywords**
   - Echo + AOE: Second instance hits random enemy for single-target
   - Echo + Exhaust: Echo triggers, then exhaust (2x value)
   - Echo + Sustain: Impossible combination (balance consideration)
   - Echo + Leech: Both instances heal

3. **Echo Counting**
   - "Echo Chamber": Deal 5 damage for each Echo card played this combat
   - "Harmonic Overload": If 3+ Echo cards played this turn, all deal +10
   - "Echo Memory": Echo cards in discard give +1 to all Echo cards in hand

#### B. Exhaust Synergies
1. **Exhaust Benefits**
   - "Phoenix Protocol": When a card exhausts, gain 3 shield
   - "Controlled Burn": Exhaust cards deal +5 damage
   - "Final Burst": Cards with Exhaust have their damage/shield doubled

2. **Exhaust Counting**
   - "Attrition Engine": Gain 1 energy per card exhausted this combat (max 3)
   - "Sacrificial Power": Deal 8 damage for each exhausted card this turn
   - "Exhaustion Threshold": At 5 exhausted cards, gain permanent +1 energy

3. **Exhaust Recovery**
   - "Reclaim Protocol": Return an exhausted card to hand (once per combat)
   - "Eternal Cycle": Exhausted cards return to deck at end of combat
   - "Ghost Echo": Exhausted cards trigger 50% effect when exiting

#### C. Sustain Synergies
1. **Sustain Stacking**
   - "Persistent Power": Sustain cards get +1 damage each time played
   - "Sustained Defense": Sustain cards give +2 shield at start of each turn
   - "Enduring Force": For each Sustain card in hand, gain +1 damage

2. **Sustain + Other Keywords**
   - Sustain + Echo: Incredibly powerful, should be rare/expensive
   - Sustain + Draw: Enables engine decks
   - Sustain + AOE: Consistent board clear
   - Sustain + Exhaust: Impossible (cancels out)

3. **Sustain Management**
   - "Release Protocol": Discard a Sustain card, draw 3
   - "Sustained Burst": Discard all Sustain cards, deal 10 per card discarded
   - "Sticky Removal": Enemies can force you to discard Sustain cards

#### D. Cross-Keyword Archetypes
1. **Echo-Exhaust Deck** (burst damage)
   - Cards do 2x effect then exile permanently
   - High risk, high reward
   - "Blazing Echo": Cost 2, Echo, Exhaust, deal 18 damage

2. **Sustain-Tempo Deck** (engine building)
   - Build up Sustain cards that generate tempo each turn
   - "Tempo Engine": Cost 1, Sustain, gain 2 tempo at start of turn
   - Slow start, powerful late game

3. **AOE-Leech Deck** (sustain through offense)
   - Heal from all enemies damaged
   - "Life Drain Wave": Cost 3, AOE, Leech 30%, deal 12 damage
   - Strong against many enemies

### 2. Waveform Synergies

**Goal:** Each waveform pair should create unique gameplay patterns

#### A. Pulse + Sine (Oscillation)
1. **Alternating Power**
   - "Phase Alternator": If last card was Pulse, Sine gives double shield. Vice versa for damage.
   - "Stabilized Pulse": Each Sine card played makes next Pulse deal +4
   - "Defensive Pulse": Each Pulse card played makes next Sine give +6 shield

2. **Balance Rewards**
   - "Equilibrium": If you have equal Pulse and Sine in discard, draw 2 and gain 8 shield
   - "Harmonic Balance": When you play 3rd Pulse or Sine (whichever is lesser), gain 1 energy
   - "Wave Balance": For every matching Pulse/Sine pair played, reduce a card cost by 1

#### B. Pulse + Saw (Aggression)
1. **Damage Ramping**
   - "Cascade Strike": Each Pulse makes next Saw deal +3, each Saw makes next Pulse deal +2
   - "Aggressive Tuning": Pulse and Saw cards cost 1 less if played on same turn
   - "Damage Burst": If you play 2 Pulse and 2 Saw in one turn, deal 15 AOE

2. **Frontload Damage**
   - "Opening Salvo": First Pulse or Saw each combat deals double
   - "Blitz Protocol": Pulse and Saw in starting hand cost 0
   - "Alpha Strike": First 3 damage cards deal +8

#### C. Pulse + Noise (Chaos)
1. **Controlled Chaos**
   - "Static Pulse": Pulse cards generate +1 Static, but deal +4 per Static
   - "Noise Amplifier": Each Noise increases next Pulse damage by +3
   - "Chaotic Surge": If you have 5+ Static, Pulse cards deal double

2. **Risk/Reward**
   - "Dangerous Mix": Pulse and Noise together trigger special effects (roll table)
   - "Unstable Core": Pulse deals +10, but generates 2 Static
   - "Controlled Detonation": Spend all Static, Pulse deals +5 per Static spent

#### D. Sine + Saw (Sustain Aggression)
1. **Sustained Assault**
   - "Fortified Attack": Each Saw played while having 10+ shield deals +6
   - "Shielded Advance": Gain 2 shield per Saw played
   - "Defensive Offense": Sine cards make next Saw deal +4

2. **Shield-Damage Conversion**
   - "Sine Saw Feedback": Deal damage equal to 50% of shield gained this turn
   - "Protected Assault": Saw cards give +3 shield
   - "Guard Counter": When shields block damage, next Saw deals +7

#### E. Sine + Noise (Disruption)
1. **Defensive Chaos**
   - "Noisy Shield": Sine cards generate 1 Static but give +5 shield
   - "Disruptive Defense": Enemies lose 1 strength for each Sine played (if you have 5+ Static)
   - "Chaotic Barrier": Gain shield equal to Static × 3

2. **Transform Defense**
   - "Sine Corruption": Sine cards in hand can be converted to Noise at +1 cost
   - "Protective Chaos": Noise cards give shield equal to 50% of damage
   - "Feedback Shield": Gain shield equal to Static when hit

#### F. Saw + Noise (Pure Aggression)
1. **Maximum Violence**
   - "Bleeding Chaos": Saw and Noise deal +3 damage each
   - "Aggressive Corruption": Saw cards generate +1 Static, Noise deals +2 per Static
   - "Damage Spike": If you play Saw and Noise on same turn, deal 10 AOE

2. **Glass Cannon**
   - "Reckless Assault": Saw and Noise deal double, but you take 3 per card
   - "All-In Attack": Lose 5 shield, Saw and Noise deal +15
   - "Desperate Strike": At 50% HP or less, Saw and Noise deal triple

### 3. Multi-Card Combo Systems

#### A. Card Chains (3+ card sequences)
1. **Triple Threat**
   - "Pulse → Sine → Saw": Gain 1 energy and draw 1
   - "Saw → Saw → Saw": Deal 20 AOE damage
   - "Sine → Sine → Pulse": Gain 20 shield and return 1 card from discard

2. **Rainbow Chain** (one of each type)
   - Play Pulse, Sine, Saw, Noise in any order
   - Reward: +3 energy next turn, draw 2
   - "Chromatic Mastery" card enables double reward

3. **Mirrored Sequences**
   - "Pulse-Sine-Pulse": Gain shield equal to damage dealt
   - "Saw-Noise-Saw": Draw 3, gain 2 tempo
   - "Sine-Saw-Sine": Gain 15 shield, next attack deals +10

#### B. Simultaneous Card Effects
1. **Pair Plays** (playing together)
   - "Twin Strike": If you play 2 damage cards in a row, deal +8
   - "Double Shield": If you play 2 shield cards in a row, gain +10 shield
   - "Mixed Combo": If you alternate damage/shield, gain +2 tempo each

2. **Set Completion**
   - "Full House": 3 of one type, 2 of another = 20 AOE
   - "Pair Plus": 2 pairs of different types = draw 4
   - "Straight": Pulse-Sine-Saw-Noise = heal 15

#### C. Position-Based Effects
1. **First Card of Turn**
   - "Opening Move": First card each turn costs 1 less
   - "Starting Pulse": If first card is Pulse, all Pulse deal +5 this turn
   - "Lead Shield": If first card is Sine, gain +8 shield

2. **Last Card of Turn**
   - "Finishing Blow": Last card deals double damage
   - "Closing Shield": Last card gives double shield
   - "Final Flourish": Last card triggers twice

3. **Middle Cards**
   - "Core Strike": 3rd card played deals +12
   - "Mid-Tempo": 2nd and 3rd cards give +2 tempo each
   - "Balanced Play": If you play exactly 4 cards, gain 1 energy next turn

### 4. Reactive Synergies

#### A. On-Damage Triggers
1. **When Hit**
   - "Counter Pulse": When you take damage, deal 5 back
   - "Reactive Shield": When you take 10+ damage, gain 15 shield
   - "Damage Converter": When hit, gain 1 energy

2. **When Shield Breaks**
   - "Shield Break Pulse": Deal 15 damage when shield depletes
   - "Second Wind": When shield breaks, draw 2
   - "Retaliatory Burst": When shield breaks, next attack deals +20

3. **Per Damage Taken**
   - "Rage Builder": Gain +1 damage per 5 damage taken this combat
   - "Desperation": At 50% HP, all cards cost 1 less
   - "Last Stand": At 25% HP, all cards deal double

#### B. On-Kill Triggers
1. **Kill Effects**
   - "Momentum Kill": When you kill an enemy, gain 2 energy
   - "Victory Shield": When you kill an enemy, gain 10 shield
   - "Execute Chain": When you kill, draw 2 and gain 2 tempo

2. **Overkill Benefits**
   - "Excess Energy": Overkill damage converts to energy (10 damage = 1 energy)
   - "Splash Damage": Overkill damage hits another random enemy
   - "Efficient Kill": If you kill enemy with less than 5 overkill, gain 1 energy

#### C. Turn-Based Triggers
1. **Start of Turn**
   - "Morning Surge": Draw 1 extra if hand size < 3
   - "Rested Power": Gain 2 shield at start of turn for each Sustain card
   - "Fresh Start": Gain 1 tempo at start of turn

2. **End of Turn**
   - "Evening Pulse": Deal 5 damage at end of turn if you have 15+ shield
   - "Residual Energy": Unused energy deals 3 damage per energy
   - "Cleanup Protocol": Discard hand, draw 2, gain 5 shield

### 5. Archetype Enablers

Each archetype should have 5-8 cards that synergize strongly

#### A. "Infinite Engine" Archetype
**Core Mechanic:** Play many cards per turn through cost reduction and draw

**Key Cards:**
1. "Perpetual Motion": Cost 0, draw 1, gain 1 tempo
2. "Cost Cascade": Each card makes next card cost 1 less (up to 3)
3. "Draw Engine": Sustain, draw 1 at start of turn
4. "Tempo Conversion": Spend 4 tempo, gain 2 energy
5. "Cheap Pulse": Cost 0, deal 4 damage
6. "Cycle": Cost 1, draw 2, discard 1
7. "Efficiency Core": Cards that cost 0 or 1 give +2 tempo

**Payoffs:** Tempo-based damage, draw-based effects, "cards played this turn" scaling

#### B. "High Shield" Archetype
**Core Mechanic:** Stack massive shields and convert to damage/other benefits

**Key Cards:**
1. "Fortress": Cost 2, gain 18 shield
2. "Shield Slam": Deal damage equal to 150% of current shield, lose all shield
3. "Layered Defense": Each shield card gives +3 shield per shield card already played
4. "Shield Battery": Sustain, gain 4 shield at start of turn
5. "Reactive Plating": When hit, gain shield equal to damage taken
6. "Barrier Echo": Echo, gain 10 shield
7. "Impenetrable": If shield > 40, take no damage this turn

**Payoffs:** Shield-to-damage conversion, persistent shields, shield thresholds

#### C. "Exhaust Rush" Archetype
**Core Mechanic:** Play powerful Exhaust cards for explosive turns

**Key Cards:**
1. "Burn Bright": Cost 2, Exhaust, deal 25 damage
2. "Final Stand": Cost 3, Exhaust, gain 30 shield, draw 3
3. "Martyrdom": Cost 1, Exhaust, deal 15 AOE, take 10 self damage
4. "Phoenix Ash": When you Exhaust a card, gain 5 shield
5. "Controlled Burn": Exhaust cards deal +10 damage
6. "Last Resort": Cost 0, Exhaust, deal 10 per Exhausted card this combat
7. "Recycle": Return an Exhausted card to hand (once per combat)

**Payoffs:** Exhaust counting, exhaust triggers, powerful single-use effects

#### D. "Static Embrace" Archetype
**Core Mechanic:** Intentionally build Static for massive damage spikes

**Key Cards:**
1. "Static Bomb": Deal 5 per Static, reset Static to 0
2. "Noise Burst": Cost 1, deal 8, gain 2 Static
3. "Chaotic Amplifier": Cards deal +2 damage per Static
4. "Glitch Converter": Glitch cards cost 0 and deal 12 damage
5. "Static Shield": Gain shield equal to Static × 4
6. "Controlled Chaos": Cost 2, set Static to 8
7. "Entropy Surge": Cost 3, deal damage equal to Static × 8, inject 2 Glitches

**Payoffs:** Static-scaled damage, Glitch synergies, high-risk gameplay

#### E. "Echo Spam" Archetype
**Core Mechanic:** Stack many Echo cards for accumulating damage/shield

**Key Cards:**
1. "Double Echo": Echo cards trigger at 100% instead of 50%
2. "Echo Amplifier": Each Echo card makes next Echo +3 damage
3. "Resonance": Cost 1, Echo, deal 8 damage
4. "Echo Shield": Cost 1, Echo, gain 9 shield
5. "Harmonic Overload": If 3+ Echo cards played, all deal +10
6. "Echo Memory": Sustain, Echo cards deal +2
7. "Reverberation": Cost 2, Echo, draw 2

**Payoffs:** Echo counting, Echo multipliers, repeated effects

#### F. "Pattern Master" Archetype
**Core Mechanic:** Consistently complete patterns with Wildcard and sequence control

**Key Cards:**
1. "Wildcard": Counts as any waveform for patterns
2. "Flexible Strike": Choose waveform when played
3. "Pattern Completion": Cost 2, fill next empty pattern slot
4. "Sequence Lock": Pattern doesn't change this combat
5. "Double Pattern": Gain rewards from completing pattern twice
6. "Perfect Form": If you complete pattern 5 turns in a row, gain +5 max HP
7. "Pattern Master": Completing patterns gives +2 energy next turn

**Payoffs:** Pattern bonuses, consistency, sequence matching

---

## Balance & Economy

### 1. Currency Economy

**Current State:**
- Earn currency from defeating enemies
- Spend in shop on cards/relics
- No other currency sources/sinks

**Proposed Balance:**

#### A. Currency Income
1. **Base Floor Rewards**
   - Floor 1-3: 30-40 currency
   - Floor 4-6: 50-60 currency
   - Floor 7-9: 70-80 currency
   - Floor 10+: 90-100 currency
   - Scales with difficulty

2. **Performance Bonuses**
   - Perfect Floor (no damage taken): +20 currency
   - Pattern Master (complete pattern every turn): +15 currency
   - Speed Clear (defeat in <5 turns): +10 currency
   - Overkill (massive final hit): +5 currency

3. **Alternative Income**
   - "Currency Drop" cards: Gain 10-20 currency when played
   - "Scavenger" relic: Gain 5 currency per card removed
   - "Merchant's Token" relic: Gain 10 currency at start of each floor

#### B. Shop Pricing
1. **Card Costs**
   - Common cards: 40-60 currency
   - Uncommon cards: 70-100 currency
   - Rare cards: 120-160 currency
   - Scaling factor: +10% per floor

2. **Relic Costs**
   - Common relics: 80-100 currency
   - Rare relics: 150-200 currency
   - Shop relics: 250-300 currency (unique, powerful)

3. **Service Costs**
   - Remove card: 50 currency (increases by 25 per removal)
   - Upgrade card: 75 currency (improves stats by 25%)
   - Transform card: 100 currency (reroll into different card)
   - Heal: 25 currency per 10 HP

#### C. Economy Variance
1. **Difficulty-Based Scaling**
   - Easy Mode: +50% currency income, -25% shop costs
   - Normal Mode: Standard rates
   - Hard Mode: Standard income, +50% shop costs
   - Ascension Mode: -25% income, +100% shop costs

2. **Economic Events**
   - "Merchant's Discount": Shop costs -30% this floor
   - "Black Market": Powerful relics at discount, but adds curse
   - "Donation": Pay 100 currency to gain powerful blessing
   - "Gamble": Pay 50 currency, 50% chance to win 150

### 2. Enemy Scaling

**Current State:**
- Enemies scale by floor
- More enemies appear on higher floors
- Some have special abilities

**Proposed Balance:**

#### A. Enemy Health Scaling
1. **Linear Base Scaling**
   - Floor 1: Total enemy HP = 40-60
   - Floor 2: Total enemy HP = 70-90
   - Floor 3: Total enemy HP = 100-130
   - Floor 4: Total enemy HP = 140-180
   - Formula: totalHP = 40 + (floor × 30) + random(-10, +10)

2. **Difficulty Multipliers**
   - Easy: 0.75x HP
   - Normal: 1.0x HP
   - Hard: 1.5x HP
   - Ascension: 2.0x HP + special abilities

3. **Enemy Composition**
   - Floor 1-2: 1-2 common enemies
   - Floor 3-4: 2-3 common OR 1 elite
   - Floor 5-6: 2-3 mixed OR 1 elite
   - Floor 7-8: 3-4 mixed OR 2 elites
   - Floor 9-10: 2 elites OR 1 boss
   - Floor 11+: 1 boss + support

#### B. Enemy Damage Scaling
1. **Attack Damage Formula**
   - Base damage = 8 + (floor × 2)
   - Floor 1: 10 damage
   - Floor 5: 18 damage
   - Floor 10: 28 damage
   - Mitigated by shield/defense scaling

2. **Player Defense Scaling**
   - Player should gain ~5-7 shield per floor through upgrades
   - Player should deal ~10-15 more damage per floor
   - Balance: Player power should slightly exceed enemy scaling

3. **Special Attack Patterns**
   - "Charge Attack": Telegraph 1 turn, deal 2x damage
   - "Multi-Hit": Deal 5 damage 3 times (bypasses some shield)
   - "Percentage Attack": Deal damage = 20% of player max HP
   - "Execute": Deal massive damage if player < 30% HP

#### C. Enemy Abilities by Tier
1. **Common Tier** (floors 1-3)
   - Basic attacks (8-12 damage)
   - Simple defense (5-8 shield)
   - No special mechanics
   - Purpose: Tutorial, pattern practice

2. **Elite Tier** (floors 4-7)
   - Strong attacks (15-20 damage)
   - Special abilities:
     - "Regeneration": Heal 5 per turn
     - "Thorns": Deal 3 damage when hit
     - "Vulnerable": Reduce player shield by 50%
   - Purpose: Threat, requires strategy

3. **Boss Tier** (floors 8-10)
   - Very strong attacks (25-35 damage)
   - Multiple abilities:
     - "Enrage": Gain +5 damage when hit
     - "Summon": Add weak enemy to combat
     - "Shield Wall": Gain 20 shield per turn
     - "Life Drain": Heal for 50% of damage dealt
   - Purpose: Major challenge, test full deck

4. **Champion Tier** (floors 11+)
   - Extreme attacks (40-60 damage)
   - Complex abilities:
     - "Phase Shift": Immune to damage every other turn
     - "Pattern Lock": Copy your last pattern and block it
     - "Static Explosion": Deal 5 damage per Static you have
     - "Mirror Match": Copy your strongest card
   - Purpose: Master-level challenge

#### D. Enemy Archetypes
1. **Offensive Enemies**
   - Low HP (0.8x normal)
   - High damage (1.5x normal)
   - Aggressive AI (always attacks)
   - Punish slow decks

2. **Defensive Enemies**
   - High HP (1.5x normal)
   - Low damage (0.7x normal)
   - Gains shield frequently
   - Punish low-damage decks

3. **Disruptive Enemies**
   - Normal HP and damage
   - Special abilities that interfere:
     - Increase card costs
     - Generate Static for player
     - Reduce shield effectiveness
     - Force discards
   - Punish specific strategies

4. **Adaptive Enemies**
   - Normal stats
   - Change tactics based on player:
     - If player has high shield, use pierce
     - If player deals high damage, gain shield
     - If player completes pattern, break sequence
   - Require flexible gameplay

### 3. Card Balance

**Current State:**
- Basic costs and effects
- Some scaling with relics

**Proposed Balance:**

#### A. Cost Curves
1. **0-Cost Cards**
   - Should have minimal impact: 3-4 damage, 3-4 shield, or small utility
   - "Weak Strike": 0 cost, 3 damage
   - "Quick Guard": 0 cost, 3 shield
   - "Tempo Tap": 0 cost, gain 2 tempo
   - Enable combo plays, not primary strategy

2. **1-Cost Cards** (most common)
   - Moderate impact: 6-8 damage, 7-9 shield, or minor utility
   - "Standard Strike": 1 cost, 7 damage
   - "Basic Guard": 1 cost, 8 shield
   - "Card Draw": 1 cost, draw 2
   - Core of most decks

3. **2-Cost Cards**
   - Strong impact: 12-16 damage, 14-18 shield, or major utility
   - "Power Strike": 2 cost, 14 damage
   - "Strong Guard": 2 cost, 16 shield
   - "AOE Blast": 2 cost, 10 damage to all
   - High-impact plays

4. **3-Cost Cards** (finishers)
   - Extreme impact: 20-30 damage, 25-35 shield, or game-changing utility
   - "Mega Strike": 3 cost, 28 damage
   - "Fortress": 3 cost, 32 shield
   - "Full Board Clear": 3 cost, 18 damage to all
   - Turn-ending plays

#### B. Damage vs Shield Balance
1. **Damage should slightly exceed shield**
   - Reason: Encourages aggressive play
   - Ratio: 1 energy = 8 damage or 9 shield (shield slight advantage)
   - "Strike": 1 cost, 8 damage
   - "Guard": 1 cost, 9 shield

2. **AOE Damage Discount**
   - AOE should deal 60-70% of single-target for same cost
   - "Single Strike": 2 cost, 16 damage
   - "AOE Strike": 2 cost, 11 damage to all
   - Balances multi-enemy vs single-enemy damage

3. **Utility Cost Equivalence**
   - Draw 1 = ~4 damage/shield value
   - Gain 2 tempo = ~3 damage/shield value
   - Remove 1 Static = ~5 damage/shield value
   - "Strike + Draw": 2 cost, 10 damage, draw 1
   - "Guard + Tempo": 2 cost, 12 shield, gain 2 tempo

#### C. Rarity Balance
1. **Common Cards**
   - Efficient but simple
   - No complex synergies
   - Always reasonable to play
   - Example: "Basic Strike" costs 1, deals 8 damage

2. **Uncommon Cards**
   - Introduce synergies and combos
   - Slightly more efficient than commons
   - Require some deck building consideration
   - Example: "Echo Strike" costs 1, deals 6 damage, Echo (total 9)

3. **Rare Cards**
   - Extremely powerful or unique
   - Build-around potential
   - Can be situational but high payoff
   - Example: "Wildcard" costs 1, 3 damage, counts as any waveform

#### D. Keyword Cost Adjustments
1. **Echo**: +0.5 effective cost (50% more value)
2. **AOE**: -0.5 cost per target beyond first
3. **Exhaust**: -1 cost (one-time use)
4. **Sustain**: +1 cost (reusable)
5. **Draw**: +0.5 cost per card drawn
6. **Leech**: +0.5 cost for 50% leech

**Example:**
- "Basic Strike": 1 cost, 8 damage
- "Echo Strike": 1 cost, 6 damage, Echo = (6 + 3) = 9 total = slightly better
- "Exhaust Strike": 0 cost, 10 damage, Exhaust = good burst
- "Sustain Strike": 2 cost, 6 damage, Sustain = infinite value over time

### 4. Relic Balance

**Current State:**
- 14 relics with various effects
- Some are clearly stronger than others

**Proposed Balance:**

#### A. Relic Power Tiers
1. **Tier 1: Minor Boost** (80-100 currency)
   - Small consistent advantage
   - "Energy Cell": +5 max HP
   - "Tempo Starter": Start each combat with 1 tempo
   - "Shield Chip": Start each combat with 3 shield

2. **Tier 2: Moderate Boost** (120-150 currency)
   - Noticeable strategic advantage
   - "Coil Capacitor": +1 energy at combat start
   - "Expanded Buffer": +1 hand size
   - "Static Sink": -1 Static per turn

3. **Tier 3: Strong Boost** (180-220 currency)
   - Significant power spike
   - "Harmonic Resonator": +4 damage for waveform pairs
   - "Echo Node": +1 draw on Forge Burst
   - "Sine Loom": Shield doesn't reset

4. **Tier 4: Build-Around** (250-300 currency)
   - Enables entire archetypes
   - "Tempo Amp": Special effects at max tempo
   - "Chaos Engine": Glitch cards cost 0
   - "Critical Mass": Scaling per cards played

#### B. Relic Synergy Clusters
1. **Energy Relics** (support all decks)
   - "Coil Capacitor": +1 energy at start
   - "Energy Conduit": +1 energy per turn (total +2)
   - "Perpetual Motion": Unused energy persists

2. **Shield Relics** (defense archetype)
   - "Shield Battery": +2 shield per turn
   - "Sine Loom": Shield persists
   - "Fortress Core": +50% shield values

3. **Tempo Relics** (combo archetype)
   - "Tempo Amp": Effects at max tempo
   - "Tempo Chain": Start with 2 tempo
   - "Tempo Overflow": Tempo above 6 converts to energy

4. **Static Relics** (chaos archetype)
   - "Entropy Harvester": Gain currency from Glitches
   - "Chaos Engine": Glitch cards cost 0
   - "Static Battery": Gain energy equal to Static/3

#### C. Relic Restrictions
1. **Mutually Exclusive Relics**
   - Can't have both "Sine Loom" and "Shield Battery" (too strong)
   - Can't have both "Chaos Engine" and "Static Sink" (anti-synergy)
   - Maximum 2 energy relics per run

2. **Relic Limits**
   - Max 12 relics per run
   - Some relics count as 2 slots (very powerful)
   - Some relics have tiers (upgrade existing relic)

### 5. Difficulty Curve

**Proposed Difficulty Settings:**

#### A. Easy Mode (Learning)
- Player starts with 100 HP instead of 80
- Enemies have 75% HP
- +50% currency income
- -25% shop costs
- Heal 30% HP between floors
- No Glitch cards injected
- Purpose: Learn mechanics without pressure

#### B. Normal Mode (Standard)
- Player starts with 80 HP
- Standard enemy HP
- Standard economy
- Heal 20% HP between floors
- Standard Glitch mechanics
- Purpose: Balanced challenge

#### C. Hard Mode (Challenge)
- Player starts with 60 HP
- Enemies have 150% HP
- Standard income, +50% shop costs
- Heal 10% HP between floors
- Glitch threshold -1
- Enemies have 1 extra ability
- Purpose: Veteran players

#### D. Ascension Mode (Mastery)
**Progressive difficulty levels 1-20:**
- Ascension 1-5: +10% enemy HP per level
- Ascension 6-10: +additional enemy abilities
- Ascension 11-15: +shop costs increase
- Ascension 16-20: +special boss mechanics
- Purpose: Endless replayability

**Example Ascension 20:**
- Enemies have 300% HP
- All enemies have 3+ abilities
- Shop costs +200%
- No healing between floors
- Start each combat at 50% HP
- Glitch threshold is 2
- Purpose: Ultimate challenge

---

## New Mechanics Proposals

### 1. Corruption System

**Concept:** Dual-edged power mechanic where you gain strength at a cost

**How It Works:**
- Corruption is a new stat (separate from Static)
- Some cards and relics generate Corruption
- High Corruption grants powerful benefits but also penalties
- Corruption reduces slowly (1 per floor) or through specific cards

**Corruption Levels:**
1. **0-2 Corruption:** No effect
2. **3-5 Corruption:** +3 damage to all attacks, -2 max HP per floor
3. **6-9 Corruption:** +6 damage to all attacks, -5 max HP per floor, 10% chance to draw Curse card
4. **10+ Corruption:** +10 damage to all attacks, -10 max HP per floor, 25% chance to draw Curse, take 3 damage at start of turn

**Cards:**
- "Corrupted Strike": Cost 1, deal 15 damage, gain 2 Corruption
- "Dark Pact": Cost 2, gain 3 energy this turn, gain 3 Corruption
- "Purify": Cost 2, remove 5 Corruption, heal 10 HP

**Relics:**
- "Tainted Core": Start with 5 Corruption, +2 energy per turn
- "Corruption Sink": Reduce Corruption by 2 per floor
- "Embrace Darkness": Gain +2 damage per Corruption (no penalties)

### 2. Momentum/Inertia System

**Concept:** Reward consecutive actions of similar types

**How It Works:**
- Playing same card type consecutively builds Momentum
- Momentum grants escalating bonuses
- Breaking momentum resets counter

**Momentum Table:**
1. 1st card: +0 bonus
2. 2nd card (same type): +3 bonus
3. 3rd card (same type): +6 bonus
4. 4th card (same type): +10 bonus
5. 5th+ card (same type): +15 bonus

**Examples:**
- Play 5 Pulse cards in a row: each deals +15 damage beyond 3rd card
- Play 4 Sine cards in a row: each gives +10 shield beyond 3rd card
- Play 3 0-cost cards: each gives +6 effect

**Break Bonuses:**
- If you reach 5 momentum then play different card, gain 1 energy
- "Momentum Shift" card: Break momentum intentionally for bonus effect

### 3. Overload System

**Concept:** Pay health to exceed normal limits

**How It Works:**
- Spend HP to gain temporary advantages
- Dangerous but powerful when ahead
- Enables high-risk, high-reward strategies

**Overload Options:**
1. **Overload Energy**: Pay 8 HP, gain 2 energy this turn
2. **Overload Draw**: Pay 10 HP, draw 3 cards
3. **Overload Damage**: Pay 5 HP, next attack deals double
4. **Overload Shield**: Pay 7 HP, gain 20 shield

**Cards:**
- "Life Strike": Cost 0, deal 20 damage, lose 8 HP
- "Desperate Shield": Cost 0, gain 16 shield, lose 6 HP
- "Blood Draw": Cost 0, draw 3, lose 10 HP

**Relics:**
- "Vampire Core": Heal for 50% of Overload costs
- "Pain Threshold": First Overload each turn costs 0 HP
- "Life Battery": Gain 1 energy per 10 HP lost this combat

### 4. Catalyst System

**Concept:** Cards that modify other cards in hand

**How It Works:**
- Catalyst cards don't do anything on their own
- They enhance next card played
- Creates interesting sequencing decisions

**Catalyst Cards:**
1. "Amplifier": Cost 1, next card deals +10 damage or +12 shield
2. "Echo Primer": Cost 0, next card gains Echo
3. "Cost Reducer": Cost 1, next card costs 2 less
4. "AOE Spreader": Cost 1, next card gains AOE
5. "Duplicator": Cost 2, next card triggers twice

**Synergies:**
- "Amplifier + Power Strike (14 dmg)" = 24 damage for 2 total energy
- "Echo Primer + Shield (10)" = 15 shield for 1 total energy
- "AOE Spreader + Leech Strike" = heal from all enemies

### 5. Siphon/Transfer System

**Concept:** Take resources from one pool to add to another

**How It Works:**
- Convert shield to damage, energy to HP, etc.
- Creates flexibility and adaptation
- Enables creative problem-solving

**Siphon Cards:**
1. "Shield Sacrifice": Lose all shield, deal damage equal to 200% of lost shield
2. "Energy Burst": Lose 2 energy, deal 25 damage
3. "Life Force": Lose 15 HP, gain 3 energy and draw 3
4. "Tempo Convert": Spend 5 tempo, gain 2 energy
5. "Static Discharge": Lose all Static, deal 8 per Static lost

**Transfer Cards:**
1. "Shield to Power": Cost 1, convert 10 shield to +10 damage this turn
2. "Energy to HP": Cost 0, lose 1 energy, heal 10 HP
3. "HP to Shield": Cost 0, lose 10 HP, gain 20 shield
4. "Damage to Draw": Cost 2, deal 10 damage, draw 1 per 5 damage dealt

### 6. Bet/Gamble System

**Concept:** Random outcomes with risk/reward

**How It Works:**
- Cards with RNG effects
- Can lowroll or highroll
- Exciting and unpredictable

**Gamble Cards:**
1. "Lucky Strike": Cost 1, deal 5-20 damage (random)
2. "Fortune Shield": Cost 1, gain 4-16 shield (random)
3. "Draw Roulette": Cost 1, draw 0-4 cards (random)
4. "Energy Gambit": Cost 2, gain 0-3 energy (random)
5. "Wild Effect": Cost 2, trigger random powerful effect

**Gamble Modifiers:**
- "Loaded Dice" relic: +2 to all random rolls
- "Lucky Charm" relic: Reroll one random effect per combat
- "Probability Field" card: Next random effect uses best of 2 rolls

---

## Enemy Design Philosophy

### Enemy Types & AI Patterns

#### A. Predictable Enemies (Teaching)
**Purpose:** Let player plan strategies

1. **Patrol Bot**
   - Pattern: Attack → Attack → Shield → repeat
   - HP: 30
   - Attack: 10
   - Always predictable, teaches rhythm

2. **Charger**
   - Pattern: Charge → Heavy Attack → Charge → Heavy Attack
   - HP: 40
   - Light: 5 damage, Heavy: 20 damage
   - Teaches telegraphing and burst defense

#### B. Reactive Enemies (Adapting)
**Purpose:** Respond to player actions

1. **Mirror Unit**
   - If player deals high damage: gains shield
   - If player gains high shield: deals heavy damage
   - Teaches balanced play

2. **Counter Protocol**
   - Retaliates when hit
   - Deal 5 damage back per hit
   - Teaches AOE vs single-target decisions

#### C. Disruptive Enemies (Interfering)
**Purpose:** Break player patterns

1. **Static Generator**
   - Generates +2 Static for player each turn
   - Low HP, high threat
   - Must be prioritized

2. **Pattern Breaker**
   - Randomizes pattern sequence each turn
   - Prevents pattern completion
   - Teaches adaptation

#### D. Support Enemies (Multi-Enemy)
**Purpose:** Create priority targets

1. **Healer Bot**
   - Heals allies for 8 per turn
   - Low HP, must kill first
   - Creates focus target

2. **Buffer Unit**
   - Grants allies +5 damage
   - Medium HP, high value target
   - Teaches target prioritization

### Boss Mechanics

**Each boss should have 3 phases with unique mechanics:**

#### Boss 1: "Corrupted Core" (Floor 3)
**Phase 1 (100%-66% HP):**
- Basic attacks and shields
- Teaches basic combat

**Phase 2 (66%-33% HP):**
- Adds shield generation
- Summons 1 weak add
- Tests AOE/single-target balance

**Phase 3 (33%-0% HP):**
- Enrages (+10 damage)
- Multi-attacks (3x5 damage)
- Tests shield management

#### Boss 2: "Pattern Architect" (Floor 6)
**Phase 1 (100%-66% HP):**
- Forces specific patterns
- If player completes, take less damage
- If player fails, take bonus damage
- Tests pattern mastery

**Phase 2 (66%-33% HP):**
- Adds pattern immunity
- Some waveforms don't hurt boss this phase
- Tests deck flexibility

**Phase 3 (33%-0% HP):**
- Pattern reversal
- Completing pattern HURTS player
- Must intentionally break patterns
- Tests adaptation

#### Boss 3: "Ultimate Protocol" (Floor 10)
**Phase 1 (100%-75% HP):**
- Mimics player deck
- Plays copies of player's cards
- Tests self-awareness

**Phase 2 (75%-50% HP):**
- Adds shield/regen
- Heavy defense phase
- Tests sustained damage

**Phase 3 (50%-25% HP):**
- All-out offense
- Multi-target attacks
- Tests burst defense

**Phase 4 (25%-0% HP):**
- Desperation mode
- Extreme damage, no defense
- Race to finish

---

## Relic Ecosystem

### Relic Categories & Design

#### A. Foundation Relics (always good)
1. "Energy Core": +1 energy per turn
2. "Vitality Chip": +15 max HP
3. "Draw Module": +1 card drawn per turn
4. "Tempo Starter": Start combat with 2 tempo

#### B. Archetype Relics (enables strategies)
1. "Echo Amplifier": Echo at 100% instead of 50%
2. "Exhaust Converter": Gain 5 shield per Exhaust
3. "Shield Generator": +50% shield from all sources
4. "Damage Amp": +50% damage from all sources

#### C. Synergy Relics (requires specific builds)
1. "Harmonic Resonator": +4 damage for waveform pairs
2. "Static Battery": Gain 1 energy per 3 Static
3. "Tempo Overflow": Tempo above 6 converts to damage
4. "Pattern Master": Pattern completion draws 2 cards

#### D. Transformation Relics (changes gameplay)
1. "Chaos Engine": Glitch cards cost 0 and draw 1
2. "Corruption Core": Start with 5 Corruption, +2 energy
3. "Vampire Cell": Heal for 50% of self-damage
4. "Time Dilation": Play 2 extra cards, take 10 damage per turn

#### E. Risk/Reward Relics (double-edged)
1. "Berserker Core": +5 damage, take +3 damage from attacks
2. "Fragile Power": +10 damage, -10 max HP
3. "Reckless": +1 energy, cannot gain shield
4. "All-In": Double all numbers, take double damage

### Relic Stacking Rules

**Linear Stacking:**
- Energy relics: Each adds +1
- HP relics: Each adds +10/15/20
- Damage relics: Each adds +3/+5/+10

**Multiplicative Stacking:**
- Percentage relics: Multiply (dangerous)
- "Shield Generator" + "Sine Loom" = insane shields
- Limit: Max 2 of same-type percentage relics

**Anti-Synergy Relics:**
- Some relics cancel out
- "Static Sink" vs "Entropy Harvester"
- Warn player when choosing conflicting relics

---

## Meta-Progression

### Unlock System

**Concept:** Reward repeated play with new content

#### A. Card Unlocks
1. Complete your first run: Unlock 5 new common cards
2. Reach floor 5: Unlock 3 new uncommon cards
3. Reach floor 10: Unlock 2 new rare cards
4. Complete 10 runs: Unlock "Wildcard" card
5. Win on Hard Mode: Unlock powerful rare cards

#### B. Relic Unlocks
1. Use 50 Echo cards: Unlock "Double Echo" relic
2. Exhaust 100 cards: Unlock "Phoenix Rebirth" relic
3. Complete pattern 50 times: Unlock "Pattern Master" relic
4. Generate 100 Static: Unlock "Chaos Engine" relic

#### C. Challenge Unlocks
1. Win without taking damage: Unlock "Perfect Run" badge
2. Win with 10+ relics: Unlock "Hoarder" badge
3. Win with 20+ card deck: Unlock "Minimalist" badge
4. Win with only commons: Unlock "Purist" badge

### Daily Challenge

**Concept:** Fixed seed run with leaderboard

**Features:**
1. Same seed for all players
2. Fixed enemy pattern
3. Fixed shop inventory
4. Compete for fastest clear
5. Rewards: Special currency for cosmetics

### Endless Mode

**Concept:** See how far you can go

**Features:**
1. Floors continue infinitely
2. Enemies scale infinitely
3. Special rewards every 5 floors
4. Leaderboard for highest floor reached
5. Unique relics only in Endless

---

# Part II: Extended Design Proposals

> The following sections expand significantly on every category above with deep, code-informed suggestions.
> Each category contains **40+ distinct proposals** grounded in the current implementation
> (40 HP start, 3 energy/turn, 5 hand size, 4 glitch threshold, max 6 tempo, 31 cards, 15 relics, 17 enemies).

---

## Extended Core Systems (60 Proposals)

### CS-1. Deck Reshuffle — Currently Missing

The codebase has **no reshuffle mechanic**: when the draw pile empties, you simply stop drawing.
This is the single most impactful gap in the core loop.

**Proposals:**

1. **Standard Reshuffle**: When draw pile is empty, shuffle discard into draw pile. Costs 1 energy the first time per combat, 2 energy the second, etc.
2. **Fatigue Reshuffle**: Free reshuffle, but inject 1 "Fatigue" card (cost 0, unplayable, exhaust at end of turn) per reshuffle.
3. **Voluntary Reshuffle Button**: Player can choose to reshuffle at any time by spending 2 energy and ending their turn.
4. **Automatic Silent Reshuffle**: Discard auto-shuffles in when deck is empty (like Slay the Spire). Cleanest option.
5. **Reshuffle Penalty Choice**: On reshuffle, choose: lose 3 HP, gain 2 Static, or skip next draw.
6. **Relic-Gated Reshuffle**: "Recycler Core" relic enables reshuffling; without it the deck stays empty.
7. **Partial Reshuffle**: Only shuffle bottom half of discard pile in; top half stays in discard. Creates interesting deck-building tension.
8. **Compression Reshuffle**: On reshuffle, randomly exhaust 1 card from the reshuffled cards. Deck thins naturally.

### CS-2. Tempo — Currently Cosmetic Only

In `SignalForgeGame.tsx`, tempo tracks to max 6 and resets each turn, but **never influences any damage formula, cost reduction, or gameplay effect**. Tempo Gear relic is defined in `Relic.ts` but has **zero references** in the engine.

**Proposals:**

9. **Implement Tempo Gear**: Wire up `tempo_gear` in `endTurn()` — when Forge Burst matches and tempo ≥ 1, add `+1 * relicCount` tempo. Simple fix, one `if` block.
10. **Tempo Damage Bonus**: `finalDamage += tempo * 1` for each card played. At max tempo (6), each card deals +6. Linear, predictable, powerful.
11. **Tempo Cost Reduction**: At tempo 4+, all cards cost 1 less this turn (minimum 0). Triggers a "rush" feeling.
12. **Tempo Draw Threshold**: Reaching tempo 3 draws 1 card. Reaching tempo 6 draws 2. Resets with tempo.
13. **Tempo Shield Bonus**: Each tempo point grants +1 shield at end of turn. Passive defense for aggressive players.
14. **Tempo Energy Refund**: If you end your turn at tempo 6, gain 1 energy next turn. Rewards full tempo.
15. **Tempo Decay Instead of Reset**: Tempo loses 2 per turn instead of resetting. Allows multi-turn tempo building.
16. **Tempo Streak Counter**: Track consecutive turns at max tempo. Each streak turn: `+streakCount * 3` damage to all attacks.
17. **Tempo Burst Event**: At tempo 6, trigger a "Tempo Burst" — deal 8 damage to all enemies (separate from Forge Burst).
18. **Tempo-Gated Cards**: New keyword `RequiresTempo(N)` — card can only be played if tempo ≥ N. Enables powerful conditional cards.
19. **Tempo Sacrifice**: New action: spend 4 tempo to gain 1 energy immediately. Gives tempo tactical value.
20. **Anti-Tempo Enemy Ability**: `tempoSiphon` — enemy steals 2 tempo from player each turn. Makes tempo a contested resource.

### CS-3. Sequence Length — Capped at 3

Currently `min(2 + floor(turn / 5), 3)` — starts at 2, reaches 3 at turn 5, never grows.

**Proposals:**

21. **Dynamic Sequence Length**: Scale with floor: `min(2 + floor(floor / 3), 5)`. Floor 1: 2, Floor 3: 3, Floor 6: 4, Floor 9: 5.
22. **Variable Sequence Rewards**: Longer sequences grant bigger bonuses: length 2 = +8, length 3 = +12, length 4 = +18, length 5 = +25.
23. **Sequence Memory**: If you complete a sequence, next turn's sequence shares 1 slot with the previous. Creates streak feel.
24. **Branching Sequences**: Two sequences shown at once; player chooses which to pursue. One offense-oriented, one defense-oriented.
25. **Sequence Difficulty Scaling**: Boss turns force complex patterns (all different types). Common turns allow repeats.
26. **Voluntary Sequence Extension**: Player can press a "Risk" button to add +1 to sequence length for +50% bonus damage.

### CS-4. Static Duplicate Detection

Currently static triggers on the 2nd+ card of the same waveform type per turn. The first of each type is free.

**Proposals:**

27. **Static Memory Across Turns**: Track waveform types played last turn. If you start this turn with the same type you ended on, +1 Static immediately.
28. **Static Combo Window**: Playing 3+ of the same waveform in a turn grants "Static Mastery" — next turn starts with -2 Static.
29. **Type Variety Bonus**: If you play all 4 waveform types in one turn, reduce Static by 3. Rewards diversity.
30. **Static Momentum**: Each consecutive same-type card adds +1 more Static than the previous. 2nd = +1, 3rd = +2, 4th = +3. Punishes extreme spam.
31. **Waveform Cooldown**: After playing 3+ of one type, that type costs +1 energy next turn. Prevents degenerate single-type decks.

### CS-5. Hand Size & Draw

Currently 5 base + `expanded_buffer_count`. Draw is random from deck (not top-of-deck).

**Proposals:**

32. **Ordered Draw**: Change from random to top-of-deck draw. Enables deck manipulation cards (scry, bury, etc.) to be meaningful.
33. **Overflow Draw**: Cards drawn beyond hand size go to a "Reserves" zone (max 2). Can be pulled into hand for 1 energy each.
34. **Mulligan System**: At start of combat, discard up to 2 cards and redraw. One-time strategic choice.
35. **Draw Priority**: Cards with the "Priority" keyword are always drawn first when in the draw pile.
36. **Conditional Draw Bonus**: If hand is empty when drawing, draw +1 extra card. Rewards playing out your hand.
37. **Hand Retention**: "Retain" keyword — card stays in hand between turns without counting as Sustain.
38. **Draw-on-Miss**: If you fail to complete a pattern, draw 1 consolation card. Softens the penalty.

### CS-6. Energy Economy

Currently 3 base + `energy_conduit_count`. Oscillator Core makes first Pulse free.

**Proposals:**

39. **Fractional Energy**: Some cards cost 0.5 energy (displayed as half-pips). Allows finer cost granularity.
40. **Energy Overflow**: Unspent energy carries over at 33% rate (max 1 carryover). Rewards efficient turns.
41. **Energy from Kills**: Defeating an enemy grants +1 energy this turn. Incentivizes aggressive play.
42. **Energy Surge Turn**: Every 4th turn, gain +2 bonus energy. Predictable power spike.
43. **Conditional Energy Regen**: If you play exactly 3 cards, gain 1 energy refund. Rewards measured play.
44. **Energy Debt**: "Borrow" 2 energy this turn; next turn starts with -1. Strategic overdraft.

### CS-7. Healing & Health

Currently 25% maxHP healing between floors. Player starts at 40 HP / 40 maxHP.

**Proposals:**

45. **Scaling Heal**: Heal `20 + floor * 2`% between floors. Later floors heal more to compensate for harder enemies.
46. **Combat Heal Threshold**: If you take 0 damage in a fight, heal 5 HP at end of combat. Rewards skillful play.
47. **Max HP Growth**: Gain +2 maxHP per floor cleared. By floor 10 you have 60 maxHP. Natural progression.
48. **Overheal Shield**: Healing beyond maxHP converts to shield at 50% rate (max 10). Makes heal cards useful at full HP.
49. **Rest vs. Shop Choice**: After each floor, choose: enter shop OR rest (heal 50% HP, skip shop). Meaningful tradeoff.
50. **Campfire Events**: Random events between floors — heal, upgrade a card, remove a card, or gain a small relic.
51. **HP Sacrifice Shop**: Pay 10 HP to reduce any shop item's cost by 30%. Health as currency.

### CS-8. Card Removal & Deck Management

Currently card removal costs 60 in the shop. No other deck management.

**Proposals:**

52. **Escalating Removal Cost**: First removal: 50, second: 75, third: 100, etc. Prevents over-thinning.
53. **Free Removal Event**: Every 3 floors, a free card removal event. Guaranteed deck thinning path.
54. **Card Upgrade System**: Pay 50 currency to upgrade a card: +25% damage/shield, -1 cost (min 0), or add a keyword.
55. **Card Transformation**: Pay 40 currency to transform a card into a random card of the same rarity.
56. **Starter Card Replacement**: After floor 3, starter cards (Pulse Strike, Pulse Tap, etc.) can be "evolved" into uncommon versions for 30 currency each.
57. **Deck Size Bonus**: If deck has ≤ 15 cards, gain +1 draw per turn. If deck has ≥ 25 cards, gain +5 maxHP. Rewards both thin and fat decks.
58. **Card Duplication**: Pay 80 currency to duplicate a card in your deck. Powerful for key combo pieces.

### CS-9. Score System

Currently: `+card.damage * 5` per card played, `+50` for Forge Burst, `+25` per enemy killed. Score is added even if damage doesn't connect.

**Proposals:**

59. **Fix Score-on-Play Bug**: Only award damage-based score when the card actually deals damage to an enemy. Currently inflated.
60. **Combo Score Multiplier**: Completing 3+ patterns in a row grants 1.5x score for that combat. Encourages consistency.

---

## Extended Card Designs (55 Proposals)

### CD-1. New Keywords

61. **Volatile**: Card's effect is random within a range (e.g., 5–15 damage). Adds variance and excitement.
62. **Delay**: Card's effect triggers at the START of your NEXT turn, not immediately. Enables pre-planning.
63. **Chain**: If the next card played shares a waveform type, it costs 1 less.
64. **Overcharge**: Pay 1 extra energy to double the card's effect. Optional on play.
65. **Piercing**: Damage ignores enemy Armored reduction.
66. **Siphon**: Steal shield from enemy and add to your own.
67. **Ricochet**: After hitting target, deal 50% damage to a random other enemy.
68. **Fading**: Card loses 1 damage/shield each time it's played. Naturally exhausts after N uses.
69. **Growing**: Card gains +2 damage/shield each time it's played this combat.
70. **Innate**: Card is always in your opening hand.
71. **Ethereal**: If not played this turn, exhaust at end of turn.
72. **Unplayable**: Cannot be played (like Static Burst glitch). Used for curse-style cards.
73. **Autoplay**: Triggers automatically when drawn. No energy cost but no player control.
74. **Retain**: Stays in hand between turns (distinct from Sustain — doesn't return after playing).
75. **Exhaust on Discard**: If this card is in hand at end of turn and discarded, exhaust it.

### CD-2. New Common Cards (Waveform-Themed)

76. **Pulse Echo** (Pulse, Common): Cost 1, Deal 5 damage, Echo. Cheap echo option for starters.
77. **Sine Pulse** (Sine, Common): Cost 0, Gain 4 shield, +1 Tempo. Fast defensive play.
78. **Saw Blitz** (Saw, Common): Cost 1, Deal 4 damage, Draw 1, Chain. Enables combo starts.
79. **Noise Tap** (Noise, Common): Cost 0, Deal 3 damage, +1 Static, +2 Tempo. Tempo filler.
80. **Pulse Guard** (Pulse, Common): Cost 1, Deal 3 damage, Gain 5 shield. Hybrid card.
81. **Sine Weave** (Sine, Common): Cost 1, Gain 6 shield, Stabilize 1. Defensive + anti-glitch.
82. **Saw Edge** (Saw, Common): Cost 1, Deal 7 damage. Simple efficient damage.
83. **Noise Burst** (Noise, Common): Cost 1, Deal 6 damage, +2 Static. Risk/reward damage.

### CD-3. New Uncommon Cards

84. **Resonant Strike** (Pulse, Uncommon): Cost 2, Deal 10 damage, Growing (+2 per play). Scales over combat.
85. **Frequency Lock** (Sine, Uncommon): Cost 1, Gain 8 shield, Retain. Keeps hand options open.
86. **Razor Cascade** (Saw, Uncommon): Cost 2, Deal 6 damage, Ricochet. Hits 2 enemies.
87. **Static Primer** (Noise, Uncommon): Cost 1, Deal 4 damage, +3 Static, Draw 1. Sets up static combos.
88. **Phase Strike** (Pulse, Uncommon): Cost 1, Deal 7 damage, Piercing. Counters Armored enemies.
89. **Harmonic Shell** (Sine, Uncommon): Cost 2, Gain 10 shield, Sustain. Repeatable defense.
90. **Buzzsaw** (Saw, Uncommon): Cost 2, Deal 5 damage × 2 hits. Multi-hit against shielded enemies.
91. **Interference** (Noise, Uncommon): Cost 1, +4 Static to target enemy, Stabilize 1. Offensive debuff.
92. **Signal Boost** (Pulse, Uncommon): Cost 1, All Pulse cards in hand deal +4 this turn. Hand-aware buff.
93. **Barrier Shift** (Sine, Uncommon): Cost 1, Convert all shield to damage on target enemy, Gain 6 shield. Shield-to-damage.
94. **Serrated Edge** (Saw, Uncommon): Cost 1, Deal 6 damage, Deal 3 damage at start of next 2 turns (Bleed). New DoT concept.
95. **White Noise** (Noise, Uncommon): Cost 2, Deal damage = current Static × 3. Static-scaling nuke.
96. **Echo Cascade** (Pulse, Uncommon): Cost 2, Deal 8 damage, Echo, +2 Tempo. Premium echo damage.
97. **Sine Reflection** (Sine, Uncommon): Cost 1, Gain shield = damage taken last turn (min 5). Reactive defense.
98. **Saw Tempest** (Saw, Uncommon): Cost 2, Deal 6 damage AOE, Draw 1. Efficient clear.
99. **Chaos Theory** (Noise, Uncommon): Cost 1, Volatile: Deal 3–12 damage, Draw 0–2 cards. Gamble card.

### CD-4. New Rare Cards

100. **Omega Pulse** (Pulse, Rare): Cost 3, Deal 25 damage, Echo, Exhaust. Ultimate burst.
101. **Absolute Zero** (Sine, Rare): Cost 3, Gain 30 shield, Freeze all enemies (skip their next attack). New "Freeze" status.
102. **Final Cut** (Saw, Rare): Cost 2, Deal damage = 2 × (cards played this turn) × 4, Exhaust. Scales with tempo.
103. **Entropy Bomb** (Noise, Rare): Cost 3, Deal damage = Static × 8, reset Static to 0, Exhaust. Static payoff.
104. **Pattern Forge** (Wildcard, Rare): Cost 2, Wildcard, Deal 8 damage, Complete current sequence slot AND next slot. Double pattern progress.
105. **Perpetual Engine** (Pulse, Rare): Cost 1, Deal 4 damage, Draw 1, Sustain. Infinite value engine.
106. **Void Shield** (Sine, Rare): Cost 2, Gain 15 shield. If this shield isn't broken by end of turn, carry it over (persists). Self-Sine-Loom.
107. **Chain Lightning** (Saw, Rare): Cost 2, Deal 12 damage to target, 8 to adjacent, 4 to next. Cascading damage.
108. **Glitch Exploit** (Noise, Rare): Cost 0, Play all Glitch cards in hand for free and they deal 8 damage each instead of their normal effect, Exhaust. Glitch archetype payoff.
109. **Harmonic Convergence** (Wildcard, Rare): Cost 3, Deal 5 damage per unique waveform type in played cards this turn, AOE. Rainbow reward.
110. **Recursion** (Pulse, Rare): Cost 2, Replay the last card you played this turn (copy its effects). Combo finisher.
111. **Shield Nova** (Sine, Rare): Cost 3, Deal damage = current shield to all enemies, keep shield. Shield-to-damage without losing defense.
112. **Blade Storm** (Saw, Rare): Cost 3, Deal 4 damage × (tempo) hits to random enemies. Tempo payoff.
113. **System Crash** (Noise, Rare): Cost 2, Set Static to 0, deal 5 damage per static removed to all enemies, Draw 2, Exhaust. Nuclear static reset.
114. **Time Warp** (Wildcard, Rare): Cost 4, Take an extra turn after this one (but no energy regen on the bonus turn — use only leftover energy). Ultimate power card.
115. **Adaptive Protocol** (Wildcard, Rare): Cost 1, Choose one: Deal 12 damage, Gain 14 shield, Draw 3, or Stabilize 3. Modal flexibility.

### CD-5. Curse & Negative Cards

116. **Corrupted Signal**: Cost 1, Unplayable (wastes hand slot). Added by certain enemies/events. Exhaust at end of combat.
117. **Malware**: Cost 0, When drawn, lose 1 energy this turn. Exhaust. Injected by Disruptor Core enemy.
118. **Feedback Noise**: Cost 2, Deal 5 damage to yourself. Cannot be removed from deck without a specific event/relic.
119. **Signal Jammer**: Cost 1, When in hand, all other cards cost +1 this turn. Autoplay: nothing happens. Forces play or suffer.
120. **Overheated Module**: Cost 0, Ethereal (exhaust if not played). If played: gain 3 Static. If exhausted: deal 8 self-damage. Lose-lose but less-lose.

### CD-6. Card Upgrade Paths

121. **Upgrade System**: Each card has an upgraded version (+suffix). Pulse Strike → Pulse Strike+ (1 cost, 8 damage instead of 6).
122. **Branching Upgrades**: Rare cards can upgrade into two variants. Forge Nova → Forge Nova α (4 cost, 25 damage AOE) OR Forge Nova β (2 cost, 14 damage AOE, Exhaust).
123. **Dual Upgrade**: Some uncommon cards can be upgraded twice. Saw Flurry → Saw Flurry+ (5 damage AOE, Draw 1) → Saw Flurry++ (7 damage AOE, Draw 1, -1 cost).
124. **Type Shift Upgrade**: "Reforge" — change a card's waveform type while keeping stats. Pulse Strike → Sine Strike (1 cost, 6 damage, Sine type). Enables custom pattern decks.
125. **Keyword Addition Upgrade**: Pay extra to add Echo, Sustain, or Piercing to any existing card. Cost increases by 1.

---

## Extended Balance & Economy (50 Proposals)

### BE-1. Currency Flow Fixes

The current formulas: `+15` for Forge Burst match, `+20 + floor * 5` per enemy killed, `+150 + floor * 30` for full clear.
Shop prices: commons 40, uncommons 70, rares 110, relics 120, removal 60.

126. **Rebalance Full-Clear Bonus**: `+150 + floor * 30` is very generous. Reduce to `+100 + floor * 20` so shops feel tighter.
127. **No-Damage Floor Bonus**: +25 currency if you take 0 HP damage (after shield) during a floor. Rewards defensive skill.
128. **Turn-Limit Bonus**: Clear floor in ≤ 3 turns: +20 currency. Creates speed-vs-safety tension.
129. **Pattern Completion Bonus**: +5 currency per completed pattern in a floor (beyond just Forge Burst's +15). Stacks.
130. **Diminishing Kill Rewards**: First enemy kill: +25, second: +20, third: +15, etc. Prevents farming low-HP enemies.
131. **Interest System**: Gain +5% currency on unspent balance between floors (cap at +25). Rewards saving.
132. **Currency Loss on Death**: Lose 20% currency on game over. Adds stakes to death.
133. **Bonus Currency Event**: Random "Data Cache" event between floors — gain 40–80 bonus currency.

### BE-2. Shop Improvements

134. **Shop Refresh**: Pay 20 currency to re-roll shop inventory. Max 2 refreshes per shop.
135. **Haggle Mechanic**: 15% chance to get a 20% discount on any item. "Merchant's Favor" relic makes it 40%.
136. **Shop Size Scaling**: Currently `min(3 + floor((floor-1)/2), 6)` cards. Add: guaranteed 1 rare card slot after floor 5.
137. **Bulk Buy Discount**: Buy 3+ items in one shop: get 10% off total. Rewards spending.
138. **Card Preview in Shop**: Show card synergy rating based on current deck composition. UI improvement.
139. **Relic Restock**: If no relics appeal, pay 30 currency to see 2 new relics.
140. **Shop Exclusive Cards**: 3–5 cards only obtainable from shops, not from rewards. "Premium Signal" (1 cost, 9 damage, Pulse), etc.
141. **Layaway System**: Pay 50% now, pay rest next shop visit. Item reserved.
142. **Trade-In**: Trade a card from your deck + 20 currency for a shop card. Combines removal + acquisition.

### BE-3. Enemy HP & Damage Rebalancing

Current: `hpScale = 1 + (floor-1) * 0.25`, `dmgScale = 1 + (floor-1) * 0.15`.
Enemy count: `2 + floor((floor-1) / 4)`.

143. **Soft Cap on Enemy Count**: Max 5 enemies per floor. Currently unbounded for very high floors.
144. **HP Variance**: Add ±15% random HP variation per enemy. Prevents memorized HP breakpoints.
145. **Damage Ramp per Turn**: `getDamage() + floor(turnsAlive * 0.5)`. Enemies get 1 more damage every 2 turns alive. Punishes stalling.
146. **Elite HP Multiplier**: Elites should have `1.5x` the base HP of their tier, not just higher base stats.
147. **Split Damage**: Some enemies deal multiple small hits (3×3 instead of 1×9). Interacts differently with shield.
148. **Critical Hit Chance**: Enemies have 10% chance to deal 1.5x damage. Adds unpredictability. "Stable Field" relic negates crits.
149. **Flee Mechanic**: Low-HP enemies (< 20% HP) may flee, giving reduced rewards. Prevents slow-kill exploitation.

### BE-4. Floor Pacing

150. **Rest Floors**: Every 4th floor is a rest floor — no combat, just healing/shop/events.
151. **Mini-Boss Every 3 Floors**: Floors 3, 6, 9 have a guaranteed elite with +50% rewards. Floor 5, 10 remain full bosses.
152. **Treasure Rooms**: 20% chance per floor for a bonus treasure room — free relic from 3 choices, no cost.
153. **Event System**: Random events between floors (25% chance): moral dilemmas, gambits, NPC encounters.
154. **Floor Preview**: Before entering combat, see enemy types (not exact stats). Allows strategic preparation.
155. **Branch Paths**: After certain floors, choose between 2 paths — one harder with better rewards, one easier.

### BE-5. Starting Deck Balance

Current starter: 4 Pulse Strike, 3 Pulse Tap, 3 Sine Guard, 2 Sine Bridge, 3 Saw Rush, 2 Saw Latch, 2 Noise Spike, 1 Noise Shard (20 cards).

156. **Reduce Starter Size**: 20 cards is large. Reduce to 15 (3 Pulse Strike, 2 Pulse Tap, 2 Sine Guard, 2 Sine Bridge, 2 Saw Rush, 1 Saw Latch, 2 Noise Spike, 1 Noise Shard). Faster deck cycling.
157. **Balanced Type Distribution**: Current: 7 Pulse, 5 Sine, 5 Saw, 3 Noise. Rebalance to 4/4/4/3 for better pattern coverage.
158. **Starter Card Tags**: Mark starter cards as "Basic" — they can be upgraded for free once (one upgrade per shop visit).
159. **Character-Specific Starters**: Different "classes" start with different starter decks. Pulse-heavy, Sine-heavy, Saw-heavy, or Balanced.
160. **Starter Relic**: Always start with 1 common relic chosen from 3. Adds early-game variety.

### BE-6. Card Rarity Distribution

Current shop: rotates common/uncommon/rare by index.

161. **Weight-Based Rarity**: Instead of rotation, use weighted random: 50% common, 35% uncommon, 15% rare. More natural.
162. **Pity Timer for Rares**: If 3 consecutive shops have no rare, guarantee a rare in the next shop.
163. **Floor-Scaled Rarity**: After floor 5, commons drop to 30%, uncommons rise to 45%, rares to 25%. Better late-game cards.
164. **Rarity-Gated Keywords**: Certain keywords only appear at certain rarities. Sustain = uncommon+, Echo = uncommon+, Leech = rare only.

### BE-7. Reward System

165. **Post-Combat Card Reward**: After each floor, choose 1 of 3 random cards to add to your deck (in addition to shop). Separate from shop.
166. **Skip Reward Bonus**: If you skip the card reward, gain +20 currency instead. Rewards deck discipline.
167. **Relic Shards**: Each floor drops 1–3 relic shards. At 10 shards, combine into a random relic. Alternative relic acquisition path.
168. **Score Milestones**: At score thresholds (500, 1500, 3000), gain bonus rewards: currency, heal, or card upgrade.
169. **Kill Streak Bonus**: Kill 3+ enemies in one turn: +30 bonus currency. Rewards AOE strategies.
170. **Floor Par System**: Each floor has a "par" turn count. Beat par: +15 currency. Under par: +30. Over par: no bonus.

### BE-8. Difficulty Modifiers

171. **Selectable Modifiers**: Before run, toggle individual modifiers for score multipliers.
172. **Glass Cannon Mode**: +50% damage dealt, +50% damage taken. Score ×1.3.
173. **Minimalist Mode**: Cannot add cards to deck. Must win with starter + shop removal only. Score ×1.5.
174. **No Relic Mode**: Relics don't appear. Score ×1.4.
175. **Time Pressure Mode**: 30-second turn timer. Score ×1.2.

---

## Extended New Mechanics (50 Proposals)

### NM-1. Status Effect System

Currently no status effects beyond Static. Enemies and players have no buffs/debuffs.

176. **Vulnerable**: Target takes 50% more damage for 2 turns. Applied by certain Saw cards.
177. **Weak**: Target deals 25% less damage for 2 turns. Applied by certain Sine cards.
178. **Bleed**: Target takes 3 damage at start of each turn for N turns. Stacks. Applied by Saw.
179. **Burn**: Target takes 2 damage at end of each turn. Damage doubles each turn. Applied by Noise.
180. **Freeze**: Target skips next attack. One-time. Applied by rare Sine cards.
181. **Empowered**: Player's next card deals +50% damage. One-time buff. Gained from certain card combos.
182. **Fortified**: Player takes 25% less damage for 1 turn. Applied by Sine/shield cards.
183. **Dazed**: Target's next attack is delayed by 1 turn. Applied by Pulse disruption.
184. **Marked**: Target takes +5 damage from all sources for 2 turns. Applied by Noise/static effects.
185. **Haste**: Player gains +1 energy for 1 turn. Applied by tempo threshold (6).
186. **Slow**: Enemy deals 50% damage next turn. Applied by high-tempo plays.
187. **Poisoned**: Target takes scaling damage: 1, then 2, then 3... Doesn't expire naturally, must be cleansed.
188. **Reflect**: Next N damage taken is reflected back at attacker. Applied by rare Sine cards.
189. **Stealth**: Player cannot be targeted for 1 turn (enemies attack randomly or skip). Applied by rare Noise cards.
190. **Berserk**: Player deals +30% damage but cannot gain shield for 1 turn. Self-applied by certain Saw cards.

### NM-2. Waveform Fusion System

191. **Fusion Cards**: Combine 2 waveform types into hybrid cards. Pulse+Sine = "Oscillate" type, Saw+Noise = "Distortion" type.
192. **Fusion Trigger**: Playing a Pulse immediately followed by a Sine triggers "Oscillate Bonus" — deal 5 damage AND gain 5 shield.
193. **Fusion Sequence Slots**: Some sequences require a Fusion type. Must play the two component types back-to-back to match.
194. **Fusion Relic**: "Waveform Combiner" — when you play two different waveforms consecutively, gain 1 tempo bonus.
195. **Saw+Pulse Fusion = "Overdrive"**: Deal damage = sum of both cards' damage, +5. Rewards aggressive sequencing.
196. **Sine+Noise Fusion = "Interference"**: Gain shield = sum of both cards' shield values, reduce Static by 2. Defensive disruption.

### NM-3. Companion/Summon System

197. **Summon Cards**: Rare cards that create a companion entity that persists across turns within combat.
198. **Pulse Drone**: Summoned by "Deploy Drone" (cost 2). Deals 4 damage per turn automatically. HP: 8. Can be targeted by enemies.
199. **Shield Satellite**: Summoned by "Launch Satellite" (cost 2). Grants 3 shield per turn. HP: 6.
200. **Static Sentry**: Summoned by "Static Deploy" (cost 3). Applies 1 Static to all enemies per turn. HP: 10.
201. **Max 2 Summons**: Can only have 2 active companions. Adding a 3rd replaces the oldest.
202. **Companion Upgrade**: Relic "Drone Bay" — companions gain +2 to their per-turn effect.
203. **Enemy Anti-Summon**: Some enemies have "Disable" ability — destroy a random companion.

### NM-4. Zone/Terrain System

204. **Combat Zones**: Each floor has a random "zone" modifier affecting all combatants.
205. **Static Field Zone**: All players and enemies gain +1 Static per turn. Favors anti-static builds.
206. **Amplified Zone**: All damage dealt (by both sides) is +25%. Favors aggressive strategies.
207. **Dampened Zone**: All shield gained is +50%. Favors defensive strategies.
208. **Chaotic Zone**: All card costs are randomized ±1 each turn. Unpredictable but exciting.
209. **Resonant Zone**: Forge Burst bonus is +20 instead of +12. Pattern builds shine.
210. **Corrupted Zone**: 1 Glitch card is injected into deck at start of combat. Tests deck resilience.
211. **Healing Zone**: Heal 2 HP per turn. Easier combat for weaker decks.
212. **Tempo Storm Zone**: Tempo cap is 8 instead of 6. Combo decks thrive.
213. **Silence Zone**: No keywords activate (Echo, Sustain, etc. are disabled). Pure stat combat.
214. **Zone Relic**: "Zone Scanner" — see the next floor's zone before entering. Strategic info advantage.

### NM-5. Sacrifice System

215. **Sacrifice a Card in Hand**: During combat, sacrifice (permanently exhaust) a card from your hand to gain an immediate effect based on rarity.
216. **Common Sacrifice**: Gain 3 shield or 3 damage to target.
217. **Uncommon Sacrifice**: Gain 1 energy or draw 2 cards.
218. **Rare Sacrifice**: Gain 2 energy and draw 2 cards, or deal 15 damage to all enemies.
219. **Sacrifice Counting Relic**: "Altar of Echoes" — for each card sacrificed this combat, all remaining cards deal +2 damage.
220. **Anti-Sacrifice**: "Preservation Field" relic — if you sacrifice 0 cards in a combat, heal 5 HP. Anti-synergy pair.

### NM-6. Risk/Reward Toggle System

221. **Danger Mode Toggle**: During combat, press a button to toggle "Danger Mode" ON/OFF.
222. **Danger ON**: All your cards deal +50% damage/shield, but enemies deal +50% damage. High risk.
223. **Danger OFF**: Normal gameplay. Safe.
224. **Danger Streak**: Staying in Danger Mode for 3+ consecutive turns grants +10 bonus currency.
225. **Danger Relic**: "Adrenaline Core" — in Danger Mode, draw 1 extra card per turn.

### NM-7. Card Crafting System

226. **Component Drops**: Enemies drop "Signal Components" (1–3 per enemy).
227. **Craft Common Card**: 5 components + choose waveform type = random common of that type.
228. **Craft Uncommon Card**: 12 components + 30 currency = choose from 2 random uncommons.
229. **Craft Rare Card**: 25 components + 80 currency = choose from 2 random rares.
230. **Craft Custom Card**: 40 components — set waveform type, choose 1 keyword, set damage/shield within rarity limits. Ultimate customization.
231. **Component Storage**: Components persist across runs (meta-progression). Spend 100 components to permanently unlock a card for all future runs.

### NM-8. Resonance / Affinity System

232. **Waveform Affinity**: Track how many of each waveform type you've played this run. Affinity grows.
233. **Pulse Affinity 10+**: All Pulse cards deal +2 damage permanently for rest of run.
234. **Sine Affinity 10+**: All Sine cards grant +2 shield permanently for rest of run.
235. **Saw Affinity 10+**: All Saw cards draw +1 card permanently (once per turn).
236. **Noise Affinity 15+**: Static threshold +1 permanently. Noise becomes safer.
237. **Max Affinity (25+)**: Unlock an "Ultimate" card for that waveform type. Pulse Ultimate: "Pulse Nova" (0 cost, deal 20 damage, AOE, Exhaust). Only available at high affinity.
238. **Affinity Display**: Show affinity bars on the UI during combat. Players can track their progress.

---

## Extended Enemy Design (50 Proposals)

### ED-1. New Common Enemies

239. **Signal Rat**: 12 HP, 2 damage. On death: inject 1 Glitch card into player's discard. Punishes killing it carelessly.
240. **Pulse Mimic**: 16 HP, 3 damage. Copies the waveform type of your last played card — if you played Pulse, it gains +2 damage. Rewards variety.
241. **Shield Bug**: 10 HP, 1 damage, 4 shield per turn. Low threat but tanky. Tests sustained damage.
242. **Tempo Leech**: 14 HP, 2 damage. Steals 1 tempo from player each turn. Anti-tempo enemy.
243. **Noise Imp**: 8 HP, 4 damage. Dies quickly but hits hard. Glass cannon enemy.
244. **Heal Sprite**: 10 HP, 1 damage, heals all allies for 3 per turn. Priority target.
245. **Static Mite**: 6 HP, 1 damage. On death: +3 Static to player. Small but persistent threat.

### ED-2. New Uncommon Enemies

246. **Phase Walker**: 18 HP, 3 damage. Each turn, 33% chance to phase out (takes 0 damage that turn). Frustrating but manageable.
247. **Signal Thief**: 15 HP, 2 damage. When player plays a card, 20% chance to "steal" the card effect (enemy gains the damage/shield instead). Forces multi-card turns.
248. **Glitch Hound**: 20 HP, 2 damage. Gain +1 damage for each Glitch card in player's deck. Punishes Glitch accumulation.
249. **Overclock Bot**: 16 HP, 2 damage. Enrage: gains +1 damage permanently each turn it survives. Timer enemy.
250. **Dampener**: 14 HP, 2 damage. Aura: player's cards deal -2 damage while this enemy is alive. Must be killed for offensive efficiency.
251. **Echo Disruptor**: 18 HP, 3 damage. Cancel Echo: when player plays an Echo card, the echo portion doesn't trigger. Anti-echo tech.
252. **Splitter**: 20 HP, 3 damage. When reduced below 50% HP, splits into 2 "Half-Splitters" (8 HP, 2 damage each). AOE opportunity.
253. **Curse Caster**: 12 HP, 2 damage. Each turn, adds 1 "Curse" card (unplayable, cost 99) to player's hand. Must be killed ASAP.
254. **Waveform Guardian**: 22 HP, 2 damage. Immune to a random waveform type each turn (displayed via icon). Forces type flexibility.

### ED-3. New Elite Enemies

255. **The Compiler**: 30 HP, 3 damage. Ability: "Compile" — every 3 turns, launches a massive attack (15 damage + AOE). Telegraphed; player must prepare shield.
256. **Mirror Core**: 25 HP, 2 damage. Mirrors the last card type the player played. If player played Saw, Mirror Core deals Saw-type damage (+3 bonus). Punishes repetition.
257. **Gravity Well**: 28 HP, 2 damage. All player shield values are halved while alive. Anti-defense elite.
258. **Time Eater**: 24 HP, 3 damage. If player plays 5+ cards in a turn, Time Eater gains +10 shield and +3 damage next turn. Punishes wide turns.
259. **The Siphon**: 22 HP, 2 damage. Vampiric 50%. Every 2 turns, drains 1 energy from player next turn. Resource pressure.
260. **Null Sentinel**: 35 HP, 4 damage, Armored 3. Takes 3 less damage from all sources. High effective HP. Forces Piercing or multi-hit.
261. **Pattern Lock**: 20 HP, 2 damage. On its turn, locks one slot of the player's target sequence to a specific type (forcing the player to use that type). Anti-pattern elite.
262. **Berserker Drone**: 18 HP, 5 damage. Enrage +2 per turn. No abilities besides raw damage escalation. Strict timer.

### ED-4. New Boss Concepts

263. **The Debugger (Floor 5 Boss)**: 60 HP, 3 damage. Phase 1: Normal attacks. Phase 2 (< 40 HP): "Debug Mode" — heals 5 per turn, scans player hand (reveals all cards). Phase 3 (< 20 HP): "Patch Deployed" — immune to the waveform type player has most of in deck. Forces flexible builds.

264. **The Overwriter (Floor 10 Boss)**: 80 HP, 4 damage, Armored 1. Phase 1: Normal. Phase 2 (< 60 HP): Overwrites 1 random card in player's hand with a Glitch card each turn. Phase 3 (< 30 HP): All Overwrite — converts 2 cards per turn. Race to kill before deck is destroyed.

265. **The Resonator (Floor 15 Boss)**: 100 HP, 5 damage. Unique: Has its own "pattern sequence." When THE BOSS completes its pattern (by attacking with specific damage types over 3 turns), it deals 30 bonus damage. Player must disrupt the boss's pattern by using Freeze, Daze, or killing supporting enemies that generate pattern progress for the boss.

266. **The Infinite Loop (Floor 20 Boss)**: 120 HP, 4 damage, Regen 5. When reduced to 0 HP, revives at 30 HP (max 2 revives). Player must deal enough burst damage to overcome the revive, or use an "Anti-Regen" effect. Three total HP bars: 120 → 30 → 30. Total effective HP: 180.

267. **Dual Boss: Pulse & Noise**: Two bosses at once. Pulse Boss (40 HP, 3 damage) and Noise Boss (40 HP, 3 damage). Pulse Boss shields Noise Boss for 5/turn. Noise Boss applies +2 Static/turn. Killing one enrages the other (+5 damage, +3 damage per turn). Must balance damage or burst one down.

268. **The Architect (Floor 25 Boss)**: 150 HP, 6 damage. Summons walls (10 HP shields in front of it that must be destroyed before boss takes damage). Spawns 2 walls every 3 turns. Has AoE blast that hits player + companions. Phase 2: Spawns mini-enemies instead of walls.

### ED-5. Enemy Ability Expansions

269. **Taunt**: This enemy forces the player to target it (cannot attack other enemies for 1 turn).
270. **Dodge**: 30% chance to completely avoid an incoming attack. Shows "Miss!" feedback.
271. **Counter-Attack**: When hit by player's attack, immediately deals 3 damage back.
272. **Enrage Stack**: Each time hit, gains +1 permanent damage. Track with visual stack counter.
273. **Heal On Kill**: When an ally dies, this enemy heals for 50% of the dead ally's max HP.
274. **Static Aura**: Passive: player gains +1 Static per turn while this enemy is alive. Priority target.
275. **Shield Link**: Two enemies share a shield pool. Damage to one doesn't affect the other's shield.
276. **Sacrifice**: Enemy destroys itself to fully heal an ally and give it +5 damage permanently.
277. **Summon Reinforcement**: Every 4 turns, summon a new common enemy. Max 5 enemies on field.
278. **Berserk Threshold**: When below 25% HP, damage triples. Creates "finish it fast" moments.
279. **Glitch Aura**: All Glitch cards in player's hand deal 2 self-damage at start of turn (not just when played).
280. **Mirror Shield**: 50% of damage dealt to this enemy is reflected back to the player.
281. **Adaptive Armor**: After being hit by a waveform type, gain +3 armor against that type permanently. Forces type variety.
282. **Corrupt Draw**: When this enemy acts, player's next drawn card has 25% chance to be a Glitch instead.
283. **Sequence Scramble**: This enemy randomizes 1 slot of the player's target sequence each turn.

### ED-6. Enemy Visual & Behavioral Patterns

284. **Attack Telegraphing**: All enemies show their next action (attack, shield, special) with an icon above them. 1-turn advance warning.
285. **Intent Variety**: Enemies have 3–5 possible actions weighted by situation. Not purely random or purely patterned.
286. **Desperation Behavior**: At < 20% HP, enemies change behavior — offensive enemies go all-in, defensive enemies turtle harder.
287. **Formation System**: Enemies in back row take -30% damage (front row shields them). Must kill front row first or use AOE.
288. **Enemy Buffs**: Enemies can buff each other visually — glowing aura when empowered by an ally.

---

## Extended Relic Ecosystem (45 Proposals)

### RE-1. Common Relics (Low-Cost, Universal)

289. **Signal Amplifier**: All cards deal +1 damage. Simple and universal.
290. **Waveform Tuner**: First card of each waveform type per turn costs 1 less (extends Oscillator Core to all types). Cost: 80.
291. **Quick Draw Module**: Draw 1 extra card on the first turn of each combat. Cost: 70.
292. **HP Regenerator**: Heal 1 HP per turn during combat. Cost: 90.
293. **Pattern Hint**: Target sequence shows one additional hint (grayed-out next slot preview). Cost: 60.
294. **Scrap Collector**: Gain 3 currency per enemy killed (stacks with normal rewards). Cost: 75.
295. **Shield Chip**: Start each combat with 5 shield. Cost: 65.
296. **Tempo Primer**: Start each combat with 2 tempo. Cost: 70.

### RE-2. Uncommon Relics (Strategic)

297. **Glitch Recycler**: When a Glitch card is exhausted (by Clean Room or naturally), gain 5 shield. Cost: 120.
298. **Sequence Seer**: See the next turn's target sequence in advance. Cost: 130.
299. **Damage Echo**: When you deal 15+ damage in a single card play, deal 5 damage to all other enemies. Cost: 140.
300. **Shield Cascade**: When you gain 10+ shield from a single card, gain 3 additional shield. Cost: 130.
301. **Type Master**: Playing 3 different waveform types in one turn grants +1 energy. Cost: 150.
302. **Burn Fuel**: When you exhaust a card, draw 1. Cost: 140.
303. **Momentum Core**: If you play 4+ cards in a turn, all cards next turn cost 1 less. Cost: 150.
304. **Safe Landing**: After taking lethal damage, survive with 1 HP (once per combat). Cost: 160.
305. **Healing Pulse**: Forge Burst completion heals 3 HP. Cost: 130.
306. **Waveform Diversity Bonus**: If your deck has cards of all 4 waveform types, +3 damage to all cards. Cost: 120.
307. **Echo Chamber**: Echo cards trigger at 75% instead of 50%. Cost: 140.
308. **Saw Sharpener**: Saw cards deal +2 damage. Cost: 110.
309. **Pulse Capacitor**: Pulse cards gain "Draw 1" the first time each is played per combat. Cost: 130.
310. **Noise Filter**: Reduce Static gain from Noise cards by 1 (min 0). Cost: 100.

### RE-3. Rare Relics (Build-Defining)

311. **Infinity Engine**: When you reshuffle your discard pile, draw 2 extra cards. Cost: 200. (Requires reshuffle to be implemented.)
312. **Temporal Anchor**: Tempo doesn't reset at end of turn. Instead, lose 2 tempo per turn (min 0). Cost: 220.
313. **Glitch Forge**: Glitch cards transform into random uncommon cards when drawn. Cost: 250.
314. **Overdrive Protocol**: Once per combat, play a card at 0 energy cost and it triggers twice. Cost: 240.
315. **Pattern Mastery**: Completing a sequence draws 1 card and grants +4 shield in addition to normal Forge Burst bonus. Cost: 200.
316. **Void Harvester**: Exhausted cards grant +2 permanent damage to all cards for the rest of combat. Cost: 230.
317. **Boss Slayer**: Deal +25% damage to elite and boss enemies. Cost: 200.
318. **Static Heart**: Convert Static to energy at a 3:1 ratio at start of each turn (consuming the Static). Cost: 250.
319. **Life Forge**: At start of each floor, gain +3 max HP permanently. Cost: 280.
320. **Dual Wield**: The first card you play each turn triggers twice (same energy cost). Cost: 260.
321. **Gambler's Die**: All random effects have +30% chance to highroll. Cost: 200. (Requires volatile/gamble cards.)
322. **Unstoppable Force**: Your attacks cannot be reduced by enemy Armored. Cost: 220.

### RE-4. Cursed Relics (Powerful with Drawbacks)

323. **Demon Core**: +2 energy per turn, but take 5 damage at start of each combat. Cost: 0 (given for free).
324. **Shattered Mirror**: All card effects are doubled, but enemy damage is also doubled. Cost: 50.
325. **Chaos Seed**: At start of each turn, a random card in hand transforms into a random card of different rarity. Unpredictable. Cost: 30.
326. **Blood Pact**: +1 energy per turn, but max HP is permanently reduced by 10. Cost: 0 (offered as event).
327. **Overclocked Processor**: Draw 2 extra cards per turn, but Static threshold reduced by 2. Cost: 80.
328. **Dark Insight**: See all enemy intents, but enemies deal +2 damage. Cost: 40.
329. **Venomous Core**: All your attacks apply 2 Poison, but you also take 1 Poison per turn. Cost: 60.

### RE-5. Boss-Drop Relics

330. **Modulator's Core** (from The Modulator): Gain Regen 1 in all future combats. Heal 1 HP per turn.
331. **Fault Line Crystal** (from The Fault): Glitch cards in hand can be discarded for free (don't take self-damage from Feedback Loop).
332. **Debugger's Lens** (from The Debugger): See the top 3 cards of your draw pile at all times.
333. **Overwriter's Pen** (from The Overwriter): Once per combat, transform a card in hand into any card you've ever owned.

### RE-6. Relic Event Interactions

334. **Relic Synergy Bonus**: Owning 3+ relics of the same category (common/uncommon/rare) grants a passive bonus. 3 commons: +5 max HP. 3 uncommons: +1 draw. 3 rares: +1 energy.
335. **Relic Sacrifice Event**: Between-floor event: sacrifice a relic to heal to full HP and gain 50 currency.
336. **Relic Upgrade Event**: Rare event: upgrade a common relic to uncommon tier (improved stats).
337. **Relic Shop**: Dedicated relic shop appears every 5 floors with 5 relics to choose from (separate from regular shop).

---

## Extended Meta-Progression (45 Proposals)

### MP-1. Achievement System

338. **Floor Milestones**: Reach floor 5, 10, 15, 20, 25 — each unlocks a new card pool or relic.
339. **Card Mastery**: Play a card 50 times across runs → unlock its upgraded version permanently in the card pool.
340. **Enemy Bestiary**: Defeat each enemy type 10 times → unlock lore entry and a small permanent bonus (+1 HP per bestiary entry completed).
341. **Pattern Perfectionist**: Complete 100 Forge Burst patterns across all runs → permanent +2 Forge Burst damage.
342. **Static Survivor**: Survive 50 Glitch card injections across all runs → unlock "Glitch Immunity" starter relic option.
343. **Speedrunner**: Clear floor 10 in under 15 minutes → unlock "Chrono Core" relic (turns have +1 energy every 3rd turn).
344. **Pacifist Turn**: Win a combat without playing any damage cards in at least one turn → unlock "Patience" card (0 cost, gain 10 shield, draw 2).
345. **Perfect Floor**: Clear a floor taking 0 damage → unlock "Perfection" badge and +5 starting currency in future runs.
346. **Relic Collector**: Own 10+ relics in a single run → unlock "Collector's Vault" (start future runs with 1 extra relic choice).
347. **Deck Architect**: Win a run with ≤ 12 cards in deck → unlock "Efficiency Expert" achievement and a permanent +1 draw first turn.
348. **Marathon Runner**: Survive 30+ floors in a single run → unlock Endless Mode leaderboard.
349. **Type Specialist**: Win a run where 70%+ of cards are one waveform type → unlock type-specific "Mastery" cards.

### MP-2. Permanent Upgrades (Across Runs)

350. **Starting HP Upgrades**: Spend meta-currency to permanently increase starting HP (40 → 42 → 44 → ... → 50). 5 upgrade tiers.
351. **Starting Currency**: Spend meta-currency to start runs with 10/20/30 bonus currency. 3 tiers.
352. **Starting Relic Choices**: Spend meta-currency to increase starting relic options from 0 → 1 → 2 → 3. 3 tiers.
353. **Card Pool Expansion**: Each meta-currency tier unlocks 3 new cards in the general card pool. 10 tiers = 30 new cards.
354. **Shop Discount**: Permanent 5%/10%/15% shop discount. 3 tiers.
355. **Healing Boost**: Between-floor healing increases from 25% → 28% → 30% → 33%. 3 tiers.
356. **Extra Shop Slot**: Shops show +1/+2 extra cards. 2 tiers.
357. **Map Vision**: Unlock floor preview (see enemy types before entering). 1 tier.
358. **Starter Deck Choices**: Unlock alternative starter decks. Each requires winning with a specific archetype.

### MP-3. Meta-Currency System

359. **Signal Shards**: Primary meta-currency. Earn 1 per floor cleared, 5 per boss killed, 10 for run completion.
360. **Bonus Shards**: +2 shards for no-damage floors, +3 for under-par clears, +5 for first-time boss kills.
361. **Shard Spending**: Spend at "The Forge" menu — permanent upgrades, card unlocks, cosmetic unlocks.
362. **Weekly Bonus**: First run each day earns 2x shards. First run each week earns 5x shards. Encourages return play.
363. **Prestige System**: After buying all permanent upgrades, "Prestige" to reset upgrades and gain a cosmetic crown + 1.1x shard earning rate. Repeatable.

### MP-4. Character/Class System

364. **Engineer Class**: Starts with Pulse-heavy deck. Passive: first Pulse each turn costs 0 (built-in Oscillator Core). Unlocked by default.
365. **Guardian Class**: Starts with Sine-heavy deck. Passive: shield persists between turns at 50% (weaker Sine Loom). Unlocked at floor 10.
366. **Berserker Class**: Starts with Saw-heavy deck. Passive: +2 damage to all attacks, +1 damage taken. Unlocked by winning with 0 Sine cards in deck.
367. **Hacker Class**: Starts with Noise-heavy deck. Passive: Glitch cards cost 0 and deal 5 damage. Static threshold +2. Unlocked by clearing floor 15.
368. **Wildcard Class**: Starts with balanced deck + 3 Wildcard cards. Passive: sequence always has 1 wildcard slot. Unlocked by winning with all 4 waveform types equally represented.
369. **Reaper Class**: Starts with 30 HP, +1 energy per turn. Passive: Leech 20% on all attacks. Unlocked by winning with ≤ 20 HP remaining.
370. **Each Class Has Unique Cards**: 3 class-exclusive cards that can only be found in that class's card pool. Adds variety across classes.

### MP-5. Challenge Run System

371. **Daily Challenge**: Fixed seed, fixed starting conditions. Global leaderboard. Resets daily.
372. **Weekly Challenge**: Specific modifier set (e.g., "All enemies have Thorns 3" + "Cards cost 1 less" + "No healing between floors"). Different challenge each week.
373. **Custom Challenge**: Player selects from 20+ modifiers to create custom challenge. Share challenge code with friends.
374. **Ironman Mode**: No save/load. If you close the game, run is lost. Hardcore.
375. **Boss Rush**: Skip normal floors. Fight boss after boss (floor 5, 10, 15, 20 bosses in sequence). Start with 5 random relics and 15 random cards added to deck.
376. **Draft Mode**: Before run starts, draft 15 cards one-at-a-time from random offerings. No shop during run. What you draft is what you get.
377. **Mirror Match**: Fight AI versions of top leaderboard players' decks. Learn from the best.
378. **Sealed Deck**: Start with 30 random cards. No card additions. Only removal/upgrades available. Test adaptability.

### MP-6. Cosmetic Rewards

379. **Card Skins**: Alternate art for favorite cards. Earned through achievements or meta-currency.
380. **Card Back Designs**: Custom card back patterns. Earned by reaching floor milestones.
381. **Enemy Death Animations**: Custom particle effects when enemies die. Earned by killing X enemies of that type.
382. **Canvas Themes**: Different background themes for the combat canvas (neon, retro, dark, nature). Earned by completing runs.
383. **Sound Packs**: Different sound effects for card plays, attacks, and Forge Burst. Cosmetic only.
384. **Title/Badge Display**: Show achievements and titles on leaderboard profile. Social prestige.

### MP-7. Endless Mode Details

385. **Infinite Scaling**: After floor 20, enemies gain +10% stats per floor. No cap. Test your limits.
386. **Endless-Only Relics**: 5 relics only available in Endless Mode. "Infinite Core" — gain +1 max HP per floor. "Eternal Echo" — Echo triggers at 100%.
387. **Milestone Rewards**: Every 5 floors in Endless, choose from 3 powerful blessings (heal to full, +2 energy for 5 floors, double damage for 3 floors).
388. **Endless Leaderboard**: Separate leaderboard for highest floor reached in Endless Mode.
389. **Corruption Mechanic in Endless**: After floor 30, corruption slowly increases each floor. Forces eventual death but rewards pushing further.
390. **Scaling Shop**: In Endless Mode, shops appear every 3 floors instead of every floor. Limited resources increase tension.

### MP-8. Social & Community Features

391. **Run Replays**: Record and share run replays. Others can watch your strategy.
392. **Deck Sharing**: Export deck code (relic + card list). Others can import for custom challenge.
393. **Community Challenges**: Weekly community goal — "collectively defeat 10,000 bosses" → everyone earns bonus shards.
394. **Friends List Integration**: See friends' best scores and current runs on the leaderboard.
395. **Tournaments**: Monthly tournaments with fixed seeds and special rules. Top players earn exclusive cosmetics.

---

## Extended UI/UX Proposals (25 Proposals)

### UX-1. Information Display

396. **Damage Preview**: Hovering over "End Turn" shows preview of total damage you'll deal and total damage enemies will deal.
397. **Enemy Intent Icons**: Show what each enemy will do next turn (attack, shield, buff, special) with clear icons.
398. **Card Tooltip Enhancement**: Show effective damage after relic/tempo/static bonuses, not just base stats.
399. **Deck Viewer**: In-combat button to view full deck, discard pile, and exhaust pile. See card counts and composition.
400. **Sequence Helper**: Highlight cards in hand that match the next needed sequence slot. Reduce cognitive load.
401. **Relic Tooltip on Hover**: Hover over relic icons to see full description and current activation count.
402. **Turn Counter Display**: Show current turn number prominently. Useful for tracking sequence length scaling.
403. **Run Stats Panel**: Track cards played, damage dealt, damage taken, patterns completed, etc. View anytime.

### UX-2. Quality of Life

404. **Undo Last Card**: Allow unplaying the last card if it had no irreversible effects (already partially implemented via `unplayCard()`). Extend to cover more cases.
405. **Auto-End Turn**: Option to automatically end turn when all energy is spent and no 0-cost cards remain.
406. **Speed Settings**: 1x, 2x, 3x animation speed for enemy turns and damage resolution.
407. **Card Sorting**: Sort hand by cost, type, or damage. Toggle between sort modes.
408. **Favorite Cards**: Mark cards as "favorite" in collection view. Favorites appear first in deck viewer.
409. **Skip Animations**: Hold spacebar to skip all combat animations for experienced players.
410. **Keyboard Shortcuts**: Number keys 1–5 to play cards from hand positions. Q to end turn. Tab to cycle targets.

### UX-3. Tutorial & Onboarding

411. **Interactive Tutorial**: First-time players play a scripted 3-turn combat teaching card play, patterns, and energy.
412. **Keyword Glossary**: In-game glossary explaining all keywords (Echo, Sustain, AOE, etc.) accessible from any screen.
413. **Strategy Tips**: Loading screen tips about synergies, pattern matching, and deck building.
414. **Difficulty Recommendation**: After first game over, suggest difficulty adjustment based on floor reached.

### UX-4. Accessibility

415. **Colorblind Mode**: Use patterns/icons in addition to colors for waveform types. Works for all types of color blindness.
416. **Screen Reader Support**: ARIA labels on all interactive elements for screen reader compatibility.
417. **Large Text Mode**: Increase all text by 150%. Canvas text scales accordingly.
418. **Reduced Motion**: Option to disable particle effects, screen shake, and card animations.
419. **One-Handed Mode**: All controls accessible via mouse only (no keyboard required). Already mostly true but ensure all modals work.
420. **High Contrast Mode**: Enhanced contrast between UI elements, especially card borders and enemy HP bars.

---

## Detailed Card Stat Blocks — Full Implementation Reference

> Complete stat blocks for every proposed new card, ready for implementation in `Card.ts`.
> Format matches the existing `CardTemplate` interface: `{ name, type, rarity, cost, damage, shield, keywords[], description }`.

### Common Cards — Full Stat Blocks

| # | Name | Type | Cost | Damage | Shield | Keywords | tempoGain | staticGain | staticReduce | draw | stabilize | glitchGen | selfDamage | Description |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 76 | Pulse Echo | pulse | 1 | 5 | 0 | echo | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Deal 5 damage. Echo. |
| 77 | Sine Pulse | sine | 0 | 0 | 4 | — | 1 | 0 | 0 | 0 | 0 | 0 | 0 | Gain 4 shield. +1 Tempo. |
| 78 | Saw Blitz | saw | 1 | 4 | 0 | chain | 0 | 0 | 0 | 1 | 0 | 0 | 0 | Deal 4 damage. Draw 1. Chain. |
| 79 | Noise Tap | noise | 0 | 3 | 0 | — | 2 | 1 | 0 | 0 | 0 | 0 | 0 | Deal 3 damage. +1 Static. +2 Tempo. |
| 80 | Pulse Guard | pulse | 1 | 3 | 5 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Deal 3 damage. Gain 5 shield. |
| 81 | Sine Weave | sine | 1 | 0 | 6 | stabilize | 0 | 0 | 0 | 0 | 1 | 0 | 0 | Gain 6 shield. Stabilize 1. |
| 82 | Saw Edge | saw | 1 | 7 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Deal 7 damage. |
| 83 | Noise Burst | noise | 1 | 6 | 0 | — | 0 | 2 | 0 | 0 | 0 | 0 | 0 | Deal 6 damage. +2 Static. |

**Balance Notes for Commons:**
- Pulse Echo (#76): 5 dmg + 2.5 echo = 7.5 effective for 1 energy. Slightly above Pulse Strike (6 for 1) due to echo being delayed/conditional. Fair at common.
- Sine Pulse (#77): 0-cost with 4 shield + 1 tempo. Comparable to Pulse Tap (0 cost, 3 dmg). Defensive equivalent.
- Saw Blitz (#78): 4 dmg + draw 1 for 1 energy. Card-neutral play. Chain keyword makes next same-type -1 cost. Strong card-flow common.
- Noise Tap (#79): 0-cost, 3 dmg, +1 static, +2 tempo. High tempo gain but risky static. Fills the "tempo filler" role.
- Pulse Guard (#80): Hybrid 3/5 for 1 energy. Total value = 8, split. Comparable to existing 1-cost commons.
- Sine Weave (#81): 6 shield + stabilize 1 for 1 energy. Defensive utility. Comparable to Sine Bridge (1 cost, 4 shield, draw 1).
- Saw Edge (#82): Pure damage 7 for 1. Slightly above Pulse Strike (6/1). Saw has fewer defensive options so this is fair.
- Noise Burst (#83): 6 dmg + 2 static for 1. High output with high risk. The 2 static makes this a glass-cannon common.

### Uncommon Cards — Full Stat Blocks

| # | Name | Type | Cost | Damage | Shield | Keywords | tempoGain | staticGain | staticReduce | draw | stabilize | glitchGen | selfDamage | Special |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 84 | Resonant Strike | pulse | 2 | 10 | 0 | growing | 0 | 0 | 0 | 0 | 0 | 0 | 0 | +2 dmg each play this combat |
| 85 | Frequency Lock | sine | 1 | 0 | 8 | retain | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Stays in hand between turns |
| 86 | Razor Cascade | saw | 2 | 6 | 0 | ricochet | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 50% dmg to random other enemy |
| 87 | Static Primer | noise | 1 | 4 | 0 | — | 0 | 3 | 0 | 1 | 0 | 0 | 0 | Draw 1. +3 Static. |
| 88 | Phase Strike | pulse | 1 | 7 | 0 | piercing | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Ignores Armored |
| 89 | Harmonic Shell | sine | 2 | 0 | 10 | sustain | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Returns to hand |
| 90 | Buzzsaw | saw | 2 | 5 | 0 | multihit(2) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Hits twice (5×2=10 total) |
| 91 | Interference | noise | 1 | 0 | 0 | stabilize | 0 | 0 | 0 | 0 | 1 | 0 | 0 | +4 Static to enemy. Stabilize 1. |
| 92 | Signal Boost | pulse | 1 | 0 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | All Pulse in hand +4 dmg this turn |
| 93 | Barrier Shift | sine | 1 | 0 | 6 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Convert shield→dmg on target, gain 6 |
| 94 | Serrated Edge | saw | 1 | 6 | 0 | bleed(2) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | +3 dmg/turn for 2 turns |
| 95 | White Noise | noise | 2 | 0 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Dmg = Static × 3 |
| 96 | Echo Cascade | pulse | 2 | 8 | 0 | echo | 2 | 0 | 0 | 0 | 0 | 0 | 0 | Echo. +2 Tempo. |
| 97 | Sine Reflection | sine | 1 | 0 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Shield = dmg taken last turn (min 5) |
| 98 | Saw Tempest | saw | 2 | 6 | 0 | aoe | 0 | 0 | 0 | 1 | 0 | 0 | 0 | AOE. Draw 1. |
| 99 | Chaos Theory | noise | 1 | 0 | 0 | volatile | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3–12 dmg, draw 0–2 |

**Balance Notes for Uncommons:**
- Resonant Strike (#84): Starts at 10/2, but grows +2 every play. By 5th play: 18/2. Incredible sustain value. 2-cost makes it a commitment.
- Frequency Lock (#85): 8 shield for 1 that stays in hand. Essentially free defense every turn. Powerful but costs a hand slot permanently.
- Razor Cascade (#86): 6 + 3 splash = 9 effective for 2. Below curve until fighting 2+ enemies, then efficient.
- Static Primer (#87): 4 dmg + draw 1 for 1 energy = card-neutral, but +3 static is very high. Risk card.
- Phase Strike (#88): 7 piercing for 1. Against Armored 2 enemies, effectively 9 value. Anti-tank tech.
- Harmonic Shell (#89): 10 shield sustain for 2. Infinite defense engine. Must be balanced by opportunity cost of 2 energy/turn.
- Buzzsaw (#90): 5×2 = 10 total for 2. Against 4-shield enemy: 1+1=2 after shield. Multi-hit has strategic value vs shields.
- White Noise (#95): At 4 Static = 12 dmg for 2 energy. At 8 Static = 24 dmg. Scales explosively. High-skill card.

### Rare Cards — Full Stat Blocks

| # | Name | Type | Cost | Damage | Shield | Keywords | Special Effect |
|---|---|---|---|---|---|---|---|
| 100 | Omega Pulse | pulse | 3 | 25 | 0 | echo, exhaust | Echo (25+12=37 total), one-time use |
| 101 | Absolute Zero | sine | 3 | 0 | 30 | freeze | Freeze all enemies (skip their next attack) |
| 102 | Final Cut | saw | 2 | 0 | 0 | exhaust | Dmg = (cards played this turn) × 8 |
| 103 | Entropy Bomb | noise | 3 | 0 | 0 | exhaust | Dmg = Static × 8, reset Static to 0 |
| 104 | Pattern Forge | wild | 2 | 8 | 0 | wildcard | Fills current + next sequence slot |
| 105 | Perpetual Engine | pulse | 1 | 4 | 0 | sustain | Draw 1. Sustain. Infinite value. |
| 106 | Void Shield | sine | 2 | 0 | 15 | persist | Shield persists if unbroken at end of turn |
| 107 | Chain Lightning | saw | 2 | 12 | 0 | cascade | 12→8→4 across up to 3 enemies |
| 108 | Glitch Exploit | noise | 0 | 0 | 0 | exhaust | All Glitch in hand deal 8 dmg each |
| 109 | Harmonic Conv. | wild | 3 | 0 | 0 | aoe | 5 dmg per unique waveform played this turn, AOE |
| 110 | Recursion | pulse | 2 | 0 | 0 | — | Copy last card's effects |
| 111 | Shield Nova | sine | 3 | 0 | 0 | aoe | Dmg = current shield, AOE, keep shield |
| 112 | Blade Storm | saw | 3 | 4 | 0 | — | Hit random enemies (tempo) times |
| 113 | System Crash | noise | 2 | 0 | 0 | exhaust | 5 dmg per Static, AOE, reset, draw 2 |
| 114 | Time Warp | wild | 4 | 0 | 0 | exhaust | Take an extra turn (no energy regen) |
| 115 | Adaptive Protocol | wild | 1 | 0 | 0 | modal | Choose: 12 dmg, 14 shd, draw 3, or stab 3 |

**Rare Balance Analysis:**
- Omega Pulse (#100): 3 cost, 37 total damage (echo), Exhaust. Compare to Forge Nova (3 cost, 18 AOE). This is single-target but 2x damage. Exhaust balances the power.
- Absolute Zero (#101): 3 cost, 30 shield + freeze all. Extremely powerful defensive turn. Freeze effectively blocks 1 full attack cycle from all enemies. Cost 3 makes it the entire turn's energy investment.
- Final Cut (#102): At 3 cards played = 24 dmg for 2 cost. At 5 cards = 40 dmg. Rewards engine/tempo builds but needs setup.
- Entropy Bomb (#103): At 4 Static = 32 dmg for 3 cost. At 8 Static = 64 dmg. Game-winning payoff for Static Embrace archetype. Exhaust prevents abuse.
- Perpetual Engine (#105): 4 dmg + draw 1 + Sustain for 1 cost. This is the strongest engine card. Each turn it replaces itself and deals 4. Over 5 turns = 20 dmg + 5 draws for 5 energy. Should be one of the rarest drops.
- Time Warp (#114): Extra turn for 4 energy. You need Energy Conduit or similar to have energy to use on the bonus turn. Extremely powerful but costs your entire normal turn.

---

## Complete Archetype Decklists (6 Full Builds)

### Archetype 1: "Tempo Rush" — Play Many Cheap Cards

**Core Strategy:** Reach max tempo every turn for damage bonuses and card draw.

**Ideal Deck (15 cards):**

| Card | Cost | Type | Purpose |
|---|---|---|---|
| Pulse Tap × 2 | 0 | Pulse | Free damage + tempo |
| Noise Tap × 2 | 0 | Noise | Free damage + 2 tempo |
| Saw Latch × 2 | 1 | Saw | 4 dmg + 2 tempo |
| Pulse Repeater × 2 | 1 | Pulse | 4 dmg + 3 tempo |
| Noise Bloom × 1 | 2 | Noise | 7 dmg + 2 tempo |
| Sine Pulse × 2 | 0 | Sine | 4 shield + 1 tempo |
| Overdrive Coil × 1 | 0 | Pulse | 2 dmg + echo |
| Blade Storm × 1 | 3 | Saw | 4 × tempo hits |
| Final Cut × 1 | 2 | Saw | Cards played × 8 dmg |
| Saw Rush × 1 | 1 | Saw | 5 dmg + draw 1 |

**Key Relics:**
- Tempo Primer (start with 2 tempo)
- Temporal Anchor (tempo decays instead of resetting)
- Energy Conduit (+1 energy/turn)
- Momentum Core (4+ cards → cost reduction next turn)

**Turn Example (Floor 5):**
1. Start: 4 energy (3 base + Energy Conduit), 2 tempo (Tempo Primer)
2. Play Pulse Tap (0 cost): 3 dmg, tempo → 3
3. Play Noise Tap (0 cost): 3 dmg, tempo → 6 (MAX)
4. Play Saw Latch (1 cost): 4 dmg, tempo already max
5. Play Pulse Repeater (1 cost): 4 dmg, tempo already max
6. Play Final Cut (2 cost): 5 cards played × 8 = 40 dmg
7. End Turn: Total damage = 54 + forge burst + tempo bonuses

**Strengths:** Massive single-turn damage, consistent pattern completion
**Weaknesses:** Low shield, vulnerable to Static (many same-type cards), needs specific relic setup

---

### Archetype 2: "Shield Fortress" — Stack Defense, Convert to Offense

**Core Strategy:** Build massive shield, use shield-to-damage conversion for burst.

**Ideal Deck (14 cards):**

| Card | Cost | Type | Purpose |
|---|---|---|---|
| Sine Guard × 2 | 1 | Sine | 7 shield baseline |
| Sine Barrier × 2 | 2 | Sine | 14 shield each |
| Harmonic Shell × 1 | 2 | Sine | 10 shield, Sustain |
| Frequency Lock × 2 | 1 | Sine | 8 shield, Retain |
| Sine Bridge × 1 | 1 | Sine | 4 shield + draw 1 |
| Void Shield × 1 | 2 | Sine | 15 persistent shield |
| Shield Nova × 1 | 3 | Sine | Shield → AOE dmg |
| Pulse Guard × 1 | 1 | Pulse | 3 dmg + 5 shield |
| Saw Anchor × 1 | 2 | Saw | 8 dmg + 4 shield |
| Phase Strike × 1 | 1 | Pulse | 7 piercing dmg |

**Key Relics:**
- Sine Loom (shield persists between turns)
- Shield Battery (+2 shield/turn)
- Shield Cascade (+3 shield on 10+ gain)
- Shield Chip (start with 5 shield)

**Gameplay Pattern:**
- Turns 1-2: Stack shield (Sine Guard × 2 + Sine Barrier = 7+7+14 = 28 shield)
- Turn 3: With Sine Loom, shield persists. Add more shield + play Shield Nova for 28+ AOE damage
- Turn 4+: Harmonic Shell (Sustain) provides 10 shield/turn forever. Frequency Lock provides 8 from hand.
- Late game: 40-60 shield each turn, Shield Nova for 40-60 AOE damage per use

**Strengths:** Extremely tanky, good against multi-enemy fights (Shield Nova AOE)
**Weaknesses:** Slow ramp, poor against pierce enemies, very Sine-heavy (Static risk)

---

### Archetype 3: "Static Embrace" — Weaponize the Glitch System

**Core Strategy:** Intentionally build Static for massive Static-scaled damage, use Glitch synergy cards.

**Ideal Deck (16 cards):**

| Card | Cost | Type | Purpose |
|---|---|---|---|
| Noise Spike × 2 | 2 | Noise | 9 dmg + 1 static |
| Noise Shard × 2 | 1 | Noise | 5 dmg + 1 glitch |
| Noise Bloom × 2 | 2 | Noise | 7 dmg + 2 tempo |
| Static Primer × 2 | 1 | Noise | 4 dmg + 3 static + draw 1 |
| Noise Burst × 2 | 1 | Noise | 6 dmg + 2 static |
| White Noise × 1 | 2 | Noise | Static × 3 dmg |
| Entropy Bomb × 1 | 3 | Noise | Static × 8 dmg, exhaust |
| System Crash × 1 | 2 | Noise | 5/static, AOE, exhaust |
| Glitch Exploit × 1 | 0 | Noise | Glitch cards deal 8 dmg each |
| Sine Guard × 1 | 1 | Sine | 7 shield for defense |
| Noise Cancel × 1 | 1 | Noise | −2 static, stabilize 1 (safety valve) |

**Key Relics:**
- Fault Lens (+10 currency per Glitch — profit from chaos)
- Stability Core (+2 threshold — survive longer)
- Static Heart (convert Static to energy 3:1)
- Noise Filter (reduce Noise static gain by 1)

**Turn Example (Peak Static):**
1. Turn 1-2: Build Static with Noise Burst × 2 + Static Primer × 1 = +7 Static total
2. Turn 3: Static at 7+. Play White Noise: 7 × 3 = 21 damage for 2 energy
3. Turn 4: Static at 10+ from enemy staticPulse. Play Entropy Bomb: 10 × 8 = 80 damage. Reset to 0.
4. Emergency: If too many Glitches, play Glitch Exploit: each Glitch deals 8 damage instead

**Strengths:** Explosive burst damage (80+ single card), rewards understanding Static system
**Weaknesses:** Self-destructive if poorly managed, needs specific cards/relics, Glitch cards clog hand

---

### Archetype 4: "Echo Engine" — Compound Repeated Effects

**Core Strategy:** Stack Echo cards for repeated damage, use Echo amplifiers for 100%+ echo values.

**Ideal Deck (13 cards):**

| Card | Cost | Type | Purpose |
|---|---|---|---|
| Overdrive Coil × 2 | 0 | Pulse | 2 dmg + echo (= 3 total) |
| Resonance Pulse × 2 | 1 | Pulse | 5 dmg + echo (= 7.5 total) |
| Echo Cascade × 2 | 2 | Pulse | 8 dmg + echo + 2 tempo |
| Pulse Echo × 2 | 1 | Pulse | 5 dmg + echo |
| Omega Pulse × 1 | 3 | Pulse | 25 dmg + echo, exhaust |
| Sine Bridge × 1 | 1 | Sine | 4 shield + draw 1 |
| Sine Guard × 2 | 1 | Sine | Baseline defense |
| Saw Rush × 1 | 1 | Saw | 5 dmg + draw 1 |

**Key Relics:**
- Echo Chamber (echo at 75% instead of 50%)
- Echo Node (draw 1 on Forge Burst)
- Oscillator Core (first Pulse costs 0)
- Harmonic Resonator (+4 dmg for waveform pairs)

**With Echo Chamber (75%):**
- Overdrive Coil: 2 + 1.5 = 3.5 for 0 cost
- Resonance Pulse: 5 + 3.75 = 8.75 for 1 cost
- Echo Cascade: 8 + 6 = 14 for 2 cost
- Omega Pulse: 25 + 18.75 = 43.75 for 3 cost (exhaust)

**With Proposed "Double Echo" relic (100%):**
- Overdrive Coil: 2 + 2 = 4 for 0 cost
- Echo Cascade: 8 + 8 = 16 for 2 cost
- Omega Pulse: 25 + 25 = 50 for 3 cost (!!)

**Strengths:** High consistent damage, good with Pulse-heavy pattern matching
**Weaknesses:** Almost entirely Pulse type (high Static), minimal defense, needs Echo relics

---

### Archetype 5: "Exhaust Burst" — One-Shot Everything

**Core Strategy:** Play powerful Exhaust cards for massive single turns, use Exhaust payoffs.

**Ideal Deck (18 cards, but they exhaust down to ~10):**

| Card | Cost | Type | Purpose |
|---|---|---|---|
| Razor Edge × 2 | 1 | Saw | 8 dmg, exhaust |
| Overclock × 2 | 0 | Pulse | 5 dmg, echo, exhaust |
| Signal Drain × 1 | 2 | Noise | 10 dmg, leech 50%, exhaust |
| Omega Pulse × 1 | 3 | Pulse | 25 dmg, echo, exhaust |
| Forge Nova × 1 | 3 | Pulse | 18 dmg AOE |
| Entropy Bomb × 1 | 3 | Noise | Static × 8, exhaust |
| System Crash × 1 | 2 | Noise | 5/static AOE, exhaust |
| Sine Guard × 2 | 1 | Sine | Defense baseline |
| Sine Barrier × 1 | 2 | Sine | 14 shield for survival |
| Saw Rush × 2 | 1 | Saw | 5 dmg + draw 1 |
| Pulse Tap × 2 | 0 | Pulse | Free damage filler |
| Saw Anchor × 1 | 2 | Saw | 8 dmg + 4 shield |

**Key Relics:**
- Void Harvester (+2 permanent dmg per exhaust this combat)
- Burn Fuel (draw 1 when you exhaust)
- Coil Capacitor (+1 energy at combat start)

**Gameplay Pattern:**
- Turn 1: Play Razor Edge × 2 + Overclock × 2 = 8+8+5+5 = 26 dmg, exhaust 4 cards. Void Harvester: +8 permanent dmg.
- Turn 2: All remaining cards deal +8 base damage. Remaining deck is clean.
- Turn 3+: Fewer cards but each is stronger. Play Forge Nova for 18+8 = 26 AOE.
- Omega Pulse: 25+8 = 33 + echo = 49.5 total. Game-ending.

**Strengths:** Insane early burst, deck thins itself, Void Harvester stacking
**Weaknesses:** Deck shrinks fast, limited options in long fights, dead post-exhaust

---

### Archetype 6: "Pattern Master" — Forge Burst Every Turn

**Core Strategy:** Consistently complete patterns every turn using wildcards and type diversity.

**Ideal Deck (12 cards):**

| Card | Cost | Type | Purpose |
|---|---|---|---|
| Wildcard × 2 | 1 | Wild | 3 dmg, any pattern slot |
| Pattern Forge × 1 | 2 | Wild | 8 dmg, double pattern fill |
| Adaptive Protocol × 1 | 1 | Wild | Modal — choose based on need |
| Pulse Strike × 2 | 1 | Pulse | 6 dmg, Pulse for pattern |
| Sine Guard × 2 | 1 | Sine | 7 shield, Sine for pattern |
| Saw Rush × 2 | 1 | Saw | 5 dmg + draw 1, Saw for pattern |
| Noise Spike × 1 | 2 | Noise | 9 dmg, Noise for pattern |
| Sine Bridge × 1 | 1 | Sine | 4 shield + draw 1 |

**Key Relics:**
- Phase Shifter (random slots become wildcard — easier patterns)
- Pattern Mastery (completing sequence draws 1 + 4 shield)
- Echo Node (draw 1 on Forge Burst)
- Healing Pulse (Forge Burst heals 3 HP)

**Turn-by-Turn Flow:**
- Every turn: play 2–3 cards matching the sequence → Forge Burst (+12 bonus, +50 score, +15 currency)
- Pattern Mastery: +1 draw and +4 shield per burst
- Echo Node: +1 draw per burst
- Healing Pulse: +3 HP per burst
- Net per burst: +12 dmg, +4 shield, +2 draws, +3 HP, +50 score, +15 currency

**Strengths:** Incredibly consistent, self-sustaining (heals, draws, shields every turn)
**Weaknesses:** Low peak damage, needs specific relics, struggles vs high-HP single enemies

---

## Complete Enemy AI Behavior Scripts

> Detailed turn-by-turn AI patterns for each proposed enemy.

### Common Enemy AI

**Signal Rat (#239):**
```
EVERY TURN:
  action = ATTACK (base damage)
ON DEATH:
  inject 1 Glitch card (70% Static Burst, 30% Feedback Loop) into player discard
  IF player has Fault Lens: award +10 × count currency
```

**Pulse Mimic (#240):**
```
ON PLAYER CARD PLAY:
  lastPlayerType = card.type
EVERY TURN:
  IF lastPlayerType === this.currentMimicType:
    action = ATTACK (base damage + 2)
  ELSE:
    action = ATTACK (base damage)
  this.currentMimicType = lastPlayerType
```

**Shield Bug (#241):**
```
EVERY TURN:
  IF this.shield < 4:
    action = SHIELD (gain 4 shield)
  ELSE:
    action = ATTACK (base damage)
  // Alternates: shield → attack → shield → attack
```

**Tempo Leech (#242):**
```
EVERY TURN:
  action = ATTACK (base damage)
  IF playerTempo > 0:
    playerTempo -= 1
    // Visual: tempo bar flashes red, -1 icon appears
```

**Noise Imp (#243):**
```
EVERY TURN:
  action = ATTACK (base damage = 4, highest of commons)
  // No special abilities — just high damage, low HP
  // Design intent: kill fast or take big hits
```

**Heal Sprite (#244):**
```
EVERY TURN:
  IF any ally has HP < maxHP:
    action = HEAL_ALLIES (heal all allies for 3)
  ELSE:
    action = ATTACK (base damage = 1)
  // Priority target — players learn to focus healers
```

**Static Mite (#245):**
```
EVERY TURN:
  action = ATTACK (base damage = 1)
ON DEATH:
  playerStatic += 3
  // Small but adds up — killing 3 mites = +9 static = 2+ glitches
```

### Uncommon Enemy AI

**Phase Walker (#246):**
```
ON TURN START:
  roll = Math.random()
  IF roll < 0.33:
    this.phased = true  // immune this turn
    // Visual: enemy becomes translucent
  ELSE:
    this.phased = false
EVERY TURN:
  IF this.phased:
    action = NONE (skip turn, cannot be damaged)
  ELSE:
    action = ATTACK (base damage)
takeDamage(dmg):
  IF this.phased: return 0
  ELSE: normal damage
```

**Signal Thief (#247):**
```
ON PLAYER CARD PLAY:
  roll = Math.random()
  IF roll < 0.20:
    // "Steal" — enemy gains card's damage as shield, or card's shield as HP
    IF card.damage > 0:
      this.shield += card.damage
    IF card.shield > 0:
      this.heal(card.shield)
    // Player's card still has its normal effect (not canceled)
    // Visual: ghostly card copy flies to enemy
```

**Glitch Hound (#248):**
```
ON COMBAT START:
  countGlitches = player.deckList.filter(c => c.isGlitch).length
ON EACH TURN:
  recount = player.deckList.filter(c => c.isGlitch).length
  this.bonusDamage = recount * 1
EVERY TURN:
  action = ATTACK (base damage + this.bonusDamage)
  // At 3 glitches: +3 damage. At 6 glitches: +6. Scary scaling.
```

**Overclock Bot (#249):**
```
this.enrageStacks = 0
EVERY TURN:
  this.enrageStacks += 1
  action = ATTACK (base damage + this.enrageStacks)
  // Turn 1: 2+1=3, Turn 2: 2+2=4, Turn 3: 2+3=5...
  // Must be killed within 3-4 turns or damage becomes overwhelming
```

**Dampener (#250):**
```
AURA (passive, always active while alive):
  ALL player card damage -= 2 (minimum 0)
  // Applied in damage resolution phase before Armored
EVERY TURN:
  action = ATTACK (base damage)
  // Low threat directly but massively reduces player DPS
  // Kill priority depends on how damage-reliant your deck is
```

**Echo Disruptor (#251):**
```
AURA (passive, always active while alive):
  When player plays a card with Echo:
    echoMultiplier = 0 (echo doesn't trigger)
    // Visual: "DISRUPTED" text appears over echo indicator
EVERY TURN:
  action = ATTACK (base damage)
  // Directly counters Echo Engine archetype
  // Must be killed first if running echo deck
```

**Splitter (#252):**
```
this.hasSplit = false
takeDamage(dmg):
  normalDamage(dmg)
  IF this.hp <= this.maxHp * 0.5 AND !this.hasSplit:
    this.hasSplit = true
    this.hp = 0 // remove original
    spawn 2 × HalfSplitter { hp: 8, damage: 2 }
    // Visual: enemy splits apart into two smaller versions
```

**Curse Caster (#253):**
```
EVERY TURN:
  action = ATTACK (base damage)
  THEN: inject 1 "Curse" card into player's HAND (not discard)
    Curse: { cost: 99, damage: 0, shield: 0, isGlitch: true, name: "⚠ Curse" }
    // Takes up a hand slot, cannot be played
    // Exhausts at end of combat
  // Must be killed ASAP or hand becomes clogged
```

**Waveform Guardian (#254):**
```
ON TURN START:
  this.immuneType = randomFrom(['pulse', 'sine', 'saw', 'noise'])
  // Visual: glowing icon of immune waveform type above enemy
takeDamage(dmg, card):
  IF card.type === this.immuneType:
    return 0 // immune
    // Visual: "IMMUNE" text, damage blocked
  ELSE:
    normalDamage(dmg)
EVERY TURN:
  action = ATTACK (base damage)
```

### Elite Enemy AI

**The Compiler (#255):**
```
this.compileCounter = 0
EVERY TURN:
  this.compileCounter += 1
  IF this.compileCounter % 3 === 0:
    // "Compile" — massive attack
    action = HEAVY_ATTACK (15 damage)
    // Turn before: show "COMPILING..." intent icon (telegraphed)
  ELSE IF this.compileCounter % 3 === 2:
    action = CHARGE (gain 5 shield, show "COMPILING..." intent)
    // This is the telegraph turn
  ELSE:
    action = ATTACK (base damage)
```

**Time Eater (#258):**
```
this.cardsPlayedThisTurn = 0
ON PLAYER CARD PLAY:
  this.cardsPlayedThisTurn += 1
ON TURN END:
  IF this.cardsPlayedThisTurn >= 5:
    this.shield += 10
    this.bonusDamageNextTurn += 3
    // Visual: "OVERLOADED" — enemy powers up
  this.cardsPlayedThisTurn = 0
EVERY TURN:
  action = ATTACK (base damage + this.bonusDamageNextTurn)
  this.bonusDamageNextTurn = 0
```

**Null Sentinel (#260):**
```
PASSIVE:
  this.armored = 3 // takes 3 less damage from ALL sources
  // With 35 HP and Armored 3:
  //   Pulse Strike (6 dmg) → 3 actual = 12 hits to kill
  //   Phase Strike (7 piercing) → 7 actual = 5 hits to kill
  //   AOE (11 dmg) → 8 actual
EVERY TURN:
  action = ATTACK (base damage = 4)
  // Slow but extremely tanky. Tests if player has piercing/high-damage cards.
```

### Boss AI — The Debugger (#263) Full Script

```
PHASE 1 (HP > 40):
  intent_pool = [
    { action: ATTACK, damage: 8, weight: 50 },
    { action: ATTACK, damage: 5, weight: 20 },
    { action: SHIELD, amount: 8, weight: 30 },
  ]
  EVERY TURN:
    select weighted random from intent_pool
    execute selected action

PHASE 2 (HP 20–40): "Debug Mode"
  ON PHASE ENTER:
    // Visual: boss eye opens, "SCANNING..." overlay
    revealPlayerHand = true // show hand to all (cosmetic)
  intent_pool = [
    { action: ATTACK, damage: 10, weight: 40 },
    { action: HEAL, amount: 5, weight: 30 },
    { action: SHIELD, amount: 10, weight: 30 },
  ]
  EVERY TURN:
    select weighted random from intent_pool
    execute
    this.heal(5) // passive regen

PHASE 3 (HP < 20): "Patch Deployed"
  ON PHASE ENTER:
    // Count player deck by type
    counts = { pulse: 0, sine: 0, saw: 0, noise: 0 }
    player.deckList.forEach(c => counts[c.type]++)
    this.immuneType = type with highest count
    // Visual: "PATCHING [TYPE]..." — boss becomes immune to dominant type
  AURA:
    immune to this.immuneType damage
  intent_pool = [
    { action: ATTACK, damage: 12, weight: 60 },
    { action: ATTACK_AOE, damage: 8, weight: 40 },
  ]
  EVERY TURN:
    select weighted random
    execute
```

### Boss AI — The Overwriter (#264) Full Script

```
PHASE 1 (HP > 60):
  EVERY TURN:
    action = ATTACK (base damage = 4)
    // Normal attacks, tests baseline defense

PHASE 2 (HP 30–60): "Overwrite Mode"
  ON PHASE ENTER:
    // Visual: glitch overlay on screen edges
  EVERY TURN:
    action = ATTACK (base damage = 5)
    THEN:
      // Select 1 random non-Glitch card from player's hand
      target = random card in playerHand where !card.isGlitch
      IF target:
        replace target with Glitch card (70% Static Burst / 30% Feedback)
        // Visual: card in hand shimmers and transforms
        // The original card goes to discard (not lost permanently)

PHASE 3 (HP < 30): "Full Overwrite"
  EVERY TURN:
    action = ATTACK (base damage = 6)
    THEN:
      // Overwrite 2 cards per turn
      for i in [0, 1]:
        target = random card in playerHand where !card.isGlitch
        IF target:
          replace with Glitch card
          // Visual: aggressive glitch corruption spreading
    // Player must race to kill before hand is all Glitches
    // Clean Room relic is extremely valuable here
```

---

## Balance Spreadsheet — Damage Per Energy (DPE) Analysis

> DPE = total effective output ÷ energy cost. Higher = more efficient.

### Existing Cards DPE

| Card | Cost | Raw Damage | Echo Bonus | Effective Dmg | DPE | Notes |
|---|---|---|---|---|---|---|
| Pulse Strike | 1 | 6 | — | 6 | 6.0 | Baseline |
| Pulse Tap | 0 | 3 | — | 3 | ∞ (free) | Best DPE, low impact |
| Sine Guard | 1 | 0 (7 shd) | — | 7 equiv | 7.0 | Shield slightly more valuable |
| Sine Bridge | 1 | 0 (4 shd) | — | 4 + draw | ~8.0* | Draw = ~4 value |
| Saw Rush | 1 | 5 | — | 5 + draw | ~9.0* | Best 1-cost with draw |
| Saw Latch | 1 | 4 | — | 4 + tempo | ~5.5 | Tempo currently worth 0 |
| Noise Spike | 2 | 9 | — | 9 | 4.5 | Expensive for single-target |
| Noise Shard | 1 | 5 | — | 5 - glitch | ~3.5 | Glitch is negative value |
| Overdrive Coil | 0 | 2 | +1 | 3 | ∞ (free) | Free echo damage |
| Pulse Repeater | 1 | 4 | — | 4 + tempo | ~5.5 | Tempo currently cosmetic |
| Sine Barrier | 2 | 0 (14 shd) | — | 14 equiv | 7.0 | Best raw shield |
| Sine Reset | 1 | 0 (3 shd) | — | 3 + stab + draw | ~9.0* | Strong utility |
| Saw Flurry | 2 | 5 AOE | — | 5 × enemies | 2.5–5.0+ | Scales with enemy count |
| Saw Anchor | 2 | 8 + 4 shd | — | 12 equiv | 6.0 | Efficient hybrid |
| Noise Bloom | 2 | 7 | — | 7 + tempo | ~4.75 | Expensive, needs tempo payoff |
| Noise Cancel | 1 | 0 | — | −2 static + stab | ~5.0 | Utility value |
| Resonance Pulse | 1 | 5 | +2.5 | 7.5 | 7.5 | Excellent echo uncommon |
| Sustain Wave | 1 | 0 (5 shd) | — | 5/turn forever | ∞ over time | Best long-game value |
| Razor Edge | 1 | 8 | — | 8 (once) | 8.0 | Highest single-play DPE |
| Signal Leech | 2 | 6 | — | 6 + 3 heal | 4.5 | Leech adds survival value |
| Forge Nova | 3 | 18 AOE | — | 18 × enemies | 6.0–12.0+ | Scales massively with enemy count |
| Phase Cascade | 2 | 0 (10 shd) | — | 10 + 2 draw | ~13.0* | Premium defense + draw |
| Razor Choir | 2 | 14 | — | 14 + tempo | ~8.0 | High damage rare |
| Blackout | 1 | 0 | — | stab ALL + draw 2 | ~12.0* | Anti-glitch utility king |
| Wildcard | 1 | 3 | — | 3 + pattern | ~8.0* | Pattern completion adds huge value |
| Overclock | 0 | 5 | +2.5 | 7.5 | ∞ (free) | Best free card, exhaust balances |
| Fortify | 2 | 0 (12 shd) | — | 12/turn | ∞ over time | Sustain shield is incredible value |
| Saw Tempest | 3 | 8 AOE | — | 8 × enemies + draw 2 | 2.67–6.0+ | Draw 2 is premium |
| Signal Drain | 2 | 10 | — | 10 + 5 heal | 7.5 | Leech + exhaust = burst heal |

*Draw value estimated at 4.0 per card drawn (based on average card value in typical decks).*

### Proposed Cards DPE Comparison

| Card | Cost | Effective Dmg | DPE | vs Baseline (6.0) |
|---|---|---|---|---|
| Pulse Echo (#76) | 1 | 7.5 (with echo) | 7.5 | +25% ✓ |
| Sine Pulse (#77) | 0 | 4 shd + 1 tempo | ∞ | Balanced free card |
| Saw Blitz (#78) | 1 | 4 + draw + chain | ~9.0 | Strong but keyword-dependent |
| Saw Edge (#82) | 1 | 7 | 7.0 | +17% over Pulse Strike ✓ |
| White Noise (#95) | 2 | 12–24 (at 4–8 static) | 6.0–12.0 | Scales, needs setup |
| Omega Pulse (#100) | 3 | 37.5 (with echo) | 12.5 | Exhaust balances high DPE |
| Final Cut (#102) | 2 | 24–40 (at 3–5 cards) | 12–20 | Needs combo, exhaust |
| Entropy Bomb (#103) | 3 | 32–64 (at 4–8 static) | 10.7–21.3 | Needs massive setup, exhaust |
| Perpetual Engine (#105) | 1 | 4 + draw (forever) | ∞ over time | Strongest engine card |

**DPE Targets by Rarity:**
- Common: 5.0–7.0 DPE
- Uncommon: 6.5–9.0 DPE (accounting for keywords)
- Rare: 8.0–15.0 DPE (accounting for exhaust/conditions)
- Free cards (0-cost): 3.0–4.0 raw output

---

## Interaction Matrix — System Interconnections

### How All Systems Connect

```
                    TEMPO ←——→ ENERGY
                      ↑          ↑
                      |          |
            PATTERN ←—+——→ CARDS ←——→ SHIELD
                      |     ↕         ↕
                      |   STATIC ←→ GLITCH
                      |     ↕
                      +→ ENEMIES ←→ RELICS
```

### Cross-System Interaction Table

| System A | System B | Current Interaction | Proposed Interaction |
|---|---|---|---|
| Tempo | Damage | NONE ⚠ | +tempo × 1 per card (proposal #10) |
| Tempo | Energy | NONE ⚠ | Spend 4 tempo → 1 energy (proposal #19) |
| Tempo | Draw | NONE ⚠ | Tempo 3 → draw 1, Tempo 6 → draw 2 (#12) |
| Tempo | Shield | NONE ⚠ | +1 shield per tempo at EOT (#13) |
| Tempo | Pattern | Only via sequence building | Tempo Burst at 6 → +8 AOE (#17) |
| Static | Damage | NONE (only creates glitches) | Static-scaled cards: ×3, ×8 (#95, #103) |
| Static | Energy | NONE | Convert 3 Static → 1 energy (#318 relic) |
| Static | Shield | NONE | Static Shield card: Static × 4 shield |
| Static | Enemies | Enemy staticPulse adds Static | Enemy Static Aura (#274), Glitch Hound (#248) |
| Shield | Damage | NONE | Shield Nova (#111), Barrier Shift (#93) |
| Shield | Tempo | NONE | Defensive Tempo at 10+ shield (#CS-2) |
| Shield | Static | NONE | Could reduce Static when shield breaks |
| Pattern | Rewards | +12 Forge Burst damage | Graduated matching (#CS-3), streaks (#CS-3) |
| Pattern | Draw | NONE | Pattern completion draws cards (#315 relic) |
| Pattern | Healing | NONE | Healing Pulse relic: +3 HP on burst (#305) |
| Energy | Cards | Cost to play | Conditional regen (#43), Energy Debt (#44) |
| Energy | Draw | NONE | Overflow Draw reserves (#33) |
| Draw | Exhaust | Cards leave deck | Burn Fuel relic: draw on exhaust (#302) |
| Draw | Static | NONE | Could draw Static-free if type diversity met |
| Enemies | Pattern | NONE | Pattern Lock enemy (#261), Sequence Scramble (#283) |
| Enemies | Tempo | NONE | Tempo Leech (#242), Anti-Tempo ability (#20) |
| Relics | All | Various static bonuses | Synergy clusters, cursed relics, boss drops |

### Current "Dead" Interactions (Priority Fixes)

1. **Tempo → Everything**: Tempo connects to NOTHING mechanically. Highest priority fix.
2. **Static → Damage**: Static only creates Glitches. No direct offensive use.
3. **Shield → Offense**: No way to convert shield into damage.
4. **Pattern → Draw**: Completing patterns doesn't draw cards (only Echo Node relic).
5. **Energy → Carries**: Energy doesn't carry over between turns at all.

---

## Difficulty Scaling Deep Dive

### Current Scaling Formulas (from code)

```
hpScale  = 1 + (floor - 1) * 0.25
dmgScale = 1 + (floor - 1) * 0.15
enemyCount = 2 + floor((floor - 1) / 4)
shopCards = min(3 + floor((floor - 1) / 2), 6)
shopRelics = min(2 + floor((floor - 1) / 3), 4)
healBetweenFloors = floor(playerMaxHp * 0.25)
```

### Floor-by-Floor Power Curve

| Floor | hpScale | dmgScale | Enemies | Enemy Total HP* | Enemy Total DPT* | Player Estimated HP | Player Estimated DPT | Gap |
|---|---|---|---|---|---|---|---|---|
| 1 | 1.00 | 1.00 | 2 | 30 | 4 | 40 | 18 | Player +++ |
| 2 | 1.25 | 1.15 | 2 | 38 | 5 | 38 | 22 | Player ++ |
| 3 | 1.50 | 1.30 | 2 | 45 | 5 | 36 | 26 | Player + |
| 4 | 1.75 | 1.45 | 2 | 53 | 6 | 34 | 30 | Even |
| 5 | 2.00 | 1.60 | 3 | 72 | 10 | 32 | 34 | Player slight edge |
| 6 | 2.25 | 1.75 | 3 | 81 | 11 | 30 | 38 | Player + |
| 7 | 2.50 | 1.90 | 3 | 90 | 12 | 28 | 42 | Player ++ |
| 8 | 2.75 | 2.05 | 3 | 99 | 13 | 26 | 46 | Player ++ |
| 9 | 3.00 | 2.20 | 4 | 120 | 18 | 24 | 50 | Tight |
| 10 | 3.25 | 2.35 | 4 | 130 | 19 | 22 | 54 | Boss check |

*Assumes average common enemy (14 HP, 2 damage base). Player DPT assumes 3 cards played per turn, growing with upgrades.*

**Observations:**
- Floors 1-3: Player is overpowered (good — learning phase)
- Floors 4-6: Balance point — player needs some upgrades to stay comfortable
- Floors 7-8: Player should have 2-3 uncommons + 1 relic to handle enemy scaling
- Floor 9-10: Major difficulty spike from enemy count increase. Boss floor 10 is the first real wall.
- Floor 10+: Enemy HP grows 25% per floor but player damage grows logarithmically. Eventually enemies become spongy.

### Proposed Scaling Adjustments

**Problem 1: Linear HP scaling becomes spongy**
- Current: `hpScale = 1 + (floor-1) * 0.25` (linear, +25% per floor)
- Proposed: `hpScale = 1 + (floor-1) * 0.2 + floor > 10 ? (floor-10) * 0.1 : 0` (reduced scaling after floor 10)
- Rationale: Late-game enemies should be dangerous (more abilities), not just HP sponges

**Problem 2: Damage scaling is too gentle**
- Current: `dmgScale = 1 + (floor-1) * 0.15` (only +15% per floor)
- Proposed: `dmgScale = 1 + (floor-1) * 0.20` (match HP scaling rate)
- Rationale: Enemies need to threaten, not just soak

**Problem 3: Enemy count jumps are sudden**
- Current: `2 + floor((floor-1) / 4)` → jumps at floors 5, 9, 13...
- Proposed: `2 + floor(floor / 3)` → jumps at floors 3, 6, 9, 12...
- Rationale: More frequent smaller jumps feel smoother

**Problem 4: No enemy ability scaling**
- Current: All enemies keep their base abilities regardless of floor
- Proposed: `abilityScale = 1 + (floor-1) * 0.1` applied to regen, shield, thorns, etc.
- Example: Regen Drone at floor 1: regen 3. At floor 10: regen 3 × 1.9 = regen 5.7 → 6.
- Rationale: Abilities should scale like stats do

---

## Event System Design (Between-Floor Events)

### Event Categories

**Category 1: Resource Events** (40% chance)

421. **Data Cache**: "You find a hidden data cache." Gain 30–60 currency.
422. **Repair Station**: "An old repair station hums to life." Heal 30% maxHP.
423. **Scavenger's Find**: "Among the wreckage, something glints." Choose: gain 40 currency OR heal 15 HP.
424. **Power Surge**: "A power conduit overloads." Gain +1 energy for next combat only.
425. **Static Discharge**: "A wave of interference passes." Reduce Static to 0 OR gain 25 currency.

**Category 2: Card Events** (25% chance)

426. **Signal Purifier**: "A device offers to clean your signal." Remove 1 card from deck for free.
427. **Card Transmuter**: "A strange machine reconfigures." Transform 1 card into a random card of higher rarity (common→uncommon, uncommon→rare).
428. **Duplicate Signal**: "An echo device copies your strongest card." Duplicate 1 card in your deck (choose which).
429. **Forbidden Knowledge**: "Dark texts promise power." Add 1 rare card to deck, but also add 1 Curse card.
430. **Upgrade Protocol**: "A maintenance drone approaches." Upgrade 1 card for free (+25% stats or add keyword).

**Category 3: Relic Events** (15% chance)

431. **Strange Artifact**: "An unusual device pulses with energy." Gain 1 random common relic.
432. **Relic Trade**: "A merchant offers a swap." Trade 1 relic for a random relic of higher rarity.
433. **Cursed Offering**: "Something whispers promises of power." Gain 1 cursed relic (powerful with drawback).

**Category 4: Challenge Events** (10% chance)

434. **Gauntlet**: "A sealed room pulses with danger." Fight 1 elite enemy with +50% rewards.
435. **Wager**: "A holographic figure challenges you." Bet 50 currency: if you beat next floor without taking damage, gain 150. If you fail, lose the bet.
436. **Mystery Box**: "A sealed container bears strange markings." 33% each: gain 80 currency, gain rare card, lose 10 HP.

**Category 5: Story Events** (10% chance)

437. **Lost Traveler**: "A weary figure asks for help." Give 30 currency: they give you a unique relic later (2 floors ahead). Refuse: nothing.
438. **Ancient Terminal**: "A terminal displays forgotten lore." Read it: gain permanent +2 maxHP. Skip: gain 30 currency.
439. **Signal Ghost**: "A spectral echo of yourself appears." It offers to fight alongside you. Gain "Signal Ghost" companion for next combat (deals 5 dmg/turn, 10 HP).
440. **The Crossroads**: "Two paths diverge." Path A: harder enemies next floor, +75% currency. Path B: easier enemies, -25% currency.

### Event Implementation Notes

```typescript
interface GameEvent {
  id: string;
  name: string;
  description: string;
  category: 'resource' | 'card' | 'relic' | 'challenge' | 'story';
  choices: EventChoice[];
  probability: number; // weight for selection
  minFloor: number;    // earliest floor this can appear
  maxOccurrences: number; // max times per run (0 = unlimited)
}

interface EventChoice {
  label: string;
  description: string;
  effect: (gameState: GameState) => void;
  requirement?: (gameState: GameState) => boolean; // optional prereq
}
```

**Event Frequency:**
- Events appear between floors with 40% probability (configurable)
- Max 1 event per floor transition
- Some events are floor-gated (e.g., Gauntlet only after floor 3)
- Duplicate prevention: same event can't appear twice in 3 floors

---

## Sound Design Integration Points

> Where audio cues should be added to support new mechanics.

441. **Tempo Tick Sound**: Each tempo increment (1→2→3...) plays an ascending note. At max tempo (6), play a harmonic chord.
442. **Static Crackle**: As Static increases, add persistent background static noise that intensifies. At threshold, play a sharp "buzz" when Glitch injects.
443. **Forge Burst Chime**: On successful pattern completion, play a satisfying resonant chime. On pattern streak, the chime becomes richer/more layered.
444. **Shield Block Sound**: When shield absorbs damage, play a metallic "ping." Pitch varies with amount blocked.
445. **Echo Effect**: Echo damage trigger plays a delayed/reverbed version of the original card's attack sound.
446. **Exhaust Sound**: Cards that exhaust play a "sizzle/burn" effect as they leave the deck permanently.
447. **Boss Phase Transition**: When boss enters new phase, play a dramatic musical sting + visual flash.
448. **Zone Ambient**: Each combat zone (#204) has unique ambient audio — Static Field has crackling, Healing Zone has gentle hum.
449. **Enemy Telegraph**: When enemy shows its next action (intent), play a subtle warning tone. Heavy attacks get louder/lower warning tones.
450. **Card Play by Type**: Each waveform type has a distinct audio signature — Pulse = rhythmic thump, Sine = smooth wave, Saw = sharp buzz, Noise = static burst.

---

## Visual Effect Proposals

451. **Tempo Bar Glow**: As tempo increases, the tempo bar glows brighter. At max (6), it pulses with golden light.
452. **Static Visual Corruption**: At high Static (6+), canvas background gets subtle scan lines/glitch artifacts. Intensifies as Static grows.
453. **Forge Burst Animation**: On pattern completion, a shockwave ripples out from the sequence panel. Cards glow their waveform color.
454. **Shield Visualization**: Shield appears as a translucent barrier in front of the player's HP/hand area. Cracks form as it's damaged. Shatters when broken.
455. **Echo Ripple**: When Echo triggers, a ripple effect emanates from the card being echoed. Second damage number appears with "ECHO" label.
456. **Enemy Death Effects**: Enemies dissolve into particles colored by their type (green for common, blue for elite, red for boss).
457. **Card Draw Animation**: Cards fly from the deck pile to the hand with a smooth arc. Different colors for different waveform types.
458. **Damage Numbers**: Floating damage numbers with different styles — normal (white), critical (gold), echo (purple), AOE (red), piercing (blue).
459. **Status Effect Icons**: Small icons below enemy HP bars showing active statuses (Vulnerable, Weak, Bleed, etc.) with turn counters.
460. **Relic Activation Flash**: When a relic triggers its effect, its icon briefly glows and shows a tooltip with what happened.

---

## Implementation Roadmap

### Phase 1: Core Fixes (Week 1–2)
**Priority patches that fix existing issues:**

1. Implement deck reshuffle (CS-1, proposal #4 — automatic silent reshuffle)
2. Wire up Tempo Gear relic (CS-2, proposal #9)
3. Give tempo a mechanical effect (CS-2, proposal #10 — `+tempo * 1` per card)
4. Fix score-on-play bug (CS-9, proposal #59 — only award score when damage connects)
5. Add enemy intent icons (UX-1, proposal #397)
6. Add damage preview on End Turn hover (UX-1, proposal #396)

### Phase 2: Balance Pass (Week 3–4)
**Rebalance existing systems:**

7. Reduce starter deck to 15 cards (BE-5, proposal #156)
8. Rebalance waveform distribution in starter (BE-5, proposal #157)
9. Add escalating card removal cost (BE-2, proposal #152)
10. Cap enemy count at 5 (BE-3, proposal #143)
11. Add HP variance to enemies (BE-3, proposal #144)
12. Add post-combat card reward (BE-7, proposal #165)

### Phase 3: Status Effects & Keywords (Week 5–6)
**Expand the mechanical vocabulary:**

13. Implement Vulnerable, Weak, Bleed, Freeze status effects (NM-1, proposals #176–180)
14. Add Piercing keyword to cards (CD-1, proposal #65)
15. Add Growing keyword (CD-1, proposal #69)
16. Add Retain keyword (CD-1, proposal #74)
17. Add 8 new common cards (CD-2, proposals #76–83)
18. Add 8 new uncommon cards (CD-3, subset of proposals #84–99)

### Phase 4: Enemy Variety (Week 7–8)
**Deepen combat encounters:**

19. Add 7 new common enemies (ED-1, proposals #239–245)
20. Add 5 new uncommon enemies (ED-2, subset of proposals #246–254)
21. Add 4 new elite enemies (ED-3, subset of proposals #255–262)
22. Add 2 new bosses (ED-4, proposals #263–264)
23. Implement attack telegraphing (ED-6, proposal #284)
24. Add enemy desperation behavior (ED-6, proposal #286)

### Phase 5: Relic Expansion (Week 9–10)
**Double the relic pool:**

25. Add 8 common relics (RE-1, proposals #289–296)
26. Add 8 uncommon relics (RE-2, subset of proposals #297–310)
27. Add 6 rare relics (RE-3, subset of proposals #311–322)
28. Add 4 cursed relics (RE-4, subset of proposals #323–329)
29. Add boss-drop relics (RE-5, proposals #330–333)
30. Implement relic synergy bonus (RE-6, proposal #334)

### Phase 6: New Mechanics (Week 11–14)
**Layer in new systems:**

31. Card upgrade system (CD-6, proposals #121–125)
32. Zone/terrain system (NM-4, proposals #204–214)
33. Waveform affinity tracking (NM-8, proposals #232–238)
34. Rest vs. shop choice between floors (CS-7, proposal #49)
35. Campfire events (CS-7, proposal #50)
36. Event system with random encounters (BE-4, proposal #153)

### Phase 7: Meta-Progression (Week 15–18)
**Add long-term engagement:**

37. Meta-currency system (MP-3, proposals #359–363)
38. Achievement system (MP-1, proposals #338–349)
39. Permanent upgrades (MP-2, proposals #350–358)
40. Character/class system (MP-4, proposals #364–370)
41. Challenge run system (MP-5, proposals #371–378)
42. Endless mode (MP-7, proposals #385–390)

### Phase 8: Polish & Social (Week 19–20)
**Final quality pass:**

43. Cosmetic rewards (MP-6, proposals #379–384)
44. Interactive tutorial (UX-3, proposal #411)
45. Accessibility features (UX-4, proposals #415–420)
46. Social features (MP-8, proposals #391–395)
47. Full balance pass across all new content
48. Performance optimization for all additions

---

## Closing Thoughts

This expanded design document now contains **460+ distinct proposals** across 9 major categories:

| Category | Proposal Count | Proposal Range |
|---|---|---|
| Core Systems | 60 | #1 – #60 |
| Card Designs | 55 | #61 – #125 |
| Balance & Economy | 50 | #126 – #175 |
| New Mechanics | 50 | #176 – #238 |
| Enemy Design | 50 | #239 – #288 |
| Relic Ecosystem | 45 | #289 – #337 |
| Meta-Progression | 45 | #338 – #395 |
| UI/UX | 25 | #396 – #420 |
| Events, Audio & VFX | 40 | #421 – #460 |

### Key Technical Findings from Code Analysis

1. **Tempo is cosmetic-only**: The tempo bar fills and resets but never affects any calculation. This is the #1 priority fix — giving tempo mechanical weight transforms the entire game feel.
2. **No deck reshuffle**: Draw pile empties permanently. This is a critical gap that limits combat length and deck-building strategy.
3. **Tempo Gear relic is defined but not implemented**: Dead code in `Relic.ts` — zero references in `SignalForgeGame.tsx`. Easy fix, high impact.
4. **Score inflated**: `+card.damage * 5` awards score on play, not on damage dealt. Scores are artificially high.
5. **Static only from 2nd+ of same type**: First card of each waveform type is "free" — this is actually good design but should be communicated to the player.
6. **No max hand enforcement on draw effects**: Card draw from effects can exceed hand limit — decide if this is intentional or a bug.
7. **Sequence length caps at 3**: `min(2 + floor(turn / 5), 3)` never exceeds 3 regardless of turn count. Consider scaling with floor for late-game complexity.
8. **Player starts at 40 HP**: Lower than many roguelike deckbuilders (Slay the Spire starts at 80). Consider if this is intentional difficulty or needs adjustment.
9. **Enemy damage resolution order**: Phase Shift → Armored → Shield → HP. This means Piercing must bypass Armored specifically, not the whole chain.
10. **Empowered bonus comes from OTHER allies only**: `empowerBonus` sums all living enemies' `empowerAlly` stats, but each enemy doesn't empower itself. This is correct behavior.

---

## Appendix A: Code Reference — Where to Implement Key Proposals

### Tempo Mechanical Effect (Proposal #10)

**File:** `components/signal-forge/SignalForgeGame.tsx`
**Location:** Inside `endTurn()`, in the damage calculation section (around line ~700)
**Change:** After calculating `matchBonus`, add:

```typescript
// Tempo damage bonus: each card played gains +tempo damage
const tempoDmg = this.playerTempo; // 0-6
// Apply to each card's effective damage in the loop below
```

**Effort:** ~5 lines of code. Low risk.

### Tempo Gear Wiring (Proposal #9)

**File:** `components/signal-forge/SignalForgeGame.tsx`
**Location:** Inside `endTurn()`, after Forge Burst check
**Change:** Find the `tempo_gear` relic in `playerRelics` and apply its effect:

```typescript
const tempoGearCount = this.playerRelics.filter(r => r.id === 'tempo_gear').length;
if (matched && tempoGearCount > 0) {
  this.playerTempo = Math.min(6, this.playerTempo + tempoGearCount);
}
```

**Effort:** 3 lines. Zero risk — relic already defined in `Relic.ts`.

### Deck Reshuffle (Proposal #4)

**File:** `components/signal-forge/SignalForgeGame.tsx`
**Location:** Inside `drawCard()` or wherever cards are drawn from `deckCards`
**Change:** When deck is empty and discard is not, shuffle discard into deck:

```typescript
private drawCard(): Card | null {
  if (this.deckCards.length === 0) {
    if (this.discardPile.length === 0) return null;
    // Reshuffle discard into deck
    this.deckCards = [...this.discardPile];
    this.discardPile = [];
    // Shuffle
    for (let i = this.deckCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deckCards[i], this.deckCards[j]] = [this.deckCards[j], this.deckCards[i]];
    }
  }
  const idx = Math.floor(Math.random() * this.deckCards.length);
  return this.deckCards.splice(idx, 1)[0];
}
```

**Effort:** ~15 lines. Medium risk — need to verify card references aren't broken by the shuffle.

### Score Fix (Proposal #59)

**File:** `components/signal-forge/SignalForgeGame.tsx`
**Location:** Inside `playCard()` where `this.score += card.damage * 5` is set
**Change:** Move score award from `playCard()` to `endTurn()` where damage is actually dealt:

```typescript
// In endTurn(), after damage dealt to each enemy:
this.score += actualDamageDealt * 5; // instead of card.damage * 5 on play
```

**Effort:** ~5 lines. Low risk but changes scoring behavior — update leaderboard expectations.

### Enemy Intent Display (Proposal #397)

**File:** `components/signal-forge/SignalForgeGame.tsx`
**Location:** In the canvas render loop where enemies are drawn (around line ~500-600)
**Change:** For each enemy, calculate and display next action above their health bar:

```typescript
// Pre-calculate intents at start of turn / after last turn resolution
enemies.forEach(e => {
  e.intent = calculateIntent(e); // 'attack', 'shield', 'heal', 'special'
  e.intentValue = calculateIntentValue(e);
});

// In render, above enemy HP bar:
const intentIcons = { attack: '⚔️', shield: '🛡️', heal: '💚', special: '⚡' };
ctx.fillText(`${intentIcons[e.intent]} ${e.intentValue}`, enemyX, enemyY - 20);
```

**Effort:** ~30 lines. Medium risk — need to implement AI prediction for each enemy type.

### Post-Combat Card Reward (Proposal #165)

**File:** `components/signal-forge/SignalForgeUI.tsx`
**Location:** In the reward phase rendering
**Change:** Add a card selection modal between victory and shop:

```typescript
// New game phase: 'card_reward' between 'reward' and 'shop'
// Generate 3 random cards matching floor-appropriate rarity
// Player selects 1 or skips (+20 currency)
```

**Effort:** ~80 lines (new UI component). Medium-high effort but high impact on roguelike loop.

---

## Appendix B: Card.ts Template Format Reference

> For implementing any proposed card, follow this template format (matches existing `Card.ts`):

```typescript
{
  name: 'Pulse Echo',
  type: 'pulse',
  rarity: 'common',
  cost: 1,
  damage: 5,
  shield: 0,
  echo: true,
  aoe: false,
  exhaust: false,
  sustain: false,
  wildcard: false,
  leech: 0,
  draw: 0,
  staticGain: 0,
  staticReduce: 0,
  tempoGain: 0,
  glitchGen: 0,
  stabilize: 0,
  selfDamage: 0,
  description: 'Deal 5 damage. Echo.',
}
```

### New Properties Required for Proposed Keywords

```typescript
interface ExtendedCardTemplate extends CardTemplate {
  // New keywords (proposals #61-75)
  volatile?: { min: number; max: number };  // Random damage range
  delay?: boolean;                           // Effect triggers next turn
  chain?: boolean;                           // Next same-type costs -1
  overcharge?: boolean;                      // Pay +1 for double effect
  piercing?: boolean;                        // Ignores Armored
  siphon?: number;                           // Steal N shield from enemy
  ricochet?: number;                         // % splash to random other
  fading?: number;                           // Lose N per play
  growing?: number;                          // Gain N per play this combat
  innate?: boolean;                          // Always in opening hand
  ethereal?: boolean;                        // Exhaust if not played
  retain?: boolean;                          // Stays in hand between turns
  autoplay?: boolean;                        // Triggers on draw
  multihit?: number;                         // Hit N times
  bleed?: number;                            // Apply N turns of bleed
  modal?: string[];                          // Choice options
}
```

### New Enemy Properties Required

```typescript
interface ExtendedEnemyTemplate extends EnemyTemplate {
  // New abilities (proposals #269-283)
  taunt?: boolean;                           // Force player to target
  dodge?: number;                            // % chance to dodge
  counterAttack?: number;                    // Damage dealt when hit
  healOnKill?: number;                       // % of dead ally HP to heal
  staticAura?: number;                       // Static applied to player/turn
  shieldLink?: string;                       // ID of linked enemy
  sacrifice?: boolean;                       // Can sacrifice for ally
  summonReinforcement?: number;              // Turns between summons
  berserkThreshold?: number;                 // HP % to trigger berserk
  glitchAura?: number;                       // Damage per glitch in hand
  mirrorShield?: number;                     // % damage reflected
  adaptiveArmor?: boolean;                   // Gains armor per type hit
  corruptDraw?: number;                      // % chance to corrupt draw
  sequenceScramble?: boolean;                // Randomizes player sequence
  tempoSiphon?: number;                      // Tempo stolen per turn
}
```

---

## Appendix C: Waveform Type Design Language

> Defining the "personality" of each waveform type for consistent future card/enemy design.

### Pulse — The Reliable Attacker
**Color:** Blue (#3b82f6)
**Audio Signature:** Rhythmic thump, heartbeat-like
**Visual:** Smooth rounded shapes, circular particles
**Design Role:** Dependable damage, echo effects, combo starters
**Strengths:** Consistent DPE, good echo synergy, Oscillator Core support
**Weaknesses:** Low shield options, tends toward repetitive play
**Key Cards:** Pulse Strike, Overdrive Coil, Resonance Pulse, Omega Pulse
**Starter Representation:** 7/20 (35%) — should reduce to ~27% (4/15)
**Identity Statement:** "Pulse is the backbone — steady, reliable, and amplifiable."

### Sine — The Defensive Controller
**Color:** Green (#22c55e)
**Audio Signature:** Smooth wave, flowing water
**Visual:** Wavy lines, oscillating particles
**Design Role:** Shield generation, defense, stabilization, control
**Strengths:** Best shield values, sustain options, pattern flexibility
**Weaknesses:** Low damage, slow kill speed, Sine Loom dependency
**Key Cards:** Sine Guard, Sine Barrier, Sustain Wave, Fortify, Phase Cascade
**Starter Representation:** 5/20 (25%) — should stay ~27% (4/15)
**Identity Statement:** "Sine is the wall — protective, patient, and enduring."

### Saw — The Aggressive Finisher
**Color:** Red (#ef4444)
**Audio Signature:** Sharp buzz, metallic edge
**Visual:** Jagged zigzag shapes, angular particles
**Design Role:** High damage, multi-hit, draw, tempo building
**Strengths:** Best raw damage, draw synergy (Saw Rush), tempo gain (Saw Latch)
**Weaknesses:** No shield, high energy cost for best cards, Static risk from pairs
**Key Cards:** Saw Rush, Saw Flurry, Razor Edge, Razor Choir, Saw Tempest
**Starter Representation:** 5/20 (25%) — should stay ~27% (4/15)
**Identity Statement:** "Saw is the blade — fast, aggressive, and unforgiving."

### Noise — The Chaotic Gambler
**Color:** Purple (#a855f7)
**Audio Signature:** Static burst, distortion, crackle
**Visual:** Erratic random particles, glitch effects
**Design Role:** Risk/reward, Static interaction, high variance
**Strengths:** Static-scaled damage potential, Glitch synergy, unique gameplay
**Weaknesses:** Self-destructive (Static/Glitch), inconsistent, needs specific relics
**Key Cards:** Noise Spike, Noise Bloom, White Noise, Entropy Bomb, System Crash
**Starter Representation:** 3/20 (15%) — should increase to ~20% (3/15)
**Identity Statement:** "Noise is the wildcard — dangerous, unpredictable, and explosive."

### Wild — The Universal Connector
**Color:** Gold (#eab308)
**Audio Signature:** Harmonic chord, crystalline ring
**Visual:** Prismatic shimmer, rainbow particles
**Design Role:** Pattern completion, modal flexibility, bridging gaps
**Strengths:** Completes any pattern, ultimate flexibility
**Weaknesses:** Low base stats, rarity-gated, no type-specific synergies
**Key Cards:** Wildcard, Pattern Forge, Adaptive Protocol, Time Warp
**Starter Representation:** 0/20 (0%) — correct, Wild should be found, not given
**Identity Statement:** "Wild is the bridge — flexible, rare, and invaluable."

---

## Appendix D: Testing Checklist for New Implementations

### For Each New Card Added:
- [ ] Card appears in shop at correct rarity/floor
- [ ] Card cost is deducted correctly
- [ ] Card damage/shield applies correctly
- [ ] Keywords trigger in correct order (Echo after base damage, etc.)
- [ ] Card works with all existing relics (Oscillator Core, Signal Mirror, etc.)
- [ ] Card synergizes correctly with Forge Burst pattern matching
- [ ] Static triggers correctly for same-waveform plays
- [ ] Card renders properly on canvas at all screen sizes (mScale scaling)
- [ ] Card tooltip shows correct description
- [ ] Card unplay (`unplayCard()`) works correctly (or is blocked for irreversible effects)

### For Each New Relic Added:
- [ ] Relic appears in shop at correct pricing
- [ ] Relic stacks correctly with duplicates (×2, ×3)
- [ ] Relic triggers at correct timing in turn sequence (see Phase order above)
- [ ] Relic doesn't conflict with existing relics
- [ ] Relic saves/loads correctly in `savedRunState` JSON
- [ ] Relic displays correctly in relic bar UI
- [ ] Relic tooltip shows full description

### For Each New Enemy Added:
- [ ] Enemy spawns at correct floor range
- [ ] Enemy HP/damage scales correctly with `hpScale`/`dmgScale`
- [ ] Enemy abilities trigger at correct timing (see Phase 9 in combat resolution)
- [ ] Enemy abilities interact correctly with player shield/Static/etc.
- [ ] Enemy death awards correct currency
- [ ] Enemy renders at correct canvas position
- [ ] Multiple instances of same enemy work correctly

### For Each New Mechanic/System:
- [ ] System integrates with existing combat resolution order
- [ ] System state saves/loads in `savedRunState`
- [ ] System works on mobile (touch controls via MobileAbilityButtons pattern)
- [ ] System has visual feedback (canvas rendering for in-combat, HTML for menus)
- [ ] System has audio cues (if applicable)
- [ ] System has tutorial text in How to Play modal
- [ ] System doesn't break existing leaderboard scoring

---

## Appendix E: Glossary of All Proposed Keywords

| Keyword | Category | Rarity Gate | Effect Summary |
|---|---|---|---|
| Echo | Existing | Common+ | Trigger effect again at 50% |
| AOE | Existing | Uncommon+ | Hits all enemies |
| Exhaust | Existing | Common+ | Permanently removed from deck |
| Sustain | Existing | Uncommon+ | Returns to hand instead of discard |
| Wildcard | Existing | Rare only | Matches any waveform in sequence |
| Stabilize | Existing | Common+ | Remove N Glitch cards from discard |
| Leech | Existing | Uncommon+ | Heal % of damage dealt |
| Draw | Existing | Common+ | Draw N cards from deck |
| Volatile | NEW (#61) | Uncommon+ | Random damage/shield within range |
| Delay | NEW (#62) | Uncommon+ | Effect triggers next turn start |
| Chain | NEW (#63) | Common+ | Next same-type card costs -1 |
| Overcharge | NEW (#64) | Rare only | Pay +1 energy to double effect |
| Piercing | NEW (#65) | Uncommon+ | Ignores Armored reduction |
| Siphon | NEW (#66) | Uncommon+ | Steal shield from enemy |
| Ricochet | NEW (#67) | Uncommon+ | 50% splash to random other |
| Fading | NEW (#68) | Common+ | Lose stats each play |
| Growing | NEW (#69) | Uncommon+ | Gain stats each play this combat |
| Innate | NEW (#70) | Uncommon+ | Always in opening hand |
| Ethereal | NEW (#71) | Uncommon+ | Exhaust if not played this turn |
| Unplayable | NEW (#72) | Curse only | Cannot be played (hand blocker) |
| Autoplay | NEW (#73) | Rare only | Triggers automatically when drawn |
| Retain | NEW (#74) | Uncommon+ | Stays in hand between turns |
| Multihit | NEW (#90) | Uncommon+ | Hits target N times |
| Bleed | NEW (#94) | Uncommon+ | Target takes N dmg/turn for M turns |
| Modal | NEW (#115) | Rare only | Choose one of several effects |
| Freeze | NEW (#101) | Rare only | Target skips next attack |

**Total Keywords:** 8 existing + 18 new = 26 keywords

---

### Design Philosophy

Every proposal above follows these principles:

- **Informed by code**: Each suggestion accounts for actual implementation details (energy formulas, damage resolution order, relic stacking behavior, canvas rendering constraints)
- **Balanced trade-offs**: Power comes with risk (Cursed Relics, Static-as-resource, Overload)
- **Archetype support**: Suggestions enable 6+ distinct playstyles (Tempo Rush, Static Embrace, Shield Fortress, Echo Engine, Exhaust Burst, Pattern Master)
- **Progressive complexity**: Early floors teach mechanics; later floors demand mastery
- **No redundancy**: No two proposals solve the same problem under different names
- **Implementation-aware**: Proposals consider the canvas-based rendering, the TypeScript architecture, and the existing state management patterns in `SignalForgeGame.tsx`

### Recommended First Steps

1. **Fix tempo** — Give it mechanical weight (proposal #10). One line in `endTurn()`.
2. **Add reshuffle** — Critical for combat longevity (proposal #4). ~15 lines of code.
3. **Implement Tempo Gear** — Wire up the existing relic definition (proposal #9). ~5 lines.
4. **Enemy intent display** — Most impactful UX improvement (proposal #397). Canvas rendering addition.
5. **Post-combat card reward** — Core roguelike loop improvement (proposal #165). New UI modal.

Good luck forging the perfect signal.
