import { BOARD, type EnemyType, type TowerType } from './data';
import { Enemy, Projectile, Tower, type Point } from './Entities';
import type { GridManager } from './GridManager';

/** What the combat step reports, for the host's effects and sound and for the simulation's bookkeeping. */
export type CombatEvent =
  | { t: 'fire'; tower: TowerType; from: Point; to: Point[]; tier: number }
  | { t: 'splash'; x: number; y: number; r: number }
  | { t: 'kill'; enemy: EnemyType; x: number; y: number; boss: boolean; bounty: number; wave: number }
  | { t: 'leak'; enemy: EnemyType; x: number; y: number; amount: number; wave: number }
  | { t: 'sever'; x: number; y: number; r: number }
  | { t: 'heal'; x: number; y: number; r: number }
  | { t: 'brood'; x: number; y: number }
  | { t: 'shed'; x: number; y: number };

export interface CombatContext {
  grid: GridManager;
  emit: (e: CombatEvent) => void;
  /** Bounty multiplier of the current wave. */
  bountyFor: (enemy: Enemy) => number;
  /** HP multiplier for specimens born mid-wave (fragments, brood), by their wave. */
  hpFor: (wave: number) => number;
  phase: () => number;
}

const CHAIN_HOP = 1.6 * BOARD.CELL;
const CANISTER_FLIGHT = 0.45;

/** Every entity on the board and the combat rules between them. Pure: driven by `Simulation.step`. */
export class EntityManager {
  public towers: Tower[] = [];
  public enemies: Enemy[] = [];
  public projectiles: Projectile[] = [];
  private buffsDirty = true;
  private lastHitBy = new Map<number, Tower>();

  public addTower(tower: Tower) {
    this.towers.push(tower);
    this.buffsDirty = true;
  }

  public removeTower(tower: Tower) {
    this.towers = this.towers.filter((t) => t !== tower);
    this.buffsDirty = true;
  }

  public markBuffsDirty() {
    this.buffsDirty = true;
  }

  public addEnemy(enemy: Enemy) {
    this.enemies.push(enemy);
  }

  public getTowerAt(cx: number, cy: number): Tower | undefined {
    return this.towers.find((t) => t.cx === cx && t.cy === cy);
  }

  public aliveInWave(wave: number): number {
    let n = 0;
    for (const e of this.enemies) if (e.active && e.wave === wave) n++;
    return n;
  }

  public update(dt: number, ctx: CombatContext) {
    if (this.buffsDirty) this.recomputeBuffs();
    this.applyFields();
    this.updateEnemies(dt, ctx);
    this.updateTowers(dt, ctx);
    this.updateProjectiles(dt, ctx);
    this.collectDead(ctx);
  }

  // ── Echo auras ────────────────────────────────────────────────────────────
  private recomputeBuffs() {
    this.buffsDirty = false;
    for (const t of this.towers) {
      t.buffDamage = 0;
      t.buffRate = 0;
    }
    for (const echo of this.towers) {
      if (echo.def.attack !== 'support') continue;
      const s = echo.stats;
      for (const t of this.towers) {
        if (t === echo || t.def.attack === 'support' || t.def.attack === 'income') continue;
        if (Math.hypot(t.x - echo.x, t.y - echo.y) <= echo.rangePx) {
          // Echoes do not stack: the strongest one in reach applies.
          t.buffDamage = Math.max(t.buffDamage, s.buffDamage ?? 0);
          t.buffRate = Math.max(t.buffRate, s.buffRate ?? 0);
        }
      }
    }
  }

  // ── Fields: Suppressor slow and vulnerability, reveals ──────────────────────
  private applyFields() {
    for (const e of this.enemies) {
      e.revealed = false;
      e.vulnerable = 0;
      e.slow = e.slowTimer > 0 ? e.slow : 0;
    }
    for (const t of this.towers) {
      const s = t.stats;
      const isField = t.def.attack === 'aura';
      if (!isField && !s.reveal) continue;
      const r = t.rangePx;
      for (const e of this.enemies) {
        if (!e.active) continue;
        if (Math.hypot(e.x - t.x, e.y - t.y) > r) continue;
        if (s.reveal) e.revealed = true;
        if (isField && t.stunTimer <= 0) {
          e.slow = Math.max(e.slow, s.slow ?? 0);
          e.vulnerable = Math.max(e.vulnerable, s.vulnerable ?? 0);
        }
      }
    }
  }

