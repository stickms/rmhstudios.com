/**
 * Turning a drag in the preview back into `.res` values.
 *
 * A drag moves a panel by a number of *pixels*, but the file stores virtual
 * units with a prefix that says how they are anchored (`r120`, `c-40`, `f20`,
 * or a plain offset from a pin target). Rather than recompute absolute
 * positions — which would lose the author's chosen anchoring — we shift the
 * existing number by the equivalent virtual delta and keep the prefix.
 */

import { parseDim } from './geometry';

const fmt = (n: number): string => String(Math.round(n));

/**
 * Shift a position component (`xpos`/`ypos`) by `deltaVirtual` (positive = right
 * or down on screen). Right/bottom-anchored values move the opposite way in the
 * file.
 */
export function shiftPosition(raw: string | undefined, deltaVirtual: number): string {
  const dim = parseDim(raw);
  // An operator chain's tail (`c-34+273` → `+273`) is kept: only the first term moves.
  const tail = dim.more ? (/^[rc]?[sp]?[-+]?\d*\.?\d+(.*)$/i.exec((raw ?? '').trim())?.[1] ?? '') : '';
  if (dim.align === 'end') return `r${fmt(dim.value - deltaVirtual)}${tail}`;
  if (dim.align === 'center') return `c${fmt(dim.value + deltaVirtual)}${tail}`;
  return `${fmt(dim.value + deltaVirtual)}${tail}`;
}

/** Grow a size component (`wide`/`tall`) by `deltaVirtual`. `f` values shrink as the panel grows. */
export function growSize(raw: string | undefined, deltaVirtual: number): string {
  const dim = parseDim(raw);
  if (dim.fill) return `f${fmt(dim.value - deltaVirtual)}`;
  return fmt(Math.max(0, dim.value + deltaVirtual));
}
