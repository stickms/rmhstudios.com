// ============================================================
// Fighter Factory — Creates and manages fighter instances
// ============================================================

import {
    Fighter, FighterClass, FighterState, PunchType,
    GROUND_Y, RING_LEFT, RING_RIGHT
} from './types';
import { CLASS_STATS, CLASS_DISPLAY } from './stats';
import { PUNCH_DEFS, calculateDamage, calculatePunchSpeed } from '../combat/punches';
import { detectCombo, COMBO_WINDOW_MS } from '../combat/combos';

/**
 * Create a new fighter instance
 */
export function createFighter(
    className: FighterClass,
    x: number,
    facingRight: boolean,
    displayName: string,
): Fighter {
    const stats = { ...CLASS_STATS[className] };
    const display = CLASS_DISPLAY[className];

    return {
        x,
        y: GROUND_Y,
        facingRight,
        state: 'idle',
        stateFrame: 0,
        health: stats.maxHealth,
        stamina: stats.stamina,
        stats,
        className,
        currentPunch: null,
        punchFrame: 0,
        hitCooldown: 0,
        blockHeld: false,
        comboHistory: [],
        knockoutTimer: 0,
        displayName,
        spriteColor: display.color,
        spriteAccentColor: display.accent,
    };
}

/**
 * Attempt to throw a punch. Returns true if punch started.
 */
export function startPunch(fighter: Fighter, punchType: PunchType): boolean {
    if (fighter.state !== 'idle' && fighter.state !== 'walking') return false;

    const punch = PUNCH_DEFS[punchType];
    if (fighter.stamina < punch.staminaCost) return false;

    fighter.state = 'punching';
    fighter.stateFrame = 0;
    fighter.currentPunch = punch;
    fighter.punchFrame = 0;
    fighter.stamina -= punch.staminaCost;

    // Add to combo history
    fighter.comboHistory.push({ type: punchType, time: Date.now() });

    // Keep only last 6 punches in history
    if (fighter.comboHistory.length > 6) {
        fighter.comboHistory = fighter.comboHistory.slice(-6);
    }

    return true;
}

/**
 * Apply hit to a fighter
 */
export function applyHit(
    target: Fighter,
    attacker: Fighter,
    comboMultiplier: number = 1.0,
): { damage: number; blocked: boolean } {
    if (!attacker.currentPunch) return { damage: 0, blocked: false };
    if (target.hitCooldown > 0) return { damage: 0, blocked: false };
    if (target.state === 'knockedOut') return { damage: 0, blocked: false };

    const isBlocking = target.blockHeld && target.state === 'blocking';
    const damage = calculateDamage(
        attacker.currentPunch,
        attacker.stats.power,
        target.stats.defense,
        comboMultiplier,
        isBlocking,
    );

    target.health = Math.max(0, target.health - damage);
    target.hitCooldown = 10;

    if (isBlocking) {
        // Blocked — less stun, less knockback
        target.stateFrame = 0;
        return { damage, blocked: true };
    }

    // Apply knockback
    const knockDir = target.x > attacker.x ? 1 : -1;
    target.x += attacker.currentPunch.knockback * knockDir;
    target.x = Math.max(RING_LEFT + 5, Math.min(RING_RIGHT - 5, target.x));

    if (target.health <= 0) {
        target.state = 'knockedOut';
        target.stateFrame = 0;
        target.knockoutTimer = 600; // 10 seconds at 60fps
    } else {
        target.state = 'hit';
        target.stateFrame = 0;
    }

    return { damage, blocked: false };
}

/**
 * Update fighter state each frame
 */
export function updateFighter(fighter: Fighter): void {
    fighter.stateFrame++;

    // Decrease hit cooldown
    if (fighter.hitCooldown > 0) fighter.hitCooldown--;

    // Regenerate stamina
    if (fighter.state !== 'punching') {
        fighter.stamina = Math.min(
            fighter.stats.stamina,
            fighter.stamina + fighter.stats.staminaRegen
        );
    }

    // Clean up old combo history
    const now = Date.now();
    fighter.comboHistory = fighter.comboHistory.filter(
        h => now - h.time < COMBO_WINDOW_MS * 6
    );

    switch (fighter.state) {
        case 'punching': {
            if (!fighter.currentPunch) {
                fighter.state = 'idle';
                break;
            }
            const punchDuration = calculatePunchSpeed(fighter.currentPunch, fighter.stats.punchSpeed, fighter.stats.moveSpeed);
            fighter.punchFrame++;
            if (fighter.punchFrame >= punchDuration) {
                fighter.state = 'idle';
                fighter.currentPunch = null;
                fighter.punchFrame = 0;
                fighter.stateFrame = 0;
            }
            break;
        }

        case 'hit':
            if (fighter.stateFrame >= 12) {
                fighter.state = 'idle';
                fighter.stateFrame = 0;
            }
            break;

        case 'stunned':
            if (fighter.stateFrame >= 30) {
                fighter.state = 'idle';
                fighter.stateFrame = 0;
            }
            break;

        case 'knockedOut':
            fighter.knockoutTimer--;
            break;

        case 'blocking':
            if (!fighter.blockHeld) {
                fighter.state = 'idle';
                fighter.stateFrame = 0;
            }
            break;

        default:
            break;
    }
}

/**
 * Move a fighter left/right
 */
export function moveFighter(fighter: Fighter, direction: number): void {
    if (fighter.state !== 'idle' && fighter.state !== 'walking' && fighter.state !== 'blocking') return;

    const speed = fighter.stats.moveSpeed;
    fighter.x += direction * speed;
    fighter.x = Math.max(RING_LEFT + 5, Math.min(RING_RIGHT - 5, fighter.x));

    if (direction !== 0 && fighter.state === 'idle') {
        fighter.state = 'walking';
    } else if (direction === 0 && fighter.state === 'walking') {
        fighter.state = 'idle';
    }
}

/**
 * Set blocking state
 */
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

/**
 * Check if a punch connects (distance-based hit detection)
 */
export function checkHit(attacker: Fighter, target: Fighter): boolean {
    if (attacker.state !== 'punching' || !attacker.currentPunch) return false;

    // Hit only connects at the "peak" of the punch animation (around 40-60% through)
    const punchDuration = calculatePunchSpeed(attacker.currentPunch, attacker.stats.punchSpeed, attacker.stats.moveSpeed);
    const hitWindowStart = Math.floor(punchDuration * 0.35);
    const hitWindowEnd = Math.floor(punchDuration * 0.55);

    if (attacker.punchFrame < hitWindowStart || attacker.punchFrame > hitWindowEnd) return false;
    // Already processed this punch's hit
    if (attacker.punchFrame !== hitWindowStart) return false;

    const distance = Math.abs(attacker.x - target.x);
    return distance <= attacker.currentPunch.range;
}

/**
 * Reset fighter for a new round
 */
export function resetFighter(fighter: Fighter, x: number): void {
    fighter.x = x;
    fighter.y = GROUND_Y;
    fighter.health = fighter.stats.maxHealth;
    fighter.stamina = fighter.stats.stamina;
    fighter.state = 'idle';
    fighter.stateFrame = 0;
    fighter.currentPunch = null;
    fighter.punchFrame = 0;
    fighter.hitCooldown = 0;
    fighter.blockHeld = false;
    fighter.comboHistory = [];
    fighter.knockoutTimer = 0;
}
