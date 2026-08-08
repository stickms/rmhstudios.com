/**
 * The visible-window optimisation replaces "look at every note" with "look at
 * the notes that could be on screen", and it is only safe in one direction: too
 * wide is free, too narrow is a note that silently fails to render.
 *
 * So the tests are not "does the range look right" — they are an oracle. The
 * renderer's per-note cull is reproduced here exactly as it appears in
 * `GameCanvas`, and the property is that **every note the cull would have
 * drawn is inside the range**, over a sweep of playhead positions, both screen
 * orientations, every speed modifier the game allows, and charts containing
 * long holds.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lowerBoundByTime,
  longestHoldSeconds,
  maxAheadSeconds,
  maxBehindSeconds,
  visibleSliceRange,
  type TimedSlice,
  type ViewGeometry,
} from '../visible-window';

/* ─── The renderer's own cull, reproduced ────────────────────────────────── */

/**
 * True when `GameCanvas` would draw this note at `currentTime`.
 *
 * Mirrors the surviving checks in the render loop: a future note is culled once
 * its scroll position leaves the canvas by the 100px margin, and a past note
 * once it has scrolled off the other end. A held LONG note is pinned to the
 * cursor for its whole duration, so it is on screen the entire time.
 */
function rendererWouldDraw(slice: TimedSlice, currentTime: number, geom: ViewGeometry): boolean {
  const dt = slice.time - currentTime;
  const held =
    slice.duration !== undefined &&
    currentTime >= slice.time &&
    currentTime <= slice.time + slice.duration;
  if (held) return true;

  const scroll = geom.vertical
    ? geom.cursorPosition - dt * geom.pixelsPerSecond
    : geom.cursorPosition + dt * geom.pixelsPerSecond;

  if (geom.vertical) {
    if (scroll < -100) return false; // above the screen (still approaching)
    if (scroll > geom.axisLength + 100) return false; // below (already passed)
  } else {
    if (scroll > geom.axisLength + 100) return false; // right of screen
    if (scroll < -100) return false; // left (already passed)
  }
  return true;
}

/* ─── Fixtures ───────────────────────────────────────────────────────────── */

function geometry(over: Partial<ViewGeometry> = {}): ViewGeometry {
  // Landscape desktop defaults, matching `PPS = w / 3 * speed`.
  const axisLength = 1600;
  return {
    axisLength,
    pixelsPerSecond: axisLength / 3,
    cursorPosition: axisLength * 0.15,
    vertical: false,
    longestHold: 0,
    ...over,
  };
}

/** A chart of `count` notes over `seconds`, some of them holds. */
function chart(count: number, seconds: number, { holds = false } = {}): TimedSlice[] {
  return Array.from({ length: count }, (_, i) => {
    const time = (i / count) * seconds;
    return holds && i % 17 === 0 ? { time, duration: 1 + (i % 5) } : { time };
  });
}

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('visibleSliceRange', () => {
  it('never excludes a note the renderer would have drawn', () => {
    const cases: ViewGeometry[] = [];
    for (const vertical of [false, true]) {
      for (const speed of [0.5, 0.75, 1, 1.5, 2, 3]) {
        const axisLength = vertical ? 844 : 1600;
        cases.push(
          geometry({
            vertical,
            axisLength,
            pixelsPerSecond: (axisLength / 3) * speed,
            cursorPosition: vertical ? axisLength * 0.85 : axisLength * 0.15,
          }),
        );
      }
    }

    const notes = chart(2000, 300, { holds: true });
    const geomWithHold = (g: ViewGeometry) => ({
      ...g,
      longestHold: longestHoldSeconds(notes),
    });

    // ~20M note-checks. `expect()` builds an assertion context on every call,
    // so calling it per check costs more than the property it is checking —
    // the loop records the first counter-example instead and asserts once.
    // A passing run and a failing run report exactly what they did before.
    let counterexample: string | null = null;
    outer: for (const base of cases) {
      const geom = geomWithHold(base);
      // Sweep the whole song, including before the first note and after the last.
      for (let t = -5; t <= 305; t += 0.37) {
        const { from, to } = visibleSliceRange(notes, t, geom);
        for (let i = 0; i < notes.length; i++) {
          if (i >= from && i < to) continue;
          if (!rendererWouldDraw(notes[i], t, geom)) continue;
          counterexample = `note ${i} (t=${notes[i].time.toFixed(2)}) drawn at ${t.toFixed(2)} but outside [${from}, ${to})`;
          break outer;
        }
      }
    }
    expect(counterexample).toBe(null);
  });

  it('actually narrows the work — that is the entire point', () => {
    const notes = chart(2000, 300);
    const geom = geometry();
    let widest = 0;
    for (let t = 0; t <= 300; t += 1) {
      const { from, to } = visibleSliceRange(notes, t, geom);
      widest = Math.max(widest, to - from);
    }
    // Was 2000 notes every frame. The window has to be a small fraction of that
    // or the binary searches are pure overhead.
    expect(widest).toBeLessThan(200);
  });

  it('keeps a long hold in range for its whole duration', () => {
    const notes: TimedSlice[] = [{ time: 10, duration: 8 }, { time: 40 }];
    const geom = geometry({ longestHold: 8 });
    for (let t = 10; t <= 18; t += 0.25) {
      const { from, to } = visibleSliceRange(notes, t, geom);
      expect(0 >= from && 0 < to, `hold dropped at t=${t}`).toBe(true);
    }
  });

  it('falls back to the whole chart rather than guess at a zero scroll rate', () => {
    const notes = chart(50, 60);
    const range = visibleSliceRange(notes, 30, geometry({ pixelsPerSecond: 0 }));
    expect(range).toEqual({ from: 0, to: 50 });
  });

  it('derives its bounds from the renderer geometry, not constants', () => {
    // Landscape: the note travels from the right edge to the cursor at 15%.
    const landscape = geometry();
    expect(maxAheadSeconds(landscape)).toBeCloseTo((1600 + 100 - 240) / (1600 / 3), 6);
    // Portrait: from the top to the cursor at 85%.
    const portrait = geometry({
      vertical: true,
      axisLength: 844,
      pixelsPerSecond: 844 / 3,
      cursorPosition: 844 * 0.85,
    });
    expect(maxAheadSeconds(portrait)).toBeCloseTo((844 * 0.85 + 100) / (844 / 3), 6);
    // Behind covers a full traverse plus the longest hold plus slack.
    expect(maxBehindSeconds({ ...landscape, longestHold: 4 })).toBeCloseTo(4 + 3 + 1, 6);
  });
});

