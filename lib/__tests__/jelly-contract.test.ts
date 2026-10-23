/**
 * The Plasmatic Jelly contract, made executable (gates N1 and N7, docs/plans/plasmatic-jelly/05-gates-docs-naming.md
 * §2; master plan R6, R7, R9, R10, R12, R13).
 *
 * ## Why this is a gate and not just a unit test
 *
 * `lib/jelly/__tests__/tiers.test.ts` tests that `tiers.ts` computes what it says. This file tests the PROMISES the
 * rest of the site is built on, which every jelly service reads from that one module:
 *
 *  - **N1 — the degradation matrix.** Under every accessibility or weak-device signal (OS reduced transparency, forced
 *    colours, the site and app high-contrast themes, `perf-lite`, print, a hidden tab, a playing game, `jellyMotion =
 *    still`) there is NO ambient motion and NO arc, and the soft body is at most a press acknowledgement. 05 §2 asked
 *    for "deform off" too; 04 §4.7 and the master plan's `JellyDeform` keep an isotropic press under reduced
 *    transparency / high contrast / perf-lite / still (it is not a transparency or ambient effect) and only print,
 *    forced colours, a hidden tab and a playing game remove it. The master plan wins where the plans disagree, so the
 *    gate pins `deform ≤ press`, and `deform = off` exactly where 04 says so.
 *  - **N1 — the budgets.** Upper bounds stated as RELATIONS between the owning modules' constants (no tier outdoes
 *    desktop; the idle floor never exceeds the engaged clock; a haze canvas lives on an admitted rim; Tier L never
 *    exceeds the ambient slots; nothing the governor does raises a value), plus the two bounds that come from outside
 *    the codebase: WCAG 2.3.1 (no more than three flashes in any one-second period) and WCAG 2.2.2 (motion that
 *    starts automatically and lasts more than five seconds needs a pause: `still`). The numbers themselves live in
 *    `lib/jelly/tiers.ts`, `lib/liquid/glass/policy.ts` and `lib/jelly/arcs/rate.ts`; tune them there.
 *  - **N1 — the clock (R7).** The ambient clock is 0 when nobody can see the haze (hidden tab, unfocused window, a
 *    scroll in flight, no haze surface on screen, ambient off) and otherwise NEVER 0: after `IDLE_AFTER_MS` it drops
 *    to the tier's idle floor and stays there — the 2026-10-23 decision that deliberately reverses the 2026-10-08
 *    audit's "a page at rest is idle". `testing/e2e/frame-budget.mjs` derives its rest limit from the same floor.
 *  - **N7 — where arcs may land.** Endpoints come only from admitted jelly surfaces (the registry), never from a
 *    focused field, never further than the arc budget's reach; and (known violation, see below) never a field, an L4
 *    overlay or a toast.
 *
 * Suite runs in `node` (no jsdom), so the documents here are the smallest objects `tiers.ts` reads.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  AMBIENT_BOUNDS,
  CALM,
  FLASH_LEDGER,
  GAME_PLAYING_BUDGET,
  IDLE_AFTER_MS,
  JELLY_BUDGETS,
  JELLY_SELECTOR,
  MOTION_BOUNDS,
  jellyBudget,
  jellyMode,
  jellyOff,
  jellyTier,
  type JellyTier,
} from '@/lib/jelly/tiers';
import { GOVERNOR_MAX_STEP, governBudget } from '@/lib/jelly/governor';
import { REGISTRY_EXCLUDE } from '@/lib/jelly/registry';
import { envelopeCaps } from '@/lib/jelly/envelope';
import { SOFT_BODY, nudgePeak, pickNudgeTargets, softFeatures } from '@/lib/jelly/soft-policy';
import { GLASS_BUDGET, HAZE, ambientHz, type ClockState } from '@/lib/liquid/glass/policy';
import { ARC_BUDGET } from '@/lib/jelly/arcs/rate';
import { buildPairs, clickTargets, nearestRimWithin } from '@/lib/jelly/arcs/pairs';
import { createFlashLedger } from '@/lib/jelly/arcs/ledger';
import { createJellyBus } from '@/lib/jelly/bus';
import type { JellyEntry, JellyRegistry } from '@/lib/jelly/registry';
import { activeElectricArcs, installElectricArcs, strike } from '@/lib/jelly/arcs';
import { FakeEl, fakeEnv } from '@/lib/jelly/arcs/__tests__/arc-dom';

// ── A minimal document ───────────────────────────────────────────────────────

interface DocOpts {
  classes?: string[];
  attrs?: Record<string, string>;
  media?: string[];
  hidden?: boolean;
  appHighContrast?: boolean;
}

const FINE = '(hover: hover) and (pointer: fine)';

function fakeDoc(o: DocOpts = {}): Document {
  const classes = new Set(o.classes ?? []);
  const attrs = new Map(Object.entries(o.attrs ?? {}));
  const media = new Set(o.media ?? [FINE]);
  const root = {
    matches: (sel: string) =>
      sel.split(',').some((s) => s.trim().startsWith('.') && classes.has(s.trim().slice(1))),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  };
  const win = { matchMedia: (q: string) => ({ matches: media.has(q) }) };
  return {
    documentElement: root,
    defaultView: win,
    hidden: !!o.hidden,
    querySelector: (sel: string) =>
      sel === '.app-high-contrast' && o.appHighContrast ? ({} as Element) : null,
  } as unknown as Document;
}

/** Every signal that must stand the material down, with what 04 §4.7 leaves of the soft body. */
const DEGRADED: Array<[string, DocOpts, 'press' | 'off']> = [
  ['OS reduced transparency', { media: [FINE, '(prefers-reduced-transparency: reduce)'] }, 'press'],
  ['forced colours', { media: [FINE, '(forced-colors: active)'] }, 'off'],
  ['print', { media: [FINE, 'print'] }, 'off'],
  ['the site high-contrast theme', { classes: ['style-high-contrast'] }, 'press'],
  ['the app high-contrast theme', { appHighContrast: true }, 'press'],
  ['the legacy reduce-transparency class', { classes: ['reduce-transparency'] }, 'press'],
  ['perf-lite', { classes: ['perf-lite'] }, 'press'],
  ['a hidden tab', { hidden: true }, 'off'],
  ['a game in play (R16)', { attrs: { 'data-game-state': 'playing' } }, 'off'],
  ['jellyMotion = still (R8, WCAG 2.2.2)', { attrs: { 'data-jelly-motion': 'still' } }, 'press'],
];

