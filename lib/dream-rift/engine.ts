/**
 * DreamRiftEngine — Core game engine for the Dream Rift bullet hell.
 *
 * Manages the PixiJS application, fixed-timestep game loop, player mechanics,
 * bullet pools, collision detection, and rendering. Communicates game state
 * changes to the Zustand store.
 */

import { Application, Graphics, Container } from 'pixi.js';
import type {
  Bullet,
  Item,
  Character,
  Difficulty,
  BulletPatternDef,
  InputState,
  Vec2,
} from './types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYFIELD_WIDTH,
  PLAYFIELD_HEIGHT,
  TARGET_FPS,
  FRAME_TIME,
  PLAYER_START_X,
  PLAYER_START_Y,
  PLAYER_INVULN_FRAMES,
  DEATHBOMB_WINDOW,
  POWER_MAX,
  LIVES_START,
  BOMBS_START,
  MELEE_COOLDOWN,
  MELEE_INVULN_FRAMES,
  MELEE_RANGE,
  MELEE_ARC_REI,
  MELEE_ARC_YUME,
  DASH_COOLDOWN,
  DASH_DISTANCE,
  DASH_INVULN_FRAMES,
  BULLET_POOL_SIZE,
  ITEM_POOL_SIZE,
  ITEM_AUTOCOLLECT_Y,
  ITEM_ATTRACT_RADIUS,
  ITEM_COLLECT_RADIUS,
  GRAZE_SCORE,
  POINT_ITEM_BASE,
  CHARACTER_STATS,
  DIFFICULTY_MULTIPLIERS,
} from './constants';
import { InputManager } from './input';
import { ObjectPool } from './pool';
import { circleCircle } from './collision';
import { spawnRadial, spawnAimed, applyDifficultyToPattern } from './patterns';

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

/** Internal player representation used by the engine each frame. */
interface EnginePlayer {
  x: number;
  y: number;
  character: Character;
  lives: number;
  bombs: number;
  power: number;
  graze: number;
  score: number;
  hiScore: number;
  focused: boolean;
  invulnFrames: number;
  deathbombWindow: number;
  meleeCooldown: number;
  dashCooldown: number;
  hitboxRadius: number;
  shootTimer: number;
}

/** Lightweight bullet struct stored in the pool. */
interface PoolBullet {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
  age: number;
  grazed: boolean; // true once this bullet has been grazed (only score once)
}

/** Lightweight item struct stored in the pool. */
interface PoolItem {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: Item['type'];
  value: number;
  autoCollect: boolean;
}

// ---------------------------------------------------------------------------
// Constants local to the engine
// ---------------------------------------------------------------------------

const SHOOT_INTERVAL = 4; // frames between shots
const PLAYER_BULLET_SPEED = 12;
const PLAYER_BULLET_RADIUS = 3;
const PLAYER_BULLET_COLOR = 0xffffff;
const ENEMY_BULLET_DEFAULT_RADIUS = 4;
const ITEM_FALL_SPEED = 1.5;
const ITEM_ATTRACT_SPEED = 6;
const SIDEBAR_BG_COLOR = 0x1a1a2e;
const PLAYFIELD_BG_COLOR = 0x0a0a14;

// Bullet color palette by sprite name fallback
const BULLET_COLOR_MAP: Record<string, number> = {
  'bullet-red': 0xff3333,
  'bullet-blue': 0x3333ff,
  'bullet-green': 0x33ff33,
  'bullet-yellow': 0xffff33,
  'bullet-purple': 0xaa33ff,
  'bullet-white': 0xffffff,
  'bullet-orange': 0xff8833,
  'bullet-cyan': 0x33ffff,
};

const ITEM_COLOR_MAP: Record<Item['type'], number> = {
  power: 0xff4444,
  point: 0x4488ff,
  life: 0xff88cc,
  bomb: 0x44ff44,
  fullPower: 0xffaa00,
};

// ---------------------------------------------------------------------------
// Zustand store interface (minimal surface so engine compiles independently)
// ---------------------------------------------------------------------------

/**
 * Subset of the Zustand store API that the engine pushes state into.
 * The real store (./store.ts) is created in parallel — we import lazily at
 * runtime so the engine module itself has no hard compile-time dependency.
 */
