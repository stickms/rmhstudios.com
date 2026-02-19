# Signal Forge — Improvement Plan

> A curated, ordered checklist of the best proposals from `signal-forge-better.md`, selected for
> maximum synergy, depth, and fun. Every item includes full implementation details grounded in
> the existing codebase (`SignalForgeGame.tsx`, `Card.ts`, `Relic.ts`, `Enemy.ts`, `SignalForgeUI.tsx`).

---

## Guiding Principles

The changes below were chosen because they **interlock**:

1. **Tempo becomes real** → Tempo Rush archetype emerges → Blade Storm / Final Cut payoff cards matter → Tempo Leech enemy creates tension.
2. **Reshuffle exists** → longer combats are viable → Sustain / Growing / engine cards have time to shine → boss fights feel strategic.
3. **Status effects arrive** → Piercing / Bleed / Freeze / Vulnerable / Weak give each waveform a clear identity → enemies can apply debuffs back → relics can interact with statuses.
4. **New keywords** (Chain, Growing, Retain, Piercing, Multihit, Bleed, Freeze, Modal) → new cards use them → new enemies counter them → new relics amplify them.
5. **Post-combat card rewards + card upgrades** → core roguelike loop tightens → deck-building decisions every floor → event system adds variety.
6. **Enemy intents + new enemy types** → combat becomes readable and strategic → archetypes are tested differently → bosses have memorable phases.

---

## Phase 1 — Critical Fixes (Foundation)

These fix bugs and fill gaps that currently break or limit the game.

### 1.1 — Deck Reshuffle ✦ CRITICAL
- [x] **Implement automatic silent reshuffle** (Proposal #4)

**What:** When draw pile is empty and player needs to draw, shuffle discard pile into draw pile automatically.

**Where:** `SignalForgeGame.tsx` → `drawHandCards()` method, and any place a card is drawn mid-turn (e.g., `draw` keyword).

**Current code:** `drawHandCards` draws from `this.state.deck` (the "draw pile" — distinct from `deckList`). When `deck` is empty, drawing silently fails — the player just gets fewer cards.

**Implementation:**
```typescript
// Before drawing each card, check if deck is empty:
private refillDeckFromDiscard(): void {
  if (this.state.deck.length === 0 && this.state.discard.length > 0) {
    // Move all discard into deck
    const reshuffled = [...this.state.discard];
    // Fisher-Yates shuffle
    for (let i = reshuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
    }
    this.state.deck = reshuffled;
    this.state.discard = [];
    this.state.combatLog.push('Discard pile reshuffled into draw pile.');
  }
}
```
Call `refillDeckFromDiscard()` at the top of `drawHandCards()` and before each individual card draw within that loop.

**Reshuffle fatigue — ramping self-damage per reshuffle:**

Each time the discard pile is reshuffled into the draw pile during the same combat, the player takes escalating damage to discourage infinite cycling:

| Reshuffle # | Damage |
|-------------|--------|
| 1st | 0 (free) |
| 2nd | 2 |
| 3rd | 5 |
| 4th | 9 |
| 5th+ | +5 per subsequent reshuffle |

Formula: `reshuffleDamage = reshuffleCount <= 1 ? 0 : Math.floor(0.5 * reshuffleCount * (reshuffleCount - 1))`  
(i.e., triangular scaling: 0, 0, 2, 5, 9, 14, 20, ...)

**Add to GameState:**
```typescript
reshuffleCount: number; // reset to 0 at start of each combat
```

**Implementation in `refillDeckFromDiscard()`:**
```typescript
private refillDeckFromDiscard(): void {
  if (this.state.deck.length === 0 && this.state.discard.length > 0) {
    this.state.reshuffleCount = (this.state.reshuffleCount ?? 0) + 1;

    // Reshuffle fatigue — first reshuffle is free, then ramping damage
    if (this.state.reshuffleCount > 1) {
      const fatigueDmg = Math.floor(
        0.5 * this.state.reshuffleCount * (this.state.reshuffleCount - 1)
      );
      this.state.playerHp -= fatigueDmg;
      this.state.combatLog.push(
        `Reshuffle fatigue! Took ${fatigueDmg} damage. (Reshuffle #${this.state.reshuffleCount})`
      );
    }

    const reshuffled = [...this.state.discard];
    for (let i = reshuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
    }
    this.state.deck = reshuffled;
    this.state.discard = [];
    this.state.combatLog.push('Discard pile reshuffled into draw pile.');
  }
}
```

Reset `reshuffleCount` to 0 at the start of each combat (in `proceedFromShop()` / `startGame()`).

**Design rationale:** The first reshuffle is free — normal-length combats (4-6 turns with a 15-card deck) will hit 1-2 reshuffles naturally and take zero or minimal damage. But an engine deck that cycles through 3-4+ times per combat pays an increasing HP tax, preventing infinite loops while still allowing engine strategies to function with a meaningful cost. This also creates interaction with healing relics (HP Regenerator, Healing Pulse) and events — players who plan to cycle heavily can invest in sustain to offset the fatigue.

**Why it matters:** Without reshuffle, long combats (bosses) run out of cards. Sustain, Growing, and engine archetypes can't function. This is the #1 blocker for deeper gameplay. The fatigue mechanic ensures reshuffle enables these strategies without making infinite cycling risk-free.

---

### 1.2 — Tempo Mechanical Effect ✦ CRITICAL
- [x] **Give tempo a damage bonus** (Proposal #10)

**What:** Each card played in `endTurn()` damage resolution gains `+playerTempo` bonus damage.

**Where:** `SignalForgeGame.tsx` → `endTurn()`, in the per-card damage loop (after getting `effectiveDamage` from each played card).

**Current code:** `playerTempo` increments per card played in `playCard()`, caps at 6, resets to 0 in `endTurn()` after damage. It is **never read** for any gameplay calculation.

**Implementation:**
```typescript
// In endTurn(), inside the playedThisTurn.forEach damage loop:
const tempoBonusDmg = this.state.playerTempo; // snapshot before reset
// For each card:
const cardDamage = card.getEffectiveDamage(); // existing
const totalCardDmg = cardDamage + tempoBonusDmg; // NEW
// Use totalCardDmg instead of cardDamage in the takeDamage call
```

**Balance:** At tempo 6 (max) with 5 cards played, that's +30 total bonus damage across all cards. Significant but not overwhelming — it makes playing many cheap cards feel rewarding.

**Synergies enabled:**
- Tempo Rush archetype: play 5+ cheap cards → high tempo → each card hits harder
- Blade Storm (#112): hits `tempo` times → tempo directly scales hit count AND per-hit damage
- Final Cut (#102): cards-played scaling now pairs with tempo scaling for double reward
- Tempo Leech enemy (#242): stealing tempo directly reduces player damage output

---

### 1.3 — Wire Up Tempo Gear Relic ✦ EASY FIX
- [x] **Implement the existing `tempo_gear` relic** (Proposal #9)

**What:** The relic is already defined in `Relic.ts` with key `tempo_gear` and description "+1 bonus tempo on first sequence match each turn". It has **zero references** in `SignalForgeGame.tsx`.

**Where:** `SignalForgeGame.tsx` → `endTurn()`, right after the `matched` boolean is computed for Forge Burst.

**Implementation:**
```typescript
// After: if (matched) { matchBonus = 12; ... }
const tempoGearCount = this.state.ownedRelics.filter(r => r.key === 'tempo_gear').length;
if (matched && tempoGearCount > 0) {
  this.state.playerTempo = Math.min(6, this.state.playerTempo + tempoGearCount);
  this.state.combatLog.push(`Tempo Gear: +${tempoGearCount} tempo from sequence match.`);
}
```

**Why it matters with 1.2:** With tempo now dealing bonus damage, Tempo Gear becomes a real relic that rewards pattern matching with offensive output.

---

### 1.4 — Fix Score-on-Play Bug
- [x] **Only award damage-based score when damage actually connects** (Proposal #59)

**What:** Currently `playCard()` adds `card.damage * 5` to `score` immediately on play, even before `endTurn()` applies damage. If the enemy has shield or armor that absorbs everything, score is inflated.

**Where:** `SignalForgeGame.tsx` → move score from `playCard()` to `endTurn()`.

**Implementation:**
```typescript
// In playCard(): REMOVE the line:
//   this.state.score += card.damage * 5;
// In unplayCard(): REMOVE the corresponding subtraction.

// In endTurn(), after each enemy.takeDamage() call, track actual damage dealt:
// (takeDamage already returns absorbed amount via hp reduction)
// Add after the damage loop:
const totalDamageDealt = /* sum of actual HP damage dealt to all enemies this turn */;
this.state.score += totalDamageDealt * 5;
```

**Note:** This changes scoring behavior. Existing leaderboard scores will be higher than new scores. Consider: either reset the leaderboard, or add a version flag.

---

### 1.5 — Enemy Intent Display ✦ HIGH IMPACT UX
- [ ] **Show what each enemy will do next turn** (Proposal #397)

**What:** Display an icon + number above each enemy showing their next action: ⚔️ 8 (attack for 8), 🛡️ 4 (gain 4 shield), 💚 3 (regen 3), etc.

**Where:** `SignalForgeGame.tsx` → canvas render section where enemies are drawn (~line 500-600), and add an `intent` field to enemy calculations.

**Implementation:**

Add to `EnemyData` interface in `Enemy.ts`:
```typescript
intentDisplay?: { type: 'attack' | 'shield' | 'heal' | 'special'; value: number; label?: string };
```

Calculate intents at the start of each player turn (or after `endTurn()` completes, for next-turn display):
```typescript
private calculateEnemyIntents(): void {
  this.state.enemies.forEach(enemy => {
    const empowerBonus = this.state.enemies
      .filter(e => e.id !== enemy.id && e.hp > 0)
      .reduce((sum, e) => sum + (e.empowerAlly ?? 0), 0);
    const baseDmg = enemy.getDamage() + empowerBonus;
    
    // Default: attack
    enemy.intentDisplay = { type: 'attack', value: baseDmg };
    
    // Override for enemies with shield behavior
    if (enemy.shieldAlly && enemy.shieldAlly > 0) {
      enemy.intentDisplay = { type: 'shield', value: enemy.shieldAlly, label: 'Ally Shield' };
    }
    // Regen-focused enemies
    if (enemy.regen && enemy.regen > enemy.damage) {
      enemy.intentDisplay = { type: 'heal', value: enemy.regen };
    }
  });
}
```

Render in canvas above enemy circle:
```typescript
// Above enemy HP bar:
const intentIcons: Record<string, string> = {
  attack: '⚔️', shield: '🛡️', heal: '💚', special: '⚡'
};
const intent = enemy.intentDisplay;
if (intent) {
  ctx.font = `${14 * mScale}px monospace`;
  ctx.fillStyle = intent.type === 'attack' ? '#ef4444' : '#22c55e';
  ctx.fillText(`${intentIcons[intent.type]} ${intent.value}`, ex, ey - radius - 12 * mScale);
}
```

**Why it matters:** This is the single highest-impact UX improvement. Players can make informed decisions about when to shield vs. attack, which enemy to target, and when to use resources. Every major deckbuilder (Slay the Spire, Monster Train, etc.) displays enemy intents.

---

### 1.6 — Damage Preview on End Turn Hover
- [ ] **Show total outgoing/incoming damage preview** (Proposal #396)

**What:** When hovering over the "End Turn" button, show a tooltip: "You deal ~X damage | Enemies deal ~Y damage".

**Where:** `SignalForgeGame.tsx` → tooltip zone for the end-turn button, calculate a preview from `playedThisTurn` + enemy intents.

**Implementation:**
```typescript
// In the tooltip zone registration for End Turn button:
// Calculate preview:
const previewDmg = this.state.playedThisTurn.reduce((sum, c) => {
  let d = c.getEffectiveDamage();
  d += this.state.playerTempo; // tempo bonus from 1.2
  return sum + d;
}, 0) + matchBonus; // if sequence would match

const previewEnemyDmg = this.state.enemies.reduce((sum, e) => {
  return sum + e.getDamage() + empowerBonus;
}, 0);
const previewAfterShield = Math.max(0, previewEnemyDmg - this.state.playerShield);

// Tooltip text:
`End Turn | You deal ~${previewDmg} | Take ~${previewAfterShield} (${previewEnemyDmg} - ${this.state.playerShield} shield)`
```

---

## Phase 2 — Status Effects & New Keywords

These add mechanical vocabulary that every subsequent feature builds on.

### 2.1 — Status Effect System
- [x] **Implement Vulnerable, Weak, Bleed, and Freeze** (Proposals #176-180)

**What:** A general-purpose status effect system that tracks buffs/debuffs on both player and enemies with turn-based duration.

**New types** (add to a new file `lib/signal-forge/StatusEffect.ts`):
```typescript
export type StatusType = 'vulnerable' | 'weak' | 'bleed' | 'freeze' | 'marked';

export interface StatusEffect {
  type: StatusType;
  stacks: number;    // intensity (bleed damage) or flat count
  duration: number;  // turns remaining (-1 = permanent until cleansed)
}
```

**Add to `EnemyData`:**
```typescript
statusEffects: StatusEffect[];
```

**Add to `GameState`:**
```typescript
playerStatuses: StatusEffect[];
```

**Effect definitions:**

| Status | Applied To | Effect | Duration |
|--------|-----------|--------|----------|
| **Vulnerable** | Enemy | Takes **+50%** damage from all sources | 2 turns |
| **Weak** | Enemy | Deals **-25%** damage | 2 turns |
| **Bleed** | Enemy | Takes `stacks` damage at **start** of each turn. Stacks additively. | `duration` turns |
| **Freeze** | Enemy | Skips next attack entirely. Consumed on trigger. | 1 turn |
| **Marked** | Enemy | Takes **+5 flat** damage from all sources | 2 turns |

**Integration in `endTurn()`:**

```typescript
// --- START OF TURN EFFECTS (before player damage) ---
// Bleed ticks on enemies:
this.state.enemies.forEach(e => {
  const bleed = e.statusEffects.find(s => s.type === 'bleed');
  if (bleed && bleed.stacks > 0) {
    e.hp -= bleed.stacks;
    this.state.combatLog.push(`${e.name} takes ${bleed.stacks} bleed damage.`);
    bleed.duration--;
    if (bleed.duration <= 0) {
      e.statusEffects = e.statusEffects.filter(s => s.type !== 'bleed');
    }
  }
});

// --- DAMAGE RESOLUTION (per card) ---
// Vulnerable check:
const vulnerable = enemy.statusEffects.find(s => s.type === 'vulnerable');
const marked = enemy.statusEffects.find(s => s.type === 'marked');
let damageMultiplier = 1.0;
if (vulnerable) damageMultiplier *= 1.5;
let flatBonus = 0;
if (marked) flatBonus += 5;
const finalCardDmg = Math.floor((totalCardDmg + flatBonus) * damageMultiplier);

// --- ENEMY ATTACK PHASE ---
// Freeze check:
const frozen = enemy.statusEffects.find(s => s.type === 'freeze');
if (frozen) {
  // Skip this enemy's attack entirely
  enemy.statusEffects = enemy.statusEffects.filter(s => s.type !== 'freeze');
  this.state.combatLog.push(`${enemy.name} is frozen and cannot attack!`);
  continue; // skip to next enemy
}

// Weak check:
const weak = enemy.statusEffects.find(s => s.type === 'weak');
let enemyDmg = enemy.getDamage() + empowerBonus;
if (weak) enemyDmg = Math.floor(enemyDmg * 0.75);

