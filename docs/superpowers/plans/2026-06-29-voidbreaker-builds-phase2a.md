# Void Breaker — Phase 2a (Builds & Weapons) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Void Breaker's single weapon + 15-card pool into 5 pick-at-start weapons × a synergistic upgrade pool with build-defining transformers — the roguelite replay engine.

**Architecture:** A new pure-data `weapons.ts` (mirroring `characters.ts`) defines weapons with a data-driven `fire` descriptor. The engine's `firePlayerProj` becomes a dispatcher over `fire.mode`; existing `PlayerStats` multipliers stack on every weapon. Transformer upgrades set new `PlayerStats` fields that `firePlayerProj` stamps onto new (default-inert) `Projectile` flags, with behaviors handled in the projectile/hit loops.

**Tech Stack:** TypeScript, Vitest (`node_modules/.bin/vitest`), tsx sim harness, React components, procedural WebAudio. Worktree at `/Users/kai/.superset/worktrees/5a044df8-4237-42e1-a19d-f4922526040c/voidbreaker-gameplay-over`; run binaries via `node_modules/.bin/*` (pnpm wrappers blocked). Branch: `feat/voidbreaker-builds-phase2a`.

## Global Constraints

- **No gameplay regression for the default weapon.** With weapon = Pulse Blaster and no transformer upgrades, combat must be byte-for-behavior identical to today. Prove via balance-sim parity.
- **No new enemies / bosses / biomes** (those are 2b / 2c). **Pick-at-start weapons only** — no mid-run swaps. **No charge-hold input.** **No sustained beam** (Arc Coil chains via discrete projectiles).
- **New fields default to inert** so all existing code paths are unaffected until an upgrade/weapon opts in.
- **Headless-safe:** the balance-sim sets `g.headless = true` (Phase 1 contract). New behaviors must not depend on render/audio.
- **Honor Reduced Effects** in any renderer/UI work (Phase 1 conventions: `reducedFx`, prefers-reduced-motion).
- **Run commands** from `node_modules/.bin/`: e.g. `node_modules/.bin/vitest run lib/__tests__/void-breaker-weapons.test.ts`. There is no DOM test env — engine/data tests only; renderer/UI verified by manual playtest.
- Existing **54** Void Breaker tests stay green. The 8 pre-existing i18n-catalog failures (feed/library/kowloon) are unrelated and out of scope.

## Existing infrastructure (read before starting)

- `lib/void-breaker/upgrades.ts`: `PlayerStats`, `makePlayerStats()`, `UpgradeId`, `UpgradeDef`, `UPGRADE_DEFS`, `rollUpgradeChoices(stacks, count, bossReward)`.
- `lib/void-breaker/characters.ts`: the pure-data pattern to mirror (`CharacterDef`, `CHARACTERS`, `getCharacter`, `isCharacterId`).
- `lib/void-breaker/game.ts`: `firePlayerProj()` (~654), the fire gate in `updatePlayer` (`p.fireTimer = p.fireRate * this.stats.fireRateMult;` ~623, `p.fireRate = PLAYER_FIRE_RATE` set in `startGame` ~226), `updateProjectiles` (~1431, where `fuse` bombs call `explodeBomb`), `checkPlayerHits` (~1497, where player bullets hit enemies; pierce handled ~1524), `killEnemy` (~1573), `explodeBomb(p)` (~1169, enemy AoE — mirror for player), `Projectile` pool init in the constructor (~176).
- `lib/void-breaker/types.ts`: `Projectile` interface (~91) — has `pierce`, `lastHitId`, `fuse`, `blastRadius`.
- `lib/void-breaker/constants.ts`: `PLAYER_FIRE_RATE = 0.20`, `PROJ_SPEED = 550`, `PROJ_RADIUS = 4`, `PROJ_DAMAGE = 1`.
- `lib/void-breaker/metaProgression.ts`: persisted `unlocked` set + helpers for character unlocks (the pattern weapon unlocks reuse).
- `lib/__tests__/void-breaker-engine.test.ts`: shared test helpers `makeInput`, `advanceToPlaying`, `isolate`, `placeEnemy`, `placePlayerProj` (copy/import these patterns).
- `scripts/void-breaker-balance-sim.ts`: builds `new VoidBreakerEngine()`, sets `g.headless = true`, loops `g.update(1/60, input)`; bot logic + `UPGRADE_PRIORITY`.

---

# MILESTONE 1 — Weapon system foundation

### Task 1: `weapons.ts` data module + tests

**Files:**
- Create: `lib/void-breaker/weapons.ts`
- Create: `lib/__tests__/void-breaker-weapons.test.ts`

**Interfaces:**
- Produces:
  - `type WeaponId = 'pulse' | 'scatter' | 'railgun' | 'grenade' | 'arc'`
  - `type FireMode = 'single' | 'spread' | 'railgun' | 'lob' | 'arc'`
  - `interface WeaponFire { mode: FireMode; pellets?: number; spread?: number; pierce?: number; fuse?: number; blastRadius?: number; chains?: number }`
  - `interface WeaponDef { id: WeaponId; name: string; title: string; description: string; icon: string; color: string; unlockCost: number; baseFireInterval: number; baseDamage: number; baseProjSpeed: number; baseProjRadius: number; baseProjLife: number; fire: WeaponFire }`
  - `const WEAPONS: WeaponDef[]`, `getWeapon(id: WeaponId): WeaponDef` (falls back to `WEAPONS[0]`), `isWeaponId(v: unknown): v is WeaponId`.
  - The default weapon is `pulse` with `unlockCost: 0` and base stats equal to today's constants (`baseFireInterval: 0.20`, `baseDamage: 1`, `baseProjSpeed: 550`, `baseProjRadius: 4`, `baseProjLife: 2.5`, `fire: { mode: 'single', pellets: 1, spread: 0.12 }`).