const TIERS = Object.keys(JELLY_BUDGETS) as JellyTier[];
const LIVE_TIERS = TIERS.filter((t) => JELLY_BUDGETS[t].clockHz > 0);

// ── N1: the degradation matrix ───────────────────────────────────────────────

describe('N1 — every degraded state stands the material down', () => {
  it('the default document is fully on (the control for every row below)', () => {
    const doc = fakeDoc();
    expect(jellyTier({ doc })).toBe('full');
    expect(jellyMode({ doc })).toEqual({ ambient: true, arcs: 'full', deform: 'full' });
  });

  it.each(DEGRADED)('%s: no ambient motion, no arcs, at most a press', (_label, opts, deform) => {
    const doc = fakeDoc(opts);
    const mode = jellyMode({ doc });
    expect(mode.ambient).toBe(false);
    expect(mode.arcs).toBe('off');
    expect(mode.deform).toBe(deform);
  });

  it.each(DEGRADED)('%s: the budget has nothing ambient left to spend', (_label, opts) => {
    const b = jellyBudget({ doc: fakeDoc(opts) });
    expect(b.hazeSlots).toBe(0);
    expect(b.carriers).toBe(0);
    expect(b.animatedViewports).toBe(0);
    expect(b.clockHz).toBe(0);
    expect(b.idleClockHz).toBe(0);
    expect(b.lattices).toBe(0);
    expect(b.clickBolts).toBe(0);
    expect(b.ambientArcMinIntervalMs).toBe(Infinity);
  });

  it('every material-off signal is also jellyOff (the engine, carriers and arcs read it)', () => {
    for (const [label, opts] of DEGRADED) {
      if (label.startsWith('a game') || label.startsWith('jellyMotion')) continue; // mode-level, not material-off
      expect(jellyOff(fakeDoc(opts)), label).toBe(true);
    }
  });

  it('electricArcs = off removes arcs and nothing else; still overrides electricArcs = full (R9)', () => {
    const off = jellyMode({ doc: fakeDoc({ attrs: { 'data-electric-arcs': 'off' } }) });
    expect(off).toEqual({ ambient: true, arcs: 'off', deform: 'full' });
    const still = jellyMode({
      doc: fakeDoc({ attrs: { 'data-jelly-motion': 'still', 'data-electric-arcs': 'full' } }),
    });
    expect(still.arcs).toBe('off');
  });

  it('calm keeps clicks but no ambient arcs, and never runs faster than its cap', () => {
    const doc = fakeDoc({ attrs: { 'data-jelly-motion': 'calm' } });
    expect(jellyMode({ doc }).arcs).toBe('clicks');
    const b = jellyBudget({ doc });
    expect(b.ambientArcMinIntervalMs).toBe(Infinity);
    expect(b.clockHz).toBeLessThanOrEqual(CALM.maxClockHz);
    expect(b.hazeSlots).toBeLessThanOrEqual(JELLY_BUDGETS.full.hazeSlots);
  });

  it('a degraded tier keeps no soft-body extras: no wobble, hover, nudge or lattice', () => {
    for (const [tier, motion] of [
      ['lite', 'lively'],
      ['off', 'lively'],
      ['full', 'still'],
    ] as const) {
      const f = softFeatures(tier, motion);
      expect(f, `${tier}/${motion}`).toMatchObject({
        wobble: false,
        hover: false,
        nudge: false,
        lattice: false,
        lattices: 0,
      });
    }
    expect(softFeatures('full', 'calm').nudge, 'calm: no neighbour nudge (04 §4.2)').toBe(false);
  });
});

