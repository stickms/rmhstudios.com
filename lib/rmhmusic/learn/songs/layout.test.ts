import { describe, expect, it } from 'vitest';
import { SONGS, songById } from './catalog';
import { fingerFor } from './fingering';
import {
  STAFF_BOTTOM,
  STAFF_TOP,
  SYSTEM_H,
  TAB_GAP,
  TAB_TOP,
  WINDOW_H,
  scoreLayout,
  type ScoreLayout,
} from './layout';
import { notesOf, soundingPitch } from './score';

const NARROW = 250; // a 320 px phone
const PHONE = 300; // a 390 px phone
const WIDE = 640; // a desktop column

function song(id: string) {
  const s = songById(id);
  if (!s) throw new Error(id);
  return s;
}

function allNotes(layout: ScoreLayout) {
  return layout.systems.flatMap((sys) => sys.notes.map((n) => ({ ...n, system: sys.index })));
}

describe('scoreLayout', () => {
  it('has one fixed system height per version, and the window holds three piano or two guitar systems', () => {
    expect(SYSTEM_H.piano * 3).toBe(WINDOW_H);
    expect(SYSTEM_H.guitar * 2).toBe(WINDOW_H);
    for (const version of ['piano', 'guitar'] as const) {
      const layout = scoreLayout(song('twinkle-twinkle'), version, PHONE);
      layout.systems.forEach((sys, i) => expect(sys.top).toBe(i * SYSTEM_H[version]));
      expect(layout.height).toBe(layout.systems.length * SYSTEM_H[version]);
    }
  });

  it('wraps by whole bars: a narrower width takes more systems, a very wide one takes one', () => {
    const s = song('lightly-row');
    const narrow = scoreLayout(s, 'piano', NARROW).systems.length;
    const phone = scoreLayout(s, 'piano', PHONE).systems.length;
    const wide = scoreLayout(s, 'piano', WIDE).systems.length;
    expect(narrow).toBeGreaterThanOrEqual(phone);
    expect(phone).toBeGreaterThan(wide);
    expect(scoreLayout(s, 'piano', 5000).systems).toHaveLength(1);
    for (const width of [NARROW, PHONE, WIDE]) {
      const layout = scoreLayout(s, 'piano', width);
      let next = 0;
      for (const sys of layout.systems) {
        expect(sys.firstBar).toBe(next);
        expect(sys.lastBar).toBeGreaterThanOrEqual(sys.firstBar);
        for (const n of sys.notes) {
          expect(n.bar).toBeGreaterThanOrEqual(sys.firstBar);
          expect(n.bar).toBeLessThanOrEqual(sys.lastBar);
        }
        next = sys.lastBar + 1;
      }
      expect(next).toBe(s.bars.length);
    }
  });

  for (const s of SONGS) {
    for (const version of ['piano', 'guitar'] as const) {
      for (const width of [NARROW, PHONE, WIDE]) {
        it(`${s.id} on ${version} at ${width}: every note once, in order, inside the width and its system`, () => {
          const layout = scoreLayout(s, version, width);
          const laid = allNotes(layout);
          expect(laid.map((n) => n.index)).toEqual(notesOf(s).map((n) => n.index));
          expect(layout.systemOf).toEqual(laid.map((n) => n.system));
          const h = SYSTEM_H[version];
          for (const sys of layout.systems) {
            for (const n of sys.notes) {
              expect(n.x).toBeGreaterThan(sys.headerEnd);
              expect(n.x).toBeLessThan(width - 4);
              const ys = [n.y, ...(n.stem ? [n.stem.y1, n.stem.y2] : []), ...n.ledgers.map((l) => l.y)];
              for (const y of ys) {
                expect(y).toBeGreaterThan(4);
                expect(y).toBeLessThan(h - 4);
              }
              if (n.accidental) expect(n.accidental.x).toBeGreaterThan(sys.headerEnd);
            }
            // Notes left to right within a system, never touching.
            for (let i = 1; i < sys.notes.length; i++) {
              const a = sys.notes[i - 1];
              const b = sys.notes[i];
              if (a && b) expect(b.x - a.x).toBeGreaterThanOrEqual(14);
            }
            for (const x of sys.barLines) expect(x).toBeLessThanOrEqual(width - 4);
          }
        });
      }
    }
  }

  it('justifies every system but a short last one to the right edge', () => {
    const layout = scoreLayout(song('twinkle-twinkle'), 'piano', WIDE);
    const systems = layout.systems;
    expect(systems.length).toBeGreaterThan(1);
    for (const sys of systems.slice(0, -1)) expect(sys.barLines.at(-1)).toBeCloseTo(WIDE - 4, 5);
  });

  it('draws the time signature on the first system only, and the key signature on every one', () => {
    const layout = scoreLayout(song('minuet-in-g'), 'piano', PHONE);
    expect(layout.systems[0]?.timeSig).toEqual(expect.objectContaining({ beats: 3 }));
    for (const sys of layout.systems.slice(1)) expect(sys.timeSig).toBeNull();
    for (const sys of layout.systems) {
      expect(sys.keySig).toHaveLength(1);
      expect(sys.keySig[0]).toEqual(expect.objectContaining({ kind: 'sharp', y: STAFF_TOP }));
    }
    expect(scoreLayout(song('ode-to-joy'), 'piano', PHONE).systems[0]?.keySig).toEqual([]);
  });

  it('ends with a final double bar on the last system only', () => {
    const layout = scoreLayout(song('ode-to-joy'), 'piano', PHONE);
    layout.systems.forEach((sys, i) => expect(sys.final).toBe(i === layout.systems.length - 1));
  });

  it('beams two eighths in one beat, flags a lone eighth, dots a dotted note, leaves a whole note unstemmed', () => {
    const minuet = allNotes(scoreLayout(song('minuet-in-g'), 'piano', WIDE));
    const minuetLayout = scoreLayout(song('minuet-in-g'), 'piano', WIDE);
    const beams = minuetLayout.systems.flatMap((s) => s.beams);
    // Bars 1, 3, 5, 6, 7 have two pairs each (G A, B C …).
    expect(beams.length).toBe(10);
    for (const b of beams) expect(b.y1).toBe(b.y2);
    expect(minuet.filter((n) => n.flag)).toHaveLength(0);

    const ode = allNotes(scoreLayout(song('ode-to-joy'), 'piano', WIDE));
    const lone = ode.filter((n) => n.flag);
    expect(lone.map((n) => n.index)).toEqual([13, 28]);
    expect(ode[12]?.dot).not.toBeNull();
    expect(ode[12]?.filled).toBe(true);
    expect(ode[14]?.filled).toBe(false); // the half note D4
    expect(ode[14]?.dot).toBeNull();

    const mary = allNotes(scoreLayout(song('mary-had-a-little-lamb'), 'piano', WIDE));
    const last = mary.at(-1);
    expect(last?.stem).toBeNull();
    expect(last?.filled).toBe(false);
  });

  it('leaves a lone eighth room for its flag before the next head', () => {
    for (const width of [PHONE, WIDE]) {
      const notes = allNotes(scoreLayout(song('ode-to-joy'), 'piano', width));
      for (const n of notes.filter((x) => x.flag)) {
        const next = notes[notes.indexOf(n) + 1];
        if (next && next.system === n.system) expect(next.x - n.x, `${width}`).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it('stems up below the middle line and down from it, with ledger lines for middle C and G3', () => {
    const notes = allNotes(scoreLayout(song('au-clair-de-la-lune'), 'piano', WIDE));
    const c4 = notes[0];
    expect(c4?.ledgers).toHaveLength(1);
    expect(c4?.stem && c4.stem.y2 < c4.y).toBe(true);
    const g3 = notes.find((n) => n.written === 55);
    expect(g3?.ledgers).toHaveLength(2);
    expect(g3?.y).toBeGreaterThan(STAFF_BOTTOM);
    const minuet = allNotes(scoreLayout(song('minuet-in-g'), 'piano', WIDE));
    const d5 = minuet[0];
    expect(d5?.stem && d5.stem.y2 > d5.y).toBe(true);
  });

  it('writes a tab number for every guitar note, on its string, and none for piano', () => {
    const s = song('minuet-in-g');
    const guitar = allNotes(scoreLayout(s, 'guitar', PHONE));
    for (const n of guitar) {
      const p = fingerFor(soundingPitch(n.written, 'guitar'));
      expect(n.tab).toEqual({ string: p?.string, fret: p?.fret, y: TAB_TOP + (5 - (p?.string ?? 0)) * TAB_GAP });
    }
    expect(guitar[0]?.tab).toEqual(expect.objectContaining({ string: 4, fret: 3 })); // D5 written → D4: B string 3rd fret
    for (const n of allNotes(scoreLayout(s, 'piano', PHONE))) expect(n.tab).toBeNull();
  });

  it('survives a width too narrow for one bar by squeezing that bar, never past the edge', () => {
    const layout = scoreLayout(song('minuet-in-g'), 'piano', 150);
    expect(layout.systems.length).toBe(song('minuet-in-g').bars.length);
    for (const sys of layout.systems) for (const n of sys.notes) expect(n.x).toBeLessThan(146);
  });
});