- [ ] **Step 1: Write the failing test** — `lib/__tests__/void-breaker-weapons.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeapon, isWeaponId } from '@/lib/void-breaker/weapons';

describe('weapons data', () => {
  it('has 5 weapons with unique ids', () => {
    expect(WEAPONS).toHaveLength(5);
    expect(new Set(WEAPONS.map(w => w.id)).size).toBe(5);
  });
  it('pulse is the free default and matches current blaster stats', () => {
    const p = getWeapon('pulse');
    expect(p.unlockCost).toBe(0);
    expect(p.baseFireInterval).toBeCloseTo(0.20, 5);
    expect(p.baseDamage).toBe(1);
    expect(p.baseProjSpeed).toBe(550);
    expect(p.fire.mode).toBe('single');
  });
  it('every non-default weapon has a positive unlock cost and sane base stats', () => {
    for (const w of WEAPONS.filter(w => w.id !== 'pulse')) {
      expect(w.unlockCost).toBeGreaterThan(0);
      expect(w.baseFireInterval).toBeGreaterThan(0);
      expect(w.baseDamage).toBeGreaterThan(0);
      expect(w.baseProjSpeed).toBeGreaterThan(0);
    }
  });
  it('getWeapon falls back to pulse for an unknown id, isWeaponId validates', () => {
    // @ts-expect-error intentionally invalid
    expect(getWeapon('nope').id).toBe('pulse');
    expect(isWeaponId('railgun')).toBe(true);
    expect(isWeaponId('nope')).toBe(false);
    expect(isWeaponId(42)).toBe(false);
  });
  it('each fire mode is represented exactly once across the roster', () => {
    const modes = WEAPONS.map(w => w.fire.mode).sort();
    expect(modes).toEqual(['arc', 'lob', 'railgun', 'single', 'spread']);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-weapons.test.ts`
Expected: FAIL — module `weapons.ts` does not exist.

- [ ] **Step 3: Implement `lib/void-breaker/weapons.ts`**

```typescript
// ── Void Breaker — weapons (pick one at run start) ───────────────────────────
// Pure data + helpers, mirroring characters.ts. Each weapon has base combat
// stats plus a data-driven `fire` descriptor the engine's firePlayerProj reads.
// No engine import (keeps it unit-testable and avoids a circular dependency).

export type WeaponId = 'pulse' | 'scatter' | 'railgun' | 'grenade' | 'arc';
export type FireMode = 'single' | 'spread' | 'railgun' | 'lob' | 'arc';

export interface WeaponFire {
  mode: FireMode;
  /** Base pellets per shot (extra multishot from PlayerStats stacks on top). */
  pellets?: number;
  /** Angular gap between pellets, radians. */
  spread?: number;
  /** Base pierce baked into the weapon (PlayerStats.pierce adds on top). */
  pierce?: number;
  /** Lob fuse seconds (mode 'lob'). */
  fuse?: number;
  /** Lob blast radius (mode 'lob'). */
  blastRadius?: number;
  /** Base chain hops (mode 'arc'); Chain Lightning upgrade adds more. */
  chains?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  title: string;        // atmospheric subtitle
  description: string;
  icon: string;
  color: string;
  unlockCost: number;   // Void Cores (0 = free)
  baseFireInterval: number; // seconds between shots
  baseDamage: number;       // per projectile, before PlayerStats.damageBonus
  baseProjSpeed: number;
  baseProjRadius: number;
  baseProjLife: number;
  fire: WeaponFire;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'pulse', name: 'Pulse Blaster', title: '脉冲', icon: '⟫', color: '#00f5ff',
    description: 'Balanced rapid-fire single shot. Reliable, no surprises.',
    unlockCost: 0,
    baseFireInterval: 0.20, baseDamage: 1, baseProjSpeed: 550, baseProjRadius: 4, baseProjLife: 2.5,
    fire: { mode: 'single', pellets: 1, spread: 0.12 },
  },
  {
    id: 'scatter', name: 'Scattergun', title: '散射', icon: '⁂', color: '#ff8844',
    description: 'A short-range cone of pellets. Devastating up close, slow to cycle.',
    unlockCost: 60,
    baseFireInterval: 0.55, baseDamage: 1, baseProjSpeed: 600, baseProjRadius: 4, baseProjLife: 0.45,
    fire: { mode: 'spread', pellets: 5, spread: 0.16 },
  },
  {
    id: 'railgun', name: 'Railgun', title: '轨道炮', icon: '➳', color: '#88ddff',
    description: 'Slow, heavy slug that punches through everything in its path.',
    unlockCost: 90,
    baseFireInterval: 0.85, baseDamage: 4, baseProjSpeed: 1100, baseProjRadius: 6, baseProjLife: 1.2,
    fire: { mode: 'railgun', pellets: 1, spread: 0, pierce: 999 },
  },
  {
    id: 'grenade', name: 'Grenade Launcher', title: '榴弹', icon: '✸', color: '#ffaa00',
    description: 'Lobs fused charges that blast on a timer. Area denial.',
    unlockCost: 90,
    baseFireInterval: 0.9, baseDamage: 3, baseProjSpeed: 360, baseProjRadius: 6, baseProjLife: 5,
    fire: { mode: 'lob', pellets: 1, spread: 0, fuse: 1.1, blastRadius: 95 },
  },
  {
    id: 'arc', name: 'Arc Coil', title: '电弧', icon: '⚡', color: '#cc66ff',
    description: 'Bolts that leap to nearby enemies. Born for crowds.',
    unlockCost: 120,
    baseFireInterval: 0.35, baseDamage: 1, baseProjSpeed: 700, baseProjRadius: 4, baseProjLife: 1.6,
    fire: { mode: 'arc', pellets: 1, spread: 0, chains: 2 },
  },
];

const BY_ID = new Map(WEAPONS.map(w => [w.id, w]));
export function getWeapon(id: WeaponId): WeaponDef { return BY_ID.get(id) ?? WEAPONS[0]; }
export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && BY_ID.has(v as WeaponId);
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-weapons.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/void-breaker/weapons.ts lib/__tests__/void-breaker-weapons.test.ts
git commit -m "Void Breaker (builds): weapons.ts data module — 5 weapons"
```