// ── N1: budgets as relations ────────────────────────────────────────────────

describe('N1 — budgets: upper bounds the services cannot exceed', () => {
  it('no tier outspends desktop, and the off tiers spend nothing ambient', () => {
    const full = JELLY_BUDGETS.full;
    for (const t of TIERS) {
      const b = JELLY_BUDGETS[t];
      for (const k of Object.keys(full) as (keyof typeof full)[]) {
        if (k === 'ambientArcMinIntervalMs') {
          expect(b[k], `${t}.${k}`).toBeGreaterThanOrEqual(full[k]);
        } else {
          expect(b[k], `${t}.${k}`).toBeLessThanOrEqual(full[k]);
        }
      }
    }
    for (const t of ['lite', 'off'] as const) {
      expect(JELLY_BUDGETS[t]).toMatchObject({
        hazeSlots: 0,
        carriers: 0,
        clockHz: 0,
        clickBolts: 0,
      });
    }
  });

  it('every haze slot is an admitted rim, every lattice an ambient slot, every rim inside the engine cap', () => {
    for (const t of TIERS) {
      const b = JELLY_BUDGETS[t];
      expect(b.rims, t).toBeLessThanOrEqual(GLASS_BUDGET.maxSurfaces);
      expect(b.hazeSlots, t).toBeLessThanOrEqual(b.rims);
      // R6 / 04 §6 hand-off: Tier L cap = ambient slots, not the engine's 24.
      expect(b.lattices, t).toBeLessThanOrEqual(b.hazeSlots);
      expect(b.idleClockHz, t).toBeLessThanOrEqual(b.clockHz);
    }
    expect(HAZE.maxDrawsPerFrame).toBeLessThanOrEqual(JELLY_BUDGETS.full.hazeSlots);
  });

  it('R7: a live tier never idles to 0 while visible', () => {
    expect(LIVE_TIERS.length).toBeGreaterThan(0);
    for (const t of LIVE_TIERS) expect(JELLY_BUDGETS[t].idleClockHz, t).toBeGreaterThan(0);
  });

  it('R10: handheld ambient arcs run at no more than half the desktop rate', () => {
    expect(JELLY_BUDGETS.handheld.ambientArcMinIntervalMs).toBeGreaterThanOrEqual(
      2 * JELLY_BUDGETS.full.ambientArcMinIntervalMs,
    );
  });

  it('a playing game keeps only the pause UI rims and nothing that moves on its own (R16)', () => {
    expect(GAME_PLAYING_BUDGET).toMatchObject({
      hazeSlots: 0,
      carriers: 0,
      clockHz: 0,
      idleClockHz: 0,
      bodies: 0,
      lattices: 0,
      clickBolts: 0,
      ambientArcMinIntervalMs: Infinity,
    });
    expect(GAME_PLAYING_BUDGET.rims).toBeLessThanOrEqual(JELLY_BUDGETS.full.rims);
  });

  it('the governor only ever lowers a budget', () => {
    for (const t of TIERS) {
      const base = JELLY_BUDGETS[t];
      for (let step = 0; step <= GOVERNOR_MAX_STEP; step++) {
        const g = governBudget(base, step);
        for (const k of Object.keys(base) as (keyof typeof base)[]) {
          if (k === 'ambientArcMinIntervalMs') expect(g[k]).toBeGreaterThanOrEqual(base[k]);
          else expect(g[k], `${t}@${step}.${k}`).toBeLessThanOrEqual(base[k]);
        }
      }
    }
  });
});

