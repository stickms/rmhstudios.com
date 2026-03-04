# Dream Rift Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 6-stage Touhou-style bullet hell game ("Dream Rift") with PixiJS rendering, two playable characters, data-driven bullet patterns, and a dream-world invasion story — integrated into the rmhstudios Next.js platform.

**Architecture:** Standalone PixiJS game engine running inside a Next.js route (`/app/dream-rift/`). Fixed-timestep game loop with entity-component pattern, object-pooled bullets, and data-driven danmaku definitions. Zustand store for persistent game state. Howler.js for audio. UNO-MCP plugin for narrative script writing (run as parallel agent).

**Tech Stack:** Next.js 16 (App Router), PixiJS 8, TypeScript, Zustand, Howler.js, Prisma (PostgreSQL), Tailwind CSS, UNO-MCP

**Design Doc:** `docs/plans/2026-03-02-dream-rift-design.md`

---

## Pre-Implementation: Install Dependencies & UNO-MCP

### Task 0A: Install PixiJS and UNO-MCP

**Files:**
- Modify: `package.json`
- Modify: `.claude/settings.json` (or equivalent MCP config)

**Step 1: Install PixiJS 8**

```bash
pnpm add pixi.js@^8
```

**Step 2: Install UNO-MCP plugin**

```bash
npx -y @smithery/cli install @MushroomFleet/uno-mcp --client claude
```

**Step 3: Verify installations**

```bash
pnpm list pixi.js
```

Expected: `pixi.js@8.x.x`

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add pixi.js and UNO-MCP dependencies for Dream Rift"
```

---

### Task 0B: Launch Story Writing Agent (Parallel)

**This task runs in parallel with all engine tasks below.** A dedicated agent writes the full game script using UNO-MCP for narrative enhancement.

**Agent instructions:**
- Write the complete Dream Rift game script covering all 6 stages
- Two story routes: Rei (confrontational) and Yume (investigative)
- Each stage needs: intro dialogue, mid-boss encounter dialogue, boss pre-fight dialogue, boss defeat dialogue
- Stage 6 Rift Core must feel stunningly beautiful — describe visuals in stage directions
- The Dreamer's motivation differs per route
- Output to: `lib/dream-rift/data/script.ts` as typed constants
- Use Touhou-style tone: dramatic but with moments of levity, character personality shines through

**Output format:**

```typescript
export interface DialogueLine {
  speaker: 'rei' | 'yume' | 'narrator' | string; // boss names as strings
  text: string;
  portrait?: string; // sprite key
  emotion?: 'neutral' | 'angry' | 'surprised' | 'happy' | 'sad';
}

export interface StageScript {
  stageIntro: DialogueLine[];
  midBossEncounter: { rei: DialogueLine[]; yume: DialogueLine[] };
  bossEncounter: { rei: DialogueLine[]; yume: DialogueLine[] };
  bossDefeat: { rei: DialogueLine[]; yume: DialogueLine[] };
  stageOutro: { rei: DialogueLine[]; yume: DialogueLine[] };
}

export const SCRIPT: Record<number, StageScript> = { /* ... */ };
```

---

## Phase 1: Core Engine Foundation

### Task 1: Type Definitions

**Files:**
- Create: `lib/dream-rift/types.ts`

**Step 1: Write type definitions**

```typescript
// lib/dream-rift/types.ts

// --- Game States ---
export type GameScreen = 'title' | 'charSelect' | 'difficultySelect' | 'playing' | 'paused' | 'dialogue' | 'stageResult' | 'gameOver' | 'continue';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'lunatic';
export type Character = 'rei' | 'yume';

// --- Entities ---
export interface Vec2 {
  x: number;
  y: number;
}

export interface Entity {
  id: number;
  position: Vec2;
  velocity: Vec2;
  active: boolean;
  sprite: string;
}

export interface PlayerState extends Entity {
  character: Character;
  lives: number;
  bombs: number;
  power: number;       // 0-128
  graze: number;
  score: number;
  hiScore: number;
  focused: boolean;
  invulnFrames: number;
  deathbombWindow: number;
  meleeCooldown: number;
  specialCooldown: number;
  dashCooldown: number;
  hitboxRadius: number; // 2px for Rei (smaller), 2.5px for Yume
}

export interface Enemy extends Entity {
  hp: number;
  maxHp: number;
  type: string;
  patterns: BulletPatternDef[];
  currentPatternIndex: number;
  patternTimer: number;
  dropTable: ItemDrop[];
}

export interface Boss extends Enemy {
  name: string;
  spellCards: SpellCard[];
  currentSpellIndex: number;
  phaseHp: number[];
  isMidBoss: boolean;
}

export interface Bullet extends Entity {
  radius: number;
  damage: number;
  isPlayerBullet: boolean;
  age: number;
  patternId: number;
  color: string;
}

export interface Item extends Entity {
  type: 'power' | 'point' | 'life' | 'bomb' | 'fullPower';
  value: number;
  autoCollect: boolean;
}

// --- Bullet Patterns ---
export type PatternType = 'radial' | 'aimed' | 'stream' | 'spiral' | 'wall' | 'laser' | 'spawn';

export interface BulletPatternDef {
  type: PatternType;
  bulletSprite: string;
  count: number;
  speed: number;
  angle: number;
  spread: number;
  interval: number;
  duration: number;
  modifiers?: PatternModifier[];
}

export interface PatternModifier {
  type: 'accelerate' | 'curve' | 'split' | 'aim' | 'delay' | 'rotate';
  value: number;
  delay?: number;
}

export interface SpellCard {
  name: string;
  patterns: BulletPatternDef[];
  hp: number;
  timeLimit: number; // frames
  captureBonus: number;
}

// --- Items ---
export interface ItemDrop {
  type: Item['type'];
  chance: number;  // 0-1
  count: number;
}

// --- Stage ---
export interface WaveDef {
  enemies: EnemySpawnDef[];
  delay: number; // frames before next wave
}

export interface EnemySpawnDef {
  type: string;
  x: number;
  y: number;
  delay: number;   // frames after wave start
  patterns: BulletPatternDef[];
  hp: number;
  path: Vec2[];     // waypoints for movement
  dropTable: ItemDrop[];
}

export interface StageDef {
  id: number;
  name: string;
  theme: string;
  bgm: string;
  bossBgm: string;
  waves1: WaveDef[];
  midBoss: Boss;
  waves2: WaveDef[];
  boss: Boss;
}

// --- Difficulty Scaling ---
export interface DifficultyMultipliers {
  bulletCount: number;
  bulletSpeed: number;
  bossHp: number;
  spellCardCount: number;
  enemyDensity: number;
  grazeWindow: number;
}

// --- Dialogue ---
export interface DialogueLine {
  speaker: string;
  text: string;
  portrait?: string;
  emotion?: 'neutral' | 'angry' | 'surprised' | 'happy' | 'sad';
}

// --- Input ---
export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shot: boolean;    // X
  melee: boolean;   // Z
  special: boolean; // C
  dash: boolean;    // A
  bomb: boolean;    // S
  focus: boolean;   // Shift
  pause: boolean;   // Esc
}
```

**Step 2: Commit**

```bash
git add lib/dream-rift/types.ts
git commit -m "feat(dream-rift): add core type definitions"
```

---

### Task 2: Constants

**Files:**
- Create: `lib/dream-rift/constants.ts`

**Step 1: Write constants**

```typescript
// lib/dream-rift/constants.ts
import type { DifficultyMultipliers, Difficulty, Character } from './types';

// --- Playfield ---
export const PLAYFIELD_WIDTH = 384;
export const PLAYFIELD_HEIGHT = 448;
export const SIDEBAR_WIDTH = 192;
export const CANVAS_WIDTH = PLAYFIELD_WIDTH + SIDEBAR_WIDTH;
export const CANVAS_HEIGHT = PLAYFIELD_HEIGHT;

// --- Game Loop ---
export const TARGET_FPS = 60;
export const FRAME_TIME = 1000 / TARGET_FPS;

// --- Player ---
export const PLAYER_SPEED = 4.5;       // pixels per frame (unfocused)
export const PLAYER_FOCUS_SPEED = 2.0; // pixels per frame (focused)
export const PLAYER_START_X = PLAYFIELD_WIDTH / 2;
export const PLAYER_START_Y = PLAYFIELD_HEIGHT - 48;
export const PLAYER_INVULN_FRAMES = 120; // 2 seconds at 60fps
export const DEATHBOMB_WINDOW = 10;     // frames to deathbomb after hit
export const POWER_MAX = 128;
export const LIVES_MAX = 8;
export const BOMBS_MAX = 8;
export const LIVES_START = 3;
export const BOMBS_START = 3;

// --- Melee ---
export const MELEE_COOLDOWN = 20;       // frames
export const MELEE_INVULN_FRAMES = 8;
export const MELEE_RANGE = 48;          // pixels
export const MELEE_ARC_REI = Math.PI;   // 180 degrees
export const MELEE_ARC_YUME = Math.PI / 3; // 60 degrees

// --- Special ---
export const SPECIAL_COOLDOWN_REI = 300;  // 5 seconds — barrier
export const SPECIAL_COOLDOWN_YUME = 180; // 3 seconds — phase shift
export const SPECIAL_DURATION_REI = 120;  // 2 seconds barrier
export const SPECIAL_DURATION_YUME = 15;  // 0.25 seconds teleport

// --- Dash ---
export const DASH_COOLDOWN = 45;         // 0.75 seconds
export const DASH_DISTANCE = 64;         // pixels
export const DASH_INVULN_FRAMES = 12;

// --- Bullet Pool ---
export const BULLET_POOL_SIZE = 10000;
export const ENEMY_POOL_SIZE = 200;
export const ITEM_POOL_SIZE = 500;

// --- Item Collection ---
export const ITEM_AUTOCOLLECT_Y = 96;   // above this line, auto-collect all items
export const ITEM_ATTRACT_RADIUS = 48;  // pixels
export const ITEM_COLLECT_RADIUS = 16;  // pixels

// --- Graze ---
export const GRAZE_RADIUS_EASY = 24;
export const GRAZE_RADIUS_NORMAL = 16;
export const GRAZE_RADIUS_HARD = 12;
export const GRAZE_RADIUS_LUNATIC = 8;

// --- Scoring ---
export const POINT_ITEM_BASE = 10000;
export const GRAZE_SCORE = 500;
export const LIFE_SCORE_THRESHOLDS = [10_000_000, 25_000_000, 50_000_000, 100_000_000];

// --- Difficulty ---
export const DIFFICULTY_MULTIPLIERS: Record<Difficulty, DifficultyMultipliers> = {
  easy:    { bulletCount: 0.5, bulletSpeed: 0.7, bossHp: 0.6, spellCardCount: 2, enemyDensity: 0.6, grazeWindow: GRAZE_RADIUS_EASY },
  normal:  { bulletCount: 1.0, bulletSpeed: 1.0, bossHp: 1.0, spellCardCount: 3, enemyDensity: 1.0, grazeWindow: GRAZE_RADIUS_NORMAL },
  hard:    { bulletCount: 1.5, bulletSpeed: 1.2, bossHp: 1.4, spellCardCount: 4, enemyDensity: 1.4, grazeWindow: GRAZE_RADIUS_HARD },
  lunatic: { bulletCount: 2.0, bulletSpeed: 1.5, bossHp: 2.0, spellCardCount: 5, enemyDensity: 2.0, grazeWindow: GRAZE_RADIUS_LUNATIC },
};

