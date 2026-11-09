import { describe, expect, it } from 'vitest';
import {
  MAX_AMBIENT,
  MAX_POPS,
  POP_LIFE,
  POP_X,
  createScene,
  drawScene,
  popAlpha,
  popNote,
  popStaff,
  staffCount,
  stepScene,
  stepY,
  type Pen,
} from './scene';

/** A pen that records the calls the renderer makes. */
function recorder() {
  const calls: { op: string; args: number[]; alpha: number; fill: unknown }[] = [];
  const pen = {
    fillStyle: '' as Pen['fillStyle'],
    strokeStyle: '' as Pen['strokeStyle'],
    lineWidth: 1,
    globalAlpha: 1,
  } as Pen;
  for (const op of [
    'clearRect',
    'fillRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'quadraticCurveTo',
    'ellipse',
    'fill',
    'stroke',
  ] as const) {
    (pen as unknown as Record<string, (...a: number[]) => void>)[op] = (...args: number[]) =>
      calls.push({ op, args, alpha: pen.globalAlpha, fill: pen.fillStyle });
  }
  return { pen, calls };
}

const PALETTE = { note: 'note', pop: 'pop' };

describe('paper backdrop scene', () => {
  it('fits whole staves in the band', () => {
    expect(staffCount(0)).toBe(0);
    expect(staffCount(100)).toBe(0);
    expect(staffCount(104)).toBe(0);
    expect(staffCount(105)).toBe(1);
    expect(staffCount(640)).toBe(5);
    expect(staffCount(896)).toBe(7);
  });

  it('is deterministic for a seed', () => {
    const a = createScene(1280, 800, 42);
    const b = createScene(1280, 800, 42);
    for (let i = 0; i < 300; i++) {
      stepScene(a, 1 / 30);
      stepScene(b, 1 / 30);
    }
    expect(a.marks).toEqual(b.marks);
    expect(createScene(1280, 800, 7).marks).not.toEqual(createScene(1280, 800, 8).marks);
  });

  it('keeps every mark inside the band and drifting slowly', () => {
    const s = createScene(390, 640, 3);
    expect(s.ambient).toBeGreaterThan(0);
    expect(s.ambient).toBeLessThanOrEqual(MAX_AMBIENT);
    for (let f = 0; f < 3000; f++) {
      const before = s.marks.slice(0, s.ambient).map((m) => m.x);
      stepScene(s, 1 / 30);
      for (let i = 0; i < s.ambient; i++) {
        const m = s.marks[i];
        expect(m.x).toBeGreaterThanOrEqual(-24);
        expect(m.x).toBeLessThanOrEqual(s.width + 24);
        expect(m.staff).toBeLessThan(s.staves);
        expect(m.step).toBeGreaterThanOrEqual(-1);
        expect(m.step).toBeLessThanOrEqual(9);
        const moved = before[i] - m.x;
        // A wrap jumps back to the right; otherwise at most 11 px/s.
        if (moved > 0) expect(moved).toBeLessThanOrEqual(11 / 30 + 1e-9);
      }
    }
  });

  it('allocates nothing per frame: the pools keep their size and objects', () => {
    const s = createScene(1280, 800, 1);
    const marks = s.marks;
    const pops = s.pops;
    const first = marks[0];
    const { pen } = recorder();
    for (let f = 0; f < 600; f++) {
      if (f % 7 === 0) popNote(s, 60 + (f % 24));
      stepScene(s, 1 / 30);
      drawScene(s, pen, PALETTE);
    }
    expect(s.marks).toBe(marks);
    expect(s.pops).toBe(pops);
    expect(s.marks.length).toBe(MAX_AMBIENT);
    expect(s.pops.length).toBe(MAX_POPS);
    expect(s.marks[0]).toBe(first);
  });

  it('pops a played note onto the staff at its pitch', () => {
    const s = createScene(1000, 800, 1);
    popNote(s, 64); // E4: bottom line
    const p = s.pops[0];
    expect(p.alive).toBe(true);
    expect(p.staff).toBe(popStaff(s));
    expect(p.step).toBe(0);
    expect(p.x).toBe(1000 * POP_X);
    for (let i = 0; i < 4; i++) stepScene(s, 0.25);
    const { pen, calls } = recorder();
    drawScene(s, pen, PALETTE);
    const heads = calls.filter((c) => c.op === 'ellipse' && c.fill === 'pop');
    expect(heads).toHaveLength(1);
    expect(heads[0].args[1]).toBe(stepY(popStaff(s), 0));
    expect(heads[0].args[0]).toBeCloseTo(1000 * POP_X - 16, 6);
  });

  it('draws ledger lines and a sharp for C#4, and fades the note out', () => {
    const s = createScene(1000, 800, 1);
    popNote(s, 61);
    expect(s.pops[0]).toMatchObject({ step: -2, sharp: true });
    stepScene(s, 1);
    const { pen, calls } = recorder();
    drawScene(s, pen, PALETTE);
    const ledgerY = stepY(popStaff(s), -2);
    expect(calls.some((c) => c.op === 'moveTo' && c.args[1] === ledgerY)).toBe(true);
    for (let i = 0; i < 6 * 30; i++) stepScene(s, 1 / 30);
    expect(s.pops[0].alive).toBe(false);
    expect(popAlpha(0)).toBe(0);
    expect(popAlpha(1)).toBe(1);
    expect(popAlpha(POP_LIFE)).toBe(0);
  });

  it('a band too short for a staff draws nothing and ignores notes', () => {
    const s = createScene(390, 60, 1);
    expect(s.staves).toBe(0);
    popNote(s, 60);
    expect(s.pops.every((p) => !p.alive)).toBe(true);
    const { pen, calls } = recorder();
    drawScene(s, pen, PALETTE);
    expect(calls.filter((c) => c.op !== 'clearRect')).toHaveLength(0);
  });

  it('never fills more than one frame step after a long pause', () => {
    const s = createScene(1280, 800, 9);
    const x = s.marks[0].x;
    stepScene(s, 60);
    expect(Math.abs(x - s.marks[0].x)).toBeLessThanOrEqual(11 * 0.25 + 1e-9);
  });
});
