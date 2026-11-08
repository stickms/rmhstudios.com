/**
 * The Plasmatic Jelly contract, made executable (gates N1 and N7, docs/plans/plasmatic-jelly/05-gates-docs-naming.md
 * §2; master plan R6, R7, R9, R10, R12, R13).
 *
 * ## Why this is a gate and not just a unit test
 *
 * `lib/jelly/__tests__/tiers.test.ts` tests that `tiers.ts` computes what it says. This file tests the PROMISES the
 * rest of the site is built on, which every jelly service that still runs JavaScript (the globe and its cursor, the
 * click arcs) reads from that one module:
 *
 *  - **N1 — the degradation matrix.** Under every accessibility or weak-device signal (the app high-contrast theme,
 *    `perf-lite`, print, a hidden tab, a playing game, `jellyMotion = still`) there is NO ambient motion and NO arc.
 *    (The soft body is CSS now and answers to the same signals through selectors, pinned by `jelly-soft-body.test.ts`
 *    and `jelly-woken-haze.test.ts`.)
 *  - **N1 — the budgets.** Upper bounds stated as RELATIONS between the owning modules' constants (no tier outdoes
 *    desktop; the idle floor never exceeds the engaged clock), plus the two bounds that come from outside the
 *    codebase: WCAG 2.3.1 (no more than three flashes in any one-second period) and WCAG 2.2.2 (motion that starts
 *    automatically and lasts more than five seconds needs a pause: `still`). The numbers themselves live in
 *    `lib/jelly/tiers.ts` and `lib/jelly/arcs/rate.ts`; tune them there.
 *  - **N1 — the clock (R7).** The globe's ambient clock is 0 when nobody can see it and otherwise NEVER 0: after
 *    `IDLE_AFTER_MS` it drops to the tier's idle floor and stays there — the 2026-10-23 decision that deliberately
 *    reverses the 2026-10-08 audit's "a page at rest is idle". `testing/e2e/frame-budget.mjs` derives its rest limit
 *    from the same floor.
 *  - **N7 — where arcs may land.** Endpoints come only from admitted jelly surfaces (the registry), never from a
 *    focused field, never further than the arc budget's reach; and never a field, an L4 overlay or a toast.
 *
 * Suite runs in `node` (no jsdom), so the documents here are the smallest objects `tiers.ts` reads.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
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
import { REGISTRY_EXCLUDE } from '@/lib/jelly/registry';
import { SOFT_BODY } from '@/lib/jelly/soft-policy';
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

/** Every signal that must stand the material down. */
const DEGRADED: Array<[string, DocOpts]> = [
  ['print', { media: [FINE, 'print'] }],
  ['the app high-contrast theme', { appHighContrast: true }],
  ['perf-lite', { classes: ['perf-lite'] }],
  ['a hidden tab', { hidden: true }],
  ['a game in play (R16)', { attrs: { 'data-game-state': 'playing' } }],
];

const TIERS = Object.keys(JELLY_BUDGETS) as JellyTier[];
const LIVE_TIERS = TIERS.filter((t) => JELLY_BUDGETS[t].clockHz > 0);

// ── N1: the degradation matrix ───────────────────────────────────────────────

