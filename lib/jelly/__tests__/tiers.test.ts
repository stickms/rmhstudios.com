/**
 * `lib/jelly/tiers.ts` is the one policy every jelly service reads, so its numbers and its off predicate are pinned
 * here: the budgets are the master plan's R6/R10 table, the motion bounds are vestibular limits that a tuning pass must
 * not quietly exceed, and the degraded-root selector must stay byte-identical to what the glass engine and the cursor
 * runtime already match — three spellings of one predicate is the drift this file exists to end.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AMBIENT_BOUNDS,
  DEGRADED_ROOT_SELECTOR,
  FLASH_LEDGER,
  GAME_PLAYING_BUDGET,
  HANDHELD_QUERY,
  JELLY_BUDGETS,
  JELLY_SELECTOR,
  MOTION_BOUNDS,
  OPT_OUT_SELECTOR,
  electricArcsPref,
  jellyBudget,
  jellyMode,
  jellyMotionLevel,
  jellyOff,
  jellyTier,
  onJellyEnvChange,
  type JellyBudget,
  type JellyTier,
} from '../tiers';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const FINE = '(hover: hover) and (pointer: fine)';

interface FakeOpts {
  classes?: string[];
  attrs?: Record<string, string>;
  media?: string[];
  hidden?: boolean;
  appContrast?: boolean;
}

/** Enough of a document for the policy: class/attribute reads on <html>, matchMedia, one querySelector. */
function fakeDoc(o: FakeOpts = {}): Document {
  const classes = o.classes ?? [];
  const root = {
    matches: (sel: string) =>
      sel.split(',').some((s) => {
        const t = s.trim();
        return t.startsWith('.') && classes.includes(t.slice(1));
      }),
    getAttribute: (n: string) => o.attrs?.[n] ?? null,
  };
  const win = {
    matchMedia: (q: string) => ({
      matches: (o.media ?? []).includes(q),
      addEventListener() {},
      removeEventListener() {},
    }),
  };
  return {
    documentElement: root,
    hidden: o.hidden ?? false,
    defaultView: win,
    querySelector: (s: string) => (o.appContrast && s === '.app-high-contrast' ? {} : null),
  } as unknown as Document;
}

/** A desktop (fine pointer) document with `o` applied on top. */
const fineDoc = (o: FakeOpts = {}) => fakeDoc({ ...o, media: [FINE, ...(o.media ?? [])] });