// --- END OF TURN: decrement all status durations ---
this.state.enemies.forEach(e => {
  e.statusEffects.forEach(s => { if (s.duration > 0) s.duration--; });
  e.statusEffects = e.statusEffects.filter(s => s.duration !== 0);
});
```

**Visual rendering:** Small icons below enemy HP bars showing active statuses with stack/duration counters.

**Why it matters:** Status effects are the connective tissue for waveform identity. Saw applies Bleed (damage-over-time aggression). Sine applies Freeze (defensive control). Noise applies Vulnerable/Marked (risk/reward amplification). Pulse gets Weak (utility disruption). Every new card, enemy, and relic can interact with this system.

---

### 2.2 — New Keywords: Piercing, Chain, Growing, Retain, Multihit, Innate, Ethereal, Siphon
- [x] **Extend `CardData` interface with new keyword properties**

**Where:** `lib/signal-forge/Card.ts` — add to `CardData` interface:

```typescript
// New keyword fields:
piercing?: boolean;     // Ignores enemy Armored reduction
chain?: boolean;        // Next card of same waveform type costs -1 energy
growing?: number;       // +N damage/shield each time played this combat (tracked per card instance)
retain?: boolean;       // Stays in hand between turns (not discarded at end of turn)
multihit?: number;      // Hits target N times (each hit applies damage, shield, armored separately)
bleed?: number;         // Applies N stacks of Bleed to target (from 2.1)
freeze?: boolean;       // Applies Freeze to target (from 2.1)
vulnerable?: number;    // Applies N turns of Vulnerable to target
weak?: number;          // Applies N turns of Weak to target
innate?: boolean;       // Always in opening hand at start of combat
ethreal?: boolean;      // If not played this turn, exhaust at end of turn
siphon?: number;        // Steal N shield from target enemy and add to player
```

**Add to `Card` class:**
```typescript
growthCounter: number = 0; // Tracks how many times this card has been played this combat

getEffectiveDamage(): number {
  let dmg = this.damage;
  if (this.growing) dmg += this.growthCounter * this.growing;
  if (this.echo) dmg = Math.floor(dmg * 1.5);
  return dmg;
}

getEffectiveShield(): number {
  let shd = this.shield;
  if (this.growing) shd += this.growthCounter * this.growing;
  return shd;
}
```

**Keyword processing in `endTurn()` damage loop:**

```typescript
// Piercing:
if (card.piercing) {
  // Skip the Armored reduction step in takeDamage
  // Either: add a param to takeDamage(dmg, turn, piercing)
  // Or: temporarily set enemy.armored = 0, apply, restore
}

// Multihit:
const hits = card.multihit ?? 1;
for (let h = 0; h < hits; h++) {
  enemy.takeDamage(perHitDmg, turn, card.piercing);
}

// Bleed application:
if (card.bleed && card.bleed > 0) {
  const existing = enemy.statusEffects.find(s => s.type === 'bleed');
  if (existing) {
    existing.stacks += card.bleed;
    existing.duration = Math.max(existing.duration, 2);
  } else {
    enemy.statusEffects.push({ type: 'bleed', stacks: card.bleed, duration: 2 });
  }
}

// Freeze:
if (card.freeze) {
  enemy.statusEffects.push({ type: 'freeze', stacks: 1, duration: 1 });
}

// Vulnerable:
if (card.vulnerable) {
  const existing = enemy.statusEffects.find(s => s.type === 'vulnerable');
  if (existing) existing.duration += card.vulnerable;
  else enemy.statusEffects.push({ type: 'vulnerable', stacks: 1, duration: card.vulnerable });
}

// Weak:
if (card.weak) {
  const existing = enemy.statusEffects.find(s => s.type === 'weak');
  if (existing) existing.duration += card.weak;
  else enemy.statusEffects.push({ type: 'weak', stacks: 1, duration: card.weak });
}
```

**Chain processing in `playCard()`:**
```typescript
if (card.chain) {
  // Set a flag: next card of same waveform type costs -1
  this.state.chainDiscount = { type: card.type, amount: 1 };
}
// When calculating card cost:
if (this.state.chainDiscount && card.type === this.state.chainDiscount.type) {
  effectiveCost = Math.max(0, card.cost - this.state.chainDiscount.amount);
  this.state.chainDiscount = undefined; // consumed
}
```

**Retain processing in `endTurn()`:**
```typescript
// When discarding hand at end of turn:
const retained: Card[] = [];
const discarded: Card[] = [];
const exhausted: Card[] = [];
this.state.hand.forEach(c => {
  if (c.ethereal) {
    exhausted.push(c); // Ethereal cards not played → exhaust
    this.state.combatLog.push(`${c.name} fades away (Ethereal).`);
  } else if (c.retain) {
    retained.push(c);
  } else {
    discarded.push(c);
  }
});
this.state.discard.push(...discarded);
// exhausted cards go to exhaust pile (or just removed)
this.state.hand = retained;
// Then draw (handSize - retained.length) new cards
```

**Innate processing in `drawHandCards()` at combat start (turn 1 only):**
```typescript
// At start of combat, before normal draw:
if (this.state.turn === 1) {
  const innateCards = this.state.deck.filter(c => c.innate);
  innateCards.forEach(c => {
    this.state.hand.push(c);
    this.state.deck = this.state.deck.filter(d => d.id !== c.id);
  });
  // Then draw (handSize - innateCards.length) more cards normally
}
```

**Siphon processing in `endTurn()` damage loop:**
```typescript
// Siphon: steal shield from enemy
if (card.siphon && card.siphon > 0) {
  const stolen = Math.min(enemy.shield ?? 0, card.siphon);
  enemy.shield = (enemy.shield ?? 0) - stolen;
  this.state.playerShield += stolen;
  this.state.combatLog.push(`Siphoned ${stolen} shield from ${enemy.name}!`);
}
```

**Growing tracking in `playCard()`:**
```typescript
if (card.growing) {
  card.growthCounter = (card.growthCounter ?? 0) + 1;
}
```
Reset `growthCounter` to 0 for all cards at the start of each combat (in `proceedFromShop` / `startGame`).

---

### 2.3 — Add `chainDiscount` and `growthCounter` to GameState
- [x] **Extend GameState to support new keyword state tracking**

```typescript
// Add to GameState interface:
chainDiscount?: { type: WaveformType; amount: number }; // from Chain keyword
```

Add to `Card` class:
```typescript
growthCounter: number = 0;
```

Add reset in `proceedFromShop()` / `startGame()`:
```typescript
this.state.deckList.forEach(c => { c.growthCounter = 0; });
```

Add to save/load serialization: `growthCounter` is per-combat, doesn't need to persist between floors (always resets).

---

## Phase 3 — New Cards (Using New Keywords)

These cards use the keywords from Phase 2 and fill gaps in the waveform identities.

### 3.1 — 8 New Common Cards
- [x] **Add to `cardTemplates` array in `Card.ts`**

| Name | Type | Cost | Dmg | Shd | Keywords/Effects | Description |
|------|------|------|-----|-----|-----------------|-------------|
| **Pulse Echo** | Pulse | 1 | 5 | 0 | `echo: true` | Deal 5 damage. Echo. |
| **Sine Pulse** | Sine | 0 | 0 | 4 | `tempoGain: 1` | Gain 4 shield. +1 Tempo. |
| **Saw Blitz** | Saw | 1 | 4 | 0 | `chain: true, draw: 1` | Deal 4 damage. Draw 1. Chain. |
| **Noise Tap** | Noise | 0 | 3 | 0 | `tempoGain: 2, staticGain: 1` | Deal 3 damage. +1 Static. +2 Tempo. |
| **Pulse Guard** | Pulse | 1 | 3 | 5 | — | Deal 3 damage. Gain 5 shield. |
| **Sine Weave** | Sine | 1 | 0 | 6 | `stabilize: 1` | Gain 6 shield. Stabilize 1. |
| **Saw Edge** | Saw | 1 | 7 | 0 | — | Deal 7 damage. |
| **Noise Burst** | Noise | 1 | 6 | 0 | `staticGain: 2` | Deal 6 damage. +2 Static. |

**Template format** (example for Pulse Echo):
```typescript
{
  name: 'Pulse Echo',
  type: 'Pulse',
  rarity: 'common',
  cost: 1,
  damage: 5,
  shield: 0,
  echo: true,
  effect: 'Deal 5 damage. Echo.',
}
```

**Balance notes:**
- These fill waveform identity gaps: Pulse gets a cheap echo + a hybrid card. Sine gets a 0-cost option + anti-glitch defense. Saw gets pure efficient damage + a chain enabler. Noise gets a tempo filler + a risk/reward damage card.
- All are priced at the same DPE range as existing commons (5.0–7.5 effective per energy).

---

### 3.2 — 10 New Uncommon Cards
- [x] **Add to `cardTemplates` array in `Card.ts`**

| Name | Type | Cost | Dmg | Shd | Keywords/Effects | Description |
|------|------|------|-----|-----|-----------------|-------------|
| **Resonant Strike** | Pulse | 2 | 10 | 0 | `growing: 2` | Deal 10 damage. Growing (+2 per play). |
| **Frequency Lock** | Sine | 1 | 0 | 8 | `retain: true` | Gain 8 shield. Retain. |
| **Razor Cascade** | Saw | 2 | 6 | 0 | `ricochet: 50`* | Deal 6 damage. 50% splash to random other enemy. |
| **Static Primer** | Noise | 1 | 4 | 0 | `staticGain: 3, draw: 1` | Deal 4 damage. +3 Static. Draw 1. |
| **Phase Strike** | Pulse | 1 | 7 | 0 | `piercing: true` | Deal 7 damage. Piercing. |
| **Buzzsaw** | Saw | 2 | 5 | 0 | `multihit: 2` | Deal 5 damage ×2 hits. |
| **Serrated Edge** | Saw | 1 | 6 | 0 | `bleed: 3` | Deal 6 damage. Apply 3 Bleed. |
| **White Noise** | Noise | 2 | 0 | 0 | special: `damage = playerStatic * 3` | Deal damage equal to Static ×3. |
| **Echo Cascade** | Pulse | 2 | 8 | 0 | `echo: true, tempoGain: 2` | Deal 8 damage. Echo. +2 Tempo. |
| **Sine Reflection** | Sine | 1 | 0 | 0 | special: `shield = max(5, damageTakenLastTurn)` | Gain shield equal to damage taken last turn (min 5). |
| **Signal Boost** | Pulse | 1 | 0 | 0 | special: hand buff | All Pulse cards in hand deal +4 damage this turn. |
| **Barrier Shift** | Sine | 1 | 0 | 6 | special: shield-to-damage | Convert all current shield to damage on target, then gain 6 new shield. |
| **Chaos Theory** | Noise | 1 | 0 | 0 | `volatile: true` | Volatile: deal 3–12 damage, draw 0–2 cards. |
| **Shield Siphon** | Sine | 1 | 0 | 0 | `siphon: 8` | Steal up to 8 shield from target enemy. |

*Ricochet can be implemented as a simple secondary `takeDamage` call to a random other living enemy for `Math.floor(dmg * 0.5)`.

**Key synergies these enable:**
- **Resonant Strike + reshuffle (1.1):** Grows stronger each play. With reshuffle, you see it multiple times per combat. By 5th play: 18 damage for 2 energy.
- **Phase Strike + Piercing (2.2):** Directly counters Iron Brute (Armored 2), Null Sentinel (Armored 3). Saw's Buzzsaw multi-hit also works against armored (each hit triggers armor separately, so 5-2=3 × 2 = 6 vs. 10-2=8).
- **Serrated Edge + Bleed (2.1):** Saw's identity becomes "aggressive sustained damage." 6 upfront + 3+3 over 2 turns = 12 total for 1 energy.
- **White Noise + Static Embrace archetype:** At 4 Static = 12 damage for 2 energy. At 8 Static = 24 damage. The payoff for intentionally building Static.
- **Frequency Lock + Retain (2.2):** 8 shield every turn without using a Sustain slot. Enables Shield Fortress archetype without heavy Sine Loom dependence.
- **Signal Boost + Pulse-heavy decks:** Spend 1 energy to buff all Pulse cards in hand by +4. With 3 Pulse cards, that's +12 total damage for 1 energy.
- **Barrier Shift + Shield Fortress:** Convert a 30-shield stockpile into 30 damage, then immediately get 6 new shield. Shield Nova's little brother.
- **Chaos Theory + Gamble archetype:** High variance card that can deal 12 + draw 2 on a highroll or 3 + nothing on a lowroll. Fun and exciting.
- **Shield Siphon + anti-Shield Relay:** Steals shield from enemies like Shield Relay that stack shield on allies. Turns their defense into yours.

**White Noise special implementation:**
```typescript
// In endTurn() damage loop, detect White Noise by name or add a special flag:
if (card.name === 'White Noise') {
  cardDamage = this.state.playerStatic * 3;
}
```

**Sine Reflection special implementation:**
```typescript
// Track damage taken last turn:
// Add to GameState: damageTakenLastTurn: number
// Set in endTurn() after enemy attacks: this.state.damageTakenLastTurn = totalEnemyDamage;
// In shield application for Sine Reflection:
if (card.name === 'Sine Reflection') {
  cardShield = Math.max(5, this.state.damageTakenLastTurn ?? 5);
}
```

---

### 3.3 — 10 New Rare Cards
- [ ] **Add to `cardTemplates` array in `Card.ts`**

| Name | Type | Cost | Dmg | Shd | Keywords/Effects | Description |
|------|------|------|-----|-----|-----------------|-------------|
| **Omega Pulse** | Pulse | 3 | 25 | 0 | `echo: true, exhaust: true` | Deal 25 damage. Echo. Exhaust. |
| **Absolute Zero** | Sine | 3 | 0 | 30 | `freeze: true` (all enemies) | Gain 30 shield. Freeze ALL enemies. |
| **Final Cut** | Saw | 2 | 0 | 0 | `exhaust: true`, special | Deal damage = (cards played this turn) × 8. Exhaust. |
| **Entropy Bomb** | Noise | 3 | 0 | 0 | `exhaust: true`, special | Deal damage = Static × 8. Reset Static to 0. Exhaust. |
| **Perpetual Engine** | Pulse | 1 | 4 | 0 | `sustain: true, draw: 1` | Deal 4 damage. Draw 1. Sustain. |
| **Void Shield** | Sine | 2 | 0 | 15 | special: persist | Gain 15 shield. If unbroken at end of turn, shield persists. |
| **Chain Lightning** | Saw | 2 | 12 | 0 | special: cascade | Deal 12 to target, 8 to next, 4 to third. |
| **Glitch Exploit** | Noise | 0 | 0 | 0 | `exhaust: true`, special | All Glitch cards in hand deal 8 damage each. Exhaust. |
| **Shield Nova** | Sine | 3 | 0 | 0 | `aoe: true`, special | Deal damage = current shield to ALL enemies. Keep shield. |
| **Blade Storm** | Saw | 3 | 4 | 0 | special: tempo-scaling | Deal 4 damage × (current tempo) times to random enemies. |
| **Pattern Forge** | Wildcard | 2 | 8 | 0 | `wildcard: true`, special | Wildcard. Deal 8 damage. Fill current AND next sequence slot. |
| **Harmonic Convergence** | Wildcard | 3 | 0 | 0 | `aoe: true`, special | Deal 5 damage per unique waveform type played this turn, AOE. |
| **Recursion** | Pulse | 2 | 0 | 0 | special: copy | Replay the last card you played this turn (copy its effects). |
| **System Crash** | Noise | 2 | 0 | 0 | `exhaust: true`, special | Deal 5 damage per Static to ALL enemies. Reset Static. Draw 2. |
| **Adaptive Protocol** | Wildcard | 1 | 0 | 0 | `modal: true` | Choose one: Deal 12 damage, Gain 14 shield, Draw 3, or Stabilize 3. |
| **Time Warp** | Wildcard | 4 | 0 | 0 | `exhaust: true`, special | Take an extra turn after this one (no energy regen on bonus turn). |

**Special card implementations:**

```typescript
// Final Cut:
if (card.name === 'Final Cut') {
  cardDamage = this.state.playedThisTurn.length * 8;
}

// Entropy Bomb:
if (card.name === 'Entropy Bomb') {
  cardDamage = this.state.playerStatic * 8;
  this.state.playerStatic = 0;
}

// Chain Lightning:
if (card.name === 'Chain Lightning') {
  const livingEnemies = this.state.enemies.filter(e => e.hp > 0);
  const targetIdx = livingEnemies.findIndex(e => e.id === this.state.selectedEnemyId);
  const cascadeDmg = [12, 8, 4];
  livingEnemies.forEach((e, i) => {
    if (i < 3) {
      // Reorder so target is first
      const idx = (targetIdx + i) % livingEnemies.length;
      livingEnemies[idx].takeDamage(cascadeDmg[i], this.state.turn);
    }
  });
  // Skip normal damage application for this card
}

