'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { NeonDriftwayEngine } from '@/lib/neon-driftway/game';
import { NeonDriftwayRenderer } from '@/lib/neon-driftway/renderer';
import { CANVAS_WIDTH, CANVAS_HEIGHT, CANVAS_DPI_SCALE, LEVELS, LEVEL_COMPLETE_DISTANCE, LEVEL_2_UNLOCK_DISTANCE, LEVEL_3_UNLOCK_DISTANCE } from '@/lib/neon-driftway/constants';
import type { InputState, LevelId, RunStats } from '@/lib/neon-driftway/types';
import { NeonDriftwayUI } from './NeonDriftwayUI';

const STORAGE_KEY = 'neon-driftway.unlocks';

function loadUnlocks(): Set<LevelId> {
  const set = new Set<LevelId>([1 as LevelId]);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as number[];
      for (const n of arr) if (n === 2 || n === 3) set.add(n as LevelId);
    }
  } catch { /* ignore */ }
  return set;
}

function saveUnlocks(unlocks: Set<LevelId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocks]));
  } catch { /* ignore */ }
}

export function NeonDriftwayGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NeonDriftwayEngine | null>(null);
  const rendererRef = useRef<NeonDriftwayRenderer | null>(null);
  const inputRef = useRef<InputState>({
    up: false, down: false, left: false, right: false,
    boost: false, pause: false, restart: false,
  });

  const [uiState, setUiState] = useState<'menu' | 'levelSelect' | 'playing' | 'gameOver' | 'levelComplete'>('menu');
  const [unlockedLevels, setUnlockedLevels] = useState<Set<LevelId>>(new Set([1 as LevelId]));
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [currentLevel, setCurrentLevel] = useState<LevelId>(1);

  // Load unlocks on mount
  useEffect(() => {
    setUnlockedLevels(loadUnlocks());
  }, []);

  // Input handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      // Ignore when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const input = inputRef.current;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    input.up = down; break;
        case 'KeyS': case 'ArrowDown':  input.down = down; break;
        case 'KeyA': case 'ArrowLeft':  input.left = down; break;
        case 'KeyD': case 'ArrowRight': input.right = down; break;
        case 'ShiftLeft': case 'ShiftRight': input.boost = down; break;
        case 'Escape': input.pause = down; break;
        case 'KeyR': input.restart = down; break;
      }

      if (down && (e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        e.preventDefault();
      }
    };

    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    const blur = () => {
      const input = inputRef.current;
      input.up = input.down = input.left = input.right = input.boost = input.pause = input.restart = false;
      // Auto-pause on blur
      if (gameRef.current?.state === 'playing') {
        gameRef.current.state = 'paused';
      }
    };

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up DPI scaling for smoother rendering
    const dpr = CANVAS_DPI_SCALE;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    if (!gameRef.current) {
      gameRef.current = new NeonDriftwayEngine();
    }
    if (!rendererRef.current) {
      rendererRef.current = new NeonDriftwayRenderer(ctx);
    }

    let lastTime = 0;
    let rafId: number;

    const loop = (timestamp: number) => {
      const dt = lastTime ? (timestamp - lastTime) / 1000 : 0;
      lastTime = timestamp;

      const game = gameRef.current!;
      const renderer = rendererRef.current!;

      const s = game.state;
      if (s === 'playing' || s === 'paused' || s === 'countdown') {
        game.update(dt, inputRef.current);
        renderer.draw(game);

        // game.update() may have transitioned state
        const newState = game.state as string;
        if (newState === 'gameOver' || newState === 'levelComplete') {
          const stats = game.getRunStats();
          setRunStats(stats);
          setUiState(newState as 'gameOver' | 'levelComplete');

          // Check unlocks
          const newUnlocks = new Set(unlockedLevels);
          let changed = false;

          if (newState === 'levelComplete') {
            // Immediate unlock on level completion
            if (stats.level === 1 && !newUnlocks.has(2 as LevelId)) {
              newUnlocks.add(2 as LevelId);
              changed = true;
            }
            if (stats.level === 2 && !newUnlocks.has(3 as LevelId)) {
              newUnlocks.add(3 as LevelId);
              changed = true;
            }
          } else {
            // Distance-based unlock for gameOver (redundant now but kept for safety)
            if (stats.level === 1 && stats.distance >= LEVEL_2_UNLOCK_DISTANCE && !newUnlocks.has(2 as LevelId)) {
              newUnlocks.add(2 as LevelId);
              changed = true;
            }
            if (stats.level === 2 && stats.distance >= LEVEL_3_UNLOCK_DISTANCE && !newUnlocks.has(3 as LevelId)) {
              newUnlocks.add(3 as LevelId);
              changed = true;
            }
          }

          if (changed) {
            setUnlockedLevels(newUnlocks);
            saveUnlocks(newUnlocks);
          }
        }
      } else {
        // Draw idle background
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [unlockedLevels]);

  const handleStartLevel = useCallback((levelId: LevelId) => {
    const game = gameRef.current;
    if (!game) return;
    game.startLevel(levelId);
    setCurrentLevel(levelId);
    setRunStats(null);
    setUiState('playing');
  }, []);

  const handleResume = useCallback(() => {
    gameRef.current?.resume();
  }, []);

  const handleContinueEndless = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.continueEndless();
    setUiState('playing');
  }, []);

  return (
    <div className="w-full h-full relative bg-black flex flex-col items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        className="border-2 border-cyan-500/50 max-w-full max-h-full"
        style={{ imageRendering: 'auto', aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
      />

      <NeonDriftwayUI
        uiState={uiState}
        unlockedLevels={unlockedLevels}
        runStats={runStats}
        currentLevel={currentLevel}
        onGoToMenu={() => setUiState('menu')}
        onGoToLevelSelect={() => setUiState('levelSelect')}
        onStartLevel={handleStartLevel}
        onResume={handleResume}
        onContinueEndless={handleContinueEndless}
      />
    </div>
  );
}
