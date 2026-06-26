// ============================================================
// Wire Protocol — compact, quantized snapshots & input
//
// The legacy netcode shipped the entire nested GameState object at
// 60 Hz. This replaces it with:
//   • guest → host : a 4-number input command, sent only on change
//   • host  → guest : a flat, quantized snapshot at ~20 Hz, with
//                     per-fighter rows of small integers
// Guests interpolate between snapshots, so 20 Hz still renders at 60 fps.
// ============================================================

import type {
    WorldState, Fighter, InputCommand, GameEvent, GamePhase, PunchType, FightResult,
} from '@/lib/kowloon-knockout/game/fighters/types';

const PUNCH_ORDER: PunchType[] = ['jab', 'cross', 'hook', 'uppercut'];
const STATE_ORDER = ['idle', 'walking', 'punching', 'blocking', 'hit', 'stunned', 'knockedOut'] as const;
const PHASE_ORDER: GamePhase[] = ['countdown', 'fight', 'roundEnd', 'result'];

const POS_Q = 100;   // position quantization (1cm)
const ANG_Q = 1000;  // yaw quantization

const r = Math.round;

// ── Input ────────────────────────────────────────────────────────────
export type WireInput = [mx: number, mz: number, block: number, punch: number];

export function encodeInput(cmd: InputCommand): WireInput {
    return [
        r(cmd.moveX * 100),
        r(cmd.moveZ * 100),
        cmd.block ? 1 : 0,
        cmd.punch ? PUNCH_ORDER.indexOf(cmd.punch) + 1 : 0,
    ];
}

export function decodeInput(w: WireInput): InputCommand {
    return {
        moveX: w[0] / 100,
        moveZ: w[1] / 100,
        block: w[2] === 1,
        punch: w[3] > 0 ? PUNCH_ORDER[w[3] - 1] : null,
    };
}

/** True if two wire inputs differ in their held state (move/block). */
export function heldChanged(a: WireInput, b: WireInput): boolean {
    return a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2];
}

// ── Snapshot ─────────────────────────────────────────────────────────
// Per-fighter row: [seat, qx, qz, qyaw, state, hp, stam, alive, punch, punchFrame, stateFrame, hitFlash]
export type FighterRow = number[];
export type WireEvent = (string | number)[];

export interface Snapshot {
    f: number;             // host frame
    ph: number;            // phase index
    cd: number;            // countdown value
    rt: number;            // round time (frames)
    rd: number;            // round
    sh: number;            // screen shake (x10)
    ws: number | null;     // winner seat / team
    ret: string;           // round-end text
    fs: FighterRow[];
    ev: WireEvent[];
}

export function encodeSnapshot(world: WorldState, events: GameEvent[]): Snapshot {
    return {
        f: world.frame,
        ph: Math.max(0, PHASE_ORDER.indexOf(world.phase)),
        cd: world.countdownValue,
        rt: world.roundTime,
        rd: world.round,
        sh: r(world.screenShake * 10),
        ws: world.winnerSeat,
        ret: world.roundEndText,
        fs: world.fighters.map((fi: Fighter) => [
            fi.seat,
            r(fi.x * POS_Q),
            r(fi.z * POS_Q),
            r(fi.yaw * ANG_Q),
            STATE_ORDER.indexOf(fi.state),
            r(fi.health),
            r(fi.stamina),
            fi.alive ? 1 : 0,
            fi.currentPunch ? PUNCH_ORDER.indexOf(fi.currentPunch.type) + 1 : 0,
            fi.punchFrame,
            fi.stateFrame,
            fi.hitFlash,
            fi.roundWins,
        ]),
        ev: events.map(encodeEvent),
    };
}

function encodeEvent(e: GameEvent): WireEvent {
    switch (e.kind) {
        case 'hit': return ['h', e.seat, e.targetSeat, r(e.x * POS_Q), r(e.y * POS_Q), r(e.z * POS_Q), e.color, r(e.power)];
        case 'block': return ['b', e.seat, r(e.x * POS_Q), r(e.y * POS_Q), r(e.z * POS_Q)];
        case 'ko': return ['k', e.seat, r(e.x * POS_Q), r(e.z * POS_Q)];
        case 'combo': return ['c', e.seat, e.text];
    }
}

export interface NetFighter {
    seat: number;
    x: number;
    z: number;
    yaw: number;
    state: typeof STATE_ORDER[number];
    health: number;
    stamina: number;
    alive: boolean;
    punch: PunchType | null;
    punchFrame: number;
    stateFrame: number;
    hitFlash: number;
    roundWins: number;
}

export interface DecodedSnapshot {
    frame: number;
    phase: GamePhase;
    countdownValue: number;
    roundTime: number;
    round: number;
    screenShake: number;
    winnerSeat: number | null;
    roundEndText: string;
    result: FightResult;
    fighters: NetFighter[];
    events: GameEvent[];
}

export function decodeSnapshot(s: Snapshot): DecodedSnapshot {
    return {
        frame: s.f,
        phase: PHASE_ORDER[s.ph] ?? 'fight',
        countdownValue: s.cd,
        roundTime: s.rt,
        round: s.rd,
        screenShake: s.sh / 10,
        winnerSeat: s.ws,
        roundEndText: s.ret,
        result: (s.ph === 3 ? (s.ret === 'K.O.' ? 'ko' : 'decision') : null) as FightResult,
        fighters: s.fs.map((row) => ({
            seat: row[0],
            x: row[1] / POS_Q,
            z: row[2] / POS_Q,
            yaw: row[3] / ANG_Q,
            state: STATE_ORDER[row[4]] ?? 'idle',
            health: row[5],
            stamina: row[6],
            alive: row[7] === 1,
            punch: row[8] > 0 ? PUNCH_ORDER[row[8] - 1] : null,
            punchFrame: row[9],
            stateFrame: row[10],
            hitFlash: row[11],
            roundWins: row[12] ?? 0,
        })),
        events: s.ev.map(decodeEvent).filter(Boolean) as GameEvent[],
    };
}

function decodeEvent(w: WireEvent): GameEvent | null {
    switch (w[0]) {
        case 'h': return { kind: 'hit', seat: w[1] as number, targetSeat: w[2] as number, x: (w[3] as number) / POS_Q, y: (w[4] as number) / POS_Q, z: (w[5] as number) / POS_Q, color: w[6] as string, power: w[7] as number };
        case 'b': return { kind: 'block', seat: w[1] as number, x: (w[2] as number) / POS_Q, y: (w[3] as number) / POS_Q, z: (w[4] as number) / POS_Q };
        case 'k': return { kind: 'ko', seat: w[1] as number, x: (w[2] as number) / POS_Q, z: (w[3] as number) / POS_Q };
        case 'c': return { kind: 'combo', seat: w[1] as number, text: w[2] as string };
        default: return null;
    }
}