// ── N1: the ambient clock (R7) ──────────────────────────────────────────────

describe('N1 — the ambient clock is 0 only when nobody can see the haze (R7)', () => {
  const full = JELLY_BUDGETS.full;
  const engaged: ClockState = {
    hidden: false,
    focused: true,
    scrolling: false,
    hazeSurfaces: 3,
    ambient: true,
    msSinceInput: 0,
    clockHz: full.clockHz,
    idleClockHz: full.idleClockHz,
  };

  it('engaged runs at the tier clock, never above it', () => {
    expect(ambientHz(engaged)).toBe(full.clockHz);
  });

  it.each<[string, Partial<ClockState>]>([
    ['hidden tab', { hidden: true }],
    ['unfocused window', { focused: false }],
    ['a scroll in flight', { scrolling: true }],
    ['no haze surface on screen', { hazeSurfaces: 0 }],
    ['ambient off (still, degraded, a game)', { ambient: false }],
  ])('%s → 0 Hz (no frame scheduled)', (_l, patch) => {
    expect(ambientHz({ ...engaged, ...patch })).toBe(0);
  });

  it('after IDLE_AFTER_MS it drops to the idle floor and stays there: no freeze (R7 reverses the 120 s freeze)', () => {
    expect(ambientHz({ ...engaged, msSinceInput: IDLE_AFTER_MS + 1 })).toBe(full.idleClockHz);
    expect(ambientHz({ ...engaged, msSinceInput: 60 * 60 * 1000 })).toBe(full.idleClockHz);
    expect(full.idleClockHz).toBeGreaterThan(0);
  });

  it('WCAG 2.2.2: the idle threshold is longer than the 5 s the criterion allows before a pause is needed', () => {
    // Below 5 s nothing would need pausing; the `still` preference is the pause for everything after.
    expect(IDLE_AFTER_MS).toBeGreaterThanOrEqual(5000);
  });

  it('frame-budget.mjs derives its rest limit from this floor instead of restating it', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('testing/e2e/frame-budget.mjs', 'utf8');
    expect(src).toMatch(/from '\.\.\/\.\.\/lib\/jelly\/tiers\.ts'/);
    expect(src).toMatch(/idleClockHz/);
  });
});

