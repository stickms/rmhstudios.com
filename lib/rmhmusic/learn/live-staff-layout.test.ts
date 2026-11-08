import { describe, expect, it } from 'vitest';
import { VIEW_H, VIEW_W, liveStaffLayout, ottavaText } from './live-staff-layout';

const inside = (b: { x0: number; y0: number; x1: number; y1: number }) =>
  b.x0 >= 0 && b.y0 >= 0 && b.x1 <= VIEW_W && b.y1 <= VIEW_H;

describe('live staff layout', () => {
  it.each([
    // [midi, name, drawn step, ottava sign]
    [40, 'E2 (guitar low E)', -7, '8vb'],
    [38, 'D2', -8, '8vb'],
    [39, 'D#2 (spelled on D)', -8, '8vb'],
    [60, 'C4', -2, null],
    [77, 'F5', 8, null],
    [98, 'D7', 13, '8va'],
    [100, 'E7', 14, '8va'],
  ])('%i %s: drawn at step %i with ottava %s, inside the box', (midi, _name, step, sign) => {
    const l = liveStaffLayout(midi);
    expect(l.step).toBe(step);
    expect(l.label?.text ?? null).toBe(sign);
    expect(l.noteY).toBeGreaterThanOrEqual(5);
    expect(l.noteY).toBeLessThanOrEqual(VIEW_H - 5);
    if (l.label) expect(inside(l.label.box), JSON.stringify(l.label)).toBe(true);
  });

  it('keeps every mark of every MIDI note inside the fixed box', () => {
    for (let midi = 0; midi <= 127; midi++) {
      const l = liveStaffLayout(midi);
      expect(l.noteY - 5).toBeGreaterThanOrEqual(0);
      expect(l.noteY + 5).toBeLessThanOrEqual(VIEW_H);
      for (const y of l.ledgerYs) expect(y >= 0 && y <= VIEW_H).toBe(true);
      if (l.label)
        expect(inside(l.label.box), `midi ${midi}: ${JSON.stringify(l.label)}`).toBe(true);
    }
  });

  it('names ottava signs by their interval', () => {
    expect(ottavaText(-1)).toBe('8vb');
    expect(ottavaText(1)).toBe('8va');
    expect(ottavaText(-2)).toBe('15mb');
    expect(ottavaText(2)).toBe('15ma');
  });
});
