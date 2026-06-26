// ============================================================
// Deterministic World Simulation — host-authoritative core
//
// Runs identically for single-player (local), the multiplayer host,
// and the (non-simulated) reference used by tests. Guests never run
// this; they render interpolated snapshots instead.
// ============================================================

import {
    WorldState, Fighter, InputCommand,
    FIGHTER_RADIUS, RANGE_SCALE, HIT_ARC_COS, emptyInput,
} from './fighters/types';
import {
    createFighter, integrateMovement, faceToward, forwardVec,
    startPunch, setBlocking, recordPunchConnected, applyHit,
    updateFighter, isHitFrame, resetFighter,
} from './fighters/fighter';
import { getStaleMoveMultiplier } from './combat/punches';
import { detectCombo, getComboHitScale, getHitIndexInCombo } from './combat/combos';
import { getCounterStrikeMultiplier, COUNTER_STRIKE_DISPLAY } from './combat/counterstrike';
import { computeAICommand } from './ai';
import { MatchConfig, spawnPositions } from './config';

const COUNTDOWN_FRAMES = 240;
const ROUND_END_FRAMES = 180;

/** Build the initial authoritative world from a match configuration. */
export function createWorld(config: MatchConfig): WorldState {
    const spawns = spawnPositions(config.seats.length);
    const fighters: Fighter[] = config.seats.map((s, i) =>
        createFighter({
            seat: s.seat,
            className: s.className,
            team: config.mode === 'teams' ? s.team : s.seat,
            isAI: s.kind === 'ai',
            isLocal: s.kind === 'human-local',
            x: spawns[i].x,
            z: spawns[i].z,
            displayName: s.displayName,
        }),
    );

    return {
        fighters,
        mode: config.mode,
        round: 1,
        maxRounds: config.maxRounds,
        roundTime: 60 * 60,
        maxRoundTime: 60 * 60,
        phase: 'countdown',
        phaseFrame: 0,
        countdownValue: 3,
        roundEndTimer: 0,
        roundEndText: '',
        result: null,
        winnerSeat: null,
        events: [],
        frame: 0,
        screenShake: 0,
        aiDifficulty: config.aiDifficulty,
    };
}

const winsNeeded = (maxRounds: number) => Math.ceil(maxRounds / 2);

/** Nearest living opponent (different team) to the given fighter, or null. */
function nearestOpponent(world: WorldState, f: Fighter): Fighter | null {
    let best: Fighter | null = null;
    let bestD = Infinity;
    for (const o of world.fighters) {
        if (o === f || !o.alive || o.team === f.team) continue;
        const d = (o.x - f.x) ** 2 + (o.z - f.z) ** 2;
        if (d < bestD) { bestD = d; best = o; }
    }
    return best;
}

/** Living fighters grouped by team. */
function aliveTeams(world: WorldState): Map<number, Fighter[]> {
    const m = new Map<number, Fighter[]>();
    for (const f of world.fighters) {
        if (!f.alive) continue;
        const arr = m.get(f.team) ?? [];
        arr.push(f);
        m.set(f.team, arr);
    }
    return m;
}

/**
 * Advance the world a single fixed timestep.
 * @param inputs commands for human/remote-controlled seats (keyed by seat).
 *               AI seats are driven internally.
 */
export function stepWorld(world: WorldState, inputs: Map<number, InputCommand>): void {
    world.events = [];
    world.frame++;

    if (world.screenShake > 0) {
        world.screenShake *= 0.85;
        if (world.screenShake < 0.4) world.screenShake = 0;
    }

    if (world.phase === 'countdown') {
        world.phaseFrame++;
        world.countdownValue = Math.max(0, 3 - Math.floor(world.phaseFrame / 60));
        // Keep fighters facing their nearest foe while the bell counts in.
        for (const f of world.fighters) {
            const t = nearestOpponent(world, f);
            if (t) faceToward(f, t.x, t.z);
        }
        if (world.phaseFrame >= COUNTDOWN_FRAMES) {
            world.phase = 'fight';
            world.phaseFrame = 0;
        }
        return;
    }

    if (world.phase === 'roundEnd') {
        world.phaseFrame++;
        world.roundEndTimer--;
        for (const f of world.fighters) updateFighter(f);
        if (world.roundEndTimer <= 0) finishRoundEnd(world);
        return;
    }

    if (world.phase !== 'fight') return;

    runFight(world, inputs);
}