// ── N1: photosensitivity and motion bounds ──────────────────────────────────

describe('N1 — flashes and motion stay inside the safety bounds', () => {
  it('WCAG 2.3.1: at most three flashes in any one-second window, from one site-wide ledger', () => {
    expect(FLASH_LEDGER.maxOnsets / (FLASH_LEDGER.windowMs / 1000)).toBeLessThanOrEqual(3);
    expect(ARC_BUDGET.flashMax).toBe(FLASH_LEDGER.maxOnsets);
    expect(ARC_BUDGET.flashWindowMs).toBe(FLASH_LEDGER.windowMs);
    const ledger = createFlashLedger();
    let admitted = 0;
    for (let t = 0; t < 1000; t += 10) if (ledger.tryOnset(t)) admitted++;
    expect(admitted).toBeLessThanOrEqual(FLASH_LEDGER.maxOnsets);
  });

  it('ambient arcs never come faster than the arc budget allows, on any tier', () => {
    const fastest = 1000 / ARC_BUDGET.maxAmbientRate;
    expect(ARC_BUDGET.minAmbientIntervalMs).toBeLessThanOrEqual(fastest);
    for (const t of TIERS) {
      expect(JELLY_BUDGETS[t].ambientArcMinIntervalMs, t).toBeGreaterThanOrEqual(fastest);
      expect(JELLY_BUDGETS[t].clickBolts, t).toBeLessThanOrEqual(ARC_BUDGET.maxClickBolts);
    }
  });

  it('a host moves at most MOTION_BOUNDS: translate and scale caps never exceed the edge-travel bound', () => {
    for (const size of [
      { w: 24, h: 24 },
      { w: 120, h: 44 },
      { w: 600, h: 320 },
      { w: 1400, h: 900 },
    ]) {
      const c = envelopeCaps(size);
      const edge = c.translate + Math.max(c.scaleX * size.w, c.scaleY * size.h) / 2;
      expect(edge, `${size.w}×${size.h}`).toBeLessThanOrEqual(MOTION_BOUNDS.maxEdgeTravelPx + 1e-9);
      expect(c.scaleX).toBeLessThanOrEqual(MOTION_BOUNDS.maxScaleDelta);
      expect(c.scaleY).toBeLessThanOrEqual(MOTION_BOUNDS.maxScaleDelta);
      expect(c.lean).toBeLessThanOrEqual(c.translate);
    }
    expect(SOFT_BODY.hoverPlump).toBeLessThanOrEqual(MOTION_BOUNDS.maxScaleDelta);
    expect(SOFT_BODY.pressSquash).toBeLessThanOrEqual(MOTION_BOUNDS.maxScaleDelta);
    expect(MOTION_BOUNDS.nudgePx).toBeLessThanOrEqual(MOTION_BOUNDS.maxEdgeTravelPx);
  });

  it('R12: a nudge is ≤ nudgePx, only within nudgeRadiusPx, at most nudgeMax neighbours, never during scroll', () => {
    expect(nudgePeak(0)).toBeLessThanOrEqual(MOTION_BOUNDS.nudgePx);
    expect(nudgePeak(MOTION_BOUNDS.nudgeRadiusPx + 0.01)).toBe(0);
    const src = { x: 100, y: 100, w: 100, h: 40 };
    const ring = Array.from({ length: 12 }, (_, i) => ({
      key: i,
      rect: { x: 100 + (i - 6) * 20, y: 100 + 40 + 2 + (i % 3), w: 18, h: 18 },
    }));
    const hit = pickNudgeTargets(src, ring, 100);
    expect(hit.length).toBeLessThanOrEqual(MOTION_BOUNDS.nudgeMax);
    for (const t of hit) expect(t.peak).toBeLessThanOrEqual(MOTION_BOUNDS.nudgePx);
    expect(pickNudgeTargets(src, ring, 100, 0), 'a scroll just happened').toEqual([]);
  });

  it('no jelly layer overdraws its host past the focus ring offset (04 §4.5)', () => {
    expect(AMBIENT_BOUNDS.maxOverdrawPx).toBeLessThanOrEqual(2);
  });
});

