/**
 * GameTypes.ts — Shared type definitions for Signal Forge
 *
 * Contains the core GameState interface, ShopItem interface, and factory
 * functions for creating initial/fresh game states. These types are shared
 * across all game logic modules and UI components.
 */

import type { Card, WaveformType } from './Card';
import { createStarterDeck } from './Card';
import type { RelicTemplate } from './Relic';
import type { Enemy } from './Enemy';
import type { Relic } from './Relic';
import type { StatusEffect } from './StatusEffect';
import type { GameEvent } from './Event';
import type { CombatZone } from './Zone';

/** A shop inventory entry (card, relic, removal, or upgrade service) */
export interface ShopItem {
  id: string;
  type: 'card' | 'relic' | 'removal' | 'upgrade';
  item: Card | Relic | null;
  price: number;
}

/** All possible game phases */
export type GamePhase =
  | 'landing'
  | 'deck-select'
  | 'combat'
  | 'card-reward'
  | 'reward'
  | 'shop'
  | 'game-over'
  | 'event'
  | 'starter-relic'
  | 'rest-or-shop';

/** The complete game state used throughout Signal Forge */
export interface GameState {
  floor: number;
  node: number;
  phase: GamePhase;
  deckList: Card[];
  deck: Card[];
  hand: Card[];
  discard: Card[];
  playedThisTurn: Card[];
  playerHp: number;
  playerMaxHp: number;
  playerShield: number;
  playerEnergy: number;
  playerTempo: number;
  playerStatic: number;
  score: number;
  currency: number;
  enemies: Enemy[];
  targetSequence: string[];
  currentSequence: string[];
  turn: number;
  gameOver: boolean;
  selectedEnemyId: number;
  shopInventory: ShopItem[];
  ownedRelics: Relic[];
  // Ability tracking
  glitchThreshold: number;
  firstPulsePlayedThisTurn: boolean;
  firstSawPlayedThisTurn: boolean;
  combatLog: string[];
  reshuffleCount: number;
  playerStatuses: StatusEffect[];
  chainDiscount?: { type: WaveformType; amount: number };
  removalsUsed: number;
  upgradesPurchased: number;
  cardRewardChoices: Card[];
  defeatedBossName?: string;
  mostCommonWaveformType?: WaveformType;
  mulliganAvailable: boolean;
  mulliganSelected: number[];
  // Relic/combat state
  damageTakenLastTurn: number;
  waveformTypesPlayedThisTurn: string[];
  momentumCoreActive: boolean;
  safeLandingUsed: boolean;
  voidHarvesterDmgBonus: number;
  voidShieldActive: boolean;
  floorDamageTaken: number;
  floorPatternsCompleted: number;
  floorTurns: number;
  shopRefreshesUsed: number;
  currentEvent?: GameEvent;
  starterRelicChoices: RelicTemplate[];
  currentZone?: CombatZone;
  handSortMode: 'none' | 'cost' | 'type' | 'damage';
  viewingPile: 'deck' | 'discard' | null;
  signalBoostCount: number;
  overwriterPenUsed: boolean;
  overwriterPenTarget: number | null;
  relicBoughtThisShop: boolean;
  shopRemovalsUsed: number;
  shopUpgradesUsed: number;
}

/**
 * Create a fresh game state for a new game or a full reset.
 * Requires initial enemies to be provided since enemy creation
 * involves randomness that should be handled by the caller.
 */
export function createFreshGameState(initialEnemies: Enemy[]): GameState {
  return {
    floor: 1,
    node: 1,
    phase: 'landing',
    deckList: createStarterDeck(),
    deck: [],
    hand: [],
    discard: [],
    playedThisTurn: [],
    playerHp: 40,
    playerMaxHp: 40,
    playerShield: 0,
    playerEnergy: 3,
    playerTempo: 0,
    playerStatic: 0,
    score: 0,
    currency: 0,
    enemies: initialEnemies,
    targetSequence: ['Pulse', 'Sine', 'Saw'],
    currentSequence: [],
    turn: 0,
    gameOver: false,
    selectedEnemyId: initialEnemies[0]?.id ?? 0,
    shopInventory: [],
    ownedRelics: [],
    glitchThreshold: 4,
    firstPulsePlayedThisTurn: false,
    firstSawPlayedThisTurn: false,
    reshuffleCount: 0,
    playerStatuses: [],
    removalsUsed: 0,
    combatLog: [],
    upgradesPurchased: 0,
    cardRewardChoices: [],
    mulliganAvailable: false,
    mulliganSelected: [],
    damageTakenLastTurn: 0,
    waveformTypesPlayedThisTurn: [],
    momentumCoreActive: false,
    safeLandingUsed: false,
    signalBoostCount: 0,
    overwriterPenUsed: false,
    overwriterPenTarget: null,
    voidHarvesterDmgBonus: 0,
    voidShieldActive: false,
    floorDamageTaken: 0,
    floorPatternsCompleted: 0,
    floorTurns: 0,
    shopRefreshesUsed: 0,
    starterRelicChoices: [],
    handSortMode: 'none',
    viewingPile: null,
    relicBoughtThisShop: false,
    shopRemovalsUsed: 0,
    shopUpgradesUsed: 0,
  };
}
