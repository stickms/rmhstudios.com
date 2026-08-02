import { describe, expect, it } from 'vitest';
import { resolveAnchoredPlacement, type PlacementInput } from '../anchored-placement';

/**
 * The composer's (+) menu: 12 rows, ~420px tall, anchored to a small button on
 * the composer's action row, opening upward by preference.
 */
const MENU_HEIGHT = 420;
const GAP = 4;

function input(over: Partial<PlacementInput> = {}): PlacementInput {
  const viewport = over.viewport ?? { width: 1280, height: 900 };
  return {
    anchor: { top: 300, bottom: 328, left: 600, right: 628 },
    panelHeight: MENU_HEIGHT,
    bounds: { top: 12, bottom: viewport.height - 12, left: 12, right: viewport.width - 12 },
    viewport,
    side: 'top',
    align: 'end',
    gap: GAP,
    ...over,
  };
}

describe('resolveAnchoredPlacement', () => {
  it('keeps the preferred side when it can hold the whole panel', () => {
    // 800px of room above a menu that wants 420.
    const p = resolveAnchoredPlacement(
      input({ anchor: { top: 820, bottom: 848, left: 600, right: 628 } }),
    );
    expect(p.side).toBe('top');
    expect(p.maxHeight).toBe(MENU_HEIGHT);
    // Panel bottom lands `gap` above the trigger: 900 - 820 + 4.
    expect(p.offset).toBe(84);
  });

  it('flips to the side with room instead of running off the top', () => {
    // The reported bug: composer near the top of the feed. 284px above,
    // 568px below — the menu belongs below, not shoved back down into the
    // top bar by a viewport clamp.
    const p = resolveAnchoredPlacement(input());
    expect(p.side).toBe('bottom');
    expect(p.maxHeight).toBe(MENU_HEIGHT);
    expect(p.offset).toBe(332); // trigger bottom + gap
  });

  it('stays on the preferred side when flipping would be worse', () => {
    // Short viewport, trigger near the bottom: neither side fits, but above
    // has far more room than below. Flipping on the first failed fit would
    // leave 76px of usable menu.
    const p = resolveAnchoredPlacement(
      input({
        viewport: { width: 390, height: 515 },
        anchor: { top: 400, bottom: 428, left: 330, right: 358 },
        bounds: { top: 12, bottom: 503, left: 12, right: 378 },
      }),
    );
    expect(p.side).toBe('top');
    expect(p.maxHeight).toBe(384); // 400 - 4 - 12
  });

  it('caps the panel to the room the chosen side has and scrolls the rest', () => {
    // Short viewport, trigger near the top: below is the only usable side and
    // it still cannot hold all 420px, so the panel takes what is there.
    const p = resolveAnchoredPlacement(
      input({
        side: 'bottom',
        viewport: { width: 1280, height: 500 },
        anchor: { top: 80, bottom: 108, left: 600, right: 628 },
        bounds: { top: 12, bottom: 488, left: 12, right: 1268 },
      }),
    );
    expect(p.side).toBe('bottom');
    expect(p.maxHeight).toBe(376); // 488 - 108 - 4
    expect(p.maxHeight).toBeLessThan(MENU_HEIGHT);
  });

  it('lines the panel up with the trigger edge named by `align`', () => {
    expect(resolveAnchoredPlacement(input()).inset).toBe(652); // 1280 - 628
    expect(resolveAnchoredPlacement(input({ align: 'start' })).inset).toBe(600);
  });

  it('never lets the alignment push the panel past a viewport edge', () => {
    // Trigger hard against the right edge (a narrow phone) — the panel keeps
    // the edge margin instead of hanging off.
    const p = resolveAnchoredPlacement(
      input({
        viewport: { width: 390, height: 900 },
        bounds: { top: 12, bottom: 888, left: 12, right: 378 },
        anchor: { top: 300, bottom: 328, left: 362, right: 390 },
      }),
    );
    expect(p.inset).toBe(12);
  });

  it('does not return a negative height for an off-screen trigger', () => {
    const p = resolveAnchoredPlacement(
      input({ anchor: { top: -200, bottom: -172, left: 600, right: 628 } }),
    );
    expect(p.maxHeight).toBeGreaterThanOrEqual(0);
  });
});
