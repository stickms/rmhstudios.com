import { describe, expect, it } from 'vitest';

import { createFlashLedger } from '../ledger';
import {
  ARC_KINDS,
  TIMELINE,
  arcDone,
  arcIntensity,
  planArc,
  strikeOnsets,
  truncateStrikes,
  type ArcKind,
} from '../timeline';

const KINDS: ArcKind[] = ['ambient', 'click', 'key', 'fizz', 'discharge'];

describe('planArc', () => {
  it('keeps strike counts, life and energy inside the per-kind bounds over many seeds', () => {
    for (const kind of KINDS) {
      const spec = ARC_KINDS[kind];
      for (let seed = 0; seed < 500; seed++) {
        const tl = planArc(kind, seed);
        expect(tl.strikes.length).toBeGreaterThanOrEqual(spec.strikes[0]);
        expect(tl.strikes.length).toBeLessThanOrEqual(spec.strikes[1]);
        expect(tl.strikeEndMs).toBeGreaterThanOrEqual(spec.endMs[0]);
        expect(tl.strikeEndMs).toBeLessThanOrEqual(spec.endMs[1]);
        expect(tl.energy).toBeGreaterThanOrEqual(spec.energy[0]);
        expect(tl.energy).toBeLessThanOrEqual(spec.energy[1]);
        expect(tl.lifeMs).toBeLessThanOrEqual(250 + 160); // the renderer's worst case (§4.3)
        const last = tl.strikes[tl.strikes.length - 1];
        expect(last.at + last.hold).toBeCloseTo(tl.strikeEndMs, 6);
      }
    }
  });

  it('is deterministic per seed', () => {
    expect(planArc('click', 77)).toEqual(planArc('click', 77));
  });

  it('keyboard arcs are exactly one 100ms strike at energy 0.45', () => {
    const tl = planArc('key', 3);
    expect(tl.strikes).toHaveLength(1);
    expect(tl.strikeEndMs).toBe(100);
    expect(tl.energy).toBe(0.45);
  });
});

describe('arcIntensity', () => {
  it('never reaches 0 between strikes (dips stay at 0.45)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const tl = planArc('click', seed);
      const first = tl.strikes[0].at;
      for (let t = first; t < tl.strikeEndMs; t += 0.5) {
        const s = arcIntensity(tl, t);
        expect(s.I).toBeGreaterThanOrEqual(TIMELINE.dipLevel);
      }
    }
  });

  it('pre-glow lights the contacts but draws no channel', () => {
    const tl = planArc('ambient', 1);
    const s = arcIntensity(tl, 20);
    expect(s.phase).toBe('preglow');
    expect(s.I).toBe(0);
    expect(s.glow).toBeCloseTo(0.2, 10);
    expect(arcIntensity(tl, tl.preGlowMs).I).toBe(1);
  });

  it('afterglow is monotone decreasing and then the arc is done', () => {
    for (let seed = 0; seed < 100; seed++) {
      const tl = planArc('click', seed);
      let prev = Infinity;
      for (let t = tl.strikeEndMs; t < tl.lifeMs; t += 1) {
        const s = arcIntensity(tl, t);
        expect(s.phase).toBe('afterglow');
        expect(s.I).toBeLessThanOrEqual(prev);
        expect(s.I).toBeLessThanOrEqual(TIMELINE.afterglowStart);
        prev = s.I;
      }
      expect(arcIntensity(tl, tl.lifeMs).phase).toBe('done');
      expect(arcIntensity(tl, tl.lifeMs).I).toBe(0);
      expect(arcDone(tl, tl.lifeMs)).toBe(true);
      expect(arcDone(tl, tl.lifeMs - 1)).toBe(false);
    }
  });

  it('re-strikes are dimmer than the first strike', () => {
    for (let seed = 0; seed < 100; seed++) {
      const tl = planArc('click', seed);
      tl.strikes.forEach((s, i) => expect(s.peak).toBe(i === 0 ? 1 : TIMELINE.restrike));
    }
  });
});

describe('ledger integration', () => {
  it('a refused re-strike goes straight to afterglow', () => {
    const tl = planArc('click', 11);
    const three = [...Array(50).keys()]
      .map((s) => planArc('click', s))
      .find((t) => t.strikes.length === 3)!;
    expect(three).toBeDefined();
    const cut = truncateStrikes(three, 1);
    expect(cut.strikes).toHaveLength(1);
    expect(cut.strikeEndMs).toBeCloseTo(three.strikes[0].at + three.strikes[0].hold, 10);
    expect(arcIntensity(cut, cut.strikeEndMs + 1).phase).toBe('afterglow');
    expect(truncateStrikes(tl, 99)).toBe(tl);
    const none = truncateStrikes(three, 0);
    expect(none.strikes).toHaveLength(0);
    expect(none.lifeMs).toBe(none.preGlowMs);
  });

  it('every strike onset is one ledger entry; a click storm is held to 3 per second', () => {
    const ledger = createFlashLedger();
    const lit: number[] = [];
    for (let click = 0; click < 40; click++) {
      const start = click * 50; // 20 clicks/s
      const tl = planArc('click', click);
      let kept = 0;
      for (const onset of strikeOnsets(tl)) {
        if (!ledger.tryOnset(start + onset)) break;
        lit.push(start + onset);
        kept++;
      }
      truncateStrikes(tl, kept);
    }
    for (const t of lit)
      expect(lit.filter((u) => u >= t && u < t + 1000).length).toBeLessThanOrEqual(3);
  });
});
