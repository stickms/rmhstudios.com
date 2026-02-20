/**
 * gameFlow.ts — Game flow state transitions for Signal Forge
 *
 * Pure state-transform functions for all non-combat game phases:
 *   - startGame / selectStarterRelic / proceedFromShop
 *   - nextFloor / chooseRest / chooseShop
 *   - buyItem / upgradeCard / removeCard / refreshShop
 *   - mulligan (toggle, confirm, skip)
 *   - overwriter's pen (activate, cancel, confirm)
 *   - card rewards (select, skip)
 *   - deck viewer / sort mode
 *   - fresh state reset (abandon / return to landing)
 *
 * Functions that need external info (like createEnemies, selectZone)
 * accept those as parameters so they stay pure.
 */

import type { GameState } from './GameTypes';
import { Card } from './Card';
import { createGlitchCard, createNamedCard } from './Card';
import { Enemy } from './Enemy';
import { Relic, RELIC_CATALOG, type RelicTemplate } from './Relic';
import { createEnemies } from './Enemy';
import { selectZone } from './Zone';
import { type GameEvent, eventTemplates } from './Event';
import { hasRelic, countRelic, getHandSize } from './gameHelpers';
import { shuffleDeck, drawHandCards } from './deckManagement';
import { generateShopInventory } from './shopLogic';
import { calculateEnemyIntents } from './endTurn';

// ── Start game: show starter relic choice ──

export function computeStartGame(prev: GameState): GameState {
  const commons = RELIC_CATALOG.filter(r => r.rarity === 'common');
  const shuffled = [...commons].sort(() => Math.random() - 0.5);
  const choices = shuffled.slice(0, 3);
  return { ...prev, phase: 'starter-relic', starterRelicChoices: choices };
}

// ── Select starter relic and begin first combat ──

export function computeSelectStarterRelic(prev: GameState, relic: RelicTemplate): GameState {
  const newRelic = new Relic({ ...relic, id: Date.now() + Math.floor(Math.random() * 100000) });
  const ownedRelics = [...prev.ownedRelics, newRelic];

  return enterCombat(prev, ownedRelics, prev.floor, [`Starting relic: ${relic.name}`]);
}

// ── Proceed from shop into next combat ──

export function computeProceedFromShop(prev: GameState): GameState {
  if (prev.phase !== 'shop') return prev;
  return enterCombat(prev, prev.ownedRelics, prev.floor, []);
}

// ── Advance to next floor (after card reward → shop) ──

export function computeNextFloor(prev: GameState): GameState {
  const newFloor = prev.floor + 1;
  const newEnemies = createEnemies(newFloor);

  const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
  const seqLength = Math.min(2 + Math.floor((newFloor - 1) / 5), 3);
  const targetSequence = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);

  const shopInventory = generateShopInventory(newFloor);
  const healthGain = Math.floor(prev.playerMaxHp * 0.25);
  const newHp = Math.min(prev.playerHp + healthGain, prev.playerMaxHp);

  // Award boss-drop relic if a boss was defeated
  let newRelics = [...prev.ownedRelics];
  if (prev.defeatedBossName) {
    const bossRelicMap: Record<string, string> = {
      'The Modulator': 'modulators_core',
      'The Fault': 'fault_line_crystal',
      'The Debugger': 'debuggers_lens',
      'The Overwriter': 'overwriters_pen',
    };
    const relicKey = bossRelicMap[prev.defeatedBossName];
    if (relicKey && !hasRelic(newRelics, relicKey)) {
      const relicDef = RELIC_CATALOG.find(r => r.key === relicKey);
      if (relicDef) {
        const nr = new Relic({
          id: Date.now() + Math.floor(Math.random() * 100000),
          name: relicDef.name, description: relicDef.description,
          rarity: relicDef.rarity, key: relicDef.key,
        });
        newRelics = [...newRelics, nr];
      }
    }
  }

  return {
    ...prev,
    floor: newFloor,
    phase: 'shop',
    enemies: newEnemies,
    playerHp: newHp,
    playerEnergy: 3,
    playerTempo: 0,
    playerStatic: 0,
    playerShield: 0,
    playedThisTurn: [],
    currentSequence: [],
    targetSequence,
    turn: 0,
    selectedEnemyId: newEnemies[0]?.id ?? prev.selectedEnemyId,
    shopInventory,
    ownedRelics: newRelics,
    defeatedBossName: undefined,
    relicBoughtThisShop: false,
    shopRemovalsUsed: 0,
    shopUpgradesUsed: 0,
  };
}