---

### Task 2: `firePlayerProj` dispatcher + Projectile transformer fields + Arc chain + player bomb

**Files:**
- Modify: `lib/void-breaker/types.ts` (`Projectile` ~91)
- Modify: `lib/void-breaker/game.ts` (constructor pool init ~176, `startGame` ~211, `firePlayerProj` ~654, `updateProjectiles` ~1431, add `explodePlayerBomb`, add `chainBolt`)
- Test: `lib/__tests__/void-breaker-weapons.test.ts` (extend)

**Interfaces:**
- Consumes: `WeaponDef`/`getWeapon` from Task 1.
- Produces:
  - `Projectile` gains (all default inert): `bounces: number`, `chains: number`, `explodeOnHit: boolean`, `explodeRadius: number`, `homing: number`.
  - `VoidBreakerEngine.weapon: WeaponDef` (public, default `getWeapon('pulse')`, settable before `startGame`, reset in `startGame`).
  - `firePlayerProj` spawns per the weapon's `fire.mode`; Pulse Blaster behavior is identical to today.
  - `private explodePlayerBomb(p: Projectile): void` — AoE damage to enemies (mirror of `explodeBomb`).
  - `private chainBolt(fromX: number, fromY: number, hitId: number, damage: number, hops: number): void` — spawn a short bolt to the nearest other live enemy and damage it, decrementing hops.

- [ ] **Step 1: Write the failing tests** — append to `void-breaker-weapons.test.ts`:

```typescript
import { VoidBreakerEngine } from '@/lib/void-breaker/game';
import { getWeapon } from '@/lib/void-breaker/weapons';
import type { InputState } from '@/lib/void-breaker/types';

function mk(over: Partial<InputState> = {}): InputState {
  return { up:false,down:false,left:false,right:false,mouseX:1200,mouseY:500,
    detonate:false,dash:false,focus:false,pause:false,voidPulse:false,phaseShift:false,
    reflectShield:false,allySynergy:false, ...over };
}
function toPlaying(g: VoidBreakerEngine) { for (let i=0;i<200 && g.state!=='playing';i++) g.update(0.05, mk()); }
function fireOnce(g: VoidBreakerEngine) {
  g.enemies.forEach(e => e.active = false);
  g.projectiles.forEach(p => p.active = false);
  g.waveEnemiesAlive = 99; g.player.fireTimer = 0; g.player.x = 800; g.player.y = 500;
  g.update(0.016, mk());
}

describe('firePlayerProj dispatcher', () => {
  it('pulse fires a single player projectile', () => {
    const g = new VoidBreakerEngine(); g.startGame(); toPlaying(g);
    fireOnce(g);
    expect(g.projectiles.filter(p => p.active && p.isPlayer).length).toBe(1);
  });
  it('scatter fires multiple pellets', () => {
    const g = new VoidBreakerEngine(); g.weapon = getWeapon('scatter'); g.startGame(); toPlaying(g);
    fireOnce(g);
    expect(g.projectiles.filter(p => p.active && p.isPlayer).length).toBeGreaterThanOrEqual(5);
  });
  it('railgun rounds pierce everything', () => {
    const g = new VoidBreakerEngine(); g.weapon = getWeapon('railgun'); g.startGame(); toPlaying(g);
    fireOnce(g);
    const round = g.projectiles.find(p => p.active && p.isPlayer)!;
    expect(round.pierce).toBeGreaterThan(50);
  });
  it('grenade lobs a fused player bomb', () => {
    const g = new VoidBreakerEngine(); g.weapon = getWeapon('grenade'); g.startGame(); toPlaying(g);
    fireOnce(g);
    const bomb = g.projectiles.find(p => p.active && p.isPlayer && p.fuse > 0);
    expect(bomb).toBeTruthy();
    expect(bomb!.blastRadius).toBeGreaterThan(0);
  });
  it('arc bolts carry chain hops', () => {
    const g = new VoidBreakerEngine(); g.weapon = getWeapon('arc'); g.startGame(); toPlaying(g);
    fireOnce(g);
    const bolt = g.projectiles.find(p => p.active && p.isPlayer)!;
    expect(bolt.chains).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-weapons.test.ts`
