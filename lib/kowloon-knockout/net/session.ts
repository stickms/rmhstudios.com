// ============================================================
// Game Session — unifies local / host / guest play behind one
// render-facing interface consumed by the R3F scene and HUD.
//
//   • LocalSession  : single-player, full authority, no network.
//   • HostSession   : authority + applies remote inputs + broadcasts
//                     ~20 Hz snapshots.
//   • GuestSession  : no sim; interpolates snapshots + predicts the
//                     local fighter's movement for responsiveness.
// ============================================================

import {
    WorldState, InputCommand, GameEvent, GamePhase, FightResult, PunchType,
    FighterClass, MatchMode, ARENA_RADIUS, FIGHTER_RADIUS, MOVE_SPEED_SCALE,
} from '@/lib/kowloon-knockout/game/fighters/types';
import { CLASS_DISPLAY, CLASS_STATS } from '@/lib/kowloon-knockout/game/fighters/stats';
import { createWorld, stepWorld } from '@/lib/kowloon-knockout/game/world';
import type { MatchConfig } from '@/lib/kowloon-knockout/game/config';
import { LocalInputSource } from '@/lib/kowloon-knockout/game/input';
import { actionProgress } from '@/lib/kowloon-knockout/game/combat/actionProgress';
import { networkClient, type ServerMessage, type MatchSeat } from './client';
import {
    encodeSnapshot, decodeSnapshot, encodeInput, decodeInput, heldChanged,
    type DecodedSnapshot, type WireInput,
} from './protocol';

const STEP_MS = 1000 / 60;
const INTERP_DELAY_MS = 100;
const SNAPSHOT_EVERY = 3;          // host broadcasts every 3 sim frames (~20 Hz)
const INPUT_KEEPALIVE_MS = 200;

export interface RenderFighter {
    seat: number;
    team: number;
    className: FighterClass;
    displayName: string;
    color: string;
    accent: string;
    isLocal: boolean;
    x: number; z: number; yaw: number;
    state: string;
    punch: PunchType | null;
    punchFrame: number;
    stateFrame: number;
    actionProgress: number;
    hitFlash: number;
    health: number; maxHealth: number;
    stamina: number; maxStamina: number;
    alive: boolean;
}

export interface HudFighter {
    seat: number; team: number; name: string; color: string;
    health: number; maxHealth: number; stamina: number; maxStamina: number;
    alive: boolean; roundWins: number; isLocal: boolean;
}

export interface HudState {
    phase: GamePhase;
    countdownValue: number;
    roundTime: number;
    round: number;
    roundEndText: string;
    result: FightResult;
    winnerSeat: number | null;
    mode: MatchMode;
    screenShake: number;
    comboText: string;
    comboColor: string;
    fighters: HudFighter[];
}

interface SeatInfo {
    seat: number; team: number; className: FighterClass; name: string;
    color: string; accent: string; maxHealth: number; maxStamina: number;
    moveSpeed: number; isLocal: boolean;
}

export interface GameSession {
    readonly localSeat: number;
    start(): void;
    stop(): void;
    setInputSource(src: LocalInputSource): void;
    getRenderFighters(): RenderFighter[];
    getHud(): HudState;
    drainFx(): GameEvent[];
    onResult(cb: (winnerSeat: number | null) => void): void;
}