// ── Buy item from shop ──

export function computeBuyItem(prev: GameState, itemId: string): GameState {
  if (prev.phase !== 'shop') return prev;
  const item = prev.shopInventory.find(i => i.id === itemId);
  if (!item || prev.currency < item.price) return prev;

  let newDeckList = [...prev.deckList];
  let newOwnedRelics = [...prev.ownedRelics];
  let relicBought = false;

  if (item.type === 'card' && item.item && item.item instanceof Card) {
    const newCard = item.item.clone(Math.floor(Math.random() * 10000));
    newDeckList = [...newDeckList, newCard];
  } else if (item.type === 'relic' && item.item && item.item instanceof Relic) {
    if (prev.relicBoughtThisShop) return prev;
    const newRelic = item.item.clone(Math.floor(Math.random() * 10000));
    newOwnedRelics = [...newOwnedRelics, newRelic];
    relicBought = true;
  }

  const newShopInventory = prev.shopInventory.filter(i => i.id !== itemId);
  return {
    ...prev,
    deckList: newDeckList,
    ownedRelics: newOwnedRelics,
    currency: prev.currency - item.price,
    shopInventory: newShopInventory,
    relicBoughtThisShop: prev.relicBoughtThisShop || relicBought,
  };
}

// ── Upgrade card from deck (doubling cost per shop visit) ──

export function computeUpgradeCard(prev: GameState, cardId: number): GameState {
  if (prev.phase !== 'shop') return prev;
  const costScale = 1 + (prev.floor - 1) * 0.08;
  const upgradePrice = Math.round(50 * Math.pow(2, prev.shopUpgradesUsed) * costScale);
  if (prev.currency < upgradePrice) return prev;

  const cardIndex = prev.deckList.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return prev;
  const card = prev.deckList[cardIndex];
  if (card.upgraded) return prev;

  const upgraded = card.clone(card.id);
  upgraded.upgraded = true;
  upgraded.name = card.name + '+';
  upgraded.damage = Math.ceil(card.damage * 1.25);
  upgraded.shield = Math.ceil(card.shield * 1.25);

  const newDeckList = [...prev.deckList];
  newDeckList[cardIndex] = upgraded;

  return {
    ...prev, deckList: newDeckList,
    currency: prev.currency - upgradePrice,
    upgradesPurchased: prev.upgradesPurchased + 1,
    shopUpgradesUsed: prev.shopUpgradesUsed + 1,
  };
}

// ── Remove card from deck (doubling cost per shop visit) ──

export function computeRemoveCard(prev: GameState, cardId: number): GameState {
  if (prev.phase !== 'shop') return prev;
  const costScale = 1 + (prev.floor - 1) * 0.08;
  const removalPrice = Math.round(50 * Math.pow(2, prev.shopRemovalsUsed) * costScale);
  if (prev.currency < removalPrice) return prev;

  const cardIndex = prev.deckList.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return prev;

  return {
    ...prev,
    deckList: prev.deckList.filter((_, i) => i !== cardIndex),
    currency: prev.currency - removalPrice,
    removalsUsed: prev.removalsUsed + 1,
    shopRemovalsUsed: prev.shopRemovalsUsed + 1,
  };
}

// ── Shop refresh ──

export function computeRefreshShop(prev: GameState): GameState {
  if (prev.phase !== 'shop') return prev;
  if (prev.shopRefreshesUsed >= 2 || prev.currency < 20) return prev;

  const newInventory = generateShopInventory(prev.floor, prev.shopRefreshesUsed + 1);

  // If a relic was already bought this shop visit, keep the old (unbuyable)
  // relic entries instead of generating fresh ones the player can't purchase.
  let finalInventory: GameState['shopInventory'];
  if (prev.relicBoughtThisShop) {
    const oldRelics = prev.shopInventory.filter(i => i.type === 'relic');
    finalInventory = [
      ...newInventory.filter(i => i.type !== 'relic'),
      ...oldRelics,
    ];
  } else {
    finalInventory = newInventory;
  }

  return {
    ...prev,
    currency: prev.currency - 20,
    shopRefreshesUsed: prev.shopRefreshesUsed + 1,
    shopInventory: finalInventory,
  };
}

// ── Card reward: select or skip ──