function runFight(world: WorldState, inputs: Map<number, InputCommand>): void {
    world.roundTime--;
    if (world.roundTime <= 0) {
        endRoundByDecision(world);
        return;
    }

    // ── Intent: movement, facing, block, punch ──
    for (const f of world.fighters) {
        if (!f.alive) { updateFighter(f); continue; }

        const target = nearestOpponent(world, f);
        if (target) faceToward(f, target.x, target.z);

        const cmd: InputCommand = f.isAI
            ? computeAICommand(world, f, target)
            : (inputs.get(f.seat) ?? emptyInput());

        integrateMovement(f, cmd);
        setBlocking(f, cmd.block);
        if (cmd.punch && (f.state === 'idle' || f.state === 'walking' || f.state === 'blocking')) {
            startPunch(f, cmd.punch);
        }
    }

    // ── Hit resolution ──
    for (const atk of world.fighters) {
        if (!atk.alive || !isHitFrame(atk)) continue;
        const victim = pickHitTarget(world, atk);
        if (!victim) continue;
        resolveHit(world, atk, victim);
    }

    // ── Separation: keep fighters from stacking ──
    separate(world);

    // ── Advance animation / cooldowns ──
    for (const f of world.fighters) updateFighter(f);

    // ── Round-end checks ──
    checkRoundOver(world);
}

/** Choose the best opponent a punch lands on: closest, in front, in range. */
function pickHitTarget(world: WorldState, atk: Fighter): Fighter | null {
    if (!atk.currentPunch) return null;
    const reach = atk.currentPunch.range * RANGE_SCALE + FIGHTER_RADIUS * 2;
    const fwd = forwardVec(atk);
    let best: Fighter | null = null;
    let bestD = Infinity;
    for (const t of world.fighters) {
        if (t === atk || !t.alive || t.team === atk.team) continue;
        const dx = t.x - atk.x;
        const dz = t.z - atk.z;
        const dist = Math.hypot(dx, dz);
        if (dist > reach || dist < 1e-4) continue;
        const dot = (fwd.x * dx + fwd.z * dz) / dist;
        if (dot < HIT_ARC_COS) continue;
        if (dist < bestD) { bestD = dist; best = t; }
    }
    return best;
}

function resolveHit(world: WorldState, atk: Fighter, victim: Fighter): void {
    recordPunchConnected(atk);
    const now = Date.now();
    const combo = detectCombo(atk.comboHistory, now, atk.className);
    const comboMult = combo ? combo.bonusDamageMultiplier : 1.0;
    const hitIndex = getHitIndexInCombo(atk.comboHistory, now);
    const comboHitScale = getComboHitScale(hitIndex);
    const punchType = atk.currentPunch?.type;
    const staleMult = punchType ? getStaleMoveMultiplier(atk.comboHistory, punchType) : 1.0;
    const counter = getCounterStrikeMultiplier(victim);
    const finalMult = Math.min(2.5, comboMult * comboHitScale * staleMult * counter.multiplier);

    const result = applyHit(victim, atk, finalMult);
    if (result.damage <= 0) return;

    const evY = 1.1;
    if (result.blocked) {
        world.events.push({ kind: 'block', seat: victim.seat, x: victim.x, y: evY, z: victim.z });
        world.screenShake = Math.max(world.screenShake, 2);
        return;
    }

    world.events.push({
        kind: 'hit', seat: atk.seat, targetSeat: victim.seat,
        x: victim.x, y: evY, z: victim.z,
        color: atk.spriteAccentColor, power: result.damage,
    });
    world.screenShake = Math.min(14, Math.max(world.screenShake, result.damage * 0.5));

    if (combo) {
        world.events.push({ kind: 'combo', seat: atk.seat, text: combo.displayName });
        if (victim.state === 'hit') { victim.state = 'stunned'; victim.stateFrame = 0; }
    } else if (counter.isCounterStrike) {
        world.events.push({ kind: 'combo', seat: atk.seat, text: COUNTER_STRIKE_DISPLAY });
    }

    if (result.ko) {
        world.events.push({ kind: 'ko', seat: victim.seat, x: victim.x, z: victim.z });
    }
}

