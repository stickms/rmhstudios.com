// =============================================================================
// ALTAIR ENGINE -- Game Loop
// =============================================================================
// Sets up the game world, creates the fixed-timestep game loop, and
// orchestrates all systems each frame.
// =============================================================================

import { GameWorld } from './types';
import { createCamera, updateCamera } from './camera';
import { createInputState } from './input';
import { TileGenerator } from './tile-generator';
import { renderFrame, type WebGLRenderer } from './renderer';
import { CLASSES } from '../data/classes';
import { initAllSpriteSheets } from './sprites/sprite-defs';
import { initWebGL } from './webgl/webgl-context';
import { SpriteBatch } from './webgl/webgl-sprite-batch';
import { ShapeBatch } from './webgl/webgl-shapes';
import { setGLContext } from './webgl/webgl-textures';
import { RenderInterpolator } from './interpolation';
import { createSimRuntime, resetSimRuntimeForStart, type GameLoopCallbacks } from './sim-runtime';
import { refreshInventoryStats, stepSimulation, drainTilePickups } from './sim-step';

export type { GameLoopCallbacks } from './sim-runtime';

// ---- Constants --------------------------------------------------------------

const PLAYER_RADIUS = 12;
const MAX_DELTA = 1 / 15; // cap to ~66ms

// ---- Factory functions ------------------------------------------------------

/**
 * Create the initial game world.
 */
export function createGameWorld(
  canvasWidth: number,
  canvasHeight: number,
  classId: string,
  doubleTime: boolean,
): GameWorld {
  // Initialize all sprite sheets (lazy load, cached globally)
  initAllSpriteSheets();

  const classDef = CLASSES.find((c) => c.id === classId) || CLASSES[0];
  const maxHp = (classDef.baseStats.maxHp as number) || 100;

  const world: GameWorld = {
    classId,
    player: {
      id: 1,
      x: 0,
      y: 0,
      radius: PLAYER_RADIUS,
      facingX: 1,
      facingY: 0,
      hp: maxHp,
      maxHp,
      iFrames: 0,
      shieldHp: 0,
      positionHistory: [],
    },
    enemies: [],
    projectiles: [],
    pickups: [],
    particles: [],
    meleeHitboxes: [],
    auras: [],
    summons: [],
    pools: [],
    camera: createCamera(canvasWidth, canvasHeight),
    inputState: createInputState(),
    weapons: [
      {
        weaponId: classDef.startingWeaponId,
        level: 1,
        evolved: false,
        cooldownTimer: 0,
      },
    ],
    passives: [],
    catalysts: [],
    time: 0,
    timeScale: doubleTime ? 2.0 : 1.0,
    nextId: 100,
    bossActive: false,
    bossWarning: null,
    weaponsDisabled: false,
    weaponsDisabledTimer: 0,
  };

  // Snap camera to player immediately
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;

  return world;
}

/**
 * Create a new tile generator instance.
 */
export function createTileGenerator(): TileGenerator {
  return new TileGenerator();
}

// ---- Game Loop --------------------------------------------------------------

/**
 * Create and return the main game loop controller.
 */
export function createGameLoop(
  canvas: HTMLCanvasElement,
  world: GameWorld,
  tileGen: TileGenerator,
  callbacks: GameLoopCallbacks,
): {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  destroy: () => void;
  getWorld: () => GameWorld;
} {
  let running = false;
  let paused = false;
  let rafId: number = 0;
  let lastTime: number = 0;
  let accumulator: number = 0;
  const FIXED_DT = 1 / 60; // 60 Hz physics
  // Blends the last two sim states for drawing, so motion is continuous on
  // 120/144/240Hz panels instead of hitching in uneven 60Hz strides. Render-only
  // — see ./interpolation.ts.
  const interpolator = new RenderInterpolator();

  // ---- WebGL setup ----
  const gl = initWebGL(canvas);
  setGLContext(gl);

  const spriteBatch = new SpriteBatch(gl);
  const shapeBatch = new ShapeBatch(gl);

  // Create transparent overlay canvas for text/HUD
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  overlayCanvas.style.position = 'absolute';
  overlayCanvas.style.top = '0';
  overlayCanvas.style.left = '0';
  overlayCanvas.style.width = '100%';
  overlayCanvas.style.height = '100%';
  overlayCanvas.style.pointerEvents = 'none';
  canvas.parentElement?.appendChild(overlayCanvas);
  const overlayCtx = overlayCanvas.getContext('2d')!;

  const renderer: WebGLRenderer = { gl, spriteBatch, shapeBatch, overlayCtx };

  // Per-run state (shared with the multiplayer host via sim-runtime/sim-step)
  const rt = createSimRuntime(world);

  function tick(now: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    // Frame delta in seconds, capped to prevent spiral of death
    let frameDelta = (now - lastTime) / 1000;
    if (frameDelta > MAX_DELTA) frameDelta = MAX_DELTA;
    if (frameDelta <= 0) frameDelta = 1 / 60;
    lastTime = now;

    // Keep overlay resolution aligned with the render canvas.
    if (overlayCanvas.width !== canvas.width || overlayCanvas.height !== canvas.height) {
      overlayCanvas.width = canvas.width;
      overlayCanvas.height = canvas.height;
    }

    // While paused, keep rendering the current frame but skip simulation.
    if (paused) {
      accumulator = 0;
      renderFrame(renderer, world, tileGen);
      return;
    }

    // Recompute stats when inventory changes (once per frame, not per step)
    refreshInventoryStats(world, rt);

    // ---- Fixed-timestep simulation loop ----
    // All physics/game logic runs at a consistent 60 Hz regardless of display
    // frame rate. This ensures identical movement speed at 30, 60, or 144 FPS.
    accumulator += frameDelta;
    while (accumulator >= FIXED_DT) {
      interpolator.capture(world);
      stepSimulation(world, rt, tileGen, callbacks, FIXED_DT);

      accumulator -= FIXED_DT;
    }

    // ---- Per-frame updates (outside fixed timestep) ----

    // 13–14. Camera + render at the interpolated pose. The camera follows the
    // BLENDED player — following the raw one chases a target that hitches in
    // 60Hz strides, which is what made the whole screen judder at 144Hz. The
    // blend is undone straight after, so the next step simulates from the true
    // positions. (A pickup spawned inside the blend is not in the blended set,
    // so the restore leaves it exactly where it was spawned.)
    interpolator.apply(world, accumulator / FIXED_DT);
    try {
      // 13. Camera follows at frame rate for smooth visual tracking
      updateCamera(world.camera, world.player, frameDelta);
      tileGen.update(world.camera);

      // 13b. Spawn structure pickups queued by tile generator
      drainTilePickups(world, tileGen);

      // 14. Render
      renderFrame(renderer, world, tileGen);
    } finally {
      interpolator.restore();
    }

    // 15. Check death
    if (world.player.hp <= 0) {
      // Death handled externally via the React component
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      paused = false;
      lastTime = performance.now();
      accumulator = 0;
      resetSimRuntimeForStart(rt, world);
      rafId = requestAnimationFrame(tick);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      lastTime = performance.now();
      accumulator = 0;
    },
    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    destroy() {
      running = false;
      paused = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      // Clean up overlay canvas
      overlayCanvas.parentElement?.removeChild(overlayCanvas);
    },
    getWorld() {
      return world;
    },
  };
}
