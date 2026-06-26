export type BurstKind = 'spark' | 'debris' | 'smoke';

export interface BurstParticle {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number; maxLife: number;
    size: number;
    kind: BurstKind;
    active: boolean;
}

const GRAVITY = 9;
const FLOOR_Y = 0.05;

/** Integrate one burst particle in place for `dt` seconds, by kind:
 *  - spark:  light gravity, fast fade (handled by caller via life/maxLife).
 *  - debris: full gravity + inelastic floor bounce + ground friction.
 *  - smoke:  buoyant rise, velocity drag, expands over time.
 *  Decays life and deactivates at/below zero. */
export function stepParticle(p: BurstParticle, dt: number): void {
    p.life -= dt;
    if (p.life <= 0) { p.active = false; return; }

    if (p.kind === 'smoke') {
        p.vy += 1.2 * dt;                 // buoyancy
        const drag = Math.pow(0.92, dt * 60);
        p.vx *= drag; p.vy *= drag; p.vz *= drag;
        p.size += 0.6 * dt;               // billow
    } else {
        const g = p.kind === 'debris' ? GRAVITY : GRAVITY * 0.5;
        p.vy -= g * dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    if (p.kind === 'debris' && p.y < FLOOR_Y) {
        p.y = FLOOR_Y;
        p.vy *= -0.4;                     // inelastic bounce
        p.vx *= 0.6; p.vz *= 0.6;         // ground friction
    }
}
