/**
 * cardActions.ts — Card play/unplay state transforms for Signal Forge
 *
 * Pure functions that compute the new GameState when a card is played
 * from hand or returned from the played area. Handles energy costs,
 * sequence tracking, static, shield, draw effects, chain discounts,
 * and all card-specific on-play abilities.
 */

import type { GameState } from './GameTypes';
import { createGlitchCard } from './Card';
import { hasRelic, countRelic } from './gameHelpers';
import { refillDeckFromDiscard } from './deckManagement';

/**
 * Compute new state after playing a card from hand.
 * Returns the prev state unchanged if the play is invalid.
 */
export function computePlayCard(prev: GameState, cardIndex: number): GameState {
  if (cardIndex < 0 || cardIndex >= prev.hand.length) return prev;
  const card = prev.hand[cardIndex];

  // Calculate effective cost with discounts
  let effectiveCost = card.getCost();
  if (prev.chainDiscount && card.type === prev.chainDiscount.type) {
    effectiveCost = Math.max(0, effectiveCost - prev.chainDiscount.amount);
  }
  if (card.type === 'Pulse' && !prev.firstPulsePlayedThisTurn && hasRelic(prev.ownedRelics, 'oscillator_core')) {
    effectiveCost = 0;
  }
  if (hasRelic(prev.ownedRelics, 'waveform_tuner') && !prev.waveformTypesPlayedThisTurn.includes(card.type)) {
    effectiveCost = Math.max(0, effectiveCost - 1);
  }
  if (prev.momentumCoreActive) {
    effectiveCost = Math.max(0, effectiveCost - 1);
  }
  if (effectiveCost > prev.playerEnergy) return prev;
  if (card.isGlitch && card.cost >= 99) return prev;

  let hand = prev.hand.filter((_, i) => i !== cardIndex);
  const played = [...prev.playedThisTurn, card];

  // Sequence: wildcard counts as the needed target type
  let seqType = card.type;
  if (card.wildcard) {
    const seqIdx = prev.currentSequence.length;
    if (seqIdx < prev.targetSequence.length) {
      seqType = prev.targetSequence[seqIdx] as typeof seqType;
    }
  }
  let sequence = [...prev.currentSequence, seqType];

  const playerEnergy = prev.playerEnergy - effectiveCost;
  const tempoCap = prev.currentZone?.effect.type === 'tempo_cap' ? prev.currentZone.effect.value : 6;
  const playerTempo = Math.min(prev.playerTempo + 1 + (card.tempoGain ?? 0), tempoCap);
  let playerStatic = prev.playerStatic;
  const isVolatileZone = prev.currentZone?.id === 'volatile';
  const zoneShieldMult = prev.currentZone?.effect.type === 'shield_mult'
    ? prev.currentZone.effect.value
    : isVolatileZone ? 0.75 : 1;

  // Sine Reflection: shield = damage taken last turn (min 5)
  let cardShieldValue = card.getEffectiveShield();
  if (card.name === 'Sine Reflection') {
    cardShieldValue = Math.max(5, prev.damageTakenLastTurn);
  }

  // Shattered Mirror: doubles shield
  if (hasRelic(prev.ownedRelics, 'shattered_mirror')) {
    cardShieldValue = cardShieldValue * 2;
  }

  const shieldFromCard = zoneShieldMult !== 1 ? Math.floor(cardShieldValue * zoneShieldMult) : cardShieldValue;
  const playerShield = prev.playerShield + shieldFromCard;
  let voidShieldActive = prev.voidShieldActive;
  if (card.name === 'Void Shield') {
    voidShieldActive = true;
  }
  let playerHp = prev.playerHp;
  let deck = [...prev.deck];
  let discard = [...prev.discard];
  let currency = prev.currency;

  const firstPulsePlayedThisTurn = prev.firstPulsePlayedThisTurn || card.type === 'Pulse';
  const firstSawPlayedThisTurn = prev.firstSawPlayedThisTurn || card.type === 'Saw';

  // Static: duplicate types increase static
  const typeCount = played.filter(c => c.type === card.type).length;
  if (typeCount > 1) playerStatic += 1;
  if (card.staticGain) playerStatic += card.staticGain;
  if (card.staticReduce) playerStatic = Math.max(0, playerStatic - card.staticReduce);
  if (card.selfDamage) playerHp = Math.max(0, playerHp - card.selfDamage);

  // Glitch generation
  if (card.glitchGen && card.glitchGen > 0) {
    for (let i = 0; i < card.glitchGen; i++) {
      const glitch = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000));
      discard = [...discard, glitch];
      const faultLensCountPlay = countRelic(prev.ownedRelics, 'fault_lens');
      if (faultLensCountPlay > 0) currency += 10 * faultLensCountPlay;
    }
  }

  // Stabilize (purge Glitch from discard)
  if (card.stabilize && card.stabilize > 0) {
    let removed = 0;
    discard = discard.filter(c => {
      if (removed < (card.stabilize ?? 0) && c.isGlitch) { removed++; return false; }
      return true;
    });
  }

  // Draw extra cards
  let reshuffleCount = prev.reshuffleCount;
  const tempLog: string[] = [];
  if (card.draw && card.draw > 0) {
    for (let i = 0; i < card.draw; i++) {
      if (deck.length === 0) {
        const refillResult = refillDeckFromDiscard(deck, discard, reshuffleCount, tempLog, prev.ownedRelics);
        deck = refillResult.deck;
        discard = refillResult.discard;
        reshuffleCount = refillResult.reshuffleCount;
        playerHp = Math.max(0, playerHp - refillResult.fatigueDamage);
      }
      if (deck.length > 0) {
        const idx = Math.floor(Math.random() * deck.length);
        const drawn = deck[idx];
        deck = deck.filter((_, j) => j !== idx);
        if (drawn.isGlitch && hasRelic(prev.ownedRelics, 'clean_room')) {
          // Card is simply removed
        } else {
          hand = [...hand, drawn];
        }
      }
    }
  }

  // Growing: increment counter
  if (card.growing) card.growthCounter = (card.growthCounter ?? 0) + 1;

  // Chain: set discount for next card of same type
  let chainDiscount = prev.chainDiscount;
  if (card.chain) {
    chainDiscount = { type: card.type, amount: 1 };
  } else if (chainDiscount && card.type === chainDiscount.type) {
    chainDiscount = undefined;
  }

  // Signal Boost: track boost count (applied in damage calc)
  let signalBoostCount = prev.signalBoostCount;
  if (card.name === 'Signal Boost') {
    signalBoostCount += 1;
    tempLog.push('Signal Boost: All Pulse cards deal +4 damage this turn!');
  }

  // Pattern Forge: fill next sequence slot automatically
  if (card.name === 'Pattern Forge' && sequence.length < prev.targetSequence.length) {
    sequence = [...sequence, prev.targetSequence[sequence.length]];
    tempLog.push('Pattern Forge: Extra sequence slot filled!');
  }

  // Chaos Theory: draw 0–2 cards on play
  if (card.name === 'Chaos Theory') {
    const extraDraws = Math.floor(Math.random() * 3);
    for (let i = 0; i < extraDraws; i++) {
      if (deck.length > 0) {
        const idx = Math.floor(Math.random() * deck.length);
        const drawn = deck[idx];
        deck = deck.filter((_, j) => j !== idx);
        hand = [...hand, drawn];
      }
    }
    if (extraDraws > 0) tempLog.push(`Chaos Theory: Drew ${extraDraws} cards!`);
  }

  return {
    ...prev,
    hand,
    deck,
    discard,
    playedThisTurn: played,
    currentSequence: sequence,
    playerEnergy,
    playerTempo,
    playerStatic,
    playerShield,
    playerHp,
    currency,
    firstPulsePlayedThisTurn,
    firstSawPlayedThisTurn,
    reshuffleCount,
    chainDiscount,
    waveformTypesPlayedThisTurn: prev.waveformTypesPlayedThisTurn.includes(card.type)
      ? prev.waveformTypesPlayedThisTurn
      : [...prev.waveformTypesPlayedThisTurn, card.type],
    combatLog: [...prev.combatLog, ...tempLog],
    gameOver: playerHp <= 0,
    phase: playerHp <= 0 ? 'game-over' : prev.phase,
    voidShieldActive,
    signalBoostCount,
  };
}