// Glitch Exploit:
if (card.name === 'Glitch Exploit') {
  const glitchCards = this.state.hand.filter(c => c.isGlitch);
  glitchCards.forEach(gc => {
    // Deal 8 damage to selected enemy
    const target = this.state.enemies.find(e => e.id === this.state.selectedEnemyId);
    if (target) target.takeDamage(8, this.state.turn);
    // Remove glitch from hand (to exhaust pile or just remove)
  });
}

// Shield Nova:
if (card.name === 'Shield Nova') {
  cardDamage = this.state.playerShield; // damage = current shield, shield stays
}

// Blade Storm:
if (card.name === 'Blade Storm') {
  const hitCount = this.state.playerTempo;
  const livingEnemies = this.state.enemies.filter(e => e.hp > 0);
  for (let h = 0; h < hitCount; h++) {
    const randomTarget = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
    if (randomTarget) randomTarget.takeDamage(4 + tempoBonusDmg, this.state.turn);
  }
}

// Pattern Forge:
if (card.name === 'Pattern Forge') {
  // Fill current sequence slot (already handled by wildcard)
  // Also fill the NEXT slot automatically:
  if (this.state.currentSequence.length < this.state.targetSequence.length) {
    this.state.currentSequence.push('*'); // wildcard fill for next slot
  }
}

// Harmonic Convergence:
if (card.name === 'Harmonic Convergence') {
  const uniqueTypes = new Set(this.state.playedThisTurn.map(c => c.type));
  cardDamage = uniqueTypes.size * 5; // 5 per unique type, AOE
}

// Recursion:
if (card.name === 'Recursion') {
  const lastPlayed = this.state.playedThisTurn[this.state.playedThisTurn.length - 2]; // -2 because Recursion itself is -1
  if (lastPlayed) {
    // Copy the last card's damage/shield/effects
    cardDamage = lastPlayed.getEffectiveDamage();
    cardShield = lastPlayed.getEffectiveShield();
    // Also copy keywords: bleed, freeze, etc.
  }
}

// System Crash:
if (card.name === 'System Crash') {
  cardDamage = this.state.playerStatic * 5; // AOE
  this.state.playerStatic = 0;
  this.drawSingleCard();
  this.drawSingleCard(); // draw 2
}

// Adaptive Protocol:
if (card.name === 'Adaptive Protocol') {
  // Show modal choice UI before resolving:
  // Option A: 12 damage to target
  // Option B: 14 shield
  // Option C: Draw 3 cards
  // Option D: Stabilize 3 (-3 Static)
  // Store choice in a temporary state, resolve in endTurn
}

// Time Warp:
if (card.name === 'Time Warp') {
  this.state.bonusTurnQueued = true;
  // After endTurn() completes, if bonusTurnQueued:
  // - Don't regen energy (use leftover)
  // - Draw new hand
  // - Player gets another full turn
  // - Reset bonusTurnQueued
}

// Void Shield:
// Add field to GameState: voidShieldActive: boolean
// In endTurn() shield reset section:
if (!this.state.ownedRelics.some(r => r.key === 'sine_loom')) {
  if (this.state.voidShieldActive && this.state.playerShield >= 15) {
    // Keep up to 15 shield (the Void Shield portion)
    // Reset excess above 15 if not from Sine Loom
    this.state.voidShieldActive = false; // one-time persist
  } else {
    this.state.playerShield = 0;
  }
}
```

**Archetype payoffs these rares provide:**
- **Tempo Rush:** Final Cut (2 cost, 5 cards played = 40 damage) + Blade Storm (3 cost, tempo 6 = 24 random damage)
- **Shield Fortress:** Shield Nova (3 cost, 30 shield = 30 AOE damage while keeping defense) + Void Shield (persistent 15)
- **Static Embrace:** Entropy Bomb (3 cost, 8 Static = 64 damage!!!) + Glitch Exploit (0 cost, turn Glitches into offense)
- **Echo Engine:** Omega Pulse (3 cost, 25+12.5 echo = 37.5 damage, exhaust)
- **Engine/Sustain:** Perpetual Engine (1 cost, 4 damage + draw 1 + Sustain = infinite value)
- **Control:** Absolute Zero (3 cost, 30 shield + freeze all = skip an entire enemy cycle)

---

### 3.4 — 3 New Curse/Negative Cards
- [ ] **Add to `cardTemplates` in `Card.ts`**

| Name | Type | Cost | Effect | Source |
|------|------|------|--------|--------|
| **Corrupted Signal** | Noise | 99 | Unplayable. Wastes a hand slot. Exhausts at end of combat. | Injected by Curse Caster enemy |
| **Malware** | Noise | 0 | When drawn, lose 1 energy this turn. Exhaust. | Injected by new enemies/events |
| **Overheated Module** | Noise | 0 | Ethereal: exhaust if not played. If played: +3 Static. If exhausted: 8 self-damage. | Injected by events |

**Implementation for Malware (draw-triggered):**
```typescript
// In drawHandCards(), after a card is drawn:
if (card.name === 'Malware') {
  this.state.playerEnergy = Math.max(0, this.state.playerEnergy - 1);
  this.state.combatLog.push('Malware! Lost 1 energy.');
  // Immediately exhaust it (don't add to hand)
  // Or add to hand as a 0-cost exhaust card
}
```

---

## Phase 4 — New Enemies

These use the status effects from Phase 2 and test the archetypes enabled by Phase 3 cards.

### 4.1 — 5 New Common Enemies
- [ ] **Add to `enemyTemplates` array in `Enemy.ts`**

| Name | HP | Dmg | Tier | Abilities | Design Intent |
|------|-----|-----|------|-----------|---------------|
| **Signal Rat** | 12 | 2 | common | On death: inject 1 Glitch into discard | Punishes careless kills; teaches glitch management |
| **Tempo Leech** | 14 | 2 | common | `tempoSiphon: 1` (steal 1 tempo/turn) | Anti-tempo; with tempo now dealing damage (1.2), this is a real threat |
| **Noise Imp** | 8 | 4 | common | None (glass cannon) | Teaches priority targeting — kill fast or eat big hits |
| **Heal Sprite** | 10 | 1 | common | `regen: 3` (heals ALL allies for 3/turn) | Priority target; teaches focus fire |
| **Static Mite** | 6 | 1 | common | On death: +3 Static to player | Small threat, punishes AOE that kills multiple at once |

**New enemy abilities to add to `EnemyData` / `EnemyTemplate`:**
```typescript
tempoSiphon?: number;   // Steal N tempo from player each turn
onDeathGlitch?: number; // Inject N glitch cards into player discard on death
onDeathStatic?: number; // Add N static to player on death
```

**Implementation for `tempoSiphon`:**
```typescript
// In endTurn(), in the enemy abilities phase:
this.state.enemies.forEach(e => {
  if (e.tempoSiphon && e.tempoSiphon > 0 && e.hp > 0) {
    const stolen = Math.min(this.state.playerTempo, e.tempoSiphon);
    this.state.playerTempo -= stolen;
    this.state.combatLog.push(`${e.name} steals ${stolen} tempo!`);
  }
});
```

**Implementation for on-death effects:**
```typescript
// In endTurn(), when removing defeated enemies:
const defeated = this.state.enemies.filter(e => e.hp <= 0);
defeated.forEach(e => {
  if (e.onDeathGlitch && e.onDeathGlitch > 0) {
    for (let i = 0; i < e.onDeathGlitch; i++) {
      const glitch = createGlitchCard(); // existing function
      this.state.discard.push(glitch);
    }
    this.state.combatLog.push(`${e.name} dies and corrupts your deck!`);
  }
  if (e.onDeathStatic && e.onDeathStatic > 0) {
    this.state.playerStatic += e.onDeathStatic;
    this.state.combatLog.push(`${e.name} dies and releases ${e.onDeathStatic} static!`);
  }
});
```

**Why these 5:** Each targets a different archetype. Tempo Leech punishes Tempo Rush. Signal Rat/Static Mite punish spammy kills. Heal Sprite punishes slow control decks. Noise Imp punishes low-shield builds. Together they ensure no single strategy dominates floor 1-3.

---

### 4.2 — 5 New Uncommon Enemies
- [ ] **Add to `enemyTemplates` array in `Enemy.ts`**

| Name | HP | Dmg | Tier | Abilities | Design Intent |
|------|-----|-----|------|-----------|---------------|
| **Overclock Bot** | 16 | 2 | uncommon | `enrage: true` (gains +1 damage per turn permanently) | Timer enemy — must kill fast |
| **Echo Disruptor** | 18 | 3 | uncommon | Aura: Echo keyword doesn't trigger on player cards | Counters Echo Engine archetype directly |
| **Dampener** | 14 | 2 | uncommon | Aura: all player cards deal -2 damage (min 0) | Must be killed first for DPS; tests target priority |
| **Splitter** | 20 | 3 | uncommon | At ≤50% HP, dies and spawns 2 Half-Splitters (8 HP, 2 dmg each) | Tests AOE; rewards holding burst for second phase |
| **Waveform Guardian** | 22 | 2 | uncommon | Immune to 1 random waveform type each turn (shown via icon) | Forces diverse decks; tests adaptation |

**New enemy abilities:**
```typescript
auraEchoCanceled?: boolean;  // Suppresses Echo keyword while alive
auraDamageReduction?: number; // Reduces all player card damage by N while alive
splitOnDeath?: { hp: number; damage: number; count: number }; // Spawn N mini-enemies
immuneType?: WaveformType;   // Immune to this waveform (changes each turn)
```

**Aura implementation (Echo cancel + Damage reduction):**
```typescript
// In endTurn(), before the per-card damage loop:
const echoCanceled = this.state.enemies.some(e => e.auraEchoCanceled && e.hp > 0);
const auraDmgReduce = this.state.enemies
  .filter(e => e.auraDamageReduction && e.hp > 0)
  .reduce((sum, e) => sum + (e.auraDamageReduction ?? 0), 0);

