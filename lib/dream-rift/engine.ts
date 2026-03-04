/**
 * DreamRiftEngine — Core game engine for the Dream Rift bullet hell.
 *
 * Manages the PixiJS application, fixed-timestep game loop, player mechanics,
 * bullet pools, collision detection, and rendering. Communicates game state
 * changes to the Zustand store.
 */

import { Application, Graphics, Container, Sprite, Texture } from 'pixi.js';
import { generatePlayerTextures, type PlayerTextures } from './sprites';
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
import { StageManager } from './stage-manager';
import { STAGES } from './data/stages';

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

/** Live enemy entity stored in the pool. */
interface PoolEnemy {
  active: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  color: number;
  radius: number;
  /** Movement path waypoints. */
  path: { x: number; y: number }[];
  /** Current waypoint index being moved toward. */
  pathIndex: number;
  /** Speed along path (pixels per frame). */
  pathSpeed: number;
  /** Bullet patterns this enemy fires. */
  patterns: BulletPatternDef[];
  /** Timer per pattern for firing intervals. */
  patternTimers: number[];
  /** Total frames this enemy has been alive. */
  age: number;
  /** Item drops on death. */
  dropTable: { type: Item['type']; chance: number; count: number }[];
  /** Is this a boss entity? */
  isBoss: boolean;
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
const ENEMY_POOL_SIZE_INTERNAL = 64;
const ENEMY_PATH_SPEED = 1.2;
const ENEMY_DEFAULT_RADIUS = 12;
const PLAYER_BULLET_DAMAGE = 10;
const SIDEBAR_BG_COLOR = 0x1a1a2e;
const PLAYFIELD_BG_COLOR = 0x0a0a14;

// Character sprite image paths (external images override code-generated sprites)
const CHARACTER_SPRITE_PATHS: Partial<Record<Character, string>> = {
  rei: '/dream-rift/sprites/rei.png',
};

// Stage background image paths (indexed by stage number, 1-based)
const STAGE_BACKGROUND_PATHS: Record<number, string> = {
  1: '/dream-rift/backgrounds/stage1.jpg',
};

// Target display size for character sprites (pixels on screen)
const PLAYER_SPRITE_SIZE = 48;

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

const ENEMY_COLOR_MAP: Record<string, number> = {
  fairy_basic: 0x88aaff,
  fairy_radial: 0xff8888,
  fairy_spiral: 0xaa88ff,
  fairy_wall: 0xffff66,
  ink_spirit: 0x9966cc,
  page_phantom: 0xccccff,
  gear_drone: 0xff8833,
  spring_sentinel: 0xffcc33,
  mirror_wisp: 0x33ffff,
  reflection_shard: 0xeeeeff,
  flame_dancer: 0xff4400,
  carnival_puppet: 0xffaa33,
  void_weaver: 0xaa33ff,
  rift_fragment: 0x33ffcc,
  aurora_spark: 0x66ddff,
  boss: 0xff3366,
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
    stage: number;
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
  private playerSprite: Sprite | null = null;
  private playerTextures: PlayerTextures | null = null;
  private enemyGfx: Graphics | null = null;
  private bgSprite1: Sprite | null = null;
  private bgSprite2: Sprite | null = null;
  private bgScrollY = 0;
  private bgScrollSpeed = 0.5;
  private bgHeight = 0;
  private animFrame = 0;
  private animTimer = 0;

  // -- Enemies & stage --
  private enemies!: ObjectPool<PoolEnemy>;
  private stageManager: StageManager | null = null;

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
      resolution: 1,
      autoDensity: false,
      preference: 'webgl',
      autoStart: false,
    });
    this.app = app;

    // --- Containers ---
    // Playfield (left side) — clipped to playfield bounds
    const playfield = new Container();
    playfield.label = 'playfield';
    const playfieldMask = new Graphics();
    playfieldMask.rect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    playfieldMask.fill(0xffffff);
    playfield.addChild(playfieldMask);
    playfield.mask = playfieldMask;
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

    // Background sprites (two copies for seamless vertical scroll)
    const bg1 = new Sprite();
    bg1.label = 'bg1';
    bg1.visible = false;
    playfield.addChild(bg1);
    this.bgSprite1 = bg1;

    const bg2 = new Sprite();
    bg2.label = 'bg2';
    bg2.visible = false;
    playfield.addChild(bg2);
    this.bgSprite2 = bg2;

    // Dark overlay to keep gameplay elements readable over the background
    const bgOverlay = new Graphics();
    bgOverlay.rect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    bgOverlay.fill({ color: 0x000000, alpha: 0.3 });
    playfield.addChild(bgOverlay);

    // Graphics layers (back to front)
    this.enemyGfx = new Graphics();
    this.enemyGfx.label = 'enemies';
    playfield.addChild(this.enemyGfx);

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

    // --- Player sprite (added between player graphics and hitbox) ---
    const sprite = new Sprite();
    sprite.label = 'playerSprite';
    sprite.anchor.set(0.5, 0.5);
    sprite.visible = false;
    playfield.addChildAt(sprite, playfield.children.indexOf(this.hitboxGfx));
    this.playerSprite = sprite;

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

    this.enemies = new ObjectPool<PoolEnemy>(ENEMY_POOL_SIZE_INTERNAL, () => ({
      active: false,
      x: 0,
      y: 0,
      hp: 30,
      maxHp: 30,
      color: 0x88aaff,
      radius: ENEMY_DEFAULT_RADIUS,
      path: [],
      pathIndex: 0,
      pathSpeed: ENEMY_PATH_SPEED,
      patterns: [],
      patternTimers: [],
      age: 0,
      dropTable: [],
      isBoss: false,
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
    this.animFrame = 0;
    this.animTimer = 0;

    // Generate sprite textures for the selected character (code-generated fallback)
    this.playerTextures = generatePlayerTextures(character);
    if (this.playerSprite && this.playerTextures) {
      this.playerSprite.texture = this.playerTextures.idle[0];
      this.playerSprite.visible = true;
    }

    // Load external sprite image if one exists for this character
    this.loadCharacterSprite(character);

    // Load stage background
    const stageNum = state?.stage ?? 1;
    this.loadStageBackground(stageNum);

    this.lastTime = performance.now();

    this.playerBullets.releaseAll();
    this.enemyBullets.releaseAll();
    this.items.releaseAll();
    this.enemies.releaseAll();

    // Initialise stage manager for the current stage
    const stageDef = STAGES[stageNum];
    if (stageDef) {
      this.stageManager = new StageManager(stageDef);
      this.stageManager.setStore({
        nextStage: () => this.store?.setState({ screen: 'stageResult' }),
      });
      this.stageManager.startPhase('intro');
    }

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
      this.app.destroy(false, { children: true });
      this.app = null;
    }
    this.playfieldContainer = null;
    this.sidebarContainer = null;
    this.bulletGfx = null;
    this.playerGfx = null;
    this.itemGfx = null;
    this.hitboxGfx = null;
    this.playerSprite = null;
    this.playerTextures = null;
    this.bgSprite1 = null;
    this.bgSprite2 = null;
    this.stageManager = null;
    this.enemyGfx = null;
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
   * Spawn a live enemy entity. Called by the StageManager when a wave
   * enemy's delay timer fires.
   */
  spawnEnemyEntity(def: {
    type: string;
    x: number;
    y: number;
    hp: number;
    patterns: BulletPatternDef[];
    path: { x: number; y: number }[];
    dropTable: { type: Item['type']; chance: number; count: number }[];
  }): void {
    const e = this.enemies.acquire();
    if (!e) return; // pool exhausted

    e.x = def.path.length > 0 ? def.path[0].x : def.x;
    e.y = def.path.length > 0 ? def.path[0].y : def.y;
    e.hp = def.hp;
    e.maxHp = def.hp;
    e.color = ENEMY_COLOR_MAP[def.type] ?? 0x88aaff;
    e.radius = ENEMY_DEFAULT_RADIUS;
    e.path = def.path;
    e.pathIndex = def.path.length > 0 ? 1 : 0;
    e.pathSpeed = ENEMY_PATH_SPEED;
    e.patterns = def.patterns;
    e.patternTimers = def.patterns.map(() => 0);
    e.age = 0;
    e.dropTable = def.dropTable;
    e.isBoss = false;
  }

  /**
   * Attach an external Zustand-like store so the engine can push state
   * updates. This is optional — the engine runs without it.
   */
  setStore(store: StoreApi): void {
    this.store = store;
  }

  // --------------------------------------------------------------------------
  // Character sprite loading
  // --------------------------------------------------------------------------

  /**
   * Load an external sprite image for the given character. When loaded, it
   * overrides the code-generated pixel art textures for all movement states.
   */
  private loadCharacterSprite(character: Character): void {
    const spritePath = CHARACTER_SPRITE_PATHS[character];
    if (!spritePath) return;

    // Load via an HTMLImageElement for maximum compatibility
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!this.playerSprite || !this.playerTextures) return;

      const texture = Texture.from(img);

      // Scale the sprite to the target display size, preserving aspect ratio
      const scale = PLAYER_SPRITE_SIZE / Math.max(img.width, img.height);
      const scaledW = img.width * scale;
      const scaledH = img.height * scale;

      // Override all texture slots with the loaded image
      this.playerTextures!.idle = [texture, texture, texture, texture];
      this.playerTextures!.left = texture;
      this.playerTextures!.right = texture;
      this.playerTextures!.width = scaledW;
      this.playerTextures!.height = scaledH;

      // Apply to the current sprite
      this.playerSprite!.texture = texture;
      this.playerSprite!.width = scaledW;
      this.playerSprite!.height = scaledH;
    };
    img.src = spritePath;
  }

  // --------------------------------------------------------------------------
  // Background
  // --------------------------------------------------------------------------

  /**
   * Load a background image for the given stage. Uses two stacked sprites
   * for seamless vertical scrolling. Falls back to no background if the
   * stage has no image configured.
   */
  private loadStageBackground(stageNum: number): void {
    this.bgScrollY = 0;

    const bgPath = STAGE_BACKGROUND_PATHS[stageNum];
    if (!bgPath) {
      if (this.bgSprite1) this.bgSprite1.visible = false;
      if (this.bgSprite2) this.bgSprite2.visible = false;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!this.bgSprite1 || !this.bgSprite2) return;

      const texture = Texture.from(img);

      // Scale texture to fill playfield width, preserving aspect ratio
      const scale = PLAYFIELD_WIDTH / img.width;
      const scaledHeight = img.height * scale;

      this.bgSprite1.texture = texture;
      this.bgSprite1.width = PLAYFIELD_WIDTH;
      this.bgSprite1.height = scaledHeight;
      this.bgSprite1.visible = true;

      this.bgSprite2.texture = texture;
      this.bgSprite2.width = PLAYFIELD_WIDTH;
      this.bgSprite2.height = scaledHeight;
      this.bgSprite2.visible = true;

      this.bgHeight = scaledHeight;

      // Position: sprite2 sits directly above sprite1
      this.bgSprite1.y = 0;
      this.bgSprite2.y = -scaledHeight;
    };
    img.src = bgPath;
  }

  // --------------------------------------------------------------------------
  // Main loop
  // --------------------------------------------------------------------------

  private loop = (now: number): void => {
    if (!this.running || !this.app) return;

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
    this.stageManager?.update(this);
    this.updateEnemies();
    this.checkCollisions();
    this.tickCooldowns();
    this.updateBackground();

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
  // Enemy update
  // --------------------------------------------------------------------------

  private updateEnemies(): void {
    this.enemies.forEachActive((e) => {
      e.age++;

      // --- Path movement ---
      if (e.path.length > 0 && e.pathIndex < e.path.length) {
        const target = e.path[e.pathIndex];
        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < e.pathSpeed) {
          e.x = target.x;
          e.y = target.y;
          e.pathIndex++;
        } else {
          e.x += (dx / dist) * e.pathSpeed;
          e.y += (dy / dist) * e.pathSpeed;
        }
      }

      // --- Pattern firing ---
      for (let i = 0; i < e.patterns.length; i++) {
        e.patternTimers[i]++;
        const pattern = e.patterns[i];
        if (e.patternTimers[i] >= pattern.interval) {
          e.patternTimers[i] = 0;
          this.spawnEnemyPattern(e.x, e.y, pattern, this.player.x, this.player.y);
        }
      }

      // --- Off-screen cull ---
      if (
        e.y > PLAYFIELD_HEIGHT + 48 ||
        e.x < -48 ||
        e.x > PLAYFIELD_WIDTH + 48
      ) {
        this.enemies.release(e);
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

    // --- Player bullets vs enemies ---
    this.playerBullets.forEachActive((b) => {
      this.enemies.forEachActive((e) => {
        if (!b.active) return; // already consumed by a prior enemy hit
        if (circleCircle(b.x, b.y, b.radius, e.x, e.y, e.radius)) {
          this.playerBullets.release(b);
          e.hp -= PLAYER_BULLET_DAMAGE;
          if (e.hp <= 0) {
            this.onEnemyDeath(e);
            this.enemies.release(e);
          }
        }
      });
    });

    // --- Player bullets vs boss ---
    const boss = this.stageManager?.getActiveBoss();
    if (boss) {
      const bossRadius = 24;
      this.playerBullets.forEachActive((b) => {
        if (circleCircle(b.x, b.y, b.radius, boss.position.x, boss.position.y, bossRadius)) {
          this.playerBullets.release(b);
          this.stageManager?.damageBoss(PLAYER_BULLET_DAMAGE);
        }
      });
    }

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
  // Enemy death
  // --------------------------------------------------------------------------

  private onEnemyDeath(e: PoolEnemy): void {
    // Score for killing an enemy
    this.player.score += 1000;
    if (this.player.score > this.player.hiScore) {
      this.player.hiScore = this.player.score;
    }

    // Spawn item drops from drop table
    for (const drop of e.dropTable) {
      if (Math.random() > drop.chance) continue;
      for (let i = 0; i < drop.count; i++) {
        const item = this.items.acquire();
        if (!item) break;
        item.x = e.x + (Math.random() - 0.5) * 24;
        item.y = e.y + (Math.random() - 0.5) * 16;
        item.vx = (Math.random() - 0.5) * 1.5;
        item.vy = -1.5 - Math.random();
        item.type = drop.type;
        item.value = 1;
        item.autoCollect = false;
      }
    }
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

  /** Scroll the background downward, wrapping seamlessly. */
  private updateBackground(): void {
    if (!this.bgSprite1 || !this.bgSprite2 || !this.bgSprite1.visible) return;
    if (this.bgHeight <= 0) return;

    this.bgScrollY += this.bgScrollSpeed;

    // Wrap when the scroll exceeds the image height
    if (this.bgScrollY >= this.bgHeight) {
      this.bgScrollY -= this.bgHeight;
    }

    this.bgSprite1.y = this.bgScrollY;
    this.bgSprite2.y = this.bgScrollY - this.bgHeight;
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  private render(): void {
    if (!this.app) return;

    this.renderEnemies();
    this.renderBullets();
    this.renderItems();
    this.renderPlayer();

    // With autoStart: false, we must drive rendering ourselves
    try {
      this.app.render();
    } catch {
      // WebGL context lost (e.g. React strict mode remount) — stop gracefully
      this.stop();
    }
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

  private renderEnemies(): void {
    const gfx = this.enemyGfx;
    if (!gfx) return;
    gfx.clear();

    // Regular enemies
    this.enemies.forEachActive((e) => {
      // Body
      gfx.circle(e.x, e.y, e.radius);
      gfx.fill(e.color);
      // Outline
      gfx.circle(e.x, e.y, e.radius);
      gfx.stroke({ color: 0xffffff, width: 1, alpha: 0.4 });

      // HP bar (only show if damaged)
      if (e.hp < e.maxHp) {
        const barW = e.radius * 2;
        const barH = 3;
        const hpRatio = Math.max(0, e.hp / e.maxHp);
        gfx.rect(e.x - barW / 2, e.y - e.radius - 6, barW, barH);
        gfx.fill({ color: 0x333333, alpha: 0.7 });
        gfx.rect(e.x - barW / 2, e.y - e.radius - 6, barW * hpRatio, barH);
        gfx.fill(0x44ff44);
      }
    });

    // Boss entity
    const boss = this.stageManager?.getActiveBoss();
    if (boss) {
      const bx = boss.position.x;
      const by = boss.position.y;
      const bossRadius = 24;

      // Boss body
      gfx.circle(bx, by, bossRadius);
      gfx.fill(ENEMY_COLOR_MAP.boss);
      gfx.circle(bx, by, bossRadius);
      gfx.stroke({ color: 0xffffff, width: 2, alpha: 0.6 });
      // Inner glow
      gfx.circle(bx, by, bossRadius - 4);
      gfx.fill({ color: 0xffffff, alpha: 0.15 });

      // Boss HP bar at top of playfield
      const hpRatio = this.stageManager?.getBossHpRatio() ?? 0;
      const barW = 200;
      const barH = 4;
      const barX = PLAYFIELD_WIDTH / 2 - barW / 2;
      const barY = 16;
      gfx.rect(barX, barY, barW, barH);
      gfx.fill({ color: 0x333333, alpha: 0.7 });
      gfx.rect(barX, barY, barW * hpRatio, barH);
      gfx.fill(0xff3366);
    }
  }

  private renderPlayer(): void {
    const hgfx = this.hitboxGfx;
    const sprite = this.playerSprite;
    const textures = this.playerTextures;
    if (!hgfx) return;

    hgfx.clear();

    const p = this.player;
    const input = this.input.getState();

    // --- Sprite animation ---
    if (sprite && textures) {
      // Advance idle animation timer (~8 frames per animation frame)
      this.animTimer++;
      if (this.animTimer >= 8) {
        this.animTimer = 0;
        this.animFrame = (this.animFrame + 1) % textures.idle.length;
      }

      // Pick frame based on movement — slight tilt when strafing
      if (input.left && !input.right) {
        sprite.texture = textures.left;
        sprite.rotation = -0.1;
      } else if (input.right && !input.left) {
        sprite.texture = textures.right;
        sprite.rotation = 0.1;
      } else {
        sprite.texture = textures.idle[this.animFrame];
        sprite.rotation = 0;
      }

      // Ensure sprite stays at the correct display size
      sprite.width = textures.width;
      sprite.height = textures.height;

      sprite.x = p.x;
      sprite.y = p.y;

      // Blink during invulnerability
      sprite.visible = !(p.invulnFrames > 0 && this.frameCount % 4 < 2);
    }

    // Hitbox indicator (visible when focused)
    if (p.focused) {
      // Outer glow ring — rotates slowly
      const angle = this.frameCount * 0.03;
      hgfx.circle(p.x, p.y, p.hitboxRadius + 6);
      hgfx.fill({ color: 0xffffff, alpha: 0.15 });
      hgfx.circle(p.x, p.y, p.hitboxRadius + 4);
      hgfx.fill({ color: 0xffffff, alpha: 0.3 });
      // Inner hitbox dot
      hgfx.circle(p.x, p.y, p.hitboxRadius);
      hgfx.fill(0xff0000);
      // Rotating cross-hair lines
      for (let i = 0; i < 4; i++) {
        const a = angle + (i * Math.PI) / 2;
        const inner = p.hitboxRadius + 6;
        const outer = p.hitboxRadius + 10;
        hgfx.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner);
        hgfx.lineTo(p.x + Math.cos(a) * outer, p.y + Math.sin(a) * outer);
        hgfx.stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
      }
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
