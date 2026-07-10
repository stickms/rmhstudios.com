// ============================================================
// Fighter Factory & Mechanics — 2D-plane arena
// ============================================================

import {
    Fighter, FighterClass, InputCommand, PunchType,
    ARENA_RADIUS, FIGHTER_RADIUS,
    MOVE_SPEED_SCALE, KNOCKBACK_SCALE,
} from './types';
import { CLASS_STATS, CLASS_DISPLAY } from './stats';
import { PUNCH_DEFS, calculateDamage, PUNCH_COMMIT_FRAMES, punchHitFrame } from '../combat/punches';
import { COMBO_WINDOW_MS } from '../combat/combos';

/** Create a new fighter instance on the ground plane. */
export function createFighter(opts: {
    seat: number;
    className: FighterClass;
    team: number;
    isAI: boolean;
    isLocal: boolean;
    x: number;
    z: number;
    displayName: string;
}): Fighter {
    const stats = { ...CLASS_STATS[opts.className] };
    const display = CLASS_DISPLAY[opts.className];

    return {
        seat: opts.seat,
        team: opts.team,
        isAI: opts.isAI,
        isLocal: opts.isLocal,
        x: opts.x,
        z: opts.z,
        yaw: Math.atan2(-opts.z, -opts.x), // face arena centre initially
        vx: 0,
        vz: 0,
        state: 'idle',
        stateFrame: 0,
        health: stats.maxHealth,
        stamina: stats.stamina,
        stats,
        className: opts.className,
        currentPunch: null,
        punchFrame: 0,
        bufferedPunch: null,
        hitCooldown: 0,
        blockHeld: false,
        comboHistory: [],
        punchConnected: false,
        knockoutTimer: 0,
        hitFlash: 0,
        displayName: opts.displayName,
        spriteColor: display.color,
        spriteAccentColor: display.accent,
        alive: true,
        roundWins: 0,
    };
}

/** Clamp a position to stay inside the circular arena. */
export function clampToArena(x: number, z: number): { x: number; z: number } {
    const r = Math.hypot(x, z);
    const max = ARENA_RADIUS - FIGHTER_RADIUS;
    if (r <= max || r === 0) return { x, z };
    const s = max / r;
    return { x: x * s, z: z * s };
}

/**
 * Apply a movement command to a fighter (shared by the host sim and the
 * guest's client-side prediction so they integrate identically).
 */
export function integrateMovement(fighter: Fighter, cmd: InputCommand): void {
    const canMove = fighter.state === 'idle' || fighter.state === 'walking' || fighter.state === 'blocking';
    if (!canMove) {
        fighter.vx = 0;
        fighter.vz = 0;
        if (fighter.state === 'walking') fighter.state = 'idle';
        return;
    }

    let mx = cmd.moveX;
    let mz = cmd.moveZ;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }

    // Blocking slows you to a crawl (defensive shuffle).
    const blockMod = fighter.state === 'blocking' ? 0.4 : 1;
    const speed = fighter.stats.moveSpeed * MOVE_SPEED_SCALE * blockMod;

    fighter.vx = mx * speed;
    fighter.vz = mz * speed;

    const next = clampToArena(fighter.x + fighter.vx, fighter.z + fighter.vz);
    fighter.x = next.x;
    fighter.z = next.z;

    if (fighter.state === 'idle' && mag > 0.05) {
        fighter.state = 'walking';
    } else if (fighter.state === 'walking' && mag <= 0.05) {
        fighter.state = 'idle';
    }
}

/** Turn the fighter to face a world-space point. */
export function faceToward(fighter: Fighter, tx: number, tz: number): void {
    const dx = tx - fighter.x;
    const dz = tz - fighter.z;
    if (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4) {
        fighter.yaw = Math.atan2(dz, dx);
    }
}

/** Forward unit vector implied by the fighter's yaw. */
export function forwardVec(fighter: Fighter): { x: number; z: number } {
    return { x: Math.cos(fighter.yaw), z: Math.sin(fighter.yaw) };
}

/** Attempt to throw a punch. Returns true if the punch started. */
export function startPunch(fighter: Fighter, punchType: PunchType): boolean {
    if (fighter.state !== 'idle' && fighter.state !== 'walking' && fighter.state !== 'blocking') return false;

    const punch = PUNCH_DEFS[punchType];
    if (fighter.stamina < punch.staminaCost) return false;

    fighter.state = 'punching';
    fighter.stateFrame = 0;
    fighter.currentPunch = punch;
    fighter.punchFrame = 0;
    fighter.stamina -= punch.staminaCost;
    fighter.punchConnected = false;
    fighter.vx = 0;
    fighter.vz = 0;
    return true;
}

/** Record that an attacker's punch connected, feeding combo detection. */
export function recordPunchConnected(attacker: Fighter): void {
    if (!attacker.currentPunch || attacker.punchConnected) return;
    attacker.punchConnected = true;
    attacker.comboHistory.push({ type: attacker.currentPunch.type, time: Date.now() });
    if (attacker.comboHistory.length > 6) {
        attacker.comboHistory = attacker.comboHistory.slice(-6);
    }
}

