'use client';

/**
 * Neon Driftway — first-person 3D racer with device-gyro head look.
 *
 * This component owns the browser side of the game: the WebGL canvas and its
 * sizing, the single rAF loop, input, the gyro tracker's lifecycle, and the
 * VR toggles. The simulation lives in `lib/neon-driftway/game`, the drawing in
 * `lib/neon-driftway/renderer3d`, and neither knows this file exists.
 *
 * Three view modes. The default is picked from what the device can actually
 * do, and the player can always override it:
 *
 *  - **fixed** — camera locked forward with a small lean into the steering.
 *    The default only where there is no usable motion sensor (most desktops),
 *    and always available for anyone who finds head look uncomfortable.
 *  - **gyro** — one eye, head look live. The gyro drives the camera in real
 *    time so you can check your mirrors and look into a bend as you drive.
 *    **This is the default on any device with a motion sensor.**
 *  - **vr** — head look plus side-by-side stereo for a headset or a
 *    Cardboard-style holder. The throttle is held open and the car steers
 *    from head yaw, so nothing needs a button you cannot see. Only the
 *    default when a headset is actually detected, because a split screen on
 *    a bare phone is just a broken-looking game.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  neonDriftwaySave,
  persistNeonDriftwayUnlocks,
  summarizeNeonDriftwaySave,
} from '@/lib/neon-driftway/cloud';
import { useCloudSave } from '@/hooks/useCloudSave';
import { useLobbyInvite } from '@/hooks/useLobbyLink';
import { NeonDriftwayEngine } from '@/lib/neon-driftway/game';
import { NeonDriftwayRenderer3D } from '@/lib/neon-driftway/renderer3d';
import { GyroTracker, gyroPermissionGateExists, type GyroStatus } from '@/lib/neon-driftway/gyro';
import { detectHeadset } from '@/lib/neon-driftway/headset';
import {
  LEVELS, LEVEL_2_UNLOCK_DISTANCE, LEVEL_3_UNLOCK_DISTANCE, MPS_PER_UNIT,
} from '@/lib/neon-driftway/constants';
import type { GameState, InputState, LevelId, RunStats } from '@/lib/neon-driftway/types';
import { isFullscreen, isLowPowerDevice, requestScreenWakeLock, supportsWebGL, toggleFullscreen } from '@/lib/shared/platform';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { NeonDriftwayUI } from './NeonDriftwayUI';
import { NeonDriftwayTouchControls } from './NeonDriftwayTouchControls';
import { NeonDriftwayHud, type HudHandle } from './NeonDriftwayHud';
import { NDWMultiplayerLobby } from './NDWMultiplayerLobby';
import { NDWMultiplayerClient } from '@/lib/neon-driftway/multiplayer';

const VR_KEY = 'neon-driftway.vr';

type UIState = 'menu' | 'levelSelect' | 'playing' | 'gameOver' | 'levelComplete'
  | 'multiplayerMenu' | 'lobby' | 'multiplayerPlaying' | 'multiplayerGameOver';

/** One eye or two, and whether the gyro is driving the camera. */
export type ViewMode = 'fixed' | 'gyro' | 'vr';

/** A stored mode, or null when the player has never chosen one. */
function loadViewMode(): ViewMode | null {
  try {
    const raw = localStorage.getItem(VR_KEY);
    if (raw === 'fixed' || raw === 'gyro' || raw === 'vr') return raw;
  } catch { /* ignore */ }
  return null;
}

function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VR_KEY, mode);
  } catch { /* ignore */ }
}

/** Head yaw inside this many radians of forward does not steer at all. */
const HEAD_STEER_DEADZONE = 0.10;
/** Yaw at which head-steering is at full lock. */
const HEAD_STEER_FULL = 0.5;

/**
 * Head yaw → steering axis for VR.
 *
 * `headYaw` is positive to the left, while the steering axis is positive to
 * the right, hence the negation. The deadzone matters more than it looks:
 * without it the car wanders with every small head movement, which in a
 * headset reads as the car being broken rather than the player being still.
 */