// Per card:
let effectiveDmg = card.getEffectiveDamage();
if (echoCanceled && card.echo) {
  // Recalculate without echo: use base damage only
  effectiveDmg = card.damage + (card.growing ? card.growthCounter * card.growing : 0);
}
effectiveDmg = Math.max(0, effectiveDmg - auraDmgReduce);
```

**Splitter implementation:**
```typescript
// In defeated enemy processing:
if (e.splitOnDeath && e.hp <= 0) {
  // Don't count as killed yet — spawn children
  for (let i = 0; i < e.splitOnDeath.count; i++) {
    const child = new Enemy({
      id: nextEnemyId++,
      name: 'Half-Splitter',
      hp: Math.floor(e.splitOnDeath.hp * hpScale),
      maxHp: Math.floor(e.splitOnDeath.hp * hpScale),
      damage: Math.floor(e.splitOnDeath.damage * dmgScale),
      intent: 'Attacks each turn',
    });
    this.state.enemies.push(child);
  }
}
```

**Waveform Guardian immune type rotation:**
```typescript
// At start of each turn (in endTurn or a startTurn method):
this.state.enemies.forEach(e => {
  if (e.immuneType !== undefined) {
    const types: WaveformType[] = ['Pulse', 'Sine', 'Saw', 'Noise'];
    e.immuneType = types[Math.floor(Math.random() * types.length)];
  }
});
// In damage application:
if (enemy.immuneType && card.type === enemy.immuneType) {
  // Skip damage, show "IMMUNE" text
  continue;
}
```

---

### 4.3 — 3 New Elite Enemies
- [ ] **Add to `enemyTemplates` array in `Enemy.ts`**

| Name | HP | Dmg | Tier | Abilities | Design Intent |
|------|-----|-----|------|-----------|---------------|
| **The Compiler** | 30 | 3 | elite | Every 3rd turn: deals 15 damage instead of base. Telegraphed 1 turn before. | Teaches reading intents, saving shield for big hits |
| **Time Eater** | 24 | 3 | elite | If player plays 5+ cards in one turn, gains +10 shield and +3 bonus damage next turn | Counters Tempo Rush; forces measured play |
| **Null Sentinel** | 35 | 4 | elite | `armored: 3` | Tests Piercing keyword; massive effective HP |

**The Compiler AI:**
```typescript
// Add to EnemyData: compileCounter?: number
// In enemy intent calculation:
if (enemy.name === 'The Compiler') {
  enemy.compileCounter = (enemy.compileCounter ?? 0) + 1;
  if (enemy.compileCounter % 3 === 0) {
    enemy.intentDisplay = { type: 'attack', value: 15, label: 'COMPILE!' };
    // Actual damage on this turn = 15
  } else if (enemy.compileCounter % 3 === 2) {
    enemy.intentDisplay = { type: 'special', value: 0, label: 'Charging...' };
    // Normal damage this turn, but telegraph the big hit
  }
}
```

**Time Eater reaction to player card count:**
```typescript
// Add to EnemyData: timeEaterCharged?: boolean
// In endTurn(), after counting playedThisTurn:
this.state.enemies.forEach(e => {
  if (e.name === 'Time Eater' && e.hp > 0) {
    if (this.state.playedThisTurn.length >= 5) {
      e.shield = (e.shield ?? 0) + 10;
      e.timeEaterCharged = true; // +3 bonus dmg next turn
      this.state.combatLog.push('Time Eater absorbs your frenzy! +10 shield, +3 damage next turn.');
    }
  }
});
// In getDamage(): if timeEaterCharged, add 3, then reset flag
```

---

### 4.4 — 2 New Bosses
- [ ] **Add to `enemyTemplates` array in `Enemy.ts`**

#### The Debugger (Floor 5 Boss)
| Stat | Value |
|------|-------|
| HP | 60 |
| Damage | 3 |
| Tier | boss |
| Phase 1 (100-66% HP) | Normal attacks (3 dmg) and shields (8 shield), weighted random |
| Phase 2 (66-33% HP) | "Debug Mode": passive regen 5/turn, attacks deal 5 |
| Phase 3 (33-0% HP) | "Patch Deployed": immune to the waveform type the player has the most of in their `deckList` |

```typescript
// Boss AI implementation (simplified):
// Add to EnemyData: bossPhase?: number, immuneToType?: WaveformType
// In intent calculation:
if (enemy.name === 'The Debugger') {
  const hpPercent = enemy.hp / enemy.maxHp;
  if (hpPercent > 0.66) {
    // Phase 1: 50% attack (3), 30% shield (8), 20% attack (5)
    enemy.bossPhase = 1;
  } else if (hpPercent > 0.33) {
    // Phase 2: regen 5/turn, attacks deal 5
    enemy.bossPhase = 2;
    enemy.regen = 5;
  } else {
    // Phase 3: immune to player's dominant type
    enemy.bossPhase = 3;
    enemy.regen = 0;
    const typeCounts: Record<string, number> = {};
    this.state.deckList.forEach(c => {
      typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1;
    });
    enemy.immuneToType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] as WaveformType;
  }
}
```

**Why The Debugger works:** Phase 1 teaches the fight. Phase 2 tests sustained DPS (regen 5 is significant — player must deal 5+ damage per turn just to break even). Phase 3 tests deck diversity — if you went all-in on one waveform type, you'll struggle. This rewards the balanced decks that the pattern system encourages.

#### The Overwriter (Floor 10 Boss)
| Stat | Value |
|------|-------|
| HP | 80 |
| Damage | 4 |
| Tier | boss |
| Armored | 1 |
| Phase 1 (100-75% HP) | Normal attacks |
| Phase 2 (75-37% HP) | "Overwrite": each turn, replaces 1 random non-Glitch card in hand with a Glitch card |
| Phase 3 (37-0% HP) | "Full Overwrite": replaces 2 cards per turn. Race to kill before hand is destroyed. |

```typescript
// In endTurn(), during enemy abilities phase:
if (enemy.name === 'The Overwriter' && enemy.hp > 0) {
  const hpPercent = enemy.hp / enemy.maxHp;
  const overwriteCount = hpPercent <= 0.37 ? 2 : hpPercent <= 0.75 ? 1 : 0;
  for (let i = 0; i < overwriteCount; i++) {
    const nonGlitch = this.state.hand.filter(c => !c.isGlitch);
    if (nonGlitch.length > 0) {
      const target = nonGlitch[Math.floor(Math.random() * nonGlitch.length)];
      const targetIdx = this.state.hand.indexOf(target);
      // Replace with Glitch (original goes to discard, not permanently lost)
      this.state.discard.push(target);
      this.state.hand[targetIdx] = createGlitchCard();
      this.state.combatLog.push(`The Overwriter corrupts ${target.name}!`);
    }
  }
}
```

**Why The Overwriter works:** Clean Room relic and Blackout card become premium anti-Overwriter tech. Glitch Exploit becomes an offensive counter (turn the Overwriter's corruption against it). This boss tests Glitch management, a system that currently has minimal interactive depth.

---

### 4.5 — Additional Uncommon Enemies
- [ ] **Add to `enemyTemplates` array in `Enemy.ts`**

| Name | HP | Dmg | Tier | Abilities | Design Intent |
|------|-----|-----|------|-----------|---------------|
| **Pulse Mimic** | 16 | 3 | uncommon | Copies waveform type of player's last played card — if matched, +2 bonus damage | Punishes repetition; rewards type variety |
| **Glitch Hound** | 20 | 2 | uncommon | +1 damage per Glitch card in player's deck | Directly punishes Glitch accumulation; pairs with Static Embrace risk |
| **Curse Caster** | 12 | 2 | uncommon | Each turn, adds 1 unplayable Curse card (cost 99) to player's hand | Must-kill-first priority target |

**Pulse Mimic implementation:**
```typescript
// Track last waveform type played:
if (enemy.name === 'Pulse Mimic' && this.state.playedThisTurn.length > 0) {
  const lastType = this.state.playedThisTurn[this.state.playedThisTurn.length - 1].type;
  // If player's last played card matches Mimic's "attuned" type:
  enemy.mimicType = lastType;
  // In getDamage(): if mimicType matches any card in playedThisTurn, +2 bonus
}
```

**Glitch Hound implementation:**
```typescript
// In getDamage():
if (enemy.name === 'Glitch Hound') {
  const glitchCount = this.state.deckList.filter(c => c.isGlitch).length
    + this.state.hand.filter(c => c.isGlitch).length
    + this.state.discard.filter(c => c.isGlitch).length;
  return enemy.damage + glitchCount;
}
```

---

### 4.6 — Additional Elite Enemies
- [ ] **Add to `enemyTemplates` array in `Enemy.ts`**

| Name | HP | Dmg | Tier | Abilities | Design Intent |
|------|-----|-----|------|-----------|---------------|
| **Gravity Well** | 28 | 2 | elite | Aura: all player shield values are halved while alive | Hard counter to Shield Fortress; must be killed first |
| **Pattern Lock** | 20 | 2 | elite | On its turn, locks one slot of target sequence to a specific forced type | Disrupts pattern completion; tests adaptability |

**Gravity Well implementation:**
```typescript
// In shield application:
const gravityWellAlive = this.state.enemies.some(e => e.name === 'Gravity Well' && e.hp > 0);
if (gravityWellAlive) {
  effectiveShield = Math.floor(effectiveShield * 0.5);
}
```

**Pattern Lock implementation:**
```typescript
// In enemy abilities phase:
if (enemy.name === 'Pattern Lock' && enemy.hp > 0) {
  const types: WaveformType[] = ['Pulse', 'Sine', 'Saw', 'Noise'];
  const slotIdx = Math.floor(Math.random() * this.state.targetSequence.length);
  this.state.targetSequence[slotIdx] = types[Math.floor(Math.random() * types.length)];
  this.state.combatLog.push(`Pattern Lock forces slot ${slotIdx + 1} to ${this.state.targetSequence[slotIdx]}!`);
}
```

---

### 4.7 — Additional Boss: The Infinite Loop (Floor 15+)
- [ ] **Add to `enemyTemplates` array in `Enemy.ts`**

| Stat | Value |
|------|-------|
| HP | 100 |
| Damage | 4 |
| Tier | boss |
| Regen | 5 |
| Phase 1 (100-0% HP) | Normal attacks with regen 5/turn |
| On Death | Revives at 30 HP (max 2 revives) |
| Total Effective HP | 100 + 30 + 30 = 160 |

```typescript
if (enemy.name === 'The Infinite Loop' && enemy.hp <= 0) {
  enemy.reviveCount = (enemy.reviveCount ?? 0) + 1;
  if (enemy.reviveCount <= 2) {
    enemy.hp = 30;
    enemy.regen = 5 + enemy.reviveCount * 2; // regen grows each revive
    this.state.combatLog.push(`The Infinite Loop reboots! (${3 - enemy.reviveCount} lives remaining)`);
    // Don't count as killed yet
  }
}
```

**Why The Infinite Loop works:** Tests burst damage — can the player deal 30+ in one turn to prevent regen from kicking in? Creates demand for Entropy Bomb, Final Cut, and other big-damage finishers. The growing regen on each revive creates escalating urgency.

---

### 4.8 — New Enemy Abilities
- [ ] **Add new enemy ability types to `EnemyData` interface**

| Ability | Effect | Enemies That Use It |
|---------|--------|--------------------|
| **Adaptive Armor** | After being hit by a waveform type, gain +2 armor against that type permanently | New elite variant |
| **Counter-Attack** | When hit, deals 3 damage back to player | Applied to Saw Stalker upgrade |
| **Sequence Scramble** | Randomizes 1 slot of target sequence each turn | Pattern Lock elite |
| **Heal On Kill** | When an ally dies, this enemy heals 50% of dead ally's max HP | Heal Sprite upgrade |

```typescript
// Add to EnemyData interface:
counterAttack?: number;      // Deal N damage back when hit
adaptiveArmor?: Record<string, number>; // Waveform type → armor gained
healOnKill?: number;         // Heal % of dead ally's maxHP
reviveCount?: number;        // For Infinite Loop boss
mimicType?: WaveformType;    // For Pulse Mimic
```

---

## Phase 5 — New Relics

These amplify the archetypes and interact with the new keywords/statuses.

### 5.1 — 5 New Common Relics
- [ ] **Add to `relicTemplates` array in `Relic.ts`**

| Key | Name | Rarity | Price | Effect | Implementation |
|-----|------|--------|-------|--------|----------------|
| `signal_amplifier` | Signal Amplifier | common | 80 | All cards deal +1 damage | In `endTurn()`: `effectiveDmg += signalAmpCount;` |
| `waveform_tuner` | Waveform Tuner | common | 90 | First card of each waveform type per turn costs 1 less (extends Oscillator Core to all types) | In `playCard()`: track `firstTypePlayed` set, if type not in set, cost -1 |
| `quick_draw` | Quick Draw Module | common | 70 | Draw 1 extra card on first turn of each combat | In `drawHandCards()` first call: `handSize + quickDrawCount` |
| `hp_regen` | HP Regenerator | common | 90 | Heal 1 HP per turn during combat | In `endTurn()`: `this.state.playerHp = Math.min(maxHp, playerHp + hpRegenCount)` |
| `tempo_primer` | Tempo Primer | common | 70 | Start each combat with 2 tempo | In `proceedFromShop()` / `startGame()`: `playerTempo = 2 * tempoPrimerCount` |

**Implementation pattern** (matches existing relic handling — all relics are checked by `key` in the game engine):
```typescript
// Signal Amplifier:
const signalAmpCount = this.state.ownedRelics.filter(r => r.key === 'signal_amplifier').length;
// Add to per-card damage: effectiveDmg += signalAmpCount;

// Waveform Tuner:
const waveformTunerCount = this.state.ownedRelics.filter(r => r.key === 'waveform_tuner').length;
// In playCard(), before cost deduction:
if (waveformTunerCount > 0 && !this.state.waveformTypesPlayedThisTurn.has(card.type)) {
  effectiveCost = Math.max(0, effectiveCost - waveformTunerCount);
}
// After cost deduction: this.state.waveformTypesPlayedThisTurn.add(card.type);
// Reset the set at start of each turn.
```

**Add to GameState:**
```typescript
waveformTypesPlayedThisTurn: Set<WaveformType>; // for Waveform Tuner
```

---

### 5.2 — 6 New Uncommon Relics
- [ ] **Add to `relicTemplates` array in `Relic.ts`**

| Key | Name | Rarity | Price | Effect |
|-----|------|--------|-------|--------|
| `burn_fuel` | Burn Fuel | uncommon | 140 | When you exhaust a card, draw 1 |
| `momentum_core` | Momentum Core | uncommon | 150 | If you play 4+ cards in a turn, all cards cost 1 less next turn |
| `healing_pulse` | Healing Pulse | uncommon | 130 | Forge Burst completion heals 3 HP |
| `type_master` | Type Master | uncommon | 150 | Playing 3 different waveform types in one turn grants +1 energy |
| `damage_echo` | Damage Echo | uncommon | 140 | When you deal 15+ damage with a single card, deal 5 damage to all other enemies |
| `safe_landing` | Safe Landing | uncommon | 160 | After taking lethal damage, survive at 1 HP (once per combat) |

**Implementation details:**

```typescript
// Burn Fuel — in endTurn() or wherever Exhaust happens:
if (card.exhaust) {
  // ... existing exhaust logic ...
  const burnFuelCount = this.state.ownedRelics.filter(r => r.key === 'burn_fuel').length;
  for (let i = 0; i < burnFuelCount; i++) {
    this.drawSingleCard(); // new helper that draws 1 card from deck → hand
  }
}

// Momentum Core — in endTurn():
const momentumCoreCount = this.state.ownedRelics.filter(r => r.key === 'momentum_core').length;
if (momentumCoreCount > 0 && this.state.playedThisTurn.length >= 4) {
  this.state.momentumCoreActive = true; // flag for next turn
}
// In playCard() cost calculation:
if (this.state.momentumCoreActive) {
  effectiveCost = Math.max(0, effectiveCost - 1);
}
// Reset at end of NEXT turn: this.state.momentumCoreActive = false;

// Healing Pulse — in endTurn() after Forge Burst match:
if (matched) {
  const healPulseCount = this.state.ownedRelics.filter(r => r.key === 'healing_pulse').length;
  if (healPulseCount > 0) {
    this.state.playerHp = Math.min(this.state.playerMaxHp, this.state.playerHp + 3 * healPulseCount);
  }
}

// Type Master — in endTurn():
const typeMasterCount = this.state.ownedRelics.filter(r => r.key === 'type_master').length;
if (typeMasterCount > 0) {
  const uniqueTypes = new Set(this.state.playedThisTurn.map(c => c.type));
  if (uniqueTypes.size >= 3) {
    this.state.playerEnergy += typeMasterCount;
    this.state.combatLog.push(`Type Master: +${typeMasterCount} energy from waveform diversity!`);
  }
}

// Damage Echo — in per-card damage loop:
if (actualDamageDealt >= 15 && damageEchoCount > 0) {
  this.state.enemies.forEach(e => {
    if (e.id !== targetEnemy.id && e.hp > 0) {
      e.takeDamage(5 * damageEchoCount, this.state.turn);
    }
  });
}

// Safe Landing — in HP damage application:
if (this.state.playerHp <= 0 && !this.state.safeLandingUsed) {
  const safeLandingCount = this.state.ownedRelics.filter(r => r.key === 'safe_landing').length;
  if (safeLandingCount > 0) {
    this.state.playerHp = 1;
    this.state.safeLandingUsed = true; // reset each combat
    this.state.combatLog.push('Safe Landing saves you from death!');
  }
}
```

**Add to GameState:**
```typescript
momentumCoreActive: boolean;   // Momentum Core flag for next turn
safeLandingUsed: boolean;      // Safe Landing once-per-combat flag
```

**Key synergies:**
- **Burn Fuel + Exhaust Burst archetype:** Every exhaust draws a replacement. Razor Edge, Overclock, Signal Drain all become card-neutral.
- **Momentum Core + Tempo Rush:** Play 4+ cheap cards → next turn everything costs less → play even more.
- **Healing Pulse + Pattern Master:** Forge Burst every turn = 3 HP/turn sustain. Invaluable against long fights.
- **Type Master + diverse decks:** Rewards playing Pulse+Sine+Saw in one turn = +1 energy = more plays.
- **Damage Echo + high-damage cards:** Omega Pulse (25 dmg) triggers Damage Echo to deal 5 AOE splash. Chain Lightning naturally triggers it (12 dmg primary).
- **Safe Landing + Glass cannon builds:** Saw-heavy or Noise-heavy decks that sacrifice defense for offense get one free "oops."

---

### 5.3 — 4 New Rare Relics
- [ ] **Add to `relicTemplates` array in `Relic.ts`**

| Key | Name | Rarity | Price | Effect |
|-----|------|--------|-------|--------|
| `temporal_anchor` | Temporal Anchor | rare | 220 | Tempo doesn't reset at end of turn. Instead, lose 2 tempo per turn (min 0). |
| `void_harvester` | Void Harvester | rare | 230 | Exhausted cards grant +2 permanent damage to ALL cards for rest of combat. |
| `dual_wield` | Dual Wield | rare | 260 | First card you play each turn triggers twice (same energy cost). |
| `glitch_forge` | Glitch Forge | rare | 250 | Glitch cards transform into random uncommon cards when drawn. |

**Implementation:**

```typescript
// Temporal Anchor — in endTurn(), replace tempo reset:
const temporalAnchorCount = this.state.ownedRelics.filter(r => r.key === 'temporal_anchor').length;
if (temporalAnchorCount > 0) {
  this.state.playerTempo = Math.max(0, this.state.playerTempo - 2);
  // Tempo DECAYS instead of resetting — crucial for Tempo Rush archetype
} else {
  this.state.playerTempo = 0; // existing behavior
}

// Void Harvester — when a card exhausts:
const voidHarvesterCount = this.state.ownedRelics.filter(r => r.key === 'void_harvester').length;
if (voidHarvesterCount > 0 && card.exhaust) {
  this.state.voidHarvesterDmgBonus = 
    (this.state.voidHarvesterDmgBonus ?? 0) + 2 * voidHarvesterCount;
  this.state.combatLog.push(
    `Void Harvester: all cards deal +${this.state.voidHarvesterDmgBonus} permanent damage this combat!`
  );
}
// In per-card damage: effectiveDmg += this.state.voidHarvesterDmgBonus ?? 0;
// Reset at start of each combat: this.state.voidHarvesterDmgBonus = 0;

// Dual Wield — in endTurn() damage loop:
const dualWieldCount = this.state.ownedRelics.filter(r => r.key === 'dual_wield').length;
// Mark first card in playedThisTurn for double trigger:
if (dualWieldCount > 0 && cardIndex === 0) {
  // Apply this card's damage/shield/effects twice
  // Be careful: Echo already doubles at 50%. Dual Wield should trigger the card again at 100%.
  // So Dual Wield + Echo card = base + base + echo(base*0.5) = 2.5x
}

// Glitch Forge — in drawHandCards():
if (drawnCard.isGlitch && glitchForgeCount > 0) {
  // Transform into random uncommon card
  const uncommons = cardTemplates.filter(t => t.rarity === 'uncommon');
  const randomTemplate = uncommons[Math.floor(Math.random() * uncommons.length)];
  drawnCard = Card.fromTemplate(randomTemplate, nextCardId++);
  this.state.combatLog.push(`Glitch Forge transforms a glitch into ${drawnCard.name}!`);
}
```

**Add to GameState:**
```typescript
voidHarvesterDmgBonus: number; // cumulative +dmg from exhausting cards this combat
```

**Power-level analysis:**
- **Temporal Anchor** is the defining Tempo Rush relic. Tempo 6 → next turn starts at 4 → play 2 cards → back to 6. Sustained high tempo across turns makes every card hit harder (from 1.2).
- **Void Harvester** turns Exhaust Burst into a scaling engine. Exhaust 4 cards turn 1 → +8 dmg to all remaining cards permanently. By turn 3, even Pulse Tap (0 cost, 3 dmg) deals 11.
- **Dual Wield** is universally powerful. First card = double effect at full cost. Best with high-impact first plays: Sine Barrier (1st play = 28 shield for 2 energy), Phase Strike (14 piercing for 1 energy).
- **Glitch Forge** completely inverts the Glitch system. Static/Glitch generation becomes CARD GENERATION. Noise decks want Glitches now. Pairs with The Overwriter boss fight — the boss filling your hand with Glitches actually gives you random uncommons.

---

### 5.4 — 3 Cursed Relics (Powerful with Drawbacks)
- [ ] **Add to `relicTemplates` array in `Relic.ts`**

| Key | Name | Rarity | Price | Effect |
|-----|------|--------|-------|--------|
| `demon_core` | Demon Core | rare | 0 (free) | +2 energy per turn, but take 5 damage at start of each combat. |
| `shattered_mirror` | Shattered Mirror | rare | 50 | All card damage/shield values doubled, but enemy damage also doubled. |
| `overclocked_processor` | Overclocked Processor | rare | 80 | Draw 2 extra cards per turn, but Static threshold reduced by 2 (4→2). |

**Implementation:**
```typescript
// Demon Core — energy bonus:
const demonCoreCount = this.state.ownedRelics.filter(r => r.key === 'demon_core').length;
baseEnergy += 2 * demonCoreCount; // in endTurn energy reset
// Demon Core — self damage at combat start:
if (demonCoreCount > 0) {
  this.state.playerHp -= 5 * demonCoreCount;
  this.state.combatLog.push(`Demon Core burns for ${5 * demonCoreCount} damage!`);
}

