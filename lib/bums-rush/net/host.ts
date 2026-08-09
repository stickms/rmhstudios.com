/**
 * Bum's Rush — the authoritative loop (§9.1, §9.5, §9.8).
 *
 * One client in every room runs this. It owns the only simulation that exists;
 * everyone else, including the hub, is downstream of it. What lives here is
 * strictly the NETWORK half of being the host — stepping on a fixed clock,
 * folding in remote input, deciding when a snapshot goes out, and sealing the
 * result. The physics lives behind the {@link Simulation} interface and this
 * module never learns it is matter-js, which is what lets the host loop be
 * tested against a fake in twenty lines.
 *
 * It also does not own a rAF loop. `tick(now)` is called by whoever owns the
 * frame — the renderer — so there is exactly one animation loop in the game
 * and this module stays SSR-safe and testable with a fake clock.
 *
 * The host has a latency advantage and could cheat (§9.1). That is bounded by
 * §9.8's plausibility checks and by Showdown being explicitly not
 * wager-eligible (§8.4), not by anything in this file. Nothing the host
 * computes can authenticate the host.
 */

import { NET, PHYSICS } from '../constants';
import {
  SnapshotFlag,
  type GameEvent,
  type InputFrame,
  type LevelResult,
  type PropKind,
  type SeatIndex,
  type ShowdownResult,
  type Simulation,
  type Snapshot,
  type SnapshotSeat,
} from '../types';
import { InputDeduper, decodeInputPacket } from './input';
import {
  RELAYED_EVENT_KINDS,
  sealResult,
  type BrEventMsg,
  type RelayedEventKind,
  type ResultEnvelope,
} from './protocol';
import { SnapshotEncoder } from './snapshot';

/** How the host reaches the rest of the room. Injected, so tests need no socket. */
export interface HostTransport {
  sendSnapshot(buffer: ArrayBuffer): void;
  sendEvent(message: BrEventMsg): void;
  sendResult(envelope: ResultEnvelope): void;
}

export interface HostLoopOptions {
  sim: Simulation;
  transport: HostTransport;
  /** The room code the result is bound to. */
  roomId: string;
  hostClientId: string;
  /** Injectable for tests; defaults to `Math.random`. */
  random?: () => number;
}

/**
 * An engine that can hold a character still.
 *
 * §9.6 wants a dropped player's characters to become statues rather than
 * ragdolls, "so they cannot be the reason everyone dies". The {@link Simulation}
 * contract in `types.ts` has no such call, so this optional extension is how
 * the host asks for one: if the engine grows `freezeSeat`, freezing becomes
 * real physics; until then it is input suppression plus a `frozen` state on the
 * wire, and the renderer draws the paperweight.
 */
interface FreezableSimulation extends Simulation {
  freezeSeat?(seat: SeatIndex, frozen: boolean): void;
}

const STEP_MS = PHYSICS.FIXED_DT_MS;
const SNAPSHOT_INTERVAL_MS = 1000 / NET.SNAPSHOT_HZ;

/** §9.5: rewind for a lag-compensated grab is bounded to 250 ms of frames. */
const MAX_REWIND_FRAMES = Math.ceil(NET.LAGCOMP_MAX_MS / STEP_MS);

/**
 * The `br:event` budget the hub enforces (300 per 60 s, §9.3).
 *
 * Tracked here as well as there because the hub's response to exceeding it is
 * to drop the message, and the message it drops is whichever arrived last —
 * which on a bad level is the `finish` event. Spending our own budget knowingly
 * means the events that matter are the ones that survive.
 */
const EVENT_BUDGET = 300;
const EVENT_BUDGET_WINDOW_MS = 60_000;

/**
 * When the budget runs low, these are kept and everything else is dropped.
 * Losing a `signal` costs a door animation; losing a `finish` costs the run.
 */
const CRITICAL_EVENT_KINDS = new Set<RelayedEventKind>([
  'finish',
  'objective',
  'checkpoint',
  'death',
  'respawn',
]);

const RELAYED = new Set<string>(RELAYED_EVENT_KINDS);

export class HostLoop {
  private readonly sim: FreezableSimulation;
  private readonly transport: HostTransport;
  private readonly encoder = new SnapshotEncoder();
  private readonly deduper = new InputDeduper();
  private readonly random: () => number;

