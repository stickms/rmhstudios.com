/**
 * The drag owners' report (`hooks/useFluidDrag.ts`), moved out of the soft-body physics service when the soft body
 * became CSS (CSS-first jelly, PR 3; docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3).
 *
 * The owner keeps the drag translation itself (`lib/fluid.ts`: rubber band, velocity, settle spring). The physics
 * service used to add a stretch along the drag velocity on top; with the soft body in CSS there is nothing to stretch
 * with a velocity, so this report no longer moves anything. What it still owes the rest of the jelly is the drag's
 * span on the shared bus: `drag:start` on a host's first move and `drag:end` at its end, exactly once each — the arcs'
 * quiet tracker holds ambient strikes while a drag is under way (`lib/jelly/arcs/scheduler.ts`). The pointer's
 * position on the dragged host (`--px` / `--py`) is written by the pointer variable service like any hover
 * (`lib/jelly/pointer-vars.ts`); this module never writes it, so a drag has one writer per variable.
 *
 * Same signature as the physics service's report it replaces, so `useFluidDrag` changed only its import.
 */
import { jellyBus } from './bus';

const reportedDrags = new WeakSet<Element>();

/**
 * Report a drag owner's host motion (`vx`, `vy` in px/s, unused now that nothing stretches) at each move and at the
 * end. Emits `drag:start` on the first move and `drag:end` at the end.
 */
export function reportJellyDrag(
  el: HTMLElement,
  _vx: number,
  _vy: number,
  phase: 'move' | 'end',
): void {
  if (phase === 'move' && !reportedDrags.has(el)) {
    reportedDrags.add(el);
    jellyBus.emit('drag:start', { el });
  }
  if (phase === 'end' && reportedDrags.has(el)) {
    reportedDrags.delete(el);
    jellyBus.emit('drag:end', { el });
  }
}
