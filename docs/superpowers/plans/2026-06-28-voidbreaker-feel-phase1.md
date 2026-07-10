# Void Breaker — Phase 1 (Game-Feel & Animation Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Void Breaker combat *feel* premium — weighty, readable, satisfying — by generalizing the existing hitstop/shake primitives into a renderer-agnostic "feel layer," adding spawn/death animation lifecycles, and layering impact VFX, weapon feel, UI juice, and synced audio. No new gameplay or content.

**Architecture:** The engine (`lib/void-breaker/game.ts`) owns *what* impactful thing happened and *how hard* (intensity); both renderers (`renderer.ts`, `renderer3d.ts`) are pure visualizers of that state. New engine state is deterministic and unit-tested; visual layers are verified by manual browser playtest. A new `headless` flag keeps the balance-sim outcomes honest by disabling presentation-only time distortion.

**Tech Stack:** TypeScript, Vitest (tests via `node_modules/.bin/vitest`), three.js (3D renderer), Canvas 2D (fallback renderer), procedural WebAudio (`audio.ts`), TanStack Router + React (components). Sim harness via `node_modules/.bin/tsx`.

## Global Constraints

- **No gameplay/balance changes.** Combat outcomes (damage, HP, kills, spawns, scoring) must be identical. Only presentation/timing changes. Verify via `scripts/void-breaker-balance-sim.ts`.
- **No new content.** No new enemies, bosses, upgrades, maps, characters — that is Phase 2.
- **No renderer rewrite.** Build on the existing 2D + 3D renderers and their `VBRenderer` interface (`getAimPoint`, `draw(game, dt)`, `dispose`).
- **Headless-safe.** All time-distortion (hitstop) and animation timing must not change `scripts/void-breaker-balance-sim.ts` results once it sets the new `headless` flag. The feel layer is presentation-only.
- **Respect accessibility.** Honor the existing Reduced Effects path: both renderers have `setReducedFx(on)` / a `reducedFx` field that scales effects down. New visual intensity must scale with it.
- **Run commands** (from `verify-commands` memory): use `node_modules/.bin/*` directly, e.g. `node_modules/.bin/vitest run lib/__tests__/void-breaker-engine.test.ts`. There is no DOM test env — engine tests only, no renderer/component unit tests.
- **Both renderers stay in visual sync.** Any new feel state a renderer reads must be read by both (or deliberately no-op in one with a comment).

---

## Existing infrastructure (read before starting)

These already exist in `lib/void-breaker/game.ts` — the plan extends them, does not recreate them:

- `hitStopTimer: number` (field, line ~135). Consumed by an early-return at the top of `update()` (line ~364): while `> 0`, the sim is frozen and `update` returns before `elapsedMs` advances.
- `requestHitStop(ms: number)` (line ~1854): `s = ms/1000; if (s > this.hitStopTimer) this.hitStopTimer = Math.min(s, 0.25)`. Currently called only on boss kill (220ms) and elite kill (50ms).
- Shake: fields `shakeX, shakeY` (public, read by renderers), private `shakeDur, shakeT, shakeMag`; `triggerShake(mag, ms)` (line ~1821) and `updateShake(dt)` (line ~1830). Currently flat magnitude with linear ease-out; renderers multiply `shakeX/Y` by 4 (2D, `renderer.ts:125`) and 1.5 (3D, `renderer3d.ts:568`).
- `spawnParticles(x, y, color, count, speed)`, `spawnShockwave(x, y, maxRadius, color, width)`, `emitSfx(name, opts?)`, `popups.push({ text, x, y, life, maxLife, color })`.
- `hitFlashUntil` on `Player` and `Enemy` (timestamp; renderer draws a flash until then).
- Renderers implement `VBRenderer` (`renderer3d.ts:43`). Both have `reducedFx` + `setReducedFx`.
- Sim harness `scripts/void-breaker-balance-sim.ts` builds `new VoidBreakerEngine()` and loops `g.update(1/60, input)` up to `60*60*12` ticks. It does **not** currently set any feel flag.
- Component `components/void-breaker/VoidBreakerGame.tsx` drains `game.sfxEvents` each frame (line ~305) and calls `sfx.play(...)`.

---

## Task ordering & parallelization

- **Tasks 1–2 are the foundation** (engine trauma + hitstop generalization + headless flag). They must land first and in order.
- **Tasks 3–8 depend on the foundation but are mutually independent** — they are the parallel-agent fan-out units. Task 4 depends on Task 3 (it renders the lifecycle Task 3 creates); run 3 before 4. Tasks 5, 6, 7, 8 can each run in parallel after Task 2.

---

### Task 1: Trauma-based shake model + `headless` flag (engine foundation)

**Files:**
- Modify: `lib/void-breaker/game.ts` (shake fields ~111–163, `triggerShake`/`updateShake` ~1821–1842, `update` early-return ~360–368, `requestHitStop` ~1854, `startGame` reset ~253–256)
- Test: `lib/__tests__/void-breaker-feel.test.ts` (create)

