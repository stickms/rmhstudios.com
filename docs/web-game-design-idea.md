# Novel Web Game Design Ideas (Roguelike Deckbuilder Pivot)

## Idea List (10)
1. Lattice of Ash: A deckbuilder where each card lays tiles; paths become your defense.
2. Salvage Circuit: Build a deck from junked tech cards that short out if overused.
3. Rookwind Caravan: Tactics-deckbuilder where cards move your caravan and hirelings on a grid.
4. Glass Orchard: Grow-and-burn deckbuilder; cards are seeds that blossom into combos or rot.
5. Signal Forge: Deckbuilder with waveform cards that chain when played in specific sequences.
6. Ember Debt: Risk-reward deckbuilder where every card costs heat that can melt your deck.
7. Tidevault: Water-cycle deckbuilder where cards flood and recede, changing their effects.
8. Hex Stitch: Build a quilt of hex cards that flip between light and dark sides.
9. Echo Barge: Deckbuilder on a moving train where cards are carriages with passive effects.
10. Archive Breaker: Deckbuilder where you rip pages from books to alter enemy moves.

## Rating Matrix (1-5)
Criteria: Fun, Originality, Scope, Replayability

| # | Idea | Fun | Originality | Scope | Replayability | Total |
|---|------|-----|-------------|-------|---------------|-------|
| 1 | Lattice of Ash | 5 | 4 | 3 | 5 | 17 |
| 2 | Salvage Circuit | 4 | 4 | 4 | 4 | 16 |
| 3 | Rookwind Caravan | 4 | 4 | 3 | 4 | 15 |
| 4 | Glass Orchard | 4 | 5 | 3 | 4 | 16 |
| 5 | Signal Forge | 5 | 5 | 3 | 5 | 18 |
| 6 | Ember Debt | 4 | 5 | 3 | 4 | 16 |
| 7 | Tidevault | 4 | 4 | 3 | 4 | 15 |
| 8 | Hex Stitch | 4 | 4 | 3 | 4 | 15 |
| 9 | Echo Barge | 4 | 4 | 3 | 4 | 15 |
|10 | Archive Breaker | 4 | 5 | 2 | 4 | 15 |

## Selected Best Idea
Signal Forge wins on novelty and replayability while staying within web scope.

---

# Design Document: Signal Forge

## One-Sentence Pitch
A roguelike deckbuilder where your cards are waveforms, and powerful effects trigger when you play sequences that match a beat pattern.

## Core Pillars
- Sequence mastery: chaining cards in the right order is the primary skill.
- Tight runs: 10 to 15 minute sessions with fast failure and quick retries.
- Meaningful deck tension: overuse a strong pattern and it destabilizes your deck.

## Player Fantasy
You are a signal artisan crafting living waveforms, bending combat by composing the right sequence under pressure.

## Core Loop
1. Enter a node encounter with a known enemy archetype.
2. Play a sequence of waveform cards to build a combo.
3. Trigger a forge effect when the sequence matches the node pattern.
4. Earn a card, mod, or currency.
5. Choose the next node and repeat until the boss.

## Mechanics
### Cards and Sequences
- Each card has a waveform type: Pulse, Sine, Saw, Noise.
- Enemies expose a target sequence (for example: Pulse, Sine, Pulse).
- Matching the full sequence in a turn triggers a Forge Burst bonus.

### Energy and Tempo
- You have 3 energy per turn, increaseable via relics.
- Some cards are "off-beat" and reduce future energy if spammed.
- A Tempo meter builds as you match sequences, then powers a finisher.

### Deck Stability
- Using the same waveform repeatedly increases static.
- High static adds "Glitch" cards to your discard until cleared.
- Stabilizer cards can purge Glitch or convert it into buffs.

### Progression
- Meta currency unlocks new waveform families and starter decks.
- In-run upgrades include card mods (Echo, Sustain, Overdrive).
- Relics shift strategies: low-card decks, high-glitch builds, or tempo stacking.

## Art Style
- Style: bold, industrial synth with oscilloscope motifs.
- Palette: charcoal and slate with electric cyan, lime, and amber accents.
- Cards: thick borders, waveform strip across the top, high-contrast icons.
- Effects: additive glow arcs, scanning lines, and crisp particle bursts.

## UI Choices
- Combat layout: enemy top-center, player bottom-center, deck left, discard right.
- Sequence tracker: a horizontal bar showing required pattern and your current chain.
- Tempo meter: circular gauge near the end turn button.
- Node map: compact neon grid with clear node icons.

## Audio Direction
- Adaptive synth track tied to turn cadence.
- Successful sequences add layers; mismatches add distortion hits.
- Card play emits short waveform clicks tied to type.

## Controls
- Desktop: drag or click cards; hotkeys 1-5 for hand slots.
- Mobile: tap card then tap target or play area.

## Difficulty and Scaling
- Early nodes show short sequences; later nodes have longer or branching patterns.
- Elite enemies corrupt your deck by forcing extra Glitch cards.
- Boss fights include phase-based sequence changes mid-combat.

## Technical Notes (Web)
- Render: Canvas 2D or WebGL for card effects and glow.
- State: deterministic turn engine with replayable seeds.
- Performance: precomputed card art atlas and light-weight particle system.

## MVP Scope
- 40 cards, 12 relics, 4 enemy archetypes, 1 boss.
- 3 starter decks with distinct waveform focuses.
- Basic leaderboard: fastest boss clear and highest tempo chain.

## Success Metrics
- 25%+ players complete a run after three attempts.
- 30% return rate within 24 hours.
- Average session length 8 to 12 minutes.
