/**
 * serialization.ts — Game state serialization/deserialization for Signal Forge
 *
 * Converts GameState to/from plain JSON-safe objects for server-side persistence.
 * Handles serializing Card, Enemy, Relic, and ShopItem instances to data objects
 * and reconstructing them when loading a saved run.
 */

import { Card, deserializeCard } from './Card';
import { deserializeEnemy } from './Enemy';
import { deserializeRelic } from './Relic';
import type { GameState, ShopItem } from './GameTypes';

/** Serialize game state to a plain JSON-safe object */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeGameState(gs: GameState): Record<string, any> {
  return {
    floor: gs.floor,
    node: gs.node,
    phase: gs.phase,
    deckList: gs.deckList.map(c => c.toData()),
    deck: gs.deck.map(c => c.toData()),
    hand: gs.hand.map(c => c.toData()),
    discard: gs.discard.map(c => c.toData()),
    playedThisTurn: gs.playedThisTurn.map(c => c.toData()),
    playerHp: gs.playerHp,
    playerMaxHp: gs.playerMaxHp,
    playerShield: gs.playerShield,
    playerEnergy: gs.playerEnergy,
    playerTempo: gs.playerTempo,
    playerStatic: gs.playerStatic,
    score: gs.score,
    currency: gs.currency,
    enemies: gs.enemies.map(e => e.toData()),
    targetSequence: gs.targetSequence,
    currentSequence: gs.currentSequence,
    turn: gs.turn,
    gameOver: gs.gameOver,
    selectedEnemyId: gs.selectedEnemyId,
    shopInventory: gs.shopInventory.map(si => ({
      id: si.id,
      type: si.type,
      item: si.item
        ? (si.item instanceof Card
          ? { kind: 'card', data: si.item.toData() }
          : { kind: 'relic', data: si.item.toData() })
        : null,
      price: si.price,
    })),
    ownedRelics: gs.ownedRelics.map(r => r.toData()),
    glitchThreshold: gs.glitchThreshold,
    firstPulsePlayedThisTurn: gs.firstPulsePlayedThisTurn,
    firstSawPlayedThisTurn: gs.firstSawPlayedThisTurn,
    combatLog: gs.combatLog,
    reshuffleCount: gs.reshuffleCount,
    playerStatuses: gs.playerStatuses,
    removalsUsed: gs.removalsUsed,
    upgradesPurchased: gs.upgradesPurchased,
    cardRewardChoices: gs.cardRewardChoices.map(c => c.toData()),
    defeatedBossName: gs.defeatedBossName,
    mostCommonWaveformType: gs.mostCommonWaveformType,
    mulliganAvailable: gs.mulliganAvailable,
    mulliganSelected: gs.mulliganSelected,
    damageTakenLastTurn: gs.damageTakenLastTurn,
    waveformTypesPlayedThisTurn: gs.waveformTypesPlayedThisTurn,
    momentumCoreActive: gs.momentumCoreActive,
    safeLandingUsed: gs.safeLandingUsed,
    voidHarvesterDmgBonus: gs.voidHarvesterDmgBonus,
    voidShieldActive: gs.voidShieldActive,
    floorDamageTaken: gs.floorDamageTaken,
    floorPatternsCompleted: gs.floorPatternsCompleted,
    floorTurns: gs.floorTurns,
    shopRefreshesUsed: gs.shopRefreshesUsed,
    currentEvent: gs.currentEvent,
    starterRelicChoices: gs.starterRelicChoices,
    currentZone: gs.currentZone,
    handSortMode: gs.handSortMode,
    viewingPile: gs.viewingPile,
    overwriterPenUsed: gs.overwriterPenUsed,
    overwriterPenTarget: gs.overwriterPenTarget,
    signalBoostCount: gs.signalBoostCount,
    relicBoughtThisShop: gs.relicBoughtThisShop,
    shopRemovalsUsed: gs.shopRemovalsUsed,
    shopUpgradesUsed: gs.shopUpgradesUsed,
  };
}

