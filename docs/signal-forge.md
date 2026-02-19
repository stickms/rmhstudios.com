# Signal Forge - Full Game Design Outline

## 1. Overview
- Genre: Roguelike deckbuilder
- Session length: 10 to 15 minutes
- Platform: Web (desktop + mobile)
- Core hook: Match waveform sequences to trigger powerful forge effects

## 2. Pillars
- Sequence mastery: Order and timing matter as much as card choice
- Deck tension: Repetition builds static; managing it defines strategy
- Readable depth: Short runs, clear counterplay, fast iteration

## 3. Player Fantasy
- You are a signal artisan crafting living waveforms
- You bend combat by composing the right sequence under pressure

## 4. Core Loop
1. Enter a node encounter with a visible enemy pattern
2. Play cards to build a chain that matches the pattern
3. Trigger Forge Burst bonuses for perfect matches
4. Win and choose rewards (card, relic, currency)
5. Pick the next node on the map
6. Defeat boss node or fail and restart

## 5. Combat System
### 5.1 Turn Structure
- Draw 5 cards per turn
- Base energy: 3
- Actions: play card, use relic (if active), end turn
- Enemy intent visible each turn

### 5.2 Card Anatomy
- Name, cost, waveform type, effect, rarity
- Waveform types: Pulse, Sine, Saw, Noise
- Keywords: Echo, Sustain, Overdrive, Stabilize, Glitch

### 5.3 Sequences
- Each encounter exposes a required sequence (example: Pulse, Sine, Pulse)
- Match sequence within a turn to trigger Forge Burst
- Partial matches grant minor bonus
- Sequence length scales per floor

### 5.4 Forge Burst
- Powerful bonus effect triggered by full sequence match
- Examples: deal bonus damage, gain shield, purge Glitch
- Burst can chain if multiple sequences match in one turn

### 5.5 Tempo Meter
- Builds on correct sequence steps
- Decays on mismatch or end turn
- At full, unlocks a Finisher card for one turn

### 5.6 Static and Glitch
- Repeating the same waveform increases Static
- Static threshold inserts Glitch cards into discard
- Glitch cards are negative or dead draws
- Stabilize effects reduce Static or purge Glitch

### 5.7 Damage and Defense
- Health and Shield (Shield depletes first)
- Shield decays by 1 each turn unless reinforced
- Some cards convert Shield into damage

### 5.8 Targeting
- Single target for most attacks
- AOE only on rare or finisher cards

## 6. Progression
### 6.1 In-Run Rewards
- Card choice (pick 1 of 3)
- Relic choice (pick 1 of 3)
- Currency nodes
- Mod nodes (add Echo, reduce cost, add Sustain)

### 6.2 Meta Progression
- Unlock new waveform families
- Unlock starter decks
- Cosmetic unlocks (card frames, VFX)

## 7. Map and Nodes
### 7.1 Map Structure
- 3 floors, each with 6 to 8 nodes
- Branching paths with risk/reward

### 7.2 Node Types
- Combat
- Elite combat
- Boss
- Shop
- Mod station
- Rest node
- Event node

### 7.3 Events
- Trade health for relic
- Remove a card
- Duplicate a card with a curse

## 8. Cards
### 8.1 Card Pools
- Common: core sequence builders
- Uncommon: tempo builders and utility
- Rare: forge burst enhancers and finishers

### 8.2 Example Cards
- Pulse Strike (Pulse, cost 1, deal 6)
- Sine Guard (Sine, cost 1, gain 7 shield)
- Saw Rush (Saw, cost 1, deal 5 and draw 1)
- Noise Spike (Noise, cost 2, deal 9, add 1 Static)
- Stabilizer (Sine, cost 1, remove 1 Glitch)
- Overdrive Coil (Pulse, cost 0, next card triggers twice)

## 9. Relics
### 9.1 Relic Categories
- Tempo: increase tempo gain or finisher power
- Stability: reduce Static or Glitch generation
- Sequence: shorten required sequence or add wildcard
- Economy: bonus currency or shop discounts

### 9.2 Example Relics
- Oscillator Core: first Pulse each turn is free
- Phase Shifter: one sequence step can be any waveform
- Static Sink: remove 1 Static at end of turn

## 10. Enemies
### 10.1 Archetypes
- Disruptors: add Glitch cards
- Brutes: heavy single hits, low defense
- Swarmers: multiple small hits, weak to AOE
- Shielders: gain shield and punish long turns

### 10.2 Boss Concepts
- The Modulator: changes sequence pattern every 2 turns
- The Fault: adds Glitch each turn unless you match a perfect chain

## 11. Difficulty Scaling
- Longer sequences on higher floors
- Increased enemy intent complexity
- Higher Glitch pressure from elites

## 12. Art Direction
- Visual theme: industrial synth, oscilloscope UI
- Shapes: sharp geometry, heavy linework, neon glow
- Backgrounds: dark grid, subtle scanlines
- Enemies: abstract machines with pulsing cores

## 13. UI/UX
- Hand at bottom, enemy top center
- Sequence tracker above hand
- Tempo meter near end turn
- Clear intent icons for enemies
- Map overlay between fights

## 14. Audio
- Adaptive synth score
- Card play has waveform-specific click
- Forge Burst adds a harmonic swell
- Glitch adds static hiss

## 15. Controls
- Desktop: click or drag cards; hotkeys 1-5
- Mobile: tap to select, tap to play

## 16. Monetization (Optional)
- Cosmetic card backs and VFX packs
- No gameplay advantage purchases

## 17. Technical Notes
- Canvas 2D or WebGL for effects
- Deterministic RNG for replays
- Seeded runs for leaderboard

## 18. MVP Scope
- 40 cards, 12 relics, 4 enemy archetypes, 1 boss
- 3 starter decks
- Basic leaderboard: fastest clear and highest tempo chain

## 19. Metrics
- 25 percent of players clear a run after 3 attempts
- 30 percent return rate within 24 hours
- Average session length 8 to 12 minutes

## 20. Risks and Mitigations
- Risk: sequence system too complex
  - Mitigation: early nodes with short sequences and visual hints
- Risk: Glitch feels punishing
  - Mitigation: give frequent stabilize options
- Risk: mobile input friction
  - Mitigation: large play targets and generous drag thresholds