// Shattered Mirror — in per-card damage and shield calculations:
const mirrorCount = this.state.ownedRelics.filter(r => r.key === 'shattered_mirror').length;
if (mirrorCount > 0) {
  effectiveDmg *= 2;
  effectiveShield *= 2;
}
// In enemy damage application:
if (mirrorCount > 0) {
  totalEnemyDmg *= 2;
}

// Overclocked Processor — draw bonus:
const overclockedCount = this.state.ownedRelics.filter(r => r.key === 'overclocked_processor').length;
handSize += 2 * overclockedCount; // in getHandSize()
// Threshold reduction:
glitchThreshold -= 2 * overclockedCount; // in endTurn glitch injection check
```

**Why cursed relics matter:** They create dramatic build decisions. Demon Core is perfect for Exhaust Burst (tons of energy to dump powerful exhaust cards early, 5 HP cost amortized over a short combat). Shattered Mirror pairs with Shield Fortress (double shield offsets double enemy damage). Overclocked Processor pairs with Static Embrace (lower threshold = MORE Glitches = more fuel for Glitch Exploit/Entropy Bomb).

---

### 5.5 — Boss-Drop Relics
- [ ] **Add boss-exclusive relics to `relicTemplates` in `Relic.ts`**

| Key | Name | Rarity | Source | Effect |
|-----|------|--------|--------|--------|
| `modulators_core` | Modulator's Core | rare | Drop from The Modulator (existing boss) | Gain Regen 1 — heal 1 HP per turn in all future combats this run. |
| `fault_line_crystal` | Fault Line Crystal | rare | Drop from The Fault (existing boss) | Glitch cards in hand can be discarded for free (bypass Feedback Loop self-damage). |
| `debuggers_lens` | Debugger's Lens | rare | Drop from The Debugger (new boss) | See the top 3 cards of your draw pile at all times. |
| `overwriters_pen` | Overwriter's Pen | rare | Drop from The Overwriter (new boss) | Once per combat, transform a card in hand into any card you've previously owned this run. |

**Implementation — boss relic drop:**
```typescript
// In endTurn(), when boss is defeated:
const defeatedBoss = this.state.enemies.find(e => e.tier === 'boss' && e.hp <= 0);
if (defeatedBoss) {
  const bossRelicMap: Record<string, string> = {
    'The Modulator': 'modulators_core',
    'The Fault': 'fault_line_crystal',
    'The Debugger': 'debuggers_lens',
    'The Overwriter': 'overwriters_pen',
  };
  const relicKey = bossRelicMap[defeatedBoss.name];
  if (relicKey) {
    const relicTemplate = relicTemplates.find(r => r.key === relicKey);
    if (relicTemplate && !this.state.ownedRelics.some(r => r.key === relicKey)) {
      this.state.ownedRelics.push({ ...relicTemplate });
      this.state.combatLog.push(`Boss defeated! Acquired ${relicTemplate.name}!`);
    }
  }
}
```

**Debugger's Lens UI:**
```typescript
// In canvas render, if player owns debuggers_lens:
const hasLens = this.state.ownedRelics.some(r => r.key === 'debuggers_lens');
if (hasLens) {
  const topCards = this.state.deck.slice(0, 3);
  // Render small card previews in corner of screen:
  // "Next 3: [Pulse Strike] [Sine Guard] [Saw Rush]"
}
```

**Why boss-drop relics matter:** They're guaranteed unique rewards for beating bosses — not random, not purchasable. Each one is thematically tied to the boss it drops from. Debugger's Lens (deck visibility) counters the randomness that makes long combats frustrating. Overwriter's Pen (card transformation) enables creative plays. These make boss fights feel consequential.

---

### 5.6 — Additional Relics
- [ ] **Add to `relicTemplates` array in `Relic.ts`**

| Key | Name | Rarity | Price | Effect |
|-----|------|--------|-------|--------|
| `echo_chamber` | Echo Chamber | uncommon | 140 | Echo triggers at 75% instead of 50%. Echo archetype boost. |
| `infinity_engine` | Infinity Engine | rare | 200 | Draw 2 extra cards on every deck reshuffle. Pairs with cycling strategies. |
| `pattern_mastery` | Pattern Mastery | rare | 200 | Completing a sequence draws 1 card and grants +4 shield on top of Forge Burst. |
| `static_heart` | Static Heart | rare | 250 | Convert Static to energy at 3:1 ratio at start of each turn (consuming the Static). |
| `unstoppable_force` | Unstoppable Force | rare | 220 | All your attacks ignore enemy Armored. Global piercing. |
| `dark_insight` | Dark Insight | rare (cursed) | 40 | See all enemy intents with exact values, but enemies deal +2 damage. |

**Implementation:**
```typescript
// Echo Chamber:
const echoChamberCount = this.state.ownedRelics.filter(r => r.key === 'echo_chamber').length;
// In getEffectiveDamage() for echo cards:
const echoMultiplier = echoChamberCount > 0 ? 0.75 : 0.5; // 75% instead of 50%

// Infinity Engine:
const infinityEngineCount = this.state.ownedRelics.filter(r => r.key === 'infinity_engine').length;
// In refillDeckFromDiscard():
if (infinityEngineCount > 0) {
  for (let i = 0; i < 2 * infinityEngineCount; i++) {
    this.drawSingleCard(); // draw 2 extra on reshuffle
  }
}

// Pattern Mastery:
const patternMasteryCount = this.state.ownedRelics.filter(r => r.key === 'pattern_mastery').length;
if (matched && patternMasteryCount > 0) {
  this.drawSingleCard();
  this.state.playerShield += 4 * patternMasteryCount;
  this.state.combatLog.push(`Pattern Mastery: +1 draw, +${4 * patternMasteryCount} shield!`);
}

// Static Heart:
const staticHeartCount = this.state.ownedRelics.filter(r => r.key === 'static_heart').length;
if (staticHeartCount > 0 && this.state.playerStatic >= 3) {
  const energyGained = Math.floor(this.state.playerStatic / 3);
  this.state.playerEnergy += energyGained * staticHeartCount;
  this.state.playerStatic = this.state.playerStatic % 3; // keep remainder
  this.state.combatLog.push(`Static Heart: converted Static to +${energyGained * staticHeartCount} energy!`);
}

// Unstoppable Force:
const unstoppableCount = this.state.ownedRelics.filter(r => r.key === 'unstoppable_force').length;
// In takeDamage: if unstoppableCount > 0, skip Armored reduction entirely

// Dark Insight:
const darkInsightCount = this.state.ownedRelics.filter(r => r.key === 'dark_insight').length;
// Intents show exact values (already from 1.5), but enemies deal +2 per relic:
// In enemy damage: totalEnemyDmg += 2 * darkInsightCount;
```

**Key synergies:**
- **Infinity Engine + small deck + reshuffle fatigue:** Draw 2 extra on each reshuffle partially compensates for fatigue damage. Creates "cycling" archetype.
- **Pattern Mastery + Healing Pulse:** Completing patterns now heals 3 HP + gives 4 shield + draws 1 + deals 12 bonus. Pattern Master archetype becomes very strong.
- **Static Heart + Noise deck:** Instead of Static being purely punitive, it becomes ENERGY. Play Noise cards → generate Static → next turn Static converts to energy → play more cards.
- **Dark Insight + Shield Fortress:** You see exactly how much damage is coming, so you know exactly how much shield to invest. The +2 enemy damage is offset by perfect shield planning.

---

## Phase 6 — Starter Deck & Economy Rebalance

### 6.1 — Reduce Starter Deck Size
- [x] **Reduce from 20 to 15 cards** (Proposal #156)

**Where:** `SignalForgeGame.tsx` → `createStarterDeck()` method.

**Current:** 4 Pulse Strike, 3 Pulse Tap, 3 Sine Guard, 2 Sine Bridge, 3 Saw Rush, 2 Saw Latch, 2 Noise Spike, 1 Noise Shard = 20 cards (7P/5Si/5Sa/3N)

**New:** 3 Pulse Strike, 2 Pulse Tap, 2 Sine Guard, 2 Sine Bridge, 2 Saw Rush, 1 Saw Latch, 2 Noise Spike, 1 Noise Shard = 15 cards (5P/4Si/3Sa/3N)

**Why:** 15 cards = each card seen ~3.3x in a 10-turn combat (with 5 draws/turn). Better type balance (closer to 4/4/4/3). Deck cycles faster, making reshuffle less urgent on floor 1 and making each card choice more impactful.

**Impact on patterns:** Fewer Pulse-heavy hands → easier to complete diverse patterns.

---

### 6.2 — Post-Combat Card Reward
- [ ] **Add a card reward choice after each floor** (Proposal #165)

**What:** After winning combat (before shop), the player chooses 1 card from 3 random options, or skips for +20 currency.

**New game phase:** Add `'card-reward'` to the `phase` union type.

**Flow change:** `combat (victory)` → `'card-reward'` → `'reward'` → `'shop'` → `'combat'`

**Implementation in `SignalForgeUI.tsx`:**
```typescript
// New overlay rendered when phase === 'card-reward':
{phase === 'card-reward' && (
  <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-2xl w-full">
      <h2 className="text-2xl font-bold text-center mb-6">Choose Your Reward</h2>
      <div className="flex gap-4 justify-center mb-6">
        {cardRewardChoices.map((card, i) => (
          <button key={i} onClick={() => onSelectCardReward(card)}
            className="bg-gray-800 border-2 border-gray-600 hover:border-yellow-400 rounded-lg p-4 w-48">
            <div className="text-sm font-bold">{card.name}</div>
            <div className="text-xs text-gray-400">{card.type} • {card.rarity}</div>
            <div className="text-xs mt-2">{card.effect}</div>
            <div className="text-sm mt-1">
              {card.damage > 0 && `⚔️ ${card.damage} `}
              {card.shield > 0 && `🛡️ ${card.shield} `}
              Cost: {card.cost}
            </div>
          </button>
        ))}
      </div>
      <button onClick={() => onSkipCardReward()}
        className="block mx-auto text-gray-400 hover:text-yellow-400">
        Skip (+20 💰)
      </button>
    </div>
  </div>
)}
```

**Card generation logic in `SignalForgeGame.tsx`:**
```typescript
private generateCardRewardChoices(): Card[] {
  const floor = this.state.floor;
  // Rarity weights scale with floor:
  const weights = floor < 4
    ? { common: 0.65, uncommon: 0.30, rare: 0.05 }
    : floor < 7
    ? { common: 0.40, uncommon: 0.45, rare: 0.15 }
    : { common: 0.20, uncommon: 0.50, rare: 0.30 };
  
  const choices: Card[] = [];
  for (let i = 0; i < 3; i++) {
    const roll = Math.random();
    let rarity: CardRarity;
    if (roll < weights.rare) rarity = 'rare';
    else if (roll < weights.rare + weights.uncommon) rarity = 'uncommon';
    else rarity = 'common';
    
    const pool = cardTemplates.filter(t => t.rarity === rarity && !t.isGlitch);
    const template = pool[Math.floor(Math.random() * pool.length)];
    choices.push(Card.fromTemplate(template, nextCardId++));
  }
  return choices;
}

private selectCardReward(card: Card): void {
  this.state.deckList.push(card);
  this.state.phase = 'reward';
}

private skipCardReward(): void {
  this.state.currency += 20;
  this.state.phase = 'reward';
}
```

**Why it matters:** This is the core roguelike deck-building loop. Currently, cards are ONLY obtained via shop purchase (costs currency). Adding free card rewards after combat means every floor grows your deck, creating the "build something each run" feeling that makes roguelikes addictive.

---

### 6.3 — Card Upgrade System
- [ ] **Allow upgrading cards in the shop** (Proposal #121)

**What:** Each card can be upgraded once. Upgraded cards have "+25% damage/shield" and append "+" to their name.

**Add to `CardData` interface:**
```typescript
upgraded?: boolean;
```

**Add to `Card` class:**
```typescript
upgrade(): void {
  if (this.upgraded) return;
  this.upgraded = true;
  this.name = this.name + '+';
  this.damage = Math.ceil(this.damage * 1.25);
  this.shield = Math.ceil(this.shield * 1.25);
  if (this.draw) this.draw += 1; // +1 card draw
  // Alternatively: reduce cost by 1 (min 0)
}
```

**In shop:** Add "Upgrade Card" as a new shop action (like "Remove Card"), costing 50 currency (escalating: +25 per upgrade).

```typescript
// In generateShopInventory():
const upgradePrice = 50 + this.state.upgradesPurchased * 25;
shopInventory.push({
  id: 'upgrade',
  type: 'upgrade', // new type
  item: null,
  price: upgradePrice,
});
```

**UI in shop:** When player clicks "Upgrade Card", show their deck and let them pick a card that hasn't been upgraded yet.

**Add to GameState:**
```typescript
upgradesPurchased: number; // escalating cost tracker
```

---

### 6.4 — Escalating Card Removal Cost
- [x] **Card removal cost increases per use** (Proposal #52)

**Current:** Flat 60 currency per removal.

**New:** 50 → 75 → 100 → 125 → ...

**Where:** `SignalForgeGame.tsx` → `generateShopInventory()` and `removeCard()`.

```typescript
// In generateShopInventory():
const removalPrice = 50 + this.state.removalsUsed * 25;
// Replace the flat 60

