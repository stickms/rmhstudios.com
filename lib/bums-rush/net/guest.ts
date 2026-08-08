/**
 * Bum's Rush — the guest side of the wire (§9.5).
 *
 * A guest runs no physics. It receives snapshots at 20 Hz and has to render at
 * 60, so everything here exists to turn five sparse samples a second into
 * something that reads as one continuous world:
 *
 * 1. **Interpolate, 100 ms behind.** Two snapshots of slack. The cost is 100 ms
 *    of staleness on things you are not steering; the benefit is that ordinary
 *    jitter never becomes a stutter, because the frame we want has already
 *    arrived.
 * 2. **Adapt the buffer to measured jitter**, up to 200 ms, and give it back
 *    slowly. Expanding late is a visible hitch, so expansion is immediate;
 *    contracting early is another hitch, so contraction is a crawl.
 * 3. **Extrapolate for at most 120 ms**, then freeze and show the reconnect
 *    chrome. Extrapolation past that point is confident fiction — characters
 *    sail through walls and everyone disagrees about where they died.
 * 4. **Render your own arms from your own input, immediately** — the head comes
 *    from authority, the arm is what you are steering — and absorb the
 *    authoritative correction over 80 ms instead of snapping to it.
 *
 * There is deliberately no rollback and no prediction of the local body (§9.5):
 * with coupled constraints in matter-js, rollback is a quality risk far larger
 * than the feel it buys.
 *
 * Client module, but SSR-safe: nothing here touches `window`, and time is
 * always passed in.
 */

import { NET, PHYSICS } from '../constants';
import type { SeatIndex, Snapshot, SnapshotProp, SnapshotSeat, Vec2 } from '../types';
import {
  SnapshotDecoder,
  frameDelta,
  normalizeTurn,
  wrapAngle,
  type BinarySource,
} from './snapshot';

/** How the frame the guest is showing was produced. */
export type GuestRenderMode = 'empty' | 'interpolated' | 'extrapolated' | 'frozen';

export interface GuestFrame {
  frame: number;
  flags: number;
  seats: SnapshotSeat[];
  props: SnapshotProp[];
  mode: GuestRenderMode;
  /** The interpolation delay currently in force, in ms. */
  bufferMs: number;
  /** How far past the newest snapshot we are rendering; 0 while interpolating. */
  aheadMs: number;
}

interface BufferedSnapshot {
  snapshot: Snapshot;
  receivedAt: number;
}

const SNAPSHOT_INTERVAL_MS = 1000 / NET.SNAPSHOT_HZ;

/**
 * Keep a second of history. Any more is memory spent on frames the interpolator
 * can never reach, since it never renders further back than the buffer delay.
 */
const MAX_BUFFERED = NET.SNAPSHOT_HZ + 4;

/** Jitter samples the estimate is built from — one second of arrivals. */
const JITTER_SAMPLES = NET.SNAPSHOT_HZ;

/** Buffer contraction, in ms of delay given back per received snapshot. */
const CONTRACT_MS_PER_SNAPSHOT = 0.5;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Shortest-arc angle interpolation; a naive lerp spins a head the long way. */
function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

function lerpTurn(a: number, b: number, t: number): number {
  const from = normalizeTurn(a);
  return normalizeTurn(from + wrapAngle(normalizeTurn(b) - from) * t);
}

/**
 * The guest's view of the room: decode, buffer, interpolate.
 *
 * Owns a {@link SnapshotDecoder}, so delta packets are merged onto the last
 * keyframe before anything is buffered — the interpolator only ever sees whole
 * worlds.
 */
export class GuestInterpolator {
  private readonly decoder = new SnapshotDecoder();
  private readonly buffer: BufferedSnapshot[] = [];
  private readonly intervals: number[] = [];
  private lastArrivalAt: number | null = null;
  private delayMs: number = NET.INTERP_BUFFER_MS;
  private lastRendered: GuestFrame | null = null;

  /** The interpolation delay currently in force. */
  get bufferMs(): number {
    return this.delayMs;
  }

  get synced(): boolean {
    return this.decoder.synced;
  }

  /** True once the stream has run dry past the extrapolation limit. */
  get stalled(): boolean {
    return this.lastRendered?.mode === 'frozen';
  }

  reset(): void {
    this.decoder.reset();
    this.buffer.length = 0;
    this.intervals.length = 0;
    this.lastArrivalAt = null;
    this.delayMs = NET.INTERP_BUFFER_MS;
    this.lastRendered = null;
  }