function buildSeatInfo(seat: number, className: FighterClass, team: number, name: string, isLocal: boolean): SeatInfo {
    const d = CLASS_DISPLAY[className];
    const s = CLASS_STATS[className];
    return {
        seat, team, className, name, isLocal,
        color: d.color, accent: d.accent,
        maxHealth: s.maxHealth, maxStamina: s.stamina, moveSpeed: s.moveSpeed,
    };
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function lerpAngle(a: number, b: number, t: number): number {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

// ── Shared FX / combo ingestion ───────────────────────────────────────
class FxState {
    fxQueue: GameEvent[] = [];
    comboText = '';
    comboColor = '#ffcc00';
    comboTimer = 0;

    ingest(events: GameEvent[], seatColor: (seat: number) => string): void {
        for (const e of events) {
            if (e.kind === 'combo') {
                this.comboText = e.text;
                this.comboColor = seatColor(e.seat);
                this.comboTimer = 90;
            } else {
                this.fxQueue.push(e);
            }
        }
    }
    tickCombo(dtFrames: number): void {
        if (this.comboTimer > 0) {
            this.comboTimer -= dtFrames;
            if (this.comboTimer <= 0) this.comboText = '';
        }
    }
    drain(): GameEvent[] { const q = this.fxQueue; this.fxQueue = []; return q; }
}

// ── Authoritative session (local single-player & multiplayer host) ─────
class SimSession implements GameSession {
    readonly localSeat: number;
    private world: WorldState;
    private seats = new Map<number, SeatInfo>();
    private input: LocalInputSource | null = null;
    private fx = new FxState();
    private raf = 0;
    private last = 0;
    private acc = 0;
    private resultCb: ((w: number | null) => void) | null = null;
    private resultFired = false;

    // Host-only networking
    private isHost: boolean;
    private remote = new Map<number, { moveX: number; moveZ: number; block: boolean; pendingPunch: PunchType | null }>();
    private broadcastBuf: GameEvent[] = [];
    private broadcastCounter = 0;
    private onInput = (msg: ServerMessage) => {
        if (msg.type !== 'input') return;
        const cmd = decodeInput(msg.input);
        let r = this.remote.get(msg.seat);
        if (!r) { r = { moveX: 0, moveZ: 0, block: false, pendingPunch: null }; this.remote.set(msg.seat, r); }
        r.moveX = cmd.moveX; r.moveZ = cmd.moveZ; r.block = cmd.block;
        if (cmd.punch) r.pendingPunch = cmd.punch;
    };

    constructor(config: MatchConfig, isHost: boolean) {
        this.world = createWorld(config);
        this.isHost = isHost;
        for (const s of config.seats) {
            this.seats.set(s.seat, buildSeatInfo(s.seat, s.className, this.world.fighters.find(f => f.seat === s.seat)!.team, s.displayName, s.kind === 'human-local'));
        }
        this.localSeat = config.seats.find(s => s.kind === 'human-local')?.seat ?? 0;
    }

    setInputSource(src: LocalInputSource): void { this.input = src; }
    onResult(cb: (w: number | null) => void): void { this.resultCb = cb; }

    start(): void {
        if (this.isHost) networkClient.on('input', this.onInput);
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.loop);
    }
    stop(): void {
        cancelAnimationFrame(this.raf);
        if (this.isHost) networkClient.off('input', this.onInput);
    }

    private loop = (now: number): void => {
        let dt = now - this.last;
        this.last = now;
        if (dt > 100) dt = 100;
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP_MS && steps < 5) {
            this.step();
            this.acc -= STEP_MS;
            steps++;
        }
        this.fx.tickCombo((dt / STEP_MS));
        this.raf = requestAnimationFrame(this.loop);
    };

    private step(): void {
        const inputs = new Map<number, InputCommand>();
        const localFighter = this.world.fighters.find(f => f.seat === this.localSeat);
        if (this.input && localFighter) {
            inputs.set(this.localSeat, this.input.consume());
        }
        if (this.isHost) {
            for (const [seat, r] of this.remote) {
                inputs.set(seat, { moveX: r.moveX, moveZ: r.moveZ, block: r.block, punch: r.pendingPunch });
                r.pendingPunch = null;
            }
        }

        stepWorld(this.world, inputs);

        if (this.world.events.length) {
            this.fx.ingest(this.world.events, (seat) => this.seats.get(seat)?.accent ?? '#ffcc00');
            if (this.isHost) this.broadcastBuf.push(...this.world.events);
        }

        if (this.isHost) {
            this.broadcastCounter++;
            if (this.broadcastCounter >= SNAPSHOT_EVERY) {
                networkClient.sendSnapshot(encodeSnapshot(this.world, this.broadcastBuf));
                this.broadcastBuf = [];
                this.broadcastCounter = 0;
            }
        }

        if (this.world.phase === 'result' && !this.resultFired) {
            this.resultFired = true;
            // Send a final snapshot so guests see the result immediately.
            if (this.isHost) networkClient.sendSnapshot(encodeSnapshot(this.world, this.broadcastBuf));
            this.resultCb?.(this.world.winnerSeat);
        }
    }

    getRenderFighters(): RenderFighter[] {
        return this.world.fighters.map((f) => {
            const info = this.seats.get(f.seat)!;
            const state = f.state;
            const punch = f.currentPunch?.type ?? null;
            const punchFrame = f.punchFrame;
            const stateFrame = f.stateFrame;
            return {
                seat: f.seat, team: f.team, className: f.className, displayName: f.displayName,
                color: info.color, accent: info.accent, isLocal: f.seat === this.localSeat,
                x: f.x, z: f.z, yaw: f.yaw,
                state, punch,
                punchFrame, stateFrame, actionProgress: actionProgress({ state, punch, punchFrame, stateFrame }), hitFlash: f.hitFlash,
                health: f.health, maxHealth: f.stats.maxHealth,
                stamina: f.stamina, maxStamina: f.stats.stamina, alive: f.alive,
            };
        });
    }

    getHud(): HudState {
        const w = this.world;
        return {
            phase: w.phase, countdownValue: w.countdownValue, roundTime: w.roundTime,
            round: w.round, roundEndText: w.roundEndText, result: w.result,
            winnerSeat: w.winnerSeat, mode: w.mode, screenShake: w.screenShake,
            comboText: this.fx.comboText, comboColor: this.fx.comboColor,
            fighters: w.fighters.map((f) => ({
                seat: f.seat, team: f.team, name: f.displayName, color: this.seats.get(f.seat)!.color,
                health: f.health, maxHealth: f.stats.maxHealth, stamina: f.stamina, maxStamina: f.stats.stamina,
                alive: f.alive, roundWins: f.roundWins, isLocal: f.seat === this.localSeat,
            })),
        };
    }

    drainFx(): GameEvent[] { return this.fx.drain(); }
}