// ── N7: where arcs may land ─────────────────────────────────────────────────

/** A fake element whose `closest()` understands the simple selectors the arc runtime asks about. */
class Tagged extends FakeEl {
  classes: Set<string>;
  constructor(
    tag: string,
    box: { left: number; top: number; width: number; height: number },
    classes: string[] = [],
    attrs: Record<string, string> = {},
  ) {
    super(tag, box, true);
    this.classes = new Set(classes);
    for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
  }
  private simple(sel: string): boolean {
    const s = sel.trim().replace(/:not\([^)]*\)/g, '');
    if (s === '') return false;
    const m = /^([a-z]*)((?:\.[\w-]+|\[[^\]]+\])*)$/i.exec(s);
    if (!m) return false;
    if (m[1] && m[1].toLowerCase() !== this.tag) return false;
    for (const part of m[2].match(/\.[\w-]+|\[[^\]]+\]/g) ?? []) {
      if (part.startsWith('.')) {
        if (!this.classes.has(part.slice(1))) return false;
      } else {
        const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
        if (!a) return false;
        const v = this.getAttribute(a[1]);
        if (v === null || (a[2] !== undefined && v !== a[2])) return false;
      }
    }
    return !!(m[1] || m[2]);
  }
  override matches(sel?: string): boolean {
    return typeof sel === 'string' && sel.split(',').some((s) => this.simple(s));
  }
  override closest(sel: string) {
    return this.matches(sel) ? this : null;
  }
}

function registryOf(els: FakeEl[]): JellyRegistry {
  const entries: JellyEntry[] = els.map((el, order) => ({
    el: el as unknown as Element,
    role: 'control',
    order,
    visible: true,
    rect: { ...el.box },
  }));
  return {
    visible: () => entries,
    ambientSlots: () => [],
    liveSet: () => [],
    entryFor: () => undefined,
    onChange: () => () => {},
    scrolling: false,
    epoch: 0,
    refresh: () => {},
    dispose: () => {},
  };
}