describe('lowerBoundByTime', () => {
  it('finds the first index at or after t', () => {
    const notes: TimedSlice[] = [{ time: 0 }, { time: 1 }, { time: 1 }, { time: 3 }];
    expect(lowerBoundByTime(notes, -1)).toBe(0);
    expect(lowerBoundByTime(notes, 0)).toBe(0);
    expect(lowerBoundByTime(notes, 1)).toBe(1); // first of the duplicates
    expect(lowerBoundByTime(notes, 2)).toBe(3);
    expect(lowerBoundByTime(notes, 99)).toBe(4);
    expect(lowerBoundByTime([], 5)).toBe(0);
  });
});

describe('longestHoldSeconds', () => {
  it('finds the longest hold', () => {
    const notes: TimedSlice[] = [{ time: 0 }, { time: 1, duration: 2.5 }, { time: 2, duration: 1 }];
    expect(longestHoldSeconds(notes)).toBe(2.5);
  });

  it('caches on the array identity, which is what makes it free per frame', () => {
    const notes: TimedSlice[] = [{ time: 0 }, { time: 1, duration: 2.5 }];
    expect(longestHoldSeconds(notes)).toBe(2.5);
    // Mutating in place does NOT invalidate — the contract is that a prepared
    // slice array is immutable and gets REPLACED when the chart changes, never
    // edited underneath the renderer.
    notes.push({ time: 3, duration: 99 });
    expect(longestHoldSeconds(notes)).toBe(2.5);
    // A genuinely different array is scanned on its own terms.
    expect(longestHoldSeconds([{ time: 0, duration: 99 }])).toBe(99);
  });

  it('is zero for a chart with no holds', () => {
    expect(longestHoldSeconds([{ time: 0 }, { time: 1 }])).toBe(0);
  });
});

/* ─── The record-form trap ───────────────────────────────────────────────── */

/**
 * The bug this guards against shipped, and it made Slice It unplayable while
 * looking like it worked.
 *
 * `BeatMap.slices` is `Slice[] | Record<Difficulty, Slice[]>`. `GameCanvas`
 * rendered `map.slices as Slice[]` — a cast, not a conversion — so on every
 * chart stored in the record form the renderer was handed a plain object.
 * `object.length` is `undefined`, both binary searches below collapse to 0, and
 * the draw loop runs zero times. The engine meanwhile resolves the difficulty
 * properly and keeps judging, so audio plays and misses accumulate against
 * notes that were never drawn.
 *
 * The fix is that the renderer draws `engine.getSlices()` — the prepared,
 * difficulty-resolved, modifier-applied array the engine actually judges. These
 * two tests pin both halves: the trap is real, and an array is what escapes it.
 */
describe('a per-difficulty record is not a renderable note list', () => {
  const geom: ViewGeometry = {
    pixelsPerSecond: 300,
    axisLength: 800,
    cursorPosition: 120,
    vertical: false,
    longestHold: 0,
  };

  it('collapses to an empty range, drawing nothing at all', () => {
    // Exactly the shape the charter writes and `trimToDifficulty` returns.
    const record = {
      normal: [
        { time: 1, duration: 0 },
        { time: 2, duration: 0 },
      ],
    } as unknown as readonly TimedSlice[];

    const { from, to } = visibleSliceRange(record, 1, geom);
    expect(to - from).toBe(0);
  });

  it('draws the notes once the same chart is a flat array', () => {
    const resolved: TimedSlice[] = [{ time: 1 }, { time: 2 }];
    const { from, to } = visibleSliceRange(resolved, 1, geom);
    expect(to - from).toBe(2);
  });

  /**
   * The trap above is only reachable through one line of code, and it is a cast
   * — so the type checker cannot hold this line and neither can the two tests
   * above. This can.
   */
  it('the renderer sources its notes from the engine, never from the raw map', () => {
    const source = readFileSync(join(process.cwd(), 'components/slice-it/GameCanvas.tsx'), 'utf8');
    const code = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');

    expect(code).toContain('engine.getSlices()');
    // `?.` too: the second and third instances of this bug were `map?.slices`
    // behind an `Array.isArray` guard, which does not crash and does not draw
    // — it just decided every per-difficulty chart had no lead-in to skip.
    expect(code).not.toMatch(/map\??\.slices/);
  });
});