/** Deserialize a saved run state back into a live GameState */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deserializeGameState(data: Record<string, any>): GameState {
  const deserializeShopItem = (
    si: { id: string; type: string; item: { kind: string; data: unknown } | null; price: number }
  ): ShopItem => ({
    id: si.id,
    type: si.type as ShopItem['type'],
    item: si.item
      ? si.item.kind === 'card'
        ? deserializeCard(si.item.data as Parameters<typeof deserializeCard>[0])
        : deserializeRelic(si.item.data as Parameters<typeof deserializeRelic>[0])
      : null,
    price: si.price,
  });

  return {
    floor: data.floor,
    node: data.node,
    phase: data.phase,
    deckList: (data.deckList || []).map(deserializeCard),
    deck: (data.deck || []).map(deserializeCard),
    hand: (data.hand || []).map(deserializeCard),
    discard: (data.discard || []).map(deserializeCard),
    playedThisTurn: (data.playedThisTurn || []).map(deserializeCard),
    playerHp: data.playerHp,
    playerMaxHp: data.playerMaxHp,
    playerShield: data.playerShield,
    playerEnergy: data.playerEnergy,
    playerTempo: data.playerTempo,
    playerStatic: data.playerStatic,
    score: data.score,
    currency: data.currency,
    enemies: (data.enemies || []).map(deserializeEnemy),
    targetSequence: data.targetSequence || [],
    currentSequence: data.currentSequence || [],
    turn: data.turn,
    gameOver: data.gameOver,
    selectedEnemyId: data.selectedEnemyId,
    shopInventory: (data.shopInventory || []).map(deserializeShopItem),
    ownedRelics: (data.ownedRelics || []).map(deserializeRelic),
    glitchThreshold: data.glitchThreshold ?? 4,
    firstPulsePlayedThisTurn: data.firstPulsePlayedThisTurn ?? false,
    firstSawPlayedThisTurn: data.firstSawPlayedThisTurn ?? false,
    combatLog: data.combatLog || [],
    reshuffleCount: data.reshuffleCount ?? 0,
    playerStatuses: data.playerStatuses || [],
    removalsUsed: data.removalsUsed ?? 0,
    upgradesPurchased: data.upgradesPurchased ?? 0,
    cardRewardChoices: (data.cardRewardChoices || []).map(deserializeCard),
    defeatedBossName: data.defeatedBossName,
    mostCommonWaveformType: data.mostCommonWaveformType,
    mulliganAvailable: data.mulliganAvailable ?? false,
    mulliganSelected: data.mulliganSelected || [],
    damageTakenLastTurn: data.damageTakenLastTurn ?? 0,
    waveformTypesPlayedThisTurn: data.waveformTypesPlayedThisTurn || [],
    momentumCoreActive: data.momentumCoreActive ?? false,
    safeLandingUsed: data.safeLandingUsed ?? false,
    voidHarvesterDmgBonus: data.voidHarvesterDmgBonus ?? 0,
    voidShieldActive: data.voidShieldActive ?? false,
    floorDamageTaken: data.floorDamageTaken ?? 0,
    floorPatternsCompleted: data.floorPatternsCompleted ?? 0,
    floorTurns: data.floorTurns ?? 0,
    shopRefreshesUsed: data.shopRefreshesUsed ?? 0,
    currentEvent: data.currentEvent,
    starterRelicChoices: data.starterRelicChoices || [],
    currentZone: data.currentZone,
    handSortMode: data.handSortMode ?? 'none',
    viewingPile: data.viewingPile ?? null,
    overwriterPenUsed: data.overwriterPenUsed ?? false,
    overwriterPenTarget: data.overwriterPenTarget ?? null,
    signalBoostCount: data.signalBoostCount ?? 0,
    relicBoughtThisShop: data.relicBoughtThisShop ?? false,
    shopRemovalsUsed: data.shopRemovalsUsed ?? 0,
    shopUpgradesUsed: data.shopUpgradesUsed ?? 0,
  };
}
