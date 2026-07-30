'use client';

/**
 * Neon Driftway — first-person 3D racer with device-gyro head look.
 *
 * This component owns the browser side of the game: the WebGL canvas and its
 * sizing, the single rAF loop, input, the gyro tracker's lifecycle, and the
 * VR toggles. The simulation lives in `lib/neon-driftway/game`, the drawing in
 * `lib/neon-driftway/renderer3d`, and neither knows this file exists.
 *
 * Three display modes, picked automatically then overridable by the player:
 *
 *  - **Static** — no usable motion sensor (most desktops). The camera is
 *    locked forward with a small lean into the steering. Fully playable.
 *  - **Head look** — the gyro drives the camera in real time, so you can
 *    check your mirrors and look into a bend while you drive.
 *  - **Viewer** — head look plus side-by-side stereo for a Cardboard-style
 *    phone holder, with throttle held open and screen-half steering.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NeonDriftwayEngine } from '@/lib/neon-driftway/game';
import { NeonDriftwayRenderer3D } from '@/lib/neon-driftway/renderer3d';
import {
  GyroTracker, gyroPermissionGateExists, hasStoredMotionConsent,
  type GyroStatus,
} from '@/lib/neon-driftway/gyro';
import {
  LEVELS, LEVEL_2_UNLOCK_DISTANCE, LEVEL_3_UNLOCK_DISTANCE, MPS_PER_UNIT,
} from '@/lib/neon-driftway/constants';
import type { GameState, InputState, LevelId, RunStats } from '@/lib/neon-driftway/types';
import { isLowPowerDevice, requestScreenWakeLock, supportsWebGL, toggleFullscreen } from '@/lib/shared/platform';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { NeonDriftwayUI } from './NeonDriftwayUI';
import { NeonDriftwayTouchControls } from './NeonDriftwayTouchControls';
import { NeonDriftwayHud, type HudHandle } from './NeonDriftwayHud';
import { NDWMultiplayerLobby } from './NDWMultiplayerLobby';
import { NDWMultiplayerClient } from '@/lib/neon-driftway/multiplayer';

const STORAGE_KEY = 'neon-driftway.unlocks';
const VR_KEY = 'neon-driftway.vr';

type UIState = 'menu' | 'levelSelect' | 'playing' | 'gameOver' | 'levelComplete'
  | 'multiplayerMenu' | 'lobby' | 'multiplayerPlaying' | 'multiplayerGameOver';

export interface VrPrefs {
  /** Gyro drives the camera. */
  headLook: boolean;
  /** Side-by-side stereo for a phone viewer. Implies headLook. */
  stereo: boolean;
}

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

function loadVrPrefs(): VrPrefs {
  try {
    const raw = localStorage.getItem(VR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VrPrefs>;
      return { headLook: parsed.headLook === true, stereo: parsed.stereo === true };
    }
  } catch { /* ignore */ }
  return { headLook: false, stereo: false };
}

