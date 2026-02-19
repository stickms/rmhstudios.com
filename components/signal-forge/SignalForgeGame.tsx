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
  StatusEffect,
  tickStatusEffects,
  hasStatus,
  applyStatus,
  WaveformType,
} from '@/lib/signal-forge';

interface ShopItem {
  id: string;
  type: 'card' | 'relic' | 'removal';
  item: Card | Relic | null;
  price: number;
}

interface GameState {
  floor: number;
  node: number;
  phase: 'landing' | 'deck-select' | 'combat' | 'reward' | 'shop' | 'game-over';
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
}

/** Check if the player owns a relic with a given key */
function hasRelic(relics: Relic[], key: string): boolean {
  return relics.some(r => r.key === key);
}

function countRelic(relics: Relic[], key: string): number {
  return relics.filter(r => r.key === key).length;
}

function getHandSize(relics: Relic[]): number {
  return 5 + countRelic(relics, 'expanded_buffer');
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
  };
}

const STARTER_DECK = createStarterDeck();

// Generate shop inventory for a floor
const generateShopInventory = (floor: number, removalsUsed: number = 0): ShopItem[] => {
  const inventory: ShopItem[] = [];
  let itemId = 0;

  // Add cards - more offerings at higher floors
  const cardCount = Math.min(3 + Math.floor((floor - 1) / 2), 6);
  const rarities: Array<'common' | 'uncommon' | 'rare'> = ['common', 'uncommon', 'rare'];
  for (let i = 0; i < cardCount; i++) {
    const card = createShopCard(floor, floor * 1000 + 500 + i, rarities[i % rarities.length]);
    const prices = { common: 40, uncommon: 70, rare: 110 };
    inventory.push({
      id: `card_${itemId++}`,
      type: 'card',
      item: card,
      price: prices[card.rarity as keyof typeof prices] ?? 70,
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
      price: 120,
    });
  }

  // Add one card removal option with escalating cost
  const removalPrice = 50 + removalsUsed * 25;
  inventory.push({
    id: 'removal',
    type: 'removal',
    item: null,
    price: removalPrice,
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
    combatLog: [],
    playerStatuses: [],
    removalsUsed: 0,
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
      // Formula uses triangular numbers: 0, 0, 2, 5, 9, 14, 20...
      // This creates escalating cost: 1st free, 2nd=2, 3rd=5, 4th=9, etc.
      let fatigueDamage = 0;
      if (newReshuffleCount > 1) {
        fatigueDamage = Math.floor(0.5 * newReshuffleCount * (newReshuffleCount - 1));
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

    const playedPanelY = middleTop + Math.round(255 * mScale);
    const panelH = Math.round(105 * mScale);

    const handPanelY = playedPanelY + panelH + Math.round(28 * mScale);

    const cardH = Math.round(80 * mScale);
    const cardW = Math.round(65 * mScale);
    const cardPadY = Math.round(16 * mScale);
    const cardGapX = cardW + 10;

    // Reset tooltip zones
    tooltipZones.current = [];

    // === TOP LEFT HUD ===
    drawPanel(10, 10, 160, 100);
    
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
    tooltipZones.current.push({ x: W / 2 - 200, y: seqY, w: 400, h: 20, text: ['Pattern: Match the target sequence', 'Play cards in order to fill CURRENT', 'A full match = Forge Burst (+12 bonus dmg)', '★ slots accept any waveform type', 'Wildcard cards match any slot'] });
    
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
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(cardX, playedStartY, playedCardW, playedCardH);
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
    
    const handCardW = cardW;
    const handCardH = cardH;
    const handStartX = 40;
    const handStartY = handPanelY + cardPadY;
    const handGapX = cardGapX;
    const cardsPerRow = Math.floor((W - 60) / handGapX);
    
    gameState.hand.forEach((card, i) => {
      const row = Math.floor(i / cardsPerRow);
      const col = i % cardsPerRow;
      const cardX = handStartX + col * handGapX;
      const cardY = handStartY + row * (handCardH + 10);
      
      const canPlay = card.cost <= gameState.playerEnergy;
      drawCard(card, cardX, cardY, handCardW, handCardH);
      
      if (!canPlay) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(cardX, cardY, handCardW, handCardH);
        ctx.fillStyle = '#888888';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO', cardX + handCardW / 2, cardY + handCardH / 2 - 2);
        ctx.fillText('COST', cardX + handCardW / 2, cardY + handCardH / 2 + 8);
      }
      
      cardRects.current.push({ index: i, x: cardX, y: cardY, w: handCardW, h: handCardH, type: 'hand' });
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
    tooltipZones.current.push({ x: btnX, y: btnY, w: btnW, h: btnH, text: ['End Turn: Resolve combat', 'Calculates total damage (cards + bonuses)', 'AOE cards hit all enemies', 'Echo cards repeat at 50% power', 'Sustain cards return to hand', 'Exhaust cards are removed from deck', 'Enemies attack — shield absorbs first'] });

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
        lines.push(card.effect);
        tooltipZones.current.push({
          x: cr.x, y: cr.y, w: cr.w, h: cr.h,
          text: lines,
        });
      }
    }

    // === COMBAT LOG (last turn's events) ===
    if (gameState.combatLog.length > 0) {
      const logX = 10;
      const logY = 120;
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
      // Oscillator Core relic: first Pulse each turn costs 0
      if (card.type === 'Pulse' && !prev.firstPulsePlayedThisTurn && hasRelic(prev.ownedRelics, 'oscillator_core')) {
        effectiveCost = 0;
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
      const sequence = [...prev.currentSequence, seqType];

      const playerEnergy = prev.playerEnergy - effectiveCost;
      const playerTempo = Math.min(prev.playerTempo + 1 + (card.tempoGain ?? 0), 6);
      let playerStatic = prev.playerStatic;
      const playerShield = prev.playerShield + card.getEffectiveShield();
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

      // --- START OF TURN EFFECTS: Process bleed on enemies ---
      const enemiesClonedForBleed = prev.enemies.map(e => e.clone());
      for (const enemy of enemiesClonedForBleed) {
        const bleed = enemy.statusEffects.find(s => s.type === 'bleed');
        if (bleed && bleed.stacks > 0) {
          enemy.hp = Math.max(0, enemy.hp - bleed.stacks);
          log.push(`${enemy.name} takes ${bleed.stacks} bleed damage.`);
        }
      }

      // --- Sequence match check (supports '*' wildcard slots from Phase Shifter) ---
      const isMatch = prev.currentSequence.length === prev.targetSequence.length &&
        prev.targetSequence.every((t, i) => t === '*' || t === prev.currentSequence[i]);
      const matchBonus = isMatch ? 12 : 0;
      if (isMatch) log.push('Forge Burst! +12 bonus damage');

      // --- Relic: Tempo Gear (+1 tempo per copy on sequence match) ---
      let playerTempo = prev.playerTempo;
      const tempoGearCount = countRelic(prev.ownedRelics, 'tempo_gear');
      if (isMatch && tempoGearCount > 0) {
        playerTempo = Math.min(6, playerTempo + tempoGearCount);
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

      const cardDamages: { card: Card; dmg: number }[] = prev.playedThisTurn.map((card, idx) => {
        let dmg = card.getEffectiveDamage();  // includes Echo 50% bonus
        // Signal Mirror: first Saw in the played list gets +3 per copy
        if (signalMirrorCount > 0 && card.type === 'Saw' && !prev.playedThisTurn.slice(0, idx).some(c => c.type === 'Saw')) {
          dmg += 3 * signalMirrorCount;
        }
        // Tempo bonus: each card gains +playerTempo damage
        dmg += tempoBonusDmg;
        return { card, dmg };
      });

      // --- Apply damage to enemies (with status effect modifiers) ---
      const enemiesCloned = enemiesClonedForBleed;
      let thornsDamage = 0; // accumulated thorns reflection
      for (const { card, dmg } of cardDamages) {
        if (dmg <= 0) continue;
        if (card.aoe) {
          // AOE: damage all enemies
          enemiesCloned.forEach(e => {
            // Apply status effect modifiers
            const vulnerable = e.statusEffects.find(s => s.type === 'vulnerable');
            const marked = e.statusEffects.find(s => s.type === 'marked');
            let finalDmg = dmg;
            if (marked) finalDmg += 5;
            if (vulnerable) finalDmg = Math.floor(finalDmg * 1.5);
            
            const absorbed = e.takeDamage(finalDmg, prev.turn);
            totalDamage += absorbed;
            if (card.leech) totalLeechDamage += absorbed;
            if (e.thorns > 0 && finalDmg > 0) thornsDamage += e.thorns;
          });
          log.push(`${card.name} (AOE) hits all for ${dmg}`);
        } else {
          // Single target: damage selected enemy only
          const target = enemiesCloned.find(e => e.id === prev.selectedEnemyId);
          if (target) {
            // Apply status effect modifiers
            const vulnerable = target.statusEffects.find(s => s.type === 'vulnerable');
            const marked = target.statusEffects.find(s => s.type === 'marked');
            let finalDmg = dmg;
            if (marked) finalDmg += 5;
            if (vulnerable) finalDmg = Math.floor(finalDmg * 1.5);
            
            const absorbed = target.takeDamage(finalDmg, prev.turn);
            totalDamage += absorbed;
            if (card.leech) totalLeechDamage += absorbed;
            if (target.thorns > 0 && finalDmg > 0) thornsDamage += target.thorns;
          }
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
          if (vulnerable) bonusDmg = Math.floor(bonusDmg * 1.5);
          
          const absorbed = target.takeDamage(bonusDmg, prev.turn);
          totalDamage += absorbed;
          if (target.thorns > 0) thornsDamage += target.thorns;
        }
      }

      if (totalDamage > 0) log.push(`Total damage dealt: ${totalDamage}`);
      // Remove defeated enemies
      const defeatedCount = enemiesCloned.filter(e => e.isDefeated()).length;
      const enemies = enemiesCloned.filter(e => !e.isDefeated());
      const allDefeated = enemies.length === 0;

      // --- Leech healing ---
      let playerHp = prev.playerHp;
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
      const totalTakeDamage = enemies.reduce((sum, e) => {
        // Check for Freeze status - skip this enemy's attack
        const frozen = e.statusEffects.find(s => s.type === 'freeze');
        if (frozen) {
          e.statusEffects = e.statusEffects.filter(s => s.type !== 'freeze');
          log.push(`${e.name} is frozen and cannot attack!`);
          return sum;
        }
        
        let dmg = e.getDamage();
        // Empower aura from OTHER alive allies
        const allyEmpower = empowerBonus - e.empowerAlly;
        dmg += allyEmpower;
        
        // Check for Weak status - reduce damage by 25%
        const weak = e.statusEffects.find(s => s.type === 'weak');
        if (weak) {
          dmg = Math.floor(dmg * 0.75);
        }
        
        return sum + dmg;
      }, 0) + thornsDamage;
      if (thornsDamage > 0) log.push(`Thorns reflected ${thornsDamage} damage`);
      if (empowerBonus > 0) log.push(`Empower aura: +${empowerBonus} enemy damage`);
      let playerShield = prev.playerShield;
      const shieldUsed = Math.min(playerShield, totalTakeDamage);
      const damageAfterShield = totalTakeDamage - shieldUsed;
      playerHp = Math.max(0, playerHp - damageAfterShield);
      playerShield -= shieldUsed;

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

      // --- Shield reset (resets to 0 each turn, prevented by Sine Loom) ---
      if (!hasRelic(prev.ownedRelics, 'sine_loom')) {
        playerShield = 0;
      }

      // --- Relic: Shield Battery (+2 shield per turn per copy) ---
      const shieldBatteryCount = countRelic(prev.ownedRelics, 'shield_battery');
      if (shieldBatteryCount > 0) {
        const shieldGain = 2 * shieldBatteryCount;
        playerShield += shieldGain;
        log.push(`Shield Battery (x${shieldBatteryCount}): +${shieldGain} shield`);
      }

      const isGameOver = playerHp <= 0;

      // --- Initialize mutable state for end-of-turn ---
      let playerStatic = prev.playerStatic;
      let currency = prev.currency;

      // --- Card routing: Sustain / Exhaust / Discard ---
      let newDeckList = [...prev.deckList];
      const discardAfterPlay = [...prev.discard];
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
      const glitchThreshold = 4 + countRelic(prev.ownedRelics, 'stability_core') * 2;
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

      // --- Draw new hand (sustain cards stay in hand) ---
      const handWithSustain = [...prev.hand, ...sustainHand];
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

      const newPhase = allDefeated ? 'reward' : (isGameOver ? 'game-over' : 'combat');

      // Update selected enemy if they died
      const newSelectedEnemyId = enemies.some(e => e.id === prev.selectedEnemyId)
        ? prev.selectedEnemyId
        : (enemies[0]?.id ?? prev.selectedEnemyId);

      // --- END OF TURN: tick down status effect durations ---
      enemies.forEach(e => {
        e.statusEffects = tickStatusEffects(e.statusEffects);
      });

      return {
        ...prev,
        deckList: newDeckList,
        deck: finalDeck,
        hand: finalHand,
        discard: finalDiscard,
        playedThisTurn: [],
        currentSequence: [],
        playerEnergy,
        playerTempo: 0,
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
        currency: currency + (isMatch ? 15 : 0) + defeatedCount * (20 + prev.floor * 5) + (allDefeated ? (150 + prev.floor * 30) : 0),
        selectedEnemyId: newSelectedEnemyId,
        firstPulsePlayedThisTurn: false,
        firstSawPlayedThisTurn: false,
        reshuffleCount,
        combatLog: log,
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
    playerStatuses: [],
    removalsUsed: 0,
      combatLog: [],
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

  // Start game - draw initial hand (with relic support)
  const startGame = useCallback(() => {
    // Clear any existing saved run when starting fresh
    clearSavedRun();
    setGameState(prev => {
      // Shuffle the full deck list and start fresh
      const shuffledDeck = shuffleDeck(prev.deckList);
      const hs = getHandSize(prev.ownedRelics);
      const tempLog: string[] = [];
      const { deck, hand, discard, exhausted } = drawHandCards(shuffledDeck, [], [], hs, prev.ownedRelics, 0, tempLog);

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
      playerEnergy += countRelic(prev.ownedRelics, 'coil_capacitor');

      // Relic: Stability Core (raise glitch threshold +2 per copy)
      const glitchThreshold = 4 + countRelic(prev.ownedRelics, 'stability_core') * 2;

      return {
        ...prev,
        phase: 'combat',
        deckList: newDeckList,
        deck,
        hand,
        discard,
        enemies,
        playerEnergy,
        playerShield: 0,
        playerTempo: 0,
        playerStatic: 0,
        targetSequence,
        turn: 0,
        selectedEnemyId: enemies[0]?.id ?? prev.selectedEnemyId,
        glitchThreshold,
        firstPulsePlayedThisTurn: false,
        firstSawPlayedThisTurn: false,
        reshuffleCount: 0,
        playerStatuses: [],
    removalsUsed: 0,
      playerStatuses: [],
    removalsUsed: 0,
    playerStatuses: [],
    removalsUsed: 0,
        combatLog: [],
      };
    });
  }, [drawHandCards, shuffleDeck, clearSavedRun]);

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
      const shopInventory = generateShopInventory(newFloor, prev.removalsUsed);
      
      // Heal player 25% of max HP
      const healthGain = Math.floor(prev.playerMaxHp * 0.25);
      const newHp = Math.min(prev.playerHp + healthGain, prev.playerMaxHp);
      
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
      
      if (item.type === 'card' && item.item && item.item instanceof Card) {
        // Add card to deck list with new ID
        const newCard = item.item.clone(Math.floor(Math.random() * 10000));
        newDeckList = [...newDeckList, newCard];
      } else if (item.type === 'relic' && item.item && item.item instanceof Relic) {
        // Add relic to owned relics with new ID
        const newRelic = item.item.clone(Math.floor(Math.random() * 10000));
        newOwnedRelics = [...newOwnedRelics, newRelic];
      }
      
      // Remove from shop inventory
      const newShopInventory = prev.shopInventory.filter(i => i.id !== itemId);
      
      return {
        ...prev,
        deckList: newDeckList,
        ownedRelics: newOwnedRelics,
        currency: prev.currency - item.price,
        shopInventory: newShopInventory,
      };
    });
  }, []);

  // Remove card from deck
  const removeCard = useCallback((cardId: number) => {
    setGameState(prev => {
      if (prev.phase !== 'shop') return prev;
      const removalPrice = 50 + prev.removalsUsed * 25;
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
    playerStatuses: [],
    removalsUsed: 0,
      combatLog: [],
    });
  }, []);

  // Auto-save when entering shop phase, after each turn, auto-clear when game ends
  const prevPhaseRef = useRef(gameState.phase);
  const prevTurnRef = useRef(gameState.turn);
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = gameState.phase;
    const prevTurn = prevTurnRef.current;
    prevTurnRef.current = gameState.turn;

    // Save when transitioning into shop (after floor clear)
    if (gameState.phase === 'shop' && prevPhase !== 'shop' && prevPhase !== 'landing') {
      saveRun(gameState);
    }
    // Save when transitioning into combat from shop (prevents shop save-scumming)
    if (gameState.phase === 'combat' && prevPhase === 'shop') {
      saveRun(gameState);
    }
    // Save after every turn (turn number incremented)
    if (gameState.phase === 'combat' && gameState.turn > prevTurn) {
      saveRun(gameState);
    }
    // Clear save on game over
    if (gameState.phase === 'game-over' && prevPhase !== 'game-over') {
      clearSavedRun();
    }
  }, [gameState.phase, gameState.turn, gameState, saveRun, clearSavedRun]);

  // Proceed from shop to next combat (with relic support)
  const proceedFromShop = useCallback(() => {
    setGameState(prev => {
      if (prev.phase !== 'shop') return prev;
      
      // Reshuffle the full deck for the new floor
      const shuffledDeck = shuffleDeck(prev.deckList);
      const hs = getHandSize(prev.ownedRelics);
      const tempLog: string[] = [];
      const { deck, hand, discard, exhausted } = drawHandCards(shuffledDeck, [], [], hs, prev.ownedRelics, 0, tempLog);

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
      
      return {
        ...prev,
        phase: 'combat',
        shopInventory: [],
        deckList: newDeckList,
        deck,
        hand,
        discard,
        playedThisTurn: [],
        currentSequence: [],
        playerEnergy,
        playerTempo: 0,
        playerStatic: 0,
        playerShield: 0,
        glitchThreshold,
        firstPulsePlayedThisTurn: false,
        firstSawPlayedThisTurn: false,
        reshuffleCount: 0,
        playerStatuses: [],
    removalsUsed: 0,
      playerStatuses: [],
    removalsUsed: 0,
    playerStatuses: [],
    removalsUsed: 0,
        combatLog: [],
      };
    });
  }, [shuffleDeck, drawHandCards]);

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
              playCard(cardRect.index);
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
        onProceedFromShop={proceedFromShop}
        onReturnToLanding={returnToLanding}
        hasSavedRun={hasSavedRun}
        onLoadSavedRun={loadSavedRun}
        onAbandonRun={abandonRun}
        showPauseMenu={showPauseMenu}
        setShowPauseMenu={setShowPauseMenu}
      />
    </div>
  );
}

