'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NeonDriftwayEngine } from '@/lib/neon-driftway/game';
import { NeonDriftwayRenderer } from '@/lib/neon-driftway/renderer';
import { SpriteSheet } from '@/lib/neon-driftway/sprites';
import { CANVAS_WIDTH, CANVAS_HEIGHT, CANVAS_DPI_SCALE, LEVELS, LEVEL_COMPLETE_DISTANCE, LEVEL_2_UNLOCK_DISTANCE, LEVEL_3_UNLOCK_DISTANCE } from '@/lib/neon-driftway/constants';
import type { InputState, LevelId, RunStats, RemoteCar } from '@/lib/neon-driftway/types';
import { NeonDriftwayUI } from './NeonDriftwayUI';
import { NeonDriftwayTouchControls } from './NeonDriftwayTouchControls';
import { NDWMultiplayerLobby } from './NDWMultiplayerLobby';
import { NDWMultiplayerClient } from '@/lib/neon-driftway/multiplayer';
import type { GameState } from '@/lib/neon-driftway/types';

const STORAGE_KEY = 'neon-driftway.unlocks';

type UIState = 'menu' | 'levelSelect' | 'playing' | 'gameOver' | 'levelComplete'
  | 'multiplayerMenu' | 'lobby' | 'multiplayerPlaying' | 'multiplayerGameOver';

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
  const sheetRef = useRef<SpriteSheet | null>(null);
  const inputRef = useRef<InputState>({
    up: false, down: false, left: false, right: false,
    boost: false, pause: false, restart: false, ability: false,
  });

  const [uiState, setUiState] = useState<UIState>('menu');
  const [unlockedLevels, setUnlockedLevels] = useState<Set<LevelId>>(new Set([1 as LevelId]));
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [currentLevel, setCurrentLevel] = useState<LevelId>(1);
  const [multiplayerRankings, setMultiplayerRankings] = useState<{ id: string; name: string; score: number; rank: number }[]>([]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const { t } = useTranslation("c-neon-driftway");

  // Multiplayer refs
  const multiplayerRoomRef = useRef<string | null>(null);
  const positionTickRef = useRef(0);
  const scoreTickRef = useRef(0);

  // Load unlocks and detect touch on mount
  useEffect(() => {
    setUnlockedLevels(loadUnlocks());
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Multiplayer event handlers
  useEffect(() => {
    const client = NDWMultiplayerClient.getInstance();

    const onPlayerUpdate = (data: { id: string; name: string; x: number; speed: number; distance: number; score: number; lane: number }) => {
      const game = gameRef.current;
      if (!game) return;
      const now = Date.now();
      const existing = game.remotePlayers.get(data.id);
      if (existing) {
        existing.prevX = existing.targetX;
        existing.targetX = data.x;
        existing.speed = data.speed;
        existing.distance = data.distance;
        existing.score = data.score;
        existing.lane = data.lane;
        existing.lastUpdate = now;
      } else {
        game.remotePlayers.set(data.id, {
          id: data.id,
          name: data.name,
          x: data.x,
          speed: data.speed,
          distance: data.distance,
          score: data.score,
          lane: data.lane,
          prevX: data.x,
          targetX: data.x,
          lastUpdate: now,
        });
      }
    };

    const onScoreUpdate = (data: { id: string; score: number; name: string }) => {
      const game = gameRef.current;
      if (!game) return;
      const remote = game.remotePlayers.get(data.id);
      if (remote) {
        remote.score = data.score;
      }
    };

    const onSlowdown = (data: { senderId: string; senderName: string; targetId: string }) => {
      const game = gameRef.current;
      const myId = client.getSocketId();
      if (!game || !myId) return;
      if (data.targetId === myId) {
        game.applySlowdown();
      }
    };

    const onPlayerDisconnected = (data: { id: string }) => {
      const game = gameRef.current;
      if (game) {
        game.remotePlayers.delete(data.id);
      }
    };

    const onGameOver = (data: { rankings: { id: string; name: string; score: number; rank: number }[] }) => {
      setMultiplayerRankings(data.rankings);
      setUiState('multiplayerGameOver');
    };

    client.on('ndw:playerUpdate', onPlayerUpdate);
    client.on('ndw:scoreUpdate', onScoreUpdate);
    client.on('ndw:slowdownApplied', onSlowdown);
    client.on('ndw:playerDisconnected', onPlayerDisconnected);
    client.on('ndw:gameOver', onGameOver);

    return () => {
      client.off('ndw:playerUpdate', onPlayerUpdate);
      client.off('ndw:scoreUpdate', onScoreUpdate);
      client.off('ndw:slowdownApplied', onSlowdown);
      client.off('ndw:playerDisconnected', onPlayerDisconnected);
      client.off('ndw:gameOver', onGameOver);
    };
  }, []);

  // Input handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      // Ignore when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const input = inputRef.current;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': input.up = down; break;
        case 'KeyS': case 'ArrowDown': input.down = down; break;
        case 'KeyA': case 'ArrowLeft': input.left = down; break;
        case 'KeyD': case 'ArrowRight': input.right = down; break;
        case 'ShiftLeft': case 'ShiftRight': input.boost = down; break;
        case 'Escape': input.pause = down; break;
        case 'KeyR': input.restart = down; break;
        case 'KeyE': input.ability = down; break;
      }

      // Ability activation (edge-detect on keydown)
      if (down && e.code === 'KeyE' && gameRef.current?.isMultiplayer) {
        const game = gameRef.current;
        if (game.car.abilityCharges > 0 && multiplayerRoomRef.current) {
          game.car.abilityCharges--;
          NDWMultiplayerClient.getInstance().sendAbilityUsed(multiplayerRoomRef.current);
        }
      }

      if (down && (e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        e.preventDefault();
      }
    };

    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    const blur = () => {
      const input = inputRef.current;
      input.up = input.down = input.left = input.right = input.boost = input.pause = input.restart = input.ability = false;
      // Auto-pause on blur (single-player only)
      if (gameRef.current?.state === 'playing' && !gameRef.current.isMultiplayer) {
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

    // Set up DPI scaling for smoother rendering (CSS handles display size)
    const dpr = CANVAS_DPI_SCALE;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    if (!gameRef.current) {
      gameRef.current = new NeonDriftwayEngine();
    }
    if (!sheetRef.current) {
      sheetRef.current = new SpriteSheet('/neon-driftway-sprites/2D_TOPDOWN_PIXELART_CARS.png');
    }
    if (!rendererRef.current) {
      rendererRef.current = new NeonDriftwayRenderer(ctx, sheetRef.current);
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

        // Multiplayer broadcasting
        if (game.isMultiplayer && s === 'playing' && multiplayerRoomRef.current) {
          const client = NDWMultiplayerClient.getInstance();
          const roomId = multiplayerRoomRef.current;

          // Position broadcast at 10Hz
          positionTickRef.current += dt;
          if (positionTickRef.current >= 0.1) {
            positionTickRef.current = 0;
            client.sendPlayerUpdate(roomId, {
              x: game.car.x,
              speed: game.car.speed,
              distance: game.distance,
              score: game.score,
              lane: 0,
            });
          }

          // Score broadcast at 2Hz
          scoreTickRef.current += dt;
          if (scoreTickRef.current >= 0.5) {
            scoreTickRef.current = 0;
            client.sendScoreUpdate(roomId, game.score);
          }
        }

        // game.update() may have transitioned state
        const newState = game.state as string;
        if (newState === 'gameOver' || newState === 'levelComplete') {
          const stats = game.getRunStats();
          setRunStats(stats);

          if (game.isMultiplayer) {
            // In multiplayer, send finished event
            if (multiplayerRoomRef.current) {
              NDWMultiplayerClient.getInstance().sendPlayerFinished(multiplayerRoomRef.current, stats.score);
            }
            setUiState('multiplayerGameOver');
          } else {
            setUiState(newState as 'gameOver' | 'levelComplete');
          }

          // Check unlocks (single-player only)
          if (!game.isMultiplayer) {
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
              // Distance-based unlock for gameOver
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
    game.isMultiplayer = false;
    game.startLevel(levelId);
    setCurrentLevel(levelId);
    setRunStats(null);
    setUiState('playing');
  }, []);

  const handleResume = useCallback(() => {
    gameRef.current?.resume();
  }, []);

  const handleTouchPause = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    if (game.state === 'playing') {
      game.state = 'paused' as GameState;
    } else if (game.state === 'paused') {
      game.resume();
    }
  }, []);

  const handleCanvasTouch = useCallback(() => {
    const game = gameRef.current;
    if (game?.state === 'paused') game.resume();
  }, []);

  const handleContinueEndless = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.continueEndless();
    setUiState('playing');
  }, []);

  const handleGoToMultiplayer = useCallback(() => {
    setUiState('multiplayerMenu');
  }, []);

  const handleMultiplayerGameStart = useCallback((roomId: string, levelId: LevelId) => {
    const game = gameRef.current;
    if (!game) return;
    multiplayerRoomRef.current = roomId;
    positionTickRef.current = 0;
    scoreTickRef.current = 0;
    game.isMultiplayer = true;
    game.remotePlayers.clear();
    game.startLevel(levelId);
    setCurrentLevel(levelId);
    setRunStats(null);
    setUiState('multiplayerPlaying');
  }, []);

  const handleBackFromMultiplayer = useCallback(() => {
    multiplayerRoomRef.current = null;
    setUiState('menu');
  }, []);

  const showTouchControls = isTouchDevice && (
    uiState === 'playing' || uiState === 'multiplayerPlaying'
  );

  return (
    <div
      className="w-full h-full relative bg-black flex flex-col items-center justify-center overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="border border-cyan-500/30 sm:border-2 sm:border-cyan-500/50"
        onTouchEnd={handleCanvasTouch}
        style={{
          width: '100%',
          maxWidth: `${CANVAS_WIDTH}px`,
          maxHeight: '100%',
          aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`,
          touchAction: 'none',
        }}
      />

      {/* Mobile touch controls */}
      <NeonDriftwayTouchControls
        inputRef={inputRef}
        onPause={handleTouchPause}
        visible={showTouchControls}
      />

      {/* Multiplayer lobby overlay */}
      {(uiState === 'multiplayerMenu' || uiState === 'lobby') && (
        <NDWMultiplayerLobby
          onBack={handleBackFromMultiplayer}
          onGameStart={handleMultiplayerGameStart}
        />
      )}

      {/* Multiplayer game over overlay */}
      {uiState === 'multiplayerGameOver' && (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full px-4 space-y-4">
            <h2 className="text-4xl font-black text-cyan-400 text-center tracking-tight">{t("race-over", { defaultValue: "RACE OVER" })}</h2>

            {runStats && (
              <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-5 space-y-3">
                <div className="text-center">
                  <div className="text-xs text-zinc-400 uppercase tracking-wider">{t("your-score", { defaultValue: "Your Score" })}</div>
                  <div className="text-3xl font-black text-cyan-400 tabular-nums">
                    {runStats.score.toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {multiplayerRankings.length > 0 && (
              <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-4 space-y-2">
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">{t("final-rankings", { defaultValue: "Final Rankings" })}</div>
                {multiplayerRankings.map((r) => {
                  const myId = NDWMultiplayerClient.getInstance().getSocketId();
                  const isSelf = r.id === myId;
                  return (
                    <div key={r.id} className={`flex items-center justify-between p-2 rounded ${isSelf ? 'bg-cyan-500/20 border border-cyan-500/40' : 'bg-zinc-800/50'
                      }`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black ${r.rank === 1 ? 'text-yellow-400' : 'text-zinc-400'}`}>
                          #{r.rank}
                        </span>
                        <span className={`font-bold text-sm ${isSelf ? 'text-cyan-400' : 'text-white'}`}>
                          {r.name} {isSelf ? t("you-label", { defaultValue: "(You)" }) : ''}
                        </span>
                      </div>
                      <span className="font-bold text-cyan-300 tabular-nums">{r.score.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setUiState('menu')}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                {t("main-menu", { defaultValue: "Main Menu" })}
              </button>
              <button
                onClick={() => setUiState('multiplayerMenu')}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                {t("play-again", { defaultValue: "Play Again" })}
              </button>
            </div>
          </div>
        </div>
      )}

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
        onGoToMultiplayer={handleGoToMultiplayer}
        multiplayerRankings={multiplayerRankings}
      />
    </div>
  );
}
