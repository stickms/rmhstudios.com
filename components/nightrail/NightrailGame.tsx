/**
 * Nightrail — the browser half of the game.
 *
 * This component owns everything the browser has to be asked for: the WebGL
 * canvas and its sizing, the single rAF loop, keyboard/pointer/gamepad input,
 * the audio context's lifecycle, and the screen wake lock. The simulation
 * lives in `lib/nightrail/game`, the drawing in `lib/nightrail/renderer3d`,
 * and neither knows this file exists.
 *
 * The division that matters: **nothing about a run is React state.** Score,
 * speed, combo and cargo change up to 120 times a second and are written
 * straight into the DOM by the imperative HUD. React is told only when the
 * *screen* changes — countdown to playing, playing to results — which happens
 * a handful of times per run.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isLowPowerDevice, requestScreenWakeLock, supportsWebGL } from '@/lib/shared/platform';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { createRun, emptyInput, stepRun, type RunState } from '@/lib/nightrail/game';
import { NightrailRenderer3D } from '@/lib/nightrail/renderer3d';
import { NightrailAudio } from '@/lib/nightrail/audio';
import { LEVELS, LEVEL_ORDER } from '@/lib/nightrail/levels';
import type { InputState, LevelId, RunStats, TrickDirection } from '@/lib/nightrail/types';
import { NightrailHud, type HudHandle } from './NightrailHud';
import { NightrailUI, type UIState } from './NightrailUI';
import { NightrailTouchControls } from './NightrailTouchControls';

const UNLOCKS_KEY = 'nightrail.unlocks';

/** Read the unlocked set, tolerating anything at all in storage. */
function loadUnlocks(): Set<LevelId> {
  try {
    const raw = localStorage.getItem(UNLOCKS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((n): n is LevelId =>
          (LEVEL_ORDER as number[]).includes(n as number),
        );
        if (ids.length > 0) return new Set(ids);
      }
    }
  } catch {
    /* an unreadable save is "level one only", which is where everyone starts */
  }
  return new Set<LevelId>([LEVEL_ORDER[0]]);
}

function saveUnlocks(unlocks: Set<LevelId>): void {
  try {
    // Stored as a sorted array: a Set JSON-stringifies to `{}`, which is the
    // kind of bug that only surfaces once the save is already overwritten.
    localStorage.setItem(UNLOCKS_KEY, JSON.stringify([...unlocks].sort((a, b) => a - b)));
  } catch {
    /* private mode — the run still works, it just will not be remembered */
  }
}

/**
 * Turn a stick/drag vector into one of the eight trick directions.
 *
 * Returns null below the dead zone so a resting stick or a stray pixel of
 * mouse movement never fires a trick the player did not ask for.
 */
function directionFor(dx: number, dy: number, deadZone: number): TrickDirection | null {
  if (Math.hypot(dx, dy) < deadZone) return null;
  // Eight 45° wedges, offset by half a wedge so "straight up" sits in the
  // middle of the `up` wedge rather than on the boundary between two.
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7;
  const table: TrickDirection[] = [
    'right',
    'downRight',
    'down',
    'downLeft',
    'left',
    'upLeft',
    'up',
    'upRight',
  ];
  return table[octant];
}

