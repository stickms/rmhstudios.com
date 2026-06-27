/**
 * Dream Rift world simulation.
 *
 * A headless, deterministic entity simulator shared by singleplayer and
 * multiplayer. It owns the bullet/shot/enemy/item/effect pools, the player
 * ships and the boss, and advances them one fixed frame at a time.
 *
 * Authority split (see net/session.ts for the orchestration):
 *   - Enemies / popcorn are simulated locally on every client (cheap, minor).
 *   - The local player is authoritative over its OWN collisions and death —
 *     you only die when *your* screen shows the hit, so latency never kills you.
 *   - The boss's HP and spell-card transitions are host-authoritative; the
 *     simulation just runs whichever card it's told to and reports the damage
 *     the local player dealt so the host can total it.
 */

import {
    BOMB_DURATION,
    BOMB_INVULN,
    CHAR_STATS,
    DEATHBOMB_FRAMES,
    INVULN_RESPAWN,
    ITEM_ATTRACT_RADIUS,
    ITEM_COLLECT_RADIUS,
    GRAZE_SCORE,
    MAX_BULLETS,
    MAX_EFFECTS,
    MAX_ENEMIES,
    MAX_ITEMS,
    MAX_SHOTS,
    PLAYFIELD_H,
    PLAYFIELD_W,
    PLAYER_MARGIN,
    POC_LINE_Y,
    POINT_ITEM_BASE,
    POWER_MAX,
    RESPAWN_FRAMES,
} from '../constants';
import { Pool } from '../pool';
import { Rng } from '../rng';
import { runPattern, type PatternCtx } from './patterns';
import { CHARACTERS } from '../render/sprites';
import type {
    Bullet,
    BulletColorName,
    DifficultyMul,
    Effect,
    Enemy,
    InputFrame,
    Item,
    ItemKind,
    PlayerShip,
    Shot,
    Vec2,
    BossState,
} from '../types';

export type SimEventKind =
    | 'graze'
    | 'enemyKilled'
    | 'playerDeath'
    | 'bomb'
    | 'itemCollect'
    | 'extend'
    | 'bossHit';

export interface SimEvent {
    kind: SimEventKind;
    slot: number;
    x?: number;
    y?: number;
    value?: number;
}

export interface StepResult {
    events: SimEvent[];
    /** Boss damage dealt by the LOCAL player this frame (reported to host). */
    localBossDamage: number;
    /** True if the local player died this frame (broadcast to peers). */
    localDied: boolean;
    /** True if the local player bombed this frame. */
    localBombed: boolean;
}

const TAU = Math.PI * 2;

function mkBullet(): Bullet {
    return {
        active: false, x: 0, y: 0, speed: 0, angle: 0, accel: 0, angularVel: 0,
        minSpeed: 0, maxSpeed: 99, radius: 3, drawRadius: 6, shape: 'orb', color: 'red',
        age: 0, ttl: -1, grazedMask: 0, spin: 0, dying: 0,
    };
}
function mkShot(): Shot {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: 4, ownerSlot: 0, kind: 'amulet', color: 'red', homing: false, targetId: -1, age: 0, pierce: 0 };
}
function mkItem(): Item {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, kind: 'power', age: 0, attracted: false, value: 0 };
}
function mkEnemy(): Enemy {
    return {
        active: false, id: 0, x: 0, y: 0, hp: 10, maxHp: 10, radius: 12, variant: 'sprite', color: 'red',
        age: 0, lifetime: 600, enterX: 0, enterY: 0, holdFrames: 120, exitDir: -Math.PI / 2, speed: 1.2,
        fireTimer: 0, fireInterval: 40, patternId: 'none', burstCount: 0,
        drops: { power: 0, point: 0, life: 0, bomb: 0 }, dead: false, hitFlash: 0,
    };
}
function mkEffect(): Effect {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, ttl: 30, kind: 'spark', color: '#fff', size: 4 };
}

