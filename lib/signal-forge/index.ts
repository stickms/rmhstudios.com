/**
 * Signal Forge — game entity & logic exports
 *
 * Re-exports all entity classes and game-logic modules from a single
 * barrel file so consumers can do:
 *   import { Card, GameState, computeEndTurn } from '@/lib/signal-forge';
 */

// ── Entity classes ──
export { Card, createNamedCard, createGlitchCard, createStarterDeck, createShopCard, createRandomCard, deserializeCard, CARD_CATALOG } from './Card';
export { COMMON_CARDS, UNCOMMON_CARDS, RARE_CARDS, GLITCH_CARDS, CURSE_CARDS } from './Card';
export type { CardData, WaveformType, CardRarity, CardTemplate } from './Card';

export { Enemy, createEnemy, createEnemies, deserializeEnemy, ENEMY_CATALOG } from './Enemy';
export type { EnemyData, EnemyTemplate } from './Enemy';

export { Relic, createRelicByKey, createRandomRelic, createShopRelics, deserializeRelic, RELIC_CATALOG } from './Relic';
export type { RelicData, RelicRarity, RelicTemplate } from './Relic';

export { applyStatus, getStatusStacks, hasStatus, tickStatusEffects, removeStatus } from './StatusEffect';
export type { StatusEffect, StatusType } from './StatusEffect';

export { eventTemplates } from './Event';
export type { GameEvent, EventChoice } from './Event';

export { zoneTemplates, selectZone } from './Zone';
export type { CombatZone, ZoneEffect } from './Zone';

export { KEYWORD_GLOSSARY, getRelevantTooltips } from './Glossary';

// ── Game state types ──
export type { GameState, ShopItem, GamePhase } from './GameTypes';
export { createFreshGameState } from './GameTypes';

// ── Game logic modules ──
export { hasRelic, countRelic, getHandSize } from './gameHelpers';
export { serializeGameState, deserializeGameState } from './serialization';
export { generateShopInventory } from './shopLogic';
export { shuffleDeck, refillDeckFromDiscard, drawHandCards } from './deckManagement';
export { computePlayCard, computeUnplayCard } from './cardActions';
export { computeEndTurn, calculateEnemyIntents } from './endTurn';
export { computeResolveEventChoice } from './eventResolution';
export { saveRunToServer, clearSavedRunOnServer, loadSavedRunFromServer, checkSavedRunOnServer } from './persistence';

// ── Game flow transitions ──
export {
  computeStartGame,
  computeSelectStarterRelic,
  computeProceedFromShop,
  computeNextFloor,
  computeBuyItem,
  computeUpgradeCard,
  computeRemoveCard,
  computeRefreshShop,
  computeSelectCardReward,
  computeSkipCardReward,
  computeToggleMulligan,
  computeConfirmMulligan,
  computeSkipMulligan,
  computeActivateOverwriterPen,
  computeCancelOverwriterPen,
  computeConfirmOverwriterPen,
  computeChooseRest,
  computeChooseShop,
  computeToggleViewPile,
  computeCycleSortMode,
} from './gameFlow';