  /** Inputs accepted since the last step, in arrival order. */
  private pending: InputFrame[] = [];
  /** Last analog grip per seat/hand, for rising-edge detection. */
  private readonly lastGrip = new Map<string, number>();
  private readonly frozenSeats = new Set<SeatIndex>();

  private accumulatorMs = 0;
  private snapshotAccumulatorMs = 0;
  private lastTickAt: number | null = null;
  private paused = false;
  private running = false;
  private finished = false;

  private eventTokens = EVENT_BUDGET;
  private eventWindowAt = 0;

  constructor(private readonly options: HostLoopOptions) {
    this.sim = options.sim as FreezableSimulation;
    this.transport = options.transport;
    this.random = options.random ?? Math.random;
  }

  get frame(): number {
    return this.sim.frame;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  start(now: number): void {
    this.running = true;
    this.lastTickAt = now;
    this.eventWindowAt = now;
    // A fresh host is a room that has just migrated or just started; either way
    // the first thing every guest needs is a whole world, not a delta.
    this.encoder.requestKeyframe();
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Campaign pause is room-wide (§9.6): this is a couch game and that is the
   * couch behaviour. A guest's pause opens their own menu and never calls this.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** A guest joined mid-level — sketch them in with a whole world (§9.7). */
  requestKeyframe(): void {
    this.encoder.requestKeyframe();
  }

  /** Local seats (this browser's pads) feed the same path as remote ones. */
  submitLocalInput(frame: InputFrame): void {
    this.acceptInput(frame);
  }

  /**
   * A `br:input` packet from a guest.
   *
   * `ownedSeats` is what the HUB says this client owns — the client's own claim
   * inside the packet is never trusted, because the hub is the only party that
   * knows who holds which seat.
   */
  ingestRemoteInput(buffer: ArrayBuffer, ownedSeats: readonly SeatIndex[]): number {
    let accepted = 0;
    let frames: InputFrame[];
    try {
      frames = decodeInputPacket(buffer);
    } catch {
      return 0;
    }
    const owned = new Set(ownedSeats);
    for (const frame of frames) {
      if (!owned.has(frame.seat)) continue;
      if (this.acceptInput(frame)) accepted++;
    }
    return accepted;
  }

  /**
   * Freeze/thaw a seat whose owner dropped (§9.6).
   *
   * Suppresses their input immediately — limp arms, no flailing — and marks the
   * seat `frozen` on the wire so every renderer draws the paperweight statue.
   */
  setSeatFrozen(seat: SeatIndex, frozen: boolean): void {
    if (frozen) this.frozenSeats.add(seat);
    else this.frozenSeats.delete(seat);
    this.sim.freezeSeat?.(seat, frozen);
    if (frozen) this.deduper.forget(seat);
  }

  /**
   * Advance the world to `now` and ship whatever that produced.
   *
   * The accumulator is clamped to {@link PHYSICS.MAX_SUBSTEPS}: a backgrounded
   * tab returns with seconds of debt, and paying it in one frame is a spiral
   * that ends with the host dropping the room.
   */
  tick(now: number): void {
    if (!this.running) return;
    if (this.lastTickAt === null) this.lastTickAt = now;

    const elapsed = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;

    if (this.paused) {
      // Still emit at the snapshot cadence while paused, so a guest that joined
      // during a pause sees the world and the PAUSED note rather than nothing.
      this.snapshotAccumulatorMs += elapsed;
      if (this.snapshotAccumulatorMs >= SNAPSHOT_INTERVAL_MS) {
        this.snapshotAccumulatorMs = 0;
        this.emitSnapshot();
      }
      return;
    }

    this.accumulatorMs = Math.min(
      this.accumulatorMs + elapsed,
      STEP_MS * PHYSICS.MAX_SUBSTEPS,
    );

    while (this.accumulatorMs >= STEP_MS) {
      this.accumulatorMs -= STEP_MS;
      this.step();
    }

    this.snapshotAccumulatorMs += elapsed;
    if (this.snapshotAccumulatorMs >= SNAPSHOT_INTERVAL_MS) {
      // Subtract rather than zero, so a slow frame does not permanently shift
      // the snapshot phase and halve the effective rate.
      this.snapshotAccumulatorMs -= SNAPSHOT_INTERVAL_MS;
      if (this.snapshotAccumulatorMs > SNAPSHOT_INTERVAL_MS) this.snapshotAccumulatorMs = 0;
      this.emitSnapshot();
    }

    this.drainEvents(now);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private acceptInput(frame: InputFrame): boolean {
    if (this.frozenSeats.has(frame.seat)) return false;
    if (!this.deduper.accept(frame)) return false;
    this.resolveLagCompensatedGrabs(frame);
    this.pending.push(frame);
    return true;
  }

  /**
   * §9.5.2 — the technique that decides whether online play is any good.
   *
   * A rising grip edge is resolved against the world as it was at the frame the
   * guest was looking at, clamped to 250 ms of rewind. You grab what you saw.
   * Past the clamp the grab resolves against the present and may simply miss,
   * which is the honest outcome: a player 400 ms behind cannot be allowed to
   * grab a crate that is no longer there.
   */
  private resolveLagCompensatedGrabs(frame: InputFrame): void {
    const floor = PHYSICS.TRIGGER_GRIP_FLOOR;
    const oldest = this.sim.frame - MAX_REWIND_FRAMES;
    const target = Math.max(oldest, Math.min(frame.frame, this.sim.frame));

    for (const hand of ['l', 'r'] as const) {
      const key = `${frame.seat}${hand}`;
      const grip = hand === 'l' ? frame.gripL : frame.gripR;
      const previous = this.lastGrip.get(key) ?? 0;
      this.lastGrip.set(key, grip);
      if (previous < floor && grip >= floor) {
        this.sim.resolveGrabAt(frame.seat, hand, target);
      }
    }
  }

  private step(): void {
    const inputs = this.pending;
    this.pending = [];
    this.sim.step(inputs);
  }

  private emitSnapshot(): void {
    const raw = this.sim.snapshot(false);
    const snapshot = this.applyFrozenSeats(raw);
    if (this.paused) snapshot.flags |= SnapshotFlag.Paused;
    if (this.finished) snapshot.flags |= SnapshotFlag.Finished;
    const { buffer } = this.encoder.encode(snapshot);
    this.transport.sendSnapshot(buffer);
  }

  /**
   * Statues, not ragdolls.
   *
   * The sim keeps simulating a dropped player's body (there is no engine call
   * to stop it yet), but what everyone SEES is a frozen seat with no velocity,
   * which is what the renderer needs to draw the paperweight and what keeps a
   * disconnected player from reading as an alive one who has stopped helping.
   */
  private applyFrozenSeats(snapshot: Snapshot): Snapshot {
    if (this.frozenSeats.size === 0) return { ...snapshot };
    const seats: SnapshotSeat[] = snapshot.seats.map((seat) =>
      this.frozenSeats.has(seat.seat)
        ? { ...seat, state: 'frozen', headV: { x: 0, y: 0 } }
        : seat,
    );
    return { ...snapshot, seats };
  }

  private drainEvents(now: number): void {
    const events = this.sim.drainEvents();
    if (events.length === 0) return;

    if (now - this.eventWindowAt >= EVENT_BUDGET_WINDOW_MS) {
      this.eventWindowAt = now;
      this.eventTokens = EVENT_BUDGET;
    }

    for (const event of events) {
      // `grip` never goes on the wire: every snapshot already carries gripL and
      // gripR at 20 Hz, and relaying it here as well would burn the whole
      // 300-per-minute budget in fifteen seconds of ordinary play.
      if (!RELAYED.has(event.kind)) continue;

      const critical = CRITICAL_EVENT_KINDS.has(event.kind as RelayedEventKind);
      // Reserve the last tenth of the budget for events that carry progress.
      if (this.eventTokens <= 0) continue;
      if (!critical && this.eventTokens <= EVENT_BUDGET / 10) continue;

      const message = packEvent(event, now);
      if (!message) continue;
      this.eventTokens--;
      this.transport.sendEvent(message);
      if (event.kind === 'finish') this.finished = true;
    }
  }

  // ─── Results (§9.8) ───────────────────────────────────────────────────────

  /**
   * Seal a level result for the hub to bound-check and the web tier to persist.
   *
   * `nonce` exists so two identical clears of the same level in the same room
   * are two rows rather than one deduplicated one, and so a replayed envelope
   * is visibly a replay.
   */
  sealLevelResult(result: LevelResult, now: number): ResultEnvelope {
    return sealResult({
      v: 1,
      roomId: this.options.roomId,
      hostClientId: this.options.hostClientId,
      issuedAt: now,
      nonce: this.nonce(),
      body: { kind: 'level', result },
    });
  }

  sealShowdownResult(result: ShowdownResult, now: number): ResultEnvelope {
    return sealResult({
      v: 1,
      roomId: this.options.roomId,
      hostClientId: this.options.hostClientId,
      issuedAt: now,
      nonce: this.nonce(),
      body: { kind: 'showdown', result },
    });
  }

  reportLevelResult(result: LevelResult, now: number): ResultEnvelope {
    const envelope = this.sealLevelResult(result, now);
    this.transport.sendResult(envelope);
    return envelope;
  }

  reportShowdownResult(result: ShowdownResult, now: number): ResultEnvelope {
    const envelope = this.sealShowdownResult(result, now);
    this.transport.sendResult(envelope);
    return envelope;
  }

  private nonce(): string {
    const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
    if (webCrypto?.getRandomValues) {
      const bytes = new Uint8Array(8);
      webCrypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return `${Math.floor(this.random() * 0xffffffff).toString(16)}${Date.now().toString(16)}`;
  }
}

/**
 * `GameEvent` → the `{ t, kind, data }` wire shape (§9.3).
 *
 * Returns null for kinds that stay local (`grip`), so the caller cannot relay
 * one by forgetting to filter.
 */
export function packEvent(event: GameEvent, t: number): BrEventMsg | null {
  switch (event.kind) {
    case 'death':
      return { t, kind: 'death', data: { seat: event.seat, at: event.at, cause: event.cause } };
    case 'respawn':
      return { t, kind: 'respawn', data: { seat: event.seat, at: event.at } };
    case 'checkpoint':
      return { t, kind: 'checkpoint', data: { index: event.index } };
    case 'objective':
      return { t, kind: 'objective', data: { objectiveId: event.objectiveId } };
    case 'parcel':
      return { t, kind: 'parcel', data: { parcelId: event.parcelId, seat: event.seat } };
    case 'item':
      return {
        t,
        kind: 'item',
        data: { propId: event.propId, seat: event.seat, kindOf: event.kindOf },
      };
    case 'signal':
      return { t, kind: 'signal', data: { signal: event.signal, value: event.value } };
    case 'cat':
      return { t, kind: 'cat', data: {} };
    case 'finish':
      return {
        t,
        kind: 'finish',
        data: {
          ms: event.ms,
          objectives: event.objectives,
          deaths: event.deaths,
          assisted: event.assisted,
        },
      };
    case 'emote':
      return { t, kind: 'emote', data: { seat: event.seat, emoteId: event.emoteId } };
    default:
      return null;
  }
}

/** The inverse, for guests: `{ t, kind, data }` → `GameEvent`. */
export function unpackEvent(message: BrEventMsg): GameEvent {
  switch (message.kind) {
    case 'death':
      return { kind: 'death', seat: message.data.seat, at: message.data.at, cause: message.data.cause };
    case 'respawn':
      return { kind: 'respawn', seat: message.data.seat, at: message.data.at };
    case 'checkpoint':
      return { kind: 'checkpoint', index: message.data.index };
    case 'objective':
      return { kind: 'objective', objectiveId: message.data.objectiveId };
    case 'parcel':
      return { kind: 'parcel', parcelId: message.data.parcelId, seat: message.data.seat };
    case 'item':
      return {
        kind: 'item',
        propId: message.data.propId,
        seat: message.data.seat,
        // The wire carries the prop kind as a bare string (the union is 24
        // members and re-declaring it in a zod enum would be a second source of
        // truth); the renderer only ever switches on it.
        kindOf: message.data.kindOf as PropKind,
      };
    case 'signal':
      return { kind: 'signal', signal: message.data.signal, value: message.data.value };
    case 'cat':
      return { kind: 'cat' };
    case 'finish':
      return {
        kind: 'finish',
        ms: message.data.ms,
        objectives: message.data.objectives,
        deaths: message.data.deaths,
        assisted: message.data.assisted,
      };
    case 'emote':
      return { kind: 'emote', seat: message.data.seat, emoteId: message.data.emoteId };
  }
}