Expected: FAIL — `g.weapon` / new fields / dispatcher not present.

- [ ] **Step 3: Add Projectile fields** in `types.ts`:

```typescript
  /** Explosion radius for a bomb (only read when fuse > 0). */
  blastRadius: number;
  /** Transformer: ricochet hops remaining (0 = none). */
  bounces: number;
  /** Transformer: chain-lightning hops remaining (0 = none). */
  chains: number;
  /** Transformer: explode on first hit. */
  explodeOnHit: boolean;
  /** Explosion radius when explodeOnHit. */
  explodeRadius: number;
  /** Transformer: homing turn rate (rad/s, 0 = none). */
  homing: number;
```

- [ ] **Step 4: Init the new fields** in the constructor pool (`game.ts` ~176, the `this.projectiles = Array.from(...)` literal): add `bounces: 0, chains: 0, explodeOnHit: false, explodeRadius: 0, homing: 0,` to the projectile object literal.

- [ ] **Step 5: Add the `weapon` field + reset.** Near `character` (~128): `weapon: WeaponDef = getWeapon('pulse');` and import `{ WeaponDef, getWeapon }` from `./weapons`. In `startGame`, set `this.player.fireRate = this.weapon.baseFireInterval;` (replace the `PLAYER_FIRE_RATE` literal use for `fireRate`), and there is no per-run reset needed for `weapon` itself (it persists as the selection) — but ensure `startGame` reads it.

- [ ] **Step 6: Rewrite `firePlayerProj`** (`game.ts` ~654):

```typescript
  private firePlayerProj(): void {
    const p = this.player;
    const s = this.stats;
    const w = this.weapon;
    const f = w.fire;
    const count = Math.max(1, (f.pellets ?? 1) + (s.projectileCount - 1));
    const speed = w.baseProjSpeed * s.projSpeedMult;
    const damage = w.baseDamage + s.damageBonus;
    const spreadStep = f.spread ?? 0.12;
    const baseAngle = p.aimAngle - (count - 1) * spreadStep * 0.5;
    for (let i = 0; i < count; i++) {
      const slot = this.projectiles.find(pr => !pr.active);
      if (!slot) break;
      const a = baseAngle + i * spreadStep;
      const cos = Math.cos(a), sin = Math.sin(a);
      slot.active = true;
      slot.x = p.x + cos * (p.radius + 4);
      slot.y = p.y + sin * (p.radius + 4);
      slot.vx = cos * speed;
      slot.vy = sin * speed;
      slot.radius = w.baseProjRadius;
      slot.damage = damage;
      slot.isPlayer = true;
      slot.life = w.baseProjLife;
      slot.pierce = (f.pierce ?? 0) + s.pierce;
      slot.lastHitId = -1;
      // Lob (grenade): fused AoE round.
      slot.fuse = f.mode === 'lob' ? (f.fuse ?? 1.1) : 0;
      slot.blastRadius = f.mode === 'lob' ? (f.blastRadius ?? 90) : 0;
      // Transformer flags (weapon base + PlayerStats stack; M2 sets the stats).
      slot.bounces = s.bounceCount;
      slot.chains = (f.chains ?? 0) + s.chainCount;
      slot.explodeOnHit = s.explodeOnHit;
      slot.explodeRadius = s.explodeRadius;
      slot.homing = s.homingTurn;
    }
    this.player.recoil = 1;
  }
```

NOTE: `s.bounceCount`, `s.chainCount`, `s.explodeOnHit`, `s.explodeRadius`, `s.homingTurn` are added to `PlayerStats` in Task 4 (M2). To keep Task 2 self-contained and compiling, add these fields to `PlayerStats` + `makePlayerStats()` NOW with inert defaults (Task 4 only adds the *upgrades* that set them):

In `upgrades.ts` `PlayerStats` add: `bounceCount: number; chainCount: number; explodeOnHit: boolean; explodeRadius: number; homingTurn: number; orbitalCount: number; overchargeEvery: number;` and in `makePlayerStats()` add `bounceCount: 0, chainCount: 0, explodeOnHit: false, explodeRadius: 0, homingTurn: 0, orbitalCount: 0, overchargeEvery: 0,`.

- [ ] **Step 7: Add `explodePlayerBomb` and bomb routing.** In `updateProjectiles` (~1431), find where a `fuse > 0` projectile detonates and currently calls `this.explodeBomb(p)`. Route player bombs to a new method: `if (p.fuse > 0) { p.fuse -= dt; if (p.fuse <= 0) { p.isPlayer ? this.explodePlayerBomb(p) : this.explodeBomb(p); p.active = false; continue; } }` (match the existing fuse decrement; only add the `isPlayer` branch). Then add:

```typescript
  /** Detonate a player-lobbed bomb: AoE damage to enemies + spectacle. */
  private explodePlayerBomb(p: Projectile): void {
    this.spawnShockwave(p.x, p.y, p.blastRadius, '#ffaa44', 5);
    this.spawnParticles(p.x, p.y, '#ffaa44', 14, 180);
    this.emitSfx('detonate', { gain: 0.5 });
    this.addTrauma(0.35);
    for (const e of this.enemies) {
      if (!e.active || e.anim !== 'alive') continue;
      if (e.isBoss && e.bossSpecialActive) continue;
      if (dist(e.x, e.y, p.x, p.y) < p.blastRadius + e.radius) {
        e.hp -= p.damage;
        e.hitFlashUntil = this.elapsedMs + 80;
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
  }
```

