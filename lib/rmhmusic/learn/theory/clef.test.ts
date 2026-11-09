import { describe, expect, it } from 'vitest';
import { clefStep, ledgerSteps, noteLetter } from './clef';

describe('clefStep', () => {
  it.each([
    ['treble', 64, 0], // E4: bottom line
    ['treble', 60, -2], // C4: first ledger line below
    ['treble', 77, 8], // F5: top line
    ['bass', 43, 0], // G2: bottom line
    ['bass', 60, 10], // middle C: first ledger line above the bass staff
    ['bass', 40, -2], // E2: first ledger line below
  ] as const)('%s clef, midi %i → step %i', (clef, midi, step) => {
    expect(clefStep(clef, midi)).toBe(step);
  });
});

describe('ledgerSteps', () => {
  it.each([
    [-4, [-2, -4]],
    [12, [10, 12]],
    [3, []],
    [-1, []], // a space just below the staff needs no line
    [-2, [-2]],
    [8, []], // the top line is part of the staff
    [9, []],
    [10, [10]],
  ])('step %i → %j', (step, lines) => {
    expect(ledgerSteps(step)).toEqual(lines);
  });
});

describe('noteLetter', () => {
  it('keeps the natural letter for a sharp', () => {
    expect(noteLetter(61)).toBe('C');
  });
  it('names naturals across octaves', () => {
    expect(noteLetter(60)).toBe('C');
    expect(noteLetter(64)).toBe('E');
    expect(noteLetter(71)).toBe('B');
    expect(noteLetter(43)).toBe('G');
  });
});