export function NightrailGame() {
  const { t } = useTranslation('c-nightrail');
  const reducedMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<RunState | null>(null);
  const rendererRef = useRef<NightrailRenderer3D | null>(null);
  const audioRef = useRef<NightrailAudio | null>(null);
  const hudRef = useRef<HudHandle>(null);
  const inputRef = useRef<InputState>(emptyInput());

  const [uiState, setUiState] = useState<UIState>('menu');
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [unlockedLevels, setUnlockedLevels] = useState<Set<LevelId>>(
    () => new Set<LevelId>([LEVEL_ORDER[0]]),
  );
  const [webglReady, setWebglReady] = useState(true);
  const [rendererEpoch, setRendererEpoch] = useState(0);

  // Values the frame loop reads, kept in refs so the loop is created once and
  // never has to be torn down because a piece of UI state changed.
  const unlocksRef = useRef(unlockedLevels);
  unlocksRef.current = unlockedLevels;
  const uiStateRef = useRef(uiState);
  uiStateRef.current = uiState;

  useEffect(() => {
    if (!supportsWebGL()) setWebglReady(false);
    setUnlockedLevels(loadUnlocks());
  }, []);

  // ── Renderer lifecycle ──

  useEffect(() => {
    if (!webglReady) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (!runRef.current) {
      runRef.current = createRun(LEVELS[LEVEL_ORDER[0]]);
    }

    let renderer: NightrailRenderer3D;
    try {
      renderer = new NightrailRenderer3D(canvas, {
        bloom: !isLowPowerDevice() && !reducedMotion,
        reducedMotion,
        maxPixelRatio: isLowPowerDevice() ? 1.5 : 2,
      });
    } catch {
      setWebglReady(false);
      return;
    }
    rendererRef.current = renderer;
    renderer.setLevel(runRef.current.level);

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      // A hidden or zero-size container would poison the projection matrix.
      if (rect.width < 2 || rect.height < 2) return;
      renderer.setSize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    applySize();

    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    // Orientation changes land a beat late on iOS; re-measure when they do.
    window.addEventListener('orientationchange', applySize);

    // A lost context is recoverable: bump the epoch and this effect rebuilds
    // the renderer from scratch on the next commit.
    const onLost = (event: Event) => {
      event.preventDefault();
      const run = runRef.current;
      if (run && run.phase === 'playing') run.phase = 'paused';
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
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  // ── Audio lifecycle ──

  useEffect(() => {
    const audio = new NightrailAudio();
    audioRef.current = audio;
    return () => {
      audio.stop();
      audioRef.current = null;
    };
  }, []);

  // ── Keyboard ──

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const input = inputRef.current;
      // `e.code` rather than `e.key` so the layout under the player's fingers
      // is the same shape on AZERTY as on QWERTY.
      switch (e.code) {
        case 'KeyA':
          input.left = down;
          break;
        case 'KeyD':
          input.right = down;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyS':
          input.drift = down;
          break;
        case 'Space':
          input.jump = down;
          if (down) e.preventDefault();
          break;
        case 'KeyW':
          input.boost = down;
          break;
        case 'Escape':
          input.pause = down;
          break;
        case 'KeyR':
          input.restart = down;
          break;
        // Tricks. The arrows cover the four cardinals and 1–4 the diagonals,
        // because a keyboard cannot express a diagonal throw the way a stick
        // can and asking for two simultaneous arrows would be worse than a
        // dedicated key.
        case 'ArrowUp':
          if (down) input.trick = 'up';
          e.preventDefault();
          break;
        case 'ArrowDown':
          if (down) input.trick = 'down';
          e.preventDefault();
          break;
        case 'ArrowLeft':
          if (down) input.trick = 'left';
          break;
        case 'ArrowRight':
          if (down) input.trick = 'right';
          break;
        case 'Digit1':
          if (down) input.trick = 'upLeft';
          break;
        case 'Digit2':
          if (down) input.trick = 'upRight';
          break;
        case 'Digit3':
          if (down) input.trick = 'downLeft';
          break;
        case 'Digit4':
          if (down) input.trick = 'downRight';
          break;
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    // Alt-tabbing away with a key held would otherwise leave it held forever.
    const blur = () => {
      inputRef.current = { ...emptyInput() };
      if (runRef.current?.phase === 'playing') runRef.current.phase = 'paused';
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

  // ── Mouse flick tricks ──

  useEffect(() => {
    let originX = 0;
    let originY = 0;
    let dragging = false;

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      dragging = true;
      originX = e.clientX;
      originY = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!dragging || e.pointerType !== 'mouse') return;
      const direction = directionFor(e.clientX - originX, e.clientY - originY, 48);
      if (direction) {
        inputRef.current.trick = direction;
        // Re-anchor so one long drag can express a second trick rather than
        // re-firing the first one every frame.
        originX = e.clientX;
        originY = e.clientY;
      }
    };
    const up = () => {
      dragging = false;
    };

    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  // ── Run control ──

  const startLevel = useCallback((id: LevelId) => {
    const run = createRun(LEVELS[id]);
    runRef.current = run;
    rendererRef.current?.setLevel(run.level);
    inputRef.current = { ...emptyInput() };
    setRunStats(null);
    setUiState('playing');
    // Audio has to be unlocked from a gesture, and pressing Play is one.
    audioRef.current?.unlock();
  }, []);

  const restart = useCallback(() => {
    const level = runRef.current?.level.id ?? LEVEL_ORDER[0];
    startLevel(level);
  }, [startLevel]);

  useEffect(() => {
    if (uiState !== 'playing') return;
    return requestScreenWakeLock();
  }, [uiState]);

  // ── The single rAF loop ──

  useEffect(() => {
    if (!webglReady) return;
    let last = 0;
    let rafId = 0;
    /** Previous frame's gamepad trick direction, so a held stick fires once. */
    let padTrick: TrickDirection | null = null;
    let prevPause = false;

    const loop = (timestamp: number) => {
      rafId = requestAnimationFrame(loop);

      const dt = last ? Math.min((timestamp - last) / 1000, 0.1) : 0;
      last = timestamp;

      const run = runRef.current;
      const renderer = rendererRef.current;
      if (!run || !renderer) return;

      const input = inputRef.current;

      // Gamepad: left stick / d-pad for rails, right stick for tricks. Polled
      // here rather than in its own loop because the pad has no event model —
      // the only way to read it is to ask once a frame.
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        if (!pad) continue;
        const lx = pad.axes[0] ?? 0;
        input.left = input.left || lx < -0.5 || (pad.buttons[14]?.pressed ?? false);
        input.right = input.right || lx > 0.5 || (pad.buttons[15]?.pressed ?? false);
        input.jump = input.jump || (pad.buttons[7]?.pressed ?? false);
        input.drift = input.drift || (pad.buttons[6]?.pressed ?? false);
        input.boost = input.boost || (pad.buttons[0]?.pressed ?? false);
        const next = directionFor(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.6);
        if (next && next !== padTrick) input.trick = next;
        padTrick = next;
        break;
      }

      const playing = uiStateRef.current === 'playing';

      if (playing) {
        // Escape toggles both ways. Edge-detected here rather than in the key
        // handler so a held key cannot strobe the pause state.
        if (input.pause && !prevPause) {
          if (run.phase === 'playing') run.phase = 'paused';
          else if (run.phase === 'paused') run.phase = 'playing';
        }
        prevPause = input.pause;

        stepRun(run, input, dt);
        input.trick = null;

        audioRef.current?.playEvents(run.events);
        audioRef.current?.setSpeed(
          run.train.speed,
          run.level.maxSpeed,
          run.train.mode === 'airborne',
        );

        renderer.draw(run, dt);
        hudRef.current?.sync(run);

        if (run.phase === 'runComplete' || run.phase === 'crashed') {
          setRunStats({ ...run.stats });
          setUiState(run.phase === 'runComplete' ? 'runComplete' : 'crashed');
          // Finishing a level opens the next one. A wreck does not, so the
          // gate is "get the cargo there", not "have attempted it".
          if (run.phase === 'runComplete') {
            const index = LEVEL_ORDER.indexOf(run.level.id);
            const next = LEVEL_ORDER[index + 1];
            if (next !== undefined && !unlocksRef.current.has(next)) {
              const merged = new Set(unlocksRef.current);
              merged.add(next);
              unlocksRef.current = merged;
              setUnlockedLevels(merged);
              saveUnlocks(merged);
            }
          }
        }
      } else {
        // Menus sit in front of a slow idle cruise rather than a black screen,
        // so the game is showing you what it is before you have pressed
        // anything.
        renderer.draw(run, reducedMotion ? 0 : dt * 0.35);
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [webglReady, reducedMotion]);

  // Tapping the scene resumes — the pause panel is drawn by the HUD, which is
  // `pointer-events-none`, so the canvas underneath is what receives the tap.
  const resume = useCallback(() => {
    const run = runRef.current;
    if (run?.phase === 'paused') run.phase = 'playing';
    audioRef.current?.unlock();
  }, []);

  if (!webglReady) {
    return (
      <div className="app-screen bg-black text-center">
        <div className="max-w-sm space-y-3 px-6">
          <h2 className="text-xl font-semibold text-fuchsia-300">
            {t('no-webgl-title', { defaultValue: '3D is not available' })}
          </h2>
          <p className="text-sm text-zinc-400">
            {t('no-webgl-body', {
              defaultValue:
                'Nightrail needs WebGL, and this browser is not offering it. Try a different browser, or enable hardware acceleration in your settings.',
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden bg-black"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        onPointerUp={resume}
        style={{ touchAction: 'none' }}
      />

      <NightrailHud ref={hudRef} visible={uiState === 'playing'} />

      <NightrailTouchControls inputRef={inputRef} visible={uiState === 'playing'} />

      <NightrailUI
        uiState={uiState}
        runStats={runStats}
        unlockedLevels={unlockedLevels}
        onStartLevel={startLevel}
        onSetUiState={setUiState}
        onRestart={restart}
      />
    </div>
  );
}
