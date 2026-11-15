/**
 * deckManagement.ts — Deck manipulation utilities for Signal Forge
 *
 * Pure functions for shuffling, reshuffling from discard, and drawing cards.
 * Used during combat start, end-of-turn, and card draw effects.
 */

import type { Card } from './Card';
import type { Relic } from './Relic';
import { createNamedCard, UNCOMMON_CARDS } from './Card';
import { hasRelic } from './gameHelpers';

/** Fisher-Yates shuffle a list of cards (returns new array) */
export function shuffleDeck(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Result of a deck refill operation */
export interface RefillResult {
  deck: Card[];
  discard: Card[];
  reshuffleCount: number;
  fatigueDamage: number;
  extraReshuffleCards: number;
}

/**
 * Refill the draw pile from the discard pile when deck is empty.
 * Applies escalating reshuffle fatigue damage.
 */
export function refillDeckFromDiscard(
  currentDeck: Card[],
  currentDiscard: Card[],
  currentReshuffleCount: number,
  combatLog: string[],
  relics: Relic[] = []
): RefillResult {
  if (currentDeck.length === 0 && currentDiscard.length > 0) {
    const newReshuffleCount = currentReshuffleCount + 1;

    // Reshuffle fatigue — first reshuffle is free, then ramping damage
    // Formula: ((n + 2) * (n - 1)) / 2  →  0, 2, 5, 9, 14, 20...
    let fatigueDamage = 0;
    if (newReshuffleCount > 1) {
      fatigueDamage = Math.floor(((newReshuffleCount + 2) * (newReshuffleCount - 1)) / 2);
      combatLog.push(`Reshuffle fatigue! Took ${fatigueDamage} damage. (Reshuffle #${newReshuffleCount})`);
    }

    const reshuffled = shuffleDeck(currentDiscard);
    combatLog.push('Discard pile reshuffled into draw pile.');

    // infinity_engine relic: +2 extra cards on reshuffle
    // (recorded in log; caller handles extra draws)
    let extraReshuffleCards = 0;
    if (hasRelic(relics, 'infinity_engine')) {
      extraReshuffleCards = 2;
      combatLog.push('Infinity Engine: +2 cards on reshuffle!');
    }

    return { deck: reshuffled, discard: [], reshuffleCount: newReshuffleCount, fatigueDamage, extraReshuffleCards };
  }
  return {
    deck: currentDeck,
    discard: currentDiscard,
    reshuffleCount: currentReshuffleCount,
    fatigueDamage: 0,
    extraReshuffleCards: 0,
  };
}

/** Result of a draw-hand operation */
export interface DrawResult {
  deck: Card[];
  hand: Card[];
  discard: Card[];
  exhausted: Card[];
  reshuffleCount: number;
  fatigueDamage: number;
}

/**
 * Draw cards up to the target hand size, handling reshuffle, Clean Room,
 * and Glitch Forge relic effects.
 */
export function drawHandCards(
  currentDeck: Card[],
  currentDiscard: Card[],
  currentHand: Card[],
  count: number = 5,
  relics: Relic[] = [],
  currentReshuffleCount: number = 0,
  combatLog: string[] = []
): DrawResult {
  let deck = [...currentDeck];
  let discard = [...currentDiscard];
  let hand = [...currentHand];
  const exhausted: Card[] = [];
  const cleanRoom = hasRelic(relics, 'clean_room');
  let reshuffleCount = currentReshuffleCount;
  let totalFatigueDamage = 0;

  const needToDraw = Math.max(0, count - hand.length);
  let extraPending = 0; // from infinity_engine
  for (let i = 0; i < needToDraw + extraPending; i++) {
    // Reshuffle before drawing if deck empty
    if (deck.length === 0) {
      const refillResult = refillDeckFromDiscard(deck, discard, reshuffleCount, combatLog, relics);
      deck = refillResult.deck;
      discard = refillResult.discard;
      reshuffleCount = refillResult.reshuffleCount;
      totalFatigueDamage += refillResult.fatigueDamage;
      extraPending += refillResult.extraReshuffleCards;
    }

    if (deck.length > 0) {
      const idx = Math.floor(Math.random() * deck.length);
      const card = deck[idx];
      deck = deck.filter((_, j) => j !== idx);

      // Clean Room: Glitch cards exhaust instead of going to hand
      if (cleanRoom && card.isGlitch) {
        exhausted.push(card);
        continue;
      }
      // Glitch Forge: Transform glitch cards into random uncommon cards
      if (hasRelic(relics, 'glitch_forge') && card.isGlitch) {
        const uncommonKeys = Object.keys(UNCOMMON_CARDS);
        const randomKey = uncommonKeys[Math.floor(Math.random() * uncommonKeys.length)];
        const transformed = createNamedCard(randomKey, card.id);
        combatLog.push(`Glitch Forge: transformed Glitch → ${transformed.name}`);
        hand = [...hand, transformed];
        continue;
      }
      hand = [...hand, card];
    }
  }

  return { deck, hand, discard, exhausted, reshuffleCount, fatigueDamage: totalFatigueDamage };
}