  /**
   * Accept one packet off the wire.
   *
   * Returns the decoded snapshot, or null when it was a duplicate or arrived
   * out of order — reordered snapshots are DROPPED rather than inserted,
   * because a snapshot older than one already rendered has nothing to
   * contribute and re-sorting the buffer under it would rewind the world.
   */
  push(packet: BinarySource, now: number): Snapshot | null {
    const snapshot = this.decoder.decode(packet);

    const newest = this.buffer[this.buffer.length - 1];
    if (newest && frameDelta(snapshot.frame & 0xffff, newest.snapshot.frame & 0xffff) <= 0) {
      // Still counts as an arrival for jitter purposes: a reordered packet is
      // evidence of exactly the network condition the buffer exists to absorb.
      this.recordArrival(now);
      return null;
    }

    this.buffer.push({ snapshot, receivedAt: now });
    if (this.buffer.length > MAX_BUFFERED) this.buffer.splice(0, this.buffer.length - MAX_BUFFERED);
    this.recordArrival(now);
    return snapshot;
  }

  private recordArrival(now: number): void {
    if (this.lastArrivalAt !== null) {
      this.intervals.push(now - this.lastArrivalAt);
      if (this.intervals.length > JITTER_SAMPLES) {
        this.intervals.splice(0, this.intervals.length - JITTER_SAMPLES);
      }
    }
    this.lastArrivalAt = now;
    this.adaptDelay();
  }

  /**
   * Jitter → buffer delay.
   *
   * Mean absolute deviation from the nominal 50 ms interval, doubled, on top of
   * the 100 ms floor. Doubled because the buffer has to cover the deviation of
   * the packet we are waiting for, not the average one.
   */
  private adaptDelay(): void {
    if (this.intervals.length < 3) return;
    let deviation = 0;
    for (const interval of this.intervals) deviation += Math.abs(interval - SNAPSHOT_INTERVAL_MS);
    deviation /= this.intervals.length;

    const target = Math.min(
      NET.INTERP_BUFFER_MAX_MS,
      Math.max(NET.INTERP_BUFFER_MS, NET.INTERP_BUFFER_MS + deviation * 2),
    );

    if (target > this.delayMs) {
      // Late is a hitch. Expand now.
      this.delayMs = target;
    } else {
      // Early is also a hitch, so give the slack back a half-millisecond at a
      // time — about ten seconds to walk 200 ms back down to 100 ms.
      this.delayMs = Math.max(target, this.delayMs - CONTRACT_MS_PER_SNAPSHOT);
    }
  }

  /**
   * The frame to render at `now`.
   *
   * Never returns state newer than the newest snapshot received while
   * interpolating — the whole point of the buffer — and says so in `mode` when
   * it has had to guess.
   */
  sample(now: number): GuestFrame {
    if (this.buffer.length === 0) {
      const empty: GuestFrame = {
        frame: 0,
        flags: 0,
        seats: [],
        props: [],
        mode: 'empty',
        bufferMs: this.delayMs,
        aheadMs: 0,
      };
      this.lastRendered = empty;
      return empty;
    }

    const renderAt = now - this.delayMs;
    const newest = this.buffer[this.buffer.length - 1];

    // Past the newest sample: extrapolate, then freeze.
    if (renderAt >= newest.receivedAt) {
      const ahead = renderAt - newest.receivedAt;
      if (ahead > NET.EXTRAPOLATE_MAX_MS) {
        const frozen: GuestFrame = {
          frame: newest.snapshot.frame,
          flags: newest.snapshot.flags,
          seats: newest.snapshot.seats,
          props: newest.snapshot.props,
          mode: 'frozen',
          bufferMs: this.delayMs,
          aheadMs: ahead,
        };
        this.lastRendered = frozen;
        return frozen;
      }
      const extrapolated: GuestFrame = {
        frame: newest.snapshot.frame,
        flags: newest.snapshot.flags,
        seats: newest.snapshot.seats.map((seat) => extrapolateSeat(seat, ahead)),
        props: newest.snapshot.props,
        mode: 'extrapolated',
        bufferMs: this.delayMs,
        aheadMs: ahead,
      };
      this.lastRendered = extrapolated;
      return extrapolated;
    }

    // Before the oldest sample we still have: hold the oldest rather than
    // extrapolating backwards. Only happens right after a reset or a join.
    const oldest = this.buffer[0];
    if (renderAt <= oldest.receivedAt) {
      const held: GuestFrame = {
        frame: oldest.snapshot.frame,
        flags: oldest.snapshot.flags,
        seats: oldest.snapshot.seats,
        props: oldest.snapshot.props,
        mode: 'interpolated',
        bufferMs: this.delayMs,
        aheadMs: 0,
      };
      this.lastRendered = held;
      return held;
    }

    let a = this.buffer[0];
    let b = this.buffer[1] ?? this.buffer[0];
    for (let i = 1; i < this.buffer.length; i++) {
      if (this.buffer[i].receivedAt >= renderAt) {
        a = this.buffer[i - 1];
        b = this.buffer[i];
        break;
      }
    }

    const span = b.receivedAt - a.receivedAt;
    const t = span > 0 ? (renderAt - a.receivedAt) / span : 0;
    const frame: GuestFrame = {
      // The frame number is the OLDER sample's until we have fully crossed to
      // the newer one, so nothing downstream ever sees a frame the host has not
      // actually reached.
      frame: t >= 1 ? b.snapshot.frame : a.snapshot.frame,
      flags: a.snapshot.flags,
      seats: interpolateSeats(a.snapshot.seats, b.snapshot.seats, t),
      props: interpolateProps(a.snapshot.props, b.snapshot.props, t),
      mode: 'interpolated',
      bufferMs: this.delayMs,
      aheadMs: 0,
    };
    this.lastRendered = frame;
    return frame;
  }
}

