/**
 * allyController.ts — Friend ally system.
 * Spawns at wave 15. Follows player, attacks nearby enemies, can be downed.
 */
import type { Enemy, Projectile } from './types';
import type { Obstacle } from './mapSystem';
import { resolveObstacleCollision } from './mapSystem';

export interface Ally {
    active: boolean;
    x: number; y: number; radius: number;
    hp: number; maxHp: number; speed: number;
    state: 'follow' | 'attack' | 'downed' | 'reviving';
    reviveTimer: number;
    fireTimer: number; fireRate: number; aimAngle: number;
    /** Visual pulse time (sinusoidal) */
    phase: number;
}

/** Seconds before ally auto-revives after being downed */
const ALLY_REVIVE_TIME = 8;
/** Distance ally prefers to keep from player */
const ALLY_FOLLOW_DIST = 110;
/** Max range ally will engage enemies */
const ALLY_VISION_RANGE = 320;
const ALLY_HP = 6;
const ALLY_SPEED = 175;
const ALLY_FIRE_RATE = 0.65; // seconds between shots (slow)

export class AllyController {
    ally: Ally = this.makeAlly();

    private makeAlly(): Ally {
        return {
            active: false, x: 0, y: 0, radius: 9,
            hp: ALLY_HP, maxHp: ALLY_HP, speed: ALLY_SPEED,
            state: 'follow', reviveTimer: 0,
            fireTimer: 0, fireRate: ALLY_FIRE_RATE,
            aimAngle: 0, phase: 0,
        };
    }

    /** Spawn the ally near the player */
    spawn(px: number, py: number): void {
        const a = this.ally;
        a.active = true; a.x = px + 80; a.y = py;
        a.hp = ALLY_HP; a.state = 'follow';
        a.fireTimer = 1.0; a.reviveTimer = 0;
    }

    reset(): void { this.ally = this.makeAlly(); }

    /**
     * Update ally AI each frame.
     * @param onFire    Called when ally fires (caller should spawn projectile)
     * @param onDowned  Called when ally HP reaches 0
     */
    update(
        dt: number,
        px: number, py: number,
        enemies: Enemy[],
        projectiles: Projectile[],
        obstacles: Obstacle[],
        onFire: (ax: number, ay: number, angle: number) => void,
        onDowned: () => void,
    ): void {
        const a = this.ally;
        if (!a.active) return;
        a.phase += dt;

        // ── Downed state: wait for revive ──
        if (a.state === 'downed') {
            a.reviveTimer -= dt;
            if (a.reviveTimer <= 0) {
                a.state = 'follow';
                a.hp = Math.ceil(ALLY_HP * 0.4);
            }
            return;
        }

        // ── Find nearest eligible enemy ──────────────────────────────────────
        let nearest: Enemy | null = null;
        let nearestDist = Infinity;
        for (const e of enemies) {
            if (!e.active || e.anim !== 'alive') continue;
            // Avoid bosses 80% of the time
            if (e.isBoss && Math.random() < 0.80) continue;
            const d = Math.hypot(e.x - a.x, e.y - a.y);
            if (d < nearestDist && d < ALLY_VISION_RANGE) { nearestDist = d; nearest = e; }
        }

        // ── State transitions ─────────────────────────────────────────────────
        if (nearest && a.state === 'follow') a.state = 'attack';
        if (!nearest && a.state === 'attack') a.state = 'follow';

        // ── Movement ──────────────────────────────────────────────────────────
        const distToPlayer = Math.hypot(px - a.x, py - a.y);

        if (a.state === 'attack' && nearest) {
            // Move toward enemy at reduced speed
            const dx = nearest.x - a.x, dy = nearest.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len > 50) {
                a.x += (dx / len) * a.speed * 0.55 * dt;
                a.y += (dy / len) * a.speed * 0.55 * dt;
            }
            // Aim & fire
            a.aimAngle = Math.atan2(nearest.y - a.y, nearest.x - a.x);
            a.fireTimer -= dt;
            if (a.fireTimer <= 0) {
                a.fireTimer = a.fireRate;
                onFire(a.x, a.y, a.aimAngle);
            }
        } else {
            // Follow player — maintain comfortable distance
            if (distToPlayer > ALLY_FOLLOW_DIST + 25) {
                const dx = px - a.x, dy = py - a.y;
                const len = Math.hypot(dx, dy);
                a.x += (dx / len) * a.speed * dt;
                a.y += (dy / len) * a.speed * dt;
            }
        }

        // ── Obstacle + ally leashes near player so it doesn't get stuck ──────
        const resolved = resolveObstacleCollision(a.x, a.y, a.radius, obstacles);
        a.x = resolved.x; a.y = resolved.y;

        // ── Check projectile hits against ally ───────────────────────────────
        for (const proj of projectiles) {
            if (!proj.active || proj.isPlayer) continue;
            const d = Math.hypot(proj.x - a.x, proj.y - a.y);
            if (d < proj.radius + a.radius) {
                proj.active = false;
                a.hp -= proj.damage;
                if (a.hp <= 0) {
                    a.hp = 0;
                    a.state = 'downed';
                    a.reviveTimer = ALLY_REVIVE_TIME;
                    onDowned();
                }
                break;
            }
        }
    }
}