  private targetable(e: Enemy): boolean {
    return e.active && e.dist > BOARD.CELL * 0.5 && (!e.cloaked || e.revealed);
  }

  // ── Specimens ──────────────────────────────────────────────────────────────
  private updateEnemies(dt: number, ctx: CombatContext) {
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.hitAge += dt;
      e.burstClock += dt;
      if (e.slowTimer > 0) e.slowTimer -= dt;
      if (e.stunTimer > 0) e.stunTimer -= dt;

      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        this.damage(null, e, e.burnDps * dt, { pierce: true }, ctx);
        if (!e.active) continue;
      } else if (e.def.regen) {
        e.health = Math.min(e.maxHealth, e.health + e.maxHealth * e.def.regen * dt);
      }

      e.healedAge += dt;
      const heal = e.def.heal;
      if (heal) {
        e.healTimer += dt;
        if (e.healTimer >= heal.every) {
          e.healTimer = 0;
          const r = heal.radius * BOARD.CELL;
          for (const o of this.enemies) {
            // Heals do not stack: a specimen takes at most one dose per interval, whoever gives it.
            if (o.active && o !== e && o.healedAge >= heal.every && Math.hypot(o.x - e.x, o.y - e.y) <= r) {
              o.health = Math.min(o.maxHealth, o.health + o.maxHealth * heal.pct);
              o.healedAge = 0;
            }
          }
          ctx.emit({ t: 'heal', x: e.x, y: e.y, r });
        }
      }

      const sever = e.def.sever;
      if (sever) {
        e.severTimer += dt;
        if (e.severTimer >= sever.every) {
          e.severTimer = 0;
          const r = sever.radius * BOARD.CELL;
          for (const t of this.towers) {
            if (Math.hypot(t.x - e.x, t.y - e.y) <= r) t.stunTimer = sever.time;
          }
          ctx.emit({ t: 'sever', x: e.x, y: e.y, r });
        }
      }