**Interfaces:**
- Consumes: existing `shakeX`, `shakeY`, `update(dt, input)`, `requestHitStop(ms)`.
- Produces:
  - `headless: boolean` (public field, default `false`). When `true`: `requestHitStop` is a no-op and the hitstop early-return never fires (presentation-only time distortion disabled).
  - `addTrauma(amount: number): void` — adds `amount` (clamped so total trauma ∈ [0,1]) to a trauma accumulator. `triggerShake(mag, ms)` is reimplemented to call `addTrauma` (mapping legacy magnitude to trauma) so existing call sites keep working.
  - Shake output stays the same public contract: `shakeX`, `shakeY` are set each frame from `trauma²`. Renderers are unchanged.
  - `trauma: number` (public, 0–1) for renderers/tests to read.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/void-breaker-feel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { VoidBreakerEngine } from '@/lib/void-breaker/game';
import type { InputState } from '@/lib/void-breaker/types';

function makeInput(over: Partial<InputState> = {}): InputState {
  return {
    up: false, down: false, left: false, right: false,
    mouseX: 800, mouseY: 500,
    detonate: false, dash: false, focus: false, pause: false,
    voidPulse: false, phaseShift: false, reflectShield: false, allySynergy: false,
    ...over,
  };
}
function advanceToPlaying(g: VoidBreakerEngine): void {
  for (let i = 0; i < 200 && g.state !== 'playing'; i++) g.update(0.05, makeInput());
}

describe('feel layer — trauma shake', () => {
  it('addTrauma clamps to [0,1] and decays to ~0 over time', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.waveEnemiesAlive = 999;                 // don't let the wave clear
    g.player.invincibleUntil = g.elapsedMs + 1e9;
    g.addTrauma(5);                            // over-add
    expect(g.trauma).toBe(1);                  // clamped
    for (let i = 0; i < 120; i++) g.update(0.05, makeInput());
    expect(g.trauma).toBeLessThan(0.05);       // decayed
  });

  it('shake magnitude scales with trauma squared (small trauma ≪ big trauma)', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    advanceToPlaying(g);
    g.waveEnemiesAlive = 999;
    g.player.invincibleUntil = g.elapsedMs + 1e9;
    g.addTrauma(0.2);
    g.update(0.016, makeInput());
    const small = Math.abs(g.shakeX) + Math.abs(g.shakeY);
    g.trauma = 0; g.shakeX = 0; g.shakeY = 0;
    g.addTrauma(0.8);
    g.update(0.016, makeInput());
    const big = Math.abs(g.shakeX) + Math.abs(g.shakeY);
    // quadratic curve: 4x trauma → much more than 4x shake (statistically; allow slack)
    expect(big).toBeGreaterThan(small * 5);
  });
});