export class World {
    bullets = new Pool<Bullet>(MAX_BULLETS, mkBullet, (b) => Object.assign(b, mkBullet()));
    shots = new Pool<Shot>(MAX_SHOTS, mkShot, (s) => Object.assign(s, mkShot()));
    items = new Pool<Item>(MAX_ITEMS, mkItem, (i) => Object.assign(i, mkItem()));
    enemies = new Pool<Enemy>(MAX_ENEMIES, mkEnemy, (e) => Object.assign(e, mkEnemy()));
    effects = new Pool<Effect>(MAX_EFFECTS, mkEffect, (e) => Object.assign(e, mkEffect()));

    players: PlayerShip[] = [];
    boss: BossState | null = null;
    rng: Rng;
    frame = 0;
    diff: DifficultyMul;
    localSlot = 0;
    themeColors: BulletColorName[] = ['red', 'orange', 'yellow', 'white'];
    /** Boss accepts player damage only when true (host gating handled in session). */
    bossVulnerable = true;
    /** Only the host picks new boss move targets (RNG); peers lerp to broadcast pos. */
    isHostBoss = true;

    private inputs: InputFrame[] = [];

    constructor(diff: DifficultyMul, seed: number) {
        this.diff = diff;
        this.rng = new Rng(seed);
    }

    setLocalInput(slot: number, input: InputFrame): void {
        this.inputs[slot] = input;
    }

    setRemoteState(slot: number, x: number, y: number, firing: boolean, focus: boolean, lives: number, bombs: number, dead: boolean): void {
        const p = this.players[slot];
        if (!p || p.isLocal) return;
        p.x = x;
        p.y = y;
        p.firing = firing;
        p.focus = focus;
        p.lives = lives;
        p.bombs = bombs;
        p.dead = dead;
    }

    // ─── spawning ───

    spawnBullet(o: Partial<Bullet>): Bullet | null {
        const b = this.bullets.acquire();
        if (!b) return null;
        Object.assign(b, o);
        if (b.drawRadius === undefined || b.drawRadius === 6) b.drawRadius = (o.radius ?? 3) / 0.62;
        b.age = 0;
        b.grazedMask = 0;
        b.dying = 0;
        return b;
    }

    spawnEffect(kind: Effect['kind'], x: number, y: number, color: string, size = 5, ttl = 26, vx = 0, vy = 0): void {
        const e = this.effects.acquire();
        if (!e) return;
        e.kind = kind; e.x = x; e.y = y; e.color = color; e.size = size; e.ttl = ttl; e.age = 0; e.vx = vx; e.vy = vy;
    }

    spawnItem(kind: ItemKind, x: number, y: number): void {
        const it = this.items.acquire();
        if (!it) return;
        it.kind = kind; it.x = x; it.y = y; it.vx = (this.rng.next() * 2 - 1) * 0.6; it.vy = -1.8; it.age = 0; it.attracted = false;
        it.value = kind === 'point' ? POINT_ITEM_BASE : 1;
    }

    spawnEnemy(def: Partial<Enemy>): Enemy | null {
        const e = this.enemies.acquire();
        if (!e) return null;
        Object.assign(e, def);
        e.age = 0; e.dead = false; e.hitFlash = 0; e.fireTimer = 0;
        e.maxHp = e.hp;
        return e;
    }

    spawnBoss(boss: BossState): void {
        this.boss = boss;
    }

    clearAllBullets(toItems = false): void {
        this.bullets.forEach((b) => {
            if (toItems && this.rng.next() < 0.25) this.spawnItem('point', b.x, b.y);
            this.spawnEffect('pop', b.x, b.y, '#ffffff', 3, 12);
            this.bullets.release(b);
        });
    }

    // ─── helpers ───

    private nearestPlayer(x: number, y: number): Vec2 {
        let best: Vec2 = { x: PLAYFIELD_W / 2, y: PLAYFIELD_H - 40 };
        let bd = Infinity;
        for (const p of this.players) {
            if (!p.joined || p.dead) continue;
            const d = (p.x - x) ** 2 + (p.y - y) ** 2;
            if (d < bd) { bd = d; best = { x: p.x, y: p.y }; }
        }
        return best;
    }

