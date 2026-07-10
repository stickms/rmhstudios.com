// ============================================================
// CPU Controller — 2D multi-target brawler AI
//
// Stateless entry point producing an InputCommand for one AI fighter
// each tick. Per-fighter memory (strafe direction, attack cadence,
// reaction timers) is kept in a WeakMap so it lives with the fighter
// instance and resets naturally on a new match.
// ============================================================

import {
    WorldState, Fighter, InputCommand, PunchType,
    FIGHTER_RADIUS, RANGE_SCALE,
} from './fighters/types';
import { PUNCH_DEFS } from './combat/punches';

interface AIMemory {
    attackCd: number;     // frames until next punch attempt
    decisionCd: number;   // frames until movement re-roll
    strafeDir: number;    // -1 | 0 | 1
    blockCd: number;      // frames forced to keep blocking
    combo: PunchType[];   // queued combo follow-ups
}

const memories = new WeakMap<Fighter, AIMemory>();

function mem(f: Fighter): AIMemory {
    let m = memories.get(f);
    if (!m) {
        m = { attackCd: 30, decisionCd: 0, strafeDir: 0, blockCd: 0, combo: [] };
        memories.set(f, m);
    }
    return m;
}

// Engage distance ≈ jab reach in world units.
const JAB_REACH = PUNCH_DEFS.jab.range * RANGE_SCALE + FIGHTER_RADIUS * 2;

const COMBO_STARTERS: PunchType[][] = [
    ['jab', 'cross'],
    ['jab', 'jab', 'cross'],
    ['jab', 'cross', 'hook'],
    ['cross', 'hook', 'uppercut'],
    ['hook'],
    ['uppercut'],
];

export function computeAICommand(world: WorldState, f: Fighter, target: Fighter | null): InputCommand {
    const cmd: InputCommand = { moveX: 0, moveZ: 0, block: false, punch: null };
    const m = mem(f);
    if (m.attackCd > 0) m.attackCd--;
    if (m.decisionCd > 0) m.decisionCd--;
    if (m.blockCd > 0) m.blockCd--;
    if (!target) return cmd;

    const diff = world.aiDifficulty;            // 0..1
    const dx = target.x - f.x;
    const dz = target.z - f.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist, nz = dz / dist;
    // Perpendicular (for strafing).
    const px = -nz, pz = nx;

    // ── Defensive reaction: block an incoming punch ──
    const threatened = target.state === 'punching' && dist < JAB_REACH * 1.25;
    if (m.blockCd > 0 || (threatened && Math.random() < 0.25 + diff * 0.55)) {
        if (m.blockCd <= 0) m.blockCd = 8 + Math.floor(diff * 14);
        cmd.block = true;
        // Slight backpedal while blocking.
        cmd.moveX = -nx * 0.5;
        cmd.moveZ = -nz * 0.5;
        return cmd;
    }

    // ── Movement decision (re-rolled periodically) ──
    if (m.decisionCd <= 0) {
        m.decisionCd = 24 + Math.floor(Math.random() * 36);
        m.strafeDir = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1);
    }

    const engage = JAB_REACH * 0.85;
    if (dist > engage * 1.1) {
        // Close the gap (aggression scales approach commitment).
        const approach = 0.7 + diff * 0.3;
        cmd.moveX = nx * approach + px * m.strafeDir * 0.4;
        cmd.moveZ = nz * approach + pz * m.strafeDir * 0.4;
    } else if (dist < engage * 0.6) {
        // Too close — drift out a touch, keep strafing.
        cmd.moveX = -nx * 0.4 + px * m.strafeDir * 0.5;
        cmd.moveZ = -nz * 0.4 + pz * m.strafeDir * 0.5;
    } else {
        // In the pocket — circle.
        cmd.moveX = px * m.strafeDir * 0.6;
        cmd.moveZ = pz * m.strafeDir * 0.6;
    }

    // ── Offense ──
    const inRange = dist <= JAB_REACH;
    const canAttack = (f.state === 'idle' || f.state === 'walking') && m.attackCd <= 0;
    if (inRange && canAttack && f.stamina > PUNCH_DEFS.cross.staminaCost) {
        let punch: PunchType;
        if (m.combo.length > 0) {
            punch = m.combo.shift()!;
        } else if (Math.random() < 0.55 + diff * 0.3) {
            const starter = COMBO_STARTERS[Math.floor(Math.random() * COMBO_STARTERS.length)];
            punch = starter[0];
            m.combo = starter.slice(1);
        } else {
            punch = 'jab';
        }
        // Stop moving to commit to the punch.
        cmd.moveX = 0;
        cmd.moveZ = 0;
        cmd.punch = punch;
        // Faster cadence at higher difficulty; combos chain quickly.
        m.attackCd = m.combo.length > 0 ? 8 : 18 + Math.floor((1 - diff) * 28);
    }

    return cmd;
}