describe('budgets (R6, R10, 04 §3.1)', () => {
  it('match the final table', () => {
    const row = (t: JellyTier) => {
      const b = JELLY_BUDGETS[t];
      return [
        b.rims,
        b.hazeSlots,
        b.carriers,
        b.bodies,
        b.lattices,
        b.clockHz,
        b.idleClockHz,
        b.clickBolts,
      ];
    };
    expect(row('full')).toEqual([24, 8, 24, 12, 8, 30, 12, 3]);
    expect(row('coarse')).toEqual([16, 6, 16, 8, 6, 30, 12, 2]);
    expect(row('handheld')).toEqual([10, 4, 8, 6, 4, 15, 8, 1]);
    expect(row('lite')).toEqual([0, 0, 0, 3, 0, 0, 0, 0]);
    expect(JELLY_BUDGETS.full.animatedViewports).toBe(1.5);
    expect(JELLY_BUDGETS.coarse.animatedViewports).toBe(1.25);
    expect(JELLY_BUDGETS.handheld.animatedViewports).toBe(1);
  });

  it('ambient arcs: ≤ 1 per 2 s on desktop, half that on handheld (R10), none under perf-lite', () => {
    expect(JELLY_BUDGETS.full.ambientArcMinIntervalMs).toBe(2000);
    expect(JELLY_BUDGETS.coarse.ambientArcMinIntervalMs).toBe(2000);
    expect(JELLY_BUDGETS.handheld.ambientArcMinIntervalMs).toBe(4000);
    expect(JELLY_BUDGETS.lite.ambientArcMinIntervalMs).toBe(Infinity);
    expect(JELLY_BUDGETS.off.ambientArcMinIntervalMs).toBe(Infinity);
  });

  it('only shrink down the tiers', () => {
    const order: JellyTier[] = ['full', 'coarse', 'handheld', 'lite'];
    const keys = Object.keys(JELLY_BUDGETS.full) as (keyof JellyBudget)[];
    for (let i = 1; i < order.length; i++) {
      for (const k of keys) {
        const prev = JELLY_BUDGETS[order[i - 1]!][k];
        const cur = JELLY_BUDGETS[order[i]!][k];
        if (k === 'ambientArcMinIntervalMs') expect(cur).toBeGreaterThanOrEqual(prev);
        else expect(cur).toBeLessThanOrEqual(prev);
      }
    }
  });

  it('keep lattices to the ambient slots, the idle floor under the clock, and nothing ambient when off', () => {
    for (const b of Object.values(JELLY_BUDGETS)) {
      expect(b.lattices).toBe(b.hazeSlots);
      expect(b.hazeSlots).toBeLessThanOrEqual(b.rims);
      expect(b.idleClockHz).toBeLessThanOrEqual(b.clockHz);
    }
    // R7: always moving while someone is there — a 12 Hz floor, never a freeze, on the desktop tiers.
    expect(JELLY_BUDGETS.full.idleClockHz).toBe(12);
    expect(JELLY_BUDGETS.coarse.idleClockHz).toBe(12);
    const off = JELLY_BUDGETS.off;
    expect([off.rims, off.hazeSlots, off.carriers, off.clockHz, off.clickBolts]).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  it('a playing game keeps two rims for the pause UI and nothing else', () => {
    expect(GAME_PLAYING_BUDGET.rims).toBe(2);
    expect(
      GAME_PLAYING_BUDGET.hazeSlots + GAME_PLAYING_BUDGET.carriers + GAME_PLAYING_BUDGET.bodies,
    ).toBe(0);
    expect(GAME_PLAYING_BUDGET.clockHz).toBe(0);
    expect(GAME_PLAYING_BUDGET.clickBolts).toBe(0);
  });
});

describe('safety bounds (04 §4.3–4.5, R12, R13)', () => {
  it('pin the host motion bounds', () => {
    expect(MOTION_BOUNDS).toEqual({
      maxEdgeTravelPx: 4,
      maxScaleDelta: 0.03,
      nudgePx: 1.5,
      nudgeRadiusPx: 24,
      nudgeMax: 4,
    });
  });

  it('pin the site-wide flash ledger to three onsets per second', () => {
    expect(FLASH_LEDGER).toEqual({ maxOnsets: 3, windowMs: 1000 });
  });

  it('pin the ambient bounds, and keep overdraw inside the 2px focus-ring offset', () => {
    expect(AMBIENT_BOUNDS.maxDriftPxPerSecond).toBeLessThanOrEqual(12);
    expect(AMBIENT_BOUNDS.minFeatureSizePx).toBeGreaterThanOrEqual(120);
    expect(AMBIENT_BOUNDS.minLuminancePeriodSeconds).toBeGreaterThanOrEqual(6);
    expect(AMBIENT_BOUNDS.maxLuminanceModulationHz).toBeLessThanOrEqual(3);
    expect(AMBIENT_BOUNDS.largeSurfaceAreaPx2).toBe(250_000);
    expect(AMBIENT_BOUNDS.largeLatticeScale).toBeLessThanOrEqual(0.5);
    expect(AMBIENT_BOUNDS.maxOverdrawPx).toBeLessThanOrEqual(2);
  });
});

describe('selectors', () => {
  it('the degraded root is spelled exactly as the engine and the cursor runtime match it', () => {
    expect(DEGRADED_ROOT_SELECTOR).toBe('.reduce-transparency,.style-high-contrast,.perf-lite');
    for (const file of ['lib/liquid/glass/engine.ts', 'lib/liquid/runtime.ts']) {
      const src = read(file);
      // Either the literal (today) or the shared import (after W2-A/W2-D adopt it).
      expect(
        src.includes(`'${DEGRADED_ROOT_SELECTOR}'`) || src.includes('DEGRADED_ROOT_SELECTOR'),
      ).toBe(true);
    }
  });

  it('every surface the glass engine can draw as a slab is a jelly host', () => {
    const engine = read('lib/liquid/glass/engine.ts');
    const m = engine.match(/const SELECTOR\s*=\s*'([^']+)'/);
    if (!m) return; // the engine imports JELLY_SELECTOR instead: nothing to compare.
    const jelly = JELLY_SELECTOR.split(',');
    for (const part of m[1]!.split(',')) expect(jelly).toContain(part.trim());
  });

  it('covers toasts and explicit opt-ins, and accepts every legacy opt-out alias', () => {
    expect(JELLY_SELECTOR).toContain('[data-sonner-toast]');
    expect(JELLY_SELECTOR).toContain('[data-jelly]');
    for (const alias of [
      '[data-jelly="off"]',
      '[data-liquid-material="off"]',
      '[data-liquid-glass="off"]',
      '[data-liquid-motion="off"]',
      '[data-fluid-press="off"]',
      '[data-fluid-press="none"]',
    ])
      expect(OPT_OUT_SELECTOR.split(',')).toContain(alias);
  });

  it('carries the handheld query verbatim', () => {
    expect(HANDHELD_QUERY).toBe('(pointer: coarse) and (max-width: 1024px)');
  });
});

describe('jellyTier', () => {
  it('reads pointer and width', () => {
    expect(jellyTier({ doc: fakeDoc({ media: [FINE] }) })).toBe('full');
    expect(jellyTier({ doc: fakeDoc() })).toBe('coarse');
    expect(jellyTier({ doc: fakeDoc({ media: [HANDHELD_QUERY] }) })).toBe('handheld');
  });

  it('perf-lite is the lite tier, not off', () => {
    expect(jellyTier({ doc: fakeDoc({ classes: ['perf-lite'], media: [FINE] }) })).toBe('lite');
  });

  it.each([
    [{ classes: ['reduce-transparency'] }],
    [{ classes: ['style-high-contrast'] }],
    [{ classes: ['perf-lite', 'style-high-contrast'] }],
    [{ appContrast: true }],
    [{ media: ['(forced-colors: active)'] }],
    [{ media: ['(prefers-reduced-transparency: reduce)'] }],
    [{ media: ['print'] }],
  ] as [FakeOpts][])('is off for %j', (o) => {
    expect(jellyTier({ doc: fineDoc(o) })).toBe('off');
  });

  it('is not changed by a hidden tab (that is a clock decision)', () => {
    expect(jellyTier({ doc: fakeDoc({ media: [FINE], hidden: true }) })).toBe('full');
  });

  it('is off without a document (SSR)', () => {
    expect(typeof document).toBe('undefined');
    expect(jellyTier()).toBe('off');
  });
});

describe('jellyOff', () => {
  it('is false on a healthy page', () => {
    expect(jellyOff(fakeDoc({ media: [FINE] }))).toBe(false);
  });

  it.each([
    [{ classes: ['perf-lite'] }],
    [{ classes: ['reduce-transparency'] }],
    [{ classes: ['style-high-contrast'] }],
    [{ appContrast: true }],
    [{ media: ['(forced-colors: active)'] }],
    [{ media: ['(prefers-reduced-transparency: reduce)'] }],
    [{ media: ['print'] }],
    [{ hidden: true }],
  ] as [FakeOpts][])('is true for %j', (o) => {
    expect(jellyOff(fakeDoc(o))).toBe(true);
  });

  it('is true without a document (SSR)', () => {
    expect(jellyOff()).toBe(true);
  });
});

describe('preferences', () => {
  it('jellyMotionLevel defaults to lively and ignores unknown values', () => {
    expect(jellyMotionLevel(fakeDoc())).toBe('lively');
    expect(jellyMotionLevel(fakeDoc({ attrs: { 'data-jelly-motion': 'calm' } }))).toBe('calm');
    expect(jellyMotionLevel(fakeDoc({ attrs: { 'data-jelly-motion': 'still' } }))).toBe('still');
    expect(jellyMotionLevel(fakeDoc({ attrs: { 'data-jelly-motion': 'wild' } }))).toBe('lively');
    expect(jellyMotionLevel(undefined)).toBe('lively');
  });

  it('electricArcsPref defaults to full', () => {
    expect(electricArcsPref(fakeDoc())).toBe('full');
    expect(electricArcsPref(fakeDoc({ attrs: { 'data-electric-arcs': 'clicks' } }))).toBe('clicks');
    expect(electricArcsPref(fakeDoc({ attrs: { 'data-electric-arcs': 'off' } }))).toBe('off');
    expect(electricArcsPref(fakeDoc({ attrs: { 'data-electric-arcs': '??' } }))).toBe('full');
  });
});

describe('jellyMode', () => {
  const mode = (o: FakeOpts) => jellyMode({ doc: fineDoc(o) });

  it('is everything on a healthy page', () => {
    expect(mode({})).toEqual({ ambient: true, arcs: 'full', deform: 'full' });
  });

  it('honours the electric arcs preference', () => {
    expect(mode({ attrs: { 'data-electric-arcs': 'clicks' } }).arcs).toBe('clicks');
    expect(mode({ attrs: { 'data-electric-arcs': 'off' } }).arcs).toBe('off');
  });

  it('calm drops ambient arcs but keeps click arcs and the material', () => {
    expect(mode({ attrs: { 'data-jelly-motion': 'calm' } })).toEqual({
      ambient: true,
      arcs: 'clicks',
      deform: 'full',
    });
    expect(mode({ attrs: { 'data-jelly-motion': 'calm', 'data-electric-arcs': 'off' } }).arcs).toBe(
      'off',
    );
  });

  it('still is press only and forces arcs off whatever the arcs preference says (R9)', () => {
    expect(mode({ attrs: { 'data-jelly-motion': 'still', 'data-electric-arcs': 'full' } })).toEqual(
      {
        ambient: false,
        arcs: 'off',
        deform: 'press',
      },
    );
  });

  it.each([
    [{ classes: ['perf-lite'] }],
    [{ classes: ['reduce-transparency'] }],
    [{ classes: ['style-high-contrast'] }],
    [{ appContrast: true }],
    [{ media: ['(prefers-reduced-transparency: reduce)'] }],
  ] as [FakeOpts][])('keeps press but drops the material for %j', (o) => {
    expect(mode(o)).toEqual({ ambient: false, arcs: 'off', deform: 'press' });
  });

  it.each([
    [{ media: ['(forced-colors: active)'] }],
    [{ media: ['print'] }],
    [{ hidden: true }],
    [{ attrs: { 'data-game-state': 'playing' } }],
  ] as [FakeOpts][])('turns everything off for %j', (o) => {
    expect(mode(o)).toEqual({ ambient: false, arcs: 'off', deform: 'off' });
  });

  it('is all off without a document', () => {
    expect(jellyMode()).toEqual({ ambient: false, arcs: 'off', deform: 'off' });
  });
});

describe('jellyBudget', () => {
  const budget = (o: FakeOpts) => jellyBudget({ doc: fineDoc(o) });

  it('is the tier budget on a healthy page', () => {
    expect(budget({})).toEqual(JELLY_BUDGETS.full);
  });

  it('calm halves slots and carriers and caps the clock at 12 Hz', () => {
    const b = budget({ attrs: { 'data-jelly-motion': 'calm' } });
    expect(b.hazeSlots).toBe(4);
    expect(b.carriers).toBe(12);
    expect(b.clockHz).toBe(12);
    expect(b.idleClockHz).toBeLessThanOrEqual(12);
    expect(b.ambientArcMinIntervalMs).toBe(Infinity);
    expect(b.clickBolts).toBe(3);
  });

  it('still zeroes everything ambient and every arc but keeps rims and press bodies', () => {
    const b = budget({ attrs: { 'data-jelly-motion': 'still' } });
    expect([b.hazeSlots, b.carriers, b.clockHz, b.idleClockHz, b.lattices, b.clickBolts]).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(b.ambientArcMinIntervalMs).toBe(Infinity);
    expect(b.rims).toBe(24);
    expect(b.bodies).toBe(12);
  });

  it('a playing game gets the game budget', () => {
    expect(budget({ attrs: { 'data-game-state': 'playing' } })).toEqual(GAME_PLAYING_BUDGET);
  });

  it('never raises a value over the tier', () => {
    for (const o of [
      {},
      { attrs: { 'data-jelly-motion': 'calm' } },
      { attrs: { 'data-electric-arcs': 'clicks' } },
      { classes: ['perf-lite'] },
    ] as FakeOpts[]) {
      const b = budget(o);
      const tier = JELLY_BUDGETS[jellyTier({ doc: fineDoc(o) })];
      for (const k of Object.keys(tier) as (keyof JellyBudget)[]) {
        if (k === 'ambientArcMinIntervalMs') expect(b[k]).toBeGreaterThanOrEqual(tier[k]);
        else expect(b[k]).toBeLessThanOrEqual(tier[k]);
      }
    }
  });
});

describe('onJellyEnvChange', () => {
  type Handler = () => void;
  function watchableDoc() {
    const queries = new Map<string, Set<Handler>>();
    const observers: { cb: Handler; observing: boolean; filter?: string[] }[] = [];
    const docListeners = new Map<string, Set<Handler>>();
    class FakeMO {
      rec: { cb: Handler; observing: boolean; filter?: string[] };
      constructor(cb: Handler) {
        this.rec = { cb, observing: false };
        observers.push(this.rec);
      }
      observe(_t: unknown, opts: { attributeFilter?: string[] }) {
        this.rec.observing = true;
        this.rec.filter = opts.attributeFilter;
      }
      disconnect() {
        this.rec.observing = false;
      }
    }
    const win = {
      matchMedia: (q: string) => {
        if (!queries.has(q)) queries.set(q, new Set());
        const set = queries.get(q)!;
        return {
          matches: false,
          addEventListener: (_: string, fn: Handler) => set.add(fn),
          removeEventListener: (_: string, fn: Handler) => set.delete(fn),
        };
      },
      MutationObserver: FakeMO,
    };
    const doc = {
      documentElement: {},
      defaultView: win,
      addEventListener: (t: string, fn: Handler) => {
        if (!docListeners.has(t)) docListeners.set(t, new Set());
        docListeners.get(t)!.add(fn);
      },
      removeEventListener: (t: string, fn: Handler) => docListeners.get(t)?.delete(fn),
    } as unknown as Document;
    return { doc, queries, observers, docListeners };
  }

  let cleanups: (() => void)[] = [];
  afterEach(() => {
    cleanups.forEach((c) => c());
    cleanups = [];
  });

  it('shares one watcher between subscribers and removes it with the last one', () => {
    const w = watchableDoc();
    let a = 0;
    let b = 0;
    const offA = onJellyEnvChange(() => a++, w.doc);
    const offB = onJellyEnvChange(() => b++, w.doc);
    cleanups.push(offA, offB);
    expect(w.observers.filter((o) => o.observing)).toHaveLength(1);
    expect(w.observers[0]!.filter).toEqual(
      expect.arrayContaining([
        'class',
        'data-jelly-motion',
        'data-electric-arcs',
        'data-game-state',
      ]),
    );
    expect(w.observers[0]!.filter).not.toContain('data-scrolling');

    // A media change, an attribute change and a visibility change all reach both.
    [...w.queries.get('(forced-colors: active)')!][0]!();
    w.observers[0]!.cb();
    [...w.docListeners.get('visibilitychange')!][0]!();
    expect([a, b]).toEqual([3, 3]);

    offA();
    expect(w.observers[0]!.observing).toBe(true);
    offB();
    expect(w.observers[0]!.observing).toBe(false);
    for (const set of w.queries.values()) expect(set.size).toBe(0);
    expect(w.docListeners.get('visibilitychange')!.size).toBe(0);
  });

  it('is a no-op without a document', () => {
    const off = onJellyEnvChange(() => {});
    expect(() => off()).not.toThrow();
  });
});