    nearestEnemyId(x: number, y: number): number {
        let id = -1;
        let bd = Infinity;
        this.enemies.forEach((e) => {
            if (e.dead) return;
            const d = (e.x - x) ** 2 + (e.y - y) ** 2;
            if (d < bd) { bd = d; id = e.id; }
        });
        if (this.boss && this.boss.active && this.boss.introFrames <= 0) {
            const d = (this.boss.x - x) ** 2 + (this.boss.y - y) ** 2;
            if (d < bd) id = -2; // boss sentinel
        }
        return id;
    }

    // ─── main step ───

    step(isHost: boolean): StepResult {
        this.frame++;
        const events: SimEvent[] = [];
        let localBossDamage = 0;
        let localDied = false;
        let localBombed = false;

        this.updateBullets();
        this.updatePlayers(events, (d) => (localDied = localDied || d), () => (localBombed = true));
        localBossDamage = this.updateShots(events);
        this.updateEnemies(events);
        this.updateBoss();
        this.updateItems(events);
        this.updateEffects();

        void isHost;
        return { events, localBossDamage, localDied, localBombed };
    }

    private updateBullets(): void {
        this.bullets.forEach((b) => {
            b.age++;
            if (b.dying > 0) {
                b.dying++;
                if (b.dying > 10) this.bullets.release(b);
                return;
            }
            b.angle += b.angularVel;
            b.speed += b.accel;
            if (b.speed < b.minSpeed) b.speed = b.minSpeed;
            if (b.speed > b.maxSpeed) b.speed = b.maxSpeed;
            b.x += Math.cos(b.angle) * b.speed;
            b.y += Math.sin(b.angle) * b.speed;
            b.spin += 0.15;
            const m = 24;
            if (b.x < -m || b.x > PLAYFIELD_W + m || b.y < -m || b.y > PLAYFIELD_H + m || (b.ttl > 0 && b.age > b.ttl)) {
                this.bullets.release(b);
            }
        });
    }

    private updatePlayers(events: SimEvent[], onDeath: (d: boolean) => void, onBomb: () => void): void {
        for (const p of this.players) {
            if (!p.joined) continue;
            p.animTime++;
            if (p.invuln > 0) p.invuln--;
            if (p.deathbombWindow > 0) p.deathbombWindow--;
            if (p.bombActive > 0) p.bombActive--;
            if (p.shotCd > 0) p.shotCd--;

            if (p.dead) {
                p.respawnTimer--;
                if (p.isLocal && p.respawnTimer <= 0 && p.lives > 0) {
                    p.dead = false;
                    p.invuln = INVULN_RESPAWN;
                    p.x = PLAYFIELD_W / 2;
                    p.y = PLAYFIELD_H - 56;
                    p.power = Math.max(0, p.power - 16);
                }
                continue;
            }

            if (p.isLocal) {
                this.controlLocalPlayer(p, events, onBomb);
            } else {
                // smooth remote ship toward networked position
                p.renderX += (p.x - p.renderX) * 0.4;
                p.renderY += (p.y - p.renderY) * 0.4;
                p.moveDir = p.x - p.renderX > 0.4 ? 1 : p.x - p.renderX < -0.4 ? -1 : 0;
                this.tryFire(p);
            }
        }

        // local collision check (client authority over own death)
        const lp = this.players[this.localSlot];
        if (lp && lp.joined && !lp.dead && lp.isLocal) {
            this.checkLocalHits(lp, events, onDeath);
        }
    }