describe('feel layer — headless flag', () => {
  it('headless disables hitstop so the sim is not time-distorted', () => {
    const g = new VoidBreakerEngine();
    g.headless = true;
    g.startGame();
    advanceToPlaying(g);
    g.requestHitStop(200);
    expect(g.hitStopTimer).toBe(0);            // no-op under headless
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts`
Expected: FAIL — `addTrauma`/`trauma`/`headless` do not exist.

- [ ] **Step 3: Implement the engine changes**

In `lib/void-breaker/game.ts`:

1. Add fields near `shakeX`/`shakeY` (~line 113):

```typescript
  /** Presentation-only time distortion disabled when true (set by the headless sim). */
  headless = false;
  /** Screen-shake trauma accumulator, 0–1. Shake magnitude = trauma². */
  trauma = 0;
```

2. Add a tuning constant near the other private shake fields (~line 163):

```typescript
  /** Trauma decays this much per second (full → 0 in ~0.8s). */
  private readonly TRAUMA_DECAY = 1.25;
  /** Peak shake pixels at trauma = 1 (renderer still applies its own multiplier). */
  private readonly TRAUMA_MAX_SHAKE = 9;
```

3. Add `addTrauma` and rewrite `triggerShake` to map onto trauma (replace the body at ~1821):

```typescript
  /** Add screen-shake trauma (0–1 accumulator). Big events add more. */
  addTrauma(amount: number): void {
    this.trauma = Math.max(0, Math.min(1, this.trauma + amount));
  }

  /** Legacy shake API — maps a magnitude/duration request onto the trauma model. */
  private triggerShake(mag: number, _ms: number): void {
    // Old magnitudes ranged ~3–16; normalize to a 0–1 trauma add.
    this.addTrauma(Math.min(1, mag / 16));
  }
```

4. Rewrite `updateShake` (~1830) to be trauma-driven:

```typescript
  private updateShake(dt: number): void {
    this.trauma = Math.max(0, this.trauma - this.TRAUMA_DECAY * dt);
    const shake = this.trauma * this.trauma * this.TRAUMA_MAX_SHAKE;
    if (shake > 0.001) {
      this.shakeX = (Math.random() - 0.5) * 2 * shake;
      this.shakeY = (Math.random() - 0.5) * 2 * shake;
    } else {
      this.shakeX = 0; this.shakeY = 0;
    }
  }
```

5. Delete the now-unused `shakeDur`, `shakeT`, `shakeMag` fields (~161–163) and their resets in `startGame` (~254). Replace that reset line with `this.trauma = 0;`.

6. Make hitstop headless-safe. Change the early-return guard (~364):

```typescript
    if (!this.headless && this.hitStopTimer > 0 && (this.state === 'playing' || this.state === 'waveBreak')) {
      this.hitStopTimer -= dt;
      this.prevPause = input.pause;
      return;
    }
```

And make `requestHitStop` a no-op under headless (~1854):

```typescript
  private requestHitStop(ms: number): void {
    if (this.headless) return;
    const s = ms / 1000;
    if (s > this.hitStopTimer) this.hitStopTimer = Math.min(s, 0.25);
  }
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full engine suite to confirm no regressions**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-engine.test.ts`
Expected: PASS (existing boss/elite-kill shake call sites still compile via the remapped `triggerShake`).

- [ ] **Step 6: Make the sim use headless and confirm it still completes**

In `scripts/void-breaker-balance-sim.ts`, after `const g = new VoidBreakerEngine();` (~line 58) add `g.headless = true;`.

Run: `node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts 30`
Expected: completes, prints avg/median wave + win rate (numbers may shift slightly vs. before since hitstop no longer steals sim ticks — this is the intended fidelity fix). Record the output for the Task 2 comparison.

- [ ] **Step 7: Commit**

```bash
git add lib/void-breaker/game.ts lib/__tests__/void-breaker-feel.test.ts scripts/void-breaker-balance-sim.ts
git commit -m "Void Breaker (feel): trauma-based screen shake + headless sim flag"
```

---

### Task 2: Generalize hitstop + trauma across all impact events (engine)

**Files:**
- Modify: `lib/void-breaker/game.ts` — `killEnemy` (~1573), `checkPlayerHits` (crit/hit, ~1470), `damagePlayer` (~1554), `detonateShield` (~1679).
- Test: `lib/__tests__/void-breaker-feel.test.ts` (extend)

**Interfaces:**
- Consumes: `requestHitStop(ms)`, `addTrauma(amount)` from Task 1.
- Produces: impactful events now add trauma + (non-headless) hitstop with weights: crit ≈ small, regular kill ≈ tiny, detonate ≈ large, player-hurt ≈ medium, boss hit ≈ small. Boss/elite kill already do (keep, but route through `addTrauma`).

- [ ] **Step 1: Write the failing test** — append to `lib/__tests__/void-breaker-feel.test.ts`:

```typescript
describe('feel layer — impact events add trauma', () => {
  it('detonation adds significant trauma', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    // reach playing
    for (let i = 0; i < 200 && g.state !== 'playing'; i++) {
      g.update(0.05, { up:false,down:false,left:false,right:false,mouseX:800,mouseY:500,
        detonate:false,dash:false,focus:false,pause:false,voidPulse:false,phaseShift:false,
        reflectShield:false,allySynergy:false });
    }
    g.trauma = 0;
    g.player.shards = 20;
    g.player.detonateCooldown = 0;
    g.update(0.016, { up:false,down:false,left:false,right:false,mouseX:800,mouseY:500,
      detonate:true,dash:false,focus:false,pause:false,voidPulse:false,phaseShift:false,
      reflectShield:false,allySynergy:false });
    expect(g.trauma).toBeGreaterThan(0.3);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts -t "detonation adds significant trauma"`
Expected: FAIL — detonate adds no trauma yet.

- [ ] **Step 3: Implement** — add `addTrauma`/`requestHitStop` at the impact sites:

In `detonateShield()` (after the existing detonate sfx ~1724): `this.addTrauma(0.55); this.requestHitStop(90);`

In `killEnemy()`: in the `e.isElite` branch replace `this.triggerShake(7, 250)` with `this.addTrauma(0.35);` (keep `requestHitStop(50)`); in the boss branch replace `this.triggerShake(16, 700)` with `this.addTrauma(0.9);` (keep `requestHitStop(220)`); in the regular-kill `else` branch add `this.addTrauma(0.04);` (no hitstop — too frequent).

In `checkPlayerHits()` where a crit is detected (the `isCrit` branch ~1493): add `if (isCrit) { this.addTrauma(0.12); this.requestHitStop(45); }`.

In `damagePlayer()` (after `emitSfx('playerHurt')` ~1561): `this.addTrauma(0.4); this.requestHitStop(70);`.

- [ ] **Step 4: Run, verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts`
Expected: PASS (all feel tests).

- [ ] **Step 5: Confirm balance unchanged vs. Task 1 baseline**

Run: `node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts 30`
Expected: avg/median wave + win rate materially identical to the Task 1 Step 6 output (trauma/hitstop are no-ops or presentation-only under `headless`).

- [ ] **Step 6: Commit**

```bash
git add lib/void-breaker/game.ts lib/__tests__/void-breaker-feel.test.ts
git commit -m "Void Breaker (feel): hitstop + trauma on crits, kills, detonate, player-hurt"
```

---

### Task 3: Enemy spawn & death animation lifecycle (engine)

**Files:**
- Modify: `lib/void-breaker/types.ts` (`Enemy` interface ~37), `lib/void-breaker/game.ts` (`emptyEnemy` ~196, `spawnEnemy` ~840, `spawnBoss` ~791, `killEnemy` ~1573, `updateEnemies` ~915, AI/collision skip for non-active states)
- Test: `lib/__tests__/void-breaker-feel.test.ts` (extend)

**Interfaces:**
- Consumes: existing enemy pool + `killEnemy`.
- Produces:
  - `Enemy.anim: 'spawning' | 'alive' | 'dying'` and `Enemy.animTimer: number` (seconds remaining in the current spawning/dying phase).
  - Spawn: enemies start `anim:'spawning'` with `animTimer = SPAWN_ANIM_TIME` (≈0.35s). While spawning they are **inert and intangible** (no AI, no contact damage, not hittable) — purely a warp-in telegraph.
  - Death: `killEnemy` no longer immediately frees the slot. It does all the scoring/drops/sfx/trauma exactly as today (so outcomes are unchanged and `waveEnemiesAlive--` still happens at kill time), then sets `anim:'dying'`, `animTimer = DEATH_ANIM_TIME` (≈0.3s), and makes the enemy intangible. `updateEnemies` decrements `animTimer` and sets `active=false` when it hits 0 (freeing the pool slot).
  - Constants `SPAWN_ANIM_TIME`, `DEATH_ANIM_TIME` exported from `lib/void-breaker/constants.ts`.

**Critical for "no balance change":** `waveEnemiesAlive--`, `enemiesKilled++`, scoring, shard/heart drops, splitter-split, and combo all stay in `killEnemy` at the moment of death (not deferred). Only the *visual slot-free* is deferred. A `dying` enemy must be excluded from AI, contact, projectile-hit, and targeting so it can't act or be re-killed.

- [ ] **Step 1: Write the failing test** — append:

```typescript
import { SPAWN_ANIM_TIME, DEATH_ANIM_TIME } from '@/lib/void-breaker/constants';

describe('feel layer — enemy lifecycle', () => {
  it('a killed enemy enters dying then frees its slot, with kill counted immediately', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    for (let i = 0; i < 200 && g.state !== 'playing'; i++) g.update(0.05, mk());
    g.enemies.forEach(e => (e.active = false));
    g.projectiles.forEach(p => (p.active = false));
    g.obstacles = []; g.waveEnemiesAlive = 99;
    const e = g.enemies.find(en => !en.active)!;
    e.active = true; e.isBoss = false; e.isElite = false; e.type = 'drifter';
    e.x = 1200; e.y = 500; e.radius = 10; e.hp = 1; e.maxHp = 1; e.shardCount = 1;
    e.value = 10; e.color = '#8866cc'; e.anim = 'alive'; e.animTimer = 0;
    e.speed = 0; e.vx = 0; e.vy = 0; e.dashState = 'idle';
    const killedBefore = g.enemiesKilled;
    // @ts-expect-error private for test
    g.killEnemy(e);
    expect(g.enemiesKilled).toBe(killedBefore + 1); // counted at death
    expect(e.anim).toBe('dying');
    expect(e.active).toBe(true);                     // still occupying slot for the anim
    for (let i = 0; i < Math.ceil(DEATH_ANIM_TIME / 0.05) + 2; i++) g.update(0.05, mk());
    expect(e.active).toBe(false);                    // slot freed after the anim
  });

  it('SPAWN/DEATH anim times are short and positive', () => {
    expect(SPAWN_ANIM_TIME).toBeGreaterThan(0);
    expect(SPAWN_ANIM_TIME).toBeLessThan(1);
    expect(DEATH_ANIM_TIME).toBeGreaterThan(0);
    expect(DEATH_ANIM_TIME).toBeLessThan(1);
  });
});

function mk() {
  return { up:false,down:false,left:false,right:false,mouseX:800,mouseY:500,
    detonate:false,dash:false,focus:false,pause:false,voidPulse:false,phaseShift:false,
    reflectShield:false,allySynergy:false };
}
```

- [ ] **Step 2: Run, verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts -t "enemy lifecycle"`
Expected: FAIL — `anim`/`animTimer`/constants missing.

- [ ] **Step 3: Implement**

1. `constants.ts` — add: `export const SPAWN_ANIM_TIME = 0.35;` and `export const DEATH_ANIM_TIME = 0.3;`

2. `types.ts` `Enemy` — add fields: `anim: 'spawning' | 'alive' | 'dying';` and `animTimer: number;`

3. `game.ts` `emptyEnemy` — add `anim: 'alive', animTimer: 0,` to the returned object.

4. `game.ts` import the two constants at top from `./constants`.

5. In `spawnEnemy` and `spawnBoss`, after the enemy is configured set `e.anim = 'spawning'; e.animTimer = SPAWN_ANIM_TIME;` (bosses may use a longer telegraph; reuse the same field — the renderer scales by `maxHp`).

6. In `updateEnemies` (~915), at the top of the per-enemy loop body, handle non-alive states **before** AI/collision:

```typescript
      if (e.anim === 'spawning') {
        e.animTimer -= dt;
        if (e.animTimer <= 0) { e.anim = 'alive'; e.animTimer = 0; }
        continue; // intangible + inert while warping in
      }
      if (e.anim === 'dying') {
        e.animTimer -= dt;
        if (e.animTimer <= 0) e.active = false;
        continue; // intangible while dissolving
      }
```

7. Ensure contact/projectile/targeting skip non-alive enemies. In `checkPlayerHits`, `checkContact`, `checkEnemyProjHits`, and any enemy-targeting (healer/ally), add `if (e.anim !== 'alive') continue;` to the guard (alongside the existing `if (!e.active) continue;`). Grep for `if (!e.active) continue;` in those methods and extend each.

8. Rewrite the tail of `killEnemy` (~1626): replace `e.active = false;` with:

```typescript
    e.anim = 'dying';
    e.animTimer = DEATH_ANIM_TIME;
    e.hp = 0;
```

Keep `this.waveEnemiesAlive--; this.waveEnemiesKilledCount++;` and all scoring/drops above it exactly as-is.

- [ ] **Step 4: Run, verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts -t "enemy lifecycle"`
Expected: PASS.

- [ ] **Step 5: Run the full engine suite (this touches kill/contact paths)**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-engine.test.ts lib/__tests__/void-breaker-feel.test.ts`
Expected: PASS. If `placeEnemy`-based tests fail because the helper doesn't set `anim`, that's expected — update the shared helper in `void-breaker-engine.test.ts` `placeEnemy` to set `e.anim = 'alive'; e.animTimer = 0;` (this is test-harness upkeep, not a behavior change).

- [ ] **Step 6: Confirm balance unchanged**

Run: `node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts 30`
Expected: materially identical to Task 2. (Spawning enemies are inert ~0.35s; this marginally delays first contact but does not change outcomes — confirm avg wave within noise. If it shifts meaningfully, reduce `SPAWN_ANIM_TIME` or make spawned enemies tangible-but-inert; record the result.)

- [ ] **Step 7: Commit**

```bash
git add lib/void-breaker/types.ts lib/void-breaker/game.ts lib/void-breaker/constants.ts lib/__tests__/
git commit -m "Void Breaker (feel): enemy spawn/death animation lifecycle (engine)"
```

---

### Task 4: Render spawn warp-in & death dissolve (both renderers)

**Files:**
- Modify: `lib/void-breaker/renderer.ts` (enemy draw path), `lib/void-breaker/renderer3d.ts` (enemy mesh update path)
- Verify: manual browser playtest (no unit test — visual, no DOM test env)

**Interfaces:**
- Consumes: `Enemy.anim`, `Enemy.animTimer`, and the constants `SPAWN_ANIM_TIME`/`DEATH_ANIM_TIME` from Task 3.
- Produces: visible warp-in on spawn and a death sequence; no engine changes.

- [ ] **Step 1: 2D renderer — spawn telegraph + death dissolve**

In `renderer.ts` where each enemy is drawn, compute a progress value and modulate alpha/scale:
- Spawning: `const t = 1 - e.animTimer / SPAWN_ANIM_TIME;` draw the enemy at `scale = 0.3 + 0.7*t`, `alpha = t`, plus an expanding telegraph ring (reuse the shockwave draw style) of radius `e.radius * (2 - t)`.
- Dying: `const t = e.animTimer / DEATH_ANIM_TIME;` (1→0) draw at `scale = 1 + (1-t)*0.6`, `alpha = t`, tinted toward white. Skip the normal body fill when `t` is near 0.
- Scale all extra intensity by `this.reducedFx ? 0.4 : 1`.

Import `SPAWN_ANIM_TIME`, `DEATH_ANIM_TIME` from `./constants`.

- [ ] **Step 2: 3D renderer — spawn scale-in + death scale-out/fade**

In `renderer3d.ts` enemy mesh update, set `mesh.scale` and material opacity from the same `t`:
- Spawning: scale lerps `0.2 → 1`, emissive intensity boosted (warp-in glow), opacity `t`.
- Dying: scale `1 → 1.6`, opacity `t → 0`; ensure the material is `transparent = true` during the dying phase (restore when reused from the pool).
- Honor `reducedFx` (smaller scale punch, no extra glow).

- [ ] **Step 3: Manual verify (both renderers)**

Run the dev server (`node_modules/.bin/vite dev` per repo convention, or `pnpm run dev` if available), open `/void-breaker`, play wave 1–2. Confirm: enemies warp in (don't pop), enemies dissolve on death (don't vanish), no enemy is hittable mid-warp, no flicker, both 3D (default) and 2D (settings toggle) look right, and Reduced Effects tones it down.

- [ ] **Step 4: Commit**

```bash
git add lib/void-breaker/renderer.ts lib/void-breaker/renderer3d.ts
git commit -m "Void Breaker (feel): render enemy warp-in + death dissolve"
```

---

### Task 5: Weapon & projectile feel (engine + renderers)

**Files:**
- Modify: `lib/void-breaker/game.ts` (`firePlayerProj` ~633), `lib/void-breaker/renderer.ts` + `renderer3d.ts` (player + projectile draw)
- Test: `lib/__tests__/void-breaker-feel.test.ts` (extend — recoil offset only)

**Interfaces:**
- Consumes: `stats` (`PlayerStats`: multishot, pierce, damage), `player.aimAngle`.
- Produces:
  - `Player.recoil: number` (0→1 kick that decays) added to `types.ts` `Player` + reset in `startGame` + decayed in `updatePlayer`. Set to ~1 on fire. Renderers offset the player sprite/mesh backward along `aimAngle` by `recoil * k`. **Visual only** — does not move the player's collision `x/y`.
  - Renderers draw build-distinct projectiles: piercing → elongated beam trail, multishot → already multiple bullets (just style), high-caliber (large `radius`/`damage`) → bigger, slower-looking round with a heavier glow. Pure presentation keyed off projectile `radius`/`pierce`.

- [ ] **Step 1: Write the failing test** — append:

```typescript
describe('feel layer — recoil', () => {
  it('firing sets recoil that decays toward 0', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    for (let i = 0; i < 200 && g.state !== 'playing'; i++) g.update(0.05, mk());
    g.player.fireTimer = 0;
    g.update(0.016, mk());                 // should fire
    expect(g.player.recoil).toBeGreaterThan(0);
    const after = g.player.recoil;
    for (let i = 0; i < 30; i++) g.update(0.016, mk());
    expect(g.player.recoil).toBeLessThan(after);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts -t "recoil"`
Expected: FAIL — `recoil` missing.

- [ ] **Step 3: Implement engine recoil**

`types.ts` `Player` — add `recoil: number;`. `game.ts` `startGame` — add `recoil: 0,`. In `firePlayerProj` set `this.player.recoil = 1;`. In `updatePlayer` decay: `this.player.recoil = Math.max(0, this.player.recoil - rawDt * 6);`.

- [ ] **Step 4: Run, verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts -t "recoil"`
Expected: PASS.

- [ ] **Step 5: Renderers — apply recoil + projectile styling**

2D (`renderer.ts`) and 3D (`renderer3d.ts`): offset player draw by `-cos/sin(aimAngle) * recoil * k` (k ≈ 6px 2D / scene-units 3D). Muzzle flash intensity already exists in 3D — scale it by recoil. Style projectiles by `pierce`/`radius` as described. Honor `reducedFx`.

- [ ] **Step 6: Manual verify** — fire feels kicky; multishot/pierce/high-caliber builds look distinct. Both renderers.

- [ ] **Step 7: Commit**

```bash
git add lib/void-breaker/types.ts lib/void-breaker/game.ts lib/void-breaker/renderer.ts lib/void-breaker/renderer3d.ts lib/__tests__/void-breaker-feel.test.ts
git commit -m "Void Breaker (feel): weapon recoil + build-distinct projectile visuals"
```

---

### Task 6: Impact VFX layering (renderers only)

**Files:**
- Modify: `lib/void-breaker/renderer.ts`, `lib/void-breaker/renderer3d.ts`
- Verify: manual browser playtest

**Interfaces:**
- Consumes: existing `particles`, `popups`, `shockwaves`, enemy/player `hitFlashUntil`, `comboCount`/`comboMultiplier`, `surgeMultiplier`.
- Produces: richer presentation only — no engine state added.

- [ ] **Step 1: Damage-number polish (both renderers)**

In the popup draw path: scale font size by magnitude (parse leading `+`), give `CRIT` popups a punchy pop-in (scale from 1.6→1 over life) and a hotter color; tier `+points` color by size. Add a slight upward drift + fade (life-driven).

- [ ] **Step 2: Hit sparks + kill bursts (both renderers)**

When `hitFlashUntil` is fresh on an enemy, draw a brief directional spark cluster at the enemy. (Engine already spawns particles on hit/kill; this is extra renderer-side flourish — keep it cheap, cap counts, honor `reducedFx`.)

- [ ] **Step 3: Combo / surge escalation (both renderers)**

When `comboMultiplier` or `surgeMultiplier` is high, intensify the scene: stronger bloom/vignette pulse (3D) or a screen-edge glow (2D). Keep subtle; honor `reducedFx`.

- [ ] **Step 4: Manual verify** — hits spark, kills burst, big numbers read as big, high combo/surge visibly escalates. Both renderers; Reduced Effects sane.

- [ ] **Step 5: Commit**

```bash
git add lib/void-breaker/renderer.ts lib/void-breaker/renderer3d.ts
git commit -m "Void Breaker (feel): impact VFX layering — sparks, kill bursts, damage-number + combo polish"
```

---

### Task 7: UI / menu juice (components)

**Files:**
- Modify: `components/void-breaker/VoidBreakerUI.tsx`, `components/void-breaker/VoidBreakerGame.tsx` (only if HUD plumbing is needed)
- Verify: manual browser playtest

**Interfaces:**
- Consumes: existing `HUDState` (`pendingUpgrades`, `upgradeIsBossReward`, `waveBreak`, `bossActive`, `bossName`, `bossPhase`, `combo`, `surge`, `pendingUnlock`).
- Produces: animated UI only — no new engine/HUD fields unless a needed signal is missing (if so, add it to `HUDState` in `types.ts` and populate it where the engine builds the snapshot; note it in the commit).

- [ ] **Step 1: Upgrade-card reveal animation** — cards in the upgrade screen stagger-in (translate/opacity/scale) and have a hover/selected pop. Boss-reward offers (`upgradeIsBossReward`) get a richer treatment (gold accents, stronger entrance).

- [ ] **Step 2: Wave-clear celebration** — a brief animated banner on `waveBreak` (count-up of wave, subtle particles/CSS glow).

- [ ] **Step 3: Boss intro card** — when `bossActive` turns true, animate in a boss nameplate (`bossName`, phase pips from `bossPhase`) that slides/fades.

- [ ] **Step 4: Combo / surge HUD escalation** — the combo + surge readouts scale/color-shift as they climb.

- [ ] **Step 5: Menu / transition polish** — main menu, pause, and game-over transitions get tasteful enter/exit animation. Use CSS transitions/`@keyframes` or the project's existing animation approach (follow patterns already in `VoidBreakerUI.tsx`).

- [ ] **Step 6: Manual verify** — every screen/transition animates smoothly; respects reduced-motion if the app honors it; no layout jank.

- [ ] **Step 7: Commit**

```bash
git add components/void-breaker/VoidBreakerUI.tsx components/void-breaker/VoidBreakerGame.tsx
git commit -m "Void Breaker (feel): UI/menu juice — card reveals, wave-clear, boss intro, HUD escalation"
```

---

### Task 8: Signature moments + audio sync (engine + renderers + audio)

**Files:**
- Modify: `lib/void-breaker/game.ts` (boss death, surge start, big detonate, biome entrance), `lib/void-breaker/audio.ts` (new/expanded sfx), `lib/void-breaker/renderer3d.ts` + `renderer.ts` (slow-mo flash, surge takeover)
- Test: `lib/__tests__/void-breaker-feel.test.ts` (extend — slow-mo timer only)

**Interfaces:**
- Consumes: `addTrauma`, `requestHitStop`, `spawnShockwave`, `emitSfx`, `surgeMultiplier`, boss-death path in `killEnemy`.
- Produces:
  - `slowMoTimer: number` (public field) — set on boss death (~0.6s). In `update`, while `slowMoTimer > 0` and `!headless`, scale `worldDt`/`playerDt` by ~0.35 and decrement the timer with real `dt`. Headless-safe (no-op under `headless`, so the sim is unaffected). Reset in `startGame`.
  - A boss-death "flash" the renderers read (reuse the existing 3D `flashIntensity`; for 2D add a white overlay keyed off `slowMoTimer`).
  - Surge-mode visual takeover when `surgeMultiplier` is high (renderer-side; reuse Task 6 escalation, dialed up).
  - Audio: ensure every signature beat has a matching layered sound — extend `audio.ts` (e.g. a richer `bossKill` already exists; add a `slowmoWhoosh`/`surge` cue if missing, wired through `SfxName` + `emitSfx`).

- [ ] **Step 1: Write the failing test** — append:

```typescript
describe('feel layer — boss-death slow-mo', () => {
  it('boss death sets a slow-mo timer that is a no-op under headless', () => {
    const g = new VoidBreakerEngine();
    g.startGame();
    for (let i = 0; i < 200 && g.state !== 'playing'; i++) g.update(0.05, mk());
    g.enemies.forEach(e => (e.active = false));
    g.waveEnemiesAlive = 99;
    const boss = g.enemies.find(e => !e.active)!;
    boss.active = true; boss.isBoss = true; boss.type = 'drifter';
    boss.x = 800; boss.y = 500; boss.radius = 40; boss.hp = 1; boss.maxHp = 1;
    boss.color = '#ff3355'; boss.anim = 'alive'; boss.animTimer = 0; boss.shardCount = 0;
    // @ts-expect-error private for test
    g.killEnemy(boss);
    expect(g.slowMoTimer).toBeGreaterThan(0);

    const h = new VoidBreakerEngine();
    h.headless = true;
    h.startGame();
    for (let i = 0; i < 200 && h.state !== 'playing'; i++) h.update(0.05, mk());
    h.enemies.forEach(e => (e.active = false));
    h.waveEnemiesAlive = 99;
    const b2 = h.enemies.find(e => !e.active)!;
    b2.active = true; b2.isBoss = true; b2.type = 'drifter';
    b2.x = 800; b2.y = 500; b2.radius = 40; b2.hp = 1; b2.maxHp = 1;
    b2.color = '#ff3355'; b2.anim = 'alive'; b2.animTimer = 0; b2.shardCount = 0;
    // @ts-expect-error private for test
    h.killEnemy(b2);
    expect(h.slowMoTimer).toBe(0); // no-op under headless
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts -t "slow-mo"`
Expected: FAIL — `slowMoTimer` missing.

- [ ] **Step 3: Implement**

`game.ts`: add `slowMoTimer = 0;` field; reset in `startGame`. In `killEnemy` boss branch add `if (!this.headless) this.slowMoTimer = 0.6;`. In `update`, after computing `worldDt`/`playerDt` (~392): 

```typescript
      if (this.slowMoTimer > 0) {
        this.slowMoTimer = Math.max(0, this.slowMoTimer - dt);
        const slow = 0.35;
        // presentation-only: scale the world, not the player's agency budget hard
      }
```

Apply the `slow` factor to `worldDt`/`playerDt` while `slowMoTimer > 0` (guarded by `!headless`, which is implied since the timer is never set under headless).

- [ ] **Step 4: Run, verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-feel.test.ts -t "slow-mo"`
Expected: PASS.

- [ ] **Step 5: Renderers + audio**

3D/2D: drive a white flash from `slowMoTimer` on boss death; dial up surge takeover. `audio.ts`: confirm/extend layered cues for boss death, big detonate, surge; add any missing `SfxName` and emit at the right engine sites.

- [ ] **Step 6: Confirm balance unchanged + full suite green**

Run: `node_modules/.bin/vitest run lib/__tests__/ && node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts 30`
Expected: all tests PASS; sim numbers materially identical to Task 3 (slow-mo is no-op under headless).

- [ ] **Step 7: Manual verify** — boss death is a *moment* (slow-mo + flash + boom + shake); surge feels like a state takeover; audio lands on every beat. Both renderers.

- [ ] **Step 8: Commit**

```bash
git add lib/void-breaker/game.ts lib/void-breaker/audio.ts lib/void-breaker/renderer.ts lib/void-breaker/renderer3d.ts lib/__tests__/void-breaker-feel.test.ts
git commit -m "Void Breaker (feel): signature moments — boss-death slow-mo + flash, surge takeover, audio sync"
```

---

## Final phase verification

- [ ] Full test suite: `node_modules/.bin/vitest run lib/__tests__/` — all green.
- [ ] Balance sim: `node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts 50` — avg/median wave + win rate materially unchanged from the pre-Phase-1 baseline (prove feel layer is presentation-only).
- [ ] Manual playtest checkpoint with the user: 3D (default) + 2D renderers, with and without Reduced Effects, a full run to at least one boss. Confirm the game *feels* dramatically punchier with no gameplay drift.

## Spec self-review notes

- **Spec coverage:** all seven Phase-1 workstreams map to tasks — hitstop (T1–T2), trauma shake (T1–T2), spawn/death anim (T3–T4), weapon feel (T5), impact VFX (T6), UI juice (T7), signature moments + audio (T8). ✓
- **Headless-safety** (spec quality gate) is explicit in T1 and re-verified in T2/T3/T8. ✓
- **No-balance-change** gate is enforced by the sim run at the end of every engine-touching task. ✓
- **Reduced Effects** accessibility honored in every renderer task. ✓
- **Type consistency:** `anim`/`animTimer` (T3) consumed by T4/T8; `recoil` (T5) consumed by T5 renderers; `trauma`/`addTrauma`/`headless` (T1) consumed by T2/T8; `slowMoTimer` (T8) — names consistent across tasks. ✓