- [ ] **Step 8: Add `chainBolt` and call it on Arc hits.** In `checkPlayerHits` (~1522), right after `if (e.hp <= 0) this.killEnemy(e);` and before the pierce handling, add:

```typescript
          if (p.chains > 0) { this.chainBolt(e.x, e.y, e.id, p.damage, p.chains); p.chains = 0; }
```

(Set to 0 so a single bullet chains once per hit, not infinitely.) Then add the method:

```typescript
  /** Chain lightning: hop to the nearest other live enemy, damaging it; recurse. */
  private chainBolt(fromX: number, fromY: number, hitId: number, damage: number, hops: number): void {
    let best: Enemy | null = null;
    let bestD = 260; // max chain range
    for (const e of this.enemies) {
      if (!e.active || e.anim !== 'alive' || e.id === hitId) continue;
      if (e.isBoss && e.bossSpecialActive) continue;
      const d = dist(e.x, e.y, fromX, fromY);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return;
    best.hp -= damage;
    best.hitFlashUntil = this.elapsedMs + 80;
    this.spawnParticles(best.x, best.y, '#cc88ff', 4, 90);
    this.emitSfx('hit', { pitch: 1.3 });
    if (best.hp <= 0) this.killEnemy(best);
    else if (hops > 1) this.chainBolt(best.x, best.y, best.id, damage, hops - 1);
  }
```

- [ ] **Step 9: Run the weapon tests + full engine suite**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-weapons.test.ts lib/__tests__/void-breaker-engine.test.ts lib/__tests__/void-breaker-feel.test.ts`
Expected: PASS. If `placePlayerProj`/`placeEnemy` helpers fail to compile because the `Projectile`/`PlayerStats` literals they build lack the new fields, update those helpers to include the inert defaults (test-harness upkeep, not behavior).

- [ ] **Step 10: Prove Pulse Blaster parity in the sim**

Run: `node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts 30`
Expected: median wave ≈ the Phase-1 baseline (median 10). The default weapon path is unchanged. Record the number.

- [ ] **Step 11: Commit**

```bash
git add lib/void-breaker/game.ts lib/void-breaker/types.ts lib/void-breaker/upgrades.ts lib/__tests__/
git commit -m "Void Breaker (builds): data-driven firePlayerProj dispatcher + 5-weapon fire modes"
```

---

### Task 3: Weapon selection plumbing + Void-Core unlock + picker wiring

**Files:**
- Modify: `lib/void-breaker/metaProgression.ts` (generalize/extend the `unlocked` set + helpers to cover weapons), `lib/void-breaker/saveSystem.ts` (persist selected weapon id), `components/void-breaker/VoidBreakerGame.tsx` (set `engine.weapon` before `startGame`; pass weapon state/handlers to UI)
- Test: `lib/__tests__/void-breaker-meta.test.ts` (extend for weapon unlock helpers)

**Interfaces:**
- Consumes: `WEAPONS`/`getWeapon`/`isWeaponId`, the meta `unlocked` pattern.
- Produces: persisted `selectedWeapon: WeaponId` + weapon-unlock helpers mirroring characters (`isWeaponUnlocked(state, id)`, `unlockWeapon(state, id, cost)` or a generalized unlock keyed by a namespaced id). The component sets `engine.weapon = getWeapon(selectedWeapon)` before each `startGame`.

- [ ] **Step 1: Write the failing test** — extend `void-breaker-meta.test.ts` with weapon-unlock coverage mirroring the existing character-unlock tests (default `pulse` always unlocked; a locked weapon becomes unlocked after spending cores; cores can't go negative). Use the same assertions style as the character-unlock tests already in that file.

- [ ] **Step 2: Run, verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-meta.test.ts`
Expected: FAIL — weapon-unlock helpers don't exist.

- [ ] **Step 3: Implement** the weapon-unlock helpers in `metaProgression.ts` (mirror the character logic; if the existing `unlocked` set is keyed by raw ids, namespace weapon ids as e.g. `weapon:railgun` to avoid collisions, or add a parallel `unlockedWeapons` set — match whatever is cleanest given the current shape). Persist `selectedWeapon` in `saveSystem.ts` alongside the selected character (default `'pulse'`, validate with `isWeaponId`).

- [ ] **Step 4: Wire the engine** in `VoidBreakerGame.tsx`: read the persisted/selected weapon and set `engine.weapon = getWeapon(selectedWeaponId)` immediately before `engine.startGame()` (next to where `engine.character` is set today). Keep a React state for the selected weapon + an unlock handler, mirroring the character picker wiring (the UI itself is Task 6).

- [ ] **Step 5: Run tests + typecheck**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-meta.test.ts && node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -i void-breaker; echo "(no void-breaker errors = clean)"`
Expected: meta tests PASS; no void-breaker typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add lib/void-breaker/metaProgression.ts lib/void-breaker/saveSystem.ts components/void-breaker/VoidBreakerGame.tsx lib/__tests__/void-breaker-meta.test.ts
git commit -m "Void Breaker (builds): weapon selection + Void-Core unlock plumbing"
```

---

# MILESTONE 2 — Transformer upgrades

### Task 4: Transformer behaviors (bounce, explosive-on-hit, homing) + stamping

