'use client';

/**
 * Snapshot → `RenderState`, for a client that is not the host.
 *
 * ## Why this is here, and where it probably belongs
 *
 * `types.ts` says the renderer/engine seam exists precisely so "a guest client
 * feeds interpolated snapshots into the same renderer with no engine present",
 * and `net/guest.ts` produces exactly the interpolated snapshot that implies.
 * The adapter BETWEEN those two — `GuestFrame` (heads, hands, grips) to
 * `RenderState` (seats with arm polylines, props with kinds, a camera) — is not
 * exported by `net/`, `render/` or `engine/`. So the component layer writes it,
 * and this file is flagged in the implementation report as something that
 * belongs in `lib/bums-rush/net/` next to the interpolator that feeds it.
 *
 * ## What it can and cannot reconstruct
 *
 * A snapshot carries the head, the two hands, grip strength and grip target —
 * not the four arm segment positions. So arms here are a straight taper from
 * shoulder to hand rather than the whipping curve the host draws. That is a
 * visible difference on a hard swing and it is the honest one: inventing an
 * arc would put the guest's drawing somewhere the physics never was, and the
 * hand — which is what the player is aiming — is exactly right either way.
 *
 * Everything else is derivable: prop kinds come from the level (a snapshot's
 * numeric prop id is its index in `level.props`), the camera is recomputed
 * locally from the same engine camera the host runs, and death splats are
 * accumulated from the `death` events the host already relays.
 */

import { PHYSICS, RENDER } from '@/lib/bums-rush/constants';
import { createCamera, updateCamera, type Camera, type CameraSeat } from '@/lib/bums-rush/engine';
import type { GuestFrame } from '@/lib/bums-rush/net';
import { SnapshotFlag } from '@/lib/bums-rush/types';
import type {
  Cosmetics,
  GameEvent,
  Level,
  RenderProp,
  RenderSeat,
  RenderState,
  SeatIndex,
  Vec2,
} from '@/lib/bums-rush/types';
import { DEFAULT_COSMETICS } from '@/lib/bums-rush/constants';

const ARM_NODES = PHYSICS.ARM_SEGMENTS + 1;
/** Grip strength is sent as 1..255; `RenderSeat.tension*` is 0..1. */
const WIRE_GRIP_MAX = 255;

export interface GuestRenderAdapter {
  /** Cosmetics per seat, echoed into the room on join (§2.5). */
  setCosmetics(seat: SeatIndex, cosmetics: Cosmetics): void;
  /** Persistent splats and the checkpoint index come from relayed events. */
  applyEvent(event: GameEvent): void;
  /** Build the frame. The returned object is REUSED — read it, never retain it. */
  update(frame: GuestFrame, dtMs: number, elapsedMs: number): RenderState;
  readonly camera: Camera;
}

