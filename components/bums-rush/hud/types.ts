'use client';

/**
 * The imperative seam between the rAF loop and the HUD.
 *
 * The HUD shows four things that change every frame — the clock, grip tension,
 * off-screen arrows and the camera they hang off — and React is the wrong tool
 * for all four. `setState` at 60 Hz reconciles the whole HUD tree sixty times a
 * second to move one number; on a mid-range phone that is most of the frame
 * budget §17 allocates to the entire game.
 *
 * So the loop calls `update()` on a handle and the components write to their
 * own DOM nodes directly. React still owns everything discrete — which
 * objectives are done, who is in the room, whether the pause menu is open —
 * because those change a few times a minute and are worth a render.
 *
 * The frame object is REUSED by the caller. Read it inside `update()`; never
 * retain it.
 */

import type { EdgeIndicator } from '@/lib/bums-rush/engine';
import type { RenderSeat, SeatIndex } from '@/lib/bums-rush/types';

export interface HudLiveFrame {
  elapsedMs: number;
  /** Live seats only, in seat order. */
  seats: readonly RenderSeat[];
  camera: { x: number; y: number; zoom: number };
  /** Valid entries are `edges[0 … edgeCount-1]`; the array itself is pooled. */
  edges: readonly EdgeIndicator[];
  edgeCount: number;
  /** Seats this browser drives — they get the tension read-out and the assist chip. */
  localSeats: readonly SeatIndex[];
}

export interface LiveHandle {
  update(frame: HudLiveFrame): void;
}