**Files:**
- Modify: `lib/void-breaker/game.ts` (`checkPlayerHits` ~1497, `updateProjectiles` ~1431)
- Test: `lib/__tests__/void-breaker-weapons.test.ts` (extend)

**Interfaces:**
- Consumes: the inert `Projectile` fields + `PlayerStats` fields added in Task 2, `explodePlayerBomb`, `chainBolt`.
- Produces: behaviors when a player bullet hits an enemy in `checkPlayerHits`:
  - **explodeOnHit** → call `explodePlayerBomb`-style AoE at the hit point (factor a shared `private aoeDamage(x, y, radius, damage, exclId)` used by both `explodePlayerBomb` and explosive rounds to stay DRY).
  - **bounces** → retarget the projectile toward the nearest other live enemy (redirect `vx/vy`, reset `lastHitId`), decrement `bounces`, instead of deactivating.
  - **homing** (in `updateProjectiles`) → each frame, rotate a player bullet's velocity toward the nearest live enemy by up to `homing * dt`.

- [ ] **Step 1: Write failing tests** — append to `void-breaker-weapons.test.ts`. Use the engine helpers (`isolate`/`placeEnemy`/`placePlayerProj` patterns) to assert: (a) a bullet with `explodeOnHit=true` + `explodeRadius` damages a second nearby enemy on hit; (b) a bullet with `bounces=1` stays active and redirects after a kill (its `vx/vy` change toward a second enemy); (c) a bullet with `homing>0` curves — after several frames its velocity angle moves toward an off-axis enemy. Provide concrete arrays-and-assertions like the existing engine tests (place two enemies, fire one bullet, step, assert second enemy hp drops / bullet still active / angle delta).

```typescript
import { factory helpers as in engine test } // copy makeInput/isolate/placeEnemy/placePlayerProj
// (a) explosive
it('explosive rounds damage a nearby second enemy', () => {
  const g = new VoidBreakerEngine(); g.startGame(); toPlaying(g);
  g.enemies.forEach(e=>e.active=false); g.projectiles.forEach(p=>p.active=false);
  g.obstacles=[]; g.waveEnemiesAlive=99;
  const a = g.enemies.find(e=>!e.active)!; Object.assign(a,{active:true,isBoss:false,isElite:false,type:'drifter',x:1200,y:500,radius:10,hp:1,maxHp:1,shardCount:0,value:10,color:'#fff',anim:'alive',animTimer:0,speed:0,vx:0,vy:0,dashState:'idle',bossSpecialActive:false});
  const b = g.enemies.find(e=>!e.active)!; Object.assign(b,{active:true,isBoss:false,isElite:false,type:'drifter',x:1230,y:500,radius:10,hp:5,maxHp:5,shardCount:0,value:10,color:'#fff',anim:'alive',animTimer:0,speed:0,vx:0,vy:0,dashState:'idle',bossSpecialActive:false});
  const proj = g.projectiles.find(p=>!p.active)!; Object.assign(proj,{active:true,isPlayer:true,x:1200,y:500,vx:0,vy:0,radius:4,damage:1,life:2,pierce:0,lastHitId:-1,fuse:0,blastRadius:0,bounces:0,chains:0,explodeOnHit:true,explodeRadius:60,homing:0});
  g.update(0.05, mk());
  expect(b.hp).toBeLessThan(5);
});
```

(Write analogous tests for bounce + homing.)

- [ ] **Step 2: Run, verify fail**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-weapons.test.ts`
Expected: FAIL — behaviors not implemented.

- [ ] **Step 3: Implement.** Add a shared `private aoeDamage(x: number, y: number, radius: number, damage: number, exclId: number): void` (loop live enemies, skip `exclId`, damage + maybe-kill) and refactor `explodePlayerBomb` to use it. In `checkPlayerHits`, after computing the hit and the existing kill/pierce logic, insert (before the pierce `if`):

```typescript
          if (p.explodeOnHit) {
            this.spawnShockwave(p.x, p.y, p.explodeRadius, '#ffaa44', 4);
            this.aoeDamage(p.x, p.y, p.explodeRadius, p.damage, e.id);
            this.addTrauma(0.15);
          }
          if (p.bounces > 0) {
            const next = this.nearestLiveEnemy(p.x, p.y, e.id);
            if (next) {
              const ang = Math.atan2(next.y - p.y, next.x - p.x);
              const spd = Math.hypot(p.vx, p.vy) || 400;
              p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd;
              p.lastHitId = -1; p.bounces--;
              // skip the deactivation below by continuing the projectile loop
            }
          }
```

Then adjust the existing pierce/deactivate tail so a projectile with a successful bounce is NOT deactivated (e.g. gate the `else p.active = false;` on `p.bounces` having been spent and no pierce). Add helper `private nearestLiveEnemy(x, y, exclId): Enemy | null` (the `chainBolt` search, extracted/shared). In `updateProjectiles`, for each active player projectile with `p.homing > 0`, steer:

```typescript
        if (p.isPlayer && p.homing > 0) {
          const t = this.nearestLiveEnemy(p.x, p.y, -1);
          if (t) {
            const desired = Math.atan2(t.y - p.y, t.x - p.x);
            const cur = Math.atan2(p.vy, p.vx);
            const spd = Math.hypot(p.vx, p.vy);
            const next = cur + Math.max(-p.homing * dt, Math.min(p.homing * dt, angleDiff(desired, cur)));
            p.vx = Math.cos(next) * spd; p.vy = Math.sin(next) * spd;
          }
        }
