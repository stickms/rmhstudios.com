'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SignalForgeUI } from '@/components/signal-forge/SignalForgeUI';
import {
  Card,
  Enemy,
  Relic,
  deserializeCard,
  deserializeEnemy,
  deserializeRelic,
  createStarterDeck,
  createShopCard,
  createEnemies,
  createShopRelics,
  createGlitchCard,
  createNamedCard,
  UNCOMMON_CARDS,
  StatusEffect,
  tickStatusEffects,
  hasStatus,
  applyStatus,
  WaveformType,
  RELIC_CATALOG,
  CARD_CATALOG,
  GameEvent,
  eventTemplates,
  CombatZone,
  selectZone,
  RelicData,
  RelicTemplate,
  getRelevantTooltips,
} from '@/lib/signal-forge';

interface ShopItem {
  id: string;
  type: 'card' | 'relic' | 'removal' | 'upgrade';
  item: Card | Relic | null;
  price: number;
}

interface GameState {
  floor: number;
  node: number;
  phase: 'landing' | 'deck-select' | 'combat' | 'card-reward' | 'reward' | 'shop' | 'game-over' | 'event' | 'starter-relic' | 'rest-or-shop';
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
  glitchThreshold: number;       // Static level that triggers Glitch injection (default 4)
  firstPulsePlayedThisTurn: boolean;
  firstSawPlayedThisTurn: boolean;
  combatLog: string[];           // short messages shown in UI
  reshuffleCount: number;        // Track reshuffles per combat for fatigue damage
  playerStatuses: StatusEffect[]; // Status effects on player
  chainDiscount?: { type: WaveformType; amount: number }; // Chain keyword tracking
  removalsUsed: number;          // Track card removals for escalating cost
  upgradesPurchased: number;     // Phase 6.3 — Track upgrades for escalating cost
  cardRewardChoices: Card[];     // Phase 6.2 — Card choices after combat
  defeatedBossName?: string;     // Track boss defeated this floor for relic award
  mostCommonWaveformType?: WaveformType; // For Debugger boss adaptive immunity
  mulliganAvailable: boolean;    // Phase 8.1 — Allow redrawing cards at combat start
  mulliganSelected: number[];    // Phase 8.1 — Indices of cards selected for mulligan
  // New state fields
  damageTakenLastTurn: number;   // For Sine Reflection
  waveformTypesPlayedThisTurn: string[]; // For Waveform Tuner relic
  momentumCoreActive: boolean;   // Momentum Core flag
  safeLandingUsed: boolean;      // Safe Landing once per combat
  voidHarvesterDmgBonus: number; // Void Harvester cumulative bonus
  voidShieldActive: boolean;     // Void Shield persist flag
  floorDamageTaken: number;      // Performance bonus tracking
  floorPatternsCompleted: number; // Performance bonus tracking
  floorTurns: number;            // Performance bonus tracking
  shopRefreshesUsed: number;     // Shop refresh tracking
  currentEvent?: GameEvent;      // Active event
  starterRelicChoices: RelicTemplate[]; // Starter relic options
  currentZone?: CombatZone;      // Active combat zone
  handSortMode: 'none' | 'cost' | 'type' | 'damage'; // Card sorting
  viewingPile: 'deck' | 'discard' | null; // Deck viewer
  overwriterPenUsed: boolean;    // Overwriter's Pen once per combat
  overwriterPenTarget: number | null; // Index of hand card being transformed
  relicBoughtThisShop: boolean;  // Only one relic per shop visit
  shopRemovalsUsed: number;      // Removals THIS shop visit (doubles cost)
  shopUpgradesUsed: number;      // Upgrades THIS shop visit (doubles cost)
}

/** Check if the player owns a relic with a given key */
function hasRelic(relics: Relic[], key: string): boolean {
  return relics.some(r => r.key === key);
}

function countRelic(relics: Relic[], key: string): number {
  return relics.filter(r => r.key === key).length;
}

function getHandSize(relics: Relic[]): number {
  let size = 5 + countRelic(relics, 'expanded_buffer');
  // Cursed Relic: Overclocked Processor (+2 draw per turn)
  if (hasRelic(relics, 'overclocked_processor')) {
    size += 2;
  }
  return size;
}

/** Serialize game state to a plain JSON-safe object */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeGameState(gs: GameState): Record<string, any> {
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
      item: si.item ? (si.item instanceof Card ? { kind: 'card', data: si.item.toData() } : { kind: 'relic', data: si.item.toData() }) : null,
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
    // New state fields
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
    relicBoughtThisShop: gs.relicBoughtThisShop,
    shopRemovalsUsed: gs.shopRemovalsUsed,
    shopUpgradesUsed: gs.shopUpgradesUsed,
  };
}

