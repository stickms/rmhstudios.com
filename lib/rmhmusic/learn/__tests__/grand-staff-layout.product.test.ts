import { describe, expect, it } from 'vitest';
import { CARD_GAP, CARD_TOP } from '../staff-card-layout';
import {
  GRAND_BASS_BOTTOM,
  GRAND_BASS_TOP,
  GRAND_BRACE_PATH,
  GRAND_GAP_SPACES,
  GRAND_H,
  GRAND_VIEW_X,
  GRAND_W,
  grandStaffLayout,
  grandY,
  pianoStaffOf,
  staffSpot,
} from '../grand-staff-layout';

const G2 = 43;
const E2 = 40;
const C2 = 36;
const MIDDLE_C = 60;
const TREBLE_BOTTOM_Y = CARD_TOP + 4 * CARD_GAP;

describe('grand staff layout', () => {
  it('puts G2 on the bass staff bottom line', () => {
    const g = grandStaffLayout('bass', G2);
    expect(g.step).toBe(0);
    expect(g.noteY).toBe(GRAND_BASS_BOTTOM);
    expect(g.ledgerYs).toEqual([]);
  });

  it('puts the bass top line A3 on the staff top and E4 on the treble bottom line', () => {
    expect(grandStaffLayout('bass', 57).noteY).toBe(GRAND_BASS_TOP);
    expect(grandStaffLayout('treble', 64).noteY).toBe(TREBLE_BOTTOM_Y);
  });

  it('gives middle C one ledger line on either staff, belonging to the staff it is written on', () => {
    const onTreble = grandStaffLayout('treble', MIDDLE_C);
    expect(onTreble.step).toBe(-2);
    expect(onTreble.ledgerYs).toEqual([TREBLE_BOTTOM_Y + CARD_GAP]);
    expect(onTreble.noteY).toBe(onTreble.ledgerYs[0]);

    const onBass = grandStaffLayout('bass', MIDDLE_C);
    expect(onBass.step).toBe(10);
    expect(onBass.ledgerYs).toEqual([GRAND_BASS_TOP - CARD_GAP]);
    expect(onBass.noteY).toBe(onBass.ledgerYs[0]);

    // Two marks, not one: the same pitch is a different place on each staff.
    expect(onBass.noteY).toBeGreaterThan(onTreble.noteY);
  });

  it('draws the notes under the bass staff on ledger lines below it', () => {
    // E2 sits on the first ledger line (G2 line, F2 space, E2 line); C2 on the second.
    const e2 = grandStaffLayout('bass', E2);
    expect(e2.step).toBe(-2);
    expect(e2.ledgerYs).toEqual([GRAND_BASS_BOTTOM + CARD_GAP]);
    const c2 = grandStaffLayout('bass', C2);
    expect(c2.ledgerYs).toEqual([GRAND_BASS_BOTTOM + CARD_GAP, GRAND_BASS_BOTTOM + 2 * CARD_GAP]);
    expect(c2.noteY).toBeLessThan(GRAND_H);
  });

  it('leaves the standard gap between the staves', () => {
    expect(GRAND_GAP_SPACES).toBe(4);
    expect(GRAND_BASS_TOP - TREBLE_BOTTOM_Y).toBe(GRAND_GAP_SPACES * CARD_GAP);
    expect(grandY('bass', 8)).toBe(GRAND_BASS_TOP);
    expect(grandY('treble', 0)).toBe(TREBLE_BOTTOM_Y);
  });

  it('turns stems up below the middle line and down from it', () => {
    expect(grandStaffLayout('bass', G2).stem.y2).toBeLessThan(grandStaffLayout('bass', G2).noteY);
    expect(grandStaffLayout('treble', 72).stem.y2).toBeGreaterThan(grandStaffLayout('treble', 72).noteY);
  });

  it('keeps every deck and finder note inside the box', () => {
    for (let midi = 45; midi <= 64; midi++) {
      const staff = pianoStaffOf(midi);
      const g = grandStaffLayout(staff, midi);
      expect(g.noteY, `${staff} ${midi}`).toBeGreaterThan(0);
      expect(g.noteY, `${staff} ${midi}`).toBeLessThan(GRAND_H);
      for (const y of g.ledgerYs) expect(y).toBeLessThan(GRAND_H);
    }
  });

  it('reads piano notes below middle C on the bass staff', () => {
    expect(pianoStaffOf(59)).toBe('bass');
    expect(pianoStaffOf(60)).toBe('treble');
  });

  it('draws a brace as one path, left of the staves, in the box', () => {
    expect(GRAND_BRACE_PATH.startsWith('M')).toBe(true);
    expect(GRAND_BRACE_PATH).not.toMatch(/NaN|Infinity/);
    const xs = [...GRAND_BRACE_PATH.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThan(GRAND_VIEW_X);
    expect(Math.max(...xs)).toBeLessThanOrEqual(4);
    expect(GRAND_W / GRAND_H).toBeCloseTo(212 / 180, 5);
  });

  it('names where a note sits: lines, spaces and ledger lines', () => {
    expect(staffSpot(0)).toEqual({ kind: 'line', n: 1 });
    expect(staffSpot(2)).toEqual({ kind: 'line', n: 2 });
    expect(staffSpot(8)).toEqual({ kind: 'line', n: 5 });
    expect(staffSpot(1)).toEqual({ kind: 'space', n: 1 });
    expect(staffSpot(7)).toEqual({ kind: 'space', n: 4 });
    expect(staffSpot(-1)).toEqual({ kind: 'ledger-space', side: 'below', n: 1 });
    expect(staffSpot(-2)).toEqual({ kind: 'ledger-line', side: 'below', n: 1 });
    expect(staffSpot(-4)).toEqual({ kind: 'ledger-line', side: 'below', n: 2 });
    expect(staffSpot(10)).toEqual({ kind: 'ledger-line', side: 'above', n: 1 });
    expect(staffSpot(9)).toEqual({ kind: 'ledger-space', side: 'above', n: 1 });
  });
});