      const lane = ctx.grid.lanes[e.lane]!;
      e.dist += e.speedPx() * dt;
      const p = ctx.grid.positionAt(lane, e.dist);
      e.x = p.x;
      e.y = p.y;
      if (e.dist >= lane.length) {
        e.active = false;
        e.health = Math.max(e.health, 1); // a leak is not a kill
        ctx.emit({ t: 'leak', enemy: e.type, x: e.x, y: e.y, amount: e.def.leak, wave: e.wave });
      }
    }
  }

  // ── Instruments ────────────────────────────────────────────────────────────
  private pick(t: Tower, n: number, exclude?: Set<Enemy>): Enemy[] {
    const r = t.rangePx;
    const inRange: Enemy[] = [];
    for (const e of this.enemies) {
      if (!this.targetable(e) || exclude?.has(e)) continue;
      if (Math.hypot(e.x - t.x, e.y - t.y) <= r) inRange.push(e);
    }
    if (inRange.length <= 1) return inRange;
    const mode = t.targetMode;
    inRange.sort((a, b) => {
      if (mode === 'strong') return b.health + b.shield - (a.health + a.shield) || b.dist - a.dist;
      if (mode === 'last') return a.dist - b.dist;
      return b.dist - a.dist;
    });
    return inRange.slice(0, n);
  }

  private updateTowers(dt: number, ctx: CombatContext) {
    for (const t of this.towers) {
      t.firedAge += dt;
      if (t.stunTimer > 0) {
        t.stunTimer -= dt;
        t.beamTarget = null;
        continue;
      }
      const s = t.stats;
      const dmgMul = 1 + t.buffDamage;
      switch (t.def.attack) {
        case 'aura': {
          const r = t.rangePx;
          for (const e of this.enemies) {
            if (e.active && Math.hypot(e.x - t.x, e.y - t.y) <= r) {
              this.damage(t, e, s.damage * dmgMul * dt, { pierce: true }, ctx);
            }
          }
          break;
        }
        case 'beam': {
          let target = t.beamTarget !== null ? this.enemies.find((e) => e.id === t.beamTarget) : undefined;
          if (!target || !this.targetable(target) || Math.hypot(target.x - t.x, target.y - t.y) > t.rangePx) {
            target = this.pick(t, 1)[0];
          }
          t.beamTarget = target ? target.id : null;
          if (target) {
            t.aim = Math.atan2(target.y - t.y, target.x - t.x);
            this.damage(t, target, s.damage * dmgMul * dt, { pierce: true }, ctx);
            target.burnDps = Math.max(target.burnTimer > 0 ? target.burnDps : 0, (s.burnDps ?? 0) * dmgMul);
            target.burnTimer = s.burnTime ?? 0;
          }
          break;
        }
        case 'pulse':
        case 'precision':
        case 'chain':
        case 'splash': {
          t.cooldown -= dt * (1 + t.buffRate);
          if (t.cooldown > 0) break;
          const fired = this.fire(t, dmgMul, ctx);
          if (fired) {
            t.cooldown = s.interval;
            t.firedAge = 0;
          } else {
            t.cooldown = 0;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private fire(t: Tower, dmgMul: number, ctx: CombatContext): boolean {
    const s = t.stats;
    if (t.def.attack === 'pulse' || t.def.attack === 'precision') {
      const targets = this.pick(t, s.targets ?? 1);
      if (!targets.length) return false;
      for (const e of targets) {
        this.damage(t, e, s.damage * dmgMul, { pierce: t.def.pierce }, ctx);
        if (s.execute && e.active && !e.def.boss && e.health / e.maxHealth < s.execute) {
          this.damage(t, e, e.health + e.shield, { pierce: true }, ctx);
        }
      }
      t.aim = Math.atan2(targets[0]!.y - t.y, targets[0]!.x - t.x);
      ctx.emit({ t: 'fire', tower: t.type, from: { x: t.x, y: t.y }, to: targets.map((e) => ({ x: e.x, y: e.y })), tier: t.tier });
      return true;
    }
    if (t.def.attack === 'chain') {
      const first = this.pick(t, 1)[0];
      if (!first) return false;
      const hit = new Set<Enemy>([first]);
      const path: Point[] = [{ x: first.x, y: first.y }];
      let cur = first;
      for (let i = 0; i < (s.chains ?? 0); i++) {
        let best: Enemy | null = null;
        let bestD = CHAIN_HOP;
        for (const e of this.enemies) {
          if (!this.targetable(e) || hit.has(e)) continue;
          const d = Math.hypot(e.x - cur.x, e.y - cur.y);
          if (d <= bestD) {
            bestD = d;
            best = e;
          }
        }
        if (!best) break;
        hit.add(best);
        path.push({ x: best.x, y: best.y });
        cur = best;
      }
      for (const e of hit) {
        this.damage(t, e, s.damage * dmgMul, { electric: true }, ctx);
        if (s.stun && e.active && !e.def.boss) e.stunTimer = Math.max(e.stunTimer, s.stun);
      }
      t.aim = Math.atan2(first.y - t.y, first.x - t.x);
      ctx.emit({ t: 'fire', tower: t.type, from: { x: t.x, y: t.y }, to: path, tier: t.tier });
      return true;
    }
    if (t.def.attack === 'splash') {
      // Splash also lands on cloaked specimens it cannot aim at: it aims at what it can see.
      const target = this.pick(t, 1)[0];
      if (!target) return false;
      // Lead the target by the canister's flight time along its lane.
      const lane = this.laneOf(target, ctx);
      const lead = ctx.grid.positionAt(lane, target.dist + target.speedPx() * CANISTER_FLIGHT);
      this.projectiles.push(new Projectile({ x: t.x, y: t.y }, lead, CANISTER_FLIGHT, t));
      t.aim = Math.atan2(lead.y - t.y, lead.x - t.x);
      ctx.emit({ t: 'fire', tower: t.type, from: { x: t.x, y: t.y }, to: [lead], tier: t.tier });
      return true;
    }
    return false;
  }

  private laneOf(e: Enemy, ctx: CombatContext) {
    return ctx.grid.lanes[e.lane]!;
  }

  private updateProjectiles(dt: number, ctx: CombatContext) {
    for (const p of this.projectiles) {
      p.age += dt;
      const k = Math.min(1, p.age / p.duration);
      p.x = p.from.x + (p.target.x - p.from.x) * k;
      p.y = p.from.y + (p.target.y - p.from.y) * k;
      if (k < 1) continue;
      p.active = false;
      const t = p.tower;
      const s = t.stats;
      const r = (s.splash ?? 1) * BOARD.CELL;
      const dmg = s.damage * (1 + t.buffDamage);
      for (const e of this.enemies) {
        if (!e.active || e.dist <= 0) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) > r) continue;
        this.damage(t, e, dmg, {}, ctx);
        if (s.slow && e.active) {
          e.slow = Math.max(e.slow, s.slow);
          e.slowTimer = Math.max(e.slowTimer, s.slowTime ?? 1);
        }
      }
      ctx.emit({ t: 'splash', x: p.x, y: p.y, r });
    }
    this.projectiles = this.projectiles.filter((p) => p.active);
  }

  // ── Damage, death, splitting ─────────────────────────────────────────────────
  private damage(t: Tower | null, e: Enemy, amount: number, opts: { pierce?: boolean; electric?: boolean }, ctx: CombatContext) {
    const dealt = e.takeDamage(amount, opts);
    if (t) {
      t.damageDealt += dealt;
      this.lastHitBy.set(e.id, t);
    }
    const brood = e.def.brood;
    if (brood && e.active) {
      const lost = 1 - e.health / e.maxHealth;
      const max = Math.round(1 / brood.every) - 1;
      while (e.broodLevel < max && lost >= (e.broodLevel + 1) * brood.every) {
        e.broodLevel++;
        for (let i = 0; i < brood.count; i++) this.spawnChild(e, brood.type, i, ctx);
        ctx.emit({ t: 'brood', x: e.x, y: e.y });
      }
    }
    if (e.def.shed && e.active && !e.shed && e.health < e.maxHealth / 2) {
      e.shed = true;
      e.shield = 0;
      ctx.emit({ t: 'shed', x: e.x, y: e.y });
    }
  }

  private spawnChild(parent: Enemy, type: EnemyType, i: number, ctx: CombatContext) {
    const child = new Enemy(type, parent.lane, parent.wave, ctx.hpFor(parent.wave), ctx.phase());
    child.dist = Math.max(0, parent.dist - 8 - i * 10);
    const p = ctx.grid.positionAt(ctx.grid.lanes[parent.lane]!, child.dist);
    child.x = p.x;
    child.y = p.y;
    this.enemies.push(child);
  }

  private collectDead(ctx: CombatContext) {
    const dead: Enemy[] = [];
    for (const e of this.enemies) if (!e.active && e.health <= 0) dead.push(e);
    for (const e of dead) {
      const bounty = ctx.bountyFor(e);
      const killer = this.lastHitBy.get(e.id);
      if (killer) killer.kills++;
      ctx.emit({ t: 'kill', enemy: e.type, x: e.x, y: e.y, boss: !!e.def.boss, bounty, wave: e.wave });
      const split = e.def.split;
      if (split) for (let i = 0; i < split.count; i++) this.spawnChild(e, split.type, i, ctx);
      e.health = 1; // processed: keep it out of the next pass
    }
    for (const e of this.enemies) if (!e.active) this.lastHitBy.delete(e.id);
    this.enemies = this.enemies.filter((e) => e.active);
  }
}