// In removeCard():
this.state.removalsUsed = (this.state.removalsUsed ?? 0) + 1;
```

**Add to GameState:**
```typescript
removalsUsed: number;
```

---

### 6.5 — Starter Relic Choice
- [ ] **Choose 1 of 3 common relics at the start of each run** (Proposal #160)

**What:** Before combat begins on floor 1, the player is presented with 3 random common relics and picks one for free. This sets the early strategic direction of the run.

**New game phase:** Add `'starter-relic'` to the `phase` union type. Trigger after `'landing'` and before first `'combat'`.

**Implementation:**
```typescript
// In startGame() or the landing → combat transition:
private generateStarterRelicChoices(): RelicData[] {
  const commons = relicTemplates.filter(r => r.rarity === 'common');
  const shuffled = [...commons].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

private selectStarterRelic(relic: RelicData): void {
  this.state.ownedRelics.push({ ...relic });
  this.state.combatLog.push(`Starting relic: ${relic.name}`);
  this.state.phase = 'combat'; // proceed to floor 1
}
```

**UI in `SignalForgeUI.tsx`:**
```typescript
{phase === 'starter-relic' && (
  <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-2xl w-full">
      <h2 className="text-2xl font-bold text-center mb-2">Choose a Starting Relic</h2>
      <p className="text-gray-400 text-center mb-6">This will shape your early strategy.</p>
      <div className="flex gap-4 justify-center">
        {starterRelicChoices.map((relic, i) => (
          <button key={i} onClick={() => onSelectStarterRelic(relic)}
            className="bg-gray-800 border-2 border-gray-600 hover:border-yellow-400 rounded-lg p-4 w-56">
            <div className="text-sm font-bold text-yellow-400">{relic.name}</div>
            <div className="text-xs text-gray-300 mt-2">{relic.description}</div>
          </button>
        ))}
      </div>
    </div>
  </div>
)}
```

**Why it matters:** Tiny feature, huge feel. Every run starts with a meaningful choice that colors the rest of the run. Getting Signal Amplifier (+1 dmg) pushes toward aggression, Tempo Primer pushes toward Tempo Rush, HP Regenerator pushes toward long attrition fights. Creates the "what did you get?" moment that makes roguelikes replayable.

---

### 6.6 — Performance Bonuses
- [ ] **Award bonus currency for skillful play** (Proposals #127-129)

**What:** After each combat, award bonus currency based on performance:

| Condition | Bonus | Description |
|-----------|-------|-------------|
| **No Damage** | +25💰 | Took 0 HP damage (after shield) during the floor |
| **Pattern Master** | +5💰 per pattern | Completed forge burst pattern; stacks |
| **Speed Clear** | +15💰 | Cleared floor in ≤ 3 turns |

**Where:** `SignalForgeGame.tsx` → in the victory/reward calculation, after enemies are cleared.

**Implementation:**
```typescript
// Track during combat:
// Add to GameState:
floorDamageTaken: number; // reset to 0 at start of each floor
floorPatternsCompleted: number; // reset to 0 at start of each floor
floorTurns: number; // reset to 0 at start of each floor

// In endTurn(), when player takes damage:
this.state.floorDamageTaken += actualHpDamage;

// In endTurn(), on Forge Burst match:
this.state.floorPatternsCompleted++;

// In endTurn(), increment turn counter:
this.state.floorTurns++;

// On victory:
let bonusCurrency = 0;
const bonuses: string[] = [];
if (this.state.floorDamageTaken === 0) {
  bonusCurrency += 25;
  bonuses.push('No Damage: +25💰');
}
if (this.state.floorPatternsCompleted > 0) {
  const patternBonus = this.state.floorPatternsCompleted * 5;
  bonusCurrency += patternBonus;
  bonuses.push(`Pattern Master (×${this.state.floorPatternsCompleted}): +${patternBonus}💰`);
}
if (this.state.floorTurns <= 3) {
  bonusCurrency += 15;
  bonuses.push('Speed Clear: +15💰');
}
this.state.currency += bonusCurrency;
```

**Display in reward screen:** Show the bonuses earned as a list above the currency total.

**Why it matters:** Rewards skillful play with tangible currency. Creates sub-goals within each combat ("Can I take zero damage this floor?"). Speed Clear bonus creates tension between playing safe and rushing. Pattern Master bonus rewards the core sequence-matching mechanic.

---

### 6.7 — Shop Refresh
- [ ] **Pay currency to re-roll shop inventory** (Proposal #134)

**What:** "Refresh" button in shop costs 20 currency, re-generates card/relic inventory. Max 2 refreshes per shop visit.

**Where:** `SignalForgeUI.tsx` → shop render, `SignalForgeGame.tsx` → new `refreshShop()` method.

```typescript
private refreshShop(): void {
  if (this.state.shopRefreshesUsed >= 2) return;
  if (this.state.currency < 20) return;
  this.state.currency -= 20;
  this.state.shopRefreshesUsed++;
  this.generateShopInventory(); // re-use existing method
}
```

**Add to GameState:**
```typescript
shopRefreshesUsed: number; // reset to 0 each shop visit
```

---

## Phase 7 — Events & Between-Floor Content

### 7.1 — Event System
- [ ] **Random events between floors** (Proposals #421-440)

**What:** After each floor (40% chance), before entering the shop, a random event appears with 2-3 choices.

**New game phase:** Add `'event'` to the `phase` union type.

**Flow change:** `combat (victory)` → `'card-reward'` → (40% chance) `'event'` → `'reward'` → `'shop'`

**Event data structure** (new file `lib/signal-forge/Event.ts`):
```typescript
export interface GameEvent {
  id: string;
  name: string;
  description: string;
  choices: EventChoice[];
  minFloor: number;
}

export interface EventChoice {
  label: string;
  description: string;
  effect: 'heal' | 'currency' | 'removeCard' | 'addCard' | 'addRelic' |
          'upgradeCard' | 'maxHp' | 'loseHp' | 'gainStatic' | 'reduceStatic';
  value: number;
}
```

**Initial event pool (10 events):**

```typescript
export const eventTemplates: GameEvent[] = [
  {
    id: 'data_cache',
    name: 'Data Cache',
    description: 'You find a hidden data cache among the wreckage.',
    minFloor: 1,
    choices: [
      { label: 'Crack it open', description: 'Gain 40-60 currency', effect: 'currency', value: 50 },
      { label: 'Leave it', description: 'Nothing happens', effect: 'currency', value: 0 },
    ],
  },
  {
    id: 'repair_station',
    name: 'Repair Station',
    description: 'An old repair station hums to life.',
    minFloor: 1,
    choices: [
      { label: 'Repair', description: 'Heal 30% max HP', effect: 'heal', value: 30 },
      { label: 'Scavenge parts', description: 'Gain 30 currency', effect: 'currency', value: 30 },
    ],
  },
  {
    id: 'signal_purifier',
    name: 'Signal Purifier',
    description: 'A device offers to clean your signal.',
    minFloor: 2,
    choices: [
      { label: 'Purify', description: 'Remove 1 card for free', effect: 'removeCard', value: 1 },
      { label: 'Sell it', description: 'Gain 25 currency', effect: 'currency', value: 25 },
    ],
  },
  {
    id: 'card_transmuter',
    name: 'Card Transmuter',
    description: 'A strange machine hums with transformative energy.',
    minFloor: 3,
    choices: [
      { label: 'Transmute', description: 'Upgrade a random card for free', effect: 'upgradeCard', value: 1 },
      { label: 'Pass', description: 'Nothing happens', effect: 'currency', value: 0 },
    ],
  },
  {
    id: 'forbidden_knowledge',
    name: 'Forbidden Knowledge',
    description: 'Dark texts promise power at a price.',
    minFloor: 4,
    choices: [
      { label: 'Read them', description: 'Add 1 random rare card + 1 Glitch card', effect: 'addCard', value: 1 },
      { label: 'Destroy them', description: 'Gain 30 currency', effect: 'currency', value: 30 },
    ],
  },
  {
    id: 'power_surge',
    name: 'Power Surge',
    description: 'A power conduit overloads nearby.',
    minFloor: 2,
    choices: [
      { label: 'Absorb it', description: 'Gain +3 max HP permanently', effect: 'maxHp', value: 3 },
      { label: 'Redirect', description: 'Gain 40 currency', effect: 'currency', value: 40 },
    ],
  },
  {
    id: 'static_discharge_event',
    name: 'Static Discharge',
    description: 'A wave of interference crackles through the air.',
    minFloor: 1,
    choices: [
      { label: 'Ground yourself', description: 'Reduce Static to 0', effect: 'reduceStatic', value: 999 },
      { label: 'Harness it', description: 'Gain 35 currency, +2 Static', effect: 'gainStatic', value: 2 },
    ],
  },
  {
    id: 'ancient_terminal',
    name: 'Ancient Terminal',
    description: 'A terminal displays forgotten data about signal processing.',
    minFloor: 3,
    choices: [
      { label: 'Study it', description: '+3 max HP permanently', effect: 'maxHp', value: 3 },
      { label: 'Download data', description: 'Gain 50 currency', effect: 'currency', value: 50 },
    ],
  },
  {
    id: 'the_wager',
    name: 'The Wager',
    description: 'A holographic figure challenges you to a bet.',
    minFloor: 3,
    choices: [
      { label: 'Accept (costs 40💰)', description: '50% chance: gain 100 currency. 50% chance: lose 40.', effect: 'currency', value: 0 }, // handled specially
      { label: 'Decline', description: 'Nothing happens', effect: 'currency', value: 0 },
    ],
  },
  {
    id: 'scrap_merchant',
    name: 'Scrap Merchant',
    description: 'A traveling merchant offers unusual wares.',
    minFloor: 2,
    choices: [
      { label: 'Trade HP for gold', description: 'Lose 10 HP, gain 60 currency', effect: 'loseHp', value: 10 },
      { label: 'Trade gold for HP', description: 'Pay 30 currency, heal 20 HP', effect: 'heal', value: 20 },
      { label: 'Pass', description: 'Nothing happens', effect: 'currency', value: 0 },
    ],
  },
];
```

**Event resolution in `SignalForgeGame.tsx`:**
```typescript
private triggerEvent(): void {
  // Filter events by minFloor
  const eligible = eventTemplates.filter(e => this.state.floor >= e.minFloor);
  const event = eligible[Math.floor(Math.random() * eligible.length)];
  this.state.currentEvent = event;
  this.state.phase = 'event';
}

private resolveEventChoice(choiceIndex: number): void {
  const event = this.state.currentEvent!;
  const choice = event.choices[choiceIndex];
  
  switch (choice.effect) {
    case 'heal':
      const healAmt = choice.value <= 100
        ? Math.floor(this.state.playerMaxHp * choice.value / 100)
        : choice.value;
      this.state.playerHp = Math.min(this.state.playerMaxHp, this.state.playerHp + healAmt);
      break;
    case 'currency':
      if (event.id === 'the_wager' && choiceIndex === 0) {
        if (this.state.currency < 40) break; // can't afford
        this.state.currency -= 40;
        if (Math.random() < 0.5) this.state.currency += 100;
      } else {
        this.state.currency += choice.value;
      }
      break;
    case 'removeCard': /* show card removal UI */ break;
    case 'addCard': /* add random rare + glitch */ break;
    case 'upgradeCard': /* upgrade random card */ break;
    case 'maxHp':
      this.state.playerMaxHp += choice.value;
      this.state.playerHp += choice.value;
      break;
    case 'loseHp':
      this.state.playerHp -= choice.value;
      this.state.currency += 60; // specific to scrap_merchant
      break;
    case 'reduceStatic':
      this.state.playerStatic = 0;
      break;
    case 'gainStatic':
      this.state.playerStatic += choice.value;
      this.state.currency += 35;
      break;
  }
  
  this.state.currentEvent = undefined;
  this.state.phase = 'reward'; // continue to reward screen
}
```

**Add to GameState:**
```typescript
currentEvent?: GameEvent;
```

**UI in `SignalForgeUI.tsx`:**
```typescript
{phase === 'event' && currentEvent && (
  <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-lg w-full">
      <h2 className="text-xl font-bold text-yellow-400 mb-2">{currentEvent.name}</h2>
      <p className="text-gray-300 mb-6">{currentEvent.description}</p>
      <div className="space-y-3">
        {currentEvent.choices.map((choice, i) => (
          <button key={i} onClick={() => onResolveEvent(i)}
            className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg p-3 text-left">
            <div className="font-bold text-white">{choice.label}</div>
            <div className="text-sm text-gray-400">{choice.description}</div>
          </button>
        ))}
      </div>
    </div>
  </div>
)}
```

---

### 7.2 — Rest vs. Shop Choice
- [ ] **Every 3rd floor, choose REST (heal 50% HP, skip shop) or SHOP** (Proposal #49)

**What:** On floors 3, 6, 9, 12..., after card reward, player chooses: "Rest" (heal 50% max HP, skip shop) or "Visit Shop" (normal 25% heal + shop). 

**Implementation:**
```typescript
// In the flow after card-reward/event:
if (this.state.floor % 3 === 0) {
  this.state.phase = 'rest-or-shop'; // new phase
} else {
  this.state.phase = 'reward'; // normal flow
}

// Rest choice:
private chooseRest(): void {
  this.state.playerHp = Math.min(
    this.state.playerMaxHp,
    this.state.playerHp + Math.floor(this.state.playerMaxHp * 0.5)
  );
  this.state.combatLog.push('Rested and healed 50% HP.');
  this.proceedFromShop(); // skip shop, go straight to next combat
}

// Shop choice:
private chooseShop(): void {
  this.nextFloor(); // normal flow with 25% heal + shop
}
```

---

## Phase 8 — UX & Quality of Life

### 8.0 — Mulligan System
- [ ] **Allow discarding and redrawing up to 2 cards at start of combat** (Proposal #34)

**What:** On the first turn of each combat, after drawing the opening hand, the player may select up to 2 cards to discard and redraw replacements. One-time per combat.

**New state flag:**
```typescript
// Add to GameState:
mulliganAvailable: boolean; // true at start of combat, false after mulligan or skip
```

**Implementation in `SignalForgeGame.tsx`:**
```typescript
private performMulligan(cardIndices: number[]): void {
  if (!this.state.mulliganAvailable) return;
  if (cardIndices.length > 2) return; // max 2
  
  // Return selected cards to deck and shuffle
  const returned: Card[] = [];
  cardIndices.sort((a, b) => b - a).forEach(idx => {
    const card = this.state.hand.splice(idx, 1)[0];
    returned.push(card);
  });
  this.state.deck.push(...returned);
  // Shuffle deck
  for (let i = this.state.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [this.state.deck[i], this.state.deck[j]] = [this.state.deck[j], this.state.deck[i]];
  }
  // Draw replacements
  for (let i = 0; i < returned.length; i++) {
    this.refillDeckFromDiscard();
    if (this.state.deck.length > 0) {
      this.state.hand.push(this.state.deck.pop()!);
    }
  }
  this.state.mulliganAvailable = false;
  this.state.combatLog.push(`Mulliganed ${returned.length} card(s).`);
}

private skipMulligan(): void {
  this.state.mulliganAvailable = false;
}
```

**UI:** At start of first turn, show a banner above hand: "Select up to 2 cards to mulligan" with Confirm/Skip buttons. Selected cards get a red border. Click to toggle selection.

**Why it matters:** Reduces bad-opening-hand frustration, which is one of the most common negative experiences in card games. Adds a decision point at the very start of combat. Innate keyword (from 2.2) interacts: Innate cards are drawn before mulligan, so you'd never need to mulligan them.

---

### 8.1 — Deck Viewer
- [ ] **In-combat button to view full deck, discard, exhaust pile** (Proposal #399)

**What:** A button (or clicking the deck/discard count in the HUD) opens an overlay showing all cards in the current draw pile, discard pile, and exhaust pile with counts.

**Where:** `SignalForgeUI.tsx` — new modal component. Triggered by a state flag.

**Implementation:**
- Add HUD tooltip zone for "Deck: X" and "Discard: X" that sets `viewingPile: 'deck' | 'discard' | null`
- Render a modal listing cards grouped by type, sorted by cost
- Include card counts, keyword badges, and damage/shield values
- Close on click-outside or X button

---

### 8.2 — Sequence Helper
- [ ] **Highlight cards in hand that match the next needed sequence slot** (Proposal #400)

**What:** If the next slot in the target sequence is "Pulse", all Pulse cards in hand get a subtle highlight/glow.

**Where:** `SignalForgeGame.tsx` → canvas card rendering.

```typescript
// Determine next needed type:
const nextSlotIdx = this.state.currentSequence.length;
const neededType = nextSlotIdx < this.state.targetSequence.length
  ? this.state.targetSequence[nextSlotIdx]
  : null;

// In drawCard() for hand cards:
const isSequenceMatch = neededType === '*' || card.type === neededType;
if (isSequenceMatch && neededType) {
  // Draw a subtle golden glow behind the card
  ctx.shadowColor = '#eab308';
  ctx.shadowBlur = 12;
}
```

---

### 8.3 — Contextual Keyword & System Tooltips
- [ ] **Add a shared tooltip dictionary that explains every keyword, status, and system inline when hovering over any card, relic, enemy, or stat — in combat, shop, and deck viewer**

The current tooltip system shows bare stats (`💢8 🛡️0`) and the `effect` string, but never explains *what keywords mean*. A player seeing "Echo" or "Sustain" for the first time has no idea what they do. Tooltips need to surface keyword explanations contextually — only the keywords relevant to that specific card — everywhere a card/relic/enemy is displayed.

---

#### 8.3a — Keyword & System Glossary

**Where:** Create `lib/signal-forge/Glossary.ts` — single source of truth for every keyword and system explanation.

```typescript
// lib/signal-forge/Glossary.ts

/** Tooltip-length explanation for every keyword, status, and system. */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  // === CARD KEYWORDS ===
  'Echo':       'Repeats damage and shield at 50% power after the initial hit.',
  'AOE':        'Hits ALL enemies instead of just the targeted one.',
  'Exhaust':    'Removed from your deck entirely after being played. One-time use.',
  'Sustain':    'Returns to your hand instead of being discarded at end of turn.',
  'Wildcard':   'Counts as ANY waveform type for pattern matching.',
  'Leech':      'Heals you for a percentage of the damage dealt.',
  'Stabilize':  'Removes Glitch cards from your discard pile.',
  'Piercing':   'Ignores enemy Armored reduction — full damage always.',
  'Chain':      'Next card of the same waveform type costs 1 less energy this turn.',
  'Growing':    'Gains bonus damage each time it\'s played this combat.',
  'Retain':     'Stays in your hand between turns — never discarded.',
  'Multihit':   'Strikes the target multiple times. Each hit applies Armored separately.',
  'Innate':     'Always drawn in your opening hand at the start of combat.',
  'Ethereal':   'If not played by end of turn, it\'s exhausted (removed from deck).',
  'Siphon':     'Steals shield from the target enemy and adds it to yours.',
  'Volatile':   'Deals a random amount of damage within a range.',
  'Modal':      'Choose one of several effects when played.',

  // === STATUS EFFECTS ===
  'Vulnerable':  'Target takes 50% more damage for N turns.',
  'Weak':        'Target deals 25% less damage for N turns.',
  'Bleed':       'Takes N damage at the start of each turn. Stacks.',
  'Freeze':      'Skips next action. Applied to enemies.',
  'Marked':      'Next hit on this target deals double damage, then Marked is removed.',

  // === SYSTEMS ===
  'Static':     'Accumulates from Noise cards. At threshold (4), a Glitch card is injected into your discard.',
  'Glitch':     'Unplayable card (cost ✕). Clogs your hand. Remove with Stabilize or Clean Room.',
  'Tempo':      'Builds as you play cards (+1 per card). Adds bonus damage. Resets each turn. Max 6.',
  'Forge Burst':'Match the target waveform pattern to deal +12 bonus damage and draw a card.',
  'Shield':     'Absorbs damage before HP. Resets to 0 at start of your turn.',
  'Armored':    'Enemy passive — reduces all incoming damage by its Armored value.',
  'Regen':      'Enemy passive — heals this amount at the start of its turn.',
  'Enrage':     'Enemy passive — gains bonus damage each turn it\'s alive.',
  'Zone':       'Random combat modifier active this floor. Affects both sides.',
};