```

(`angleDiff` already exists and is imported/used in `game.ts`.)

- [ ] **Step 4: Run tests + full suite + sim parity**

Run: `node_modules/.bin/vitest run lib/__tests__/ 2>&1 | grep -E "Tests +[0-9]"` then `node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts 30 | grep runs`
Expected: all Void Breaker tests PASS (i18n failures unrelated); sim median ≈ baseline (transformer fields are inert with no upgrades taken).

- [ ] **Step 5: Commit**

```bash
git add lib/void-breaker/game.ts lib/__tests__/void-breaker-weapons.test.ts
git commit -m "Void Breaker (builds): transformer projectile behaviors — bounce, explosive, homing"
```

---

### Task 5: Orbitals + Overcharge + the new upgrade cards

**Files:**
- Modify: `lib/void-breaker/upgrades.ts` (`UpgradeId`, `UPGRADE_DEFS`), `lib/void-breaker/game.ts` (orbital state + update; overcharge counter in `firePlayerProj`/`checkPlayerHits`)
- Modify: `lib/void-breaker/types.ts` (an `Orbital` shape if needed)
- Test: `lib/__tests__/void-breaker-upgrades.test.ts` + `void-breaker-weapons.test.ts` (extend)

**Interfaces:**
- Consumes: `PlayerStats` transformer fields (`bounceCount`, `chainCount`, `explodeOnHit`, `explodeRadius`, `homingTurn`, `orbitalCount`, `overchargeEvery`).
- Produces:
  - ~13 new `UpgradeDef`s appended to `UPGRADE_DEFS` (new `UpgradeId` literals): the **transformers** — `ricochet` (`bounceCount += 1`), `chain_lightning` (`chainCount += 2`), `explosive_rounds` (`explodeOnHit = true; explodeRadius = max(explodeRadius, 70)`), `homing_rounds` (`homingTurn += 4`), `orbitals` (`orbitalCount += 1`), `overcharge` (`overchargeEvery = overchargeEvery === 0 ? 5 : Math.max(3, overchargeEvery - 1)`) — most `maxStacks: 1` (rare); plus **~7 stat fillers** rounding out crit/AoE/lifesteal/speed/fire-rate archetypes (each mutating an existing `PlayerStats` field, `common`/`rare`).
  - **Orbitals:** a small owned set of orbiting blades updated each frame (orbit the player, damage live enemies on contact). State on the engine (e.g. `orbitals: {angle:number}[]` sized to `stats.orbitalCount`), updated in `update` and damaging via `aoeDamage`/direct contact; rendered in Task 6.
  - **Overcharge:** a shot counter in `firePlayerProj`; every `overchargeEvery`-th shot flags the spawned projectile(s) as empowered (guaranteed crit + bonus damage). Simplest: track `private shotCount` and when `overchargeEvery>0 && shotCount % overchargeEvery === 0` multiply `damage` and force a crit-style popup.

- [ ] **Step 1: Write failing tests** — in `void-breaker-upgrades.test.ts` assert each new `UpgradeDef.apply` mutates the expected `PlayerStats` field from `makePlayerStats()` (e.g. `ricochet` sets `bounceCount` to 1; `explosive_rounds` sets `explodeOnHit` true & `explodeRadius>=70`; `overcharge` sets `overchargeEvery` to 5 then lowers it on the 2nd stack if `maxStacks>1`). In `void-breaker-weapons.test.ts` assert orbitals: with `g.stats.orbitalCount = 1` and an enemy adjacent to the player, stepping the engine damages it; and overcharge: with `overchargeEvery = 1`, a fired projectile is empowered (damage above base).

- [ ] **Step 2: Run, verify fail**

Run: `node_modules/.bin/vitest run lib/__tests__/void-breaker-upgrades.test.ts lib/__tests__/void-breaker-weapons.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the upgrade defs (full `UpgradeDef` objects with name/description/rarity/maxStacks/color/icon/apply — no placeholders, write each out), the orbital state + update loop + contact damage, and the overcharge counter. Keep magnitudes conservative (transformers are powerful; rely on Task 7 tuning).

- [ ] **Step 4: Run tests + full suite + per-weapon sanity**

