/**
 * SignalForgeGame.tsx — Signal Forge main component (slim orchestrator)
 * ─────────────────────────────────────────────────────────────────────
 * This component owns the GameState, wires up the canvas renderer,
 * handles mouse/keyboard input, and delegates all game logic to pure
 * state-transform functions in lib/signal-forge/*.
 *
 * All heavy logic (combat resolution, card actions, game flow, etc.)
 * lives in dedicated modules — this file is purely orchestration.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SignalForgeUI } from '@/components/signal-forge/SignalForgeUI';
import { createEnemies } from '@/lib/signal-forge';
import type { Card, RelicTemplate } from '@/lib/signal-forge';
import type { GameState } from '@/lib/signal-forge/GameTypes';
import { createFreshGameState } from '@/lib/signal-forge/GameTypes';
import { computePlayCard, computeUnplayCard } from '@/lib/signal-forge/cardActions';
import { computeEndTurn } from '@/lib/signal-forge/endTurn';
import {
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
} from '@/lib/signal-forge/gameFlow';
import { computeResolveEventChoice } from '@/lib/signal-forge/eventResolution';
import {
  saveRunToServer,
  clearSavedRunOnServer,
  loadSavedRunFromServer,
  checkSavedRunOnServer,
} from '@/lib/signal-forge/persistence';
import { renderCanvas, type RenderOutput } from '@/components/signal-forge/canvas/renderCanvas';

// ─── Component ───────────────────────────────────────────────────────

export function SignalForgeGame() {
  /* ── Refs ── */
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRects = useRef<RenderOutput['cardRects']>([]);
  const endTurnRect = useRef<RenderOutput['endTurnRect']>(null);
  const hamburgerRect = useRef<RenderOutput['hamburgerRect']>(null);
  const tooltipZones = useRef<RenderOutput['tooltipZones']>([]);
  const mousePos = useRef<{ x: number; y: number } | null>(null);
  const tooltipRaf = useRef<number>(0);

  /* ── UI state ── */
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [tooltipTick, setTooltipTick] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 755 });
  const [hasSavedRun, setHasSavedRun] = useState(false);

  /* ── Game state ── */
  const initialEnemies = createEnemies(1);
  const [gameState, setGameState] = useState<GameState>(() =>
    createFreshGameState(initialEnemies),
  );

  // ── Resize observer ──
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

  // ── Canvas rendering ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvasSize.w;
    canvas.height = canvasSize.h;

    const out: RenderOutput = {
      tooltipZones: [],
      cardRects: [],
      endTurnRect: null,
      hamburgerRect: null,
    };

    renderCanvas(canvas, ctx, gameState, canvasSize, mousePos.current, out);

    tooltipZones.current = out.tooltipZones;
    cardRects.current = out.cardRects;
    endTurnRect.current = out.endTurnRect;
    hamburgerRect.current = out.hamburgerRect;
  }, [gameState, canvasSize, tooltipTick]);

  // ── Game logic callbacks (thin wrappers around pure functions) ──

  const playCard = useCallback((cardIndex: number) => {
    setGameState(prev => computePlayCard(prev, cardIndex));
  }, []);

  const unplayCard = useCallback((cardIndex: number) => {
    setGameState(prev => computeUnplayCard(prev, cardIndex));
  }, []);

  const endTurn = useCallback(() => {
    setGameState(prev => computeEndTurn(prev));
  }, []);

  const selectEnemy = useCallback((enemyId: number) => {
    setGameState(prev => ({ ...prev, selectedEnemyId: enemyId }));
  }, []);

  const startGame = useCallback(() => {
    clearSavedRunOnServer();
    setGameState(prev => computeStartGame(prev));
  }, []);

  const selectStarterRelic = useCallback((relic: RelicTemplate) => {
    setGameState(prev => computeSelectStarterRelic(prev, relic));
  }, []);

  const nextFloor = useCallback(() => {
    setGameState(prev => computeNextFloor(prev));
  }, []);

  const buyItem = useCallback((itemId: string) => {
    setGameState(prev => computeBuyItem(prev, itemId));
  }, []);

  const upgradeCard = useCallback((cardId: number) => {
    setGameState(prev => computeUpgradeCard(prev, cardId));
  }, []);

  const removeCard = useCallback((cardId: number) => {
    setGameState(prev => computeRemoveCard(prev, cardId));
  }, []);

  const proceedFromShop = useCallback(() => {
    setGameState(prev => computeProceedFromShop(prev));
  }, []);

  const selectCardReward = useCallback((card: Card) => {
    setGameState(prev => computeSelectCardReward(prev, card));
  }, []);

  const skipCardReward = useCallback(() => {
    setGameState(prev => computeSkipCardReward(prev));
  }, []);

  const toggleMulliganCard = useCallback((index: number) => {
    setGameState(prev => computeToggleMulligan(prev, index));
  }, []);

  const confirmMulligan = useCallback(() => {
    setGameState(prev => computeConfirmMulligan(prev));
  }, []);

  const skipMulligan = useCallback(() => {
    setGameState(prev => computeSkipMulligan(prev));
  }, []);

  const activateOverwriterPen = useCallback((handIndex: number) => {
    setGameState(prev => computeActivateOverwriterPen(prev, handIndex));
  }, []);

  const cancelOverwriterPen = useCallback(() => {
    setGameState(prev => computeCancelOverwriterPen(prev));
  }, []);

  const confirmOverwriterPen = useCallback((newCardKey: string) => {
    setGameState(prev => computeConfirmOverwriterPen(prev, newCardKey));
  }, []);

  const refreshShop = useCallback(() => {
    setGameState(prev => computeRefreshShop(prev));
  }, []);

  const resolveEventChoice = useCallback((choiceIndex: number) => {
    setGameState(prev => computeResolveEventChoice(prev, choiceIndex));
  }, []);

  const chooseRest = useCallback(() => {
    setGameState(prev => computeChooseRest(prev));
  }, []);

  const chooseShop = useCallback(() => {
    setGameState(prev => computeChooseShop(prev));
  }, []);

  const toggleViewPile = useCallback((pile: 'deck' | 'discard' | null) => {
    setGameState(prev => computeToggleViewPile(prev, pile));
  }, []);

  const cycleSortMode = useCallback(() => {
    setGameState(prev => computeCycleSortMode(prev));
  }, []);

  const returnToLanding = useCallback(() => {
    const freshEnemies = createEnemies(1);
    setGameState(createFreshGameState(freshEnemies));
  }, []);

  // ── Server-side persistence ──

  const clearSavedRun = useCallback(async () => {
    const ok = await clearSavedRunOnServer();
    if (ok) setHasSavedRun(false);
  }, []);

  const loadSavedRun = useCallback(async () => {
    const restored = await loadSavedRunFromServer();
    if (restored) {
      setGameState(restored);
      setHasSavedRun(true);
    }
  }, []);

  const abandonRun = useCallback(async () => {
    await clearSavedRun();
    const freshEnemies = createEnemies(1);
    setGameState(createFreshGameState(freshEnemies));
  }, [clearSavedRun]);

  // Check for saved run on mount
  useEffect(() => {
    checkSavedRunOnServer().then(has => { if (has) setHasSavedRun(true); });
  }, []);

  // ── Auto-save on phase/turn transitions ──

  const prevPhaseRef = useRef(gameState.phase);
  const prevTurnRef = useRef(gameState.turn);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = gameState.phase;
    const prevTurn = prevTurnRef.current;
    prevTurnRef.current = gameState.turn;

    if (gameState.phase === 'game-over' && prevPhase !== 'game-over') {
      clearSavedRunOnServer().then(ok => { if (ok) setHasSavedRun(false); });
      return;
    }
    if (gameState.phase !== prevPhase && gameState.phase !== 'landing' && gameState.phase !== 'game-over') {
      saveRunToServer(gameState).then(ok => { if (ok) setHasSavedRun(true); });
    }
    if (gameState.phase === 'combat' && gameState.turn > prevTurn) {
      saveRunToServer(gameState).then(ok => { if (ok) setHasSavedRun(true); });
    }
  }, [gameState.phase, gameState.turn, gameState]);

  // ── Keyboard shortcuts ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (gameState.phase !== 'combat') return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < gameState.hand.length) playCard(idx);
      }
      if (e.key === 'q' || e.key === 'Q') endTurn();
      if (e.key === 's' || e.key === 'S') cycleSortMode();
      if (e.key === 'd' || e.key === 'D') toggleViewPile('deck');
      if (e.key === 'f' || e.key === 'F') toggleViewPile('discard');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameState.phase, gameState.hand.length, playCard, endTurn, cycleSortMode, toggleViewPile]);

  // ── Mouse helpers ──

  const toCanvasCoords = (e: React.MouseEvent) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasSize.w / rect.width),
      y: (e.clientY - rect.top) * (canvasSize.h / rect.height),
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    mousePos.current = toCanvasCoords(e);
    if (!tooltipRaf.current) {
      tooltipRaf.current = requestAnimationFrame(() => {
        tooltipRaf.current = 0;
        setTooltipTick(t => t + 1);
      });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    const pos = toCanvasCoords(e);
    if (!pos) return;
    const { x, y } = pos;

    // Hamburger menu
    if (hamburgerRect.current) {
      const h = hamburgerRect.current;
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        setShowPauseMenu(true);
        return;
      }
    }

    // End turn button
    if (endTurnRect.current) {
      const btn = endTurnRect.current;
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        endTurn();
        return;
      }
    }

    // Hand cards
    for (const cr of cardRects.current) {
      if (cr.type === 'hand' && x >= cr.x && x <= cr.x + cr.w && y >= cr.y && y <= cr.y + cr.h) {
        if (gameState.mulliganAvailable) { toggleMulliganCard(cr.index); } else { playCard(cr.index); }
        return;
      }
    }

    // Played cards (unplay)
    for (const cr of cardRects.current) {
      if (cr.type === 'played' && x >= cr.x && x <= cr.x + cr.w && y >= cr.y && y <= cr.y + cr.h) {
        unplayCard(cr.index);
        return;
      }
    }

    // Enemy click
    const spacing = canvasSize.w / (gameState.enemies.length + 1);
    gameState.enemies.forEach((enemy, idx) => {
      const ex = spacing * (idx + 1);
      if (Math.sqrt((x - ex) ** 2 + (y - 80) ** 2) < 50) selectEnemy(enemy.id);
    });
  };

  // ── JSX ──

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="border-2 border-cyan-500 cursor-pointer rounded-lg w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { mousePos.current = null; setTooltipTick(t => t + 1); }}
        onClick={handleCanvasClick}
      />

      <div className="absolute inset-0 z-40 pointer-events-none *:pointer-events-auto">
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
    </div>
  );
}