// ── Guest session (render-only, interpolated) ─────────────────────────
interface TimedSnap { t: number; snap: DecodedSnapshot; }

class GuestSession implements GameSession {
    readonly localSeat: number;
    private seats = new Map<number, SeatInfo>();
    private input: LocalInputSource | null = null;
    private fx = new FxState();
    private raf = 0;
    private buffer: TimedSnap[] = [];
    private latest: DecodedSnapshot | null = null;
    private mode: MatchMode;
    private resultCb: ((w: number | null) => void) | null = null;
    private resultFired = false;

    // Local prediction
    private predX = 0;
    private predZ = 0;
    private predReady = false;
    private localSpeed: number;

    // Input send throttling
    private lastWire: WireInput = [0, 0, 0, 0];
    private lastSent = 0;
    private lastFrameTime = 0;

    private onSnapshot = (msg: ServerMessage) => {
        if (msg.type !== 'snapshot') return;
        const decoded = decodeSnapshot(msg.data);
        // Drop out-of-order frames.
        if (this.latest && decoded.frame < this.latest.frame) return;
        this.latest = decoded;
        this.buffer.push({ t: performance.now(), snap: decoded });
        if (this.buffer.length > 16) this.buffer.shift();
        this.fx.ingest(decoded.events, (seat) => this.seats.get(seat)?.accent ?? '#ffcc00');

        // Reconcile local prediction.
        const lf = decoded.fighters.find(f => f.seat === this.localSeat);
        if (lf) {
            if (!this.predReady) { this.predX = lf.x; this.predZ = lf.z; this.predReady = true; }
            const err = Math.hypot(this.predX - lf.x, this.predZ - lf.z);
            if (err > 2 || !this.localMovable(lf.state)) { this.predX = lf.x; this.predZ = lf.z; }
            else { this.predX = lerp(this.predX, lf.x, 0.25); this.predZ = lerp(this.predZ, lf.z, 0.25); }
        }

        if (decoded.phase === 'result' && !this.resultFired) {
            this.resultFired = true;
            this.resultCb?.(decoded.winnerSeat);
        }
    };

    constructor(seats: MatchSeat[], localSeat: number, mode: MatchMode) {
        this.localSeat = localSeat;
        this.mode = mode;
        for (const s of seats) {
            this.seats.set(s.seat, buildSeatInfo(s.seat, s.className, s.team, s.name, s.seat === localSeat));
        }
        this.localSpeed = (this.seats.get(localSeat)?.moveSpeed ?? 2) * MOVE_SPEED_SCALE;
    }

    setInputSource(src: LocalInputSource): void { this.input = src; }
    onResult(cb: (w: number | null) => void): void { this.resultCb = cb; }

    start(): void {
        networkClient.on('snapshot', this.onSnapshot);
        this.lastFrameTime = performance.now();
        this.raf = requestAnimationFrame(this.loop);
    }
    stop(): void {
        cancelAnimationFrame(this.raf);
        networkClient.off('snapshot', this.onSnapshot);
    }

    private localMovable(state: string): boolean {
        return state === 'idle' || state === 'walking' || state === 'blocking';
    }

    private loop = (now: number): void => {
        const dt = Math.min(100, now - this.lastFrameTime);
        this.lastFrameTime = now;

        if (this.input) {
            const cmd = this.input.consume();
            this.sendInput(cmd, now);
            this.predictLocal(cmd, dt);
        }
        this.fx.tickCombo(dt / STEP_MS);
        this.raf = requestAnimationFrame(this.loop);
    };

    private sendInput(cmd: InputCommand, now: number): void {
        const wire = encodeInput(cmd);
        const punch = wire[3] > 0;
        if (punch || heldChanged(wire, this.lastWire) || now - this.lastSent > INPUT_KEEPALIVE_MS) {
            networkClient.sendInput(wire);
            this.lastWire = wire;
            this.lastSent = now;
        }
    }

