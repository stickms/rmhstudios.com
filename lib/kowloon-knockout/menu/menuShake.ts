// ============================================================
// The menu's shared shake: how the 3D duel tells the pixel street that a blow just landed.
//
// A module-level trauma (0..1) the 3D layer writes (`pushMenuTrauma`) and the street's own paint reads
// (`readMenuShake`) — no React state, no timers, no frame loop of its own: the decay is computed from
// the time of the read, so it is the same whatever the paint rate is. The offsets are whole pixels of
// the street's low-resolution buffer, because that is the unit a pixel scene can move in.
// ============================================================
import {
  SHAKE_MAX_OFFSET,
  TRAUMA_DECAY,
  shakeSample,
} from '@/lib/kowloon-knockout/render/impact';

/** Largest street shake at full trauma, in buffer pixels (the buffer's short side is ~180). */
export const MENU_SHAKE_MAX_PX_X = 5;
export const MENU_SHAKE_MAX_PX_Y = 3;
/** Largest brightness lift (0..1 of full scale) a hit gives the street. Small: well under a WCAG "flash". */
export const MENU_PULSE_MAX = 0.07;

export interface MenuShake {
  /** Whole-pixel offsets to apply to the street. */
  x: number;
  y: number;
  /** 0..MENU_PULSE_MAX: how much to lift the street's brightness. */
  pulse: number;
}

const NONE: MenuShake =
  Object.freeze(
    {
      x: 0,
      y: 0,
      pulse: 0,
    },
  );

let trauma = 0;
let at = 0;

/** Trauma remaining at `nowMs`. */
export function menuTraumaAt(
  nowMs: number,
): number {
  return Math.max(
    0,
    trauma -
      (TRAUMA_DECAY *
        Math.max(
          0,
          nowMs -
            at,
        )) /
        1000,
  );
}

/** A blow landed at `nowMs` with `amount` trauma (the profile's, 0..1). Stacks, capped at 1. */
export function pushMenuTrauma(
  amount: number,
  nowMs: number,
): void {
  trauma =
    Math.min(
      1,
      menuTraumaAt(
        nowMs,
      ) +
        Math.max(
          0,
          amount,
        ),
    );
  at =
    nowMs;
}

/** Forget everything (tests; a menu that unmounts mid-shake). */
export function resetMenuShake(): void {
  trauma = 0;
  at = 0;
}

/** The street's shake at `nowMs`: integer pixel offsets and a small brightness lift, all 0 at rest. */
export function readMenuShake(
  nowMs: number,
): MenuShake {
  const tr =
    menuTraumaAt(
      nowMs,
    );
  if (
    tr <=
    0.004
  )
    return NONE;
  const s =
    shakeSample(
      tr,
      nowMs /
        1000,
    );
  return {
    x: Math.round(
      (s.x /
        SHAKE_MAX_OFFSET) *
        MENU_SHAKE_MAX_PX_X,
    ),
    y: Math.round(
      (s.y /
        (SHAKE_MAX_OFFSET *
          0.8)) *
        MENU_SHAKE_MAX_PX_Y,
    ),
    pulse:
      tr *
      tr *
      MENU_PULSE_MAX,
  };
}