function headSteer(headYaw: number): number {
  const magnitude = (Math.abs(headYaw) - HEAD_STEER_DEADZONE) / (HEAD_STEER_FULL - HEAD_STEER_DEADZONE);
  if (magnitude <= 0) return 0;
  return -Math.sign(headYaw) * Math.min(magnitude, 1);
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
  // Which tracks are open follows the account when there is one.
  const cloud = useCloudSave(neonDriftwaySave, {
    gameName: 'Neon Driftway',
    summarize: (save) => summarizeNeonDriftwaySave(save, t),
  });

  useEffect(() => {
    if (cloud.status !== 'ready') return;
    setUnlockedLevels(new Set((cloud.save ?? [1]) as LevelId[]));
  }, [cloud.status, cloud.save]);
  const reducedMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NeonDriftwayEngine | null>(null);
  const rendererRef = useRef<NeonDriftwayRenderer3D | null>(null);
  const hudRef = useRef<HudHandle>(null);
  const trackerRef = useRef<GyroTracker | null>(null);
  const inputRef = useRef<InputState>({
    up: false, down: false, left: false, right: false, steer: 0,
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
  const [viewMode, setViewMode] = useState<ViewMode>('fixed');
  const [gyroStatus, setGyroStatus] = useState<GyroStatus>('unavailable');
  const [canOfferHeadLook, setCanOfferHeadLook] = useState(false);
  const [headsetDetected, setHeadsetDetected] = useState(false);

  // Values the frame loop reads. Kept in refs so the loop is created once.
  const unlocksRef = useRef(unlockedLevels);
  const stereoRef = useRef(false);
  const multiplayerRoomRef = useRef<string | null>(null);
  const positionTickRef = useRef(0);
  const scoreTickRef = useRef(0);

  unlocksRef.current = unlockedLevels;
  stereoRef.current = viewMode === 'vr';

  // ── Mount: capabilities, saved state, gyro tracker ──

  useEffect(() => {

    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    setWebglReady(supportsWebGL());

    const sensorPlausible = motionPlausible();
    setCanOfferHeadLook(sensorPlausible);

    const tracker = new GyroTracker();
    tracker.onStatusChange = setGyroStatus;
    trackerRef.current = tracker;

    const stored = loadViewMode();
    if (stored) {
      setViewMode(stored);
      return () => {
        tracker.onStatusChange = null;
        tracker.stop();
        trackerRef.current = null;
      };
    }

    // No stored choice — pick the default from the hardware. Head look is the
    // default wherever a sensor is plausible; the split screen only when a
    // headset is actually there, since it is unusable on a bare phone.
    let cancelled = false;
    void detectHeadset().then((headset) => {
      if (cancelled) return;
      setHeadsetDetected(headset);
      setViewMode(headset ? 'vr' : sensorPlausible ? 'gyro' : 'fixed');
    });

    return () => {
      cancelled = true;
      tracker.onStatusChange = null;
      tracker.stop();
      trackerRef.current = null;
    };
  }, []);

  // Start or stop the sensor to match the mode. `start()` never prompts, so on
  // a gated platform this settles at `needs-permission` until the tap below.
  useEffect(() => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    if (viewMode === 'fixed') tracker.stop();
    else tracker.start();
  }, [viewMode]);

  // iOS only grants motion access from inside a user gesture. Head look being
  // the default means we cannot ask on load, so we ask on the player's first
  // touch — which is also the first moment the answer could matter.
  useEffect(() => {
    if (viewMode === 'fixed' || gyroStatus !== 'needs-permission') return;
    const onGesture = () => {
      void trackerRef.current?.requestPermission();
    };
    window.addEventListener('pointerdown', onGesture, { once: true });
    return () => window.removeEventListener('pointerdown', onGesture);
  }, [viewMode, gyroStatus]);

  // A sensor that never reports in must not stand the player up in a split
  // screen they cannot steer out of — fall back to one eye.
  useEffect(() => {
    if (viewMode !== 'fixed' && (gyroStatus === 'unavailable' || gyroStatus === 'denied')) {
      setViewMode('fixed');
    }
  }, [gyroStatus, viewMode]);

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
    const stereo = viewMode === 'vr';
    rendererRef.current?.setStereo(stereo);
    // Viewer mode holds the throttle open; leaving it must hand control back
    // rather than stranding the player at full speed.
    if (!stereo) inputRef.current.up = false;
  }, [viewMode]);

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
      input.steer = 0;
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
        // In a viewer there is no reachable throttle, so hold it open, and
        // steering comes from where the driver is looking — hands stay on the
        // headset, not hunting for a button they cannot see.
        if (stereoRef.current && state === 'playing') {
          inputRef.current.up = true;
          inputRef.current.steer = headSteer(renderer.headYaw);
        } else if (inputRef.current.steer !== 0) {
          inputRef.current.steer = 0;
        }

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
              persistNeonDriftwayUnlocks(newUnlocks);
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

  /**
   * Switch view mode. Always called from a click, which is what lets us ask
   * for motion access and for fullscreen in the same breath.
   */
  const handleSelectMode = useCallback(async (next: ViewMode) => {
    const wasStereo = viewMode === 'vr';

    if (next === 'fixed') {
      trackerRef.current?.stop();
    } else if (gyroStatus !== 'active') {
      const granted = await trackerRef.current?.requestPermission();
      if (!granted) {
        // Declined: stay on the locked camera rather than a dead head look.
        setViewMode('fixed');
        saveViewMode('fixed');
        return;
      }
    }

    // Entering the split screen wants the whole panel and a locked landscape;
    // leaving it gives both back. Every step here is best-effort — iOS Safari
    // offers neither, and the mode works fine without them.
    if (next === 'vr' && !wasStereo) {
      if (containerRef.current) await toggleFullscreen(containerRef.current);
      try {
        await (window.screen?.orientation as { lock?: (o: string) => Promise<void> } | undefined)?.lock?.('landscape');
      } catch { /* orientation lock unavailable */ }
    } else if (next !== 'vr' && wasStereo) {
      try {
        window.screen?.orientation?.unlock?.();
      } catch { /* not supported here */ }
      if (containerRef.current && isFullscreen()) await toggleFullscreen(containerRef.current);
    }

    setViewMode(next);
    saveViewMode(next);
    rendererRef.current?.recenterView();
  }, [viewMode, gyroStatus]);

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

  // An invite link goes straight past the title screen — the lobby it opens
  // joins on its own.
  const invite = useLobbyInvite();
  useEffect(() => {
    if (invite) setUiState('multiplayerMenu');
  }, [invite]);

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
      {/* Two sets of unlocks that disagree. Nothing is applied until it is
          answered, so no drive can overwrite the set still being offered. */}
      {cloud.conflictDialog}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        onPointerUp={handleCanvasPointerUp}
        style={{ touchAction: 'none' }}
      />

      <NeonDriftwayHud ref={hudRef} stereo={viewMode === 'vr'} visible={playing} />

      {/* Viewer mode hides every menu affordance, so keep one way out. */}
      {viewMode === 'vr' && (
        <button
          type="button"
          onClick={() => void handleSelectMode('gyro')}
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
        stereo={viewMode === 'vr'}
        visible={playing && (isTouchDevice || viewMode === 'vr')}
      />

      {(uiState === 'multiplayerMenu' || uiState === 'lobby') && (
        <NDWMultiplayerLobby
          onBack={handleBackFromMultiplayer}
          onGameStart={handleMultiplayerGameStart}
        />
      )}

      {uiState === 'multiplayerGameOver' && (
        <div className="absolute inset-0 z-40 flex items-center-safe justify-center-safe overflow-y-auto bg-black/80 backdrop-blur-sm">
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
        viewMode={viewMode}
        gyroStatus={gyroStatus}
        canOfferHeadLook={canOfferHeadLook}
        headsetDetected={headsetDetected}
        onSelectMode={handleSelectMode}
      />
    </div>
  );
}
