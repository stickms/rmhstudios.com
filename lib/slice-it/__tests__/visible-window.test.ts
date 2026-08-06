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
      longestHold: longestHoldSeconds({}, notes),
    });

    for (const base of cases) {
      const geom = geomWithHold(base);
      // Sweep the whole song, including before the first note and after the last.
      for (let t = -5; t <= 305; t += 0.37) {
        const { from, to } = visibleSliceRange(notes, t, geom);
        for (let i = 0; i < notes.length; i++) {
          if (!rendererWouldDraw(notes[i], t, geom)) continue;
          expect(
            i >= from && i < to,
            `note ${i} (t=${notes[i].time.toFixed(2)}) drawn at ${t.toFixed(2)} but outside [${from}, ${to})`,
          ).toBe(true);
        }
      }
    }
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
  it('finds the longest hold and caches it per chart', () => {
    const notes: TimedSlice[] = [{ time: 0 }, { time: 1, duration: 2.5 }, { time: 2, duration: 1 }];
    const key = {};
    expect(longestHoldSeconds(key, notes)).toBe(2.5);
    // Cached on the chart object: a different note list under the same key is
    // not re-scanned, which is what makes it free per frame.
    expect(longestHoldSeconds(key, [{ time: 0, duration: 99 }])).toBe(2.5);
    expect(longestHoldSeconds({}, [{ time: 0, duration: 99 }])).toBe(99);
  });

  it('is zero for a chart with no holds', () => {
    expect(longestHoldSeconds({}, [{ time: 0 }, { time: 1 }])).toBe(0);
  });
});