export function getNextPhaseAfterReward(floor: number): { phase: GameState['phase']; event?: GameEvent } {
  if (Math.random() < 0.4) {
    const eligible = eventTemplates.filter(e => floor >= e.minFloor);
    if (eligible.length > 0) {
      const event = eligible[Math.floor(Math.random() * eligible.length)];
      return { phase: 'event', event };
    }
  }
  if (floor % 3 === 0) return { phase: 'rest-or-shop' };
  return { phase: 'reward' };
}

export function computeSelectCardReward(prev: GameState, card: Card): GameState {
  if (prev.phase !== 'card-reward') return prev;
  const next = getNextPhaseAfterReward(prev.floor);
  return {
    ...prev,
    deckList: [...prev.deckList, card],
    phase: next.phase,
    cardRewardChoices: [],
    currentEvent: next.event,
  };
}

export function computeSkipCardReward(prev: GameState): GameState {
  if (prev.phase !== 'card-reward') return prev;
  const next = getNextPhaseAfterReward(prev.floor);
  return {
    ...prev,
    currency: prev.currency + 20,
    phase: next.phase,
    cardRewardChoices: [],
    currentEvent: next.event,
  };
}

// ── Mulligan handlers ──

export function computeToggleMulligan(prev: GameState, index: number): GameState {
  if (!prev.mulliganAvailable || prev.phase !== 'combat') return prev;
  const selected = [...prev.mulliganSelected];
  const idx = selected.indexOf(index);
  if (idx >= 0) {
    selected.splice(idx, 1);
  } else if (selected.length < 2) {
    selected.push(index);
  }
  return { ...prev, mulliganSelected: selected };
}

export function computeConfirmMulligan(prev: GameState): GameState {
  if (!prev.mulliganAvailable || prev.phase !== 'combat') return prev;
  if (prev.mulliganSelected.length === 0) {
    return { ...prev, mulliganAvailable: false, mulliganSelected: [] };
  }

  const log = [...prev.combatLog];
  const indices = [...prev.mulliganSelected].sort((a, b) => b - a);

  let newDeck = [...prev.deck];
  const newHand = [...prev.hand];
  const returned: Card[] = [];

  for (const idx of indices) {
    if (idx < newHand.length) {
      const card = newHand.splice(idx, 1)[0];
      returned.push(card);
    }
  }

  // Shuffle returned cards into deck
  newDeck.push(...returned);
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }

  let reshuffleCount = prev.reshuffleCount;
  let playerHp = prev.playerHp;
  let newDiscard = [...prev.discard];

  // Draw replacements
  for (let i = 0; i < returned.length; i++) {
    if (newDeck.length === 0 && newDiscard.length > 0) {
      reshuffleCount++;
      const fatigueDmg = reshuffleCount > 1
        ? Math.floor(0.5 * reshuffleCount * (reshuffleCount - 1))
        : 0;
      if (fatigueDmg > 0) {
        playerHp = Math.max(0, playerHp - fatigueDmg);
        log.push(`Reshuffle fatigue! -${fatigueDmg} HP`);
      }
      newDeck = [...newDiscard];
      for (let j = newDeck.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [newDeck[j], newDeck[k]] = [newDeck[k], newDeck[j]];
      }
      newDiscard = [];
      log.push('Discard reshuffled');
    }
    if (newDeck.length > 0) newHand.push(newDeck.pop()!);
  }

  log.push(`Mulliganed ${returned.length} card${returned.length > 1 ? 's' : ''}`);

  return {
    ...prev,
    hand: newHand, deck: newDeck, discard: newDiscard,
    playerHp, reshuffleCount,
    mulliganAvailable: false, mulliganSelected: [], combatLog: log,
  };
}

export function computeSkipMulligan(prev: GameState): GameState {
  if (!prev.mulliganAvailable) return prev;
  return { ...prev, mulliganAvailable: false, mulliganSelected: [] };
}

// ── Overwriter's Pen ──

export function computeActivateOverwriterPen(prev: GameState, handIndex: number): GameState {
  if (prev.phase !== 'combat' || prev.overwriterPenUsed) return prev;
  if (!hasRelic(prev.ownedRelics, 'overwriters_pen')) return prev;
  if (handIndex < 0 || handIndex >= prev.hand.length) return prev;
  return { ...prev, overwriterPenTarget: handIndex };
}

export function computeCancelOverwriterPen(prev: GameState): GameState {
  return { ...prev, overwriterPenTarget: null };
}