interface StoreApi {
  getState(): {
    screen: string;
    character: Character;
    difficulty: Difficulty;
  };
  setState(partial: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// DreamRiftEngine
// ---------------------------------------------------------------------------

export class DreamRiftEngine {
  // -- PixiJS --
  private app: Application | null = null;
  private playfieldContainer: Container | null = null;
  private sidebarContainer: Container | null = null;
  private bulletGfx: Graphics | null = null;
  private playerGfx: Graphics | null = null;
  private itemGfx: Graphics | null = null;
  private hitboxGfx: Graphics | null = null;

  // -- Game state --
  private player: EnginePlayer = this.createDefaultPlayer('rei');
  private difficulty: Difficulty = 'normal';
  private frameCount = 0;

  // -- Pools --
  private playerBullets!: ObjectPool<PoolBullet>;
  private enemyBullets!: ObjectPool<PoolBullet>;
  private items!: ObjectPool<PoolItem>;

  // -- Input --
  private input = new InputManager();
  private unbindInput: (() => void) | null = null;

  // -- Loop --
  private running = false;
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;

  // -- External store --
  private store: StoreApi | null = null;

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Initialise the PixiJS application, create pools, and set up rendering
   * containers. Call this once with the target canvas element.
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    // --- PixiJS application ---
    const app = new Application();
    await app.init({
      canvas,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: PLAYFIELD_BG_COLOR,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    this.app = app;

    // --- Containers ---
    // Playfield (left side)
    const playfield = new Container();
    playfield.label = 'playfield';
    app.stage.addChild(playfield);
    this.playfieldContainer = playfield;

    // Sidebar (right side)
    const sidebar = new Container();
    sidebar.label = 'sidebar';
    sidebar.x = PLAYFIELD_WIDTH;
    app.stage.addChild(sidebar);
    this.sidebarContainer = sidebar;

    // Sidebar background
    const sidebarBg = new Graphics();
    sidebarBg.rect(0, 0, CANVAS_WIDTH - PLAYFIELD_WIDTH, CANVAS_HEIGHT);
    sidebarBg.fill(SIDEBAR_BG_COLOR);
    sidebar.addChild(sidebarBg);

    // Graphics layers (back to front)
    this.bulletGfx = new Graphics();
    this.bulletGfx.label = 'bullets';
    playfield.addChild(this.bulletGfx);

    this.itemGfx = new Graphics();
    this.itemGfx.label = 'items';
    playfield.addChild(this.itemGfx);

    this.playerGfx = new Graphics();
    this.playerGfx.label = 'player';
    playfield.addChild(this.playerGfx);

    this.hitboxGfx = new Graphics();
    this.hitboxGfx.label = 'hitbox';
    playfield.addChild(this.hitboxGfx);

    // --- Pools ---
    this.playerBullets = new ObjectPool<PoolBullet>(BULLET_POOL_SIZE, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: PLAYER_BULLET_RADIUS,
      color: PLAYER_BULLET_COLOR,
      age: 0,
      grazed: false,
    }));

    this.enemyBullets = new ObjectPool<PoolBullet>(BULLET_POOL_SIZE, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: ENEMY_BULLET_DEFAULT_RADIUS,
      color: 0xff3333,
      age: 0,
      grazed: false,
    }));