    private controlLocalPlayer(p: PlayerShip, events: SimEvent[], onBomb: () => void): void {
        const inp = this.inputs[p.slot] ?? null;
        const st = CHAR_STATS[p.charId];
        p.focus = !!inp?.focus;
        const speed = p.focus ? st.focusSpeed : st.speed;
        let dx = 0;
        let dy = 0;
        if (inp) {
            if (inp.left) dx -= 1;
            if (inp.right) dx += 1;
            if (inp.up) dy -= 1;
            if (inp.down) dy += 1;
        }
        if (dx && dy) {
            const inv = Math.SQRT1_2;
            dx *= inv; dy *= inv;
        }
        p.x = clamp(p.x + dx * speed, PLAYER_MARGIN, PLAYFIELD_W - PLAYER_MARGIN);
        p.y = clamp(p.y + dy * speed, PLAYER_MARGIN, PLAYFIELD_H - PLAYER_MARGIN);
        p.renderX = p.x; p.renderY = p.y;
        p.moveDir = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        p.hitboxR = st.hitboxR;

        // bomb
        if (inp?.bomb && p.bombs > 0 && p.bombActive <= 0) {
            p.bombs--;
            p.bombActive = BOMB_DURATION;
            p.invuln = Math.max(p.invuln, BOMB_INVULN);
            this.clearAllBullets(true);
            this.spawnEffect('spell', p.x, p.y, '#ffffff', 60, 40);
            events.push({ kind: 'bomb', slot: p.slot, x: p.x, y: p.y });
            onBomb();
        }

        p.firing = !!inp?.shot;
        this.tryFire(p);
    }

    private tryFire(p: PlayerShip): void {
        if (!p.firing || p.shotCd > 0) return;
        const st = CHAR_STATS[p.charId];
        p.shotCd = st.shotCooldown;
        const powerLevel = p.power / POWER_MAX;
        const dmg = st.damageLow + (st.damageHigh - st.damageLow) * powerLevel;
        const tier = p.power >= 96 ? 3 : p.power >= 64 ? 2 : p.power >= 32 ? 1 : 0;
        spawnPlayerShots(this, p, dmg, tier);
    }

    private checkLocalHits(p: PlayerShip, events: SimEvent[], onDeath: (d: boolean) => void): void {
        const gr = this.diff.grazeRadius;
        const invuln = p.invuln > 0 || p.bombActive > 0;
        this.bullets.forEach((b) => {
            if (b.dying > 0) return;
            const dx = b.x - p.x;
            const dy = b.y - p.y;
            const d2 = dx * dx + dy * dy;
            const hit = b.radius + p.hitboxR;
            if (!invuln && d2 <= hit * hit) {
                // hit — start deathbomb window then die
                if (p.deathbombWindow <= 0) {
                    p.deathbombWindow = DEATHBOMB_FRAMES;
                }
                // actual death resolves after window unless bombed; simplify: die now if no bombs or window elapsed
                this.killLocalPlayer(p, events, onDeath);
                return;
            }
            const grR = b.radius + p.hitboxR + gr;
            if (d2 <= grR * grR && !(b.grazedMask & (1 << p.slot))) {
                b.grazedMask |= 1 << p.slot;
                p.graze++;
                p.score += GRAZE_SCORE;
                this.spawnEffect('graze', b.x, b.y, '#ffffff', 4, 14);
                events.push({ kind: 'graze', slot: p.slot, x: b.x, y: b.y });
            }
        });
    }

    private killLocalPlayer(p: PlayerShip, events: SimEvent[], onDeath: (d: boolean) => void): void {
        if (p.dead || p.invuln > 0) return;
        p.dead = true;
        p.deaths++;
        p.lives--;
        p.respawnTimer = RESPAWN_FRAMES;
        p.power = Math.max(0, p.power - 16);
        this.spawnEffect('death', p.x, p.y, '#ff5577', 40, 36);
        // drop a few power items on death
        for (let i = 0; i < 4; i++) this.spawnItem('power', p.x + (this.rng.next() * 2 - 1) * 20, p.y - 10);
        events.push({ kind: 'playerDeath', slot: p.slot, x: p.x, y: p.y });
        onDeath(true);
    }