describe('N7 — arcs reach only admitted surfaces, never past their range', () => {
  it('pairs, click targets and the cursor discharge all stop at the arc budget reach', () => {
    const at = (x: number) => ({ x, y: 0, w: 40, h: 40, r: 8 });
    expect(buildPairs([at(0), at(40 + ARC_BUDGET.maxGap - 1)])).toHaveLength(1);
    expect(buildPairs([at(0), at(40 + ARC_BUDGET.maxGap + 1)])).toEqual([]);
    expect(clickTargets(0, [at(0), at(40 + ARC_BUDGET.clickRadius + 1)])).toEqual([]);
    expect(nearestRimWithin({ x: 40 + ARC_BUDGET.dischargeRadius + 1, y: 20 }, [at(0)])).toBeNull();
  });

  it('the registry never admits a media element or the globe / eversion layers', () => {
    for (const s of ['canvas', 'video', 'iframe', '.eversion-overlay', '.radial-globe__stage']) {
      expect(REGISTRY_EXCLUDE.split(',')).toContain(s);
    }
    // And the arc layer itself is no jelly host.
    expect(JELLY_SELECTOR).not.toMatch(/jelly-arc-layer/);
  });

  function arcHarness(els: Tagged[]) {
    vi.useFakeTimers();
    const env = fakeEnv();
    const bus = createJellyBus();
    const endpoints: Element[] = [];
    bus.on('arc:strike', (p) => endpoints.push(p.el));
    const off = installElectricArcs(env.doc, {
      registry: registryOf(els),
      seed: 7,
      warmupMs: 3000,
      ledger: createFlashLedger(),
      bus,
    });
    const drain = () => {
      for (let i = 0; i < 60 && env.rafQueue.size; i++) {
        vi.advanceTimersByTime(16);
        env.frame();
      }
    };
    const stop = () => {
      off();
      vi.useRealTimers();
    };
    return { env, endpoints, drain, stop };
  }

  it('a click strikes only registered neighbours, and never a focused field', () => {
    const a = new Tagged('button', { left: 100, top: 100, width: 80, height: 32 });
    const b = new Tagged('button', { left: 190, top: 100, width: 80, height: 32 });
    const field = new Tagged('textarea', { left: 100, top: 140, width: 170, height: 40 });
    const stray = new Tagged('div', { left: 280, top: 100, width: 80, height: 32 });
    const h = arcHarness([a, b, field]);
    try {
      (h.env.doc as unknown as { activeElement: unknown }).activeElement = field;
      for (let i = 0; i < 8; i++) {
        h.env.docListeners.dispatch('pointerdown', {
          isPrimary: true,
          pointerType: 'mouse',
          button: 0,
          target: a,
          clientX: 140,
          clientY: 116,
        });
        h.drain();
        vi.advanceTimersByTime(1100);
      }
      expect(activeElectricArcs()).not.toBeNull();
      expect(h.endpoints.length, 'the harness must actually throw arcs').toBeGreaterThan(0);
      const allowed = new Set<unknown>([a, b]);
      for (const el of h.endpoints) expect(allowed.has(el)).toBe(true);
      expect(h.endpoints).not.toContain(stray);
      expect(h.endpoints).not.toContain(field);
    } finally {
      h.stop();
    }
  });

  /** 05 §2 N7 and 04 §4.4 rule 3: fields, text-bearing L4 overlays and toasts are never arc endpoints. */
  it.each([
    ['an unfocused field (.glass-inset)', ['glass-inset'], {}],
    ['an L4 overlay (.glass-overlay)', ['glass-overlay'], {}],
    ['a toast ([data-sonner-toast])', [], { 'data-sonner-toast': '' }],
  ] as const)('never lands on %s', (_label, classes, attrs) => {
    const a = new Tagged('button', { left: 100, top: 100, width: 80, height: 32 });
    const target = new Tagged(
      'div',
      { left: 190, top: 100, width: 160, height: 60 },
      [...classes],
      {
        ...attrs,
      },
    );
    const h = arcHarness([a, target]);
    try {
      expect(strike(a as unknown as Element, target as unknown as Element, { kind: 'click' })).toBe(
        false,
      );
    } finally {
      h.stop();
    }
  });
});

/**
 * N13 — never fake a law (CLAUDE.md "Design system: Plasmatic Jelly" → "Never fake a law";
 * docs/plasmatic-jelly-system.md §10).
 *
 * Wobble, glow, ripple, flicker and the press lens are forces in the services, never stylesheet animation. So in the
 * jelly sheets (`app/jelly*.css` and the role base `app/liquid-glass.css`):
 *  - no transition of `transform` / `translate` / `scale` / `rotate` / `all` — a body's motion is the soft body's
 *    spring, and a CSS transition on top of it is a second, unphysical spring that also fights the envelope writes;
 *  - no `@keyframes` except the sanctioned `.jelly-flow` haze drift (`jelly-drift`, `jelly-current`; N3 in
 *    `site-infinite-animation.test.ts` pins where they may be used);
 *  - no `filter` (or `backdrop-filter`) declaration other than `none` — the only filter on a body is the press lens,
 *    set from `lib/jelly/lens.ts` while the dent exists. Likewise, under `lib/jelly` and `lib/liquid` only `lens.ts`
 *    writes an element's `style.filter`.
 */
