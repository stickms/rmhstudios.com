/**
 * `reportJellyDrag` (lib/jelly/drag-report.ts) — the drag owners' report (hooks/useFluidDrag.ts), moved out of the
 * soft-body physics service when the soft body became CSS (CSS-first jelly, PR 3). The drag translation itself is the
 * owner's (lib/fluid.ts); the physics stretch it used to feed is gone. What it still owes the rest of the jelly:
 * exactly one `drag:start` on a host's first move and one `drag:end` at its end (the arcs' quiet tracker reads them),
 * and no write to the host's motion or pointer variables (the pointer variable service owns `--px` / `--py`).
 */
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { jellyBus } from '../bus';
import { reportJellyDrag } from '../drag-report';

describe('reportJellyDrag', () => {
  it('announces drag:start once on the first move and drag:end once at the end', () => {
    const start = vi.fn();
    const end = vi.fn();
    const offs = [jellyBus.on('drag:start', start), jellyBus.on('drag:end', end)];
    const style = { setProperty: vi.fn(), removeProperty: vi.fn() };
    const el = { style } as unknown as HTMLElement;
    reportJellyDrag(el, 0, 900, 'move');
    reportJellyDrag(el, 0, 1200, 'move');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({ el });
    expect(end).not.toHaveBeenCalled();
    reportJellyDrag(el, 0, 0, 'end');
    reportJellyDrag(el, 0, 0, 'end');
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith({ el });
    expect(style.setProperty).not.toHaveBeenCalled();
    offs.forEach((off) => off());
  });

  it('an end with no move announces nothing', () => {
    const end = vi.fn();
    const off = jellyBus.on('drag:end', end);
    reportJellyDrag({} as HTMLElement, 0, 0, 'end');
    expect(end).not.toHaveBeenCalled();
    off();
  });
});