Run: `node_modules/.bin/vitest run lib/__tests__/ 2>&1 | grep -E "Tests +[0-9]"`
Expected: all Void Breaker tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/void-breaker/upgrades.ts lib/void-breaker/game.ts lib/void-breaker/types.ts lib/__tests__/
git commit -m "Void Breaker (builds): transformer + synergy upgrades (orbitals, overcharge, ricochet, chain, explosive, homing + fillers)"
```

---

# MILESTONE 3 — UI & balance

### Task 6: Weapon picker UI + projectile/orbital rendering

**Files:**
- Modify: `components/void-breaker/VoidBreakerUI.tsx` (weapon picker on the menu, mirroring the character picker), `lib/void-breaker/renderer.ts` + `lib/void-breaker/renderer3d.ts` (render orbitals; light styling for grenade/arc/railgun projectiles via existing Phase-1 build-distinct logic)
- Verify: manual browser playtest (no unit test — visual)

- [ ] **Step 1: Weapon picker UI.** Add a weapon selector beside the character picker in `VoidBreakerUI.tsx`, mirroring that component: each weapon shows icon/name/title/description, lock state + Void-Core cost; clicking an affordable locked weapon unlocks + selects it (calls the Task-3 handler). Reduced-motion friendly; match existing menu styling/animation conventions.

- [ ] **Step 2: Render orbitals + projectile flair.** In both renderers, draw the orbiting blades from the engine's orbital state, and give grenade (lobbed arc), railgun (long heavy slug), and arc (jagged bolt) projectiles light distinct visuals (reuse Phase-1 build-distinct projectile styling; honor `reducedFx`). Reset any pooled visual state for reused projectiles.

- [ ] **Step 3: Manual verify.** Dev server, `/void-breaker`: each weapon is selectable (and unlockable), plays distinctly, and orbitals/transformers render in both 3D + 2D, with and without Reduced Effects.

- [ ] **Step 4: Commit**

```bash
git add components/void-breaker/VoidBreakerUI.tsx lib/void-breaker/renderer.ts lib/void-breaker/renderer3d.ts
git commit -m "Void Breaker (builds): weapon picker UI + orbital/projectile rendering"
```

---

### Task 7: Balance — per-weapon sim + cross-weapon tuning

**Files:**
- Modify: `scripts/void-breaker-balance-sim.ts` (accept a weapon arg), `lib/void-breaker/weapons.ts` + `lib/void-breaker/upgrades.ts` (tuning only)
- Verify: sim output + manual playtest

**Interfaces:**
- Consumes: all of M1/M2.
- Produces: `scripts/void-breaker-balance-sim.ts` accepts `--weapon=<id>` (or a positional weapon id) and sets `g.weapon = getWeapon(id)` before `startGame`; the bot's `UPGRADE_PRIORITY` is extended to value the new upgrades so builds actually form.

- [ ] **Step 1: Add the `--weapon` option** to the sim: parse the arg, default `pulse`, validate with `isWeaponId`, set `g.weapon` in `runSim`. Print the weapon in the summary line.

- [ ] **Step 2: Run each weapon** and record results:

```bash
for w in pulse scatter railgun grenade arc; do node_modules/.bin/tsx scripts/void-breaker-balance-sim.ts 40 --weapon=$w | grep runs; done
```

Expected: each weapon completes; capture median waves.

- [ ] **Step 3: Tune.** Acceptance band: no weapon's median wave is an outlier (rough target: every weapon within ~±40% of the Pulse baseline median; none ~0, none runaway). Adjust weapon base stats in `weapons.ts` and/or transformer magnitudes in `upgrades.ts` and re-run until all weapons sit in band. Document the final medians in a comment block at the top of the sim file or in the commit message.

- [ ] **Step 4: Full suite + final sim sweep**

Run: `node_modules/.bin/vitest run lib/__tests__/ 2>&1 | grep -E "Tests +[0-9]"` and the per-weapon loop from Step 2.
Expected: all Void Breaker tests PASS; all weapons in band.

- [ ] **Step 5: Manual playtest checkpoint** with the user (each weapon + a couple of transformer builds, 3D + 2D, Reduced Effects on/off).

- [ ] **Step 6: Commit**

```bash
git add scripts/void-breaker-balance-sim.ts lib/void-breaker/weapons.ts lib/void-breaker/upgrades.ts
git commit -m "Void Breaker (builds): per-weapon balance sim + cross-weapon tuning"
```

---

## Final phase verification

- [ ] Full test suite: `node_modules/.bin/vitest run lib/__tests__/` — all Void Breaker tests green (i18n pre-existing failures excepted).
- [ ] Per-weapon sim sweep — every weapon in the acceptance band; Pulse Blaster median ≈ pre-2a baseline (parity).
- [ ] Typecheck clean for void-breaker files: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -i void-breaker` (empty).
- [ ] Manual playtest: all 5 weapons selectable/unlockable and distinct; transformer builds feel build-defining; 3D + 2D; Reduced Effects sane.

## Self-review notes

- **Spec coverage:** weapons.ts (T1) ✓; data-driven firePlayerProj + 5 fire modes (T2) ✓; transformers — bounce/chain/explosive/homing/orbital/overcharge (T2 fields/chain, T4 bounce/explosive/homing, T5 orbital/overcharge) ✓; ~13 upgrades (T5) ✓; meta unlock + selection (T3) ✓; weapon picker UI (T6) ✓; per-weapon balance sim + tuning (T7) ✓; tests (T1–T5) + manual playtest (T6–T7) ✓.
- **Type consistency:** `PlayerStats` transformer fields (`bounceCount`, `chainCount`, `explodeOnHit`, `explodeRadius`, `homingTurn`, `orbitalCount`, `overchargeEvery`) added in T2, set by upgrades in T5, read by behaviors in T2/T4/T5 — names consistent. `Projectile` flags (`bounces`, `chains`, `explodeOnHit`, `explodeRadius`, `homing`) added T2, stamped in `firePlayerProj` (T2), consumed T4. `chainBolt`/`nearestLiveEnemy`/`aoeDamage`/`explodePlayerBomb` defined where first used. `weapon` field + `getWeapon`/`isWeaponId`/`WeaponDef` consistent across T1–T3, T7.
- **Parity guard** (default-weapon, no-upgrade behavior unchanged) is enforced by the sim run in T2/T4 and the final sweep.
- **Headless/Reduced-FX** constraints carried into every relevant task.