    this.items = new ObjectPool<PoolItem>(ITEM_POOL_SIZE, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      type: 'point' as const,
      value: 1,
      autoCollect: false,
    }));

    // --- Input ---
    this.unbindInput = this.input.bind(window);

    // --- Try to resolve store lazily ---
    this.resolveStore();
  }

  /**
   * Start the game loop. Resets the player to the starting position and
   * begins the fixed-timestep RAF loop.
   */
  start(): void {
    if (!this.app) throw new Error('Engine not initialised — call init() first');

    this.resolveStore();
    const state = this.store?.getState();
    const character = state?.character ?? 'rei';
    const difficulty = state?.difficulty ?? 'normal';

    this.player = this.createDefaultPlayer(character);
    this.difficulty = difficulty;
    this.frameCount = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();

    this.playerBullets.releaseAll();
    this.enemyBullets.releaseAll();
    this.items.releaseAll();

    this.running = true;
    this.rafId = requestAnimationFrame(this.loop);
  }

  /** Pause the game loop (can be resumed with start()). */
  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Tear down the engine completely — destroy PixiJS app and unbind input. */
  destroy(): void {
    this.stop();
    this.unbindInput?.();
    this.unbindInput = null;
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.playfieldContainer = null;
    this.sidebarContainer = null;
    this.bulletGfx = null;
    this.playerGfx = null;
    this.itemGfx = null;
    this.hitboxGfx = null;
  }

  // --------------------------------------------------------------------------
  // Public API (called by stage manager / external systems)
  // --------------------------------------------------------------------------

  /**
   * Spawn enemy bullets from a given position using a BulletPatternDef.
   * The pattern is automatically scaled by the current difficulty multipliers.
   */
  spawnEnemyPattern(
    x: number,
    y: number,
    pattern: BulletPatternDef,
    targetX?: number,
    targetY?: number,
  ): void {
    const multipliers = DIFFICULTY_MULTIPLIERS[this.difficulty];
    const scaled = applyDifficultyToPattern(pattern, multipliers);

    const spawned =
      targetX !== undefined && targetY !== undefined
        ? spawnAimed(x, y, targetX, targetY, scaled)
        : spawnRadial(x, y, scaled);

    const color = BULLET_COLOR_MAP[scaled.bulletSprite] ?? 0xff3333;

    for (const s of spawned) {
      const b = this.enemyBullets.acquire();
      if (!b) break; // pool exhausted
      b.x = s.x;
      b.y = s.y;
      b.vx = s.vx;
      b.vy = s.vy;
      b.radius = ENEMY_BULLET_DEFAULT_RADIUS;
      b.color = color;
      b.age = 0;
      b.grazed = false;
    }
  }

  /**
   * Clear all active enemy bullets. Optionally converts them to point items
   * (used by bomb).
   */
  clearEnemyBullets(convertToItems = true): void {
    this.enemyBullets.forEachActive((b) => {
      if (convertToItems) {
        const item = this.items.acquire();
        if (item) {
          item.x = b.x;
          item.y = b.y;
          item.vx = 0;
          item.vy = ITEM_FALL_SPEED;
          item.type = 'point';
          item.value = 1;
          item.autoCollect = true;
        }
      }
      this.enemyBullets.release(b);
    });
  }

  /**
   * Attach an external Zustand-like store so the engine can push state
   * updates. This is optional — the engine runs without it.
   */
  setStore(store: StoreApi): void {
    this.store = store;
  }

  // --------------------------------------------------------------------------
  // Main loop
  // --------------------------------------------------------------------------

  private loop = (now: number): void => {
    if (!this.running) return;

    const delta = now - this.lastTime;
    this.lastTime = now;

    // Cap the accumulator to prevent spiral of death (e.g. tab was hidden)
    this.accumulator += Math.min(delta, FRAME_TIME * 5);

    while (this.accumulator >= FRAME_TIME) {
      this.fixedUpdate();
      this.accumulator -= FRAME_TIME;
    }

    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  // --------------------------------------------------------------------------
  // Fixed update (runs at TARGET_FPS)
  // --------------------------------------------------------------------------

  private fixedUpdate(): void {
    const input = this.input.getState();

    this.updatePlayer(input);
    this.updatePlayerBullets();
    this.updateEnemyBullets();
    this.updateItems();
    this.checkCollisions();
    this.tickCooldowns();

    this.input.update();
    this.frameCount++;

    // Push state to store every frame
    this.syncStore();
  }

  // --------------------------------------------------------------------------
  // Player update
  // --------------------------------------------------------------------------

  private updatePlayer(input: Readonly<InputState>): void {
    const p = this.player;
    const stats = CHARACTER_STATS[p.character];
    p.focused = input.focus;

    // --- Movement ---
    const speed = p.focused ? stats.focusSpeed : stats.speed;
    let dx = 0;
    let dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    // Normalise diagonal
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    p.x += dx * speed;
    p.y += dy * speed;

    // Clamp to playfield
    p.x = Math.max(0, Math.min(PLAYFIELD_WIDTH, p.x));
    p.y = Math.max(0, Math.min(PLAYFIELD_HEIGHT, p.y));

    // --- Shooting (X key) ---
    if (input.shot) {
      if (p.shootTimer <= 0) {
        this.spawnPlayerBullet();
        p.shootTimer = SHOOT_INTERVAL;
      }
    }

    // --- Melee (Z key) ---
    if (this.input.justPressed('melee') && p.meleeCooldown <= 0) {
      this.performMelee();
      p.meleeCooldown = MELEE_COOLDOWN;
      // Grant a few i-frames during melee swing
      if (p.invulnFrames < MELEE_INVULN_FRAMES) {
        p.invulnFrames = MELEE_INVULN_FRAMES;
      }
    }

    // --- Dash (A key) ---
    if (this.input.justPressed('dash') && p.dashCooldown <= 0) {
      this.performDash(dx, dy);
      p.dashCooldown = DASH_COOLDOWN;
    }

    // --- Bomb (S key) ---
    if (this.input.justPressed('bomb') && p.bombs > 0) {
      this.performBomb();
    }
  }

  // --------------------------------------------------------------------------
  // Player actions
  // --------------------------------------------------------------------------

  private spawnPlayerBullet(): void {
    const p = this.player;

    // Spawn two side-by-side bullets for a basic shot type
    const offsets = [-6, 6];
    for (const ox of offsets) {
      const b = this.playerBullets.acquire();
      if (!b) break;
      b.x = p.x + ox;
      b.y = p.y - 8;
      b.vx = 0;
      b.vy = -PLAYER_BULLET_SPEED;
      b.radius = PLAYER_BULLET_RADIUS;
      b.color = PLAYER_BULLET_COLOR;
      b.age = 0;
      b.grazed = false;
    }
  }

  private performMelee(): void {
    const p = this.player;
    const arc = p.character === 'rei' ? MELEE_ARC_REI : MELEE_ARC_YUME;
    const range = MELEE_RANGE;

    // Destroy enemy bullets within the melee arc (facing upward)
    const facingAngle = -Math.PI / 2; // upward
    const halfArc = arc / 2;

    this.enemyBullets.forEachActive((b) => {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range) return;

      const angle = Math.atan2(dy, dx);
      let diff = angle - facingAngle;
      // Normalise to [-PI, PI]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      if (Math.abs(diff) <= halfArc) {
        // Convert to point item
        const item = this.items.acquire();
        if (item) {
          item.x = b.x;
          item.y = b.y;
          item.vx = 0;
          item.vy = ITEM_FALL_SPEED;
          item.type = 'point';
          item.value = 2; // melee conversion gives bonus
          item.autoCollect = false;
        }
        this.enemyBullets.release(b);
      }
    });
  }

  private performDash(inputDx: number, inputDy: number): void {
    const p = this.player;

    // Determine dash direction — default to upward if no direction held
    let ddx = inputDx;
    let ddy = inputDy;
    if (ddx === 0 && ddy === 0) {
      ddy = -1; // dash upward by default
    }
    // Normalise
    const len = Math.sqrt(ddx * ddx + ddy * ddy);
    if (len > 0) {
      ddx /= len;
      ddy /= len;
    }

    p.x += ddx * DASH_DISTANCE;
    p.y += ddy * DASH_DISTANCE;

    // Clamp to playfield after teleport
    p.x = Math.max(0, Math.min(PLAYFIELD_WIDTH, p.x));
    p.y = Math.max(0, Math.min(PLAYFIELD_HEIGHT, p.y));

    // Grant i-frames
    if (p.invulnFrames < DASH_INVULN_FRAMES) {
      p.invulnFrames = DASH_INVULN_FRAMES;
    }
  }

  private performBomb(): void {
    const p = this.player;
    p.bombs--;
    p.invulnFrames = Math.max(p.invulnFrames, PLAYER_INVULN_FRAMES);
    p.deathbombWindow = 0;

    // Clear all enemy bullets, converting to point items
    this.clearEnemyBullets(true);

    this.syncStore();
  }

  // --------------------------------------------------------------------------
  // Bullet / Item updates
  // --------------------------------------------------------------------------

  private updatePlayerBullets(): void {
    this.playerBullets.forEachActive((b) => {
      b.x += b.vx;
      b.y += b.vy;
      b.age++;

      // Off-screen cull
      if (b.y < -16 || b.y > PLAYFIELD_HEIGHT + 16 || b.x < -16 || b.x > PLAYFIELD_WIDTH + 16) {
        this.playerBullets.release(b);
      }
    });
  }

  private updateEnemyBullets(): void {
    this.enemyBullets.forEachActive((b) => {
      b.x += b.vx;
      b.y += b.vy;
      b.age++;

      // Off-screen cull (generous margin)
      if (
        b.x < -32 ||
        b.x > PLAYFIELD_WIDTH + 32 ||
        b.y < -32 ||
        b.y > PLAYFIELD_HEIGHT + 32
      ) {
        this.enemyBullets.release(b);
      }
    });
  }

  private updateItems(): void {
    const p = this.player;

    this.items.forEachActive((item) => {
      // Auto-collect if player is above the collection line or item is flagged
      if (item.autoCollect || p.y < ITEM_AUTOCOLLECT_Y) {
        // Attract toward player
        const dx = p.x - item.x;
        const dy = p.y - item.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          item.vx = (dx / dist) * ITEM_ATTRACT_SPEED;
          item.vy = (dy / dist) * ITEM_ATTRACT_SPEED;
        }
      } else {
        // Check if player is within attraction radius
        const dx = p.x - item.x;
        const dy = p.y - item.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ITEM_ATTRACT_RADIUS) {
          if (dist > 1) {
            item.vx = (dx / dist) * ITEM_ATTRACT_SPEED;
            item.vy = (dy / dist) * ITEM_ATTRACT_SPEED;
          }
        } else {
          // Normal fall
          item.vx = 0;
          item.vy = ITEM_FALL_SPEED;
        }
      }

      item.x += item.vx;
      item.y += item.vy;

      // Off-screen cull
      if (item.y > PLAYFIELD_HEIGHT + 32) {
        this.items.release(item);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Collision detection
  // --------------------------------------------------------------------------

  private checkCollisions(): void {
    const p = this.player;
    const grazeRadius = DIFFICULTY_MULTIPLIERS[this.difficulty].grazeWindow;

    // --- Enemy bullets vs player ---
    this.enemyBullets.forEachActive((b) => {
      // Graze check (wider radius)
      if (!b.grazed) {
        if (circleCircle(p.x, p.y, grazeRadius, b.x, b.y, b.radius)) {
          b.grazed = true;
          p.graze++;
          p.score += GRAZE_SCORE;
        }
      }

      // Hit check (only if not invulnerable)
      if (p.invulnFrames <= 0) {
        if (circleCircle(p.x, p.y, p.hitboxRadius, b.x, b.y, b.radius)) {
          this.enemyBullets.release(b);
          this.onPlayerHit();
        }
      }
    });

    // --- Items vs player ---
    this.items.forEachActive((item) => {
      const dx = p.x - item.x;
      const dy = p.y - item.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ITEM_COLLECT_RADIUS + 8) {
        this.collectItem(item);
        this.items.release(item);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Player damage / death
  // --------------------------------------------------------------------------

  private onPlayerHit(): void {
    const p = this.player;

    // Start deathbomb window
    p.deathbombWindow = DEATHBOMB_WINDOW;

    // Actually lose a life after the deathbomb window expires.
    // For simplicity we handle it immediately but check deathbomb on bomb use.
    p.lives--;
    p.invulnFrames = PLAYER_INVULN_FRAMES;

    // Scatter some power items on death
    const powerLoss = Math.min(p.power, 16);
    p.power = Math.max(0, p.power - powerLoss);
    for (let i = 0; i < Math.ceil(powerLoss / 2); i++) {
      const item = this.items.acquire();
      if (!item) break;
      item.x = p.x + (Math.random() - 0.5) * 64;
      item.y = p.y + (Math.random() - 0.5) * 32;
      item.vx = (Math.random() - 0.5) * 2;
      item.vy = -2 - Math.random() * 2;
      item.type = 'power';
      item.value = 1;
      item.autoCollect = false;
    }

    // Reset position
    p.x = PLAYER_START_X;
    p.y = PLAYER_START_Y;

    // Check game over
    if (p.lives < 0) {
      this.onGameOver();
    }

    this.syncStore();
  }

  private onGameOver(): void {
    this.stop();
    this.store?.setState({ screen: 'gameOver' });
  }

  // --------------------------------------------------------------------------
  // Item collection
  // --------------------------------------------------------------------------

  private collectItem(item: PoolItem): void {
    const p = this.player;
    switch (item.type) {
      case 'power':
        p.power = Math.min(POWER_MAX, p.power + item.value);
        break;
      case 'point':
        p.score += POINT_ITEM_BASE * item.value;
        break;
      case 'life':
        p.lives = Math.min(p.lives + 1, 8);
        break;
      case 'bomb':
        p.bombs = Math.min(p.bombs + 1, 8);
        break;
      case 'fullPower':
        p.power = POWER_MAX;
        break;
    }

    // Hi-score tracking
    if (p.score > p.hiScore) {
      p.hiScore = p.score;
    }
  }

  // --------------------------------------------------------------------------
  // Cooldown ticking
  // --------------------------------------------------------------------------

  private tickCooldowns(): void {
    const p = this.player;
    if (p.invulnFrames > 0) p.invulnFrames--;
    if (p.deathbombWindow > 0) p.deathbombWindow--;
    if (p.meleeCooldown > 0) p.meleeCooldown--;
    if (p.dashCooldown > 0) p.dashCooldown--;
    if (p.shootTimer > 0) p.shootTimer--;
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  private render(): void {
    this.renderBullets();
    this.renderItems();
    this.renderPlayer();
  }

  private renderBullets(): void {
    const gfx = this.bulletGfx;
    if (!gfx) return;
    gfx.clear();

    // Player bullets
    this.playerBullets.forEachActive((b) => {
      gfx.rect(b.x - 2, b.y - 4, 4, 8);
      gfx.fill(b.color);
    });

    // Enemy bullets
    this.enemyBullets.forEachActive((b) => {
      gfx.circle(b.x, b.y, b.radius);
      gfx.fill(b.color);
    });
  }

  private renderItems(): void {
    const gfx = this.itemGfx;
    if (!gfx) return;
    gfx.clear();

    this.items.forEachActive((item) => {
      const color = ITEM_COLOR_MAP[item.type] ?? 0xffffff;
      gfx.circle(item.x, item.y, 6);
      gfx.fill(color);
    });
  }

  private renderPlayer(): void {
    const pgfx = this.playerGfx;
    const hgfx = this.hitboxGfx;
    if (!pgfx || !hgfx) return;

    pgfx.clear();
    hgfx.clear();

    const p = this.player;

    // Blink during invulnerability
    if (p.invulnFrames > 0 && this.frameCount % 4 < 2) {
      // skip rendering every other 2 frames when invuln
    } else {
      // Main body — triangle placeholder
      const color = p.character === 'rei' ? 0xff4466 : 0x66aaff;
      pgfx.poly([
        { x: p.x, y: p.y - 12 },
        { x: p.x - 8, y: p.y + 8 },
        { x: p.x + 8, y: p.y + 8 },
      ]);
      pgfx.fill(color);
    }

    // Hitbox indicator (visible when focused)
    if (p.focused) {
      hgfx.circle(p.x, p.y, p.hitboxRadius + 4);
      hgfx.fill({ color: 0xffffff, alpha: 0.6 });
      hgfx.circle(p.x, p.y, p.hitboxRadius);
      hgfx.fill(0xff0000);
    }

    // Melee cooldown indicator — small arc
    if (p.meleeCooldown > 0) {
      const progress = 1 - p.meleeCooldown / MELEE_COOLDOWN;
      hgfx.arc(p.x, p.y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      hgfx.stroke({ color: 0xffff00, width: 1, alpha: 0.5 });
    }
  }

  // --------------------------------------------------------------------------
  // Store sync
  // --------------------------------------------------------------------------

  private syncStore(): void {
    if (!this.store) return;
    const p = this.player;
    this.store.setState({
      lives: p.lives,
      bombs: p.bombs,
      power: p.power,
      graze: p.graze,
      score: p.score,
      hiScore: p.hiScore,
      playerX: p.x,
      playerY: p.y,
      enemyBulletCount: this.enemyBullets.activeCount,
      frameCount: this.frameCount,
    });
  }

  /**
   * Attempt to import and resolve the Zustand store. Called lazily so the
   * engine module has no static import that would fail if store.ts is still
   * being written.
   */
  private resolveStore(): void {
    if (this.store) return;
    try {
      // Dynamic require — works in both bundler and SSR contexts.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('./store');
      if (mod && typeof mod.useDreamRiftStore === 'function') {
        // Zustand stores expose getState / setState on the hook itself
        this.store = mod.useDreamRiftStore as unknown as StoreApi;
      }
    } catch {
      // Store not available yet — that is fine, we run without it.
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private createDefaultPlayer(character: Character): EnginePlayer {
    const stats = CHARACTER_STATS[character];
    return {
      x: PLAYER_START_X,
      y: PLAYER_START_Y,
      character,
      lives: LIVES_START,
      bombs: BOMBS_START,
      power: 0,
      graze: 0,
      score: 0,
      hiScore: 0,
      focused: false,
      invulnFrames: 0,
      deathbombWindow: 0,
      meleeCooldown: 0,
      dashCooldown: 0,
      hitboxRadius: stats.hitboxRadius,
      shootTimer: 0,
    };
  }
}
