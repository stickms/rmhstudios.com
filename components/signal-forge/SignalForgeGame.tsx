'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SignalForgeUI } from '@/components/signal-forge/SignalForgeUI';

interface Card {
  id: number;
  name: string;
  cost: number;
  type: 'Pulse' | 'Sine' | 'Saw' | 'Noise';
  damage: number;
  shield: number;
  draw?: number;
  effect: string;
  rarity: 'common' | 'uncommon' | 'rare';
}

interface Enemy {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  intent: string;
  damage: number;
}

interface GameState {
  floor: number;
  node: number;
  phase: 'landing' | 'deck-select' | 'combat' | 'reward' | 'shop' | 'game-over';
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
}

// Seeded random for consistency
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// Procedurally generate a starter deck
const generateStarterDeck = (): Card[] => {
  const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
  const deck: Card[] = [];
  let cardId = 1;

  // Generate 10 cards, 2-3 of each type
  for (const type of types) {
    const count = type === 'Pulse' || type === 'Sine' ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const seed = cardId * 7 + i * 13;
      const costRand = seededRandom(seed);
      const cost = costRand < 0.4 ? 0 : costRand < 0.8 ? 1 : 1;
      
      const damageBase = { 'Pulse': 3, 'Sine': 1, 'Saw': 2, 'Noise': 2 }[type];
      const shieldBase = { 'Pulse': 0, 'Sine': 2, 'Saw': 1, 'Noise': 0 }[type];
      const damage = damageBase + (seededRandom(seed + 1) < 0.3 ? 1 : 0);
      const shield = shieldBase + (seededRandom(seed + 2) < 0.2 ? 1 : 0);
      
      deck.push({
        id: cardId,
        name: `${type} Card ${i + 1}`,
        cost,
        type: type as 'Pulse' | 'Sine' | 'Saw' | 'Noise',
        damage,
        shield,
        effect: shield > 0 ? 'Attack & Defend' : 'Attack',
        rarity: 'common',
      });
      cardId++;
    }
  }

  return deck;
};

// Procedurally generate enemy name
const generateEnemyName = (seed: number): string => {
  const prefixes = ['Noise', 'Pulse', 'Sine', 'Saw', 'Echo', 'Signal', 'Wave', 'Drift'];
  const suffixes = ['Beetle', 'Drone', 'Wraith', 'Stalker', 'Phantom', 'Specter', 'Shadow', 'Shade'];
  const p = prefixes[Math.floor(seededRandom(seed) * prefixes.length)];
  const s = suffixes[Math.floor(seededRandom(seed + 1) * suffixes.length)];
  return `${p} ${s}`;
};

const STARTER_DECK = generateStarterDeck();

// Procedurally generate enemies for a floor
const generateEnemies = (floor: number): Enemy[] => {
  const enemyCount = 2 + Math.floor((floor - 1) / 4);
  const enemies: Enemy[] = [];
  
  for (let i = 0; i < enemyCount; i++) {
    const seed = floor * 100 + i;
    const hpBase = 12 + seededRandom(seed) * 8;
    const dmgBase = 1.5 + seededRandom(seed + 1) * 1.5;
    
    const hpScale = 1 + (floor - 1) * 0.25;
    const dmgScale = 1 + (floor - 1) * 0.15;
    const hp = Math.floor(hpBase * hpScale);
    const damage = Math.floor(dmgBase * dmgScale);
    
    enemies.push({
      id: floor * 100 + i,
      name: generateEnemyName(seed),
      hp,
      maxHp: hp,
      intent: 'Attack',
      damage: Math.max(1, damage),
    });
  }
  
  return enemies;
};