export function computeConfirmOverwriterPen(prev: GameState, newCardKey: string): GameState {
  if (prev.overwriterPenTarget === null) return prev;
  const idx = prev.overwriterPenTarget;
  if (idx < 0 || idx >= prev.hand.length) return { ...prev, overwriterPenTarget: null };
  const newCard = createNamedCard(newCardKey, prev.hand[idx].id);
  const newHand = [...prev.hand];
  newHand[idx] = newCard;
  const oldCardId = prev.hand[idx].id;
  const newDeckList = prev.deckList.map(c => c.id === oldCardId ? newCard : c);
  return {
    ...prev, hand: newHand, deckList: newDeckList,
    overwriterPenUsed: true, overwriterPenTarget: null,
    combatLog: [...prev.combatLog, `Overwriter's Pen: transformed ${prev.hand[idx].name} → ${newCard.name}`],
  };
}

// ── Rest or Shop choice ──

export function computeChooseRest(prev: GameState): GameState {
  const healAmt = Math.floor(prev.playerMaxHp * 0.5);
  const newHp = Math.min(prev.playerMaxHp, prev.playerHp + healAmt);

  // Award boss-drop relic if a boss was defeated
  let newRelics = [...prev.ownedRelics];
  if (prev.defeatedBossName) {
    const bossRelicMap: Record<string, string> = {
      'The Modulator': 'modulators_core',
      'The Fault': 'fault_line_crystal',
      'The Debugger': 'debuggers_lens',
      'The Overwriter': 'overwriters_pen',
    };
    const relicKey = bossRelicMap[prev.defeatedBossName];
    if (relicKey && !hasRelic(newRelics, relicKey)) {
      const relicDef = RELIC_CATALOG.find(r => r.key === relicKey);
      if (relicDef) {
        const nr = new Relic({
          id: Date.now() + Math.floor(Math.random() * 100000),
          name: relicDef.name, description: relicDef.description,
          rarity: relicDef.rarity, key: relicDef.key,
        });
        newRelics = [...newRelics, nr];
      }
    }
  }

  // Proceed directly to next combat
  const newFloor = prev.floor + 1;
  const newEnemies = createEnemies(newFloor);
  const restLog = [`Rested and healed ${healAmt} HP.`];

  return enterCombat(
    { ...prev, playerHp: newHp, floor: newFloor, node: prev.node + 1, ownedRelics: newRelics, defeatedBossName: undefined },
    newRelics, newFloor, restLog, newEnemies
  );
}

export function computeChooseShop(prev: GameState): GameState {
  const newFloor = prev.floor + 1;
  const newEnemies = createEnemies(newFloor);
  const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
  const seqLength = Math.min(2 + Math.floor((newFloor - 1) / 5), 3);
  const targetSequence = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);
  const shopInventory = generateShopInventory(newFloor);
  const healAmount = Math.floor(prev.playerMaxHp * 0.25);

  // Award boss-drop relic if a boss was defeated
  let newRelics = [...prev.ownedRelics];
  if (prev.defeatedBossName) {
    const bossRelicMap: Record<string, string> = {
      'The Modulator': 'modulators_core',
      'The Fault': 'fault_line_crystal',
      'The Debugger': 'debuggers_lens',
      'The Overwriter': 'overwriters_pen',
    };
    const relicKey = bossRelicMap[prev.defeatedBossName];
    if (relicKey && !hasRelic(newRelics, relicKey)) {
      const relicDef = RELIC_CATALOG.find(r => r.key === relicKey);
      if (relicDef) {
        const nr = new Relic({
          id: Date.now() + Math.floor(Math.random() * 100000),
          name: relicDef.name, description: relicDef.description,
          rarity: relicDef.rarity, key: relicDef.key,
        });
        newRelics = [...newRelics, nr];
      }
    }
  }

  return {
    ...prev,
    floor: newFloor,
    node: prev.node + 1,
    phase: 'shop',
    enemies: newEnemies,
    targetSequence,
    shopInventory,
    ownedRelics: newRelics,
    playerHp: Math.min(prev.playerMaxHp, prev.playerHp + healAmount),
    floorDamageTaken: 0, floorPatternsCompleted: 0, floorTurns: 0,
    shopRefreshesUsed: 0,
    defeatedBossName: undefined,
    relicBoughtThisShop: false, shopRemovalsUsed: 0, shopUpgradesUsed: 0,
  };
}

// ── Deck viewer / sort mode ──

export function computeToggleViewPile(prev: GameState, pile: 'deck' | 'discard' | null): GameState {
  return { ...prev, viewingPile: prev.viewingPile === pile ? null : pile };
}