/**
 * Compute new state after returning a played card to hand.
 * Returns the prev state unchanged if the unplay is invalid
 * (e.g., card has irreversible effects).
 */
export function computeUnplayCard(prev: GameState, cardIndex: number): GameState {
  if (cardIndex < 0 || cardIndex >= prev.playedThisTurn.length) return prev;
  const card = prev.playedThisTurn[cardIndex];

  // Block unplay for cards with irreversible on-play effects
  if (card.draw || card.glitchGen || card.stabilize) return prev;

  const playedThisTurn = prev.playedThisTurn.filter((_, i) => i !== cardIndex);
  const hand = [...prev.hand, card];
  const sequence = playedThisTurn.map((c, i) =>
    c.wildcard && i < prev.targetSequence.length
      ? prev.targetSequence[i] as typeof c.type
      : c.type
  );
  const playerEnergy = prev.playerEnergy + card.getCost();
  const playerTempo = Math.max(prev.playerTempo - 1 - (card.tempoGain ?? 0), 0);
  let playerStatic = prev.playerStatic;

  // Undo static gain
  const typeCount = playedThisTurn.filter(c => c.type === card.type).length;
  if (typeCount === 0) playerStatic = Math.max(playerStatic - 1, 0);
  if (card.staticGain) playerStatic = Math.max(playerStatic - card.staticGain, 0);
  if (card.staticReduce) playerStatic += card.staticReduce;

  const playerShield = prev.playerShield - card.getEffectiveShield();
  const playerHp = card.selfDamage ? Math.min(prev.playerMaxHp, prev.playerHp + card.selfDamage) : prev.playerHp;

  // Undo chain discount
  let chainDiscount = prev.chainDiscount;
  if (card.chain) chainDiscount = undefined;

  // Undo growing counter
  if (card.growing && card.growthCounter && card.growthCounter > 0) card.growthCounter--;

  // Undo Signal Boost count
  const signalBoostCount = card.name === 'Signal Boost'
    ? Math.max(0, prev.signalBoostCount - 1)
    : prev.signalBoostCount;

  // Remove this card's type from waveformTypesPlayedThisTurn
  const waveformTypesPlayedThisTurn = [...prev.waveformTypesPlayedThisTurn];
  const typeIdx = waveformTypesPlayedThisTurn.lastIndexOf(card.type);
  if (typeIdx >= 0) waveformTypesPlayedThisTurn.splice(typeIdx, 1);

  return {
    ...prev,
    hand,
    playedThisTurn,
    currentSequence: sequence,
    playerEnergy,
    playerTempo,
    playerStatic,
    playerShield,
    playerHp,
    chainDiscount,
    waveformTypesPlayedThisTurn,
    signalBoostCount,
  };
}