    private updateShots(events: SimEvent[]): number {
        let localBossDamage = 0;
        this.shots.forEach((s) => {
            s.age++;
            if (s.homing && s.targetId !== -1) {
                const tgt = this.findTarget(s.targetId);
                if (tgt) {
                    const a = Math.atan2(tgt.y - s.y, tgt.x - s.x);
                    const ca = Math.atan2(s.vy, s.vx);
                    const na = ca + clamp(angDiff(a, ca), -0.18, 0.18);
                    const sp = Math.hypot(s.vx, s.vy);
                    s.vx = Math.cos(na) * sp;
                    s.vy = Math.sin(na) * sp;
                }
            }
            s.x += s.vx;
            s.y += s.vy;
            if (s.x < -20 || s.x > PLAYFIELD_W + 20 || s.y < -20 || s.y > PLAYFIELD_H + 20) {
                this.shots.release(s);
                return;
            }
            // collide vs enemies (all shots damage local enemies)
            let consumed = false;
            this.enemies.forEach((e) => {
                if (consumed || e.dead) return;
                const dx = e.x - s.x;
                const dy = e.y - s.y;
                const r = e.radius + s.radius;
                if (dx * dx + dy * dy <= r * r) {
                    e.hp -= s.damage;
                    e.hitFlash = 4;
                    this.spawnEffect('spark', s.x, s.y, '#ffffff', 3, 8);
                    if (s.pierce > 0) s.pierce--;
                    else consumed = true;
                }
            });
            if (consumed) {
                this.shots.release(s);
                return;
            }
            // collide vs boss (only LOCAL player's shots count toward host total)
            const boss = this.boss;
            if (boss && boss.active && boss.introFrames <= 0 && this.bossVulnerable) {
                const dx = boss.x - s.x;
                const dy = boss.y - s.y;
                const r = 22 + s.radius;
                if (dx * dx + dy * dy <= r * r) {
                    boss.hitFlash = 3;
                    this.spawnEffect('spark', s.x, s.y, '#ffffff', 3, 8);
                    if (s.ownerSlot === this.localSlot) {
                        localBossDamage += s.damage;
                        events.push({ kind: 'bossHit', slot: s.ownerSlot, value: s.damage });
                    }
                    if (s.pierce > 0) s.pierce--;
                    else this.shots.release(s);
                }
            }
        });
        return localBossDamage;
    }

    private findTarget(id: number): Vec2 | null {
        if (id === -2 && this.boss?.active) return { x: this.boss.x, y: this.boss.y };
        let r: Vec2 | null = null;
        this.enemies.forEach((e) => {
            if (e.id === id && !e.dead) r = { x: e.x, y: e.y };
        });
        return r;
    }

    private updateEnemies(events: SimEvent[]): void {
        this.enemies.forEach((e) => {
            e.age++;
            if (e.hitFlash > 0) e.hitFlash--;
            // movement: ease to enter point, hold, then exit
            if (e.age < 60) {
                e.x += (e.enterX - e.x) * 0.06;
                e.y += (e.enterY - e.y) * 0.06;
            } else if (e.age > e.holdFrames) {
                e.x += Math.cos(e.exitDir) * e.speed;
                e.y += Math.sin(e.exitDir) * e.speed;
            }
            // firing
            if (e.age >= 30 && e.age < e.holdFrames + 30) {
                const ctx = this.patternCtx(e.x, e.y, e.age - 30);
                runPattern(e.patternId, ctx);
            }
            // death / cleanup
            if (e.hp <= 0 && !e.dead) {
                e.dead = true;
                this.onEnemyKilled(e, events);
                this.enemies.release(e);
                return;
            }
            if (e.x < -40 || e.x > PLAYFIELD_W + 40 || e.y > PLAYFIELD_H + 40 || e.age > e.lifetime) {
                this.enemies.release(e);
            }
        });
    }