/**
 * Discrete fields (state, grip, grip target) come from the OLDER sample.
 *
 * Taking them from the newer one would show a death, or a released grip, up to
 * 50 ms before the interpolated position gets there — a character that is still
 * visibly holding the rope while the HUD says they let go.
 */
function interpolateSeats(a: SnapshotSeat[], b: SnapshotSeat[], t: number): SnapshotSeat[] {
  const byIndex = new Map<SeatIndex, SnapshotSeat>();
  for (const seat of b) byIndex.set(seat.seat, seat);

  return a.map((from) => {
    const to = byIndex.get(from.seat);
    if (!to) return from;
    return {
      seat: from.seat,
      state: from.state,
      head: lerpVec(from.head, to.head, t),
      headV: lerpVec(from.headV, to.headV, t),
      headAngle: lerpAngle(from.headAngle, to.headAngle, t),
      handL: lerpVec(from.handL, to.handL, t),
      handR: lerpVec(from.handR, to.handR, t),
      gripL: from.gripL,
      gripR: from.gripR,
      gripTargetL: from.gripTargetL,
      gripTargetR: from.gripTargetR,
    };
  });
}

function interpolateProps(a: SnapshotProp[], b: SnapshotProp[], t: number): SnapshotProp[] {
  const byId = new Map<number, SnapshotProp>();
  for (const prop of b) byId.set(prop.id, prop);

  return a.map((from) => {
    const to = byId.get(from.id);
    if (!to) return from;
    return {
      id: from.id,
      x: lerp(from.x, to.x, t),
      y: lerp(from.y, to.y, t),
      angle: lerpTurn(from.angle, to.angle, t),
    };
  });
}

/**
 * Dead reckoning from the last known velocity.
 *
 * `headV` is in world px per fixed step, which is why it is scaled by the step
 * length rather than treated as px/ms — the same units the sim reports and the
 * snapshot quantises.
 */
function extrapolateSeat(seat: SnapshotSeat, aheadMs: number): SnapshotSeat {
  const steps = aheadMs / PHYSICS.FIXED_DT_MS;
  const dx = seat.headV.x * steps;
  const dy = seat.headV.y * steps;
  return {
    ...seat,
    head: { x: seat.head.x + dx, y: seat.head.y + dy },
    // Hands ride the head. Extrapolating them independently makes arms grow.
    handL: { x: seat.handL.x + dx, y: seat.handL.y + dy },
    handR: { x: seat.handR.x + dx, y: seat.handR.y + dy },
  };
}

// ─── Local arm blending (§9.5.1) ────────────────────────────────────────────

function easeOutCubic(t: number): number {
  const inverse = 1 - t;
  return 1 - inverse * inverse * inverse;
}

/**
 * Your own arm, rendered from your own input, corrected without a snap.
 *
 * The naive version — render the authoritative hand — makes your own arm lag
 * one RTT behind your thumb, which is the single most damning thing an online
 * build of this game could do. The other naive version — render local only —
 * drifts, and then your hand is not where the grab happened.
 *
 * So: render the local prediction, and carry the disagreement measured at the
 * last authoritative sample as an OFFSET that decays to zero over 80 ms. At the
 * instant a correction lands the rendered hand is exactly where authority says
 * it is; 80 ms later it is exactly where your thumb says it is; in between it
 * moves smoothly, and every new snapshot re-measures the offset, so a genuine
 * divergence keeps being pulled back rather than accumulating.
 */
export class LocalArmBlender {
  private offset: Vec2 = { x: 0, y: 0 };
  private offsetAt = 0;

  constructor(private readonly blendMs: number = NET.LOCAL_ARM_BLEND_MS) {}

  /** An authoritative hand position arrived for this hand. */
  onAuthority(localPrediction: Vec2, authoritative: Vec2, now: number): void {
    this.offset = { x: authoritative.x - localPrediction.x, y: authoritative.y - localPrediction.y };
    this.offsetAt = now;
  }

  /** Where to actually draw the hand this render frame. */
  sample(localPrediction: Vec2, now: number): Vec2 {
    const elapsed = now - this.offsetAt;
    if (elapsed >= this.blendMs || this.blendMs <= 0) return localPrediction;
    const remaining = 1 - easeOutCubic(Math.max(0, elapsed) / this.blendMs);
    return {
      x: localPrediction.x + this.offset.x * remaining,
      y: localPrediction.y + this.offset.y * remaining,
    };
  }

  reset(): void {
    this.offset = { x: 0, y: 0 };
    this.offsetAt = 0;
  }
}