function saveVrPrefs(prefs: VrPrefs): void {
  try {
    localStorage.setItem(VR_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

/** Best guess at whether this device is worth offering head look to at all. */
function motionPlausible(): boolean {
  if (typeof window === 'undefined') return false;
  if (gyroPermissionGateExists()) return true;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && 'DeviceOrientationEvent' in window;
}

export function NeonDriftwayGame() {
  const { t } = useTranslation('c-neon-driftway');
  const reducedMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NeonDriftwayEngine | null>(null);
  const rendererRef = useRef<NeonDriftwayRenderer3D | null>(null);
  const hudRef = useRef<HudHandle>(null);
  const trackerRef = useRef<GyroTracker | null>(null);
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
  const [webglReady, setWebglReady] = useState(true);
  const [rendererEpoch, setRendererEpoch] = useState(0);
  const [vr, setVr] = useState<VrPrefs>({ headLook: false, stereo: false });
  const [gyroStatus, setGyroStatus] = useState<GyroStatus>('unavailable');
  const [canOfferHeadLook, setCanOfferHeadLook] = useState(false);

  // Values the frame loop reads. Kept in refs so the loop is created once.
  const unlocksRef = useRef(unlockedLevels);
  const stereoRef = useRef(false);
  const multiplayerRoomRef = useRef<string | null>(null);
  const positionTickRef = useRef(0);
  const scoreTickRef = useRef(0);

  unlocksRef.current = unlockedLevels;
  stereoRef.current = vr.stereo;

  // ── Mount: capabilities, saved state, gyro tracker ──

  useEffect(() => {
    setUnlockedLevels(loadUnlocks());
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    setWebglReady(supportsWebGL());
    setCanOfferHeadLook(motionPlausible());

    const tracker = new GyroTracker();
    tracker.onStatusChange = setGyroStatus;
    trackerRef.current = tracker;

    // Only auto-start where the browser will not prompt: either there is no
    // permission gate, or the player already granted motion site-wide.
    const prefs = loadVrPrefs();
    if (prefs.headLook && (!gyroPermissionGateExists() || hasStoredMotionConsent())) {
      tracker.start();
      setVr(prefs);
    } else if (prefs.headLook) {
      // Gated and not yet granted — remember the intent, ask on the next tap.
      setVr({ headLook: false, stereo: false });
    }

    return () => {
      tracker.onStatusChange = null;
      tracker.stop();
      trackerRef.current = null;
    };
  }, []);

  // Head look silently falling back (sensor never reported in) should not
  // leave the player stuck in a stereo view they cannot steer out of.
  useEffect(() => {
    if (vr.stereo && (gyroStatus === 'unavailable' || gyroStatus === 'denied')) {
      setVr({ headLook: false, stereo: false });
      saveVrPrefs({ headLook: false, stereo: false });
    }
  }, [gyroStatus, vr.stereo]);

  // ── Renderer lifecycle ──

  useEffect(() => {
    if (!webglReady) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (!gameRef.current) {
      gameRef.current = new NeonDriftwayEngine();
      // Give the engine a car and a level up front so the menu has a scene to
      // sit in front of; `state` stays 'menu' until the player starts a run.
      gameRef.current.startLevel(1);
      gameRef.current.state = 'menu';
    }

    let renderer: NeonDriftwayRenderer3D;
    try {
      renderer = new NeonDriftwayRenderer3D(canvas, {
        bloom: !isLowPowerDevice() && !reducedMotion,
        reducedMotion,
        maxPixelRatio: isLowPowerDevice() ? 1.5 : 2,
      });
    } catch {
      setWebglReady(false);
      return;
    }
    rendererRef.current = renderer;
    renderer.setLevel(LEVELS[gameRef.current.levelId]);
    renderer.setStereo(stereoRef.current);

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      // A hidden or zero-size container would otherwise poison the projection.
      if (rect.width < 2 || rect.height < 2) return;
      renderer.setSize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    applySize();

    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    // Orientation changes land after a beat on iOS; re-measure when they do.
    window.addEventListener('orientationchange', applySize);

    // A lost context is recoverable — rebuild the renderer from scratch, which
    // re-creates every GPU resource because the scene lives inside it.
    const onLost = (event: Event) => {
      event.preventDefault();
      const game = gameRef.current;
      if (game && game.state === 'playing') game.state = 'paused' as GameState;
    };
    const onRestored = () => setRendererEpoch((n) => n + 1);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', applySize);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      rendererRef.current = null;
      renderer.dispose();
    };
  }, [webglReady, reducedMotion, rendererEpoch]);

  useEffect(() => {
    rendererRef.current?.setStereo(vr.stereo);
    // Viewer mode holds the throttle open; leaving it must hand control back
    // rather than stranding the player at full speed.
    if (!vr.stereo) inputRef.current.up = false;
  }, [vr.stereo]);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  // ── Multiplayer event handlers ──

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
        existing.prevDistance = existing.targetDistance;
        existing.targetDistance = data.distance;
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
          prevDistance: data.distance,
          targetDistance: data.distance,
          lastUpdate: now,
        });
      }
    };

    const onScoreUpdate = (data: { id: string; score: number; name: string }) => {
      const remote = gameRef.current?.remotePlayers.get(data.id);
      if (remote) remote.score = data.score;
    };

    const onSlowdown = (data: { senderId: string; senderName: string; targetId: string }) => {
      const game = gameRef.current;
      const myId = client.getSocketId();
      if (!game || !myId) return;
      if (data.targetId === myId) game.applySlowdown();
    };

    const onPlayerDisconnected = (data: { id: string }) => {
      gameRef.current?.remotePlayers.delete(data.id);
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

  // ── Keyboard ──

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
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

      if (down && e.code === 'KeyC') rendererRef.current?.recenterView();

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
      if (gameRef.current?.state === 'playing' && !gameRef.current.isMultiplayer) {
        gameRef.current.state = 'paused' as GameState;
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

  // ── Keep the screen on while driving ──

  useEffect(() => {
    if (uiState !== 'playing' && uiState !== 'multiplayerPlaying') return;
    return requestScreenWakeLock();
  }, [uiState]);

  // ── Frame loop ──

  useEffect(() => {
    if (!webglReady) return;
    let lastTime = 0;
    let rafId = 0;

    const loop = (timestamp: number) => {
      rafId = requestAnimationFrame(loop);

      const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 0;
      lastTime = timestamp;

      const game = gameRef.current;
      const renderer = rendererRef.current;
      if (!game || !renderer) return;

      const sample = trackerRef.current?.sample ?? null;
      const state = game.state;
      const live = state === 'playing' || state === 'paused' || state === 'countdown';

      if (live) {
        // In a viewer there is no reachable throttle, so hold it open.
        if (stereoRef.current && state === 'playing') inputRef.current.up = true;

        game.update(dt, inputRef.current);
        renderer.draw(game, dt, sample);
        hudRef.current?.sync(game, {
          multiplayer: game.isMultiplayer,
          selfLabel: t('you-label-short', { defaultValue: 'You' }),
        });

        if (game.isMultiplayer && state === 'playing' && multiplayerRoomRef.current) {
          const client = NDWMultiplayerClient.getInstance();
          const roomId = multiplayerRoomRef.current;

          // Position broadcast at 10Hz. `x` is now metres from the centre line.
          positionTickRef.current += dt;
          if (positionTickRef.current >= 0.1) {
            positionTickRef.current = 0;
            client.sendPlayerUpdate(roomId, {
              x: game.car.x,
              speed: game.car.speed,
              distance: game.distance,
              score: game.score,
              lane: game.currentLane,
            });
          }

          // Score broadcast at 2Hz
          scoreTickRef.current += dt;
          if (scoreTickRef.current >= 0.5) {
            scoreTickRef.current = 0;
            client.sendScoreUpdate(roomId, game.score);
          }
        }

        const newState = game.state as string;
        if (newState === 'gameOver' || newState === 'levelComplete') {
          const stats = game.getRunStats();
          setRunStats(stats);

          if (game.isMultiplayer) {
            if (multiplayerRoomRef.current) {
              NDWMultiplayerClient.getInstance().sendPlayerFinished(multiplayerRoomRef.current, stats.score);
            }
            setUiState('multiplayerGameOver');
          } else {
            setUiState(newState as 'gameOver' | 'levelComplete');

            const newUnlocks = new Set(unlocksRef.current);
            let changed = false;

            if (newState === 'levelComplete') {
              if (stats.level === 1 && !newUnlocks.has(2 as LevelId)) {
                newUnlocks.add(2 as LevelId);
                changed = true;
              }
              if (stats.level === 2 && !newUnlocks.has(3 as LevelId)) {
                newUnlocks.add(3 as LevelId);
                changed = true;
              }
            } else {
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
        // Menus sit in front of a slow idle cruise rather than a black screen.
        // Traffic from the finished run is cleared so the road behind the menu
        // does not stream past a wall of frozen cars.
        for (const obstacle of game.obstacles) obstacle.active = false;
        game.car.speed = 240;
        game.worldZ += game.car.speed * MPS_PER_UNIT * dt;
        renderer.draw(game, dt, sample);
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [webglReady, t]);

  // ── VR controls ──

  const setVrPrefs = useCallback((next: VrPrefs) => {
    setVr(next);
    saveVrPrefs(next);
  }, []);

  const handleToggleHeadLook = useCallback(async () => {
    const tracker = trackerRef.current;
    if (!tracker) return;

    if (vr.headLook) {
      tracker.stop();
      setVrPrefs({ headLook: false, stereo: false });
      return;
    }

    // This runs inside the toggle's click, which is the gesture iOS requires.
    const granted = await tracker.requestPermission();
    setVrPrefs({ headLook: granted, stereo: false });
  }, [vr.headLook, setVrPrefs]);

  const handleToggleStereo = useCallback(async () => {
    if (vr.stereo) {
      setVrPrefs({ headLook: vr.headLook, stereo: false });
      try {
        window.screen?.orientation?.unlock?.();
      } catch { /* not supported here */ }
      if (containerRef.current) await toggleFullscreen(containerRef.current);
      return;
    }

    let headLook = vr.headLook;
    if (!headLook) {
      headLook = (await trackerRef.current?.requestPermission()) ?? false;
      if (!headLook) {
        setVrPrefs({ headLook: false, stereo: false });
        return;
      }
    }

    // A viewer needs the whole panel and a fixed landscape orientation. Both
    // are best-effort: iOS Safari offers neither, and the mode still works.
    if (containerRef.current) await toggleFullscreen(containerRef.current);
    try {
      await (window.screen?.orientation as { lock?: (o: string) => Promise<void> } | undefined)?.lock?.('landscape');
    } catch { /* orientation lock unavailable */ }

    setVrPrefs({ headLook: true, stereo: true });
    rendererRef.current?.recenterView();
  }, [vr.headLook, vr.stereo, setVrPrefs]);

  const handleRecenter = useCallback(() => {
    rendererRef.current?.recenterView();
  }, []);

  // ── Run control ──

  const handleStartLevel = useCallback((levelId: LevelId) => {
    const game = gameRef.current;
    if (!game) return;
    game.isMultiplayer = false;
    game.startLevel(levelId);
    rendererRef.current?.setLevel(LEVELS[levelId]);
    rendererRef.current?.recenterView();
    setCurrentLevel(levelId);
    setRunStats(null);
    setUiState('playing');
  }, []);

  const handleTouchPause = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    if (game.state === 'playing') game.state = 'paused' as GameState;
    else if (game.state === 'paused') game.resume();
  }, []);

  const handleCanvasPointerUp = useCallback(() => {
    const game = gameRef.current;
    if (game?.state === 'paused') game.resume();
  }, []);

  const handleContinueEndless = useCallback(() => {
    gameRef.current?.continueEndless();
    setUiState('playing');
  }, []);

  const handleGoToMultiplayer = useCallback(() => setUiState('multiplayerMenu'), []);

  const handleMultiplayerGameStart = useCallback((roomId: string, levelId: LevelId) => {
    const game = gameRef.current;
    if (!game) return;
    multiplayerRoomRef.current = roomId;
    positionTickRef.current = 0;
    scoreTickRef.current = 0;
    game.isMultiplayer = true;
    game.remotePlayers.clear();
    game.startLevel(levelId);
    rendererRef.current?.setLevel(LEVELS[levelId]);
    rendererRef.current?.recenterView();
    setCurrentLevel(levelId);
    setRunStats(null);
    setUiState('multiplayerPlaying');
  }, []);

  const handleBackFromMultiplayer = useCallback(() => {
    multiplayerRoomRef.current = null;
    setUiState('menu');
  }, []);

  const playing = uiState === 'playing' || uiState === 'multiplayerPlaying';

  if (!webglReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black px-6 text-center">
        <div className="max-w-sm space-y-3">
          <h2 className="text-xl font-black tracking-tight text-cyan-400">
            {t('webgl-required-title', { defaultValue: '3D not available' })}
          </h2>
          <p className="text-sm text-zinc-400">
            {t('webgl-required-body', {
              defaultValue:
                'Neon Driftway needs WebGL, and this browser could not start it. Try a different browser, or enable hardware acceleration in your settings.',
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-black"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        onPointerUp={handleCanvasPointerUp}
        style={{ touchAction: 'none' }}
      />

      <NeonDriftwayHud ref={hudRef} stereo={vr.stereo} visible={playing} />

      {/* Viewer mode hides every menu affordance, so keep one way out. */}
      {vr.stereo && (
        <button
          type="button"
          onClick={handleToggleStereo}
          className="absolute left-1/2 top-2 z-50 -translate-x-1/2 rounded-full border border-white/25 bg-black/70 px-3 py-1 text-[11px] font-bold tracking-wider text-white/80 backdrop-blur-sm"
        >
          {t('exit-vr', { defaultValue: 'EXIT VR' })}
        </button>
      )}

      <NeonDriftwayTouchControls
        inputRef={inputRef}
        onPause={handleTouchPause}
        onRecenter={handleRecenter}
        showRecenter={gyroStatus === 'active'}
        stereo={vr.stereo}
        visible={playing && (isTouchDevice || vr.stereo)}
      />

      {(uiState === 'multiplayerMenu' || uiState === 'lobby') && (
        <NDWMultiplayerLobby
          onBack={handleBackFromMultiplayer}
          onGameStart={handleMultiplayerGameStart}
        />
      )}

      {uiState === 'multiplayerGameOver' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 px-4 py-6">
            <h2 className="text-center text-4xl font-black tracking-tight text-cyan-400">
              {t('race-over', { defaultValue: 'RACE OVER' })}
            </h2>

            {runStats && (
              <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-5">
                <div className="text-center">
                  <div className="text-xs uppercase tracking-wider text-zinc-400">
                    {t('your-score', { defaultValue: 'Your Score' })}
                  </div>
                  <div className="text-3xl font-black tabular-nums text-cyan-400">
                    {runStats.score.toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {multiplayerRankings.length > 0 && (
              <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
                <div className="mb-2 text-xs uppercase tracking-wider text-zinc-400">
                  {t('final-rankings', { defaultValue: 'Final Rankings' })}
                </div>
                {multiplayerRankings.map((r) => {
                  const myId = NDWMultiplayerClient.getInstance().getSocketId();
                  const isSelf = r.id === myId;
                  return (
                    <div
                      key={r.id}
                      className={`flex items-center justify-between rounded p-2 ${isSelf ? 'border border-cyan-500/40 bg-cyan-500/20' : 'bg-zinc-800/50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black ${r.rank === 1 ? 'text-yellow-400' : 'text-zinc-400'}`}>
                          #{r.rank}
                        </span>
                        <span className={`text-sm font-bold ${isSelf ? 'text-cyan-400' : 'text-white'}`}>
                          {r.name} {isSelf ? t('you-label', { defaultValue: '(You)' }) : ''}
                        </span>
                      </div>
                      <span className="font-bold tabular-nums text-cyan-300">{r.score.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setUiState('menu')}
                className="flex-1 rounded bg-zinc-700 px-4 py-2 font-bold text-white transition-colors hover:bg-zinc-600"
              >
                {t('main-menu', { defaultValue: 'Main Menu' })}
              </button>
              <button
                onClick={() => setUiState('multiplayerMenu')}
                className="flex-1 rounded bg-cyan-600 px-4 py-2 font-bold text-white transition-colors hover:bg-cyan-700"
              >
                {t('play-again', { defaultValue: 'Play Again' })}
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
        onContinueEndless={handleContinueEndless}
        onGoToMultiplayer={handleGoToMultiplayer}
        vr={vr}
        gyroStatus={gyroStatus}
        canOfferHeadLook={canOfferHeadLook}
        onToggleHeadLook={handleToggleHeadLook}
        onToggleStereo={handleToggleStereo}
      />
    </div>
  );
}