    private onEnemyKilled(e: Enemy, events: SimEvent[]): void {
        this.spawnEffect('pop', e.x, e.y, '#ffffff', 14, 20);
        for (let i = 0; i < e.drops.power; i++) this.spawnItem('power', e.x + this.rng.spread(10), e.y);
        for (let i = 0; i < e.drops.point; i++) this.spawnItem('point', e.x + this.rng.spread(10), e.y);
        for (let i = 0; i < e.drops.life; i++) this.spawnItem('life', e.x, e.y);
        for (let i = 0; i < e.drops.bomb; i++) this.spawnItem('bomb', e.x, e.y);
        const lp = this.players[this.localSlot];
        if (lp) lp.score += 1000 + e.maxHp * 20;
        events.push({ kind: 'enemyKilled', slot: this.localSlot, x: e.x, y: e.y, value: e.maxHp });
    }

    private updateBoss(): void {
        const b = this.boss;
        if (!b || !b.active) return;
        if (b.hitFlash > 0) b.hitFlash--;
        if (b.introFrames > 0) {
            b.introFrames--;
            b.x += (PLAYFIELD_W / 2 - b.x) * 0.05;
            b.y += (110 - b.y) * 0.05;
            return;
        }
        if (b.defeated) return;
        // drifting movement — only the host picks targets; peers lerp to broadcast pos
        if (this.isHostBoss) {
            b.moveTimer--;
            if (b.moveTimer <= 0) {
                b.moveTimer = 90 + Math.floor(this.rng.next() * 90);
                b.targetX = this.rng.range(80, PLAYFIELD_W - 80);
                b.targetY = this.rng.range(70, 150);
            }
        }
        b.x += (b.targetX - b.x) * 0.02;
        b.y += (b.targetY - b.y) * 0.02;
        if (b.timeLeftFrames > 0) b.timeLeftFrames--;
        // run current card pattern
        const card = b.cards[b.phaseIndex];
        if (card) {
            const t = this.frame - b.phaseStartFrame;
            if (t >= 0) runPattern(card.pattern, this.patternCtx(b.x, b.y, t));
        }
    }

    private patternCtx(x: number, y: number, t: number): PatternCtx {
        return {
            t,
            x,
            y,
            rng: this.rng,
            diff: this.diff,
            target: this.nearestPlayer(x, y),
            themeColors: this.themeColors,
            fire: (o) => {
                const radius = o.radius ?? 3;
                return this.spawnBullet({
                    x: o.x ?? x,
                    y: o.y ?? y,
                    angle: o.angle,
                    speed: o.speed,
                    accel: o.accel ?? 0,
                    angularVel: o.angularVel ?? 0,
                    minSpeed: o.minSpeed ?? 0,
                    maxSpeed: o.maxSpeed ?? 99,
                    radius,
                    drawRadius: radius / 0.62,
                    shape: o.shape ?? 'orb',
                    color: o.color ?? 'red',
                    ttl: o.ttl ?? -1,
                    spin: o.spin ?? 0,
                });
            },
        };
    }

    private updateItems(events: SimEvent[]): void {
        const lp = this.players[this.localSlot];
        const autoCollect = lp && !lp.dead && lp.y < POC_LINE_Y;
        this.items.forEach((it) => {
            it.age++;
            if (lp && lp.joined && !lp.dead) {
                const dx = lp.x - it.x;
                const dy = lp.y - it.y;
                const d2 = dx * dx + dy * dy;
                if (autoCollect || it.attracted || d2 < ITEM_ATTRACT_RADIUS * ITEM_ATTRACT_RADIUS) {
                    it.attracted = true;
                    const d = Math.sqrt(d2) || 1;
                    it.vx += (dx / d) * 0.9;
                    it.vy += (dy / d) * 0.9;
                    it.vx *= 0.8;
                    it.vy *= 0.8;
                }
                if (d2 < ITEM_COLLECT_RADIUS * ITEM_COLLECT_RADIUS) {
                    this.collectItem(it, lp, events);
                    this.items.release(it);
                    return;
                }
            }
            it.vy += 0.05; // gravity
            if (it.vy > 2.4) it.vy = 2.4;
            it.x += it.vx;
            it.y += it.vy;
            if (it.y > PLAYFIELD_H + 30) this.items.release(it);
        });
    }