// --- Character Stats ---
export const CHARACTER_STATS: Record<Character, {
  speed: number;
  focusSpeed: number;
  hitboxRadius: number;
}> = {
  rei:  { speed: 4.0, focusSpeed: 1.8, hitboxRadius: 2.0 },
  yume: { speed: 5.0, focusSpeed: 2.2, hitboxRadius: 2.5 },
};
```

**Step 2: Commit**

```bash
git add lib/dream-rift/constants.ts
git commit -m "feat(dream-rift): add game constants and difficulty multipliers"
```

---

### Task 3: Input System

**Files:**
- Create: `lib/dream-rift/input.ts`
- Create: `lib/dream-rift/__tests__/input.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/dream-rift/__tests__/input.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputManager } from '../input';

describe('InputManager', () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  it('initializes with all keys released', () => {
    const state = input.getState();
    expect(state.up).toBe(false);
    expect(state.shot).toBe(false);
    expect(state.melee).toBe(false);
  });

  it('registers key presses', () => {
    input.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    input.handleKeyDown(new KeyboardEvent('keydown', { key: 'x' }));
    const state = input.getState();
    expect(state.up).toBe(true);
    expect(state.shot).toBe(true);
  });

  it('registers key releases', () => {
    input.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    input.handleKeyUp(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
    expect(input.getState().up).toBe(false);
  });

  it('maps z to melee, c to special, a to dash, s to bomb', () => {
    input.handleKeyDown(new KeyboardEvent('keydown', { key: 'z' }));
    expect(input.getState().melee).toBe(true);

    input.handleKeyDown(new KeyboardEvent('keydown', { key: 'c' }));
    expect(input.getState().special).toBe(true);

    input.handleKeyDown(new KeyboardEvent('keydown', { key: 'a' }));
    expect(input.getState().dash).toBe(true);

    input.handleKeyDown(new KeyboardEvent('keydown', { key: 's' }));
    expect(input.getState().bomb).toBe(true);
  });

  it('maps Shift to focus', () => {
    input.handleKeyDown(new KeyboardEvent('keydown', { key: 'Shift' }));
    expect(input.getState().focus).toBe(true);
  });

  it('detects just-pressed keys (rising edge)', () => {
    expect(input.justPressed('melee')).toBe(false);
    input.handleKeyDown(new KeyboardEvent('keydown', { key: 'z' }));
    expect(input.justPressed('melee')).toBe(true);
    input.update(); // advance frame
    expect(input.justPressed('melee')).toBe(false); // no longer "just" pressed
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run lib/dream-rift/__tests__/input.test.ts
```

Expected: FAIL — `InputManager` not found

**Step 3: Write minimal implementation**

```typescript
// lib/dream-rift/input.ts
import type { InputState } from './types';

const KEY_MAP: Record<string, keyof InputState> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  x: 'shot',
  X: 'shot',
  z: 'melee',
  Z: 'melee',
  c: 'special',
  C: 'special',
  a: 'dash',
  A: 'dash',
  s: 'bomb',
  S: 'bomb',
  Shift: 'focus',
  Escape: 'pause',
};

function emptyState(): InputState {
  return {
    up: false, down: false, left: false, right: false,
    shot: false, melee: false, special: false,
    dash: false, bomb: false, focus: false, pause: false,
  };
}

export class InputManager {
  private current: InputState = emptyState();
  private previous: InputState = emptyState();

  getState(): Readonly<InputState> {
    return this.current;
  }

  justPressed(key: keyof InputState): boolean {
    return this.current[key] && !this.previous[key];
  }

  update(): void {
    this.previous = { ...this.current };
  }

  handleKeyDown(e: KeyboardEvent): void {
    const mapped = KEY_MAP[e.key];
    if (mapped) {
      this.current[mapped] = true;
      e.preventDefault();
    }
  }

  handleKeyUp(e: KeyboardEvent): void {
    const mapped = KEY_MAP[e.key];
    if (mapped) {
      this.current[mapped] = false;
    }
  }

  bind(element: HTMLElement | Window): () => void {
    const onDown = (e: Event) => this.handleKeyDown(e as KeyboardEvent);
    const onUp = (e: Event) => this.handleKeyUp(e as KeyboardEvent);
    element.addEventListener('keydown', onDown);
    element.addEventListener('keyup', onUp);
    return () => {
      element.removeEventListener('keydown', onDown);
      element.removeEventListener('keyup', onUp);
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run lib/dream-rift/__tests__/input.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add lib/dream-rift/input.ts lib/dream-rift/__tests__/input.test.ts
git commit -m "feat(dream-rift): add input manager with key mapping and edge detection"
```

---

### Task 4: Object Pool

**Files:**
- Create: `lib/dream-rift/pool.ts`
- Create: `lib/dream-rift/__tests__/pool.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/dream-rift/__tests__/pool.test.ts
import { describe, it, expect } from 'vitest';
import { ObjectPool } from '../pool';

interface TestObj {
  id: number;
  active: boolean;
  value: number;
}

describe('ObjectPool', () => {
  it('creates a pool of the specified size', () => {
    const pool = new ObjectPool<TestObj>(100, (i) => ({ id: i, active: false, value: 0 }));
    expect(pool.capacity).toBe(100);
    expect(pool.activeCount).toBe(0);
  });

  it('acquires an inactive object and marks it active', () => {
    const pool = new ObjectPool<TestObj>(10, (i) => ({ id: i, active: false, value: 0 }));
    const obj = pool.acquire();
    expect(obj).not.toBeNull();
    expect(obj!.active).toBe(true);
    expect(pool.activeCount).toBe(1);
  });

  it('returns null when pool is exhausted', () => {
    const pool = new ObjectPool<TestObj>(2, (i) => ({ id: i, active: false, value: 0 }));
    pool.acquire();
    pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  it('releases objects back to pool', () => {
    const pool = new ObjectPool<TestObj>(2, (i) => ({ id: i, active: false, value: 0 }));
    const obj = pool.acquire()!;
    pool.release(obj);
    expect(obj.active).toBe(false);
    expect(pool.activeCount).toBe(0);
  });

  it('iterates only over active objects', () => {
    const pool = new ObjectPool<TestObj>(5, (i) => ({ id: i, active: false, value: 0 }));
    pool.acquire()!.value = 10;
    pool.acquire()!.value = 20;
    const values: number[] = [];
    pool.forEachActive((obj) => values.push(obj.value));
    expect(values).toEqual([10, 20]);
  });

  it('releaseAll deactivates everything', () => {
    const pool = new ObjectPool<TestObj>(5, (i) => ({ id: i, active: false, value: 0 }));
    pool.acquire();
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run lib/dream-rift/__tests__/pool.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// lib/dream-rift/pool.ts

export class ObjectPool<T extends { active: boolean }> {
  private objects: T[];
  private _activeCount = 0;

  constructor(
    public readonly capacity: number,
    factory: (index: number) => T,
  ) {
    this.objects = Array.from({ length: capacity }, (_, i) => factory(i));
  }

  get activeCount(): number {
    return this._activeCount;
  }

  acquire(): T | null {
    for (const obj of this.objects) {
      if (!obj.active) {
        obj.active = true;
        this._activeCount++;
        return obj;
      }
    }
    return null;
  }

  release(obj: T): void {
    if (obj.active) {
      obj.active = false;
      this._activeCount--;
    }
  }

  releaseAll(): void {
    for (const obj of this.objects) {
      obj.active = false;
    }
    this._activeCount = 0;
  }

  forEachActive(fn: (obj: T) => void): void {
    for (const obj of this.objects) {
      if (obj.active) fn(obj);
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run lib/dream-rift/__tests__/pool.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add lib/dream-rift/pool.ts lib/dream-rift/__tests__/pool.test.ts
git commit -m "feat(dream-rift): add generic object pool for bullet/entity pooling"
```

---

### Task 5: Collision System

**Files:**
- Create: `lib/dream-rift/collision.ts`
- Create: `lib/dream-rift/__tests__/collision.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/dream-rift/__tests__/collision.test.ts
import { describe, it, expect } from 'vitest';
import { circleCircle, pointInRect, circleRect } from '../collision';

describe('collision', () => {
  it('circleCircle detects overlapping circles', () => {
    expect(circleCircle(0, 0, 5, 3, 0, 5)).toBe(true);  // distance 3, radii sum 10
    expect(circleCircle(0, 0, 5, 100, 0, 5)).toBe(false); // too far
  });

  it('circleCircle detects exact edge contact', () => {
    expect(circleCircle(0, 0, 5, 10, 0, 5)).toBe(true); // exactly touching
  });

  it('pointInRect checks bounds', () => {
    expect(pointInRect(5, 5, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect(15, 5, 0, 0, 10, 10)).toBe(false);
  });

  it('circleRect detects overlap', () => {
    expect(circleRect(5, 5, 3, 0, 0, 10, 10)).toBe(true);
    expect(circleRect(20, 20, 3, 0, 0, 10, 10)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run lib/dream-rift/__tests__/collision.test.ts
```

**Step 3: Write minimal implementation**

```typescript
// lib/dream-rift/collision.ts

export function circleCircle(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const rSum = r1 + r2;
  return dx * dx + dy * dy <= rSum * rSum;
}

export function pointInRect(
  px: number, py: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function circleRect(
  cx: number, cy: number, cr: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= cr * cr;
}
```

**Step 4: Run test, verify PASS**

```bash
pnpm vitest run lib/dream-rift/__tests__/collision.test.ts
```

**Step 5: Commit**

```bash
git add lib/dream-rift/collision.ts lib/dream-rift/__tests__/collision.test.ts
git commit -m "feat(dream-rift): add collision detection (circle-circle, point-rect, circle-rect)"
```

---

### Task 6: Bullet Pattern Spawner

**Files:**
- Create: `lib/dream-rift/patterns.ts`
- Create: `lib/dream-rift/__tests__/patterns.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/dream-rift/__tests__/patterns.test.ts
import { describe, it, expect } from 'vitest';
import { spawnRadial, spawnAimed, applyDifficultyToPattern } from '../patterns';
import type { BulletPatternDef, DifficultyMultipliers } from '../types';

describe('spawnRadial', () => {
  it('generates correct number of bullets in a full circle', () => {
    const bullets = spawnRadial(100, 100, {
      type: 'radial',
      bulletSprite: 'bullet_red',
      count: 8,
      speed: 2,
      angle: 0,
      spread: 360,
      interval: 10,
      duration: 60,
    });
    expect(bullets).toHaveLength(8);
    // First bullet should go right (angle 0)
    expect(bullets[0].vx).toBeCloseTo(2, 1);
    expect(bullets[0].vy).toBeCloseTo(0, 1);
  });
});

describe('spawnAimed', () => {
  it('fires bullets aimed at target', () => {
    const bullets = spawnAimed(0, 0, 100, 0, {
      type: 'aimed',
      bulletSprite: 'bullet_blue',
      count: 1,
      speed: 3,
      angle: 0,
      spread: 0,
      interval: 10,
      duration: 60,
    });
    expect(bullets).toHaveLength(1);
    expect(bullets[0].vx).toBeCloseTo(3, 1);  // aimed right
    expect(bullets[0].vy).toBeCloseTo(0, 1);
  });
});

describe('applyDifficultyToPattern', () => {
  it('scales pattern values by difficulty multipliers', () => {
    const pattern: BulletPatternDef = {
      type: 'radial', bulletSprite: 'b', count: 10, speed: 2,
      angle: 0, spread: 360, interval: 10, duration: 60,
    };
    const mults: DifficultyMultipliers = {
      bulletCount: 2, bulletSpeed: 1.5, bossHp: 1, spellCardCount: 3, enemyDensity: 1, grazeWindow: 16,
    };
    const scaled = applyDifficultyToPattern(pattern, mults);
    expect(scaled.count).toBe(20);
    expect(scaled.speed).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run lib/dream-rift/__tests__/patterns.test.ts
```

**Step 3: Write minimal implementation**

```typescript
// lib/dream-rift/patterns.ts
import type { BulletPatternDef, DifficultyMultipliers } from './types';

export interface SpawnedBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sprite: string;
}

export function spawnRadial(
  originX: number,
  originY: number,
  pattern: BulletPatternDef,
): SpawnedBullet[] {
  const bullets: SpawnedBullet[] = [];
  const spreadRad = (pattern.spread * Math.PI) / 180;
  const startAngle = (pattern.angle * Math.PI) / 180;

  for (let i = 0; i < pattern.count; i++) {
    const fraction = pattern.count === 1 ? 0 : i / pattern.count;
    const angle = startAngle + fraction * spreadRad;
    bullets.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * pattern.speed,
      vy: Math.sin(angle) * pattern.speed,
      sprite: pattern.bulletSprite,
    });
  }
  return bullets;
}

export function spawnAimed(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  pattern: BulletPatternDef,
): SpawnedBullet[] {
  const bullets: SpawnedBullet[] = [];
  const baseAngle = Math.atan2(targetY - originY, targetX - originX);
  const spreadRad = (pattern.spread * Math.PI) / 180;

  for (let i = 0; i < pattern.count; i++) {
    const offset = pattern.count === 1 ? 0 : (i / (pattern.count - 1) - 0.5) * spreadRad;
    const angle = baseAngle + offset;
    bullets.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * pattern.speed,
      vy: Math.sin(angle) * pattern.speed,
      sprite: pattern.bulletSprite,
    });
  }
  return bullets;
}

export function applyDifficultyToPattern(
  pattern: BulletPatternDef,
  multipliers: DifficultyMultipliers,
): BulletPatternDef {
  return {
    ...pattern,
    count: Math.round(pattern.count * multipliers.bulletCount),
    speed: pattern.speed * multipliers.bulletSpeed,
  };
}
```

**Step 4: Run test, verify PASS**

```bash
pnpm vitest run lib/dream-rift/__tests__/patterns.test.ts
```

**Step 5: Commit**

```bash
git add lib/dream-rift/patterns.ts lib/dream-rift/__tests__/patterns.test.ts
git commit -m "feat(dream-rift): add bullet pattern spawner with radial, aimed, and difficulty scaling"
```

---

## Phase 2: Game Engine & Renderer

### Task 7: Game State Store (Zustand)

**Files:**
- Create: `lib/dream-rift/store.ts`

**Step 1: Write the store**

```typescript
// lib/dream-rift/store.ts
import { create } from 'zustand';
import type { GameScreen, Difficulty, Character, PlayerState } from './types';
import {
  LIVES_START, BOMBS_START, PLAYER_START_X, PLAYER_START_Y,
  CHARACTER_STATS,
} from './constants';

export interface DreamRiftState {
  // Screen state
  screen: GameScreen;
  difficulty: Difficulty;
  character: Character;
  stage: number;

  // Player state
  player: PlayerState;

  // Session stats
  totalScore: number;
  continues: number;

  // Actions
  setScreen: (screen: GameScreen) => void;
  selectCharacter: (character: Character) => void;
  selectDifficulty: (difficulty: Difficulty) => void;
  startGame: () => void;
  resetPlayer: () => void;
  playerDeath: () => void;
  addScore: (points: number) => void;
  addPower: (amount: number) => void;
  addGraze: () => void;
  nextStage: () => void;
  useBomb: () => boolean;
  useContinue: () => boolean;
}

function makeInitialPlayer(character: Character): PlayerState {
  const stats = CHARACTER_STATS[character];
  return {
    id: 0,
    position: { x: PLAYER_START_X, y: PLAYER_START_Y },
    velocity: { x: 0, y: 0 },
    active: true,
    sprite: `player_${character}`,
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
    specialCooldown: 0,
    dashCooldown: 0,
    hitboxRadius: stats.hitboxRadius,
  };
}

export const useDreamRiftStore = create<DreamRiftState>((set, get) => ({
  screen: 'title',
  difficulty: 'normal',
  character: 'rei',
  stage: 1,
  player: makeInitialPlayer('rei'),
  totalScore: 0,
  continues: 0,

  setScreen: (screen) => set({ screen }),
  selectCharacter: (character) => set({ character, player: makeInitialPlayer(character) }),
  selectDifficulty: (difficulty) => set({ difficulty }),

  startGame: () => {
    const { character } = get();
    set({
      screen: 'playing',
      stage: 1,
      player: makeInitialPlayer(character),
      totalScore: 0,
      continues: 0,
    });
  },

  resetPlayer: () => {
    const { character } = get();
    set({ player: makeInitialPlayer(character) });
  },

  playerDeath: () => set((s) => {
    const newLives = s.player.lives - 1;
    if (newLives < 0) {
      return { screen: 'gameOver' };
    }
    return {
      player: {
        ...s.player,
        lives: newLives,
        bombs: Math.max(s.player.bombs, BOMBS_START),
        power: Math.max(0, s.player.power - 16),
        position: { x: PLAYER_START_X, y: PLAYER_START_Y },
        invulnFrames: 120,
      },
    };
  }),

  addScore: (points) => set((s) => ({
    player: { ...s.player, score: s.player.score + points },
    totalScore: s.totalScore + points,
  })),

  addPower: (amount) => set((s) => ({
    player: { ...s.player, power: Math.min(128, s.player.power + amount) },
  })),

  addGraze: () => set((s) => ({
    player: { ...s.player, graze: s.player.graze + 1, score: s.player.score + 500 },
  })),

  nextStage: () => set((s) => ({
    stage: s.stage + 1,
    screen: s.stage >= 6 ? 'stageResult' : 'playing',
  })),

  useBomb: () => {
    const { player } = get();
    if (player.bombs <= 0) return false;
    set((s) => ({
      player: { ...s.player, bombs: s.player.bombs - 1, invulnFrames: 180 },
    }));
    return true;
  },

  useContinue: () => {
    const s = get();
    const maxContinues = s.difficulty === 'easy' ? 5 : s.difficulty === 'normal' ? 3 : s.difficulty === 'hard' ? 1 : 0;
    if (s.continues >= maxContinues) return false;
    set({
      continues: s.continues + 1,
      player: makeInitialPlayer(s.character),
      screen: 'playing',
    });
    return true;
  },
}));
```

**Step 2: Commit**

```bash
git add lib/dream-rift/store.ts
git commit -m "feat(dream-rift): add Zustand game state store"
```

---

### Task 8: PixiJS Game Engine Core

**Files:**
- Create: `lib/dream-rift/engine.ts`

**Step 1: Write the game engine**

This is the core game loop and entity management. It orchestrates PixiJS rendering, the input system, bullet pools, collision, and stage progression.

```typescript
// lib/dream-rift/engine.ts
import { Application, Container, Sprite, Graphics, Texture, Text, TextStyle } from 'pixi.js';
import { InputManager } from './input';
import { ObjectPool } from './pool';
import { circleCircle } from './collision';
import { spawnRadial, spawnAimed, applyDifficultyToPattern } from './patterns';
import { useDreamRiftStore } from './store';
import type { Bullet, Item, Enemy, InputState, BulletPatternDef } from './types';
import {
  PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT,
  TARGET_FPS, FRAME_TIME, BULLET_POOL_SIZE, ITEM_POOL_SIZE, ENEMY_POOL_SIZE,
  CHARACTER_STATS, PLAYER_SPEED, PLAYER_FOCUS_SPEED,
  MELEE_COOLDOWN, DASH_COOLDOWN, DASH_DISTANCE, DASH_INVULN_FRAMES,
  DEATHBOMB_WINDOW, ITEM_AUTOCOLLECT_Y, ITEM_ATTRACT_RADIUS, ITEM_COLLECT_RADIUS,
  DIFFICULTY_MULTIPLIERS, GRAZE_SCORE,
} from './constants';

export class DreamRiftEngine {
  private app!: Application;
  private input: InputManager;
  private playfield!: Container;
  private uiLayer!: Container;

  // Pools
  private bulletPool!: ObjectPool<Bullet>;
  private enemyBulletPool!: ObjectPool<Bullet>;
  private itemPool!: ObjectPool<Item>;

  // PixiJS graphics for bullets (batch rendering)
  private bulletGraphics!: Graphics;
  private playerSprite!: Graphics; // placeholder until real sprites
  private hitboxDot!: Graphics;

  private running = false;
  private accumulator = 0;
  private lastTime = 0;

  constructor() {
    this.input = new InputManager();
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      canvas,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: 0x000011,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Layers
    this.playfield = new Container();
    this.playfield.x = 0;
    this.playfield.y = 0;
    this.app.stage.addChild(this.playfield);

    this.uiLayer = new Container();
    this.uiLayer.x = PLAYFIELD_WIDTH;
    this.uiLayer.y = 0;
    this.app.stage.addChild(this.uiLayer);

    // Bullet graphics (for batch drawing)
    this.bulletGraphics = new Graphics();
    this.playfield.addChild(this.bulletGraphics);

    // Player placeholder
    this.playerSprite = new Graphics();
    this.playerSprite.circle(0, 0, 12);
    this.playerSprite.fill(0xffffff);
    this.playfield.addChild(this.playerSprite);

    // Hitbox dot
    this.hitboxDot = new Graphics();
    this.hitboxDot.circle(0, 0, 2);
    this.hitboxDot.fill(0xff0000);
    this.hitboxDot.visible = false;
    this.playfield.addChild(this.hitboxDot);

    // Init pools
    this.bulletPool = new ObjectPool<Bullet>(BULLET_POOL_SIZE, (i) => ({
      id: i, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
      active: false, sprite: '', radius: 4, damage: 1,
      isPlayerBullet: true, age: 0, patternId: 0, color: '#ffffff',
    }));

    this.enemyBulletPool = new ObjectPool<Bullet>(BULLET_POOL_SIZE, (i) => ({
      id: i, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
      active: false, sprite: '', radius: 4, damage: 1,
      isPlayerBullet: false, age: 0, patternId: 0, color: '#ff4444',
    }));

    this.itemPool = new ObjectPool<Item>(ITEM_POOL_SIZE, (i) => ({
      id: i, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
      active: false, sprite: '', type: 'point', value: 0, autoCollect: false,
    }));

    // Bind input
    this.input.bind(window);
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.app.ticker.add(() => this.loop());
  }

  stop(): void {
    this.running = false;
  }

  destroy(): void {
    this.stop();
    this.app.destroy(true);
  }

  private loop(): void {
    if (!this.running) return;

    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    this.accumulator += delta;

    // Fixed timestep updates
    while (this.accumulator >= FRAME_TIME) {
      this.fixedUpdate();
      this.accumulator -= FRAME_TIME;
    }

    // Render with interpolation factor
    const alpha = this.accumulator / FRAME_TIME;
    this.render(alpha);
  }

  private fixedUpdate(): void {
    const store = useDreamRiftStore.getState();
    if (store.screen !== 'playing') return;

    const inputState = this.input.getState();

    this.updatePlayer(inputState, store);
    this.updatePlayerBullets();
    this.updateEnemyBullets(store);
    this.updateItems(store);
    this.checkCollisions(store);
    this.input.update();
  }

  private updatePlayer(input: InputState, store: ReturnType<typeof useDreamRiftStore.getState>): void {
    const player = store.player;
    const stats = CHARACTER_STATS[player.character];
    const speed = input.focus ? stats.focusSpeed : stats.speed;

    // Movement
    let dx = 0, dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      const norm = 1 / Math.SQRT2;
      dx *= norm;
      dy *= norm;
    }

    const newX = Math.max(0, Math.min(PLAYFIELD_WIDTH, player.position.x + dx * speed));
    const newY = Math.max(0, Math.min(PLAYFIELD_HEIGHT, player.position.y + dy * speed));

    // Update position in store
    useDreamRiftStore.setState((s) => ({
      player: { ...s.player, position: { x: newX, y: newY }, focused: input.focus },
    }));

    // Shooting (X key)
    if (input.shot) {
      this.firePlayerShot(newX, newY, player);
    }

    // Melee (Z key)
    if (this.input.justPressed('melee') && player.meleeCooldown <= 0) {
      this.performMelee(newX, newY, player);
    }

    // Dash (A key)
    if (this.input.justPressed('dash') && player.dashCooldown <= 0) {
      this.performDash(input, player);
    }

    // Bomb (S key)
    if (this.input.justPressed('bomb')) {
      store.useBomb();
      this.clearEnemyBullets();
    }

    // Decrement cooldowns
    useDreamRiftStore.setState((s) => ({
      player: {
        ...s.player,
        meleeCooldown: Math.max(0, s.player.meleeCooldown - 1),
        specialCooldown: Math.max(0, s.player.specialCooldown - 1),
        dashCooldown: Math.max(0, s.player.dashCooldown - 1),
        invulnFrames: Math.max(0, s.player.invulnFrames - 1),
        deathbombWindow: Math.max(0, s.player.deathbombWindow - 1),
      },
    }));
  }

  private firePlayerShot(x: number, y: number, player: typeof useDreamRiftStore.getState extends () => infer S ? S extends { player: infer P } ? P : never : never): void {
    // Fire rate: every 4 frames
    const bullet = this.bulletPool.acquire();
    if (!bullet) return;
    bullet.position.x = x;
    bullet.position.y = y - 16;
    bullet.velocity.x = 0;
    bullet.velocity.y = -12;
    bullet.isPlayerBullet = true;
    bullet.radius = 3;
    bullet.damage = 10 + Math.floor(player.power / 16);
    bullet.age = 0;
  }

  private performMelee(x: number, y: number, player: any): void {
    // TODO: check enemies in melee range and deal damage
    useDreamRiftStore.setState((s) => ({
      player: { ...s.player, meleeCooldown: MELEE_COOLDOWN, invulnFrames: Math.max(s.player.invulnFrames, 8) },
    }));
  }

  private performDash(input: InputState, player: any): void {
    let dx = 0, dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (dx === 0 && dy === 0) dy = -1; // default dash up

    const norm = Math.sqrt(dx * dx + dy * dy);
    const newX = Math.max(0, Math.min(PLAYFIELD_WIDTH, player.position.x + (dx / norm) * DASH_DISTANCE));
    const newY = Math.max(0, Math.min(PLAYFIELD_HEIGHT, player.position.y + (dy / norm) * DASH_DISTANCE));

    useDreamRiftStore.setState((s) => ({
      player: {
        ...s.player,
        position: { x: newX, y: newY },
        dashCooldown: DASH_COOLDOWN,
        invulnFrames: Math.max(s.player.invulnFrames, DASH_INVULN_FRAMES),
      },
    }));
  }

  private updatePlayerBullets(): void {
    this.bulletPool.forEachActive((bullet) => {
      bullet.position.x += bullet.velocity.x;
      bullet.position.y += bullet.velocity.y;
      bullet.age++;

      // Remove if off-screen
      if (bullet.position.y < -16 || bullet.position.y > PLAYFIELD_HEIGHT + 16 ||
          bullet.position.x < -16 || bullet.position.x > PLAYFIELD_WIDTH + 16) {
        this.bulletPool.release(bullet);
      }
    });
  }

  private updateEnemyBullets(store: ReturnType<typeof useDreamRiftStore.getState>): void {
    const player = store.player;
    const grazeRadius = DIFFICULTY_MULTIPLIERS[store.difficulty].grazeWindow;

    this.enemyBulletPool.forEachActive((bullet) => {
      bullet.position.x += bullet.velocity.x;
      bullet.position.y += bullet.velocity.y;
      bullet.age++;

      // Remove if off-screen
      if (bullet.position.y < -16 || bullet.position.y > PLAYFIELD_HEIGHT + 16 ||
          bullet.position.x < -16 || bullet.position.x > PLAYFIELD_WIDTH + 16) {
        this.enemyBulletPool.release(bullet);
      }
    });
  }

  private updateItems(store: ReturnType<typeof useDreamRiftStore.getState>): void {
    const player = store.player;

    this.itemPool.forEachActive((item) => {
      // Auto-collect when player is above the autocollect line
      if (player.position.y < ITEM_AUTOCOLLECT_Y) {
        item.autoCollect = true;
      }

      if (item.autoCollect) {
        // Move toward player
        const dx = player.position.x - item.position.x;
        const dy = player.position.y - item.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          item.velocity.x = (dx / dist) * 8;
          item.velocity.y = (dy / dist) * 8;
        }
      } else {
        // Gravity fall
        item.velocity.y = Math.min(item.velocity.y + 0.02, 2);
      }

      item.position.x += item.velocity.x;
      item.position.y += item.velocity.y;

      // Remove if off-screen bottom
      if (item.position.y > PLAYFIELD_HEIGHT + 32) {
        this.itemPool.release(item);
      }
    });
  }

  private checkCollisions(store: ReturnType<typeof useDreamRiftStore.getState>): void {
    const player = store.player;
    if (player.invulnFrames > 0) return;

    // Enemy bullets vs player hitbox
    this.enemyBulletPool.forEachActive((bullet) => {
      if (circleCircle(
        player.position.x, player.position.y, player.hitboxRadius,
        bullet.position.x, bullet.position.y, bullet.radius,
      )) {
        this.enemyBulletPool.release(bullet);
        // Start deathbomb window
        useDreamRiftStore.setState((s) => ({
          player: { ...s.player, deathbombWindow: DEATHBOMB_WINDOW },
        }));
        // If no deathbomb within window, player dies (checked next frame)
        setTimeout(() => {
          const current = useDreamRiftStore.getState();
          if (current.player.deathbombWindow <= 0 && current.player.invulnFrames <= 0) {
            store.playerDeath();
          }
        }, (DEATHBOMB_WINDOW / TARGET_FPS) * 1000);
      }
    });

    // Items vs player collect radius
    this.itemPool.forEachActive((item) => {
      if (circleCircle(
        player.position.x, player.position.y, ITEM_COLLECT_RADIUS,
        item.position.x, item.position.y, 8,
      )) {
        this.collectItem(item);
        this.itemPool.release(item);
      } else if (circleCircle(
        player.position.x, player.position.y, ITEM_ATTRACT_RADIUS,
        item.position.x, item.position.y, 8,
      )) {
        item.autoCollect = true;
      }
    });
  }

  private collectItem(item: Item): void {
    const store = useDreamRiftStore.getState();
    switch (item.type) {
      case 'power': store.addPower(item.value); break;
      case 'point': store.addScore(item.value); break;
      case 'life':
        useDreamRiftStore.setState((s) => ({
          player: { ...s.player, lives: Math.min(8, s.player.lives + 1) },
        }));
        break;
      case 'bomb':
        useDreamRiftStore.setState((s) => ({
          player: { ...s.player, bombs: Math.min(8, s.player.bombs + 1) },
        }));
        break;
    }
  }

  clearEnemyBullets(): void {
    this.enemyBulletPool.forEachActive((bullet) => {
      // Convert each bullet to a point item
      const item = this.itemPool.acquire();
      if (item) {
        item.position.x = bullet.position.x;
        item.position.y = bullet.position.y;
        item.velocity.x = 0;
        item.velocity.y = -2;
        item.type = 'point';
        item.value = 1000;
        item.autoCollect = true;
      }
      this.enemyBulletPool.release(bullet);
    });
  }

  // Spawn enemy bullets (called by stage manager / enemy AI)
  spawnEnemyPattern(x: number, y: number, pattern: BulletPatternDef, targetX?: number, targetY?: number): void {
    const store = useDreamRiftStore.getState();
    const scaled = applyDifficultyToPattern(pattern, DIFFICULTY_MULTIPLIERS[store.difficulty]);

    let spawned;
    if (pattern.type === 'aimed' && targetX !== undefined && targetY !== undefined) {
      spawned = spawnAimed(x, y, targetX, targetY, scaled);
    } else {
      spawned = spawnRadial(x, y, scaled);
    }

    for (const s of spawned) {
      const bullet = this.enemyBulletPool.acquire();
      if (!bullet) break;
      bullet.position.x = s.x;
      bullet.position.y = s.y;
      bullet.velocity.x = s.vx;
      bullet.velocity.y = s.vy;
      bullet.sprite = s.sprite;
      bullet.age = 0;
      bullet.radius = 4;
      bullet.isPlayerBullet = false;
    }
  }

  private render(_alpha: number): void {
    const store = useDreamRiftStore.getState();
    const player = store.player;

    // Update player sprite position
    this.playerSprite.x = player.position.x;
    this.playerSprite.y = player.position.y;

    // Show hitbox dot when focused
    this.hitboxDot.visible = player.focused;
    this.hitboxDot.x = player.position.x;
    this.hitboxDot.y = player.position.y;

    // Draw bullets
    this.bulletGraphics.clear();

    // Player bullets (white)
    this.bulletPool.forEachActive((bullet) => {
      this.bulletGraphics.circle(bullet.position.x, bullet.position.y, bullet.radius);
      this.bulletGraphics.fill(0xffffff);
    });

    // Enemy bullets (colored)
    this.enemyBulletPool.forEachActive((bullet) => {
      this.bulletGraphics.circle(bullet.position.x, bullet.position.y, bullet.radius);
      this.bulletGraphics.fill(0xff4444);
    });

    // Items
    this.itemPool.forEachActive((item) => {
      const color = item.type === 'power' ? 0xff0000 : item.type === 'life' ? 0xff88ff : item.type === 'bomb' ? 0x88ff88 : 0x4488ff;
      this.bulletGraphics.circle(item.position.x, item.position.y, 6);
      this.bulletGraphics.fill(color);
    });
  }
}
```

**Step 2: Commit**

```bash
git add lib/dream-rift/engine.ts
git commit -m "feat(dream-rift): add PixiJS game engine with fixed timestep loop, pools, and collision"
```

---

## Phase 3: Next.js Integration & UI

### Task 9: Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add DreamRiftPlayer model**

Add to the end of `prisma/schema.prisma`:

```prisma
model DreamRiftPlayer {
  id              String   @id @default(uuid())
  username        String   @unique
  highScoreEasy   Int      @default(0)
  highScoreNormal Int      @default(0)
  highScoreHard   Int      @default(0)
  highScoreLunatic Int     @default(0)
  bestStage       Int      @default(1)
  character       String   @default("rei")
  gamesPlayed     Int      @default(1)
  totalGraze      Int      @default(0)
  spellsCaptured  Int      @default(0)
  updatedAt       DateTime @default(now()) @updatedAt

  userId          String?  @unique
  user            User?    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([highScoreNormal(sort: Desc)], map: "idx_dream_rift_high_score")
  @@index([bestStage(sort: Desc)], map: "idx_dream_rift_best_stage")
}
```

Also add the relation to the `User` model:

```prisma
// Inside model User { ... }
dreamRiftProfile DreamRiftPlayer?
```

**Step 2: Push schema**

```bash
pnpm db:push
```

**Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(dream-rift): add DreamRiftPlayer model to Prisma schema"
```

---

### Task 10: API Routes

**Files:**
- Create: `app/api/dream-rift/leaderboard/route.ts`
- Create: `app/api/dream-rift/score/route.ts`

**Step 1: Create leaderboard route**

```typescript
// app/api/dream-rift/leaderboard/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 20,
    windowMs: 60_000,
    prefix: 'dream-rift-leaderboard',
  });

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const difficulty = searchParams.get('difficulty') || 'normal';
    const orderField = `highScore${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}` as const;

    const leaderboard = await prisma.dreamRiftPlayer.findMany({
      take: 20,
      orderBy: { [orderField]: 'desc' },
      select: {
        username: true,
        [orderField]: true,
        bestStage: true,
        character: true,
        spellsCaptured: true,
      },
    });

    return NextResponse.json(leaderboard);
  } catch (e) {
    console.error('Dream Rift leaderboard fetch failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

**Step 2: Create score submission route**

```typescript
// app/api/dream-rift/score/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 5,
    windowMs: 60_000,
    prefix: 'dream-rift-score',
  });

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username, score, difficulty, stage, character, graze, spellsCaptured } = await req.json();

    if (!username || typeof score !== 'number' || !difficulty || !stage) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 24);
    const scoreField = `highScore${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}` as const;

    const existing = await prisma.dreamRiftPlayer.findUnique({
      where: { userId: session.user.id },
    });

    if (existing) {
      await prisma.dreamRiftPlayer.update({
        where: { id: existing.id },
        data: {
          [scoreField]: Math.max((existing as any)[scoreField] || 0, Math.round(score)),
          bestStage: Math.max(existing.bestStage, stage),
          character,
          gamesPlayed: { increment: 1 },
          totalGraze: { increment: graze || 0 },
          spellsCaptured: { increment: spellsCaptured || 0 },
          username: cleanUsername,
        },
      });
      return NextResponse.json({ success: true });
    }

    await prisma.dreamRiftPlayer.create({
      data: {
        userId: session.user.id,
        username: cleanUsername,
        [scoreField]: Math.round(score),
        bestStage: stage,
        character,
        totalGraze: graze || 0,
        spellsCaptured: spellsCaptured || 0,
      },
    });
    return NextResponse.json({ success: true, created: true });
  } catch (e) {
    console.error('Dream Rift score submit failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add app/api/dream-rift/
git commit -m "feat(dream-rift): add leaderboard and score submission API routes"
```

---

### Task 11: Next.js Route & Game Component Shell

**Files:**
- Create: `app/dream-rift/page.tsx`
- Create: `components/dream-rift/DreamRiftGame.tsx`

**Step 1: Create the page**

```typescript
// app/dream-rift/page.tsx
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DreamRiftGame } from '@/components/dream-rift/DreamRiftGame';

export const metadata: Metadata = {
  title: 'Dream Rift — RMH Studios',
  description: 'A Touhou-style bullet hell game. Fight through six dream-themed stages to seal the rift between worlds.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DreamRiftPage() {
  return (
    <main className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <div className="absolute top-3 left-3 z-50">
        <Link href="/games">
          <Button variant="ghost" size="sm" className="text-white/60 hover:text-white">
            <ArrowLeft className="w-3 h-3" />
          </Button>
        </Link>
      </div>
      <DreamRiftGame />
    </main>
  );
}
```

**Step 2: Create the game component**

```typescript
// components/dream-rift/DreamRiftGame.tsx
'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { DreamRiftEngine } from '@/lib/dream-rift/engine';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { DreamRiftHUD } from './DreamRiftHUD';
import { DreamRiftTitle } from './DreamRiftTitle';
import { DreamRiftCharSelect } from './DreamRiftCharSelect';

export function DreamRiftGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DreamRiftEngine | null>(null);
  const screen = useDreamRiftStore((s) => s.screen);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new DreamRiftEngine();
    engineRef.current = engine;

    engine.init(canvas).then(() => {
      engine.start();
    });

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block"
        tabIndex={0}
      />

      {/* UI overlays */}
      {screen === 'title' && <DreamRiftTitle />}
      {screen === 'charSelect' && <DreamRiftCharSelect />}
      {screen === 'playing' && <DreamRiftHUD />}
    </div>
  );
}
```

**Step 3: Create placeholder UI components**

```typescript
// components/dream-rift/DreamRiftTitle.tsx
'use client';
import { useDreamRiftStore } from '@/lib/dream-rift/store';

export function DreamRiftTitle() {
  const setScreen = useDreamRiftStore((s) => s.setScreen);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
      <h1 className="text-4xl font-bold text-white mb-2 tracking-wider">DREAM RIFT</h1>
      <p className="text-white/50 text-sm mb-8">A Bullet Hell Story</p>
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setScreen('charSelect')}
          className="px-8 py-2 text-white border border-white/30 hover:bg-white/10 transition"
        >
          Start Game
        </button>
        <button className="px-8 py-2 text-white/40 border border-white/10 cursor-not-allowed">
          Practice
        </button>
        <button className="px-8 py-2 text-white/40 border border-white/10 cursor-not-allowed">
          Options
        </button>
      </div>
    </div>
  );
}
```

```typescript
// components/dream-rift/DreamRiftCharSelect.tsx
'use client';
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import type { Character } from '@/lib/dream-rift/types';

export function DreamRiftCharSelect() {
  const { selectCharacter, selectDifficulty, setScreen, startGame } = useDreamRiftStore();

  const handleSelect = (char: Character) => {
    selectCharacter(char);
    setScreen('difficultySelect');
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
      <h2 className="text-2xl font-bold text-white mb-6">Select Character</h2>
      <div className="flex gap-6">
        <button
          onClick={() => handleSelect('rei')}
          className="flex flex-col items-center gap-2 p-6 border border-red-500/50 hover:bg-red-500/10 transition rounded"
        >
          <div className="w-16 h-16 bg-red-500/30 rounded-full" />
          <span className="text-white font-bold">Rei</span>
          <span className="text-white/50 text-xs">Power Type</span>
        </button>
        <button
          onClick={() => handleSelect('yume')}
          className="flex flex-col items-center gap-2 p-6 border border-blue-500/50 hover:bg-blue-500/10 transition rounded"
        >
          <div className="w-16 h-16 bg-blue-500/30 rounded-full" />
          <span className="text-white font-bold">Yume</span>
          <span className="text-white/50 text-xs">Speed Type</span>
        </button>
      </div>
    </div>
  );
}
```

```typescript
// components/dream-rift/DreamRiftHUD.tsx
'use client';
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { PLAYFIELD_WIDTH, SIDEBAR_WIDTH, CANVAS_HEIGHT, POWER_MAX } from '@/lib/dream-rift/constants';

export function DreamRiftHUD() {
  const player = useDreamRiftStore((s) => s.player);
  const stage = useDreamRiftStore((s) => s.stage);
  const difficulty = useDreamRiftStore((s) => s.difficulty);

  return (
    <div
      className="absolute top-0 right-0 flex flex-col gap-2 p-3 text-white text-xs font-mono pointer-events-none"
      style={{ width: SIDEBAR_WIDTH, height: CANVAS_HEIGHT }}
    >
      <div className="text-white/50 text-[10px] uppercase tracking-widest">Dream Rift</div>
      <div className="border-b border-white/10 pb-1 mb-1" />

      <div className="flex justify-between">
        <span className="text-white/50">Score</span>
        <span>{player.score.toLocaleString()}</span>
      </div>

      <div className="flex justify-between">
        <span className="text-white/50">Hi-Score</span>
        <span>{player.hiScore.toLocaleString()}</span>
      </div>

      <div className="border-b border-white/10 my-1" />

      <div className="flex justify-between">
        <span className="text-white/50">Lives</span>
        <span>{'★'.repeat(player.lives)}{'☆'.repeat(Math.max(0, 8 - player.lives))}</span>
      </div>

      <div className="flex justify-between">
        <span className="text-white/50">Bombs</span>
        <span>{'♦'.repeat(player.bombs)}{'◇'.repeat(Math.max(0, 8 - player.bombs))}</span>
      </div>

      <div className="flex justify-between">
        <span className="text-white/50">Power</span>
        <span>{player.power}/{POWER_MAX}</span>
      </div>

      <div className="flex justify-between">
        <span className="text-white/50">Graze</span>
        <span>{player.graze}</span>
      </div>

      <div className="border-b border-white/10 my-1" />

      <div className="flex justify-between">
        <span className="text-white/50">Stage</span>
        <span>{stage}</span>
      </div>

      <div className="flex justify-between">
        <span className="text-white/50">Difficulty</span>
        <span className="capitalize">{difficulty}</span>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add app/dream-rift/ components/dream-rift/
git commit -m "feat(dream-rift): add Next.js route, game component, title, char select, and HUD"
```

---

## Phase 4: Stage Data & Enemies

### Task 12: Stage 1 Data (Lucid Meadow)

**Files:**
- Create: `lib/dream-rift/data/stages/stage1.ts`
- Create: `lib/dream-rift/data/enemies.ts`

**Step 1: Create enemy definitions**

```typescript
// lib/dream-rift/data/enemies.ts
import type { BulletPatternDef, ItemDrop, Vec2 } from '../types';

export interface EnemyTemplate {
  type: string;
  hp: number;
  sprite: string;
  patterns: BulletPatternDef[];
  dropTable: ItemDrop[];
}

// --- Common enemy types ---
export const FAIRY_BASIC: EnemyTemplate = {
  type: 'fairy_basic',
  hp: 30,
  sprite: 'enemy_fairy',
  patterns: [{
    type: 'aimed',
    bulletSprite: 'bullet_small_blue',
    count: 3,
    speed: 2.5,
    angle: 0,
    spread: 30,
    interval: 60,
    duration: 300,
  }],
  dropTable: [{ type: 'power', chance: 0.5, count: 1 }, { type: 'point', chance: 1, count: 1 }],
};

export const FAIRY_RADIAL: EnemyTemplate = {
  type: 'fairy_radial',
  hp: 50,
  sprite: 'enemy_fairy_red',
  patterns: [{
    type: 'radial',
    bulletSprite: 'bullet_small_red',
    count: 8,
    speed: 2,
    angle: 0,
    spread: 360,
    interval: 45,
    duration: 300,
  }],
  dropTable: [{ type: 'power', chance: 0.7, count: 2 }, { type: 'point', chance: 1, count: 2 }],
};

export const FAIRY_SPIRAL: EnemyTemplate = {
  type: 'fairy_spiral',
  hp: 80,
  sprite: 'enemy_fairy_gold',
  patterns: [{
    type: 'spiral',
    bulletSprite: 'bullet_small_yellow',
    count: 3,
    speed: 1.8,
    angle: 0,
    spread: 360,
    interval: 8,
    duration: 240,
    modifiers: [{ type: 'rotate', value: 3 }],
  }],
  dropTable: [{ type: 'power', chance: 1, count: 3 }, { type: 'point', chance: 1, count: 3 }],
};
```

**Step 2: Create Stage 1 definition**

```typescript
// lib/dream-rift/data/stages/stage1.ts
import type { StageDef, WaveDef, SpellCard, Boss } from '../../types';
import { FAIRY_BASIC, FAIRY_RADIAL, FAIRY_SPIRAL } from '../enemies';
import { PLAYFIELD_WIDTH } from '../../constants';

const midBoss: Boss = {
  id: 9000,
  name: 'Dream Sprite',
  position: { x: PLAYFIELD_WIDTH / 2, y: 80 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss_dream_sprite',
  hp: 2000,
  maxHp: 2000,
  type: 'mid_boss',
  patterns: [],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [{ type: 'power', chance: 1, count: 8 }, { type: 'bomb', chance: 0.5, count: 1 }],
  spellCards: [
    {
      name: 'Dream Sign "Petal Storm"',
      patterns: [{
        type: 'spiral',
        bulletSprite: 'bullet_petal_pink',
        count: 12,
        speed: 2,
        angle: 0,
        spread: 360,
        interval: 6,
        duration: 600,
        modifiers: [{ type: 'rotate', value: 2 }],
      }],
      hp: 1200,
      timeLimit: 30 * 60,
      captureBonus: 500000,
    },
    {
      name: 'Illusion "Flickering Lanterns"',
      patterns: [
        {
          type: 'radial',
          bulletSprite: 'bullet_orb_orange',
          count: 16,
          speed: 1.5,
          angle: 0,
          spread: 360,
          interval: 30,
          duration: 600,
        },
        {
          type: 'aimed',
          bulletSprite: 'bullet_small_white',
          count: 5,
          speed: 3,
          angle: 0,
          spread: 20,
          interval: 45,
          duration: 600,
        },
      ],
      hp: 1500,
      timeLimit: 35 * 60,
      captureBonus: 800000,
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [2000, 1200, 1500],
  isMidBoss: true,
};

const boss: Boss = {
  id: 9001,
  name: 'Keeper of the Gate',
  position: { x: PLAYFIELD_WIDTH / 2, y: 80 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss_keeper',
  hp: 5000,
  maxHp: 5000,
  type: 'boss',
  patterns: [],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [{ type: 'life', chance: 1, count: 1 }, { type: 'power', chance: 1, count: 12 }],
  spellCards: [
    {
      name: 'Gate Sign "Threshold Barrage"',
      patterns: [{
        type: 'radial',
        bulletSprite: 'bullet_orb_green',
        count: 24,
        speed: 2,
        angle: 0,
        spread: 360,
        interval: 20,
        duration: 900,
      }],
      hp: 2000,
      timeLimit: 40 * 60,
      captureBonus: 1000000,
    },
    {
      name: 'Dream Lock "Warden\'s Chains"',
      patterns: [{
        type: 'wall',
        bulletSprite: 'bullet_rice_blue',
        count: 30,
        speed: 2.5,
        angle: 90,
        spread: 0,
        interval: 15,
        duration: 900,
      }],
      hp: 2500,
      timeLimit: 45 * 60,
      captureBonus: 1200000,
    },
    {
      name: 'Boundary "Dreamgate Collapse"',
      patterns: [
        {
          type: 'spiral',
          bulletSprite: 'bullet_orb_purple',
          count: 6,
          speed: 1.8,
          angle: 0,
          spread: 360,
          interval: 4,
          duration: 1200,
          modifiers: [{ type: 'rotate', value: 2.5 }],
        },
        {
          type: 'aimed',
          bulletSprite: 'bullet_large_white',
          count: 3,
          speed: 3.5,
          angle: 0,
          spread: 15,
          interval: 60,
          duration: 1200,
        },
      ],
      hp: 3000,
      timeLimit: 50 * 60,
      captureBonus: 2000000,
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [5000, 2000, 2500, 3000],
  isMidBoss: false,
};

const waves1: WaveDef[] = [
  {
    enemies: [
      { type: 'fairy_basic', x: 100, y: -20, delay: 0, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 100, y: 100 }, { x: 200, y: 200 }, { x: -20, y: 300 }], dropTable: FAIRY_BASIC.dropTable },
      { type: 'fairy_basic', x: 200, y: -20, delay: 15, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 200, y: 100 }, { x: 100, y: 200 }, { x: -20, y: 300 }], dropTable: FAIRY_BASIC.dropTable },
      { type: 'fairy_basic', x: 300, y: -20, delay: 30, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 300, y: 100 }, { x: 200, y: 200 }, { x: 400, y: 300 }], dropTable: FAIRY_BASIC.dropTable },
    ],
    delay: 120,
  },
  {
    enemies: [
      { type: 'fairy_radial', x: PLAYFIELD_WIDTH / 2, y: -20, delay: 0, patterns: FAIRY_RADIAL.patterns, hp: FAIRY_RADIAL.hp, path: [{ x: PLAYFIELD_WIDTH / 2, y: 120 }, { x: PLAYFIELD_WIDTH / 2, y: 120 }], dropTable: FAIRY_RADIAL.dropTable },
      { type: 'fairy_basic', x: 80, y: -20, delay: 30, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 80, y: 150 }, { x: -20, y: 300 }], dropTable: FAIRY_BASIC.dropTable },
      { type: 'fairy_basic', x: 304, y: -20, delay: 30, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 304, y: 150 }, { x: 404, y: 300 }], dropTable: FAIRY_BASIC.dropTable },
    ],
    delay: 180,
  },
  {
    enemies: [
      { type: 'fairy_spiral', x: 150, y: -20, delay: 0, patterns: FAIRY_SPIRAL.patterns, hp: FAIRY_SPIRAL.hp, path: [{ x: 150, y: 100 }, { x: 250, y: 100 }, { x: 150, y: 100 }], dropTable: FAIRY_SPIRAL.dropTable },
      { type: 'fairy_basic', x: 50, y: -20, delay: 60, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 50, y: 200 }, { x: -20, y: 350 }], dropTable: FAIRY_BASIC.dropTable },
      { type: 'fairy_basic', x: 334, y: -20, delay: 60, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 334, y: 200 }, { x: 404, y: 350 }], dropTable: FAIRY_BASIC.dropTable },
    ],
    delay: 180,
  },
];

const waves2: WaveDef[] = [
  {
    enemies: [
      { type: 'fairy_radial', x: 100, y: -20, delay: 0, patterns: FAIRY_RADIAL.patterns, hp: FAIRY_RADIAL.hp, path: [{ x: 100, y: 100 }, { x: 284, y: 100 }, { x: 100, y: 100 }], dropTable: FAIRY_RADIAL.dropTable },
      { type: 'fairy_radial', x: 284, y: -20, delay: 0, patterns: FAIRY_RADIAL.patterns, hp: FAIRY_RADIAL.hp, path: [{ x: 284, y: 100 }, { x: 100, y: 100 }, { x: 284, y: 100 }], dropTable: FAIRY_RADIAL.dropTable },
    ],
    delay: 240,
  },
  {
    enemies: [
      { type: 'fairy_spiral', x: PLAYFIELD_WIDTH / 2, y: -20, delay: 0, patterns: FAIRY_SPIRAL.patterns, hp: FAIRY_SPIRAL.hp * 1.5, path: [{ x: PLAYFIELD_WIDTH / 2, y: 80 }], dropTable: FAIRY_SPIRAL.dropTable },
      { type: 'fairy_basic', x: 60, y: -20, delay: 30, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 60, y: 180 }, { x: 192, y: 250 }, { x: -20, y: 350 }], dropTable: FAIRY_BASIC.dropTable },
      { type: 'fairy_basic', x: 324, y: -20, delay: 30, patterns: FAIRY_BASIC.patterns, hp: FAIRY_BASIC.hp, path: [{ x: 324, y: 180 }, { x: 192, y: 250 }, { x: 404, y: 350 }], dropTable: FAIRY_BASIC.dropTable },
    ],
    delay: 240,
  },
  {
    enemies: [
      { type: 'fairy_radial', x: 80, y: -20, delay: 0, patterns: FAIRY_RADIAL.patterns, hp: FAIRY_RADIAL.hp, path: [{ x: 80, y: 120 }, { x: 304, y: 120 }], dropTable: FAIRY_RADIAL.dropTable },
      { type: 'fairy_radial', x: 304, y: -20, delay: 0, patterns: FAIRY_RADIAL.patterns, hp: FAIRY_RADIAL.hp, path: [{ x: 304, y: 120 }, { x: 80, y: 120 }], dropTable: FAIRY_RADIAL.dropTable },
      { type: 'fairy_spiral', x: 192, y: -20, delay: 60, patterns: FAIRY_SPIRAL.patterns, hp: FAIRY_SPIRAL.hp, path: [{ x: 192, y: 80 }], dropTable: [{ type: 'power', chance: 1, count: 5 }, { type: 'bomb', chance: 0.3, count: 1 }] },
    ],
    delay: 300,
  },
];

export const STAGE_1: StageDef = {
  id: 1,
  name: 'Lucid Meadow',
  theme: 'Ethereal flower fields with floating lanterns',
  bgm: 'bgm_stage1',
  bossBgm: 'bgm_boss1',
  waves1,
  midBoss: midBoss,
  waves2,
  boss,
};
```

**Step 3: Commit**

```bash
git add lib/dream-rift/data/
git commit -m "feat(dream-rift): add Stage 1 (Lucid Meadow) data with enemies and boss spell cards"
```

---

### Task 13: Stage Manager

**Files:**
- Create: `lib/dream-rift/stage-manager.ts`

**Step 1: Write stage manager**

The stage manager drives stage progression: waves, mid-boss, boss, dialogue triggers.

```typescript
// lib/dream-rift/stage-manager.ts
import type { StageDef, WaveDef, Boss, Enemy, Vec2 } from './types';
import { DreamRiftEngine } from './engine';
import { useDreamRiftStore } from './store';

export type StagePhase = 'intro' | 'waves1' | 'midBoss' | 'waves2' | 'boss' | 'clear';

export class StageManager {
  private stage: StageDef;
  private phase: StagePhase = 'intro';
  private waveIndex = 0;
  private waveTimer = 0;
  private phaseTimer = 0;
  private activeEnemies: Enemy[] = [];
  private activeBoss: Boss | null = null;

  constructor(stage: StageDef) {
    this.stage = stage;
  }

  getPhase(): StagePhase {
    return this.phase;
  }

  getActiveBoss(): Boss | null {
    return this.activeBoss;
  }

  startPhase(phase: StagePhase): void {
    this.phase = phase;
    this.phaseTimer = 0;
    this.waveIndex = 0;
    this.waveTimer = 0;

    if (phase === 'midBoss') {
      this.activeBoss = { ...this.stage.midBoss };
    } else if (phase === 'boss') {
      this.activeBoss = { ...this.stage.boss };
    } else {
      this.activeBoss = null;
    }
  }

  update(engine: DreamRiftEngine): void {
    this.phaseTimer++;

    switch (this.phase) {
      case 'intro':
        // Show dialogue, then transition
        if (this.phaseTimer > 180) { // 3 seconds for intro
          this.startPhase('waves1');
        }
        break;

      case 'waves1':
        this.updateWaves(this.stage.waves1, engine, 'midBoss');
        break;

      case 'midBoss':
        this.updateBoss(engine, 'waves2');
        break;

      case 'waves2':
        this.updateWaves(this.stage.waves2, engine, 'boss');
        break;

      case 'boss':
        this.updateBoss(engine, 'clear');
        break;

      case 'clear':
        if (this.phaseTimer > 180) {
          useDreamRiftStore.getState().nextStage();
        }
        break;
    }
  }

  private updateWaves(waves: WaveDef[], engine: DreamRiftEngine, nextPhase: StagePhase): void {
    if (this.waveIndex >= waves.length) {
      // All waves complete, check if enemies are cleared
      if (this.activeEnemies.every(e => !e.active)) {
        this.startPhase(nextPhase);
      }
      return;
    }

    this.waveTimer--;
    if (this.waveTimer <= 0) {
      const wave = waves[this.waveIndex];
      this.spawnWave(wave, engine);
      this.waveTimer = wave.delay;
      this.waveIndex++;
    }
  }

  private spawnWave(wave: WaveDef, engine: DreamRiftEngine): void {
    for (const def of wave.enemies) {
      const enemy: Enemy = {
        id: Math.random() * 100000 | 0,
        position: { x: def.x, y: def.y },
        velocity: { x: 0, y: 0 },
        active: true,
        sprite: def.type,
        hp: def.hp,
        maxHp: def.hp,
        type: def.type,
        patterns: def.patterns,
        currentPatternIndex: 0,
        patternTimer: 0,
        dropTable: def.dropTable,
      };
      this.activeEnemies.push(enemy);
    }
  }

  private updateBoss(engine: DreamRiftEngine, nextPhase: StagePhase): void {
    if (!this.activeBoss || this.activeBoss.hp <= 0) {
      this.startPhase(nextPhase);
      return;
    }

    // Boss AI: fire patterns from current spell card
    const spell = this.activeBoss.spellCards[this.activeBoss.currentSpellIndex];
    if (spell) {
      this.activeBoss.patternTimer++;
      for (const pattern of spell.patterns) {
        if (this.activeBoss.patternTimer % pattern.interval === 0) {
          const store = useDreamRiftStore.getState();
          engine.spawnEnemyPattern(
            this.activeBoss.position.x,
            this.activeBoss.position.y,
            pattern,
            store.player.position.x,
            store.player.position.y,
          );
        }
      }
    }
  }

  damageBoss(amount: number): void {
    if (!this.activeBoss) return;
    this.activeBoss.hp -= amount;

    // Check if current spell card HP depleted
    const spell = this.activeBoss.spellCards[this.activeBoss.currentSpellIndex];
    if (spell && this.activeBoss.hp <= this.getSpellThreshold()) {
      this.activeBoss.currentSpellIndex++;
      this.activeBoss.patternTimer = 0;
    }
  }

  private getSpellThreshold(): number {
    if (!this.activeBoss) return 0;
    let threshold = 0;
    for (let i = this.activeBoss.currentSpellIndex + 1; i < this.activeBoss.spellCards.length; i++) {
      threshold += this.activeBoss.spellCards[i].hp;
    }
    return threshold;
  }
}
```

**Step 2: Commit**

```bash
git add lib/dream-rift/stage-manager.ts
git commit -m "feat(dream-rift): add stage manager with wave spawning and boss phase progression"
```

---

## Phase 5: Dialogue & Story Integration

### Task 14: Dialogue System

**Files:**
- Create: `lib/dream-rift/dialogue.ts`
- Create: `components/dream-rift/DreamRiftDialogue.tsx`

**Step 1: Write dialogue engine**

```typescript
// lib/dream-rift/dialogue.ts
import type { DialogueLine } from './types';

export class DialogueManager {
  private lines: DialogueLine[] = [];
  private currentIndex = 0;
  private active = false;
  private onComplete?: () => void;

  start(lines: DialogueLine[], onComplete?: () => void): void {
    this.lines = lines;
    this.currentIndex = 0;
    this.active = true;
    this.onComplete = onComplete;
  }

  isActive(): boolean {
    return this.active;
  }

  getCurrentLine(): DialogueLine | null {
    if (!this.active || this.currentIndex >= this.lines.length) return null;
    return this.lines[this.currentIndex];
  }

  advance(): void {
    if (!this.active) return;
    this.currentIndex++;
    if (this.currentIndex >= this.lines.length) {
      this.active = false;
      this.onComplete?.();
    }
  }

  skip(): void {
    this.active = false;
    this.onComplete?.();
  }
}
```

**Step 2: Write dialogue UI component**

```typescript
// components/dream-rift/DreamRiftDialogue.tsx
'use client';
import { useEffect, useState } from 'react';
import type { DialogueLine } from '@/lib/dream-rift/types';

interface Props {
  line: DialogueLine;
  onAdvance: () => void;
  onSkip: () => void;
}

export function DreamRiftDialogue({ line, onAdvance, onSkip }: Props) {
  const [displayedText, setDisplayedText] = useState('');
  const [charIndex, setCharIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayedText('');
    setCharIndex(0);
    setDone(false);
  }, [line]);

  useEffect(() => {
    if (charIndex >= line.text.length) {
      setDone(true);
      return;
    }
    const timer = setTimeout(() => {
      setDisplayedText(line.text.slice(0, charIndex + 1));
      setCharIndex(charIndex + 1);
    }, 30);
    return () => clearTimeout(timer);
  }, [charIndex, line.text]);

  const handleClick = () => {
    if (!done) {
      setDisplayedText(line.text);
      setCharIndex(line.text.length);
      setDone(true);
    } else {
      onAdvance();
    }
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-black/85 border-t border-white/20 p-4 cursor-pointer z-20"
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        {line.portrait && (
          <div className="w-12 h-12 bg-white/10 rounded flex-shrink-0" />
        )}
        <div className="flex-1">
          <div className="text-xs text-yellow-400 font-bold mb-1 uppercase tracking-wider">
            {line.speaker}
          </div>
          <div className="text-white text-sm leading-relaxed font-mono">
            {displayedText}
            {!done && <span className="animate-pulse">|</span>}
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-white/30 text-[10px]">Click to continue</span>
        <button
          onClick={(e) => { e.stopPropagation(); onSkip(); }}
          className="text-white/30 text-[10px] hover:text-white/60"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add lib/dream-rift/dialogue.ts components/dream-rift/DreamRiftDialogue.tsx
git commit -m "feat(dream-rift): add dialogue manager and typewriter dialogue UI component"
```

---

### Task 15: Placeholder Script Data

**Files:**
- Create: `lib/dream-rift/data/script.ts`

This is a placeholder that will be replaced/enhanced by the story writing agent using UNO-MCP.

**Step 1: Write placeholder script**

```typescript
// lib/dream-rift/data/script.ts
import type { DialogueLine } from '../types';

export interface StageScript {
  stageIntro: DialogueLine[];
  midBossEncounter: { rei: DialogueLine[]; yume: DialogueLine[] };
  bossEncounter: { rei: DialogueLine[]; yume: DialogueLine[] };
  bossDefeat: { rei: DialogueLine[]; yume: DialogueLine[] };
  stageOutro: { rei: DialogueLine[]; yume: DialogueLine[] };
}

// Placeholder — to be written by story agent with UNO-MCP
export const SCRIPT: Record<number, StageScript> = {
  1: {
    stageIntro: [
      { speaker: 'narrator', text: 'The boundary between dreams and reality has begun to fracture...' },
      { speaker: 'narrator', text: 'Ethereal meadows stretch endlessly beneath a sky that shifts like watercolors.' },
    ],
    midBossEncounter: {
      rei: [
        { speaker: 'Dream Sprite', text: 'Another intruder from the waking world? You cannot pass!' },
        { speaker: 'rei', text: 'Get out of my way. I don\'t have time for games.', emotion: 'angry' },
      ],
      yume: [
        { speaker: 'Dream Sprite', text: 'Oh? A visitor? How unusual... and how unwise.' },
        { speaker: 'yume', text: 'Please, I just need to understand what\'s happening here.', emotion: 'neutral' },
      ],
    },
    bossEncounter: {
      rei: [
        { speaker: 'Keeper of the Gate', text: 'I am the Keeper. None may cross the threshold without proving their resolve.' },
        { speaker: 'rei', text: 'Then I\'ll prove it with my blade. Stand aside or be cut down!', emotion: 'angry' },
        { speaker: 'Keeper of the Gate', text: 'Such fire... Very well. Let us see if your conviction can withstand my test!' },
      ],
      yume: [
        { speaker: 'Keeper of the Gate', text: 'I am the Keeper. The gate exists to protect both worlds from what lies beyond.' },
        { speaker: 'yume', text: 'Then why is the rift opening? What\'s happening on the other side?', emotion: 'surprised' },
        { speaker: 'Keeper of the Gate', text: 'Questions, questions... Perhaps the answers lie in your ability to survive my trial.' },
      ],
    },
    bossDefeat: {
      rei: [
        { speaker: 'Keeper of the Gate', text: 'Impressive... Your strength is real. But what awaits you beyond is far worse.' },
        { speaker: 'rei', text: 'I\'ll handle it. Just open the gate.', emotion: 'neutral' },
      ],
      yume: [
        { speaker: 'Keeper of the Gate', text: 'You passed... but the deeper you go, the more the dream will try to keep you.' },
        { speaker: 'yume', text: 'Thank you for the warning. I\'ll be careful.', emotion: 'happy' },
      ],
    },
    stageOutro: {
      rei: [
        { speaker: 'narrator', text: 'The gate swings open. Beyond it, an infinite library stretches into darkness...' },
      ],
      yume: [
        { speaker: 'narrator', text: 'The gate fades, revealing shelves upon shelves of books, their pages whispering...' },
      ],
    },
  },
};
```

**Step 2: Commit**

```bash
git add lib/dream-rift/data/script.ts
git commit -m "feat(dream-rift): add placeholder Stage 1 script (to be enhanced by story agent)"
```

---

## Phase 6: Audio, Polish & Remaining Stages

### Task 16: Audio Manager

**Files:**
- Create: `lib/dream-rift/audio.ts`

**Step 1: Write audio manager**

```typescript
// lib/dream-rift/audio.ts
import { Howl, Howler } from 'howler';

interface SoundDef {
  src: string[];
  volume?: number;
  loop?: boolean;
}

const SFX: Record<string, SoundDef> = {
  shot:      { src: ['/audio/dream-rift/shot.wav'], volume: 0.3 },
  hit:       { src: ['/audio/dream-rift/hit.wav'], volume: 0.4 },
  graze:     { src: ['/audio/dream-rift/graze.wav'], volume: 0.2 },
  itemGet:   { src: ['/audio/dream-rift/item.wav'], volume: 0.5 },
  spellCard: { src: ['/audio/dream-rift/spell.wav'], volume: 0.7 },
  death:     { src: ['/audio/dream-rift/death.wav'], volume: 0.6 },
  oneUp:     { src: ['/audio/dream-rift/1up.wav'], volume: 0.8 },
  melee:     { src: ['/audio/dream-rift/melee.wav'], volume: 0.4 },
  dash:      { src: ['/audio/dream-rift/dash.wav'], volume: 0.3 },
  pause:     { src: ['/audio/dream-rift/pause.wav'], volume: 0.5 },
};

export class AudioManager {
  private sounds: Map<string, Howl> = new Map();
  private bgm: Howl | null = null;
  private bgmKey: string | null = null;

  preload(): void {
    for (const [key, def] of Object.entries(SFX)) {
      this.sounds.set(key, new Howl({ ...def, preload: true }));
    }
  }

  play(key: string): void {
    this.sounds.get(key)?.play();
  }

  playBGM(src: string): void {
    if (this.bgmKey === src) return;
    this.stopBGM();
    this.bgmKey = src;
    this.bgm = new Howl({
      src: [src],
      volume: 0.5,
      loop: true,
    });
    this.bgm.play();
  }

  stopBGM(): void {
    this.bgm?.stop();
    this.bgm?.unload();
    this.bgm = null;
    this.bgmKey = null;
  }

  setVolume(volume: number): void {
    Howler.volume(volume);
  }

  destroy(): void {
    this.stopBGM();
    this.sounds.forEach((s) => s.unload());
    this.sounds.clear();
  }
}
```

**Step 2: Commit**

```bash
git add lib/dream-rift/audio.ts
git commit -m "feat(dream-rift): add audio manager with SFX and BGM support"
```

---

### Task 17: Create Remaining Stage Data (Stages 2-6)

**Files:**
- Create: `lib/dream-rift/data/stages/stage2.ts` (Drowning Library)
- Create: `lib/dream-rift/data/stages/stage3.ts` (Clockwork Abyss)
- Create: `lib/dream-rift/data/stages/stage4.ts` (Mirror Palace)
- Create: `lib/dream-rift/data/stages/stage5.ts` (Burning Carnival)
- Create: `lib/dream-rift/data/stages/stage6.ts` (The Rift Core)
- Create: `lib/dream-rift/data/stages/index.ts` (barrel export)

Each stage follows the same `StageDef` structure as Stage 1 with escalating difficulty, unique enemy types, and themed spell cards. Stage 6's Rift Core should have stunningly beautiful visual descriptions in its theme data.

**Step 1:** Create each stage file following the Stage 1 pattern but with:
- Increasing enemy HP and bullet density
- Unique spell card names and patterns per boss
- Stage 6 boss (The Dreamer) has 5 spell card phases

**Step 2:** Create barrel export

```typescript
// lib/dream-rift/data/stages/index.ts
import { STAGE_1 } from './stage1';
import { STAGE_2 } from './stage2';
import { STAGE_3 } from './stage3';
import { STAGE_4 } from './stage4';
import { STAGE_5 } from './stage5';
import { STAGE_6 } from './stage6';
import type { StageDef } from '../../types';

export const STAGES: Record<number, StageDef> = {
  1: STAGE_1,
  2: STAGE_2,
  3: STAGE_3,
  4: STAGE_4,
  5: STAGE_5,
  6: STAGE_6,
};
```

**Step 3: Commit**

```bash
git add lib/dream-rift/data/stages/
git commit -m "feat(dream-rift): add all 6 stage definitions with enemies and boss data"
```

---

### Task 18: Game Over, Continue, and Results Screens

**Files:**
- Create: `components/dream-rift/DreamRiftGameOver.tsx`
- Create: `components/dream-rift/DreamRiftStageResult.tsx`
- Create: `components/dream-rift/DreamRiftPause.tsx`
- Modify: `components/dream-rift/DreamRiftGame.tsx` (add new screen overlays)

**Step 1:** Create game over screen with continue prompt, results screen with score breakdown (spell captures, graze total, stage bonus), and pause menu. Follow the pattern established in DreamRiftTitle.tsx — absolute positioned overlays with bg-black/80.

**Step 2:** Update DreamRiftGame.tsx to render the new screens based on store.screen state.

**Step 3: Commit**

```bash
git add components/dream-rift/
git commit -m "feat(dream-rift): add game over, stage result, and pause screen components"
```

---

### Task 19: Difficulty Select Screen

**Files:**
- Create: `components/dream-rift/DreamRiftDifficultySelect.tsx`
- Modify: `components/dream-rift/DreamRiftGame.tsx`

**Step 1:** Create difficulty select screen shown after character select. 4 options: Easy, Normal, Hard, Lunatic. Each shows a brief description. Selecting one calls `selectDifficulty()` then `startGame()`.

**Step 2:** Add `screen === 'difficultySelect'` rendering to DreamRiftGame.tsx.

**Step 3: Commit**

```bash
git add components/dream-rift/
git commit -m "feat(dream-rift): add difficulty selection screen"
```

---

### Task 20: Score Submission & Leaderboard UI

**Files:**
- Create: `components/dream-rift/DreamRiftLeaderboard.tsx`
- Modify: `components/dream-rift/DreamRiftStageResult.tsx` (add submit button)

**Step 1:** Create leaderboard component that fetches from `/api/dream-rift/leaderboard?difficulty=X` and displays top 20 scores. Add score submission to the results screen using the existing auth pattern from the codebase.

**Step 2: Commit**

```bash
git add components/dream-rift/
git commit -m "feat(dream-rift): add leaderboard display and score submission"
```

---

### Task 21: Register Game in Games Hub

**Files:**
- Modify: relevant games listing component (check `app/games/page.tsx` or equivalent)

**Step 1:** Add Dream Rift to the games hub with title, description, thumbnail, and link to `/dream-rift`.

**Step 2: Commit**

```bash
git add app/games/
git commit -m "feat(dream-rift): register game in the games hub listing"
```

---

### Task 22: Integration Test — Full Flow

**Step 1:** Start dev server

```bash
pnpm dev
```

**Step 2:** Navigate to `http://localhost:7005/dream-rift`

**Step 3:** Verify:
- Title screen renders with "Start Game" button
- Character select shows Rei and Yume
- Difficulty select shows 4 options
- Game starts: player sprite appears, can move with arrow keys
- X key fires bullets upward
- Z performs melee (cooldown visible)
- A dashes in movement direction
- S uses a bomb
- Shift slows movement and shows hitbox dot
- HUD sidebar shows score, lives, bombs, power, graze
- Stage 1 enemies spawn and fire patterns
- Collecting items increases power/score
- Boss appears with spell cards
- Death reduces lives, game over at 0

**Step 4: Commit final adjustments**

```bash
git add -A
git commit -m "fix(dream-rift): integration test fixes and polish"
```

---

## File Structure Summary

```
lib/dream-rift/
├── types.ts              # Task 1
├── constants.ts          # Task 2
├── input.ts              # Task 3
├── pool.ts               # Task 4
├── collision.ts          # Task 5
├── patterns.ts           # Task 6
├── store.ts              # Task 7
├── engine.ts             # Task 8
├── stage-manager.ts      # Task 13
├── dialogue.ts           # Task 14
├── audio.ts              # Task 16
├── __tests__/
│   ├── input.test.ts     # Task 3
│   ├── pool.test.ts      # Task 4
│   ├── collision.test.ts # Task 5
│   └── patterns.test.ts  # Task 6
└── data/
    ├── enemies.ts        # Task 12
    ├── script.ts         # Task 15 (enhanced by story agent)
    └── stages/
        ├── index.ts      # Task 17
        ├── stage1.ts     # Task 12
        ├── stage2.ts     # Task 17
        ├── stage3.ts     # Task 17
        ├── stage4.ts     # Task 17
        ├── stage5.ts     # Task 17
        └── stage6.ts     # Task 17

app/dream-rift/
└── page.tsx              # Task 11

app/api/dream-rift/
├── leaderboard/route.ts  # Task 10
└── score/route.ts        # Task 10

components/dream-rift/
├── DreamRiftGame.tsx           # Task 11
├── DreamRiftTitle.tsx          # Task 11
├── DreamRiftCharSelect.tsx     # Task 11
├── DreamRiftDifficultySelect.tsx # Task 19
├── DreamRiftHUD.tsx            # Task 11
├── DreamRiftDialogue.tsx       # Task 14
├── DreamRiftGameOver.tsx       # Task 18
├── DreamRiftStageResult.tsx    # Task 18
├── DreamRiftPause.tsx          # Task 18
└── DreamRiftLeaderboard.tsx    # Task 20

prisma/schema.prisma       # Task 9 (modified)
```

## Task Dependency Graph

```
Task 0A (deps) ──────────────────────────────────────────────┐
Task 0B (story agent) ──── runs in parallel ────────────────→│→ Task 15
                                                              │
Task 1 (types) ─┬──→ Task 2 (constants) ─┬──→ Task 3 (input)│
                │                         │                   │
                │                         ├──→ Task 4 (pool)  │
                │                         │                   │
                │                         ├──→ Task 5 (collision)
                │                         │                   │
                │                         └──→ Task 6 (patterns)
                │                                             │
                ├──→ Task 7 (store) ─────────→ Task 8 (engine)
                │                                    │
                ├──→ Task 9 (prisma) ─→ Task 10 (API)│
                │                                    │
                └──→ Task 11 (route + components) ───┤
                                                     │
Task 12 (stage1 data) ──→ Task 13 (stage manager) ──┤
                                                     │
Task 14 (dialogue) ──→ Task 15 (script) ─────────────┤
                                                     │
Task 16 (audio) ─────────────────────────────────────┤
                                                     │
Task 17 (stages 2-6) ───────────────────────────────┤
                                                     │
Task 18 (game over/results) ─────────────────────────┤
Task 19 (difficulty select) ─────────────────────────┤
Task 20 (leaderboard UI) ───────────────────────────┤
Task 21 (games hub) ────────────────────────────────┤
                                                     │
Task 22 (integration test) ◄─────────────────────────┘
```