export function computeCycleSortMode(prev: GameState): GameState {
  const modes: Array<'none' | 'cost' | 'type' | 'damage'> = ['none', 'cost', 'type', 'damage'];
  const idx = modes.indexOf(prev.handSortMode);
  return { ...prev, handSortMode: modes[(idx + 1) % modes.length] };
}

// ══════════════════════════════════════════════
//  Internal: shared combat-entry helper
// ══════════════════════════════════════════════

/**
 * Set up a fresh combat state: shuffle deck, draw hand, apply relic effects,
 * select a zone, calculate intents.
 */
function enterCombat(
  prev: GameState,
  ownedRelics: Relic[],
  floor: number,
  startLog: string[],
  overrideEnemies?: Enemy[],
): GameState {
  const enemies = overrideEnemies ?? prev.enemies;

  // Separate innate cards
  const innateCards = prev.deckList.filter(c => c.innate);
  const nonInnateCards = prev.deckList.filter(c => !c.innate);

  // Reset growing counters for new combat
  for (const card of innateCards) { if (card.growing) card.growthCounter = 0; }
  for (const card of nonInnateCards) { if (card.growing) card.growthCounter = 0; }

  const shuffledDeck = shuffleDeck(nonInnateCards);

  const hs = getHandSize(ownedRelics) + countRelic(ownedRelics, 'quick_draw');
  if (countRelic(ownedRelics, 'quick_draw') > 0) startLog.push(`Quick Draw: +${countRelic(ownedRelics, 'quick_draw')} card on first turn`);
  const tempLog: string[] = [];
  const initialHand = [...innateCards];
  const { deck, hand, discard, exhausted } = drawHandCards(shuffledDeck, [], initialHand, hs, ownedRelics, 0, tempLog);

  // Remove exhausted cards (Clean Room)
  let newDeckList = [...prev.deckList];
  for (const ex of exhausted) newDeckList = newDeckList.filter(c => c.id !== ex.id);

  // Relic: Coil Capacitor (+1 energy per copy)
  let playerEnergy = 3;
  playerEnergy += countRelic(ownedRelics, 'coil_capacitor');
  if (hasRelic(ownedRelics, 'demon_core')) playerEnergy += 2;

  // Glitch threshold from relics
  const glitchThreshold = 4 + countRelic(ownedRelics, 'stability_core') * 2
    - (hasRelic(ownedRelics, 'overclocked_processor') ? 2 : 0);

  // Demon Core HP penalty
  let playerHp = prev.playerHp;
  if (hasRelic(ownedRelics, 'demon_core')) {
    playerHp = Math.max(1, playerHp - 5);
    startLog.push('Demon Core: -5 HP');
  }

  // Zone modifier
  const zone = selectZone();
  let finalDeck = deck;
  if (zone.effect.type !== 'none') startLog.push(`Zone: ${zone.name} — ${zone.description}`);
  if (zone.effect.type === 'glitch_inject') {
    for (let i = 0; i < zone.effect.value; i++) {
      finalDeck = [...finalDeck, createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + i)];
    }
  }

  // Sequence generation
  const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
  const seqLength = Math.min(2 + Math.floor((floor - 1) / 5), 3);
  const targetSequence = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);

  // Calculate enemy intents
  calculateEnemyIntents(enemies);

  return {
    ...prev,
    phase: 'combat',
    deckList: newDeckList,
    deck: finalDeck,
    hand,
    discard,
    enemies,
    playerEnergy,
    playerHp,
    playerShield: 0,
    playerTempo: countRelic(ownedRelics, 'tempo_primer') * 2,
    playerStatic: 0,
    targetSequence,
    turn: 0,
    selectedEnemyId: enemies[0]?.id ?? prev.selectedEnemyId,
    glitchThreshold,
    firstPulsePlayedThisTurn: false,
    firstSawPlayedThisTurn: false,
    reshuffleCount: 0,
    playerStatuses: [],
    combatLog: [...startLog, ...tempLog],
    ownedRelics,
    starterRelicChoices: [],
    mulliganAvailable: true,
    mulliganSelected: [],
    currentZone: zone,
    shopInventory: [],
    playedThisTurn: [],
    currentSequence: [],
    damageTakenLastTurn: 0,
    waveformTypesPlayedThisTurn: [],
    momentumCoreActive: false,
    safeLandingUsed: false,
    overwriterPenUsed: false,
    overwriterPenTarget: null,
    voidShieldActive: false,
    voidHarvesterDmgBonus: 0,
    floorDamageTaken: 0,
    floorPatternsCompleted: 0,
    floorTurns: 0,
  };
}