/** Push overlapping fighters apart (only when both can be moved). */
function separate(world: WorldState): void {
    const minDist = FIGHTER_RADIUS * 2;
    const list = world.fighters;
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i], b = list[j];
            if (!a.alive || !b.alive) continue;
            let dx = b.x - a.x;
            let dz = b.z - a.z;
            let dist = Math.hypot(dx, dz);
            if (dist >= minDist) continue;
            if (dist < 1e-4) { dx = 1; dz = 0; dist = 1; }
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist, nz = dz / dist;
            const aImmovable = a.state === 'punching';
            const bImmovable = b.state === 'punching';
            const aShare = bImmovable ? 1 : aImmovable ? 0 : 0.5;
            const bShare = aImmovable ? 1 : bImmovable ? 0 : 0.5;
            a.x -= nx * overlap * 2 * aShare;
            a.z -= nz * overlap * 2 * aShare;
            b.x += nx * overlap * 2 * bShare;
            b.z += nz * overlap * 2 * bShare;
        }
    }
}

function checkRoundOver(world: WorldState): void {
    const teams = aliveTeams(world);
    if (teams.size <= 1) {
        const winnerTeam = teams.size === 1 ? [...teams.keys()][0] : null;
        const survivors = winnerTeam !== null ? (teams.get(winnerTeam) ?? []) : [];
        creditRound(world, winnerTeam, survivors, 'K.O.');
    }
}

function endRoundByDecision(world: WorldState): void {
    // Highest team health wins on time-out.
    const totals = new Map<number, number>();
    for (const f of world.fighters) {
        totals.set(f.team, (totals.get(f.team) ?? 0) + Math.max(0, f.health));
    }
    let winnerTeam: number | null = null;
    let bestHp = -1;
    let tie = false;
    for (const [team, hp] of totals) {
        if (hp > bestHp) { bestHp = hp; winnerTeam = team; tie = false; }
        else if (hp === bestHp) tie = true;
    }
    if (tie) winnerTeam = null;
    const survivors = winnerTeam !== null
        ? world.fighters.filter(f => f.team === winnerTeam && f.alive)
        : [];
    creditRound(world, winnerTeam, survivors, winnerTeam === null ? 'DRAW' : 'DECISION');
}

function creditRound(world: WorldState, winnerTeam: number | null, survivors: Fighter[], label: string): void {
    if (winnerTeam === null) {
        world.roundEndText = 'DRAW';
        world.winnerSeat = null;
        world.result = 'decision';
    } else {
        for (const f of world.fighters) {
            if (f.team === winnerTeam) f.roundWins++;
        }
        const champ = survivors[0] ?? world.fighters.find(f => f.team === winnerTeam) ?? null;
        world.winnerSeat = world.mode === 'teams' ? winnerTeam : (champ ? champ.seat : null);
        world.result = label === 'K.O.' ? 'ko' : 'decision';
        world.roundEndText = label === 'K.O.'
            ? 'K.O.'
            : champ ? `${champ.displayName} WINS` : 'DECISION';
    }
    world.phase = 'roundEnd';
    world.phaseFrame = 0;
    world.roundEndTimer = ROUND_END_FRAMES;
}

function finishRoundEnd(world: WorldState): void {
    const need = winsNeeded(world.maxRounds);
    const champ = [...world.fighters].sort((a, b) => b.roundWins - a.roundWins)[0];
    const matchOver = (champ && champ.roundWins >= need) || world.round >= world.maxRounds;

    if (matchOver) {
        // Final winner = top round wins (team id in teams mode).
        const top = [...world.fighters].sort((a, b) => b.roundWins - a.roundWins)[0];
        world.winnerSeat = world.mode === 'teams' ? top.team : top.seat;
        world.result = world.result === 'ko' ? 'ko' : 'decision';
        world.phase = 'result';
        return;
    }

    // Next round.
    world.round++;
    world.roundTime = world.maxRoundTime;
    const spawns = spawnPositions(world.fighters.length);
    world.fighters.forEach((f, i) => resetFighter(f, spawns[i].x, spawns[i].z));
    world.phase = 'countdown';
    world.phaseFrame = 0;
    world.countdownValue = 3;
    world.result = null;
}