/**
 * Given a card, relic, or enemy, return only the glossary entries that are relevant.
 * Never dumps the whole glossary — only terms that appear on THIS item.
 */
export function getRelevantTooltips(item: {
  keywords?: string[];
  effect?: string;
  description?: string;
  // Card-specific flags:
  echo?: boolean; aoe?: boolean; exhaust?: boolean; sustain?: boolean;
  wildcard?: boolean; leech?: number; stabilize?: number;
  staticGain?: number; staticReduce?: number; glitchGen?: number;
  isGlitch?: boolean; tempoGain?: number; selfDamage?: number;
  // New keyword flags:
  piercing?: boolean; chain?: boolean; growing?: number;
  retain?: boolean; multihit?: number; innate?: boolean;
  ethereal?: boolean; siphon?: number; volatile?: boolean; modal?: boolean;
  bleed?: number; freeze?: boolean; vulnerable?: number; weak?: number;
  // Enemy-specific:
  armored?: number; regen?: number; enrage?: number;
}): { term: string; explanation: string }[] {
  const tips: { term: string; explanation: string }[] = [];
  const seen = new Set<string>();

  const add = (term: string) => {
    if (seen.has(term)) return;
    const exp = KEYWORD_GLOSSARY[term];
    if (exp) { tips.push({ term, explanation: exp }); seen.add(term); }
  };

  // Check boolean/numeric flags directly
  if (item.echo) add('Echo');
  if (item.aoe) add('AOE');
  if (item.exhaust) add('Exhaust');
  if (item.sustain) add('Sustain');
  if (item.wildcard) add('Wildcard');
  if (item.leech) add('Leech');
  if (item.stabilize) add('Stabilize');
  if (item.piercing) add('Piercing');
  if (item.chain) add('Chain');
  if (item.growing) add('Growing');
  if (item.retain) add('Retain');
  if (item.multihit) add('Multihit');
  if (item.innate) add('Innate');
  if (item.ethereal) add('Ethereal');
  if (item.siphon) add('Siphon');
  if (item.volatile) add('Volatile');
  if (item.modal) add('Modal');
  if (item.bleed) add('Bleed');
  if (item.freeze) add('Freeze');
  if (item.vulnerable) add('Vulnerable');
  if (item.weak) add('Weak');

  // System flags
  if (item.staticGain || item.staticReduce) add('Static');
  if (item.glitchGen || item.isGlitch) add('Glitch');
  if (item.tempoGain) add('Tempo');
  if (item.armored) add('Armored');
  if (item.regen) add('Regen');
  if (item.enrage) add('Enrage');

  // Also scan the keywords[] array (catches any we missed)
  if (item.keywords) {
    for (const kw of item.keywords) {
      add(kw);
    }
  }

  // Scan effect/description text for system terms not caught by flags
  const text = ((item.effect ?? '') + ' ' + (item.description ?? '')).toLowerCase();
  if (text.includes('static') && !seen.has('Static')) add('Static');
  if (text.includes('glitch') && !seen.has('Glitch')) add('Glitch');
  if (text.includes('tempo') && !seen.has('Tempo')) add('Tempo');
  if (text.includes('forge burst') && !seen.has('Forge Burst')) add('Forge Burst');
  if (text.includes('shield') && !seen.has('Shield')) add('Shield');
  if (text.includes('bleed') && !seen.has('Bleed')) add('Bleed');
  if (text.includes('freeze') && !seen.has('Freeze')) add('Freeze');
  if (text.includes('vulnerable') && !seen.has('Vulnerable')) add('Vulnerable');
  if (text.includes('zone') && !seen.has('Zone')) add('Zone');

  return tips;
}
```

**Why a glossary file?** Single source of truth. Every rendering context (canvas tooltips, React shop UI, React deck viewer, How to Play modal) reads from the same dictionary. Add a keyword once and it's explained everywhere.

---

#### 8.3b — Canvas Card Hover Tooltips (Combat)

**Where:** `SignalForgeGame.tsx` → after `cardRects.current.push(...)` for both hand and played cards.

Currently, hovering over cards in combat shows nothing (no tooltip zone is registered per-card). Add a tooltip zone for each rendered card that includes:
1. Card name, type, rarity
2. Effective damage/shield after bonuses (not just base)
3. Each keyword present → its glossary definition
4. Card effect text

```typescript
import { getRelevantTooltips } from '@/lib/signal-forge/Glossary';

// After each card is rendered in the hand or played area:
const tipLines: string[] = [];
tipLines.push(`${card.name} (${card.type} · ${card.rarity})`);

// Effective damage breakdown
const effectiveDmg = card.damage
  + (signalAmpCount ?? 0)
  + gameState.playerTempo
  + (voidHarvesterBonus ?? 0)
  + (card.growing ? (card.growthCounter ?? 0) * card.growing : 0);
if (card.damage > 0) {
  tipLines.push(`⚔️ ${effectiveDmg} damage${effectiveDmg !== card.damage ? ` (base ${card.damage})` : ''}`);
}
if (card.shield > 0) {
  const effectiveShield = card.echo ? card.getEffectiveShield() : card.shield;
  tipLines.push(`🛡️ ${effectiveShield} shield${card.echo ? ` (incl. Echo)` : ''}`);
}
tipLines.push(`⚡ Cost: ${card.cost >= 99 ? '✕ (unplayable)' : card.cost}`);

// Keyword explanations — only the ones this card has
const kwTips = getRelevantTooltips(card);
if (kwTips.length > 0) {
  tipLines.push(''); // blank line separator
  for (const { term, explanation } of kwTips) {
    tipLines.push(`▸ ${term}: ${explanation}`);
  }
}

// Effect text
if (card.effect) {
  tipLines.push(''); // blank line separator
  tipLines.push(card.effect);
}

tooltipZones.current.push({ x: cardX, y: cardY, w: cardW, h: cardH, text: tipLines });
```

**Important:** Because `tooltipZones` is checked in reverse order (last registered = highest priority), card tooltip zones must be pushed AFTER the panel-level tooltip zones so they take precedence when the mouse is over a card.

**Why only relevant keywords?** Dumping 19 keyword definitions on every card would be noise. A card with only "Echo" and "Leech" should explain exactly those two — nothing else. `getRelevantTooltips()` handles this automatically.

---

#### 8.3c — Shop Card & Relic Tooltips (React)

**Where:** `SignalForgeUI.tsx` → shop item cards and relic cards.

The shop already shows keyword badges (e.g. `Echo`, `Sustain`), but they're tiny colored pills with no explanation. Add hover-triggered keyword definitions below each badge cluster.

**Implementation — reusable `<KeywordTooltips>` component:**

```tsx
// Add to SignalForgeUI.tsx (or extract to components/signal-forge/KeywordTooltips.tsx):

import { getRelevantTooltips, KEYWORD_GLOSSARY } from '@/lib/signal-forge/Glossary';

/** Inline keyword explanations — renders below badges when item is hovered */
function KeywordTooltips({ item }: {
  item: Card | Relic | { effect?: string; description?: string; keywords?: string[] }
}) {
  const tips = getRelevantTooltips(item as Parameters<typeof getRelevantTooltips>[0]);
  if (tips.length === 0) return null;

  return (
    <div className="mt-1 space-y-0.5 border-t border-slate-700 pt-1">
      {tips.map(({ term, explanation }) => (
        <p key={term} className="text-[10px] text-slate-400 leading-tight">
          <span className="text-cyan-400 font-bold">{term}:</span>{' '}
          {explanation}
        </p>
      ))}
    </div>
  );
}
```

**Usage in shop card items** — add `<KeywordTooltips item={card} />` after the effect text:

```tsx
// In the shop card rendering block (item.type === 'card'):
<p className="text-xs text-slate-300 italic mb-1">{card.effect}</p>
<KeywordTooltips item={card} />   {/* ← NEW */}
<Button onClick={() => onBuyItem?.(item.id)} ... >Buy</Button>
```

**Usage in shop relic items** — add `<KeywordTooltips item={relic} />` after the relic description:

```tsx
// In the shop relic rendering block (item.type === 'relic'):
<p className="text-sm text-slate-300 mb-1">{relic.description}</p>
<KeywordTooltips item={relic} />   {/* ← NEW */}
<Button onClick={() => onBuyItem?.(item.id)} ... >Buy</Button>
```

**Relic glossary scanning:** Relics don't have keyword flags, but their `description` text mentions systems: "When your Static reaches threshold…", "Echo triggers at 75%…". The `getRelevantTooltips()` text-scanning fallback catches these automatically.

**Shop items now show:**
```
┌──────────────────────────────────┐
│ Entropy Bomb                     │
│ Noise · rare                💰 200│
│ [Exhaust] [AOE]                  │
│ ⚔️ 15 AOE  Cost: 3              │
│ +2 Static. Deal 3× Static dmg   │
│ to all enemies. Exhaust.         │
│ ─────────────────────────────── │
│ Exhaust: Removed from your deck  │
│ entirely after being played.     │
│ AOE: Hits ALL enemies instead of │
│ just the targeted one.           │
│ Static: Accumulates from Noise   │
│ cards. At threshold (4)...       │
│ [ Buy ]                         │
└──────────────────────────────────┘
```

---

#### 8.3d — Deck Viewer & Collection Tooltips (React)

**Where:** `SignalForgeUI.tsx` → Collection modal (the `showCollection` block).

The Collection view currently renders cards with keyword badges but — just like the shop — never explains what they mean. Apply the same `<KeywordTooltips>` component.

**Implementation:**

```tsx
// In the Collection modal, after card stats rendering:
<div className="flex gap-3 text-xs text-slate-400 mb-1">
  {card.draw ? <span className="text-cyan-400">+{card.draw} draw</span> : null}
  {card.tempoGain ? <span className="text-purple-400">+{card.tempoGain} tempo</span> : null}
  {/* ...existing stat spans... */}
</div>
<p className="text-xs text-slate-300 italic">{card.effect}</p>
<KeywordTooltips item={card} />   {/* ← NEW */}
```

**Also in the deck viewer (new from 8.1):**
When the in-combat deck viewer is implemented (showing draw pile / discard pile), each card in the list should include condensed keyword tips:

```tsx
// In the deck viewer overlay (draw pile or discard pile):
{sortedCards.map((card, i) => (
  <div key={i} className="border-l-2 pl-2 py-1 border-slate-600 hover:bg-slate-800/50">
    <div className="flex justify-between">
      <span className={`font-bold text-sm ${typeColor(card.type)}`}>{card.name}</span>
      <span className="text-xs text-slate-400">⚡{card.cost} ⚔️{card.damage} 🛡️{card.shield}</span>
    </div>
    <KeywordTooltips item={card} />
  </div>
))}
```

---

#### 8.3e — Enemy Tooltips (Canvas)

**Where:** `SignalForgeGame.tsx` → enemy rendering section, where `tooltipZones.current.push(...)` is called for each enemy.

The current enemy tooltip shows name, HP, and abilities as plain text. Enhance it to explain enemy-specific systems (Armored, Regen, Enrage, status effects the enemy applies).

```typescript
// Replace the current enemy tooltip construction:
const tipLines: string[] = [];
tipLines.push(`${enemy.name} (${enemy.tier})`);
tipLines.push(`HP: ${enemy.hp}/${enemy.maxHp}`);
tipLines.push(`Damage: ${enemy.damage}`);

// Ability explanations
if (enemy.armored) {
  tipLines.push(`Armored ${enemy.armored}: ${KEYWORD_GLOSSARY['Armored']}`);
}
if (enemy.regen) {
  tipLines.push(`Regen ${enemy.regen}: ${KEYWORD_GLOSSARY['Regen']}`);
}
if (enemy.enrage) {
  tipLines.push(`Enrage +${enemy.enrage}: ${KEYWORD_GLOSSARY['Enrage']}`);
}
if (enemy.shield && enemy.shield > 0) {
  tipLines.push(`Shield: ${enemy.shield}`);
}

// Named enemy abilities (from ability descriptions)
if (enemy.abilities && enemy.abilities.length > 0) {
  tipLines.push('');
  for (const ability of enemy.abilities) {
    tipLines.push(`▸ ${ability.name}: ${ability.description}`);
  }
}

tipLines.push('');
tipLines.push('Click to target this enemy');
```

---

#### 8.3f — HUD Stat Tooltips (Canvas) — Existing but Enhanced

**Where:** `SignalForgeGame.tsx` → the existing HUD tooltip zones (Shield, Energy, Static, Tempo, etc.).

These already exist but should be enhanced with glossary-backed text for consistency:

```typescript
// Replace hardcoded tooltip strings with glossary lookups:
tooltipZones.current.push({
  x: W - 165, y: 56, w: 150, h: 16,
  text: [
    `Static: ${gameState.playerStatic} / ${gameState.glitchThreshold ?? 4}`,
    KEYWORD_GLOSSARY['Static'],
    gameState.playerStatic >= 3 ? '⚠️ Near threshold!' : '',
  ].filter(Boolean),
});

tooltipZones.current.push({
  x: W - 165, y: 38, w: 150, h: 16,
  text: [
    `Tempo: ${gameState.playerTempo}/6`,
    KEYWORD_GLOSSARY['Tempo'],
  ],
});
```

This ensures the same wording is used in HUD tooltips, card tooltips, and shop explanations. Single source of truth.

---

#### 8.3g — Tooltip Rendering Improvements

**Where:** `SignalForgeGame.tsx` → the `=== DRAW TOOLTIP ===` section.

Current tooltip rendering is functional but needs two improvements for the longer keyword tooltips:

**1. Max width clamping** — keyword explanations can be long. Clamp tooltip width and wrap text:

```typescript
const MAX_TOOLTIP_W = Math.min(W * 0.45, 320); // max 45% of canvas or 320px

