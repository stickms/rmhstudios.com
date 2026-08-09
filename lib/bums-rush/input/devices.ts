/**
 * Bum's Rush — device↔seat assignment (§4.6).
 *
 * A **seat** is a playable character (max `NET.MAX_SEATS`); a **device** is a
 * physical input. This module keeps that map for the LOCAL client (one
 * browser tab may own several seats in couch co-op) — it does not talk to the
 * server; claiming a seat over the network is `br:claimSeat` (§9.2,
 * `net/protocol.ts`), a separate concern from "which physical device drives
 * which of my seats."
 *
 * The one piece of real policy here is the rejoin grace window: unplugging
 * and replugging a pad within `NET.DEVICE_REJOIN_GRACE_MS` (THE CONTRACT)
 * restores its seat rather than orphaning it. `DeviceSeatRegistry` is a small
 * stateful wrapper; the decisions inside it (is this device the SAME device
 * come back, has the grace window lapsed) are pure functions so they can be
 * reasoned about — and tested — without the class.
 */

import type { SeatIndex } from '../types';
import { SEAT_INDICES } from '../types';
import { NET } from '../constants';
import { hashPadId } from './gamepad';
import type { DeviceProfileKind } from './bindings';

/**
 * Split keyboard is modelled as two independent logical devices from the
 * start (`keyboard-p1`/`keyboard-p2`) rather than as a single "keyboard"
 * device special-cased to own two seats — every other kind of device here is
 * strictly one-device-one-seat, and this keeps that invariant total instead
 * of almost-total. `keyboard.ts`'s held-key state is shared DOM state; which
 * logical device a given key belongs to is decided by which profile's codes
 * it matches (`bindings.ts`'s two default keyboard tables use disjoint keys
 * by design).
 */
export type DeviceKind = DeviceProfileKind;

export interface DeviceIdentity {
  kind: DeviceKind;
  /**
   * Stable across reconnects of the SAME physical device, within what the
   * browser exposes. For `gamepad`, this is `gamepad:<hashPadId(pad.id)>` —
   * see `hashPadId`'s doc comment for the known same-model-pad collision.
   * For the singleton kinds (`keyboard-p1`, `keyboard-p2`, `touch`) the id is
   * just the kind name; a browser tab has at most one of each.
   */
  id: string;
  /** Human-readable, for the join prompt / seat bar. Not i18n'd here — see `glyphs.ts` for the brand-aware version a gamepad gets. */
  label: string;
}

export function keyboardDeviceIdentity(kind: 'keyboard-p1' | 'keyboard-p2'): DeviceIdentity {
  return { kind, id: kind, label: kind === 'keyboard-p1' ? 'Keyboard' : 'Keyboard (Player 2)' };
}

export function touchDeviceIdentity(): DeviceIdentity {
  return { kind: 'touch', id: 'touch', label: 'Touch' };
}

export function gamepadDeviceIdentity(padId: string, label = 'Gamepad'): DeviceIdentity {
  return { kind: 'gamepad', id: `gamepad:${hashPadId(padId)}`, label };
}

// ─── Pure decisions ──────────────────────────────────────────────────────────

/** First seat index not present in `occupied`, or `null` if the room (locally) is full. */
export function nextFreeSeat(occupied: ReadonlySet<SeatIndex>): SeatIndex | null {
  for (const seat of SEAT_INDICES) {
    if (!occupied.has(seat)) return seat;
  }
  return null;
}

/** Whether a device that disconnected at `disconnectedAt` is still within its rejoin grace window at `now`. */
export function isWithinRejoinGrace(disconnectedAt: number, now: number): boolean {
  return now - disconnectedAt <= NET.DEVICE_REJOIN_GRACE_MS;
}

// ─── The registry ────────────────────────────────────────────────────────────

interface SeatBinding {
  seat: SeatIndex;
  device: DeviceIdentity;
  /** Set while the device is disconnected but still inside its grace window; `null` while connected. */
  disconnectedAt: number | null;
}

export interface DeviceJoinResult {
  seat: SeatIndex;
  device: DeviceIdentity;
  /** `true` if this call resumed a grace-windowed seat rather than claiming a fresh one. */
  rejoined: boolean;
}

/**
 * Local (single-client) device↔seat map. Not thread-safe / not meant to be —
 * one instance per game session, driven by whatever owns the input loop.
 */
export class DeviceSeatRegistry {
  private bySeat = new Map<SeatIndex, SeatBinding>();

  seatsInUse(): SeatIndex[] {
    return [...this.bySeat.keys()];
  }

  deviceForSeat(seat: SeatIndex): DeviceIdentity | null {
    return this.bySeat.get(seat)?.device ?? null;
  }

  seatForDevice(deviceId: string): SeatIndex | null {
    for (const binding of this.bySeat.values()) {
      if (binding.device.id === deviceId) return binding.seat;
    }
    return null;
  }

  /**
   * A device presses a button/moves for the first time. If it already owns a
   * seat (including one still inside its rejoin grace window), that binding
   * is refreshed and returned as a rejoin; otherwise it claims the next free
   * seat. Returns `null` only when every seat is already taken by a DIFFERENT
   * device — the caller (the join-prompt UI, §4.6) shows nothing in that case
   * rather than bumping anyone. Takes no timestamp: rejoining always clears
   * the grace window outright rather than checking it against `now` — the
   * device just proved itself live by producing this input.
   */
  join(device: DeviceIdentity): DeviceJoinResult | null {
    const existingSeat = this.seatForDevice(device.id);
    if (existingSeat !== null) {
      const binding = this.bySeat.get(existingSeat);
      if (binding) {
        const wasDisconnected = binding.disconnectedAt !== null;
        this.bySeat.set(existingSeat, { seat: existingSeat, device, disconnectedAt: null });
        return { seat: existingSeat, device, rejoined: wasDisconnected };
      }
    }

    const occupied = new Set(this.bySeat.keys());
    const seat = nextFreeSeat(occupied);
    if (seat === null) return null;

    this.bySeat.set(seat, { seat, device, disconnectedAt: null });
    return { seat, device, rejoined: false };
  }

  /** Explicit leave (hold pause 1.5s, §4.6) — releases immediately, no grace window. */
  release(seat: SeatIndex): void {
    this.bySeat.delete(seat);
  }

  /** A device drops out (gamepad unplugged, tab loses touch capability, …) — starts the grace window instead of releasing the seat outright. */
  markDisconnected(deviceId: string, now: number): void {
    const seat = this.seatForDevice(deviceId);
    if (seat === null) return;
    const binding = this.bySeat.get(seat);
    if (!binding || binding.disconnectedAt !== null) return;
    this.bySeat.set(seat, { ...binding, disconnectedAt: now });
  }

  /**
   * Sweep for grace windows that have lapsed. Call this once per tick (or on
   * a coarser timer — it is cheap and idempotent) from the input loop. Returns
   * the seats actually released so the caller can trigger the "character
   * walks off as a torn-out piece of paper" event (§4.6) for each.
   */
  expireGraceWindows(now: number): SeatIndex[] {
    const released: SeatIndex[] = [];
    for (const [seat, binding] of this.bySeat) {
      if (binding.disconnectedAt !== null && !isWithinRejoinGrace(binding.disconnectedAt, now)) {
        this.bySeat.delete(seat);
        released.push(seat);
      }
    }
    return released;
  }
}