export function createGuestRenderAdapter(level: Level, solo: boolean): GuestRenderAdapter {
  const camera = createCamera(level, { solo });
  const cosmetics: Cosmetics[] = [0, 1, 2, 3].map(() => ({ ...DEFAULT_COSMETICS }));
  const deadForMs = [0, 0, 0, 0];

  const seats: RenderSeat[] = [0, 1, 2, 3].map((i) => blankSeat(i as SeatIndex, cosmetics[i]));
  const cameraSeats: CameraSeat[] = [0, 1, 2, 3].map((i) => ({
    seat: i as SeatIndex,
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    deadForMs: 0,
  }));

  // Props are delta-encoded on the wire, so the last known transform for every
  // prop has to be kept here — a frame that omits a crate means "unchanged",
  // not "gone".
  const props: RenderProp[] = level.props.map((prop) => ({
    id: prop.id,
    kind: prop.kind,
    at: { x: prop.at.x, y: prop.at.y },
    angle: prop.angle ?? 0,
  }));

  const splats: RenderState['splats'] = [];
  let checkpointIndex = 0;
  let splatSprite = 0;

  const state: RenderState = {
    seats: [],
    props,
    hazards: [],
    splats,
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    frame: 0,
    elapsedMs: 0,
    checkpointIndex: 0,
    catActive: false,
  };

  return {
    camera,

    setCosmetics(seat, next) {
      cosmetics[seat] = next;
      seats[seat].cosmetics = next;
    },

    applyEvent(event) {
      if (event.kind === 'death') {
        // Six hand-drawn blots, rotated at random — the same vocabulary the
        // host uses, so a splat looks the same on every screen in the room.
        splatSprite = (splatSprite + 1) % 6;
        splats.push({
          at: { x: event.at.x, y: event.at.y },
          sprite: splatSprite,
          angle: (splatSprite / 6) * Math.PI * 2,
          seat: event.seat,
        });
        if (splats.length > RENDER.MAX_SPLATS) splats.shift();
      } else if (event.kind === 'checkpoint') {
        checkpointIndex = event.index;
      }
    },

    update(frame, dtMs, elapsedMs) {
      const live: RenderSeat[] = [];

      for (let i = 0; i < cameraSeats.length; i++) cameraSeats[i].active = false;

      for (const snap of frame.seats) {
        const seat = seats[snap.seat];
        seat.state = snap.state;
        seat.cosmetics = cosmetics[snap.seat];
        seat.head.x = snap.head.x;
        seat.head.y = snap.head.y;
        seat.headAngle = snap.headAngle;

        // Squash/stretch is a function of velocity (§2.7), and velocity IS on
        // the wire — so this part of the juice survives the trip intact.
        const speed = Math.hypot(snap.headV.x, snap.headV.y) * (1000 / PHYSICS.FIXED_DT_MS);
        const stretch = Math.min(RENDER.STRETCH_MAX, speed / RENDER.STRETCH_REF_SPEED);
        seat.scaleX = 1 + stretch;
        seat.scaleY = 1 - stretch * 0.6;

        fillArm(seat.armL, snap.head, snap.handL, snap.headAngle, -1);
        fillArm(seat.armR, snap.head, snap.handR, snap.headAngle, 1);

        seat.gripL = snap.gripL > 0;
        seat.gripR = snap.gripR > 0;
        seat.tensionL = snap.gripL / WIRE_GRIP_MAX;
        seat.tensionR = snap.gripR / WIRE_GRIP_MAX;
        // Not on the wire, and guessing would make hands flicker into the
        // "reaching" pose for no reason. A guest sees open or closed.
        seat.reachingL = false;
        seat.reachingR = false;

        const dead = snap.state === 'dead';
        deadForMs[snap.seat] = dead ? deadForMs[snap.seat] + dtMs : 0;

        const cam = cameraSeats[snap.seat];
        cam.active = true;
        cam.x = snap.head.x;
        cam.y = snap.head.y;
        cam.vx = snap.headV.x;
        cam.vy = snap.headV.y;
        cam.deadForMs = deadForMs[snap.seat];

        live.push(seat);
      }

      for (const snapProp of frame.props) {
        const prop = props[snapProp.id];
        if (!prop) continue;
        prop.at.x = snapProp.x;
        prop.at.y = snapProp.y;
        prop.angle = snapProp.angle;
      }

      updateCamera(camera, cameraSeats, dtMs);

      state.seats = live;
      state.camera.x = camera.x;
      state.camera.y = camera.y;
      state.camera.zoom = camera.zoom;
      state.frame = frame.frame;
      state.elapsedMs = elapsedMs;
      state.checkpointIndex = checkpointIndex;
      state.catActive = (frame.flags & SnapshotFlag.CatActive) !== 0;
      return state;
    },
  };
}

function blankSeat(seat: SeatIndex, cosmetics: Cosmetics): RenderSeat {
  const arm = (): Vec2[] => Array.from({ length: ARM_NODES }, () => ({ x: 0, y: 0 }));
  return {
    seat,
    state: 'alive',
    cosmetics,
    head: { x: 0, y: 0 },
    headAngle: 0,
    scaleX: 1,
    scaleY: 1,
    armL: arm(),
    armR: arm(),
    gripL: false,
    gripR: false,
    tensionL: 0,
    tensionR: 0,
    reachingL: false,
    reachingR: false,
    carrying: null,
  };
}

/**
 * Shoulder → hand as an evenly-spaced polyline. See the module comment: the
 * segment positions are not on the wire, so this is a straight arm rather than
 * a fabricated curve.
 */
function fillArm(out: Vec2[], head: Vec2, hand: Vec2, headAngle: number, side: -1 | 1): void {
  const cos = Math.cos(headAngle);
  const sin = Math.sin(headAngle);
  const ox = PHYSICS.SHOULDER_OFFSET_X * side;
  const oy = PHYSICS.SHOULDER_OFFSET_Y;
  const sx = head.x + ox * cos - oy * sin;
  const sy = head.y + ox * sin + oy * cos;

  for (let i = 0; i < out.length; i++) {
    const t = i / (out.length - 1);
    out[i].x = sx + (hand.x - sx) * t;
    out[i].y = sy + (hand.y - sy) * t;
  }
}