describe('N1 — every degraded state stands the material down', () => {
  it('the default document is fully on (the control for every row below)', () => {
    const doc = fakeDoc();
    expect(jellyTier({ doc })).toBe('full');
    expect(jellyMode({ doc })).toEqual({ ambient: true, arcs: 'full' });
  });

  it.each(DEGRADED)('%s: no ambient motion, no arcs', (_label, opts) => {
    const doc = fakeDoc(opts);
    const mode = jellyMode({ doc });
    expect(mode.ambient).toBe(false);
    expect(mode.arcs).toBe('off');
  });

  it.each(DEGRADED)('%s: the budget has nothing ambient left to spend', (_label, opts) => {
    const b = jellyBudget({ doc: fakeDoc(opts) });
    expect(b.clockHz).toBe(0);
    expect(b.idleClockHz).toBe(0);
    expect(b.clickBolts).toBe(0);
    expect(b.ambientArcMinIntervalMs).toBe(Infinity);
  });

  it('every material-off signal is also jellyOff (the globe and the arcs read it)', () => {
    for (const [label, opts] of DEGRADED) {
      if (label.startsWith('a game') || label.startsWith('jellyMotion')) continue; // mode-level, not material-off
      expect(jellyOff(fakeDoc(opts)), label).toBe(true);
    }
  });

  it('electricArcs = off removes arcs and nothing else; still overrides electricArcs = full (R9)', () => {
    const off = jellyMode({ doc: fakeDoc({ attrs: { 'data-electric-arcs': 'off' } }) });
    expect(off).toEqual({ ambient: true, arcs: 'off' });
    const still = jellyMode({
      doc: fakeDoc({ attrs: { 'data-jelly-motion': 'still', 'data-electric-arcs': 'full' } }),
    });
    expect(still.arcs).toBe('off');
    expect(still.ambient).toBe(false);
    const budget = jellyBudget({ doc: fakeDoc({ attrs: { 'data-jelly-motion': 'still' } }) });
    expect([budget.clockHz, budget.idleClockHz, budget.clickBolts]).toEqual([0, 0, 0]);
  });

  it('calm keeps clicks but no ambient arcs, and never runs faster than its cap', () => {
    const doc = fakeDoc({ attrs: { 'data-jelly-motion': 'calm' } });
    expect(jellyMode({ doc }).arcs).toBe('clicks');
    const b = jellyBudget({ doc });
    expect(b.ambientArcMinIntervalMs).toBe(Infinity);
    expect(b.clockHz).toBeLessThanOrEqual(CALM.maxClockHz);
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
      expect(JELLY_BUDGETS[t]).toMatchObject({ clockHz: 0, clickBolts: 0 });
    }
  });

  it('the idle floor never exceeds the engaged clock', () => {
    for (const t of TIERS) expect(JELLY_BUDGETS[t].idleClockHz, t).toBeLessThanOrEqual(JELLY_BUDGETS[t].clockHz);
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

  it('a playing game keeps nothing that moves on its own (R16)', () => {
    expect(GAME_PLAYING_BUDGET).toMatchObject({
      clockHz: 0,
      idleClockHz: 0,
      clickBolts: 0,
      ambientArcMinIntervalMs: Infinity,
    });
  });
});

// ── N1: the ambient clock (R7) ──────────────────────────────────────────────

describe('N1 — the globe clock is 0 only when nobody can see it (R7)', () => {
  const full = JELLY_BUDGETS.full;

  it('the idle floor is above 0 on every live tier and below the engaged clock: no freeze (R7 reverses the 120 s freeze)', () => {
    expect(full.idleClockHz).toBeGreaterThan(0);
    expect(full.idleClockHz).toBeLessThanOrEqual(full.clockHz);
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

  it('a host moves at most MOTION_BOUNDS: the configured poses never exceed the scale or edge-travel bound', () => {
    expect(SOFT_BODY.hoverPlump).toBeLessThanOrEqual(MOTION_BOUNDS.maxScaleDelta);
    expect(SOFT_BODY.pressSquash).toBeLessThanOrEqual(MOTION_BOUNDS.maxScaleDelta);
    expect(MOTION_BOUNDS.nudgePx).toBeLessThanOrEqual(MOTION_BOUNDS.maxEdgeTravelPx);
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
    order,
    visible: true,
    rect: { ...el.box },
  }));
  return {
    visible: () => entries,
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
 *  - no transition of `transform` / `translate` / `scale` / `rotate` / `all` except on the soft body's own spring: the
 *    soft body is CSS now (app/jelly-material.css §8, CSS-first jelly PR 3), so a moving property may transition only
 *    on a generated `--spring-*` curve (jelly-spring-tokens.test.ts holds those equal to the springs). An ease or a
 *    duration of its own on a moving property is a fake spring; this covers the `--jelly-spring-t` hook too;
 *  - no `@keyframes` except the sanctioned haze drift (`jelly-drift`), run by the woken-haze layer
 *    (the glass roles' own `::after`, CSS-first jelly PR 2); N3 in
 *    `site-infinite-animation.test.ts` pins where they may be used;
 *  - no `filter` (or `backdrop-filter`) declaration other than `none`; the press lens that used to be the one filter on
 *    a body is retired, so nothing under `lib/jelly` or `lib/liquid` writes an element's `style.filter` either.
 */
describe('N13 — never fake a law', () => {
  const ROOT = process.cwd();
  const SANCTIONED_KEYFRAMES = new Set(['jelly-drift']);
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
  const decls = (f: string) => declsOf(css(f));
  const declsOf = (src: string) => {
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

  const MOVING = /(^|[\s,])(transform|translate|scale|rotate|all)(?=[\s,]|$)/;
  /** Top-level comma segments of a transition list (commas nest inside calc()/var()). */
  const segments = (v: string) => {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of v) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const SPRUNG = /^(?:translate|scale) var\(--spring-[\w-]+-dur\) var\(--spring-[\w-]+\)$/;
  /**
   * The fake springs in one sheet's (comment-stripped) source. Shorthands (`transition`, the `--jelly-spring-t` hook):
   * every moving segment is `scale|translate` on a generated `--spring-*` curve and its `-dur`. Longhands (§8b restates
   * Tailwind's transition utilities on a host): `scale` / `translate` sit on the spring hooks at the same list
   * position, and `transform` / `rotate` / `all` appear only where a rule restates the bare `transition` utility for a
   * host carrying it, with that utility's own timing (not a jelly spring).
   */
  const fakeSprings = (file: string, src: string): string[] => {
    const offenders = declsOf(src)
      .filter(
        (d) =>
          (d.prop === 'transition' || d.prop === '--jelly-spring-t') &&
          segments(d.value).some((seg) => MOVING.test(seg) && !SPRUNG.test(seg)),
      )
      .map((d) => `${file}:${d.line} ${d.prop}: ${d.value}`);
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [sel, body] = [m[1].replace(/\s+/g, ' ').trim(), m[2]];
      const get = (prop: string) =>
        new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1];
      const props = get('transition-property');
      if (!props) continue;
      const list = segments(props.replace(/\s+/g, ' '));
      const dur = segments((get('transition-duration') ?? '').replace(/\s+/g, ' '));
      const ease = segments((get('transition-timing-function') ?? '').replace(/\s+/g, ' '));
      list.forEach((prop, i) => {
        if (!MOVING.test(prop)) return;
        const at = `${file}: ${sel.slice(0, 80)} … ${prop}`;
        if (prop === 'scale' || prop === 'translate') {
          if (dur[i] !== 'var(--jelly-spring-dur)' || ease[i] !== 'var(--jelly-spring-ease)')
            offenders.push(`${at} (not on the spring hooks)`);
        } else if (!(sel.includes("[class~='transition']") && !/spring/.test(`${dur[i]} ${ease[i]}`)))
          offenders.push(`${at} (only the bare transition utility's own restatement may list it)`);
      });
    }
    return offenders;
  };

  it('no transform transition on a jelly body but the soft body’s own --spring-* curves', () => {
    const offenders = SHEETS.flatMap((f) => fakeSprings(f, css(f)));
    expect(
      offenders,
      'A transition on transform/translate/scale/rotate with its own ease is a fake spring. Hover plump, press ' +
        'squash and the release wobble are the CSS soft body (app/jelly-material.css §8): `scale` on a generated ' +
        '`--spring-*` curve and its `-dur`, through the `--jelly-spring-*` hooks (docs/plasmatic-jelly-system.md §10).',
    ).toEqual([]);
    // The soft body does transition: the scan is not vacuous.
    expect(
      SHEETS.flatMap((f) => decls(f)).some(
        (d) => d.prop === '--jelly-spring-t' && SPRUNG.test(d.value),
      ),
    ).toBe(true);
  });

  it('the fake-spring scan bites (fixtures)', () => {
    const one = (src: string) => fakeSprings('fixture.css', src);
    // Fake springs: a body's own ease on a moving property, in every form the scan reads.
    expect(one('.glass-fill { transition: transform 200ms ease-out; }')).toHaveLength(1);
    expect(one('.glass-fill { transition: color 150ms ease, scale 300ms ease-out; }')).toHaveLength(1);
    expect(one('.glass-fill { transition: all 150ms; }')).toHaveLength(1);
    expect(one('.glass-fill { --jelly-spring-t: scale 300ms ease; }')).toHaveLength(1);
    expect(
      one(
        ".x[class~='transition-colors'] { transition-property: color, scale; transition-duration: 150ms, 300ms; transition-timing-function: ease, ease; }",
      ),
    ).toHaveLength(1);
    expect(
      one(
        ".x[class~='transition-colors'] { transition-property: color, transform; transition-duration: 150ms, 150ms; transition-timing-function: ease, ease; }",
      ),
    ).toHaveLength(1);
    // The sanctioned forms pass.
    expect(one('.glass-fill { --jelly-spring-t: scale var(--spring-release-dur) var(--spring-release); }')).toEqual([]);
    expect(one('.glass-fill { transition: opacity 450ms ease, var(--jelly-spring-t); }')).toEqual([]);
    expect(
      one(
        ".x[class~='transition-colors'] { transition-property: color, scale; transition-duration: 150ms, var(--jelly-spring-dur); transition-timing-function: ease, var(--jelly-spring-ease); }",
      ),
    ).toEqual([]);
    expect(
      one(
        ".x[class~='transition'] { transition-property: transform, scale; transition-duration: 150ms, var(--jelly-spring-dur); transition-timing-function: ease, var(--jelly-spring-ease); }",
      ),
    ).toEqual([]);
  });

  it('no @keyframes but the sanctioned haze drift', () => {
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

  it('no filter in jelly CSS: the press lens was retired with the lattice and the shader rim', () => {
    const offenders = SHEETS.flatMap((f) =>
      decls(f)
        .filter((d) => /^(-webkit-)?(backdrop-)?filter$/.test(d.prop) && d.value !== 'none')
        .map((d) => `${f}:${d.line} ${d.prop}: ${d.value}`),
    );
    expect(
      offenders,
      'No stylesheet filters a jelly body: the press lens (an SVG filter on the host) went with the soft-body ' +
        'service. The dent is a lit gradient (docs/plasmatic-jelly-system.md §3.1).',
    ).toEqual([]);
  });

  it('nothing under lib/jelly or lib/liquid writes an element filter', () => {
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
      const src = fs
        .readFileSync(path.join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      return WRITE.test(src);
    });
    expect(offenders, 'The press lens is retired; no jelly service filters an element.').toEqual([]);
  });
});