// Replace the maxLineW calculation:
let maxLineW = 0;
const wrappedLines: string[] = [];
for (const line of lines) {
  const measured = ctx.measureText(line).width;
  if (measured > MAX_TOOLTIP_W - pad * 2) {
    // Word-wrap long lines
    const words = line.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > MAX_TOOLTIP_W - pad * 2) {
        if (current) wrappedLines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) wrappedLines.push(current);
  } else {
    wrappedLines.push(line);
  }
  maxLineW = Math.min(Math.max(maxLineW, measured), MAX_TOOLTIP_W - pad * 2);
}
// Use wrappedLines instead of lines for rendering
```

**2. Keyword term highlighting** — lines starting with `▸` get a cyan first word (the keyword name):

```typescript
wrappedLines.forEach((line, li) => {
  if (li === 0) {
    // Title line — cyan bold
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 11px monospace';
  } else if (line.startsWith('▸')) {
    // Keyword definition — cyan term, gray explanation
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      ctx.fillStyle = '#00ffc8';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(line.substring(0, colonIdx + 1), tipX + pad, tipY + pad + li * lineH + 10);
      ctx.fillStyle = '#bbbbbb';
      ctx.font = '10px monospace';
      ctx.fillText(line.substring(colonIdx + 1), tipX + pad + ctx.measureText(line.substring(0, colonIdx + 1)).width + 2, tipY + pad + li * lineH + 10);
      return; // skip the default fillText below
    }
    ctx.fillStyle = '#cccccc';
    ctx.font = '10px monospace';
  } else if (line === '') {
    return; // skip blank separator lines
  } else {
    ctx.fillStyle = '#cccccc';
    ctx.font = '11px monospace';
  }
  ctx.fillText(line, tipX + pad, tipY + pad + li * lineH + 10);
});
```

---

**Summary of where tooltips appear after 8.3:**

| Context | Component | What's Shown | Keywords Explained? |
|---------|-----------|-------------|-------------------|
| **Combat — hand cards** | `SignalForgeGame.tsx` (canvas) | Name, type, effective dmg/shield, cost, keywords, effect | ✅ via `getRelevantTooltips()` |
| **Combat — played cards** | `SignalForgeGame.tsx` (canvas) | Same as hand cards | ✅ |
| **Combat — enemies** | `SignalForgeGame.tsx` (canvas) | Name, tier, HP, damage, Armored/Regen/Enrage explained, abilities | ✅ |
| **Combat — HUD stats** | `SignalForgeGame.tsx` (canvas) | Static, Tempo, Shield — glossary-backed text | ✅ |
| **Shop — cards** | `SignalForgeUI.tsx` (React) | Full card display + `<KeywordTooltips>` below effect text | ✅ |
| **Shop — relics** | `SignalForgeUI.tsx` (React) | Relic description + `<KeywordTooltips>` scanning description text | ✅ |
| **Collection/Deck viewer** | `SignalForgeUI.tsx` (React) | Card list + `<KeywordTooltips>` per card | ✅ |
| **In-combat deck viewer** | `SignalForgeUI.tsx` (React, from 8.1) | Draw/discard pile cards + `<KeywordTooltips>` | ✅ |

**Design principles:**
1. **Only relevant keywords** — never dump the full glossary. A card with Echo gets Echo's definition; a card with nothing special gets no keyword section.
2. **Same wording everywhere** — `KEYWORD_GLOSSARY` is the single source. Change a definition once, it updates in canvas tooltips, React shop, deck viewer, and How to Play.
3. **Non-intrusive** — in React (shop/collection), keywords render inline below the effect text, not on hover. In canvas (combat), keywords appear in the hover tooltip only. Players who already know the keywords can ignore them; new players get explanations where they need them.
4. **Scales automatically** — when new keywords are added (Phase 2.2), add one entry to `KEYWORD_GLOSSARY` and one flag check to `getRelevantTooltips()`. Every rendering context picks it up for free.

---

### 8.4 — Keyboard Shortcuts
- [ ] **Number keys 1-5 to play cards, Q to end turn** (Proposal #410)

**Where:** `SignalForgeGame.tsx` → add `keydown` event listener.

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (gameState.phase !== 'combat') return;
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (idx < gameState.hand.length) {
        playCard(idx);
      }
    }
    if (e.key === 'q' || e.key === 'Q') {
      endTurn();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [gameState]);
```

---

### 8.5 — Card Sorting
- [ ] **Sort hand by cost, type, or damage** (Proposal #407)

**What:** Toggle button or keyboard shortcut to re-order cards in hand. Modes: by Cost (ascending), by Type (Pulse→Sine→Saw→Noise), by Damage (descending).

**Where:** `SignalForgeGame.tsx` → hand card rendering array.

```typescript
// Add to GameState:
handSortMode: 'none' | 'cost' | 'type' | 'damage';

// Before rendering hand cards:
let sortedHand = [...this.state.hand];
switch (this.state.handSortMode) {
  case 'cost': sortedHand.sort((a, b) => a.cost - b.cost); break;
  case 'type': {
    const typeOrder = { Pulse: 0, Sine: 1, Saw: 2, Noise: 3 };
    sortedHand.sort((a, b) => (typeOrder[a.type] ?? 4) - (typeOrder[b.type] ?? 4));
    break;
  }
  case 'damage': sortedHand.sort((a, b) => b.damage - a.damage); break;
}
// Render sortedHand instead of this.state.hand
```

**Keyboard shortcut:** `S` key cycles through sort modes: none → cost → type → damage → none. Show current sort mode in small text near hand.

---

### 8.6 — Undo Improvements
- [ ] **Extend `unplayCard()` to support the new keywords** (Proposal #404)

**Current:** `unplayCard()` exists but may not handle all new keyword side-effects.

**Changes needed:**
- If card had `chain`, clear the `chainDiscount` flag
- If card had `growing`, decrement `growthCounter`
- If card had `tempoGain`, subtract from tempo
- If card had status-application effects (bleed, vulnerable, etc.), those are NOT undo-able (applied in `endTurn()`, not in `playCard()`) — so no issue there
- Block undo for cards with draw effects (non-reversible) — already flagged

---

## Phase 9 — Persistence & Wiring

### 9.1 — Update Save/Load for New State Fields
- [ ] **Extend `savedRunState` serialization**

**What:** All new GameState fields must be serialized to JSON for save/load. Add:
```typescript
// New fields to serialize:
chainDiscount, waveformTypesPlayedThisTurn (serialize as array),
momentumCoreActive, safeLandingUsed, voidHarvesterDmgBonus,
currentEvent, removalsUsed, upgradesPurchased, shopRefreshesUsed,
damageTakenLastTurn, voidShieldActive
```

**Also serialize per-card state:**
```typescript
// Each card in deckList/hand/discard needs:
growthCounter, upgraded
```

**Also serialize per-enemy state:**
```typescript
// Each enemy needs:
statusEffects[], tempoSiphon, onDeathGlitch, onDeathStatic,
auraEchoCanceled, auraDamageReduction, immuneType, compileCounter,
timeEaterCharged, bossPhase, immuneToType
```

---

### 9.1b — Zone/Terrain System
- [ ] **Add random combat zone modifiers to each floor** (Proposals #204-214)

**What:** Each floor has a random "zone" that modifies combat for both sides. Displayed prominently at the top of the combat screen.

**New type** (add to `lib/signal-forge/Zone.ts`):
```typescript
export interface CombatZone {
  id: string;
  name: string;
  description: string;
  effect: ZoneEffect;
}

export type ZoneEffect =
  | { type: 'damage_mult'; value: number }         // multiply all damage by value
  | { type: 'shield_mult'; value: number }          // multiply all shield by value
  | { type: 'static_per_turn'; value: number }      // +N Static per turn for player
  | { type: 'forge_burst_bonus'; value: number }     // override Forge Burst bonus
  | { type: 'tempo_cap'; value: number }             // override tempo max
  | { type: 'heal_per_turn'; value: number }         // heal N HP per turn
  | { type: 'glitch_inject'; value: number }         // inject N Glitch at combat start
  | { type: 'no_keywords' }                          // disable all keywords
  | { type: 'none' }                                 // neutral zone
;
```

**Zone pool (10 zones):**
```typescript
export const zoneTemplates: CombatZone[] = [
  { id: 'neutral',       name: 'Stable Signal',    description: 'No modifiers.',                         effect: { type: 'none' } },
  { id: 'amplified',     name: 'Amplified Zone',    description: 'All damage +25%.',                      effect: { type: 'damage_mult', value: 1.25 } },
  { id: 'dampened',      name: 'Dampened Zone',     description: 'All shield +50%.',                      effect: { type: 'shield_mult', value: 1.5 } },
  { id: 'static_field',  name: 'Static Field',      description: '+1 Static per turn.',                   effect: { type: 'static_per_turn', value: 1 } },
  { id: 'resonant',      name: 'Resonant Zone',     description: 'Forge Burst bonus is +20 (not +12).',   effect: { type: 'forge_burst_bonus', value: 20 } },
  { id: 'tempo_storm',   name: 'Tempo Storm',       description: 'Tempo cap is 8 (not 6).',               effect: { type: 'tempo_cap', value: 8 } },
  { id: 'healing',       name: 'Healing Grounds',   description: 'Heal 2 HP per turn.',                   effect: { type: 'heal_per_turn', value: 2 } },
  { id: 'corrupted',     name: 'Corrupted Zone',    description: '1 Glitch injected at combat start.',    effect: { type: 'glitch_inject', value: 1 } },
  { id: 'silence',       name: 'Silence Zone',      description: 'All keywords disabled.',                 effect: { type: 'no_keywords' } },
  { id: 'volatile',      name: 'Volatile Zone',     description: 'All damage +50%, all shield -25%.',     effect: { type: 'damage_mult', value: 1.5 } }, // shield_mult handled as 0.75 separately
];
```

**Add to GameState:**
```typescript
currentZone: CombatZone; // assigned at combat start
```

**Assign zone at combat start:**
```typescript
// In proceedFromShop() / startGame():
const zones = zoneTemplates.filter(z => z.id !== 'neutral');
this.state.currentZone = Math.random() < 0.3
  ? { id: 'neutral', name: 'Stable Signal', description: 'No modifiers.', effect: { type: 'none' } }
  : zones[Math.floor(Math.random() * zones.length)];
// 30% chance of neutral, 70% chance of a modifier
```

**Apply zone effects throughout `endTurn()`:**
```typescript
// Damage multiplier:
if (this.state.currentZone.effect.type === 'damage_mult') {
  effectiveDmg = Math.floor(effectiveDmg * this.state.currentZone.effect.value);
  // Also apply to enemy damage
}
// Shield multiplier:
if (this.state.currentZone.effect.type === 'shield_mult') {
  effectiveShield = Math.floor(effectiveShield * this.state.currentZone.effect.value);
}
// Etc. for each zone type
```

**Render zone name at top of combat canvas:**
```typescript
// In canvas render, above enemy area:
if (this.state.currentZone && this.state.currentZone.id !== 'neutral') {
  ctx.font = `${12 * mScale}px monospace`;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText(`⚡ ${this.state.currentZone.name}: ${this.state.currentZone.description}`, 10, 20);
}
```

**Why zones matter:** Near-zero implementation cost for massive replayability. Every floor feels different. Amplified Zone rewards aggro decks; Dampened Zone rewards shield stacking; Tempo Storm rewards Tempo Rush; Silence Zone is a fun curveball that strips keywords and tests raw stats. Forces adaptation across runs.

---

### 9.2 — Update How-to-Play Modal
- [ ] **Add new keywords, status effects, and mechanics to the How to Play modal**

**Where:** `SignalForgeUI.tsx` → How to Play modal content.

**Add sections for:**
- New keywords: Piercing, Chain, Growing, Retain, Multihit, Innate, Ethereal, Siphon, Bleed, Freeze, Modal
- Status effects: Vulnerable, Weak, Bleed, Freeze, Marked
- Card upgrade system
- Event system (brief explanation)
- Tempo now affects damage
- Deck reshuffle behavior

---

### 9.3 — Update Collection View
- [ ] **Show new cards, relics, and keywords in the Collection viewer**

**Where:** `SignalForgeUI.tsx` → Collection modal.

**Changes:**
- Add all new card templates to the display
- Show keyword badges for new keywords
- Show upgraded card variants (if player has ever upgraded that card — meta-progression hook)
- Show new relics with their effects

---

## Summary — What We're Building

### By the Numbers

| Category | Current | After Plan |
|----------|---------|------------|
| Cards | 31 (8C/12U/9R/2G) | **75** (16C/26U/28R/5G) |
| Keywords | 8 | **19** (+Piercing, Chain, Growing, Retain, Multihit, Bleed, Freeze, Modal, Innate, Ethereal, Siphon) |
| Status Effects | 0 | **5** (Vulnerable, Weak, Bleed, Freeze, Marked) |
| Relics | 15 (5C/6U/4R) | **43** (10C/12U/14R/3Cursed/4Boss-Drop) |
| Enemies | 17 (3C/6U/6E/2B) | **38** (8C/14U/11E/5B) |
| Game Phases | 6 | **11** (+card-reward, event, rest-or-shop, starter-relic, mulligan) |
| Events | 0 | **10** |
| Zones | 0 | **10** |
| Archetypes Supported | ~2 viable | **6** distinct viable builds |
| Systems with Interactions | Tempo: 0, Static: 1 | Tempo: 5, Static: 5, Shield: 4 |

### The 6 Archetypes This Plan Enables

1. **Tempo Rush** — Play many cheap cards for high tempo → tempo bonus damage → Blade Storm / Final Cut finishers. Key relics: Temporal Anchor, Momentum Core, Tempo Primer.

2. **Shield Fortress** — Stack massive shields with Sine cards → convert to AOE damage via Shield Nova. Key relics: Sine Loom, Shield Battery, Shield Cascade.

3. **Static Embrace** — Intentionally build Static → cash out with White Noise / Entropy Bomb / System Crash. Key relics: Stability Core, Glitch Forge, Overclocked Processor (cursed).

4. **Echo Engine** — Stack Echo cards for repeated effects → Omega Pulse / Echo Cascade as finishers. Key relics: Echo Node, Harmonic Resonator, Dual Wield.

5. **Exhaust Burst** — Play powerful Exhaust cards early → Void Harvester permanently buffs remaining deck. Key relics: Void Harvester, Burn Fuel, Demon Core (cursed).

6. **Pattern Master** — Complete Forge Burst every turn with Wildcards and type diversity → consistent healing, draws, and bonus damage. Key relics: Healing Pulse, Phase Shifter, Type Master, Pattern Mastery.

### New Systems Overview

- **Zones** — Each floor randomly modifies combat (Amplified +25% dmg, Dampened +50% shield, Silence disables keywords, etc.). Forces adaptation, adds replayability.
- **Mulligan** — Discard up to 2 cards at start of combat. Reduces bad-hand frustration.
- **Starter Relic** — Choose 1 of 3 common relics before floor 1. Sets strategic direction.
- **Performance Bonuses** — +25💰 for no-damage floors, +15💰 for speed clears, +5💰 per pattern. Rewards skill.
- **Boss-Drop Relics** — Unique relics from each boss. Guaranteed, thematic, powerful.

### How They Interact

| Archetype | Countered By (Enemy) | Rewarded By (Relic) | Key Rare Card |
|-----------|---------------------|--------------------:|---------------|
| Tempo Rush | Time Eater, Tempo Leech | Temporal Anchor | Blade Storm, Final Cut |
| Shield Fortress | Null Sentinel (Armored bypasses shield-to-dmg), Dampener | Sine Loom | Shield Nova, Void Shield |
| Static Embrace | Echo Disruptor (indirect), Heal Sprite (outheals burst) | Glitch Forge, Overclocked Processor | Entropy Bomb, Glitch Exploit |
| Echo Engine | Echo Disruptor (directly cancels Echo) | Dual Wield | Omega Pulse, Perpetual Engine |
| Exhaust Burst | The Overwriter (replaces cards before you exhaust them) | Void Harvester, Burn Fuel | Signal Drain, Overclock |
| Pattern Master | Waveform Guardian (immunity disrupts patterns), Pattern Lock (forces sequence slots) | Healing Pulse, Pattern Mastery | Pattern Forge, Adaptive Protocol, Harmonic Convergence |

### Implementation Priority Order

The phases are designed so each builds on the previous:

1. **Phase 1** (Critical Fixes): Reshuffle, tempo, intents — these unblock everything else
2. **Phase 2** (Status Effects + Keywords): The mechanical foundation for new content
3. **Phase 3** (New Cards): Use the new keywords; give players tools
4. **Phase 4** (New Enemies): Use status effects; test player tools
5. **Phase 5** (New Relics): Amplify archetypes; create build-around decisions
6. **Phase 6** (Economy): Tighten the roguelike loop with card rewards + upgrades
7. **Phase 7** (Events): Add variety and decision-making between floors
8. **Phase 8** (UX): Mulligan, deck viewer, card sorting, keyboard shortcuts
9. **Phase 9** (Persistence): Zone system, save/load for all new state