/** Apply a hit to a target. Knockback radiates away from the attacker on the plane. */
export function applyHit(
    target: Fighter,
    attacker: Fighter,
    comboMultiplier: number = 1.0,
): { damage: number; blocked: boolean; ko: boolean } {
    if (!attacker.currentPunch) return { damage: 0, blocked: false, ko: false };
    if (target.hitCooldown > 0 || !target.alive) return { damage: 0, blocked: false, ko: false };
    if (target.state === 'knockedOut') return { damage: 0, blocked: false, ko: false };

    // A block only counts if the target is roughly facing the incoming attacker.
    const toAtkX = attacker.x - target.x;
    const toAtkZ = attacker.z - target.z;
    const fwd = forwardVec(target);
    const facingAtk = (fwd.x * toAtkX + fwd.z * toAtkZ) > 0;
    const isBlocking = target.blockHeld && target.state === 'blocking' && facingAtk;

    const damage = calculateDamage(
        attacker.currentPunch,
        attacker.stats.power,
        target.stats.defense,
        comboMultiplier,
        isBlocking,
    );

    target.health = Math.max(0, target.health - damage);
    target.hitCooldown = 10;
    target.hitFlash = isBlocking ? 4 : 8;

    if (isBlocking) {
        target.stateFrame = 0;
        return { damage, blocked: true, ko: false };
    }

    // Knockback along the attacker → target direction.
    const len = Math.hypot(-toAtkX, -toAtkZ) || 1;
    const kb = attacker.currentPunch.knockback * KNOCKBACK_SCALE;
    const moved = clampToArena(target.x + (-toAtkX / len) * kb, target.z + (-toAtkZ / len) * kb);
    target.x = moved.x;
    target.z = moved.z;

    if (target.health <= 0) {
        target.state = 'knockedOut';
        target.stateFrame = 0;
        target.knockoutTimer = 600;
        target.alive = false;
        target.bufferedPunch = null;
        return { damage, blocked: false, ko: true };
    }

    target.state = 'hit';
    target.stateFrame = 0;
    target.bufferedPunch = null;
    return { damage, blocked: false, ko: false };
}

/** Advance a fighter's per-frame state machine. */
export function updateFighter(fighter: Fighter): void {
    fighter.stateFrame++;
    if (fighter.hitCooldown > 0) fighter.hitCooldown--;
    if (fighter.hitFlash > 0) fighter.hitFlash--;

    if (fighter.state !== 'punching') {
        fighter.stamina = Math.min(fighter.stats.stamina, fighter.stamina + fighter.stats.staminaRegen);
    }

    const now = Date.now();
    fighter.comboHistory = fighter.comboHistory.filter(h => now - h.time < COMBO_WINDOW_MS * 6);

    switch (fighter.state) {
        case 'punching': {
            if (!fighter.currentPunch) { fighter.state = 'idle'; break; }
            const dur = PUNCH_COMMIT_FRAMES[fighter.currentPunch.type];
            fighter.punchFrame++;
            if (fighter.punchFrame >= dur) {
                if (!fighter.punchConnected) fighter.comboHistory = [];
                fighter.state = 'idle';
                fighter.currentPunch = null;
                fighter.punchFrame = 0;
                fighter.stateFrame = 0;
                fighter.punchConnected = false;
                // Fire a buffered punch immediately so it feels responsive.
                if (fighter.bufferedPunch) {
                    const queued = fighter.bufferedPunch;
                    fighter.bufferedPunch = null;
                    startPunch(fighter, queued);
                }
            }
            break;
        }
        case 'hit':
            if (fighter.stateFrame >= 12) { fighter.state = 'idle'; fighter.stateFrame = 0; }
            break;
        case 'stunned':
            if (fighter.stateFrame >= 30) { fighter.state = 'idle'; fighter.stateFrame = 0; }
            break;
        case 'knockedOut':
            fighter.knockoutTimer--;
            break;
        case 'blocking':
            if (!fighter.blockHeld) { fighter.state = 'idle'; fighter.stateFrame = 0; }
            break;
        default:
            break;
    }
}

/** Set blocking state (only from neutral states). */
export function setBlocking(fighter: Fighter, blocking: boolean): void {
    fighter.blockHeld = blocking;
    if (blocking && (fighter.state === 'idle' || fighter.state === 'walking')) {
        fighter.state = 'blocking';
        fighter.stateFrame = 0;
    } else if (!blocking && fighter.state === 'blocking') {
        fighter.state = 'idle';
        fighter.stateFrame = 0;
    }
}

/** True on the single frame a punch reaches its active hit window. */
export function isHitFrame(attacker: Fighter): boolean {
    if (attacker.state !== 'punching' || !attacker.currentPunch) return false;
    return attacker.punchFrame === punchHitFrame(attacker.currentPunch.type);
}

/** Reset a fighter to a fresh round at the given spawn position. */
export function resetFighter(fighter: Fighter, x: number, z: number): void {
    fighter.x = x;
    fighter.z = z;
    fighter.yaw = Math.atan2(-z, -x);
    fighter.vx = 0;
    fighter.vz = 0;
    fighter.health = fighter.stats.maxHealth;
    fighter.stamina = fighter.stats.stamina;
    fighter.state = 'idle';
    fighter.stateFrame = 0;
    fighter.currentPunch = null;
    fighter.punchFrame = 0;
    fighter.bufferedPunch = null;
    fighter.hitCooldown = 0;
    fighter.hitFlash = 0;
    fighter.blockHeld = false;
    fighter.comboHistory = [];
    fighter.punchConnected = false;
    fighter.knockoutTimer = 0;
    fighter.alive = true;
}