    private collectItem(it: Item, p: PlayerShip, events: SimEvent[]): void {
        switch (it.kind) {
            case 'power':
                p.power = Math.min(POWER_MAX, p.power + 1);
                p.score += 10;
                break;
            case 'fullpower':
                p.power = POWER_MAX;
                break;
            case 'point':
                p.pointItems++;
                p.score += it.value;
                break;
            case 'life':
                p.lives = Math.min(8, p.lives + 1);
                events.push({ kind: 'extend', slot: p.slot, x: it.x, y: it.y });
                break;
            case 'bomb':
                p.bombs = Math.min(8, p.bombs + 1);
                break;
            case 'star':
                p.score += 500;
                break;
        }
        this.spawnEffect('graze', it.x, it.y, '#ffe9a0', 4, 12);
        events.push({ kind: 'itemCollect', slot: p.slot });
    }

    private updateEffects(): void {
        this.effects.forEach((e) => {
            e.age++;
            e.x += e.vx;
            e.y += e.vy;
            e.vx *= 0.92;
            e.vy *= 0.92;
            if (e.age > e.ttl) this.effects.release(e);
        });
    }
}

// ─── player shot spawning (per character) ───

function spawnPlayerShots(w: World, p: PlayerShip, dmg: number, tier: number): void {
    const sx = p.x;
    const sy = p.y - 12;
    const focus = p.focus;
    const cfg = CHARACTERS[p.charId];
    const color = cfg.shotColor as BulletColorName;
    switch (cfg.archetype) {
        case 'homing': {
            // homing amulets — wider with power
            const n = 1 + tier;
            for (let i = 0; i < n; i++) {
                const off = (i - (n - 1) / 2) * (focus ? 4 : 9);
                const sh = w.shots.acquire();
                if (!sh) break;
                Object.assign(sh, { x: sx + off, y: sy, vx: focus ? 0 : (i - (n - 1) / 2) * 0.6, vy: -9, damage: dmg, radius: 6, ownerSlot: p.slot, kind: 'amulet', color, homing: !focus, targetId: w.nearestEnemyId(sx, sy), age: 0, pierce: 0 });
            }
            break;
        }
        case 'focused': {
            // focused star laser — concentrated forward, high damage
            const n = focus ? 1 : 1 + tier;
            for (let i = 0; i < n; i++) {
                const off = (i - (n - 1) / 2) * 7;
                const sh = w.shots.acquire();
                if (!sh) break;
                Object.assign(sh, { x: sx + off, y: sy, vx: 0, vy: -11, damage: dmg * (focus ? 1.6 : 1), radius: 7, ownerSlot: p.slot, kind: 'star', color, homing: false, targetId: -1, age: 0, pierce: focus ? 2 : 0 });
            }
            break;
        }
        case 'spread': {
            // wide tide spread
            const n = 2 + tier * 2;
            const spread = focus ? 0.12 : 0.5;
            for (let i = 0; i < n; i++) {
                const a = -Math.PI / 2 + (n > 1 ? (-spread / 2 + (spread * i) / (n - 1)) : 0);
                const sh = w.shots.acquire();
                if (!sh) break;
                Object.assign(sh, { x: sx, y: sy, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, damage: dmg * 0.8, radius: 5, ownerSlot: p.slot, kind: 'wave', color, homing: false, targetId: -1, age: 0, pierce: 0 });
            }
            break;
        }
        case 'piercing': {
            // piercing lances
            const n = 1 + tier;
            for (let i = 0; i < n; i++) {
                const off = (i - (n - 1) / 2) * (focus ? 5 : 11);
                const sh = w.shots.acquire();
                if (!sh) break;
                Object.assign(sh, { x: sx + off, y: sy, vx: 0, vy: -10, damage: dmg, radius: 6, ownerSlot: p.slot, kind: 'lance', color, homing: false, targetId: -1, age: 0, pierce: 1 + tier });
            }
            break;
        }
    }
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}
function angDiff(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
}