/** Deserialize a saved run state back into a live GameState */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeGameState(data: Record<string, any>): GameState {
  const deserializeShopItem = (si: { id: string; type: string; item: { kind: string; data: unknown } | null; price: number }): ShopItem => ({
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
    // New state fields
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
    relicBoughtThisShop: data.relicBoughtThisShop ?? false,
    shopRemovalsUsed: data.shopRemovalsUsed ?? 0,
    shopUpgradesUsed: data.shopUpgradesUsed ?? 0,
  };
}

const STARTER_DECK = createStarterDeck();

// Generate shop inventory for a floor — costs scale with floor
const generateShopInventory = (floor: number, seedOffset: number = 0): ShopItem[] => {
  const inventory: ShopItem[] = [];
  let itemId = 0;
  // Floor cost multiplier: ramps slower than income
  const costScale = 1 + (floor - 1) * 0.08;

  // Add cards - more offerings at higher floors
  const cardCount = Math.min(3 + Math.floor((floor - 1) / 2), 6);
  const rarities: Array<'common' | 'uncommon' | 'rare'> = ['common', 'uncommon', 'rare'];
  for (let i = 0; i < cardCount; i++) {
    const card = createShopCard(floor, floor * 1000 + 500 + i + seedOffset * 7919, rarities[i % rarities.length]);
    const basePrices = { common: 40, uncommon: 70, rare: 110 };
    inventory.push({
      id: `card_${itemId++}`,
      type: 'card',
      item: card,
      price: Math.round((basePrices[card.rarity as keyof typeof basePrices] ?? 70) * costScale),
    });
  }

  // Add relics - more at higher floors
  const relicCount = Math.min(2 + Math.floor((floor - 1) / 3), 4);
  const relics = createShopRelics(floor, relicCount);
  for (const relic of relics) {
    inventory.push({
      id: `relic_${itemId++}`,
      type: 'relic',
      item: relic,
      price: Math.round(120 * costScale),
    });
  }

  // Upgrade and removal are always available — price computed dynamically based on shop uses
  inventory.push({
    id: 'upgrade',
    type: 'upgrade',
    item: null,
    price: 0, // computed dynamically in UI
  });

  inventory.push({
    id: 'removal',
    type: 'removal',
    item: null,
    price: 0, // computed dynamically in UI
  });

  return inventory;
};

export function SignalForgeGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRects = useRef<Array<{ index: number; x: number; y: number; w: number; h: number; type: 'hand' | 'played' }>>(
    []
  );
  const endTurnRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const hamburgerRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const tooltipZones = useRef<Array<{ x: number; y: number; w: number; h: number; text: string[] }>>([]);
  const mousePos = useRef<{ x: number; y: number } | null>(null);
  const tooltipRaf = useRef<number>(0);
  const [tooltipTick, setTooltipTick] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 755 });

  // Generate initial enemies (floor 1)
  const initialEnemies = createEnemies(1);

  const [gameState, setGameState] = useState<GameState>({
    floor: 1,
    node: 1,
    phase: 'landing',
    deckList: [...STARTER_DECK],
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
    upgradesPurchased: 0,
    combatLog: [],
    cardRewardChoices: [],
    mulliganAvailable: false,
    mulliganSelected: [],
    damageTakenLastTurn: 0,
    waveformTypesPlayedThisTurn: [],
    momentumCoreActive: false,
    safeLandingUsed: false,
    voidHarvesterDmgBonus: 0,
    voidShieldActive: false,
    floorDamageTaken: 0,
    floorPatternsCompleted: 0,
    floorTurns: 0,
    shopRefreshesUsed: 0,
    starterRelicChoices: [],
    handSortMode: 'none',
    viewingPile: null,
    overwriterPenUsed: false,
    overwriterPenTarget: null,
    relicBoughtThisShop: false,
    shopRemovalsUsed: 0,
    shopUpgradesUsed: 0,
  });

  // Helper: shuffle cards (Fisher-Yates)
  const shuffleDeck = useCallback((cards: Card[]): Card[] => {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  // Helper: refill deck from discard with reshuffle fatigue
  const refillDeckFromDiscard = useCallback((
    currentDeck: Card[],
    currentDiscard: Card[],
    currentReshuffleCount: number,
    combatLog: string[]
  ): { deck: Card[]; discard: Card[]; reshuffleCount: number; fatigueDamage: number } => {
    if (currentDeck.length === 0 && currentDiscard.length > 0) {
      const newReshuffleCount = currentReshuffleCount + 1;
      
      // Reshuffle fatigue - first reshuffle is free, then ramping damage
      // Formula: ((n + 2) * (n - 1)) / 2
      // Produces sequence: 0, 2, 5, 9, 14, 20... for n = 1, 2, 3, 4, 5, 6...
      let fatigueDamage = 0;
      if (newReshuffleCount > 1) {
        fatigueDamage = Math.floor(((newReshuffleCount + 2) * (newReshuffleCount - 1)) / 2);
        combatLog.push(`Reshuffle fatigue! Took ${fatigueDamage} damage. (Reshuffle #${newReshuffleCount})`);
      }

      // Fisher-Yates shuffle
      const reshuffled = [...currentDiscard];
      for (let i = reshuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
      }
      
      combatLog.push('Discard pile reshuffled into draw pile.');
      
      return {
        deck: reshuffled,
        discard: [],
        reshuffleCount: newReshuffleCount,
        fatigueDamage,
      };
    }
    return {
      deck: currentDeck,
      discard: currentDiscard,
      reshuffleCount: currentReshuffleCount,
      fatigueDamage: 0,
    };
  }, []);

  // Helper: draw cards up to hand size (with Clean Room relic support)
  const drawHandCards = useCallback((
    currentDeck: Card[], currentDiscard: Card[], currentHand: Card[],
    count: number = 5, relics: Relic[] = [], currentReshuffleCount: number = 0, combatLog: string[] = [],
  ): { deck: Card[]; hand: Card[]; discard: Card[]; exhausted: Card[]; reshuffleCount: number; fatigueDamage: number } => {
    let deck = [...currentDeck];
    let discard = [...currentDiscard];
    let hand = [...currentHand];
    const exhausted: Card[] = [];
    const cleanRoom = hasRelic(relics, 'clean_room');
    let reshuffleCount = currentReshuffleCount;
    let totalFatigueDamage = 0;

    const needToDraw = Math.max(0, count - hand.length);
    for (let i = 0; i < needToDraw; i++) {
      // Check if we need to reshuffle before drawing
      if (deck.length === 0) {
        const refillResult = refillDeckFromDiscard(deck, discard, reshuffleCount, combatLog);
        deck = refillResult.deck;
        discard = refillResult.discard;
        reshuffleCount = refillResult.reshuffleCount;
        totalFatigueDamage += refillResult.fatigueDamage;
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
  }, [refillDeckFromDiscard]);

  // Resize observer to track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ w: Math.round(width), h: Math.round(height) });
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Helper to draw text with outline
    const drawOutlinedText = (text: string, x: number, y: number, font: string, fillColor: string, outlineColor: string, outlineWidth: number) => {
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = outlineWidth;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = fillColor;
      ctx.fillText(text, x, y);
    };

    // Helper to draw rounded rectangle
    const drawRoundRect = (x: number, y: number, w: number, h: number, r: number = 8) => {
      const roundRectMethod = (ctx as CanvasRenderingContext2D & { roundRect?: typeof CanvasRenderingContext2D.prototype.roundRect }).roundRect;
      if (roundRectMethod) {
        ctx.beginPath();
        roundRectMethod.call(ctx, x, y, w, h, r);
      } else {
        // Fallback for browsers that don't support roundRect
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      }
    };

    // Helper to draw a card
    const drawCard = (card: Card, x: number, y: number, w: number, h: number, isHovered: boolean = false) => {
      const cardRadius = 8;

      // Glitch cards have a distinct red/static look
      const isGlitch = card.isGlitch;
      const typeColor = isGlitch
        ? '#ff2222'
        : ({ 'Pulse': '#ff4444', 'Sine': '#4488ff', 'Saw': '#44ff44', 'Noise': '#ff88ff' }[card.type as string] || '#cccccc');

      const gradient = ctx.createLinearGradient(x, y, x, y + h);
      gradient.addColorStop(0, typeColor + (isGlitch ? '55' : '33'));
      gradient.addColorStop(1, typeColor + (isGlitch ? '22' : '11'));

      ctx.fillStyle = gradient;
      drawRoundRect(x, y, w, h, cardRadius);
      ctx.fill();

      // Border
      ctx.strokeStyle = isHovered ? typeColor : typeColor + '99';
      ctx.lineWidth = isHovered ? 2 : 1;
      drawRoundRect(x, y, w, h, cardRadius);
      ctx.stroke();

      if (isHovered) {
        ctx.shadowColor = typeColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = typeColor;
        ctx.lineWidth = 1;
        drawRoundRect(x + 1, y + 1, w - 2, h - 2, cardRadius - 1);
        ctx.stroke();
        ctx.shadowColor = 'transparent';
      }

      // Card name
      ctx.fillStyle = isGlitch ? '#ff4444' : '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(card.name.substring(0, 14), x + w / 2, y + h / 2 - 12);

      // Cost, Damage
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = typeColor;
      ctx.fillText(`⚡${card.cost >= 99 ? '✕' : card.cost}`, x + w / 2 - 15, y + h / 2 + 2);
      if (card.damage > 0) {
        const dmgText = card.echo ? `💢${card.getEffectiveDamage()}` : `💢${card.damage}`;
        ctx.fillText(dmgText, x + w / 2 + 15, y + h / 2 + 2);
      }

      // Shield
      if (card.shield > 0) {
        const shText = card.echo ? `🛡️${card.getEffectiveShield()}` : `🛡️${card.shield}`;
        ctx.fillStyle = '#4488ff';
        ctx.fillText(shText, x + w / 2, y + h - 12);
      }

      // Keyword badges (bottom of card)
      if (card.keywords && card.keywords.length > 0 && w > 50) {
        const kw = card.keywords.slice(0, 2).join(' ');
        ctx.font = 'bold 7px monospace';
        ctx.fillStyle = isGlitch ? '#ff4444' : '#ffcc00';
        ctx.fillText(kw, x + w / 2, y + h - 3);
      }
    };

    // High-DPI scaling: use container size as logical coords
    const W = canvasSize.w;
    const H = canvasSize.h;
    const dpr = window.devicePixelRatio || 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear canvas (use logical size)
    ctx.fillStyle = '#0a0e27';
    ctx.fillRect(0, 0, W, H);

    // Draw grid background with gradient
    const gridGradient = ctx.createLinearGradient(0, 0, 0, H);
    gridGradient.addColorStop(0, 'rgba(0, 255, 200, 0.08)');
    gridGradient.addColorStop(0.5, 'rgba(0, 150, 200, 0.05)');
    gridGradient.addColorStop(1, 'rgba(0, 255, 200, 0.08)');
    ctx.fillStyle = gridGradient;
    ctx.fillRect(0, 0, W, H);
    
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }
    for (let i = 0; i < H; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(W, i);
      ctx.stroke();
    }

    // Helper to draw panel
    const drawPanel = (x: number, y: number, w: number, h: number, title: string = '') => {
      ctx.fillStyle = 'rgba(0, 255, 200, 0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      
      if (title) {
        ctx.fillStyle = '#00ffc8';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(title, x + 10, y - 5);
      }
    };

    // === RESPONSIVE LAYOUT ===
    // Scale middle zone (between HUD/enemies and end-turn button) to fit any canvas height
    const middleTop = 135;
    const middleBot = H - 60;
    const mScale = Math.max(0.4, (middleBot - middleTop) / 560); // 560 = ref middle height at H=755

    const seqY = middleTop + Math.round(15 * mScale);
    const seqPanelH = Math.round(130 * mScale);
    const seqBoxH = Math.round(30 * mScale);

    const dmgBoxY = middleTop + Math.round(160 * mScale);
    const dmgBoxH = Math.round(24 * mScale);

    const tempoY = middleTop + Math.round(200 * mScale);
    const tempoBarH = Math.round(28 * mScale);

    const playedPanelY = middleTop + Math.round(235 * mScale);
    const panelH = Math.round(145 * mScale);  // 15% taller than previous

    const handPanelY = playedPanelY + panelH + Math.round(28 * mScale);

    const cardH = Math.round(110 * mScale);   // 15% bigger
    const cardW = Math.round(90 * mScale);    // 15% bigger
    const cardPadY = Math.round(16 * mScale);
    const cardGapX = cardW + 10;

    // Reset tooltip zones
    tooltipZones.current = [];

    // === TOP LEFT HUD ===
    const hasZone = gameState.currentZone && gameState.currentZone.effect.type !== 'none';
    drawPanel(10, 10, 160, hasZone ? 120 : 100);
    
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('🗺️ FL ' + gameState.floor, 20, 32);
    tooltipZones.current.push({ x: 15, y: 20, w: 150, h: 16, text: ['Floor: Current dungeon depth', 'Higher floors have tougher enemies'] });
    ctx.fillText('❤️ ' + gameState.playerHp + '/' + gameState.playerMaxHp, 20, 50);
    tooltipZones.current.push({ x: 15, y: 38, w: 150, h: 16, text: ['Health Points (HP)', 'Reach 0 and it\'s game over', 'Heal between floors'] });
    ctx.fillText('🛡️ ' + gameState.playerShield, 20, 68);
    const shieldTip = ['Shield: Absorbs incoming damage first', 'Resets to 0 each turn'];
    if (hasRelic(gameState.ownedRelics, 'sine_loom')) shieldTip.push('Sine Loom: prevents reset');
    if (hasRelic(gameState.ownedRelics, 'shield_battery')) shieldTip.push(`Shield Battery: +${2 * countRelic(gameState.ownedRelics, 'shield_battery')}/turn`);
    tooltipZones.current.push({ x: 15, y: 56, w: 150, h: 16, text: shieldTip });
    ctx.fillText('⚡ ' + gameState.playerEnergy + '/3', 20, 86);
    const energyTip = ['Energy: Spend to play cards', 'Refills to 3 each turn'];
    if (hasRelic(gameState.ownedRelics, 'coil_capacitor')) energyTip.push(`Coil Capacitor: +${countRelic(gameState.ownedRelics, 'coil_capacitor')} at start`);
    if (hasRelic(gameState.ownedRelics, 'energy_conduit')) energyTip.push(`Energy Conduit: +${countRelic(gameState.ownedRelics, 'energy_conduit')} per turn`);
    tooltipZones.current.push({ x: 15, y: 74, w: 150, h: 16, text: energyTip });
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('\ud83d\udcb0 ' + gameState.currency, 20, 104);
    const currencyTip = ['Currency: Spend in the shop', 'Earn from defeating enemies'];
    if (hasRelic(gameState.ownedRelics, 'fault_lens')) currencyTip.push(`Fault Lens: +${10 * countRelic(gameState.ownedRelics, 'fault_lens')} per Glitch`);
    tooltipZones.current.push({ x: 15, y: 92, w: 150, h: 16, text: currencyTip });

    // Zone modifier display
    if (hasZone && gameState.currentZone) {
      ctx.fillStyle = '#ff9900';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('🌐 ' + gameState.currentZone.name, 20, 120);
      tooltipZones.current.push({ x: 15, y: 110, w: 150, h: 14, text: [`Zone: ${gameState.currentZone.name}`, gameState.currentZone.description] });
    }

    // === HAMBURGER MENU ICON (bottom-right corner) ===
    if (gameState.phase !== 'landing' && gameState.phase !== 'game-over') {
      const hw = 28;
      const hh = 24;
      const hx = W - hw - 10;
      const hy = H - hh - 10;
      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(hx, hy, hw, hh, 4);
      ctx.fill();
      ctx.stroke();
      // Three horizontal lines
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ly = hy + 8 + i * 6;
        ctx.beginPath();
        ctx.moveTo(hx + 6, ly);
        ctx.lineTo(hx + hw - 6, ly);
        ctx.stroke();
      }
      hamburgerRect.current = { x: hx, y: hy, w: hw, h: hh };
      tooltipZones.current.push({ x: hx, y: hy, w: hw, h: hh, text: ['Menu (Esc)'] });
    } else {
      hamburgerRect.current = null;
    }

    // === TOP RIGHT HUD ===
    drawPanel(W - 170, 10, 160, 100);
    
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('PT ' + gameState.score, W - 20, 32);
    tooltipZones.current.push({ x: W - 165, y: 20, w: 150, h: 16, text: ['Points: Your total score', 'Earn points by dealing damage'] });
    
    ctx.fillStyle = '#b78ef6';
    ctx.fillText('TM ' + gameState.playerTempo + '/6', W - 20, 50);
    tooltipZones.current.push({ x: W - 165, y: 38, w: 150, h: 16, text: ['Tempo: Builds as you play cards', 'At max tempo (6), gain bonus effects', 'Resets each turn'] });
    
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('ST ' + gameState.playerStatic + '/' + gameState.glitchThreshold, W - 20, 68);
    const staticTip = ['Static: Noise interference counter', `Glitch injected at ${gameState.glitchThreshold}`, 'Accumulates from duplicate card types'];
    if (hasRelic(gameState.ownedRelics, 'static_sink')) staticTip.push(`Static Sink: -${countRelic(gameState.ownedRelics, 'static_sink')} per turn`);
    if (hasRelic(gameState.ownedRelics, 'stability_core')) staticTip.push(`Stability Core: threshold → ${4 + countRelic(gameState.ownedRelics, 'stability_core') * 2}`);
    tooltipZones.current.push({ x: W - 165, y: 56, w: 150, h: 16, text: staticTip });
    
    ctx.fillStyle = '#00ffc8';
    ctx.fillText('HND: ' + gameState.hand.length, W - 20, 86);
    const hs = getHandSize(gameState.ownedRelics);
    const handTip = ['Hand Size: Cards in your hand', `Draw up to ${hs} cards each turn`];
    if (hasRelic(gameState.ownedRelics, 'expanded_buffer')) handTip.push(`Expanded Buffer: +${countRelic(gameState.ownedRelics, 'expanded_buffer')} hand size`);
    if (hasRelic(gameState.ownedRelics, 'echo_node')) handTip.push(`Echo Node: +${countRelic(gameState.ownedRelics, 'echo_node')} on Forge Burst`);
    tooltipZones.current.push({ x: W - 165, y: 74, w: 150, h: 16, text: handTip });
    ctx.fillText('DSC: ' + gameState.discard.length, W - 20, 104);
    tooltipZones.current.push({ x: W - 165, y: 92, w: 150, h: 16, text: ['Discard Pile: Used cards', 'Cards stay here once played', 'Glitch cards may be injected here'] });

    // === DEBUGGER'S LENS — Show top 3 draw pile cards ===
    if (hasRelic(gameState.ownedRelics, 'debuggers_lens') && gameState.deck.length > 0) {
      const lensY = 115;
      drawPanel(W - 170, lensY, 160, 55);
      ctx.fillStyle = '#ffcc44';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('🔍 NEXT DRAWS:', W - 20, lensY + 14);
      const top3 = gameState.deck.slice(0, 3);
      top3.forEach((card, i) => {
        const typeColors: Record<string, string> = { Pulse: '#ff6b6b', Sine: '#6bffb8', Saw: '#ff9f43', Noise: '#a78bfa' };
        ctx.fillStyle = typeColors[card.type] || '#aaaaaa';
        ctx.font = '9px monospace';
        ctx.fillText(`${i + 1}. ${card.name}`, W - 20, lensY + 28 + i * 12);
      });
      tooltipZones.current.push({ x: W - 165, y: lensY, w: 150, h: 55, text: ['Debugger\'s Lens: See your next draws', ...top3.map((c, i) => `${i + 1}. ${c.name} (${c.type}, ${c.cost}⚡)`)] });
    }

    // === ENEMIES ===
    if (gameState.enemies.length > 0) {
      const enemyCount = gameState.enemies.length;
      const spacing = W / (enemyCount + 1);
      
      gameState.enemies.forEach((enemy, idx) => {
        const enemyX = spacing * (idx + 1);
        const enemyY = 80;
        const isSelected = enemy.id === gameState.selectedEnemyId;
        const colors = enemy.getArchetypeColors();

        // Enemy glow effect (archetype-colored)
        const glowSize = isSelected ? 50 : 42;
        ctx.fillStyle = isSelected ? 'rgba(255, 255, 0, 0.3)' : colors.glow;
        ctx.beginPath();
        ctx.arc(enemyX, enemyY, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Enemy circle with archetype gradient
        const enemyGradient = ctx.createRadialGradient(enemyX - 8, enemyY - 8, 0, enemyX, enemyY, 30);
        enemyGradient.addColorStop(0, isSelected ? '#ffff66' : colors.inner);
        enemyGradient.addColorStop(1, isSelected ? '#ffff00' : colors.outer);
        ctx.fillStyle = enemyGradient;
        ctx.beginPath();
        ctx.arc(enemyX, enemyY, 28, 0, Math.PI * 2);
        ctx.fill();

        // Shield arc overlay (blue ring when enemy has shield)
        if (enemy.shield > 0) {
          ctx.strokeStyle = 'rgba(80, 180, 255, 0.8)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(enemyX, enemyY, 32, 0, Math.PI * 2);
          ctx.stroke();
          // Shield value
          drawOutlinedText(`🔵${enemy.shield}`, enemyX, enemyY - 18, 'bold 9px monospace', '#55ccff', '#000000', 1);
        }

        // Enemy border (archetype-colored)
        ctx.strokeStyle = isSelected ? '#ffff00' : colors.border;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.arc(enemyX, enemyY, 28, 0, Math.PI * 2);
        ctx.stroke();

        // Health HP text with outline
        drawOutlinedText(`${enemy.hp}/${enemy.maxHp}`, enemyX, enemyY + 2, 'bold 11px monospace', '#ffffff', '#000000', 1);

        // Enemy name
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(enemy.name.substring(0, 14), enemyX, enemyY + 45);

        // Archetype tag below name (skip for common)
        if (enemy.archetype !== 'common') {
          ctx.fillStyle = colors.border;
          ctx.font = 'bold 7px monospace';
          ctx.fillText(enemy.archetype.toUpperCase(), enemyX, enemyY + 54);
        }
      });
    }

    // === SEQUENCES DISPLAY ===
    drawPanel(W / 2 - 200, seqY, 400, seqPanelH, 'PATTERN');
    tooltipZones.current.push({ x: W / 2 - 200, y: seqY, w: 400, h: 20, text: ['Pattern: Match the target sequence', 'Play cards in order to fill CURRENT', `A full match = Forge Burst (+${gameState.currentZone?.effect.type === 'forge_burst_bonus' ? gameState.currentZone.effect.value : 12} bonus dmg)`, '★ slots accept any waveform type', 'Wildcard cards match any slot'] });
    
    // Target sequence
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TARGET', W / 2, seqY + Math.round(20 * mScale));
    
    const tLen = gameState.targetSequence.length;
    const boxW = 36;
    const boxGap = 30;
    const tTotalW = tLen * boxW + (tLen - 1) * boxGap;
    const tStartX = W / 2 - tTotalW / 2;
    gameState.targetSequence.forEach((type, i) => {
      const x = tStartX + i * (boxW + boxGap) + boxW / 2;
      const isWild = type === '*';
      const typeColor = isWild ? '#ffcc00' : ({ 'Pulse': '#ff4444', 'Sine': '#4488ff', 'Saw': '#44ff44', 'Noise': '#ff88ff' }[type] || '#cccccc');
      
      const grad = ctx.createLinearGradient(x - boxW / 2, seqY + Math.round(25 * mScale), x - boxW / 2, seqY + Math.round(55 * mScale));
      grad.addColorStop(0, typeColor + '44');
      grad.addColorStop(1, typeColor + '11');
      ctx.fillStyle = grad;
      ctx.fillRect(x - boxW / 2, seqY + Math.round(25 * mScale), boxW, seqBoxH);
      
      ctx.strokeStyle = typeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - boxW / 2, seqY + Math.round(25 * mScale), boxW, seqBoxH);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(isWild ? '★' : type.substring(0, 2), x, seqY + Math.round(45 * mScale));
    });
    
    // Current sequence
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('CURRENT', W / 2, seqY + Math.round(75 * mScale));
    
    if (gameState.currentSequence.length > 0) {
      const cLen = gameState.currentSequence.length;
      const cTotalW = cLen * boxW + (cLen - 1) * boxGap;
      const cStartX = W / 2 - cTotalW / 2;
      gameState.currentSequence.forEach((type, i) => {
        const x = cStartX + i * (boxW + boxGap) + boxW / 2;
        const targetType = gameState.targetSequence[i];
        const isMatch = targetType === '*' || type === targetType;
        const matchColor = isMatch ? '#44ff44' : '#ff8844';
        
        const grad = ctx.createLinearGradient(x - boxW / 2, seqY + Math.round(80 * mScale), x - boxW / 2, seqY + Math.round(110 * mScale));
        grad.addColorStop(0, matchColor + '44');
        grad.addColorStop(1, matchColor + '11');
        ctx.fillStyle = grad;
        ctx.fillRect(x - boxW / 2, seqY + Math.round(80 * mScale), boxW, seqBoxH);
        
        ctx.strokeStyle = matchColor;
        ctx.lineWidth = isMatch ? 3 : 2;
        ctx.strokeRect(x - boxW / 2, seqY + Math.round(80 * mScale), boxW, seqBoxH);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(type.substring(0, 2), x, seqY + Math.round(100 * mScale));
      });
    }

    // === DAMAGE PREVIEW ===
    if (gameState.playedThisTurn.length > 0) {
      const isMatch = gameState.currentSequence.length === gameState.targetSequence.length &&
        gameState.targetSequence.every((t, i) => t === '*' || t === gameState.currentSequence[i]);
      const baseDamage = gameState.playedThisTurn.reduce((sum, c) => sum + c.getEffectiveDamage(), 0);
      const matchBonus = isMatch ? 12 : 0;
      // Harmonic Resonator relic: +4 for waveform pairs
      let resonatorBonus = 0;
      const resCount = countRelic(gameState.ownedRelics, 'harmonic_resonator');
      if (resCount > 0) {
        const typeCounts: Record<string, number> = {};
        gameState.playedThisTurn.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] || 0) + 1; });
        for (const count of Object.values(typeCounts)) {
          if (count >= 2) resonatorBonus += 4 * resCount;
        }
      }
      // Signal Mirror relic: +3 to first Saw
      const mirrorBonus = gameState.playedThisTurn.some(c => c.type === 'Saw') ? 3 * countRelic(gameState.ownedRelics, 'signal_mirror') : 0;
      const totalDamage = baseDamage + matchBonus + resonatorBonus + mirrorBonus;
      const hasAoe = gameState.playedThisTurn.some(c => c.aoe);
      
      const dmgGrad = ctx.createLinearGradient(W / 2 - 120, dmgBoxY, W / 2 + 120, dmgBoxY + dmgBoxH);
      dmgGrad.addColorStop(0, 'rgba(255, 200, 0, 0.25)');
      dmgGrad.addColorStop(0.5, 'rgba(255, 200, 0, 0.15)');
      dmgGrad.addColorStop(1, 'rgba(255, 200, 0, 0.25)');
      ctx.fillStyle = dmgGrad;
      ctx.fillRect(W / 2 - 120, dmgBoxY, 240, dmgBoxH);
      
      ctx.strokeStyle = '#ffc800';
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 120, dmgBoxY, 240, dmgBoxH);
      
      ctx.fillStyle = '#ffc800';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      const aoeMark = hasAoe ? ' [AOE]' : '';
      // Build equation: base + bonuses = total
      const bonusParts: string[] = [];
      if (matchBonus > 0) bonusParts.push(`${matchBonus}`);
      if (resonatorBonus > 0) bonusParts.push(`${resonatorBonus}`);
      if (mirrorBonus > 0) bonusParts.push(`${mirrorBonus}`);
      const equation = bonusParts.length > 0
        ? `DAMAGE: ${baseDamage}+${bonusParts.join('+')}=${totalDamage}${aoeMark}`
        : `DAMAGE: ${totalDamage}${aoeMark}`;
      ctx.fillText(equation, W / 2, dmgBoxY + Math.round(dmgBoxH * 0.7));

      // Damage preview tooltip with breakdown
      const dmgTipLines = ['Damage Preview (applied on End Turn)'];
      dmgTipLines.push(`Base: ${baseDamage} (sum of card damage)`);
      if (isMatch) dmgTipLines.push(`Forge Burst: +${matchBonus}`);
      if (resonatorBonus > 0) dmgTipLines.push(`Harmonic Resonator: +${resonatorBonus}`);
      if (mirrorBonus > 0) dmgTipLines.push(`Signal Mirror: +${mirrorBonus}`);
      if (hasAoe) dmgTipLines.push('AOE: Hits ALL enemies');
      dmgTipLines.push(`Total: ${totalDamage}`);
      tooltipZones.current.push({ x: W / 2 - 120, y: dmgBoxY, w: 240, h: dmgBoxH, text: dmgTipLines });
    }

    // === TEMPO BAR ===
    const tempoW = 250;
    tooltipZones.current.push({ x: W / 2 - tempoW / 2, y: tempoY, w: tempoW, h: tempoBarH, text: ['Tempo Bar: Builds as you play cards', 'Each card played adds +1 tempo', 'Some cards grant bonus tempo', 'Max 6 — resets each turn'] });
    
    ctx.fillStyle = 'rgba(183, 142, 246, 0.1)';
    ctx.fillRect(W / 2 - tempoW / 2, tempoY, tempoW, tempoBarH);
    
    const tempoFill = (gameState.playerTempo / 6) * tempoW;
    const tempoGrad = ctx.createLinearGradient(W / 2 - tempoW / 2, tempoY, W / 2 - tempoW / 2 + tempoFill, tempoY + tempoBarH);
    tempoGrad.addColorStop(0, '#9966ff');
    tempoGrad.addColorStop(1, '#6b4fbb');
    ctx.fillStyle = tempoGrad;
    ctx.fillRect(W / 2 - tempoW / 2, tempoY, tempoFill, tempoBarH);
    
    ctx.strokeStyle = '#b78ef6';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - tempoW / 2, tempoY, tempoW, tempoBarH);
    
    drawOutlinedText(`TEMPO: ${gameState.playerTempo}/6`, W / 2, tempoY + Math.round(tempoBarH * 0.68), 'bold 12px monospace', '#ffffff', '#000000', 1);

    // === PLAYED CARDS ===
    drawPanel(20, playedPanelY, W - 40, panelH, 'PLAYED (' + gameState.playedThisTurn.length + ')');
    tooltipZones.current.push({ x: 20, y: playedPanelY - 12, w: 120, h: 16, text: ['Played Cards: Cards used this turn', 'Click a played card to return it', 'to your hand and refund its cost', '🔒 = locked (irreversible effect)'] });
    
    cardRects.current = [];
    if (gameState.playedThisTurn.length > 0) {
      const playedCardW = cardW;
      const playedCardH = cardH;
      const playedStartX = 40;
      const playedStartY = playedPanelY + cardPadY;
      const playedGapX = cardGapX;
      
      gameState.playedThisTurn.forEach((card, i) => {
        const cardX = playedStartX + i * playedGapX;
        if (cardX + playedCardW > W - 20) return;
        
        drawCard(card, cardX, playedStartY, playedCardW, playedCardH);

        // Lock overlay for cards with irreversible effects
        const isLocked = !!(card.draw || card.glitchGen || card.stabilize);
        if (isLocked) {
          ctx.save();
          drawRoundRect(cardX, playedStartY, playedCardW, playedCardH, 8);
          ctx.clip();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(cardX, playedStartY, playedCardW, playedCardH);
          ctx.restore();
          ctx.fillStyle = '#ff8888';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🔒', cardX + playedCardW / 2, playedStartY + playedCardH / 2 + 4);
        }

        cardRects.current.push({ index: i, x: cardX, y: playedStartY, w: playedCardW, h: playedCardH, type: 'played' });
      });
    }

    // === HAND CARDS ===
    drawPanel(20, handPanelY, W - 40, panelH, 'HAND (' + gameState.hand.length + ')');
    tooltipZones.current.push({ x: 20, y: handPanelY - 12, w: 120, h: 16, text: ['Your Hand: Available cards to play', 'Click a card to play it', 'Grayed = not enough energy'] });
    
    // 8.2 — Determine next needed sequence type for highlighting
    const nextSlotIdx = gameState.currentSequence.length;
    const neededType = nextSlotIdx < gameState.targetSequence.length
      ? gameState.targetSequence[nextSlotIdx]
      : null;

    // 8.5 — Sort hand based on sort mode
    let sortedHand = [...gameState.hand];
    const handIndexMap: number[] = gameState.hand.map((_, i) => i); // original indices
    switch (gameState.handSortMode) {
      case 'cost': {
        const sorted = sortedHand.map((c, i) => ({ card: c, origIdx: i }))
          .sort((a, b) => a.card.cost - b.card.cost);
        sortedHand = sorted.map(s => s.card);
        const newMap = sorted.map(s => s.origIdx);
        handIndexMap.splice(0, handIndexMap.length, ...newMap);
        break;
      }
      case 'type': {
        const typeOrder: Record<string, number> = { Pulse: 0, Sine: 1, Saw: 2, Noise: 3 };
        const sorted = sortedHand.map((c, i) => ({ card: c, origIdx: i }))
          .sort((a, b) => (typeOrder[a.card.type] ?? 4) - (typeOrder[b.card.type] ?? 4));
        sortedHand = sorted.map(s => s.card);
        const newMap = sorted.map(s => s.origIdx);
        handIndexMap.splice(0, handIndexMap.length, ...newMap);
        break;
      }
      case 'damage': {
        const sorted = sortedHand.map((c, i) => ({ card: c, origIdx: i }))
          .sort((a, b) => b.card.damage - a.card.damage);
        sortedHand = sorted.map(s => s.card);
        const newMap = sorted.map(s => s.origIdx);
        handIndexMap.splice(0, handIndexMap.length, ...newMap);
        break;
      }
    }

    const handCardW = cardW;
    const handCardH = cardH;
    const handStartX = 40;
    const handStartY = handPanelY + cardPadY;
    const handGapX = cardGapX;
    const cardsPerRow = Math.floor((W - 60) / handGapX);
    
    sortedHand.forEach((card, i) => {
      const row = Math.floor(i / cardsPerRow);
      const col = i % cardsPerRow;
      const cardX = handStartX + col * handGapX;
      const cardY = handStartY + row * (handCardH + 10);
      
      const canPlay = card.cost <= gameState.playerEnergy;

      // 8.2 — Sequence helper: golden glow for matching cards
      const isSequenceMatch = neededType && (neededType === '*' || card.type === neededType || card.wildcard);
      if (isSequenceMatch && canPlay) {
        ctx.save();
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        drawRoundRect(cardX - 1, cardY - 1, handCardW + 2, handCardH + 2, 8);
        ctx.stroke();
        ctx.restore();
      }

      drawCard(card, cardX, cardY, handCardW, handCardH);
      
      // Mulligan highlight — show selected cards with red border
      const origIdx = handIndexMap[i];
      if (gameState.mulliganAvailable && gameState.mulliganSelected.includes(origIdx)) {
        ctx.save();
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        drawRoundRect(cardX - 1, cardY - 1, handCardW + 2, handCardH + 2, 8);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MULLIGAN', cardX + handCardW / 2, cardY + handCardH - 4);
      }

      if (!canPlay && !gameState.mulliganAvailable) {
        ctx.save();
        drawRoundRect(cardX, cardY, handCardW, handCardH, 8);
        ctx.clip();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(cardX, cardY, handCardW, handCardH);
        ctx.restore();
        ctx.fillStyle = '#888888';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO', cardX + handCardW / 2, cardY + handCardH / 2 - 2);
        ctx.fillText('COST', cardX + handCardW / 2, cardY + handCardH / 2 + 8);
      }
      
      // Map back to original hand index for playCard
      cardRects.current.push({ index: origIdx, x: cardX, y: cardY, w: handCardW, h: handCardH, type: 'hand' });
    });

    // === END TURN BUTTON ===
    const btnY = H - 45;
    const btnW = 160;
    const btnH = 35;
    const btnX = W / 2 - btnW / 2;
    
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, '#00d4ff');
    btnGrad.addColorStop(1, '#0088cc');
    ctx.fillStyle = btnGrad;
    drawRoundRect(btnX, btnY, btnW, btnH, 8);
    ctx.fill();
    
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    drawRoundRect(btnX, btnY, btnW, btnH, 8);
    ctx.stroke();
    
    drawOutlinedText('END TURN', btnX + btnW / 2, btnY + btnH / 2 + 5, 'bold 14px monospace', '#ffffff', '#000000', 2);
    
    endTurnRect.current = { x: btnX, y: btnY, w: btnW, h: btnH };

    // 1.6 — Damage preview for End Turn tooltip
    const pvDmgMult = gameState.currentZone?.effect.type === 'damage_mult' ? gameState.currentZone.effect.value : 1;
    const previewPlayerDmg = Math.floor(gameState.playedThisTurn.reduce((sum, c) => {
      let d = c.getEffectiveDamage();
      d += gameState.playerTempo; // tempo bonus
      if (c.echo) d = Math.floor(d * 1.5); // echo repeats at 50%
      return sum + d;
    }, 0) * pvDmgMult);
    const previewEnemyDmg = Math.floor(gameState.enemies.reduce((sum, e) => {
      if (e.hp <= 0) return sum;
      const frozen = e.statusEffects?.find(s => s.type === 'freeze' && s.duration > 0);
      if (frozen) return sum;
      return sum + e.damage;
    }, 0) * pvDmgMult);
    const previewAfterShield = Math.max(0, previewEnemyDmg - gameState.playerShield);

    tooltipZones.current.push({ x: btnX, y: btnY, w: btnW, h: btnH, text: [
      'End Turn: Resolve combat',
      `⚔️ You deal ~${previewPlayerDmg} damage`,
      `🛡️ Enemies deal ~${previewEnemyDmg} (${previewAfterShield} after shield)`,
      '',
      'Q: End turn | 1-9: Play cards',
      'S: Sort | D: Deck | F: Discard',
    ] });

    // Draw player at bottom right
    const playerX = W - 70;
    const playerY = btnY + 10;
    
    ctx.fillStyle = 'rgba(0, 255, 200, 0.15)';
    ctx.beginPath();
    ctx.arc(playerX, playerY, 30, 0, Math.PI * 2);
    ctx.fill();
    
    const playerGradient = ctx.createRadialGradient(playerX - 5, playerY - 5, 0, playerX, playerY, 25);
    playerGradient.addColorStop(0, '#00ffdd');
    playerGradient.addColorStop(1, '#00aa99');
    ctx.fillStyle = playerGradient;
    ctx.beginPath();
    ctx.arc(playerX, playerY, 25, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(playerX, playerY, 25, 0, Math.PI * 2);
    ctx.stroke();
    
    drawOutlinedText(`${gameState.playerHp}/${gameState.playerMaxHp}`, playerX, playerY - 2, 'bold 12px monospace', '#ffffff', '#000000', 1);

    // === TURN INDICATOR (to the left of player circle) ===
    const turnX = playerX - 55;
    const turnY = playerY;
    ctx.fillStyle = 'rgba(0, 100, 120, 0.5)';
    ctx.beginPath();
    ctx.arc(turnX, turnY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00cccc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(turnX, turnY, 18, 0, Math.PI * 2);
    ctx.stroke();
    drawOutlinedText('T' + gameState.turn, turnX, turnY + 1, 'bold 11px monospace', '#00ffc8', '#000000', 1);
    tooltipZones.current.push({ x: turnX - 18, y: turnY - 18, w: 36, h: 36, text: ['Turn: Current turn number'] });

    const playerTipLines = [
      'You: The Signal Forger',
      `HP: ${gameState.playerHp}/${gameState.playerMaxHp}`,
      `Shield: ${gameState.playerShield}`,
      `Static: ${gameState.playerStatic}/${gameState.glitchThreshold}`,
      `Relics: ${gameState.ownedRelics.length > 0 ? gameState.ownedRelics.map(r => r.name).join(', ') : 'None'}`,
    ];
    tooltipZones.current.push({ x: playerX - 30, y: playerY - 30, w: 60, h: 60, text: playerTipLines });

    // === CARD TOOLTIPS (with keyword/ability info) ===
    for (const cr of cardRects.current) {
      const card = cr.type === 'hand' ? gameState.hand[cr.index] : gameState.playedThisTurn[cr.index];
      if (card) {
        const lines: string[] = [
          card.name,
          `Type: ${card.type}  |  Rarity: ${card.rarity}`,
          card.cost >= 99 ? 'Cost: UNPLAYABLE' : `Cost: ${card.cost} Energy`,
        ];
        if (card.damage > 0) lines.push(`Damage: ${card.getEffectiveDamage()}${card.echo ? ' (Echo +50%)' : ''}${card.aoe ? ' [AOE]' : ''}`);
        if (card.shield > 0) lines.push(`Shield: ${card.getEffectiveShield()}${card.echo ? ' (Echo +50%)' : ''}`);
        if (card.draw) lines.push(`Draw: +${card.draw} card(s)`);
        if (card.tempoGain) lines.push(`Tempo: +${card.tempoGain} extra`);
        if (card.staticGain) lines.push(`Static: +${card.staticGain}`);
        if (card.staticReduce) lines.push(`Static Reduce: -${card.staticReduce}`);
        if (card.stabilize) lines.push(`Stabilize: Purge ${card.stabilize} Glitch`);
        if (card.selfDamage) lines.push(`Self Damage: ${card.selfDamage}`);
        if (card.glitchGen) lines.push(`Generates ${card.glitchGen} Glitch card(s)`);
        if (card.leech) lines.push(`Leech: Heal ${card.leech}% of dmg dealt`);
        if (card.sustain) lines.push('Sustain: Returns to hand');
        if (card.exhaust) lines.push('Exhaust: Removed after use');
        if (card.wildcard) lines.push('Wildcard: Matches any type');
        if (card.piercing) lines.push('Piercing: Ignores enemy shield/armor');
        if (card.chain) lines.push(`Chain: Next ${card.type} costs ${card.chain} less`);
        if (card.growing) lines.push(`Growing: +${card.growing} dmg each play (${card.growthCounter ?? 0} stacks)`);
        if (card.retain) lines.push('Retain: Stays in hand between turns');
        if (card.multihit) lines.push(`Multihit: Hits ${card.multihit} times`);
        if (card.innate) lines.push('Innate: Always in opening hand');
        if (card.ethereal) lines.push('Ethereal: Auto-exhausts if unplayed');
        if (card.siphon) lines.push(`Siphon: Steal ${card.siphon} shield from enemy`);
        if (card.bleed) lines.push(`Bleed: Apply ${card.bleed} bleed stacks`);
        if (card.freeze) lines.push(`Freeze: Apply ${card.freeze} freeze`);
        if (card.vulnerable) lines.push(`Vulnerable: Apply ${card.vulnerable} stacks`);
        if (card.weak) lines.push(`Weak: Apply ${card.weak} stacks`);
        if (card.upgraded) lines.push('★ UPGRADED (+25% stats)');
        lines.push(card.effect);
        // 8.3 — Add keyword explanations from glossary
        const keywordTips = getRelevantTooltips(card);
        if (keywordTips.length > 0) {
          lines.push('');
          keywordTips.forEach(tip => lines.push(`• ${tip.term}: ${tip.explanation}`));
        }
        tooltipZones.current.push({
          x: cr.x, y: cr.y, w: cr.w, h: cr.h,
          text: lines,
        });
      }
    }

    // === COMBAT LOG (last turn's events) ===
    if (gameState.combatLog.length > 0) {
      const logX = 10;
      const hasZoneLog = gameState.currentZone && gameState.currentZone.effect.type !== 'none';
      const logY = hasZoneLog ? 140 : 120;
      const logLineH = 14;
      const logLines = gameState.combatLog.slice(0, 5);
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(10, 14, 39, 0.7)';
      const logH = logLines.length * logLineH + 10;
      drawRoundRect(logX, logY, 200, logH, 4);
      ctx.fill();
      logLines.forEach((line, li) => {
        ctx.fillStyle = '#aaeeff';
        ctx.fillText(line, logX + 6, logY + 12 + li * logLineH);
      });
      tooltipZones.current.push({ x: logX, y: logY, w: 200, h: logH, text: ['Combat Log: Last turn events', ...gameState.combatLog] });
    }

    // === ENEMY TOOLTIPS ===
    if (gameState.enemies.length > 0) {
      const enemyCount = gameState.enemies.length;
      const enemySpacing = W / (enemyCount + 1);
      gameState.enemies.forEach((enemy, idx) => {
        const ex = enemySpacing * (idx + 1);
        const ey = 80;
        const tipLines: string[] = [
          `${enemy.name}${enemy.archetype !== 'common' ? ` [${enemy.archetype.toUpperCase()}]` : ''}`,
          enemy.description || '',
          `HP: ${enemy.hp}/${enemy.maxHp}${enemy.shield > 0 ? ` | Shield: ${enemy.shield}` : ''}`,
          `Intent: ${enemy.intent} | Dmg: ${enemy.getDamage()}${enemy.enrage && enemy.hp <= enemy.maxHp * 0.5 ? ' (ENRAGED!)' : ''}`,
        ].filter(Boolean);
        // Add ability descriptions
        const abilities = enemy.getAbilityDescriptions();
        if (abilities.length > 0) {
          tipLines.push('--- Abilities ---');
          tipLines.push(...abilities);
        }
        tipLines.push('Click to target this enemy');
        tooltipZones.current.push({
          x: ex - 35, y: ey - 35, w: 70, h: 95,
          text: tipLines,
        });
      });
    }

    // === DRAW TOOLTIP ===
    const mp = mousePos.current;
    if (mp) {
      for (let i = tooltipZones.current.length - 1; i >= 0; i--) {
        const zone = tooltipZones.current[i];
        if (mp.x >= zone.x && mp.x <= zone.x + zone.w && mp.y >= zone.y && mp.y <= zone.y + zone.h) {
          const lines = zone.text;
          ctx.font = 'bold 11px monospace';
          const lineH = 16;
          const pad = 10;
          let maxLineW = 0;
          for (const line of lines) {
            maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
          }
          const tipW = maxLineW + pad * 2;
          const tipH = lines.length * lineH + pad * 2 - 4;

          // Position tooltip near mouse, clamped to canvas
          let tipX = mp.x + 14;
          let tipY = mp.y + 14;
          if (tipX + tipW > W - 4) tipX = mp.x - tipW - 8;
          if (tipY + tipH > H - 4) tipY = mp.y - tipH - 8;
          if (tipX < 4) tipX = 4;
          if (tipY < 4) tipY = 4;

          // Background
          ctx.fillStyle = 'rgba(10, 14, 39, 0.95)';
          drawRoundRect(tipX, tipY, tipW, tipH, 6);
          ctx.fill();
          ctx.strokeStyle = '#00ffc8';
          ctx.lineWidth = 1.5;
          drawRoundRect(tipX, tipY, tipW, tipH, 6);
          ctx.stroke();

          // Text
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          lines.forEach((line, li) => {
            ctx.fillStyle = li === 0 ? '#00ffc8' : '#cccccc';
            ctx.font = li === 0 ? 'bold 11px monospace' : '11px monospace';
            ctx.fillText(line, tipX + pad, tipY + pad + li * lineH + 10);
          });
          break;
        }
      }
    }

  }, [gameState, canvasSize, tooltipTick]);

  // Unplay card (return from played area to hand)
  const unplayCard = useCallback((cardIndex: number) => {
    setGameState(prev => {
      if (cardIndex < 0 || cardIndex >= prev.playedThisTurn.length) return prev;
      const card = prev.playedThisTurn[cardIndex];

      // Block unplay for cards with irreversible on-play effects
      if (card.draw || card.glitchGen || card.stabilize) return prev;

      const playedThisTurn = prev.playedThisTurn.filter((_, i) => i !== cardIndex);
      const hand = [...prev.hand, card];
      // Recalculate sequence — wildcard cards contributed the expected match type
      const sequence = playedThisTurn.map(c => c.wildcard ? c.type : c.type);
      const playerEnergy = prev.playerEnergy + card.getCost();
      const playerTempo = Math.max(prev.playerTempo - 1 - (card.tempoGain ?? 0), 0);
      let playerStatic = prev.playerStatic;

      // Undo static gain
      const typeCount = playedThisTurn.filter(c => c.type === card.type).length;
      if (typeCount === 0) {
        playerStatic = Math.max(playerStatic - 1, 0);
      }
      // Undo extra staticGain from card
      if (card.staticGain) playerStatic = Math.max(playerStatic - card.staticGain, 0);
      // Undo staticReduce from card
      if (card.staticReduce) playerStatic += card.staticReduce;

      const playerShield = prev.playerShield - card.getEffectiveShield();
      const playerHp = card.selfDamage ? Math.min(prev.playerMaxHp, prev.playerHp + card.selfDamage) : prev.playerHp;

      // 8.6 — Undo chain discount if this card set one
      let chainDiscount = prev.chainDiscount;
      if (card.chain) {
        // Remove chain discount this card might have applied
        chainDiscount = undefined;
      }

      // 8.6 — Undo growing counter
      if (card.growing && card.growthCounter && card.growthCounter > 0) {
        card.growthCounter--;
      }

      // 8.6 — Remove this card's type from waveformTypesPlayedThisTurn (for waveform_tuner)
      const waveformTypesPlayedThisTurn = [...prev.waveformTypesPlayedThisTurn];
      const typeIdx = waveformTypesPlayedThisTurn.lastIndexOf(card.type);
      if (typeIdx >= 0) {
        waveformTypesPlayedThisTurn.splice(typeIdx, 1);
      }

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
      };
    });
  }, []);

  // Play card — full keyword/ability support
  const playCard = useCallback((cardIndex: number) => {
    setGameState(prev => {
      if (cardIndex < 0 || cardIndex >= prev.hand.length) return prev;
      const card = prev.hand[cardIndex];

      // Calculate effective cost
      let effectiveCost = card.getCost();
      // Chain discount: if previous card set a discount for this type
      if (prev.chainDiscount && card.type === prev.chainDiscount.type) {
        effectiveCost = Math.max(0, effectiveCost - prev.chainDiscount.amount);
      }
      // Oscillator Core relic: first Pulse each turn costs 0
      if (card.type === 'Pulse' && !prev.firstPulsePlayedThisTurn && hasRelic(prev.ownedRelics, 'oscillator_core')) {
        effectiveCost = 0;
      }
      // Waveform Tuner relic: first card of each waveform type costs 1 less
      if (hasRelic(prev.ownedRelics, 'waveform_tuner') && !prev.waveformTypesPlayedThisTurn.includes(card.type)) {
        effectiveCost = Math.max(0, effectiveCost - 1);
      }
      // Momentum Core: all cards cost 1 less this turn
      if (prev.momentumCoreActive) {
        effectiveCost = Math.max(0, effectiveCost - 1);
      }
      if (effectiveCost > prev.playerEnergy) return prev;
      // Glitch cards with cost 99 are unplayable
      if (card.isGlitch && card.cost >= 99) return prev;

      let hand = prev.hand.filter((_, i) => i !== cardIndex);
      const played = [...prev.playedThisTurn, card];

      // Sequence: wildcard counts as the type needed by the target sequence, else fallback to card type
      let seqType = card.type;
      if (card.wildcard) {
        const seqIdx = prev.currentSequence.length;
        if (seqIdx < prev.targetSequence.length) {
          seqType = prev.targetSequence[seqIdx] as typeof seqType;
        }
      }
      let sequence = [...prev.currentSequence, seqType];

      const playerEnergy = prev.playerEnergy - effectiveCost;
      // Zone: tempo cap override (default 6)
      const tempoCap = prev.currentZone?.effect.type === 'tempo_cap' ? prev.currentZone.effect.value : 6;
      const playerTempo = Math.min(prev.playerTempo + 1 + (card.tempoGain ?? 0), tempoCap);
      let playerStatic = prev.playerStatic;
      // Zone: shield multiplier
      const zoneShieldMult = prev.currentZone?.effect.type === 'shield_mult' ? prev.currentZone.effect.value : 1;
      const shieldFromCard = zoneShieldMult !== 1 ? Math.floor(card.getEffectiveShield() * zoneShieldMult) : card.getEffectiveShield();
      const playerShield = prev.playerShield + shieldFromCard;
      let playerHp = prev.playerHp;
      let deck = [...prev.deck];
      let discard = [...prev.discard];
      let currency = prev.currency;

      // Track first Pulse / first Saw for relic effects
      const firstPulsePlayedThisTurn = prev.firstPulsePlayedThisTurn || card.type === 'Pulse';
      const firstSawPlayedThisTurn = prev.firstSawPlayedThisTurn || card.type === 'Saw';

      // Static: duplicate types increase static
      const typeCount = played.filter(c => c.type === card.type).length;
      if (typeCount > 1) {
        playerStatic += 1;
      }

      // Card-specific: extra static gain
      if (card.staticGain) {
        playerStatic += card.staticGain;
      }

      // Card-specific: static reduce
      if (card.staticReduce) {
        playerStatic = Math.max(0, playerStatic - card.staticReduce);
      }

      // Card-specific: self damage
      if (card.selfDamage) {
        playerHp = Math.max(0, playerHp - card.selfDamage);
      }

      // Card-specific: glitch generation
      if (card.glitchGen && card.glitchGen > 0) {
        for (let i = 0; i < card.glitchGen; i++) {
          const glitch = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000));
          discard = [...discard, glitch];
          // Fault Lens relic: +10 currency per Glitch created per copy
          const faultLensCountPlay = countRelic(prev.ownedRelics, 'fault_lens');
          if (faultLensCountPlay > 0) {
            currency += 10 * faultLensCountPlay;
          }
        }
      }

      // Card-specific: stabilize (purge Glitch from discard)
      if (card.stabilize && card.stabilize > 0) {
        let removed = 0;
        discard = discard.filter(c => {
          if (removed < (card.stabilize ?? 0) && c.isGlitch) {
            removed++;
            return false;
          }
          return true;
        });
      }

      // Card-specific: draw extra cards
      let reshuffleCount = prev.reshuffleCount;
      const tempLog: string[] = [];
      if (card.draw && card.draw > 0) {
        for (let i = 0; i < card.draw; i++) {
          // Check if we need to reshuffle before drawing
          if (deck.length === 0) {
            const refillResult = refillDeckFromDiscard(deck, discard, reshuffleCount, tempLog);
            deck = refillResult.deck;
            discard = refillResult.discard;
            reshuffleCount = refillResult.reshuffleCount;
            playerHp = Math.max(0, playerHp - refillResult.fatigueDamage);
          }

          if (deck.length > 0) {
            const idx = Math.floor(Math.random() * deck.length);
            const drawn = deck[idx];
            deck = deck.filter((_, j) => j !== idx);
            // Clean Room relic: Glitch exhausts on draw
            if (drawn.isGlitch && hasRelic(prev.ownedRelics, 'clean_room')) {
              // Card is simply removed
            } else {
              hand = [...hand, drawn];
            }
          }
        }
      }

      // Growing: increment counter for this card
      if (card.growing) {
        card.growthCounter = (card.growthCounter ?? 0) + 1;
      }

      // Chain: set discount for next card of same type
      let chainDiscount = prev.chainDiscount;
      if (card.chain) {
        chainDiscount = { type: card.type, amount: 1 };
      } else if (chainDiscount && card.type === chainDiscount.type) {
        // Discount was consumed
        chainDiscount = undefined;
      }

      // Signal Boost: all Pulse cards in hand get +4 damage this turn
      if (card.name === 'Signal Boost') {
        played.forEach(c => { if (c.type === 'Pulse') c.damage += 4; });
        hand.forEach(c => { if (c.type === 'Pulse') c.damage += 4; });
        tempLog.push('Signal Boost: All Pulse cards deal +4 damage this turn!');
      }

      // Pattern Forge: fill next sequence slot automatically
      if (card.name === 'Pattern Forge' && sequence.length < prev.targetSequence.length) {
        sequence = [...sequence, prev.targetSequence[sequence.length]];
        tempLog.push('Pattern Forge: Extra sequence slot filled!');
      }

      // Chaos Theory: draw 0–2 cards on play
      if (card.name === 'Chaos Theory') {
        const extraDraws = Math.floor(Math.random() * 3); // 0, 1, or 2
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
      };
    });
  }, [refillDeckFromDiscard]);

  // Select target enemy
  const selectEnemy = useCallback((enemyId: number) => {
    setGameState(prev => ({
      ...prev,
      selectedEnemyId: enemyId,
    }));
  }, []);

  // End turn - resolve combat and draw new cards (full keyword/relic support)
  const endTurn = useCallback(() => {
    setGameState(prev => {
      if (prev.phase !== 'combat') return prev;

      const log: string[] = [];
      let playerHp = prev.playerHp;
      let playerShield = prev.playerShield;

      // --- START OF TURN EFFECTS: Process bleed on enemies ---
      const enemiesClonedForBleed = prev.enemies.map(e => e.clone());
      for (const enemy of enemiesClonedForBleed) {
        const bleed = enemy.statusEffects.find(s => s.type === 'bleed');
        if (bleed && bleed.stacks > 0) {
          // Relic: Bleed Catalyst (+2 damage per stack)
          const bleedDamage = hasRelic(prev.ownedRelics, 'bleed_catalyst')
            ? bleed.stacks + 2 * bleed.stacks
            : bleed.stacks;
          enemy.hp = Math.max(0, enemy.hp - bleedDamage);
          log.push(`${enemy.name} takes ${bleedDamage} bleed damage.`);
        }
      }

      // --- Sequence match check (supports '*' wildcard slots from Phase Shifter) ---
      const isMatch = prev.currentSequence.length === prev.targetSequence.length &&
        prev.targetSequence.every((t, i) => t === '*' || t === prev.currentSequence[i]);
      // Zone: Forge Burst bonus override (default 12)
      const forgeBurstValue = prev.currentZone?.effect.type === 'forge_burst_bonus' ? prev.currentZone.effect.value : 12;
      const matchBonus = isMatch ? forgeBurstValue : 0;
      if (isMatch) log.push(`Forge Burst! +${forgeBurstValue} bonus damage`);

      // Zone: damage multiplier (applies to all damage dealt)
      const zoneDamageMult = prev.currentZone?.effect.type === 'damage_mult' ? prev.currentZone.effect.value : 1;
      // Zone: shield multiplier (applies to all shield gained)
      const zoneShieldMult = prev.currentZone?.effect.type === 'shield_mult' ? prev.currentZone.effect.value : 1;

      // --- Relic: Tempo Gear (+1 tempo per copy on sequence match) ---
      let playerTempo = prev.playerTempo;
      const tempoGearCount = countRelic(prev.ownedRelics, 'tempo_gear');
      // Zone: tempo cap override (default 6)
      const tempoCap = prev.currentZone?.effect.type === 'tempo_cap' ? prev.currentZone.effect.value : 6;
      if (isMatch && tempoGearCount > 0) {
        playerTempo = Math.min(tempoCap, playerTempo + tempoGearCount);
        log.push(`Tempo Gear (x${tempoGearCount}): +${tempoGearCount} tempo from match`);
      }

      // --- Relic: Harmonic Resonator (+4 dmg for waveform pairs) ---
      let resonatorBonus = 0;
      const resonatorCount = countRelic(prev.ownedRelics, 'harmonic_resonator');
      if (resonatorCount > 0) {
        const typeCounts: Record<string, number> = {};
        prev.playedThisTurn.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1; });
        const pairs = Object.values(typeCounts).reduce((sum, n) => sum + Math.floor(n / 2), 0);
        resonatorBonus = pairs * 4 * resonatorCount;
        if (resonatorBonus > 0) log.push(`Harmonic Resonator (x${resonatorCount}): +${resonatorBonus} dmg`);
      }

      // --- Relic: Signal Mirror (+3 dmg to first Saw card per copy) ---
      const signalMirrorCount = countRelic(prev.ownedRelics, 'signal_mirror');

      // --- Tempo damage bonus (snapshot before reset) ---
      const tempoBonusDmg = playerTempo;

      // --- Compute per-card damage & total ---
      let totalDamage = matchBonus + resonatorBonus;
      let totalLeechDamage = 0; // damage dealt by leech cards, for healing calc

      // Phase 4.2 — Check for enemy auras
      const echoCanceled = enemiesClonedForBleed.some(e => e.auraEchoCanceled && e.hp > 0);
      const auraDmgReduce = enemiesClonedForBleed
        .filter(e => e.auraDamageReduction && e.auraDamageReduction > 0 && e.hp > 0)
        .reduce((sum, e) => sum + (e.auraDamageReduction ?? 0), 0);

      const cardDamages: { card: Card; dmg: number; skipNormalDmg?: boolean }[] = prev.playedThisTurn.map((card, idx) => {
        let dmg = card.getEffectiveDamage();  // includes Echo 50% bonus
        let skipNormalDmg = false;
        
        // Relic: Signal Amplifier (+1 damage per copy)
        dmg += countRelic(prev.ownedRelics, 'signal_amplifier');
        
        // Relic: Void Harvester cumulative bonus
        dmg += prev.voidHarvesterDmgBonus;
        
        // Phase 4.2 — Echo Disruptor: cancel Echo bonus
        if (echoCanceled && card.echo) {
          // Recalculate without echo bonus
          dmg = card.damage + (card.growing ? card.growthCounter * (card.growing ?? 0) : 0);
        }
        
        // === Special card damage overrides ===
        if (card.name === 'Final Cut') {
          dmg = prev.playedThisTurn.length * 8;
        } else if (card.name === 'Entropy Bomb') {
          dmg = prev.playerStatic * 8;
        } else if (card.name === 'White Noise') {
          dmg = prev.playerStatic * 3;
        } else if (card.name === 'Shield Nova') {
          dmg = playerShield; // damage = current shield, keep shield
        } else if (card.name === 'Harmonic Convergence') {
          const uniqueTypes = new Set(prev.playedThisTurn.map(c => c.type));
          dmg = uniqueTypes.size * 5;
        } else if (card.name === 'System Crash') {
          dmg = prev.playerStatic * 5;
        } else if (card.name === 'Recursion') {
          const lastPlayed = prev.playedThisTurn[idx - 1];
          if (lastPlayed) {
            dmg = lastPlayed.getEffectiveDamage();
            // Copy shield too (handled below in shield processing)
          }
        } else if (card.name === 'Chaos Theory') {
          dmg = 3 + Math.floor(Math.random() * 10); // 3–12
        } else if (card.name === 'Barrier Shift') {
          dmg = playerShield; // convert all shield to damage
          playerShield = 6; // then gain 6 new shield (from card.shield)
        } else if (card.name === 'Blade Storm') {
          skipNormalDmg = true; // handled specially below
        } else if (card.name === 'Chain Lightning') {
          skipNormalDmg = true; // handled specially below
        } else if (card.name === 'Glitch Exploit') {
          skipNormalDmg = true; // handled specially below
        }
        
        // Signal Mirror: first Saw in the played list gets +3 per copy
        if (signalMirrorCount > 0 && card.type === 'Saw' && !prev.playedThisTurn.slice(0, idx).some(c => c.type === 'Saw')) {
          dmg += 3 * signalMirrorCount;
        }
        // Tempo bonus: each card gains +playerTempo damage
        dmg += tempoBonusDmg;
        
        // Phase 4.2 — Dampener: reduce all damage
        dmg = Math.max(0, dmg - auraDmgReduce);
        
        // Zone: damage multiplier
        if (zoneDamageMult !== 1) dmg = Math.floor(dmg * zoneDamageMult);
        
        return { card, dmg, skipNormalDmg };
      });

      // --- Apply damage to enemies (with status effect modifiers) ---
      const enemiesCloned = enemiesClonedForBleed;
      let thornsDamage = 0; // accumulated thorns reflection
      for (const { card, dmg, skipNormalDmg } of cardDamages) {
        // === Special cards with custom targeting ===
        if (skipNormalDmg) {
          const livingEnemies = enemiesCloned.filter(e => e.hp > 0);
          if (card.name === 'Blade Storm') {
            const hitCount = prev.playerTempo;
            for (let h = 0; h < hitCount; h++) {
              const randomTarget = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
              if (randomTarget) {
                const absorbed = randomTarget.takeDamage(4 + tempoBonusDmg, prev.turn);
                totalDamage += absorbed;
              }
            }
            log.push(`Blade Storm hits ${hitCount} times for ${4 + tempoBonusDmg} each!`);
          } else if (card.name === 'Chain Lightning') {
            const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
            const cascadeDmg = [12 + tempoBonusDmg, 8 + tempoBonusDmg, 4 + tempoBonusDmg];
            const targetIdx = target ? livingEnemies.indexOf(target) : 0;
            for (let i = 0; i < Math.min(3, livingEnemies.length); i++) {
              const idx = (targetIdx + i) % livingEnemies.length;
              const absorbed = livingEnemies[idx].takeDamage(cascadeDmg[i], prev.turn);
              totalDamage += absorbed;
            }
            log.push(`Chain Lightning cascades for ${cascadeDmg.slice(0, livingEnemies.length).join(' → ')} damage!`);
          } else if (card.name === 'Glitch Exploit') {
            const glitchCards = [...prev.hand].filter(c => c.isGlitch);
            const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
            if (target && glitchCards.length > 0) {
              glitchCards.forEach(() => {
                const absorbed = target.takeDamage(8, prev.turn);
                totalDamage += absorbed;
              });
              log.push(`Glitch Exploit! ${glitchCards.length} Glitch cards deal ${glitchCards.length * 8} damage!`);
            }
          }
          // Apply status effects from special cards too
          if (card.bleed || card.freeze || card.vulnerable || card.weak) {
            const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
            if (target) {
              if (card.bleed) target.statusEffects = applyStatus(target.statusEffects, 'bleed', card.bleed, 2);
              if (card.freeze) {
                const freezeDuration = hasRelic(prev.ownedRelics, 'freeze_amplifier') ? 2 : 1;
                target.statusEffects = applyStatus(target.statusEffects, 'freeze', 1, freezeDuration);
              }
              if (card.vulnerable) target.statusEffects = applyStatus(target.statusEffects, 'vulnerable', 1, card.vulnerable);
              if (card.weak) target.statusEffects = applyStatus(target.statusEffects, 'weak', 1, card.weak);
            }
          }
          continue;
        }

        // === Razor Cascade ricochet ===
        if (card.name === 'Razor Cascade' && dmg > 0) {
          const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
          if (target) {
            const absorbed = target.takeDamage(dmg, prev.turn);
            totalDamage += absorbed;
            // 50% splash to random other enemy
            const others = enemiesCloned.filter(e => e.id !== prev.selectedEnemyId && e.hp > 0);
            if (others.length > 0) {
              const splashTarget = others[Math.floor(Math.random() * others.length)];
              const splashDmg = Math.floor(dmg * 0.5);
              const splashAbsorbed = splashTarget.takeDamage(splashDmg, prev.turn);
              totalDamage += splashAbsorbed;
              log.push(`Razor Cascade: ${dmg} to ${target.name}, ${splashDmg} splash to ${splashTarget.name}`);
            }
            if (card.bleed) target.statusEffects = applyStatus(target.statusEffects, 'bleed', card.bleed, 2);
          }
          continue;
        }

        if (dmg <= 0 && !card.bleed && !card.freeze && !card.vulnerable && !card.weak && !card.siphon) continue;
        const hits = card.multihit ?? 1;
        const isPiercing = card.piercing || hasRelic(prev.ownedRelics, 'unstoppable_force');
        if (card.aoe) {
          // AOE: damage all enemies
          enemiesCloned.forEach(e => {
            // Phase 4.2 — Waveform Guardian: immune to this card type
            if (e.immuneType && card.type === e.immuneType) {
              log.push(`${e.name} is immune to ${card.type}!`);
              return; // Skip damage for this enemy
            }
            
            // Apply status effect modifiers
            const vulnerable = e.statusEffects.find(s => s.type === 'vulnerable');
            const marked = e.statusEffects.find(s => s.type === 'marked');
            let finalDmg = dmg;
            if (marked) finalDmg += 5;
            if (vulnerable) {
              // Relic: Vulnerable Lens (+75% instead of +50%)
              const vulnMultiplier = hasRelic(prev.ownedRelics, 'vulnerable_lens') ? 1.75 : 1.5;
              finalDmg = Math.floor(finalDmg * vulnMultiplier);
            }
            
            // Cursed Relic: Shattered Mirror (2x all damage)
            if (hasRelic(prev.ownedRelics, 'shattered_mirror')) {
              finalDmg = finalDmg * 2;
            }
            
            // Multihit: apply damage N times (each hit has armored applied separately)
            for (let hit = 0; hit < hits; hit++) {
              if (finalDmg > 0) {
                const absorbed = e.takeDamage(finalDmg, prev.turn, isPiercing);
                totalDamage += absorbed;
                if (card.leech) totalLeechDamage += absorbed;
              }
            }
            if (e.thorns > 0 && finalDmg > 0) thornsDamage += e.thorns;
            
            // Apply status effects from card
            if (card.bleed) e.statusEffects = applyStatus(e.statusEffects, 'bleed', card.bleed, 2);
            if (card.freeze) {
              // Relic: Freeze Amplifier (2 turns instead of 1)
              const freezeDuration = hasRelic(prev.ownedRelics, 'freeze_amplifier') ? 2 : 1;
              e.statusEffects = applyStatus(e.statusEffects, 'freeze', 1, freezeDuration);
            }
            if (card.vulnerable) e.statusEffects = applyStatus(e.statusEffects, 'vulnerable', 1, card.vulnerable);
            if (card.weak) e.statusEffects = applyStatus(e.statusEffects, 'weak', 1, card.weak);
          });
          log.push(`${card.name} (AOE) hits all for ${dmg}${hits > 1 ? ` ×${hits}` : ''}`);
        } else {
          // Single target: damage selected enemy only
          const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
          if (target) {
            // Phase 4.2 — Waveform Guardian: immune to this card type
            if (target.immuneType && card.type === target.immuneType) {
              log.push(`${target.name} is immune to ${card.type}!`);
            } else {
              // Apply status effect modifiers
              const vulnerable = target.statusEffects.find(s => s.type === 'vulnerable');
              const marked = target.statusEffects.find(s => s.type === 'marked');
              let finalDmg = dmg;
              if (marked) finalDmg += 5;
              if (vulnerable) {
                // Relic: Vulnerable Lens (+75% instead of +50%)
                const vulnMultiplier = hasRelic(prev.ownedRelics, 'vulnerable_lens') ? 1.75 : 1.5;
                finalDmg = Math.floor(finalDmg * vulnMultiplier);
              }
              
              // Cursed Relic: Shattered Mirror (2x all damage)
              if (hasRelic(prev.ownedRelics, 'shattered_mirror')) {
                finalDmg = finalDmg * 2;
              }
              
              // Multihit: apply damage N times (each hit has armored applied separately)
              for (let hit = 0; hit < hits; hit++) {
                if (finalDmg > 0) {
                  const absorbed = target.takeDamage(finalDmg, prev.turn, isPiercing);
                  totalDamage += absorbed;
                  if (card.leech) totalLeechDamage += absorbed;
                }
              }
              if (target.thorns > 0 && finalDmg > 0) thornsDamage += target.thorns;
              
              // Apply status effects from card
              if (card.bleed) target.statusEffects = applyStatus(target.statusEffects, 'bleed', card.bleed, 2);
              if (card.freeze) {
                // Relic: Freeze Amplifier (2 turns instead of 1)
                const freezeDuration = hasRelic(prev.ownedRelics, 'freeze_amplifier') ? 2 : 1;
                target.statusEffects = applyStatus(target.statusEffects, 'freeze', 1, freezeDuration);
              }
              if (card.vulnerable) target.statusEffects = applyStatus(target.statusEffects, 'vulnerable', 1, card.vulnerable);
              if (card.weak) target.statusEffects = applyStatus(target.statusEffects, 'weak', 1, card.weak);
              
              // Siphon: steal shield from target
              if (card.siphon && card.siphon > 0) {
                const stolen = Math.min(target.shield ?? 0, card.siphon);
                if (stolen > 0) {
                  target.shield = (target.shield ?? 0) - stolen;
                  playerShield += stolen;
                  log.push(`Siphoned ${stolen} shield from ${target.name}!`);
                }
              }
            }
          }
        }
      }

      // === Post-damage special card effects ===
      let playerStatic = prev.playerStatic;
      for (const { card } of cardDamages) {
        if (card.name === 'Entropy Bomb' || card.name === 'System Crash') {
          playerStatic = 0;
          log.push(`${card.name}: Static reset to 0!`);
        }
      }

      if (tempoBonusDmg > 0 && prev.playedThisTurn.length > 0) {
        log.push(`Tempo +${tempoBonusDmg} per card (x${prev.playedThisTurn.length} cards = +${tempoBonusDmg * prev.playedThisTurn.length})`);
      }

      // Apply match bonus + resonator bonus to selected enemy (with status modifiers)
      if (matchBonus + resonatorBonus > 0) {
        const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
        if (target) {
          const vulnerable = target.statusEffects.find(s => s.type === 'vulnerable');
          const marked = target.statusEffects.find(s => s.type === 'marked');
          let bonusDmg = matchBonus + resonatorBonus;
          if (marked) bonusDmg += 5;
          if (vulnerable) {
            // Relic: Vulnerable Lens (+75% instead of +50%)
            const vulnMultiplier = hasRelic(prev.ownedRelics, 'vulnerable_lens') ? 1.75 : 1.5;
            bonusDmg = Math.floor(bonusDmg * vulnMultiplier);
          }
          
          // Cursed Relic: Shattered Mirror (2x all damage)
          if (hasRelic(prev.ownedRelics, 'shattered_mirror')) {
            bonusDmg = bonusDmg * 2;
          }
          
          const absorbed = target.takeDamage(bonusDmg, prev.turn);
          totalDamage += absorbed;
          if (target.thorns > 0) thornsDamage += target.thorns;
        }
      }

      if (totalDamage > 0) log.push(`Total damage dealt: ${totalDamage}`);
      
      // --- On-death effects (Phase 4) ---
      const defeated = enemiesCloned.filter(e => e.isDefeated());
      let onDeathDiscard = prev.discard;
      let splitterEnemies: Enemy[] = []; // Track new enemies from Splitter
      let defeatedBossName: string | undefined = undefined;
      
      for (const e of defeated) {
        // Track boss defeats for relic rewards
        if (e.name === 'The Modulator' || e.name === 'The Fault' || 
            e.name === 'The Debugger' || e.name === 'The Overwriter') {
          defeatedBossName = e.name;
        }
        
        // On-death: inject Glitch cards
        if (e.onDeathGlitch > 0) {
          for (let i = 0; i < e.onDeathGlitch; i++) {
            const glitch = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000));
            onDeathDiscard = [...onDeathDiscard, glitch];
          }
          log.push(`${e.name} dies and corrupts your deck!`);
        }
        // On-death: add Static
        if (e.onDeathStatic > 0) {
          playerStatic += e.onDeathStatic;
          log.push(`${e.name} dies and releases ${e.onDeathStatic} static!`);
        }
        // Phase 4.2 — Splitter: spawn mini-enemies
        if (e.splitOnDeath) {
          for (let i = 0; i < e.splitOnDeath.count; i++) {
            const childId = Date.now() + Math.floor(Math.random() * 100000);
            const child = new Enemy({
              id: childId,
              name: 'Half-Splitter',
              hp: e.splitOnDeath.hp,
              maxHp: e.splitOnDeath.hp,
              damage: e.splitOnDeath.damage,
              intent: 'Attack',
              description: 'Spawned from Splitter',
            });
            splitterEnemies.push(child);
          }
          log.push(`${e.name} splits into ${e.splitOnDeath.count} Half-Splitters!`);
        }
      }
      
      // Remove defeated enemies and add splitter children
      const defeatedCount = defeated.length;
      let enemies = enemiesCloned.filter(e => !e.isDefeated());
      enemies = [...enemies, ...splitterEnemies];
      const allDefeated = enemies.length === 0;

      // --- Leech healing ---
      const leechCards = prev.playedThisTurn.filter(c => c.leech && c.leech > 0);
      if (leechCards.length > 0 && totalLeechDamage > 0) {
        const maxLeech = Math.max(...leechCards.map(c => c.leech ?? 0));
        const healed = Math.floor(totalLeechDamage * (maxLeech / 100));
        if (healed > 0) {
          playerHp = Math.min(prev.playerMaxHp, playerHp + healed);
          log.push(`Leech healed ${healed} HP`);
        }
      }

      // --- Enemy attacks & shield (with empowerAlly aura + thorns + freeze/weak status) ---
      const empowerBonus = enemies.reduce((sum, e) => sum + e.empowerAlly, 0);
      // Dark Insight relic: enemies deal +2 damage per copy
      const darkInsightBonus = countRelic(prev.ownedRelics, 'dark_insight') * 2;
      // Time Eater: if charged, +3 bonus damage
      const timeEaterBonus = enemies.some(e => e.timeEaterCharged) ? 3 : 0;
      const totalTakeDamage = enemies.reduce((sum, e) => {
        // Check for Freeze status - skip this enemy's attack
        const frozen = e.statusEffects.find(s => s.type === 'freeze');
        if (frozen) {
          log.push(`${e.name} is frozen and cannot attack!`);
          return sum;
        }
        
        let dmg = e.getDamage();
        // Empower aura from OTHER alive allies
        const allyEmpower = empowerBonus - e.empowerAlly;
        dmg += allyEmpower;
        // Dark Insight: enemies deal extra damage
        dmg += darkInsightBonus;
        // The Compiler: every 3rd turn, deals 15 instead of base
        if (e.compileCounter !== undefined && e.compileCounter > 0 && e.compileCounter % 3 === 0) {
          dmg = 15;
        }
        // Time Eater: charged bonus
        if (e.timeEaterCharged) dmg += timeEaterBonus;
        // Glitch Hound: +1 per glitch card in deck
        if (e.glitchScaling) {
          const glitchCount = prev.deckList.filter(c => c.isGlitch).length;
          dmg += glitchCount;
        }
        
        // Check for Weak status - reduce damage by 25%
        const weak = e.statusEffects.find(s => s.type === 'weak');
        if (weak) {
          dmg = Math.floor(dmg * 0.75);
        }
        
        return sum + dmg;
      }, 0) + thornsDamage;
      if (thornsDamage > 0) log.push(`Thorns reflected ${thornsDamage} damage`);
      if (empowerBonus > 0) log.push(`Empower aura: +${empowerBonus} enemy damage`);
      
      // Cursed Relic: Shattered Mirror (2x enemy damage)
      let finalTakeDamage = totalTakeDamage;
      if (hasRelic(prev.ownedRelics, 'shattered_mirror')) {
        finalTakeDamage = totalTakeDamage * 2;
      }
      // Zone: damage multiplier applies to enemy damage too
      if (zoneDamageMult !== 1) finalTakeDamage = Math.floor(finalTakeDamage * zoneDamageMult);
      
      const shieldUsed = Math.min(playerShield, finalTakeDamage);
      const damageAfterShield = finalTakeDamage - shieldUsed;
      playerHp = Math.max(0, playerHp - damageAfterShield);
      playerShield -= shieldUsed;

      // Gravity Well: halve shield gained by player
      if (enemies.some(e => e.gravityWell && e.hp > 0)) {
        playerShield = Math.floor(playerShield / 2);
      }

      // Safe Landing: survive fatal blow once per combat
      if (playerHp <= 0 && !prev.safeLandingUsed && hasRelic(prev.ownedRelics, 'safe_landing')) {
        playerHp = 1;
        log.push('Safe Landing: Survived fatal blow with 1 HP!');
      }

      // --- Vampiric healing ---
      for (const e of enemies) {
        if (e.vampiric > 0) {
          const vampHeal = Math.floor(e.getDamage() * e.vampiric / 100);
          if (vampHeal > 0) {
            e.heal(vampHeal);
            log.push(`${e.name} drained ${vampHeal} HP`);
          }
        }
      }

      // --- Tempo siphon (Phase 4) ---
      for (const e of enemies) {
        if (e.tempoSiphon > 0) {
          const stolen = Math.min(playerTempo, e.tempoSiphon);
          if (stolen > 0) {
            playerTempo -= stolen;
            log.push(`${e.name} steals ${stolen} tempo!`);
          }
        }
      }

      // --- Shield reset (resets to 0 each turn, prevented by Sine Loom) ---
      if (!hasRelic(prev.ownedRelics, 'sine_loom')) {
        playerShield = 0;
      }

      // --- Relic: Shield Battery (+2 shield per turn per copy) ---
      const shieldBatteryCount = countRelic(prev.ownedRelics, 'shield_battery');
      if (shieldBatteryCount > 0) {
        let shieldGain = 2 * shieldBatteryCount;
        if (zoneShieldMult !== 1) shieldGain = Math.floor(shieldGain * zoneShieldMult);
        playerShield += shieldGain;
        log.push(`Shield Battery (x${shieldBatteryCount}): +${shieldGain} shield`);
      }

      const isGameOver = playerHp <= 0;

      // --- Relic: HP Regenerator (heal 1 per copy per turn) ---
      if (!isGameOver) {
        const hpRegenCount = countRelic(prev.ownedRelics, 'hp_regen');
        if (hpRegenCount > 0) {
          const healed = Math.min(hpRegenCount, prev.playerMaxHp - playerHp);
          if (healed > 0) {
            playerHp += healed;
            log.push(`HP Regenerator: +${healed} HP`);
          }
        }
        // Relic: Modulator's Core (regen 1 HP/turn)
        if (hasRelic(prev.ownedRelics, 'modulators_core')) {
          const mc = Math.min(1, prev.playerMaxHp - playerHp);
          if (mc > 0) { playerHp += mc; log.push(`Modulator's Core: +1 HP`); }
        }
      }

      // --- Relic: Healing Pulse (heal 3 HP on Forge Burst) ---
      if (isMatch && countRelic(prev.ownedRelics, 'healing_pulse') > 0) {
        const healAmt = 3 * countRelic(prev.ownedRelics, 'healing_pulse');
        playerHp = Math.min(prev.playerMaxHp, playerHp + healAmt);
        log.push(`Healing Pulse: +${healAmt} HP from Forge Burst!`);
      }

      // --- Relic: Damage Echo (splash 5 on 15+ single-hit) ---
      if (countRelic(prev.ownedRelics, 'damage_echo') > 0) {
        for (const { card, dmg } of cardDamages) {
          if (!card.aoe && dmg >= 15) {
            const others = enemiesCloned.filter(e => e.id !== prev.selectedEnemyId && e.hp > 0);
            others.forEach(e => { e.takeDamage(5, prev.turn); });
            if (others.length > 0) log.push(`Damage Echo: 5 splash to ${others.length} enemies!`);
          }
        }
      }

      // --- Relic: Type Master (+1 energy if 3+ different types played) ---
      const typeMasterCount = countRelic(prev.ownedRelics, 'type_master');
      let typeMasterEnergyBonus = 0;
      if (typeMasterCount > 0) {
        const uniqueTypes = new Set(prev.playedThisTurn.map(c => c.type));
        if (uniqueTypes.size >= 3) {
          typeMasterEnergyBonus = typeMasterCount;
          log.push(`Type Master: +${typeMasterEnergyBonus} energy from type diversity!`);
        }
      }

      // --- Relic: Pattern Mastery (on match: +4 shield, draw 1 extra) ---
      let patternMasteryDraw = 0;
      if (isMatch && countRelic(prev.ownedRelics, 'pattern_mastery') > 0) {
        playerShield += 4;
        patternMasteryDraw = 1;
        log.push('Pattern Mastery: +4 shield and extra draw from sequence match!');
      }

      // --- Initialize mutable state for end-of-turn ---
      // playerStatic already initialized in on-death effects processing
      let currency = prev.currency;

      // --- Zone: static_per_turn ---
      if (prev.currentZone?.effect.type === 'static_per_turn') {
        playerStatic += prev.currentZone.effect.value;
        log.push(`${prev.currentZone.name}: +${prev.currentZone.effect.value} Static`);
      }

      // --- Zone: heal_per_turn ---
      if (prev.currentZone?.effect.type === 'heal_per_turn' && !isGameOver) {
        const zoneHeal = Math.min(prev.currentZone.effect.value, prev.playerMaxHp - playerHp);
        if (zoneHeal > 0) {
          playerHp += zoneHeal;
          log.push(`${prev.currentZone.name}: +${zoneHeal} HP`);
        }
      }

      // --- Card routing: Sustain / Exhaust / Discard ---
      let newDeckList = [...prev.deckList];
      const discardAfterPlay = [...onDeathDiscard]; // Use onDeathDiscard which may have on-death Glitches
      const sustainHand: Card[] = [];

      for (const card of prev.playedThisTurn) {
        if (card.exhaust) {
          // Exhaust: remove from deckList entirely
          newDeckList = newDeckList.filter(c => c.id !== card.id);
          log.push(`${card.name} exhausted`);
        } else if (card.sustain) {
          // Sustain: return to hand instead of discard
          sustainHand.push(card);
        } else {
          discardAfterPlay.push(card);
        }
      }

      // --- Enemy end-of-turn abilities ---
      for (const e of enemies) {
        // Regen
        if (e.regen > 0) {
          const regenHealed = e.heal(e.regen);
          if (regenHealed > 0) log.push(`${e.name} regenerated ${regenHealed} HP`);
        }
        // Shield Ally
        if (e.shieldAlly > 0) {
          enemies.forEach(ally => {
            if (ally.id !== e.id) ally.shield += e.shieldAlly;
          });
          if (enemies.length > 1) log.push(`${e.name} shields allies for ${e.shieldAlly}`);
        }
        // Phase 4.2 — Waveform Guardian: randomize immune type
        if (e.name === 'Waveform Guardian') {
          const types = ['Pulse', 'Sine', 'Saw', 'Noise'];
          e.immuneType = types[Math.floor(Math.random() * types.length)];
        }
        // Turn counter & Glitch Gen
        e.turnCounter++;
        if (e.glitchGen > 0 && e.glitchFreq > 0 && e.turnCounter % e.glitchFreq === 0) {
          for (let g = 0; g < e.glitchGen; g++) {
            discardAfterPlay.push(createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + e.id * 10 + g));
          }
          log.push(`${e.name} injected ${e.glitchGen} Glitch card${e.glitchGen > 1 ? 's' : ''}`);
          currency += 10 * e.glitchGen * countRelic(prev.ownedRelics, 'fault_lens');
        }
        // Static Pulse
        if (e.staticPulse > 0) {
          playerStatic += e.staticPulse;
          log.push(`${e.name}: +${e.staticPulse} Static`);
        }
      }

      // --- Glitch injection from static threshold ---
      const glitchThreshold = 4 + countRelic(prev.ownedRelics, 'stability_core') * 2 
                              - (hasRelic(prev.ownedRelics, 'overclocked_processor') ? 2 : 0);
      if (playerStatic >= glitchThreshold) {
        const glitchCard = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000));
        discardAfterPlay.push(glitchCard);
        playerStatic -= glitchThreshold;
        log.push('Static overload! Glitch injected');
        // Fault Lens: +10 currency per Glitch injected per copy
        const faultLensCount = countRelic(prev.ownedRelics, 'fault_lens');
        if (faultLensCount > 0) {
          currency += 10 * faultLensCount;
        }
      }

      // --- Relic: Static Sink (-1 Static per turn per copy) ---
      const staticSinkCount = countRelic(prev.ownedRelics, 'static_sink');
      if (staticSinkCount > 0 && playerStatic > 0) {
        playerStatic = Math.max(0, playerStatic - staticSinkCount);
      }

      // --- Energy for next turn ---
      let playerEnergy = 3;
      // Relic: Energy Conduit (+1 energy per turn per copy)
      playerEnergy += countRelic(prev.ownedRelics, 'energy_conduit');
      // Cursed Relic: Demon Core (+2 energy per turn)
      if (hasRelic(prev.ownedRelics, 'demon_core')) {
        playerEnergy += 2;
      }
      // Relic: Type Master bonus
      playerEnergy += typeMasterEnergyBonus;
      // Relic: Static Heart (convert Static to energy at 3:1)
      if (hasRelic(prev.ownedRelics, 'static_heart') && playerStatic >= 3) {
        const converted = Math.floor(playerStatic / 3);
        playerStatic -= converted * 3;
        playerEnergy += converted;
        log.push(`Static Heart: Converted ${converted * 3} Static → +${converted} energy`);
      }

      // --- Relic: Temporal Anchor (tempo doesn't reset, but loses 2/turn) ---
      if (hasRelic(prev.ownedRelics, 'temporal_anchor')) {
        playerTempo = Math.max(0, playerTempo - 2);
      } else {
        // Normal tempo reset at end of turn
        playerTempo = 0;
      }

      // --- Relic: Momentum Core (if 4+ cards played, cards cost 1 less next turn) ---
      const momentumCoreActive = hasRelic(prev.ownedRelics, 'momentum_core') && prev.playedThisTurn.length >= 4;
      if (momentumCoreActive) log.push('Momentum Core: All cards cost 1 less next turn!');

      // --- Relic: Void Harvester (+2 permanent damage per exhausted card) ---
      let voidHarvesterDmgBonus = prev.voidHarvesterDmgBonus;
      if (hasRelic(prev.ownedRelics, 'void_harvester')) {
        const exhaustedCount = prev.playedThisTurn.filter(c => c.exhaust).length;
        if (exhaustedCount > 0) {
          voidHarvesterDmgBonus += exhaustedCount * 2;
          log.push(`Void Harvester: +${exhaustedCount * 2} permanent damage from exhausted cards`);
        }
      }

      // --- Enemy: Time Eater charging (check if 5+ cards played) ---
      for (const e of enemies) {
        if (e.name === 'Time Eater') {
          if (prev.playedThisTurn.length >= 5) {
            e.timeEaterCharged = true;
            e.shield = (e.shield ?? 0) + 10;
            log.push('Time Eater charges up! Gained +10 shield and +3 next attack.');
          } else {
            e.timeEaterCharged = false;
          }
        }
        // The Compiler: increment counter
        if (e.compileCounter !== undefined && e.name === 'The Compiler') {
          e.compileCounter = (e.compileCounter ?? 0) + 1;
        }
        // Curse Caster: inject curse card
        if (e.curseCaster && e.hp > 0) {
          const curseCard = createNamedCard('corrupted_signal', Date.now() + Math.floor(Math.random() * 100000));
          discardAfterPlay.push(curseCard);
          log.push(`${e.name} casts a Corrupted Signal into your deck!`);
        }
        // Pattern Lock: scramble one sequence slot
        if (e.sequenceScramble && e.hp > 0) {
          log.push(`${e.name} scrambles the sequence!`);
          // Effect applied to next target sequence generation
        }
      }

      // --- Enemy: Infinite Loop revive ---
      for (const e of defeated) {
        if (e.name === 'The Infinite Loop' && (e.reviveCount ?? 0) < 2) {
          e.hp = 30;
          e.reviveCount = (e.reviveCount ?? 0) + 1;
          e.regen = 5 + (e.reviveCount ?? 0) * 2;
          log.push(`The Infinite Loop revives! (${e.reviveCount}/2) Regen now ${e.regen}`);
          // Remove from defeated, add back to living enemies
        }
        // Track Infinite Loop as defeated boss when truly dead
        if (e.name === 'The Infinite Loop' && (e.reviveCount ?? 0) >= 2) {
          defeatedBossName = e.name;
        }
      }

      // --- Draw new hand (sustain cards stay in hand) ---
      // Process unplayed cards in hand: Retain stays, Ethereal exhausts, others discard
      const retainedCards: Card[] = [];
      const exhaustedEthereal: Card[] = [];
      for (const card of prev.hand) {
        if (card.retain) {
          retainedCards.push(card);
        } else if (card.ethereal) {
          exhaustedEthereal.push(card);
          newDeckList = newDeckList.filter(c => c.id !== card.id);
          log.push(`${card.name} fades away (Ethereal)`);
        } else {
          discardAfterPlay.push(card);
        }
      }
      
      const handWithSustain = [...retainedCards, ...sustainHand];
      const drawResult = drawHandCards(
        prev.deck, 
        discardAfterPlay, 
        handWithSustain, 
        getHandSize(prev.ownedRelics), 
        prev.ownedRelics,
        prev.reshuffleCount,
        log
      );
      let { deck: newDeck, hand: newHand, discard: newDiscard, exhausted, reshuffleCount, fatigueDamage } = drawResult;
      
      // Apply reshuffle fatigue damage
      playerHp = Math.max(0, playerHp - fatigueDamage);

      // Cards exhausted via Clean Room are removed from deckList
      if (exhausted.length > 0) {
        for (const ex of exhausted) {
          newDeckList = newDeckList.filter(c => c.id !== ex.id);
        }
      }

      // --- Relic: Echo Node (draw 1 extra on Forge Burst) ---
      let finalDeck = newDeck;
      let finalHand = newHand;
      let finalDiscard = newDiscard;
      if (isMatch && countRelic(prev.ownedRelics, 'echo_node') > 0) {
        const echoDrawCount = countRelic(prev.ownedRelics, 'echo_node');
        const extra = drawHandCards(
          finalDeck, 
          finalDiscard, 
          finalHand, 
          finalHand.length + echoDrawCount, 
          prev.ownedRelics,
          reshuffleCount,
          log
        );
        finalDeck = extra.deck;
        finalHand = extra.hand;
        finalDiscard = extra.discard;
        reshuffleCount = extra.reshuffleCount;
        playerHp = Math.max(0, playerHp - extra.fatigueDamage);
        if (extra.exhausted.length > 0) {
          for (const ex of extra.exhausted) {
            newDeckList = newDeckList.filter(c => c.id !== ex.id);
          }
        }
        log.push(`Echo Node: drew ${echoDrawCount} extra card${echoDrawCount > 1 ? 's' : ''}`);
      }

      // --- Generate new sequence ---
      const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
      const seqLength = Math.min(2 + Math.floor(prev.turn / 5), 3);
      const targetSequence: string[] = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);

      // Relic: Phase Shifter (one random slot per copy becomes wildcard)
      const phaseShifterCount = countRelic(prev.ownedRelics, 'phase_shifter');
      if (phaseShifterCount > 0 && targetSequence.length > 0) {
        const nonWildIndices = targetSequence.map((t, i) => t !== '*' ? i : -1).filter(i => i >= 0);
        const wildCount = Math.min(phaseShifterCount, nonWildIndices.length);
        for (let w = 0; w < wildCount; w++) {
          const pick = Math.floor(Math.random() * nonWildIndices.length);
          targetSequence[nonWildIndices[pick]] = '*';
          nonWildIndices.splice(pick, 1);
        }
        log.push(`Phase Shifter: ${wildCount} slot${wildCount > 1 ? 's' : ''} wildcarded`);
      }

      const newPhase = allDefeated ? 'card-reward' : (isGameOver ? 'game-over' : 'combat');

      // Phase 6.2 — Generate card reward choices when combat is won
      let cardRewardChoices = prev.cardRewardChoices;
      if (allDefeated) {
        const floor = prev.floor;
        // Rarity weights scale with floor
        const weights = floor < 4
          ? { common: 0.65, uncommon: 0.30, rare: 0.05 }
          : floor < 7
          ? { common: 0.40, uncommon: 0.45, rare: 0.15 }
          : { common: 0.20, uncommon: 0.50, rare: 0.30 };
        
        cardRewardChoices = [];
        for (let i = 0; i < 3; i++) {
          const roll = Math.random();
          let rarity: 'common' | 'uncommon' | 'rare';
          if (roll < weights.rare) rarity = 'rare';
          else if (roll < weights.rare + weights.uncommon) rarity = 'uncommon';
          else rarity = 'common';
          
          const pool = CARD_CATALOG.filter(t => t.rarity === rarity && !t.isGlitch);
          if (pool.length > 0) {
            const template = pool[Math.floor(Math.random() * pool.length)];
            const newId = Date.now() + Math.floor(Math.random() * 100000) + i;
            cardRewardChoices.push(Card.fromTemplate(template, newId));
          }
        }
      }

      // Update selected enemy if they died
      const newSelectedEnemyId = enemies.some(e => e.id === prev.selectedEnemyId)
        ? prev.selectedEnemyId
        : (enemies[0]?.id ?? prev.selectedEnemyId);

      // --- END OF TURN: tick down status effect durations ---
      enemies.forEach(e => {
        e.statusEffects = tickStatusEffects(e.statusEffects);
      });

      // --- Phase 1.5: Calculate enemy intents for next turn ---
      enemies.forEach(enemy => {
        // Skip intent calculation for dead or frozen enemies
        if (enemy.hp <= 0) {
          enemy.intentDisplay = undefined;
          return;
        }
        
        const frozen = enemy.statusEffects?.find(s => s.type === 'freeze' && s.duration > 0);
        if (frozen) {
          enemy.intentDisplay = { type: 'special', label: '❄️ Frozen' };
          return;
        }

        // Calculate base damage with empower bonuses
        const empowerBonus = enemies
          .filter(e => e.id !== enemy.id && e.hp > 0)
          .reduce((sum, e) => sum + (e.empowerAlly ?? 0), 0);
        const baseDmg = enemy.damage + empowerBonus;

        // Default: attack intent
        enemy.intentDisplay = { type: 'attack', value: baseDmg };

        // Override for special behaviors
        if (enemy.shieldAlly && enemy.shieldAlly > 0 && enemies.length > 1) {
          enemy.intentDisplay = { type: 'buff', value: enemy.shieldAlly, label: 'Shield Allies' };
        } else if (enemy.regen && enemy.regen > 0 && enemy.hp < enemy.maxHp) {
          // Show heal intent if enemy has regen and isn't at full HP
          enemy.intentDisplay = { type: 'heal', value: enemy.regen };
        } else if (enemy.vampiric && enemy.vampiric > 0) {
          enemy.intentDisplay = { type: 'special', value: baseDmg, label: `💉 ${baseDmg}` };
        } else if (enemy.tempoSiphon && enemy.tempoSiphon > 0) {
          enemy.intentDisplay = { type: 'debuff', value: enemy.tempoSiphon, label: 'Steal Tempo' };
        }
      });

      // Performance bonuses on victory
      let bonusCurrency = 0;
      const finalFloorDmg = prev.floorDamageTaken + damageAfterShield;
      const finalFloorPatterns = prev.floorPatternsCompleted + (isMatch ? 1 : 0);
      const finalFloorTurns = prev.floorTurns + 1;
      if (allDefeated) {
        if (finalFloorDmg === 0) {
          bonusCurrency += 25;
          log.push('✨ No Damage bonus: +25💰');
        }
        if (finalFloorPatterns > 0) {
          const patternBonus = finalFloorPatterns * 5;
          bonusCurrency += patternBonus;
          log.push(`✨ Pattern Master (×${finalFloorPatterns}): +${patternBonus}💰`);
        }
        if (finalFloorTurns <= 3) {
          bonusCurrency += 15;
          log.push('✨ Speed Clear: +15💰');
        }
      }

      return {
        ...prev,
        deckList: newDeckList,
        deck: finalDeck,
        hand: finalHand,
        discard: finalDiscard,
        playedThisTurn: [],
        currentSequence: [],
        playerEnergy,
        playerTempo,
        playerStatic,
        playerShield,
        playerHp,
        turn: prev.turn + 1,
        enemies,
        phase: newPhase,
        floor: prev.floor,
        gameOver: isGameOver,
        targetSequence,
        glitchThreshold,
        score: prev.score + totalDamage * 5 + (isMatch ? 50 : 0) + defeatedCount * 25,
        currency: currency + (isMatch ? 15 : 0) + defeatedCount * (20 + prev.floor * 5) + (allDefeated ? (150 + prev.floor * 30) : 0) + bonusCurrency,
        selectedEnemyId: newSelectedEnemyId,
        firstPulsePlayedThisTurn: false,
        firstSawPlayedThisTurn: false,
        reshuffleCount,
        combatLog: log,
        cardRewardChoices,
        defeatedBossName: allDefeated ? defeatedBossName : undefined,
        // New state tracking
        damageTakenLastTurn: damageAfterShield,
        waveformTypesPlayedThisTurn: [],
        momentumCoreActive,
        safeLandingUsed: prev.safeLandingUsed || (playerHp <= 0 && !prev.safeLandingUsed && hasRelic(prev.ownedRelics, 'safe_landing')),
        voidHarvesterDmgBonus,
        floorDamageTaken: prev.floorDamageTaken + damageAfterShield,
        floorPatternsCompleted: prev.floorPatternsCompleted + (isMatch ? 1 : 0),
        floorTurns: prev.floorTurns + 1,
      };
    });
  }, [drawHandCards, refillDeckFromDiscard]);

  // --- Server-side persistence ---
  const [hasSavedRun, setHasSavedRun] = useState(false);

  // Save current game state to server
  const saveRun = useCallback(async (state: GameState) => {
    try {
      const runState = serializeGameState(state);
      await fetch('/api/signal-forge/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runState }),
      });
      setHasSavedRun(true);
    } catch (e) {
      console.error('Failed to save run:', e);
    }
  }, []);

  // Clear saved run on server
  const clearSavedRun = useCallback(async () => {
    try {
      await fetch('/api/signal-forge/abandon', { method: 'POST' });
      setHasSavedRun(false);
    } catch (e) {
      console.error('Failed to clear save:', e);
    }
  }, []);

  // Load saved run from server
  const loadSavedRun = useCallback(async () => {
    try {
      const res = await fetch('/api/signal-forge/load');
      if (!res.ok) return;
      const data = await res.json();
      if (data.hasSavedRun && data.runState) {
        const restoredState = deserializeGameState(data.runState);
        setGameState(restoredState);
        setHasSavedRun(true);
      }
    } catch (e) {
      console.error('Failed to load saved run:', e);
    }
  }, []);

  // Abandon current run (reset + clear saved)
  const abandonRun = useCallback(async () => {
    await clearSavedRun();
    const freshEnemies = createEnemies(1);
    setGameState({
      floor: 1,
      node: 1,
      phase: 'landing',
      deckList: [...STARTER_DECK],
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
      enemies: freshEnemies,
      targetSequence: ['Pulse', 'Sine', 'Saw'],
      currentSequence: [],
      turn: 0,
      gameOver: false,
      selectedEnemyId: freshEnemies[0]?.id ?? 0,
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
    });
  }, [clearSavedRun]);

  // Check for saved run on mount
  useEffect(() => {
    const checkSavedRun = async () => {
      try {
        const res = await fetch('/api/signal-forge/load');
        if (!res.ok) return;
        const data = await res.json();
        if (data.hasSavedRun) {
          setHasSavedRun(true);
        }
      } catch {
        // ignore
      }
    };
    checkSavedRun();
  }, []);

  // Start game - show starter relic choice first
  const startGame = useCallback(() => {
    // Clear any existing saved run when starting fresh
    clearSavedRun();
    // Generate 3 random common relics to choose from
    const commons = RELIC_CATALOG.filter(r => r.rarity === 'common');
    const shuffled = [...commons].sort(() => Math.random() - 0.5);
    const choices = shuffled.slice(0, 3);
    setGameState(prev => ({
      ...prev,
      phase: 'starter-relic',
      starterRelicChoices: choices,
    }));
  }, [clearSavedRun]);

  // Select starter relic and begin combat
  const selectStarterRelic = useCallback((relic: RelicTemplate) => {
    setGameState(prev => {
      const newRelic = new Relic({ ...relic, id: Date.now() + Math.floor(Math.random() * 100000) });
      const ownedRelics = [...prev.ownedRelics, newRelic];

      // Separate Innate cards from the rest
      const innateCards = prev.deckList.filter(c => c.innate);
      const nonInnateCards = prev.deckList.filter(c => !c.innate);
      
      // Shuffle non-innate cards
      const shuffledDeck = shuffleDeck(nonInnateCards);
      
      const hs = getHandSize(ownedRelics);
      const tempLog: string[] = [];
      
      // Start with innate cards in hand, then draw the rest
      const initialHand = [...innateCards];
      const { deck, hand, discard, exhausted } = drawHandCards(shuffledDeck, [], initialHand, hs, ownedRelics, 0, tempLog);

      // Clean Room exhausted cards removed from deck list
      let newDeckList = [...prev.deckList];
      for (const ex of exhausted) {
        newDeckList = newDeckList.filter(c => c.id !== ex.id);
      }

      // Generate initial enemies and sequence
      const enemies = createEnemies(prev.floor);
      const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
      const targetSequence = [types[Math.floor(Math.random() * 4)], types[Math.floor(Math.random() * 4)]];

      // Relic: Coil Capacitor (+1 energy per copy at start of combat)
      let playerEnergy = 3;
      playerEnergy += countRelic(ownedRelics, 'coil_capacitor');
      // Cursed Relic: Demon Core (+2 energy per turn)
      if (hasRelic(ownedRelics, 'demon_core')) {
        playerEnergy += 2;
      }

      // Relic: Stability Core (raise glitch threshold +2 per copy)
      // Cursed Relic: Overclocked Processor (lower glitch threshold -2)
      const glitchThreshold = 4 + countRelic(ownedRelics, 'stability_core') * 2
                              - (hasRelic(ownedRelics, 'overclocked_processor') ? 2 : 0);
      
      // Cursed Relic: Demon Core (-5 HP at start of combat)
      let startingHp = prev.playerHp;
      if (hasRelic(ownedRelics, 'demon_core')) {
        startingHp = Math.max(1, startingHp - 5);
      }

      // Zone modifier
      const zone = selectZone();
      let finalDeck = deck;
      const startLog = [`Starting relic: ${relic.name}`];
      if (zone.effect.type !== 'none') startLog.push(`Zone: ${zone.name} — ${zone.description}`);
      if (zone.effect.type === 'glitch_inject') {
        for (let i = 0; i < zone.effect.value; i++) {
          finalDeck = [...finalDeck, createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + i)];
        }
      }

      return {
        ...prev,
        phase: 'combat',
        deckList: newDeckList,
        deck: finalDeck,
        hand,
        discard,
        enemies,
        playerEnergy,
        playerHp: startingHp,
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
        combatLog: startLog,
        ownedRelics,
        starterRelicChoices: [],
        mulliganAvailable: true,
        currentZone: zone,
      };
    });
  }, [drawHandCards, shuffleDeck]);

  // Advance to next floor
  const nextFloor = useCallback(() => {
    setGameState(prev => {
      const newFloor = prev.floor + 1;
      const newEnemies = createEnemies(newFloor);
      
      // Generate new sequence
      const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
      const seqLength = Math.min(2 + Math.floor((newFloor - 1) / 5), 3);
      const targetSequence = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);
      
      // Generate shop inventory
      const shopInventory = generateShopInventory(newFloor);
      
      // Heal player 25% of max HP
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
          // Find relic template
          const relicDef = RELIC_CATALOG.find(r => r.key === relicKey);
          if (relicDef) {
            const newRelic = new Relic({
              id: Date.now() + Math.floor(Math.random() * 100000),
              name: relicDef.name,
              description: relicDef.description,
              rarity: relicDef.rarity,
              key: relicDef.key,
            });
            newRelics = [...newRelics, newRelic];
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
        defeatedBossName: undefined, // Clear after awarding relic
        relicBoughtThisShop: false,
        shopRemovalsUsed: 0,
        shopUpgradesUsed: 0,
      };
    });
  }, []);

  // Buy item from shop
  const buyItem = useCallback((itemId: string) => {
    setGameState(prev => {
      if (prev.phase !== 'shop') return prev;
      
      const item = prev.shopInventory.find(i => i.id === itemId);
      if (!item || prev.currency < item.price) return prev;
      
      let newDeckList = [...prev.deckList];
      let newOwnedRelics = [...prev.ownedRelics];
      let relicBought = false;
      
      if (item.type === 'card' && item.item && item.item instanceof Card) {
        // Add card to deck list with new ID
        const newCard = item.item.clone(Math.floor(Math.random() * 10000));
        newDeckList = [...newDeckList, newCard];
      } else if (item.type === 'relic' && item.item && item.item instanceof Relic) {
        // Only one relic per shop visit
        if (prev.relicBoughtThisShop) return prev;
        // Add relic to owned relics with new ID
        const newRelic = item.item.clone(Math.floor(Math.random() * 10000));
        newOwnedRelics = [...newOwnedRelics, newRelic];
        relicBought = true;
      }
      
      // Remove from shop inventory
      const newShopInventory = prev.shopInventory.filter(i => i.id !== itemId);
      
      return {
        ...prev,
        deckList: newDeckList,
        ownedRelics: newOwnedRelics,
        currency: prev.currency - item.price,
        shopInventory: newShopInventory,
        relicBoughtThisShop: prev.relicBoughtThisShop || relicBought,
      };
    });
  }, []);

  // Phase 6.3 — Upgrade card from deck (doubling cost per shop visit: 50, 100, 200...)
  const upgradeCard = useCallback((cardId: number) => {
    setGameState(prev => {
      if (prev.phase !== 'shop') return prev;
      const costScale = 1 + (prev.floor - 1) * 0.08;
      const upgradePrice = Math.round(50 * Math.pow(2, prev.shopUpgradesUsed) * costScale);
      if (prev.currency < upgradePrice) return prev;
      
      // Find the card in the deck list
      const cardIndex = prev.deckList.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return prev;
      const card = prev.deckList[cardIndex];
      
      // Check if already upgraded
      if (card.upgraded) return prev;
      
      // Upgrade the card: +25% damage/shield, append "+"
      const upgraded = card.clone(card.id);
      upgraded.upgraded = true;
      upgraded.name = card.name + '+';
      upgraded.damage = Math.ceil(card.damage * 1.25);
      upgraded.shield = Math.ceil(card.shield * 1.25);
      
      // Replace in deck list
      const newDeckList = [...prev.deckList];
      newDeckList[cardIndex] = upgraded;
      
      return {
        ...prev,
        deckList: newDeckList,
        currency: prev.currency - upgradePrice,
        upgradesPurchased: prev.upgradesPurchased + 1,
        shopUpgradesUsed: prev.shopUpgradesUsed + 1,
      };
    });
  }, []);

  // Remove card from deck (doubling cost per shop visit: 50, 100, 200...)
  const removeCard = useCallback((cardId: number) => {
    setGameState(prev => {
      if (prev.phase !== 'shop') return prev;
      const costScale = 1 + (prev.floor - 1) * 0.08;
      const removalPrice = Math.round(50 * Math.pow(2, prev.shopRemovalsUsed) * costScale);
      if (prev.currency < removalPrice) return prev;
      
      // Remove card from the full deck list
      const cardIndex = prev.deckList.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return prev;
      
      const newDeckList = prev.deckList.filter((_, i) => i !== cardIndex);
      
      return {
        ...prev,
        deckList: newDeckList,
        currency: prev.currency - removalPrice,
        removalsUsed: prev.removalsUsed + 1,
        shopRemovalsUsed: prev.shopRemovalsUsed + 1,
      };
    });
  }, []);

  // Return to landing page (reset full state)
  const returnToLanding = useCallback(() => {
    const freshEnemies = createEnemies(1);
    setGameState({
      floor: 1,
      node: 1,
      phase: 'landing',
      deckList: [...STARTER_DECK],
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
      enemies: freshEnemies,
      targetSequence: ['Pulse', 'Sine', 'Saw'],
      currentSequence: [],
      turn: 0,
      gameOver: false,
      selectedEnemyId: freshEnemies[0]?.id ?? 0,
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
    });
  }, []);

  // Auto-save on every phase transition and after each combat turn; clear on game over
  const prevPhaseRef = useRef(gameState.phase);
  const prevTurnRef = useRef(gameState.turn);
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = gameState.phase;
    const prevTurn = prevTurnRef.current;
    prevTurnRef.current = gameState.turn;

    // Clear save on game over
    if (gameState.phase === 'game-over' && prevPhase !== 'game-over') {
      clearSavedRun();
      return;
    }

    // Save on any phase transition (except into landing or game-over)
    if (gameState.phase !== prevPhase && gameState.phase !== 'landing' && gameState.phase !== 'game-over') {
      saveRun(gameState);
    }
    // Also save after every combat turn (turn number incremented)
    if (gameState.phase === 'combat' && gameState.turn > prevTurn) {
      saveRun(gameState);
    }
  }, [gameState.phase, gameState.turn, gameState, saveRun, clearSavedRun]);

  // Proceed from shop to next combat (with relic support)
  const proceedFromShop = useCallback(() => {
    setGameState(prev => {
      if (prev.phase !== 'shop') return prev;
      
      // Separate Innate cards from the rest
      const innateCards = prev.deckList.filter(c => c.innate);
      const nonInnateCards = prev.deckList.filter(c => !c.innate);
      
      // Reshuffle non-innate cards for the new floor
      const shuffledDeck = shuffleDeck(nonInnateCards);
      
      const hs = getHandSize(prev.ownedRelics);
      const tempLog: string[] = [];
      
      // Start with innate cards in hand, then draw the rest
      const initialHand = [...innateCards];
      const { deck, hand, discard, exhausted } = drawHandCards(shuffledDeck, [], initialHand, hs, prev.ownedRelics, 0, tempLog);

      // Clean Room exhausted cards removed from deck list
      let newDeckList = [...prev.deckList];
      for (const ex of exhausted) {
        newDeckList = newDeckList.filter(c => c.id !== ex.id);
      }

      // Relic: Coil Capacitor (+1 energy per copy at start of combat)
      let playerEnergy = 3;
      playerEnergy += countRelic(prev.ownedRelics, 'coil_capacitor');

      // Relic: Stability Core (raise glitch threshold +2 per copy)
      const glitchThreshold = 4 + countRelic(prev.ownedRelics, 'stability_core') * 2;
      
      // Relic: Demon Core (-5 HP at combat start)
      let playerHp = prev.playerHp;
      if (hasRelic(prev.ownedRelics, 'demon_core')) {
        playerHp = Math.max(1, playerHp - 5);
        tempLog.push('Demon Core: -5 HP');
      }

      // Zone modifier
      const zone = selectZone();
      let finalDeck = deck;
      if (zone.effect.type !== 'none') tempLog.push(`Zone: ${zone.name} \u2014 ${zone.description}`);
      if (zone.effect.type === 'glitch_inject') {
        for (let i = 0; i < zone.effect.value; i++) {
          finalDeck = [...finalDeck, createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + i)];
        }
      }

      // Phase 1.5: Calculate enemy intents at combat start
      prev.enemies.forEach(enemy => {
        if (enemy.hp <= 0) {
          enemy.intentDisplay = undefined;
          return;
        }

        const empowerBonus = prev.enemies
          .filter(e => e.id !== enemy.id && e.hp > 0)
          .reduce((sum, e) => sum + (e.empowerAlly ?? 0), 0);
        const baseDmg = enemy.damage + empowerBonus;

        // Default: attack intent
        enemy.intentDisplay = { type: 'attack', value: baseDmg };

        // Override for special behaviors
        if (enemy.shieldAlly && enemy.shieldAlly > 0 && prev.enemies.length > 1) {
          enemy.intentDisplay = { type: 'buff', value: enemy.shieldAlly, label: 'Shield Allies' };
        } else if (enemy.regen && enemy.regen > 0 && enemy.hp < enemy.maxHp) {
          enemy.intentDisplay = { type: 'heal', value: enemy.regen };
        } else if (enemy.vampiric && enemy.vampiric > 0) {
          enemy.intentDisplay = { type: 'special', value: baseDmg, label: `💉 ${baseDmg}` };
        } else if (enemy.tempoSiphon && enemy.tempoSiphon > 0) {
          enemy.intentDisplay = { type: 'debuff', value: enemy.tempoSiphon, label: 'Steal Tempo' };
        }
      });
      
      return {
        ...prev,
        phase: 'combat',
        shopInventory: [],
        deckList: newDeckList,
        deck: finalDeck,
        hand,
        discard,
        playedThisTurn: [],
        currentSequence: [],
        playerEnergy,
        playerTempo: countRelic(prev.ownedRelics, 'tempo_primer') * 2,
        playerStatic: 0,
        playerShield: 0,
        playerHp,
        glitchThreshold,
        firstPulsePlayedThisTurn: false,
        firstSawPlayedThisTurn: false,
        reshuffleCount: 0,
        playerStatuses: [],
        removalsUsed: 0,
        combatLog: tempLog,
        mulliganAvailable: true,  // Phase 8.1 — Enable mulligan at combat start
        mulliganSelected: [],
        damageTakenLastTurn: 0,
        waveformTypesPlayedThisTurn: [],
        momentumCoreActive: false,
        safeLandingUsed: false,
        overwriterPenUsed: false,
        overwriterPenTarget: null,
        voidShieldActive: false,
        voidHarvesterDmgBonus: 0,
        floorTurns: 0,
        floorDamageTaken: 0,
        floorPatternsCompleted: 0,
        currentZone: zone,
      };
    });
  }, [shuffleDeck, drawHandCards]);

  // Phase 8.1 — Mulligan handlers
  const toggleMulliganCard = useCallback((index: number) => {
    setGameState(prev => {
      if (!prev.mulliganAvailable || prev.phase !== 'combat') return prev;
      const selected = [...prev.mulliganSelected];
      const idx = selected.indexOf(index);
      if (idx >= 0) {
        selected.splice(idx, 1);
      } else if (selected.length < 2) {
        selected.push(index);
      }
      return { ...prev, mulliganSelected: selected };
    });
  }, []);

  const confirmMulligan = useCallback(() => {
    setGameState(prev => {
      if (!prev.mulliganAvailable || prev.phase !== 'combat') return prev;
      if (prev.mulliganSelected.length === 0) {
        // Just close mulligan
        return { ...prev, mulliganAvailable: false, mulliganSelected: [] };
      }

      const log = [...prev.combatLog];
      // Sort indices descending to splice correctly
      const indices = [...prev.mulliganSelected].sort((a, b) => b - a);
      
      // Remove selected cards from hand and add to deck
      let newDeck = [...prev.deck];
      let newHand = [...prev.hand];
      const returned: Card[] = [];
      
      for (const idx of indices) {
        if (idx < newHand.length) {
          const card = newHand.splice(idx, 1)[0];
          returned.push(card);
        }
      }
      
      // Add returned cards to deck and shuffle
      newDeck.push(...returned);
      for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
      }
      
      // Draw replacements
      let reshuffleCount = prev.reshuffleCount;
      let playerHp = prev.playerHp;
      let newDiscard = [...prev.discard];
      
      for (let i = 0; i < returned.length; i++) {
        // Refill from discard if needed
        if (newDeck.length === 0 && newDiscard.length > 0) {
          reshuffleCount++;
          const fatigueDmg = reshuffleCount > 1 
            ? Math.floor(0.5 * reshuffleCount * (reshuffleCount - 1))
            : 0;
          if (fatigueDmg > 0) {
            playerHp = Math.max(0, playerHp - fatigueDmg);
            log.push(`Reshuffle fatigue! -${fatigueDmg} HP`);
          }
          // Shuffle discard into deck
          newDeck = [...newDiscard];
          for (let j = newDeck.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [newDeck[j], newDeck[k]] = [newDeck[k], newDeck[j]];
          }
          newDiscard = [];
          log.push('Discard reshuffled');
        }
        
        if (newDeck.length > 0) {
          newHand.push(newDeck.pop()!);
        }
      }
      
      log.push(`Mulliganed ${returned.length} card${returned.length > 1 ? 's' : ''}`);
      
      return {
        ...prev,
        hand: newHand,
        deck: newDeck,
        discard: newDiscard,
        playerHp,
        reshuffleCount,
        mulliganAvailable: false,
        mulliganSelected: [],
        combatLog: log,
      };
    });
  }, []);

  const skipMulligan = useCallback(() => {
    setGameState(prev => {
      if (!prev.mulliganAvailable) return prev;
      return { ...prev, mulliganAvailable: false, mulliganSelected: [] };
    });
  }, []);

  // Overwriter's Pen — activate transform mode
  const activateOverwriterPen = useCallback((handIndex: number) => {
    setGameState(prev => {
      if (prev.phase !== 'combat' || prev.overwriterPenUsed) return prev;
      if (!hasRelic(prev.ownedRelics, 'overwriters_pen')) return prev;
      if (handIndex < 0 || handIndex >= prev.hand.length) return prev;
      return { ...prev, overwriterPenTarget: handIndex };
    });
  }, []);

  const cancelOverwriterPen = useCallback(() => {
    setGameState(prev => ({ ...prev, overwriterPenTarget: null }));
  }, []);

  const confirmOverwriterPen = useCallback((newCardKey: string) => {
    setGameState(prev => {
      if (prev.overwriterPenTarget === null) return prev;
      const idx = prev.overwriterPenTarget;
      if (idx < 0 || idx >= prev.hand.length) return { ...prev, overwriterPenTarget: null };
      const newCard = createNamedCard(newCardKey, prev.hand[idx].id);
      const newHand = [...prev.hand];
      newHand[idx] = newCard;
      // Also update deckList
      const oldCardId = prev.hand[idx].id;
      const newDeckList = prev.deckList.map(c => c.id === oldCardId ? newCard : c);
      return {
        ...prev,
        hand: newHand,
        deckList: newDeckList,
        overwriterPenUsed: true,
        overwriterPenTarget: null,
        combatLog: [...prev.combatLog, `Overwriter's Pen: transformed ${prev.hand[idx].name} → ${newCard.name}`],
      };
    });
  }, []);

  // Phase 6.2 — Card reward handlers
  const getNextPhaseAfterReward = useCallback((floor: number): { phase: GameState['phase']; event?: GameEvent } => {
    // 40% chance of an event
    if (Math.random() < 0.4) {
      const eligible = eventTemplates.filter(e => floor >= e.minFloor);
      if (eligible.length > 0) {
        const event = eligible[Math.floor(Math.random() * eligible.length)];
        return { phase: 'event', event };
      }
    }
    // Every 3rd floor: rest-or-shop choice
    if (floor % 3 === 0) {
      return { phase: 'rest-or-shop' };
    }
    return { phase: 'reward' };
  }, []);

  const selectCardReward = useCallback((card: Card) => {
    setGameState(prev => {
      if (prev.phase !== 'card-reward') return prev;
      const next = getNextPhaseAfterReward(prev.floor);
      return {
        ...prev,
        deckList: [...prev.deckList, card],
        phase: next.phase,
        cardRewardChoices: [],
        currentEvent: next.event,
      };
    });
  }, [getNextPhaseAfterReward]);

  const skipCardReward = useCallback(() => {
    setGameState(prev => {
      if (prev.phase !== 'card-reward') return prev;
      const next = getNextPhaseAfterReward(prev.floor);
      return {
        ...prev,
        currency: prev.currency + 20,
        phase: next.phase,
        cardRewardChoices: [],
        currentEvent: next.event,
      };
    });
  }, [getNextPhaseAfterReward]);

  // 6.7 — Shop refresh
  const refreshShop = useCallback(() => {
    setGameState(prev => {
      if (prev.phase !== 'shop') return prev;
      if (prev.shopRefreshesUsed >= 2) return prev;
      if (prev.currency < 20) return prev;
      return {
        ...prev,
        currency: prev.currency - 20,
        shopRefreshesUsed: prev.shopRefreshesUsed + 1,
        shopInventory: generateShopInventory(prev.floor, prev.shopRefreshesUsed + 1),
      };
    });
  }, []);

  // 7.1 — Event system
  const resolveEventChoice = useCallback((choiceIndex: number) => {
    setGameState(prev => {
      if (!prev.currentEvent) return prev;
      const event = prev.currentEvent;
      const choice = event.choices[choiceIndex];
      let playerHp = prev.playerHp;
      let playerMaxHp = prev.playerMaxHp;
      let currency = prev.currency;
      let playerStatic = prev.playerStatic;
      let deckList = [...prev.deckList];
      const log = [...prev.combatLog];

      switch (choice.effect) {
        case 'heal': {
          // Special: scrap_merchant costs 30 currency
          if (event.id === 'scrap_merchant') {
            if (currency < 30) {
              log.push('Not enough currency!');
              break;
            }
            currency -= 30;
          }
          const healAmt = choice.value <= 100
            ? Math.floor(playerMaxHp * choice.value / 100)
            : choice.value;
          playerHp = Math.min(playerMaxHp, playerHp + healAmt);
          log.push(`Healed ${healAmt} HP.`);
          break;
        }
        case 'currency':
          if (event.id === 'the_wager' && choiceIndex === 0) {
            if (currency < 40) {
              log.push('Not enough currency to wager!');
              break;
            }
            currency -= 40;
            if (Math.random() < 0.5) {
              currency += 100;
              log.push('Won the wager! +100💰');
            } else {
              log.push('Lost the wager! -40💰');
            }
          } else {
            currency += choice.value;
            if (choice.value > 0) log.push(`Gained ${choice.value}💰`);
          }
          break;
        case 'removeCard': {
          // Special: data_broker costs 50 currency + also upgrades a card
          if (event.id === 'data_broker') {
            if (currency < 50) {
              log.push('Not enough currency!');
              break;
            }
            currency -= 50;
          }
          const removable = deckList.filter(c => c.rarity !== 'common' || deckList.length > 5);
          if (removable.length > 0) {
            const toRemove = removable[Math.floor(Math.random() * removable.length)];
            deckList = deckList.filter(c => c.id !== toRemove.id);
            log.push(`Removed ${toRemove.name} from deck.`);
          }
          // data_broker also upgrades a random card
          if (event.id === 'data_broker') {
            const upgradable = deckList.filter(c => !c.upgraded);
            if (upgradable.length > 0) {
              const target = upgradable[Math.floor(Math.random() * upgradable.length)];
              const idx = deckList.findIndex(c => c.id === target.id);
              if (idx >= 0) {
                const up = deckList[idx].clone(Date.now() + Math.floor(Math.random() * 100000));
                up.upgraded = true;
                up.damage = Math.ceil(up.damage * 1.25);
                up.shield = Math.ceil(up.shield * 1.25);
                up.name = up.name + '+';
                deckList = [...deckList];
                deckList[idx] = up;
                log.push(`Upgraded ${target.name}!`);
              }
            }
          }
          break;
        }
        case 'addCard': {
          const rarePool = CARD_CATALOG.filter(t => t.rarity === 'rare' && !t.isGlitch);
          if (rarePool.length > 0) {
            const template = rarePool[Math.floor(Math.random() * rarePool.length)];
            const newId = Date.now() + Math.floor(Math.random() * 100000);
            deckList = [...deckList, Card.fromTemplate(template, newId)];
            log.push(`Added ${template.name} to deck.`);
          }
          // data_broker: stealing adds static instead of glitch
          if (event.id === 'data_broker') {
            playerStatic += 3;
            log.push('+3 Static from stolen data.');
          } else {
            const glitch = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + 99);
            deckList = [...deckList, glitch];
            log.push('Added a Glitch card to deck.');
          }
          break;
        }
        case 'upgradeCard': {
          const upgradable = deckList.filter(c => !c.upgraded);
          if (upgradable.length > 0) {
            const target = upgradable[Math.floor(Math.random() * upgradable.length)];
            const idx = deckList.findIndex(c => c.id === target.id);
            if (idx >= 0) {
              const upgraded = deckList[idx].clone(Date.now() + Math.floor(Math.random() * 100000));
              upgraded.upgraded = true;
              upgraded.damage = Math.ceil(upgraded.damage * 1.25);
              upgraded.shield = Math.ceil(upgraded.shield * 1.25);
              upgraded.name = upgraded.name + '+';
              deckList = [...deckList];
              deckList[idx] = upgraded;
              log.push(`Upgraded ${target.name}!`);
            }
          }
          // corrupted_forge: upgrading also adds a glitch card
          if (event.id === 'corrupted_forge') {
            const glitch = createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + 99);
            deckList = [...deckList, glitch];
            log.push('Corruption added a Glitch card to deck.');
          }
          break;
        }
        case 'maxHp':
          playerMaxHp += choice.value;
          playerHp += choice.value;
          log.push(`+${choice.value} max HP!`);
          break;
        case 'loseHp':
          playerHp = Math.max(1, playerHp - choice.value);
          currency += 60;
          log.push(`Lost ${choice.value} HP, gained 60💰.`);
          break;
        case 'reduceStatic':
          playerStatic = 0;
          log.push('Static reduced to 0.');
          break;
        case 'gainStatic':
          playerStatic += choice.value;
          currency += 35;
          log.push(`+${choice.value} Static, +35💰.`);
          break;
      }

      return {
        ...prev,
        playerHp,
        playerMaxHp,
        currency,
        playerStatic,
        deckList,
        currentEvent: undefined,
        phase: 'reward',
        combatLog: log,
      };
    });
  }, []);

  // 7.2 — Rest vs Shop
  const chooseRest = useCallback(() => {
    setGameState(prev => {
      const healAmt = Math.floor(prev.playerMaxHp * 0.5);
      return {
        ...prev,
        playerHp: Math.min(prev.playerMaxHp, prev.playerHp + healAmt),
        phase: 'landing', // skip shop, go to next floor combat setup
        combatLog: [...prev.combatLog, `Rested and healed ${healAmt} HP.`],
      };
    });
    // Proceed to next combat via nextFloor-like flow
    setTimeout(() => {
      setGameState(prev => {
        const newFloor = prev.floor + 1;
        const newEnemies = createEnemies(newFloor);
        const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
        const seqLength = Math.min(2 + Math.floor((newFloor - 1) / 5), 3);
        const targetSequence = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);
        const zone = selectZone();
        // Separate Innate cards from the rest
        const innateCards = prev.deckList.filter(c => c.innate);
        const nonInnateCards = prev.deckList.filter(c => !c.innate);
        let shuffledDeck = shuffleDeck(nonInnateCards);
        const restLog: string[] = [];
        if (zone.effect.type !== 'none') restLog.push(`Zone: ${zone.name} — ${zone.description}`);
        if (zone.effect.type === 'glitch_inject') {
          for (let i = 0; i < zone.effect.value; i++) {
            shuffledDeck = [...shuffledDeck, createGlitchCard(Date.now() + Math.floor(Math.random() * 100000) + i)];
          }
        }

        const hs = getHandSize(prev.ownedRelics);
        const tempLog: string[] = [];
        const initialHand = [...innateCards];
        const drawResult = drawHandCards(shuffledDeck, [], initialHand, hs, prev.ownedRelics, 0, tempLog);

        // Clean Room exhausted cards removed from deck list
        let newDeckList = [...prev.deckList];
        for (const ex of drawResult.exhausted) {
          newDeckList = newDeckList.filter(c => c.id !== ex.id);
        }

        return {
          ...prev,
          floor: newFloor,
          node: prev.node + 1,
          phase: 'combat',
          enemies: newEnemies,
          deck: drawResult.deck,
          hand: drawResult.hand,
          discard: drawResult.discard,
          deckList: newDeckList,
          playedThisTurn: [],
          targetSequence,
          currentSequence: [],
          turn: 0,
          selectedEnemyId: newEnemies[0]?.id ?? 0,
          playerShield: 0,
          playerTempo: countRelic(prev.ownedRelics, 'tempo_primer') * 2,
          playerStatic: 0,
          playerEnergy: 3 + countRelic(prev.ownedRelics, 'coil_capacitor') + (hasRelic(prev.ownedRelics, 'demon_core') ? 2 : 0),
          glitchThreshold: 4 + countRelic(prev.ownedRelics, 'stability_core') * 2 - (hasRelic(prev.ownedRelics, 'overclocked_processor') ? 2 : 0),
          firstPulsePlayedThisTurn: false,
          firstSawPlayedThisTurn: false,
          reshuffleCount: 0,
          playerStatuses: [],
          combatLog: restLog,
          mulliganAvailable: true,
          floorDamageTaken: 0,
          floorPatternsCompleted: 0,
          floorTurns: 0,
          shopRefreshesUsed: 0,
          voidHarvesterDmgBonus: 0,
          safeLandingUsed: false,
          overwriterPenUsed: false,
          overwriterPenTarget: null,
          currentZone: zone,
        };
      });
    }, 100);
  }, [shuffleDeck, drawHandCards]);

  const chooseShop = useCallback(() => {
    // Normal flow — go to next floor with shop
    setGameState(prev => {
      const newFloor = prev.floor + 1;
      const newEnemies = createEnemies(newFloor);
      const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
      const seqLength = Math.min(2 + Math.floor((newFloor - 1) / 5), 3);
      const targetSequence = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);
      const shopInventory = generateShopInventory(newFloor);
      const healAmount = Math.floor(prev.playerMaxHp * 0.25);
      return {
        ...prev,
        floor: newFloor,
        node: prev.node + 1,
        phase: 'shop',
        enemies: newEnemies,
        targetSequence,
        shopInventory,
        playerHp: Math.min(prev.playerMaxHp, prev.playerHp + healAmount),
        floorDamageTaken: 0,
        floorPatternsCompleted: 0,
        floorTurns: 0,
        shopRefreshesUsed: 0,
        relicBoughtThisShop: false,
        shopRemovalsUsed: 0,
        shopUpgradesUsed: 0,
      };
    });
  }, []);

  // 8.1 — Deck/discard pile viewer toggle
  const toggleViewPile = useCallback((pile: 'deck' | 'discard' | null) => {
    setGameState(prev => ({
      ...prev,
      viewingPile: prev.viewingPile === pile ? null : pile,
    }));
  }, []);

  // 8.5 — Card sort mode toggle
  const cycleSortMode = useCallback(() => {
    setGameState(prev => {
      const modes: Array<'none' | 'cost' | 'type' | 'damage'> = ['none', 'cost', 'type', 'damage'];
      const idx = modes.indexOf(prev.handSortMode);
      return { ...prev, handSortMode: modes[(idx + 1) % modes.length] };
    });
  }, []);

  // 8.4 — Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (gameState.phase !== 'combat') return;
      // Ignore if typing in an input
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

      // Number keys 1-9 to play cards
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < gameState.hand.length) {
          playCard(idx);
        }
      }
      // Q to end turn
      if (e.key === 'q' || e.key === 'Q') {
        endTurn();
      }
      // S to cycle sort mode
      if (e.key === 's' || e.key === 'S') {
        cycleSortMode();
      }
      // D to view deck, F to view discard
      if (e.key === 'd' || e.key === 'D') {
        toggleViewPile('deck');
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleViewPile('discard');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameState.phase, gameState.hand.length, playCard, endTurn, cycleSortMode, toggleViewPile]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="border-2 border-cyan-500 cursor-pointer rounded-lg w-full h-full"
        onMouseMove={(e) => {
          if (!canvasRef.current) return;
          const rect = canvasRef.current.getBoundingClientRect();
          const scaleX = canvasSize.w / rect.width;
          const scaleY = canvasSize.h / rect.height;
          mousePos.current = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
          };
          if (!tooltipRaf.current) {
            tooltipRaf.current = requestAnimationFrame(() => {
              tooltipRaf.current = 0;
              setTooltipTick(t => t + 1);
            });
          }
        }}
        onMouseLeave={() => { mousePos.current = null; setTooltipTick(t => t + 1); }}
        onClick={(e) => {
          if (!canvasRef.current) return;
          const rect = canvasRef.current.getBoundingClientRect();
          const scaleX = canvasSize.w / rect.width;
          const scaleY = canvasSize.h / rect.height;
          const x = (e.clientX - rect.left) * scaleX;
          const y = (e.clientY - rect.top) * scaleY;
          
          // Check if clicked on hamburger menu
          if (hamburgerRect.current) {
            const h = hamburgerRect.current;
            if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
              setShowPauseMenu(true);
              return;
            }
          }

          // Check if clicked on end turn button
          if (endTurnRect.current) {
            const btn = endTurnRect.current;
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
              endTurn();
              return;
            }
          }
          
          // Check if clicked on hand cards
          for (const cardRect of cardRects.current) {
            if (cardRect.type === 'hand' && x >= cardRect.x && x <= cardRect.x + cardRect.w && y >= cardRect.y && y <= cardRect.y + cardRect.h) {
              if (gameState.mulliganAvailable) {
                toggleMulliganCard(cardRect.index);
              } else {
                playCard(cardRect.index);
              }
              return;
            }
          }
          
          // Check if clicked on played cards to unplay
          for (const cardRect of cardRects.current) {
            if (cardRect.type === 'played' && x >= cardRect.x && x <= cardRect.x + cardRect.w && y >= cardRect.y && y <= cardRect.y + cardRect.h) {
              unplayCard(cardRect.index);
              return;
            }
          }
          
          // Check if clicked on enemy
          const enemyCount = gameState.enemies.length;
          const spacing = canvasSize.w / (enemyCount + 1);
          const enemyY = 80;
          
          gameState.enemies.forEach((enemy, idx) => {
            const enemyX = spacing * (idx + 1);
            const dist = Math.sqrt((x - enemyX) ** 2 + (y - enemyY) ** 2);
            if (dist < 50) {
              selectEnemy(enemy.id);
            }
          });
        }}
      />

      <SignalForgeUI
        gameState={gameState}
        onPlayCard={playCard}
        onUnplayCard={unplayCard}
        onEndTurn={endTurn}
        onStartGame={startGame}
        onNextFloor={nextFloor}
        onSelectEnemy={selectEnemy}
        onBuyItem={buyItem}
        onRemoveCard={removeCard}
        onUpgradeCard={upgradeCard}
        onProceedFromShop={proceedFromShop}
        onReturnToLanding={returnToLanding}
        hasSavedRun={hasSavedRun}
        onLoadSavedRun={loadSavedRun}
        onAbandonRun={abandonRun}
        showPauseMenu={showPauseMenu}
        setShowPauseMenu={setShowPauseMenu}
        onSelectCardReward={selectCardReward}
        onSkipCardReward={skipCardReward}
        onToggleMulliganCard={toggleMulliganCard}
        onConfirmMulligan={confirmMulligan}
        onSkipMulligan={skipMulligan}
        onSelectStarterRelic={selectStarterRelic}
        onResolveEvent={resolveEventChoice}
        onChooseRest={chooseRest}
        onChooseShop={chooseShop}
        onRefreshShop={refreshShop}
        onToggleViewPile={toggleViewPile}
        onCycleSortMode={cycleSortMode}
        onActivateOverwriterPen={activateOverwriterPen}
        onCancelOverwriterPen={cancelOverwriterPen}
        onConfirmOverwriterPen={confirmOverwriterPen}
      />
    </div>
  );
}