    private predictLocal(cmd: InputCommand, dt: number): void {
        const lf = this.latest?.fighters.find(f => f.seat === this.localSeat);
        if (!lf || !this.predReady || !lf.alive || !this.localMovable(lf.state)) {
            if (lf) { this.predX = lf.x; this.predZ = lf.z; }
            return;
        }
        let mx = cmd.moveX, mz = cmd.moveZ;
        const mag = Math.hypot(mx, mz);
        if (mag > 1) { mx /= mag; mz /= mag; }
        const step = this.localSpeed * (dt / STEP_MS) * (lf.state === 'blocking' ? 0.4 : 1);
        let nx = this.predX + mx * step;
        let nz = this.predZ + mz * step;
        const rr = Math.hypot(nx, nz);
        const max = ARENA_RADIUS - FIGHTER_RADIUS;
        if (rr > max && rr > 0) { nx = nx / rr * max; nz = nz / rr * max; }
        this.predX = nx; this.predZ = nz;
    }

    private interpolatedPos(seat: number): { x: number; z: number; yaw: number } | null {
        const renderT = performance.now() - INTERP_DELAY_MS;
        const buf = this.buffer;
        if (buf.length === 0) return null;
        if (buf.length === 1) {
            const f = buf[0].snap.fighters.find(x => x.seat === seat);
            return f ? { x: f.x, z: f.z, yaw: f.yaw } : null;
        }
        let older = buf[0], newer = buf[buf.length - 1];
        for (let i = 0; i < buf.length - 1; i++) {
            if (buf[i].t <= renderT && buf[i + 1].t >= renderT) { older = buf[i]; newer = buf[i + 1]; break; }
        }
        const span = newer.t - older.t || 1;
        const t = Math.max(0, Math.min(1, (renderT - older.t) / span));
        const a = older.snap.fighters.find(x => x.seat === seat);
        const b = newer.snap.fighters.find(x => x.seat === seat);
        if (!a || !b) return (b ?? a) ? { x: (b ?? a)!.x, z: (b ?? a)!.z, yaw: (b ?? a)!.yaw } : null;
        return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), yaw: lerpAngle(a.yaw, b.yaw, t) };
    }

    getRenderFighters(): RenderFighter[] {
        if (!this.latest) return [];
        return this.latest.fighters.map((nf) => {
            const info = this.seats.get(nf.seat)!;
            const interp = this.interpolatedPos(nf.seat);
            let x = interp?.x ?? nf.x;
            let z = interp?.z ?? nf.z;
            const yaw = interp?.yaw ?? nf.yaw;
            if (nf.seat === this.localSeat && this.predReady && nf.alive && this.localMovable(nf.state)) {
                x = this.predX; z = this.predZ;
            }
            const state = nf.state;
            const punch = nf.punch;
            const punchFrame = nf.punchFrame;
            const stateFrame = nf.stateFrame;
            return {
                seat: nf.seat, team: info.team, className: info.className, displayName: info.name,
                color: info.color, accent: info.accent, isLocal: nf.seat === this.localSeat,
                x, z, yaw, state, punch,
                punchFrame, stateFrame, actionProgress: actionProgress({ state, punch, punchFrame, stateFrame }), hitFlash: nf.hitFlash,
                health: nf.health, maxHealth: info.maxHealth,
                stamina: nf.stamina, maxStamina: info.maxStamina, alive: nf.alive,
            };
        });
    }

    getHud(): HudState {
        const s = this.latest;
        const fighters: HudFighter[] = s
            ? s.fighters.map((nf) => {
                const info = this.seats.get(nf.seat)!;
                return {
                    seat: nf.seat, team: info.team, name: info.name, color: info.color,
                    health: nf.health, maxHealth: info.maxHealth, stamina: nf.stamina, maxStamina: info.maxStamina,
                    alive: nf.alive, roundWins: nf.roundWins, isLocal: nf.seat === this.localSeat,
                };
            })
            : [];
        return {
            phase: s?.phase ?? 'countdown',
            countdownValue: s?.countdownValue ?? 3,
            roundTime: s?.roundTime ?? 3600,
            round: s?.round ?? 1,
            roundEndText: s?.roundEndText ?? '',
            result: s?.result ?? null,
            winnerSeat: s?.winnerSeat ?? null,
            mode: this.mode,
            screenShake: s?.screenShake ?? 0,
            comboText: this.fx.comboText, comboColor: this.fx.comboColor,
            fighters,
        };
    }

    drainFx(): GameEvent[] { return this.fx.drain(); }
}

// ── Factory ───────────────────────────────────────────────────────────
export function createLocalSession(config: MatchConfig): GameSession {
    return new SimSession(config, false);
}
export function createHostSession(config: MatchConfig): GameSession {
    return new SimSession(config, true);
}
export function createGuestSession(seats: MatchSeat[], localSeat: number, mode: MatchMode): GameSession {
    return new GuestSession(seats, localSeat, mode);
}