export function SignalForgeGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRects = useRef<Array<{ index: number; x: number; y: number; w: number; h: number; type: 'hand' | 'played' }>>(
    []
  );
  const endTurnRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const tooltipZones = useRef<Array<{ x: number; y: number; w: number; h: number; text: string[] }>>([]);
  const mousePos = useRef<{ x: number; y: number } | null>(null);
  const tooltipRaf = useRef<number>(0);
  const [tooltipTick, setTooltipTick] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 755 });
  
  // Generate initial enemies (floor 1)
  const initialEnemies = generateEnemies(1);

  const [gameState, setGameState] = useState<GameState>({
    floor: 1,
    node: 1,
    phase: 'landing',
    deck: [...STARTER_DECK],
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
  });

  // Helper: draw cards up to hand size
  const drawHandCards = useCallback((currentDeck: Card[], currentDiscard: Card[], currentHand: Card[], count: number = 5): { deck: Card[]; hand: Card[]; discard: Card[] } => {
    let deck = [...currentDeck];
    let discard = [...currentDiscard];
    let hand = [...currentHand];

    const needToDraw = Math.max(0, count - hand.length);
    for (let i = 0; i < needToDraw; i++) {
      // Reshuffle discard into deck if deck is empty
      if (deck.length === 0 && discard.length > 0) {
        deck = [...discard];
        discard = [];
      }
      if (deck.length > 0) {
        const idx = Math.floor(Math.random() * deck.length);
        const card = deck[idx];
        hand = [...hand, card];
        deck = deck.filter((_, j) => j !== idx);
      }
    }

    return { deck, hand, discard };
  }, []);


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
      
      // Card background with gradient
      const typeColor = { 'Pulse': '#ff4444', 'Sine': '#4488ff', 'Saw': '#44ff44', 'Noise': '#ff88ff' }[card.type] || '#cccccc';
      const gradient = ctx.createLinearGradient(x, y, x, y + h);
      gradient.addColorStop(0, typeColor + '33');
      gradient.addColorStop(1, typeColor + '11');
      
      ctx.fillStyle = gradient;
      drawRoundRect(x, y, w, h, cardRadius);
      ctx.fill();
      
      // Card border
      ctx.strokeStyle = isHovered ? typeColor : typeColor + '99';
      ctx.lineWidth = isHovered ? 2 : 1;
      drawRoundRect(x, y, w, h, cardRadius);
      ctx.stroke();
      
      // Card shadow
      if (isHovered) {
        ctx.shadowColor = typeColor;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = typeColor;
        ctx.lineWidth = 1;
        drawRoundRect(x + 1, y + 1, w - 2, h - 2, cardRadius - 1);
        ctx.stroke();
        ctx.shadowColor = 'transparent';
      }
      
      // Card content
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(card.name.substring(0, 12), x + w / 2, y + h / 2 - 8);
      
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = typeColor;
      ctx.fillText(`⚡${card.cost}`, x + w / 2 - 15, y + h / 2 + 6);
      ctx.fillText(`💢${card.damage}`, x + w / 2 + 15, y + h / 2 + 6);
      
      if (card.shield > 0) {
        ctx.fillStyle = '#4488ff';
        ctx.fillText(`🛡️${card.shield}`, x + w / 2, y + h - 6);
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
    tooltipZones.current.push({ x: 15, y: 56, w: 150, h: 16, text: ['Shield: Absorbs damage', 'Resets at the start of each turn'] });
    ctx.fillText('⚡ ' + gameState.playerEnergy + '/3', 20, 86);
    tooltipZones.current.push({ x: 15, y: 74, w: 150, h: 16, text: ['Energy: Spend to play cards', 'Refills to 3 each turn'] });
    ctx.fillText('T' + gameState.turn, 20, 104);
    tooltipZones.current.push({ x: 15, y: 92, w: 150, h: 16, text: ['Turn: Current turn number'] });

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
    ctx.fillText('ST ' + gameState.playerStatic, W - 20, 68);
    tooltipZones.current.push({ x: W - 165, y: 56, w: 150, h: 16, text: ['Static: Noise interference', 'Accumulates from Noise cards', 'Deals damage to you at turn end'] });
    
    ctx.fillStyle = '#00ffc8';
    ctx.fillText('Sz: ' + gameState.hand.length, W - 20, 86);
    tooltipZones.current.push({ x: W - 165, y: 74, w: 150, h: 16, text: ['Hand Size: Cards in your hand'] });
    ctx.fillText('DIs: ' + gameState.discard.length, W - 20, 104);
    tooltipZones.current.push({ x: W - 165, y: 92, w: 150, h: 16, text: ['Discard Pile: Used cards', 'Reshuffled into deck when empty'] });

    // === ENEMIES ===
    if (gameState.enemies.length > 0) {
      const enemyCount = gameState.enemies.length;
      const spacing = W / (enemyCount + 1);
      
      gameState.enemies.forEach((enemy, idx) => {
        const enemyX = spacing * (idx + 1);
        const enemyY = 80;
        const isSelected = enemy.id === gameState.selectedEnemyId;
        
        // Enemy glow effect
        const glowSize = isSelected ? 50 : 42;
        ctx.fillStyle = isSelected ? 'rgba(255, 255, 0, 0.3)' : 'rgba(255, 0, 127, 0.15)';
        ctx.beginPath();
        ctx.arc(enemyX, enemyY, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Enemy circle with gradient
        const enemyGradient = ctx.createRadialGradient(enemyX - 8, enemyY - 8, 0, enemyX, enemyY, 30);
        enemyGradient.addColorStop(0, isSelected ? '#ffff66' : '#ff6699');
        enemyGradient.addColorStop(1, isSelected ? '#ffff00' : '#ff007f');
        ctx.fillStyle = enemyGradient;
        ctx.beginPath();
        ctx.arc(enemyX, enemyY, 28, 0, Math.PI * 2);
        ctx.fill();
        
        // Enemy border
        ctx.strokeStyle = isSelected ? '#ffff00' : '#ff00ff';
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
        ctx.fillText(enemy.name.substring(0, 12), enemyX, enemyY + 45);
      });
    }

    // === SEQUENCES DISPLAY ===
    const seqY = 130;
    drawPanel(W / 2 - 200, seqY, 400, 100, 'PATTERN');
    tooltipZones.current.push({ x: W / 2 - 200, y: seqY, w: 400, h: 20, text: ['Pattern: Match the target sequence', 'Play cards in order to fill CURRENT', 'A full match gives +12 bonus damage'] });
    
    // Target sequence
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TARGET', W / 2, seqY + 20);
    
    gameState.targetSequence.forEach((type, i) => {
      const x = W / 2 - 80 + i * 60;
      const typeColor = { 'Pulse': '#ff4444', 'Sine': '#4488ff', 'Saw': '#44ff44', 'Noise': '#ff88ff' }[type] || '#cccccc';
      
      const grad = ctx.createLinearGradient(x - 18, seqY + 25, x - 18, seqY + 55);
      grad.addColorStop(0, typeColor + '44');
      grad.addColorStop(1, typeColor + '11');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 18, seqY + 25, 36, 30);
      
      ctx.strokeStyle = typeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 18, seqY + 25, 36, 30);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(type.substring(0, 2), x, seqY + 45);
    });
    
    // Current sequence
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('CURRENT', W / 2, seqY + 75);
    
    if (gameState.currentSequence.length > 0) {
      gameState.currentSequence.forEach((type, i) => {
        const x = W / 2 - 80 + i * 60;
        const isMatch = type === gameState.targetSequence[i];
        const matchColor = isMatch ? '#44ff44' : '#ff8844';
        
        const grad = ctx.createLinearGradient(x - 18, seqY + 80, x - 18, seqY + 110);
        grad.addColorStop(0, matchColor + '44');
        grad.addColorStop(1, matchColor + '11');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 18, seqY + 80, 36, 30);
        
        ctx.strokeStyle = matchColor;
        ctx.lineWidth = isMatch ? 3 : 2;
        ctx.strokeRect(x - 18, seqY + 80, 36, 30);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(type.substring(0, 2), x, seqY + 100);
      });
    }

    // === DAMAGE PREVIEW ===
    if (gameState.playedThisTurn.length > 0) {
      const isMatch = JSON.stringify(gameState.currentSequence) === JSON.stringify(gameState.targetSequence);
      const baseDamage = gameState.playedThisTurn.reduce((sum, c) => sum + c.damage, 0);
      const matchBonus = isMatch ? 12 : 0;
      const totalDamage = baseDamage + matchBonus;
      
      const dmgGrad = ctx.createLinearGradient(W / 2 - 120, 245, W / 2 + 120, 275);
      dmgGrad.addColorStop(0, 'rgba(255, 200, 0, 0.25)');
      dmgGrad.addColorStop(0.5, 'rgba(255, 200, 0, 0.15)');
      dmgGrad.addColorStop(1, 'rgba(255, 200, 0, 0.25)');
      ctx.fillStyle = dmgGrad;
      ctx.fillRect(W / 2 - 120, 245, 240, 35);
      
      ctx.strokeStyle = '#ffc800';
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 120, 245, 240, 35);
      
      ctx.fillStyle = '#ffc800';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`DAMAGE: ${baseDamage}${isMatch ? ` +${matchBonus}` : ''}`, W / 2, 260);
      ctx.fillText(`TOTAL: ${totalDamage}`, W / 2, 275);
    }

    // === TEMPO BAR ===
    const tempoY = 295;
    const tempoW = 250;
    tooltipZones.current.push({ x: W / 2 - tempoW / 2, y: tempoY, w: tempoW, h: 28, text: ['Tempo Bar: Visual tempo gauge', 'Each card played adds 1 tempo', 'Max 6 — reaching max boosts damage'] });
    
    ctx.fillStyle = 'rgba(183, 142, 246, 0.1)';
    ctx.fillRect(W / 2 - tempoW / 2, tempoY, tempoW, 28);
    
    const tempoFill = (gameState.playerTempo / 6) * tempoW;
    const tempoGrad = ctx.createLinearGradient(W / 2 - tempoW / 2, tempoY, W / 2 - tempoW / 2 + tempoFill, tempoY + 28);
    tempoGrad.addColorStop(0, '#9966ff');
    tempoGrad.addColorStop(1, '#6b4fbb');
    ctx.fillStyle = tempoGrad;
    ctx.fillRect(W / 2 - tempoW / 2, tempoY, tempoFill, 28);
    
    ctx.strokeStyle = '#b78ef6';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - tempoW / 2, tempoY, tempoW, 28);
    
    drawOutlinedText(`TEMPO: ${gameState.playerTempo}/6`, W / 2, tempoY + 19, 'bold 12px monospace', '#ffffff', '#000000', 1);

    // === PLAYED CARDS === (fixed position)
    drawPanel(20, 335, W - 40, 100, 'PLAYED (' + gameState.playedThisTurn.length + ')');
    tooltipZones.current.push({ x: 20, y: 323, w: 120, h: 16, text: ['Played Cards: Cards used this turn', 'Click a played card to return it', 'to your hand and refund its cost'] });
    
    cardRects.current = [];
    if (gameState.playedThisTurn.length > 0) {
      const playedCardW = 65;
      const playedCardH = 80;
      const playedStartX = 40;
      const playedStartY = 350;
      const playedGapX = 75;
      
      gameState.playedThisTurn.forEach((card, i) => {
        const cardX = playedStartX + i * playedGapX;
        if (cardX + playedCardW > W - 20) return;
        
        drawCard(card, cardX, playedStartY, playedCardW, playedCardH);
        cardRects.current.push({ index: i, x: cardX, y: playedStartY, w: playedCardW, h: playedCardH, type: 'played' });
      });
    }

    // === HAND CARDS === (fixed position)
    const handPanelY = 455;
    drawPanel(20, handPanelY, W - 40, 160, 'HAND (' + gameState.hand.length + ')');
    tooltipZones.current.push({ x: 20, y: handPanelY - 12, w: 120, h: 16, text: ['Your Hand: Available cards to play', 'Click a card to play it', 'Grayed = not enough energy'] });
    
    const handCardW = 70;
    const handCardH = 90;
    const handStartX = 40;
    const handStartY = handPanelY + 15;
    const handGapX = 80;
    const cardsPerRow = Math.floor((W - 60) / handGapX);
    
    gameState.hand.forEach((card, i) => {
      const row = Math.floor(i / cardsPerRow);
      const col = i % cardsPerRow;
      const cardX = handStartX + col * handGapX;
      const cardY = handStartY + 20 + row * (handCardH + 10);
      
      if (cardY + handCardH > H - 60) return;
      
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
    tooltipZones.current.push({ x: btnX, y: btnY, w: btnW, h: btnH, text: ['End Turn: Finish your turn', 'Deals damage to selected enemy', 'Enemies then attack you'] });

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
    tooltipZones.current.push({ x: playerX - 30, y: playerY - 30, w: 60, h: 60, text: ['You: The Signal Forger', `HP: ${gameState.playerHp}/${gameState.playerMaxHp}`, `Shield: ${gameState.playerShield}`] });

    // === CARD TOOLTIPS ===
    for (const cr of cardRects.current) {
      const card = cr.type === 'hand' ? gameState.hand[cr.index] : gameState.playedThisTurn[cr.index];
      if (card) {
        tooltipZones.current.push({
          x: cr.x, y: cr.y, w: cr.w, h: cr.h,
          text: [
            card.name,
            `Type: ${card.type}`,
            `Cost: ${card.cost} Energy`,
            `Damage: ${card.damage}`,
            card.shield > 0 ? `Shield: ${card.shield}` : '',
            `Effect: ${card.effect}`,
            `Rarity: ${card.rarity}`,
          ].filter(Boolean),
        });
      }
    }

    // === ENEMY TOOLTIPS ===
    if (gameState.enemies.length > 0) {
      const enemyCount = gameState.enemies.length;
      const enemySpacing = W / (enemyCount + 1);
      gameState.enemies.forEach((enemy, idx) => {
        const ex = enemySpacing * (idx + 1);
        const ey = 80;
        tooltipZones.current.push({
          x: ex - 35, y: ey - 35, w: 70, h: 90,
          text: [
            enemy.name,
            `HP: ${enemy.hp}/${enemy.maxHp}`,
            `Intent: ${enemy.intent}`,
            `Damage: ${enemy.damage}`,
            'Click to target this enemy',
          ],
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

  // Unplay card
  const unplayCard = useCallback((cardIndex: number) => {
    setGameState(prev => {
      if (cardIndex < 0 || cardIndex >= prev.playedThisTurn.length) return prev;
      const card = prev.playedThisTurn[cardIndex];
      
      const playedThisTurn = prev.playedThisTurn.filter((_, i) => i !== cardIndex);
      const hand = [...prev.hand, card];
      const sequence = playedThisTurn.map(c => c.type);
      const playerEnergy = prev.playerEnergy + card.cost;
      const playerTempo = Math.max(prev.playerTempo - 1, 0);
      let playerStatic = prev.playerStatic;
      
      // Recalculate static
      const typeCount = playedThisTurn.filter(c => c.type === card.type).length;
      if (typeCount === 0) {
        playerStatic = Math.max(playerStatic - 1, 0);
      }
      
      const playerShield = prev.playerShield - card.shield;
      const score = prev.score - card.damage * 5;

      return {
        ...prev,
        hand,
        playedThisTurn,
        currentSequence: sequence,
        playerEnergy,
        playerTempo,
        playerStatic,
        playerShield,
        score,
      };
    });
  }, []);

  // Play card
  const playCard = useCallback((cardIndex: number) => {
    setGameState(prev => {
      if (cardIndex < 0 || cardIndex >= prev.hand.length) return prev;
      const card = prev.hand[cardIndex];
      if (card.cost > prev.playerEnergy) return prev;

      const hand = prev.hand.filter((_, i) => i !== cardIndex);
      const played = [...prev.playedThisTurn, card];
      const sequence = [...prev.currentSequence, card.type];
      const playerEnergy = prev.playerEnergy - card.cost;
      const playerTempo = Math.min(prev.playerTempo + 1, 6);
      let playerStatic = prev.playerStatic;
      const playerShield = prev.playerShield + card.shield;

      // Static: duplicate types increase static
      const typeCount = played.filter(c => c.type === card.type).length;
      if (typeCount > 1) {
        playerStatic += 1;
      }

      // Score from card played
      const score = prev.score + card.damage * 5;

      return {
        ...prev,
        hand,
        playedThisTurn: played,
        currentSequence: sequence,
        playerEnergy,
        playerTempo,
        playerStatic,
        playerShield,
        score,
      };
    });
  }, []);

  // Select target enemy
  const selectEnemy = useCallback((enemyId: number) => {
    setGameState(prev => ({
      ...prev,
      selectedEnemyId: enemyId,
    }));
  }, []);

  // End turn - resolve combat and draw new cards
  const endTurn = useCallback(() => {
    setGameState(prev => {
      if (prev.phase !== 'combat') return prev;
      
      // Calculate damage dealt to enemy (0 if no cards played)
      const isMatch = JSON.stringify(prev.currentSequence) === JSON.stringify(prev.targetSequence);
      const baseDamage = prev.playedThisTurn.reduce((sum, c) => sum + c.damage, 0);
      const matchBonus = isMatch ? 12 : 0;
      const totalDealDamage = baseDamage + matchBonus;
      
      // Damage only selected enemy
      const enemiesAfterDamage = prev.enemies.map(e => ({
        ...e,
        hp: e.id === prev.selectedEnemyId ? Math.max(0, e.hp - totalDealDamage) : e.hp,
      }));
      
      // Remove dead enemies from the list
      const enemies = enemiesAfterDamage.filter(e => e.hp > 0);
      
      const allDefeated = enemies.length === 0;
      
      // Calculate damage taken from enemy
      const damagePerEnemy = enemies.length > 0 ? 2 : 0;
      const totalTakeDamage = enemies.length * damagePerEnemy;
      const playerHp = Math.max(0, prev.playerHp - totalTakeDamage);
      const isGameOver = playerHp <= 0;

      // Generate new sequence - scale with turns
      const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
      const seqLength = Math.min(2 + Math.floor(prev.turn / 5), 3);
      const targetSequence = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);

      // Move played cards to discard, keep unplayed cards
      const discardAfterPlay = [...prev.discard, ...prev.playedThisTurn];
      
      // Draw new cards to fill hand back to 5 (keeps unplayed cards)
      const { deck: newDeck, hand: newHand, discard: newDiscard } = drawHandCards(prev.deck, discardAfterPlay, prev.hand, 5);

      const newPhase = allDefeated ? 'reward' : (isGameOver ? 'game-over' : 'combat');
      const newFloor = allDefeated ? prev.floor + 1 : prev.floor;
      
      // Update selected enemy if they died
      const newSelectedEnemyId = enemies.some(e => e.id === prev.selectedEnemyId) 
        ? prev.selectedEnemyId 
        : (enemies[0]?.id ?? prev.selectedEnemyId);

      return {
        ...prev,
        deck: newDeck,
        hand: newHand,
        discard: newDiscard,
        playedThisTurn: [],
        currentSequence: [],
        playerEnergy: 3,
        playerTempo: 0,
        playerShield: Math.max(0, prev.playerShield - 1),
        playerHp,
        turn: prev.turn + 1,
        enemies,
        phase: newPhase,
        floor: newFloor,
        gameOver: isGameOver,
        targetSequence,
        score: prev.score + (isMatch ? 50 : 0),
        selectedEnemyId: newSelectedEnemyId,
      };
    });
  }, [drawHandCards]);

  // Start game - draw initial hand
  const startGame = useCallback(() => {
    setGameState(prev => {
      const { deck, hand, discard } = drawHandCards(prev.deck, prev.discard, [], 5);
      
      // Generate initial enemies and sequence
      const enemies = generateEnemies(prev.floor);
      const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
      const targetSequence = [types[Math.floor(Math.random() * 4)], types[Math.floor(Math.random() * 4)]];
      
      return {
        ...prev,
        phase: 'combat',
        deck,
        hand,
        discard,
        enemies,
        playerEnergy: 3,
        targetSequence,
        turn: 0,
        selectedEnemyId: enemies[0]?.id ?? prev.selectedEnemyId,
      };
    });
  }, [drawHandCards]);

  // Advance to next floor
  const nextFloor = useCallback(() => {
    setGameState(prev => {
      const newFloor = prev.floor + 1;
      const newEnemies = generateEnemies(newFloor);
      
      // Generate new sequence
      const types: Array<'Pulse' | 'Sine' | 'Saw' | 'Noise'> = ['Pulse', 'Sine', 'Saw', 'Noise'];
      const seqLength = Math.min(2 + Math.floor((newFloor - 1) / 5), 3);
      const targetSequence = Array.from({ length: seqLength }, () => types[Math.floor(Math.random() * types.length)]);
      
      // Heal player 25% of max HP
      const healthGain = Math.floor(prev.playerMaxHp * 0.25);
      const newHp = Math.min(prev.playerHp + healthGain, prev.playerMaxHp);
      
      return {
        ...prev,
        floor: newFloor,
        phase: 'combat',
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
      };
    });
  }, []);

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
      />
    </div>
  );
}