describe('N13 — never fake a law', () => {
  const ROOT = process.cwd();
  const SANCTIONED_KEYFRAMES = new Set(['jelly-drift', 'jelly-current']);
  const SHEETS = [
    ...fs
      .readdirSync(path.join(ROOT, 'app'))
      .filter((f) => /^jelly[\w-]*\.css$/.test(f))
      .map((f) => `app/${f}`),
    'app/liquid-glass.css',
  ].sort();
  const css = (f: string) =>
    fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  /** Every `prop: value` declaration (values may span lines), with its line number. */
  const decls = (f: string) => {
    const src = css(f);
    const out: { prop: string; value: string; line: number }[] = [];
    for (const m of src.matchAll(/(?<=[{;\s])(-?[a-z-]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
      out.push({
        prop: m[1].toLowerCase(),
        value: m[2].replace(/\s+/g, ' ').trim(),
        line: src.slice(0, m.index).split('\n').length,
      });
    }
    return out;
  };

  it('scans the jelly sheets', () => {
    expect(SHEETS).toContain('app/jelly-material.css');
    expect(SHEETS).toContain('app/jelly-arcs.css');
    expect(SHEETS.every((f) => fs.existsSync(path.join(ROOT, f)))).toBe(true);
  });

  it('no transform transition on a jelly body (the spring is the soft body’s, not CSS’s)', () => {
    const MOVING = /(^|[\s,])(transform|translate|scale|rotate|all)(?=[\s,]|$)/;
    const offenders = SHEETS.flatMap((f) =>
      decls(f)
        .filter(
          (d) =>
            (d.prop === 'transition' || d.prop === 'transition-property') && MOVING.test(d.value),
        )
        .map((d) => `${f}:${d.line} ${d.prop}: ${d.value}`),
    );
    expect(
      offenders,
      'A transition on transform/translate/scale/rotate is a fake spring. Hover lean, press squash, the dent and ' +
        'release wobble come from lib/jelly/physics.ts (docs/plasmatic-jelly-system.md §10).',
    ).toEqual([]);
  });

  it('no @keyframes but the sanctioned .jelly-flow haze drift', () => {
    const offenders = SHEETS.flatMap((f) =>
      [...css(f).matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)]
        .map((m) => m[1])
        .filter((name) => !SANCTIONED_KEYFRAMES.has(name))
        .map((name) => `${f}: @keyframes ${name}`),
    );
    expect(
      offenders,
      'A keyframe wobble, glow, ripple or flicker fakes a law. Add a force (with a constant in lib/jelly/tiers.ts) ' +
        'to the services instead (docs/plasmatic-jelly-system.md §10).',
    ).toEqual([]);
  });

  it('no filter in jelly CSS: the lens is applied from lib/jelly/lens.ts only', () => {
    const offenders = SHEETS.flatMap((f) =>
      decls(f)
        .filter((d) => /^(-webkit-)?(backdrop-)?filter$/.test(d.prop) && d.value !== 'none')
        .map((d) => `${f}:${d.line} ${d.prop}: ${d.value}`),
    );
    expect(
      offenders,
      'No stylesheet filters a jelly body. The press lens is set (and removed) by lib/jelly/lens.ts while the ' +
        'dent exists (docs/plasmatic-jelly-system.md §3.1).',
    ).toEqual([]);
  });

  it('under lib/jelly and lib/liquid, only lib/jelly/lens.ts writes an element filter', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(rel);
        } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(rel);
      }
    };
    walk('lib/jelly');
    walk('lib/liquid');
    const WRITE =
      /\.style\.(?:webkitF|f)ilter\s*=(?!=)|setProperty\(\s*['"](?:-webkit-)?filter['"]/;
    const offenders = files.filter((f) => {
      if (f === 'lib/jelly/lens.ts') return false;
      const src = fs
        .readFileSync(path.join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      return WRITE.test(src);
    });
    expect(offenders, 'The press lens has one owner, lib/jelly/lens.ts.').toEqual([]);
  });
});
